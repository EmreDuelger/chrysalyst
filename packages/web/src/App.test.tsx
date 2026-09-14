import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';
import type {
  AnswerResult,
  CreatedSession,
  InterviewApi,
  QuestionEvent,
} from './interview/interview-api.ts';
import { LOCALE_STORAGE_KEY, type Locale } from './locale/locale.ts';
import { uiStrings } from './locale/strings.ts';
import type {
  BackendFault,
  BackendProbe,
  BackendReadiness,
} from './setup/backend-status.ts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  vi.clearAllMocks();
});

const BACKEND = 'Ollama';
const MODEL = 'llama3.2:3b';

function silentStream(): AsyncIterable<QuestionEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<QuestionEvent> {
      return { next: () => Promise.resolve({ done: true, value: undefined }) };
    },
  };
}

function fakeApi(): InterviewApi {
  return {
    createSession: vi.fn((locale: Locale) =>
      Promise.resolve<CreatedSession>({ id: 'session-1', locale }),
    ),
    openQuestionStream: vi.fn(() => silentStream()),
    submitAnswer: vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    ),
  };
}

function readyBackend(): BackendReadiness {
  return { ready: true, backend: BACKEND, model: MODEL };
}

function blockedBy(reason: BackendFault): BackendReadiness {
  return { ready: false, backend: BACKEND, model: MODEL, reason };
}

/** A probe answering the given outcomes in order, one per call. */
function answering(...outcomes: readonly BackendReadiness[]) {
  const probe = vi.fn<BackendProbe>();
  for (const outcome of outcomes) {
    probe.mockResolvedValueOnce(outcome);
  }
  return probe;
}

/** A failure that is not an `Error`, as an injected probe may well raise. */
function notAnError(reason: string): unknown {
  return reason;
}

/** A probe answer held open, so a test can observe the shell mid-flight. */
function deferredReadiness(): {
  readonly promise: Promise<BackendReadiness>;
  readonly settle: (outcome: BackendReadiness) => void;
} {
  let settle: (outcome: BackendReadiness) => void = () => undefined;
  const promise = new Promise<BackendReadiness>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => {
      throw new Error('site data is blocked');
    },
    removeItem: () => undefined,
    setItem: () => {
      throw new Error('site data is blocked');
    },
  };
}

function mountRoot(): HTMLDivElement {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('App', () => {
  it('switches the chrome and writes the chosen tag under the storage key', async () => {
    const storage = memoryStorage();
    const root = mountRoot();

    render(
      <App
        api={fakeApi()}
        locale="en"
        storage={storage}
        probeBackend={answering(readyBackend())}
      />,
      {
        container: root,
      },
    );
    await flush();

    expect(
      within(root).getByRole('combobox', { name: /language/i }),
    ).toBeDefined();
    expect(within(root).getByText('English')).toBeDefined();
    expect(within(root).getByText('Deutsch')).toBeDefined();

    act(() => {
      fireEvent.change(
        within(root).getByRole('combobox', { name: /language/i }),
        { target: { value: 'de' } },
      );
    });

    expect(
      within(root).getByRole('combobox', { name: /sprache/i }),
    ).toBeDefined();
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it("starts on the browser's language and still switches when storage throws on read and on write", async () => {
    const root = mountRoot();

    render(
      <App
        api={fakeApi()}
        storage={throwingStorage()}
        languages={['de-DE']}
        probeBackend={answering(readyBackend())}
      />,
      { container: root },
    );
    await flush();

    const initialControl = within(root).getByRole('combobox', {
      name: /sprache/i,
    });
    expect((initialControl as HTMLSelectElement).value).toBe('de');

    act(() => {
      fireEvent.change(initialControl, { target: { value: 'en' } });
    });

    const switchedControl = within(root).getByRole('combobox', {
      name: /language/i,
    });
    expect((switchedControl as HTMLSelectElement).value).toBe('en');
  });

  it('sets documentElement.lang on start and again on a change', async () => {
    const root = mountRoot();

    render(
      <App
        api={fakeApi()}
        locale="en"
        storage={memoryStorage()}
        probeBackend={answering(readyBackend())}
      />,
      {
        container: root,
      },
    );
    await flush();

    expect(document.documentElement.lang).toBe('en');

    act(() => {
      fireEvent.change(
        within(root).getByRole('combobox', { name: /language/i }),
        { target: { value: 'de' } },
      );
    });

    expect(document.documentElement.lang).toBe('de');
  });

  it('carries an accessible name, both endonyms, the active language, and keyboard-operable options', async () => {
    const root = mountRoot();

    render(
      <App
        api={fakeApi()}
        locale="en"
        storage={memoryStorage()}
        probeBackend={answering(readyBackend())}
      />,
      {
        container: root,
      },
    );
    await flush();

    const control = within(root).getByRole('combobox', { name: /language/i });
    expect((control as HTMLSelectElement).value).toBe('en');

    const options = within(control).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Deutsch',
      'English',
    ]);
    expect(control.hasAttribute('disabled')).toBe(false);
    expect(control.getAttribute('tabindex')).toBeNull();
  });

  it("renders the untranslated product heading, the language control, and the view it hands the app's language", async () => {
    const api = fakeApi();
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="de"
        storage={memoryStorage()}
        probeBackend={answering(readyBackend())}
      />,
      {
        container: root,
      },
    );
    await flush();

    const heading = within(root).getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('chrysalyst');
    expect(
      within(root).getByRole('combobox', { name: /sprache/i }),
    ).toBeDefined();
    expect(within(root).getByText(uiStrings.de.questionKicker)).toBeDefined();
    expect(api.createSession).toHaveBeenCalledWith('de');
  });

  it('mounts the interview view after one probe and shows no setup screen', async () => {
    const api = fakeApi();
    const probe = answering(readyBackend());
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    expect(
      within(root).getByLabelText(uiStrings.en.interviewRegion),
    ).toBeDefined();
    expect(within(root).queryByText(uiStrings.en.setupHeading)).toBeNull();
    expect(within(root).queryByText(uiStrings.en.setupChecking)).toBeNull();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });

  it('shows the setup screen, mounts no view, creates no session, and keeps the language control usable', async () => {
    const api = fakeApi();
    const probe = answering(blockedBy('unreachable'));
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    expect(within(root).getByText(uiStrings.en.setupHeading)).toBeDefined();
    expect(
      within(root).getByText(uiStrings.en.setupUnreachable(BACKEND)),
    ).toBeDefined();
    expect(
      within(root).queryByLabelText(uiStrings.en.interviewRegion),
    ).toBeNull();
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.openQuestionStream).not.toHaveBeenCalled();

    act(() => {
      fireEvent.change(
        within(root).getByRole('combobox', { name: /language/i }),
        { target: { value: 'de' } },
      );
    });

    expect(
      within(root).getByRole('combobox', { name: /sprache/i }),
    ).toBeDefined();
    expect(
      within(root).getByText(uiStrings.de.setupUnreachable(BACKEND)),
    ).toBeDefined();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('names a checking state and creates no session while the probe is unsettled', async () => {
    const api = fakeApi();
    const held = deferredReadiness();
    const probe = vi.fn<BackendProbe>(() => held.promise);
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    const checking = within(root).getByLabelText(uiStrings.en.setupChecking);
    expect(checking.textContent).toBe(uiStrings.en.setupChecking);
    expect(
      within(root).queryByLabelText(uiStrings.en.interviewRegion),
    ).toBeNull();
    expect(within(root).queryByText(uiStrings.en.setupHeading)).toBeNull();
    expect(
      within(root).queryByRole('button', { name: uiStrings.en.setupRecheck }),
    ).toBeNull();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("shows a failed probe's message character for character under a dictionary label and mounts no view", async () => {
    const message = 'Checking the backend failed: GET /status answered 503';
    const api = fakeApi();
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="de"
        storage={memoryStorage()}
        probeBackend={vi.fn<BackendProbe>(() =>
          Promise.reject(new Error(message)),
        )}
      />,
      { container: root },
    );
    await flush();

    expect(within(root).getByText(message)).toBeDefined();
    expect(
      within(root).getByText(uiStrings.de.setupFailureLabel),
    ).toBeDefined();
    expect(
      within(root).queryByLabelText(uiStrings.de.interviewRegion),
    ).toBeNull();
    expect(api.createSession).not.toHaveBeenCalled();

    cleanup();
    root.remove();

    const collapsed = 'the status route did not answer';
    const second = mountRoot();
    render(
      <App
        api={fakeApi()}
        locale="de"
        storage={memoryStorage()}
        probeBackend={vi.fn<BackendProbe>(() => {
          throw notAnError(collapsed);
        })}
      />,
      { container: second },
    );
    await flush();

    expect(within(second).getByText(collapsed)).toBeDefined();
    expect(
      within(second).getByText(uiStrings.de.setupFailureLabel),
    ).toBeDefined();
  });

  it('re-probes on the check control and mounts the view on the second answer', async () => {
    const api = fakeApi();
    const probe = answering(blockedBy('unreachable'), readyBackend());
    const root = mountRoot();

    render(
      <App
        api={api}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    const heading = within(root).getByRole('heading', { level: 1 });
    expect(within(root).getByText(uiStrings.en.setupHeading)).toBeDefined();

    act(() => {
      fireEvent.click(
        within(root).getByRole('button', { name: uiStrings.en.setupRecheck }),
      );
    });
    await flush();

    expect(probe).toHaveBeenCalledTimes(2);
    expect(
      within(root).getByLabelText(uiStrings.en.interviewRegion),
    ).toBeDefined();
    expect(within(root).queryByText(uiStrings.en.setupHeading)).toBeNull();
    expect(within(root).getByRole('heading', { level: 1 })).toBe(heading);
  });

  it('shows the checking state on a re-check, hides the fault text with the control, gives that state the focus and an announcement, and drops an answer from a probe abandoned at unmount', async () => {
    const api = fakeApi();
    const held = deferredReadiness();
    const probe = vi.fn<BackendProbe>();
    probe.mockResolvedValueOnce(blockedBy('unreachable'));
    probe.mockImplementationOnce(() => held.promise);
    const root = mountRoot();

    const view = render(
      <App
        api={api}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    const announcer = root.querySelector('[aria-live="polite"]');
    expect(announcer?.textContent).toContain(
      uiStrings.en.setupUnreachable(BACKEND),
    );

    act(() => {
      fireEvent.click(
        within(root).getByRole('button', { name: uiStrings.en.setupRecheck }),
      );
    });

    const checking = within(root).getByLabelText(uiStrings.en.setupChecking);
    expect(document.activeElement).toBe(checking);
    expect(root.querySelector('[aria-live="polite"]')).toBe(announcer);
    expect(announcer?.textContent).toContain(uiStrings.en.setupChecking);
    expect(
      within(root).queryByText(uiStrings.en.setupUnreachable(BACKEND)),
    ).toBeNull();
    expect(
      within(root).queryByRole('button', { name: uiStrings.en.setupRecheck }),
    ).toBeNull();
    expect(probe).toHaveBeenCalledTimes(2);

    view.unmount();
    held.settle(readyBackend());
    await flush();

    expect(root.innerHTML).toBe('');
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("returns focus to the check control when the guidance replaces a re-check's checking state", async () => {
    const probe = answering(blockedBy('unreachable'), blockedBy('unreachable'));
    const root = mountRoot();

    render(
      <App
        api={fakeApi()}
        locale="en"
        storage={memoryStorage()}
        probeBackend={probe}
      />,
      { container: root },
    );
    await flush();

    act(() => {
      fireEvent.click(
        within(root).getByRole('button', { name: uiStrings.en.setupRecheck }),
      );
    });

    expect(document.activeElement).toBe(
      within(root).getByLabelText(uiStrings.en.setupChecking),
    );

    await flush();

    expect(document.activeElement).toBe(
      within(root).getByRole('button', { name: uiStrings.en.setupRecheck }),
    );
  });

  it('probes again on a fresh mount and writes no outcome to storage', async () => {
    const storage = memoryStorage();
    const probe = answering(blockedBy('unreachable'), readyBackend());
    const first = mountRoot();

    const view = render(
      <App
        api={fakeApi()}
        locale="en"
        storage={storage}
        probeBackend={probe}
      />,
      { container: first },
    );
    await flush();
    expect(within(first).getByText(uiStrings.en.setupHeading)).toBeDefined();

    view.unmount();
    first.remove();

    const second = mountRoot();
    render(
      <App
        api={fakeApi()}
        locale="en"
        storage={storage}
        probeBackend={probe}
      />,
      { container: second },
    );
    await flush();

    expect(probe).toHaveBeenCalledTimes(2);
    expect(
      within(second).getByLabelText(uiStrings.en.interviewRegion),
    ).toBeDefined();
    expect(storage.length).toBe(0);
  });
});

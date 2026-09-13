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

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  vi.clearAllMocks();
});

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

    render(<App api={fakeApi()} locale="en" storage={storage} />, {
      container: root,
    });
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
      <App api={fakeApi()} storage={throwingStorage()} languages={['de-DE']} />,
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

    render(<App api={fakeApi()} locale="en" storage={memoryStorage()} />, {
      container: root,
    });
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

    render(<App api={fakeApi()} locale="en" storage={memoryStorage()} />, {
      container: root,
    });
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

    render(<App api={api} locale="de" storage={memoryStorage()} />, {
      container: root,
    });
    await flush();

    const heading = within(root).getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('chrysalyst');
    expect(
      within(root).getByRole('combobox', { name: /sprache/i }),
    ).toBeDefined();
    expect(within(root).getByText(uiStrings.de.questionKicker)).toBeDefined();
    expect(api.createSession).toHaveBeenCalledWith('de');
  });
});

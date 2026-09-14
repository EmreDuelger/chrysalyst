import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { InterviewView } from './InterviewView.tsx';
import type {
  AnswerResult,
  CreatedSession,
  InterviewApi,
  QuestionEvent,
} from './interview-api.ts';
import { SUPPORTED_LOCALES, type Locale } from '../locale/locale.ts';
import { uiStrings, type UiStrings } from '../locale/strings.ts';

const RECORDING_MOMENT = new Date(2026, 4, 4, 9, 41);
const RECORDING_CLOCK = '09:41';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(RECORDING_MOMENT);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = '';
});

const EFFECT_CHAIN_MICROTASK_HOPS = 6;
const LOCALE_CASES = SUPPORTED_LOCALES.map((locale) => ({ locale }));
const STREAM_FAILURE =
  'Cannot reach the language model at http://127.0.0.1:11434/v1';
const REFUSAL = 'question already answered';
const ROUND_QUESTION = 'Welche Frage stellt sich?';
const FIRST_QUESTION = 'What problem does it solve?';
const DRAFT = 'Eine getippte Antwort';

interface ScriptedStream {
  readonly stream: AsyncIterable<QuestionEvent>;
  emit(event: QuestionEvent): Promise<void>;
  finish(): void;
}

function scriptedStream(): ScriptedStream {
  const queue: QuestionEvent[] = [];
  let finished = false;
  let wake: (() => void) | undefined;
  const resume = (): void => {
    const current = wake;
    wake = undefined;
    current?.();
  };
  return {
    stream: {
      async *[Symbol.asyncIterator](): AsyncGenerator<QuestionEvent> {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (finished) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
    },
    async emit(event) {
      await act(async () => {
        queue.push(event);
        resume();
        await tick();
      });
    },
    finish() {
      finished = true;
      resume();
    },
  };
}

async function tick(): Promise<void> {
  for (let hop = 0; hop < EFFECT_CHAIN_MICROTASK_HOPS; hop += 1)
    await Promise.resolve();
}

async function mounted(): Promise<void> {
  await act(async () => {
    await tick();
  });
}

function fakeApi(overrides: Partial<InterviewApi>): InterviewApi {
  return {
    createSession: vi.fn((locale: Locale) =>
      Promise.resolve<CreatedSession>({ id: 'session-1', locale }),
    ),
    openQuestionStream: vi.fn(() => scriptedStream().stream),
    submitAnswer: vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    ),
    ...overrides,
  };
}

function otherThan(locale: Locale): UiStrings {
  return uiStrings[locale === 'en' ? 'de' : 'en'];
}

interface ScriptedRounds {
  readonly open: Mock<InterviewApi['openQuestionStream']>;
  readonly round: (index: number) => ScriptedStream;
  readonly latest: () => ScriptedStream;
}

/** One fresh script per question stream the view opens, so a test can emit on
 *  the round it abandoned as easily as on the round it started. */
function scriptedRounds(): ScriptedRounds {
  const opened: ScriptedStream[] = [];
  const round = (index: number): ScriptedStream => {
    const script = opened.at(index);
    if (script === undefined) {
      throw new Error(
        `The view opened no question stream for round ${String(index)}`,
      );
    }
    return script;
  };
  return {
    open: vi.fn<InterviewApi['openQuestionStream']>(() => {
      const next = scriptedStream();
      opened.push(next);
      return next.stream;
    }),
    round,
    latest: () => round(opened.length - 1),
  };
}

function echoedSessions(): Mock<InterviewApi['createSession']> {
  let created = 0;
  return vi.fn<InterviewApi['createSession']>((locale) => {
    created += 1;
    return Promise.resolve<CreatedSession>({
      id: `session-${String(created)}`,
      locale,
    });
  });
}

/** A creation route that never echoes the language it was asked for, which is
 *  what `interview/interview-view` permits and what a restart trigger reading
 *  `session.locale` instead of the language the round was started for turns
 *  into an endless loop. */
function sessionsNamingTheOtherLanguage(): Mock<InterviewApi['createSession']> {
  let created = 0;
  return vi.fn<InterviewApi['createSession']>((locale) => {
    created += 1;
    return Promise.resolve<CreatedSession>({
      id: `session-${String(created)}`,
      locale: locale === 'en' ? 'de' : 'en',
    });
  });
}

function questionRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[aria-live="polite"]');
  if (region === null) throw new Error('The view rendered no question region');
  return region;
}

function answerField(copy: UiStrings): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', {
    name: copy.answerLabel,
  });
}

function submitButton(copy: UiStrings): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: copy.submit });
}

function expectRecordedIn(copy: UiStrings): void {
  expect(screen.getByText(copy.recordedAt(RECORDING_CLOCK))).toBeDefined();
}

function switchRequest(copy: UiStrings): HTMLElement | null {
  return screen.queryByText(copy.languageSwitchPrompt);
}

function keepButton(copy: UiStrings): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', {
    name: copy.languageSwitchKeep,
  });
}

function discardButton(copy: UiStrings): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', {
    name: copy.languageSwitchDiscard,
  });
}

function expectNoSwitchRequest(): void {
  for (const locale of SUPPORTED_LOCALES) {
    expect(switchRequest(uiStrings[locale])).toBeNull();
  }
}

function expectPreFirstChunkState(copy: UiStrings): void {
  expect(screen.getByText(copy.questionPlaceholder)).toBeDefined();
  expect(screen.getByText(copy.reachingModel)).toBeDefined();
  expect(questionRegion().textContent).toBe('');
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText(REFUSAL)).toBeNull();
}

interface DraftedView {
  readonly createSession: Mock<InterviewApi['createSession']>;
  readonly streams: ScriptedRounds;
  readonly switchTo: (next: Locale) => Promise<void>;
}

/** A German round whose question has arrived in full and whose answer field
 *  holds typed text — the state every request scenario starts from. */
async function viewHoldingADraft(
  overrides: Partial<InterviewApi> = {},
): Promise<DraftedView> {
  const streams = scriptedRounds();
  const createSession = echoedSessions();
  const api = fakeApi({
    createSession,
    openQuestionStream: streams.open,
    ...overrides,
  });

  const { rerender } = render(<InterviewView api={api} locale="de" />);
  await mounted();
  await streams.round(0).emit({ event: 'token', text: ROUND_QUESTION });
  await streams.round(0).emit({ event: 'done', question: ROUND_QUESTION });
  await waitFor(() => {
    expect(answerField(uiStrings.de).disabled).toBe(false);
  });
  fireEvent.change(answerField(uiStrings.de), { target: { value: DRAFT } });

  return {
    createSession,
    streams,
    switchTo: async (next) => {
      await act(async () => {
        rerender(<InterviewView api={api} locale={next} />);
        await tick();
      });
    },
  };
}

interface NoDraftCase {
  readonly phase: string;
  readonly reach: (streams: ScriptedRounds) => Promise<void>;
}

/** Every phase a round can still be restarted from while holding no text the
 *  person can act on. `failed` is reached by a refused submission, so the
 *  phase holds a non-blank answer the form no longer renders — the one case
 *  that separates the draft-at-risk rule from a bare `answer.trim()` check. */
const NO_DRAFT_CASES: readonly NoDraftCase[] = [
  { phase: 'connecting', reach: (): Promise<void> => Promise.resolve() },
  {
    phase: 'streaming',
    reach: (streams) =>
      streams.round(0).emit({ event: 'token', text: 'What problem' }),
  },
  {
    phase: 'complete',
    reach: async (streams) => {
      await streams.round(0).emit({ event: 'done', question: FIRST_QUESTION });
      await waitFor(() => {
        expect(answerField(uiStrings.en).disabled).toBe(false);
      });
    },
  },
  {
    phase: 'failed',
    reach: async (streams) => {
      await streams.round(0).emit({ event: 'done', question: FIRST_QUESTION });
      await waitFor(() => {
        expect(answerField(uiStrings.en).disabled).toBe(false);
      });
      fireEvent.change(answerField(uiStrings.en), {
        target: { value: 'An answer the form no longer renders' },
      });
      fireEvent.click(submitButton(uiStrings.en));
      await waitFor(() => {
        expect(screen.getByText(REFUSAL)).toBeDefined();
      });
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  },
];

describe('InterviewView', () => {
  it.each(LOCALE_CASES)(
    'renders every label from the dictionary for $locale',
    async ({ locale }) => {
      const copy = uiStrings[locale];
      const other = otherThan(locale);
      const script = scriptedStream();
      let release: (result: AnswerResult) => void = () => undefined;
      const api = fakeApi({
        openQuestionStream: vi.fn(() => script.stream),
        submitAnswer: vi.fn(
          () =>
            new Promise<AnswerResult>((resolve) => {
              release = resolve;
            }),
        ),
      });

      render(<InterviewView api={api} locale={locale} />);
      await mounted();

      expect(screen.getByLabelText(copy.interviewRegion)).toBeDefined();
      expect(screen.getByText(copy.questionKicker)).toBeDefined();
      expect(screen.getByText(copy.questionPlaceholder)).toBeDefined();
      expect(screen.getByText(copy.reachingModel)).toBeDefined();
      expect(screen.queryByText(other.questionKicker)).toBeNull();
      expect(screen.queryByText(other.questionPlaceholder)).toBeNull();
      expect(screen.queryByText(other.reachingModel)).toBeNull();

      await script.emit({ event: 'token', text: 'A question' });
      await waitFor(() => {
        expect(screen.getByText(copy.streamingAlternative)).toBeDefined();
      });
      expect(screen.queryByText(other.streamingAlternative)).toBeNull();
      expect(screen.getByText(copy.answerLabel)).toBeDefined();
      expect(screen.queryByText(other.answerLabel)).toBeNull();

      await script.emit({ event: 'done', question: 'A question' });
      await waitFor(() => {
        expect(answerField(copy).disabled).toBe(false);
      });
      expect(screen.getByText(copy.roundHint)).toBeDefined();
      expect(screen.queryByText(other.roundHint)).toBeNull();
      expect(submitButton(copy)).toBeDefined();
      expect(screen.queryByText(other.submit)).toBeNull();

      fireEvent.change(answerField(copy), { target: { value: 'An answer' } });
      fireEvent.click(submitButton(copy));
      await waitFor(() => {
        expect(screen.getByText(copy.recording)).toBeDefined();
      });
      expect(screen.queryByText(other.recording)).toBeNull();

      await act(async () => {
        release({ outcome: 'recorded' });
        await tick();
      });
      await waitFor(() => {
        expect(screen.queryByRole('textbox')).toBeNull();
      });
      expectRecordedIn(copy);
      expect(screen.getByText(copy.answerLabel)).toBeDefined();
    },
  );

  it('names its mounted language when creating the session and uses the language the response carried', async () => {
    const script = scriptedStream();
    const createSession = vi.fn(() =>
      Promise.resolve<CreatedSession>({ id: 'session-3', locale: 'en' }),
    );
    const openQuestionStream = vi.fn(() => script.stream);
    const api = fakeApi({ createSession, openQuestionStream });

    render(<InterviewView api={api} locale="de" />);
    await mounted();

    expect(createSession).toHaveBeenCalledWith('de');
    expect(openQuestionStream).toHaveBeenCalledWith(
      'session-3',
      expect.anything(),
    );

    await script.emit({ event: 'token', text: 'What problem does it solve?' });
    await waitFor(() => {
      expect(questionRegion().getAttribute('lang')).toBe('en');
    });
    expect(screen.getByText(uiStrings.de.questionKicker)).toBeDefined();
  });

  it('asks before discarding a typed answer, relabels the chrome, starts nothing, and leaves the question and the draft unchanged', async () => {
    const { createSession, streams, switchTo } = await viewHoldingADraft();

    await switchTo('en');

    expect(screen.getByText(uiStrings.en.questionKicker)).toBeDefined();
    expect(screen.getByText(uiStrings.en.roundHint)).toBeDefined();
    expect(screen.getByText(uiStrings.en.answerLabel)).toBeDefined();
    expect(screen.queryByText(uiStrings.de.questionKicker)).toBeNull();
    expect(screen.queryByText(uiStrings.de.roundHint)).toBeNull();
    expect(screen.queryByText(uiStrings.de.answerLabel)).toBeNull();

    expect(screen.getByText(uiStrings.en.languageSwitchLabel)).toBeDefined();
    const prompt = switchRequest(uiStrings.en);
    expect(prompt).not.toBeNull();
    expect(prompt?.getAttribute('role')).toBe('alert');
    expect(switchRequest(uiStrings.de)).toBeNull();
    expect(keepButton(uiStrings.en)).toBeDefined();
    expect(discardButton(uiStrings.en)).toBeDefined();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith('de');
    expect(streams.open).toHaveBeenCalledTimes(1);

    expect(questionRegion().textContent).toBe(ROUND_QUESTION);
    expect(answerField(uiStrings.en).value).toBe(DRAFT);
    expect(answerField(uiStrings.en).disabled).toBe(false);
    expect(submitButton(uiStrings.en).disabled).toBe(false);
  });

  it.each([
    {
      outcome: 'recorded',
      result: { outcome: 'recorded' } as const,
      expectSettled: (): void => {
        expectRecordedIn(uiStrings.en);
      },
    },
    {
      outcome: 'refused',
      result: { outcome: 'refused', message: REFUSAL } as const,
      expectSettled: (): void => {
        expect(screen.getByText(REFUSAL)).toBeDefined();
      },
    },
  ])(
    'withdraws the request for good once the answer is sent, for $outcome',
    async ({ result, expectSettled }) => {
      const { createSession, streams, switchTo } = await viewHoldingADraft({
        submitAnswer: vi.fn(() => Promise.resolve(result)),
      });

      await switchTo('en');
      expect(switchRequest(uiStrings.en)).not.toBeNull();

      fireEvent.click(submitButton(uiStrings.en));
      await waitFor(expectSettled);

      expectNoSwitchRequest();
      await switchTo('en');
      expectNoSwitchRequest();
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(streams.open).toHaveBeenCalledTimes(1);
    },
  );

  it.each<{ chrome: Locale; sessions: number }>([
    { chrome: 'en', sessions: 2 },
    { chrome: 'de', sessions: 1 },
  ])(
    "withdraws the request when the draft is emptied, restarting only when the chrome's language differs from the round's, for $chrome",
    async ({ chrome, sessions }) => {
      const copy = uiStrings[chrome];
      const { createSession, streams, switchTo } = await viewHoldingADraft();

      await switchTo(chrome);
      expect(switchRequest(copy) !== null).toBe(sessions === 2);

      fireEvent.change(answerField(copy), { target: { value: '' } });
      expectNoSwitchRequest();

      await waitFor(() => {
        expect(streams.open).toHaveBeenCalledTimes(sessions);
      });
      await act(async () => {
        await tick();
      });
      expectNoSwitchRequest();
      expect(createSession).toHaveBeenCalledTimes(sessions);
      expect(createSession).toHaveBeenLastCalledWith(chrome);
      expect(streams.open).toHaveBeenCalledTimes(sessions);

      await streams.latest().emit({ event: 'done', question: FIRST_QUESTION });
      await waitFor(() => {
        expect(answerField(copy).disabled).toBe(false);
      });
      fireEvent.change(answerField(copy), { target: { value: 'Noch etwas' } });

      expectNoSwitchRequest();
      expect(createSession).toHaveBeenCalledTimes(sessions);
      expect(streams.open).toHaveBeenCalledTimes(sessions);
    },
  );

  it('creates a second session in the chosen language, abandons the first stream, clears the round, leaves no request on screen, and takes focus', async () => {
    const { createSession, streams, switchTo } = await viewHoldingADraft();
    await switchTo('en');

    fireEvent.click(discardButton(uiStrings.en));
    await waitFor(() => {
      expect(streams.open).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await tick();
    });

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession).toHaveBeenNthCalledWith(2, 'en');
    expect(streams.open).toHaveBeenNthCalledWith(
      2,
      'session-2',
      expect.anything(),
    );

    expectPreFirstChunkState(uiStrings.en);
    expectNoSwitchRequest();
    expect(document.activeElement).toBe(
      screen.getByLabelText(uiStrings.en.interviewRegion),
    );

    await streams.round(0).emit({ event: 'token', text: 'ABANDONED' });
    expectPreFirstChunkState(uiStrings.en);

    await streams.round(1).emit({ event: 'token', text: 'What problem' });
    await waitFor(() => {
      expect(questionRegion().textContent).toBe('What problem');
    });
  });

  it('keeps the session, the question and the typed answer, holds the chrome in the chosen language, and returns focus to the answer field', async () => {
    const { createSession, streams, switchTo } = await viewHoldingADraft();
    await switchTo('en');

    fireEvent.click(keepButton(uiStrings.en));

    expectNoSwitchRequest();
    expect(document.activeElement).toBe(answerField(uiStrings.en));
    expect(answerField(uiStrings.en).value).toBe(DRAFT);
    expect(questionRegion().textContent).toBe(ROUND_QUESTION);
    expect(screen.getByText(uiStrings.en.roundHint)).toBeDefined();
    expect(screen.queryByText(uiStrings.de.roundHint)).toBeNull();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(streams.open).toHaveBeenCalledTimes(1);

    await switchTo('en');
    expectNoSwitchRequest();

    fireEvent.change(answerField(uiStrings.en), {
      target: { value: `${DRAFT} noch` },
    });
    expectNoSwitchRequest();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('starts nothing when the draft is emptied after the request was declined', async () => {
    const { createSession, streams, switchTo } = await viewHoldingADraft();
    await switchTo('en');
    fireEvent.click(keepButton(uiStrings.en));

    fireEvent.change(answerField(uiStrings.en), { target: { value: '' } });
    await act(async () => {
      await tick();
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(streams.open).toHaveBeenCalledTimes(1);
    expectNoSwitchRequest();
    expect(questionRegion().textContent).toBe(ROUND_QUESTION);
    expect(answerField(uiStrings.en).value).toBe('');
  });

  it.each(NO_DRAFT_CASES)(
    "restarts without asking from $phase and takes the second session's language from its own response",
    async ({ reach }) => {
      const streams = scriptedRounds();
      const createSession = sessionsNamingTheOtherLanguage();
      const api = fakeApi({
        createSession,
        openQuestionStream: streams.open,
        submitAnswer: vi.fn(() =>
          Promise.resolve<AnswerResult>({
            outcome: 'refused',
            message: REFUSAL,
          }),
        ),
      });

      const { rerender } = render(<InterviewView api={api} locale="en" />);
      await mounted();
      await reach(streams);

      expect(createSession).toHaveBeenCalledTimes(1);
      expect(createSession).toHaveBeenCalledWith('en');
      expect(questionRegion().getAttribute('lang')).toBe('de');

      await act(async () => {
        rerender(<InterviewView api={api} locale="de" />);
        await tick();
      });
      expectNoSwitchRequest();

      await waitFor(() => {
        expect(streams.open).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        await tick();
      });

      expect(createSession).toHaveBeenCalledTimes(2);
      expect(createSession).toHaveBeenNthCalledWith(2, 'de');
      expect(streams.open).toHaveBeenNthCalledWith(
        2,
        'session-2',
        expect.anything(),
      );
      expectPreFirstChunkState(uiStrings.de);
      expectNoSwitchRequest();
      expect(questionRegion().getAttribute('lang')).toBe('en');

      await streams.round(0).emit({ event: 'token', text: 'ABANDONED' });
      expectPreFirstChunkState(uiStrings.de);
      expect(createSession).toHaveBeenCalledTimes(2);
    },
  );

  it('withdraws the request without creating a session, discarding the answer, or moving focus', async () => {
    const { createSession, streams, switchTo } = await viewHoldingADraft();
    await switchTo('en');
    expect(switchRequest(uiStrings.en)).not.toBeNull();

    const languageControl = document.createElement('button');
    document.body.append(languageControl);
    languageControl.focus();

    await switchTo('de');

    expectNoSwitchRequest();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(streams.open).toHaveBeenCalledTimes(1);
    expect(answerField(uiStrings.de).value).toBe(DRAFT);
    expect(questionRegion().textContent).toBe(ROUND_QUESTION);
    expect(document.activeElement).toBe(languageControl);
  });

  it.each([
    {
      phase: 'submitting',
      settle: false,
      expectHeld: (): void => {
        expect(screen.getByText(uiStrings.en.recording)).toBeDefined();
        expect(screen.queryByText(uiStrings.de.recording)).toBeNull();
        expect(answerField(uiStrings.en).value).toBe(DRAFT);
      },
    },
    {
      phase: 'recorded',
      settle: true,
      expectHeld: (): void => {
        expectRecordedIn(uiStrings.en);
        expect(
          screen.queryByText(uiStrings.de.recordedAt(RECORDING_CLOCK)),
        ).toBeNull();
        expect(screen.getByText(DRAFT)).toBeDefined();
      },
    },
  ])(
    'relabels only once the answer is sent, in $phase',
    async ({ settle, expectHeld }) => {
      let release: (result: AnswerResult) => void = () => undefined;
      const { createSession, streams, switchTo } = await viewHoldingADraft({
        submitAnswer: vi.fn(
          () =>
            new Promise<AnswerResult>((resolve) => {
              release = resolve;
            }),
        ),
      });

      fireEvent.click(submitButton(uiStrings.de));
      await waitFor(() => {
        expect(screen.getByText(uiStrings.de.recording)).toBeDefined();
      });
      if (settle) {
        await act(async () => {
          release({ outcome: 'recorded' });
          await tick();
        });
        await waitFor(() => {
          expect(screen.queryByRole('textbox')).toBeNull();
        });
      }

      await switchTo('en');

      expect(screen.getByText(uiStrings.en.answerLabel)).toBeDefined();
      expect(screen.queryByText(uiStrings.de.answerLabel)).toBeNull();
      expectHeld();
      expectNoSwitchRequest();
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(streams.open).toHaveBeenCalledTimes(1);
      expect(questionRegion().textContent).toBe(ROUND_QUESTION);
    },
  );

  it("declares the session's language on the question region, not the chrome's", async () => {
    const script = scriptedStream();
    const api = fakeApi({
      createSession: vi.fn(() =>
        Promise.resolve<CreatedSession>({ id: 'session-6', locale: 'de' }),
      ),
      openQuestionStream: vi.fn(() => script.stream),
    });

    const { rerender } = render(<InterviewView api={api} locale="en" />);
    await mounted();
    await script.emit({ event: 'done', question: 'Welche Frage stellt sich?' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(false);
    });

    expect(questionRegion().getAttribute('lang')).toBe('de');

    await act(async () => {
      rerender(<InterviewView api={api} locale="de" />);
      await tick();
    });

    expect(questionRegion().getAttribute('lang')).toBe('de');
  });

  it('shows a labelled connecting state with no answer control until the first chunk', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} locale="en" />);
    await mounted();

    expect(screen.getByText(uiStrings.en.reachingModel)).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    await script.emit({ event: 'token', text: 'What problem' });

    await waitFor(() => {
      expect(screen.queryByText(uiStrings.en.reachingModel)).toBeNull();
    });
    expect(questionRegion().textContent).toContain('What problem');
  });

  it('creates a session first, then renders each chunk as it arrives into a live region', async () => {
    const script = scriptedStream();
    const createSession = vi.fn((locale: Locale) =>
      Promise.resolve<CreatedSession>({ id: 'session-9', locale }),
    );
    const openQuestionStream = vi.fn(() => script.stream);
    const api = fakeApi({ createSession, openQuestionStream });

    render(<InterviewView api={api} locale="en" />);
    await mounted();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openQuestionStream).toHaveBeenCalledWith(
      'session-9',
      expect.anything(),
    );
    expect(questionRegion().getAttribute('aria-live')).toBe('polite');

    await script.emit({ event: 'token', text: 'What problem ' });
    await waitFor(() => {
      expect(questionRegion().textContent).toContain('What problem ');
    });

    await script.emit({ event: 'token', text: 'does it solve?' });
    await waitFor(() => {
      expect(questionRegion().textContent).toContain(
        'What problem does it solve?',
      );
    });
  });

  it('shows a labelled streaming indicator until the done event arrives', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} locale="en" />);
    await mounted();

    await script.emit({ event: 'token', text: 'A question' });
    await waitFor(() => {
      expect(screen.getByText(uiStrings.en.streamingAlternative)).toBeDefined();
    });

    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(screen.queryByText(uiStrings.en.streamingAlternative)).toBeNull();
    });
  });

  it('keeps the labelled answer field and submit disabled until done', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} locale="en" />);
    await mounted();

    await script.emit({ event: 'token', text: 'A question' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(true);
    });
    expect(submitButton(uiStrings.en).disabled).toBe(true);

    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(false);
    });

    fireEvent.change(answerField(uiStrings.en), {
      target: { value: 'An answer' },
    });
    expect(submitButton(uiStrings.en).disabled).toBe(false);
  });

  it('posts the typed text for the created session, confirms it, and closes both controls', async () => {
    const script = scriptedStream();
    const submitAnswer = vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    );
    const api = fakeApi({
      createSession: vi.fn((locale: Locale) =>
        Promise.resolve<CreatedSession>({ id: 'session-7', locale }),
      ),
      openQuestionStream: vi.fn(() => script.stream),
      submitAnswer,
    });

    render(<InterviewView api={api} locale="en" />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(false);
    });

    fireEvent.change(answerField(uiStrings.en), {
      target: { value: 'A recipe app.' },
    });
    fireEvent.click(submitButton(uiStrings.en));

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expectRecordedIn(uiStrings.en);
    expect(screen.getByText('A recipe app.')).toBeDefined();
    expect(submitAnswer).toHaveBeenCalledWith('session-7', 'A recipe app.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the in-flight state, disables both controls, and refuses a second submission', async () => {
    const script = scriptedStream();
    let release: (result: AnswerResult) => void = () => undefined;
    const submitAnswer = vi.fn(
      () =>
        new Promise<AnswerResult>((resolve) => {
          release = resolve;
        }),
    );
    const api = fakeApi({
      openQuestionStream: vi.fn(() => script.stream),
      submitAnswer,
    });

    render(<InterviewView api={api} locale="en" />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(false);
    });

    fireEvent.change(answerField(uiStrings.en), { target: { value: 'first' } });
    fireEvent.click(submitButton(uiStrings.en));

    await waitFor(() => {
      expect(screen.getByText(uiStrings.en.recording)).toBeDefined();
    });
    expect(answerField(uiStrings.en).disabled).toBe(true);
    expect(submitButton(uiStrings.en).disabled).toBe(true);

    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
      await tick();
    });
    expect(submitAnswer).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ outcome: 'recorded' });
      await tick();
    });
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expectRecordedIn(uiStrings.en);
  });

  it('sends no request while the field is blank', async () => {
    const script = scriptedStream();
    const submitAnswer = vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    );
    const api = fakeApi({
      openQuestionStream: vi.fn(() => script.stream),
      submitAnswer,
    });

    render(<InterviewView api={api} locale="en" />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField(uiStrings.en).disabled).toBe(false);
    });

    expect(submitButton(uiStrings.en).disabled).toBe(true);
    fireEvent.change(answerField(uiStrings.en), { target: { value: '   ' } });
    expect(submitButton(uiStrings.en).disabled).toBe(true);

    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
      await tick();
    });
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it.each(LOCALE_CASES)(
    "shows a stream failure's message character for character under a label in $locale and keeps the answer control closed",
    async ({ locale }) => {
      const copy = uiStrings[locale];
      const other = otherThan(locale);

      const errorScript = scriptedStream();
      render(
        <InterviewView
          api={fakeApi({ openQuestionStream: vi.fn(() => errorScript.stream) })}
          locale={locale}
        />,
      );
      await mounted();
      await errorScript.emit({ event: 'token', text: 'A ques' });
      await errorScript.emit({ event: 'error', message: STREAM_FAILURE });

      await waitFor(() => {
        expect(screen.getByText(STREAM_FAILURE)).toBeDefined();
      });
      expect(screen.getByText(copy.failureLabel)).toBeDefined();
      expect(screen.queryByText(other.failureLabel)).toBeNull();
      expect(screen.queryByText(copy.streamingAlternative)).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );

  it.each(LOCALE_CASES)(
    "shows a refused submission's message character for character under a label in $locale and closes both controls",
    async ({ locale }) => {
      const copy = uiStrings[locale];
      const other = otherThan(locale);

      const okScript = scriptedStream();
      render(
        <InterviewView
          api={fakeApi({
            openQuestionStream: vi.fn(() => okScript.stream),
            submitAnswer: vi.fn(() =>
              Promise.resolve<AnswerResult>({
                outcome: 'refused',
                message: REFUSAL,
              }),
            ),
          })}
          locale={locale}
        />,
      );
      await mounted();
      await okScript.emit({ event: 'done', question: 'A question' });
      await waitFor(() => {
        expect(answerField(copy).disabled).toBe(false);
      });

      fireEvent.change(answerField(copy), { target: { value: 'late answer' } });
      fireEvent.click(submitButton(copy));

      await waitFor(() => {
        expect(screen.getByText(REFUSAL)).toBeDefined();
      });
      expect(screen.getByText(copy.failureLabel)).toBeDefined();
      expect(screen.queryByText(other.failureLabel)).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
});

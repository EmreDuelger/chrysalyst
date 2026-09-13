import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('relabels the chrome without re-creating the session, re-requesting the question, or clearing the typed answer', async () => {
    const script = scriptedStream();
    const createSession = vi.fn((locale: Locale) =>
      Promise.resolve<CreatedSession>({ id: 'session-5', locale }),
    );
    const openQuestionStream = vi.fn(() => script.stream);
    const api = fakeApi({ createSession, openQuestionStream });

    const { rerender } = render(<InterviewView api={api} locale="de" />);
    await mounted();
    await script.emit({ event: 'token', text: 'Welche Frage stellt sich?' });
    await script.emit({ event: 'done', question: 'Welche Frage stellt sich?' });
    await waitFor(() => {
      expect(answerField(uiStrings.de).disabled).toBe(false);
    });
    fireEvent.change(answerField(uiStrings.de), {
      target: { value: 'Eine getippte Antwort' },
    });

    await act(async () => {
      rerender(<InterviewView api={api} locale="en" />);
      await tick();
    });

    expect(screen.getByText(uiStrings.en.questionKicker)).toBeDefined();
    expect(screen.getByText(uiStrings.en.roundHint)).toBeDefined();
    expect(screen.queryByText(uiStrings.de.questionKicker)).toBeNull();
    expect(screen.queryByText(uiStrings.de.roundHint)).toBeNull();

    expect(questionRegion().textContent).toBe('Welche Frage stellt sich?');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openQuestionStream).toHaveBeenCalledTimes(1);
    expect(answerField(uiStrings.en).value).toBe('Eine getippte Antwort');
  });

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

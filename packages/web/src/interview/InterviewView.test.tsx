import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InterviewView } from './InterviewView.tsx';
import type {
  AnswerResult,
  InterviewApi,
  QuestionEvent,
} from './interview-api.ts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const STREAMING_ALTERNATIVE = 'the question is still being written';
const EFFECT_CHAIN_MICROTASK_HOPS = 6;

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
    createSession: vi.fn(() => Promise.resolve('session-1')),
    openQuestionStream: vi.fn(() => scriptedStream().stream),
    submitAnswer: vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    ),
    ...overrides,
  };
}

function answerField(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', {
    name: /your answer/i,
  });
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', {
    name: /record answer/i,
  });
}

describe('InterviewView', () => {
  it('shows a labelled connecting state with no answer control until the first chunk', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} />);
    await mounted();

    expect(screen.getByText(/reaching the model/i)).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    await script.emit({ event: 'token', text: 'What problem' });

    await waitFor(() => {
      expect(screen.queryByText(/reaching the model/i)).toBeNull();
    });
    const region = document.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toContain('What problem');
  });

  it('creates a session first, then renders each chunk as it arrives into a live region', async () => {
    const script = scriptedStream();
    const createSession = vi.fn(() => Promise.resolve('session-9'));
    const openQuestionStream = vi.fn(() => script.stream);
    const api = fakeApi({ createSession, openQuestionStream });

    render(<InterviewView api={api} />);
    await mounted();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openQuestionStream).toHaveBeenCalledWith(
      'session-9',
      expect.anything(),
    );
    const region = document.querySelector('[aria-live="polite"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');

    await script.emit({ event: 'token', text: 'What problem ' });
    await waitFor(() => {
      expect(region?.textContent).toContain('What problem ');
    });

    await script.emit({ event: 'token', text: 'does it solve?' });
    await waitFor(() => {
      expect(region?.textContent).toContain('What problem does it solve?');
    });
  });

  it('shows a labelled streaming indicator until the done event arrives', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} />);
    await mounted();

    await script.emit({ event: 'token', text: 'A question' });
    await waitFor(() => {
      expect(screen.getByText(STREAMING_ALTERNATIVE)).toBeDefined();
    });

    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(screen.queryByText(STREAMING_ALTERNATIVE)).toBeNull();
    });
  });

  it('keeps the labelled answer field and submit disabled until done', async () => {
    const script = scriptedStream();
    const api = fakeApi({ openQuestionStream: vi.fn(() => script.stream) });

    render(<InterviewView api={api} />);
    await mounted();

    await script.emit({ event: 'token', text: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(true);
    });
    expect(submitButton().disabled).toBe(true);

    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(false);
    });

    fireEvent.change(answerField(), { target: { value: 'An answer' } });
    expect(submitButton().disabled).toBe(false);
  });

  it('posts the typed text for the created session, confirms it, and closes both controls', async () => {
    const script = scriptedStream();
    const submitAnswer = vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    );
    const api = fakeApi({
      createSession: vi.fn(() => Promise.resolve('session-7')),
      openQuestionStream: vi.fn(() => script.stream),
      submitAnswer,
    });

    render(<InterviewView api={api} />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(false);
    });

    fireEvent.change(answerField(), { target: { value: 'A recipe app.' } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(
        screen.getByText(/^Recorded · \d{2}:\d{2} · saved to this session$/),
      ).toBeDefined();
    });
    expect(screen.getByText('A recipe app.')).toBeDefined();
    expect(submitAnswer).toHaveBeenCalledWith('session-7', 'A recipe app.');
    expect(screen.queryByRole('textbox')).toBeNull();
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

    render(<InterviewView api={api} />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(false);
    });

    fireEvent.change(answerField(), { target: { value: 'first' } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByText(/recording/i)).toBeDefined();
    });
    expect(answerField().disabled).toBe(true);
    expect(submitButton().disabled).toBe(true);

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
      expect(screen.getByText(/recorded/i)).toBeDefined();
    });
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

    render(<InterviewView api={api} />);
    await mounted();
    await script.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(false);
    });

    expect(submitButton().disabled).toBe(true);
    fireEvent.change(answerField(), { target: { value: '   ' } });
    expect(submitButton().disabled).toBe(true);

    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
      await tick();
    });
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('surfaces an error event and a refused submission and keeps the answer control closed', async () => {
    const errorScript = scriptedStream();
    const api = fakeApi({
      openQuestionStream: vi.fn(() => errorScript.stream),
    });

    render(<InterviewView api={api} />);
    await mounted();
    await errorScript.emit({ event: 'token', text: 'A ques' });
    await errorScript.emit({
      event: 'error',
      message: 'Cannot reach the language model at http://127.0.0.1:11434/v1',
    });

    await waitFor(() => {
      expect(
        screen.getByText(/cannot reach the language model/i),
      ).toBeDefined();
    });
    expect(screen.queryByText(STREAMING_ALTERNATIVE)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();

    cleanup();
    document.body.innerHTML = '';

    const okScript = scriptedStream();
    const refusedApi = fakeApi({
      openQuestionStream: vi.fn(() => okScript.stream),
      submitAnswer: vi.fn(() =>
        Promise.resolve<AnswerResult>({
          outcome: 'refused',
          message: 'question already answered',
        }),
      ),
    });

    render(<InterviewView api={refusedApi} />);
    await mounted();
    await okScript.emit({ event: 'done', question: 'A question' });
    await waitFor(() => {
      expect(answerField().disabled).toBe(false);
    });

    fireEvent.change(answerField(), { target: { value: 'late answer' } });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByText(/question already answered/i)).toBeDefined();
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

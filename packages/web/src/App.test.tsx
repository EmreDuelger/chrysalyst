import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';
import type {
  AnswerResult,
  InterviewApi,
  QuestionEvent,
} from './interview/interview-api.ts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function silentStream(): AsyncIterable<QuestionEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<QuestionEvent> {
      return { next: () => Promise.resolve({ done: true, value: undefined }) };
    },
  };
}

describe('App', () => {
  it('renders the product heading and the interview view into #root', async () => {
    const createSession = vi.fn(() => Promise.resolve('session-1'));
    const openQuestionStream = vi.fn(() => silentStream());
    const submitAnswer = vi.fn(() =>
      Promise.resolve<AnswerResult>({ outcome: 'recorded' }),
    );
    const api: InterviewApi = {
      createSession,
      openQuestionStream,
      submitAnswer,
    };

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    render(<App api={api} />, { container: root });
    await act(async () => {
      await Promise.resolve();
    });

    const heading = within(root).getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('chrysalyst');
    expect(
      within(root).getByRole('region', { name: /interview/i }),
    ).toBeDefined();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openQuestionStream).toHaveBeenCalledWith(
      'session-1',
      expect.anything(),
    );
    expect(submitAnswer).not.toHaveBeenCalled();
  });
});

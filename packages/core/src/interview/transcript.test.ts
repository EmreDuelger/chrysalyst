import { describe, expect, it } from 'vitest';

import { renderTranscript } from './transcript.ts';
import type { AnsweredTurn, AskedTurn, InterviewState } from './state.ts';
import type { StoredSession } from '../ports/index.ts';

const SESSION_ID = 'a3f1c2d4-0000-4000-8000-000000000000';
const CREATED_AT = new Date('2026-02-03T09:00:00.000Z');
const UPDATED_AT = new Date('2026-02-03T09:04:12.000Z');

const ASKED_AT = '2026-02-03T09:00:30.000Z';
const ANSWERED_AT = '2026-02-03T09:03:00.000Z';
const QUESTION = 'What problem does your product solve?';
const ANSWER = 'Planning weeknight dinners for busy families.';

const ASKED_TURN: AskedTurn = {
  status: 'asked',
  question: QUESTION,
  askedAt: ASKED_AT,
};

const ANSWERED_TURN: AnsweredTurn = {
  status: 'answered',
  question: QUESTION,
  askedAt: ASKED_AT,
  answer: ANSWER,
  answeredAt: ANSWERED_AT,
};

function storedSession(state: InterviewState): StoredSession<InterviewState> {
  return {
    id: SESSION_ID,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    state,
  };
}

describe('renderTranscript', () => {
  it('names the session identifier and both envelope timestamps', () => {
    const markdown = renderTranscript(storedSession({ turns: [] }));

    expect(markdown).toContain(SESSION_ID);
    expect(markdown).toContain(CREATED_AT.toISOString());
    expect(markdown).toContain(UPDATED_AT.toISOString());
  });

  it('renders an answered turn as its question and answer, each beside its instant', () => {
    const markdown = renderTranscript(
      storedSession({ turns: [ANSWERED_TURN] }),
    );

    expect(markdown).toContain(QUESTION);
    expect(markdown).toContain(ASKED_AT);
    expect(markdown).toContain(ANSWER);
    expect(markdown).toContain(ANSWERED_AT);
  });

  it('renders an asked turn with its answer shown as still awaited', () => {
    const markdown = renderTranscript(storedSession({ turns: [ASKED_TURN] }));

    expect(markdown).toContain(QUESTION);
    expect(markdown).toContain(ASKED_AT);
    expect(markdown.toLowerCase()).toContain('awaited');
    expect(markdown).not.toContain(ANSWER);
    expect(markdown).not.toContain(ANSWERED_AT);
  });

  it('renders the header alone for an empty turn list, naming no question', () => {
    const markdown = renderTranscript(storedSession({ turns: [] }));

    expect(markdown).toContain(SESSION_ID);
    expect(markdown).not.toContain(QUESTION);
    expect(markdown).not.toMatch(/^##\s/m);
    expect(markdown.toLowerCase()).not.toContain('awaited');
  });

  it('is pure: the same stored session renders identically every call', () => {
    const stored = storedSession({ turns: [ANSWERED_TURN] });

    expect(renderTranscript(stored)).toBe(renderTranscript(stored));
  });
});

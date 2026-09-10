import { describe, expect, it } from 'vitest';

import { isAnswered } from './state.ts';
import type { AnsweredTurn, InterviewState, Turn } from './state.ts';

const ANSWERED_TURN: AnsweredTurn = {
  status: 'answered',
  question: 'What problem does your product solve?',
  askedAt: '2026-02-03T09:00:00.000Z',
  answer: 'Planning weeknight dinners for busy families.',
  answeredAt: '2026-02-03T09:04:12.000Z',
};

const ASKED_TURN: Turn = {
  status: 'asked',
  question: 'What problem does your product solve?',
  askedAt: '2026-02-03T09:00:00.000Z',
};

describe('isAnswered', () => {
  it('narrows an answered turn so its answer and answering instant are reachable', () => {
    const turn: Turn = ANSWERED_TURN;

    expect(isAnswered(turn)).toBe(true);
    if (!isAnswered(turn)) {
      expect.fail('an answered turn should narrow to AnsweredTurn');
    }
    expect(turn.answer).toBe('Planning weeknight dinners for busy families.');
    expect(turn.answeredAt).toBe('2026-02-03T09:04:12.000Z');
  });

  it('rejects a turn that was asked but not answered', () => {
    expect(isAnswered(ASKED_TURN)).toBe(false);
  });
});

describe('InterviewState', () => {
  it('round-trips through JSON with every instant returning as a string and the tag intact', () => {
    const state: InterviewState = { turns: [ANSWERED_TURN] };

    const parsed = JSON.parse(JSON.stringify(state)) as InterviewState;

    expect(parsed).toEqual(state);
    expect(parsed.turns).toHaveLength(1);

    const turn = parsed.turns[0];
    expect(turn.status).toBe('answered');
    expect(typeof turn.askedAt).toBe('string');
    if (!isAnswered(turn)) {
      expect.fail('the parsed turn should narrow on its surviving status tag');
    }
    expect(typeof turn.answeredAt).toBe('string');
  });
});

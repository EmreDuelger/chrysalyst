import { describe, expectTypeOf, it } from 'vitest';

import type { AnsweredTurn, AskedTurn, Turn } from './state.ts';

const QUESTION = 'What problem does your product solve?';
const ASKED_AT = '2026-02-03T09:00:00.000Z';
const ANSWERED_AT = '2026-02-03T09:04:12.000Z';

describe('Turn is a tagged union', () => {
  it('accepts a fully formed answered turn', () => {
    const answered: AnsweredTurn = {
      status: 'answered',
      question: QUESTION,
      askedAt: ASKED_AT,
      answer: 'A recipe planner.',
      answeredAt: ANSWERED_AT,
    };

    expectTypeOf(answered).toExtend<Turn>();
  });

  it('rejects an answered turn that carries no answering instant', () => {
    // @ts-expect-error an 'answered' turn missing answeredAt is not representable
    const missingInstant: AnsweredTurn = {
      status: 'answered',
      question: QUESTION,
      askedAt: ASKED_AT,
      answer: 'A recipe planner.',
    };

    expectTypeOf(missingInstant).toExtend<Turn>();
  });

  it('rejects an asked turn that carries an answer', () => {
    const strayAnswer: AskedTurn = {
      status: 'asked',
      question: QUESTION,
      askedAt: ASKED_AT,
      // @ts-expect-error an 'asked' turn cannot carry an answer
      answer: 'A recipe planner.',
    };

    expectTypeOf(strayAnswer).toExtend<Turn>();
  });
});

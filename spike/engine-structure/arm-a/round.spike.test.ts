import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClockPort, InterviewState } from '@chrysalyst/core';

import { createScriptedLlm } from '../shared/fake-llm.ts';
import { recordMeasurement } from '../shared/metrics.ts';
import { createSpikeSessionStore } from '../shared/store.ts';
import { createHandRolledTurnLoop } from './turn-loop.ts';

const QUESTION_CHUNKS = ['What problem', ' are you', ' trying to solve?'];
const ANSWER = 'A tool that turns vague product ideas into clear specs.';

/** Ticks one second per call, so `begin`, `askOpeningQuestion`, and
 * `recordAnswer` each land at a distinct, deterministic instant. */
function createStepClock(startIso: string): ClockPort {
  let current = new Date(startIso);
  return {
    now: () => {
      const instant = current;
      current = new Date(current.getTime() + 1000);
      return instant;
    },
  };
}

describe('arm A round: hand-rolled turn loop over direct save/load', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-spike-arm-a-'));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('persists an empty round on begin, the asked question after the stream ends, and the answer on recordAnswer — hermetically, over the shared fake LlmPort', async () => {
    const store = createSpikeSessionStore<InterviewState>('arm-a', {
      CHRYSALYST_SESSION_DIR: sandbox,
    });
    const turnLoop = createHandRolledTurnLoop({
      llm: createScriptedLlm(QUESTION_CHUNKS),
      sessions: store,
      clock: createStepClock('2026-01-01T00:00:00.000Z'),
    });
    const id = 'round-under-test';

    await turnLoop.begin(id);
    const afterBegin = await store.load(id);
    expect(afterBegin?.state).toEqual({ turns: [] });

    const stream = await turnLoop.askOpeningQuestion(id);
    expect(stream).toBeDefined();
    const delivered: string[] = [];
    for await (const chunk of stream!) {
      delivered.push(chunk);
    }
    expect(delivered.join('')).toBe(QUESTION_CHUNKS.join(''));

    const afterAsk = await store.load(id);
    expect(afterAsk?.state.turns).toEqual([
      {
        status: 'asked',
        question: QUESTION_CHUNKS.join(''),
        askedAt: '2026-01-01T00:00:01.000Z',
      },
    ]);

    const outcome = await turnLoop.recordAnswer(id, ANSWER);
    expect(outcome).toBe('recorded');

    const afterAnswer = await store.load(id);
    expect(afterAnswer?.state.turns).toEqual([
      {
        status: 'answered',
        question: QUESTION_CHUNKS.join(''),
        askedAt: '2026-01-01T00:00:01.000Z',
        answer: ANSWER,
        answeredAt: '2026-01-01T00:00:02.000Z',
      },
    ]);

    await recordMeasurement('arm-a', {
      axis: 4,
      metric: 'hermetic round with no Ollama',
      value:
        'yes — turn-loop.ts runs unchanged against the shared fake LlmPort; the only cost was this harness (mkdtemp store + createScriptedLlm), no arm-A-specific test seam was added to turn-loop.ts itself',
    });
  });

  it('answers no-session when recordAnswer targets an identifier that was never begun', async () => {
    const store = createSpikeSessionStore<InterviewState>('arm-a', {
      CHRYSALYST_SESSION_DIR: sandbox,
    });
    const turnLoop = createHandRolledTurnLoop({
      llm: createScriptedLlm(QUESTION_CHUNKS),
      sessions: store,
      clock: createStepClock('2026-01-01T00:00:00.000Z'),
    });

    const outcome = await turnLoop.recordAnswer('never-begun', ANSWER);

    expect(outcome).toBe('no-session');
  });
});

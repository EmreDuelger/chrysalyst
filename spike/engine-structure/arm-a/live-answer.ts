/**
 * Arm A, process 2: loads the session `live-ask.ts` began in a separate
 * process, records an answer, and persists it — the resume half of the round,
 * driven by the identifier `live-ask.ts` printed.
 *
 * Run as
 * `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-a/live-answer.ts <session-id>`
 * per plan.md's § Manual Testing, in a fresh shell from `live-ask.ts`.
 */
import type { InterviewState } from '@chrysalyst/core';

import { createSpikeLlm } from '../shared/llm.ts';
import { createSpikeSessionStore } from '../shared/store.ts';
import { createHandRolledTurnLoop } from './turn-loop.ts';

const ANSWER =
  'chrysalyst turns a vague product idea into a clear, development-ready ' +
  'spec through a guided interview with a small local model.';

async function main(): Promise<void> {
  const id = process.argv[2];
  if (id === undefined || id === '') {
    throw new Error(
      'arm A live-answer: pass the session identifier live-ask.ts printed as the first argument',
    );
  }

  const turnLoop = createHandRolledTurnLoop({
    llm: createSpikeLlm(),
    sessions: createSpikeSessionStore<InterviewState>('arm-a'),
    clock: { now: () => new Date() },
  });

  const outcome = await turnLoop.recordAnswer(id, ANSWER);

  process.stdout.write(`session: ${id}\n`);
  process.stdout.write(`outcome: ${outcome}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

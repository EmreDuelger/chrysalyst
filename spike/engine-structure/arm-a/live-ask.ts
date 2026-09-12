/**
 * Arm A, process 1: begins a session, asks the real model one opening
 * question, persists the asked turn, and prints the session identifier so a
 * fresh `node` invocation of `live-answer.ts` can resume it.
 *
 * Run as `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-a/live-ask.ts` per
 * plan.md's § Manual Testing.
 */
import { randomUUID } from 'node:crypto';

import type { InterviewState } from '@chrysalyst/core';

import { createSpikeLlm } from '../shared/llm.ts';
import { createSpikeSessionStore } from '../shared/store.ts';
import { createHandRolledTurnLoop } from './turn-loop.ts';

async function main(): Promise<void> {
  const turnLoop = createHandRolledTurnLoop({
    llm: createSpikeLlm(),
    sessions: createSpikeSessionStore<InterviewState>('arm-a'),
    clock: { now: () => new Date() },
  });

  const id = randomUUID();
  await turnLoop.begin(id);

  const stream = await turnLoop.askOpeningQuestion(id);
  if (stream === undefined) {
    throw new Error(
      `arm A live-ask: no session found for ${id} immediately after begin`,
    );
  }

  let question = '';
  for await (const chunk of stream) {
    question += chunk;
  }

  process.stdout.write(`session: ${id}\n`);
  process.stdout.write(`question: ${question}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

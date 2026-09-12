/**
 * Arm B, process 1: runs the round until `interrupt()` suspends it, so the
 * opening question and the checkpoint it was asked at are on disk, and prints
 * the thread identifier a fresh `node` invocation of `live-answer.ts` resumes
 * with.
 *
 * Run as `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-b/live-ask.ts`, mirroring
 * arm A's `live-ask.ts` per plan.md's § Manual Testing.
 *
 * The chat model here is `ChatOllama` — plan.md's § Arm B's chat-model binding
 * calls it the cheap binding, and it is: it reaches Ollama's native API on
 * `http://127.0.0.1:11434` while chrysalyst's own `LlmPort` adapter speaks the
 * OpenAI-compatible API on `.../v1`. The two never meet, which is exactly the
 * second-LLM-integration cost the plan is pricing.
 */
import { randomUUID } from 'node:crypto';

import { INTERRUPT, isInterrupted } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';

import { createSpikeSessionStore } from '../shared/store.ts';
import { createRoundGraph } from './round-graph.ts';
import type { CheckpointArchive } from './session-store-checkpointer.ts';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.2:3b';

async function main(): Promise<void> {
  const graph = createRoundGraph(
    new ChatOllama({
      baseUrl: process.env.CHRYSALYST_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
      model: process.env.CHRYSALYST_LLM_MODEL ?? DEFAULT_MODEL,
    }),
    createSpikeSessionStore<CheckpointArchive>('arm-b'),
  );

  const threadId = randomUUID();
  const result = await graph.invoke(
    { turns: [], answer: '' },
    { configurable: { thread_id: threadId } },
  );

  process.stdout.write(`session: ${threadId}\n`);
  if (!isInterrupted<string>(result)) {
    throw new Error(
      'arm B live-ask: the round ran to completion instead of suspending at interrupt()',
    );
  }
  process.stdout.write(`question: ${result[INTERRUPT][0].value}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

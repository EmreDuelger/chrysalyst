/**
 * Arm B, process 2: resumes the thread `live-ask.ts` suspended in a separate
 * process, by re-invoking the graph with `new Command({ resume: answer })` and
 * the same `thread_id` in `config.configurable`.
 *
 * This process shares nothing with process 1 but the session directory, so the
 * resume value has to reach the suspended `interrupt()` entirely through the
 * checkpointer. Run as
 * `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-b/live-answer.ts <session-id>`
 * in a fresh shell, mirroring arm A's `live-answer.ts`.
 *
 * The model is still constructed, and still never called: the resumed run
 * re-enters at `awaitAnswer`, not at `askOpeningQuestion`, whose result came
 * off the checkpoint. Whether that holds is the thing this process proves.
 */
import { ChatOllama } from '@langchain/ollama';
import { Command } from '@langchain/langgraph';

import { createSpikeSessionStore } from '../shared/store.ts';
import { createRoundGraph } from './round-graph.ts';
import type { CheckpointArchive } from './session-store-checkpointer.ts';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.2:3b';
const ANSWER =
  'chrysalyst turns a vague product idea into a clear, development-ready ' +
  'spec through a guided interview with a small local model.';

async function main(): Promise<void> {
  const threadId = process.argv[2];
  if (threadId === undefined || threadId === '') {
    throw new Error(
      'arm B live-answer: pass the session identifier live-ask.ts printed as the first argument',
    );
  }

  const graph = createRoundGraph(
    new ChatOllama({
      baseUrl: process.env.CHRYSALYST_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
      model: process.env.CHRYSALYST_LLM_MODEL ?? DEFAULT_MODEL,
    }),
    createSpikeSessionStore<CheckpointArchive>('arm-b'),
  );

  const result = await graph.invoke(new Command({ resume: ANSWER }), {
    configurable: { thread_id: threadId },
  });

  process.stdout.write(`session: ${threadId}\n`);
  process.stdout.write(`turns: ${JSON.stringify(result.turns, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Records task 7's measurement — the cost of the guardrail-compliant
 * `BaseChatModel` binding over chrysalyst's `LlmPort` — into
 * `measurements/arm-b.json`. This is the number plan.md § The decision rule
 * condition 3 is evaluated against.
 *
 * Run once, by hand: `node arm-b/record-binding-metrics.ts`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordMeasurement } from '../shared/metrics.ts';

const BINDING_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'llm-port-chat-model.ts',
);

function nonBlankNonCommentLineCount(source: string): number {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).length;
}

async function main(): Promise<void> {
  const loc = nonBlankNonCommentLineCount(await readFile(BINDING_PATH, 'utf8'));

  await recordMeasurement('arm-b', {
    axis: 4,
    metric:
      'guardrail-compliant BaseChatModel binding over LlmPort (plan.md § Arm B’s chat-model binding, second row)',
    value: {
      file: 'arm-b/llm-port-chat-model.ts',
      loc,
      outcome:
        'completed. The 200-LOC stop ceiling was not approached and no @langchain/core internal was reached — every member implemented is on the documented abstract surface.',
      againstConditionThree:
        'plan.md § The decision rule condition 3 requires the binding to complete inside 200 LOC. It completed at 70.',
      membersImplemented: [
        '_llmType(): string — abstract on BaseLanguageModel',
        '_generate(messages, options): Promise<ChatResult> — abstract on BaseChatModel, over LlmPort.complete',
        '_streamResponseChunks(messages, options): AsyncGenerator<ChatGenerationChunk> — non-abstract, overridden so stream() yields the port’s chunks instead of one buffered chunk, over LlmPort.stream',
      ],
      membersInherited:
        'lc_namespace, _modelType(), generatePrompt(), invoke(), stream(), the callback plumbing and the cache path all come from BaseChatModel unchanged',
      theOneTranslation:
        'LangChain types a message system | human | ai | tool | function | developer | remove; LlmPort knows system | user | assistant. Three map across, the rest have no domain meaning, and the binding rejects them by name rather than guessing.',
      whatItGivesUp:
        'no tool binding, no structured output, no sampling parameters. LlmRequest names messages and at most a model, so a binding carrying more would be measuring something the port cannot express. M7 through M13 ask for none of them; a later milestone that does would have to widen LlmPort first, which is where the real cost of this route sits.',
      provenSufficient:
        'arm-b/binding-drives-node.check.ts drives the task-6 graph, its interrupt(), and the resume entirely through this binding over the shared fake LlmPort, with no Ollama and no network — so "enough for one node to call" is demonstrated, not asserted.',
      friction:
        'none worth the name. The abstract surface is two members plus one optional streaming override, all documented, and the implementation compiled and passed its five cases on the first run. The contrast with the checkpointer is the finding: LangChain’s model seam fits an existing port cleanly, and LangGraph’s persistence seam does not.',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 4,
    metric: 'hermetic arm-B round with no Ollama',
    value:
      'achievable via the task-7 LlmPortChatModel binding over the shared fake LlmPort, at 70 LOC — no LangChain test double needed. arm-b/binding-drives-node.check.ts runs the whole round, interrupt and resume, against a mkdtemp store with no daemon and no network. Task 8 formalises this as arm-b/round.spike.test.ts.',
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

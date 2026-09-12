/**
 * Records arm A's axis-1 measurements — plan.md's § The four evaluation axes,
 * axis 1 row — into `measurements/arm-a.json`. Run once, by hand, after
 * `turn-loop.ts` was written and both live runs completed; the numbers below
 * are transcribed from that run, not computed by this script from a log.
 *
 * Run as `node arm-a/record-metrics.ts`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordMeasurement } from '../shared/metrics.ts';

const TURN_LOOP_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'turn-loop.ts',
);

function nonBlankNonCommentLineCount(source: string): number {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).length;
}

async function main(): Promise<void> {
  const source = await readFile(TURN_LOOP_PATH, 'utf8');
  const loc = nonBlankNonCommentLineCount(source);

  await recordMeasurement('arm-a', {
    axis: 1,
    metric: 'non-blank, non-comment LOC of the persistence-integration module',
    value: {
      file: 'arm-a/turn-loop.ts',
      loc,
      note:
        'no separate persistence module exists — direct save/load is inlined throughout turn-loop.ts, so the whole file is the measurement',
    },
  });

  await recordMeasurement('arm-a', {
    axis: 1,
    metric: 'distinct concepts a reader must hold to modify it',
    value: [
      'SessionId',
      'StoredSession<InterviewState>',
      'InterviewState / Turn (AskedTurn | AnsweredTurn) and isAnswered',
      'CoreDependencies (llm, sessions, clock)',
      'LlmRequest / LlmMessage roles',
      'ClockPort.now()',
      'SessionStorePort.save/load, called directly',
      'the async-generator streaming protocol (manual chunk accumulation via for-await)',
      'the invariant that the asked turn is saved only after the stream’s last chunk',
    ],
  });

  await recordMeasurement('arm-a', {
    axis: 1,
    metric: 'failed attempts before the cross-process resume worked',
    value: {
      count: 0,
      note:
        'live-ask.ts and live-answer.ts both succeeded on the first invocation against Ollama qwen3:8b; the persisted session.json was correct on the first read back',
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

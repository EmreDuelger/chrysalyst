/**
 * Records task 6's measurements — the graph, the `interrupt()`, and the
 * two-process resume — into `measurements/arm-b.json`. The numbers below are
 * transcribed from the live run against Ollama `qwen3:8b` that produced
 * `measurements/arm-b-session.json`; only the LOC counts are computed here.
 *
 * Run once, by hand: `node arm-b/record-graph-metrics.ts`.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordMeasurement } from '../shared/metrics.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MEASUREMENTS = join(HERE, '..', 'measurements');

function nonBlankNonCommentLineCount(source: string): number {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).length;
}

async function locOf(...relativePaths: string[]): Promise<number> {
  const counts = await Promise.all(
    relativePaths.map(async (path) =>
      nonBlankNonCommentLineCount(await readFile(join(HERE, path), 'utf8')),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}

async function byteSizeOf(name: string): Promise<number> {
  return (await stat(join(MEASUREMENTS, name))).size;
}

async function main(): Promise<void> {
  const graphLoc = await locOf('round-graph.ts');
  const wiringLoc = await locOf(
    'round-graph.ts',
    'live-ask.ts',
    'live-answer.ts',
  );
  const armB = await byteSizeOf('arm-b-session.json');
  const armA = await byteSizeOf('arm-a-session.json');

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'non-blank, non-comment LOC of the graph and the resume wiring',
    value: {
      graph: { file: 'arm-b/round-graph.ts', loc: graphLoc },
      graphPlusEntryPoints: {
        files: [
          'arm-b/round-graph.ts',
          'arm-b/live-ask.ts',
          'arm-b/live-answer.ts',
        ],
        loc: wiringLoc,
      },
      stopRule:
        'task 6 stops above 300 LOC. Neither reading reaches it, so task 6 completed rather than stopped.',
      armAComparison:
        'arm-a/live-ask.ts plus arm-a/live-answer.ts are 57 LOC by the same counter; arm A needs no graph module because its turn loop is the engine.',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'failed attempts before the cross-process resume worked',
    value: {
      count: 0,
      note: 'live-ask.ts suspended at interrupt() and live-answer.ts resumed it in a separate node invocation, both on their first run against Ollama qwen3:8b. One typecheck error preceded the run — result.__interrupt__, as the documentation writes it, is not on the state type an Annotation.Root produces; isInterrupted() plus the INTERRUPT key is the typed route — but that was a compile failure, not a failed resume.',
      proofTheQuestionCameOffDisk:
        'the answered turn in measurements/arm-b-session.json carries askedAt 2026-09-11T21:19:36.226Z, written by process 1, beside answeredAt 2026-09-11T21:19:41.201Z, written by process 2. The model was not called a second time.',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric:
      'what interrupt() required of the checkpointer that task 5 did not anticipate',
    value: [
      'A __resume__ write arrives under the task id 00000000-0000-0000-0000-000000000000, which belongs to no task — it is where Command({ resume }) parks the value before the interrupted task is rescheduled. The archive keys writes by `${taskId},${index}`, which happened to keep it; a scheme keyed on the WRITES_IDX_MAP index alone would have collided it with the real task’s __resume__ at -4 and dropped one, silently, and only ever on a resume.',
      'Both __resume__ writes live at the same checkpoint with different shapes: a bare string under the null task id, a one-element array under the real task id. A checkpointer that deduplicated per channel rather than per (taskId, index) would break the resume.',
      'The negative-index replace rule is load-bearing exactly here. __interrupt__ is -3 and __resume__ is -4, and the resume pass rewrites both at the already-stored checkpoint. Had putWrites kept the first write at a negative index, as it does at a non-negative one, the second process would have replayed the first process’s interrupt instead of resuming.',
      'The resume is driven by pendingWrites on the interrupted checkpoint, not by channel_values. getTuple called with no checkpoint_id therefore has to answer the newest checkpoint *with its writes attached*; answering the checkpoint alone compiles, runs, and hangs the resume.',
      'interrupt() re-runs its node from the first line on resume, so the model call had to be its own node. A two-node graph that called the model and then interrupted would have asked qwen3:8b a second question in process 2 — working code, wrong behaviour, and invisible without checking askedAt.',
    ],
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'what session.json actually holds',
    value: {
      topLevelStateKeys: ['checkpoints', 'writes'],
      checkpointsForOneRound: 5,
      writeRecordsForOneRound: 11,
      bytes: { armB, armA, ratio: Number((armB / armA).toFixed(1)) },
      interviewStateRecoverableAt:
        'state.checkpoints[""]["1f1ae268-0704-6e30-8003-3daa997e99a0"].checkpoint.json.channel_values.turns',
      interviewStateVerdict:
        'the turns array at that path is key-for-key identical to arm A’s state.turns — status, question, askedAt, answer, answeredAt. It is InterviewState v1, but five levels below `state`, in one of five checkpoints, and finding it requires knowing that "the current one" means the lexicographically largest uuid6 id in the namespace.',
      schemaVersion:
        'present and 1 for both arms, written by createFilesystemSessionStore into the envelope regardless of what state holds — so it discriminates nothing, exactly as plan.md § The decision rule condition 1 says.',
      transcriptMd:
        'the metadata-header fallback for both arms: this spike configures no renderTranscript, so transcript.md holds the session id and two timestamps and nothing about the interview.',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 4,
    metric:
      'ChatOllama binding cost (plan.md § Arm B’s chat-model binding, cheap binding)',
    value: {
      loc: 4,
      note: 'a `new ChatOllama({ baseUrl, model })` literal in each of the two entry points, nothing else',
      outcome: 'completed, first attempt',
      divergence:
        'ChatOllama reaches Ollama’s native API at http://127.0.0.1:11434 while chrysalyst’s LlmPort adapter reaches the OpenAI-compatible API at http://127.0.0.1:11434/v1, whose default lives in openai-compatible-llm.ts as DEFAULT_BASE_URL. The two configurations do not share an environment variable, so this binding needs its own — CHRYSALYST_OLLAMA_URL here — and production would carry two independently configured LLM clients.',
      modelOutput:
        'qwen3:8b emitted no <think> block through ChatOllama on this run; round-graph.ts strips one defensively because a reasoning model may.',
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

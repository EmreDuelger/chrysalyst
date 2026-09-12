/**
 * Records task 5's axis-1 measurements — plan.md's § The four evaluation axes,
 * axis 1 row — into `measurements/arm-b.json`, and writes a hermetic
 * `session.json` produced by the checkpointer alone into
 * `measurements/arm-b-checkpointer-session.json` so the archive shape is on
 * record independently of whether the live run in task 6 completes.
 *
 * Run once, by hand: `node arm-b/record-metrics.ts`.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFilesystemSessionStore } from '@chrysalyst/server/src/adapters/session-store/filesystem-session-store.ts';

import { recordMeasurement } from '../shared/metrics.ts';
import {
  SessionStoreCheckpointer,
  type CheckpointArchive,
} from './session-store-checkpointer.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKPOINTER_PATH = join(HERE, 'session-store-checkpointer.ts');
const SAMPLE_PATH = join(
  HERE,
  '..',
  'measurements',
  'arm-b-checkpointer-session.json',
);
const SAMPLE_THREAD_ID = 'hermetic-archive-sample';

function nonBlankNonCommentLineCount(source: string): number {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).length;
}

async function writeArchiveSample(): Promise<void> {
  const rootDir = await mkdtemp(join(tmpdir(), 'arm-b-sample-'));
  const checkpointer = new SessionStoreCheckpointer(
    createFilesystemSessionStore<CheckpointArchive>({ rootDir }),
  );
  const config = {
    configurable: { thread_id: SAMPLE_THREAD_ID, checkpoint_ns: '' },
  };
  await checkpointer.put(
    config,
    {
      v: 4,
      id: '1f0a0000-0000-6000-8000-000000000001',
      ts: new Date(0).toISOString(),
      channel_values: {
        turns: [
          {
            status: 'asked',
            question: 'What product do you have in mind?',
            askedAt: new Date(0).toISOString(),
          },
        ],
      },
      channel_versions: { turns: 1 },
      versions_seen: {},
    },
    { source: 'loop', step: 0, parents: {} },
  );
  await checkpointer.putWrites(
    {
      configurable: {
        ...config.configurable,
        checkpoint_id: '1f0a0000-0000-6000-8000-000000000001',
      },
    },
    [['__resume__', 'a one-sentence answer']],
    'task-1',
  );
  await writeFile(
    SAMPLE_PATH,
    await readFile(join(rootDir, SAMPLE_THREAD_ID, 'session.json'), 'utf8'),
    'utf8',
  );
}

async function main(): Promise<void> {
  const loc = nonBlankNonCommentLineCount(
    await readFile(CHECKPOINTER_PATH, 'utf8'),
  );

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'non-blank, non-comment LOC of the persistence-integration module',
    value: {
      file: 'arm-b/session-store-checkpointer.ts',
      loc,
      countedBy:
        'non-blank lines whose first non-space character is not //, /* or *, applied to the prettier-formatted file — the same counter arm A used',
      stopRule:
        'task 5 stops above 300 LOC. The artifact is complete and passes arm-b/checkpointer.spike.test.ts (10 cases), so the reached state is "works, and costs 334" rather than "abandoned unfinished"',
      againstConditionTwo:
        'plan.md § The decision rule condition 2 accepts at or under 200 LOC; this is 134 over that line and 34 over task 5’s own stop ceiling',
      armAComparison:
        'arm-a/turn-loop.ts is 108 LOC by the same counter, and that file is the whole turn loop, not only its persistence integration',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'distinct concepts a reader must hold to modify it',
    value: [
      'BaseCheckpointSaver and its five abstract members (getTuple, list, put, putWrites, deleteThread)',
      'Checkpoint (v, id, ts, channel_values, channel_versions, versions_seen) — format version 4',
      'CheckpointTuple (config, checkpoint, metadata, parentConfig, pendingWrites)',
      'CheckpointMetadata (source: input|loop|update|fork, step, parents)',
      'PendingWrite [channel, value] and CheckpointPendingWrite [taskId, channel, value]',
      'WRITES_IDX_MAP and the negative-index rule for __error__, __scheduled__, __interrupt__, __resume__',
      'SerializerProtocol.dumpsTyped/loadsTyped and its [type, Uint8Array] encoding',
      'thread_id, checkpoint_ns, checkpoint_id inside RunnableConfig.configurable',
      'channel versions and the uuid6 ordering that makes "the latest checkpoint" expressible',
      'CheckpointListOptions (limit, before, filter)',
      'the parent chain via parentConfig, and getDeltaChannelHistory’s default walk over it',
      'SessionId and StoredSession<TState>',
      'SessionStorePort.list/load/save, and the absence of delete',
      'the spike-local CheckpointArchive shape and its two nested maps',
      'the read-modify-write hazard the port’s replace-whole-document save creates',
    ],
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'BaseCheckpointSaver members that SessionStorePort cannot satisfy',
    value: {
      blockingMember: 'abstract deleteThread(threadId: string): Promise<void>',
      reason:
        'SessionStorePort declares list, load and save and no delete. Its own doc comment states the omission is deliberate: "There is no delete: no use case asks to remove a session, and an unasked method is one every future adapter would have to implement untested." Nothing behind the port can be reached to build one, so the member rejects with that fact in the message rather than tombstoning an empty archive — a tombstone would leave the session directory, the identifier in SessionStorePort.list(), and transcript.md all present.',
      attempts:
        'one. The gap is structural, not a failed encoding: there is no second approach to try that does not either edit the port or reach past it to the filesystem, both of which plan.md forbids.',
      othersSatisfied:
        'getTuple, list, put and putWrites are all satisfiable over the port as recorded, each on the first attempt',
    },
  });

  await recordMeasurement('arm-b', {
    axis: 1,
    metric: 'friction found while writing the checkpointer',
    value: [
      'serde.dumpsTyped answers a Uint8Array and the filesystem store persists state through JSON.stringify, which turns a Uint8Array into {"0":123,...}. The bytes must be re-encoded before storage; nothing in either contract says so. Found by reading filesystem-session-store.ts toEnvelope against jsonplus.ts _dumps, not from documentation.',
      'putWrites’ idempotency rule — a repeat at a non-negative index is dropped, a repeat at a negative index replaces — appears in no published signature or doc page. It was read out of MemorySaver’s source.',
      'put and putWrites are both read-modify-write of the whole session document, because SessionStorePort.save replaces rather than merges and offers no compare-and-swap. They are serialized in-process through a promise chain here; across processes nothing can serialize them, so two node invocations writing one thread concurrently silently lose a revision. Arm A writes one InterviewState per step and has no equivalent exposure.',
      'checkpoint_ns uses | as its own separator, so the archive nests by namespace rather than using a composite key that would have to escape it.',
      'createFilesystemSessionStore rejects any identifier that is not a single path segment; LangGraph constrains thread_id not at all. A thread_id containing / typechecks and fails at put, inside the adapter.',
      'The archive grows without bound: LangGraph appends a checkpoint per superstep, never prunes, and the port has no delete — so the whole document is rewritten, larger, on every step.',
    ],
  });

  await writeArchiveSample();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

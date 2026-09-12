/**
 * Arm B, task 5's harness: drives `SessionStoreCheckpointer` against the real
 * filesystem `SessionStorePort` in a `mkdtemp` sandbox, with no graph, no
 * model, and no network.
 *
 * The last two cases are the ones that matter for axis 1: a second
 * checkpointer instance built over the same directory must see the first's
 * checkpoints (the cross-process resume in miniature), and `deleteThread`
 * must report the gap rather than pretend to delete.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFilesystemSessionStore } from '@chrysalyst/server/src/adapters/session-store/filesystem-session-store.ts';
import type {
  Checkpoint,
  CheckpointMetadata,
} from '@langchain/langgraph-checkpoint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SessionStoreCheckpointer,
  type CheckpointArchive,
} from './session-store-checkpointer.ts';

const THREAD_ID = 'thread-under-test';

function checkpointAt(id: string, turns: readonly string[]): Checkpoint {
  return {
    v: 4,
    id,
    ts: new Date(0).toISOString(),
    channel_values: { turns },
    channel_versions: { turns: 1 },
    versions_seen: {},
  };
}

function metadataAt(step: number): CheckpointMetadata {
  return { source: 'loop', step, parents: {} };
}

function threadConfig(checkpointId?: string) {
  return {
    configurable: {
      thread_id: THREAD_ID,
      checkpoint_ns: '',
      ...(checkpointId === undefined ? {} : { checkpoint_id: checkpointId }),
    },
  };
}

describe('SessionStoreCheckpointer over the real SessionStorePort', () => {
  let rootDir: string;
  let checkpointer: SessionStoreCheckpointer;

  function checkpointerOverSameDirectory(): SessionStoreCheckpointer {
    return new SessionStoreCheckpointer(
      createFilesystemSessionStore<CheckpointArchive>({ rootDir }),
    );
  }

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'arm-b-checkpointer-'));
    checkpointer = checkpointerOverSameDirectory();
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('answers undefined for a thread that was never checkpointed', async () => {
    expect(await checkpointer.getTuple(threadConfig())).toBeUndefined();
  });

  it('answers the newest checkpoint when the config names no checkpoint id', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );
    await checkpointer.put(
      threadConfig('0001'),
      checkpointAt('0002', ['asked']),
      metadataAt(1),
    );

    const tuple = await checkpointer.getTuple(threadConfig());

    expect(tuple?.checkpoint.id).toBe('0002');
    expect(tuple?.checkpoint.channel_values).toEqual({ turns: ['asked'] });
    expect(tuple?.metadata).toEqual(metadataAt(1));
    expect(tuple?.parentConfig?.configurable?.checkpoint_id).toBe('0001');
  });

  it('answers the named checkpoint when the config carries a checkpoint id', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );
    await checkpointer.put(
      threadConfig('0001'),
      checkpointAt('0002', ['asked']),
      metadataAt(1),
    );

    const tuple = await checkpointer.getTuple(threadConfig('0001'));

    expect(tuple?.checkpoint.id).toBe('0001');
    expect(tuple?.parentConfig).toBeUndefined();
  });

  it('surfaces pending writes on the tuple of the checkpoint they were put against', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );

    await checkpointer.putWrites(
      threadConfig('0001'),
      [['turns', ['asked']]],
      'task-1',
    );

    const tuple = await checkpointer.getTuple(threadConfig('0001'));
    expect(tuple?.pendingWrites).toEqual([['task-1', 'turns', ['asked']]]);
  });

  it('keeps the first write for a task index and drops a later duplicate', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );

    await checkpointer.putWrites(
      threadConfig('0001'),
      [['turns', ['first']]],
      'task-1',
    );
    await checkpointer.putWrites(
      threadConfig('0001'),
      [['turns', ['second']]],
      'task-1',
    );

    const tuple = await checkpointer.getTuple(threadConfig('0001'));
    expect(tuple?.pendingWrites).toEqual([['task-1', 'turns', ['first']]]);
  });

  it('replaces a special write, which carries a negative index, on a repeat', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );

    await checkpointer.putWrites(
      threadConfig('0001'),
      [['__resume__', 'first answer']],
      'task-1',
    );
    await checkpointer.putWrites(
      threadConfig('0001'),
      [['__resume__', 'second answer']],
      'task-1',
    );

    const tuple = await checkpointer.getTuple(threadConfig('0001'));
    expect(tuple?.pendingWrites).toEqual([
      ['task-1', '__resume__', 'second answer'],
    ]);
  });

  it('lists a thread newest first and honours the limit', async () => {
    for (const id of ['0001', '0002', '0003']) {
      await checkpointer.put(
        threadConfig(),
        checkpointAt(id, []),
        metadataAt(0),
      );
    }

    const listed = [];
    for await (const tuple of checkpointer.list(threadConfig(), { limit: 2 })) {
      listed.push(tuple.checkpoint.id);
    }

    expect(listed).toEqual(['0003', '0002']);
  });

  it('lists every stored thread when the config names none', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', []),
      metadataAt(0),
    );
    await checkpointer.put(
      { configurable: { thread_id: 'other-thread', checkpoint_ns: '' } },
      checkpointAt('0002', []),
      metadataAt(0),
    );

    const listed = [];
    for await (const tuple of checkpointer.list({ configurable: {} })) {
      listed.push(tuple.config.configurable?.thread_id);
    }

    expect(listed.toSorted()).toEqual(['other-thread', THREAD_ID]);
  });

  it('lets a second checkpointer over the same directory read the first one back', async () => {
    await checkpointer.put(
      threadConfig(),
      checkpointAt('0001', ['asked']),
      metadataAt(0),
    );
    await checkpointer.putWrites(
      threadConfig('0001'),
      [['__resume__', 'the answer']],
      'task-1',
    );

    const tuple =
      await checkpointerOverSameDirectory().getTuple(threadConfig());

    expect(tuple?.checkpoint.channel_values).toEqual({ turns: ['asked'] });
    expect(tuple?.pendingWrites).toEqual([
      ['task-1', '__resume__', 'the answer'],
    ]);
  });

  it('rejects deleteThread, naming the port member that does not exist', async () => {
    await expect(checkpointer.deleteThread(THREAD_ID)).rejects.toThrow(
      /SessionStorePort/,
    );
  });
});

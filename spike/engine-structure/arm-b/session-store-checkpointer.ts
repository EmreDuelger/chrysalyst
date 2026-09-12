/**
 * Arm B's persistence integration: a `BaseCheckpointSaver` whose only storage
 * is chrysalyst's real, unmodified `SessionStorePort`.
 *
 * This module is axis 1's measurement for arm B. Every decision below was
 * forced by a mismatch between the two contracts, and each is recorded here
 * rather than smoothed over.
 *
 * ## `thread_id` maps to `SessionId` by identity
 *
 * One LangGraph thread is one chrysalyst session. The mapping is the identity
 * function, and it is lossy in one direction: `SessionStorePort` places no
 * constraint on an identifier, but `createFilesystemSessionStore` — the only
 * adapter that exists — refuses any identifier that is not a single path
 * segment (empty, `.`, `..`, or containing `/`, `\`, or NUL). LangGraph places
 * no such constraint on `thread_id` and hands whatever the caller passed
 * straight through. A `thread_id` of `a/b` therefore compiles, runs, and fails
 * at `put` inside the adapter. Nothing in either contract catches it earlier.
 *
 * ## `TState` is a checkpoint archive, not `InterviewState`
 *
 * This is the central finding. `SessionStorePort` addresses exactly one
 * document per `SessionId`, replaced whole on every `save`. LangGraph needs a
 * keyed, growing collection: many checkpoints per thread (one per superstep),
 * across many `checkpoint_ns` values, each with its own metadata, its own
 * parent pointer, and its own set of pending writes keyed by task. The only
 * shape that fits a one-document-per-session port is therefore the entire
 * per-thread checkpoint store, serialized into `state` as {@link CheckpointArchive}.
 *
 * The consequence is visible on disk. `session.json`'s `state` field does not
 * hold `{ turns: Turn[] }`. It holds `{ checkpoints: {...}, writes: {...} }`,
 * and an `InterviewState` is recoverable only from
 * `state.checkpoints["<ns>"]["<checkpoint_id>"].checkpoint.json.channel_values`
 * of whichever checkpoint id sorts last. `schemaVersion` in the envelope is
 * unaffected: `createFilesystemSessionStore` writes it either way, so it
 * discriminates nothing between the two arms.
 *
 * The archive also grows without bound. LangGraph appends a checkpoint per
 * superstep and never prunes; `SessionStorePort` has no delete; so a session's
 * document is rewritten in full, larger each time, for the life of the
 * interview.
 *
 * ## A `CheckpointTuple` is reconstituted from the archive, not from `StoredSession`
 *
 * `StoredSession`'s own fields carry nothing LangGraph asks for. `id` is the
 * thread, and `createdAt`/`updatedAt` are envelope bookkeeping that no
 * `CheckpointTuple` field corresponds to — a `CheckpointTuple`'s time is
 * `checkpoint.ts`, which LangGraph sets itself. So `getTuple` loads the
 * session, indexes the archive by `checkpoint_ns` and `checkpoint_id`, runs
 * `serde.loadsTyped` over the archived checkpoint and metadata, attaches the
 * archived writes as `pendingWrites`, and rebuilds `parentConfig` from the
 * stored parent id. With no `checkpoint_id` in the config it takes the
 * lexicographically largest id in the namespace, which is what makes the
 * resume work at all: `uuid6` ids sort by creation time, and that ordering is
 * the only "latest" this port can express.
 *
 * ## `serde` output has to be re-encoded before the store will keep it
 *
 * `SerializerProtocol.dumpsTyped` answers `[type, Uint8Array]`, and the
 * filesystem store persists `state` through `JSON.stringify`. A `Uint8Array`
 * does not survive that round trip — it returns as `{"0":123,"1":34,...}` —
 * so the bytes are re-encoded before storage. For the default `json` type they
 * are decoded as UTF-8 and re-nested as live JSON, which is what keeps
 * `session.json` readable at all; any other serializer type is stored base64
 * and is opaque. Neither contract mentions the other's encoding; this was
 * found by reading the store's `toEnvelope` and the serializer's `_dumps`.
 *
 * ## `putWrites` is honoured by read-modify-write of the whole document
 *
 * Writes are archived under `writes[ns][checkpoint_id][`${taskId},${index}`]`,
 * with `index` taken from `WRITES_IDX_MAP` for LangGraph's special channels
 * (`__error__`, `__scheduled__`, `__interrupt__`, `__resume__`) and from the
 * write's position otherwise, exactly as `MemorySaver` does. A repeat at a
 * non-negative index is dropped and a repeat at a negative index replaces —
 * the idempotency rule the reference saver implements and that no part of the
 * published `BaseCheckpointSaver` signature states.
 *
 * Because the port replaces the whole document, `put` and `putWrites` are both
 * read-modify-write with no compare-and-swap. Two concurrent calls would lose
 * one of the two revisions. In-process they are serialized through a promise
 * chain here; across processes the port offers nothing to serialize them with,
 * so two `node` invocations writing the same thread at the same time silently
 * drop one. Arm A has no equivalent exposure: it writes one `InterviewState`
 * per step and never merges.
 *
 * ## `list` is a full load and an in-memory scan
 *
 * `SessionStorePort` has no query surface — `list` answers identifiers, `load`
 * answers one whole session, and that is all. So `list(config)` scoped to a
 * thread loads that thread's entire archive and scans it; unscoped, it calls
 * `SessionStorePort.list()` and then loads every session in the store. The
 * `before`, `limit`, and `filter` options are all applied in memory after the
 * documents are already read. At one round this is free; it is the shape that
 * does not survive M8's many-turn sessions.
 *
 * ## `deleteThread` cannot be satisfied
 *
 * `SessionStorePort` has no `delete`, and its doc comment says the omission is
 * deliberate: "no use case asks to remove a session, and an unasked method is
 * one every future adapter would have to implement untested." There is no
 * mechanism behind the port to build one from. `deleteThread` therefore
 * rejects and names the gap. Saving an empty archive instead would be a
 * tombstone, not a deletion: the session directory, the identifier in
 * `SessionStorePort.list()`, and the `transcript.md` beside it would all
 * survive.
 */
import { Buffer } from 'node:buffer';

import type { SessionId, SessionStorePort } from '@chrysalyst/core';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
  getCheckpointId,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint';

/** The serializer type tag whose payload is UTF-8 JSON and can stay readable on disk. */
const JSON_SERDE_TYPE = 'json';

/** One `serde.dumpsTyped` result, re-encoded so `JSON.stringify` preserves it. */
interface ArchivedValue {
  readonly type: string;
  readonly json?: unknown;
  readonly base64?: string;
}

/** One checkpoint as archived: the payload, its metadata, and its parent within the namespace. */
interface ArchivedCheckpoint {
  readonly checkpoint: ArchivedValue;
  readonly metadata: ArchivedValue;
  readonly parentCheckpointId?: string;
}

type ArchivedWrite = readonly [
  taskId: string,
  channel: string,
  value: ArchivedValue,
];

/**
 * Everything LangGraph holds for one thread, as the single document
 * `SessionStorePort` stores per session.
 *
 * Both maps are keyed `[checkpoint_ns][checkpoint_id]`, nested rather than
 * joined into a composite key because `checkpoint_ns` uses `|` as its own
 * separator and any flat key would have to escape it.
 */
export interface CheckpointArchive {
  readonly checkpoints: Record<string, Record<string, ArchivedCheckpoint>>;
  readonly writes: Record<
    string,
    Record<string, Record<string, ArchivedWrite>>
  >;
}

function emptyArchive(): CheckpointArchive {
  return { checkpoints: {}, writes: {} };
}

function namespaceOf(config: RunnableConfig): string {
  const namespace: unknown = config.configurable?.checkpoint_ns;
  return typeof namespace === 'string' ? namespace : '';
}

function threadIdOf(config: RunnableConfig): SessionId | undefined {
  const threadId: unknown = config.configurable?.thread_id;
  return typeof threadId === 'string' ? threadId : undefined;
}

function missingThreadId(attempted: string): Error {
  return new Error(
    `Cannot ${attempted}: the RunnableConfig carries no "thread_id" in its "configurable" property, and SessionStoreCheckpointer has no session identifier without one`,
  );
}

function archiveValue(type: string, data: Uint8Array): ArchivedValue {
  if (type === JSON_SERDE_TYPE) {
    return { type, json: JSON.parse(new TextDecoder().decode(data)) };
  }
  return { type, base64: Buffer.from(data).toString('base64') };
}

function restoreValue(archived: ArchivedValue): string | Uint8Array {
  if (archived.type === JSON_SERDE_TYPE) {
    return JSON.stringify(archived.json);
  }
  if (archived.base64 === undefined) {
    throw new Error(
      `Cannot restore an archived ${archived.type} value: the record carries neither a "json" nor a "base64" payload`,
    );
  }
  return Buffer.from(archived.base64, 'base64');
}

function newestFirst(
  inNamespace: Record<string, ArchivedCheckpoint>,
): string[] {
  return Object.keys(inNamespace).sort((a, b) => b.localeCompare(a));
}

/**
 * A LangGraph checkpointer backed by chrysalyst's `SessionStorePort`.
 *
 * Parameterised at `CheckpointArchive` rather than at the domain's
 * `InterviewState`, for the reason the module doc comment gives: one session
 * document has to hold a thread's whole checkpoint history.
 */
export class SessionStoreCheckpointer extends BaseCheckpointSaver {
  readonly #sessions: SessionStorePort<CheckpointArchive>;
  #pending: Promise<unknown> = Promise.resolve();

  constructor(sessions: SessionStorePort<CheckpointArchive>) {
    super();
    this.#sessions = sessions;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = threadIdOf(config);
    if (threadId === undefined) {
      return undefined;
    }
    const namespace = namespaceOf(config);
    const archive = await this.#archiveOf(threadId);
    if (archive === undefined) {
      return undefined;
    }
    const inNamespace = archive.checkpoints[namespace] ?? {};
    const requested = getCheckpointId(config);
    const checkpointId =
      requested === '' ? newestFirst(inNamespace)[0] : requested;
    const archived =
      checkpointId === undefined ? undefined : inNamespace[checkpointId];
    if (checkpointId === undefined || archived === undefined) {
      return undefined;
    }
    return this.#toTuple(threadId, namespace, checkpointId, archived, archive);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const scopedThreadId = threadIdOf(config);
    const threadIds =
      scopedThreadId === undefined
        ? await this.#sessions.list()
        : [scopedThreadId];
    const scopedNamespace: unknown = config.configurable?.checkpoint_ns;
    const before: unknown = options?.before?.configurable?.checkpoint_id;
    let remaining = options?.limit;

    for (const threadId of threadIds) {
      const archive = await this.#archiveOf(threadId);
      for (const [namespace, inNamespace] of Object.entries(
        archive?.checkpoints ?? {},
      )) {
        if (
          typeof scopedNamespace === 'string' &&
          namespace !== scopedNamespace
        ) {
          continue;
        }
        for (const checkpointId of newestFirst(inNamespace)) {
          if (typeof before === 'string' && checkpointId >= before) {
            continue;
          }
          const tuple = await this.#toTuple(
            threadId,
            namespace,
            checkpointId,
            inNamespace[checkpointId],
            archive ?? emptyArchive(),
          );
          if (!matchesFilter(options?.filter, tuple.metadata)) {
            continue;
          }
          if (remaining !== undefined) {
            if (remaining <= 0) {
              return;
            }
            remaining -= 1;
          }
          yield tuple;
        }
      }
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const threadId = threadIdOf(config);
    if (threadId === undefined) {
      throw missingThreadId('put a checkpoint');
    }
    const namespace = namespaceOf(config);
    const [checkpointType, checkpointBytes] = await this.serde.dumpsTyped(
      copyCheckpoint(checkpoint),
    );
    const [metadataType, metadataBytes] = await this.serde.dumpsTyped(metadata);
    const parentCheckpointId: unknown = config.configurable?.checkpoint_id;
    const archived: ArchivedCheckpoint = {
      checkpoint: archiveValue(checkpointType, checkpointBytes),
      metadata: archiveValue(metadataType, metadataBytes),
      ...(typeof parentCheckpointId === 'string' ? { parentCheckpointId } : {}),
    };

    await this.#revise(threadId, (archive) => ({
      ...archive,
      checkpoints: {
        ...archive.checkpoints,
        [namespace]: {
          ...archive.checkpoints[namespace],
          [checkpoint.id]: archived,
        },
      },
    }));

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: namespace,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = threadIdOf(config);
    if (threadId === undefined) {
      throw missingThreadId('put pending writes');
    }
    const checkpointId: unknown = config.configurable?.checkpoint_id;
    if (typeof checkpointId !== 'string') {
      throw new Error(
        'Cannot put pending writes: the RunnableConfig carries no "checkpoint_id" in its "configurable" property, so there is no checkpoint to attach them to',
      );
    }
    const namespace = namespaceOf(config);
    const archived = await Promise.all(
      writes.map(async ([channel, value], position) => {
        const [type, bytes] = await this.serde.dumpsTyped(value);
        const index = WRITES_IDX_MAP[channel] ?? position;
        const write: ArchivedWrite = [
          taskId,
          channel,
          archiveValue(type, bytes),
        ];
        return { key: `${taskId},${String(index)}`, index, write };
      }),
    );

    await this.#revise(threadId, (archive) => {
      const existing = archive.writes[namespace]?.[checkpointId] ?? {};
      const merged: Record<string, ArchivedWrite> = { ...existing };
      for (const { key, index, write } of archived) {
        if (index >= 0 && key in existing) {
          continue;
        }
        merged[key] = write;
      }
      return {
        ...archive,
        writes: {
          ...archive.writes,
          [namespace]: { ...archive.writes[namespace], [checkpointId]: merged },
        },
      };
    });
  }

  /**
   * Rejects, always. See the module doc comment: `SessionStorePort` declares
   * no `delete`, deliberately, and nothing behind it can be reached to build
   * one — so this member of `BaseCheckpointSaver` has no implementation over
   * this port at all.
   */
  async deleteThread(threadId: string): Promise<void> {
    return Promise.reject(
      new Error(
        `Cannot delete the LangGraph thread ${JSON.stringify(threadId)}: SessionStorePort declares list, load, and save and no delete, so a BaseCheckpointSaver over it cannot implement deleteThread`,
      ),
    );
  }

  async #archiveOf(
    threadId: SessionId,
  ): Promise<CheckpointArchive | undefined> {
    return (await this.#sessions.load(threadId))?.state;
  }

  async #toTuple(
    threadId: SessionId,
    namespace: string,
    checkpointId: string,
    archived: ArchivedCheckpoint,
    archive: CheckpointArchive,
  ): Promise<CheckpointTuple> {
    const writes = archive.writes[namespace]?.[checkpointId] ?? {};
    const pendingWrites = await Promise.all(
      Object.values(writes).map(
        async ([taskId, channel, value]): Promise<CheckpointPendingWrite> => [
          taskId,
          channel,
          await this.serde.loadsTyped(value.type, restoreValue(value)),
        ],
      ),
    );
    const parentCheckpointId = archived.parentCheckpointId;
    return {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: namespace,
          checkpoint_id: checkpointId,
        },
      },
      checkpoint: (await this.serde.loadsTyped(
        archived.checkpoint.type,
        restoreValue(archived.checkpoint),
      )) as Checkpoint,
      metadata: (await this.serde.loadsTyped(
        archived.metadata.type,
        restoreValue(archived.metadata),
      )) as CheckpointMetadata,
      pendingWrites,
      ...(parentCheckpointId === undefined
        ? {}
        : {
            parentConfig: {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: namespace,
                checkpoint_id: parentCheckpointId,
              },
            },
          }),
    };
  }

  async #revise(
    threadId: SessionId,
    reviseArchive: (archive: CheckpointArchive) => CheckpointArchive,
  ): Promise<void> {
    const revision = this.#pending.then(
      () => this.#loadReviseSave(threadId, reviseArchive),
      () => this.#loadReviseSave(threadId, reviseArchive),
    );
    this.#pending = revision.then(
      () => undefined,
      () => undefined,
    );
    return revision;
  }

  async #loadReviseSave(
    threadId: SessionId,
    reviseArchive: (archive: CheckpointArchive) => CheckpointArchive,
  ): Promise<void> {
    const existing = await this.#sessions.load(threadId);
    const now = new Date();
    await this.#sessions.save({
      id: threadId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      state: reviseArchive(existing?.state ?? emptyArchive()),
    });
  }
}

function matchesFilter(
  filter: Record<string, unknown> | undefined,
  metadata: CheckpointMetadata | undefined,
): boolean {
  if (filter === undefined) {
    return true;
  }
  const fields = (metadata ?? {}) as Record<string, unknown>;
  return Object.entries(filter).every(([key, value]) => fields[key] === value);
}

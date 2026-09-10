import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type {
  SessionId,
  SessionStorePort,
  StoredSession,
} from '@chrysalyst/core';
import { z } from 'zod';

const SCHEMA_VERSION = 1;
const ENVELOPE_FILE = 'session.json';
const TRANSCRIPT_FILE = 'transcript.md';
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const STAGING_SUFFIX = '.tmp';
const ABSENT_CODE = 'ENOENT';

/*
 * The four envelope fields the version check does not own. `schemaVersion` is
 * deliberately absent: the version is settled before this object runs, so a
 * rule for it here would report the same fault a second time in a message that
 * names neither the version found nor the version expected.
 */
const envelopeBodySchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  state: z.unknown(),
});

type EnvelopeBody = z.infer<typeof envelopeBodySchema>;

/**
 * How a caller points the store at the directory tree that holds its sessions,
 * and optionally how a stored session becomes its `transcript.md`.
 *
 * The type parameter is defaulted so a caller that never renders — and
 * `sessionStoreConfigFromEnv`, whose declared return type names no state — keeps
 * compiling unchanged. `renderTranscript` is the state owner's business, not the
 * store's: `@chrysalyst/core` renders the interview's and the composition root
 * supplies it. With none configured the store writes a metadata header and reads
 * nothing under `state`, so a caller persisting some other `TState` needs no
 * renderer.
 */
export interface FilesystemSessionStoreConfig<TState = unknown> {
  readonly rootDir: string;
  readonly renderTranscript?: (session: StoredSession<TState>) => string;
}

/**
 * Confines the fact that a session is a folder on disk to this module.
 *
 * `SessionStorePort` speaks only of sessions and their state; the directory
 * layout, the `session.json` envelope, `schemaVersion`, and the Markdown
 * transcript are this adapter's private business and stop at its boundary.
 * The root is a parameter rather than a constant so production points it at
 * the user's home directory while every test points it at a `mkdtemp`
 * sandbox, and neither can reach the other's files.
 *
 * A failure is reported in the same vocabulary. Every rejection is this
 * module's own `Error`, naming the session or the root it could not reach and
 * carrying the underlying failure as `cause`, so a caller behind
 * `SessionStorePort` never has to read a `node:fs` error code, and the
 * temporary names the store writes through stay out of the message.
 *
 * `load` keeps absence and damage apart, because a caller acts differently on
 * each: an identifier that was never saved answers `undefined`, while a
 * `session.json` that is present but unreadable rejects and names the file it
 * could not read. Collapsing the two would have a caller silently begin a
 * fresh session over one whose state it merely failed to load.
 *
 * `transcript.md` is written from `config.renderTranscript` when a caller
 * configures one and from a metadata header otherwise; the store never reads
 * `TState` itself. A renderer that throws fails the save the same way a write
 * failure does — the previous revision stays loadable, no temporary file
 * survives, and the rejection names the session directory with the renderer's
 * error as `cause`.
 */
export function createFilesystemSessionStore<TState>(
  config: FilesystemSessionStoreConfig<TState>,
): SessionStorePort<TState> {
  return {
    async list(): Promise<readonly SessionId[]> {
      let entries: Dirent[];
      try {
        entries = await readdir(config.rootDir, { withFileTypes: true });
      } catch (error) {
        if (errorCodeOf(error) === ABSENT_CODE) {
          return [];
        }
        throw unlistableRoot(config.rootDir, error);
      }

      const identifiers: SessionId[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !isStorableIdentifier(entry.name)) {
          continue;
        }
        if (
          (await readEnvelope(config.rootDir, entry.name)).outcome === 'read'
        ) {
          identifiers.push(entry.name);
        }
      }
      return identifiers.sort();
    },

    async load(id: SessionId): Promise<StoredSession<TState> | undefined> {
      if (!isStorableIdentifier(id)) {
        return undefined;
      }

      const read = await readEnvelope(config.rootDir, id);

      if (read.outcome === 'absent') {
        return undefined;
      }
      if (read.outcome === 'unreadable') {
        throw read.failure;
      }
      return toStoredSession<TState>(read.envelope);
    },

    async save(session: StoredSession<TState>): Promise<void> {
      if (!isStorableIdentifier(session.id)) {
        throw unstorableIdentifier(session.id);
      }

      const directory = join(config.rootDir, session.id);

      try {
        const envelope = JSON.stringify(toEnvelope(session), null, 2);
        const transcript = config.renderTranscript
          ? config.renderTranscript(session)
          : toTranscript(session);

        await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
        await commitRevision(directory, envelope, transcript);
      } catch (error) {
        throw unwritableSession(directory, error);
      }
    },
  };
}

/**
 * The single place `~/.chrysalyst/sessions` is written down.
 *
 * Keeping the root out of `createFilesystemSessionStore` is what lets every
 * test point the store at a `mkdtemp` sandbox while production points it at the
 * user's home directory. `CHRYSALYST_SESSION_DIR` overrides the default and is
 * resolved to an absolute path, so the store's root does not move with the
 * working directory. The environment is passed in rather than read from ambient
 * state so the resolution stays a pure function of its input, and nothing here
 * touches the filesystem — chrysalyst gains no dotenv loader. It mirrors
 * `llmConfigFromEnv`, so the two adapters are configured the same way.
 */
export function sessionStoreConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FilesystemSessionStoreConfig {
  const configured = env.CHRYSALYST_SESSION_DIR;
  return {
    rootDir:
      configured === undefined || configured === ''
        ? join(homedir(), '.chrysalyst', 'sessions')
        : resolve(configured),
  };
}

interface SessionEnvelope {
  readonly schemaVersion: number;
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: unknown;
}

/**
 * The one read of a stored session, and the only place that decides whether a
 * session directory holds one.
 *
 * It answers rather than throws, so that the two callers who ask different
 * questions can apply opposite policies to the same answer: `load` rethrows
 * what the read refused and `list` drops it. Only a missing file is absence —
 * every other outcome, from a filesystem refusal to an envelope this version
 * of the store does not recognise, is a session that exists and cannot be
 * read back.
 */
type EnvelopeRead =
  | { readonly outcome: 'absent' }
  | { readonly outcome: 'unreadable'; readonly failure: Error }
  | { readonly outcome: 'read'; readonly envelope: EnvelopeBody };

async function readEnvelope(
  rootDir: string,
  id: SessionId,
): Promise<EnvelopeRead> {
  const path = join(rootDir, id, ENVELOPE_FILE);
  let body: string;

  try {
    body = await readFile(path, 'utf8');
  } catch (error) {
    return errorCodeOf(error) === ABSENT_CODE
      ? { outcome: 'absent' }
      : malformed(path, error);
  }

  return parseEnvelope(path, id, body);
}

function parseEnvelope(
  path: string,
  expectedId: SessionId,
  body: string,
): EnvelopeRead {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return malformed(path, error);
  }

  const version = versionIn(parsed);
  if (version !== SCHEMA_VERSION) {
    return wrongVersion(path, version);
  }

  const envelope = envelopeBodySchema.safeParse(parsed);
  if (!envelope.success) {
    return malformed(path, envelope.error);
  }
  if (envelope.data.id !== expectedId) {
    return wrongIdentifier(path, envelope.data.id, expectedId);
  }

  return { outcome: 'read', envelope: envelope.data };
}

function versionIn(parsed: unknown): unknown {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'schemaVersion' in parsed
  ) {
    return parsed.schemaVersion;
  }
  return undefined;
}

function malformed(path: string, cause: unknown): EnvelopeRead {
  return {
    outcome: 'unreadable',
    failure: new Error(
      `Cannot read the session at ${path}: its body is not a session envelope`,
      { cause },
    ),
  };
}

function wrongVersion(path: string, found: unknown): EnvelopeRead {
  return {
    outcome: 'unreadable',
    failure: new Error(
      `Cannot read the session at ${path}: it declares schemaVersion ${describeVersion(found)}, and this store reads ${describeVersion(SCHEMA_VERSION)}`,
    ),
  };
}

function wrongIdentifier(
  path: string,
  found: string,
  expected: SessionId,
): EnvelopeRead {
  return {
    outcome: 'unreadable',
    failure: new Error(
      `Cannot read the session at ${path}: it carries the identifier ${JSON.stringify(found)}, and its directory is named ${JSON.stringify(expected)}`,
    ),
  };
}

function describeVersion(found: unknown): string {
  return found === undefined ? 'undefined' : JSON.stringify(found);
}

function errorCodeOf(error: unknown): string | undefined {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return undefined;
}

/**
 * Whether an identifier can name one directory directly under the root.
 *
 * `<root>/<id>` stays inside `<root>` only for an identifier that is a single
 * path segment: not empty, not `.` or `..`, and free of `/`, `\`, and a NUL
 * byte. `save`, `load`, and `list` all check it, so the three methods agree on
 * which identifiers can exist.
 */
function isStorableIdentifier(id: string): boolean {
  return (
    id.length > 0 &&
    id !== '.' &&
    id !== '..' &&
    !id.includes('/') &&
    !id.includes('\\') &&
    !id.includes('\0')
  );
}

function unstorableIdentifier(id: string): Error {
  return new Error(
    `Cannot store a session under the identifier ${JSON.stringify(id)}: an identifier must be a single path segment, so it may not be empty, be "." or "..", or contain "/", "\\", or a NUL byte`,
  );
}

function unwritableSession(directory: string, cause: unknown): Error {
  return new Error(
    `Cannot save the session at ${directory}: its revision could not be written`,
    { cause },
  );
}

function unlistableRoot(rootDir: string, cause: unknown): Error {
  return new Error(
    `Cannot list the sessions under ${rootDir}: its directory could not be read`,
    { cause },
  );
}

function toEnvelope<TState>(session: StoredSession<TState>): SessionEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    state: session.state,
  };
}

function toStoredSession<TState>(
  envelope: EnvelopeBody,
): StoredSession<TState> {
  return {
    id: envelope.id,
    createdAt: new Date(envelope.createdAt),
    updatedAt: new Date(envelope.updatedAt),
    // The store validates the envelope it owns and never the state it does not.
    state: envelope.state as TState,
  };
}

function toTranscript<TState>(session: StoredSession<TState>): string {
  return [
    `# Session ${session.id}`,
    '',
    `- Created: ${session.createdAt.toISOString()}`,
    `- Updated: ${session.updatedAt.toISOString()}`,
    '',
  ].join('\n');
}

interface RevisionFile {
  readonly name: string;
  readonly body: string;
}

interface StagedFile {
  readonly temporaryPath: string;
  readonly targetPath: string;
}

/**
 * Replaces a session's two files with one revision, or commits neither.
 *
 * Every file is written beside its target under a temporary name and made
 * durable before the first rename runs, so a failure up to that point commits
 * nothing and the previous revision stays exactly as the last successful save
 * left it — which is the promise a plain write onto the target cannot make.
 * `session.json` is renamed first, so the one residue a failure between the two
 * renames can leave is a transcript that lags the state it describes, never a
 * transcript describing a revision the store never committed. The directory
 * itself is deliberately not synced afterwards: a lost rename leaves the
 * previous revision whole, which is what a save that never ran leaves too.
 */
async function commitRevision(
  directory: string,
  envelope: string,
  transcript: string,
): Promise<void> {
  const files: readonly RevisionFile[] = [
    { name: ENVELOPE_FILE, body: envelope },
    { name: TRANSCRIPT_FILE, body: transcript },
  ];
  const staged: StagedFile[] = [];

  try {
    for (const file of files) {
      const stagedFile = {
        temporaryPath: join(
          directory,
          `${file.name}.${randomUUID()}${STAGING_SUFFIX}`,
        ),
        targetPath: join(directory, file.name),
      };
      staged.push(stagedFile);
      await stageDurably(stagedFile.temporaryPath, file.body);
    }

    for (const stagedFile of staged) {
      await rename(stagedFile.temporaryPath, stagedFile.targetPath);
    }
  } catch (error) {
    await discardStaged(staged);
    throw error;
  }
}

/**
 * Writes one staged file and returns only once its bytes are on the disk
 * itself.
 *
 * The sync is the store's durability barrier: without it a rename can reach
 * the disk before the bytes it commits, leaving a truncated file under a name
 * the store promises is readable. Releasing the handle never speaks over that
 * barrier. Once the write or the sync has failed, the release is let go,
 * because the error already in hand is the one that names the fault; a handle
 * whose bytes reached the disk is released ordinarily, so a release that fails
 * there is itself the fault and stops the rename that would otherwise commit a
 * file the store could not finish.
 */
async function stageDurably(path: string, body: string): Promise<void> {
  const handle = await open(path, 'w', FILE_MODE);

  try {
    await handle.writeFile(body, 'utf8');
    await handle.sync();
  } catch (error) {
    await ignoringFailure(handle.close());
    throw error;
  }

  await handle.close();
}

/**
 * Removes what a failed revision staged, and never speaks for it.
 *
 * The caller already holds the rejection that names the fault, so a removal
 * that fails is let go rather than thrown over it — the very refusal that
 * failed the save, a session directory that permits no write, is also the one
 * that can fail the removal. A temporary file left behind is inert: neither
 * `load` nor `list` ever reads one.
 */
async function discardStaged(staged: readonly StagedFile[]): Promise<void> {
  for (const stagedFile of staged) {
    await ignoringFailure(rm(stagedFile.temporaryPath, { force: true }));
  }
}

function ignoringFailure(step: Promise<unknown>): Promise<unknown> {
  return step.catch(() => undefined);
}

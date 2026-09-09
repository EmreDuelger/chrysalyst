import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import type { SessionStorePort, StoredSession } from '@chrysalyst/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFilesystemSessionStore,
  sessionStoreConfigFromEnv,
} from './filesystem-session-store.ts';

/*
 * `node:fs/promises` is mocked so the write path can be watched and
 * interrupted: `record-order` observes the order of `sync` and `rename`, and
 * the two failing modes interrupt the second file's handle at its write or at
 * its sync. `closeFails` and `removalFails` compose with those, so a test can
 * make the release of a handle or the cleanup of a staged file fail on top of
 * the fault that is already being reported. Every other test runs in
 * `passthrough` mode, where `open` hands back the real handle untouched and
 * the wrappers add nothing.
 */
type WritePathInjection =
  | 'passthrough'
  | 'record-order'
  | 'handle-fails-mid-write'
  | 'handle-fails-at-sync';

interface FsControl {
  mode: WritePathInjection;
  opened: number;
  events: string[];
  closeFails: boolean;
  removalFails: boolean;
}

const fsControl = vi.hoisted<FsControl>(() => ({
  mode: 'passthrough',
  opened: 0,
  events: [],
  closeFails: false,
  removalFails: false,
}));

const FAILING_HANDLE_ORDINAL = vi.hoisted(() => 2);

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    async open(path: string, flags: string, mode: number) {
      const handle = await actual.open(path, flags, mode);
      if (fsControl.mode === 'passthrough') {
        return handle;
      }
      fsControl.opened += 1;
      const failing = fsControl.opened === FAILING_HANDLE_ORDINAL;
      return {
        async writeFile(data: string, encoding: BufferEncoding) {
          if (failing && fsControl.mode === 'handle-fails-mid-write') {
            throw new Error('injected mid-write failure on the second file');
          }
          await handle.writeFile(data, encoding);
        },
        async sync() {
          fsControl.events.push('sync');
          await handle.sync();
          if (failing && fsControl.mode === 'handle-fails-at-sync') {
            throw new Error('injected sync failure on the second file');
          }
        },
        async close() {
          await handle.close();
          if (failing && fsControl.closeFails) {
            throw new Error('injected close failure on the second file');
          }
        },
      };
    },
    async rename(from: string, to: string) {
      if (fsControl.mode !== 'passthrough') {
        fsControl.events.push('rename');
      }
      await actual.rename(from, to);
    },
    async rm(path: string, options?: Parameters<typeof actual.rm>[1]) {
      if (fsControl.removalFails) {
        throw new Error('injected removal failure');
      }
      await actual.rm(path, options);
    },
  };
});

const POSIX_MODE_MASK = 0o777;

/*
 * Every scenario runs against a fresh sandbox from `mkdtemp`. The store's root
 * is one level below that sandbox — a path the store creates on its first save —
 * so a root-mode assertion measures what the store did rather than the `0o700`
 * `mkdtemp` already hands back.
 */
let sandbox: string;
let storeRoot: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-session-store-'));
  storeRoot = join(sandbox, 'store');
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function storedSession(
  overrides: Partial<StoredSession<{ title: string }>> = {},
): StoredSession<{ title: string }> {
  return {
    id: 'session-1',
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-02-14T17:45:00.000Z'),
    state: { title: 'Eine vage Produktidee' },
    ...overrides,
  };
}

async function plantEnvelope(id: string, body: string): Promise<string> {
  const directory = join(storeRoot, id);
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'session.json');
  await writeFile(path, body, 'utf8');
  return path;
}

async function plantDirectoryWithoutEnvelope(id: string): Promise<string> {
  const directory = join(storeRoot, id);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function plantLooseFile(name: string): Promise<string> {
  await mkdir(storeRoot, { recursive: true });
  const path = join(storeRoot, name);
  await writeFile(path, 'loose', 'utf8');
  return path;
}

async function rejectionOf(call: Promise<unknown>): Promise<Error> {
  try {
    await call;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

describe('filesystem-session-store test harness', () => {
  it('opens a sandbox and leaves the store root for the store to create', async () => {
    expect((await stat(sandbox)).isDirectory()).toBe(true);
    await expect(stat(storeRoot)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('produces a fixture whose createdAt and updatedAt differ', () => {
    const session = storedSession();

    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.updatedAt).toBeInstanceOf(Date);
    expect(session.createdAt.getTime()).not.toBe(session.updatedAt.getTime());
  });

  it('plants a session.json body, a directory without one, and a loose file', async () => {
    const envelope = await plantEnvelope('planted', '{"note":"arbitrary"}');
    expect(envelope).toBe(join(storeRoot, 'planted', 'session.json'));
    expect((await stat(envelope)).isFile()).toBe(true);
    await expect(readFile(envelope, 'utf8')).resolves.toBe(
      '{"note":"arbitrary"}',
    );

    const bareDirectory = await plantDirectoryWithoutEnvelope('empty-session');
    expect((await stat(bareDirectory)).isDirectory()).toBe(true);
    await expect(
      stat(join(bareDirectory, 'session.json')),
    ).rejects.toHaveProperty('code', 'ENOENT');

    const loose = await plantLooseFile('.DS_Store');
    expect((await stat(loose)).isFile()).toBe(true);
    expect((await stat(loose)).isDirectory()).toBe(false);
  });
});

describe('createFilesystemSessionStore save', () => {
  it('writes session.json as a schemaVersion 1 envelope with ISO timestamps, owner-only', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const session = storedSession({ id: 'session-1' });

    await store.save(session);

    const sessionDirectory = join(storeRoot, 'session-1');
    const envelopePath = join(sessionDirectory, 'session.json');
    const parsed = JSON.parse(await readFile(envelopePath, 'utf8')) as Record<
      string,
      unknown
    >;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.id).toBe('session-1');
    expect(parsed.createdAt).toBe(session.createdAt.toISOString());
    expect(parsed.updatedAt).toBe(session.updatedAt.toISOString());
    expect(parsed.state).toEqual({ title: 'Eine vage Produktidee' });

    if (process.platform !== 'win32') {
      // Windows reports a mode that does not describe POSIX permission bits.
      expect((await stat(storeRoot)).mode & POSIX_MODE_MASK).toBe(0o700);
      expect((await stat(sessionDirectory)).mode & POSIX_MODE_MASK).toBe(0o700);
      expect((await stat(envelopePath)).mode & POSIX_MODE_MASK).toBe(0o600);
      expect(
        (await stat(join(sessionDirectory, 'transcript.md'))).mode &
          POSIX_MODE_MASK,
      ).toBe(0o600);
    }
  });

  it('writes a transcript header beside the state and rewrites it for a later revision', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const first = storedSession({ id: 'session-2' });

    await store.save(first);

    const transcriptPath = join(storeRoot, 'session-2', 'transcript.md');
    const firstBody = await readFile(transcriptPath, 'utf8');

    expect(firstBody.trimStart().startsWith('#')).toBe(true);
    expect(firstBody).toContain('session-2');
    expect(firstBody).toContain(first.createdAt.toISOString());
    expect(firstBody).toContain(first.updatedAt.toISOString());
    expect(firstBody).not.toContain(first.state.title);

    const later = storedSession({
      id: 'session-2',
      updatedAt: new Date('2026-05-20T09:15:00.000Z'),
    });

    await store.save(later);

    const secondBody = await readFile(transcriptPath, 'utf8');

    expect(secondBody).toContain(later.updatedAt.toISOString());
    expect(secondBody).not.toContain(first.updatedAt.toISOString());
  });

  it('syncs both staged files before it renames either into place', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });

    fsControl.mode = 'record-order';
    fsControl.opened = 0;
    fsControl.events = [];
    try {
      await store.save(storedSession({ id: 'ordered' }));
    } finally {
      fsControl.mode = 'passthrough';
    }

    expect(fsControl.events).toEqual(['sync', 'sync', 'rename', 'rename']);
  });
});

describe('createFilesystemSessionStore load', () => {
  it('round-trips a session through a root it creates on first save', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const session = storedSession({ id: 'round-trip' });

    await store.save(session);
    const loaded = await store.load('round-trip');

    expect(loaded).toEqual(session);
    expect(loaded?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.updatedAt).toBeInstanceOf(Date);
    expect((await stat(storeRoot)).isDirectory()).toBe(true);
    expect((await stat(join(storeRoot, 'round-trip'))).isDirectory()).toBe(
      true,
    );
  });

  it('replaces an earlier revision and leaves no temporary file behind', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });

    await store.save(
      storedSession({ id: 'revised', state: { title: 'Erste Fassung' } }),
    );
    const second = storedSession({
      id: 'revised',
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      state: { title: 'Zweite Fassung' },
    });

    await store.save(second);

    await expect(store.load('revised')).resolves.toEqual(second);
    expect((await readdir(join(storeRoot, 'revised'))).sort()).toEqual([
      'session.json',
      'transcript.md',
    ]);
  });

  it("returns a Date nested in the state as an ISO string while reviving the envelope's own timestamps", async () => {
    interface StateWithDate {
      readonly label: string;
      readonly noticedAt: Date;
    }
    const store = createFilesystemSessionStore<StateWithDate>({
      rootDir: storeRoot,
    });
    const noticedAt = new Date('2026-04-01T12:00:00.000Z');
    const session: StoredSession<StateWithDate> = {
      id: 'nested-date',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      state: { label: 'Discovery', noticedAt },
    };

    await store.save(session);
    const loaded = await store.load('nested-date');

    const revived = loaded?.state.noticedAt as unknown;
    expect(revived).toBe(noticedAt.toISOString());
    expect(revived).not.toBeInstanceOf(Date);
    expect(loaded?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.updatedAt).toBeInstanceOf(Date);
    expect(loaded?.createdAt).toEqual(session.createdAt);
    expect(loaded?.updatedAt).toEqual(session.updatedAt);
  });

  it('resolves undefined for an unsaved id and for an absent root without creating either', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });

    await store.save(storedSession({ id: 'present' }));

    await expect(store.load('never-saved')).resolves.toBeUndefined();
    await expect(stat(join(storeRoot, 'never-saved'))).rejects.toHaveProperty(
      'code',
      'ENOENT',
    );

    const absentRoot = join(sandbox, 'no-such-root');
    const overAbsentRoot = createFilesystemSessionStore<{ title: string }>({
      rootDir: absentRoot,
    });

    await expect(overAbsentRoot.load('anything')).resolves.toBeUndefined();
    await expect(stat(absentRoot)).rejects.toHaveProperty('code', 'ENOENT');
  });
});

const ISO = '2026-01-01T00:00:00.000Z';

interface DamagedCase {
  readonly label: string;
  readonly id: string;
  readonly plant: (directory: string) => Promise<void>;
  readonly carriesCause: boolean;
  readonly names: readonly string[];
}

const damagedCases: readonly DamagedCase[] = [
  {
    label: 'a body that is not valid JSON',
    id: 'bad-json',
    plant: (directory) =>
      writeFile(join(directory, 'session.json'), 'not json at all', 'utf8'),
    carriesCause: true,
    names: [],
  },
  {
    label: 'a body missing state',
    id: 'no-state',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'no-state',
          createdAt: ISO,
          updatedAt: ISO,
        }),
        'utf8',
      ),
    carriesCause: true,
    names: [],
  },
  {
    label: 'a body whose updatedAt is not a datetime',
    id: 'bad-timestamp',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'bad-timestamp',
          createdAt: ISO,
          updatedAt: 'demnächst',
          state: {},
        }),
        'utf8',
      ),
    carriesCause: true,
    names: [],
  },
  {
    label: 'schemaVersion 2',
    id: 'version-2',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: 2,
          id: 'version-2',
          createdAt: ISO,
          updatedAt: ISO,
          state: {},
        }),
        'utf8',
      ),
    carriesCause: false,
    names: ['2', '1'],
  },
  {
    label: 'schemaVersion "1"',
    id: 'version-string',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: '1',
          id: 'version-string',
          createdAt: ISO,
          updatedAt: ISO,
          state: {},
        }),
        'utf8',
      ),
    carriesCause: false,
    names: ['"1"', '1'],
  },
  {
    label: 'schemaVersion 1.5',
    id: 'version-fraction',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: 1.5,
          id: 'version-fraction',
          createdAt: ISO,
          updatedAt: ISO,
          state: {},
        }),
        'utf8',
      ),
    carriesCause: false,
    names: ['1.5', '1'],
  },
  {
    label: 'an id disagreeing with its directory name',
    id: 'mismatch',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'other',
          createdAt: ISO,
          updatedAt: ISO,
          state: {},
        }),
        'utf8',
      ),
    carriesCause: false,
    names: ['other', 'mismatch'],
  },
  {
    label: 'a session.json planted as a directory',
    id: 'is-a-directory',
    plant: (directory) => mkdir(join(directory, 'session.json')),
    carriesCause: true,
    names: [],
  },
  {
    label: 'a body with no schemaVersion key',
    id: 'no-version',
    plant: (directory) =>
      writeFile(
        join(directory, 'session.json'),
        JSON.stringify({
          id: 'no-version',
          createdAt: ISO,
          updatedAt: ISO,
          state: {},
        }),
        'utf8',
      ),
    carriesCause: false,
    names: ['undefined', '1'],
  },
  {
    label: 'a body that is valid JSON but not an object',
    id: 'not-an-object',
    plant: (directory) =>
      writeFile(join(directory, 'session.json'), '[]', 'utf8'),
    carriesCause: false,
    names: ['undefined', '1'],
  },
];

describe('createFilesystemSessionStore load over a damaged session file', () => {
  it.each(damagedCases)(
    'rejects a load over $label, naming the path',
    async ({ id, plant, carriesCause, names }) => {
      const store = createFilesystemSessionStore({ rootDir: storeRoot });
      const directory = join(storeRoot, id);
      await mkdir(directory, { recursive: true });
      await plant(directory);

      const failure = await rejectionOf(store.load(id));

      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).toContain(join(directory, 'session.json'));
      if (carriesCause) {
        expect(failure.cause).toBeDefined();
      } else {
        expect(failure.cause).toBeUndefined();
      }
      for (const name of names) {
        expect(failure.message).toContain(name);
      }
    },
  );
});

describe('createFilesystemSessionStore list', () => {
  it('lists only readable sessions in sorted order and answers an absent root with an empty array', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });

    await store.save(storedSession({ id: 'gamma' }));
    await store.save(storedSession({ id: 'alpha' }));
    await store.save(storedSession({ id: 'beta' }));
    await plantDirectoryWithoutEnvelope('no-envelope');
    await plantEnvelope('damaged', 'not a session envelope at all');
    await plantLooseFile('loose.txt');

    await expect(store.list()).resolves.toEqual(['alpha', 'beta', 'gamma']);

    const overAbsentRoot = createFilesystemSessionStore<{ title: string }>({
      rootDir: join(sandbox, 'no-such-root'),
    });

    await expect(overAbsentRoot.list()).resolves.toEqual([]);
  });

  it('rejects a listing whose root cannot be read', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    await writeFile(storeRoot, 'not a directory', 'utf8');

    const failure = await rejectionOf(store.list());

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(storeRoot);
    expect(failure.cause).toBeDefined();
  });
});

const unsafeIdentifiers: readonly string[] = [
  '',
  '.',
  '..',
  'a/b',
  '../escape',
  'a\\b',
  'has nul',
];

describe('createFilesystemSessionStore identifier safety', () => {
  it.each(unsafeIdentifiers.map((id) => ({ id })))(
    'refuses $id, stores nothing, and never loads or lists it',
    async ({ id }) => {
      const store = createFilesystemSessionStore<{ title: string }>({
        rootDir: storeRoot,
      });

      const failure = await rejectionOf(store.save(storedSession({ id })));

      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).toContain(JSON.stringify(id));

      await expect(stat(storeRoot)).rejects.toHaveProperty('code', 'ENOENT');
      await expect(stat(join(sandbox, 'escape'))).rejects.toHaveProperty(
        'code',
        'ENOENT',
      );

      await expect(store.load(id)).resolves.toBeUndefined();
    },
  );

  it('omits a directory whose name is an identifier it would refuse to save', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });

    await plantEnvelope(
      'a\\b',
      JSON.stringify({
        schemaVersion: 1,
        id: 'a\\b',
        createdAt: ISO,
        updatedAt: ISO,
        state: {},
      }),
    );

    await expect(store.list()).resolves.toEqual([]);
  });
});

async function expectSurvivingRevision<T>(
  store: SessionStorePort<T>,
  id: string,
  previous: StoredSession<T>,
): Promise<void> {
  await expect(store.load(id)).resolves.toEqual(previous);
  await expect(store.list()).resolves.toContain(id);
  expect((await readdir(join(storeRoot, id))).sort()).toEqual([
    'session.json',
    'transcript.md',
  ]);
}

describe('createFilesystemSessionStore save that fails', () => {
  it('rejects a failing save, keeps the previous revision loadable, and leaves no temporary file — unserialisable state', async () => {
    const store = createFilesystemSessionStore<{
      title: string;
      huge?: bigint;
    }>({ rootDir: storeRoot });
    const previous: StoredSession<{ title: string; huge?: bigint }> = {
      id: 'survivor',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      state: { title: 'Erste Fassung' },
    };
    await store.save(previous);

    const failure = await rejectionOf(
      store.save({
        ...previous,
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        state: { title: 'Zweite Fassung', huge: 1n },
      }),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(join(storeRoot, 'survivor'));
    await expectSurvivingRevision(store, 'survivor', previous);
  });

  // A run as root ignores the directory mode and would let the write through,
  // reporting a pass this test never proved.
  it.skipIf(process.getuid?.() === 0)(
    'rejects a failing save, keeps the previous revision loadable, and leaves no temporary file — a read-only session directory',
    async () => {
      const store = createFilesystemSessionStore<{ title: string }>({
        rootDir: storeRoot,
      });
      const previous = storedSession({
        id: 'survivor',
        state: { title: 'Erste Fassung' },
      });
      await store.save(previous);

      const sessionDirectory = join(storeRoot, 'survivor');
      await chmod(sessionDirectory, 0o500);
      try {
        const failure = await rejectionOf(
          store.save(
            storedSession({
              id: 'survivor',
              updatedAt: new Date('2026-03-01T00:00:00.000Z'),
              state: { title: 'Zweite Fassung' },
            }),
          ),
        );

        expect(failure).toBeInstanceOf(Error);
        expect(failure.message).toContain(sessionDirectory);
        expect(failure.message).not.toContain('.tmp');
        expect((failure.cause as Error).message).toContain('EACCES');
        await expectSurvivingRevision(store, 'survivor', previous);
      } finally {
        await chmod(sessionDirectory, 0o700);
      }
    },
  );

  it('rejects a failing save, keeps the previous revision loadable, and leaves no temporary file — a handle that fails mid-write', async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const previous = storedSession({
      id: 'survivor',
      state: { title: 'Erste Fassung' },
    });
    await store.save(previous);

    fsControl.mode = 'handle-fails-mid-write';
    fsControl.opened = 0;
    fsControl.events = [];
    try {
      const failure = await rejectionOf(
        store.save(
          storedSession({
            id: 'survivor',
            updatedAt: new Date('2026-03-01T00:00:00.000Z'),
            state: { title: 'Zweite Fassung' },
          }),
        ),
      );

      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).toContain(join(storeRoot, 'survivor'));
      expect((failure.cause as Error).message).toContain(
        'injected mid-write failure',
      );

      expect(fsControl.events).toEqual(['sync']);
    } finally {
      fsControl.mode = 'passthrough';
    }

    await expectSurvivingRevision(store, 'survivor', previous);
  });

  it("keeps the write's own error when removing a staged file also fails", async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const previous = storedSession({
      id: 'survivor',
      state: { title: 'Erste Fassung' },
    });
    await store.save(previous);

    fsControl.mode = 'handle-fails-mid-write';
    fsControl.removalFails = true;
    fsControl.opened = 0;
    fsControl.events = [];
    try {
      const failure = await rejectionOf(
        store.save(
          storedSession({
            id: 'survivor',
            updatedAt: new Date('2026-03-01T00:00:00.000Z'),
            state: { title: 'Zweite Fassung' },
          }),
        ),
      );

      expect((failure.cause as Error).message).toContain(
        'injected mid-write failure',
      );
      expect((failure.cause as Error).message).not.toContain(
        'injected removal failure',
      );
      expect(failure.message).not.toContain('injected removal failure');
    } finally {
      fsControl.mode = 'passthrough';
      fsControl.removalFails = false;
    }

    // The staging this cleanup could not remove is inert: the previous
    // revision still loads and lists, which `expectSurvivingRevision` cannot
    // assert here because its `readdir` equality demands an empty staging.
    await expect(store.load('survivor')).resolves.toEqual(previous);
    await expect(store.list()).resolves.toContain('survivor');
    const leftovers = await readdir(join(storeRoot, 'survivor'));
    expect(leftovers.some((entry) => entry.endsWith('.tmp'))).toBe(true);
  });

  it("keeps the barrier's own error when releasing the handle also fails", async () => {
    const store = createFilesystemSessionStore<{ title: string }>({
      rootDir: storeRoot,
    });
    const previous = storedSession({
      id: 'survivor',
      state: { title: 'Erste Fassung' },
    });
    await store.save(previous);

    fsControl.mode = 'handle-fails-at-sync';
    fsControl.closeFails = true;
    fsControl.opened = 0;
    fsControl.events = [];
    try {
      const failure = await rejectionOf(
        store.save(
          storedSession({
            id: 'survivor',
            updatedAt: new Date('2026-03-01T00:00:00.000Z'),
            state: { title: 'Zweite Fassung' },
          }),
        ),
      );

      expect((failure.cause as Error).message).toContain(
        'injected sync failure',
      );
      expect((failure.cause as Error).message).not.toContain(
        'injected close failure',
      );
    } finally {
      fsControl.mode = 'passthrough';
      fsControl.closeFails = false;
    }

    await expectSurvivingRevision(store, 'survivor', previous);
  });
});

describe('sessionStoreConfigFromEnv', () => {
  it('defaults the root under the home directory and lets CHRYSALYST_SESSION_DIR override it', () => {
    const homeDefault = join(homedir(), '.chrysalyst', 'sessions');

    expect(sessionStoreConfigFromEnv({})).toEqual({ rootDir: homeDefault });
    expect(sessionStoreConfigFromEnv({ CHRYSALYST_SESSION_DIR: '' })).toEqual({
      rootDir: homeDefault,
    });

    const explicit = join(tmpdir(), 'chrysalyst-config-from-env');
    expect(
      sessionStoreConfigFromEnv({ CHRYSALYST_SESSION_DIR: explicit }),
    ).toEqual({ rootDir: explicit });

    const relative = sessionStoreConfigFromEnv({
      CHRYSALYST_SESSION_DIR: 'relative/sessions',
    });
    expect(relative.rootDir).toBe(resolve('relative/sessions'));
    expect(isAbsolute(relative.rootDir)).toBe(true);
  });
});

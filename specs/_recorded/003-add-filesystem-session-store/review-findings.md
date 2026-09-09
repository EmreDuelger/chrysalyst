# Code Review Findings: add-filesystem-session-store

## Summary

- Files reviewed: 5
- Total findings: 5 (standard: 2, expert: 3)

Verification run before review (evidence for the findings below):

| Command | Result |
|---------|--------|
| `pnpm --filter @chrysalyst/server test` | 5 files passed, 47 passed / 1 skipped |
| `pnpm --filter @chrysalyst/core test` | 2 files passed, 13 passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0, no output — `restrict-template-expressions` is clean |
| `vitest run --coverage src/adapters/session-store` | stmts 95.74 %, branches 91.48 %, **functions 22/23**, uncovered lines 70, 221, 268; uncovered function: the `() => undefined` arrow at line 430; uncovered branch: line 257 |

The plan's named risks are met: exactly one `as TState` in the module (line 314) carrying its comment, the version check runs before `envelopeBodySchema` and names both values with `JSON.stringify` (lines 197-201, 234-241), the identifier predicate is single and applied in all three methods, and `'has\0nul'` in the test really carries a NUL byte (verified with `cat -v`). The findings below are about the durability barrier's proof, the two untested failure paths, and one boundary the module translates in one direction only.

## Standard fixes

### packages/server/src/adapters/session-store/filesystem-session-store.test.ts

#### [MISSING_BOUNDARY_TEST] No damaged case carries an absent `schemaVersion`

- Location: `damagedCases`, lines 334-457
- Issue: plan § Requirements § Version check makes "an absent key" one of the four wrong-version inputs that MUST produce the version-mismatch rejection, and § Read policy classifies a body that is valid JSON but not an object the same way. Neither is planted. Coverage proves the gap directly: line 221 (`versionIn`'s `return undefined`) is uncovered and the branch at line 257 (`describeVersion`'s `found === undefined` arm) is uncovered, so nothing in the suite exercises the message `it declares schemaVersion undefined, and this store reads 1`. The seven existing cases all carry a `schemaVersion` key or fail before the check.
- Fix: In `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`, add two entries to the `damagedCases` array. First, `label: 'a body with no schemaVersion key'`, `id: 'no-version'`, planting `JSON.stringify({ id: 'no-version', createdAt: ISO, updatedAt: ISO, state: {} })`. Second, `label: 'a body that is valid JSON but not an object'`, `id: 'not-an-object'`, planting `'[]'`. Give both `carriesCause: false` and `names: ['undefined', '1']`, so each asserts the version-mismatch rejection names the version found and the version expected and carries no `cause`.

### packages/core/src/ports/ports.test.ts

#### [DEAD_FLEXIBILITY] `guardedSessionStore`'s default argument has no caller

- Location: line 65
- Issue: `guardedSessionStore<TState>(unreadable: readonly SessionId[] = [])` declares a default that no call site uses — the double is constructed exactly once, at line 181, with `['session-2']`. A double whose unreadable set is empty is `memorySessionStore`, which already exists in the file, so the default describes a configuration the test file has no use for.
- Fix: In `packages/core/src/ports/ports.test.ts`, remove the `= []` default from `guardedSessionStore`'s `unreadable` parameter so the parameter is required.

## Expert fixes

### packages/server/src/adapters/session-store/filesystem-session-store.test.ts

#### [IMPLEMENTATION_COUPLED_TEST] The barrier assertion never observes a rename, and forces a meaningless `fsync` into production

- Location: test lines 61-67 and 634-671; production `stageDurably`, lines 396-412
- Issue: two coupled defects.

  1. The mock's `rename` wrapper pushes its event only when `fsControl.mode !== 'passthrough'` (line 62), and the sole non-passthrough mode is set in the mid-write failure test — where `commitRevision` throws before the rename loop is ever reached. `'rename'` is therefore never recorded anywhere in the suite: `firstRename` is always `-1`, the slice at line 663 degenerates to the whole array, and `expect(syncsBeforeFirstRename).toHaveLength(2)` reduces to "two syncs happened, and no rename did". The plan's claim for this assertion — "both handles are `sync`ed before the first `rename` runs", § Verification and task 10 — is not what the test proves. The ordering the barrier depends on is never observed.
  2. That count is reachable only because production is shaped around it. The injected failure throws from the **second** handle's `writeFile`, so the second file's success-path `sync` never runs; the only source of a second `'sync'` event is `stageDurably`'s catch block, `await ignoringFailure(handle.sync())` at line 402 — an `fsync` of a partially written temporary file that `discardStaged` deletes moments later. It has no durability meaning, and deleting the line turns the test red although nothing about the barrier changed. The doc comment at lines 390-394 rationalises it as flushing "the same way on both paths", which reads as design intent for what is a test artifact.
  3. The same function's success path, `try { await handle.sync(); } finally { await handle.close(); }` (lines 407-411), lets a `close()` rejection replace a `sync()` rejection — the barrier's own failure is the one error the module most needs to surface, and it is the one that gets masked.
- Fix: In `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`, widen `fsControl.mode` to `'passthrough' | 'record-order' | 'handle-fails-mid-write'` and change the `open` wrapper so it returns the recording handle whenever the mode is not `'passthrough'`, while throwing `injected mid-write failure on the second file` only when the mode is `'handle-fails-mid-write'` and `ordinal === 2`. Add a test to `describe('createFilesystemSessionStore save')` named `syncs both staged files before it renames either into place`: reset `fsControl.opened`/`fsControl.events`, set `mode = 'record-order'`, save one session, restore `'passthrough'` in a `finally`, and assert `expect(fsControl.events).toEqual(['sync', 'sync', 'rename', 'rename'])`. In the mid-write test, replace the whole `firstRename`/`syncsBeforeFirstRename` block with `expect(fsControl.events).toEqual(['sync'])`. Then, in `packages/server/src/adapters/session-store/filesystem-session-store.ts`, rewrite `stageDurably`'s body after `open` as a single `try { await handle.writeFile(body, 'utf8'); await handle.sync(); } finally { await ignoringFailure(handle.close()); }`, deleting the catch block that syncs a handle whose write failed, and rewrite its doc comment so it states that the sync is the durability barrier and that a `close` failure never replaces the write or sync error that named the fault — dropping the claim that both paths flush the handle.

#### [UNTESTED_ERROR_PATH] A cleanup that itself fails is never made to fail

- Location: `discardStaged` and `ignoringFailure`, lines 423-431; test `describe('createFilesystemSessionStore save that fails')`, lines 573-672
- Issue: plan § Requirements § Save failure makes it a MUST that "a cleanup that itself fails MUST NOT replace the original rejection", and the module's doc comment at lines 414-421 states the same policy — but no test would go red if `discardStaged` propagated the removal error over the original. Coverage is conclusive: the module's function coverage is 22/23 and the single uncovered function is the `() => undefined` arrow at line 430, so `ignoringFailure`'s catch never runs in the whole suite. The read-only-directory case does not reach it either: `open` fails before any temporary file exists, so the subsequent `rm(path, { force: true })` sees ENOENT, which `force` ignores. The mid-write case runs in a writable directory, so its removals succeed.
- Fix: In `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`, add a `removalFails: false` field to `fsControl` and an `rm` wrapper to the `node:fs/promises` mock that rejects with `new Error('injected removal failure')` when `fsControl.removalFails` is true and delegates to `actual.rm` otherwise. Add a test to `describe('createFilesystemSessionStore save that fails')` named `keeps the write's own error when removing a staged file also fails`: save a first revision, then set `fsControl.mode = 'handle-fails-mid-write'` and `fsControl.removalFails = true`, attempt a second save through `rejectionOf`, and restore both flags in a `finally`. Assert the rejection reports the injected mid-write failure and never the injected removal failure, then assert the leftover staging is inert — `await expect(store.load('survivor')).resolves.toEqual(previous)` and `await expect(store.list()).resolves.toContain('survivor')` — and that `readdir(join(storeRoot, 'survivor'))` still contains a `.tmp` entry, which is what makes the assertion about the surviving revision meaningful. Do not call `expectSurvivingRevision` here: its `readdir` equality asserts the temporary files were removed, which is exactly what this case prevents.

### packages/server/src/adapters/session-store/filesystem-session-store.ts

#### [LEAKED_PROVIDER_ERROR] `save` and `list` hand the caller a raw `node:fs` error

- Location: `save`, lines 103-114; `list`, lines 62-71
- Issue: the read path translates every failure into this module's own error — `Cannot read the session at <path>: …`, with the underlying error as `cause` (lines 224-254). The write and listing paths do not: a failing `mkdir`, `open`, `writeFile` or `rename` rejects `save` with Node's own `Error & { code }`, and a `readdir` rejection whose code is not `ENOENT` is rethrown unchanged at line 70. Domain code behind `SessionStorePort` then reads a message such as `EACCES: permission denied, open '/home/u/.chrysalyst/sessions/s1/session.json.9f3a….tmp'`, which both hands it the filesystem's error taxonomy and publishes the private staging scheme that the factory's own doc comment (lines 42-57) promises stops at this module's boundary. The guardrails' Errors rule is explicit: translate the provider's error into this module's type at the boundary, and state what was attempted. The `list` half is also untested — v8 reports line 70 uncovered, so no test drives a non-`ENOENT` `readdir` rejection at all.
- Fix: In `packages/server/src/adapters/session-store/filesystem-session-store.ts`, add two private failure builders beside `malformed`: `unwritableSession(directory, cause)` returning `new Error(\`Cannot save the session at ${directory}: …\`, { cause })` and `unlistableRoot(rootDir, cause)` returning `new Error(\`Cannot list the sessions under ${rootDir}: …\`, { cause })`. Wrap everything in `save` after the identifier check — the `JSON.stringify`, the `mkdir` and the `commitRevision` call — in one `try`/`catch` that rethrows through `unwritableSession(directory, error)`, leaving the identifier rejection as it is. Replace `list`'s bare `throw error` at line 70 with `throw unlistableRoot(config.rootDir, error)`, keeping the `ENOENT` arm returning `[]`. Then in `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`, change the two save-failure assertions that read `failure.message` for the injected text — the mid-write test at line 659 and the cleanup test added for `[UNTESTED_ERROR_PATH]` — to read `(failure.cause as Error).message` instead, and add a test to `describe('createFilesystemSessionStore list')` named `rejects a listing whose root cannot be read`: `writeFile(storeRoot, 'not a directory', 'utf8')` after creating the sandbox, then assert `store.list()` rejects with an `Error` whose message contains `storeRoot` and whose `cause` is defined.

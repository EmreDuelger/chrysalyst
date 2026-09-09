# Plan: add-filesystem-session-store

## Summary

Give `SessionStorePort` its first real implementation: a store in `packages/server` that keeps each session as a folder holding a versioned JSON envelope and a Markdown transcript. The root directory is configuration, so tests run against `mkdtemp` directories and production runs against `~/.chrysalyst/sessions`.

## Design

### Context

`SessionStorePort` has existed since the scaffold as a type with no implementation. Roadmap milestone M2 makes it real, and M3's walking skeleton is the first caller — its completion criterion is a `session.json` on disk holding a question, an answer, a timestamp, and a `schemaVersion`. M2 therefore has to settle the on-disk format before any feature writes to it, because every later milestone grows `TState` on top of whatever this plan writes down.

Three forces shape the design. The roadmap fixes the layout (`~/.chrysalyst/sessions/<id>/`, JSON state plus Markdown transcript) and makes `schemaVersion` a standing guardrail from the first write. `platform/core-ports-contract` fixes the boundary: `packages/core` declares no dependency and imports no Node built-in, so the filesystem, the envelope, and `schemaVersion` all live in `packages/server`. And the port itself fixes the contract: three methods, no `delete` — M17 owns that delta when the session library needs it.

The interview settled the two judgement calls the roadmap left open. A present-but-unreadable `session.json` is corruption, not absence, so `load` rejects rather than hiding it behind `undefined`; and `list` skips what it cannot read, because a caller asking what the store holds is not asking about one damaged folder.

- **Goals** — one `SessionStorePort` implementation over a real filesystem; an envelope whose version is written from the first save; `Date` fields that survive the round trip; a store root that is a parameter, so every test is hermetic without touching the user's home; a session tree only its owner can read; a `save` interrupted by a process crash or a power loss that leaves the previous revision loadable, within the bound § Consequences names.
- **Non-Goals** — no `delete`, which M17 owns; no interview content in the transcript and no renderer, which M3 and M15 own; no HTTP route and no construction in `main.ts`, which M3's walking skeleton owns; no migration machinery for a future `schemaVersion`, which the milestone that raises the version owns; no locking or compare-and-swap; no `TState` validation, which the store cannot perform and is not asked to.

### Decision

#### Architecture

One module in `packages/server` owns the fact that a session is a folder on disk. Nothing else in the workspace learns it.

```
┌──────────────┐  imports  ┌──────────────────────────────────────┐
│ @chrysalyst/ │◀──────────│         @chrysalyst/server           │
│     core     │   type    │                                      │
│ SessionStore │           │  adapters/session-store/             │
│    Port      │           │    filesystem-session-store.ts       │
│  (declares)  │           │      ├ save ─┐                       │
│  StoredSess. │           │      ├ load ─┼─ node:fs/promises     │
└──────────────┘           │      └ list ─┘   zod (envelope only) │
                           └──────────────────┬───────────────────┘
                                              │
                                              ▼
                        <rootDir>/<id>/session.json   ← versioned envelope
                        <rootDir>/<id>/transcript.md  ← metadata stub
```

The module exports two functions: `createFilesystemSessionStore(config)` returning a `SessionStorePort<TState>`, and `sessionStoreConfigFromEnv(env)` resolving the root directory. The second is the composition seam — the only place `~/.chrysalyst/sessions` is written down — and it mirrors `llmConfigFromEnv` from `002-add-ollama-llm-adapter`, so the two adapters are configured the same way.

`save`, `load`, and `list` share one private read that returns the envelope or names why it could not. `load` and `list` then apply opposite policies to that one result: `load` rethrows what the read refused, `list` drops it. That is the asymmetry the interview asked for, and it lives in the two public methods rather than in two readers, so the file format has exactly one owner.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Adapter behind a port | `filesystem-session-store.ts` implements `SessionStorePort<TState>` | The domain keeps its vocabulary; the directory layout, the envelope, and `schemaVersion` stop at the module boundary |
| Root directory as a parameter, not a constant | `config.rootDir` | The same seam that lets production point at `~/.chrysalyst/sessions` lets every test point at a `mkdtemp` directory. The happy path and the two real-filesystem failure injections need no mock filesystem, and none can corrupt the user's sessions; only the cleanup path, the staging order, and the `fsync` barrier need one, and all three are reached through a single targeted `fs` mock in task 10 |
| Versioned envelope around opaque state | `{ schemaVersion, id, createdAt, updatedAt, state }` | The store validates what it owns and passes through what it does not. `TState` grows through M8, M9, and M14 without the envelope changing; when the envelope does change, the version is already on disk to branch on |
| Stage both files, sync both, then rename both | `save` writes `<name>.<uuid>.tmp` beside each target, `fsync`s its handle, then renames each onto its target | `rename` within one directory replaces the target in one step, so no `load` ever sees a torn file. Decision `[5]` argues the staging; decision `[10]` argues the barrier and the crash classes it covers |
| Owner-only modes, set at creation | `mkdir(…, { mode: 0o700 })`; every file opened with mode `0o600` | A session holds unpublished product ideas. Decision `[11]` argues why the store fixes the mode rather than inheriting the umask |
| One read, two policies | private reader; `load` rethrows, `list` skips | The decision about how a session file is read has one home. The difference between the two callers is a question about their contracts, not about the format |
| Identifier as a single path segment | one predicate, checked by `save`, `load`, and `list` | An identifier is a directory name. Refusing `..`, `.`, the empty string, and separators is what keeps `<root>/<id>` inside `<root>`, and applying it in `list` too keeps the three methods agreeing about which identifiers exist |
| Deterministic listing | `list` sorts ascending | `readdir` order is filesystem-defined. Sorting removes a class of tests that pass on one machine and fail on another, and costs one call |

#### Key interfaces

```ts
export interface FilesystemSessionStoreConfig {
  readonly rootDir: string;
}

export function createFilesystemSessionStore<TState>(
  config: FilesystemSessionStoreConfig,
): SessionStorePort<TState>;

export function sessionStoreConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FilesystemSessionStoreConfig;
```

No new type crosses into `@chrysalyst/core`. `SessionStorePort`, `StoredSession`, and `SessionId` are imported as types and are not changed — in particular, `StoredSession` gains no `schemaVersion` field, because the version describes the file the store writes and not the session the domain holds.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| A damaged `session.json` rejects; a missing one resolves to `undefined` | Returning `undefined` for both; returning `undefined` for an unrecognised `schemaVersion` while rejecting a parse error | Absence and corruption are different facts and a caller acts differently on each. Collapsing them would have M3's walking skeleton silently start a fresh interview over a session whose file it failed to read. The interview rejected the forward-compatible split explicitly: an unrecognised version rejects like any other unreadable body |
| `list` skips what `load` rejects | Failing the whole listing over one damaged folder; validating only that `session.json` parses | A session library that cannot be opened because one folder is damaged is worse than one that shows the sessions it can read. `list` reuses the full read rather than a weaker one, so an identifier it reports is one `load` will answer |
| `schemaVersion` lives in the envelope, not on `StoredSession` | Adding the field to the port's type in `@chrysalyst/core` | `platform/core-ports-contract` forbids the filesystem in `core`, and the version is a fact about the file. A hosted store (P1) writes no `session.json` and would carry a field that means nothing to it |
| `schemaVersion` is the number `1` | A string such as `"1.0"`; the package version | An integer that increments when the envelope's shape changes is the smallest thing a future reader can branch on. Tying it to the package version would bump it on releases that change no format |
| The transcript is written now, as a metadata stub | Deferring the file to M3, when there is content to render | The roadmap promises a Markdown transcript per session from M2. Writing the file now fixes its name and location while nothing depends on its body, so M3 replaces a body rather than introducing a file. § Impact records the matching roadmap correction |
| `session.json` is renamed into place before `transcript.md` | Renaming the transcript first | The transcript is a derived view, so lagging is the survivable side of the residue. Decision `[4]` argues it |
| Both files are staged as temporary files, then renamed | A plain `writeFile`; renaming each file as soon as it is written | Renaming only after both files are written is what lets `save` promise the previous revision stays loadable. Decision `[5]` argues it |
| Each temporary file is `fsync`ed before its rename; the directory is not | No barrier at all; also syncing the session directory after each rename | The barrier is what extends the guarantee from a process crash to a power loss. Decision `[10]` argues both halves and names the residual window |
| Every directory the store creates is `0o700` and every file `0o600` | Inheriting the process umask, which yields `0o755` and `0o644` on a default Linux install | Sessions hold unpublished product ideas, and the store is the only writer, so it names the mode. Decision `[11]` argues it |
| A failed second rename is not undone | Restoring the previous `session.json` from a backup copy | Staging narrows the window to one point: the gap between the two renames, where the new `session.json` is already committed and the new `transcript.md` is not. Rolling that back needs a copy of the previous `session.json` and a rollback that can itself fail, which trades a bounded residue for an unbounded failure path. Renaming `session.json` first is what makes the residue survivable — the store is left with a committed revision and a transcript that lags it, the state decision `[4]` already accepts as ordinary, rather than a transcript describing a revision the store never committed |
| `zod` validates the envelope | A hand-written type guard, as `isModelList` already is in the LLM adapter | `zod` is already a declared dependency of `packages/server`, so this adds nothing to the tree. It reports which field failed, which is what the rejection message has to name, and `z.iso.datetime()` closes the hole a hand-written guard usually leaves open — `new Date('garbage')` yields `Invalid Date` silently rather than throwing |
| The version is checked before the `zod` object runs, which carries no `schemaVersion` field | Typing `schemaVersion` as an integer inside the object and checking its value afterwards | Only the earlier check names both versions for every wrong value. Behind the object, `"2"` and `1.5` fail as a field error naming neither. Decision `[7]` argues it |
| The state is cast, never validated | Accepting a `parseState` validator in the config | The store is generic over `TState` and cannot know its shape. A validator parameter is a decision the module would be declining to make, for a caller that does not exist: no feature before M9 has a state schema to hand it |
| The identifier predicate is traversal-safety only | Also rejecting characters that are illegal on Windows | One rule that answers the same way on every platform beats a rule that accepts an identifier on Linux and refuses it on Windows. Identifiers are generated by chrysalyst, not typed by users; M3 picks the format and SHOULD pick from the safe set |
| No locking; concurrent saves are last-writer-wins | A lockfile or a compare-and-swap parameter on `save` | The port declares no such parameter, so a store cannot report a conflict to anyone. `rename` already guarantees no reader sees a torn file, which is the failure mode that matters for a single-user local app |

## Features

| Feature | Status | Spec |
|---------|--------|------|
| filesystem-session-store | NEW | `adapters/filesystem-session-store/spec.md` |
| session-store-port | CHANGED | `platform/session-store-port/spec.md` |

`filesystem-session-store` joins the `adapters/` domain that `002-add-ollama-llm-adapter` opened, which is the home `decision-log [8]` of that plan reserved for it. `platform/` stays at eight features and `adapters/` reaches two, so neither trips the `/speq:spec-merge` domain threshold at record time. The new spec carries eleven scenarios, one over `/speq:spec-merge`'s ten-scenario signal, so `/speq:record` asks the user whether to split the feature. That question is the point of the signal; the eleven scenarios each describe a distinct behaviour and none is merged away to avoid it.

`platform/core-ports-contract` needs no delta. Its "Core carries no runtime dependency" scenario asserts that `packages/core`'s manifest declares no `dependencies` and that its non-test source imports no Node built-in and no third-party module; this plan adds no file to `packages/core` and changes none, so the assertion holds unchanged. Its Background sentence — `@chrysalyst/core` "holds type declarations only: no port implementation, no adapter" — is scoped to the package, not to the port, and stays true while an adapter lands in `packages/server`.

## Impact

No behaviour reaches an end user. The store has no HTTP route and is not constructed in `main.ts`; its only callers are its tests until M3 mounts the walking skeleton. `pnpm dev` and `GET /health` are unchanged, and no existing session data exists to migrate.

Contributors gain no dependency. `zod` is already declared in `packages/server`, and everything else the store uses is a Node built-in, so `pnpm install` produces no lockfile change.

Operators gain one environment variable. `CHRYSALYST_SESSION_DIR` overrides the store's root; unset, the root is `.chrysalyst/sessions` under the current user's home directory. Nothing creates that directory until the first `save`, so an installation that never saves a session leaves no trace in the home directory. Everything the store creates is owner-only — `0o700` for directories, `0o600` for files — so no other account on a shared machine reads a session.

Three edits fall outside the spec deltas, because `/speq:record` merges deltas and nothing else:

- `specs/platform/session-store-port/spec.md` § Background — `/speq:record` MUST replace the Background paragraph with the delta's version, because the delta-marker table defines `DELTA:CHANGED` for scenarios only. The new text drops the claim that `SessionStorePort` has no adapter, which this plan falsifies. The delta's scenario block carries a `DELTA:NEW` marker and merges mechanically; the delta carries neither existing scenario, both of which are unchanged and keep their existing tests.
- `packages/core/src/ports/session-store.ts` — the `load` doc comment promises only that a stale link "is an ordinary outcome, not a failure" and names no rejection path. The port's new scenario makes rejection over a present-but-unreadable record a MUST, so task 13 amends the comment to name both outcomes. `/speq:record` merges spec deltas and touches no source, so the edit belongs to implementation.
- `specs/roadmap.md` § M2 — two corrections. The `**Pläne:**` line names its plan `filesystem-session-store`, while this plan is `add-filesystem-session-store`; the reference is corrected so the milestone still points at the plan after `/speq:record` archives it. The `**Fertig, wenn:**` clause lists only `session.json`, while `**Liefert:**` promises a transcript, so a reader cannot tell the transcript is in M2's scope; task 14 adds the transcript stub to the completion criterion. Task 14 changes nothing else, and in particular does not touch M2's `⬜ offen` status in the § Überblick table — `CLAUDE.md` assigns that update to `/speq:record`.

`TState` must survive a JSON round trip, the constraint the adapter spec's § Background states and its `State the store cannot serialise does not survive the round trip` scenario demonstrates; M3 picks the concrete `TState` and inherits it.

`list` reads every session file it finds, because an identifier it reports must be one `load` will answer. The cost grows with the number of stored sessions. M17's session library wants per-session metadata in the listing anyway, so the milestone that feels the cost is also the one holding the reason to change the shape.

## Requirements

| Requirement | Details |
|-------------|---------|
| Module location | `packages/server/src/adapters/session-store/filesystem-session-store.ts`, beside the existing `adapters/llm/` directory |
| On-disk layout | `<rootDir>/<id>/session.json` and `<rootDir>/<id>/transcript.md`. Both are UTF-8. `save` creates `<rootDir>/<id>` with `mkdir(..., { recursive: true, mode: 0o700 })`, which creates the root in the same call and resolves for a directory that already exists |
| Permissions | Every directory the store creates is `0o700` and every file it creates is `0o600`. `mkdir(..., { recursive: true, mode: 0o700 })` applies the mode to every level it creates, including the root. Each temporary file is opened with mode `0o600`, because `rename` preserves the mode and the temporary file is the one being created. Verified: a `0o022` umask masks neither mode, `mkdir` leaves an existing directory's mode alone, and a mode reaches a file only on creation. A test asserting the root's mode MUST point the store at a path the store creates, because `mkdtemp` already yields `0o700` |
| Envelope | `{ schemaVersion, id, createdAt, updatedAt, state }`. `schemaVersion` is the number `1`, held as a module constant. `createdAt` and `updatedAt` are `Date.prototype.toISOString()` output. `state` is the caller's `TState`, serialised by `JSON.stringify` and never inspected |
| Envelope validation | A `zod` object over the four fields the version check does not own: `id` a non-empty string, both timestamps `z.iso.datetime()`, `state` `z.unknown()`. `schemaVersion` is deliberately absent from the object — the version check has already accepted it, so a `z.number().int()` there would be redundant and would only add a second message for the same fault. Verified against `zod@4.5.4`: `z.unknown()` rejects an absent key, so a truncated envelope cannot pass as `state: undefined`. `TState` MUST therefore serialise to a defined JSON value |
| Version check | The version is read from the parsed JSON **before** the envelope schema runs. Any `schemaVersion` other than the number `1` — a string, a non-integer, a different integer, or an absent key — produces the version-mismatch rejection naming the version found and the version expected. Ordering the check first is what makes that message reachable: run the schema first and `"2"` or `1.5` would fail as a `zod` field error naming neither value. Do not express the check as `z.literal(1)`, whose message names neither value either |
| Timestamp revival | `load` returns `new Date(iso)` for both timestamps. `z.iso.datetime()` has already rejected a string that would produce an `Invalid Date` |
| State opacity | The state reaches `StoredSession<TState>` through exactly one `as TState` assertion, carrying a comment that the store validates the envelope it owns and never the state it does not. No other assertion in the module |
| Identifier safety | One predicate rejects an identifier that is empty, is `.`, is `..`, or contains `/`, `\`, or a NUL byte. `save` rejects such an identifier with an `Error` naming it, before touching the filesystem. `load` resolves to `undefined` for one, reading nothing. `list` filters directory names through the same predicate |
| Atomic write | Each file is written to `<target>.<randomUUID()>.tmp` in the target's own directory, `fsync`ed, and only then `rename`d onto the target. Write it through `open(tmp, 'w', 0o600)`, `handle.writeFile(body, 'utf8')`, `handle.sync()`, `handle.close()` in a `finally`, because `writeFile(path, ...)` returns no handle to sync. Verified: `rename` within one directory replaces an existing target, and `FileHandle.sync()` resolves on this Node build. The UUID keeps two concurrent saves of one identifier off the same temporary path |
| Durability bound | The `fsync` before each rename is what extends the guarantee from a process crash to a power loss: without it the directory entry can reach disk before the data blocks, leaving a truncated `session.json` under the committed name, which decision `[1]` then rejects on every later `load`. `save` does not `fsync` the session directory after the renames, so a power loss can still lose a rename — which leaves the previous revision whole, the same outcome as a save that never ran. Decision `[10]` records that split |
| Write order | `save` serialises the envelope first, before it creates a directory or opens a file, so a state `JSON.stringify` refuses costs no filesystem write. It then writes and syncs both temporary files, and only then renames — `session.json` into place before `transcript.md`, so a transcript never describes a revision the store has not committed. Staging both files before either rename is what keeps a failed write from committing one of the two |
| Save failure | `save` rejects, and removes every temporary file it created with `rm(path, { force: true })` before it does. A failure at or before the rename of `session.json` leaves the session directory holding exactly what the previous successful save committed, and no temporary file. A failure of the `transcript.md` rename leaves the new `session.json` beside the previous `transcript.md` — the lagging derived view decision `[4]` accepts — and never the reverse. A cleanup that itself fails MUST NOT replace the original rejection, which is the one that names what went wrong |
| Read policy | The private reader maps a rejection whose `code` is `ENOENT` to "absent" and every other outcome — any other filesystem error, a `JSON.parse` failure, a schema failure, a version mismatch, and an `id` that disagrees with its directory name — to "unreadable". `load` resolves `undefined` for absent and rejects for unreadable; `list` drops both |
| Rejection shape | Every unreadable session rejects with an `Error` whose message names the absolute path of `session.json`. The two classes then split. A rejection over a malformed body — a `JSON.parse` failure, a `zod` failure, or a filesystem error other than `ENOENT` — carries that error as `cause`. A rejection over a version mismatch or an `id` mismatch carries no `cause`, because the store has no underlying error to attach, and names both values instead: the version found and the version expected, or the identifier found and the directory name expected. Compose the found version with `JSON.stringify`, not by interpolating an `unknown`: `@typescript-eslint/restrict-template-expressions` is active under `strictTypeChecked` and the Lint checklist row admits no error |
| Listing | `list` reads `<rootDir>` with `{ withFileTypes: true }`, keeps directory entries whose names pass the identifier predicate, reads each one, drops what it cannot read, and returns the surviving identifiers sorted ascending. A `readdir` rejection whose `code` is `ENOENT` yields an empty array; any other rejection propagates |
| Transcript body | A Markdown header naming the identifier and both timestamps as ISO 8601 strings, and nothing else. The exact text is the implementer's to pick within that constraint; M3 replaces the body |
| Environment | `CHRYSALYST_SESSION_DIR`. Unset or empty, the root is `join(homedir(), '.chrysalyst', 'sessions')`; set, the root is `resolve(value)`. The `env` parameter defaults to `process.env`, matching `llmConfigFromEnv`'s `env: NodeJS.ProcessEnv = process.env`; the resolver reads no file, so chrysalyst gains no dotenv loader; `os.homedir()` and `process.cwd()` are ambient state, not file reads |
| Test root | Every test in `filesystem-session-store.test.ts` runs against a sandbox from `mkdtemp(join(tmpdir(), ...))`, created per test and removed with `rm(sandbox, { recursive: true, force: true })` afterwards. The store's root is one level below that sandbox, so the store creates it. No test reads or writes `homedir()` |
| Port purity | `packages/core` gains no dependency, no import, and no field, and `StoredSession` does not learn about `schemaVersion`. Two files under `packages/core/src` change: the test file task 13 extends, and the `load` doc comment in `ports/session-store.ts`. `tests/workspace.test.ts`'s `core declares no runtime dependencies and its non-test source imports none` reads the manifest's `dependencies` and the import specifiers of non-test files, so a doc-comment edit keeps `platform/core-ports-contract` green |
| Dependencies | No package is added. `zod` is already declared in `packages/server/package.json`; every other import is a Node built-in |
| Scope | No `delete` method, in the adapter or in the port. `decision-log [9]` of `001-add-monorepo-scaffold` defers it, and roadmap § M17 owns the delta that adds it |

## Dependencies

No package is added and `pnpm-workspace.yaml` is unchanged. The API surface below was executed against the installed toolchain rather than recalled, and the tasks depend on each result.

| Observation | Result |
|-------------|--------|
| `readFile` of an absent file, or of a file under an absent directory | Rejects with `code === 'ENOENT'` — one branch covers both, so `load` needs no separate directory probe |
| `readFile` of a directory | Rejects with `code === 'EISDIR'`, which the read policy classifies as unreadable rather than absent |
| `readdir` of an absent directory | Rejects with `code === 'ENOENT'` |
| `readdir(root, { withFileTypes: true })` | Yields a `Dirent` per entry; `isDirectory()` separates session folders from a loose file such as `.DS_Store` |
| `mkdir(dir, { recursive: true })` | Creates missing parents and resolves for a directory that already exists, so `save` needs no existence check |
| `mkdir(dir, { recursive: true, mode: 0o700 })` | Applies `0o700` to every level it creates, not only the leaf, and leaves an existing directory's mode alone. Under the default `0o022` umask the mode survives unmasked |
| `open(tmp, 'w', 0o600)` then `handle.sync()` | Both resolve; the file lands at `0o600` and `rename` carries that mode onto the target. `FileHandle` exposes `sync` and `datasync` on this Node build |
| `writeFile(path, body, { mode })` | Applies the mode only when it creates the file, which is why `save` opens the temporary file explicitly rather than reusing an existing target |
| `rename(tmp, target)` within one directory | Replaces an existing target |
| `z.unknown()` in `zod@4.5.4` | Rejects an absent key with `expected nonoptional, received undefined` — it is not implicitly optional, so a truncated envelope fails rather than loading as `state: undefined` |
| `z.iso.datetime()` in `zod@4.5.4` | Accepts `Date.prototype.toISOString()` output and rejects a non-datetime string, reporting the failing field's path |
| `new Date(iso).getTime()` for `toISOString()` output | Equals the original, so a revived timestamp compares equal under Vitest's `toEqual` |
| `node --input-type=module -e "await import('./packages/server/src/adapters/session-store/…ts')"` from the repo root | Resolves `zod` from `packages/server/node_modules`, so the § Manual Testing commands run without a build step |
| Node version | `v22.23.2`, above the `>= 22.18` the workspace requires |

## Migration

Not applicable. `SessionStorePort` has no implementation to migrate from, and no session folder exists on any machine. `schemaVersion` is written from the first save precisely so that the milestone which does change the envelope has a version to branch on.

## Implementation Tasks

Tasks 2 through 11 are five red-green pairs, one behaviour each. Every pair writes its failing tests first, runs them red, then writes the smallest implementation that turns them green. Tests a pair leaves green MUST stay green through every later pair without being edited — that constraint is what keeps the staging pair honest.

1. Build the test harness in `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`: a `beforeEach` that creates a sandbox with `mkdtemp(join(tmpdir(), 'chrysalyst-session-store-'))` and derives the store's root as `join(sandbox, 'store')`, a path the store itself creates on first save; an `afterEach` that removes the sandbox with `rm(sandbox, { recursive: true, force: true })`; a fixture factory producing a `StoredSession<{ title: string }>` with distinct `createdAt` and `updatedAt` values; and planting helpers that create the root when they need it and then plant a session directory with an arbitrary `session.json` body, a directory with no `session.json`, and a loose file. The store's root is one level below the `mkdtemp` directory because `mkdtemp` already yields `0o700`, which would make task 2's root-mode assertion pass whatever the store did. Prove the harness before any scenario is written against it: assert the sandbox exists, that the store's root does not yet exist, and that each planting helper produced the directory shape it claims.
2. **Red — `save` lands an envelope and a transcript.** Write `A saved session lands as a versioned JSON envelope` and `A saved session carries a transcript beside its state` as failing tests. Assert the on-disk result by reading the real files, never by inspecting the store: the parsed envelope's `schemaVersion`, its identifier, both timestamps as ISO 8601 strings, and the state under its own key; the transcript naming the identifier and both timestamps and holding nothing more; and, after a second save with a later `updatedAt`, the transcript naming that second `updatedAt`. Assert the modes with `stat`, masked `& 0o777` — `0o700` on the root and on the session directory, `0o600` on both files — and guard those four assertions on `process.platform !== 'win32'` with a comment saying why: Windows reports a mode that does not describe POSIX bits. The root the assertion reads is the one the store created, not the `mkdtemp` directory — task 1 places it one level below for exactly that reason.
3. **Green — `save`.** Create `packages/server/src/adapters/session-store/filesystem-session-store.ts` and implement `createFilesystemSessionStore`'s `save` far enough to pass task 2: serialise the envelope before touching the filesystem, `mkdir(<rootDir>/<id>, { recursive: true, mode: 0o700 })`, then write `session.json` and `transcript.md`. Write each file through `open(path, 'w', 0o600)` and close the handle in a `finally`. Write each file straight to its target here; task 11 introduces the staging the save-failure scenario forces, and task 2's tests MUST pass unchanged after it. The exported factory carries a doc comment stating why the boundary exists, not what the code does.
4. **Red — `load` answers, and tells absence from corruption.** Write `Store round-trips a session through a real directory`, `Saving replaces an earlier revision of the same session`, `State the store cannot serialise does not survive the round trip`, `Loading an unknown session yields no session`, and `A damaged session file fails loudly`. The serialisation scenario needs its own `TState`, nesting a `Date` under one of its fields, so the assertion distinguishes the string that field returns as from the `Date` instances `createdAt` and `updatedAt` return as. Write the damaged-file scenario as `it.each` with one case per planted body, so each failure reports under its own name rather than as one unit: a body that is not valid JSON; a body missing `state`; a body whose `updatedAt` is not a datetime; `schemaVersion` `2`; `schemaVersion` `"1"`; `schemaVersion` `1.5`; an `id` disagreeing with its directory name; and a `session.json` planted as a directory, which yields `EISDIR`. Each case asserts the path in the message, and the `cause` policy for its class — the malformed bodies carry their underlying error, the two mismatches carry none and name both values.
5. **Green — `load` and the private reader.** Implement `load` and the reader `list` will share. The reader separates "absent" (`ENOENT`) from "unreadable" (every other filesystem error, a `JSON.parse` failure, a version mismatch, a schema failure, and an `id` that disagrees with its directory name), checking the version before running the `zod` object so the mismatch message can name both values. `load` resolves `undefined` for absent and rejects for unreadable. The state passes through exactly one `as TState` assertion, carrying a comment that the store validates the envelope it owns and never the state it does not. [expert]
6. **Red — `list` reports what it can read, in order.** Write `A store lists exactly the sessions it can read` against a root holding three saved sessions, a directory with no `session.json`, a directory whose `session.json` is damaged, and a loose file. Assert the exact three identifiers, their ascending order, that `list` does not throw, and that `list` over an absent root resolves to an empty array.
7. **Green — `list`.** Implement `list` over the same reader: `readdir(<rootDir>, { withFileTypes: true })`, keep directory entries, read each one, drop absent and unreadable alike, sort ascending. A `readdir` rejection whose `code` is `ENOENT` yields an empty array; any other rejection propagates.
8. **Red — an identifier never escapes the root.** Write `A session identifier never escapes the store's root` as `it.each` with one case per unsafe identifier, so each of the failures reports under its own name: the empty string, `.`, `..`, `a/b`, `../escape`, `a\b`, and one carrying a NUL byte. Each case asserts that `save` rejects naming the identifier, that nothing was created inside the root or outside it, and that `load` resolves `undefined`. Add one case planting a directory whose name would fail the predicate and asserting `list` omits it.
9. **Green — the identifier predicate.** Add the single predicate and apply it in all three methods: `save` rejects before touching the filesystem, `load` resolves `undefined` without reading, `list` filters directory names through it.
10. **Red — a failed save leaves the previous revision loadable.** Write `A save that fails leaves the previous revision loadable` with three injections after one successful save. A state `JSON.stringify` refuses, such as one holding a `BigInt`, which fails before any filesystem call. A session directory turned read-only with `chmod(dir, 0o500)`, which fails the write; restore the mode in the test's own cleanup so the `afterEach` `rm(sandbox, { recursive: true, force: true })` can remove the tree, and guard the case on `process.getuid?.() !== 0` with a comment saying why — a run as root ignores the mode and would report a pass the test never proved. Neither reaches the cleanup path, because both fail before a temporary file exists, so add a third: `vi.mock('node:fs/promises', importOriginal)` whose `open` delegates to the original and whose returned handle rejects on the **second** file's `writeFile`, leaving the first temporary file on disk. Assert that `save` rejects with that error, that the previous revision still loads with both timestamps unchanged, that `list` still reports the identifier, and that the session directory holds exactly `session.json` and `transcript.md` — that last assertion is the only one in the plan that proves both the cleanup and the two-phase staging, because a design that renamed as it wrote would have committed `session.json` before the failure. Through the same mock, assert the barrier's observable half: both handles are `sync`ed before the first `rename` runs.
11. **Green — staging, the barrier, and cleanup.** Rework `save` to write each file to `<target>.<randomUUID()>.tmp` in the target's own directory, `sync` each handle, and only then rename — `session.json` first, `transcript.md` second. A failure at any step removes every temporary file `save` created with `rm(path, { force: true })` and rethrows the original error; a cleanup that itself fails MUST NOT replace it. Do not `fsync` the session directory — § Requirements § Durability bound and decision `[10]` say why. Tasks 2 through 9 MUST stay green without an edit. [expert]
12. Implement `sessionStoreConfigFromEnv` in the same module — signature `env: NodeJS.ProcessEnv = process.env`, matching `llmConfigFromEnv`; `CHRYSALYST_SESSION_DIR` if set and non-empty, resolved to an absolute path, otherwise `join(homedir(), '.chrysalyst', 'sessions')` — and extend the test file with the environment-resolution scenario: the default applied, the variable overriding it, a relative value resolved to absolute, and no file read.
13. Prove the port's new scenario in `packages/core/src/ports/ports.test.ts`, and amend the `load` doc comment in `packages/core/src/ports/session-store.ts` to name the rejection path. Add a third double beside `memorySessionStore` whose backing map holds either a `StoredSession` or an unreadable marker: `load` rejects when it finds the marker and resolves the session otherwise, and `list` returns every key without reading, so it cannot reject. The marker is opaque — the double names no serialisation format, because the port declares none. Assert all three clauses: the marked identifier rejects, an identifier never saved resolves to `undefined`, and `list` survives both. Leave the three existing `SessionStorePort` tests untouched. The doc comment says that `load` answers `undefined` for an identifier that was never saved and rejects when the record is present but unreadable; it states no adapter's mechanism. Change nothing else under `packages/core/src`, add no dependency, and add no import.
14. Amend two places in `specs/roadmap.md` § M2. Correct the `**Pläne:**` line to name `add-filesystem-session-store`. Extend `**Fertig, wenn:**` so the transcript is part of the completion criterion, stating that each session folder also holds a `transcript.md` naming the session and its timestamps while the interview content itself arrives with M3. Change nothing else in the file — in particular, leave M2's `⬜ offen` status in the § Überblick table to `/speq:record`.
15. Run the full § Verification checklist end to end, including every § Manual Testing row, and fix what it surfaces.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 (one ordered stream), 13, 14 |
| Group B | 15 |

Sequential dependencies:
- Group A → Group B — verification runs the tests and the store that tasks 1 through 13 write.

Tasks 1 through 12 are one ordered TDD stream over the same two files and must not be split across agents: every red-green pair builds on the module the pair before it left green, and task 11 reworks what tasks 3 through 9 wrote. Task 13 touches `packages/core/src/ports/ports.test.ts` and `packages/core/src/ports/session-store.ts`, and task 14 touches `specs/roadmap.md`; neither shares a file with that stream or with the other, so all three run alongside.

Two tasks in the stream carry `[expert]` and the rest do not. Task 5 owns the absent-versus-unreadable classification, which is the module's one piece of non-obvious correctness — the whole Q2/Q4 asymmetry rests on it. Task 11 owns the staging order, the durability barrier, and a cleanup path that must not mask the rejection that named the fault. Tasks 2, 3, 6, 7, 8, 9, and 12 are file writes, a `readdir` filter, a string predicate, and an environment lookup against a stated precedent.

Unlike `002-add-ollama-llm-adapter`, this plan has no install step and no human step: it adds no package, and the filesystem every test needs is already present on any machine that can run the suite.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| — | — | None. This plan adds a module and its tests; the only edits to existing files are one added test in `packages/core/src/ports/ports.test.ts`, one doc comment in `packages/core/src/ports/session-store.ts`, and two lines of `specs/roadmap.md` |

## Verification

### Scenario Coverage

Every row names the task that writes the test. `store.test.ts` abbreviates `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| A saved session lands as a versioned JSON envelope | Integration | `store.test.ts` (task 2) | `writes session.json as a schemaVersion 1 envelope with ISO timestamps, owner-only` |
| A saved session carries a transcript beside its state | Integration | `store.test.ts` (task 2) | `writes a transcript header beside the state and rewrites it for a later revision` |
| Store round-trips a session through a real directory | Integration | `store.test.ts` (task 4) | `round-trips a session through a root it creates on first save` |
| Saving replaces an earlier revision of the same session | Integration | `store.test.ts` (task 4) | `replaces an earlier revision and leaves no temporary file behind` |
| State the store cannot serialise does not survive the round trip | Integration | `store.test.ts` (task 4) | `returns a Date nested in the state as an ISO string while reviving the envelope's own timestamps` |
| Loading an unknown session yields no session | Integration | `store.test.ts` (task 4) | `resolves undefined for an unsaved id and for an absent root without creating either` |
| A damaged session file fails loudly | Integration | `store.test.ts` (task 4) | `rejects a load over $body, naming the path` — one `it.each` case per planted body |
| A store lists exactly the sessions it can read | Integration | `store.test.ts` (task 6) | `lists only readable sessions in sorted order and answers an absent root with an empty array` |
| A session identifier never escapes the store's root | Integration | `store.test.ts` (task 8) | `refuses $id, stores nothing, and never loads or lists it` — one `it.each` case per unsafe identifier |
| A save that fails leaves the previous revision loadable | Integration | `store.test.ts` (task 10) | `rejects a failing save, keeps the previous revision loadable, and leaves no temporary file` |
| The store's root comes from the environment | Unit | `store.test.ts` (task 12) | `defaults the root under the home directory and lets CHRYSALYST_SESSION_DIR override it` |
| A stored session the implementation cannot read is a failure (`session-store-port`) | Unit | `packages/core/src/ports/ports.test.ts` (task 13) | `rejects a load over an unreadable record, reserves undefined for one never saved, and lists without rejecting` |
| SessionStorePort round-trips a session (`session-store-port`, unchanged) | Unit | `packages/core/src/ports/ports.test.ts` | `round-trips a stored session` |
| Loading an unknown session yields no session (`session-store-port`, unchanged) | Unit | `packages/core/src/ports/ports.test.ts` | `resolves undefined for an unknown session` |

The port's delta adds one scenario and changes neither existing one; both MUST stay green untouched. All three stay unit tests over type doubles — `packages/core` is not permitted to touch a filesystem, so the port's scenarios are proved against doubles and the adapter's scenarios against real files. The new double is the third in that file and is the only one whose `load` can reject.

`packages/core/src/ports/ports.test.ts` holds a third `SessionStorePort` test, `lists the identifier of every stored session`, whose behaviour has no scenario in the recorded `platform/session-store-port` spec; the gap predates this plan, which does not close it, and task 13 leaves that test as it stands.

`The store's root comes from the environment` is the one unit test: resolving a path from a record is pure computation, and the scenario's last clause is that it performs no I/O. Every other scenario drives real files and is an integration test.

Two scenarios each bundle a set of inputs behind one `GIVEN` and one `THEN`, and each is written as `it.each` rather than as one assertion block. `A damaged session file fails loudly` gets one case per planted body — bad JSON, an absent `state`, a malformed timestamp, `schemaVersion` `2`, `"1"` and `1.5`, a mismatched `id`, and a `session.json` planted as a directory. `A session identifier never escapes the store's root` gets one case per unsafe identifier — the empty string, `.`, `..`, `a/b`, `../escape`, `a\b`, and one carrying a NUL byte. Sharing the setup is why the scenarios stay merged; reporting each failure under its own name is why the tests do not.

The `fsync` barrier is the one requirement no scenario asserts end to end, because no test can cut power to the machine. Task 10 proves its observable half through the `node:fs/promises` mock — both handles are `sync`ed before the first `rename` — and the guarantee that follows rests on the `fsync` contract rather than on a test. § Requirements § Durability bound states the crash classes covered and the one that is not.

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| filesystem-session-store | `pnpm --filter @chrysalyst/server test` | Every store test passes; the run creates and removes directories under the system temp directory and touches no path under `~/.chrysalyst` |
| filesystem-session-store | `rm -rf /tmp/chrysalyst-manual && CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-manual node --input-type=module -e "const m = await import('./packages/server/src/adapters/session-store/filesystem-session-store.ts'); const s = m.createFilesystemSessionStore(m.sessionStoreConfigFromEnv()); const t = new Date(); await s.save({ id: 'demo-1', createdAt: t, updatedAt: t, state: { title: 'Idee' } }); console.log(await s.list()); console.log(await s.load('demo-1')); console.log(await s.load('nope'));"` | Prints `[ 'demo-1' ]`, then the session whose `createdAt` and `updatedAt` print as `Date` objects and whose `state` is `{ title: 'Idee' }`, then `undefined` |
| filesystem-session-store | `ls /tmp/chrysalyst-manual/demo-1 && stat -c '%a %n' /tmp/chrysalyst-manual /tmp/chrysalyst-manual/demo-1 /tmp/chrysalyst-manual/demo-1/* && cat /tmp/chrysalyst-manual/demo-1/session.json && cat /tmp/chrysalyst-manual/demo-1/transcript.md` | Exactly `session.json` and `transcript.md`, no temporary file. `stat` reports `700` for both directories and `600` for both files. The JSON carries `"schemaVersion": 1`, the identifier, both timestamps as ISO 8601 strings, and the state under `state`. The transcript is a header naming `demo-1` and both timestamps, and nothing else |
| filesystem-session-store | `printf 'not json' > /tmp/chrysalyst-manual/demo-1/session.json && CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-manual node --input-type=module -e "const m = await import('./packages/server/src/adapters/session-store/filesystem-session-store.ts'); const s = m.createFilesystemSessionStore(m.sessionStoreConfigFromEnv()); console.log('list:', await s.list()); await s.load('demo-1').catch((e) => console.log('load:', e.message, '| cause:', e.cause?.constructor.name));"` | `list:` prints `[]` without throwing; `load:` prints a message naming `/tmp/chrysalyst-manual/demo-1/session.json` with `SyntaxError` as its cause. This is the asymmetry the interview settled: `list` skips what `load` refuses |
| filesystem-session-store | `printf '{"schemaVersion":"2","id":"demo-1","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","state":{}}' > /tmp/chrysalyst-manual/demo-1/session.json && CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-manual node --input-type=module -e "const m = await import('./packages/server/src/adapters/session-store/filesystem-session-store.ts'); const s = m.createFilesystemSessionStore(m.sessionStoreConfigFromEnv()); await s.load('demo-1').catch((e) => console.log(e.message, '| cause:', e.cause));"` | The message names the version found (`\"2\"`, not `2`) and the version expected (`1`), and `cause:` prints `undefined`. A string version reaches the version check before the `zod` object, so the caller reads a version mismatch rather than a field error |
| filesystem-session-store | `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-manual node --input-type=module -e "const m = await import('./packages/server/src/adapters/session-store/filesystem-session-store.ts'); const s = m.createFilesystemSessionStore(m.sessionStoreConfigFromEnv()); await s.save({ id: '../escape', createdAt: new Date(), updatedAt: new Date(), state: {} }).catch((e) => console.log('save:', e.message)); console.log('load:', await s.load('../escape'));" && ls /tmp` | `save:` prints a message naming `../escape`; `load:` prints `undefined`; `/tmp` holds no `escape` directory |
| filesystem-session-store | `node --input-type=module -e "const m = await import('./packages/server/src/adapters/session-store/filesystem-session-store.ts'); console.log(m.sessionStoreConfigFromEnv({})); console.log(m.sessionStoreConfigFromEnv({ CHRYSALYST_SESSION_DIR: 'relative/sessions' }));" && ls ~/.chrysalyst` | Prints `{ rootDir: '<home>/.chrysalyst/sessions' }`, then the relative value resolved against the working directory. `ls` reports that `~/.chrysalyst` does not exist: resolving a root creates nothing |
| session-store-port | `pnpm --filter @chrysalyst/core test` | Passes, including the new `rejects a load over an unreadable record, reserves undefined for one never saved, and lists without rejecting` and the untouched `round-trips a stored session` and `resolves undefined for an unknown session`. `packages/core` still declares no dependency, so the run needs nothing installed beyond the toolchain |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; no threshold failure |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

No row needs a network, a daemon, or a configured environment variable. Every store test supplies its own `mkdtemp` root, so a green `Test` row is evidence about the store rather than about the machine it ran on.

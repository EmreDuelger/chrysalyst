# Decisions: add-filesystem-session-store

## ADR: Absence and corruption are distinct answers, and load and list disagree on purpose

**ID:** absence-and-corruption-are-distinct-load-answers
**Plan:** add-filesystem-session-store
**Status:** Accepted

### Context

`load(id)` can find a session folder whose `session.json` is present but unreadable — invalid JSON, an envelope-schema failure, a `schemaVersion` the store does not recognise, or a stored `id` that disagrees with its directory name. The roadmap left open whether that is "not found" or an error, and whether `list` should fail the whole listing over one damaged folder. M3's walking skeleton is the first caller and acts differently on each answer.

### Decision

One private reader classifies a session folder as absent (`ENOENT` on `session.json` or its directory) or unreadable (every other outcome). `load` resolves `undefined` for absent and rejects for unreadable, with a message naming the file's absolute path; a rejection over a malformed body carries that error as `cause`, a rejection over a version or `id` mismatch carries none and names both values. `list` drops both classes and returns what remains, sorted. The split lives in the two public methods over one shared read, so the file format has exactly one owner and `list` reports only identifiers `load` will answer.

### Options Considered

| Option | Verdict |
|--------|---------|
| `load` rejects on corruption; `list` skips it | ✓ Chosen — absence and corruption are different facts; collapsing them would have M3 silently start a fresh interview over a session it failed to read |
| Resolve `undefined` for both classes | ✗ Rejected — the user loses work with no message |
| Resolve `undefined` for an unrecognised `schemaVersion`, reject only parse errors | ✗ Rejected in the interview — a version the store cannot read is a file it cannot read |
| Fail the whole `list` over one damaged folder | ✗ Rejected — a library that will not open until a stray directory is deleted is worse than one that shows what it can read |

### Consequences

Callers of `load` must handle a rejection, not only `undefined`. `list` performs a full read per entry rather than a cheap parse check, which is what makes its promise honest. The asymmetry is deliberate and is asserted at both the port and the adapter.

## ADR: schemaVersion versions the on-disk envelope, not the domain session

**ID:** schemaversion-versions-the-on-disk-envelope
**Plan:** add-filesystem-session-store
**Status:** Accepted

### Context

The roadmap makes `schemaVersion` a standing guardrail from the first write, because `TState` grows across M2 → M8 → M9 → M14 and an unversioned folder breaks silently later. The question is what the version describes and where the field lives, given `platform/core-ports-contract` forbids the filesystem in `packages/core`.

### Decision

`session.json` is an envelope — `{ schemaVersion, id, createdAt, updatedAt, state }` — whose `schemaVersion` is the integer `1`, held as a module constant in `packages/server`. `StoredSession` in `@chrysalyst/core` gains no such field. The store validates the envelope with `zod`, checks the version before the schema object runs, and passes `state` through untouched, reaching `TState` by a single documented `as` assertion. The two timestamps the envelope owns are revived to `Date`.

### Options Considered

| Option | Verdict |
|--------|---------|
| Version the envelope; keep the field out of `core` | ✓ Chosen — the envelope's shape is the adapter's business, the state's shape is the caller's; `TState` can grow without touching this module |
| Add `schemaVersion` to `StoredSession` | ✗ Rejected — breaches the core-ports contract, and a hosted store (P1) writes no `session.json` |
| A version string (`"1.0"`) or the package version | ✗ Rejected — an integer that increments on envelope-shape changes is the smallest thing a future reader can branch on |
| Accept a `parseState` validator in the config | ✗ Rejected — a decision the module would be declining to make for a caller that does not yet exist |

### Consequences

`TState` must survive a JSON round trip: a `Date` nested inside the state returns as a string, and only the two envelope timestamps are revived. M3 picks the concrete `TState` and inherits that constraint.

## ADR: Each temporary file is fsynced before its rename; the session directory is not

**ID:** fsync-each-temp-file-before-rename
**Plan:** add-filesystem-session-store
**Status:** Accepted

### Context

`save` must leave the previous revision loadable when a write is interrupted. `rename` within one directory replaces the target in one step, so no reader sees a torn file after a process crash — but `rename` orders nothing against the data blocks, so a power loss can leave a truncated `session.json` under the committed name, which the read policy then rejects on every later `load`. That is the permanent loss the staging design set out to remove.

### Decision

`save` writes each file to `<target>.<randomUUID()>.tmp` in the target's own directory through `open(tmp, 'w', 0o600)`, calls `handle.sync()`, then renames both onto their targets — `session.json` first. It issues no `fsync` on the session directory or the root after the renames.

### Options Considered

| Option | Verdict |
|--------|---------|
| `fsync` each temp file before its rename; skip the directory sync | ✓ Chosen — converts "previous revision survives a process crash" into "survives a power loss"; a lost rename only leaves the previous revision whole, the same outcome as a save that never ran |
| No barrier, relying on `rename` alone | ✗ Rejected — a power loss can leave a truncated `session.json` that rejects permanently |
| Also `fsync` the session directory after each rename | ✗ Rejected — buys a benign residue and needs `open(dir)`, which Windows refuses |
| `fdatasync` instead of `fsync` | ✗ Rejected — a newly created file's size and blocks are new metadata `fdatasync` need not flush |

### Consequences

The store promises that whatever `load` finds is whole, not that every returned `save` is on disk. The cost is one `fsync` per file per `save`, on a tool that saves at human interview pace. No test can cut power, so the observable half — both handles synced before the first rename — is asserted through a mock.

## ADR: The store fixes its own owner-only file modes rather than inheriting the umask

**ID:** store-fixes-owner-only-file-modes
**Plan:** add-filesystem-session-store
**Status:** Accepted

### Context

chrysalyst is a local single-user tool whose subject matter is a product idea its author has not published. The default `0o022` umask on Linux yields `0o755` directories and `0o644` files, so every account on the machine could read a user's sessions.

### Decision

Every directory the store creates is `0o700` and every file it creates is `0o600`. `mkdir(..., { recursive: true, mode: 0o700 })` covers the root and the session directory; each temporary file is opened with mode `0o600`, and `rename` carries that mode onto the target.

### Options Considered

| Option | Verdict |
|--------|---------|
| Name the mode at creation, `0o700` / `0o600` | ✓ Chosen — the store is the only writer and owes the narrowest mode that works; naming it at creation removes an ambient input from the result |
| Inherit the process umask | ✗ Rejected — the default exposes unpublished ideas to every account, a decision nobody in chrysalyst sets |
| `chmod` after the write | ✗ Rejected — leaves a window at the wider mode |
| Tighten only `session.json` | ✗ Rejected — the transcript names the same session and the directory name is the identifier |

### Consequences

On a shared machine no other account reads a session. The mode assertion runs only on non-Windows, because Windows reports a mode that does not describe POSIX bits.

## ADR: SessionStorePort records that load may reject over a present-but-unreadable record

**ID:** session-store-port-load-may-reject-on-corruption
**Plan:** add-filesystem-session-store
**Status:** Accepted

### Context

Making `load` reject over a present-but-unreadable record changes the `SessionStorePort` contract for every implementation and every caller, not just the filesystem adapter. Left in one adapter's spec, the port would still read as one that never throws, and its `load` doc comment would still promise that a stale link "is an ordinary outcome, not a failure" — so M3 could call `load` unwrapped and meet an unhandled rejection in an HTTP route. P1's hosted store faces the same question with nothing to tell it the answer.

### Decision

`platform/session-store-port` gains the scenario `A stored session the implementation cannot read is a failure`, binding every implementation: `load` rejects over a record that is present but unreadable, `undefined` reports absence alone, and `list` does not reject over a record it cannot read. The port's Background drops the claim that it has no adapter. The `load` doc comment in `packages/core/src/ports/session-store.ts` names both outcomes. The serialisation constraint stays one level down, in the adapter's spec, because a port-level double can only demonstrate it by hard-coding `JSON` into `packages/core`.

### Options Considered

| Option | Verdict |
|--------|---------|
| Add a port scenario for the rejection path | ✓ Chosen — the rejection is a contract every caller and future implementation reads at the port |
| A Background-only delta | ✗ Rejected — leaves `load`'s new rejection path unstated in the scenarios |
| State the rejection only in the adapter's spec | ✗ Rejected — P1's hosted store would have nothing to tell it the answer |
| Record the serialisation constraint at the port too | ✗ Rejected — a port-level double would leak the adapter's format choice into `packages/core` |

### Consequences

Every `SessionStorePort` implementation must classify a present-but-unreadable record as a failure. The doc-comment and test-double edits stay inside `packages/core`'s purity rule, which reads manifests and non-test import specifiers only.

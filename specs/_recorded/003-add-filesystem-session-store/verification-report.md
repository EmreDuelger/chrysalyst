# Verification Report: add-filesystem-session-store

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | `SessionStorePort` has its first real implementation. All 14 plan scenarios pass; build, tests, coverage, typecheck, and lint are clean; every manual-testing row reproduces its expected output. |
| Code review | 5 findings — 5 fixed |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | ✓ |

## Test Evidence

### Coverage

`packages/server/src/adapters/session-store/` — `pnpm -r test --coverage`:

| Metric | Coverage % |
|--------|------------|
| Statements | 98.95 |
| Branches | 97.87 |
| Functions | 100 |
| Lines | 98.94 |

Uncovered: line 279 (`errorCodeOf`'s `return undefined`, reachable only by a filesystem error carrying no string `code`; named by no scenario and no finding). No coverage threshold failed in any package.

### Test Results

| Type | Run | Passed | Skipped |
|------|-----|--------|---------|
| Integration (`filesystem-session-store.test.ts`) | 36 | 36 | 0 |
| Unit (`packages/core`, 2 files) | 13 | 13 | 0 |
| Full workspace (`pnpm -r --include-workspace-root test`) | 81 | 80 | 1 |

The 1 skip is `openai-compatible-llm.live.test.ts` — a pre-existing live-LLM suite gated on a running Ollama, unrelated to this plan.

### Manual Tests

| Row | Test | Result |
|-----|------|--------|
| 1 | `pnpm --filter @chrysalyst/server test` — all store tests pass, no `~/.chrysalyst` path touched | ✓ |
| 2 | `save` then `list`/`load`/`load(unknown)` — prints `[ 'demo-1' ]`, the session with `Date` timestamps and `state { title: 'Idee' }`, then `undefined` | ✓ |
| 3 | `ls` + `stat` + `cat` — exactly `session.json` + `transcript.md`; modes `700 700 600 600`; JSON carries `schemaVersion 1`, id, ISO timestamps, `state`; transcript is a header naming `demo-1` and both timestamps | ✓ |
| 4 | Corrupt `session.json` — `list` prints `[]` without throwing; `load` rejects naming the absolute path with `SyntaxError` as `cause` | ✓ |
| 5 | `schemaVersion "2"` — message names the found version `"2"` (quoted) and expected `1`; `cause` is `undefined` | ✓ |
| 6 | `save({ id: '../escape' })` — rejects naming `../escape`; `load` resolves `undefined`; `/tmp` gains no `escape` directory | ✓ |
| 7 | `sessionStoreConfigFromEnv({})` → `<home>/.chrysalyst/sessions`; relative value resolved against cwd; `~/.chrysalyst` still absent | ✓ |
| 8 | `pnpm --filter @chrysalyst/core test` — passes including the new unreadable-record scenario and the two untouched ones | ✓ |

## Tool Evidence

### Linter

```
$ eslint .
(no output — 0 errors, 0 warnings)
```

### Formatter

```
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

Ten files failed `prettier --check` at the merge base `859aeaf`, all outside this plan's scope. They are now clean: `README.md` was reformatted (one trailing blank line removed), and `openwiki/` plus `.github/workflows/openwiki-update.yml` were added to `.prettierignore` — generated wiki pages and the OpenWiki scheduled workflow are tool-owned and regenerated, matching the existing `specs/`, `.serena/`, `.claude/` exclusions. Every file this plan creates or edits passes `prettier --check`.

### Build

```
$ pnpm -r build
packages/web build: ✓ built in 156ms
packages/core build: Done
packages/server build: Done
```

### Install

```
$ pnpm install
(exit 0; pnpm-lock.yaml unchanged — no package added)
```

## Scenario Coverage

| Domain | Feature | Scenario | Test Location | Test Name | Passes |
|--------|---------|----------|---------------|-----------|--------|
| adapters | filesystem-session-store | A saved session lands as a versioned JSON envelope | `filesystem-session-store.test.ts` | `writes session.json as a schemaVersion 1 envelope with ISO timestamps, owner-only` | Pass |
| adapters | filesystem-session-store | A saved session carries a transcript beside its state | `filesystem-session-store.test.ts` | `writes a transcript header beside the state and rewrites it for a later revision` | Pass |
| adapters | filesystem-session-store | Store round-trips a session through a real directory | `filesystem-session-store.test.ts` | `round-trips a session through a root it creates on first save` | Pass |
| adapters | filesystem-session-store | Saving replaces an earlier revision of the same session | `filesystem-session-store.test.ts` | `replaces an earlier revision and leaves no temporary file behind` | Pass |
| adapters | filesystem-session-store | State the store cannot serialise does not survive the round trip | `filesystem-session-store.test.ts` | `returns a Date nested in the state as an ISO string while reviving the envelope's own timestamps` | Pass |
| adapters | filesystem-session-store | Loading an unknown session yields no session | `filesystem-session-store.test.ts` | `resolves undefined for an unsaved id and for an absent root without creating either` | Pass |
| adapters | filesystem-session-store | A damaged session file fails loudly | `filesystem-session-store.test.ts` | `rejects a load over <body>, naming the path` — 10 `it.each` cases (8 planned + 2 from review fix 4.2) | Pass |
| adapters | filesystem-session-store | A store lists exactly the sessions it can read | `filesystem-session-store.test.ts` | `lists only readable sessions in sorted order and answers an absent root with an empty array` | Pass |
| adapters | filesystem-session-store | A session identifier never escapes the store's root | `filesystem-session-store.test.ts` | `refuses <id>, stores nothing, and never loads or lists it` — 7 `it.each` cases + `omits a directory whose name is an identifier it would refuse to save` | Pass |
| adapters | filesystem-session-store | A save that fails leaves the previous revision loadable | `filesystem-session-store.test.ts` | `rejects a failing save, keeps the previous revision loadable, and leaves no temporary file` — 3 injections | Pass |
| adapters | filesystem-session-store | The store's root comes from the environment | `filesystem-session-store.test.ts` | `defaults the root under the home directory and lets CHRYSALYST_SESSION_DIR override it` | Pass |
| platform | session-store-port | A stored session the implementation cannot read is a failure | `packages/core/src/ports/ports.test.ts` | `rejects a load over an unreadable record, reserves undefined for one never saved, and lists without rejecting` | Pass |
| platform | session-store-port | SessionStorePort round-trips a session (unchanged) | `packages/core/src/ports/ports.test.ts` | `round-trips a stored session` | Pass |
| platform | session-store-port | Loading an unknown session yields no session (unchanged) | `packages/core/src/ports/ports.test.ts` | `resolves undefined for an unknown session` | Pass |

Four tests were added by code-review fixes beyond the plan's scenario table, all passing: `syncs both staged files before it renames either into place` (barrier proof — the `fsync` ordering had no end-to-end assertion before), `rejects a listing whose root cannot be read` (`list` boundary-error translation), `keeps the write's own error when removing a staged file also fails` (cleanup never masks the original rejection), `keeps the barrier's own error when releasing the handle also fails` (a `close` failure never masks a `sync` failure).

## Notes

- **Format check.** `pnpm format:check` now exits 0. The 10 pre-existing failures (all outside this plan's scope) were cleared alongside this work at the user's request: `README.md` reformatted, `openwiki/` and the OpenWiki workflow added to `.prettierignore`.
- **Durability barrier.** The `fsync`-before-rename barrier extends the save guarantee from a process crash to a power loss. Its observable half — both handles synced before the first rename — now has a real test (`syncs both staged files before it renames either into place`); the full power-loss guarantee still rests on the `fsync` contract, since no test can cut power. The residual window (a failed second rename leaves the new `session.json` beside the previous `transcript.md`) is bounded and documented in plan § Consequences.
- **Review-fix deviation.** Expert fix 4.3 prescribed `try { … } finally { await ignoringFailure(handle.close()) }` for `stageDurably`. The implementer instead let a `close()` failure on a successfully-synced handle propagate (guardrail: "never discard an error"), swallowing `close` errors only on the already-failing path, and added `keeps the barrier's own error when releasing the handle also fails` to lock the behaviour. Net effect matches the finding's intent; the deviation is stricter, not looser.
- **`packages/core` coverage** prints as `0` — a pre-existing artifact of the core package's coverage config (type-only source, no instrumented runtime). Not a threshold failure and not introduced here.

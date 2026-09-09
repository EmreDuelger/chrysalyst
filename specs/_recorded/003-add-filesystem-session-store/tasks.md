# Tasks: add-filesystem-session-store

## Phase 2: Implementation (Group A — ordered TDD stream, server)
- [x] 2.1 Build the test harness in `filesystem-session-store.test.ts` (sandbox beforeEach/afterEach, fixture factory, planting helpers; prove the harness)
- [x] 2.2 Red — `save` lands a versioned JSON envelope and a transcript stub; assert modes with `stat`
- [x] 2.3 Green — create `filesystem-session-store.ts`, implement `save` straight-to-target far enough to pass 2.2
- [x] 2.4 Red — `load` answers, and tells absence from corruption (round-trip, replace, unserialisable state, unknown id, damaged file `it.each`)
- [x] 2.5 Green — `load` and the shared private reader; version check before zod object; one `as TState` [expert]
- [x] 2.6 Red — `list` reports what it can read, in sorted order; absent root → `[]`
- [x] 2.7 Green — `list` over the shared reader
- [x] 2.8 Red — an identifier never escapes the root (`it.each` per unsafe id; `list` omits a bad dir name)
- [x] 2.9 Green — the identifier predicate, applied in `save`/`load`/`list`
- [x] 2.10 Red — a failed save leaves the previous revision loadable (BigInt, chmod 0o500, `vi.mock` second-writeFile rejection; sync-before-rename assertion)
- [x] 2.11 Green — staging, the `fsync` barrier, and cleanup; tasks 2.2–2.9 stay green unedited [expert]
- [x] 2.12 Implement `sessionStoreConfigFromEnv` + environment-resolution scenario

## Phase 2: Implementation (Group A — parallel, disjoint files)
- [x] 2.13 Prove the port's new scenario in `packages/core/src/ports/ports.test.ts`; amend `load` doc comment in `ports/session-store.ts`
- [x] 2.14 Amend two places in `specs/roadmap.md` § M2 (`**Pläne:**` name; `**Fertig, wenn:**` transcript clause)

## Phase 4: Review Fixes
- [x] 4.1 In `packages/core/src/ports/ports.test.ts`, remove the `= []` default from `guardedSessionStore`'s `unreadable` parameter so it is required
- [x] 4.2 `[MISSING_BOUNDARY_TEST]` Add two `damagedCases` entries in `filesystem-session-store.test.ts`: a body with no `schemaVersion` key, and a body that is valid JSON but not an object; both assert the version-mismatch rejection (`names: ['undefined', '1']`, no `cause`)
- [x] 4.3 `[IMPLEMENTATION_COUPLED_TEST]` Widen `fsControl.mode`, add a `syncs both staged files before it renames either into place` test asserting `events` order, simplify the mid-write assertion, and rewrite `stageDurably` so its `sync` is the barrier and a `close` failure never masks the write/sync error [expert]
- [x] 4.4 `[UNTESTED_ERROR_PATH]` Add an `rm` wrapper + `removalFails` flag to the mock and a `keeps the write's own error when removing a staged file also fails` test proving cleanup failure never replaces the original rejection [expert]
- [x] 4.5 `[LEAKED_PROVIDER_ERROR]` Translate `save` and `list` filesystem failures into this module's own error type at the boundary (`unwritableSession`/`unlistableRoot` with `cause`); add a `rejects a listing whose root cannot be read` test; retarget the mid-write/cleanup message assertions to `cause.message` [expert]

## Phase 3: Verification
- [x] 3.1 Automated checks: install, build, test, coverage, typecheck, lint, format:check
- [x] 3.2 Scenario coverage audit against plan § Verification > Scenario Coverage
- [x] 3.3 Manual testing rows from plan § Verification > Manual Testing

# Verification Report: add-monorepo-scaffold

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | The pnpm workspace builds, tests, typechecks, lints, and format-checks clean on a fresh install. The four hexagonal ports are declared as types only; `core` carries no runtime dependency and no Node or third-party import in non-test source. All 28 plan scenarios have a passing test; all 9 manual steps pass. |
| Code review | 14 findings — 14 fixed |

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

Report-only (no threshold gate), v8 provider.

| Package | % Stmts | % Branch | % Funcs | % Lines |
|---------|---------|----------|---------|---------|
| `@chrysalyst/core` | 0/0 (n/a) | 0/0 (n/a) | 0/0 (n/a) | 0/0 (n/a) |
| `@chrysalyst/server` | 91.3 (21/23) | 66.66 (2/3) | 100 (9/9) | 90.9 (20/22) |
| `@chrysalyst/web` | 100 (1/1) | 100 (0/0) | 100 (1/1) | 100 (1/1) |

`core` reports 0/0 by design: it is a types-only package with no executable statement. The mission's ~90% `core` target applies once the first feature adds domain logic; it is not a defect of this scaffold.

### Test Results

| Suite | Run | Passed | Ignored |
|-------|-----|--------|---------|
| Root workspace (`tests/workspace.test.ts`) | 10 | 10 | 0 |
| `@chrysalyst/core` (runtime + type) | 12 | 12 | 0 |
| `@chrysalyst/server` (runtime + type) | 6 | 6 | 0 |
| `@chrysalyst/web` (integration) | 2 | 2 | 0 |
| **Total** | **30** | **30** | **0** |

Command: `pnpm -r --include-workspace-root test` → exit 0.

### Manual Tests

| Test | Result |
|------|--------|
| `corepack enable && pnpm install` — three projects resolved; `packages/server/node_modules/@chrysalyst/core` is a symlink (`-> ../../../core`) | ✓ |
| `pnpm typecheck` on a fresh install, no build run first — exit 0 | ✓ |
| `pnpm dev` — core `tsc --watch` ("Found 0 errors"), Vite ready on `:5173`, Node server on `:3000`; both answer HTTP 200 | ✓ |
| `pnpm --filter @chrysalyst/core test` — runtime and `*.test-d.ts` files both pass | ✓ |
| `pnpm --filter @chrysalyst/server dev` then `curl -s localhost:3000/health` → `{"status":"ok","version":"0.0.0"}` | ✓ |
| `curl -s -o /dev/null -w '%{http_code}' localhost:3000/nope` → `404` | ✓ |
| `ss -ltn | grep 3000` while dev server runs → `LISTEN 127.0.0.1:3000` (not `0.0.0.0:3000`) | ✓ |
| `pnpm --filter @chrysalyst/web dev` then open the printed URL → page serves 200, heading `chrysalyst` | ✓ |
| `pnpm --filter @chrysalyst/web build && ls packages/web/dist` → `index.html` and `assets/` (`index-*.js`, `index-*.css`) | ✓ |

## Tool Evidence

### Build

```
pnpm -r build → exit 0 (core/server typecheck-as-build; web emits dist/)
```

### Linter

```
pnpm lint  →  eslint .  →  exit 0, 0 errors, 0 warnings
```

### Formatter

```
pnpm format:check  →  prettier --check .  →  "All matched files use Prettier code style!"  →  exit 0
```

### Typecheck

```
pnpm typecheck  →  pnpm -r typecheck  →  core / server / web each exit 0
```

## Scenario Coverage

| Feature | Scenario | Test Location | Test Name | Passes |
|---------|----------|---------------|-----------|--------|
| monorepo-workspace | Workspace enumerates exactly the three packages | `tests/workspace.test.ts` | `enumerates exactly the three workspace packages` | Pass |
| monorepo-workspace | Every package is ESM and exposes the shared script set | `tests/workspace.test.ts` | `every package is ESM and declares the shared scripts` | Pass |
| monorepo-workspace | Packages resolve each other through source | `tests/workspace.test.ts` | `core exports TypeScript source rather than built output` | Pass |
| monorepo-workspace | Server depends on core through the workspace protocol | `tests/workspace.test.ts` | `server depends on core via the workspace protocol` | Pass |
| monorepo-workspace | Toolchain versions come from the catalog | `tests/workspace.test.ts` | `packages reference catalog versions` | Pass |
| monorepo-workspace | Root manifest pins runtime and package manager | `tests/workspace.test.ts` | `root pins pnpm and an engine floor that can strip types` | Pass |
| monorepo-workspace | Root scripts expose the mission command set | `tests/workspace.test.ts` | `root exposes the mission scripts without a build prerequisite` | Pass |
| monorepo-workspace | Core carries no runtime dependency | `tests/workspace.test.ts` | `core declares no runtime dependencies and its non-test source imports none` | Pass |
| monorepo-workspace | Server depends on the domain package | `tests/workspace.test.ts` | `dependency direction runs from server to core` | Pass |
| monorepo-workspace | Web package carries no internal dependency | `tests/workspace.test.ts` | `web depends on neither core nor server` | Pass |
| core-ports | Ports are reachable from the package entry point | `packages/core/src/ports/ports.test-d.ts` | `re-exports every port from the entry point` | Pass |
| core-ports | LlmPort streams a response incrementally | `packages/core/src/ports/ports.test.ts` | `streams chunks in order` | Pass |
| core-ports | LlmPort returns a whole response in one call | `packages/core/src/ports/ports.test.ts` | `completes a request without an iterator` | Pass |
| core-ports | LlmPort reports backend availability | `packages/core/src/ports/ports.test.ts` | `reports an unavailable backend with its model list` | Pass |
| core-ports | A long-running LLM call is cancellable | `packages/core/src/ports/ports.test.ts` | `stops streaming once the signal aborts` | Pass |
| core-ports | SessionStorePort round-trips a session | `packages/core/src/ports/ports.test.ts` | `round-trips a stored session` | Pass |
| core-ports | Loading an unknown session yields no session | `packages/core/src/ports/ports.test.ts` | `resolves undefined for an unknown session` | Pass |
| core-ports | SearchPort returns ranked hits | `packages/core/src/ports/ports.test.ts` | `returns hits carrying title, url and snippet` | Pass |
| core-ports | Search is the only optional dependency | `packages/core/src/ports/ports.test-d.ts` | `accepts an omitted search and rejects an omitted llm, sessions or clock` | Pass |
| core-ports | ClockPort supplies time to a caller | `packages/core/src/ports/ports.test.ts` | `returns the injected instant` | Pass |
| core-ports | A port rejects a non-conforming implementation | `packages/core/src/ports/ports.test-d.ts` | `rejects a non-conforming implementation` | Pass |
| http-server | Health route reports service status | `packages/server/src/app.test.ts` | `answers GET /health with ok and the manifest version` | Pass |
| http-server | Unknown route is rejected | `packages/server/src/app.test.ts` | `answers 404 for an unknown route` | Pass |
| http-server | App type is published for the typed client | `packages/server/src/client.test-d.ts` | `exposes the health route and rejects an undefined route` | Pass |
| http-server | Server binds a port and serves the app | `packages/server/src/server.test.ts` | `serves /health on a bound ephemeral port and releases it on close` | Pass |
| http-server | Server binds the loopback interface only | `packages/server/src/server.test.ts` | `binds 127.0.0.1 rather than every interface` | Pass |
| web-shell | Production build emits a loadable bundle | `packages/web/src/build.test.ts` | `emits index.html referencing a module asset into a temporary outDir` | Pass |
| web-shell | Placeholder screen renders into the mount point | `packages/web/src/App.test.tsx` | `renders the chrysalyst heading inside #root` | Pass |

Two tests beyond the plan's coverage table, both added during review for completeness:
`packages/core/src/ports/ports.test.ts` → `lists the identifier of every stored session` (exercises the otherwise-unused `SessionStorePort.list`);
`packages/server/src/server.test.ts` → `rejects when the port is already bound` (expert finding — the bind-failure path).

## Notes

- **Code review, all 14 findings fixed.** 3 expert: `startServer` now rejects with a chrysalyst error naming host and port on a bind failure (was an uncaught exception + hung promise); `ServerHandle` documented; the `@types/node` global leak into `core`'s typecheck program closed (`tsc --listFiles | grep /@types/node/` went 68 → 0), which makes `core/tsconfig.json`'s `lib: ["ES2023", "DOM"]` load-bearing — `AbortSignal` now resolves from the DOM lib, and `tsc --lib ES2023` fails as it should. 11 standard: added `"private": true` to `packages/core` (with a workspace-test assertion that catches it), decoupled tests from the `.nvmrc` literal and the `0.0.0` version literal, replaced a hand-rolled `exists` helper with `node:fs`, inlined the split Vitest config, extended `.prettierignore` to spare `specs/` and `.serena/`, added `js.configs.recommended` to the `.js` lint block, named the `SearchHit` type in a test double, documented `App`, and corrected CLAUDE.md (Fastify → Hono, Node ≥ 20 → ≥ 22.18, test command).
- **CLAUDE.md and README.md** were touched outside the plan's file set: CLAUDE.md to remove the Fastify / Node ≥ 20 / stale-test-command drift the mission edit (task 16) would otherwise contradict; README.md by `prettier --write` (one blank line after the H1). Both are documentation, no behavior.
- **`specs/mission.md`** was edited by task 16 (Hono, Node ≥ 22.18, `packages/server/` comment, `# Test` command). `/speq:record` does not touch the mission, so this edit is intentional and stands on its own.
- **Stale worktree removed.** `.claude/worktrees/add-monorepo-scaffold/` (branch `worktree-add-monorepo-scaffold`, no commits) was an abandoned earlier attempt; deleted, `.claude/` is gone.
- **No CI workflow** ships here — deferred to a dedicated plan, per the plan's Non-Goals.
- `core/vitest.config.ts` is no longer under `pnpm typecheck` (removed from the domain program to close the type leak); it is still type-checked during `pnpm lint` via `tsconfig.eslint.json`.

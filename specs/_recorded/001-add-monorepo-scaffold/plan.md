# Plan: add-monorepo-scaffold

## Summary

Stand up the pnpm workspace so that `core`, `server`, and `web` build, test, lint, and typecheck clean on a fresh clone. Declare the four hexagonal ports in `core` as types only, giving later features a boundary to program against.

## Design

### Context

chrysalyst has a mission and no code. Every later feature needs somewhere to land, and `openwiki --init` needs a structure to describe. The scaffold must therefore fix three things that are expensive to change later: the package boundaries, the direction dependencies run, and the toolchain versions.

The mission fixes the boundaries and the direction; this plan fixes the toolchain and turns the mission's prose about ports into compilable types. It also resolves the one option the mission left open — Fastify or Hono for the server.

- **Goals** — three packages that build, test, and lint clean; the four ports declared as types; one command set matching the mission; one place where toolchain versions live.
- **Non-Goals** — no port implementation and no adapter; no UI content or visual design; no API client in `web`; no HTTP route beyond a health probe; no CI workflow; no session, interview, or LLM logic.

### Decision

#### Architecture

Dependencies run inward. `web` and `server` are adapters; `core` is the domain and depends on nothing.

```
┌──────────────┐           ┌────────────────┐         ┌──────────────┐
│ @chrysalyst/ │           │  @chrysalyst/  │ imports │ @chrysalyst/ │
│     web      │           │     server     │────────▶│     core     │
│ (React/Vite) │           │ (Hono adapter) │  source │ (types only) │
└──────────────┘           └────────────────┘         └──────────────┘
  no internal dependency — the HTTP client arrives with the first interview feature
```

`core` declares ports; nothing in this plan implements them. `server` will host the adapters in a later feature — here it holds only the Hono app, a server factory, and its Node entry point. `web` renders a placeholder and depends on no internal package.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Ports and adapters | `core` declares, `server` will implement | Keeps domain logic free of Ollama, SearXNG, and the filesystem, per the mission |
| Dependency inversion | Port signatures use domain vocabulary | A port shaped around Ollama's API would leak that choice into every use case |
| Generic persistence port | `SessionStorePort<TState>` | The store persists whatever the domain defines; the session model does not exist yet and must not be guessed here |
| Optionality in the dependency set | `CoreDependencies.search` is the only optional member | The mission makes search optional; a type that admits its absence beats a boolean flag that can contradict the wiring |
| Source resolution | Packages export `src/*.ts`; no package emits JavaScript except `web` | Removes the build-before-test ordering entirely, so the mission's commands work on a clean checkout |
| Single version catalog | `catalog:` in `pnpm-workspace.yaml` | pnpm isolates each package's `node_modules`, so each package must declare its own tools; the catalog keeps one version per tool |
| Published route types | `server` exports `AppType` | Lets a future `hc` client mirror the API with no schema duplication and no code generation |

#### Key interfaces

Declared in `packages/core/src/ports/`, re-exported from the package entry point:

```ts
interface ClockPort { now(): Date }

interface LlmPort {
  status(signal?: AbortSignal): Promise<LlmBackendStatus>;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<string>;
  stream(request: LlmRequest, signal?: AbortSignal): AsyncIterable<string>;
}

interface SearchPort {
  search(query: string, signal?: AbortSignal): Promise<readonly SearchHit[]>;
}

interface SessionStorePort<TState> {
  list(): Promise<readonly SessionId[]>;
  load(id: SessionId): Promise<StoredSession<TState> | undefined>;
  save(session: StoredSession<TState>): Promise<void>;
}

interface CoreDependencies<TState> {
  readonly llm: LlmPort;
  readonly sessions: SessionStorePort<TState>;
  readonly clock: ClockPort;
  readonly search?: SearchPort;
}
```

Supporting types: `LlmRole`, `LlmMessage`, `LlmRequest`, `LlmBackendStatus`, `SearchHit`, `SessionId`, `StoredSession<TState>`.

`LlmRequest` carries `messages` and an optional `model` and nothing else. Structured output is deferred: no type in this plan describes a required response shape. See decision-log [6].

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| Hono for the server | Fastify | chrysalyst is localhost-only and single-user, so Fastify's scale maturity does not pay. Hono's `streamSSE` fits the streaming interview, and `hc<AppType>` will give a future client typed calls with no codegen |
| TypeScript pinned to `~6.0.3` | TypeScript 7.0.2 (latest) | typescript-eslint 8.69.0 declares `typescript >=4.8.4 <6.1.0`. The pin follows that declared peer range; the behaviour of the type-aware rules on TS 7 was not observed and is not predicted here |
| ESLint 10 | ESLint 9, as named in the interview | Flat config and the `strictTypeChecked` preset are identical across both; every plugin in this stack already supports 10. Verified installing clean under `--strict-peer-deps` |
| Packages resolve through `src/*.ts` | Exporting built `dist/` | Source resolution removes the build-before-test ordering, so the mission's `pnpm -r test` and `pnpm typecheck` work on a clean checkout. See decision-log [4] |
| `LlmPort` carries three methods | A single `stream()` plus a core collect helper | `status` serves the mission's backend-setup flow, `complete` serves contradiction checks that want a whole document, `stream` serves the interview. Forcing whole-response calls through an iterator would push the same loop into every call site |
| `SessionStorePort` is generic | A concrete session type now | The interview and spec model do not exist yet; inventing them here would be guessed domain design that the first real feature must then unpick |
| No `delete` on the session store | Full CRUD | The mission never asks to delete a session. Adding the method now would ship an untested boundary |
| Node type-stripping runs the server | A `tsx` dependency | Node 22.18 and newer execute `src/main.ts` directly, verified across the workspace symlink. Removes a dependency; `erasableSyntaxOnly` keeps the source strippable |
| Server binds `127.0.0.1` by default | Binding every interface, the `@hono/node-server` default | The mission constrains chrysalyst to localhost. Fixing the default here stops every later adapter inheriting an all-interfaces listener |

## Features

| Feature | Status | Spec |
|---------|--------|------|
| monorepo-workspace | NEW | `platform/monorepo-workspace/spec.md` |
| core-ports | NEW | `platform/core-ports/spec.md` |
| http-server | NEW | `platform/http-server/spec.md` |
| web-shell | NEW | `platform/web-shell/spec.md` |

## Impact

Contributors must run Node 22.18 or newer and activate pnpm through Corepack; the repository currently pins neither. `pnpm install` becomes a prerequisite for every other command. No build step precedes test or typecheck: packages resolve each other through TypeScript source, so the mission's commands work on a fresh clone.

This plan also edits `specs/mission.md` (task 16), because `/speq:record` merges spec deltas and never the mission. Four statements there go stale otherwise:

- the § Tech Stack server row still offers Fastify;
- the § Tech Stack runtime row still says Node.js ≥ 20, against this plan's floor of 22.18;
- the § Project Structure comment still says "Fastify-Server";
- the § Commands test command, `pnpm -r test`, never reaches the root workspace suite that holds nine of the 28 scenarios.

No behavior ships to end users: the scaffold contains no interview, no LLM call, and no persisted session. Nothing breaks, because nothing exists yet.

## Requirements

| Requirement | Details |
|-------------|---------|
| Runtime pin | `.nvmrc` holds `22.23.2`; root `engines.node` is `^22.18.0 \|\| >=24`. Node enables type stripping by default from 22.18.0, and the `server` dev loop runs `src/main.ts` unflagged |
| Package manager | Root `packageManager` field names `pnpm@12.3.4`, activated through Corepack |
| Module system | Every package sets `"type": "module"`. Vite 8's native config loader warns without it |
| Module resolution | `module: "preserve"` with `moduleResolution: "bundler"`, `allowImportingTsExtensions`, and `noEmit`. Relative imports carry an explicit `.ts` extension so Node resolves them unflagged |
| Type-aware linting | typescript-eslint `strictTypeChecked` with `projectService: true`, backed by a `tsconfig.eslint.json` that includes config and type-test files |
| Coverage | v8 provider, report only. The `packages/core` target of ~90% is documented, and no threshold fails a run |
| Port purity | `packages/core` declares no `dependencies`; its non-test source imports no Node built-in and no third-party module |
| Bind host | The server binds `127.0.0.1` unless a caller passes an explicit host |

## Dependencies

Versions below were resolved together and exercised in scratch workspaces under both npm (`--strict-peer-deps`) and pnpm with `catalog:` specifiers. Each entry is pinned in the `pnpm-workspace.yaml` catalog.

| Package | Version | Scope |
|---------|---------|-------|
| `typescript` | `~6.0.3` | all — capped below 6.1 by typescript-eslint |
| `vitest`, `@vitest/coverage-v8` | `^5.0.0` | all |
| `eslint` | `^10.10.0` | root |
| `@eslint/js` | `^10.0.1` | root — supplies `js.configs.recommended` |
| `typescript-eslint` | `^8.69.0` | root |
| `eslint-config-prettier` | `^10.1.8` | root |
| `eslint-plugin-react-hooks` | `^7.1.1` | root, applied to `web` files |
| `prettier` | `^3.9.6` | root |
| `globals` | `^17.12.0` | root |
| `@types/node` | `^22.20.1` | `server`, `web`, root tests |
| `hono` | `^4.13.7` | `server` |
| `@hono/node-server` | `^2.1.1` | `server` |
| `react`, `react-dom` | `^19.2.8` | `web` |
| `@types/react` | `^19.2.18` | `web` — React 19 ships no bundled types |
| `@types/react-dom` | `^19.2.7` | `web` |
| `vite` | `^8.2.2` | `web` |
| `@vitejs/plugin-react` | `^6.1.1` | `web` — needs no separate transformer package |
| `jsdom` | `^30.0.1` | `web` — DOM environment for the render test |
| `@testing-library/react` | `^16.3.3` | `web` — render harness for the placeholder screen |
| `@testing-library/dom` | `^10.4.1` | `web` — declared peer of `@testing-library/react` 16, which does not bundle it |

## Migration

Not applicable. The repository contains no code to migrate.

## Implementation Tasks

1. Create root workspace configuration: `pnpm-workspace.yaml` with the `packages/*` glob and the catalog from the Dependencies table, root `package.json` (`private`, `type: module`, `packageManager`, `engines.node` of `^22.18.0 || >=24`, scripts below), and `.nvmrc` holding `22.23.2`. Root scripts: `dev` → `pnpm -r --parallel dev`, `test` → `vitest run`, `typecheck` → `pnpm -r typecheck`, `lint` → `eslint .`, `lint:fix` → `eslint . --fix`, `format` → `prettier --write .`, `format:check` → `prettier --check .`. Neither `test` nor `typecheck` may invoke a build.
2. Extend `.gitignore` with `node_modules/`, `dist/`, `coverage/`, and `.vite/`.
3. Add `tsconfig.base.json` at the root: `target`/`lib` ES2023, `module: "preserve"`, `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `noEmit: true`, `resolveJsonModule: true`, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `skipLibCheck`.
4. Add root `eslint.config.js` (flat): `js.configs.recommended`, `tseslint.configs.strictTypeChecked` with `projectService: true`, `disableTypeChecked` for `**/*.js`, the react-hooks preset scoped to `packages/web/**`, `eslint-config-prettier` last, and ignores for `dist`/`coverage`. Add `tsconfig.eslint.json` extending the base and including `**/*.config.ts`, `**/*.test-d.ts`, and `tests/**` so every linted file reaches the project service. Relax `@typescript-eslint/no-unsafe-assignment` and `require-await` for `**/*.test.ts`, where hand-written async-generator doubles trip them. Add `.prettierrc.json` and `.prettierignore`.
5. Scaffold `packages/core`: manifest with no `dependencies` and `exports` of `./src/index.ts`; `tsconfig.json` extending the base and including sources and tests; `vitest.config.ts` enabling `typecheck` over `*.test-d.ts` plus v8 coverage with no threshold. Scripts — `build` → `pnpm run typecheck`, `typecheck` → `tsc -p tsconfig.json`, `test` → `vitest run`, `dev` → `tsc -p tsconfig.json --watch --preserveWatchOutput`.
6. Declare the four port interfaces, `CoreDependencies`, and their supporting types in `packages/core/src/ports/`, each with a doc comment stating the boundary's intent, and re-export them from `packages/core/src/index.ts`. `LlmRequest` carries `messages` and an optional `model`; declare no structured-output type. No implementations. [expert]
7. Write `packages/core/src/ports/ports.test.ts` — in-file test doubles exercising streaming order, cancellation, whole-response completion, backend status, session round-trip, unknown-session lookup, search hits, and the injected clock.
8. Write `packages/core/src/ports/ports.test-d.ts` — type-level assertions covering: the entry point's re-exports, asserted with the indexed form `type X = import('@chrysalyst/core').X` for each of `LlmPort`, `SearchPort`, `SessionStorePort`, `ClockPort`, `CoreDependencies`, and every supporting type, each checked with `expectTypeOf<X>()` against a conforming object literal; `CoreDependencies` accepting an omitted `search` while rejecting an omitted `llm`, `sessions`, or `clock`; and a deliberately non-conforming port implementation that must fail the type check. Do not use `typeof import('@chrysalyst/core')` — it yields the module's value namespace, which is empty for a types-only package.
9. Scaffold `packages/web`: manifest, `vite.config.ts` with `@vitejs/plugin-react`, `tsconfig.json` with `types: ["node"]` (the build test reads the filesystem), `vitest.config.ts` defaulting to the `jsdom` environment for `App.test.tsx`, `index.html`, `src/App.tsx` exporting the placeholder component with an `<h1>chrysalyst</h1>`, `src/main.tsx` mounting `App` into `#root`, and minimal vanilla `src/index.css`. Scripts — `build` → `vite build`, `typecheck` → `tsc -p tsconfig.json`, `test` → `vitest run`, `dev` → `vite`.
10. Write `packages/web/src/build.test.ts`, opening with the docblock `// @vitest-environment node` so the Vite build does not run inside jsdom. The test creates its output directory with `node:os` `tmpdir()` plus `node:fs/promises` `mkdtemp`, drives Vite's programmatic `build()` into that `outDir`, and reads the emitted `index.html` back with `node:fs/promises` to assert it exists and references a module asset. The package's default output directory is never written.
11. Write `packages/web/src/App.test.tsx` rendering `App` with `@testing-library/react` into a `#root` fixture and asserting the heading text.
12. Scaffold `packages/server`: manifest depending on `@chrysalyst/core` via `workspace:*`, `tsconfig.json` with `types: ["node"]`, `vitest.config.ts`, and sources — `src/app.ts` exporting the Hono app plus `AppType`, with the health route returning `status` and the `version` read via `import pkg from '../package.json' with { type: 'json' }`; `src/server.ts` exporting a factory taking a port and a host (defaulting to `127.0.0.1`) and returning the server handle plus a close function; `src/main.ts` containing only the factory invocation with the default port and host. Scripts — `build` → `pnpm run typecheck`, `typecheck` → `tsc -p tsconfig.json`, `test` → `vitest run`, `dev` → `node --watch src/main.ts`.
13. Write `packages/server/src/app.test.ts` — health route returning `ok` plus the manifest version, and a 404 for an unknown route.
14. Write `packages/server/src/server.test.ts` — the factory binding an ephemeral port, serving `GET /health` over it, binding `127.0.0.1` rather than every interface, and releasing the port on close. Write `packages/server/src/client.test-d.ts` asserting an `hc<AppType>` client exposes the health route and rejects an undefined route.
15. Write root `tests/workspace.test.ts` and its `vitest.config.ts`. The config sets `include: ['tests/**/*.test.ts']` and `environment: 'node'`, so the root suite covers only `tests/` and never re-runs a package's co-located tests under the wrong environment. The suite asserts package enumeration, ESM and script contracts, source-export and no-build-before-test assertions, workspace-protocol and dependency-direction checks, catalog usage, runtime/engine agreement, and the `core` purity assertions scoped to non-test files.
16. Update `specs/mission.md`: name Hono with `@hono/node-server` in the § Tech Stack server row, raise the runtime row to Node.js ≥ 22.18, change the § Project Structure comment for `packages/server/`, and change the `# Test` command in § Commands to `pnpm -r --include-workspace-root test` so the documented command reaches the root workspace suite.
17. Run the full Verification checklist end to end and fix what it surfaces.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1, 2, 3, 4 |
| Group B | 5+6+7+8 (core), 9+10+11 (web) |
| Group C | 12, 13, 14 |
| Group D | 15, 16 |
| Group E | 17 |

Sequential dependencies:
- Group A → Group B — every package config extends the root tsconfig, ESLint, and catalog.
- Group B → Group C — `server` imports `@chrysalyst/core` and resolves it through core's source.
- Group C → Group D — task 15's workspace assertions read `packages/server`'s manifest, so they cannot pass until Group C creates it.
- Group D → Group E — verification runs against the finished workspace.

Within Group B the core and web streams touch disjoint directories and may run concurrently. Tasks 5 through 8 are one ordered stream, as are 9 through 11.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| — | — | None. The repository has no source code; this plan only adds files |

## Verification

### Scenario Coverage

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| Workspace enumerates exactly the three packages | Integration | `tests/workspace.test.ts` | `enumerates exactly the three workspace packages` |
| Every package is ESM and exposes the shared script set | Integration | `tests/workspace.test.ts` | `every package is ESM and declares the shared scripts` |
| Packages resolve each other through source | Integration | `tests/workspace.test.ts` | `core exports TypeScript source rather than built output` |
| Server depends on core through the workspace protocol | Integration | `tests/workspace.test.ts` | `server depends on core via the workspace protocol` |
| Toolchain versions come from the catalog | Integration | `tests/workspace.test.ts` | `packages reference catalog versions` |
| Root manifest pins runtime and package manager | Integration | `tests/workspace.test.ts` | `root pins pnpm and an engine floor that can strip types` |
| Root scripts expose the mission command set | Integration | `tests/workspace.test.ts` | `root exposes the mission scripts without a build prerequisite` |
| Ports are reachable from the package entry point | Unit | `packages/core/src/ports/ports.test-d.ts` | `re-exports every port from the entry point` |
| Core carries no runtime dependency | Integration | `tests/workspace.test.ts` | `core declares no runtime dependencies and its non-test source imports none` |
| LlmPort streams a response incrementally | Unit | `packages/core/src/ports/ports.test.ts` | `streams chunks in order` |
| LlmPort returns a whole response in one call | Unit | `packages/core/src/ports/ports.test.ts` | `completes a request without an iterator` |
| LlmPort reports backend availability | Unit | `packages/core/src/ports/ports.test.ts` | `reports an unavailable backend with its model list` |
| A long-running LLM call is cancellable | Unit | `packages/core/src/ports/ports.test.ts` | `stops streaming once the signal aborts` |
| SessionStorePort round-trips a session | Unit | `packages/core/src/ports/ports.test.ts` | `round-trips a stored session` |
| Loading an unknown session yields no session | Unit | `packages/core/src/ports/ports.test.ts` | `resolves undefined for an unknown session` |
| SearchPort returns ranked hits | Unit | `packages/core/src/ports/ports.test.ts` | `returns hits carrying title, url and snippet` |
| Search is the only optional dependency | Unit | `packages/core/src/ports/ports.test-d.ts` | `accepts an omitted search and rejects an omitted llm, sessions or clock` |
| ClockPort supplies time to a caller | Unit | `packages/core/src/ports/ports.test.ts` | `returns the injected instant` |
| A port rejects a non-conforming implementation | Unit | `packages/core/src/ports/ports.test-d.ts` | `rejects a non-conforming implementation` |
| Health route reports service status | Integration | `packages/server/src/app.test.ts` | `answers GET /health with ok and the manifest version` |
| Unknown route is rejected | Integration | `packages/server/src/app.test.ts` | `answers 404 for an unknown route` |
| App type is published for the typed client | Unit | `packages/server/src/client.test-d.ts` | `exposes the health route and rejects an undefined route` |
| Server binds a port and serves the app | Integration | `packages/server/src/server.test.ts` | `serves /health on a bound ephemeral port and releases it on close` |
| Server binds the loopback interface only | Integration | `packages/server/src/server.test.ts` | `binds 127.0.0.1 rather than every interface` |
| Server depends on the domain package | Integration | `tests/workspace.test.ts` | `dependency direction runs from server to core` |
| Production build emits a loadable bundle | Integration | `packages/web/src/build.test.ts` | `emits index.html referencing a module asset into a temporary outDir` |
| Placeholder screen renders into the mount point | Integration | `packages/web/src/App.test.tsx` | `renders the chrysalyst heading inside #root` |
| Web package carries no internal dependency | Integration | `tests/workspace.test.ts` | `web depends on neither core nor server` |

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| monorepo-workspace | `corepack enable && pnpm install` | Three workspace projects resolved; `packages/server/node_modules/@chrysalyst/core` is a symlink into `packages/core` |
| monorepo-workspace | `pnpm typecheck` on a fresh clone, with no build run first | Exit 0 — proves source resolution needs no prior build |
| monorepo-workspace | `pnpm dev` | Vite dev server and the Node server start together and stay running until interrupted |
| core-ports | `pnpm --filter @chrysalyst/core test` | Runtime and type-test files both report as passing; the `*.test-d.ts` files appear in the run because `typecheck.enabled` is set in the package's Vitest config |
| http-server | `pnpm --filter @chrysalyst/server dev` then `curl -s localhost:3000/health` | `{"status":"ok","version":"0.0.0"}` |
| http-server | `curl -s -o /dev/null -w '%{http_code}' localhost:3000/nope` | `404` |
| http-server | `ss -ltnp \| grep 3000` while the dev server runs | The listen address is `127.0.0.1:3000`, not `0.0.0.0:3000` |
| web-shell | `pnpm --filter @chrysalyst/web dev` then open the printed URL | Page renders the heading `chrysalyst`; browser console shows no error |
| web-shell | `pnpm --filter @chrysalyst/web build && ls packages/web/dist` | `index.html` and an `assets/` directory are listed |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0, lockfile written |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures across all four suites |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; no threshold failure |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

`pnpm -r test` from the mission runs the three package suites; `--include-workspace-root` adds the root workspace suite. After `pnpm install`, no row depends on any other; the Build row is not a prerequisite for Test or Typecheck.

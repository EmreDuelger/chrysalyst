# Tasks: add-monorepo-scaffold

## Phase 2: Implementation (Group A — root config)
- [x] 2.1 Create root workspace config: `pnpm-workspace.yaml` (packages glob + catalog), root `package.json` (private, type module, packageManager, engines.node `^22.18.0 || >=24`, scripts), `.nvmrc` = `22.23.2`. `test`/`typecheck` must not invoke a build.
- [x] 2.2 Extend `.gitignore` with `node_modules/`, `dist/`, `coverage/`, `.vite/`.
- [x] 2.3 Add `tsconfig.base.json` (ES2023 target/lib, `module: preserve`, `moduleResolution: bundler`, `allowImportingTsExtensions`, `noEmit`, `resolveJsonModule`, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `skipLibCheck`).
- [x] 2.4 Add root `eslint.config.js` (flat, `strictTypeChecked` + `projectService`, react-hooks scoped to web, prettier last), `tsconfig.eslint.json`, `.prettierrc.json`, `.prettierignore`.

## Phase 2: Implementation (Group B — core stream)
- [x] 2.5 Scaffold `packages/core`: manifest (no deps, exports `./src/index.ts`), `tsconfig.json`, `vitest.config.ts` (typecheck over `*.test-d.ts` + v8 coverage no threshold), scripts.
- [x] 2.6 Declare the four ports + `CoreDependencies` + supporting types in `packages/core/src/ports/`, re-export from `src/index.ts`. No implementations. [expert]
- [x] 2.7 Write `packages/core/src/ports/ports.test.ts` — in-file doubles: streaming order, cancellation, whole-response completion, backend status, session round-trip, unknown-session lookup, search hits, injected clock.
- [x] 2.8 Write `packages/core/src/ports/ports.test-d.ts` — indexed-access type assertions per port + supporting type, optional `search` / required `llm`/`sessions`/`clock`, non-conforming impl fails. No `typeof import()`.

## Phase 2: Implementation (Group B — web stream)
- [x] 2.9 Scaffold `packages/web`: manifest, `vite.config.ts` (`@vitejs/plugin-react`), `tsconfig.json` (`types: ["node"]`), `vitest.config.ts` (jsdom default), `index.html`, `src/App.tsx` (`<h1>chrysalyst</h1>`), `src/main.tsx`, `src/index.css`, scripts.
- [x] 2.10 Write `packages/web/src/build.test.ts` (`// @vitest-environment node`) — programmatic Vite `build()` into a `mkdtemp` outDir, assert emitted `index.html` references a module asset.
- [x] 2.11 Write `packages/web/src/App.test.tsx` — render `App` into `#root` fixture, assert heading text.

## Phase 2: Implementation (Group C — server)
- [x] 2.12 Scaffold `packages/server`: manifest (`@chrysalyst/core` via `workspace:*`), `tsconfig.json` (`types: ["node"]`), `vitest.config.ts`, `src/app.ts` (Hono app + `AppType`, health route with `version` via json import assertion), `src/server.ts` (factory: port + host default `127.0.0.1`, returns handle + close), `src/main.ts` (factory invocation only), scripts.
- [x] 2.13 Write `packages/server/src/app.test.ts` — health route returns `ok` + manifest version; 404 for unknown route.
- [x] 2.14 Write `packages/server/src/server.test.ts` (ephemeral port, serves `/health`, binds `127.0.0.1` not all interfaces, releases port on close) + `packages/server/src/client.test-d.ts` (`hc<AppType>` exposes health, rejects undefined route).

## Phase 2: Implementation (Group D — workspace suite + mission)
- [x] 2.15 Write root `tests/workspace.test.ts` + `tests/vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `environment: 'node'`): package enumeration, ESM + script contracts, source-export / no-build-before-test, workspace-protocol + dependency-direction, catalog usage, runtime/engine agreement, `core` purity on non-test files.
- [x] 2.16 Update `specs/mission.md`: Tech Stack server row → Hono + `@hono/node-server`; runtime row → Node.js ≥ 22.18; Project Structure comment for `packages/server/`; `# Test` command → `pnpm -r --include-workspace-root test`.

## Phase 3: Verification (Group E)
- [x] 3.1 Run the full Verification checklist end to end and fix what it surfaces (task 17).
- [x] 3.2 Scenario coverage audit — every listed scenario has a passing test.
- [x] 3.3 Manual testing steps from the plan.

## Phase 4: Review Fixes
- [x] 4.1 In `packages/server/src/server.ts`, make `startServer` reject on a bind failure: take `reject` as the executor's second argument, declare a `failed` handler that rejects with `Cannot start the chrysalyst server on ${host}:${port}` wrapping the Node error as `cause`, attach it via `server.once('error', failed)` immediately after `serve(...)`, and remove it in the listening callback before resolving. Test-first: add `rejects when the port is already bound` to `packages/server/src/server.test.ts`. [expert]
- [x] 4.2 In `packages/server/src/server.ts`, add a JSDoc block above `export interface ServerHandle` stating that it is the handle a started server hands back, that `close` releases the bound port and resolves once the socket is closed, and that `server` is exposed so a caller can read the bound address. [expert]
- [x] 4.3 In `packages/core/tsconfig.json`, add `"types": []` to `compilerOptions` and remove `"vitest.config.ts"` from `include` so the domain program holds `src/**/*.ts` only; then add `'packages/*/vitest.config.ts'` to `parserOptions.projectService.allowDefaultProject` in `eslint.config.js`, removing that glob again if `pnpm lint` reports the file was also found in the project service. [expert]
- [x] 4.4 In `tests/workspace.test.ts`, add `readonly private?: boolean` to the `PackageManifest` interface and `expect(manifest.private, \`${dir} private\`).toBe(true)` to the `every package is ESM and declares the shared scripts` loop; confirm the assertion fails for `packages/core`, then add `"private": true` to `packages/core/package.json` directly after `"version"` and re-run the root suite.
- [x] 4.5 In `tests/workspace.test.ts` `root pins pnpm and an engine floor that can strip types`, replace the literal `.nvmrc` equality with a relational check that the pinned major/minor is admitted by the `engines.node` floor (`major > 22 || (major === 22 && minor >= 18)`); keep the `engines.node` assertion unchanged.
- [x] 4.6 In `packages/server/src/app.test.ts` line 15, replace `expect(pkg.version).toBe('0.0.0')` with `expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)`.
- [x] 4.7 In `packages/server/src/main.ts`, declare `const DEFAULT_PORT = 3000;` at module scope and call `await startServer(DEFAULT_PORT);`.
- [x] 4.8 In `packages/web/src/build.test.ts`, delete the `exists` helper and the `access` import, add `import { existsSync } from 'node:fs';`, and replace the three call sites with `existsSync(...)` (dropping `await`).
- [x] 4.9 Move the body of `tests/vitest.config.ts` into the root `vitest.config.ts` verbatim, then delete `tests/vitest.config.ts`; confirm `pnpm test` at root and `pnpm -r --include-workspace-root test` still reach the root suite.
- [x] 4.10 Add `specs/`, `.serena/`, `.claude/` to `.prettierignore`, run `pnpm format` (after finding 4.14's CLAUDE.md content edit), then confirm `pnpm format:check` exits 0 with no files listed.
- [x] 4.11 In `eslint.config.js`, add `js.configs.recommended` as the first `extends` entry of the `files: ['**/*.js']` block, keeping `tseslint.configs.disableTypeChecked` after it and `languageOptions` unchanged.
- [x] 4.12 In `packages/core/src/ports/ports.test.ts`, add `SearchHit` to the type import from `./index.ts` and change the `stubSearch` parameter type to `readonly SearchHit[]`.
- [x] 4.13 In `packages/web/src/App.tsx`, add a JSDoc block above `export function App` stating it is the application shell's placeholder screen, renders the product name only, and that visual design arrives with the first UI feature's impeccable subphase (decision-log [14]).
- [x] 4.14 In `CLAUDE.md`, change line 8 "Node ≥ 20" to "Node ≥ 22.18", line 9 "Fastify (server)" to "Hono + @hono/node-server (server)", and the cheatsheet `Test` row `pnpm -r test` to `pnpm -r --include-workspace-root test`; leave every other line untouched.

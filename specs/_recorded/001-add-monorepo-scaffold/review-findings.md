# Code Review Findings: add-monorepo-scaffold

## Summary

- Files reviewed: 44
- Total findings: 14 (standard: 11, expert: 3)

Verification run before review (all commands executed from the repo root):
`pnpm lint` → 0 errors · `pnpm typecheck` → exit 0 · `pnpm -r build` → exit 0 ·
`pnpm -r --include-workspace-root test` → 4 suites green (root 10, web 2, core 12, server 5) ·
`pnpm format:check` → **exit 1, 13 files** (finding [7]).

## Standard fixes

### tests/workspace.test.ts

#### [MISSING_BOUNDARY_TEST] The shared-manifest scenario never asserts its `"private": true` clause, and `core` omits it

- Location: lines 162-172 (`every package is ESM and declares the shared scripts`); defect in `packages/core/package.json` lines 2-4
- Issue: the monorepo-workspace scenario "Every package is ESM and exposes the shared script set" carries three MUST clauses — `"type": "module"`, the four shared scripts, and `"private": true`. The test asserts the first two and skips the third, so nothing caught that `packages/core/package.json` has no `"private": true` while `packages/web/package.json` (line 4) and `packages/server/package.json` (line 4) both do. Beyond the spec violation, a non-private manifest whose `exports` entry is `./src/index.ts` is publishable by accident and would publish an unusable package.
- Fix: In tests/workspace.test.ts, add `expect(manifest.private, \`${dir} private\`).toBe(true)` to the `every package is ESM and declares the shared scripts` loop and add `readonly private?: boolean` to the `PackageManifest` interface; run `pnpm test` at the repo root and confirm the new assertion fails for `packages/core`; then add `"private": true` to packages/core/package.json directly after the `"version"` field and re-run `pnpm test` to confirm all 10 root tests pass.

#### [IMPLEMENTATION_COUPLED_TEST] The runtime-pin test asserts the `.nvmrc` literal instead of the relationship the scenario states

- Location: line 217
- Issue: the scenario "Root manifest pins runtime and package manager" requires that "the `engines.node` range MUST admit the version written in `.nvmrc`". The test asserts `readText('.nvmrc').trim()).toBe('22.23.2')` — a literal equality that never compares the two artifacts. A routine `.nvmrc` bump to any other admitted version (22.24.0, 24.x) fails the suite with a message about a patch number, while a genuinely inadmissible pin like `22.14.0` would be reported the same way, giving the reader no signal about which spec clause broke.
- Fix: In tests/workspace.test.ts, in `root pins pnpm and an engine floor that can strip types`, replace the literal `.nvmrc` equality with a relational check: parse the trimmed `.nvmrc` contents into numeric `major` and `minor` via `.split('.').map(Number)`, then assert `expect(major > 22 || (major === 22 && minor >= 18), \`.nvmrc pins ${pinned}, which the engines.node floor must admit\`).toBe(true)`. Keep the existing `expect(root.engines?.node).toBe('^22.18.0 || >=24')` assertion unchanged. Run `pnpm test` at the repo root and confirm 10 tests pass.

### packages/server/src/app.test.ts

#### [IMPLEMENTATION_COUPLED_TEST] Health-route test pins the manifest version to the literal `0.0.0`

- Location: line 15
- Issue: `expect(pkg.version).toBe('0.0.0')` couples the suite to the package's current version number. The scenario only requires that the response carry "the server's `version` as declared in its manifest", which line 13 already asserts by comparing against `pkg.version`. The literal exists to stop the `toEqual` on line 11 passing vacuously when `version` is `undefined` (Vitest's `toEqual` ignores undefined members), but it makes the first version bump — which `/speq:implement-pr` performs as a routine step — fail a test that has nothing to say about versions.
- Fix: In packages/server/src/app.test.ts, replace `expect(pkg.version).toBe('0.0.0')` with `expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)` so the vacuity guard survives a version bump. Run `pnpm --filter @chrysalyst/server test` and confirm 5 tests pass.

### packages/server/src/main.ts

#### [MAGIC_NUMBER] The entry point's listen port is a bare literal

- Location: line 3
- Issue: `await startServer(3000)` states the default port as an unnamed literal. `packages/server/src/server.ts` names its counterpart decision as `DEFAULT_HOST`, so the port is the one binding decision in the package with no name attached to it, and the plan's Manual Testing rows (`curl -s localhost:3000/health`) depend on a number no symbol declares.
- Fix: In packages/server/src/main.ts, declare `const DEFAULT_PORT = 3000;` at module scope and call `await startServer(DEFAULT_PORT);`. Run `pnpm --filter @chrysalyst/server typecheck` and `pnpm lint` and confirm both exit 0.

### packages/web/src/build.test.ts

#### [STANDARD_LIBRARY_DUPLICATE] Hand-rolled `exists` helper reimplements `fs.existsSync` and swallows every error

- Location: lines 13-20
- Issue: `exists()` wraps `access()` in a bare `catch { return false }`. Node's standard library already answers this exact question with `existsSync`, so the helper is duplicated logic; and its catch-all converts any failure — EACCES, ENOTDIR, a path type error — into "the file is not there", which would report the build-output assertion on line 38 as a missing `index.html` and could make the default-outDir guard on line 43 compare `false` with `false` and pass while telling the reader nothing.
- Fix: In packages/web/src/build.test.ts, delete the `exists` helper and the `access` import, add `import { existsSync } from 'node:fs';`, and replace the three call sites with `existsSync(...)` (dropping their `await`). Run `pnpm --filter @chrysalyst/web test` and confirm 2 tests pass.

### vitest.config.ts

#### [SHRINKABLE] The root Vitest config is a one-line re-export of a second config file

- Location: vitest.config.ts line 1; the re-exported body is tests/vitest.config.ts lines 1-11
- Issue: one configuration is split across two files, where the root file's entire body is `export { default } from './tests/vitest.config.ts';`. The root `test` script is `vitest run` executed at the repo root, so only the root file is ever loaded; `tests/vitest.config.ts` has no other consumer and no separate run mode. A reader now opens two files to learn one `include` glob.
- Fix: Move the body of tests/vitest.config.ts into the root vitest.config.ts verbatim (the `defineConfig` call with `include: ['tests/**/*.test.ts']`, `environment: 'node'`, and the v8 coverage provider), then delete tests/vitest.config.ts. Run `pnpm test` at the repo root and confirm 1 test file and 10 tests pass, and `pnpm lint` to confirm 0 errors.

### .prettierignore

#### [TACTICAL_SHORTCUT] `pnpm format:check` fails out of the box, so a Verification checklist row is red

- Location: lines 1-5
- Issue: the plan's Checklist requires `pnpm format:check` to report no changes, and task 17 required the checklist to be run end to end. It exits 1: `pnpm exec prettier --check .` reports 13 files — `.serena/project.yml`, `CLAUDE.md`, `README.md`, and 10 speq artifacts under `specs/` (including `specs/mission.md`, `plan.md`, `decision-log.md`, the four delta specs, the two review rounds, and `tasks.md`). The ignore list covers build output only, so `pnpm format` as it stands would also rewrite every speq artifact — the plan and specs `/speq:record` is about to merge — and `.serena/project.yml`, which its own tool regenerates.
- Fix: Add `specs/`, `.serena/`, and `.claude/` as entries to .prettierignore, then run `pnpm format` (which will then only reformat CLAUDE.md and README.md, both table-alignment changes) and `pnpm format:check`, and confirm the check exits 0 with no files listed.

### eslint.config.js

#### [UNREACHABLE_CODE] The `**/*.js` block disables rules that were never enabled, so JavaScript files are linted with no rule set

- Location: lines 12-14 and 25-32
- Issue: `js.configs.recommended` and `tseslint.configs.strictTypeChecked` are both scoped to `files: ['**/*.{ts,tsx}']` (line 13), so no rule set ever applies to a `.js` file. The `**/*.js` block then extends `tseslint.configs.disableTypeChecked`, which only turns type-aware rules *off* — rules that were never on for that glob. The net effect is that `eslint.config.js` itself, and any future `.js` script, is parsed and checked against zero rules, while plan task 4 lists `js.configs.recommended` as part of the config.
- Fix: In eslint.config.js, add `js.configs.recommended` as the first entry of the `extends` array in the `files: ['**/*.js']` block, keeping `tseslint.configs.disableTypeChecked` after it and leaving `languageOptions` unchanged. Run `pnpm lint` and confirm 0 errors and 0 warnings.

### packages/core/src/ports/ports.test.ts

#### [INFORMATION_LEAKAGE] The search double restates `SearchHit`'s field set instead of naming the type

- Location: lines 61-63
- Issue: `stubSearch` declares its parameter as `readonly { title: string; url: string; snippet: string }[]`, duplicating the shape declared in `packages/core/src/ports/search.ts` lines 2-6. The same decision now lives in two files: adding or renaming a `SearchHit` member leaves this double compiling against the old shape, so the test would keep passing over a port it no longer mirrors. Every other double in the file (`stubLlm`, `memorySessionStore`, `fixedClock`) names its port type.
- Fix: In packages/core/src/ports/ports.test.ts, add `SearchHit` to the type import from `./index.ts` and change the `stubSearch` parameter type to `readonly SearchHit[]`. Run `pnpm --filter @chrysalyst/core test` and confirm 12 tests pass.

### packages/web/src/App.tsx

#### [MISSING_DOC_COMMENT] The package's only exported component carries no doc comment

- Location: line 3
- Issue: `App` is the web package's public surface — `main.tsx` mounts it and `App.test.tsx` renders it — and it is the one exported symbol in the changed set with no doc comment, against a codebase where every port, `app`, and `startServer` state their purpose and intent. A reader cannot tell from the signature that this is a deliberate placeholder whose visual design is deferred to the first UI feature (decision-log [14]).
- Fix: In packages/web/src/App.tsx, add a JSDoc block above `export function App` stating that it is the application shell's placeholder screen, that it renders the product name only, and that visual design arrives with the first UI feature's impeccable subphase. Run `pnpm --filter @chrysalyst/web typecheck` and confirm exit 0.

### CLAUDE.md

#### [OUTDATED_COMMENT] The project instructions still name Fastify, Node ≥ 20, and the command that misses the root suite

- Location: lines 8-9 and line 84
- Issue: task 16 corrected all four stale statements in `specs/mission.md` (verified in the diff: Hono, Node ≥ 22.18, the `packages/server/` comment, and `pnpm -r --include-workspace-root test`), but the same three facts are repeated in CLAUDE.md and were left behind. Line 8 says "Node ≥ 20", line 9 says "Fastify (server)", and line 84's cheatsheet still says `pnpm -r test`, which never reaches the root workspace suite that holds 10 of the 28 scenario tests. CLAUDE.md is the first document every agent reads, so this drift actively misinforms the next feature. (CLAUDE.md sits outside the changed-file list; it is raised here because this change created the contradiction.)
- Fix: In CLAUDE.md, change "Node ≥ 20" on line 8 to "Node ≥ 22.18", change "Fastify (server)" on line 9 to "Hono + @hono/node-server (server)", and change the `Test` row on line 84 from `pnpm -r test` to `pnpm -r --include-workspace-root test`. Leave every other line untouched.

## Expert fixes

### packages/server/src/server.ts

#### [UNTESTED_ERROR_PATH] `startServer` never rejects — a bind failure escapes as an uncaught exception and the promise hangs

- Location: lines 18-27
- Issue: the promise resolves only from the listening callback; no `'error'` listener is attached to the server. When the port is taken, `listen` emits `'error'` with no handler, so Node raises an uncaught exception and the returned promise never settles. Verified against the real factory: starting a second server on a port already bound by the first prints `UNCAUGHT EXCEPTION: EADDRINUSE - listen EADDRINUSE: address already in use 127.0.0.1:41677` and the second `startServer` call never resolves or rejects. This breaks three guardrails at once — the failure is not signalled through the language's error mechanism, the raw Node error names neither what was attempted nor the caller's host/port intent, and the failure path has no test. `main.ts` awaits this promise at top level, so the one realistic production failure (port 3000 in use) crashes with a bare Node stack instead of a chrysalyst error.
- Fix: In packages/server/src/server.ts, inside the `new Promise` executor of `startServer`, take `reject` as the second executor argument, declare `const failed = (cause: Error): void => { reject(new Error(\`Cannot start the chrysalyst server on ${host}:${String(port)}\`, { cause })); };` before the `serve(...)` call, attach it with `server.once('error', failed)` immediately after `serve(...)` returns, and call `server.removeListener('error', failed)` inside the listening callback before resolving. Then, test-first, add to packages/server/src/server.test.ts a case named `rejects when the port is already bound`: start a server on port 0 via the existing `running` handle, read its port with `boundAddress`, assert `await expect(startServer(port)).rejects.toThrow(/Cannot start the chrysalyst server on 127\.0\.0\.1:/)`, and let the existing `afterEach` close the first handle. Run the new test before the source change to confirm it fails, then after, and finish with `pnpm --filter @chrysalyst/server test` showing 6 tests passing.

#### [MISSING_DOC_COMMENT] `ServerHandle` states no contract for its two members

- Location: lines 7-10
- Issue: `ServerHandle` is exported and is the factory's entire return contract, but carries no doc comment. Nothing tells a caller that `close` is the only supported way to release the port, that it resolves once the socket is fully released, or that `server` is exposed for address inspection rather than for further mutation — which is exactly the knowledge the `close`-then-fetch assertion in `server.test.ts` depends on.
- Fix: In packages/server/src/server.ts, add a JSDoc block above `export interface ServerHandle` stating that it is the handle a started server hands back, that `close` releases the bound port and resolves once the socket is closed, and that `server` is exposed so a caller can read the bound address. Run `pnpm --filter @chrysalyst/server typecheck` and confirm exit 0.

### packages/core/tsconfig.json

#### [LEAKED_BOUNDARY_TYPE] The domain package's typecheck program contains all of `@types/node`'s globals, so port purity is unenforced

- Location: line 6 (`include` carries `vitest.config.ts`); the `lib` claim is line 4
- Issue: `packages/core` must declare no dependency and its non-test source must import no Node built-in and no third-party module (plan § Requirements, "Port purity"). The compiler does not hold that line. `include` pulls `vitest.config.ts` into the same program as `src/ports/*.ts`; that file imports `vitest/config`, which reaches `vite/dist/node/index.d.ts`, which carries `/// <reference types="node" />`. Verified with `pnpm exec tsc -p tsconfig.json --explainFiles`: `@types/node/index.d.ts` is in the program, reported as `Type library referenced via 'node' from .../vite/dist/node/index.d.ts`, and `@types/node/globals.d.ts` comes with it — whose line 3 is `declare var process: NodeJS.Process`. So `process`, `Buffer`, and every other Node global typecheck clean inside a port declaration today, and the purity test in `tests/workspace.test.ts` cannot catch it because it scans `import` specifiers only. The same leak makes the `"lib": ["ES2023", "DOM"]` line inert for the reason it was added: `pnpm exec tsc -p tsconfig.json --lib ES2023` still exits 0, because `AbortSignal` is currently coming from `@types/node`, not from the DOM lib. (The DOM lib is the correct declaration and must stay — with the leak closed it is load-bearing: compiling `src/index.ts` with `--lib ES2023,DOM --typeRoots /nonexistent` exits 0, while `--lib ES2023 --typeRoots /nonexistent` fails with four `TS2304: Cannot find name 'AbortSignal'`.)
- Fix: In packages/core/tsconfig.json, add `"types": []` to `compilerOptions` and remove `"vitest.config.ts"` from `include` so the domain program holds `src/**/*.ts` only. Then, so the config file stays linted, add `'packages/*/vitest.config.ts'` to `parserOptions.projectService.allowDefaultProject` in eslint.config.js; if `pnpm lint` then reports that `packages/core/vitest.config.ts` "was included by allowDefaultProject but also was found in the project service", remove that glob again and keep only the tsconfig change. Verify all four: `cd packages/core && pnpm exec tsc -p tsconfig.json --explainFiles | grep '@types/node'` prints nothing, `pnpm --filter @chrysalyst/core test` passes 12 tests, `pnpm lint` reports 0 errors, and `pnpm typecheck` exits 0.

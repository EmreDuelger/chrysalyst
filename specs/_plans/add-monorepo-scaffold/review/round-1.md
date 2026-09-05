# Plan Review Findings: add-monorepo-scaffold (round 1)

## Summary
- Axes checked: 6/6
- Total findings: 17 (Blockers: 9, Advisory: 8)
- Intent Fidelity blockers: 1

## Premortem

Three failure stories, each routed into the taxonomy below.

1. **The scaffold does not build on a second machine.** A contributor installs the Node version the repo's own `engines` field permits (22.13), runs `pnpm --filter @chrysalyst/server dev`, and Node refuses to execute `src/main.ts` — type stripping became a default only in 22.18.0. The same contributor runs the mission's documented `pnpm -r test` and it fails, because packages resolve each other through `dist/` and no script builds first. → `[HIDDEN_DEPENDENCY]`, `[REQUIREMENT_CONFLICT]`.
2. **Implementation stalls on tasks that cannot go green.** Task 14 asserts `@chrysalyst/server`'s manifest while `packages/server` does not yet exist; task 12 tests a "server factory" no task creates; task 8's runtime `index.test.ts` asserts re-exports from a types-only entry point that emits zero runtime bindings. Three tasks fail for reasons the implementer must redesign around, not fix. → `[TASK_GRANULARITY]`, `[TRACEABILITY_GAP]`.
3. **The recorded specs enshrine wrong defaults.** `/speq:record` merges a deltas set that forbids filesystem access while requiring a manifest version at runtime, leaves the server's bind host unconstrained against a mission that says localhost-only, and asserts a `core` purity rule its own test files violate. Every later feature inherits all three. → `[REQUIREMENT_CONFLICT]`, `[NFR_IGNORED]`.

## Intent Fidelity

The plan holds the line on the interview's substantive decisions: Hono, no CI, deferred styling, `strictTypeChecked`, coverage without a gate, `.nvmrc` plus `packageManager` plus `engines`, no composite references, co-located tests. The two flagged tool-version deviations are sound and I verified both against the registry — `typescript-eslint@8.69.0` really does declare `typescript: ">=4.8.4 <6.1.0"` and `eslint: "^8.57.0 || ^9.0.0 || ^10.0.0"`, and `eslint@10.10.0` is the current release. Neither deviation is a finding. A third, unlogged deviation is.

#### [INTENT_DRIFT] BLOCKER
- Location: plan.md § Implementation Tasks, task 3; decision-log.md § Interview, final answer
- Issue: The interview settled TypeScript `moduleResolution: "bundler"`. Task 3 specifies "`module` NodeNext" instead, with no decision-log entry acknowledging the reversal. The two are mutually exclusive, not merely different — `tsc` 6.0.3 on a config carrying both emits `error TS5109: Option 'moduleResolution' must be set to 'NodeNext' (or left unspecified) when option 'module' is set to 'NodeNext'` (verified). NodeNext also forces explicit `.js` extensions on every relative import, the ergonomic cost `bundler` exists to avoid, and it is the wrong default for the Vite-built `web` package.
- Fix: Set `module` to `preserve` (or `ESNext`) with `moduleResolution: "bundler"` in task 3's `tsconfig.base.json` option list, matching the interview. If NodeNext is genuinely required — state which package needs it and why — add a numbered decision to decision-log.md § Design Decisions recording the reversal, its extension-suffix consequence, and the `web` override, and restate the interview answer's `moduleResolution` line as superseded.

#### [SCOPE_CREEP] ADVISORY
- Location: plan.md § Implementation Tasks, task 13; decision-log.md § Design Decisions [13]
- Issue: The elaborated intent says "no adapters yet — those come with the first real feature." Task 13 ships `packages/web/src/client.ts`, a live `hc<AppType>` client with no caller, plus two type-test files and a new `web → server` package edge. A driving adapter's HTTP client is exactly the deferred work. `packages/server/src/client.test-d.ts` already proves `AppType` is publishable without shipping a client in `web`.
- Fix: Delete `packages/web/src/client.ts` and `packages/web/src/client.test-d.ts` from task 13, keeping only `packages/server/src/client.test-d.ts`. Move the "Typed client mirrors the server routes" scenario from `platform/web-shell/spec.md` into `platform/http-server/spec.md`, and drop the corresponding row from plan.md § Verification § Scenario Coverage.

## Feasibility

Dependency versions are real and mutually resolvable — I confirmed `hono@4.13.7`, `@hono/node-server@2.1.1`, `vite@8.2.2`, `vitest@5.0.0`, `typescript@6.0.3`, and the typescript-eslint peer ranges against the npm registry, and confirmed Node 22.23.2 executes a `.ts` entry point directly. Note that the Dependencies preamble cites `npm install --strict-peer-deps` as the verification, while the workspace runs pnpm with `catalog:` specifiers; the two resolvers differ on peers. The findings below are not version errors.

#### [HIDDEN_DEPENDENCY] BLOCKER
- Location: plan.md § Requirements, "Runtime pin" row; decision-log.md § Design Decisions [12]
- Issue: Two errors compound. First, the stated rationale is wrong: `eslint@10.10.0` declares `engines.node` as `^20.19.0 || ^22.13.0 || >=24` (verified), so ESLint 10 does not "refuse Node below 22.13" — it accepts 20.19. Second, the resulting floor is too low for the plan's own dev loop: Node enabled type stripping by default in **22.18.0** (CHANGELOG_V22, "Type stripping is enabled by default", 2025-07-31). `engines.node: "^22.13.0 || >=24"` therefore admits 22.13 through 22.17, where decision [12]'s `node --watch src/main.ts` fails outright. The workspace test only checks that the range admits `.nvmrc` (22.23.2), so it passes while the range is wrong.
- Fix: Change plan.md § Requirements "Runtime pin" to `engines.node` of `^22.18.0 || >=24`, and replace the "ESLint 10 refuses Node below 22.13" rationale with "Node enables type stripping by default from 22.18.0". Update decision-log.md [12] rationale with the same floor. Add an *AND* clause to the `platform/monorepo-workspace/spec.md` scenario "Root manifest pins runtime and package manager": the `engines.node` range MUST NOT admit a Node version that cannot execute a TypeScript entry point without a flag.

#### [HIDDEN_DEPENDENCY] BLOCKER
- Location: plan.md § Dependencies, `hono` row; plan.md § Implementation Tasks, task 13
- Issue: `hono` is scoped to `server` alone. Task 13 has `packages/web/src/client.ts` build `hc<AppType>`, but `hc` is runtime code imported from `hono/client` — not a type from `@chrysalyst/server`. Decision [13] declares only `@chrysalyst/server` as a type-only devDependency, which covers `AppType` and nothing else. Under pnpm's isolated `node_modules`, `web` cannot resolve `hono/client`, so `pnpm --filter @chrysalyst/web build` fails and the "Production build emits a loadable bundle" scenario cannot pass.
- Fix: If the `[SCOPE_CREEP]` advisory above is not taken, change plan.md § Dependencies to scope `hono` as `server`, `web` and state that `web` imports `hc` from `hono/client` at runtime. If the client is dropped from `web`, leave the scope unchanged.

#### [NFR_IGNORED] BLOCKER
- Location: `platform/http-server/spec.md` § Scenario "Server binds a port and serves the app"; plan.md § Implementation Tasks, task 11
- Issue: No spec scenario, requirement, or task names the bind host. `@hono/node-server@2.1.1` passes `hostname: options.hostname` straight to `server.listen` (verified in its `dist/index.mjs`), so omitting it binds every interface. The mission constrains chrysalyst to "Lokale Web-App auf `localhost` … keine Cloud, keine Accounts", and this server will later proxy a local LLM and read session files off disk. The scaffold is the cheap moment to fix the default; once the scenario is recorded without it, every adapter inherits an all-interfaces listener.
- Fix: Add to `platform/http-server/spec.md` a scenario "Server binds the loopback interface only" asserting the server MUST bind `127.0.0.1` and MUST NOT accept a connection on a non-loopback address. Add the loopback host to task 11's `src/main.ts` description, and add a matching row to plan.md § Verification § Scenario Coverage pointing at `packages/server/src/server.test.ts`.

#### [UNSTATED_ASSUMPTION] ADVISORY
- Location: plan.md § Implementation Tasks, task 4; plan.md § Verification § Checklist, "Lint" row
- Issue: Task 4 exempts only `**/*.js` from type-aware linting, but `projectService: true` type-checks every linted `.ts` file and errors on any file no tsconfig includes. `vite.config.ts`, each `vitest.config.ts`, and the `*.test-d.ts` files are `.ts` and are typically outside an app tsconfig's `include`. The Checklist demands "0 errors, 0 warnings", so this surfaces as a hard failure late, in task 15's catch-all. `strictTypeChecked` over hand-written async-generator test doubles adds a second wave (`no-unsafe-assignment`, `require-await`, `no-confusing-void-expression`).
- Fix: Extend task 4 to state how config files reach the project service — either a root `tsconfig.eslint.json` that includes `*.config.ts` and `**/*.test-d.ts`, or `projectService.allowDefaultProject` listing them — and say explicitly which `strictTypeChecked` rules are relaxed for `**/*.test.ts`, if any.

#### [UNSTATED_ASSUMPTION] ADVISORY
- Location: decision-log.md § Design Decisions [4] and [12]; plan.md § Implementation Tasks, tasks 1, 5, 9, 11
- Issue: Decision [4] resolves `@chrysalyst/core` through built `dist/`; decision [12] runs `server` from TypeScript source under `node --watch`. Combined, `pnpm dev` watches `server`'s source but never rebuilds `core`, so an edit to a port silently serves a stale `dist`. No task states what any package's `dev` or `build` script actually contains — the specs mandate that the four script names exist, nothing more — so whether `core`'s `dev` is a watch build is left to the implementer.
- Fix: Add the script bodies to tasks 5, 9, and 11 (name the command for `build`, `test`, `typecheck`, `dev` per package), making `core`'s `dev` a watch build (`tsc -p tsconfig.build.json --watch --preserveWatchOutput`), and note the staleness hazard and its resolution in decision-log.md [4].

## Requirement Quality

#### [REQUIREMENT_CONFLICT] BLOCKER
- Location: `platform/http-server/spec.md` § Background and § Scenario "Health route reports service status"
- Issue: The Background states the app has "no filesystem access". The health scenario requires "the response body MUST carry the server's `version` as declared in its manifest", and plan.md § Verification § Manual Testing expects `{"status":"ok","version":"0.0.0"}`. Reading the manifest at runtime is a filesystem read, whether through `readFile` or a JSON import assertion. Task 11 names neither mechanism, so the implementer must either violate the Background or invent a build-time injection the plan never specifies — and after the build, the relative path shifts from `src/` to `dist/`.
- Fix: Reword the `platform/http-server/spec.md` Background to "no filesystem access beyond a static import of the package's own manifest", and add to task 11 the mechanism: `import pkg from '../package.json' with { type: 'json' }` plus `resolveJsonModule` in the server tsconfig. If the Background must stay absolute instead, change the scenario to require a version string injected as a module constant and say where it comes from.

#### [REQUIREMENT_CONFLICT] BLOCKER
- Location: plan.md § Impact; decision-log.md § Design Decisions [4]; specs/mission.md § Commands
- Issue: The mission documents `pnpm -r test` and `pnpm typecheck` as standalone commands. Decision [4] makes both fail on a clean checkout: `server` resolves `@chrysalyst/core` through `dist/`, and (with task 13) `web` type-checks against `server`'s emitted declarations. The plan acknowledges the ordering in § Impact and orders the Checklist accordingly, but nothing enforces it — no `pretest` hook, no composed root script, no spec scenario. A contributor or agent following the mission's own cheatsheet gets a resolution error, and the natural diagnosis is a broken install, not a missing build.
- Fix: Add to task 1's root `package.json` script list a `test` script of `pnpm -r build && pnpm -r --include-workspace-root test` and a `typecheck` script that builds first, then update plan.md § Verification § Checklist to use them. Add an *AND* clause to the `platform/monorepo-workspace/spec.md` scenario "Root scripts expose the mission command set": the root `test` script MUST build every package before running any suite.

#### [COMPLETENESS_GAP] ADVISORY
- Location: `platform/core-ports/spec.md` § Scenario "Core carries no runtime dependency"
- Issue: The scenario requires that "the package source MUST NOT import a third-party module", but task 7 places `packages/core/src/ports/ports.test.ts` inside that source tree and it imports `vitest`. Implemented literally, the workspace assertion `core declares no runtime dependencies and imports no built-ins` fails; implemented sensibly, the recorded spec no longer describes the test. The Background's "Test doubles … live in `@chrysalyst/core`'s own test files" implies the exemption without stating it.
- Fix: Scope both *AND* clauses of that scenario to non-test files — "the package's non-test source MUST NOT import a Node built-in module" and "… MUST NOT import a third-party module" — and add an *AND* clause stating that `*.test.ts` and `*.test-d.ts` files are excluded from the assertion.

#### [COMPLETENESS_GAP] ADVISORY
- Location: plan.md § Impact; specs/mission.md § Tech Stack and § Project Structure
- Issue: § Impact records that Hono supersedes the mission's "Fastify (Alternative Hono)" wording, but no task updates `specs/mission.md`, and `/speq:record` merges spec deltas, not the mission. Three mission statements will be stale on merge: the Tech Stack "Server | Fastify (Alternative Hono …)" row, the Project Structure comment "server/ # Fastify-Server", and "Runtime | Node.js ≥ 20", which contradicts the plan's engine floor. `/speq:audit` will report mission drift on the first run after this plan lands.
- Fix: Add an implementation task: update `specs/mission.md` § Tech Stack to name Hono with `@hono/node-server` and Node.js ≥ 22.18, and update the § Project Structure comment for `packages/server/`. List the mission edit in plan.md § Impact.

## Task Breakdown

#### [TRACEABILITY_GAP] BLOCKER
- Location: plan.md § Implementation Tasks, tasks 11 and 12; `platform/http-server/spec.md` § Scenario "Server binds a port and serves the app"
- Issue: The scenario is written against "the Node server factory" and is verified by `packages/server/src/server.test.ts`, but task 11 creates only `src/app.ts` and `src/main.ts`. No task produces `src/server.ts`, and no artifact defines a factory taking a port. If the test imports `main.ts` instead, importing it binds port 3000 as a module side effect — the test then races the dev server and cannot bind an ephemeral port cleanly.
- Fix: Add `src/server.ts` to task 11, exporting a factory that takes a port and a host and returns the server handle plus a close function, and state that `src/main.ts` contains only the invocation with the default port and loopback host. Update the § Verification § Scenario Coverage row for "Server binds a port and serves the app" if the test file name changes.

#### [TASK_GRANULARITY] BLOCKER
- Location: plan.md § Parallelization, Group B; plan.md § Implementation Tasks, task 14
- Issue: Group B runs task 14 alongside the `core` and `web` streams, before Group C creates `packages/server`. Task 14 asserts "package enumeration, … workspace-protocol and dependency-direction checks" — every one of those reads `@chrysalyst/server`'s manifest. The task cannot go green in Group B, so it is not verifiable as one unit at the point the plan schedules it, and the stated Group B → Group C boundary is false.
- Fix: Move task 14 from Group B to a position after Group C in plan.md § Parallelization (its own group, or alongside Group D), and add the sequential dependency line "Group C → task 14 — the workspace assertions read `packages/server`'s manifest".

#### [TRACEABILITY_GAP] BLOCKER
- Location: plan.md § Implementation Tasks, task 8; plan.md § Verification § Scenario Coverage, row "Ports are reachable from the package entry point"
- Issue: The row maps that scenario to an Integration test in `packages/core/src/index.test.ts` named `re-exports every port from the entry point`. `core` is types-only by construction, so `dist/index.js` carries zero runtime bindings — a runtime import of `@chrysalyst/core` yields an empty namespace. The mapped test cannot assert what its name claims; the only runtime fact available is that nothing is exported, which is the opposite assertion. Task 8's "entry-point re-export coverage" in `index.test.ts` implements nothing verifiable.
- Fix: Move the entry-point re-export assertions from `index.test.ts` into `packages/core/src/ports/ports.test-d.ts` as `expectTypeOf` checks against `import('@chrysalyst/core')`, drop `index.test.ts` from task 8, and change the § Scenario Coverage row's Test Type to Unit with the `*.test-d.ts` location and a matching test name.

## Design Depth

Dependency direction, port vocabulary, and module boundaries are sound: `core` names no provider, `AbortSignal` is a platform primitive rather than a framework leak, `SessionStorePort<TState>` refuses to guess the domain model, and `web` reaching `core` only through the server's HTTP surface keeps the hexagon intact. `LlmPort`'s three methods are each justified by a distinct mission requirement rather than being special cases of one another — no classitis. One decision has no artifact.

#### [SHALLOW_DESIGN] ADVISORY
- Location: decision-log.md § Design Decisions [8]; `platform/core-ports/spec.md` § Scenario "Search is optional for a caller"; plan.md § Design § Patterns, "Absence as configuration" row
- Issue: The decision that "an omitted `SearchPort` means search is disabled" is not expressed anywhere in shipped code. `core` declares four standalone port types and no dependency bundle, so the scenario's type test must invent a local `{ search?: SearchPort }` in the test file — it then asserts that TypeScript supports optional properties, not that chrysalyst models search this way. The first interview feature is free to add `searchEnabled: boolean` without contradicting a single recorded artifact, which is precisely what the decision meant to prevent.
- Fix: Add to task 6 a `CoreDependencies` type in `packages/core/src/ports/` declaring `llm`, `sessions`, and `clock` as required and `search` as optional, export it from the entry point, and rewrite the "Search is optional for a caller" scenario to assert against that type. Otherwise delete decision [8], the Patterns row, and the scenario.

#### [BOUNDARY_VIOLATION] ADVISORY
- Location: plan.md § Design § Key interfaces; `platform/core-ports/spec.md` § Scenario "LlmPort returns a whole response for structured requests"
- Issue: `LlmRequest` carries a `JsonSchema` supporting type, listed in § Key interfaces. `JsonSchema` is a wire-format vocabulary belonging to a specific class of LLM backend (Ollama's structured-output field, OpenAI-compatible response formats), not to chrysalyst's domain. Declaring it in `core` reflects a provider's API shape across the boundary the ports exist to defend, and the scenario locks it in as recorded spec. Every future adapter must now speak JSON Schema even if its backend does not.
- Fix: State in decision-log.md [6] why `JsonSchema` is domain vocabulary rather than provider vocabulary, or replace it in § Key interfaces with a domain-named alias whose adapter-side translation is the adapter's business, and reword the scenario's "a request carrying a JSON schema" accordingly.

#### [TACTICAL_SHORTCUT] ADVISORY
- Location: plan.md § Implementation Tasks, task 10; `platform/web-shell/spec.md` § Scenario "Built page carries the placeholder shell"
- Issue: The scenario claims the bundle "MUST mount the application into the element with id `root`", but the only stated method is string inspection of a production bundle — a substring match on `root` proves nothing about mounting, and the `chrysalyst` heading check is equally satisfied by a comment. No DOM environment (`jsdom`, `happy-dom`) appears in § Dependencies, so no rendering assertion is possible. The test also drives Vite's `build()` into the package's real `dist/`, clobbering the artifact `pnpm -r build` just produced.
- Fix: Add `jsdom` (or `happy-dom`) to plan.md § Dependencies scoped to `web`, split task 10 into a build-output test (Vite `build()` into a temporary `outDir`, asserting `index.html` references a module asset) and a render test mounting `src/main.tsx` into a DOM fixture and asserting the heading inside `#root`. Update the two § Scenario Coverage rows to match.

## Prose Quality

Headings, register, and terminology are consistent; RFC-2119 keywords are used correctly and sparingly across all four spec deltas; the Consequences and Design Decisions tables lead with the decision. Two defects.

#### [PROSE_BLOAT] ADVISORY
- Location: plan.md § Summary
- Issue: Both sentences break the 25-word cap. The first runs 39 words ("Stand up the pnpm workspace … pass on a clean checkout"), the second 28. The Summary is the section most often read alone.
- Fix: Rewrite plan.md § Summary as two sentences of at most 25 words each, leading with the outcome — the three packages build, test, and lint clean — and stating the ports declaration second.

#### [PROSE_UNCLEAR] ADVISORY
- Location: plan.md § Design § Consequences, "TypeScript pinned to `~6.0.3`" row; decision-log.md § Design Decisions [2]
- Issue: The two artifacts give incompatible failure modes for the same decision. plan.md says TypeScript 7 "would silently disable type-aware linting"; decision-log.md says "the type-aware rules degrade rather than error loudly". Silent disabling and loud degradation are different claims, and a reader cannot tell which risk the pin actually buys down. typescript-eslint emits an unsupported-version warning banner, so "silently" is the weaker claim.
- Fix: Use one description in both artifacts. State the observed behaviour on the unsupported version and, if it was not observed, say that the pin follows the declared peer range `>=4.8.4 <6.1.0` without predicting the failure mode.

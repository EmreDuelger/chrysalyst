# Decision Log: add-monorepo-scaffold

## Interview

**Q:** How far does the scaffold go?
**A:** Skeleton plus port interfaces. The three packages build, test, and lint clean; `core` defines `LlmPort`, `SearchPort`, `SessionStorePort`, and `ClockPort` as pure TypeScript interfaces with no implementations. No UI content and no real endpoint.

**Q:** Which server framework? The mission left Fastify and Hono open and said the first plan decides.
**A:** Hono, with `@hono/node-server`. chrysalyst is localhost-only, Node-only, and single-user, so Fastify's maturity-at-scale and Hono's run-anywhere portability both stop mattering. What remains and favours Hono: built-in `streamSSE` for streaming the local LLM, the typed `hc` client giving `web` typed calls into `server` for free, and a minimalism matching the thin adapter layer the server package is in a hexagonal design.

**Q:** Does this scaffold include GitHub Actions CI?
**A:** No — a separate small plan later. This scaffold is local setup only.

**Q:** Decide the React styling approach now, or defer it?
**A:** Defer to the impeccable design skill in the first UI feature. The scaffold uses minimal vanilla CSS only.

**Q:** How strict should ESLint be?
**A:** typescript-eslint `strictTypeChecked` on a flat config, with Prettier as a separate formatter.

**Q:** Coverage in this scaffold?
**A:** Configure only, no gate. Vitest v8 coverage runs and reports; the ~90% target for `packages/core` is documented but nothing fails. Enforcement arrives with the CI plan.

**Q:** Adopt the conventions bundle as stated?
**A:** Yes. `.nvmrc` (Node 22) plus a `packageManager` field (pnpm via Corepack) and `engines`. `pnpm dev` is `pnpm -r --parallel dev`. Tests co-located as `*.test.ts` next to source. ESM everywhere, TypeScript `moduleResolution: "bundler"`, and no composite or project references — Vitest and tsc run per package.

## Design Decisions

### [1] Hono is the server framework

- **Decision:** `packages/server` is built on Hono 4 with `@hono/node-server` 2. This settles the mission's open "Fastify (Alternative Hono)" entry.
- **Alternatives:** Fastify — richer plugin ecosystem, schema-first validation, Node-native maturity. Rejected because its strengths address scale and operational surface that a single-user localhost tool never encounters.
- **Rationale:** Two Hono features map directly onto mission requirements. `streamSSE` serves the mission's demand that LLM answers stream back to the UI. `hc<AppType>` gives a client compile-time knowledge of the server's routes with no schema duplication and no code generation, which matters because `web` is a driving adapter that must not drift from the API.
- **Promotes to ADR:** yes

### [2] TypeScript is pinned below 6.1 despite 7.0 being current

- **Decision:** Pin `typescript` to `~6.0.3` across the catalog.
- **Alternatives:** TypeScript 7.0.2, the current release. Rejected. Also considered dropping type-aware linting to unblock TS 7 — rejected against the interview's explicit `strictTypeChecked` requirement.
- **Rationale:** typescript-eslint 8.69.0 declares `typescript >=4.8.4 <6.1.0`. The pin follows that declared peer range. Behaviour on an unsupported TypeScript was not observed and is deliberately not predicted here. The pin uses `~` rather than `^` because `^6.0.3` would admit 6.1, which is already outside the supported range. Revisit when typescript-eslint ships TS 7 support.
- **Promotes to ADR:** yes

### [3] ESLint 10 instead of the ESLint 9 named in the interview

- **Decision:** Use ESLint 10.10.0.
- **Alternatives:** ESLint 9, as the interview stated.
- **Rationale:** The interview's intent was flat config plus `strictTypeChecked`, and both are identical on 9 and 10. Every plugin in this stack — typescript-eslint 8.69, eslint-plugin-react-hooks 7.1, eslint-config-prettier 10.1 — already declares support for `^10.0.0`. The whole set resolved clean under `--strict-peer-deps`. Choosing 9 would start the project one major version behind for no gain.
- **Promotes to ADR:** no

### [4] Packages resolve each other through TypeScript source, not built output

- **Decision:** Each internal package's `exports` entry points at `src/*.ts`. No package emits JavaScript except `web`, whose artifact Vite produces. `build` for `core` and `server` runs the package's own `typecheck`, since verified source is the whole product. Relative imports carry an explicit `.ts` extension, permitted by `allowImportingTsExtensions` under `module: "preserve"` and required by Node at runtime.
- **Alternatives:** Export built `dist/` with `types` at the emitted `.d.ts` — the original plan, reversed here. A `development` export condition resolving to source with `dist` for production, needing matching `resolve.conditions` in both Vite and Vitest, was also rejected as two resolution stories where one suffices.
- **Rationale:** Weighing both: `dist` buys a conventional consumer contract and a real artifact, at the cost of an ordering dependency — `pnpm -r build` must precede `pnpm -r test` and `pnpm typecheck`. That ordering is not free. It breaks the mission's own documented commands on a clean checkout, and a contributor's natural diagnosis of the resulting resolution error is a broken install, not a missing build. It also creates a staleness hazard under `pnpm dev`, where `node --watch` follows the server's source but nothing rebuilds `core`, so an edited port silently serves stale output. Enforcing the order with build-first root scripts is possible but pays a rebuild on every test run and leaves the hazard in the dev loop.

  Source resolution removes the ordering rather than enforcing it, and the cost is smaller than it first appears. `core` in this plan is types-only: its `dist/index.js` would be an empty module, so building it is ceremony. Three mechanics were verified before choosing: Node type-strips a workspace package's `.ts` source reached through pnpm's symlink, because the symlink's realpath lands outside `node_modules` where the restriction applies; `tsc` type-checks `server` against `core`'s source with no build step; and Vitest resolves the same path. The residual costs are the explicit `.ts` import extensions and a `build` script that emits nothing for two of three packages — both visible and local, unlike a stale artifact.
- **Promotes to ADR:** yes

### [5] Toolchain versions live in a pnpm catalog

- **Decision:** Declare every shared tool version once in the `catalog:` block of `pnpm-workspace.yaml`; packages depend on `catalog:`.
- **Alternatives:** Repeat version ranges in each package manifest (drifts). Hoist root devDependencies via `node-linker=hoisted` or `shamefully-hoist` (defeats pnpm's isolation and hides undeclared dependencies).
- **Rationale:** pnpm gives each package an isolated `node_modules`, so a package importing `vitest/config` must declare `vitest` itself — root devDependencies are not visible to it. The catalog keeps that explicitness without duplicating version ranges. Verified: a package declaring `"typescript": "catalog:"` resolved to 6.0.3.
- **Promotes to ADR:** yes

### [6] `LlmPort` exposes status, complete, and stream; structured output is deferred

- **Decision:** Three methods — `status()`, `complete()`, `stream()` — each taking an optional `AbortSignal`. `LlmRequest` carries `messages` and an optional `model` and nothing more. No type in this plan describes a required response shape: `ResponseSchema` is deleted rather than declared.
- **Alternatives:** A single `stream()` primitive with a collect helper in `core` for whole-text callers. Rejected: every whole-response caller would rebuild the same accumulation loop, and the helper is code this plan is not meant to ship. A two-method port without `status()` was also rejected. For the response shape, the alternative was committing a member-level type now, naming the fields the domain needs.
- **Rationale:** Each method answers a distinct mission requirement rather than being a special case of another. `status()` serves the constraint that the app detects a missing backend at startup and guides the user through setup, including which models are downloaded. `complete()` serves contradiction checking and distillation, which want a whole document rather than a stream — a distinction that survives without any schema parameter. `stream()` serves the interview's flow requirement. `AbortSignal` is a platform primitive, not a framework, so it does not compromise core's purity.

  Structured output is deferred for the same reason `SessionStorePort` refuses to name a session type (decision [7]) and the store omits `delete` (decision [9]): there is no caller yet. Committing a shape now leads to one of two bad ends. Name the fields JSON Schema names and the rename to a domain term is cosmetic — the provider vocabulary the round-1 boundary finding objected to is back, now harder to see. Invent a smaller language instead and the first real caller, which does have requirements, forces its replacement. `complete()` stands on the whole-response-versus-stream distinction alone, so nothing in this plan needs the parameter. The first feature that performs a contradiction check designs the type with a concrete caller in hand.
- **Promotes to ADR:** yes

### [7] `SessionStorePort` is generic over the session state

- **Decision:** `SessionStorePort<TState>` with `list`, `load`, and `save`; `StoredSession<TState>` carries the identifier, timestamps, and opaque state.
- **Alternatives:** A concrete session type declared now. Rejected — the interview and spec model do not exist, so any concrete shape would be guessed domain design the first real feature has to unpick. An `unknown` payload was also rejected as it discards type safety at every call site.
- **Rationale:** A store genuinely does not care what it persists; the generic states that honestly and lets the first interview feature supply the state type without touching the port. `load` resolves to `undefined` rather than throwing, because a missing session is an ordinary outcome when the user opens a stale link.
- **Promotes to ADR:** yes

### [8] Search optionality is expressed by `CoreDependencies`

- **Decision:** Declare a `CoreDependencies<TState>` type in `core` with `llm`, `sessions`, and `clock` required and `search` optional. Model the mission's optional web search as the omitted member.
- **Alternatives:** A `searchEnabled: boolean` alongside a mandatory port; a null-object `SearchPort` returning an empty list. Also rejected: leaving the four ports standalone with no dependency type, which left the decision asserted in prose but absent from the code.
- **Rationale:** The mission says the interview runs unchanged without search, only without enrichment. An optional member expresses exactly that and makes the compiler enforce the branch. A flag would allow the contradictory state "enabled but no adapter", and a null object would hide a misconfigured SearXNG instance behind results that merely look empty. Without `CoreDependencies` the rule lived only in this log, and the first interview feature could have added a boolean flag without contradicting any recorded artifact.
- **Promotes to ADR:** yes

### [9] The session store omits `delete`

- **Decision:** Ship `list`, `load`, and `save` only.
- **Alternatives:** Full CRUD.
- **Rationale:** The mission never asks for session deletion. Declaring the method now would add an untested boundary that every future adapter must implement. Add it when a feature needs it.
- **Promotes to ADR:** no

### [10] Root workspace tests live outside the three packages

- **Decision:** Repository-level assertions live in `tests/workspace.test.ts`, run by a root `test` script. The Checklist uses `pnpm -r --include-workspace-root test`.
- **Alternatives:** Placing these tests in `packages/core` — rejected, since they read manifests from disk and `core` must stay filesystem-free even in its tests. A Vitest `projects` config at the root — rejected against the interview's per-package configuration decision.
- **Rationale:** Structural facts about the workspace belong to the workspace, not to any package. The mission's `pnpm -r test` still runs the three package suites unchanged; `--include-workspace-root` adds the fourth. Documented in the Checklist so the difference is not silently lost.
- **Promotes to ADR:** no

### [11] `core` is tested by runtime doubles plus Vitest type tests

- **Decision:** Runtime behaviour of in-file test doubles in `*.test.ts`; type-level assertions in `*.test-d.ts` with Vitest `typecheck` enabled. The entry point's re-exports are asserted at type level, not at runtime.
- **Alternatives:** Relying on `tsc --noEmit` alone. Rejected — it proves conforming code compiles but never proves a non-conforming implementation is rejected. A runtime `index.test.ts` asserting re-exports was also rejected: a types-only entry point emits no runtime bindings, so such a test can only observe an empty namespace.
- **Rationale:** A types-only package needs negative evidence. Verified that `vitest run --typecheck` fails the suite on a deliberately non-conforming implementation, and that `typecheck.enabled` in the config makes a plain `vitest run` include the type tests. The doubles stay in test files, keeping the shipped package implementation-free.
- **Promotes to ADR:** yes

### [12] The server runs from TypeScript source via Node type-stripping

- **Decision:** `server` starts with `node --watch src/main.ts`; no `tsx` dependency. `erasableSyntaxOnly` is on repo-wide, and `engines.node` is `^22.18.0 || >=24`.
- **Alternatives:** Adding `tsx` to run and watch TypeScript.
- **Rationale:** Node enabled type stripping by default in 22.18.0, which sets the engine floor — an earlier 22.x would fail the dev loop outright. Verified that Node executes `src/main.ts` directly and resolves a workspace dependency's TypeScript source across pnpm's symlink. Dropping `tsx` removes a dependency from the dev loop. `erasableSyntaxOnly` guarantees the source stays strippable by banning enums, namespaces, and parameter properties. If stripping proves unreliable, `tsx` is the drop-in fallback and changes only the `dev` script.
- **Promotes to ADR:** yes

### [13] `web` depends on no internal package

- **Decision:** `@chrysalyst/web` declares neither `@chrysalyst/core` nor `@chrysalyst/server`. It renders a placeholder and constructs no API client. `AppType` is proved publishable by a type test inside `server`.
- **Alternatives:** Shipping an `hc<AppType>` client in `web` now, which would add a `web → server` package edge and pull `hono` into `web` as a runtime dependency for `hono/client`. Rejected as the deferred adapter work.
- **Rationale:** The elaborated intent defers adapters to the first real feature, and a driving adapter's HTTP client is exactly that. Keeping `web` dependency-free leaves the hexagonal direction unambiguous and avoids a client with no caller. The typed-client contract is still locked in by `packages/server/src/client.test-d.ts`, so nothing is lost by waiting.
- **Promotes to ADR:** no

### [14] Styling is deferred out of this plan

- **Decision:** `web` ships minimal vanilla CSS and a placeholder heading. No design system, component library, theming, or CSS framework.
- **Alternatives:** Choosing Tailwind, CSS Modules, or a component library now.
- **Rationale:** Per the interview, visual direction belongs to the impeccable subphase of the first UI feature. Picking a styling stack here would pre-empt that decision with no design input, and the scaffold has no UI to style.
- **Promotes to ADR:** no

### [15] The server binds the loopback interface by default

- **Decision:** The server factory defaults its host to `127.0.0.1`; a caller must pass a host explicitly to bind anything wider.
- **Alternatives:** Leaving `@hono/node-server`'s default, which passes no hostname to `server.listen` and so binds every interface.
- **Rationale:** The mission constrains chrysalyst to a local web app on localhost with no cloud and no accounts, and this server will later proxy a local LLM and read session files off disk. An all-interfaces listener would expose both to the local network. The scaffold is the cheapest moment to set the default, before any adapter inherits it.
- **Promotes to ADR:** yes

## Review Findings

### [1] [plan-review] moduleResolution reversed to NodeNext without a decision

- **Finding:** Task 3 specified `module: NodeNext`, silently reversing the interview's `moduleResolution: "bundler"`. The two are mutually exclusive in `tsc`, and NodeNext would force `.js` extension suffixes on every relative import and mismatch the Vite-built `web` package.
- **Direction change:** Restored `moduleResolution: "bundler"` with `module: "preserve"` in task 3, matching the interview. NodeNext is dropped entirely; no justification entry is needed because the reversal is undone rather than defended.
- **Promotes to ADR:** no

### [2] [plan-review] Engine floor too low for the plan's own dev loop

- **Finding:** `engines.node` of `^22.13.0 || >=24` admitted 22.13 through 22.17, where `node --watch src/main.ts` fails — Node enabled type stripping by default only in 22.18.0. The stated rationale was also wrong: ESLint 10 accepts Node 20.19 and does not set a 22.13 floor.
- **Direction change:** Raised the floor to `^22.18.0 || >=24` in plan.md § Requirements and decision-log [12], replaced the ESLint rationale with the type-stripping one, and added an *AND* clause to the monorepo-workspace scenario "Root manifest pins runtime and package manager" forbidding a range that admits a Node unable to execute a TypeScript entry point unflagged.
- **Promotes to ADR:** yes

### [3] [plan-review] `web` could not resolve `hono/client`

- **Finding:** Task 13 had `web` build an `hc<AppType>` client, but `hc` is runtime code from `hono/client` while `web` declared only a type-only dependency on `@chrysalyst/server`. Under pnpm's isolated `node_modules` the web build would fail.
- **Direction change:** Resolved by taking the paired scope advisory rather than widening the dependency: the client is dropped from `web` entirely. `hono` stays scoped to `server`. See decision [13].
- **Promotes to ADR:** no

### [4] [plan-review] Bind host unconstrained against a localhost-only mission

- **Finding:** No scenario, requirement, or task named the bind host, and `@hono/node-server` binds every interface when none is given — contradicting the mission's localhost-only constraint for a server that will later proxy a local LLM and read session files.
- **Direction change:** Added the scenario "Server binds the loopback interface only" to `platform/http-server/spec.md`, the default host to task 12's factory, a Scenario Coverage row, a Requirements row, a Manual Testing row asserting the listen address, and decision [15].
- **Promotes to ADR:** yes

### [5] [plan-review] Health route's version read contradicted the no-filesystem rule

- **Finding:** The http-server Background forbade filesystem access while the health scenario required the manifest version in the response. No task named a mechanism, leaving the implementer to violate one or invent the other.
- **Direction change:** Reworded the Background to "no filesystem access beyond a static import of the package's own manifest" and named the mechanism in task 12 — `import pkg from '../package.json' with { type: 'json' }` with `resolveJsonModule` in the base tsconfig. Verified both the type-check and the runtime read under Node type-stripping.
- **Promotes to ADR:** no

### [6] [plan-review] Mission commands failed on a clean checkout

- **Finding:** Resolving packages through built `dist/` made the mission's documented `pnpm -r test` and `pnpm typecheck` fail before a build, with nothing enforcing the order.
- **Direction change:** Resolved by removing the ordering rather than enforcing it — packages now resolve through source (decision [4]), so no build precedes any command. Added a monorepo-workspace *AND* clause requiring that the root `test` and `typecheck` scripts not depend on a build, a Scenario Coverage row, and a Manual Testing row running `pnpm typecheck` on a fresh clone. The reviewer's build-first root scripts are therefore not adopted; they were conditional on keeping `dist`.
- **Promotes to ADR:** yes

### [7] [plan-review] No task created the server factory the test targets

- **Finding:** The "Server binds a port" scenario tested a factory that no task produced; task 11 created only `app.ts` and `main.ts`. Importing `main.ts` instead would bind port 3000 as a module side effect and race the dev server.
- **Direction change:** Added `src/server.ts` to task 12 as a factory taking a port and host and returning the handle plus a close function, with `src/main.ts` reduced to the invocation.
- **Promotes to ADR:** no

### [8] [plan-review] Workspace tests scheduled before the package they assert

- **Finding:** Group B ran the workspace test task alongside `core` and `web`, before Group C created `packages/server` — yet its assertions read that package's manifest, so it could not go green where it was scheduled.
- **Direction change:** Moved the task (now 15) into Group D, after Group C, and added the sequential dependency line naming the reason.
- **Promotes to ADR:** no

### [9] [plan-review] Runtime re-export test impossible on a types-only entry point

- **Finding:** The "Ports are reachable" scenario mapped to a runtime `index.test.ts`, but a types-only entry point emits no runtime bindings, so the test could only observe an empty namespace.
- **Direction change:** Dropped `index.test.ts`; moved the re-export assertions into `ports.test-d.ts` and changed the Scenario Coverage row to a Unit type-test location. Recorded in decision [11]. The first attempt at the replacement was itself wrong and was corrected in round 2 (finding [12]): `typeof import(...)` yields the module's value namespace and sees value exports only, so for a types-only package it is empty. The assertion form is therefore an indexed type reference, `import('@chrysalyst/core').X`, not a namespace query.
- **Promotes to ADR:** no

### [10] [plan-review] Advisories adopted

- **Finding:** Eight advisories flagged scope, config, completeness, design-depth, and prose defects.
- **Direction change:** All adopted. Scope — the `hc` client is dropped from `web` (finding [3]). Config — task 4 gains a `tsconfig.eslint.json` covering config and type-test files plus named rule relaxations for `**/*.test.ts`, since `projectService: true` errors on any linted file no tsconfig includes. Completeness — every package's script bodies are now named in tasks 5, 9, and 12; the core purity scenario is scoped to non-test files with an explicit test-file exemption; task 16 updates `specs/mission.md`, which `/speq:record` never touches. Design depth — `CoreDependencies` makes search optionality real in code (decision [8]), and the LLM response-shape type was renamed `ResponseSchema`, a fix round 2 found insufficient and replaced with deletion (finding [13]). Tactical shortcut — the web bundle substring check is replaced by a real render test using `jsdom` and `@testing-library/react`, and the build test writes to a temporary `outDir` so it no longer clobbers `dist/`. Prose — the Summary is cut to two sentences within the word cap, and the TypeScript pin now gives one description in both artifacts, following the declared peer range without predicting an unobserved failure mode.
- **Promotes to ADR:** no

### [11] [plan-review] `web` could not resolve the Node built-ins its build test needs

- **Finding:** `@types/node` was scoped to `server` and the root tests, and `packages/web`'s tsconfig set no `types`. Task 10's build test must create a temporary directory and read the emitted `index.html` back, and the web-shell scenario mandates the on-disk form, closing the in-memory `write: false` escape. Under pnpm's isolated layout `packages/web/node_modules/@types/node` would not exist, so `import { mkdtemp } from 'node:fs/promises'` raises TS2307 and fails both the Typecheck and Lint Checklist rows. The same review found `@testing-library/dom` undeclared, though `@testing-library/react` 16 declares it as a peer rather than bundling it — verified against the registry.
- **Direction change:** Scoped `@types/node` to `server`, `web`, and the root tests; added `types: ["node"]` to task 9's web tsconfig; named the mechanism in task 10 (`node:os` `tmpdir()` plus `node:fs/promises` `mkdtemp`, reading `index.html` back with `node:fs/promises`); and added `@testing-library/dom` at `^10.4.1` scoped to `web`.
- **Promotes to ADR:** no

### [12] [plan-review] Entry-point re-export assertion still could not observe a type

- **Finding:** Round 1's fix moved the re-export assertion to the type level but specified `expectTypeOf<typeof import('@chrysalyst/core')>`, which restates the original impossibility. `typeof import(...)` produces the module's value namespace, and type-only exports are not members of it. Confirmed under this plan's exact compiler options: for a types-only entry point, `keyof typeof import('./index.ts')` is `never`, and naming a port against it fails with TS2322.
- **Direction change:** Task 8 now specifies the indexed form — `type X = import('@chrysalyst/core').X` for each port, `CoreDependencies`, and every supporting type, asserted with `expectTypeOf<X>()` against a conforming object literal — and explicitly bans the `typeof import(...)` form. Verified that the indexed form reaches type-only exports through the package's `exports` entry. Round 1 finding [9] carries the explanation.
- **Promotes to ADR:** no

### [13] [plan-review] Round-2 advisories adopted

- **Finding:** Seven advisories covering test-environment collisions, two ambiguous recorded requirements, a stale mission command, and two prose defects.
- **Direction change:** All adopted. Root suite — task 15 pins `include: ['tests/**/*.test.ts']` and `environment: 'node'`, so the root config no longer matches every package's co-located tests and re-runs them without their environment. Web suite — task 10's build test opens with `// @vitest-environment node`, since a Vite production build and jsdom want opposite environments and only the render test needs the DOM. Recorded wording — the web-shell clause now reads "MUST NOT write into the package's default output directory", because `dist/` is gitignored and the "committed build output" it referred to can never exist. Structured output — `ResponseSchema` is deleted rather than given a shape; the reasoning is in decision [6]. Mission — task 16 also updates § Commands to `pnpm -r --include-workspace-root test`, so the documented command reaches the nine scenarios living in the root suite, and § Impact lists that fourth edit. Prose — the Checklist closing line now scopes its independence claim to "after `pnpm install`", and § Impact's stale-statement sentence becomes a four-item list.
- **Promotes to ADR:** no

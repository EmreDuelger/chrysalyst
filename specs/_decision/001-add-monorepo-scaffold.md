# Decisions: add-monorepo-scaffold

## ADR: Hono is the server framework

**ID:** hono-server-framework
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

The mission left the server framework open between Fastify and Hono and said the first plan decides. chrysalyst is localhost-only, Node-only, and single-user, so Fastify's maturity-at-scale and Hono's run-anywhere portability both stop mattering. What remains is streaming the local LLM to the UI and keeping the `web` driving adapter from drifting from the server's API.

### Decision

`packages/server` is built on Hono 4 with `@hono/node-server` 2. Hono's `streamSSE` serves the requirement that LLM answers stream back to the UI. `hc<AppType>` gives the client compile-time knowledge of the server's routes with no schema duplication and no code generation.

### Options Considered

| Option | Verdict |
|--------|---------|
| Hono 4 + `@hono/node-server` | ✓ Chosen — `streamSSE` and typed `hc` client map directly onto mission requirements; minimalism matches the thin adapter layer |
| Fastify | ✗ Rejected — richer plugin ecosystem and Node-native maturity address scale and operational surface a single-user localhost tool never encounters |

### Consequences

The server package stays thin. The `web` adapter gets a typed client for free when it arrives. SSE streaming is available without extra dependencies.

## ADR: TypeScript is pinned below 6.1

**ID:** typescript-pinned-below-6-1
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

The interview requires type-aware linting with typescript-eslint `strictTypeChecked`. typescript-eslint 8.69.0 declares a peer range of `typescript >=4.8.4 <6.1.0`, while TypeScript 7.0.2 is the current release.

### Decision

Pin `typescript` to `~6.0.3` across the pnpm catalog. The pin follows typescript-eslint's declared peer range. `~` rather than `^` is used because `^6.0.3` would admit 6.1, already outside the supported range. Behaviour on an unsupported TypeScript is not predicted. Revisit when typescript-eslint ships TS 7 support.

### Options Considered

| Option | Verdict |
|--------|---------|
| Pin `typescript` to `~6.0.3` | ✓ Chosen — follows the declared peer range of typescript-eslint 8.69.0 |
| TypeScript 7.0.2 (current) | ✗ Rejected — outside typescript-eslint's supported peer range |
| Drop type-aware linting to unblock TS 7 | ✗ Rejected — contradicts the interview's explicit `strictTypeChecked` requirement |

### Consequences

The project starts one major version behind on TypeScript. Type-aware linting works as specified. The pin must be lifted deliberately once tooling support lands.

## ADR: Packages resolve each other through TypeScript source

**ID:** packages-resolve-through-source
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

Resolving internal packages through built `dist/` output buys a conventional consumer contract at the cost of an ordering dependency: `pnpm -r build` must precede `pnpm -r test` and `pnpm typecheck`. That order breaks the mission's own documented commands on a clean checkout, and creates a staleness hazard under `pnpm dev` where an edited port in `core` silently serves stale output. `core` in this plan is types-only, so its built module would be empty.

### Decision

Each internal package's `exports` entry points at `src/*.ts`. No package emits JavaScript except `web`, whose artifact Vite produces. `build` for `core` and `server` runs the package's own `typecheck`. Relative imports carry an explicit `.ts` extension under `module: "preserve"` with `allowImportingTsExtensions`. This removes the build ordering rather than enforcing it, so the mission's `pnpm -r test` and `pnpm typecheck` run on a fresh clone with no prior build.

### Options Considered

| Option | Verdict |
|--------|---------|
| `exports` points at `src/*.ts` source | ✓ Chosen — removes build ordering; costs are explicit `.ts` import extensions and empty-emitting `build` scripts, both visible and local |
| Export built `dist/` with emitted `.d.ts` | ✗ Rejected — forces a build before documented commands and hides a staleness hazard in the dev loop |
| `development` export condition resolving to source, `dist` for production | ✗ Rejected — two resolution stories where one suffices; needs matching `resolve.conditions` in Vite and Vitest |

### Consequences

No build step precedes any command on a clean checkout. Root `test` and `typecheck` scripts must not depend on a build. Relative imports need explicit `.ts` extensions. Two of three packages have `build` scripts that emit nothing.

## ADR: Toolchain versions live in a pnpm catalog

**ID:** toolchain-versions-in-pnpm-catalog
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

pnpm gives each package an isolated `node_modules`, so a package importing `vitest/config` must declare `vitest` itself — root devDependencies are not visible to it. Repeating version ranges in each manifest drifts; hoisting root devDependencies defeats pnpm's isolation and hides undeclared dependencies.

### Decision

Declare every shared tool version once in the `catalog:` block of `pnpm-workspace.yaml`; packages depend on `catalog:`. This keeps dependency declarations explicit per package without duplicating version ranges.

### Options Considered

| Option | Verdict |
|--------|---------|
| `catalog:` block in `pnpm-workspace.yaml` | ✓ Chosen — single source of versions while each package still declares what it imports |
| Repeat version ranges in each package manifest | ✗ Rejected — drifts over time |
| Hoist root devDependencies (`node-linker=hoisted` / `shamefully-hoist`) | ✗ Rejected — defeats pnpm isolation and hides undeclared dependencies |

### Consequences

Version bumps happen in one place. Each package manifest still lists its own tool dependencies, with `catalog:` as the specifier.

## ADR: LlmPort exposes status, complete, and stream

**ID:** llmport-status-complete-stream
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

The LLM boundary must serve three distinct mission requirements: detecting a missing backend at startup and listing downloaded models, whole-document operations such as contradiction checking and distillation, and incremental streaming for the interview flow. Committing a required response-shape type now would either reintroduce provider vocabulary under a domain name or invent a smaller language the first real caller must replace.

### Decision

`LlmPort` declares three methods — `status()`, `complete()`, `stream()` — each taking an optional `AbortSignal`. `LlmRequest` carries `messages` and an optional `model`. No type describes a required response shape; `ResponseSchema` is deleted rather than declared. The first feature that performs a contradiction check designs the type with a concrete caller in hand.

### Options Considered

| Option | Verdict |
|--------|---------|
| Three methods: `status`, `complete`, `stream` | ✓ Chosen — each answers a distinct mission requirement rather than being a special case of another |
| Single `stream()` primitive plus a collect helper in `core` | ✗ Rejected — every whole-response caller rebuilds the same accumulation loop; the helper is code this plan is not meant to ship |
| Two-method port without `status()` | ✗ Rejected — startup backend detection needs it |
| Commit a member-level response-shape type now | ✗ Rejected — no caller yet; leads to provider vocabulary or a throwaway language |

### Consequences

`AbortSignal` is a platform primitive, so it does not compromise core's purity. Structured output is deferred to the first real caller. `complete()` stands on the whole-response-versus-stream distinction alone.

## ADR: SessionStorePort is generic over the session state

**ID:** sessionstoreport-generic-over-state
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

No interview or spec model exists yet, so any concrete session type would be guessed domain design the first real feature has to unpick. A store genuinely does not care what it persists.

### Decision

`SessionStorePort<TState>` with `list`, `load`, and `save`. `StoredSession<TState>` carries the identifier, timestamps, and opaque state. `load` resolves to `undefined` rather than throwing, because a missing session is an ordinary outcome when the user opens a stale link. `delete` is omitted — the mission never asks for session deletion.

### Options Considered

| Option | Verdict |
|--------|---------|
| `SessionStorePort<TState>` generic over state | ✓ Chosen — states honestly that the store does not care what it persists; first feature supplies the state type without touching the port |
| A concrete session type declared now | ✗ Rejected — guessed domain design ahead of any interview or spec model |
| An `unknown` payload | ✗ Rejected — discards type safety at every call site |
| Full CRUD including `delete` | ✗ Rejected — untested boundary every future adapter must implement, with no feature needing it |

### Consequences

The first interview feature supplies `TState` without editing the port. A missing session is a normal `undefined` result. `delete` is added when a feature needs it.

## ADR: Search optionality is expressed by CoreDependencies

**ID:** search-optionality-via-coredependencies
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

The mission says the interview runs unchanged without web search, only without enrichment. Without a dependency type this rule lived only in the decision log, and the first interview feature could have added a boolean flag without contradicting any recorded artifact.

### Decision

Declare a `CoreDependencies<TState>` type in `core` with `llm`, `sessions`, and `clock` required and `search` optional. The mission's optional web search is modelled as the omitted member, so the compiler enforces the branch.

### Options Considered

| Option | Verdict |
|--------|---------|
| `CoreDependencies` with optional `search` member | ✓ Chosen — expresses "runs without search" exactly and makes the compiler enforce the branch |
| `searchEnabled: boolean` alongside a mandatory port | ✗ Rejected — allows the contradictory state "enabled but no adapter" |
| Null-object `SearchPort` returning an empty list | ✗ Rejected — hides a misconfigured SearXNG instance behind results that merely look empty |
| Four standalone ports with no dependency type | ✗ Rejected — leaves the decision in prose but absent from code |

### Consequences

Domain code branches on `search` presence with compiler support. A placeholder `SearchPort` is never required to compile.

## ADR: core is tested by runtime doubles plus Vitest type tests

**ID:** core-tested-by-doubles-and-type-tests
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

A types-only package needs negative evidence — proof that a non-conforming implementation is rejected, not only that conforming code compiles. `tsc --noEmit` alone cannot provide this. A runtime `index.test.ts` asserting re-exports can only observe an empty namespace, since a types-only entry point emits no runtime bindings.

### Decision

Runtime behaviour of in-file test doubles is asserted in `*.test.ts`; type-level assertions live in `*.test-d.ts` with Vitest `typecheck` enabled. The entry point's re-exports are asserted at type level with the indexed form `import('@chrysalyst/core').X`, not `typeof import(...)`, which yields only the value namespace and is empty for a types-only package. Test doubles stay in test files, keeping the shipped package implementation-free.

### Options Considered

| Option | Verdict |
|--------|---------|
| Runtime doubles in `*.test.ts` plus `*.test-d.ts` type tests with `typecheck.enabled` | ✓ Chosen — `vitest run --typecheck` fails the suite on a deliberately non-conforming implementation |
| `tsc --noEmit` alone | ✗ Rejected — proves conforming code compiles, never proves non-conforming code is rejected |
| Runtime `index.test.ts` asserting re-exports | ✗ Rejected — a types-only entry point emits no runtime bindings, so the test observes an empty namespace |

### Consequences

The shipped package stays implementation-free. Negative type evidence runs in the normal `vitest run`. Re-export assertions use indexed type references.

## ADR: The server runs from TypeScript source via Node type-stripping

**ID:** server-runs-from-typescript-source
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

Node enabled type stripping by default in 22.18.0. Running the server directly from TypeScript source avoids a `tsx` dependency in the dev loop. An engine floor below 22.18.0 would fail `node --watch src/main.ts` outright, and the plan-review found the original `^22.13.0 || >=24` range admitted Node versions that cannot execute a TypeScript entry point unflagged.

### Decision

`server` starts with `node --watch src/main.ts`; no `tsx` dependency. `erasableSyntaxOnly` is on repo-wide, banning enums, namespaces, and parameter properties so the source stays strippable. `engines.node` is `^22.18.0 || >=24`. The `.nvmrc` runtime must fall inside that range, and the range must not admit a Node unable to execute a TypeScript entry point without a command-line flag. If stripping proves unreliable, `tsx` is the drop-in fallback and changes only the `dev` script.

### Options Considered

| Option | Verdict |
|--------|---------|
| `node --watch src/main.ts` with `erasableSyntaxOnly` and a `^22.18.0 \|\| >=24` floor | ✓ Chosen — removes a dev-loop dependency; Node executes the entry point and resolves workspace TypeScript source across pnpm's symlink |
| Add `tsx` to run and watch TypeScript | ✗ Rejected — an extra dependency in the dev loop; kept only as the documented fallback |
| Lower engine floor (`^22.13.0 \|\| >=24`) | ✗ Rejected — admits 22.13–22.17, where the dev loop fails because type stripping is not default |

### Consequences

The dev loop has no transpiler dependency. Source must stay within erasable syntax. The engine floor is load-bearing and enforced by a workspace scenario.

## ADR: The server binds the loopback interface by default

**ID:** server-binds-loopback-by-default
**Plan:** add-monorepo-scaffold
**Status:** Accepted

### Context

The mission constrains chrysalyst to a local web app on localhost with no cloud and no accounts. This server will later proxy a local LLM and read session files off disk. `@hono/node-server` passes no hostname to `server.listen` by default and so binds every interface, which the plan-review flagged as unconstrained against the localhost-only mission. The scaffold is the cheapest moment to set the default, before any adapter inherits it.

### Decision

The server factory defaults its host to `127.0.0.1`; a caller must pass a host explicitly to bind anything wider. A scenario in `platform/http-server` asserts the server binds `127.0.0.1` and refuses a connection addressed to a non-loopback interface.

### Options Considered

| Option | Verdict |
|--------|---------|
| Factory defaults host to `127.0.0.1` | ✓ Chosen — matches the localhost-only mission; set before any adapter inherits a wider default |
| Leave `@hono/node-server`'s default | ✗ Rejected — binds every interface, exposing a future LLM proxy and session files to the local network |

### Consequences

Local development is unaffected. Binding a wider interface is a deliberate, explicit caller choice. The default is locked by a scenario.

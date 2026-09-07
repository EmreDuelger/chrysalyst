# Plan: add-ollama-llm-adapter

## Summary

Give `LlmPort` its first real implementation: an adapter in `packages/server` that answers `status`, `complete`, and `stream` from a local Ollama daemon over the Vercel AI SDK. The adapter is parameterised by base URL and model, so LM Studio and llama.cpp later need configuration rather than a second implementation.

## Design

### Context

`LlmPort` has existed since the scaffold as a type with no implementation. Roadmap milestone M1 makes it real, because the mission's central claim — that a small local model can conduct a structured interview — is falsifiable only against a running model. Every later milestone rests on that claim, so the adapter comes before the interview engine rather than after it.

Three forces shape the design. The roadmap fixes the SDK (`ai` v6, behind the port, never imported by `core`). The mission fixes the deployment (loopback only, no cloud SDK, the app must detect a missing backend and guide setup rather than crash). And `decision-log [6]` from the scaffold fixes the contract: three methods, an optional `AbortSignal` on each, no response-shape type until a real caller needs one.

That last constraint is what keeps this plan small. Structured output is milestone M10's problem, and M10 has the concrete caller that should design it.

- **Goals** — one `LlmPort` implementation that survives a stopped daemon; abort respected on all three methods; hermetic tests that need no daemon; a `live` test tier and the convention that later milestones build CI against; an ADR for the SDK-pair choice.
- **Non-Goals** — no structured output, no `Output.object()`, no zod schema; no HTTP route and no wiring into `main.ts`, both of which arrive with M3's walking skeleton; no llama.cpp or LM Studio adapter; no backend-selection mechanism; no retry, prompt, or sampling policy; no CI workflow.

### Decision

#### Architecture

One module in `packages/server` owns the fact that a language model is reached over HTTP. Nothing else in the workspace learns it.

```
┌──────────────┐  imports  ┌─────────────────────────────────┐
│ @chrysalyst/ │◀──────────│      @chrysalyst/server         │
│     core     │   type    │                                 │
│  LlmPort     │           │  adapters/llm/                  │
│  (declares)  │           │    openai-compatible-llm.ts     │
└──────────────┘           │      ├ complete  ─┐             │
                           │      ├ stream    ─┼─ ai v6      │
                           │      └ status    ─┼─ fetch      │
                           └──────────────────┬┴─────────────┘
                                              │ OpenAI wire format
                                              ▼
                                   http://127.0.0.1:11434/v1
                                        (Ollama daemon)
```

`complete` and `stream` go through `ai` and `@ai-sdk/openai-compatible` — together *the SDK pair*. The pair owns SSE framing, message encoding, and abort plumbing. `status` bypasses both packages and issues a plain `GET <base URL>/models` through the same injected `fetch`, because `@ai-sdk/openai-compatible`'s provider interface has no list-models method — a fact verified against `@ai-sdk/openai-compatible@2.0.74`, not assumed.

The two packages are pinned to different major lines on purpose, so every normative statement below names the one package it constrains rather than the pair.

The module exports two functions: `createOpenAiCompatibleLlm(config)` returning an `LlmPort`, and `llmConfigFromEnv(env)` resolving the base URL and default model. The second is the composition seam — the only place Ollama's defaults are written down.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Adapter behind a port | `openai-compatible-llm.ts` implements `LlmPort` | The domain keeps its vocabulary; Ollama's HTTP surface stops at the module boundary |
| Generalisation by parameter, not by layer | Base URL and model are config, not subclasses | LM Studio and llama.cpp also speak the OpenAI wire format on loopback. A base class for two callers that do not exist yet would be speculative; a base URL costs nothing. The mission's "je ein Adapter für Ollama, llama.cpp und LM Studio" is met by one adapter *instance* per backend: a second backend adds a sibling resolver beside `llmConfigFromEnv`, not a second module |
| Injected transport | `config.fetch` defaults to `globalThis.fetch` | `createOpenAICompatible` accepts a `fetch` override and `status` reads the same field, so every hermetic test drives the whole adapter through one stub with no HTTP server and no daemon |
| Error translation at the boundary | `complete` and `stream` rewrap the `ai` error naming the base URL, keeping it as `cause` | Matches `startServer`'s existing error style; a caller sees a chrysalyst error, not `AI_APICallError` |
| Total function for availability | `status` resolves for every reachable-or-not outcome | The mission's setup gate asks "can I interview?" — a question a thrown error does not answer |
| Gate, not exclusion, for the live tier | `describe.skipIf` on `CHRYSALYST_LIVE_LLM` in `*.live.test.ts` | One test command works everywhere; the same file runs in both tiers, so the live tests cannot rot behind a config flag nobody flips |

#### Key interfaces

```ts
export interface OpenAiCompatibleLlmConfig {
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createOpenAiCompatibleLlm(
  config: OpenAiCompatibleLlmConfig,
): LlmPort;

export function llmConfigFromEnv(
  env?: NodeJS.ProcessEnv,
): OpenAiCompatibleLlmConfig;
```

No new type crosses into `@chrysalyst/core`. `LlmPort`, `LlmRequest`, and `LlmBackendStatus` are imported as types and are not changed.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| `@ai-sdk/openai-compatible` against Ollama's `/v1` | The two community `ollama-ai-provider` packages; Ollama's native `/api/chat` | Official Vercel package, no community provider code. Ollama's OpenAI surface is the same surface LM Studio and llama.cpp serve, so the least Ollama-specific route is also the one that generalises |
| `ai` pinned to the `ai-v6` line, not `latest` | `ai` v7, published 2026-06-25 and now `latest` | The roadmap guardrail names v6. The v6 line is actively patched — 6.0.277 shipped the same day as 7.0.93 — so the pin costs no security currency. A v7 move changes a fixed guardrail and belongs in its own plan |
| `@ai-sdk/openai-compatible` pinned to `^2`, not `^3` | Taking `latest` for both | Verified: `@ai-sdk/openai-compatible@3.x` builds on `@ai-sdk/provider@4`, which is `ai` v7's provider generation. Pairing it with `ai` v6 puts two provider generations in one tree. The `ai-v6` dist-tag names 2.0.74 as the matching release |
| `status` returns an empty model list when the daemon is down | Reading `~/.ollama/models` off disk to name downloaded models | Models come from the running daemon and nowhere else. Reading Ollama's on-disk layout would make the adapter depend on a private format that Ollama may change, in exchange for a list the setup gate can obtain the moment the daemon starts |
| A cancelled `status` rejects; an unreachable `status` resolves | Reporting `available: false` for both | A cancelled probe learned nothing. Reporting the backend down would have the setup gate assert a fact it never observed |
| A cancelled `stream` ends quietly; a cancelled `complete` rejects | Both reject, or both end quietly | A stream already delivered value and has a natural end. A promise has nothing to hand back, and resolving to `""` is indistinguishable from an empty answer. Verified: this is already `ai`'s behaviour, and it matches core's existing test double |
| `maxRetries: 0` | `ai`'s default of 2 | Against loopback there is no network to ride out. Two retries only delay the setup gate the mission requires to be prompt |
| One module, not a base module plus an Ollama module | `openai-compatible-llm.ts` + `ollama.ts` | The second file's whole body would be a call to the first with different constants. The defaults are three lines and belong beside the code that reads them |
| No `apiKey` sent | A placeholder `'ollama'`, as OpenAI's own client examples use | Verified: the provider sends no `Authorization` header when `apiKey` is omitted, and Ollama ignores authentication entirely |
| Base URL default uses `127.0.0.1`, not `localhost` | `http://localhost:11434/v1` | Node resolves `localhost` to `::1` first on dual-stack hosts, while Ollama binds `127.0.0.1`. The literal address removes a class of connection-refused reports that look like a stopped daemon |

## Features

| Feature | Status | Spec |
|---------|--------|------|
| ollama-llm-adapter | NEW | `adapters/ollama-llm-adapter/spec.md` |
| llm-port | CHANGED | `platform/llm-port/spec.md` |
| monorepo-workspace | CHANGED | `platform/monorepo-workspace/spec.md` |

`ollama-llm-adapter` opens a new `adapters/` domain. `platform/` already holds eight features, which is the point at which `/speq:record` stops and asks a human how to reorganise the library; a domain named for the layer the mission already names keeps that question shut and gives the SearXNG and filesystem adapters an obvious home.

## Impact

Contributors gain three runtime dependencies in `packages/server` — `ai`, `@ai-sdk/openai-compatible`, and `zod` — and must re-run `pnpm install`. `zod` is a required peer of both `ai` and `@ai-sdk/openai-compatible` even though this plan declares no schema; declaring it explicitly beats relying on pnpm's automatic peer installation.

`ai@6.0.277` pulls `@ai-sdk/gateway@3.0.189` transitively — Vercel's hosted-inference client, which `ai` resolves only for a model named by bare string. The § Requirements row "Provider binding" forbids that call shape, so no gateway endpoint is reachable from this adapter.

No behaviour reaches an end user. The adapter has no HTTP route and is not constructed in `main.ts`; its only callers are its tests until M3 mounts the walking skeleton. `pnpm dev` and `GET /health` are unchanged.

Three edits fall outside the spec deltas, because `/speq:record` merges deltas and nothing else:

- `packages/core/src/ports/llm.ts` — the doc comment on `LlmBackendStatus` currently promises that "the model list is present whether or not the backend answers … so that a caller … can name what is already downloaded". For this adapter the list is present but empty. The comment is corrected; the type is untouched, and `core` gains no dependency.
- `specs/roadmap.md` — two corrections to § M1. The `**Pläne:**` line names its plan `ollama-llm-adapter`, while this plan is `add-ollama-llm-adapter`; the reference is corrected so the milestone still points at the plan after `/speq:record` archives it. The `**Liefert:**` and `**Fertig, wenn:**` clauses still promise the list of local models from an unreachable backend, which decision-log [4] reverses to an empty list. Task 8 amends both, so M1's completion criterion matches the shipped code and `/speq:audit` reads the milestone as met.
- `specs/platform/llm-port/spec.md` § Background — `/speq:record` MUST replace the Background paragraph with the delta's version, because the delta-marker table defines `DELTA:CHANGED` for scenarios only. The new text drops the claim that `LlmPort` has no adapter, which this plan falsifies.

The live tier needs a reachable daemon. On this machine that daemon lives on the Windows host. Model management — `ollama pull`, `ollama list` — happens there, and WSL2 must run in mirrored networking mode to reach it from the repo.

Anyone running the test suite without a daemon sees the live tests reported as skipped. That is the expected result, not a gap.

## Requirements

| Requirement | Details |
|-------------|---------|
| SDK pair versions | `ai` at `6.0.277` and `@ai-sdk/openai-compatible` at `2.0.74` — the pair the `ai-v6` dist-tag names. Both resolve to a single `@ai-sdk/provider@3.0.15`, verified by a `--strict-peer-deps` install in a scratch workspace |
| Peer dependency | `zod` at `^4.5.4`, satisfying both packages' `^3.25.76 \|\| ^4.1.8` peer range. Declared, not left to auto-install |
| Catalog | All three enter the `catalog:` block of `pnpm-workspace.yaml` and are referenced from `packages/server` as `catalog:`. The existing `packages reference catalog versions` assertion enforces the `catalog:` specifier only once a name is in the catalog; task 1 MUST add all three catalog entries |
| Environment | `CHRYSALYST_LLM_BASE_URL` (default `http://127.0.0.1:11434/v1`), `CHRYSALYST_LLM_MODEL` (default `llama3.2:3b`), `CHRYSALYST_LIVE_LLM` (any non-empty value enables the live tier; unset and empty string both leave it disabled). Read from `process.env` directly; no dotenv loader |
| Model spec version | `@ai-sdk/openai-compatible@2.0.74` produces models whose `specificationVersion` is `v3`, not `v4`. Do not write a type assertion against `LanguageModelV4` |
| Retries | Every `generateText` and `streamText` call passes `maxRetries: 0` |
| Provider binding | Every `generateText` and `streamText` call MUST pass a model instance from `createOpenAICompatible(...)`, never a bare model-id string |
| Status transport | `status` issues `GET` through `config.fetch ?? globalThis.fetch` against `new URL('models', baseUrl)` with the trailing slash normalised, and passes the caller's signal. Any thrown error other than an abort yields `{ available: false, models: [] }`; a non-`ok` response does the same; a `200` whose body the model-list guard rejects does the same |
| Live-tier prerequisite | An Ollama daemon reachable at `CHRYSALYST_LLM_BASE_URL` with `llama3.2:3b` pulled MUST be present before the verification run in task 10. On this machine that daemon is the Windows-host Ollama, reached via WSL2 mirrored networking; task 9 establishes the route. The plan MUST NOT be reported complete on hermetic tests alone |
| JSON narrowing | The `/v1/models` body is narrowed by an explicit guard before `data[].id` is read. `strictTypeChecked` forbids the unchecked member access that a bare `JSON.parse` produces |
| Live-tier shape | Live tests live in `*.live.test.ts` and contain no top-level `await`, so collection under CI contacts nothing. Each guards its suite with `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`; a guard reading `=== undefined` is forbidden, because it enables the tier for the empty value a CI `env:` block writes. The suite sets `testTimeout` to 120000 ms |
| Port purity | `packages/core` gains no dependency and no import. Its only change is one doc comment |

## Dependencies

Resolved and exercised together in a scratch workspace under `npm install --strict-peer-deps`; twelve packages, one `@ai-sdk/provider` in the tree.

| Package | Version | Scope |
|---------|---------|-------|
| `ai` | `6.0.277` | `server` — pinned exactly; `^6` would not hold the pairing on its own |
| `@ai-sdk/openai-compatible` | `2.0.74` | `server` — pinned exactly, for the same reason |
| `zod` | `^4.5.4` | `server` — required peer of both packages above |

The API surface below was executed against those exact versions rather than recalled, and the tasks depend on each result:

| Observation | Result |
|-------------|--------|
| `createOpenAICompatible({ name, baseURL, fetch })` | Provider factory; the `fetch` override is the test seam |
| `generateText({ model, messages, maxRetries: 0 })` | Resolves; `.text` is the whole string; requests `<baseURL>/chat/completions` |
| `streamText({ ... })` | Returns a result object, **not** a promise. `.textStream` is the async iterable |
| SSE frame shape `@ai-sdk/openai-compatible@2.0.74` accepts | Response headers `content-type: text/event-stream`, body one literal line per frame — `data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"Wel"},"finish_reason":null}]}` — each terminated by a blank line, then a final frame whose `finish_reason` is `"stop"`, then `data: [DONE]`. Verified by driving `streamText` to yield `["Wel","come"]` |
| Which parts of that frame are load-bearing | The final `finish_reason` frame is required: without it `streamText` still yields every chunk but reports `finishReason: 'error'` and raises `AI_InvalidResponseDataError` ("Response stream ended without a finish reason"). `data: [DONE]`, the `content-type` header, and the `id`/`object`/`created`/`model` envelope fields are all optional — each was dropped in a separate run and the two chunks still arrived cleanly |
| Pre-aborted signal on `streamText` | `textStream` completes with zero chunks and does not throw |
| Mid-stream abort | Iteration ends after the delivered chunks and does not throw |
| Pre-aborted signal on `generateText` | Rejects with a `DOMException` named `AbortError` — not an `APICallError` |
| Connection refused via `generateText` | Rejects with `APICallError`, `statusCode` undefined, `cause.code === 'ECONNREFUSED'` |
| Connection refused via plain `fetch` | Rejects with a `TypeError`, `cause.code === 'ECONNREFUSED'` |
| Omitted `apiKey` | No `Authorization` header is sent |

## Migration

Not applicable. `LlmPort` has no implementation to migrate from, and no session data records a model response yet.

## Implementation Tasks

1. Add `ai` (`6.0.277`), `@ai-sdk/openai-compatible` (`2.0.74`), and `zod` (`^4.5.4`) to the `catalog:` block of `pnpm-workspace.yaml`; declare all three in `packages/server/package.json` under `dependencies` with `catalog:` specifiers; run `pnpm install` and confirm one `@ai-sdk/provider` resolves in `packages/server/node_modules`.
2. Build `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` as two ordered steps.
   - **2a** — Build the `fetch` stub and request recorder with the four response fixtures: a chat-completion JSON body, the SSE frame sequence recorded in § Dependencies, an empty and a populated model list, and a rejection carrying `cause.code === 'ECONNREFUSED'`. The recorder captures every request URL, header, and body. Prove the SSE fixture drives `streamText` to yield two chunks before any scenario is written against it.
   - **2b** — Write the eight hermetic scenarios as failing tests against that stub. Assert URLs, the absent `Authorization` header, and the request body's `model` field through the recorder, never through a live socket.
3. Implement `createOpenAiCompatibleLlm` in `packages/server/src/adapters/llm/openai-compatible-llm.ts`. `complete` awaits `generateText` and returns `.text`; `stream` is an async generator delegating to `streamText(...).textStream`; `status` fetches `<base URL>/models` through the injected `config.fetch`, narrows the body with an explicit guard, and maps every non-abort failure — a thrown error, a non-`ok` response, and a `200` the guard rejects alike — to `{ available: false, models: [] }` while letting an abort reject. `complete` and `stream` rewrap a transport failure in an `Error` naming the base URL with the `ai` error as `cause`, and let an `AbortError` through untouched. Every `generateText` and `streamText` call passes a `createOpenAICompatible(...)` model instance, `maxRetries: 0`, and the caller's signal. Each exported function carries a doc comment stating why the boundary exists, not what it does. [expert]
4. Implement `llmConfigFromEnv` in the same module with the two defaults, and extend the test file with the environment-resolution scenario: both defaults applied, each variable overriding independently, and no filesystem read.
5. Write `packages/server/src/adapters/llm/openai-compatible-llm.live.test.ts`. Guard the suite with `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`, so an unset variable and an empty string both skip while any non-empty value runs. Construct the adapter from `llmConfigFromEnv()`, and drive `status`, `complete`, `stream`, and a mid-stream abort against the real daemon. Keep every call inside a test or hook body; no top-level `await`. Set `testTimeout` to 120000 ms for this suite, because the first request after a cold model load exceeds Vitest's 5 s default.
6. Add the `Live-tier tests are gated by an environment flag` assertion to `tests/workspace.test.ts`. Generalise `nonTestSourceFiles` into a walker parameterised by filename predicate and root, leaving the current call site's behaviour unchanged, and use it to collect every `*.live.test.ts` in the workspace. Assert each file names `CHRYSALYST_LIVE_LLM` inside a `skipIf` and contains no module-scope `await` — match `await` and `for await` at zero indentation, not only a line-initial `await`. Add a second assertion that extracts each file's `skipIf` guard expression and evaluates it against `''`, `undefined`, and `'1'`, requiring skip for the first two and run for the third; a text match alone passes an inverted predicate. Evaluate the extracted expression with `runInNewContext` from `node:vm` against a stub `process` whose `env.CHRYSALYST_LIVE_LLM` is unset, `''`, and `'1'`. Do not use `new Function`: `@typescript-eslint/no-implied-eval` is active for test files and the Lint checklist row admits no error.
7. Correct the `LlmBackendStatus` doc comment in `packages/core/src/ports/llm.ts` so it states that the list is present but may be empty when the backend cannot be asked. Change no type and add no dependency; `packages/core/src/ports/ports.test.ts` must stay green untouched.
8. Amend three lines of `specs/roadmap.md` § M1. Correct the `**Pläne:**` line to name `add-ollama-llm-adapter`. In `**Liefert:**`, change "liefert `LlmBackendStatus` mit der Liste lokaler Modelle" to "liefert `LlmBackendStatus` mit leerer Modell-Liste". In `**Fertig, wenn:**`, change "`status` bei gestopptem Ollama meldet »nicht verfügbar« + Modell-Liste" to "`status` bei gestopptem Ollama meldet »nicht verfügbar« mit leerer Modell-Liste, ohne zu werfen". Change nothing else in the file.
9. **Human step.** This machine reaches no Ollama daemon. WSL2 runs in NAT mode, and the user's Ollama runs on the Windows host, which NAT WSL cannot reach. Enable WSL2 mirrored networking so WSL shares the Windows localhost. On the Windows host, add to `%UserProfile%\.wslconfig`:

   ```
   [wsl2]
   networkingMode=mirrored
   ```

   Then run `wsl --shutdown` from a Windows shell and reopen WSL. `wsl --shutdown` terminates every WSL session, including any running agent — run it when no WSL work is in flight. Mirrored networking requires Windows 11 22H2 or later. On the Windows side, confirm Ollama is running and `ollama pull llama3.2:3b` (≈2 GB) has completed. Then from WSL confirm `curl -s http://127.0.0.1:11434/v1/models` returns a `data` array containing `llama3.2:3b`.
10. Run the full Verification checklist end to end, including one live run against a real Ollama, and fix what it surfaces.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 |
| Group B | 2a → 2b → 3 → 4 (one ordered stream), 6, 7, 8 |
| Group C | 5 |
| Group D (human step — the implementer MUST stop and ask; this step reconfigures WSL networking and restarts the WSL VM, and depends on the Windows host, not the repo) | 9 |
| Group E | 10 |

Sequential dependencies:
- Group A → Group B — tasks 2a through 4 cannot compile until `ai` and `@ai-sdk/openai-compatible` are installed.
- Group B → Group C — the live suite constructs the adapter that task 3 writes.
- Group C → Group E — verification runs the live tier that task 5 writes.
- Group D → Group E — the live checklist row and four Manual Testing rows need the daemon task 9 makes reachable.

Group D touches no repository file and depends on no other group. Its `wsl --shutdown` terminates every running WSL session, so run it while no other group is in flight, and before Group E. Within Group B, tasks 6, 7, and 8 touch `tests/`, `packages/core/`, and `specs/` respectively and share no file with the adapter stream. Tasks 2a, 2b, 3, and 4 are one ordered TDD stream on the same two files and must not be split across agents.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| — | — | None. This plan adds an adapter and its tests; the only edits to existing files are one doc comment, three roadmap lines, one manifest, one catalog, one generalised walker, and two added assertions |

## Verification

### Scenario Coverage

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| Adapter returns a whole response for a request | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `completes a request against the chat completions endpoint` |
| Adapter streams response chunks in order | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `yields streamed deltas in order` |
| A cancelled stream stops without failing | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `ends the stream on abort without rejecting` |
| A cancelled completion rejects | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `rejects a completion with AbortError once the signal aborts` |
| Status reports a reachable backend and its model inventory | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `reports an available backend and lists its models in order` |
| Status separates an unreachable backend from a cancelled probe | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe` |
| An unreachable backend fails a completion with the endpoint named | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `rejects complete and stream naming the base URL with the transport error as cause` |
| The adapter targets any OpenAI-compatible endpoint | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `issues only OpenAI-compatible paths against the configured base URL with no Authorization header` |
| Ollama's defaults come from the environment | Unit | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `defaults to Ollama on loopback and lets each variable override` |
| A running Ollama answers through the port | Integration | `packages/server/src/adapters/llm/openai-compatible-llm.live.test.ts` | `answers status, complete, stream and a mid-stream abort against a real daemon` |
| LlmPort reports backend availability | Unit | `packages/core/src/ports/ports.test.ts` | `reports an unavailable backend with its model list` |
| Live-tier tests are gated by an environment flag | Integration | `tests/workspace.test.ts` | `every live test file gates on CHRYSALYST_LIVE_LLM and awaits nothing at module scope` |
| Live-tier tests are gated by an environment flag (third clause) | Integration | `tests/workspace.test.ts` | `every live guard expression skips for unset and empty and runs for any value` |
| An empty live-tier flag leaves the tier disabled (`monorepo-workspace`) | Integration | `tests/workspace.test.ts` | `every live guard expression skips for unset and empty and runs for any value` |

`LlmPort reports backend availability` keeps its existing test: the delta reworded the scenario's promise about content, and the core test double still hands back a populated list. `Ollama's defaults come from the environment` is the one unit test here — resolving two strings from a record is pure computation with no I/O.

Two rows share `every live guard expression skips for unset and empty and runs for any value`. Both now sit under `monorepo-workspace`: its third clause and its second scenario state the same obligation from two sides — that a run without the variable skips, and that an empty value counts as without — and one assertion that evaluates the extracted guard expression against `''`, `undefined`, and `'1'` decides both. Splitting it would duplicate the setup and the assertion verbatim.

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| ollama-llm-adapter | `pnpm --filter @chrysalyst/server test` with no daemon and no flag | Hermetic tests pass; the live file is reported skipped; the run opens no socket |
| ollama-llm-adapter | On the Windows host, with Ollama running: `ollama pull llama3.2:3b`, then `ollama list` | Model downloaded and listed |
| ollama-llm-adapter | `curl -s http://127.0.0.1:11434/v1/models` | JSON with `"object":"list"` and a `data` array whose entries carry `id` |
| ollama-llm-adapter | `CHRYSALYST_LIVE_LLM=1 pnpm --filter @chrysalyst/server test` with the daemon running | The live suite runs and passes; no test reported skipped |
| ollama-llm-adapter | `node --input-type=module -e "const m = await import('./packages/server/src/adapters/llm/openai-compatible-llm.ts'); const llm = m.createOpenAiCompatibleLlm(m.llmConfigFromEnv()); console.log(await llm.status()); for await (const c of llm.stream({ messages: [{ role: 'user', content: 'Name three colours.' }] })) process.stdout.write(c);"` with the daemon running | Prints `{ available: true, models: [ 'llama3.2:3b', … ] }`, then the answer arrives token by token rather than all at once |
| ollama-llm-adapter | The same command with the Windows-host daemon stopped | Prints `{ available: false, models: [] }`, then fails on the stream with a message naming `http://127.0.0.1:11434/v1`. No unhandled rejection, and `status` never throws |
| ollama-llm-adapter | `CHRYSALYST_LLM_BASE_URL=http://127.0.0.1:1234/v1 node --input-type=module -e "const m = await import('./packages/server/src/adapters/llm/openai-compatible-llm.ts'); console.log(m.llmConfigFromEnv());"` | Prints the overridden base URL alongside the default model |
| monorepo-workspace | `pnpm -r --include-workspace-root test` on a clean checkout with no daemon | 0 failures; the live tests appear in the skipped count |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; lockfile records `ai@6.0.277`, `@ai-sdk/openai-compatible@2.0.74`, and one `@ai-sdk/provider@3.0.15` |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; live tests skipped |
| Test (live) | `CHRYSALYST_LIVE_LLM=1 pnpm -r --include-workspace-root test` | 0 failures; 0 skipped |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; no threshold failure |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

The live row is the only one that needs a reachable Ollama — here the Windows host's daemon via mirrored networking — with `llama3.2:3b` pulled. Only task 9 lifts that row. A green `Test` row beside a skipped live suite proves the gate works, not that the adapter reaches a model.

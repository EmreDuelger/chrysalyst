# Tasks: add-ollama-llm-adapter

## Phase 2: Implementation (Group A — dependencies)
- [x] 2.1 Add `ai` (6.0.277), `@ai-sdk/openai-compatible` (2.0.74), `zod` (^4.5.4) to the `catalog:` block of `pnpm-workspace.yaml`; declare all three in `packages/server/package.json` `dependencies` with `catalog:` specifiers; run `pnpm install`; confirm one `@ai-sdk/provider` resolves in `packages/server/node_modules`.

## Phase 2: Implementation (Group B — adapter TDD stream) [expert]
- [x] 2.2 (2a) Build the `fetch` stub and request recorder in `openai-compatible-llm.test.ts` with four response fixtures (chat-completion JSON, SSE frame sequence, empty + populated model list, ECONNREFUSED rejection). Prove the SSE fixture drives `streamText` to yield two chunks before any scenario is written. [expert]
- [x] 2.3 (2b) Write the eight hermetic scenarios as failing tests against that stub; assert URLs, absent `Authorization` header, request body `model` field through the recorder. [expert]
- [x] 2.4 (3) Implement `createOpenAiCompatibleLlm` in `openai-compatible-llm.ts` — `complete`/`stream`/`status` per plan task 3; error rewrap naming base URL with `ai` error as `cause`; `AbortError` passes through; `maxRetries: 0`; `createOpenAICompatible(...)` model instance; doc comments on exported functions. [expert]
- [x] 2.5 (4) Implement `llmConfigFromEnv` in the same module with the two defaults; extend the test file with the environment-resolution scenario (both defaults, independent overrides, no filesystem read). [expert]

## Phase 2: Implementation (Group B — parallel standard tasks)
- [x] 2.6 (6) Add `Live-tier tests are gated by an environment flag` assertions to `tests/workspace.test.ts`. Generalise `nonTestSourceFiles` into a predicate+root walker leaving the current call site unchanged; collect every `*.live.test.ts`; assert each names `CHRYSALYST_LIVE_LLM` in a `skipIf` and has no module-scope `await` (match `await`/`for await` at zero indentation); second assertion extracts each `skipIf` guard expression and evaluates it via `runInNewContext` from `node:vm` against `''`, `undefined`, `'1'` (skip/skip/run). No `new Function`.
- [x] 2.7 (7) Correct the `LlmBackendStatus` doc comment in `packages/core/src/ports/llm.ts` — list is present but may be empty when the backend cannot be asked. No type change, no dependency; `ports.test.ts` stays green untouched.
- [x] 2.8 (8) Amend three lines of `specs/roadmap.md` § M1 per plan task 8 (`**Pläne:**` → `add-ollama-llm-adapter`; `**Liefert:**` → empty model list; `**Fertig, wenn:**` → empty list, no throw). Change nothing else.

## Phase 2: Implementation (Group C — live test file)
- [x] 2.9 (5) Write `openai-compatible-llm.live.test.ts` — suite guarded by `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`; construct adapter from `llmConfigFromEnv()`; drive `status`, `complete`, `stream`, mid-stream abort against the real daemon; no top-level `await`; `testTimeout` 120000 ms.

## Phase 2: Implementation (Group D — HUMAN STEP)
- [x] 2.10 (9) **Human step.** WSL2 mirrored networking active (`eth0 192.168.178.177/24`, `.wslconfig` header typo `[wsl12]`→`[wsl2]` fixed). Windows-host Ollama reachable at `127.0.0.1:11434`. `llama3.2:3b` NOT pulled; user elected to run the live tier against `qwen3:8b` via `CHRYSALYST_LLM_MODEL` — recorded as a deviation in the verification report.

## Phase 4: Code Review
- [x] 4.1 Review all changed files (code-reviewer agent) — 4 findings (standard 3, expert 1)

## Phase 4: Review Fixes
- [x] 4.1 In `openai-compatible-llm.test.ts`, add a case to the test `resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe` that stubs `models` with `new Response('service unavailable', { status: 200 })` and asserts `status()` resolves to `{ available: false, models: [] }`.
- [x] 4.2 In `openai-compatible-llm.ts`, change `llmConfigFromEnv` so an empty-string `CHRYSALYST_LLM_BASE_URL` or `CHRYSALYST_LLM_MODEL` falls back to the default via a helper that treats `undefined` and `''` alike; extend the `openai-compatible-llm.test.ts` test `defaults to Ollama on loopback and lets each variable override` with a case asserting `llmConfigFromEnv({ CHRYSALYST_LLM_BASE_URL: '', CHRYSALYST_LLM_MODEL: '' })` returns both defaults.
- [x] 4.3 In `openai-compatible-llm.test.ts`, reword the lines ~24-28 fixture comment to keep only the provenance rationale (a verified recording of the SSE shape `@ai-sdk/openai-compatible@2.0.74` accepts) and drop the `plan.md § Dependencies` reference and the frame-format restatement.
- [x] 4.4 In `packages/server/src/adapters/llm/openai-compatible-llm.test.ts`, add a hermetic scenario stubbing `chatCompletions` with a `Response` whose body `ReadableStream` enqueues one valid delta frame and then calls `controller.error(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))`; assert consuming `llm.stream(GREETING)` rejects with an `Error` whose message names the base URL and whose cause chain carries the `ECONNRESET` error. Add a second case delivering the same mid-stream body error while the caller aborts after the first chunk; determine empirically whether `textStream` throws or ends quietly once the signal is aborted, then either pin the `if (cancelled(signal)) return` branch (`openai-compatible-llm.ts:104`) with that test or, if it proves unreachable, collapse the catch body to an unconditional `throw unreachable(config.baseUrl, error)` and record the quiet-end-on-abort behaviour in the `stream` doc comment. Leave no dead branch; lines 104-107 must end up covered. [expert]

## Phase 5: Verification
- [x] 5.1 Install — exit 0; lockfile records `ai@6.0.277`, `@ai-sdk/openai-compatible@2.0.74`, one `@ai-sdk/provider@3.0.15`
- [x] 5.2 Build — `pnpm -r build` exit 0
- [x] 5.3 Test — `pnpm -r --include-workspace-root test` 0 failures; server 17 passed / 1 skipped (live)
- [x] 5.4 Test (live) — `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` exit 0; server 18 passed / 0 skipped; live suite 27s
- [x] 5.5 Coverage — exit 0; server 97.01% stmts / 91.89% branch / 100% funcs; no threshold failure
- [x] 5.6 Typecheck — `pnpm typecheck` exit 0
- [x] 5.7 Lint — `pnpm lint` 0 errors, 0 warnings
- [x] 5.8 Format — `pnpm format:check` clean (fixed pre-existing `.mcp.json` nit)
- [x] 5.9a Scenario coverage audit — all hermetic + unit scenario rows have passing tests
- [x] 5.9b Manual live testing — status+stream against real daemon (colours streamed token-by-token); unreachable backend → `{available:false,models:[]}` + stream throws naming base URL; base-URL override honoured. `llama3.2:3b` pull row skipped (model substituted).

## Phase 6: Verification Report
- [x] 6.1 Generate verification-report.md — PASS

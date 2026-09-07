# Code Review Findings: add-ollama-llm-adapter

## Summary
- Files reviewed: 8
- Total findings: 4 (standard: 3, expert: 1)

Baseline verified green on this branch: `npm run lint` (0 errors), server + core + root
Vitest suites pass (live suite skipped), typecheck clean. Adapter file coverage
93.02% stmts / 88.23% branch — the uncovered lines (104-107) are the subject of the
expert finding below.

Implementer-flagged deviations, adjudicated:
1. `stream`'s `onError` capture + post-loop throw is **sound and necessary** — empirically
   confirmed against `ai@6.0.277`: `textStream` does not throw on a pre-stream transport
   failure (connection refused, malformed stream); it ends quietly and routes the error to
   `onError`. Plain delegation would resolve the iteration cleanly and violate the spec
   clause. Both throw sites are reachable in production (post-loop throw for pre-stream
   failure; catch-block throw for a connection dropped mid-stream, where `textStream` *does*
   throw an `APICallError`). The catch-block throw is untested — see the expert finding.
2. Abort detection on `signal?.aborted === true` rather than `name === 'AbortError'` is
   **sound and arguably more correct**: it keys on the caller's own intent, is deterministic,
   and the rethrown original error is still the `AbortError`-named `DOMException` the spec's
   `complete` scenario requires. No finding.
3. `llmConfigFromEnv` `??` admitting empty-string overrides — **not fully sound**, raised as a
   standard finding below.
4. Nine hermetic scenarios vs. "eight" in task 2b is **correct**: task 4 adds the ninth
   (`llmConfigFromEnv`), and § Verification lists all nine test names for the file. No finding.
5. `nonTestSourceFiles` as a wrapper over `filesUnder` — **behaviour genuinely unchanged** for
   the current call site: `rootDir` is never `''` there, and `packages/*/src` contains none of
   the newly-pruned directories (`node_modules`, `dist`, `coverage`, dotdirs). No finding.

## Standard fixes

### packages/server/src/adapters/llm/openai-compatible-llm.ts

#### [MISSING_BOUNDARY_TEST] `status` has no test for a 200 response with a non-JSON body
- Location: lines 47-66 (`status`), specifically `await response.json()` at line 53
- Issue: a reachable OpenAI-compatible endpoint (or a reverse proxy in front of one) can answer
  `200 OK` with a non-JSON body — an HTML or plain-text error page. `response.json()` then throws
  `SyntaxError` (verified), which the outer `catch` at line 61 maps to `UNREACHABLE` — the
  correct outcome. No hermetic scenario exercises this path; test 6
  (`resolves unavailable for a refused connection and for an unreadable 200 body...`) only covers
  a 200 whose *parsed JSON* fails the `isModelList` guard, not a body that fails to parse at all.
- Fix: In `packages/server/src/adapters/llm/openai-compatible-llm.test.ts`, add a case to the
  test `resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe`
  that stubs `models` with `new Response('service unavailable', { status: 200 })` and asserts
  `status()` resolves to `{ available: false, models: [] }`.

#### [MISSING_BOUNDARY_TEST] `llmConfigFromEnv` admits an empty-string env var into the config
- Location: lines 129-132, the `env.CHRYSALYST_LLM_BASE_URL ?? DEFAULT_BASE_URL` /
  `env.CHRYSALYST_LLM_MODEL ?? DEFAULT_MODEL` expressions
- Issue: `??` only falls back on `null`/`undefined`. `CHRYSALYST_LLM_BASE_URL=''` (how a shell or
  a CI `env:` block expresses "cleared") resolves to `baseUrl: ''`, and
  `createOpenAiCompatibleLlm` then throws a bare `TypeError [ERR_INVALID_URL]` from `new URL`
  (line 42) that names neither the variable nor the empty value. `CHRYSALYST_LLM_MODEL=''`
  resolves to `defaultModel: ''`, sending every `generateText`/`streamText` request against
  model `""`. This is the same empty-means-off case the plan's own `CHRYSALYST_LIVE_LLM` guard
  handles deliberately (decision-log [3], plan-review round 1) — the feature now carries two
  conflicting empty-string conventions. There is no test pinning either behaviour for these two
  variables.
- Fix: In `packages/server/src/adapters/llm/openai-compatible-llm.ts`, change `llmConfigFromEnv`
  so an empty-string `CHRYSALYST_LLM_BASE_URL` or `CHRYSALYST_LLM_MODEL` falls back to the
  default (e.g. resolve each via a helper that treats `undefined` and `''` alike, matching the
  `(x ?? '') === ''` test the live-tier flag uses). In
  `packages/server/src/adapters/llm/openai-compatible-llm.test.ts`, extend the test
  `defaults to Ollama on loopback and lets each variable override` with a case asserting
  `llmConfigFromEnv({ CHRYSALYST_LLM_BASE_URL: '', CHRYSALYST_LLM_MODEL: '' })` returns both
  defaults.

### packages/server/src/adapters/llm/openai-compatible-llm.test.ts

#### [OUTDATED_COMMENT] Fixture comment points at a doc that `/speq:record` archives, and restates the frame format
- Location: lines 24-28
- Issue: the comment says the frames are "the sequence recorded in plan.md § Dependencies,
  verbatim" — `/speq:record` moves `plan.md` out of `specs/_plans/add-ollama-llm-adapter/`, so
  the pointer dangles. The trailing clause ("one `data:` line per frame, each closed by a blank
  line, a final frame carrying `finish_reason: "stop"`, then `[DONE]`") restates what
  `WELCOME_FRAMES` shows literally.
- Fix: In `packages/server/src/adapters/llm/openai-compatible-llm.test.ts`, reword the lines
  24-28 comment to keep only the provenance rationale (these frames are a verified recording of
  the SSE shape `@ai-sdk/openai-compatible@2.0.74` accepts, not an invented one) and drop both
  the `plan.md` reference and the format restatement.

## Expert fixes

### packages/server/src/adapters/llm/openai-compatible-llm.ts

#### [UNTESTED_ERROR_PATH] `stream`'s catch block — a connection dropped mid-stream — is unverified
- Location: lines 101-108, the `try { yield* answer.textStream } catch (error) { ... }` block
- Issue: `ai@6.0.277` surfaces stream failures through two different channels (both verified
  empirically against the installed tree):
  - a failure *before* the stream produces data (connection refused, malformed/finish-reason-less
    stream) — `textStream` ends without throwing and the error arrives via `onError`; the adapter
    handles this at the post-loop throw (lines 110-112), which test
    `rejects complete and stream naming the base URL with the transport error as cause` covers.
  - a connection dropped *after* headers arrive (`ECONNRESET` mid-body) — `textStream` throws an
    `APICallError` whose `cause.code` is `ECONNRESET`; the adapter handles this only in the catch
    block at lines 103-108.

  No hermetic test drives `textStream` to throw, so lines 104-107 are uncovered (confirmed by
  `v8` coverage). The spec clause "`stream` MUST reject the same way [as `complete`] when its
  first chunk is consumed" (`adapters/ollama-llm-adapter/spec.md`, scenario "An unreachable
  backend fails a completion with the endpoint named") is therefore only half-verified, and a
  regression in `unreachable(config.baseUrl, error)` at line 107 — or in the `cancelled(signal)`
  guard at line 104 that protects decision-log [6]'s "a cancelled `stream` ends quietly" — would
  pass the whole suite. The `cancelled(signal)` guard inside the catch could not be triggered
  empirically (an aborted signal makes `textStream` end quietly rather than throw), so its
  reachability is itself unconfirmed.
- Fix: In `packages/server/src/adapters/llm/openai-compatible-llm.test.ts`, add a hermetic
  scenario that stubs `chatCompletions` with a `Response` whose body `ReadableStream` enqueues
  one valid delta frame and then calls `controller.error(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))`.
  Assert that consuming `llm.stream(GREETING)` rejects with an `Error` whose `message` contains
  the base URL and whose cause chain carries the `ECONNRESET` error (add an `isReset` predicate
  or generalise `isRefusal`). Then add a second case with the same mid-stream body error while
  the caller aborts the signal after the first delivered chunk: if the iteration ends without
  rejecting, that pins the `if (cancelled(signal)) return` branch; if the branch proves
  unreachable because `textStream` always ends quietly once the signal is aborted, collapse the
  catch body to an unconditional `throw unreachable(config.baseUrl, error)` and note the
  `textStream` quiet-end-on-abort behaviour in the `stream` doc comment.

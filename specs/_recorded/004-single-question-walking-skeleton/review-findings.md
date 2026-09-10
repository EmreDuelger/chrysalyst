# Code Review Findings: single-question-walking-skeleton

## Summary

- Files reviewed: 43
- Total findings: 18 (standard: 15, expert: 3)

Scope note: only files on the supplied changed-files list were reviewed. Pre-existing
code in `packages/server/src/adapters/session-store/filesystem-session-store.ts` outside
the `renderTranscript` widening was left alone.

## Standard fixes

### packages/web/src/interview/sse-frames.test.ts

#### [OUTDATED_COMMENT] TDD scaffold survives as a type-erasing dynamic import

- Location: lines 12-32 (`SseFrame`, `FrameParser`, `parserModulePath`, `loadParser`), plus the `await loadParser()` line in every test
- Issue: the doc comment states "The module under test does not exist until task 14. Loading it lazily keeps this file collectable". `packages/web/src/interview/sse-frames.ts` exists, so the statement is false. The scaffold it justifies is now harmful: `(await import(/* @vite-ignore */ parserModulePath)) as { parseSseFrames: FrameParser }` casts the module through a locally redeclared `FrameParser`, and `SseFrame` is redeclared here instead of imported. Renaming `parseSseFrames` or changing its signature therefore still type-checks and still passes `pnpm typecheck`; it fails only at runtime with a missing-property error. The type-level half of the contract the test exists to hold is not being checked.
- Fix: In packages/web/src/interview/sse-frames.test.ts, replace the lazy loader with a static `import { parseSseFrames, type SseFrame } from './sse-frames.ts';` at the top of the file; delete the local `SseFrame` interface (lines 7-15), the `FrameParser` type alias, the `parserModulePath` constant, the `loadParser` function and its doc comment; and delete the `const parseSseFrames = await loadParser();` line from each of the five tests that has one. Run `pnpm --filter @chrysalyst/web test` and `pnpm typecheck` and show the output.

### packages/web/src/interview/interview-api.test.ts

#### [INFORMATION_LEAKAGE] The shared fixture's payloads are restated as hand-written literals

- Location: lines 23-30 (`FIXTURE_TOKENS`, `FIXTURE_QUESTION`, `FIXTURE_ERROR`)
- Issue: the file already reads `tests/fixtures/interview-sse-frames.txt` into `fixtureText` (lines 18-21), then restates the same three payload strings as literals and asserts against the literals. The plan's § Consequences row on the fixture exists because "the frame format is one decision reflected in three modules ... and nothing executable held them in agreement"; a second hand-written copy of the payloads inside a consumer reintroduces exactly that. `packages/server/src/routes/interview-routes.test.ts` derives its expectations from the file (`decodeFrame(firstTokenFrame).data.text`); this file does not, so the two sides of the same contract are checked by two different sources of truth.
- Fix: In packages/web/src/interview/interview-api.test.ts, delete the `FIXTURE_TOKENS`, `FIXTURE_QUESTION` and `FIXTURE_ERROR` literals and derive them from `fixtureText`: split it on `'\n\n'`, drop empty blocks, take each block's `data: ` line, `JSON.parse` it, and read `text` from the two `token` frames, `question` from the `done` frame and `message` from the `error` frame. Keep every assertion pointing at the derived values. Run `pnpm --filter @chrysalyst/web test` and show the output.

#### [DUPLICATE_TEST] Environment probe duplicates coverage every other test already provides

- Location: lines 79-83, `it('has Response, ReadableStream and TextDecoder in the test environment')`
- Issue: the test asserts three globals are functions. Every other test in the file constructs a `Response` over a `ReadableStream` in `streamingResponse` and drives it through `decodeBody`'s `TextDecoder`, so the globals are already exercised; the probe can never fail for a reason relating to `interview-api.ts`. Plan task 17 asked to "Confirm during this task that `Response`, `ReadableStream`, and `TextDecoder` are all reachable under the package's jsdom environment, and show the passing run as the evidence" — a confirmation to be shown in the task's output, not a permanent test.
- Fix: In packages/web/src/interview/interview-api.test.ts, delete the `it('has Response, ReadableStream and TextDecoder in the test environment')` block at lines 79-83. Run `pnpm --filter @chrysalyst/web test` and show the output.

### packages/web/src/interview/interview-api.ts

#### [INLINE_COMMENT] Comment inside the empty catch block of `refusalMessage`

- Location: line 189, `// The refusal body was not JSON; fall back to the status code.`
- Issue: guardrails ban inline comments; private helpers carry no comments at all. The comment is currently load-bearing for lint — `js.configs.recommended`'s `no-empty` ignores a block that contains a comment — so deleting it alone would turn a lint error on. The catch must gain a statement instead.
- Fix: In packages/web/src/interview/interview-api.ts, rewrite `refusalMessage` so the catch returns rather than falls through, and delete the comment:

  ```ts
  async function refusalMessage(response: Response): Promise<string> {
    const fallback = `The API refused the answer with status ${String(response.status)}`;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fallback;
    }
    return isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : fallback;
  }
  ```

  Run `pnpm lint` and `pnpm --filter @chrysalyst/web test` and show the output.

#### [SHRINKABLE] Two members of `browserInterviewApi` are forwarding wrappers

- Location: lines 121-125
- Issue: `createSession: () => createSession()` and `submitAnswer: (id, answer) => submitAnswer(id, answer)` re-wrap functions whose trailing `fetchImpl` parameter is already optional and already defaults to the global `fetch`. A function with an optional trailing parameter is assignable to a signature that omits it, so both wrappers are assignable directly. Only `openQuestionStream` needs a lambda, because it reorders `signal` past `fetchImpl`.
- Fix: In packages/web/src/interview/interview-api.ts, change `browserInterviewApi` to use shorthand members for the two forwarders — `createSession,` and `submitAnswer,` — and keep `openQuestionStream: (id, signal) => openQuestionStream(id, fetch, signal),` unchanged. Run `pnpm typecheck` and `pnpm --filter @chrysalyst/web test` and show the output.

### packages/web/src/interview/InterviewView.test.tsx

#### [ASSERTION_FREE_TEST] `if (form)` makes the acting step optional, so two tests can pass without exercising anything

- Location: lines 254-260 and 293-299
- Issue: both sites do `const form = document.querySelector('form'); if (form) { await act(...) fireEvent.submit(form) ... }`. When the query returns `null` the submit never fires and the test still reaches its assertion. In `sends no request while the field is blank` the closing assertion is `expect(submitAnswer).not.toHaveBeenCalled()`, which passes trivially on a view that renders no form at all — the test would stay green through a regression that removed the answer form. The same guard weakens `names the in-flight state, disables both controls, and refuses a second submission`, whose `expect(submitAnswer).toHaveBeenCalledTimes(1)` also passes when the second submit never fired.
- Fix: In packages/web/src/interview/InterviewView.test.tsx, at both sites replace the `if (form) { ... }` guard with a failing retrieval: `const form = document.querySelector('form'); expect(form).not.toBeNull();` and then run the `await act(async () => { fireEvent.submit(form as HTMLFormElement); await tick(); });` block unconditionally. Run `pnpm --filter @chrysalyst/web test` and show the output.

#### [MAGIC_NUMBER] `tick()` guesses six microtask hops

- Location: lines 70-72
- Issue: `async function tick() { for (let hop = 0; hop < 6; hop += 1) await Promise.resolve(); }`. The `6` is unexplained and is a guess at how many microtask turns `InterviewView`'s effect chain needs to drain. Adding one `await` inside `run()` in `InterviewView.tsx` would silently make the flush too short, and the failures would surface as unrelated assertion errors rather than as a named problem.
- Fix: In packages/web/src/interview/InterviewView.test.tsx, extract the literal `6` into a module-scope named constant `EFFECT_CHAIN_MICROTASK_HOPS` declared beside `STREAMING_ALTERNATIVE`, and use it as the loop bound in `tick()`. Run `pnpm --filter @chrysalyst/web test` and show the output.

### packages/web/src/interview/InterviewView.module.css

#### [UNREACHABLE_CODE] `.answerField::placeholder` styles an attribute the view never sets

- Location: lines 105-107
- Issue: the `<textarea>` in `packages/web/src/interview/InterviewView.tsx` lines 195-203 carries no `placeholder` attribute, no `interview/interview-view` scenario asks for one, and § Design Direction's *complete* state uses a separate one-line hint instead. The rule can never match.
- Fix: In packages/web/src/interview/InterviewView.module.css, delete the `.answerField::placeholder` rule at lines 105-107. Run `pnpm --filter @chrysalyst/web test` and `pnpm format:check` and show the output.

#### [MAGIC_NUMBER] Disabled-submit colour is a raw hex outside the token layer

- Location: line 154, `.submit:disabled { color: #a7a299; }`
- Issue: every other colour in this module reads a `:root` custom property. Plan task 20 puts the palette in the token layer so § Design Direction's table is the one place a colour is decided; this literal is invisible to a token change and appears in no token table.
- Fix: In packages/web/src/interview/InterviewView.module.css, replace `color: #a7a299;` in `.submit:disabled` with `color: var(--ink-soft);` and add `opacity: 0.55;` to the same rule so the disabled control keeps its quieter tone through the token layer. Run `pnpm --filter @chrysalyst/web test` and `pnpm format:check` and show the output.

### packages/web/src/vite-config.test.ts

#### [DEAD_FLEXIBILITY] `proxyTarget` handles an entry shape the config never produces

- Location: lines 12-19
- Issue: `proxyTarget` branches on `typeof entry === 'string'` and on an object carrying a `target` property. `packages/web/vite.config.ts` line 15 declares `'/interview': apiServer`, a string, and the sibling test at line 30 pins that the table holds no other key — so the object branch and the `undefined` fallback are never exercised. The defensive branches also mean a config that silently degraded to an object with no `target` would return `undefined` and produce a confusing failure instead of a direct one.
- Fix: In packages/web/src/vite-config.test.ts, delete the `proxyTarget` helper and the `ProxyConfig`-shaped indirection around it, and assert the entry directly: `expect(proxy?.['/interview']).toBe('http://127.0.0.1:3000');`. Run `pnpm --filter @chrysalyst/web test` and show the output.

### packages/server/src/routes/interview-routes.test.ts

#### [SELECTOR_ARGUMENT] `createFakeLlm` picks its branch from a discriminated argument

- Location: lines 86-126
- Issue: `createFakeLlm(script: { chunks } | { reject } | { endless })` uses `'reject' in script` and `'chunks' in script` to choose which of three unrelated `stream` implementations to install. Guardrails: "No selector arguments of any type — an argument that picks a branch means two functions", and test code follows every rule. The sibling suite `packages/core/src/interview/single-turn-interview.test.ts` already models the same doubles correctly with two separate factories (`scriptedLlm`, `rejectingLlm`), so the two suites disagree on how to build the same kind of double.
- Fix: In packages/server/src/routes/interview-routes.test.ts, replace `createFakeLlm` with three factories that each return a `FakeLlm`: `chunkedLlm(chunks: readonly string[])`, `rejectingLlm(message: string)`, and `endlessLlm()`. Give each its own `stream` body, drop the `script` union type, and update every call site (`createFakeLlm({ chunks: modelChunks })` → `chunkedLlm(modelChunks)`, `createFakeLlm({ reject: unreachableMessage })` → `rejectingLlm(unreachableMessage)`, `createFakeLlm({ endless: true })` → `endlessLlm()`). Run `pnpm --filter @chrysalyst/server test` and show the output.

### packages/server/src/routes/interview-routes.live.test.ts

#### [INFORMATION_LEAKAGE] The adapter's default model name is decided a second time in the live test

- Location: line 25 (`const DEFAULT_MODEL = 'llama3.2:3b'`), read at line 103 and printed at line 151
- Issue: `packages/server/src/adapters/llm/openai-compatible-llm.ts` line 6 already declares `const DEFAULT_MODEL = 'llama3.2:3b'` and line 135 resolves the effective model as `orDefault(env.CHRYSALYST_LLM_MODEL, DEFAULT_MODEL)`. The live test's copy configures nothing — the adapter resolves its own model from the environment — it only labels the `[feasibility]` line. So with `CHRYSALYST_LLM_MODEL` unset, the two constants must be kept in step by hand or the printed model name stops naming the model that was actually measured, and the printed figure is the milestone's single deliverable artefact (§ Feasibility measurement). The plan's § Feasibility risk further records that `llama3.2:3b` is not pulled on the target host, so this default is already the wrong label there.
- Fix: In packages/server/src/routes/interview-routes.live.test.ts, delete the `DEFAULT_MODEL` constant at line 25, import `llmConfigFromEnv` from `../adapters/llm/openai-compatible-llm.ts`, and derive the printed name from the same resolution the adapter uses: `const model = llmConfigFromEnv(process.env).defaultModel;` at line 103. Run `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm --filter @chrysalyst/server test` and show the printed `[feasibility]` line.

### packages/server/src/server.test.ts

#### [IMPLEMENTATION_COUPLED_TEST] A test greps its own module's source text

- Location: lines 81-88, `it('does not import the app it serves, so a caller decides which app is bound')`
- Issue: the test reads `server.ts` off disk and asserts `expect(source).not.toMatch(/from '\.\/app\.ts'/)`. That asserts source text, not observable behaviour: it passes for `from "./app.ts"`, for `await import('./app.ts')`, and for a re-export through any other module. It also adds nothing — `startServer(app, port, host?)`'s signature is enforced by `pnpm typecheck`, and the three behavioural tests above it already bind an app the caller constructed.
- Fix: In packages/server/src/server.test.ts, delete the `it('does not import the app it serves, so a caller decides which app is bound')` block at lines 81-88 and the now-unused `import { readFile } from 'node:fs/promises';` at line 1. Run `pnpm --filter @chrysalyst/server test` and `pnpm lint` and show the output.

### packages/core/src/index.test.ts

#### [NONDETERMINISTIC_TEST] Global spies and the module registry are restored inside the test body

- Location: lines 18-26 and 28-36
- Issue: both tests call `vi.spyOn(globalThis, 'Date')` / `vi.spyOn(globalThis, 'fetch')` and `vi.resetModules()`, then call `vi.restoreAllMocks()` as the last statement of the body. When an assertion fails, that last statement never runs and the global stays mocked for every later test in the file, turning one failure into a cascade whose cause is not the reported one. There is no `afterEach` in this file to catch it.
- Fix: In packages/core/src/index.test.ts, add `afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });` inside the `describe` block (importing `afterEach` from vitest) and delete the two in-body `vi.restoreAllMocks()` calls at lines 25 and 35. Run `pnpm --filter @chrysalyst/core test` and show the output.

#### [VAGUE_TEST_NAME] A test name claims a filesystem guarantee its body never asserts

- Location: line 28, `it('opens no socket and creates no session when imported')`
- Issue: the body spies only on `globalThis.fetch` and asserts it was not called. Nothing in it observes the filesystem, so "creates no session" is unverified here and a reader would wrongly believe this test covers the `core-ports-contract` clause "importing the entry point MUST NOT open a socket, read a file, or read the system clock". The file clause is in fact enforced structurally by `tests/workspace.test.ts`'s `core declares no runtime dependencies and its non-test source imports none`, which rejects every non-relative specifier including `node:fs` — so the coverage exists, but not where this name says it does.
- Fix: In packages/core/src/index.test.ts line 28, rename the test to `opens no socket when imported` so its name states only the condition and behaviour its body asserts. Run `pnpm --filter @chrysalyst/core test` and show the output.

## Expert fixes

### packages/core/src/interview/single-turn-interview.ts

#### [MISSING_BOUNDARY_TEST] A caller that resolves before the save and pulls after it starts a second inference and overwrites the stored question

- Location: lines 285-318 (`streamQuestion`), lines 273-283 (`productionFor`), lines 335-345 (`openingQuestion`)
- Issue: `openingQuestion` loads the session and hands back the generator without running it; `productionFor(session)` runs on the generator's **first pull**, and `endProduction` calls `forget()` as soon as the save resolves. A caller whose `openingQuestion` resolved while the turn list was still empty, but whose first pull lands after the running production saved and was forgotten, therefore finds no entry in the map, starts a second production, reaches the model a second time, and — because it still holds the stale `session` snapshot captured before the save — writes `{ turns: [...session.state.turns, asked] }` over the stored turn, replacing the question a client was already shown.

  This breaks two named requirements: § Requirements "Generate once — The model is reached at most once per session within one server process" and "Durable before announced — A client that observed `done` and reloads MUST see the same question". The existing concurrency tests do not reach it: `serves a concurrent second request from the in-flight production` and `keeps the shared production alive when one of two callers abandons it` both start their second caller's iteration while the first production is still gated, so the map lookup always hits.

  Reproduced against the current module (second caller resolves first, pulls last):

  ```
  { "firstText": "question 1?", "secondText": "question 2?",
    "modelRequests": 2,
    "storedTurns": [ { "status": "asked", "question": "question 2?", ... } ] }
  ```

  Expected: `modelRequests` 1 and both callers seeing the same text.
- Fix: In packages/core/src/interview/single-turn-interview.ts, re-establish the session at the moment the production is joined rather than at the moment the iterable was handed out. Change `streamQuestion` to take the session identifier instead of the loaded snapshot, and make its first statements a fresh load: `const current = await deps.sessions.load(id); if (current === undefined) return; const stored = current.state.turns.at(-1); if (stored !== undefined) { yield stored.question; return; } const production = productionFor(current);`. Pass `id` from `openingQuestion` (`return streamQuestion(id, signal);`) and leave `openingQuestion`'s own load-and-replay branch as it stands, so a refused request still costs no inference. Update `createSingleTurnInterview`'s doc comment to state that membership in a production is decided on the first pull against a freshly loaded session, which is what makes generate-once hold for a caller that arrived before the save and pulled after it. Add a regression test to packages/core/src/interview/single-turn-interview.test.ts named `replays the stored question for a caller that resolved before the save and pulled after it`: begin a session, call `openingQuestion` and hold the returned iterable without pulling, drive a second `openingQuestion` to completion, then consume the held iterable and assert `model.requests` has length 1, both texts are equal, and the store holds exactly one turn whose `askedAt` is unchanged. Run `pnpm --filter @chrysalyst/core test` and `pnpm --filter @chrysalyst/server test` and show the output.

#### [TACTICAL_SHORTCUT] Abandonment never releases the model's iterator, and the documented final advance is coalesced away

- Location: lines 70-91 (`QuestionProduction` doc comment), lines 206-218 (`leave` and `advance`), lines 182-195 (`pullChunk`)
- Issue: the doc comment states "Cancelling the run advances it one final time: a stream that reads its signal between chunks learns it was cancelled only when it is resumed, and a stream nobody resumes never releases what it holds." `advance()` is `pending ??= pullChunk()`, so when a pull is already in flight at the moment the last caller leaves, the "final advance" resolves to that same in-flight pull and no further pull ever happens. Nothing on any path calls `iterator.return()`, so the whole abandonment contract rests on the `LlmPort` implementation reading the signal the interview handed it. A port that does not — a buffered or replaying implementation, or any future adapter — leaves the model's async generator suspended forever with its `finally` block unrun.

  Reproduced with a model double whose `stream` never inspects its `signal` and whose `finally` records release, with a pull in flight when the sole caller abandons:

  ```
  { "modelGeneratorReleased": false, "pullsAfterAbort": 0 }
  ```

  `interview/interview-http-api`'s scenario `A client that abandons the question stream stores nothing` requires "the app MUST stop consuming the language model". The route test passes only because its `endless` double checks `cancelled(signal)` itself, so the assertion currently measures the double rather than the interview.
- Fix: In packages/core/src/interview/single-turn-interview.ts, hoist the model iterator so `leave` can reach it and finalise it on cancellation. In `startProduction`'s `leave`, after `controller.abort();` and `void production.advance();`, add `void Promise.resolve(iterator.return?.()).catch(ignoreUnobservedRejection);` so the generator is returned once the pending pull settles even when the model never read its signal. Rewrite the `QuestionProduction` doc comment so it states that cancellation both advances the run once and returns the iterator, and why both are needed. Add a test to packages/core/src/interview/single-turn-interview.test.ts named `releases the model's stream when the caller abandons it and the model never reads its signal`: use a model double whose `async *stream` ignores its `signal`, yields on a `queueMicrotask`-driven gate, and sets a `released` flag in a `finally`; take the first chunk, abort the caller's signal, settle, and assert `released` is `true` and the store holds an empty turn list. Run `pnpm --filter @chrysalyst/core test` and `pnpm --filter @chrysalyst/server test` and show the output.

### packages/core/src/interview/single-turn-interview.test.ts

#### [NONDETERMINISTIC_TEST] Wall-clock sleeps sequence the concurrency and abort interleavings

- Location: packages/core/src/interview/single-turn-interview.test.ts lines 19-20 (`const settle = () => new Promise((resolve) => setTimeout(resolve, 5))`, used in five tests), and packages/server/src/routes/interview-routes.test.ts line 116 (`await new Promise((tick) => setTimeout(tick, 5))` inside the endless model double)
- Issue: guardrails require tests to be "Independent and repeatable: no shared mutable state, no real clock". A 5 ms budget is an assumption about how much of the event loop the machine will get through in five milliseconds, and it is being used to order exactly the interleavings this milestone's correctness rests on — `serves a concurrent second request from the in-flight production`, `keeps the shared production alive when one of two callers abandons it`, `stores nothing and does not reject when the caller aborts mid-stream`, and `lets the model observe the cancellation without the caller pulling again`. Under load a short sleep can under-run, and the failure mode of that is not a red bar but a test that passes while asserting a different interleaving from the one it names. The doubles contain no timers and no I/O, so the whole chain the sleep is waiting on is microtasks — a `setImmediate` fires only after they have all drained, which is both stronger and free of a wall-clock budget.
- Fix: In packages/core/src/interview/single-turn-interview.test.ts lines 19-20, replace the body of `settle` with `new Promise((resolve) => { setImmediate(resolve); })`, keeping the `Promise<void>` return type. In packages/server/src/routes/interview-routes.test.ts line 116, replace `await new Promise((tick) => setTimeout(tick, 5));` with `await new Promise((tick) => { setImmediate(tick); });`. Change nothing else in either file — no call site moves and no assertion changes. Verified against the current module: the three gated interleavings (`concurrent-second-request`, `shared-production-abandon`, `abort-mid-stream`) all hold under `setImmediate`. Run `pnpm --filter @chrysalyst/core test` and `pnpm --filter @chrysalyst/server test` and show the output.

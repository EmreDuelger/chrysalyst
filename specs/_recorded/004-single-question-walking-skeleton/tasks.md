# Tasks: single-question-walking-skeleton

Worktree: `.claude/worktrees/skeleton` · branch `feat/single-question-walking-skeleton`.
Task numbers match `plan.md` § Implementation Tasks (1–23). `[expert]` routes to `implementer-expert-agent`.

## Phase 2: Implementation (Group A — packages/core, ordered)
- [x] 1 Red — `InterviewState` v1: `state.test.ts` + `state.test-d.ts` (tagged-union `@ts-expect-error` placement per plan)
- [x] 2 Green — `state.ts` (two closed shapes, `status` tag, `isAnswered`)
- [x] 3 Red — interview behavioural scenarios: `single-turn-interview.test.ts`, 15 scenarios over 3 doubles
- [x] 4 Green — `createSingleTurnInterview` (interview-owned AbortController, ref-counted; process-local in-flight Map; store-nothing cases) [expert]
- [x] 5 Red then green — `transcript.ts` + `transcript.test.ts` (`renderTranscript(session)`, three states incl. empty list)
- [x] 6 Core entry point: `interview/index.ts`, extend `src/index.ts` value export, `src/index.test.ts`

## Phase 2: Implementation (Group B — tests/fixtures)
- [x] 7 Shared raw-frame fixture `tests/fixtures/interview-sse-frames.txt` + `tests/fixtures/README.md` (two segments; `done` = concat of the two `token` payloads; `error` message = task 9's failing double)

## Phase 2: Implementation (Group C — packages/server, ordered; needs A + B)
- [x] 8 Red then green — store's optional `renderTranscript` config (defaulted type param; 003 scenarios stay green)
- [x] 9 Red — route contract `interview-routes.test.ts` (fixture-split frame assertions, `reader.cancel()` abort, replay, storage-failure, on-disk read)
- [x] 10 Green — routes + app factory: `interview-routes.ts`, `createApp(deps)`, `AppType = ReturnType<...>`, two-arg `streamSSE`, `onAbort` via body cancel [expert]
- [x] 11 Green — typed client `client.test-d.ts` + `startServer(app, port, host?)` signature change
- [x] 12 Composition root: `system-clock.ts`, `composition.ts` (`renderTranscript` by reference), `main.ts`, `composition.test.ts`

## Phase 2: Implementation (Group D — packages/web, ordered stream + 17/18; needs B)
- [x] 13 Red — `sse-frames.test.ts` driven by the fixture, every split position
- [x] 14 Green — `sse-frames.ts` parser [expert]
- [x] 15 Red then green — `interview-api.ts` + test (`createSession`/`openQuestionStream`/`submitAnswer`, injected `fetch`)
- [x] 16 Red then green — `InterviewView.tsx` + test: 8 interview-view scenarios (6 comp states / 7 scenarios + blank-answer) + `web-shell` mount scenario; `App.tsx`/`App.test.tsx`
- [x] 17 Dev proxy in `vite.config.ts` + `vite-config.test.ts`
- [x] 18 Workspace invariant: `tests/workspace.test.ts` scan — no `@chrysalyst/` import under `packages/web/src`

## Phase 2: Implementation (Group E — live tier; needs C)
- [x] 19 `interview-routes.live.test.ts` — gated, drives real path against `qwen3:8b`, measures time to first token, asserts `<think>` absent, transcript content

## Phase 2: Implementation (Group F — styling, ordered; needs D)
- [x] 20 Approved styling — `:root` token layer + one `*.module.css` per component, all six comp states
- [x] 21 Self-hosted faces — Source Serif 4 + Libre Franklin woff2 under `packages/web`, OFL text, `impeccable font-match`
- [x] 22 Finish review + `packages/web/DESIGN.md` from the shipped world

## Phase 3: Verification (Group G)
- [x] 23 Full § Verification checklist end to end incl. every § Manual Testing row and the live row

## Phase 4: Code Review
- [x] 4.1 code-reviewer over all changed files — 18 findings (15 standard, 3 expert) → review-findings.md
- [x] 4.2 Apply review fixes — 3 expert (4.3–4.5) + 15 standard (4.6–4.20)

## Phase 4: Review Fixes
- [x] 4.3 `[MISSING_BOUNDARY_TEST]` `single-turn-interview.ts` — decide production membership on the first pull against a freshly loaded session (`streamQuestion(id, signal)`), keep `openingQuestion`'s own replay branch, update `createSingleTurnInterview`'s doc comment, add the regression test `replays the stored question for a caller that resolved before the save and pulled after it` [expert]
- [x] 4.4 `[TACTICAL_SHORTCUT]` `single-turn-interview.ts` — return the model's iterator in `startProduction`'s `leave` after the final advance, rewrite the `QuestionProduction` doc comment to state why cancellation needs both, add the test `releases the model's stream when the caller abandons it and the model never reads its signal` [expert]
- [x] 4.5 `[NONDETERMINISTIC_TEST]` replace the wall-clock sleeps that sequence the gated interleavings — `settle` in `single-turn-interview.test.ts` and the endless double's pacing in `interview-routes.test.ts` — with a zero-budget event-loop yield [expert]
- [x] 4.6 `[OUTDATED_COMMENT]` `sse-frames.test.ts` — replace the lazy `loadParser` with a static `import { parseSseFrames, type SseFrame } from './sse-frames.ts'`; delete the local `SseFrame` interface, `FrameParser` alias, `parserModulePath`, `loadParser` + its doc comment, and the per-test `const parseSseFrames = await loadParser();` lines
- [x] 4.7 `[INFORMATION_LEAKAGE]` `interview-api.test.ts` — delete the `FIXTURE_TOKENS`/`FIXTURE_QUESTION`/`FIXTURE_ERROR` literals and derive them from `fixtureText` (split on `'\n\n'`, drop empty blocks, take each block's `data: ` line, `JSON.parse`, read `text`/`question`/`message`); keep every assertion pointing at the derived values
- [x] 4.8 `[DUPLICATE_TEST]` `interview-api.test.ts` — delete the `it('has Response, ReadableStream and TextDecoder in the test environment')` block
- [x] 4.9 `[INLINE_COMMENT]` `interview-api.ts` — rewrite `refusalMessage` so the catch returns `fallback` rather than falling through, and delete the inline comment
- [x] 4.10 `[SHRINKABLE]` `interview-api.ts` — change `browserInterviewApi` to shorthand members `createSession,` and `submitAnswer,`, keeping the `openQuestionStream` lambda unchanged
- [x] 4.11 `[ASSERTION_FREE_TEST]` `InterviewView.test.tsx` — at both sites replace the `if (form) { ... }` guard with `const form = document.querySelector('form'); expect(form).not.toBeNull();` and run the `act`/`fireEvent.submit` block unconditionally
- [x] 4.12 `[MAGIC_NUMBER]` `InterviewView.test.tsx` — extract the literal `6` in `tick()` into a module-scope named constant `EFFECT_CHAIN_MICROTASK_HOPS` declared beside `STREAMING_ALTERNATIVE` and use it as the loop bound
- [x] 4.13 `[UNREACHABLE_CODE]` `InterviewView.module.css` — delete the `.answerField::placeholder` rule
- [x] 4.14 `[MAGIC_NUMBER]` `InterviewView.module.css` — replace `color: #a7a299;` in `.submit:disabled` with `color: var(--ink-soft);` and add `opacity: 0.55;` to the same rule
- [x] 4.15 `[DEAD_FLEXIBILITY]` `vite-config.test.ts` — delete the `proxyTarget` helper and its `ProxyConfig`-shaped indirection and assert the entry directly: `expect(proxy?.['/interview']).toBe('http://127.0.0.1:3000');`
- [x] 4.16 `[SELECTOR_ARGUMENT]` `interview-routes.test.ts` — replace `createFakeLlm` with three factories `chunkedLlm(chunks)`, `rejectingLlm(message)`, `endlessLlm()` (each its own `stream` body, drop the `script` union); the expert 4.5 `setImmediate` pacing line must land in `endlessLlm()`; update every call site
- [x] 4.17 `[INFORMATION_LEAKAGE]` `interview-routes.live.test.ts` — delete the local `DEFAULT_MODEL` constant, import `llmConfigFromEnv` from `../adapters/llm/openai-compatible-llm.ts`, and derive the printed name via `const model = llmConfigFromEnv(process.env).defaultModel;`
- [x] 4.18 `[IMPLEMENTATION_COUPLED_TEST]` `server.test.ts` — delete the `it('does not import the app it serves, ...')` block and the now-unused `import { readFile } from 'node:fs/promises';`
- [x] 4.19 `[NONDETERMINISTIC_TEST]` `core/src/index.test.ts` — add `afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });` inside the `describe` (import `afterEach`) and delete the two in-body `vi.restoreAllMocks()` calls
- [x] 4.20 `[VAGUE_TEST_NAME]` `core/src/index.test.ts` — rename `opens no socket and creates no session when imported` → `opens no socket when imported`

## Phase 5–6: Verification report
- [x] 5.1 Automated checks (build / test / lint / format / typecheck / coverage / live tier) to `target/speq-*.log` — all green
- [x] 5.2 Scenario coverage audit — all 54 scenarios covered by a passing test; 2 deleted tests map to no scenario
- [x] 5.3 Manual verification — 15 rows, all ✓; live E2E against qwen3:8b, feasibility 2107 ms to first token
- [x] 6.1 verification-report.md — PASS

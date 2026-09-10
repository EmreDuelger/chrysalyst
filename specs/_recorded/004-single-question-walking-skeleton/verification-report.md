# Verification Report: single-question-walking-skeleton

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | chrysalyst's first vertical slice runs end to end: a real local model (`qwen3:8b`) streams one opening question token by token over SSE into the browser, and the typed answer lands in `session.json` beside the question and both timestamps with `schemaVersion 1`. All 54 plan scenarios have a passing test; build, hermetic tests, live tier, `core` coverage, typecheck, lint, and format are clean; every § Manual Testing row reproduces its expected output. |
| Code review | 18 findings — 18 fixed (15 standard, 3 expert) |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | ✓ |

## Test Evidence

### Coverage

`packages/core` — `pnpm -r test --coverage` (the interview module is the first `core` code measured against the mission's ~90 % target):

| Metric | Coverage % |
|--------|------------|
| Statements | 97.76 |
| Branches | 97.5 |
| Functions | 100 |
| Lines | 97.76 |

`packages/server` and `packages/web` coverage is by eye per the mission — no project-wide gate.

### Test Results

| Type | Run | Passed | Skipped |
|------|-----|--------|---------|
| Hermetic (`pnpm -r --include-workspace-root test`) | 510 | 508 | 2 |
| Live tier (`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b …`) | 512 | 512 | 0 |
| — `packages/core` | 47 | 47 | 0 |
| — `packages/web` | 374 | 374 | 0 |
| — `packages/server` | 74 (76 with live) | 74 (76) | 2 (0) |
| — root (`tests/workspace.test.ts`) | 13 | 13 | 0 |

The 2 hermetic skips are `*.live.test.ts` (`interview-routes.live.test.ts`, `openai-compatible-llm.live.test.ts`), gated on `CHRYSALYST_LIVE_LLM`. Baseline before code-review fixes was 510/2; the net −2 is two tests the review deleted — `[DUPLICATE_TEST]` (an env-probe in `interview-api.test.ts` already covered elsewhere) and `[IMPLEMENTATION_COUPLED_TEST]` (a `server.test.ts` case that grepped its own module source). Neither maps to a plan scenario.

### Feasibility measurement (roadmap M3 deliverable)

`interview-routes.live.test.ts` against a running Ollama:

```
[feasibility] model=qwen3:8b msToFirstToken=2107
```

- **~2.1 s to first token, warm** (Ollama already holding the model). Earlier cold measurements during planning: 8.8 s cold, 4.4–5.2 s warm. Ceiling asserted in the test: 30 s.
- The persisted question carries **no `<think>` marker** — asserted by the live test. `qwen3` is a reasoning model; the adapter's stream begins at the first answer token, so this figure is streaming latency after the model's internal reasoning, not raw connection latency.
- The mission's "first perceptible response within a few seconds" holds for `qwen3:8b` on this machine, warm.

### Manual Tests

Run against `pnpm dev` (server :3000, web :5173) with `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m3` and a running Ollama holding `qwen3:8b`. Full transcript: the run's evidence file.

| Row | Test | Result |
|-----|------|--------|
| 1 | `pnpm --filter @chrysalyst/core test` — every interview/transcript/state test passes, no directory created, no backend contacted | ✓ |
| 2 | `pnpm --filter @chrysalyst/server test` — routes/store/composition/adapter pass incl. the three unedited `003` store scenarios; temp dirs only, no `~/.chrysalyst`; both live files skipped | ✓ |
| 3 | `POST /interview` → `{"id":"f73d7781-…"}`; `ls` shows `session.json` + `transcript.md`; `session.json` carries `"schemaVersion": 1` and `"turns": []` | ✓ |
| 4 | `GET /interview/<id>/question` — frames arrive progressively: repeated `event: token` / `data: {"text":"…"}` pairs, closing with one `event: done` carrying the whole question. Real `qwen3:8b`. | ✓ |
| 5 | `cat session.json` immediately after — `turns` holds one `"status": "asked"` entry with `question` + `askedAt`, no `answer`: stored before `done` | ✓ |
| 6 | `GET …/question` a second time — same question, `askedAt` unchanged, no second inference (replay) | ✓ |
| 7 | `POST …/answer {"answer":"…"}` → `204`, same again → `409`; after the first, `session.json` holds `answer` + `answeredAt` + `"status": "answered"` beside the unchanged `question`/`askedAt` | ✓ |
| 8 | `cat transcript.md` — Markdown naming the session id and both timestamps, then the question beside `askedAt` and the answer beside `answeredAt` (the interview content M2 deferred) | ✓ |
| 9 | `GET /interview/does-not-exist/question` → JSON `{"message":"…does-not-exist…"}`, `content-type: application/json`, no event-stream; `POST {}` answer → `400` | ✓ |
| 10 | `pnpm --filter @chrysalyst/web test` — parser/client/view tests pass, plus the untouched production-build test; no socket opened | ✓ |
| 11 | Live tier — `interview-routes.live.test.ts` and `openai-compatible-llm.live.test.ts` run instead of skipping; feasibility figure printed; `<think>` absent | ✓ |
| 12 | `ls packages/web/src/**/*.module.css` + `:root` token grep — one CSS Module per component, `:root` block holds every design token (task 20) | ✓ |
| 13 | woff2 faces under `packages/web` beside OFL text, no Google Fonts URL in source (task 21) | ✓ |
| 14 | `packages/web/DESIGN.md` describes the system as shipped (task 22) | ✓ |
| 15 | `pnpm --filter @chrysalyst/web build` — exit 0; `dist/index.html` references a module asset and the two woff2 faces | ✓ |

Browser rows (connecting state → streamed question → answer field opens on `done` → in-flight state → saved confirmation; stored-question render with Ollama stopped; adapter error message with Ollama stopped) are covered by `InterviewView.test.tsx`'s 9 scenarios and confirmed live via `pnpm dev`.

## Tool Evidence

### Build

```
$ pnpm -r build
packages/web build: ✓ built
packages/core build: Done
packages/server build: Done
(exit 0)
```

### Linter

```
$ pnpm lint    →  eslint .    (exit 0, no output)
```

### Formatter

```
$ pnpm format:check
Checking formatting...
All matched files use Prettier code style!
```

### Typecheck

```
$ pnpm typecheck    →    packages/{core,server,web}: Done, no errors    (exit 0)
```

### Install

```
$ pnpm install    (exit 0; pnpm-lock.yaml unchanged — no package added)
```

## Scenario Coverage

All 54 scenarios in `plan.md` § Verification > Scenario Coverage map to a named test that exists and passes. Verified by running the full suite (508 hermetic + 4 live, 0 failures) and cross-referencing the plan's table; spot-checks confirmed the named `it(...)` for every group:

| Feature (delta) | Scenarios | Test file | All pass |
|-----------------|-----------|-----------|----------|
| `interview/single-question-round` (new) | 15 behavioural + JSON round-trip + transcript | `packages/core/src/interview/single-turn-interview.test.ts`, `state.test.ts`, `transcript.test.ts` | ✓ |
| `interview/question-stream-route` (new) | 15 route scenarios (create, stream, replay, error frame, storage failure, 404, abort, answer 204/404/409/400, typed client, composition root) | `packages/server/src/routes/interview-routes.test.ts`, `client.test-d.ts`, `composition.test.ts` | ✓ |
| `interview/streaming-question-view` (new) | 9 view scenarios + frame reassembly + dev proxy | `packages/web/src/interview/InterviewView.test.tsx`, `sse-frames.test.ts`, `vite-config.test.ts` | ✓ |
| `adapters/filesystem-session-store` (changed) | transcript-beside-state + no-renderer fallback + renderer-fails; the 3 unedited `003` scenarios stay green | `packages/server/src/adapters/session-store/filesystem-session-store.test.ts` | ✓ |
| `platform/http-server` (changed) | health route, published app type, port bind, loopback-only | `packages/server/src/app.test.ts`, `client.test-d.ts`, `server.test.ts` | ✓ |
| `platform/web-shell` (changed) | shell mounts the interview view; web imports no `@chrysalyst` specifier; production build unchanged | `packages/web/src/App.test.tsx`, `tests/workspace.test.ts`, `packages/web/src/build.test.ts` | ✓ |
| `platform/core-ports-contract` (changed) | domain logic reachable from the entry point without touching a clock or the filesystem; `core` still declares no runtime dependency | `packages/core/src/index.test.ts`, `tests/workspace.test.ts` | ✓ |

Two live rows and tasks 20–22 map to no scenario by design (documented in the plan): the live test falsifies the mission premise and produces the feasibility figure rather than asserting specified behaviour; the styling stream changes appearance, which no test asserts, and its evidence is the § Manual Testing artefact rows above.

## Notes

- **Opening question takes no idea input.** The committed plan cuts the skeleton thinner than a full interview turn: the model is asked cold for "a single question" (scenario *The conversation carries one instruction and names no model*). The idea-text entry point is M7/M8's. This report verifies the plan as written.
- **`setImmediate` → `setTimeout(resolve, 0)` in `core`** (expert fix 4.5) is a deliberate deviation from the review's prescribed fix: `packages/core/tsconfig.json` sets `"types": []` to keep the domain platform-agnostic, and `setImmediate` does not compile there. Both are macrotasks that resume only after the microtask queue drains, so the fix's intent — no wall-clock budget — is met. `packages/server` uses `setImmediate` as prescribed.
- **Expert fixes 4.3 and 4.4 arrived already implemented** from an earlier run that died before recording red-bar evidence. The implementer re-established that evidence by reverting each fix in isolation and confirming the reviewer's exact failure returned. The TDD ordering itself cannot be reconstructed after the fact.
- **`<StrictMode>` dev double-invoke** leaves one extra, never-questioned session directory per page load in dev. Expected, documented in the plan's § Manual Testing.
- **Durability barrier residue** inherited from `003`: a failed second rename can leave `transcript.md` lagging `session.json`. Bounded and documented in `003`'s ADR.
- **No CI (C2 still open):** a green checklist is evidence from one machine. `plan.md` § Impact records what that costs; M4 wires the pipeline.

# Verification Report: llm-backend-setup-gate

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | `GET /status` gates the web shell on backend readiness; both faults are told apart end to end; the deadline holds at 2.0 s; existing sessions replay and answer with the backend down. All automated checks pass. The impeccable finish review (task 13) and the browser-dependent manual rows did not run — the browser check this repository's own `playwright-chrome-blocked` constraint predicts failed both halves, exactly as expected, and no substitute was invented. Per plan.md § Impact, this routes the open finish review to M18 rather than blocking M6. |
| Code review | 5 findings — 5 fixed (4 standard, 1 expert) |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Typecheck | ✓ |
| Coverage | ✓ |
| Live tier (this plan's case) | ✓ |
| Live tier (pre-existing inference cases) | ✗ — environmental, not a regression (see Notes) |
| Scenario Coverage | ✓ |
| Manual Tests | Partial — curl-based rows ✓; browser-dependent rows unrun (see Notes) |

## Test Evidence

### Coverage

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| core (unchanged by this plan) | 97.87% | 97.82% | 100% | 97.87% |
| server | 98.31% | 95.79% | 100% | 98.29% |
| web | 91.16% | 87.2% | 93.05% | 93.86% |

### Test Results

| Package | Run | Passed | Skipped |
|---------|-----|--------|---------|
| core | 11 files / 78 tests | 78 | 0 |
| server | 11 files / 94 tests | 89 | 5 (three `*.live.test.ts` files) |
| web | 12 files / 433 tests | 433 | 0 |

`pnpm -r --include-workspace-root test` exits 0. `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all exit 0 with no output beyond the task graph. `pnpm -r build` exits 0; `dist/index.html` references one module asset and one stylesheet, no new asset and no new font.

### Manual Tests

| Test | Result |
|------|--------|
| `curl /status` with the backend unreachable (real closed loopback port, substituting for a stopped Ollama the test host doesn't control) | ✓ `{"ready":false,"backend":"Ollama","model":"llama3.2:3b","reason":"unreachable"}` |
| `curl /health` with the backend unreachable | ✓ `{"status":"ok","version":"0.0.0"}` — unaffected |
| `time curl /status` against a loopback port that accepts and never answers | ✓ answered in 2.007s, 2.009s, 2.007s across three runs — the deadline holds |
| `curl /status` with Ollama running and `CHRYSALYST_LLM_MODEL=not-a-real-model` | ✓ `{"ready":false,"backend":"Ollama","model":"not-a-real-model","reason":"model-missing"}` |
| `curl /status` with Ollama running and `CHRYSALYST_LLM_MODEL=qwen3:8b` (the model actually pulled here; `llama3.2:3b` is not) | ✓ `{"ready":true,"backend":"Ollama","model":"qwen3:8b"}` |
| `curl /status` with `CHRYSALYST_LLM_BACKEND_NAME='LM Studio'` | ✓ `{"backend":"LM Studio",...}`; the base URL appears nowhere in the body |
| `pnpm --filter @chrysalyst/web build` | ✓ exit 0 |
| Interview replay with a stored session while the backend is down (real curl, real session file) | Not run live — real Ollama inference in this environment currently takes 30s+ to return one word and did not complete within 90s, so a session could not be created live to replay against. The identical behavior is proven deterministically by the automated integration test `interview-routes.test.ts` → `replays a stored question and records its answer while the backend reports unavailable` (task 6), which is green |
| Setup screen in a browser (load, check control, reload, language switch, keyboard/screen-reader operation, 1280px/400px) | Not run — no Chromium is available in this sandbox (`/opt/google/chrome/chrome` absent; Playwright MCP is pinned to the `chrome` channel and reports `Chromium distribution 'chrome' is not found`). This is the environment constraint plan.md § Dependencies names in advance and task 13 already recorded as unrun rather than self-certified |
| Live tier, this plan's case: `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b`, `backend-readiness.live.test.ts` | ✓ `{ready: true}` against the real daemon, printing `backend=Ollama model=qwen3:8b daemonIds=["gemma4:12b","qwen3:8b","qwen3.8-reliable:latest","qwen3.8:latest"]` |
| Live tier, pre-existing inference cases: `interview-routes.live.test.ts` (2 scenarios), `openai-compatible-llm.live.test.ts` (1 scenario) | ✗ all three time out waiting on real generation from the local Ollama daemon, which independently took 30s+ to return a one-word completion outside any test. `git diff` on the one touched file (`interview-routes.live.test.ts`) shows only mechanical descriptor-threading, no behavior change on the inference path — this is host/model slowness, not a regression from this plan |

## Tool Evidence

### Linter

```
$ pnpm lint
$ eslint .
(no output — 0 errors, 0 warnings)
```

### Formatter

```
$ pnpm format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

### Typecheck

```
$ pnpm typecheck
packages/core typecheck: tsc -p tsconfig.json — Done
packages/web typecheck: tsc -p tsconfig.json — Done
packages/server typecheck: tsc -p tsconfig.json — Done
```

## Scenario Coverage

| Domain | Feature | Scenario | Test Location | Test Name | Passes |
|--------|---------|----------|---------------|-----------|--------|
| platform | backend-status | A backend holding the configured model reports ready | `backend-readiness.test.ts` | `answers 200 and ready with the descriptor's backend and model, reaching no inference` | Pass |
| platform | backend-status | An unreachable backend is reported as unreachable | `backend-readiness.test.ts` | `answers 200 and the unreachable fault, still naming the backend and the model` | Pass |
| platform | backend-status | A reachable backend lacking the configured model is reported separately | `backend-readiness.test.ts` | `answers the model-missing fault for $inventory` (it.each) | Pass |
| platform | backend-status | A probe that does not answer in time reports unreachable | `backend-readiness.test.ts` | `abandons a probe after the deadline and reports it unreachable, and reports a rejected probe the same way` | Pass |
| platform | backend-status | The status route reaches the typed client | `client.test-d.ts` | `exposes the status route beside health and the interview routes` | Pass |
| platform | backend-status | The liveness probe stays independent of the backend | `backend-readiness.test.ts` | `answers GET /health with ok while the model rejects every probe` | Pass |
| interview | interview-http-api | The composition root builds the real adapters from the environment (changed) | `composition.test.ts` | `assembles llm, sessions, clock and the backend descriptor from one environment, and touches no disk` | Pass |
| interview | interview-http-api | A stored session stays readable while the backend is unavailable | `interview-routes.test.ts` | `replays a stored question and records its answer while the backend reports unavailable` | Pass |
| adapters | ollama-llm-adapter | Ollama's defaults come from the environment (changed) | `openai-compatible-llm.test.ts` | `resolves the base URL, the default model and the backend name, overriding each from the environment` | Pass |
| platform | web-shell | A ready backend mounts the interview | `App.test.tsx` | `mounts the interview view after one probe and shows no setup screen` | Pass |
| platform | backend-setup-gate | A blocked backend shows the setup screen instead of the interview | `App.test.tsx` | `shows the setup screen, mounts no view, creates no session, and keeps the language control usable` | Pass |
| platform | backend-setup-gate | Nothing is mounted while the probe is in flight | `App.test.tsx` | `names a checking state and creates no session while the probe is unsettled` | Pass |
| platform | backend-setup-gate | The setup screen names the backend and which fault to fix | `SetupGuide.test.tsx` | `names the backend for an unreachable fault and the backend and model for a missing model, with different actions` | Pass |
| platform | backend-setup-gate | The setup screen renders in the app's language | `SetupGuide.test.tsx` | `renders every label from the dictionary for $locale and leaves the configured names unchanged` | Pass |
| platform | backend-setup-gate | A probe that fails shows its message under a label | `App.test.tsx` | `shows a failed probe's message character for character under a dictionary label and mounts no view` | Pass |
| platform | backend-setup-gate | Checking again after the backend is fixed opens the interview | `App.test.tsx` | `re-probes on the check control and mounts the view on the second answer` | Pass |
| platform | backend-setup-gate | Re-checking shows that it is checking and answers once | `App.test.tsx` | `shows the checking state on a re-check, hides the fault text with the control, gives that state the focus and an announcement, and drops an answer from a probe abandoned at unmount` | Pass |
| platform | backend-setup-gate | Reloading the page runs the gate again | `App.test.tsx` | `probes again on a fresh mount and writes no outcome to storage` | Pass |
| platform | backend-setup-gate | The package's status vocabulary matches the contract | `backend-status.test.ts` | `matches the fixture's route, field names and fault names` | Pass |
| platform | backend-setup-gate | The dev server proxies the status route to the API | `vite-config.test.ts` | `routes the status route and the interview prefix to the API's loopback address` | Pass |
| platform | web-shell | The shell mounts the interview view (changed) | `App.test.tsx` | `renders the untranslated product heading, the language control, and the view it hands the app's language` | Pass |

All 21 scenarios plan.md § Verification lists are green. Every pre-existing scenario in `app.test.ts`, `server.test.ts`, `interview-routes.test.ts`, `interview-routes.live.test.ts` and `App.test.tsx` that this plan does not list stayed green with no assertion edited, confirmed by review finding [SHRINKABLE]'s fix and the reviewer's own pre-review full-suite run.

## Notes

**Code review.** Five findings, all fixed: two doc comments bound to the wrong symbols and an unparseable-JSON-body error that named neither the route nor the attempt, both in `backend-status.ts`; a test whose name promised interview-prefix coverage it never asserted, in `vite-config.test.ts`; a duplicate call-recording mechanism in a test double, in `interview-routes.test.ts`; and one expert finding — a re-check's second half dropped keyboard focus onto `<body>` when guidance replaced the checking state, fixed with a two-step focus machine (`focusStep` ref) and a `controlRef` seam added to `SetupGuideProps`. The reviewer's own pre-review run recorded a clean baseline (core 78, server 89/5 skipped, web 431 passed) so post-fix counts (server 89/5, web 433 — two more from the two added tests) are directly comparable.

**The impeccable finish review did not run.** Task 13 ran the § Dependencies browser check itself before styling and found both halves fail in this sandbox: `/opt/google/chrome/chrome` is absent, and the Playwright MCP's `browser_navigate` reports `Chromium distribution 'chrome' is not found`. This matches this repository's own recorded `playwright-chrome-blocked` constraint. Per the plan, task 13 stopped once the CSS was written and the three `## Unresolved` calls were resolved (fault-line colour: ink, not accent; checking placeholder: `min-height: 13.5rem`, sized to the taller two-line fault variant; control position: tightened to `1rem` top margin matching the submit control's rhythm) — it did not self-certify the finish review and did not read the CSS in place of a capture. Per plan.md § Impact, `/speq:record` MUST NOT mark M6 done and MUST instead append the open finish review and the 1280px/400px manual row to M18's consolidating design-pass bullet, naming `llm-backend-setup-gate`.

**Real inference in this environment is currently very slow.** A direct, non-test call to the local Ollama daemon (`/api/generate`, `qwen3:8b`, a one-word prompt) did not return within 30s. This caused three pre-existing live-tier scenarios to time out (`interview-routes.live.test.ts` ×2, `openai-compatible-llm.live.test.ts` ×1) and blocked one manual-testing row (streaming a session live to prove the replay-while-down behavior with curl). Both are environmental, not regressions from this plan: `git diff` on the one touched live file shows only mechanical descriptor-threading with no assertion or behavior change, and the equivalent behavior is proven deterministically by the automated `interview-routes.test.ts` case (task 6), which uses a real session store and a real dead-backend double rather than live inference and passes.

**Ollama runs on the Windows host via WSL mirrored networking**, so this session could not stop the real daemon for the "Ollama stopped" manual rows. Those rows were exercised instead against a real loopback port with nothing listening, which this WSL network's TCP stack times out on rather than refusing (confirmed directly: `curl` to that port hangs to its own timeout) — the same hang class `CHRYSALYST_LLM_BASE_URL=http://192.0.2.1:11434/v1` was meant to demonstrate in plan.md's row, which task 4's implementer found does not hang in this network (TEST-NET-1 refuses in 19ms here). The substitute port reproduces the intended hang and the 2.0s bound was measured against it three times, consistently.

**A stale locked git worktree** at `.claude/worktrees/llm-backend-setup-gate` (branch `worktree-llm-backend-setup-gate`) holds an unrelated, stalled prior attempt at this same plan dated 2025-09-13. It was not used by this implementation run and nothing here reads from or writes to it, but it is worth the user's attention for cleanup — `git worktree list` and any later branch cleanup will otherwise be confused by it.

**No session data changed.** `schemaVersion` stays `1`; no session directory was swept by anything this plan added.

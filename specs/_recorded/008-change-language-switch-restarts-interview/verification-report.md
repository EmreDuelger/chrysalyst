# Verification Report: change-language-switch-restarts-interview

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | A language switch during an open round now restarts the interview in the chosen language, asking first only when a typed draft is at risk. All eight scenarios in plan.md's Scenario Coverage table pass, every pre-existing scenario stayed green, and all automated checks pass. The impeccable finish review (task 4) and most browser-dependent manual rows did not run — this repository's own `playwright-chrome-blocked` constraint predicts both halves of the browser check fail, and they did, exactly as expected. No substitute was invented. Per plan.md § Impact, this routes the open finish review to M18 rather than blocking M5's already-recorded status. |
| Code review | 4 findings — 4 fixed (3 standard, 1 expert) |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Live tier | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Typecheck | ✓ |
| Coverage | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | Partial — curl-equivalent row ✓; browser-dependent rows unrun (see Notes) |

## Test Evidence

### Coverage

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| core (unchanged by this plan) | 97.87% | 97.82% | 100% | 97.87% |
| server (unchanged by this plan) | 98.17% | 95.57% | 100% | 98.15% |
| web | 90.36% | 85.51% | 90.38% | 92.92% |

`packages/core` stays at or above the 90% bar the checklist requires, unchanged because this plan touches no file under it.

### Test Results

| Package | Run | Passed | Skipped |
|---------|-----|--------|---------|
| core | 11 files / 78 tests | 78 | 0 |
| server | 9 files / 84 tests | 80 | 4 (two `*.live.test.ts` files) |
| web | 10 files / 414 tests | 414 | 0 |

`pnpm -r --include-workspace-root test` exits 0. `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all exit 0. `pnpm -r build` exits 0.

**Live tier** (`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test`): 0 failures, all 9 server test files run (the 2 previously-skipped live files execute against the real Ollama daemon), web unaffected at 414 passed. This plan adds no live case, per plan.md § Verification's own statement that a restart creates an ordinary session in an ordinary supported language.

### Manual Tests

| Test | Result |
|------|--------|
| `pnpm --filter @chrysalyst/web test` | ✓ 414 passed, 0 failed, no socket opened |
| `CHRYSALYST_SESSION_DIR`, three independent session creations, then inspect the folders | ✓ (curl-equivalent — see Notes) three folders created under a scratch `CHRYSALYST_SESSION_DIR`, each `{"schemaVersion":1,"state":{"locale":"en","turns":[]}}` — a question and no answer — and nothing errored |
| Load the page in English, switch to Deutsch with no draft; type an answer then switch; `Keep my answer`; `Discard and restart`; switch back to the running language; record then switch; record then switch again; keyboard/screen-reader operation; 1280px/400px capture | Not run — no Chromium is available in this sandbox (`/opt/google/chrome/chrome` absent; Playwright MCP is pinned to the `chrome` channel and reports `Chromium distribution 'chrome' is not found`). This is the environment constraint plan.md § Dependencies names in advance and task 4 already recorded as unrun rather than self-certified. Every one of these rows is asserted instead by an integration test in `InterviewView.test.tsx` driving the real component through its injected API double — see Scenario Coverage below |

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

(One violation was found and fixed mid-verification: `packages/web/DESIGN.md`'s new table row had misaligned column padding, left over from the review-fix pass. `prettier --write` corrected it; `git diff` confirmed only column-width whitespace changed, no content.)

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
| interview | interview-view | Switching the chrome's language asks before discarding a typed answer (the ask) | `InterviewView.test.tsx` | `asks before discarding a typed answer, relabels the chrome, starts nothing, and leaves the question and the draft unchanged` | Pass |
| interview | interview-view | Switching the chrome's language asks before discarding a typed answer (the sent answer) | `InterviewView.test.tsx` | `withdraws the request for good once the answer is sent, for $outcome` (it.each: `recorded`, `refused`) | Pass |
| interview | interview-view | Switching the chrome's language asks before discarding a typed answer (the emptied draft) | `InterviewView.test.tsx` | `withdraws the request when the draft is emptied, restarting only when the chrome's language differs from the round's, for $chrome` (it.each) | Pass |
| interview | interview-view | Confirming the discard restarts the interview in the chosen language | `InterviewView.test.tsx` | `creates a second session in the chosen language, abandons the first stream, clears the round, leaves no request on screen, and takes focus` | Pass |
| interview | interview-view | Declining the discard leaves the interview in the language it was created in | `InterviewView.test.tsx` | `keeps the session, the question and the typed answer, holds the chrome in the chosen language, and returns focus to the answer field` | Pass |
| interview | interview-view | Switching with no draft on screen restarts without asking | `InterviewView.test.tsx` | `restarts without asking from $phase and takes the second session's language from its own response` (it.each: `connecting`, `streaming`, `complete`, `failed`) | Pass |
| interview | interview-view | Switching back to the running round's language withdraws the request | `InterviewView.test.tsx` | `withdraws the request without creating a session, discarding the answer, or moving focus` | Pass |
| interview | interview-view | Switching after the answer is sent relabels only | `InterviewView.test.tsx` | `relabels only once the answer is sent, in $phase` (it.each: `submitting`, `recorded`) | Pass |

All eight scenarios plan.md § Verification lists are green. Every other pre-existing scenario recorded by `004`, `007` and `008` stayed green with no assertion edited: `App.test.tsx`, `interview-api.test.ts`, `sse-frames.test.ts`, and both server suites passed unchanged, confirming the restart changed no behavior outside `InterviewView`.

## Notes

**Code review.** Four findings, all fixed: one expert finding — a test-coverage gap for the `!pending` guard in `changeAnswer` (the rule that a draft cleared after `Keep my answer` restarts nothing), closed with a new sibling test and verified honest by deleting the guard, watching it fail, and restoring it — and three standard findings, all in documentation and dead test weight: `DESIGN.md`'s "no vermilion anywhere" claim scoped to the block's resting state with a clause on the focus ring, the Six View States row relabelled as a `complete` variant rather than a seventh state, `InterviewViewProps`' doc comment extended with the change-not-difference invariant, and one now-redundant unit test in `strings.test.ts` deleted in favor of the two derived-list tests that already cover the new members. Net test count after review fixes: 415 add, 1 remove — 414 in `packages/web`, matching the pre-review baseline exactly.

**One deliberate deviation from the plan's literal sketch, reviewed and accepted.** Plan.md § Key interfaces puts the seven-value round reset at the top of the effect body. The implementation instead places it in `run()`'s synchronous prologue — still strictly before the first `await`, still strictly after the previous run's cleanup `controller.abort()` — because `eslint-plugin-react-hooks@7`'s `react-hooks/set-state-in-effect` rule (error severity) rejects the literal shape, and moving the reset into the render phase or into `beginRound` would open a real race: a token arriving in the gap between commit and passive-effect-flush could land in an already-reset round and reproduce the append defect § Decision names. The code reviewer confirmed the reset still runs synchronously before any async work, in the same order relative to the abort, so the behavior is unchanged from the plan's intent.

**The impeccable finish review did not run.** Task 4 ran the § Dependencies browser check itself and found both halves fail in this sandbox: `/opt/google/chrome/chrome` is absent, and the Playwright MCP's `browser_navigate` reports `Chromium distribution 'chrome' is not found`, requiring `npx playwright install chrome`, which needs `sudo` this agent does not have. This matches the repository's own recorded `playwright-chrome-blocked` constraint and the identical outcome `008`'s verification report recorded for the same check. Per the plan, task 4 stopped: it did not self-certify the finish review and did not read the CSS in place of a capture. Per plan.md's own text, `/speq:record` MUST add this plan's open finish review and unrun 1280px/400px manual row to M18's »Konsolidierender impeccable-Designdurchgang« bullet in `specs/roadmap.md`, beside the existing `llm-backend-setup-gate` entry, naming `change-language-switch-restarts-interview`. `/speq:record` MUST leave M5's `✅ erledigt` status as it stands and MUST append this plan to M5's »Pläne« line.

**The session-directory manual row was run at the API level, not through the browser.** Client and server both being unavailable together (no browser to drive the restart's own `POST /interview` calls), this verification issued three independent `POST /interview` requests directly against a locally started server with a scratch `CHRYSALYST_SESSION_DIR`, reproducing exactly the wire call plan.md § Impact states the restart makes ("`POST /interview` is called a second time with a different `locale`; no route, body, status or field is added"). Three folders resulted, each holding a question and no answer under `schemaVersion: 1`, and nothing errored — consistent with the plan's stated Impact and with `interview-http-api`'s unchanged »A client that abandons the question stream stores nothing« guarantee. This is not a substitute for the finish review's visual capture; it verifies server-side behavior this plan explicitly does not change.

**No wire change and no data change**, confirmed: `schemaVersion` stayed `1` in every session file produced above, and `pnpm-lock.yaml` is untouched (`git status --short pnpm-lock.yaml` shows nothing).

**Plan directory reconciliation.** The plan's working directory (`plan.md`, `decision-log.md`, `interview/`, `review/`) existed only as untracked files in the main checkout and was not present when this worktree was created (untracked files are not carried by `git worktree add`). It was copied into the worktree mid-implementation, after the expert task-2 agent flagged the gap. Worth reconciling permanently before `/speq:record`, since these files remain untracked in both locations.

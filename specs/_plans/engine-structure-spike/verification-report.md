# Verification Report: engine-structure-spike

Run at the repository root and inside `spike/engine-structure/`, on branch `spike/engine-structure` at commit `d6e8bdf`. Every command below was executed for real; output is captured verbatim or summarized with the exact pass/fail counts printed.

## Isolation

| Check | Command | Result |
|---|---|---|
| Lockfile / workspace glob untouched | `git diff --stat main -- pnpm-lock.yaml pnpm-workspace.yaml` | No output — byte-identical to `main` |
| No `packages/` or `tests/` path touched | `git diff --stat main...spike/engine-structure` | Only `.prettierignore`, `eslint.config.js`, `specs/_plans/engine-structure-spike/**`, `spike/**` (8 files outside `spike/`, 910 insertions / 1 deletion) |
| Top-level touched paths | `git diff --name-only main...spike/engine-structure \| sed 's#/.*##' \| sort -u` | `.prettierignore`, `eslint.config.js`, `specs`, `spike` — nothing else |

## Root Checklist

All commands run at the repository root, on `spike/engine-structure`.

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install` | Exit 0 — `Scope: all 4 workspace projects`, `Already up to date`. `pnpm-lock.yaml` unchanged (confirmed above) |
| Build | `pnpm -r build` | Exit 0 — `packages/core`, `packages/server`, `packages/web` all `Done` |
| Test | `pnpm -r --include-workspace-root test` | 0 failures. Root: 1 file / 13 tests passed. `packages/core`: 7 files / 47 tests passed. `packages/server`: 7 files / 74 tests passed, 2 skipped (the `*.live.test.ts` convention, unaffected by the spike). `packages/web`: 6 files / 374 tests passed. No `spike/**/*.spike.test.ts` file collected — root `vitest.config.ts` includes only `tests/**/*.test.ts` per package |
| Typecheck | `pnpm typecheck` | Exit 0 — `packages/core`, `packages/server`, `packages/web` all `Done` |
| Lint | `pnpm lint` | Exit 0, 0 errors, 0 warnings, with `'spike/**'` in the root `ignores` |
| Format | `pnpm format:check` | `All matched files use Prettier code style!`, with `spike/` in `.prettierignore` |
| Plan | `speq plan validate engine-structure-spike` | `Plan 'engine-structure-spike' validation passed.` / `Note: No delta specs found in plan.` — the expected result for a spike |

## Spike's own toolchain (not gated, informational)

| Subject | Command | Result |
|---|---|---|
| Arm A, hermetic | `pnpm vitest run arm-a` inside `spike/engine-structure/` | 1 test file, 2 tests passed, 214ms. Runs against the shared fake `LlmPort`, no daemon, no network |
| Arm B, hermetic | `pnpm vitest run arm-b` inside `spike/engine-structure/` | 3 test files, 16 tests passed, 596ms. Runs the whole round including `interrupt()`/resume through the task-7 `LlmPortChatModel` binding, no daemon, no network |

## Live runs (captured during tasks 4 and 8, re-confirmed by the persisted artifacts)

| Subject | Evidence |
|---|---|
| Arm A, live | `spike/engine-structure/measurements/arm-a-session.json` — a real `qwen3:8b` question and answer, persisted across two separate `node` invocations of `live-ask.ts` / `live-answer.ts`, `askedAt`/`answeredAt` timestamps 16s apart, `schemaVersion: 1` |
| Arm B, live | `spike/engine-structure/measurements/arm-b-session.json` — `interrupt()` suspended after the question in one process, `live-answer.ts` resumed with `Command({ resume })` on the same `thread_id` in a separate process; `askedAt` `2026-09-11T21:19:36.226Z` (process 1) beside `answeredAt` `2026-09-11T21:19:41.201Z` (process 2) inside the recovered checkpoint, proving the question came off disk rather than a re-ask |

## Deliverable

| Subject | Command | Result |
|---|---|---|
| Comparison | `cat spike/engine-structure/measurements/comparison.md` | All four axes filled with measured values or an explicit "not obtained"/"not decision-relevant" reason; axis 3 alone marked extrapolation, as required |
| Decision note | `cat specs/_plans/engine-structure-spike/decision-note.md` | One `## ADR:` section, `**Status:** Accepted`, recommends the hand-rolled structure, cites § The decision rule by name against each condition's measured value, states the rejected option's strongest case |

## Outcome

Every checklist and manual-testing row in `plan.md` § Verification that applies before task 11 passes. No `packages/` or `tests/` path is touched; the repository lockfile and workspace file are byte-identical to `main`. The spike's own hermetic and live harnesses ran and are captured. Task 10's deliverable exists and validates. Ready for task 11 (tag `spike/engine-structure-m3`, copy `decision-note.md` and this report onto a branch cut from `main`).

# Tasks: ci-test-tiers

## Phase 2: Implementation (Group A)
- [x] 1 Red — the pipeline guard suite (tests/ci-pipeline.test.ts, all 8 ci-pipeline scenarios) [expert]
- [x] 4 Red, then green — format:check in the root script set (tests/workspace.test.ts)

## Phase 2: Implementation (Group B)
- [x] 2 Green — the CI workflow (.github/workflows/ci.yml)
- [x] 3 Green — core's coverage gate (packages/core/vitest.config.ts)

## Phase 2: Implementation (Group C)
- [x] 5 Prove the gate is not blind (add untested module, measure, lower threshold, restore)

## Phase 3: Verification
- [x] 5a Run automated checklist commands (build, test, lint, format:check, typecheck)
- [x] 5b Scenario coverage audit
- [x] 5c Manual verification (non-hosted rows)

## Phase 4: Review Fixes
- [x] 4.1 Rework `declares contents: read and grants no write permission` in tests/ci-pipeline.test.ts so the inline-grant check covers every `permissions:` block, not only the workflow-scope one, and derives `grants` from that same set [expert]
- [x] 4.2 Fix continue-on-error regex to match dash-prefixed step form (tests/ci-pipeline.test.ts)
- [x] 4.3 Build LIVE_FLAG_ASSIGNMENT regex from LIVE_TIER_FLAG constant instead of restating the string (tests/ci-pipeline.test.ts)
- [x] 4.4 Use string | undefined instead of '' for absent version pins (tests/ci-pipeline.test.ts)
- [x] 4.5 Check format:check script both reports violations and doesn't rewrite files (tests/workspace.test.ts)

## Not dispatched — human + git-agent only
- [x] 6 Prove the pipeline fails closed on a real hosted run
  - [x] 6.1 Push `feat/ci-test-tiers`, open PR #6 (base: main) — green: https://github.com/EmreDuelger/chrysalyst/actions/runs/34701305766
  - [x] 6.2 Open scratch PR #7 (`ci-test-tiers-failclosed` → `feat/ci-test-tiers`) carrying breakage 1 (GitHub refused an unchanged-branch PR, so the `opened` event doubles as breakage 1's isolated run — see verification-report.md § Outstanding for the adaptation)
  - [x] 6.3 Breakage 1 (formatting) — fails at `pnpm format:check`: https://github.com/EmreDuelger/chrysalyst/actions/runs/34701438211
  - [x] 6.4 Breakage 2 (coverage) — fails at test step, threshold error naming lines: https://github.com/EmreDuelger/chrysalyst/actions/runs/34701514536
  - [x] 6.5 Breakage 3 (live tier) — fails inside guard suite's `CHRYSALYST_LIVE_LLM` assertion: https://github.com/EmreDuelger/chrysalyst/actions/runs/34701596270
  - [x] 6.6 PR #7 closed unmerged, `ci-test-tiers-failclosed` deleted (human-directed, executed via `gh pr close --delete-branch`)
  - [x] 6.7 `git-agent` checkout back to `feat/ci-test-tiers` — done, PR #6 still ready
  - [x] 6.8 Recorded the three run URLs in verification-report.md § Outstanding, removed the "blocked" framing

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
- [ ] 6 Prove the pipeline fails closed on a real hosted run (human approval required; out of orchestrator scope until Group C is verified green)

# Verification Report: ci-test-tiers

## Verdict

| Result | Details |
|--------|---------|
| **PASS** (implementation scope) | Tasks 1–5 are done, reviewed, and verified locally. Task 6's three hosted-run URLs are the outstanding gate — see § Outstanding: Task 6. |
| Code review | 5 findings — 5 fixed |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | ✓ (non-hosted rows; hosted rows belong to task 6) |

## Test Evidence

### Coverage

`packages/core` enforces the gate this plan adds; `packages/server` and `packages/web` carry no enforced floor (plan § Non-Goals).

| Package | Statements | Branches | Functions | Lines | Gate |
|---------|-----------|----------|-----------|-------|------|
| core | 97.76% | 97.5% | 100% | 97.76% | Enforced, floor 90 |
| server | 98.11% | 95.14% | 100% | 98.09% | None |
| web | — | — | — | — | None |

### Test Results

| Type | Run | Passed | Ignored |
|------|-----|--------|---------|
| Root suite (`tests/`) | `pnpm -r --include-workspace-root test` | 21/21 | 0 |
| core | same run | 47/47 | 0 |
| server (live tier off) | same run | 74/74 | 2 skipped |
| web | same run | 374/374 | 0 |
| server (live tier on, `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b`) | `pnpm -r --include-workspace-root test` | 76/76 | 0 |

The live-tier run passing 76/76 where the standard run passes 74/74 with 2 skipped proves the two live suites ran under the flag and stay disabled without it — the guarantee `ci-pipeline`'s "runner leaves the live tier disabled" scenario depends on.

### Manual Tests

Rows from plan.md § Manual Testing that run without a hosted pull request. Hosted rows are task 6's scope (§ Outstanding below).

| Test | Result |
|------|--------|
| `pnpm --filter @chrysalyst/core test` — coverage table, no flag | ✓ 97.76/97.5/100/97.76, 47 tests, exit 0 |
| Add untested `probe.ts` under `packages/core/src`, re-run | ✓ 95.62/92.85/96.29/95.62, exit 0 (still above 90), `git status` clean after removal |
| `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99` | ✓ `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)`, exit 1 |
| `pnpm -r --include-workspace-root test` | ✓ 0 failures across 4 suites; both live suites report skipped |
| `pnpm format:check` | ✓ no changes, `.github/workflows/ci.yml` included |
| SHA-pinning sweep across both workflows | ✓ `ci.yml`: 2/2 `uses:` lines matched; `openwiki-update.yml`: 3/3 matched |
| `pnpm test` at repository root | ✓ passes, including the extended root-script test and the two unedited live-tier tests |

## Tool Evidence

### Linter

```
$ eslint .
```
Exit 0, no findings, across all four changed files (`tests/ci-pipeline.test.ts`, `tests/workspace.test.ts`, `.github/workflows/ci.yml` is not linted by eslint, `packages/core/vitest.config.ts`).

### Formatter

```
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

## Scenario Coverage

| Domain | Feature | Scenario | Test Location | Test Name | Passes |
|--------|---------|----------|---------------|-----------|--------|
| platform | ci-pipeline | A pull request starts the pipeline | `tests/ci-pipeline.test.ts` | `runs on pull_request and not on push` | Pass |
| platform | ci-pipeline | The pipeline runs the mission's checks in order | `tests/ci-pipeline.test.ts` | `installs before it checks, then lints, format-checks, typechecks and tests the workspace root in order` | Pass |
| platform | ci-pipeline | Toolchain versions come from the repository's pins | `tests/ci-pipeline.test.ts` | `reads .nvmrc and restates neither the node nor the pnpm version, and installs against a frozen lockfile` | Pass |
| platform | ci-pipeline | Every workflow action is pinned to a commit | `tests/ci-pipeline.test.ts` | `every uses in .github/workflows names a 40-hex sha with a version comment` | Pass |
| platform | ci-pipeline | The runner leaves the live tier disabled | `tests/ci-pipeline.test.ts` | `sets CHRYSALYST_LIVE_LLM nowhere in the workflow` | Pass |
| platform | ci-pipeline | A broken check fails the run | `tests/ci-pipeline.test.ts` | `declares no continue-on-error on any ci.yml step` | Pass |
| platform | ci-pipeline | The pipeline holds no write access | `tests/ci-pipeline.test.ts` | `declares contents: read and grants no write permission` | Pass |
| platform | ci-pipeline | Core coverage below 90% fails the run | `tests/ci-pipeline.test.ts` | `core collects coverage over all of src without a flag and floors all four metrics at ninety` | Pass |
| platform | monorepo-workspace | Root scripts expose the mission command set (changed) | `tests/workspace.test.ts` | `root exposes the mission scripts without a build prerequisite` | Pass |

Two dependency guarantees this feature relies on rather than duplicates, confirmed unedited and green:

| Test Location | Test Name | Passes |
|---------------|-----------|--------|
| `tests/workspace.test.ts` | `every live test file gates on CHRYSALYST_LIVE_LLM and awaits nothing at module scope` | Pass, unedited |
| `tests/workspace.test.ts` | `every live guard expression skips for unset and empty and runs for any value` | Pass, unedited |

Every scenario in plan.md § Verification > Scenario Coverage has a passing test. None is incomplete.

## Code Review

Round 1 found 5 findings against `tests/ci-pipeline.test.ts` and `tests/workspace.test.ts` — 1 expert (a job-level inline `permissions:` grant escaping the write check), 4 standard (a `continue-on-error` regex missing the dash-prefixed step form, a hardcoded second copy of the live-tier flag name inside its own regex, empty-string sentinels for absent version pins, and a `format:check` guard that missed the short `-w` rewrite flag and never checked for a report-only flag at all). All 5 were reproduced against the real tree before the fix and reproduced as fixed afterward — each fix's reproduction is logged in `specs/_plans/ci-test-tiers/review-findings.md`. No second review round ran; this report's checks verify the fixes.

## Notes

- **Working tree.** `git status` after this run shows exactly the four files this plan's tasks change (`packages/core/vitest.config.ts`, `tests/workspace.test.ts` modified; `.github/workflows/ci.yml`, `tests/ci-pipeline.test.ts` new) plus this plan's own `specs/_plans/ci-test-tiers/` artifacts. No reproduction artifact from task 5 or from any review-fix reproduction survived — each was restored and confirmed clean by its own agent.
- **Live tier confirmed both ways.** The standard run skips both live suites; the flagged run (`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b`) runs and passes them, proving this plan disables the tier in CI specifically, not everywhere.
- **The coverage anchor holds.** `config.test.coverage` sits under `test:`, not at the top level — the exact misplacement the plan review's round-1 blocker found and that would have silently disabled the gate.

## Outstanding: Task 6

Task 6 ("Prove the pipeline fails closed on a real hosted run") is explicitly out of orchestrator scope — plan.md § Parallelization: "Group D is not dispatched to an implementer. Task 6 needs a human approval and `git-agent` writes." It requires:

1. Human approval to push `feat/ci-test-tiers` and open the feature pull request.
2. A `ci-test-tiers-failclosed` scratch branch carrying three sequential breakages (formatting, coverage floor, live-tier flag), each reverting its predecessor, each producing one hosted run URL.
3. Human closure of the scratch pull request and branch deletion in the GitHub UI.

**`/speq:record ci-test-tiers` MUST NOT run until all three run URLs from task 6 are recorded in this report** — plan.md § Impact and § Implementation Tasks both state this gate explicitly, because those three runs are C2's and M4's actual exit criteria, not this report's local test evidence.

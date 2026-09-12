# Plan Review Findings: ci-test-tiers (round 1)

## Summary

- Axes checked: 6/6
- Total findings: 15 (Blockers: 4, Advisory: 11)
- Intent Fidelity blockers: 0

## Premortem

Six months out, three failure stories explain a dead pipeline.

**The gate was never armed.** Task 3 put the `coverage` block one level too high in `packages/core/vitest.config.ts`. Vitest ignored it silently, `tests/ci-pipeline.test.ts` read `config.coverage.enabled === true` and passed, and every run since reported green over uninstrumented code. Reproduced below → BLOCKER 1.

**The exit criteria were never met.** Task 6 asked an implementer to push a throwaway commit and then drop it. `CLAUDE.md` rule 4 and `/speq:git-discipline` forbid that, `git-agent` has no operation for it, and the plan names no actor. C2 and M4 flipped to ✅ on a green PR that nobody proved fails closed → BLOCKER 4.

**The fallback broke the guard.** `pnpm/setup@v2` did not resolve, task 2 took its named fallback, and the three clauses whose only textual anchor is action-specific — install ordering, pnpm version derivation, frozen lockfile — had to be rewritten, contradicting task 2's "MUST pass unchanged either way" → BLOCKER 3.

## Intent Fidelity

No Intent Fidelity BLOCKERs. Verified against the brief: 90-flat-on-four-metrics appears in the delta (`ci-pipeline` scenario 8) and decision [5]; `pull_request`-only appears in `ci-pipeline` scenario 1 and decision [3] with no `push` trigger; branch protection is named out of scope in plan.md § Non-Goals, § Impact and decision [10]; both roadmap rows are named for `/speq:record` in plan.md § Impact. The five-row coverage measurement table in plan.md § The coverage gate reproduces exactly against the current tree (97.76/97.5/100/97.76 baseline; 64.85/97.5/54.16/65.5 with `include` alone; 95.62/92.85/96.29/95.62 with the probe module) — the evidence is real, not asserted.

#### [SCOPE_REDUCTION] ADVISORY

- Location: plan.md § Impact (line 150), decision-log.md [1] and [3]
- Issue: the plan instructs `/speq:record` to flip C2 to `✅ erledigt`, but C2's goal in `specs/roadmap.md:97` is "Ab M1 läuft jeder **Push** gegen eine Pipeline." This plan ships `pull_request`-only. The trigger choice is the user's and is settled; the silent mismatch between what C2 states and what closes it is not. A future reader of the roadmap will believe pushes are checked.
- Fix: In plan.md § Impact, extend the two-roadmap-row paragraph with one sentence recording that C2 closes under a narrower trigger than its prose describes — `pull_request` only, no `push` — per the user's interview answer, and that direct pushes to any branch run no pipeline.

## Feasibility

`pnpm/setup` was verified to exist (`gh api repos/pnpm/setup` → tags `v2`, `v2.1.0`) and its `action.yml` declares every input the plan uses: `runtime` in `<name>@<version>` form, `cache`, `require-lockfile`, and version-from-`packageManager` when `version` is omitted. `pnpm -r --include-workspace-root test` was verified to propagate a core threshold breach (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`), and to run the root project first, so the guard suite does fail before the server live suites start.

#### [HIDDEN_DEPENDENCY] BLOCKER

- Location: plan.md § Implementation Tasks, task 6; § Manual Testing, last four rows
- Issue: task 6 reads "Push the branch, open the pull request … on a throwaway commit, make three deliberate breakages one at a time … Drop the throwaway commit." No component in this system may do that. `CLAUDE.md` Immer-Regel 4 requires explicit human approval for any commit or push; `/speq:git-discipline` makes `planner-agent`, `implementer-agent` and `implementer-expert-agent` read-only on git; `git-agent`'s operation set covers branch, commit, push, PR create/comment/ready — it has no history-rewrite operation, so "drop the throwaway commit" is unexecutable by every actor. The plan names no owner for task 6, and plan.md line 174 makes those three runs the sole carrier of both milestones' exit criteria ("These three runs are M4's and C2's exit criteria"). As written the plan cannot close C2 or M4.
- Fix: In plan.md § Implementation Tasks, rewrite task 6 to (a) name the actor for each step — human-approved `git-agent` push, human observation of the run — and (b) replace "Drop the throwaway commit" with an operation that needs no history rewrite: push the three breakages on a separate scratch branch whose PR is closed unmerged, leaving the feature branch untouched. State explicitly that task 6 runs after human approval and is not an `implementer-agent` task.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: decision-log.md [9]; plan.md § Dependencies
- Issue: both claim `pnpm/action-setup` is unusable here — "it targets pnpm 10 and older, and this repository declares `pnpm@12.3.4`" and "Supersedes `pnpm/action-setup`, which is for pnpm ≤ 10". Both are false. `pnpm/action-setup`'s current README states "**This action supports pnpm v12 and earlier**" and its latest release is `v6.1.0`. The rejected alternative was rejected for a reason that does not hold. The chosen action is still sound — the rationale is not.
- Fix: In decision-log.md [9] and plan.md § Dependencies, replace the "pnpm ≤ 10" claim with the accurate one: `pnpm/action-setup` supports pnpm 12, and `pnpm/setup` is preferred because it collapses three steps into one and reads `packageManager` itself.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: plan.md § Context, third force (line 21); decision-log.md [6]
- Issue: "a live suite against an absent Ollama errors after its 120 s timeout. That is a 2-minute confusing failure, not a guard." The 120000 ms value in `openai-compatible-llm.live.test.ts` is a *ceiling*, not the expected duration: a runner with nothing on port 11434 returns ECONNREFUSED immediately, so the suite would fail in under a second. The premise justifying the guard is unmeasured and probably wrong. The guard is still worth having — it fails at the cause and names it — but the stated reason is not why.
- Fix: In plan.md § Context and decision-log.md [6], replace the 120-second claim with the accurate rationale: an absent backend fails with a connection error that names Ollama, not the workflow's misconfiguration, so the failure points at the wrong artifact. Delete "2-minute".

#### [COMPLETENESS_GAP] ADVISORY

- Location: plan.md § Goals (line 23) vs § The workflow (lines 55-77) and § Verification Checklist (line 246)
- Issue: § Goals promises "one hosted run per pull request that reproduces the local checklist", but the workflow runs five of the checklist's nine rows. It never runs `pnpm -r build`. `packages/core` and `packages/server` define `build` as `typecheck`, so `pnpm -r typecheck` covers them — `packages/web` defines `build: vite build`, which nothing in the pipeline exercises. A PR that breaks the web bundle merges green.
- Fix: Either add a `pnpm -r build` step to plan.md § The workflow and a matching `AND` clause to `ci-pipeline`'s "The pipeline runs the mission's checks in order" scenario, or narrow § Goals to name the five checks the pipeline actually runs and record the web-bundle gap in § Non-Goals.

#### [NFR_IGNORED] ADVISORY

- Location: plan.md § The workflow
- Issue: the workflow declares no `concurrency` group. Every push to an open pull request starts a full run and the superseded runs keep occupying runners to completion. The plan rejected the `push` trigger precisely to avoid duplicate runs of one commit (decision [3]), then leaves the larger duplication — N runs per PR — unaddressed.
- Fix: Add `concurrency: { group: ci-${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` to plan.md § The workflow, or record in § Non-Goals that run cancellation is deliberately out of scope.

## Requirement Quality

#### [AMBIGUOUS_REQUIREMENT] BLOCKER

- Location: plan.md § The coverage gate (lines 83-92) and § Implementation Tasks task 1 (coverage assertions)
- Issue: the snippet is captioned `// packages/core/vitest.config.ts` and opens at `coverage: {`, with no `test:` wrapper. The real config nests it as `test.coverage`. Task 1 repeats the same path — "import the core config and assert `coverage.enabled === true`". Reproduced against the current tree: with the block placed at top level, `vitest run` reports `Test Files 7 passed`, prints **no coverage table**, ignores `thresholds: {statements: 99, …}` entirely and exits 0; importing that config yields `coverage.enabled = true` and `test.coverage = undefined`. The misplacement therefore disables the gate **and** satisfies the guard. This is precisely the vacuous guard plan.md's "Fail-closed guard" pattern (line 119) claims to have eliminated: "a text-scanning guard whose anchor disappears passes silently; a vacuous guard is worse than none."
- Fix: In plan.md § The coverage gate, wrap the snippet in `test: { typecheck: { enabled: true }, coverage: { … } }` so it shows the real nesting. In task 1, change every coverage assertion to the `test.coverage.*` path and add one anchor assertion: assert `config.test` is an object and `config.coverage` is `undefined` before asserting any threshold, so a top-level block fails the suite instead of satisfying it.

#### [AMBIGUOUS_REQUIREMENT] BLOCKER

- Location: plan.md § Manual Testing row 3 (line 229); § The coverage gate (line 108)
- Issue: the documented command is `pnpm --filter @chrysalyst/core test -- --coverage.thresholds.lines=99`, expected output `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exit 1. It does not do that. Run against the current tree it exits **0**, prints no coverage table and emits no error — pnpm 12 swallows the `--` separator and the flag never reaches Vitest. Dropping `--` gives the documented failure and exit 1. Line 108 cites this same command as the evidence that a breach exits 1, so the plan's proof of its central mechanism is recorded in a form that reproduces the opposite result. Under `CLAUDE.md` Immer-Regel 3 an implementer running this row records a false pass.
- Fix: In plan.md § Manual Testing row 3 and § The coverage gate line 108, delete the `--` separator: the command is `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99`. Re-check every other command in § Manual Testing and § Verification Checklist for the same `--` form.

#### [REQUIREMENT_CONFLICT] BLOCKER

- Location: `platform/ci-pipeline/spec.md` § "The pipeline runs the mission's checks in order" (line 22) vs plan.md § The workflow; plan.md task 2 (line 170)
- Issue: the scenario reads "*WHEN* its steps are read in order / *THEN* the job MUST install the workspace's dependencies before it runs any check." Read the steps of plan.md § The workflow in order and there is no install step — `pnpm/setup@v2` installs as a side effect, as line 79 states outright ("runs `pnpm install` itself"). The spec's WHEN cannot observe what its THEN requires. Task 1's "Concretely —" enumeration confirms the gap: it lists seven assertions and none covers install ordering, the frozen lockfile, or deriving the pnpm version from `packageManager`, even though test names at plan.md:210-211 promise all three. Task 2 then asserts "the guard suite asserts properties, not action names, so it MUST pass unchanged either way" — false for exactly these three clauses, whose only textual anchor is action-specific: `pnpm/setup` + `require-lockfile: true` under the primary design, `corepack enable` + `pnpm install --frozen-lockfile` under the fallback. Taking the fallback forces a guard rewrite the plan says will not be needed.
- Fix: Restate the scenario's first `THEN` in terms the workflow text can satisfy under both shapes — e.g. "*THEN* the workflow MUST complete dependency installation in a step that precedes the first check step". Then extend task 1's enumeration with the three missing assertions, written as an explicit either-or over the two shapes: assert the workflow contains either a `pnpm/setup` step carrying `require-lockfile: true` or an explicit `pnpm install --frozen-lockfile` step, that this step's line number precedes the first `run: pnpm lint` line, and that no `version:` input pins pnpm. Delete the "MUST pass unchanged either way" sentence from task 2 and replace it with the either-or the guard actually encodes.

#### [COMPLETENESS_GAP] ADVISORY

- Location: `platform/ci-pipeline/spec.md` § "A broken check fails the run" (lines 52-53); plan.md task 1
- Issue: the scenario's first `THEN` is "every step MUST propagate a non-zero exit status" — broader than the one assertion task 1 specifies, "assert no line declares `continue-on-error` in `ci.yml`". `run: pnpm lint || true`, `set +e`, and `if: always()` on a later step each defeat the requirement and pass the guard. The second `THEN` is tested; the first is not.
- Fix: In task 1, extend the fail-closed assertion set to reject `|| true`, `|| :`, `set +e` and `continue-on-error` on any `ci.yml` line, and to reject `if:` conditions containing `always()` or `!cancelled()` in `ci.yml`. State in the spec Background that `openwiki-update.yml`, which legitimately uses both, stays out of this scenario's scope.

## Task Breakdown

#### [TASK_GRANULARITY] ADVISORY

- Location: plan.md § Parallelization, Group A (tasks 1 and 4) and the claim at line 191
- Issue: "Tasks 1 and 4 touch different files (`tests/ci-pipeline.test.ts`, `tests/workspace.test.ts`) … so neither pair contends." Task 4 contradicts this in its own text: "demonstrate red by temporarily deleting `format:check` from the root manifest, running the test, then restoring it." Task 4 mutates `package.json`; task 1 reads `package.json` for the pnpm version assertion and runs the same root Vitest project. Run in parallel, task 1's suite can fail or pass for task 4's reason, corrupting the TDD red/green signal both tasks depend on.
- Fix: In plan.md § Parallelization, move task 4 out of Group A into its own sequential group, and delete the "neither pair contends" sentence's claim about tasks 1 and 4. Keep Group B's 2-and-3 pairing, which does hold.

#### [TRACEABILITY_GAP] ADVISORY

- Location: plan.md § Impact (line 150); § Implementation Tasks
- Issue: "`/speq:record` must move **two** roadmap rows to `✅ erledigt`" is carried only by the last paragraph of § Impact. `specs/roadmap.md` is not a spec delta of this plan, no Implementation Task covers it, and no scenario asserts it. The dual-row flip is the plan's headline claim and rests on prose a recorder may not act on.
- Fix: Add an Implementation Task naming the exact `specs/roadmap.md` edit — set row C2 (line 56) and row M4 (line 60) to `✅ erledigt (ci-test-tiers)` and add `**Pläne:** ci-test-tiers` to the C2 section — and reference that task from § Impact instead of leaving the instruction in prose alone.

## Design Depth

The three-artefact split is sound: `.nvmrc` and `packageManager` each keep one owner, the coverage policy sits at its definition site so all three call paths enforce it, and `tests/ci-pipeline.test.ts` is correctly separated from `tests/workspace.test.ts` by reason to change. The guard's restatement of `90` is a floor assertion (`at least 90`), not a second copy of the number, so it is not leakage.

#### [BOUNDARY_VIOLATION] ADVISORY

- Location: `platform/ci-pipeline/spec.md` § "Core coverage below ninety percent fails the run" (lines 62-68)
- Issue: the scenario's `GIVEN` is "the test configuration of `packages/core`" and its `WHEN` is "the package's tests run under any of the workspace's test commands" — neither names the pipeline. plan.md § Context argues at length that the gate is deliberately *not* a CI concern: "A gate that lives in the workflow fires once a pull request is open … A gate that lives in `packages/core/vitest.config.ts` fires on `pnpm test` in the package". The plan moved the decision out of CI and then filed the requirement under CI anyway. A later change to core's coverage policy now has to be recorded against `ci-pipeline`, a feature it does not touch.
- Fix: Move the scenario into the `platform/monorepo-workspace` delta as a second `DELTA:NEW` scenario, since that feature already owns the shared toolchain and script contract, and leave in `ci-pipeline` only the pipeline-visible half — that the workspace test command the pipeline runs enforces the floor without an extra flag or step. Update plan.md § Verification Scenario Coverage and § Features to match.

## Prose Quality

#### [PROSE_UNCLEAR] ADVISORY

- Location: plan.md § Impact, first sentence (line 146)
- Issue: "Contributors gain a required-looking check on every pull request and lose the ability to merge a branch that fails lint, formatting, types, tests or the `packages/core` coverage floor — assuming a human enables branch protection, which this plan cannot do from a file." Forty-five words against the 25-word cap, and it asserts a capability then retracts it inside the same sentence. "required-looking" is a hedge doing the work a fact should do. An approver scanning § Impact reads "lose the ability to merge" and stops.
- Fix: Split into two sentences, lead with the true state: "This plan blocks nothing on its own. The `check` job reports on every pull request; a human must mark it required in branch-protection settings before a failing lint, format, type, test or coverage result can stop a merge." Delete "required-looking".

#### [PROSE_UNCLEAR] ADVISORY

- Location: `platform/monorepo-workspace/spec.md`, final `AND` (line 20)
- Issue: "`format:check` MUST report a formatting violation without rewriting a file, because the pipeline runs it on a runner whose working tree is discarded." The causal clause is backwards — a discarded working tree is exactly why a rewrite there would be harmless. The real reason is that a rewriting variant (`prettier --write`) exits 0 unconditionally, making the check vacuous.
- Fix: Replace the `because` clause with the correct one: "because a rewriting variant exits zero on every input and would report no violation at all."

# Plan Review Findings: ci-test-tiers (round 2)

## Summary

- Axes checked: 6/6
- Total findings: 7 (Blockers: 3, Advisory: 4)
- Intent Fidelity blockers: 0
- Carried forward: 11 round-1 ADVISORY findings remain unaddressed. Not re-litigated here; listed by name under § Carried-Forward Advisories.

## Round-1 Blocker Recheck

- **Resolved:** `[AMBIGUOUS_REQUIREMENT]` the coverage block was shown one level above where Vitest reads it — plan.md:83-95 now opens at `test: {` and nests `typecheck` and `coverage` under it, matching the real `packages/core/vitest.config.ts` verbatim. plan.md:97 names the silent-ignore failure mode. Task 1 (plan.md:174) asserts `config.test` is an object and `config.coverage` is `undefined` before any threshold assertion, then reads `config.test.coverage.*`. Task 3 (plan.md:176) names the `test.coverage` block and says to keep it nested. Reproduced: writing the plan's exact block into `packages/core/vitest.config.ts` and running `pnpm --filter @chrysalyst/core test` with no flag printed the coverage table at 97.76 / 97.5 / 100 / 97.76 and exited 0 — the figures plan.md:103 and :242 claim. Config restored; `git status` clean.
- **Resolved:** `[AMBIGUOUS_REQUIREMENT]` the documented coverage-breach command exited 0 instead of 1 — plan.md:113 and :244 now read `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99`. Run live against the current tree: printed `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)`, then `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, exit 1 — exactly the documented result. `grep -rn 'test -- ' specs/_plans/ci-test-tiers/` finds the old form only inside round-1.md and the decision-log's quotation of it, never as a live command.
- **Resolved:** `[REQUIREMENT_CONFLICT]` the install-ordering clause had no anchor in the workflow text — `platform/ci-pipeline/spec.md:22` now reads "the workflow MUST complete dependency installation in a step that precedes the first check step, whether that step installs explicitly or through an action that installs as part of its own work", which a reader can satisfy from the step list under either shape. Task 1 (plan.md:174) carries the three either-or assertions; task 2 (plan.md:175) no longer claims the suite passes unchanged. Checked every other task-1 assertion against the fallback shape (`actions/setup-node` + `node-version-file: .nvmrc` + `corepack enable`): the `.nvmrc` mention, the two absent-version-literal assertions and the SHA-pinning assertion all hold, so task 2's "Every other assertion is shape-independent" is accurate. One residue remains in decision-log [9] — raised below as ADVISORY, not a blocker.
- **Not resolved:** `[HIDDEN_DEPENDENCY]` task 6 required a history rewrite no component may perform — the history rewrite is gone and actors are named, but the replacement sequence substitutes three new unexecutable or unobservable steps. `git-agent` is handed two operations it does not have (BLOCKER 1). The `pull_request`-only trigger the plan itself mandates means two of the three pushes start no run at all (BLOCKER 2). The three breakages accumulate on one branch, so runs 2 and 3 fail at `pnpm format:check` rather than at the steps plan.md:250-251 document (BLOCKER 3). The original finding's substance — "the plan as written cannot close C2 or M4" — therefore still holds: M4's coverage-drop and live-test-in-CI criteria remain unprovable by the documented procedure.

## Intent Fidelity

No objection — axis checked. The three interview answers survive the revision untouched: `pull_request`-only at `platform/ci-pipeline/spec.md:15-16` and decision [3]; 90 flat on four metrics at plan.md:92, spec.md:67 and decision [5]; C2+M4 bundled at decision [1]. No scope was added or dropped between rounds — `git diff` of intent-bearing sections is empty in substance; the edits touch task 6, the coverage snippet, one command and one spec THEN.

## Feasibility

#### [HIDDEN_DEPENDENCY] BLOCKER

- Location: plan.md § Implementation Tasks, task 6 step 5 (line 185); § Manual Testing closing paragraph (line 254)
- Issue: "**`git-agent`** closes the scratch pull request unmerged and deletes `ci-test-tiers-failclosed`." `git-agent` can do neither. `/speq:git-operations` defines its complete operation set: `create-branch`, `checkout`, `commit`, `push`, `create-pr`, `ready-pr`, `comment-pr`, `create-issue`, `comment-issue`, `read-comments`, plus the composites `ship-draft` and `ship-ready`. There is no close-PR operation and no delete-branch operation, and the agent "executes exactly one caller-specified operation per invocation" — it cannot improvise `gh pr close` or `git push --delete`. This is round-1 BLOCKER 4 recurring: the fix replaced one operation absent from `git-agent`'s set ("drop the throwaway commit") with two others equally absent. Line 254 makes the same cleanup a precondition for marking the feature pull request ready, so the feature PR is blocked behind an unexecutable step.
- Fix: In plan.md task 6 step 5, reassign the cleanup to the human: "**Human** closes the `ci-test-tiers-failclosed` pull request unmerged and deletes the branch in the GitHub UI." Reword § Manual Testing's closing paragraph (line 254) the same way. Do not assign `git-agent` any operation outside `/speq:git-operations`' list; re-check steps 1 and 3 against that list while editing (`push`, `create-pr` and `create-branch` are on it and may stay).

#### [HIDDEN_DEPENDENCY] BLOCKER

- Location: plan.md § Implementation Tasks, task 6 step 3 (line 183); § Manual Testing rows at lines 249-251
- Issue: step 3 says `git-agent` "commits the three deliberate breakages as three separate commits … **pushing after each so each starts its own run**, and opens one pull request for that branch." With `on: pull_request` and no `push` trigger — which `platform/ci-pipeline/spec.md:15-16` and decision [3] mandate — a push to a branch that has no open pull request fires no event and starts no workflow run. The pull request is opened last, after all three pushes. Result: pushes 1 and 2 produce zero runs, and the single run that does start fires on the `opened` event against a head carrying all three breakages. The plan needs three run URLs (line 187, line 254) and this sequence yields one. The ordering constraint is the direct consequence of the plan's own trigger decision and is nowhere modelled.
- Fix: In plan.md task 6 step 3, move the pull-request creation ahead of the breakage commits: `git-agent` creates `ci-test-tiers-failclosed` off the feature branch, pushes it unchanged, and opens the pull request first; only then commit-and-push each breakage, so each push arrives as a `synchronize` event on an open pull request and starts its own run. State in the step that a push to a branch without an open pull request starts no run under a `pull_request`-only trigger. Name the pull request's base branch explicitly.

#### [UNSTATED_ASSUMPTION] BLOCKER

- Location: plan.md § Implementation Tasks, task 6 steps 3-4 (lines 183-184); § Manual Testing rows 8-10 (lines 249-251)
- Issue: the three breakages are committed cumulatively on one branch — "commits the three deliberate breakages as three separate commits", and rows 9 and 10 both say "On the same scratch branch" with no revert between them. The workflow runs lint → format:check → typecheck → test in that order and every step propagates failure, so once breakage 1 (reverted Prettier formatting) is on the branch, every later run stops at `pnpm format:check` and never reaches the test step. Run 2 therefore cannot produce "fails at the `pnpm -r --include-workspace-root test` step with the threshold error naming lines" (line 250) and run 3 cannot produce "fails inside `tests/ci-pipeline.test.ts`" (line 251). Step 4 asks the human to "confirm each run fails at its own step" — an observation the sequence makes impossible. Those two rows are M4's `absichtlicher core-Coverage-Abfall` and `versehentlich in CI laufender live-Test` exit criteria, and line 254 calls the three run URLs "the only evidence that the pipeline fails closed", so the plan records three failing runs while proving exactly one thing. Breakage 2 left in place for run 3 compounds it: core's threshold breach and the guard-suite failure then both land in the test step, and the human cannot attribute the failure to `tests/ci-pipeline.test.ts`.
- Fix: In plan.md task 6 step 3, require each breakage to be the only breakage present when its run starts: commit breakage 1, push, wait for its run; commit a revert of breakage 1 together with breakage 2, push, wait; commit a revert of breakage 2 together with breakage 3, push, wait. State that the ordered workflow steps mean a surviving earlier breakage masks every later one. Add to § Manual Testing rows 9 and 10 the precondition "with the previous breakage reverted" and keep row 8's "and at no earlier one" clause on all three rows.

#### [TRACEABILITY_GAP] ADVISORY

- Location: plan.md § Implementation Tasks, task 6 step 3 (line 183)
- Issue: no actor is named for authoring the breakage edits themselves. `git-agent` "authors no spec, plan, or code content and decides no commit/comment/issue text" and its `commit` operation stages caller-named paths with a caller-supplied message; task 6 declares itself "**not** an `implementer-agent` task", so no implementer edits either. Somebody must un-format a source file, raise `thresholds.lines` to 100 in `packages/core/vitest.config.ts` and add `env: CHRYSALYST_LIVE_LLM: '1'` to `ci.yml`. Round-1's fix instruction was to "name the actor for each step"; the edits are the one step still unowned. Step 3 also supplies no commit messages, no pull-request title or body and no base branch, all of which `git-agent` requires as parameters and refuses to invent.
- Fix: In plan.md task 6 step 3, name the **human** as the author of each breakage edit, list the three exact file edits, and supply the commit messages, the scratch pull request's title, body and base branch as literal parameters for `git-agent`.

#### [COMPLETENESS_GAP] ADVISORY

- Location: plan.md § Impact (line 155); § Implementation Tasks, task 6 (line 187)
- Issue: nothing gates `/speq:record` on task 6's evidence. § Parallelization stops the orchestrator after Group C, so `/speq:implement` writes its verification report without the three run URLs, and § Impact then instructs `/speq:record` to flip C2 and M4 to `✅ erledigt` unconditionally. Round-1's premortem named exactly this outcome — both milestones closed on a green pull request nobody proved fails closed — and the revision addressed the mechanism without adding the gate.
- Fix: In plan.md § Impact, add one sentence: "`/speq:record` MUST NOT run until task 6's three run URLs are recorded in the verification report." Repeat it as the closing line of task 6.

## Requirement Quality

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: decision-log.md [9] (line 75)
- Issue: "Kept as the named fallback in task 2 if the action does not resolve; the guard suite asserts properties rather than action names, **so it passes unchanged either way**." That is the claim round 1 refuted and the `[plan-review]` entry twenty-nine lines below, at decision-log.md:105, reports as "deleted". It was deleted from task 2 only. decision-log.md now contradicts itself: [9] asserts the guard needs no either-or, the review entry records that it does. decision-log.md is the artifact `/speq:record` mines and a future reader consults, so the stale claim outlives the plan. The same line also still carries the round-1 advisory's refuted rationale, "`pnpm/action-setup` — rejected: it targets pnpm 10 and older".
- Fix: In decision-log.md [9], replace "so it passes unchanged either way" with "so the guard suite encodes the three install clauses as an explicit either-or over the two shapes". Correct the `pnpm/action-setup` clause in the same edit per round-1's still-open advisory.

Otherwise no objection — axis checked. `speq plan validate ci-test-tiers` passes on both deltas. `platform/ci-pipeline/spec.md`'s eight scenarios each map to a named test at plan.md:224-231, the revised scenario 2 wording is satisfiable under both workflow shapes, and `platform/monorepo-workspace/spec.md` is unchanged since round 1.

## Task Breakdown

No new objection — axis checked. Task 6's Group D isolation is now stated twice and consistently (plan.md:179 and :204), and the three new task-6 defects above are content defects inside one task, not decomposition defects. Round-1's `[TASK_GRANULARITY]` finding on Group A and its `[TRACEABILITY_GAP]` finding on the roadmap rows both stand unaddressed — see § Carried-Forward Advisories.

## Design Depth

No objection — axis checked. The round-2 edits introduce no module, interface or boundary: they correct a config snippet's nesting, one shell command, one spec THEN and one task's procedure. The three-artefact ownership split assessed in round 1 is unchanged, and the coverage policy still has exactly one owner at its definition site — confirmed by running the plan's block against the tree, where `pnpm --filter @chrysalyst/core test` enforced it with no flag. Round-1's `[BOUNDARY_VIOLATION]` advisory on the coverage scenario's home stands unaddressed.

## Prose Quality

#### [PROSE_UNCLEAR] ADVISORY

- Location: plan.md § Manual Testing, row 3's Expected Output cell (line 244)
- Issue: the cell reads "`ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exit 1. No `--` separator: pnpm 12 swallows it, the flag never reaches Vitest, and the run exits 0." One cell states two contradictory exit codes for one command. An implementer scanning the Expected Output column reads "the run exits 0" last and records the wrong pass criterion — the same failure mode round 1 raised against this very row. The counterfactual belongs in prose, where plan.md:113 already carries it.
- Fix: In plan.md § Manual Testing row 3, truncate the Expected Output cell to "`ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exit 1." Delete the sentence after it; the separator explanation already sits at plan.md:113.

## Carried-Forward Advisories

Eleven round-1 ADVISORY findings are unaddressed in the revised artifacts, confirmed while reading the files above. Listed for the human's acknowledgement, not re-argued:

1. `[SCOPE_REDUCTION]` C2's roadmap prose says "jeder **Push**"; this plan ships `pull_request` only (plan.md:155).
2. `[UNSTATED_ASSUMPTION]` "`pnpm/action-setup` … is for pnpm ≤ 10" is false (plan.md:162, decision-log [9]).
3. `[UNSTATED_ASSUMPTION]` the "120 s timeout / 2-minute confusing failure" premise is unmeasured (plan.md:21, decision-log [6]).
4. `[COMPLETENESS_GAP]` the workflow never runs `pnpm -r build`, so `packages/web`'s Vite bundle is ungated (plan.md:23 vs :73-76).
5. `[NFR_IGNORED]` no `concurrency` group; superseded runs occupy runners to completion (plan.md § The workflow).
6. `[COMPLETENESS_GAP]` the fail-closed assertion still covers only `continue-on-error`, not `|| true`, `set +e` or `if: always()` (plan.md:174).
7. `[TASK_GRANULARITY]` tasks 1 and 4 remain in parallel Group A although task 4 mutates the `package.json` task 1 reads (plan.md:193, :206).
8. `[TRACEABILITY_GAP]` the two-roadmap-row flip is carried by § Impact prose with no implementing task (plan.md:155).
9. `[BOUNDARY_VIOLATION]` the core-coverage scenario sits in `ci-pipeline` although the plan argues the gate is not a CI concern (`platform/ci-pipeline/spec.md:62-68`).
10. `[PROSE_UNCLEAR]` § Impact's 45-word opening sentence asserts then retracts a capability (plan.md:151).
11. `[PROSE_UNCLEAR]` `monorepo-workspace`'s final `AND` gives a backwards causal clause for `format:check` (`platform/monorepo-workspace/spec.md`, last bullet).

## Premortem

**The scratch branch proved one thing and the report claimed three.** Task 6 ran. The human pushed three commits, watched three red X marks, pasted three URLs into the verification report and closed the pull request. Every run after the first had stopped at `pnpm format:check`, so neither the coverage drop nor the live-tier flag was ever exercised on a runner. `/speq:record` flipped C2 and M4 to `✅ erledigt`. Two milestones later someone added `CHRYSALYST_LIVE_LLM: '1'` to a matrix job and the pipeline went green. → BLOCKER 3, with BLOCKER 2 shrinking the three runs to one.

**Task 6 stalled on an operation nobody owned.** The orchestrator stopped after Group C as planned. The human approved the push, `git-agent` opened the pull request, the breakages ran — and step 5 asked `git-agent` to close a pull request and delete a branch. It has neither operation, so it reported not-supported. The scratch branch and its pull request stayed open; § Manual Testing makes deleting them a precondition for marking the feature pull request ready, so the feature pull request never went ready. → BLOCKER 1.

**Nobody made the breakage.** Step 3 named `git-agent` for the commits and the human for the approvals and the observations. It named no one for un-formatting the file, raising the threshold and editing `ci.yml`. `git-agent` decides no content; task 6 forbids an implementer. The step deadlocked on an editor. → ADVISORY, § Feasibility `[TRACEABILITY_GAP]`.

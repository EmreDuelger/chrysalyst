# Decision Log: ci-test-tiers

## Interview

**Q:** Roadmap row C2 ("Minimale CI") is still `⬜ offen` even though M1–M3 are `✅ erledigt`, and `.github/workflows/` holds only the unrelated `openwiki-update.yml`. M4 was written to *extend* C2's workflow, but there is nothing to extend. Deliver C2 as a quick documentation/config shortcut first and then plan M4, or bundle both into one `ci-test-tiers` plan?
**A:** Bundle C2 and M4 into one `ci-test-tiers` plan — full spec deltas, adversarial review, the works. Not a shortcut.

**Q:** `packages/core` currently measures 97.76 % statements and lines, 97.5 % branches, 100 % functions. What threshold should the gate enforce?
**A:** 90 % flat across all four metrics — the literal reading of the "~90 %" target in `specs/mission.md` § Tech Stack and the `CLAUDE.md` cheatsheet.

**Q:** What should trigger the new workflow — `push` to any branch, `pull_request`, or both?
**A:** `pull_request` only. Both would run the same commit twice while a pull request is open.

## Design Decisions

### [1] One plan delivers both C2 and M4

- **Decision:** `ci-test-tiers` delivers C2's scope (the workflow itself: install → lint → format:check → typecheck → test) and M4's scope (the live-tier guarantee and the `packages/core` coverage gate) in one pass. On recording, **both** roadmap rows move to `✅ erledigt`.
- **Alternatives:** Take C2 through `CLAUDE.md`'s documented config shortcut first, then plan M4 against the result. Rejected: the file C2 would create is the file M4 would immediately edit, so the shortcut buys one extra pass over `ci.yml` and skips the adversarial review on the artefact that guards every milestone after it.
- **Rationale:** C2 was sequenced before M1 and got skipped; M1, M2 and M3 shipped without it. Splitting the repair again repeats the mistake that produced the gap.
- **Promotes to ADR:** no

### [2] The pipeline reads the repository's version pins instead of restating them

- **Decision:** The workflow derives the Node version from `.nvmrc` through a shell step and the pnpm version from the root manifest's `packageManager` field, which `pnpm/setup` reads on its own. Neither version literal appears in `ci.yml`, and `tests/ci-pipeline.test.ts` asserts that neither string is present.
- **Alternatives:** Write `node-version: 22.23.2` into the workflow, guarded by a test comparing it to `.nvmrc`. Rejected: the test reconciles the copies but the decision still has two owners. Declare `devEngines.runtime` in `package.json` and let the action read it. Rejected: that is a third copy of the version alongside `.nvmrc` and `engines.node`.
- **Rationale:** `/speq:design-philosophy` names back-door leakage — two places independently asserting one fact — as the defect to watch hardest for. `platform/monorepo-workspace` already owns and reconciles the runtime pins; the pipeline consumes them.
- **Promotes to ADR:** yes

### [3] The coverage gate lives in the package's Vitest config, not in a CI step

- **Decision:** `packages/core/vitest.config.ts` gets `coverage.enabled: true` and `coverage.thresholds` at 90 for statements, branches, functions and lines. CI needs no coverage-specific step; `pnpm -r --include-workspace-root test` enforces the floor because it runs that config.
- **Alternatives:** A dedicated CI step running `pnpm --filter @chrysalyst/core test --coverage`. Rejected: the policy would then be split between the config and the workflow, the gate would fire only after a pull request opened, and a local `pnpm test` would report success on code that CI rejects. A `test:coverage` script in the package. Rejected: the gate would apply only when someone remembered to run the second script.
- **Rationale:** One owner for the coverage policy, enforced identically on every path that runs core's tests. `enabled: true` is the config form of `--coverage`, so no caller needs to know the policy exists.
- **Promotes to ADR:** yes

### [4] The gate measures every file under `src`, not only the files tests import

- **Decision:** `coverage.include: ['src/**/*.ts']` with `coverage.exclude: ['**/*.test-d.ts']`.
- **Alternatives:** Vitest's default file set. Rejected on measurement: adding one untested module to `packages/core/src` left the default report at exactly 97.76 / 97.5 / 100 / 97.76, while the same tree under the explicit `include` read 95.62 / 92.85 / 96.29 / 95.62. The default gate is blind to entirely untested code, which is the regression a floor exists to catch.
- **Rationale:** The `exclude` is required rather than cosmetic. Vitest 5 auto-excludes files matching `test.include` but not the `*.test-d.ts` type tests, and `coverageConfigDefaults.exclude` is `[]` in Vitest 5, so nothing is overridden. Without it, `include` alone drops the report to 64.85 % statements by counting two type-test files as uncovered source.
- **Promotes to ADR:** no

### [5] 90 flat on four metrics, not a ratchet to today's number

- **Decision:** All four thresholds are 90, leaving 7.5 to 10 points of headroom.
- **Alternatives:** Ratchet to ~97, today's measurement. Rejected: every refactor that legitimately moves coverage a point turns into a threshold edit, and a threshold edited routinely stops being a gate. `lines` only. Rejected: line coverage misses an unexercised branch and an uncalled function, both of which the current tree already distinguishes.
- **Rationale:** The user set 90 as the literal reading of the mission's "~90 %" target. The mission owns the number; this plan owns only its enforcement.
- **Promotes to ADR:** no

### [6] The tier guard asserts the workflow's environment, not the test run's output

- **Decision:** `tests/ci-pipeline.test.ts` asserts `ci.yml` assigns `CHRYSALYST_LIVE_LLM` no non-empty value anywhere. It does not assert that live suites reported as skipped.
- **Alternatives:** Parse the runner's log for a skipped count. Rejected: brittle, and observable only after the run it is meant to protect. Let the existing failure mode stand — a live suite against an absent Ollama does eventually fail the run. Rejected: it fails after a 120-second timeout with a connection error, which is a confusing outage rather than a guard.
- **Rationale:** The workflow's environment is the cause; `monorepo-workspace`'s existing `Live-tier tests are gated by an environment flag` and `An empty live-tier flag leaves the tier disabled` already own the effect and evaluate every guard expression against unset, empty and `1`. This feature depends on that guarantee instead of duplicating it.
- **Promotes to ADR:** no

### [7] `format:check` joins the required root script set

- **Decision:** `platform/monorepo-workspace`'s `Root scripts expose the mission command set` scenario is changed to require `format:check` and to require it not rewrite files.
- **Alternatives:** Leave the scenario alone, since the script already exists. Rejected: the pipeline would then depend on a script no spec guarantees — the same back-door assumption decision [2] removes for version pins.
- **Rationale:** A dependency the pipeline relies on belongs in the spec of the feature that owns it, not in the pipeline's assumptions.
- **Promotes to ADR:** no

### [8] A text-scanning guard, with no YAML parser dependency

- **Decision:** `tests/ci-pipeline.test.ts` asserts over the workflow's text with targeted patterns and imports `packages/core/vitest.config.ts` for the coverage assertions. No `yaml` package is added.
- **Alternatives:** Add `yaml` to the `catalog:` block and parse `ci.yml` properly. Rejected: `tests/workspace.test.ts` already hand-scans `pnpm-workspace.yaml` and evaluates live-tier guard expressions through `node:vm` rather than take a dependency, and every property this suite asserts — a trigger key, a `uses:` reference, an env assignment, a `continue-on-error` line, the order of four `run:` commands in one job — is line-shaped.
- **Rationale:** The real risk of text scanning is a vacuous guard that passes after the file is restructured. That is answered directly: each assertion first proves the anchor it depends on exists, so a restructured workflow breaks the test rather than satisfying it silently. A parser would not remove that requirement.
- **Promotes to ADR:** no

### [9] `pnpm/setup@v2` over `actions/setup-node` plus corepack

- **Decision:** One `pnpm/setup@v2` step installs pnpm from `packageManager`, installs the Node runtime named by `.nvmrc`, caches the pnpm store, and runs `pnpm install --frozen-lockfile` via `require-lockfile: true`.
- **Alternatives:** `actions/setup-node` + `corepack enable` + an explicit `pnpm install --frozen-lockfile`. Kept as the named fallback in task 2 if the action does not resolve; the guard suite asserts properties rather than action names, so it passes unchanged either way. `pnpm/action-setup` — rejected: it targets pnpm 10 and older, and this repository declares `pnpm@12.3.4`.
- **Rationale:** Three steps collapse to one, and the action reading `packageManager` itself is what keeps the pnpm version out of the workflow as decision [2] requires.
- **Promotes to ADR:** no

### [10] Branch protection is named as a follow-up, not attempted

- **Decision:** The plan states in § Impact that a human must mark the `check` job required in the repository's branch-protection settings. It changes no setting and claims no enforcement it cannot deliver.
- **Alternatives:** Add a rulesets file or a workflow that configures protection through the API. Rejected: it needs a token with administration scope, which contradicts the `contents: read` permission this same plan specifies.
- **Rationale:** Without this note the plan would read as if merges are blocked on green, when they are only reported on. C2's exit criterion is a green pull request, not an enforced one.
- **Promotes to ADR:** no

## Review Findings

<!-- Populated by speq-plan after plan-reviewer blockers, and by speq-implement after code review. -->

### [plan-review] The coverage block was shown one level above where Vitest reads it

- **Finding:** Round 1, Requirement Quality, `[AMBIGUOUS_REQUIREMENT]` BLOCKER. § The coverage gate's snippet opened at `coverage: {` with no `test:` wrapper, and task 1 asserted the same path. Reproduced against the tree: a top-level `coverage` block prints no coverage table, ignores the thresholds and exits 0, while an importing test still reads `coverage.enabled === true`. The misplacement would have disabled the gate and satisfied the guard at once — the vacuous guard § Patterns claims to have eliminated.
- **Direction change:** The snippet now shows the real nesting, `test: { typecheck: { enabled: true }, coverage: { … } }`, with a paragraph naming the silent-ignore failure mode. Task 1's coverage assertions moved to the `config.test.coverage.*` path and gained an anchor assertion that runs first: `config.test` MUST be an object and `config.coverage` MUST be `undefined`. Task 3 now names the `test.coverage` block and says to keep it nested.
- **Promotes to ADR:** no

### [plan-review] The documented coverage-breach command exited 0 instead of 1

- **Finding:** Round 1, Requirement Quality, `[AMBIGUOUS_REQUIREMENT]` BLOCKER. § Manual Testing row 3 and the evidence sentence in § The coverage gate used `pnpm --filter @chrysalyst/core test -- --coverage.thresholds.lines=99`. pnpm 12 swallows the `--` separator, the flag never reaches Vitest, and the run exits 0 with no coverage table — the opposite of the documented result, recorded as the plan's proof of its central mechanism.
- **Direction change:** Both places now carry `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99` and state why the separator is absent. Re-verified against the current tree: the corrected command prints `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exits 1. Swept § Manual Testing and § Checklist for the same form — no other occurrence; corrected one further instance in decision [3]'s rejected alternative.
- **Promotes to ADR:** no

### [plan-review] The install-ordering clause had no anchor in the workflow text

- **Finding:** Round 1, Requirement Quality, `[REQUIREMENT_CONFLICT]` BLOCKER. The `ci-pipeline` scenario required the job to "install the workspace's dependencies before it runs any check", but the workflow has no install step — `pnpm/setup` installs as a side effect. Task 1 covered neither install ordering, the frozen lockfile, nor pnpm-version derivation, and task 2 claimed the guard "MUST pass unchanged either way" across the fallback. False for exactly those three clauses, whose only anchor is action-specific.
- **Direction change:** The scenario's first `THEN` now reads "the workflow MUST complete dependency installation in a step that precedes the first check step", satisfiable under both shapes. Task 1 gained the three missing assertions written as an explicit either-or: a `pnpm/setup` step with `require-lockfile: true` **or** a `run: pnpm install --frozen-lockfile` step; that step's line preceding the first `run: pnpm lint`; no `version:` input pinning pnpm. Task 2's "MUST pass unchanged either way" is deleted and replaced by that either-or.
- **Promotes to ADR:** no

### [plan-review] Task 6 required a history rewrite no component may perform

- **Finding:** Round 1, Feasibility, `[HIDDEN_DEPENDENCY]` BLOCKER. Task 6 said to push a throwaway commit and later "drop" it, and named no actor. `CLAUDE.md` Immer-Regel 4 requires human approval for any push, `/speq:git-discipline` makes the planner and implementers read-only on git, and `git-agent` has no history-rewrite operation. Since plan.md makes those three runs the sole carrier of C2's and M4's exit criteria, the plan as written could close neither milestone.
- **Direction change:** Task 6 is now a five-step sequence with a named actor per step — human approval, `git-agent` for every git and GitHub write, human observation of each run — and states it is not an `implementer-agent` task. The throwaway commit is replaced by a `ci-test-tiers-failclosed` scratch branch carrying the three breakages as three commits, whose pull request is closed unmerged and whose branch is deleted; the feature branch is never touched, so no rewrite is needed. § Manual Testing's three breakage rows and its closing paragraph follow the scratch branch, and § Parallelization records that Group D is not dispatched to an implementer.
- **Superseded by:** the three round-2 entries below. Round 2 found this fix substituted three new unexecutable or unobservable steps for the history rewrite it removed.
- **Promotes to ADR:** yes

### [plan-review] `git-agent` was assigned two operations it does not have

- **Finding:** Round 2, Feasibility, `[HIDDEN_DEPENDENCY]` BLOCKER 1. Task 6 step 5 and § Manual Testing's closing paragraph had `git-agent` close the scratch pull request unmerged and delete `ci-test-tiers-failclosed`. `/speq:git-operations` defines its complete set — `create-branch`, `checkout`, `commit`, `push`, `create-pr`, `ready-pr`, `comment-pr`, `create-issue`, `comment-issue`, `read-comments`, plus `ship-draft`, `ship-ready` and `flag-blocked` — and it holds no close-pull-request and no delete-branch operation. The agent executes exactly one caller-specified operation per invocation, so it cannot improvise `gh pr close` or `git push --delete`. Because the closing paragraph made that cleanup a precondition for marking the feature pull request ready, the feature pull request was blocked behind an unexecutable step. This is round-1 BLOCKER 4 recurring: one absent operation was replaced by two others.
- **Direction change:** Task 6's final step now reads "**Human** closes the `ci-test-tiers-failclosed` pull request unmerged and deletes the branch in the GitHub UI"; § Manual Testing's closing paragraph says the same and names why (`git-agent` has neither operation). Task 6's preamble now enumerates the operations the task actually uses — `create-branch`, `checkout`, `commit`, `push`, `create-pr` — and were re-checked against the skill: all five are on the list. One `checkout` back to `feat/ci-test-tiers` was added as the last write, so `create-branch`'s implicit checkout does not leave the workspace on the scratch branch.
- **Promotes to ADR:** no

### [plan-review] A `pull_request`-only trigger meant two of the three pushes fired zero runs

- **Finding:** Round 2, Feasibility, `[HIDDEN_DEPENDENCY]` BLOCKER 2. Task 6 step 3 pushed three breakage commits and opened the pull request last. With `on: pull_request` and no `push` trigger — mandated by decision [3] and `platform/ci-pipeline/spec.md:15-16` — a push to a branch with no open pull request fires no event and starts no workflow run. Pushes 1 and 2 would have produced nothing, and the single `opened` run would have fired against a head carrying all three breakages. The plan needs three run URLs and the sequence yielded one.
- **Direction change:** Task 6 step 3 now creates `ci-test-tiers-failclosed` off `feat/ci-test-tiers`, pushes it unchanged and opens its pull request against `feat/ci-test-tiers` **first**; the breakages follow in steps 4 to 6, each push arriving as a `synchronize` event on an open pull request. The step states the rule explicitly as the first of two ordering constraints, names the base branch, and flags that the scratch pull request's own `opened` run goes green and is not one of the three. § Manual Testing's first breakage row carries the "already open" precondition and the closing paragraph repeats the rule.
- **Promotes to ADR:** no

### [plan-review] Cumulative breakages masked each other

- **Finding:** Round 2, Feasibility, `[UNSTATED_ASSUMPTION]` BLOCKER 3. The three breakages accumulated on one branch with no revert between them. The workflow runs lint → format:check → typecheck → test in order and every step propagates failure, so once breakage 1 (reverted Prettier formatting) sat on the branch, every later run stopped at `pnpm format:check` and never reached the test step. Runs 2 and 3 therefore could not fail where § Manual Testing documented, and breakage 2 surviving into run 3 would have put the threshold breach and the guard-suite failure in the same step, leaving the human unable to attribute either. Those two rows are M4's coverage-drop and live-test-in-CI exit criteria, so the plan would have recorded three failing runs while proving one thing.
- **Direction change:** Each breakage MUST now be the only breakage present when its run starts, stated as the second ordering constraint in task 6's preamble with the masking mechanism named. Steps 5 and 6 revert their predecessor in the same commit — `pnpm format` over the reformatted file alongside the threshold raise, then `thresholds.lines` back to 90 alongside the `ci.yml` env addition — with the exact `paths` and commit message for each. § Manual Testing rows for breakages 2 and 3 open with "With the previous breakage reverted", spell out the two-part commit, and carry the "and at no earlier one" clause that row 1 already had.
- **Promotes to ADR:** no

### [plan-review] Nobody was named to author the breakage edits

- **Finding:** Round 2, Feasibility, `[TRACEABILITY_GAP]` ADVISORY. Task 6 step 3 named no actor for the edits themselves. `git-agent` authors no content and its `commit` operation stages caller-named paths with a caller-supplied message; task 6 declares itself not an `implementer-agent` task. Somebody had to un-format a source file, raise the threshold and edit `ci.yml`. The step also supplied no commit messages, no pull-request title or body and no base branch — all parameters `git-agent` requires and refuses to invent.
- **Direction change:** Task 6's preamble names the **human** as the author of every file edit and states that each commit message and pull-request field is a literal the human hands `git-agent`. Steps 4 to 6 each name the exact file (`packages/core/src/interview/single-turn-interview.ts`, `packages/core/vitest.config.ts`, `.github/workflows/ci.yml`), the `paths` argument and the literal commit message. Step 3 supplies the scratch pull request's `base`, `draft`, `title` and `body`, and step 1 names `base: main` for the feature pull request.
- **Promotes to ADR:** no

### [plan-review] Nothing gated `/speq:record` on task 6's evidence

- **Finding:** Round 2, Feasibility, `[COMPLETENESS_GAP]` ADVISORY. § Parallelization stops the orchestrator after Group C, so `/speq:implement` writes its verification report without the three run URLs, and § Impact then instructed `/speq:record` to flip C2 and M4 to `✅ erledigt` unconditionally. Round 1's premortem named this outcome — both milestones closed on a green pull request nobody proved fails closed — and the round-1 revision fixed the mechanism without adding the gate.
- **Direction change:** § Impact now closes with "`/speq:record` MUST NOT run until task 6's three run URLs are recorded in the verification report." Task 6's closing line and § Manual Testing's closing paragraph repeat it, so the gate is visible from all three places a reader enters this plan.
- **Promotes to ADR:** no

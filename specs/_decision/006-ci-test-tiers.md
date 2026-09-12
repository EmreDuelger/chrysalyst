# Decisions: ci-test-tiers

## ADR: The pipeline reads the repository's version pins instead of restating them

**ID:** ci-pipeline-reads-version-pins
**Plan:** ci-test-tiers
**Status:** Accepted

### Context

`.nvmrc` pins the Node version, the root manifest's `packageManager` field pins the pnpm version, and `tooling/monorepo-workspace` already asserts the two agree with `engines.node`. Writing the CI workflow required deciding whether it names its own toolchain versions or reads the ones already pinned elsewhere. `/speq:design-philosophy` names back-door leakage — two places independently asserting one fact — as the defect to watch hardest for, and a version literal in `.github/workflows/ci.yml` would be a second, unreconciled owner of a fact `tooling/monorepo-workspace` already owns.

### Decision

The workflow derives the Node version from `.nvmrc` through a shell step and lets `pnpm/setup` read the pnpm version from the root manifest's `packageManager` field on its own. Neither version literal appears in `ci.yml`; `tests/ci-pipeline.test.ts` asserts that neither string is present in the workflow text.

### Options Considered

| Option | Verdict |
|--------|---------|
| Read `.nvmrc` and `packageManager` from the workflow | ✓ Chosen — one owner per version, reached by reference |
| Write `node-version: 22.23.2` into the workflow, guarded by a test comparing it to `.nvmrc` | ✗ Rejected — the test reconciles the copies, but the decision still has two owners |
| Declare `devEngines.runtime` in `package.json` and let the action read it | ✗ Rejected — a third copy of the version alongside `.nvmrc` and `engines.node` |

### Consequences

A version bump in `.nvmrc` or `packageManager` propagates to CI with no workflow edit. The workflow cannot pin a different Node or pnpm version than local development runs, by construction rather than by convention.

## ADR: The coverage gate lives in the package's Vitest config, not in a CI step

**ID:** core-coverage-gate-in-vitest-config
**Plan:** ci-test-tiers
**Status:** Accepted

### Context

Mission § Tech Stack sets a ~90 % coverage target for `packages/core`, and the roadmap records that enforcement was deferred to the CI plan. The gate could live in a CI-only step that runs `--coverage`, or in the package's own test configuration so every caller of its test command enforces the same floor.

### Decision

`packages/core/vitest.config.ts` sets `test.coverage.enabled: true` with `test.coverage.thresholds` at 90 for statements, branches, functions and lines, nested under `test:` where Vitest actually reads coverage configuration. CI needs no coverage-specific step: `pnpm -r --include-workspace-root test` enforces the floor because it runs that config, and so does a developer's local `pnpm --filter @chrysalyst/core test`.

### Options Considered

| Option | Verdict |
|--------|---------|
| `coverage.enabled: true` in `packages/core/vitest.config.ts`, nested under `test:` | ✓ Chosen — one owner for the policy, enforced identically on every call site |
| A dedicated CI step running `pnpm --filter @chrysalyst/core test --coverage` | ✗ Rejected — splits the policy between the config and the workflow; the gate fires only after a pull request opens, and a local `pnpm test` reports success on code CI would reject |
| A `test:coverage` script in the package | ✗ Rejected — the gate applies only when someone remembers to run the second script |

### Consequences

A coverage regression in `packages/core` fails the same way locally and in CI, with no separate coverage step to keep in sync. The nesting under `test:` is load-bearing — a `coverage` block written one level higher is silently ignored by Vitest, so the config's shape itself, not only its numbers, is part of the contract this ADR fixes.

## ADR: Task 6's hosted proof runs on a disposable scratch branch, with every git write assigned to `git-agent` and every cleanup step assigned to a human

**ID:** ci-hosted-proof-scratch-branch
**Plan:** ci-test-tiers
**Status:** Accepted

### Context

C2's and M4's exit criteria required three hosted GitHub Actions runs proving the pipeline fails closed on formatting, on the coverage floor, and on the live-tier guard. The original design pushed a throwaway commit to the feature branch and later "dropped" it, naming no actor. `CLAUDE.md`'s Immer-Regel 4 requires human approval for any push, `/speq:git-discipline` keeps planning and implementation agents read-only on git, and `git-agent`'s operation set (`/speq:git-operations`) has no history-rewrite operation and no close-pull-request or delete-branch operation. Two rounds of adversarial plan review found this gap and then found that the first fix introduced unexecutable steps of its own: `git-agent` was assigned operations it does not have, the `pull_request`-only trigger meant two of three planned pushes would have started no run, and three breakages accumulated on one branch would have masked each other behind the first failing step.

### Decision

The three breakages run on a disposable branch, `ci-test-tiers-failclosed`, branched from `feat/ci-test-tiers` and pushed with its pull request opened before any breakage lands, so each later push arrives as a `synchronize` event on an already-open pull request. Each breakage commit reverts its predecessor in the same commit, so exactly one breakage is present when each run starts. Every git and GitHub write — branch creation, push, pull-request creation — runs through `git-agent` using only operations in its defined set (`create-branch`, `checkout`, `commit`, `push`, `create-pr`); a human authors every file edit and supplies every commit message and pull-request field as a literal parameter, since `git-agent` decides no content. Closing the scratch pull request unmerged and deleting the branch — operations `git-agent` does not have — are done by a human in the GitHub UI. No step rewrites history.

### Options Considered

| Option | Verdict |
|--------|---------|
| Disposable scratch branch, sequenced breakages each reverting its predecessor, `git-agent` restricted to its defined operations, human handles undefined operations | ✓ Chosen — needs no history rewrite, produces three isolated runs, stays inside every actor's defined authority |
| Push a throwaway commit to the feature branch and drop it later | ✗ Rejected — "drop" is a history rewrite no actor in this system may perform |
| Have `git-agent` close the pull request and delete the branch itself | ✗ Rejected — neither operation exists in `git-agent`'s defined set; the agent executes exactly one caller-specified operation per invocation and cannot improvise `gh pr close` or `git push --delete` |
| Push all three breakages before opening the pull request | ✗ Rejected — with `on: pull_request` only, a push to a branch with no open pull request starts no run; the first two pushes would produce nothing |
| Land all three breakages without reverting the previous one | ✗ Rejected — the workflow runs lint → format:check → typecheck → test in order and every step propagates failure, so a surviving earlier breakage would stop each later run at the same step and mask the failure it was meant to prove |

### Consequences

Proving a pipeline fails closed now has a repeatable shape — a scratch branch, one breakage per run, an explicit actor per step — that later pipeline changes needing hosted proof can reuse without re-deriving the ordering constraints. The pattern trades one extra pull request (opened and closed unmerged) for three unambiguous, individually attributable run failures, recorded in `specs/_plans/ci-test-tiers/verification-report.md` § Task 6 as `https://github.com/EmreDuelger/chrysalyst/actions/runs/34701438211`, `.../34701514536`, and `.../34701596270`. It also surfaced a follow-up outside this plan's scope: the pinned `pnpm/setup@v2` release does not recognize `require-lockfile` as an input, so the frozen-lockfile guarantee decision `ci-pipeline-reads-version-pins` names is not yet enforced in practice.

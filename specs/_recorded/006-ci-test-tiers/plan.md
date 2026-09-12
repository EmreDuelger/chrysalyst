# Plan: ci-test-tiers

## Summary

Give the repository its first hosted pipeline: one GitHub Actions workflow that installs, lints, format-checks, typechecks and tests every pull request on a runner with no language model. The same workflow closes M4 by turning `packages/core`'s ~90 % coverage target into an enforced gate and by proving the live test tier stays disabled where no Ollama exists.

## Design

### Context

Every verification claim this project has made so far came from one machine. The closing line of `004-single-question-walking-skeleton` § Verification says so outright: "Because C2 is still open, no runner reproduces any of this: a green checklist is evidence from one machine." Four milestones have shipped against that gap.

The roadmap splits the fix in two, and the split no longer holds. C2 ("Minimale CI", `⬜ offen`) was to land before M1 and deliver install → lint → format:check → typecheck → test with no coverage gate and no tier logic. M4 was to extend that workflow once the first `live`-tagged test existed. C2 was skipped; M1, M2 and M3 shipped anyway, and the live tier arrived in M3. `.github/workflows/` holds only `openwiki-update.yml`, a scheduled documentation job. There is nothing for M4 to extend, so this plan delivers both rows at once.

Three forces shape the design.

**The pipeline must not become a third place where versions are written down.** `.nvmrc` pins Node 22.23.2, the root manifest pins `pnpm@12.3.4`, and `platform/monorepo-workspace` already asserts those two agree with `engines.node`. A workflow that restates either version adds a copy nothing reconciles — the back-door leakage `/speq:design-philosophy` names, where two modules independently assume the same fact. The workflow therefore reads both pins instead of repeating them.

**The coverage gate must fail where the coverage is written, not only where it is measured.** Mission § Tech Stack sets ~90 % for `packages/core` and the roadmap records that "Enforcement kommt mit dem CI-Plan". A gate that lives in the workflow fires once a pull request is open, hours after the code was written. A gate that lives in `packages/core/vitest.config.ts` fires on `pnpm test` in the package, on `pnpm -r --include-workspace-root test` at the root, and in CI, because all three run the same config. One owner, three call sites.

**The tier guard must fail loudly, not by timing out.** M4's exit criterion is that a live test accidentally running in CI fails the run. It technically already would — a live suite against an absent Ollama errors after its 120 s timeout. That is a 2-minute confusing failure, not a guard. The workflow's own environment is what makes the tier disabled, so that is what gets asserted.

- **Goals** — one hosted run per pull request that reproduces the local checklist; a `packages/core` coverage floor that cannot be bypassed by forgetting a flag; a statically enforced guarantee that CI never enables the live tier.
- **Non-Goals** — coverage gates on `packages/server` or `packages/web` (mission § Tech Stack: "Adapter und UI nach Augenmaß, kein projektweiter Zwang"); a matrix across Node versions or operating systems; running the live tier anywhere; caching beyond the pnpm store; publishing, releasing or deploying anything; configuring GitHub branch protection, which is a repository setting and not a file in this repository.

### Decision

#### Architecture

Three artefacts, each owning exactly one decision, plus one guard suite that reads all three.

```
.nvmrc ──────────────┐            (owns: the Node version)
package.json         ├──read──▶ .github/workflows/ci.yml
  packageManager ────┘            (owns: when and in what order checks run)
                                          │
                                          │ runs
                                          ▼
                         pnpm lint · format:check · typecheck ·
                         pnpm -r --include-workspace-root test
                                          │
                                          ├─▶ tests/workspace.test.ts   (existing tier guard)
                                          └─▶ packages/core/vitest.config.ts
                                                (owns: the coverage floor)

tests/ci-pipeline.test.ts ──asserts──▶ ci.yml shape + core coverage config
```

`tests/ci-pipeline.test.ts` is a new root-suite file beside the existing `tests/workspace.test.ts`. It is separate because it changes for a different reason: `workspace.test.ts` changes when the workspace's package layout changes, `ci-pipeline.test.ts` when the pipeline's shape does.

#### The workflow

Shape, not a transcript. The two `uses:` SHAs are resolved at implementation time (§ Implementation Tasks, task 2).

```yaml
name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v<n>
      - id: node
        run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"
      - uses: pnpm/setup@<sha> # v2
        with:
          runtime: node@${{ steps.node.outputs.version }}
          cache: true
          require-lockfile: true
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm -r --include-workspace-root test
```

`pnpm/setup@v2` installs the pnpm release binary, reads the version from `packageManager` when the `version` input is omitted, installs the requested Node runtime, and runs `pnpm install` itself — `require-lockfile: true` makes that install `--frozen-lockfile`. It therefore replaces `actions/setup-node`, a `corepack enable` step and an explicit install step, and it is the reason no pnpm version appears in the workflow. The `.nvmrc` value reaches it through a shell step because the action reads `devEngines.runtime` from `package.json`, which this repository does not declare; adding one would create the third copy § Context rules out.

#### The coverage gate

```ts
// packages/core/vitest.config.ts — inside defineConfig({ … })
test: {
  typecheck: { enabled: true },
  coverage: {
    provider: 'v8',
    enabled: true,
    include: ['src/**/*.ts'],
    exclude: ['**/*.test-d.ts'],
    thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
}
```

The nesting is load-bearing. Vitest reads coverage only at `test.coverage`; a `coverage` block written one level up is ignored in silence — no coverage table, no threshold check, exit 0 — while an importing test still sees `coverage.enabled === true`. That misplacement disables the gate and satisfies a naive guard at the same time, so task 1 asserts the anchor before the policy.

Every line of that block was measured against the current tree, not assumed:

| Configuration | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Today (`--coverage`, no `include`) | 97.76 % | 97.5 % | 100 % | 97.76 % |
| `include: ['src/**/*.ts']` alone | 64.85 % | 97.5 % | 54.16 % | 65.5 % |
| `include` + `exclude: ['**/*.test-d.ts']` | 97.76 % | 97.5 % | 100 % | 97.76 % |
| `include` + `exclude`, plus one untested `src/` module | 95.62 % | 92.85 % | 96.29 % | 95.62 % |
| Today's default, plus that same untested module | 97.76 % | 97.5 % | 100 % | 97.76 % |

Row two is why `exclude` is needed: Vitest 5 auto-excludes files matching `test.include` but not `state.test-d.ts` and `ports.test-d.ts`, which are type tests and execute nothing. `coverageConfigDefaults.exclude` is `[]` in Vitest 5, so the explicit `exclude` overrides no default.

Rows four and five are why `include` is needed. Without it the v8 provider reports only files a test imported, so a module nobody tests is invisible and the gate reads 97.76 % over code it never saw. With it, one untested module costs 2.14 points. A 90 % gate that cannot see untested code is not a gate.

`enabled: true` is what makes the floor unbypassable: it is the config form of `--coverage`, so `pnpm --filter @chrysalyst/core test`, `pnpm -r --include-workspace-root test` and the CI step all check the thresholds without anyone passing a flag. A breach exits 1 — verified against the current tree with `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99`, which printed `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exited 1. The command carries no `--` separator: pnpm 12 swallows it and the flag never reaches Vitest, which then exits 0 with no coverage table at all.

The floor is 90 flat on all four metrics, the literal reading of mission § Tech Stack's "~90 %". Current headroom is 7.76, 7.5, 10 and 7.76 points.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Single source of truth, read not restated | `.nvmrc` and `packageManager` reach the workflow by reference | A restated version is a second owner of one decision; nothing would reconcile the two |
| Policy at the definition site, not the call site | Coverage thresholds in `packages/core/vitest.config.ts`, not in a CI flag | The gate fires on every path that runs the tests, including the developer's |
| Executable convention | `tests/ci-pipeline.test.ts` asserts the workflow's shape | SHA pinning, `continue-on-error` and the tier flag are conventions today; a test makes them invariants |
| Fail-closed guard | Every assertion first proves its anchor exists | A text-scanning guard whose anchor disappears passes silently; a vacuous guard is worse than none |

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| One plan delivers C2 and M4 | C2 as a `CLAUDE.md` config shortcut, then M4 as a plan | The workflow C2 would produce is the workflow M4 edits. Two passes over one file, and the shortcut path skips the adversarial review on the artefact that guards every later milestone |
| `pull_request` only | `push` + `pull_request`; `push` to `main` as well | A pull request's own branch pushes would start a second, identical run of the same commit. `main` is protected by the pull request that reaches it |
| `pnpm/setup@v2` | `actions/setup-node` + `corepack enable` + explicit `pnpm install` | One step instead of three, and it reads `packageManager` itself, so no pnpm version enters the workflow. Fallback named in task 2 if the action does not resolve |
| Node version read from `.nvmrc` at run time | Literal in the workflow; `devEngines.runtime` in `package.json` | Both create a copy of a version `platform/monorepo-workspace` already pins and reconciles |
| Coverage enforced in `packages/core/vitest.config.ts` with `enabled: true` | A dedicated CI step running `--coverage`; a `test:coverage` script | A CI-only gate is discovered in review, not while writing the code, and splits the policy across two files |
| Explicit `include: ['src/**/*.ts']` | Vitest's default file set | Measured: without it an untested module leaves the number unchanged at 97.76 %. The gate would be blind to the exact regression it exists to catch |
| 90 flat on all four metrics | 97 (ratchet to today's measurement); 90 on lines only | A ratchet turns every unrelated refactor into a threshold edit. Four metrics because functions and branches catch what line coverage does not |
| Text-scanning guard, no YAML parser | Add `yaml` to the catalog and parse `ci.yml` | `tests/workspace.test.ts` already hand-scans `pnpm-workspace.yaml` and evaluates guard expressions with `node:vm` rather than take a dependency. The properties asserted are line-shaped. The vacuity risk this carries is answered by the fail-closed pattern above, not by a parser |
| Guard the workflow's environment, not the test run's output | Assert on the CI log that N suites reported skipped | Parsing a runner's log is brittle and only observable after the run. The environment is the cause; `tests/workspace.test.ts` already guarantees the effect |

## Features

| Feature | Status | Spec |
|---------|--------|------|
| ci-pipeline | NEW | `specs/_plans/ci-test-tiers/platform/ci-pipeline/spec.md` |
| monorepo-workspace | CHANGED | `specs/_plans/ci-test-tiers/platform/monorepo-workspace/spec.md` |

`monorepo-workspace` changes for one reason: the pipeline runs `pnpm format:check`, and the existing root-script scenario requires only `dev`, `lint`, `format` and `typecheck`. The script exists, but nothing guarantees it. Adding it to the required set closes a back-door dependency of the workflow on a fact the spec did not hold.

## Impact

Contributors gain a required-looking check on every pull request and lose the ability to merge a branch that fails lint, formatting, types, tests or the `packages/core` coverage floor — assuming a human enables branch protection, which this plan cannot do from a file. Local runs of `pnpm --filter @chrysalyst/core test` now print a coverage report and fail below 90 % on any of the four metrics; no command changes, and today's headroom is at least 7.5 points on every metric.

Nothing breaks. No published interface, on-disk format or runtime behaviour changes; `packages/server` and `packages/web` are untouched.

Two follow-ups fall outside this plan's files. A human must mark the `check` job required in the repository's branch-protection settings, or the pipeline reports without blocking. And `/speq:record` must move **two** roadmap rows to `✅ erledigt` — C2 ("Minimale CI") and M4 ("CI-Test-Stufen + `core`-Coverage-Gate") — because this plan delivers C2's scope as well as its own.

Those two rows are the exit criteria task 6 exists to prove. `/speq:record` MUST NOT run until task 6's three run URLs are recorded in the verification report.

## Dependencies

| Dependency | Role | Note |
|---|---|---|
| `actions/checkout` | Places the repository on the runner | Pinned to a SHA with a version comment, matching `openwiki-update.yml` |
| `pnpm/setup@v2` | Installs pnpm and Node, then runs `pnpm install --frozen-lockfile` | Requires pnpm ≥ 11; this repository declares `pnpm@12.3.4`. Supersedes `pnpm/action-setup`, which is for pnpm ≤ 10 |

No package is added to the workspace. The lockfile MUST be unchanged by this plan.

## Migration

None. No existing file's meaning changes; `.github/workflows/openwiki-update.yml` keeps its `continue-on-error` step and its `.prettierignore` entry, both of which the new scenarios leave untouched by scoping the fail-closed and permissions checks to `ci.yml`.

## Implementation Tasks

Tasks 1 and 4 write failing tests first and are run red before the task that turns them green. `.github/workflows/ci.yml` is **not** in `.prettierignore` — unlike the OpenWiki workflow — so `pnpm format:check` covers it and the file must be Prettier-formatted before task 6.

1. **Red — the pipeline guard suite.** Write `tests/ci-pipeline.test.ts`, picked up by the root `vitest.config.ts` `include: ['tests/**/*.test.ts']`. Cover all eight `ci-pipeline` scenarios by reading `.github/workflows/ci.yml`, every file under `.github/workflows/`, `.nvmrc`, the root manifest, and the resolved default export of `packages/core/vitest.config.ts`. Every assertion MUST be fail-closed: before asserting a property, assert the anchor it depends on exists, so a restructured workflow breaks the test instead of silently satisfying it. Concretely — assert the file declares at least one `uses:` before asserting every `uses:` names a 40-hex SHA with a trailing comment; assert a step runs the workspace test command before asserting the four check commands appear in order; assert a `permissions:` block exists before asserting it grants no write; assert the workflow text mentions `.nvmrc` and contains neither the literal `.nvmrc` version string nor the pnpm version from `packageManager`; assert no line assigns `CHRYSALYST_LIVE_LLM` a non-empty value; assert no line declares `continue-on-error` in `ci.yml` while the OpenWiki workflow, which does declare one, is out of that check's scope. Three assertions carry the install clauses and MUST be written as an explicit either-or over the two workflow shapes task 2 may produce, because their only textual anchor is action-specific: assert `ci.yml` contains either a `pnpm/setup` step carrying `require-lockfile: true` or an explicit `run: pnpm install --frozen-lockfile` step; assert that step's line number precedes the first `run: pnpm lint` line; assert no `version:` input pins pnpm anywhere in the file. For the coverage scenario, import the core config and assert the anchor first — `config.test` MUST be an object and `config.coverage` MUST be `undefined` — so a `coverage` block written one level too high fails the suite instead of satisfying it. Then assert `config.test.coverage.enabled === true`, that `config.test.coverage.include` matches every `.ts` file under `src`, that `config.test.coverage.exclude` covers `**/*.test-d.ts`, and that all four `config.test.coverage.thresholds` are at least 90. Run red: the suite fails because neither `ci.yml` nor the thresholds exist. [expert]
2. **Green — the CI workflow.** Write `.github/workflows/ci.yml` in the shape § The workflow gives. Resolve each action's release SHA at implementation time rather than copying one from memory — `gh api repos/actions/checkout/commits/<tag> --jq .sha` and the same for `pnpm/setup` — and append the ` # v<n>` comment the pinning convention and scenario four require. If `pnpm/setup@v2` does not resolve, fall back to `actions/checkout` + `actions/setup-node` with `node-version-file: .nvmrc` + `corepack enable` + `pnpm install --frozen-lockfile`. The guard suite encodes both shapes as an either-or on the three install clauses — a `pnpm/setup` step with `require-lockfile: true` **or** an explicit `run: pnpm install --frozen-lockfile` step, positioned before the first `run: pnpm lint` line, with no `version:` input pinning pnpm — so the fallback satisfies the suite through its second branch, not by accident. Every other assertion is shape-independent. Run `pnpm format` over the new file, then the guard suite: everything but the coverage assertions turns green.
3. **Green — core's coverage gate.** Replace the `test.coverage` block of `packages/core/vitest.config.ts` with the one § The coverage gate gives, keeping `test.typecheck.enabled` as it stands and keeping the block nested under `test:` — a top-level `coverage:` key is ignored by Vitest. Run `pnpm --filter @chrysalyst/core test` with no flag and confirm a coverage table prints and the four metrics read 97.76 / 97.5 / 100 / 97.76. The guard suite's coverage assertions turn green.
4. **Red, then green — `format:check` in the root script set.** Extend `tests/workspace.test.ts`'s `root exposes the mission scripts without a build prerequisite` to require `format:check` alongside `dev`, `test`, `typecheck`, `lint` and `format`, and to assert the script does not rewrite files. The script already exists, so demonstrate red by temporarily deleting `format:check` from the root manifest, running the test, then restoring it — do not skip the red step on the grounds that the assertion passes.
5. **Prove the gate is not blind.** Add one untested module under `packages/core/src`, run `pnpm --filter @chrysalyst/core test`, and record that the four metrics fall to 95.62 / 92.85 / 96.29 / 95.62. Lower one threshold to 97 temporarily and confirm the run exits 1 naming the metric. Restore both the threshold and the tree, and confirm `git status` is clean. The two figures go in the verification report.
6. **Prove the pipeline fails closed on a real run.** This task is **not** an `implementer-agent` task. It runs only after the human approves the push. Every git and GitHub write in it is executed by `git-agent` and stays inside the operation set `/speq:git-operations` defines — here `create-branch`, `checkout`, `commit`, `push` and `create-pr`. That set holds no close-pull-request and no delete-branch operation, so the **human** performs both in the GitHub UI. No step rewrites history, because no actor in this system may. The **human** authors every file edit below, because `git-agent` decides no content; each commit message and pull-request field is a literal the human hands `git-agent` as a parameter.

   Two ordering constraints govern the sequence. Both follow from decisions this plan already made, and violating either yields fewer than three usable runs.

   - **A push to a branch with no open pull request starts no run.** The trigger is `pull_request` only (decision [3]), so the scratch pull request MUST be open before the first breakage is pushed. Each later push then arrives as a `synchronize` event on an open pull request and starts its own run.
   - **Each breakage MUST be the only breakage present when its run starts.** The workflow runs lint → format:check → typecheck → test in that order and every step propagates failure, so a surviving earlier breakage stops the run before the step the next breakage targets. Every breakage commit after the first therefore reverts its predecessor in the same commit.

   Sequence:

   1. **Human** approves pushing the feature branch `feat/ci-test-tiers`. **`git-agent`** runs `push`, then `create-pr` with `base: main`.
   2. **Human** reads the `check` job and confirms it is green with both `*.live.test.ts` files reported as skipped rather than run. Records the run URL.
   3. **Human** approves the scratch branch. **`git-agent`** runs `create-branch` with `branch: ci-test-tiers-failclosed` and `base: feat/ci-test-tiers`, then `push`, then `create-pr` with `base: feat/ci-test-tiers`, `draft: false`, `title: ci: prove the pipeline fails closed (scratch — do not merge)` and `body: Scratch branch for ci-test-tiers task 6. Three deliberate breakages, each commit reverting the previous one. Close unmerged; the evidence is the three run URLs.` The branch is still identical to its base, so this pull request's own `opened` run goes green. That run is expected and is not one of the three.
   4. **Breakage 1 — formatting.** **Human** re-indents one block in `packages/core/src/interview/single-turn-interview.ts` so Prettier would rewrite it. **`git-agent`** runs `commit` with `paths: packages/core/src/interview/single-turn-interview.ts` and `message: ci: break formatting to prove format:check fails the run`, then `push`. **Human** waits for the `synchronize` run and confirms it fails at the `pnpm format:check` step and at no earlier one. Records the run URL.
   5. **Breakage 2 — coverage floor.** **Human** reverts breakage 1 by running `pnpm format` over that file and, in the same working tree, raises `thresholds.lines` to 100 in `packages/core/vitest.config.ts`, keeping the file Prettier-formatted. **`git-agent`** runs `commit` with `paths: packages/core/src/interview/single-turn-interview.ts packages/core/vitest.config.ts` and `message: ci: revert the formatting breakage, raise the lines threshold to 100`, then `push`. **Human** waits for the run and confirms it clears lint, format:check and typecheck, then fails at the `pnpm -r --include-workspace-root test` step with the threshold error naming lines. Records the run URL.
   6. **Breakage 3 — live tier in CI.** **Human** reverts breakage 2 by returning `thresholds.lines` to 90 and, in the same working tree, adds `env: CHRYSALYST_LIVE_LLM: '1'` to the `check` job in `.github/workflows/ci.yml`, Prettier-formatted so `format:check` still passes. **`git-agent`** runs `commit` with `paths: packages/core/vitest.config.ts .github/workflows/ci.yml` and `message: ci: revert the coverage breakage, force the live tier on in CI`, then `push`. **Human** waits for the run and confirms it clears lint, format:check and typecheck, then fails inside the guard suite `tests/ci-pipeline.test.ts` on its `CHRYSALYST_LIVE_LLM` assertion — the fast named failure decision [6] designed for, not only a 120-second Ollama timeout in the live suites. Records the run URL.
   7. **Human** closes the `ci-test-tiers-failclosed` pull request unmerged and deletes the branch in the GitHub UI. **`git-agent`** runs `checkout` with `target: feat/ci-test-tiers` to return the workspace to the feature branch. The feature branch carried no breakage at any point, so nothing has to be dropped or rebased away.

   Steps 4 to 6 produce the three run URLs that are C2's and M4's exit criteria. They belong in the verification report, and **`/speq:record` MUST NOT run until all three are recorded there.**

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1, 4 |
| Group B | 2, 3 |
| Group C | 5 |
| Group D | 6 |

Sequential dependencies:

- Group A → Group B — tasks 2 and 3 turn Group A's red assertions green
- Group B → Group C — task 5 measures the configuration task 3 writes
- Group C → Group D — task 6 is the hosted run of everything above

Group D is not dispatched to an implementer. Task 6 needs a human approval and `git-agent` writes, so the orchestrator stops after Group C and hands task 6 to the human.

Tasks 1 and 4 touch different files (`tests/ci-pipeline.test.ts`, `tests/workspace.test.ts`) and tasks 2 and 3 touch different files (`.github/workflows/ci.yml`, `packages/core/vitest.config.ts`), so neither pair contends.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| — | — | None. This plan adds a workflow, a test file and a config block, and edits one existing test. It replaces no code path, so nothing becomes unreachable |

One entry is deliberately *not* removal: `.prettierignore` keeps its `.github/workflows/openwiki-update.yml` line. That file is vendored by the OpenWiki integration and is rewritten by its own workflow; `ci.yml` is hand-written and stays formatted.

## Verification

### Scenario Coverage

Path abbreviation: `ci.test.ts` is `tests/ci-pipeline.test.ts`.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| A pull request starts the pipeline | Unit | `ci.test.ts` (task 1) | `runs on pull_request and not on push` |
| The pipeline runs the mission's checks in order | Unit | `ci.test.ts` (task 1) | `installs before it checks, then lints, format-checks, typechecks and tests the workspace root in order` |
| The pipeline takes its toolchain versions from the repository's pins | Unit | `ci.test.ts` (task 1) | `reads .nvmrc and restates neither the node nor the pnpm version, and installs against a frozen lockfile` |
| Every workflow action is pinned to a commit | Unit | `ci.test.ts` (task 1) | `every uses in .github/workflows names a 40-hex sha with a version comment` |
| The runner leaves the live tier disabled | Unit | `ci.test.ts` (task 1) | `sets CHRYSALYST_LIVE_LLM nowhere in the workflow` |
| A broken check fails the run | Unit | `ci.test.ts` (task 1) | `declares no continue-on-error on any ci.yml step` |
| The pipeline holds no write access | Unit | `ci.test.ts` (task 1) | `declares contents: read and grants no write permission` |
| Core coverage below ninety percent fails the run | Unit | `ci.test.ts` (task 1) | `core collects coverage over all of src without a flag and floors all four metrics at ninety` |
| Root scripts expose the mission command set (`monorepo-workspace`, changed) | Unit | `tests/workspace.test.ts` (task 4) | `root exposes the mission scripts without a build prerequisite` — the existing test, extended with `format:check` |

Every scenario is a unit test, which is the exception `/speq:planning` allows and this feature is the clean case for it. Each assertion reads a static artefact — a workflow file, a manifest, `.nvmrc`, a resolved config object — and computes over its contents. None performs I/O against a service, starts a process or depends on order. The behaviour these files *produce* cannot be asserted from inside the suite at all: only a real runner can prove a pull request goes green, which is why § Manual Testing carries the hosted runs and why task 6, not a test, is what closes M4's and C2's exit criteria.

Two scenarios have a clause no static test can reach. "The runner leaves the live tier disabled" asserts the workflow sets no flag; that the live suites then *report as skipped* is already guaranteed by `monorepo-workspace`'s unedited `An empty live-tier flag leaves the tier disabled` and `Live-tier tests are gated by an environment flag`, whose tests at `tests/workspace.test.ts:353` and `:367` evaluate every guard expression against unset, empty and `1`. Those two tests MUST stay green through this plan without an edit — they are the half of the guarantee this feature depends on rather than duplicates. "Core coverage below ninety percent fails the run" asserts the configuration; that a breach exits 1 is Vitest's own behaviour, evidenced in § The coverage gate and re-evidenced by task 5.

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| ci-pipeline | `pnpm --filter @chrysalyst/core test` | A coverage table prints with no flag passed. Statements 97.76 %, Branches 97.5 %, Functions 100 %, Lines 97.76 %; 47 tests pass; exit 0 |
| ci-pipeline | `printf 'export function u(a: number): number {\n  if (a > 1) {\n    return a * 2;\n  }\n  return a + 1;\n}\n' > packages/core/src/probe.ts && pnpm --filter @chrysalyst/core test; rm packages/core/src/probe.ts` | 95.62 / 92.85 / 96.29 / 95.62 — the untested module is visible to the gate. Exit 0, because 95.62 still clears 90. `git status` clean after the removal |
| ci-pipeline | `pnpm --filter @chrysalyst/core test --coverage --coverage.thresholds.lines=99` | `ERROR: Coverage for lines (97.76%) does not meet global threshold (99%)` and exit 1. No `--` separator: pnpm 12 swallows it, the flag never reaches Vitest, and the run exits 0 |
| ci-pipeline | `pnpm -r --include-workspace-root test` | 0 failures across four suites. Both `*.live.test.ts` files report as skipped. Core's coverage table prints and its gate is checked as part of this one command |
| ci-pipeline | `pnpm format:check` | No changes reported, including for the new `.github/workflows/ci.yml`, which `.prettierignore` does not exclude |
| ci-pipeline | `grep -c 'uses:' .github/workflows/*.yml && grep -oE 'uses: [^@]+@[0-9a-f]{40} # v[0-9]+' .github/workflows/*.yml` | Every `uses:` line in both workflows is matched by the SHA-plus-comment pattern; the two counts are equal |
| ci-pipeline | Open the pull request for this branch | The `check` job is green. Its Test step's log shows both live suites skipped, not run, and no `CHRYSALYST_LIVE_LLM` in the job's environment. Record the run URL and the wall-clock duration |
| ci-pipeline | With the `ci-test-tiers-failclosed` pull request **already open** against `feat/ci-test-tiers`, re-indent one block in `packages/core/src/interview/single-turn-interview.ts` and push | The `synchronize` run fails at the `pnpm format:check` step and at no earlier one. Record the run URL |
| ci-pipeline | On the same pull request, in one commit revert breakage 1 with `pnpm format` **and** raise `thresholds.lines` to 100, then push | With the previous breakage reverted, the run clears lint, format:check and typecheck, then fails at the `pnpm -r --include-workspace-root test` step with the threshold error naming lines, and at no earlier one. Record the run URL — this is M4's "absichtlicher `core`-Coverage-Abfall" criterion |
| ci-pipeline | On the same pull request, in one commit revert breakage 2 by returning `thresholds.lines` to 90 **and** add `env: CHRYSALYST_LIVE_LLM: '1'` to the `check` job, then push | With the previous breakage reverted, the run clears lint, format:check and typecheck, then fails inside `tests/ci-pipeline.test.ts` on its `CHRYSALYST_LIVE_LLM` assertion, and at no earlier one — the fast named failure, not only a 120-second Ollama timeout. Record the run URL — this is M4's "versehentlich in CI laufender `live`-Test" criterion |
| monorepo-workspace | `pnpm test` at the repository root | The workspace suite passes, including the extended root-script test and the two unedited live-tier tests |

The three breakage rows run on the `ci-test-tiers-failclosed` scratch branch. `git-agent` opens that branch's pull request against `feat/ci-test-tiers` **before** the first breakage is pushed, because a push to a branch with no open pull request starts no run under this plan's `pull_request`-only trigger. Each breakage commit reverts its predecessor, because the workflow's ordered steps let a surviving earlier breakage mask every later one. Once the three runs are recorded, the **human** closes that pull request unmerged and deletes the branch in the GitHub UI — `git-agent` has neither operation — before the feature pull request is marked ready. The feature branch never carries a breakage, so no commit has to be dropped. Those three run URLs are the only evidence that the pipeline fails closed; a green run alone does not supply it, and `/speq:record` MUST NOT run until all three are recorded in the verification report.

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; `pnpm-lock.yaml` unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; both `*.live.test.ts` files report as skipped; core's coverage gate is checked and clears 90 on all four metrics |
| Live tier | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 0 failures with both live suites running — proof this plan disabled the tier in CI only, not everywhere |
| Coverage | `pnpm -r test --coverage` | A report per package; `packages/core` at 97.76 / 97.5 / 100 / 97.76 and above its enforced 90 floor |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | 0 errors, 0 warnings, including for the new `tests/ci-pipeline.test.ts`, which `eslint.config.js` already admits through `allowDefaultProject: ['tests/*.ts']` |
| Format | `pnpm format:check` | No changes reported |
| Hosted | The pull request's `check` job | Green, on a runner with no Ollama — the first time any row above is reproduced off this machine |

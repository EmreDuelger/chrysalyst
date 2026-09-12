# Code Review Findings: ci-test-tiers

## Summary

- Files reviewed: 4
- Total findings: 5 (standard: 4, expert: 1)

Verification run before review (all green, tree clean afterwards):

- `pnpm test` — 2 files, 21 tests passed
- `pnpm --filter @chrysalyst/core test` — 47 tests, coverage 97.76 / 97.5 / 100 / 97.76 with no flag
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` — exit 0
- Probe module under `packages/core/src` — coverage falls to 95.62 / 92.85 / 96.29 / 95.62, matching plan § The coverage gate row 4 exactly; the gate is not blind
- Both `uses:` SHAs resolve to the real tags: `gh api repos/actions/checkout/commits/v4` → `11d5960a326750d5838078e36cf38b85af677262`, `gh api repos/pnpm/setup/commits/v2` → `84cb39b217b10273981911c288cd62326dc7c6d2`
- `pnpm/setup@v2` `action.yml` confirms `runtime`, `cache` and `require-lockfile` are real inputs and that `install` defaults to `true`, so the workflow does install

`packages/core/vitest.config.ts` and `.github/workflows/ci.yml` are clean — no findings against either.

Every finding below is a fail-open hole in a guard whose stated design contract (plan § Patterns, "Fail-closed guard") is that a restructured artefact breaks the test rather than satisfying it silently. Three of the four were reproduced against the real tree.

## Standard fixes

### tests/ci-pipeline.test.ts

#### [MISSING_BOUNDARY_TEST] The continue-on-error guard misses the dash-prefixed step form

- Location: line 490
- Issue: the filter is `/^\s*continue-on-error:/`, which requires the key to be the first token on its line. When `continue-on-error` is the first key of a step it is written as a sequence entry — `- continue-on-error: true` — and the regex does not match, because after `^\s*` it meets `-`, not `c`. Reproduced: inserting `- continue-on-error: true` above `run: pnpm lint` in `.github/workflows/ci.yml` left all 8 guard tests green (`npx vitest run tests/ci-pipeline.test.ts` → 8 passed). The suite therefore greenlights a workflow that hides a failed lint step, which is exactly what spec scenario "A broken check fails the run" forbids. `RUN_LINE` (line 31) and `USES_LINE` (line 32) in this same file already carry the `(?:-\s+)?` prefix for this reason, so the omission is an inconsistency rather than a deliberate narrowing.
- Fix: In `tests/ci-pipeline.test.ts`, add a module-scope constant `const CONTINUE_ON_ERROR_KEY = /^\s*(?:-\s+)?continue-on-error:/;` beside the other regex constants (after `LIVE_FLAG_ASSIGNMENT`, line 38) and use it in place of the inline `/^\s*continue-on-error:/` literal inside the `declares no continue-on-error on any ci.yml step` test. Prove the fix: temporarily insert `- continue-on-error: true` as the first key of the `pnpm lint` step in `.github/workflows/ci.yml`, run `npx vitest run tests/ci-pipeline.test.ts`, confirm that test now fails, then restore `ci.yml` and confirm `git status --porcelain` no longer lists it as modified.

#### [INFORMATION_LEAKAGE] The live-tier flag name has two owners inside the guard

- Location: lines 16 and 38
- Issue: `LIVE_TIER_FLAG = 'CHRYSALYST_LIVE_LLM'` names the flag, but `LIVE_FLAG_ASSIGNMENT = /CHRYSALYST_LIVE_LLM\s*[:=]\s*(.*)$/` hardcodes a second copy of the same string. The constant is used only inside the failure message; the literal inside the regex is what actually decides whether the test passes. The flag name is a decision `packages/core` and `tests/workspace.test.ts` also depend on, so a rename that updates the obvious named constant and misses the regex leaves the guard hunting for a name nothing uses any more — it passes on every workflow, including one that sets the new flag. That is the vacuous guard plan § Patterns calls "worse than none".
- Fix: In `tests/ci-pipeline.test.ts`, build the regex from the constant instead of restating it: replace the `LIVE_FLAG_ASSIGNMENT` declaration on line 38 with `const LIVE_FLAG_ASSIGNMENT = new RegExp(`${LIVE_TIER_FLAG}\\s*[:=]\\s*(.*)$`);` so `LIVE_TIER_FLAG` is the single owner of the name. Keep `liveFlagAssignments` unchanged. Re-run `npx vitest run tests/ci-pipeline.test.ts` and confirm 8 tests still pass.

#### [SENTINEL_ERROR_VALUE] Absent version pins are reported as an empty string

- Location: lines 268-278
- Issue: `pinnedPnpmVersion` returns `''` when `packageManager` is missing or does not match `^pnpm@(\S+)$`, and `pinnedNodeVersion` returns `''` when `.nvmrc` is empty. An empty string is a stand-in for "no value was found", which `/speq:code-guardrails` § Errors rules out — absence must be the language's optional type. The risk is concrete rather than stylistic: the empty string flows into `expect(text).not.toContain(pnpmVersion)` on line 427, and `not.toContain('')` is an assertion about every possible string, so the guard's meaning silently changes from "the workflow restates no pnpm version" to "the workflow has no text at all". `frozenInstallLine` on line 245 already models absence correctly as `number | undefined`, so this is an inconsistency inside one file.
- Fix: In `tests/ci-pipeline.test.ts`, change `pinnedNodeVersion` and `pinnedPnpmVersion` to return `string | undefined` — return `undefined` instead of `''` when `.nvmrc` trims to empty or the `packageManager` match fails. In the `reads .nvmrc and restates neither the node nor the pnpm version, and installs against a frozen lockfile` test, assert `expect(nodeVersion, ...).toBeDefined()` and `expect(pnpmVersion, ...).toBeDefined()` before the two existing `toMatch` assertions, then pass the narrowed values to the `not.toContain` assertions. Re-run `npx vitest run tests/ci-pipeline.test.ts` and confirm 8 tests still pass.

### tests/workspace.test.ts

#### [MISSING_BOUNDARY_TEST] The format:check guard checks only the long rewrite flag and never that the script checks

- Location: lines 302-305
- Issue: the assertion is `expect(scripts['format:check']).not.toContain('--write')`, which covers one spelling of one half of the spec clause. The spec delta (`specs/_plans/ci-test-tiers/platform/monorepo-workspace/spec.md:20`) requires that `format:check` "MUST report a formatting violation without rewriting a file". Two scripts satisfy the guard and violate the clause. Reproduced: setting the root `format:check` to `prettier -w .` and running `npx vitest run tests/workspace.test.ts -t 'root exposes the mission scripts'` passed — Prettier's short rewrite flag is invisible to a `--write` substring check. The second case is worse and untested: `prettier .` contains no `--write`, passes the guard, prints to stdout and exits 0 on badly formatted input, which turns the pipeline's `pnpm format:check` step into a permanent no-op while this test stays green.
- Fix: In `tests/workspace.test.ts`, inside `root exposes the mission scripts without a build prerequisite`, replace the single `not.toContain('--write')` assertion with three assertions on `scripts['format:check']`: assert it matches `/(?:^|\s)(?:--check|-c)(?:\s|$)/` with the message `format:check must report a formatting violation rather than exit 0 on unformatted input`; assert it does not match `/(?:^|\s)--write(?:\s|$)/`; assert it does not match `/(?:^|\s)-\w*w/` with the message `format:check must not rewrite files on a runner whose working tree is discarded`. Prove each: temporarily set the root `format:check` script to `prettier .`, then to `prettier -w .`, running `npx vitest run tests/workspace.test.ts -t 'root exposes the mission scripts'` after each and confirming it fails both times; restore `package.json` to `prettier --check .` and confirm `git diff --stat package.json` is empty and the test passes.

## Expert fixes

### tests/ci-pipeline.test.ts

#### [MISSING_BOUNDARY_TEST] A job-level inline permissions grant escapes the write check

- Location: lines 496-524
- Issue: the test proves the *top-level* `permissions:` block is not inline (`expect(permissions.inline).toBe('')`, line 503), then collects grants from every `permissions:` block at any indent via `blocksNamed(...).flatMap(directChildEntries)`. The inline check and the grant sweep cover different sets, and a job-level inline grant falls between them: for `permissions: write-all` written inside `jobs.check`, `blocksNamed` records `inline: 'write-all'` and a body of `[]`, because the next line (`runs-on:`) sits at the same indent and terminates the block. `directChildEntries([])` returns `[]`, so `write-all` never reaches the `access.includes('write')` filter, and the inline assertion never sees it because it only inspects the indent-0 block. Reproduced: adding `permissions: write-all` under `check:` in `.github/workflows/ci.yml` left all 8 guard tests green. Spec scenario "The pipeline holds no write access" says "the workflow MUST NOT grant any write permission" without restricting that to workflow scope, and a job-level grant is the form that actually reaches a step.
- Fix: In `tests/ci-pipeline.test.ts`, rework `declares contents: read and grants no write permission` so the inline check covers every `permissions:` block rather than only the top-level one. Bind `const permissionBlocks = blocksNamed(lines, PERMISSIONS_KEY);` once; keep `declaredBlock(topLevelBlock(lines, PERMISSIONS_KEY), ...)` as the anchor proving the workflow declares a workflow-scope block and that `grants` is non-empty; then assert `expect(permissionBlocks.filter((block) => block.inline !== '').map((block) => `${block.number.toString()}: ${block.inline}`), `${CI_WORKFLOW} permissions must name each scope rather than grant them wholesale, at workflow and job scope alike`).toEqual([])`; derive `grants` from `permissionBlocks` so both checks read the same set. Prove the fix against all three shapes: add `permissions: write-all` under `check:` in `.github/workflows/ci.yml` and confirm the test fails; replace it with a block-form `permissions:` carrying `contents: write` under `check:` and confirm it still fails; restore `ci.yml`, run `npx vitest run tests/ci-pipeline.test.ts`, confirm 8 tests pass and `git status --porcelain` no longer lists `ci.yml` as modified.

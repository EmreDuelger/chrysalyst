# Feature: ci_pipeline

Gives every pull request one hosted run that proves the workspace lints, formats, typechecks and tests on a clean machine without a language model, and that `packages/core` has not fallen below the mission's coverage target.

## Background

The pipeline is a single GitHub Actions workflow at `.github/workflows/ci.yml`. It runs one job on a runner that has no Ollama, no model weights and no SearXNG instance, so only the hermetic default test tier can pass there. The workflow restates no toolchain version: the Node version comes from `.nvmrc` and the pnpm version from the root manifest's `packageManager` field, both of which `platform/monorepo-workspace` already pins. `.github/workflows/openwiki-update.yml` is a separate, unrelated documentation workflow and is governed by this feature only where a scenario names every workflow.

## Scenarios

### Scenario: A pull request starts the pipeline

* *GIVEN* the CI workflow
* *WHEN* its trigger block is inspected
* *THEN* the workflow MUST run on `pull_request`
* *AND* the workflow MUST NOT run on `push`, so a branch push and the pull request it belongs to do not each start a run

### Scenario: The pipeline runs the mission's checks in order

* *GIVEN* the CI workflow's job
* *WHEN* its steps are read in order
* *THEN* the workflow MUST complete dependency installation in a step that precedes the first check step, whether that step installs explicitly or through an action that installs as part of its own work
* *AND* the job MUST then run lint, format check, typecheck and the workspace test command, in that order
* *AND* the test command MUST include the workspace root, so the repository-level suite runs alongside the package suites

### Scenario: The pipeline takes its toolchain versions from the repository's pins

* *GIVEN* `.nvmrc`, the `packageManager` field of the root manifest, and the CI workflow
* *WHEN* the workflow's toolchain setup is inspected
* *THEN* the workflow MUST derive the Node version from `.nvmrc` rather than restate it
* *AND* the workflow MUST derive the pnpm version from the `packageManager` field rather than restate it
* *AND* the install MUST fail rather than rewrite `pnpm-lock.yaml` when the lockfile does not describe the declared dependencies

### Scenario: Every workflow action is pinned to a commit

* *GIVEN* every `uses:` reference in `.github/workflows`
* *WHEN* the reference is inspected
* *THEN* each reference MUST name a 40-character commit SHA rather than a tag or a branch
* *AND* each reference MUST carry a trailing comment naming the release that SHA points at

### Scenario: The runner leaves the live tier disabled

* *GIVEN* the CI workflow and the workspace's `*.live.test.ts` files
* *WHEN* the workflow's environment is inspected at workflow, job and step level
* *THEN* the workflow MUST NOT set `CHRYSALYST_LIVE_LLM` to a non-empty value
* *AND* the test step MUST therefore report every live suite as skipped rather than failed, because no language model runs on the runner

### Scenario: A broken check fails the run

* *GIVEN* the CI workflow's job
* *WHEN* the failure handling of its steps is inspected
* *THEN* every step MUST propagate a non-zero exit status
* *AND* a step MUST NOT declare `continue-on-error`, which would hide a failed check behind a green run

### Scenario: The pipeline holds no write access

* *GIVEN* the CI workflow
* *WHEN* its `permissions` block is inspected
* *THEN* the workflow MUST declare `contents: read`
* *AND* the workflow MUST NOT grant any write permission, because it reports checks and publishes nothing

### Scenario: Core coverage below ninety percent fails the run

* *GIVEN* the test configuration of `packages/core`
* *WHEN* the package's tests run under any of the workspace's test commands
* *THEN* coverage MUST be collected without an extra command-line flag
* *AND* the run MUST fail when statements, branches, functions or lines fall below 90 percent
* *AND* the measured percentage MUST count every TypeScript file under `packages/core/src` that is not a test file, so an entirely untested module lowers it

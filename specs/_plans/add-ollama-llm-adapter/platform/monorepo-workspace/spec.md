# Feature: monorepo_workspace

Gives every contributor and agent one workspace whose three packages resolve each other, share a single set of toolchain versions, and expose the same build, test, lint, format, and typecheck commands.

## Background

The workspace contains exactly three packages — `@chrysalyst/core`, `@chrysalyst/server`, `@chrysalyst/web` — under `packages/`. Toolchain versions are declared once in the `catalog:` block of `pnpm-workspace.yaml`; packages reference them with the `catalog:` specifier. All packages are ESM (`"type": "module"`) and resolve each other through TypeScript source rather than built output.

## Scenarios

<!-- DELTA:NEW -->
### Scenario: Live-tier tests are gated by an environment flag

* *GIVEN* every workspace file whose name ends in `.live.test.ts`
* *WHEN* the workspace suite inspects those files
* *THEN* each file MUST guard its suite with a `skipIf` reading the `CHRYSALYST_LIVE_LLM` environment variable
* *AND* each file MUST NOT contain a top-level `await`, so collecting it contacts no backend
* *AND* a run of `pnpm -r --include-workspace-root test` without that variable MUST report those tests as skipped rather than failed
<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->
### Scenario: An empty live-tier flag leaves the tier disabled

* *GIVEN* the live suite and its `skipIf` guard on `CHRYSALYST_LIVE_LLM`
* *WHEN* the guard is evaluated against an unset variable, an empty-string variable, and the value `1`
* *THEN* an unset `CHRYSALYST_LIVE_LLM` MUST leave the live tier disabled
* *AND* a `CHRYSALYST_LIVE_LLM` set to the empty string MUST leave the live tier disabled, because assigning an empty value is how a shell and a CI workflow express "off"
* *AND* any non-empty value MUST enable the tier
<!-- /DELTA:NEW -->

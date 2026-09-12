# Feature: monorepo_workspace

Gives every contributor and agent one workspace whose three packages resolve each other, share a single set of toolchain versions, and expose the same build, test, lint, format, and typecheck commands.

## Background

The workspace contains exactly three packages — `@chrysalyst/core`, `@chrysalyst/server`, `@chrysalyst/web` — under `packages/`. Toolchain versions are declared once in the `catalog:` block of `pnpm-workspace.yaml`; packages reference them with the `catalog:` specifier. All packages are ESM (`"type": "module"`) and resolve each other through TypeScript source rather than built output.

## Scenarios

<!-- DELTA:CHANGED -->

### Scenario: Root scripts expose the mission command set

* *GIVEN* the root manifest
* *WHEN* its scripts are inspected
* *THEN* the scripts MUST include `dev`, `lint`, `format`, `format:check` and `typecheck`
* *AND* the `dev` script MUST run the package `dev` scripts in parallel
* *AND* the `test` and `typecheck` scripts MUST NOT require a build step to run first
* *AND* `format:check` MUST report a formatting violation without rewriting a file, because the pipeline runs it on a runner whose working tree is discarded

<!-- /DELTA:CHANGED -->

# Feature: monorepo_workspace

Gives every contributor and agent one workspace whose three packages resolve each other, share a single set of toolchain versions, and expose the same build, test, lint, format, and typecheck commands.

## Background

The workspace contains exactly three packages — `@chrysalyst/core`, `@chrysalyst/server`, `@chrysalyst/web` — under `packages/`. Toolchain versions are declared once in the `catalog:` block of `pnpm-workspace.yaml`; packages reference them with the `catalog:` specifier. All packages are ESM (`"type": "module"`) and resolve each other through TypeScript source rather than built output.

## Scenarios

### Scenario: Workspace enumerates exactly the three packages

* *GIVEN* the repository root contains `pnpm-workspace.yaml`
* *WHEN* the workspace package list is resolved
* *THEN* the workspace MUST contain exactly the packages `@chrysalyst/core`, `@chrysalyst/server`, and `@chrysalyst/web`
* *AND* every package directory MUST live under `packages/`

### Scenario: Every package is ESM and exposes the shared script set

* *GIVEN* a package manifest in the workspace
* *WHEN* the manifest is inspected
* *THEN* the manifest MUST declare `"type": "module"`
* *AND* the manifest MUST define the scripts `build`, `test`, `typecheck`, and `dev`
* *AND* the manifest MUST declare `"private": true`

### Scenario: Packages resolve each other through source

* *GIVEN* the manifest of `@chrysalyst/core`
* *WHEN* its `exports` entry is inspected
* *THEN* the entry MUST resolve to a TypeScript source file
* *AND* the manifest MUST NOT expose a built output directory as its entry point

### Scenario: Server depends on core through the workspace protocol

* *GIVEN* the manifest of `@chrysalyst/server`
* *WHEN* its dependency on `@chrysalyst/core` is inspected
* *THEN* the version specifier MUST be `workspace:*`
* *AND* `@chrysalyst/web` MUST NOT declare a dependency on `@chrysalyst/core`
* *AND* `@chrysalyst/web` MUST NOT declare a dependency on `@chrysalyst/server`

### Scenario: Toolchain versions come from the catalog

* *GIVEN* a package manifest that depends on a catalog-managed tool
* *WHEN* the dependency specifier is inspected
* *THEN* the specifier MUST be `catalog:`
* *AND* the manifest MUST NOT hardcode a version range for a catalog-managed tool

### Scenario: Root manifest pins runtime and package manager

* *GIVEN* the root manifest and `.nvmrc`
* *WHEN* the pinned runtime is compared against the declared engine range
* *THEN* the root manifest MUST declare a `packageManager` field naming an exact pnpm version
* *AND* the `engines.node` range MUST admit the version written in `.nvmrc`
* *AND* the `engines.node` range MUST NOT admit a Node version that cannot execute a TypeScript entry point without a command-line flag

### Scenario: Root scripts expose the mission command set

* *GIVEN* the root manifest
* *WHEN* its scripts are inspected
* *THEN* the scripts MUST include `dev`, `lint`, `format`, and `typecheck`
* *AND* the `dev` script MUST run the package `dev` scripts in parallel
* *AND* the `test` and `typecheck` scripts MUST NOT require a build step to run first

### Scenario: Live-tier tests are gated by an environment flag

* *GIVEN* every workspace file whose name ends in `.live.test.ts`
* *WHEN* the workspace suite inspects those files
* *THEN* each file MUST guard its suite with a `skipIf` reading the `CHRYSALYST_LIVE_LLM` environment variable
* *AND* each file MUST NOT contain a top-level `await`, so collecting it contacts no backend
* *AND* a run of `pnpm -r --include-workspace-root test` without that variable MUST report those tests as skipped rather than failed

### Scenario: An empty live-tier flag leaves the tier disabled

* *GIVEN* the live suite and its `skipIf` guard on `CHRYSALYST_LIVE_LLM`
* *WHEN* the guard is evaluated against an unset variable, an empty-string variable, and the value `1`
* *THEN* an unset `CHRYSALYST_LIVE_LLM` MUST leave the live tier disabled
* *AND* a `CHRYSALYST_LIVE_LLM` set to the empty string MUST leave the live tier disabled, because assigning an empty value is how a shell and a CI workflow express "off"
* *AND* any non-empty value MUST enable the tier

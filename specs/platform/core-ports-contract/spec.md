# Feature: core_ports_contract

Binds the individual ports into `@chrysalyst/core`'s package contract — a single type entry point, no runtime dependency, `search` as the only optional dependency, and type-level rejection of non-conforming implementations.

## Background

`@chrysalyst/core` holds type declarations only: no port implementation, no adapter, and no runtime dependency on a framework, a network client, or the filesystem. Every port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for a port live in `@chrysalyst/core`'s own test files, which the purity rules below exempt.

## Scenarios

### Scenario: Ports are reachable from the package entry point

* *GIVEN* a consumer that imports the type namespace of `@chrysalyst/core`
* *WHEN* the consumer resolves the port declarations
* *THEN* the entry point MUST export the types `LlmPort`, `SearchPort`, `SessionStorePort`, `ClockPort`, and `CoreDependencies`
* *AND* the entry point MUST export the supporting types each port names in its signatures

### Scenario: Core carries no runtime dependency

* *GIVEN* the manifest of `@chrysalyst/core`
* *WHEN* its runtime dependencies are inspected
* *THEN* the manifest MUST declare no `dependencies`
* *AND* the package's non-test source MUST NOT import a Node built-in module
* *AND* the package's non-test source MUST NOT import a third-party module
* *AND* files matching `*.test.ts` and `*.test-d.ts` MUST be excluded from the two preceding assertions

### Scenario: Search is the only optional dependency

* *GIVEN* the `CoreDependencies` type
* *WHEN* a dependency set omitting `search` is asserted against it
* *THEN* the type check MUST accept the dependency set
* *AND* omitting `llm`, `sessions`, or `clock` MUST fail the type check
* *AND* a caller MUST NOT require a placeholder `SearchPort` implementation to compile

### Scenario: A port rejects a non-conforming implementation

* *GIVEN* an object whose method returns a type the port does not declare
* *WHEN* the object is asserted against the port type
* *THEN* the type check MUST fail
* *AND* the failure MUST surface when the package's type tests run

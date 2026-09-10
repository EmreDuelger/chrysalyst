# Feature: core_ports_contract

Binds the individual ports into `@chrysalyst/core`'s package contract — one entry point publishing the ports and the domain logic written against them, no runtime dependency, `search` as the only optional dependency, and type-level rejection of non-conforming implementations.

## Background

`@chrysalyst/core` holds the port declarations and the domain logic written against them. It holds no port implementation and no adapter: an implementation of `LlmPort`, `SearchPort`, or `SessionStorePort` lives in `packages/server`. What the package rules forbid is a dependency, not a runtime value — domain logic may ship as executable code, provided it imports nothing but this package's own relative modules. Every port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for a port live in `@chrysalyst/core`'s own test files, which the purity rules below exempt.

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

### Scenario: Domain logic is reachable from the package entry point

* *GIVEN* a consumer that imports `@chrysalyst/core`
* *WHEN* the consumer resolves the interview's entry point
* *THEN* the entry point MUST export the interview factory as a value
* *AND* the entry point MUST export the interview's state types
* *AND* the package's non-test source MAY export a runtime value, because the purity rules above ban dependencies rather than execution
* *AND* importing the entry point MUST NOT open a socket, read a file, or read the system clock

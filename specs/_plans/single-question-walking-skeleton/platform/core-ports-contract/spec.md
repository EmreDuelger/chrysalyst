# Feature: core_ports_contract

<!-- DELTA:CHANGED -->
Binds the individual ports into `@chrysalyst/core`'s package contract — one entry point publishing the ports and the domain logic written against them, no runtime dependency, `search` as the only optional dependency, and type-level rejection of non-conforming implementations.
<!-- /DELTA:CHANGED -->

## Background

<!-- DELTA:CHANGED -->
`@chrysalyst/core` holds the port declarations and the domain logic written against them. It holds no port implementation and no adapter: an implementation of `LlmPort`, `SearchPort`, or `SessionStorePort` lives in `packages/server`. What the package rules forbid is a dependency, not a runtime value — domain logic may ship as executable code, provided it imports nothing but this package's own relative modules. Every port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for a port live in `@chrysalyst/core`'s own test files, which the purity rules below exempt.
<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:NEW -->
### Scenario: Domain logic is reachable from the package entry point

* *GIVEN* a consumer that imports `@chrysalyst/core`
* *WHEN* the consumer resolves the interview's entry point
* *THEN* the entry point MUST export the interview factory as a value
* *AND* the entry point MUST export the interview's state types
* *AND* the package's non-test source MAY export a runtime value, because the purity rules above ban dependencies rather than execution
* *AND* importing the entry point MUST NOT open a socket, read a file, or read the system clock
<!-- /DELTA:NEW -->

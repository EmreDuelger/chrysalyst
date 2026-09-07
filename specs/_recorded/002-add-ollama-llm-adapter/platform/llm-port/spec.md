# Feature: llm_port

Declares `LlmPort`, the boundary through which chrysalyst's domain logic reaches a language-inference backend for streamed and whole-response completion, availability checks, and cancellation.

## Background

<!-- DELTA:CHANGED -->
`LlmPort` is a type declaration in `@chrysalyst/core`, which holds no implementation and no adapter of its own; adapters live in `packages/server`. The port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for `LlmPort` live in `@chrysalyst/core`'s own test files.
<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:CHANGED -->
### Scenario: LlmPort reports backend availability

* *GIVEN* a test double implementing `LlmPort` whose backend is unreachable
* *WHEN* a caller awaits `status`
* *THEN* the result MUST report the backend as unavailable
* *AND* the result MUST carry a list of model names
* *AND* the list MAY be empty, because an adapter that learns its models by asking the backend has nothing to report once the backend stops answering
<!-- /DELTA:CHANGED -->

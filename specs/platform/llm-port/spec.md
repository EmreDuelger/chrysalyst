# Feature: llm_port

Declares `LlmPort`, the boundary through which chrysalyst's domain logic reaches a language-inference backend for streamed and whole-response completion, availability checks, and cancellation.

## Background

`LlmPort` is a type declaration in `@chrysalyst/core`: no implementation and no adapter. The port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for `LlmPort` live in `@chrysalyst/core`'s own test files.

## Scenarios

### Scenario: LlmPort streams a response incrementally

* *GIVEN* a test double implementing `LlmPort` that yields the chunks `"Wel"`, `"come"`
* *WHEN* a caller consumes `stream` for a request
* *THEN* the port MUST yield each chunk in the order produced
* *AND* the concatenation of the chunks MUST equal the complete response text

### Scenario: LlmPort returns a whole response in one call

* *GIVEN* a test double implementing `LlmPort`
* *WHEN* a caller awaits `complete` for a request
* *THEN* the port MUST resolve to the complete response as a single string
* *AND* the caller MUST NOT consume an iterator to obtain it

### Scenario: LlmPort reports backend availability

* *GIVEN* a test double implementing `LlmPort` whose backend is unreachable
* *WHEN* a caller awaits `status`
* *THEN* the result MUST report the backend as unavailable
* *AND* the result MUST expose the list of locally available model names

### Scenario: A long-running LLM call is cancellable

* *GIVEN* a test double implementing `LlmPort`
* *AND* an `AbortSignal` that is already aborted
* *WHEN* a caller invokes `stream` with that signal
* *THEN* the port MUST accept the signal as an optional argument
* *AND* the port MUST stop producing chunks once the signal is aborted

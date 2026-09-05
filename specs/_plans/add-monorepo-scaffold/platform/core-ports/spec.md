# Feature: core_ports

Declares the four boundaries through which chrysalyst's domain logic reaches the outside world — language inference, web search, session persistence, and time — so that domain code can be written and tested before any backend exists.

## Background

`@chrysalyst/core` holds type declarations only in this feature: no port implementation, no adapter, and no runtime dependency on a framework, a network client, or the filesystem. Every port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for a port live in `@chrysalyst/core`'s own test files, which the purity rules below exempt.

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

### Scenario: SessionStorePort round-trips a session

* *GIVEN* a test double implementing `SessionStorePort` over an in-memory map
* *AND* a stored session with an identifier, timestamps, and domain state
* *WHEN* the caller saves the session and loads it by identifier
* *THEN* the loaded session MUST equal the saved session
* *AND* the port MUST remain generic over the domain state it persists

### Scenario: Loading an unknown session yields no session

* *GIVEN* a test double implementing `SessionStorePort` holding no sessions
* *WHEN* the caller loads an identifier that was never saved
* *THEN* the port MUST resolve to `undefined`
* *AND* the port MUST NOT throw

### Scenario: SearchPort returns ranked hits

* *GIVEN* a test double implementing `SearchPort`
* *WHEN* the caller searches for a query string
* *THEN* the port MUST resolve to a read-only list of hits
* *AND* each hit MUST carry a title, a URL, and a snippet

### Scenario: Search is the only optional dependency

* *GIVEN* the `CoreDependencies` type
* *WHEN* a dependency set omitting `search` is asserted against it
* *THEN* the type check MUST accept the dependency set
* *AND* omitting `llm`, `sessions`, or `clock` MUST fail the type check
* *AND* a caller MUST NOT require a placeholder `SearchPort` implementation to compile

### Scenario: ClockPort supplies time to a caller

* *GIVEN* a test double implementing `ClockPort` fixed to `2026-01-01T00:00:00.000Z`
* *WHEN* a caller reads the current time through the port
* *THEN* the port MUST return the fixed instant
* *AND* the caller MUST NOT read the ambient system clock

### Scenario: A port rejects a non-conforming implementation

* *GIVEN* an object whose method returns a type the port does not declare
* *WHEN* the object is asserted against the port type
* *THEN* the type check MUST fail
* *AND* the failure MUST surface when the package's type tests run

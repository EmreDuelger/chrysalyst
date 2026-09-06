# Feature: session_store_port

Declares `SessionStorePort`, the boundary through which chrysalyst's domain logic persists and reloads a session, generic over the domain state it carries.

## Background

`SessionStorePort` is a type declaration in `@chrysalyst/core`: no implementation and no adapter. The port is expressed in the domain's vocabulary, never in a storage provider's. Test doubles that stand in for `SessionStorePort` live in `@chrysalyst/core`'s own test files.

## Scenarios

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

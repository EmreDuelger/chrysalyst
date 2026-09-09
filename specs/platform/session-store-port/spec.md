# Feature: session_store_port

Declares `SessionStorePort`, the boundary through which chrysalyst's domain logic persists and reloads a session, generic over the domain state it carries.

## Background

`SessionStorePort` is a type declaration in `@chrysalyst/core`, which holds no implementation and no adapter of its own; adapters live in `packages/server`. The port is expressed in the domain's vocabulary, never in a storage provider's. An implementation chooses whether `list` reports an identifier whose record it cannot read. Test doubles that stand in for `SessionStorePort` live in `@chrysalyst/core`'s own test files.

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

### Scenario: A stored session the implementation cannot read is a failure

* *GIVEN* a test double implementing `SessionStorePort` whose backing map holds, under one identifier, a marker it cannot read back as a session
* *AND* a second identifier the caller never saved
* *WHEN* the caller loads the identifier whose record is unreadable
* *THEN* the load MUST reject, because a record that is present but unreadable is corruption rather than absence
* *AND* loading the identifier that was never saved MUST resolve to `undefined`, so `undefined` reports absence alone and never a record the implementation failed to read
* *AND* `list` MUST NOT reject over the unreadable record, because a caller asking what the store holds is not asking about one damaged record

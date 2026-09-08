# Feature: session_store_port

Declares `SessionStorePort`, the boundary through which chrysalyst's domain logic persists and reloads a session, generic over the domain state it carries.

## Background

<!-- DELTA:CHANGED -->
`SessionStorePort` is a type declaration in `@chrysalyst/core`, which holds no implementation and no adapter of its own; adapters live in `packages/server`. The port is expressed in the domain's vocabulary, never in a storage provider's. An implementation chooses whether `list` reports an identifier whose record it cannot read. Test doubles that stand in for `SessionStorePort` live in `@chrysalyst/core`'s own test files.
<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:NEW -->
### Scenario: A stored session the implementation cannot read is a failure

* *GIVEN* a test double implementing `SessionStorePort` whose backing map holds, under one identifier, a marker it cannot read back as a session
* *AND* a second identifier the caller never saved
* *WHEN* the caller loads the identifier whose record is unreadable
* *THEN* the load MUST reject, because a record that is present but unreadable is corruption rather than absence
* *AND* loading the identifier that was never saved MUST resolve to `undefined`, so `undefined` reports absence alone and never a record the implementation failed to read
* *AND* `list` MUST NOT reject over the unreadable record, because a caller asking what the store holds is not asking about one damaged record
<!-- /DELTA:NEW -->

<!-- `SessionStorePort round-trips a session` and `Loading an unknown session yields no session` are unchanged, carry no marker, and keep their existing tests. -->


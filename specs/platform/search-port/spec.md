# Feature: search_port

Declares `SearchPort`, the boundary through which chrysalyst's domain logic runs a web search and reads back ranked hits.

## Background

`SearchPort` is a type declaration in `@chrysalyst/core`: no implementation and no adapter. The port is expressed in the domain's vocabulary, never in a provider's. Test doubles that stand in for `SearchPort` live in `@chrysalyst/core`'s own test files.

## Scenarios

### Scenario: SearchPort returns ranked hits

* *GIVEN* a test double implementing `SearchPort`
* *WHEN* the caller searches for a query string
* *THEN* the port MUST resolve to a read-only list of hits
* *AND* each hit MUST carry a title, a URL, and a snippet

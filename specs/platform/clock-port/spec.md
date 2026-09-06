# Feature: clock_port

Declares `ClockPort`, the boundary through which chrysalyst's domain logic reads the current time instead of the ambient system clock.

## Background

`ClockPort` is a type declaration in `@chrysalyst/core`: no implementation and no adapter. The port is expressed in the domain's vocabulary, never in a runtime's. Test doubles that stand in for `ClockPort` live in `@chrysalyst/core`'s own test files.

## Scenarios

### Scenario: ClockPort supplies time to a caller

* *GIVEN* a test double implementing `ClockPort` fixed to `2026-01-01T00:00:00.000Z`
* *WHEN* a caller reads the current time through the port
* *THEN* the port MUST return the fixed instant
* *AND* the caller MUST NOT read the ambient system clock

# Feature: filesystem_session_store

Gives chrysalyst sessions that outlive a process: the first real `SessionStorePort` implementation, keeping each session as a folder on disk that holds a versioned JSON envelope beside a Markdown transcript.

## Background

The store lives in `packages/server` and is the only place that knows a session is a folder on disk. It writes `<root>/<id>/session.json` and `<root>/<id>/transcript.md`. `@chrysalyst/core` never imports it; the domain sees only `SessionStorePort`.

The root directory is configuration. `sessionStoreConfigFromEnv` resolves `CHRYSALYST_SESSION_DIR`, defaulting to `.chrysalyst/sessions` under the current user's home directory. Tests point the same field at a `mkdtemp` directory, so every scenario below runs against a real filesystem and none needs the user's home. The store writes the whole tree owner-only, because a session holds product ideas their author has not published.

`session.json` is an envelope: `schemaVersion`, the identifier, both timestamps as ISO 8601 strings, and the domain state under its own key. `schemaVersion` versions the envelope, not the state — the store never interprets `TState`, so it validates the envelope and passes the state through untouched. That boundary has a price the caller carries: `TState` must survive a JSON round trip, because a `Date` inside the state returns as a string. The two timestamps the envelope owns are revived to `Date`.

<!-- DELTA:CHANGED -->
`transcript.md` carries the interview, and the store does not compose it. The store's config accepts an optional renderer — a pure function from the stored session to Markdown, taking the same `StoredSession<TState>` that `save` receives — and the store calls it when one is configured. The renderer belongs to whoever owns the state: `@chrysalyst/core` ships the interview's, and the composition root supplies it. With no renderer configured the store writes the metadata header it wrote before, so a caller storing some other `TState` needs no renderer and the store still never interprets what it holds. The transcript is not versioned; `schemaVersion` continues to version the envelope alone.
<!-- /DELTA:CHANGED -->

Reading applies two policies to one read, because two callers ask different questions. `load` names one session, so absence is an ordinary answer and damage is not: a missing identifier resolves to nothing, and a file that is present but unreadable rejects. `list` asks what the store holds, so it skips whatever it cannot read rather than failing the whole listing over one damaged folder.

## Scenarios

<!-- DELTA:CHANGED -->
### Scenario: A saved session carries a transcript beside its state

* *GIVEN* a store over a temporary root directory, configured with a renderer
* *WHEN* the caller saves a session, then saves the same identifier again with a later `updatedAt`
* *THEN* the file `<root>/<id>/transcript.md` MUST exist after the first save and MUST hold exactly what the renderer returned
* *AND* the renderer MUST receive the stored session `save` was given, unchanged
* *AND* the second save MUST rewrite the file from the renderer's output for the second revision, so a completed save leaves behind no transcript describing an earlier revision
<!-- /DELTA:CHANGED -->

<!-- DELTA:NEW -->
### Scenario: A store with no renderer writes the metadata header

* *GIVEN* a store over a temporary root directory, configured with no renderer
* *WHEN* the caller saves a session whose state the store cannot interpret
* *THEN* `transcript.md` MUST name the session's identifier and both timestamps
* *AND* it MUST contain nothing beyond that header
* *AND* `save` MUST NOT reject, because a renderer is optional and the store reads no state without one
<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->
### Scenario: A renderer that fails does not commit a revision

* *GIVEN* a store over a root already holding a saved session, configured with a renderer that throws
* *WHEN* the caller saves a second revision of that identifier
* *THEN* `save` MUST reject with an error naming the session directory and carrying the renderer's failure as its cause
* *AND* loading that identifier MUST answer the first revision, unchanged in state and in both timestamps
* *AND* the session's directory MUST hold exactly `session.json` and `transcript.md`, so the failed save removed every temporary file it created
<!-- /DELTA:NEW -->

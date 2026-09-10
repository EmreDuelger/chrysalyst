# Feature: filesystem_session_store

Gives chrysalyst sessions that outlive a process: the first real `SessionStorePort` implementation, keeping each session as a folder on disk that holds a versioned JSON envelope beside a Markdown transcript.

## Background

The store lives in `packages/server` and is the only place that knows a session is a folder on disk. It writes `<root>/<id>/session.json` and `<root>/<id>/transcript.md`. `@chrysalyst/core` never imports it; the domain sees only `SessionStorePort`.

The root directory is configuration. `sessionStoreConfigFromEnv` resolves `CHRYSALYST_SESSION_DIR`, defaulting to `.chrysalyst/sessions` under the current user's home directory. Tests point the same field at a `mkdtemp` directory, so every scenario below runs against a real filesystem and none needs the user's home. The store writes the whole tree owner-only, because a session holds product ideas their author has not published.

`session.json` is an envelope: `schemaVersion`, the identifier, both timestamps as ISO 8601 strings, and the domain state under its own key. `schemaVersion` versions the envelope, not the state — the store never interprets `TState`, so it validates the envelope and passes the state through untouched. That boundary has a price the caller carries: `TState` must survive a JSON round trip, because a `Date` inside the state returns as a string. The two timestamps the envelope owns are revived to `Date`.

`transcript.md` carries the interview, and the store does not compose it. The store's config accepts an optional renderer — a pure function from the stored session to Markdown, taking the same `StoredSession<TState>` that `save` receives — and the store calls it when one is configured. The renderer belongs to whoever owns the state: `@chrysalyst/core` ships the interview's, and the composition root supplies it. With no renderer configured the store writes the metadata header it wrote before, so a caller storing some other `TState` needs no renderer and the store still never interprets what it holds. The transcript is not versioned; `schemaVersion` continues to version the envelope alone.

Reading applies two policies to one read, because two callers ask different questions. `load` names one session, so absence is an ordinary answer and damage is not: a missing identifier resolves to nothing, and a file that is present but unreadable rejects. `list` asks what the store holds, so it skips whatever it cannot read rather than failing the whole listing over one damaged folder.

## Scenarios

### Scenario: Store round-trips a session through a real directory

* *GIVEN* a store over a temporary root directory that does not yet exist
* *AND* a stored session carrying an identifier, a `createdAt`, an `updatedAt`, and domain state
* *WHEN* the caller saves the session and loads it by identifier
* *THEN* the first save MUST create the root directory and the session's own directory
* *AND* the loaded session MUST equal the saved session, with `createdAt` and `updatedAt` revived as `Date` instances rather than the strings they were stored as
* *AND* the store MUST remain generic over the domain state it persists

### Scenario: A saved session lands as a versioned JSON envelope

* *GIVEN* a store over a temporary root directory
* *WHEN* the caller saves a session whose identifier is `session-1`
* *THEN* the file `<root>/session-1/session.json` MUST exist, MUST parse as JSON, and MUST carry `schemaVersion` with the value `1`
* *AND* it MUST carry the identifier, and `createdAt` and `updatedAt` as ISO 8601 strings
* *AND* it MUST carry the domain state under its own key, not merged into the envelope's own fields
* *AND* the root directory and the session's own directory MUST each permit their owner alone to read, write, and enter them, and `session.json` and `transcript.md` MUST each permit their owner alone to read and write them

### Scenario: A saved session carries a transcript beside its state

* *GIVEN* a store over a temporary root directory, configured with a renderer
* *WHEN* the caller saves a session, then saves the same identifier again with a later `updatedAt`
* *THEN* the file `<root>/<id>/transcript.md` MUST exist after the first save and MUST hold exactly what the renderer returned
* *AND* the renderer MUST receive the stored session `save` was given, unchanged
* *AND* the second save MUST rewrite the file from the renderer's output for the second revision, so a completed save leaves behind no transcript describing an earlier revision

### Scenario: A store with no renderer writes the metadata header

* *GIVEN* a store over a temporary root directory, configured with no renderer
* *WHEN* the caller saves a session whose state the store cannot interpret
* *THEN* `transcript.md` MUST name the session's identifier and both timestamps
* *AND* it MUST contain nothing beyond that header
* *AND* `save` MUST NOT reject, because a renderer is optional and the store reads no state without one

### Scenario: A renderer that fails does not commit a revision

* *GIVEN* a store over a root already holding a saved session, configured with a renderer that throws
* *WHEN* the caller saves a second revision of that identifier
* *THEN* `save` MUST reject with an error naming the session directory and carrying the renderer's failure as its cause
* *AND* loading that identifier MUST answer the first revision, unchanged in state and in both timestamps
* *AND* the session's directory MUST hold exactly `session.json` and `transcript.md`, so the failed save removed every temporary file it created

### Scenario: State the store cannot serialise does not survive the round trip

* *GIVEN* a store over a temporary root directory
* *AND* a stored session whose domain state nests a `Date` under one of its own fields
* *WHEN* the caller saves the session and loads it by identifier
* *THEN* the loaded state's nested field MUST be the ISO 8601 string that `Date` serialised to, and MUST NOT be a `Date`
* *AND* the loaded session's `createdAt` and `updatedAt` MUST both be `Date` instances, because the envelope owns those two timestamps and revives them
* *AND* the store MUST NOT reject over the state it could not preserve, because it never inspects `TState`

### Scenario: A save that fails leaves the previous revision loadable

* *GIVEN* a store over a root already holding one successfully saved session
* *WHEN* a second save of the same identifier fails before either file is renamed into place, either because the state cannot be serialised or because the session directory refuses the write
* *THEN* `save` MUST reject
* *AND* loading that identifier MUST answer the first revision, unchanged in state and in both timestamps
* *AND* `list` MUST still report the identifier
* *AND* the session's directory MUST hold exactly `session.json` and `transcript.md`, so the failed save removed every temporary file it created

### Scenario: Saving replaces an earlier revision of the same session

* *GIVEN* a store over a root already holding a saved session
* *WHEN* the caller saves the same identifier with a later `updatedAt` and different state
* *THEN* loading that identifier MUST answer the second revision
* *AND* the session's directory MUST hold exactly `session.json` and `transcript.md`, so no temporary file from the write survives it
* *AND* `list` MUST report the identifier once

### Scenario: Loading an unknown session yields no session

* *GIVEN* a store over a temporary root directory holding no session
* *WHEN* the caller loads an identifier that was never saved
* *THEN* the store MUST resolve to `undefined`
* *AND* the store MUST NOT throw
* *AND* a load against a root directory that does not exist MUST also resolve to `undefined` rather than surfacing the filesystem's own error
* *AND* the store MUST NOT create any directory while loading

### Scenario: A session identifier never escapes the store's root

* *GIVEN* a store over a temporary root directory
* *WHEN* the caller saves a session whose identifier is empty, is `.`, is `..`, contains a path separator, or contains a NUL byte
* *THEN* `save` MUST reject, naming the identifier it refused
* *AND* the store MUST create and write nothing, inside the root or outside it
* *AND* loading such an identifier MUST resolve to `undefined`, because an identifier the store refuses to write is one it never stored
* *AND* `list` MUST NOT report a directory whose name is an identifier the store would refuse to save

### Scenario: A damaged session file fails loudly

* *GIVEN* a store over a root whose session directory holds a `session.json` the store cannot read as a session
* *WHEN* the caller loads that identifier
* *THEN* the load MUST reject rather than resolve to `undefined`, because a file that is present but unreadable is corruption, not absence, and the rejection's message MUST name the path of the file it could not read
* *AND* a rejection over a malformed body — one that is not valid JSON, one whose envelope fields are absent or malformed, or one the filesystem refused to read — MUST carry that underlying error as its `cause`
* *AND* a rejection over a `schemaVersion` the store does not recognise MUST carry no `cause` and MUST name the version found and the version expected
* *AND* a rejection over a stored identifier that disagrees with its directory name MUST carry no `cause` and MUST name the identifier found and the identifier expected

### Scenario: A store lists exactly the sessions it can read

* *GIVEN* a root holding three saved sessions, a directory carrying no `session.json`, a directory whose `session.json` is damaged, and a loose file
* *WHEN* the caller lists the store
* *THEN* the result MUST be exactly the three saved identifiers
* *AND* the identifiers MUST be in ascending lexicographic order, so the listing does not vary with the filesystem's own ordering
* *AND* `list` MUST NOT throw over the entries it skipped, because a caller asking what the store holds is not asking about one damaged session
* *AND* `list` over a root directory that does not exist MUST resolve to an empty array

### Scenario: The store's root comes from the environment

* *GIVEN* an environment declaring no `CHRYSALYST_SESSION_DIR`
* *WHEN* the store's configuration is resolved from that environment
* *THEN* the root directory MUST be `.chrysalyst/sessions` under the current user's home directory
* *AND* an environment that sets `CHRYSALYST_SESSION_DIR` MUST override that default
* *AND* a relative value MUST resolve to an absolute path, so the store's root does not move with the working directory
* *AND* the resolver MUST NOT read any file, so no dotenv loader enters the dependency set

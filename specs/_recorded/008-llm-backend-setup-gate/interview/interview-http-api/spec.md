# Feature: interview_http_api

Publishes the one round of the interview over HTTP — a session resource, a Server-Sent Events stream carrying the question as the model produces it, and a route that accepts the answer — so a browser can drive an interview without knowing what a language model or a session folder is.

## Background

<!-- DELTA:CHANGED -->

`@chrysalyst/server` builds its Hono app from a dependency set rather than at module scope: `createApp(dependencies, backend)` returns the chained app, and `AppType` is that function's return type, so a `hc` client still knows every route. The second argument is the backend descriptor `platform/backend-status` specifies and the interview routes never read it. The composition root in `main.ts` is the only place that constructs concrete adapters — the OpenAI-compatible language model, the filesystem session store, and a clock reading the system time — and the only place that resolves that descriptor, both from the process environment.

The stream carries three event types and no others. `token` carries one chunk of the question, `done` carries the finished question, and `error` carries a human-readable message. Every event's `data` is a single-line JSON object, because `JSON.stringify` escapes a newline and so no payload can split one SSE frame into two. The stream carries no `id` field: this feature has no reconnection protocol, and a client that loses the stream re-requests it and receives the stored question.

The question is produced once. The route that creates a session performs no inference, so it answers immediately; the model is reached on the first request for the question and its output is stored before the `done` event is written. A `done` event therefore means the question is on disk. Two requests for one session's question that overlap in time still reach the model once, because the interview holds a single in-flight production per session.

A session already on disk is reachable whatever the backend is doing. Replaying a stored question and recording an answer reach the store and the clock alone, so neither depends on a language model being available, and neither is gated on the status route's answer.

Abandonment reaches the app as a cancelled response body, not as a cancelled request: Node's adapter closes the writable side when the client disconnects, which cancels the body reader and aborts the stream. A scenario that abandons a stream therefore stops reading the body rather than aborting a request signal.

Error messages name the endpoint or the session they concern. chrysalyst binds the loopback interface and serves one person, so a message that helps that person diagnose a stopped backend is worth more than message minimisation.

Session creation takes the language to hold the interview in. The route reads it from an optional JSON body and answers it back beside the identifier, so the language a session was actually created in comes from one authority rather than from each side's belief about the fallback. Absence and wrongness are told apart, as they already are elsewhere in this contract: a request naming no language is creating a session in the default language, while a request naming a language outside the supported set is refused rather than quietly downgraded — a person interviewed in a language they did not ask for has no signal that anything went wrong. The route parses its body exactly as the answer route does, so no validation middleware and no typed request body enter the app.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:NEW -->

### Scenario: A stored session stays readable while the backend is unavailable

* *GIVEN* a session whose question has already been streamed to its end, and a language model whose `status` reports the backend unavailable and whose `complete` and `stream` reject
* *WHEN* a second `GET /interview/:id/question` request is read to the end and a `POST /interview/:id/answer` request carrying a valid body is then dispatched
* *THEN* the question stream MUST replay the stored question and close with a `done` event, framed exactly as it is over a reachable backend
* *AND* the answer route MUST respond with status `204` and the session's `session.json` on disk MUST hold the answer
* *AND* neither request MUST reach the language model
* *AND* `GET /status` on the same app MUST report that backend as not ready, so one app shows both halves at once

<!-- /DELTA:NEW -->

<!-- DELTA:CHANGED -->

### Scenario: The composition root builds the real adapters from the environment

* *GIVEN* a process environment
* *WHEN* the composition root resolves the dependency set and the backend descriptor
* *THEN* the set MUST carry a language model built from `CHRYSALYST_LLM_BASE_URL` and `CHRYSALYST_LLM_MODEL`, and the descriptor MUST name the backend's display name and that same default model, resolved through the one resolver that owns those defaults so the two cannot disagree
* *AND* the set MUST carry a session store built from `CHRYSALYST_SESSION_DIR` and configured with the interview's transcript renderer
* *AND* the set MUST carry a clock whose `now` answers the current system time, and MUST omit `search`, which no adapter implements yet
* *AND* resolving either of them MUST NOT open a socket, read a file, or create a directory, because the backend is probed when `platform/backend-status` is asked and not when the process boots

<!-- /DELTA:CHANGED -->

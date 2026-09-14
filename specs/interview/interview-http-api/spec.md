# Feature: interview_http_api

Publishes the one round of the interview over HTTP — a session resource, a Server-Sent Events stream carrying the question as the model produces it, and a route that accepts the answer — so a browser can drive an interview without knowing what a language model or a session folder is.

## Background

`@chrysalyst/server` builds its Hono app from a dependency set rather than at module scope: `createApp(dependencies, backend)` returns the chained app, and `AppType` is that function's return type, so a `hc` client still knows every route. The second argument is the backend descriptor `platform/backend-status` specifies and the interview routes never read it. The composition root in `main.ts` is the only place that constructs concrete adapters — the OpenAI-compatible language model, the filesystem session store, and a clock reading the system time — and the only place that resolves that descriptor, both from the process environment.

The stream carries three event types and no others. `token` carries one chunk of the question, `done` carries the finished question, and `error` carries a human-readable message. Every event's `data` is a single-line JSON object, because `JSON.stringify` escapes a newline and so no payload can split one SSE frame into two. The stream carries no `id` field: this feature has no reconnection protocol, and a client that loses the stream re-requests it and receives the stored question.

The question is produced once. The route that creates a session performs no inference, so it answers immediately; the model is reached on the first request for the question and its output is stored before the `done` event is written. A `done` event therefore means the question is on disk. Two requests for one session's question that overlap in time still reach the model once, because the interview holds a single in-flight production per session.

A session already on disk is reachable whatever the backend is doing. Replaying a stored question and recording an answer reach the store and the clock alone, so neither depends on a language model being available, and neither is gated on the status route's answer.

Abandonment reaches the app as a cancelled response body, not as a cancelled request: Node's adapter closes the writable side when the client disconnects, which cancels the body reader and aborts the stream. A scenario that abandons a stream therefore stops reading the body rather than aborting a request signal.

Error messages name the endpoint or the session they concern. chrysalyst binds the loopback interface and serves one person, so a message that helps that person diagnose a stopped backend is worth more than message minimisation.

Session creation takes the language to hold the interview in. The route reads it from an optional JSON body and answers it back beside the identifier, so the language a session was actually created in comes from one authority rather than from each side's belief about the fallback. Absence and wrongness are told apart, as they already are elsewhere in this contract: a request naming no language is creating a session in the default language, while a request naming a language outside the supported set is refused rather than quietly downgraded — a person interviewed in a language they did not ask for has no signal that anything went wrong. The route parses its body exactly as the answer route does, so no validation middleware and no typed request body enter the app.

## Scenarios

### Scenario: Creating a session answers its identifier

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request carrying a JSON body whose `locale` names a supported language is dispatched
* *THEN* the app MUST respond with status `201`
* *AND* the response body MUST be JSON carrying an `id` field and a `locale` field holding the language that was named
* *AND* the store MUST hold a session under that identifier whose state carries that language
* *AND* the app MUST NOT contact the language model

### Scenario: Creating a session that names no language uses the default language

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request is dispatched with no body at all, with a body that is not JSON, and with a JSON object carrying no `locale` field
* *THEN* the app MUST respond with status `201` to each of them
* *AND* the response body MUST carry the fallback language under `locale` for each of them
* *AND* the store MUST hold a session whose state carries that same fallback language
* *AND* the app MUST NOT refuse a request that simply names no language, because a body-less creation is the contract this route had before the language existed

### Scenario: Creating a session in an unsupported language is refused

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request carrying a JSON body whose `locale` is a tag outside the supported set, and one whose `locale` is not a string, are dispatched
* *THEN* the app MUST respond with status `400` to each of them
* *AND* the response body MUST be JSON carrying a `message` field naming the supported languages
* *AND* the store MUST hold no session, because a refused creation creates nothing
* *AND* the app MUST NOT fall back to the default language for a request that named a language, so a caller learns its tag was rejected

### Scenario: The question route streams token frames and closes with a done frame

* *GIVEN* a created session and a language model that yields the question in several chunks
* *WHEN* a `GET /interview/:id/question` request is dispatched and its body is read to the end
* *THEN* the response status MUST be `200` and its `Content-Type` header MUST be `text/event-stream`
* *AND* the body MUST carry one `token` event per model chunk, in order, each with a `data` object whose `text` field is that chunk
* *AND* the body MUST close with one `done` event carrying the whole question under `question`, and MUST carry no `error` event
* *AND* the session on disk MUST already hold that question when the `done` event is written

### Scenario: Token text carrying a newline stays inside one frame

* *GIVEN* a created session and a language model yielding a chunk containing a newline character
* *WHEN* the question stream is read to the end
* *THEN* the newline MUST arrive escaped inside the event's JSON payload
* *AND* the raw body MUST carry exactly as many blank-line frame separators as it carries events

### Scenario: A second question request replays the stored question without reaching the model

* *GIVEN* a session whose question has already been streamed to its end
* *WHEN* a second `GET /interview/:id/question` request is dispatched and read to the end
* *THEN* the body MUST carry the stored question and close with a `done` event, framed exactly as a first request is
* *AND* the app MUST NOT reach the language model
* *AND* the stored turn's `askedAt` MUST be unchanged

### Scenario: A failure after the stream opens arrives as an error frame

* *GIVEN* a created session and a language model whose stream rejects
* *WHEN* the question stream is read to the end
* *THEN* the response status MUST be `200`, because the status was sent before the failure occurred
* *AND* the body MUST carry an `error` event whose `data` object carries the failure's message under `message`
* *AND* the body MUST NOT carry a `done` event
* *AND* the stored session MUST hold no turn

### Scenario: A storage failure after the last chunk arrives as an error frame

* *GIVEN* a created session, a language model that yields its chunks normally, and a session store whose `save` rejects
* *WHEN* the question stream is read to the end
* *THEN* the body MUST carry every `token` event the model produced, because they were written before the failure
* *AND* the body MUST carry an `error` event naming the store's failure, and MUST NOT carry a `done` event
* *AND* the stored session MUST hold no turn

### Scenario: The question route refuses an unknown session before opening a stream

* *GIVEN* the app and an identifier no session was created under
* *WHEN* a `GET /interview/:id/question` request is dispatched
* *THEN* the app MUST respond with status `404`
* *AND* the response `Content-Type` MUST NOT be `text/event-stream`
* *AND* the response body MUST be JSON carrying a `message` field naming the identifier
* *AND* the app MUST NOT contact the language model

### Scenario: A client that abandons the question stream stores nothing

* *GIVEN* a created session and a language model yielding chunks
* *WHEN* the client stops reading the response body before the model's last chunk
* *THEN* the app MUST stop consuming the language model
* *AND* the stored session MUST hold no turn
* *AND* the app MUST NOT reject the abandoned request as a failure

### Scenario: Submitting an answer persists it and answers no content

* *GIVEN* a session whose question has been streamed to its end
* *WHEN* a `POST /interview/:id/answer` request carrying a JSON body with an `answer` field is dispatched
* *THEN* the app MUST respond with status `204`
* *AND* the response MUST carry no body
* *AND* the session's `session.json` on disk MUST hold the question, the answer, `askedAt`, `answeredAt`, and `schemaVersion`
* *AND* the `transcript.md` beside it MUST carry the question and the answer as Markdown

### Scenario: Submitting an answer for an unknown session is refused

* *GIVEN* the app and an identifier no session was created under
* *WHEN* a `POST /interview/:id/answer` request carrying a valid body is dispatched
* *THEN* the app MUST respond with status `404`
* *AND* the response body MUST be JSON carrying a `message` field naming the identifier

### Scenario: Submitting a second answer is refused as a conflict

* *GIVEN* a session whose question has already been answered
* *WHEN* a second `POST /interview/:id/answer` request is dispatched
* *THEN* the app MUST respond with status `409`
* *AND* the stored answer MUST be unchanged

### Scenario: Submitting an answer before the question was requested is refused as a conflict

* *GIVEN* a created session whose question route has never been requested
* *WHEN* a `POST /interview/:id/answer` request carrying a valid body is dispatched
* *THEN* the app MUST respond with status `409`
* *AND* the stored session MUST still hold an empty turn list
* *AND* the app MUST NOT store an answer to a question that was never asked

### Scenario: A body carrying no answer is rejected

* *GIVEN* a session whose question has been streamed to its end
* *WHEN* a `POST /interview/:id/answer` request is dispatched with a body that is not JSON, a JSON body with no `answer` field, a JSON body whose `answer` is not a string, or a JSON body whose `answer` is blank
* *THEN* the app MUST respond with status `400` for each of them
* *AND* the response body MUST be JSON carrying a `message` field
* *AND* the stored session MUST still hold an unanswered turn

### Scenario: A stored session stays readable while the backend is unavailable

* *GIVEN* a session whose question has already been streamed to its end, and a language model whose `status` reports the backend unavailable and whose `complete` and `stream` reject
* *WHEN* a second `GET /interview/:id/question` request is read to the end and a `POST /interview/:id/answer` request carrying a valid body is then dispatched
* *THEN* the question stream MUST replay the stored question and close with a `done` event, framed exactly as it is over a reachable backend
* *AND* the answer route MUST respond with status `204` and the session's `session.json` on disk MUST hold the answer
* *AND* neither request MUST reach the language model
* *AND* `GET /status` on the same app MUST report that backend as not ready, so one app shows both halves at once

### Scenario: The app's routes reach a typed client

* *GIVEN* the app type exported by `@chrysalyst/server`
* *WHEN* a Hono `hc` client is parameterised with that type
* *THEN* the client MUST expose the session-creation, question, and answer routes
* *AND* the question and answer routes MUST accept the session identifier as a path parameter
* *AND* calling a route the app does not define MUST fail the type check

### Scenario: The composition root builds the real adapters from the environment

* *GIVEN* a process environment
* *WHEN* the composition root resolves the dependency set and the backend descriptor
* *THEN* the set MUST carry a language model built from `CHRYSALYST_LLM_BASE_URL` and `CHRYSALYST_LLM_MODEL`, and the descriptor MUST name the backend's display name and that same default model, resolved through the one resolver that owns those defaults so the two cannot disagree
* *AND* the set MUST carry a session store built from `CHRYSALYST_SESSION_DIR` and configured with the interview's transcript renderer
* *AND* the set MUST carry a clock whose `now` answers the current system time, and MUST omit `search`, which no adapter implements yet
* *AND* resolving either of them MUST NOT open a socket, read a file, or create a directory, because the backend is probed when `platform/backend-status` is asked and not when the process boots

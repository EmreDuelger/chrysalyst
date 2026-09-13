# Feature: interview_http_api

Publishes the one round of the interview over HTTP — a session resource, a Server-Sent Events stream carrying the question as the model produces it, and a route that accepts the answer — so a browser can drive an interview without knowing what a language model or a session folder is.

## Background

`@chrysalyst/server` builds its Hono app from a dependency set rather than at module scope: `createApp(dependencies)` returns the chained app, and `AppType` is that function's return type, so a `hc` client still knows every route. The composition root in `main.ts` is the only place that constructs concrete adapters — the OpenAI-compatible language model, the filesystem session store, and a clock reading the system time — from the process environment.

Error messages name the endpoint or the session they concern. chrysalyst binds the loopback interface and serves one person, so a message that helps that person diagnose a stopped backend is worth more than message minimisation.

<!-- DELTA:NEW -->

Session creation takes the language to hold the interview in. The route reads it from an optional JSON body and answers it back beside the identifier, so the language a session was actually created in comes from one authority rather than from each side's belief about the fallback. Absence and wrongness are told apart, as they already are elsewhere in this contract: a request naming no language is creating a session in the default language, while a request naming a language outside the supported set is refused rather than quietly downgraded — a person interviewed in a language they did not ask for has no signal that anything went wrong. The route parses its body exactly as the answer route does, so no validation middleware and no typed request body enter the app.

<!-- /DELTA:NEW -->

## Scenarios

<!-- DELTA:CHANGED -->

### Scenario: Creating a session answers its identifier

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request carrying a JSON body whose `locale` names a supported language is dispatched
* *THEN* the app MUST respond with status `201`
* *AND* the response body MUST be JSON carrying an `id` field and a `locale` field holding the language that was named
* *AND* the store MUST hold a session under that identifier whose state carries that language
* *AND* the app MUST NOT contact the language model

<!-- /DELTA:CHANGED -->

<!-- DELTA:NEW -->

### Scenario: Creating a session that names no language uses the default language

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request is dispatched with no body at all, with a body that is not JSON, and with a JSON object carrying no `locale` field
* *THEN* the app MUST respond with status `201` to each of them
* *AND* the response body MUST carry the fallback language under `locale` for each of them
* *AND* the store MUST hold a session whose state carries that same fallback language
* *AND* the app MUST NOT refuse a request that simply names no language, because a body-less creation is the contract this route had before the language existed

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: Creating a session in an unsupported language is refused

* *GIVEN* the app built over a session store and a language model
* *WHEN* a `POST /interview` request carrying a JSON body whose `locale` is a tag outside the supported set, and one whose `locale` is not a string, are dispatched
* *THEN* the app MUST respond with status `400` to each of them
* *AND* the response body MUST be JSON carrying a `message` field naming the supported languages
* *AND* the store MUST hold no session, because a refused creation creates nothing
* *AND* the app MUST NOT fall back to the default language for a request that named a language, so a caller learns its tag was rejected

<!-- /DELTA:NEW -->

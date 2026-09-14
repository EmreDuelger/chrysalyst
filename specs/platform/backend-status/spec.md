# Feature: backend_status

Answers whether chrysalyst can hold an interview right now — whether the configured language-model backend answers at all, and whether it holds the model chrysalyst will ask it for — and names that backend, so a person is told which of the two to fix rather than only that something went wrong.

## Background

`GET /status` is a second probe beside `GET /health`, and the two are deliberately separate routes. `/health` reports that the server process is alive and reaches none of its dependencies; `/status` reaches the language-model backend and reports whether an interview can start. Folding them together would make a liveness probe fail whenever a daemon the server does not own is stopped.

Readiness is two questions answered by one probe. `LlmPort.status` answers the first only: `platform/llm-port` has a reachable backend report as available even when it holds no model at all. The second question — whether the model chrysalyst will actually send is in that inventory — is therefore decided here, above the port. The comparison is against the exact model id the adapter sends when a request names none, because a gate that passed on a near match would hand the person a failing inference in place of a setup step.

The port's contract is that no caller above it learns which backend is answering, so the display name cannot come from the port. It comes from the server's own configuration: `createApp(dependencies, backend)` takes a descriptor naming the backend and the model, and the composition root resolves that descriptor from the environment through the same resolver it built the adapter from, so the two cannot name different models.

The probe runs per request, not at boot. Resolving the dependency set still opens no socket, and a client that asks twice gets two answers rather than one cached at start-up — which is what makes "start the backend, then ask again" a recovery path rather than a restart.

The route answers `200` for every outcome it observed, exactly as `LlmPort.status` resolves for every outcome it observed. An unreachable backend is a fact the probe learned, not a failure of the probe; answering `503` would make a browser's `fetch` treat a successful diagnosis as a transport error and lose the distinction this route exists to draw.

The probe is bounded by a deadline of 2.0 seconds. A backend that refuses a connection answers in milliseconds, but a base URL pointing at a host that accepts a connection and never replies would otherwise hold the asking page open indefinitely — the hang this feature exists to prevent.

## Scenarios

### Scenario: A backend holding the configured model reports ready

* *GIVEN* an app built over a language model whose `status` reports the backend available with an inventory containing the descriptor's model
* *WHEN* a `GET /status` request is dispatched
* *THEN* the app MUST respond with status `200` and a JSON body whose `ready` field is `true`
* *AND* the body MUST carry the descriptor's backend name under `backend` and its model under `model`
* *AND* the body MUST carry no `reason` field, because a ready backend has no fault to name
* *AND* the app MUST NOT reach the model's `complete` or `stream`, because readiness is answered without inference

### Scenario: An unreachable backend is reported as unreachable

* *GIVEN* an app built over a language model whose `status` reports the backend unavailable
* *WHEN* a `GET /status` request is dispatched
* *THEN* the app MUST respond with status `200`, because the probe learned exactly what it asked
* *AND* the body's `ready` field MUST be `false` and its `reason` field MUST be `unreachable`
* *AND* the body MUST still name the backend and the model, so the guidance can name what to start
* *AND* the route MUST NOT reject the request

### Scenario: A reachable backend lacking the configured model is reported separately

* *GIVEN* an app whose language model reports the backend available with an inventory that does not contain the descriptor's model, and an app whose language model reports it available with an empty inventory
* *WHEN* a `GET /status` request is dispatched to each of them
* *THEN* the body's `reason` MUST be `model-missing` for each of them
* *AND* that reason MUST differ from the reason an unreachable backend answers, because starting a daemon and installing a model are different actions
* *AND* an inventory carrying `llama3.2:latest` MUST NOT satisfy a descriptor naming `llama3.2:3b`, because the adapter sends the configured id exactly as it is written
* *AND* the body's `ready` field MUST be `false`

### Scenario: A probe that does not answer in time reports the backend unreachable

* *GIVEN* an app whose language model's `status` settles only once the signal it was given is aborted
* *WHEN* a `GET /status` request is dispatched
* *THEN* the route MUST hand the probe an abort signal that fires 2.0 seconds after the request, and MUST answer once that signal fires rather than waiting on the backend
* *AND* the body's `ready` field MUST be `false` and its `reason` field MUST be `unreachable`
* *AND* the route MUST NOT reject, so a stalled backend reads as a setup step rather than as a server failure
* *AND* a `status` that rejects for any other reason MUST be reported the same way, because a probe that learned nothing leaves the person the same single action

### Scenario: The status route reaches the typed client

* *GIVEN* the app type exported by `@chrysalyst/server`
* *WHEN* a Hono `hc` client is parameterised with that type
* *THEN* the client MUST expose the status route beside the health and interview routes
* *AND* calling a route the app does not define MUST still fail the type check

### Scenario: The liveness probe stays independent of the backend

* *GIVEN* an app whose language model's `status` rejects on every call
* *WHEN* a `GET /health` request is dispatched
* *THEN* the app MUST respond with status `200` and a body whose `status` field is `ok`
* *AND* the app MUST NOT reach the language model
* *AND* the two probes MUST remain separate routes, so a stopped daemon never reads as a dead server

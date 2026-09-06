# Feature: ollama_llm_adapter

Gives chrysalyst a working language-inference backend: the first real `LlmPort` implementation, answering whole and streamed completions from a local Ollama daemon and reporting whether that daemon can be reached and which models it holds.

## Background

The adapter lives in `packages/server` and is the only place that knows a language model is reached over HTTP. It speaks the OpenAI wire format to a loopback endpoint, so Ollama, LM Studio, and a llama.cpp server differ by configuration rather than by implementation. `@chrysalyst/core` never imports it; the domain sees only `LlmPort`.

Configuration is a base URL and a default model, read from `CHRYSALYST_LLM_BASE_URL` and `CHRYSALYST_LLM_MODEL`, defaulting to Ollama's `http://127.0.0.1:11434/v1` and `llama3.2:3b`. The endpoint carries no credential: chrysalyst runs against a loopback daemon that authenticates nobody.

Tests run in two tiers. The default tier is hermetic — it injects a `fetch` stub and needs no daemon. The `live` tier lives in files named `*.live.test.ts`, needs a running Ollama, and runs only when `CHRYSALYST_LIVE_LLM` is set.

## Scenarios

### Scenario: Adapter returns a whole response for a request

* *GIVEN* the adapter over a stubbed endpoint that answers one chat completion with the content `"Welcome"`
* *WHEN* a caller awaits `complete` for a request carrying one user message
* *THEN* the adapter MUST resolve to `"Welcome"` as a single string
* *AND* the adapter MUST issue exactly one request, to `<base URL>/chat/completions`
* *AND* the request body MUST name the request's `model` when it carries one, and the configured default model when it does not

### Scenario: Adapter streams response chunks in order

* *GIVEN* the adapter over a stubbed endpoint that emits the streamed deltas `"Wel"`, `"come"`
* *WHEN* a caller consumes `stream` for a request
* *THEN* the adapter MUST yield `"Wel"` before `"come"`
* *AND* the concatenation of the yielded chunks MUST equal `"Welcome"`
* *AND* the adapter MUST NOT yield the surrounding transport frames

### Scenario: A cancelled stream stops without failing

* *GIVEN* the adapter over a stubbed endpoint that emits five streamed deltas
* *WHEN* a caller aborts the signal after consuming the second chunk
* *THEN* the iteration MUST end
* *AND* the iteration MUST NOT reject
* *AND* the caller MUST have received exactly the two chunks delivered before the abort
* *AND* a signal that is already aborted when `stream` is called MUST yield no chunk and MUST NOT reject

### Scenario: A cancelled completion rejects

* *GIVEN* the adapter and an `AbortSignal` that is already aborted
* *WHEN* a caller awaits `complete` with that signal
* *THEN* the call MUST reject
* *AND* the rejection's `name` MUST be `AbortError`
* *AND* the call MUST NOT resolve to an empty string, which a caller could not tell from an empty answer

### Scenario: Status reports a reachable backend and its model inventory

* *GIVEN* the adapter over a stubbed endpoint whose model list answers the ids `llama3.2:3b` and `qwen2.5:7b`
* *WHEN* a caller awaits `status`
* *THEN* the result MUST report the backend as available
* *AND* the result's models MUST be `["llama3.2:3b", "qwen2.5:7b"]`, in the order the endpoint returned them
* *AND* a reachable backend holding no model MUST still report as available, with an empty model list

### Scenario: Status separates an unreachable backend from a cancelled probe

* *GIVEN* the adapter pointed at a base URL that refuses connections
* *WHEN* a caller awaits `status`
* *THEN* the call MUST resolve rather than reject
* *AND* the result MUST report the backend as unavailable
* *AND* the result's models MUST be an empty array
* *AND* a probe cancelled through an already-aborted signal MUST instead reject, because a cancelled probe learned nothing about the backend
* *AND* a backend answering `200` with a body the model-list guard rejects MUST report as unavailable with an empty model list, because a body the adapter cannot read is not evidence the backend can serve a request

### Scenario: An unreachable backend fails a completion with the endpoint named

* *GIVEN* the adapter pointed at a base URL that refuses connections
* *WHEN* a caller awaits `complete`
* *THEN* the call MUST reject
* *AND* the rejection's message MUST name the configured base URL
* *AND* the rejection's `cause` MUST carry the underlying transport error
* *AND* `stream` MUST reject the same way when its first chunk is consumed

### Scenario: The adapter targets any OpenAI-compatible endpoint

* *GIVEN* the adapter constructed with the base URL `http://127.0.0.1:1234/v1` rather than Ollama's default
* *WHEN* a caller awaits `complete` and then `status`
* *THEN* every issued request URL MUST begin with `http://127.0.0.1:1234/v1`
* *AND* no issued request path MUST be Ollama-specific — only `/chat/completions` and `/models` are used
* *AND* no issued request MUST carry an `Authorization` header

### Scenario: Ollama's defaults come from the environment

* *GIVEN* an environment declaring neither `CHRYSALYST_LLM_BASE_URL` nor `CHRYSALYST_LLM_MODEL`
* *WHEN* the adapter's configuration is resolved from that environment
* *THEN* the base URL MUST be `http://127.0.0.1:11434/v1`
* *AND* the default model MUST be `llama3.2:3b`
* *AND* an environment that sets either variable MUST override the matching default
* *AND* the resolver MUST NOT read any file, so no dotenv loader enters the dependency set

### Scenario: A running Ollama answers through the port

* *GIVEN* `CHRYSALYST_LIVE_LLM` is set and an Ollama daemon is running with the configured model pulled
* *WHEN* the live suite drives `status`, `complete`, and `stream` against that daemon
* *THEN* `status` MUST report the backend as available with a model list containing the configured model
* *AND* `complete` MUST resolve to a non-empty string
* *AND* `stream` MUST yield at least one chunk, and the concatenation MUST be non-empty
* *AND* `stream` MUST end without rejecting when the caller aborts the signal mid-response


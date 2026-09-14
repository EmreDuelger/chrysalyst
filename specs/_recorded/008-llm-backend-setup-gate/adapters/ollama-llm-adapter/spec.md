# Feature: ollama_llm_adapter

Gives chrysalyst a working language-inference backend: the first real `LlmPort` implementation, answering whole and streamed completions from a local Ollama daemon and reporting whether that daemon can be reached and which models it holds.

## Background

<!-- DELTA:CHANGED -->

The adapter lives in `packages/server` and is the only place that knows a language model is reached over HTTP. It speaks the OpenAI wire format to a loopback endpoint, so Ollama, LM Studio, and a llama.cpp server differ by configuration rather than by implementation. `@chrysalyst/core` never imports it; the domain sees only `LlmPort`.

Configuration is a base URL and a default model, read from `CHRYSALYST_LLM_BASE_URL` and `CHRYSALYST_LLM_MODEL`, defaulting to Ollama's `http://127.0.0.1:11434/v1` and `llama3.2:3b`. The endpoint carries no credential: chrysalyst runs against a loopback daemon that authenticates nobody.

The name a person is shown for that backend is resolved from `CHRYSALYST_LLM_BACKEND_NAME` here as well, beside the defaults it belongs with, and defaults to `Ollama` because that is the backend the default base URL points at. It is resolved by a sibling of the adapter's own configuration resolver rather than being part of that configuration: the adapter never sends it, and `LlmPort` never carries it, because the port's contract is that no caller above it learns which backend is answering. `platform/backend-status` is what shows the name.

Tests run in two tiers. The default tier is hermetic — it injects a `fetch` stub and needs no daemon. The `live` tier lives in files named `*.live.test.ts`, needs a running Ollama, and runs only when `CHRYSALYST_LIVE_LLM` is set.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:CHANGED -->

### Scenario: Ollama's defaults come from the environment

* *GIVEN* an environment declaring none of `CHRYSALYST_LLM_BASE_URL`, `CHRYSALYST_LLM_MODEL` and `CHRYSALYST_LLM_BACKEND_NAME`
* *WHEN* the adapter's configuration and the backend's display name are resolved from that environment
* *THEN* the base URL MUST be `http://127.0.0.1:11434/v1`, the default model MUST be `llama3.2:3b`, and the display name MUST be `Ollama`
* *AND* an environment that sets any of the three variables MUST override the matching default
* *AND* the display name MUST NOT appear in the adapter's configuration, so no issued request can carry it
* *AND* neither resolver MUST read any file, so no dotenv loader enters the dependency set

<!-- /DELTA:CHANGED -->

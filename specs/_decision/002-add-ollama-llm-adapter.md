# Decisions: add-ollama-llm-adapter

## ADR: The LlmPort adapter is built on Vercel AI SDK v6 with @ai-sdk/openai-compatible

**ID:** llm-adapter-on-ai-sdk-openai-compatible
**Plan:** add-ollama-llm-adapter
**Status:** Accepted

### Context

`LlmPort` had no implementation. Milestone M1 makes it real, because the mission's central claim — a small local model can conduct a structured interview — is falsifiable only against a running model. The backend must be reached without a cloud vendor SDK, over loopback, and `packages/core` must never learn how. Ollama, LM Studio, and a llama.cpp server all serve the OpenAI wire format on loopback, so the transport choice also decides how many adapters the later backends need.

### Decision

`packages/server` reaches every local inference backend through `ai` v6 plus `@ai-sdk/openai-compatible`, speaking the OpenAI wire format to a loopback `/v1` endpoint. `@ai-sdk/openai-compatible` is a generic client for that wire format — no OpenAI endpoint, no credential, no `Authorization` header when no key is configured — so it does not breach the roadmap's "no cloud LLM SDK" guardrail, which forbids the Anthropic and OpenAI vendor SDKs. The SDK pair owns SSE framing, message encoding, and abort plumbing; `status` bypasses both packages and issues a plain `GET <base URL>/models` through the same injected `fetch`. The adapter always passes a `createOpenAICompatible(...)` model instance, never a bare string, so `ai@6`'s transitive `@ai-sdk/gateway` dependency reaches no hosted-inference endpoint. `packages/core` imports none of it.

### Options Considered

| Option | Verdict |
|--------|---------|
| `ai` v6 + `@ai-sdk/openai-compatible` against a loopback `/v1` endpoint | ✓ Chosen — official Vercel packages, no community provider code; the least Ollama-specific route also generalises to LM Studio and llama.cpp, and `ai` owns the structured-output path M10 needs |
| Ollama's native `/api/chat` with a hand-written client | ✗ Rejected — the one route that generalises to no other backend, and it puts SSE framing and abort plumbing in our code |
| The two community `ollama-ai-provider` packages | ✗ Rejected — the interview ruled out community provider code |
| A direct `fetch` client with no SDK | ✗ Rejected — token streaming and cancellation are exactly the parts the roadmap wanted vetted rather than hand-rolled |

### Consequences

A second and third backend become a base-URL configuration value rather than a new module. M10 inherits the structured-output path instead of relitigating it. `packages/server` gains three runtime dependencies (`ai`, `@ai-sdk/openai-compatible`, `zod`). One hosted-inference client (`@ai-sdk/gateway`) enters the dependency tree but is unreachable by construction.

## ADR: The SDK is pinned to the ai-v6 release line, not to latest

**ID:** ai-sdk-pinned-to-v6-line
**Plan:** add-ollama-llm-adapter
**Status:** Accepted

### Context

The roadmap guardrail names `ai` v6. `latest` is `ai@7.0.93` with `@ai-sdk/openai-compatible@3.0.44`. `@ai-sdk/openai-compatible@3.x` builds on `@ai-sdk/provider@4`, which is `ai` v7's provider generation; a plain `^2` range on the openai-compatible package resolves straight into 3.x and puts two provider generations in one tree silently. `zod` is a required peer of both packages, and an implicit peer is invisible to the workspace's catalog assertion.

### Decision

Pin `ai` at exactly `6.0.277` and `@ai-sdk/openai-compatible` at exactly `2.0.74` — the pair the vendor's `ai-v6` dist-tag names — with `zod` at `^4.5.4` declared explicitly as their shared peer. All three enter the `catalog:` block of `pnpm-workspace.yaml`. Verified by installing the three under `--strict-peer-deps`: one `@ai-sdk/provider@3.0.15` in the tree.

### Options Considered

| Option | Verdict |
|--------|---------|
| Exact pins `6.0.277` / `2.0.74`, `zod ^4.5.4` declared | ✓ Chosen — holds the single-provider-generation pairing the caret ranges cannot; the v6 line is still actively patched, so the pin costs no security currency |
| `latest` for both (`ai@7`, `@ai-sdk/openai-compatible@3`) | ✗ Rejected — the roadmap fixes v6; a v7 move changes a fixed guardrail and belongs in its own plan |
| Caret ranges `^6` and `^2` | ✗ Rejected — `^2` resolves into 3.x and breaks the provider-generation pairing silently |
| Rely on pnpm's automatic peer install for `zod` | ✗ Rejected — an implicit peer is invisible to the workspace's catalog assertion |

### Consequences

The project tracks the v6 line deliberately; a v7 migration is a separate plan. Version bumps for the pair happen in the catalog. `zod` is declared even though this plan ships no schema.

## ADR: The live test tier is a runtime environment gate plus a filename convention

**ID:** live-test-tier-env-gate-and-filename-convention
**Plan:** add-ollama-llm-adapter
**Status:** Accepted

### Context

Some tests need a real backend; most machines and every CI runner have none. The mission documents a single test command that must work everywhere. A test that needs a daemon must be recognisable at a glance and must not rot behind a config flag nobody flips. Milestone M4 builds the CI tier logic against whatever convention M1 sets.

### Decision

Tests that need a real backend live in files named `*.live.test.ts`, and each guards its suite with `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`. Any non-empty value enables the tier; an unset variable and an empty string both leave it disabled. Live files contain no top-level `await`, so a run that skips them contacts nothing. `tests/workspace.test.ts` enforces both rules for every matching file in the workspace and evaluates each extracted guard expression against `''`, `undefined`, and `'1'` using `runInNewContext` from `node:vm`; `new Function` is forbidden because `@typescript-eslint/no-implied-eval` is active for test files.

### Options Considered

| Option | Verdict |
|--------|---------|
| `*.live.test.ts` + `skipIf((… ?? '') === '')`, enforced by the workspace suite | ✓ Chosen — one test command everywhere; Vitest still collects the file, so a live test that stops compiling fails the ordinary run rather than hiding |
| Exclude the pattern from the Vitest config | ✗ Rejected — the env flag could then not unlock the suite without branching the config, and an excluded file rots unnoticed |
| A Vitest project or tag | ✗ Rejected — more machinery than one boolean needs, and it fragments the single documented test command |
| `skipIf(process.env.CHRYSALYST_LIVE_LLM === undefined)` | ✗ Rejected — an empty assignment yields `''`, which that predicate enables, landing the live suite on a daemon-less runner |
| Assert the skip behaviour by meta-testing a Vitest run | ✗ Rejected — slow and brittle; evaluating the guard expression itself is neither |

### Consequences

One test command works on every machine, with or without a daemon. A green ordinary run beside a skipped live suite proves the gate works, not that the adapter reaches a model. M4 builds CI against this convention.

## ADR: The shared base for later backends is parameterisation, not a base layer

**ID:** llm-backend-shared-base-by-parameter
**Plan:** add-ollama-llm-adapter
**Status:** Accepted

### Context

The interview asked for a shared base for the later LM Studio and llama.cpp backends. The roadmap schedules no llama.cpp or LM Studio milestone through M18, so any inheritance layer would be built for callers that do not exist. Ollama's defaults are three lines.

### Decision

One module, `packages/server/src/adapters/llm/openai-compatible-llm.ts`, exports `createOpenAiCompatibleLlm(config)` and `llmConfigFromEnv(env)`. Base URL and default model are configuration, not subclasses. A second backend adds a sibling resolver beside `llmConfigFromEnv`, not a second module or an interface to extend. The mission's "je ein Adapter für Ollama, llama.cpp und LM Studio" reads as one adapter instance per backend rather than one file per backend.

### Options Considered

| Option | Verdict |
|--------|---------|
| One backend-neutral module; Ollama's defaults live in `llmConfigFromEnv` | ✓ Chosen — generality by parameter costs nothing today; what a later backend moves is three lines of defaults, not a layer |
| A base module plus a thin `ollama.ts` supplying the defaults | ✗ Rejected — the second file's whole body would be a call to the first with different constants |
| An abstract provider class with per-backend subclasses | ✗ Rejected — speculative: an inheritance layer built for callers no milestone through M18 schedules |

### Consequences

A second backend is a base-URL configuration value plus a sibling resolver. The module carries one Ollama-specific fact — the defaults in `llmConfigFromEnv` — and a scenario drives it against a non-Ollama base URL to prove the request paths are backend-neutral.

# Verification Report: add-ollama-llm-adapter

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | `LlmPort` has its first adapter. All eight § Checklist rows pass, including one live run against a real Ollama daemon. Live tier ran against `qwen3:8b` because `llama3.2:3b` is not pulled on the host — one deviation, recorded below. |
| Code review | 4 findings — 4 fixed |

| Check | Status |
|-------|--------|
| Build | ✓ |
| Tests | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | ✓ (one row substituted) |

## Test Evidence

### Coverage

| File | % Stmts | % Branch | % Funcs | % Lines |
|------|---------|----------|---------|---------|
| `packages/server/src/adapters/llm/openai-compatible-llm.ts` | 100 | 94.11 | 100 | 100 |
| `packages/server` (all files) | 97.01 | 91.89 | 100 | 96.96 |

The two uncovered adapter branches are the `config.fetch ?? globalThis.fetch` fallback (every hermetic test injects a stub) and `withTrailingSlash`'s already-slashed arm. No coverage threshold is configured; no threshold failed.

### Test Results

| Suite | Run | Passed | Skipped |
|-------|-----|--------|---------|
| Hermetic — `pnpm -r --include-workspace-root test` | 44 | 43 | 1 (live tier, gate working) |
| Live — `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 44 | 44 | 0 |
| Adapter file alone — `openai-compatible-llm.test.ts` | 11 | 11 | 0 |

Per package on the hermetic run: `@chrysalyst/core` 12/12, `@chrysalyst/server` 17/17 + 1 skipped, `@chrysalyst/web` 2/2, workspace root 12/12.

### Manual Tests

| Test | Result |
|------|--------|
| `pnpm --filter @chrysalyst/server test` with no daemon, no flag — hermetic pass, live file skipped, no socket opened | ✓ |
| `curl -s http://127.0.0.1:11434/v1/models` — `{"object":"list","data":[…]}` with `id` per entry | ✓ |
| `CHRYSALYST_LIVE_LLM=1 …` with the daemon running — live suite runs and passes, nothing skipped | ✓ (model `qwen3:8b`) |
| `node -e` one-liner — `status()` prints `{ available: true, models: [...] }`, then `stream` delivers "Red, Blue, Green." token by token | ✓ |
| Same one-liner against a dead endpoint — `status()` prints `{ available: false, models: [] }`, then `stream` throws `Cannot reach the language model at http://127.0.0.1:1234/v1` with the transport error as `cause`; `status` never threw, no unhandled rejection | ✓ |
| `CHRYSALYST_LLM_BASE_URL=… node -e "…llmConfigFromEnv()"` — prints the overridden base URL alongside the default model | ✓ |
| `pnpm -r --include-workspace-root test` clean, no daemon — 0 failures, live tests in the skipped count | ✓ |
| Windows-host `ollama pull llama3.2:3b` then `ollama list` | substituted — see Notes |

## Tool Evidence

### Linter

```
$ eslint .
(exit 0 — no output, 0 errors, 0 warnings)
```

### Formatter

```
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

`.mcp.json` carried a pre-existing Prettier violation (committed at `1d15572`, unrelated to this plan). Fixed in passing as a config one-liner — the `args` array folded to one line.

### Build / Typecheck

```
$ pnpm -r build        → exit 0 (core, web, server)
$ pnpm typecheck       → exit 0
```

### Install

```
$ pnpm install → exit 0
lockfile: ai 6.0.277, @ai-sdk/openai-compatible 2.0.74, one @ai-sdk/provider 3.0.15
```

## Scenario Coverage

| Domain | Feature | Scenario | Test Location | Test Name | Passes |
|--------|---------|----------|---------------|-----------|--------|
| adapters | ollama-llm-adapter | Adapter returns a whole response for a request | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` | `completes a request against the chat completions endpoint` | Pass |
| adapters | ollama-llm-adapter | Adapter streams response chunks in order | same | `yields streamed deltas in order` | Pass |
| adapters | ollama-llm-adapter | A cancelled stream stops without failing | same | `ends the stream on abort without rejecting` | Pass |
| adapters | ollama-llm-adapter | A cancelled completion rejects | same | `rejects a completion with AbortError once the signal aborts` | Pass |
| adapters | ollama-llm-adapter | Status reports a reachable backend and its model inventory | same | `reports an available backend and lists its models in order` | Pass |
| adapters | ollama-llm-adapter | Status separates an unreachable backend from a cancelled probe | same | `resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe` | Pass |
| adapters | ollama-llm-adapter | An unreachable backend fails a completion with the endpoint named | same | `rejects complete and stream naming the base URL with the transport error as cause` | Pass |
| adapters | ollama-llm-adapter | An unreachable backend fails a completion with the endpoint named (mid-stream drop) | same | `rejects a stream whose connection drops after the answer began, naming the base URL` | Pass |
| adapters | ollama-llm-adapter | A cancelled stream stops without failing (drop follows abort) | same | `ends a stream quietly when the dropped connection follows the caller aborting` | Pass |
| adapters | ollama-llm-adapter | The adapter targets any OpenAI-compatible endpoint | same | `issues only OpenAI-compatible paths against the configured base URL with no Authorization header` | Pass |
| adapters | ollama-llm-adapter | Ollama's defaults come from the environment | same | `defaults to Ollama on loopback and lets each variable override` | Pass |
| adapters | ollama-llm-adapter | A running Ollama answers through the port | `packages/server/src/adapters/llm/openai-compatible-llm.live.test.ts` | `answers status, complete, stream and a mid-stream abort against a real daemon` | Pass (live, `qwen3:8b`) |
| platform | llm-port | LlmPort reports backend availability | `packages/core/src/ports/ports.test.ts` | `reports an unavailable backend with its model list` | Pass |
| platform | monorepo-workspace | Live-tier tests are gated by an environment flag | `tests/workspace.test.ts` | `every live test file gates on CHRYSALYST_LIVE_LLM and awaits nothing at module scope` | Pass |
| platform | monorepo-workspace | Live-tier tests are gated / An empty live-tier flag leaves the tier disabled | `tests/workspace.test.ts` | `every live guard expression skips for unset and empty and runs for any value` | Pass |

The two new hermetic scenarios (`rejects a stream whose connection drops after the answer began` and `ends a stream quietly when the dropped connection follows the caller aborting`) came from code-review finding 4 — they pin both arms of `stream`'s catch block, which the plan's method sketch left implicit.

## Notes

**Deviation — live model.** The plan (§ Requirements "Live-tier prerequisite", spec scenario "A running Ollama answers through the port") pins `llama3.2:3b`. That model is not pulled on the host; available models are `gemma4:12b`, `qwen3:8b`, `qwen3.8:latest`, `qwen3.8-reliable:latest`. On the user's instruction the live tier ran with `CHRYSALYST_LLM_MODEL=qwen3:8b`. This exercises the identical adapter code path — `createOpenAICompatible` model instance, `generateText`, `streamText().textStream`, `/v1/models` probe — against a real daemon; only the model id differs. The live suite reads `defaultModel` from `llmConfigFromEnv()`, so the override flows through `status` (asserts the list contains the configured model), `complete`, and `stream` without a test edit. Re-running with `llama3.2:3b` once pulled needs no code change.

**Deviation — three plan `§ Dependencies` facts corrected during implementation.** The plan asserted `textStream` throws on a pre-stream transport failure; it does not — it ends quietly and routes the error to `onError`. The adapter's `stream` captures that error and throws after the loop, and also catches a mid-stream `ECONNRESET` that `textStream` *does* throw. Both throw sites are covered by hermetic tests. Abort detection keys on `signal.aborted`, not the error name, so a custom abort reason is not misclassified as a transport failure. Full reasoning in the implementer return and code-review adjudication.

**Deviation — `llmConfigFromEnv` empty-string handling (code-review finding 2).** `CHRYSALYST_LLM_BASE_URL=''` or `CHRYSALYST_LLM_MODEL=''` now falls back to the default, matching the `CHRYSALYST_LIVE_LLM` empty-means-off convention the plan established. The plan spec named this behaviour only for the live flag; the fix makes all three variables consistent.

**Environment.** WSL2 mirrored networking (`.wslconfig` `[wsl2] networkingMode=mirrored`; a header typo blocked it initially) makes the Windows-host Ollama reachable at `127.0.0.1:11434`. NAT mode cannot reach it.

**Spec-delta reminder for `/speq:record`.** Three edits fall outside the deltas and are already applied: `packages/core/src/ports/llm.ts` doc comment, `specs/roadmap.md` § M1 (three lines), and the `specs/platform/llm-port/spec.md` § Background replacement (delta marker is `DELTA:CHANGED` on a non-scenario block — `/speq:record` must replace the paragraph).

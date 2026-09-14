# Decisions: llm-backend-setup-gate

## ADR: Readiness is decided above `LlmPort`, and the port keeps its result

**ID:** readiness-decided-above-llm-port
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

`LlmPort.status` reports a reachable backend as available even when it holds no model. Telling "unreachable" apart from "reachable but missing the configured model" needs the configured default model as a second input, which the port's contract forbids it from learning — that contract also forbids the port from learning the backend's display name, the rule's other input.

### Decision

`LlmPort` and `LlmBackendStatus` are unchanged. A new `packages/server` module, `backend-readiness.ts`, probes the port and compares the reported inventory against the configured default model, producing `ready`, `unreachable`, or `model-missing`. `packages/core` is not edited.

### Options Considered

| Option | Verdict |
|--------|---------|
| A server-side module comparing the port's inventory against the configured model | ✓ Chosen — the port answers what it observed; the deployment's configured model is a fact about the deployment, not the backend |
| Extend `LlmBackendStatus` with the model the adapter would send by default | ✗ Rejected — every `LlmPort` double would carry a field the domain never reads |
| Put the readiness rule in `packages/core` | ✗ Rejected — the rule's other input is a display name, which the port's contract forbids it from learning |

### Consequences

Which surface refuses to start an interview stays a delivery decision, not a domain rule. A future second backend adapter needs no change to this comparison.

## ADR: The backend's display name is server configuration and never crosses the port

**ID:** backend-display-name-server-configuration
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

The setup screen needs to name the backend a person configured — "Ollama", not `http://127.0.0.1:11434/v1` — so a person recognises what to start. `platform/llm-port` states that no caller above the port learns which backend is answering.

### Decision

`CHRYSALYST_LLM_BACKEND_NAME` is resolved by `llmBackendNameFromEnv`, a sibling of `llmConfigFromEnv` in the adapter module, defaulting to `Ollama`. It is not a field of `OpenAiCompatibleLlmConfig` and never appears in `LlmPort` or in any issued request.

### Options Considered

| Option | Verdict |
|--------|---------|
| A sibling resolver beside the adapter's config resolver, name never sent | ✓ Chosen — keeps the port's contract intact and the default beside the defaults it belongs with |
| A `backendName` field on `OpenAiCompatibleLlmConfig` | ✗ Rejected — the adapter never reads it, and every caller would owe a value for nothing |
| Carry the name in `LlmBackendStatus` | ✗ Rejected — falsifies the port's stated invariant that no caller learns which backend answers |
| Derive the name from the base URL | ✗ Rejected — would guess, and guess wrong for a llama.cpp server on Ollama's port |

### Consequences

A display name exists in chrysalyst for the first time, scoped to a label rather than a new adapter axis. Someone running LM Studio sets one variable and the guidance names it correctly.

## ADR: The probe is bounded at 2.0 seconds, and the route owns that deadline

**ID:** backend-probe-deadline-2s-route-owned
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

A stopped Ollama on loopback refuses a connection in milliseconds, but a base URL pointing at a host that accepts a connection and never answers would hold the asking page open indefinitely. `LlmPort.status` carries no deadline of its own.

### Decision

`readBackendReadiness` probes with a signal it owns — an `AbortController` aborted by a `setTimeout(…, 2_000)` that every settle path clears — and reports `unreachable` when the deadline fires. The browser sets no timeout of its own; it inherits the bound by asking a route that is already bounded.

### Options Considered

| Option | Verdict |
|--------|---------|
| One deadline, owned by the route, built from `AbortController` and `setTimeout` | ✓ Chosen — one owner, and `setTimeout` routes through the fake-timer clock the deadline's own test needs |
| No deadline | ✗ Rejected — a swallowing host would hang the page the gate exists to keep usable |
| A deadline in the browser client | ✗ Rejected — two numbers to keep in agreement is one more way for them to disagree |
| `AbortSignal.timeout` | ✗ Rejected — holds a native timer no fake-timer clock can reach, making the deadline untestable |

### Consequences

A loopback probe that needs more than two seconds is treated as a fault either way, with no configuration knob to reconsider that judgment.

## ADR: `/status` is a separate route from `/health`, and answers `200` for every outcome it observed

**ID:** status-route-separate-200-always
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

`/health` reports the server process alive and reaches no dependency; a person also needs to know whether the language-model backend can hold an interview right now.

### Decision

`GET /health` keeps its contract and reaches no dependency. `GET /status` reaches the backend and answers `200` with `{ ready, backend, model }`, plus `reason` when blocked, for every outcome it observed — including when the backend is down.

### Options Considered

| Option | Verdict |
|--------|---------|
| A separate `/status` route, always `200` | ✓ Chosen — mirrors `LlmPort.status`, which resolves for every outcome it observed |
| Fold the daemon probe into `/health` | ✗ Rejected — would report the server dead whenever Ollama is stopped, the confusion this milestone removes |
| Answer `503` when not ready | ✗ Rejected — a browser `fetch` would present a successful diagnosis as a transport error |

### Consequences

A supervisor or container probe asking `/health` never depends on a daemon the server does not own. A browser reads `/status`'s body directly instead of reconstructing meaning from a status code.

## ADR: The gate sits in front of the mount, in the shell, and the interview view is untouched

**ID:** setup-gate-in-shell-view-untouched
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

`interview/interview-view` creates its session the moment it renders. A banner above an unconditionally mounted view still produces a session folder and a failed inference against a stopped backend.

### Decision

`App` renders exactly one of a checking state, `SetupGuide`, and `InterviewView`, decided by the status probe. `interview/interview-view` gets no delta.

### Options Considered

| Option | Verdict |
|--------|---------|
| The shell mounts nothing until the probe answers ready | ✓ Chosen — the only way to keep a blocked start-up from creating a session |
| Mount the view optimistically and swap to the setup screen on a blocked answer | ✗ Rejected — produces the session folder and failed inference this milestone removes, with an apology added |
| Put the gate inside the view | ✗ Rejected — would give the view a probe it has no business making and break its existing contract |

### Consequences

`InterviewView` keeps its contract, its tests, and its ownership of the interview API untouched. The shell owns exactly the start-up decisions it already owned — language and, now, readiness.

## ADR: The impeccable subphase runs inside `/speq:plan`, code-led, with its finish review carried by a direction contract

**ID:** impeccable-subphase-code-led-in-plan
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

Round 1 plan review found the impeccable subphase deferred into implementation, against `CLAUDE.md`'s standard route and the M3 precedent, with no carrier past `/speq:record` for the deferred work — task 13 would have been archived with the plan while § Impact marked the milestone done unconditionally. No image generation is available in this harness, so a comp-based subphase cannot run as `CLAUDE.md` ordinarily expects.

### Decision

The subphase runs inside `/speq:plan`, code-led. The `impeccable` skill's own contract for a code-led build puts the ambition in a direction contract and a named signature interaction instead of a comp. The contract is recorded at `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md`, and the implementation task that styles against it finishes through the skill's code-led flow — screenshot inspection, `impeccable detect`, `impeccable-finish-reviewer`, then `impeccable-documenter`.

### Options Considered

| Option | Verdict |
|--------|---------|
| Code-led subphase inside `/speq:plan`, contract recorded and cited by the styling task | ✓ Chosen — matches the skill's own contract for a build with no image generation available |
| Defer the subphase into implementation | ✗ Rejected — round 1's finding: no carrier for the deferred work past record, and against the standard route |
| Skip the subphase entirely | ✗ Rejected — the UI feature would ship with no design direction at all |

### Consequences

Every UI-bearing plan in this harness now has a precedent for a code-led design subphase run inside planning rather than deferred, with the finish review's evidence requirement — a real browser capture — stated explicitly rather than assumed.

## ADR: Task 13's finish review is conditional on a browser capture, and its absence routes the unfinished styling to M18

**ID:** finish-review-conditional-on-browser-capture
**Plan:** llm-backend-setup-gate
**Status:** Accepted

### Context

Round 2 plan review found that task 13's finish review — the `impeccable` skill's code-led flow — opens with a screenshot capture this repository's own `playwright-chrome-blocked` note already predicts will fail: the Playwright MCP is pinned to the `chrome` channel, `/opt/google/chrome/chrome` is absent, and installing it needs a root shell this sandbox does not grant. § Impact had marked the milestone done unconditionally, leaving no artifact to hold the unfinished styling past archival.

### Decision

Task 13 checks for a working browser — `/opt/google/chrome/chrome` present, or the Playwright MCP's `browser_navigate` succeeding against `pnpm dev` — before its finish round. On failure, it stops once the styling itself is done, records the finish review as unrun rather than self-certified, and § Impact makes `/speq:record` mark the milestone done only when that review ran; otherwise it appends the open finish review and the browser-dependent manual-testing row to the milestone that owns the consolidating design pass, naming this plan.

### Options Considered

| Option | Verdict |
|--------|---------|
| A named browser check, a conditional § Impact clause, and an explicit carrier milestone for the unrun review | ✓ Chosen — leaves no unfinished work unnamed past archival |
| Mark the milestone done regardless | ✗ Rejected — round 2's finding: the unfinished styling would disappear with the plan's archive |
| Invent a substitute for the browser capture | ✗ Rejected — the `impeccable` skill forbids inventing a substitute for a capture it cannot get |

### Consequences

A plan whose finish review cannot run in this sandbox still records exactly what was and was not verified, and the open work has one named home rather than none.

# Decision Log: llm-backend-setup-gate

## Interview

**Q:** Wo soll der Status-Check ansetzen, der neue Interviews blockiert?
**A:** Eigene `GET /status`-Route, und die Web-Shell prüft sie beim Mount. Nicht als Gate an `POST /sessions`, und nicht beides — nur die dedizierte Pre-Flight-Route. Die Shell ruft sie auf, bevor sie die `InterviewView` rendert beziehungsweise bevor eine Session angelegt wird, und zeigt stattdessen den Setup-Screen, wenn das Backend nicht bereit ist.

**Q:** Zählt »Backend erreichbar, aber konfiguriertes Modell fehlt in der Liste« auch als blockierter Zustand?
**A:** Ja — Modell-Präsenz ist Teil des Gates. `LlmPort.status()` meldet laut `platform/llm-port` und `adapters/ollama-llm-adapter` `available: true` allein aufgrund von Erreichbarkeit und prüft nicht, ob das konfigurierte Modell in der gemeldeten Liste steht; ein erreichbares Backend ohne jedes Modell meldet weiterhin `available: true` mit leerer Liste. Die neue Status-Logik muss das konfigurierte Default-Modell (über `llmConfigFromEnv` → `CHRYSALYST_LLM_MODEL`, Default `llama3.2:3b`) selbst gegen die gemeldete Liste halten und »erreichbar, aber Modell fehlt« als eigenen, von »nicht erreichbar« unterscheidbaren blockierten Zustand behandeln, damit der Setup-Screen benennen kann, welches der beiden falsch liegt.

**Q:** Wie wird »das gewählte Backend« im Setup-Screen benannt?
**A:** Ein konfigurierbarer Anzeigename soll eingeführt werden, nicht die rohe Base-URL — ausdrücklich, damit eine Person erkennt »das gehört zu Ollama« gegenüber »das ist irgendwo anders«. Konkret: eine neue umgebungsgesteuerte Anzeige-Bezeichnung (etwa `CHRYSALYST_LLM_BACKEND_NAME`, die genaue Benennung liegt bei Planung und Umsetzung) neben `CHRYSALYST_LLM_BASE_URL` und `CHRYSALYST_LLM_MODEL`, mit sinnvollem Default (etwa `Ollama`, passend zur bestehenden Default-Base-URL auf Ollamas Loopback-Port), wenn nichts gesetzt ist. Der Setup-Screen zeigt diesen Namen plus das fehlende beziehungsweise unerreichbare Detail. Der heutige Adapter ist im Code vollständig backend-neutral (`openai-compatible-llm.ts` kennt nur `baseUrl` und `defaultModel`, nirgends ein Backend-Identitätsbegriff) — dieser Plan führt den ersten Backend-Identitätsbegriff ein, eng begrenzt auf ein Anzeige-Label, nicht als neue Adapter-Achse.

**Q:** Wie wird »bestehende Sessions bleiben lesbar« beobachtbar, da M17 (Session-Bibliothek) noch nicht existiert?
**A:** Nur auf Backend- beziehungsweise Dateisystem-Ebene: `SessionStorePort` lädt weiter, keine UI nötig. Das Abnahmekriterium wird durch einen Test auf Store-, Adapter- oder Routen-Ebene erfüllt, der zeigt, dass Zustand und Transkript einer bereits persistierten Session von der LLM-Verfügbarkeit unberührt und unabhängig ladbar sind. In diesem Plan entsteht kein Session-öffnen-per-ID-Pfad in der UI — das ist M17.

## Design Decisions

### [1] Readiness is decided above `LlmPort`, and the port keeps its result

- **Decision:** `LlmPort.status` and `LlmBackendStatus` are unchanged. A new `packages/server` module, `backend-readiness.ts`, probes the port and compares the reported inventory against the configured default model, producing `ready`, `unreachable`, or `model-missing`. `packages/core` is not edited by this plan.
- **Alternatives:** Extending `LlmBackendStatus` with the model the adapter would send by default, so the comparison could be made anywhere; putting the readiness rule in `packages/core`.
- **Rationale:** The port reports what it observed of the backend. The configured default model is a fact about this deployment, not about the backend, and adding it to the port's result would make every `LlmPort` double carry a field the domain never reads. Putting the rule in `core` would be worse still: the rule's other input is a display name, which the port's own contract forbids it from learning. Nothing here is a domain rule — which surface refuses to start an interview is a delivery decision.
- **Promotes to ADR:** yes

### [2] The backend's display name is server configuration and never crosses the port

- **Decision:** `CHRYSALYST_LLM_BACKEND_NAME` is resolved by `llmBackendNameFromEnv`, a sibling of `llmConfigFromEnv` in the adapter module, defaulting to `Ollama`. It is not a field of `OpenAiCompatibleLlmConfig`, and it never appears in `LlmPort` or in any issued request.
- **Alternatives:** A `backendName` field on `OpenAiCompatibleLlmConfig`; carrying the name in `LlmBackendStatus`; deriving the name from the base URL; showing the base URL itself.
- **Rationale:** `platform/llm-port` states that no caller above the port learns which backend is answering, and the adapter's doc comment repeats it. A display name is presentation and stops at the delivery layer. Putting it in the adapter's config would give the adapter a field it never reads and every caller a value to supply for nothing; the module still owns the default, because it is already the single place Ollama's loopback defaults are written down. Deriving the name from the URL would guess, and guess wrong for a llama.cpp server on Ollama's port.
- **Promotes to ADR:** yes

### [3] The model comparison is exact string equality

- **Decision:** A backend is ready only when its reported inventory contains the descriptor's model id character for character. `llama3.2:latest` does not satisfy `llama3.2:3b`.
- **Alternatives:** Prefix matching; ignoring the tag; treating any non-empty inventory as ready.
- **Rationale:** The adapter sends `request.model ?? config.defaultModel` verbatim. A tolerant gate would pass and then fail the inference, turning a setup step back into the error frame this milestone replaces. The cost — a person who writes `llama3.2` for `llama3.2:latest` is told the model is missing — is a true statement about the request chrysalyst would send. The live-tier case exists to hold this rule against a real `/v1/models` payload rather than against a stub.
- **Promotes to ADR:** no

### [4] The probe is bounded at 2.0 seconds, and the route owns that deadline

- **Decision:** `readBackendReadiness` probes with a signal it owns — an `AbortController` aborted by a `setTimeout(…, 2_000)` that every settle path clears — and reports `unreachable` when the deadline fires. The browser sets no timeout of its own.
- **Alternatives:** No deadline, relying on connection refusal being fast; a deadline in the browser client; a configurable deadline; `AbortSignal.timeout`, which reads better and is untestable, per the Review Findings entry below.
- **Rationale:** A stopped Ollama on loopback refuses in milliseconds, but a base URL pointing at a host that accepts a connection and never answers would hold the page open indefinitely — the hang M6 exists to prevent, and the one `LlmPort.status` carries no protection against. One owner keeps two numbers from disagreeing, and the browser inherits the bound by asking a route that is already bounded. A configuration parameter would be a decision the module declined to make: a loopback probe that needs more than two seconds is a fault either way.
- **Promotes to ADR:** yes

### [5] A rejected probe and an expired deadline both answer `unreachable`

- **Decision:** `readBackendReadiness` never rejects. Any rejection from `LlmPort.status` — the adapter's cancelled-probe rejection included — becomes `unreachable`.
- **Alternatives:** A third fault for "the probe failed"; letting the rejection escape to the route.
- **Rationale:** The adapter rejects a cancelled probe precisely because it learned nothing, and the deadline's cancellation is the only cancellation this module can suffer, since it creates the signal itself. A probe that learned nothing and a backend that is down leave the person the same single action, so a third name on the wire would be a distinction without a difference. A rejection escaping the route would produce a `500` for a machine that is merely not set up yet.
- **Promotes to ADR:** no

### [6] `createApp` takes the backend descriptor as a second parameter

- **Decision:** `createApp(deps, backend)`. The composition root resolves the descriptor from the environment and passes it; the status route reads it and the interview routes do not.
- **Alternatives:** Resolving `llmConfigFromEnv` inside the route; bundling `{ core, backend }` into one argument; passing a pre-bound readiness function instead of the descriptor.
- **Rationale:** Reading the environment inside a route puts a second independent resolution behind an HTTP handler — the back-door leakage `/speq:design-philosophy` names, where two modules assume the same configuration with nothing holding them together. Bundling would restructure `composition.test.ts` and every call site for no gain. A pre-bound function would read well but would move the readiness rule out of reach of the route tests, which are what prove the deadline and the fault mapping at the surface a browser calls.
- **Promotes to ADR:** no

### [7] `/status` is a separate route from `/health`, and answers `200` for every outcome it observed

- **Decision:** `GET /health` keeps its contract and reaches no dependency. `GET /status` reaches the backend and answers `200` with `{ ready, backend, model }` plus `reason` when blocked, including when the backend is down.
- **Alternatives:** One route reporting both; answering `503` when the backend is not ready.
- **Rationale:** `/health` is what a supervisor asks; folding a daemon probe into it would report the server dead whenever Ollama is stopped, which is the confusion M6 exists to remove. A `503` would make a browser `fetch` present a successful diagnosis as a transport error, and the client would have to reconstruct the distinction from a status code. `LlmPort.status` already draws this line — it resolves for every outcome it observed — and the route mirrors it.
- **Promotes to ADR:** yes

### [8] The gate sits in front of the mount, in the shell, and the interview view is untouched

- **Decision:** `App` renders exactly one of a checking state, `SetupGuide`, and `InterviewView`, decided by the probe. `interview/interview-view` gets no delta.
- **Alternatives:** Mounting the view optimistically and swapping to the setup screen when a blocked answer arrives; putting the gate inside the view; a banner above a mounted view.
- **Rationale:** The view creates its session the moment it renders. Anything short of not-mounting produces a session folder and a failed inference on every load against a stopped backend — the behaviour this milestone removes, with an apology added. Keeping the gate in the shell also keeps the view's contract, its tests and its ownership of the interview API intact.
- **Promotes to ADR:** yes

### [9] The gate is a pre-flight for the person, not an authorisation boundary

- **Decision:** `POST /interview` is unchanged and still creates a session for any caller. A question requested against a stopped backend still arrives as an `error` frame.
- **Alternatives:** Refusing session creation when the backend is blocked; doing both.
- **Rationale:** The clarifying interview chose the pre-flight route and rejected the gate at creation. It is also the better boundary: `POST /interview` is specified to perform no inference and answer immediately, and making it probe would put a socket in the one route whose contract says it opens none. The gate keeps a person out of the failing path rather than making that path unreachable, and the path stays specified and tested for the caller who skips the pre-flight.
- **Promotes to ADR:** no

### [10] Recovery is a re-check and a reload; nothing polls

- **Decision:** The setup screen carries a control that runs the same probe again, and a page reload runs it too because the probe is a mount-time effect holding nothing across mounts. No timer repeats it, and no outcome is written to browser storage.
- **Alternatives:** Reload only, exactly as the roadmap words the criterion; polling on an interval; retry with backoff.
- **Rationale:** The roadmap's bar — start the backend, reload, the interview is free — stays specified and tested. The control costs one state increment on an effect that already exists, and it replaces guidance whose only instruction would be "now reload the page", which is poor advice for the non-technical person the mission is written for. Polling is refused outright: it would probe a stopped daemon indefinitely on the chance that someone starts it, and the person who started it is the one who knows.
- **Promotes to ADR:** no

### [11] A probe that fails on the browser's side is a third blocked state with its raw message

- **Decision:** A status route that cannot be reached, answers a status other than `200`, carries a body the package cannot read, or names a fault the package does not know, blocks the interview and shows its message character for character under a translated label.
- **Alternatives:** Reporting it as `unreachable`; crashing; rendering nothing.
- **Rationale:** Telling a person to start Ollama when the API server is what is down is wrong guidance. Showing the raw message under a dictionary label is the convention `interview/interview-view` established for failure and the boundary `007` recorded — failure text is not localised, whichever side wrote it. It also absorbs a fault name added by a later milestone without a client release.
- **Promotes to ADR:** no

### [12] The existing-session guarantee is proven at the route, not at the store

- **Decision:** One `interview/interview-http-api` scenario creates a session, streams its question, then rebuilds the app over a model whose `status` reports unavailable and whose `complete` and `stream` reject, and asserts the replay, the `204`, the answer on disk, that no inference was reached, and that `GET /status` on the same app reports not ready.
- **Alternatives:** A `SessionStorePort` or filesystem-adapter test; a new session-open-by-id surface.
- **Rationale:** The store has no `LlmPort` and never did, so a store-level assertion of independence would be a test of the type system rather than of behaviour. The route test runs the real replay and answer paths and observes both halves of the claim on one app. A UI path is M17's, which the clarifying interview settled explicitly.
- **Promotes to ADR:** no

### [13] The wire contract is held by a fixture both packages read

- **Decision:** `tests/fixtures/backend-status.json` names the route path, the body's field names and the two fault names. The server's readiness suite and the web package's probe suite each assert against it.
- **Alternatives:** Letting each side restate the shape and relying on review; generating the client from `AppType` with `hc`.
- **Rationale:** `packages/web` declares no workspace package and restates every contract it consumes. `004` answered this for the SSE frames and `007` for the language vocabulary, both with an executable fixture; a third invention would be a third convention. `hc` was already declined in `004` § Consequences and would not type the fault names anyway.
- **Promotes to ADR:** no

### [14] Scope held to the reachable half of the mission constraint

- **Decision:** Export of a blocked session, any session-open-by-id UI, automatic recovery, and any second real backend are out of scope and named as Non-Goals.
- **Alternatives:** Anticipating the export half of the mission's constraint; adding an LM Studio or llama.cpp adapter now that a backend has a name.
- **Rationale:** No export exists before M15, and the roadmap makes the export half M18's acceptance criterion — M6's own »Bewusst offen« note says so. A second backend is configuration of the existing OpenAI-compatible adapter, not a second implementation, and no milestone before v1 schedules one. This plan introduces a display label, which is the smallest thing that satisfies the clarifying interview's answer.
- **Promotes to ADR:** no

## Review Findings

### [plan-review] The impeccable subphase was deferred out of `/speq:plan`

- **Finding:** Round 1 raised `[SCOPE_REDUCTION]` on the Intent Fidelity axis — `review/round-1.md`. § Design Direction moved the impeccable subphase into implementation, against `CLAUDE.md`'s standard route and the M3 precedent. The deferral also had no carrier past `/speq:record`: task 13 would have been archived with the plan while § Impact marked M6 done.
- **Direction change:** Route A of the finding's fix, chosen by the user. The subphase ran inside `/speq:plan`, code-led, because no image generation is available in this harness. The `impeccable` skill's own contract puts a code-led build's ambition in the direction contract and its finish review instead of a comp. The contract is recorded at `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md`. § Design Direction now points at that brief and summarises what tasks 9, 10 and 13 need. Task 13 styles against the contract and finishes through the skill's code-led flow — screenshot inspection, `impeccable detect`, `impeccable-finish-reviewer`, then `impeccable-documenter` on `DESIGN.md` and its sidecar. The deferral rule, task 14's carve-out, the § Manual Testing deferral clause, the Group F exception and § Dependencies' human-step line are gone.
- **Promotes to ADR:** yes

### [plan-review] The deadline was specified in a form its own test cannot reach

- **Finding:** Round 1 raised `[UNSTATED_ASSUMPTION]` on the Feasibility axis — `review/round-1.md`. Task 4 mandated `AbortSignal.timeout(BACKEND_PROBE_DEADLINE_MS)` while task 3 tested the deadline by advancing Vitest's fake timers. The two are jointly infeasible: `AbortSignal.timeout` holds a native timer that never routes through `globalThis.setTimeout`, which is all `vi.useFakeTimers()` replaces. The reviewer reproduced it on Node v22.23.2. The case would have burned 2.0 s of real time and asserted nothing about the bound.
- **Direction change:** The deadline is now an `AbortController` aborted by a `setTimeout` that every settle path clears. Task 3 states why `AbortSignal.timeout` is refused, so a later refactor cannot reintroduce the untestable form. § Key interfaces and § Dependencies were corrected to match, and decision `[4]` above records the mechanism. The decision itself is unchanged — one owner, 2.0 s, reported as `unreachable`.
- **Promotes to ADR:** no

### [plan-review] The re-check's in-flight window was unspecified

- **Finding:** Round 1 raised `[COMPLETENESS_GAP]` on the Requirement Quality axis — `review/round-1.md`. `platform/backend-setup-gate`'s check-again scenario specified the activation and the answer and nothing between them. That window runs up to the full 2.0 s deadline and is the common case against a stopped backend. Both readings of the silence produce the »app feels broken« outcome M6 exists to remove, and neither the control's behaviour during a probe nor the ordering of overlapping probes was stated.
- **Direction change:** A new scenario, `Re-checking shows that it is checking and answers once`, states four things: a re-check enters the same labelled checking state, the earlier fault's text is hidden while the probe is in flight, the control is off screen while a probe is unsettled so no second probe starts, and an answer from a probe the shell stopped waiting on never reaches the screen. The feature's Background carries the one-probe-at-a-time rule. Task 10 names the supersede rule its effect cleanup implements, and § Verification § Scenario Coverage carries the test name.
- **Promotes to ADR:** no

### [plan-review] Task 13's finish review needs a browser this environment does not have

- **Finding:** Round 2 raised `[HIDDEN_DEPENDENCY]` on the Feasibility axis — `review/round-2.md`. § Dependencies claimed task 13 »needs no further human step before implementation«. Task 13's finish review is the `impeccable` skill's code-led flow, which the plan correctly cites as mandatory and non-substitutable, and that flow opens with a screenshot capture at 1280px and 400px. This repository's own `playwright-chrome-blocked` note already records that the Playwright MCP here is pinned to the `chrome` channel, that `/opt/google/chrome/chrome` is absent, and that installing it needs a root shell this sandbox does not grant — re-verified during round 2. So the plan discharged the direction contract and left a blocked prerequisite unnamed, and § Impact still marked M6 done unconditionally, leaving no artifact to hold the unfinished styling past `/speq:record`.
- **Direction change:** The browser is named as task 13's second dependency, with a concrete check — `/opt/google/chrome/chrome` present, or the Playwright MCP's `browser_navigate` succeeding against `pnpm dev` — and installing it is stated as the user's step. Task 13 branches on that check: on failure it stops once the styling is done and records the unrun finish review, naming the four skipped steps, rather than self-certifying it. § Impact makes `/speq:record` conditional — M6 is marked `✅ erledigt` only with the finish review run, and otherwise the open review and the § Manual Testing 1280px/400px row are appended to M18's »Konsolidierender impeccable-Designdurchgang« bullet naming this plan. The branch is conditional, not a deferral: a browser present when `/speq:implement` reaches task 13 makes it moot, so this does not reopen round 1's deferred-forever finding.
- **Promotes to ADR:** yes

### [plan-review] Removing the check control during a probe destroyed keyboard focus

- **Finding:** Round 2 raised `[COMPLETENESS_GAP]` on the Requirement Quality axis — `review/round-2.md`. The round-1 fix closed the concurrent-probe window by removing the check control rather than disabling it. That control is the only interactive element on the screen, so a keyboard or screen-reader user activates it, the element unmounts, focus falls to `<body>`, and nothing is announced for up to the full 2.0 s deadline. Announcement was specified in one direction only — fault text replacing the checking state — and no scenario, task or § Manual Testing row would have gone red. That is the »app feels broken« outcome M6 exists to remove, on a surface whose brief commits to WCAG 2.2 AA.
- **Direction change:** The scenario gains a clause requiring the checking state to take the focus the removed control held and to be announced when it replaces the guidance. Task 10 names the mechanism: the checking state's labelled region is focusable, receives focus on the control's unmount, and carries a polite live region announcing both directions of the swap. § Design Direction's accessibility bullet and the brief's `## Constraints` now state both directions, and the § Manual Testing keyboard row asserts focus and announcement so it fails on focus loss. Taken with the same round's `[AMBIGUOUS_REQUIREMENT]` advisory, the scenario's last clause was narrowed to the abandoned-at-unmount case a test can construct; the supersede rule stays in task 10's prose as implementation defence in depth.
- **Promotes to ADR:** no

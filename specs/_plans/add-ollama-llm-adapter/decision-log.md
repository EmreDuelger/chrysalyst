# Decision Log: add-ollama-llm-adapter

## Interview

**Q:** How should the adapter attach to Ollama technically, behind `LlmPort`, via `ai` v6?
**A:** Through `@ai-sdk/openai-compatible` against Ollama's `/v1` endpoint. Only official Vercel packages, no community provider code. Model list via `/v1/models`. This is the least Ollama-specific route and eases the later LM Studio and llama.cpp adapters.

**Q:** The spec says `status()` must report locally available model names even when the backend is unreachable. How?
**A:** Only while the daemon runs; otherwise an empty list. `models[]` comes exclusively from the running daemon's `/v1/models`. Backend unreachable means `{ available: false, models: [] }`. Simplest contract; the M6 setup gate lives with an empty list until Ollama runs.

**Q:** M1 fixes the shape of the `live` test tier — real Ollama needed, skipped in CI. Which mechanism?
**A:** An environment gate via `skipIf` plus the file convention `*.live.test.ts`. An env flag unlocks the suite; without it Vitest skips cleanly. The naming convention makes live tests recognisable at a glance. M4 builds CI against this pattern. The convention is an ADR candidate.

**Q:** Confirm M1's scope?
**A:** Ollama plus a shared base for the other two backends. Ollama is the only concrete adapter M1 ships. Configuration is base URL and default model via environment variables with localhost defaults. Do not introduce a multi-backend selection mechanism now.

**Q:** M1 nominally depends on chores C1 (`openwiki --init`) and C2 (minimal CI). Skip them?
**A:** Yes — go straight to M1. Note the skip in the plan's risks and assumptions; plan no C1 or C2 work.

## Design Decisions

### [1] The `LlmPort` adapter is built on Vercel AI SDK v6 with `@ai-sdk/openai-compatible`

- **Decision:** `packages/server` reaches every local inference backend through `ai` v6 plus `@ai-sdk/openai-compatible`, speaking the OpenAI wire format to a loopback `/v1` endpoint. `@ai-sdk/openai-compatible` is a generic client for that wire format — it is not the OpenAI cloud SDK, contains no OpenAI endpoint or credential, and sends no `Authorization` header when no key is configured. It therefore does not breach the roadmap's "no cloud LLM SDK" guardrail, which forbids the Anthropic and OpenAI vendor SDKs. `packages/core` never imports any of it.
- **Alternatives:** Ollama's native `/api/chat` with a hand-written client — rejected because it is the one route that generalises to no other backend, and because it would put SSE framing and abort plumbing in our code. The two community `ollama-ai-provider` packages — rejected because the interview ruled out community provider code. A direct `fetch` client with no SDK — rejected because token streaming and cancellation are exactly the parts the roadmap wanted vetted rather than hand-rolled.
- **Rationale:** Ollama, LM Studio, and a llama.cpp server all serve the OpenAI wire format on loopback. One official client for all three turns a second and third adapter into a configuration value. `ai` also owns the structured-output path that M10 will need, so M10 inherits the choice instead of relitigating it. One cloud client does enter the tree: `ai@6` depends on `@ai-sdk/gateway`, Vercel's hosted-inference client, which `ai` resolves only when a model is passed as a bare string. The adapter always passes the instance returned by `createOpenAICompatible(...)`, so no gateway endpoint is reachable. Verified against the installed tree: `ai@6.0.277` declares `@ai-sdk/gateway@3.0.189` as a direct dependency.
- **Promotes to ADR:** yes

### [2] The SDK is pinned to the `ai-v6` release line, not to `latest`

- **Decision:** `ai` at exactly `6.0.277` and `@ai-sdk/openai-compatible` at exactly `2.0.74` — the pair the vendor's `ai-v6` dist-tag names — with `zod` at `^4.5.4` declared explicitly as their shared peer.
- **Alternatives:** `latest` for both, which is `ai@7.0.93` and `@ai-sdk/openai-compatible@3.0.44`. Rejected: the roadmap fixes v6, and v7 is a separate decision. Caret ranges `^6` and `^2` — rejected as insufficient, see the rationale. Relying on pnpm's automatic peer installation for `zod` — rejected because an implicit peer is invisible to the workspace's catalog assertion.
- **Rationale:** `@ai-sdk/openai-compatible@3.x` builds on `@ai-sdk/provider@4`, which is `ai` v7's provider generation; pairing it with `ai` v6 puts two provider generations in one tree. A plain `^` range on the openai-compatible package would resolve straight into 3.x and break that pairing silently, so both versions are pinned exactly. Verified by installing the three packages under `npm install --strict-peer-deps`: twelve packages, one `@ai-sdk/provider@3.0.15`. The v6 line remains actively patched — 6.0.277 shipped the same day as 7.0.93 — so the pin costs no security currency.
- **Promotes to ADR:** yes

### [3] The `live` test tier is a runtime environment gate plus a filename convention

- **Decision:** Tests that need a real backend live in files named `*.live.test.ts`, and each guards its suite with `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`. Any non-empty value enables the tier; unset and empty string both leave it disabled. Live files must contain no top-level `await`, so a run that skips them contacts nothing. `tests/workspace.test.ts` enforces both rules for every matching file in the workspace, and evaluates each extracted guard expression against `''`, `undefined`, and `'1'`. That evaluation uses `runInNewContext` from `node:vm` against a stub `process` whose `env.CHRYSALYST_LIVE_LLM` is unset, `''`, and `'1'`; `new Function` is forbidden, because `@typescript-eslint/no-implied-eval` is active for test files and the Lint checklist row admits no error.
- **Alternatives:** Excluding the pattern from the Vitest config — rejected because the env flag could then not unlock the suite without branching the config, and an excluded file rots unnoticed. A Vitest project or tag — rejected as more machinery than one boolean needs, and it would fragment the single test command the mission documents. Asserting the skip behaviour by meta-testing a Vitest run — rejected as slow and brittle, and replaced by evaluating the guard expression itself, which is neither.
- **Rationale:** One test command works on every machine, with or without a daemon. Vitest still collects the file, so a live test that stops compiling fails the ordinary run rather than hiding. The no-top-level-`await` rule is what makes collection safe, and it is the part a naive `skipIf` gate would miss. A text match for `CHRYSALYST_LIVE_LLM` inside a `skipIf` cannot see an inverted predicate, so the workspace suite evaluates the guard rather than only reading it — the assertion that catches `=== undefined`, which un-skips the tier for the empty value a CI `env:` block writes. M4 builds the CI tier logic against this convention.
- **Promotes to ADR:** yes

### [4] `status()` reports the models the daemon names, and an empty list when it cannot be asked

- **Decision:** `models[]` is populated only from a successful `GET <base URL>/models` whose body passes the model-list guard. An unreachable backend, an erroring backend, and a backend answering `200` with a body the guard rejects all yield `{ available: false, models: [] }`, and none throws — a body the adapter cannot read is not evidence the backend can serve a request. A backend that answers a readable body while holding no model yields `{ available: true, models: [] }`, which is a different fact and stays distinguishable. A probe cancelled through an aborted signal rejects rather than reporting the backend unavailable. This decision also owns the amendment to `specs/roadmap.md` § M1, whose `**Liefert:**` and `**Fertig, wenn:**` clauses still promise the list of local models from an unreachable backend; task 8 rewrites both to an empty list.
- **Alternatives:** Reading Ollama's on-disk model store to name downloaded models while the daemon is down — rejected: it trades a dependency on a private, changeable layout for a list the setup gate can have the moment the daemon starts. Reporting `available: false` for a cancelled probe too — rejected because a cancelled probe observed nothing, and the setup gate would then assert a fact it never learned.
- **Rationale:** The port promised availability and inventory in one call; this keeps that shape while making the guarantee honest. `platform/llm-port`'s scenario is reworded from "MUST expose the list of locally available model names" to a list that MAY be empty, and the matching doc comment in `packages/core/src/ports/llm.ts` is corrected, so the decision lives in one place rather than contradicting itself across two.
- **Promotes to ADR:** no

### [5] The shared base for later backends is parameterisation, not a base layer

- **Decision:** One module, `packages/server/src/adapters/llm/openai-compatible-llm.ts`, exports `createOpenAiCompatibleLlm(config)` and `llmConfigFromEnv(env)`. Base URL and default model are configuration. LM Studio and llama.cpp will later need a different base URL, not a subclass, a second module, or an interface to extend.
- **Alternatives:** A base module plus a thin `ollama.ts` that supplies the defaults — rejected because the second file's whole body would be a call to the first with different constants, and the defaults are three lines. An abstract provider class with per-backend subclasses — rejected as speculative: the roadmap schedules no llama.cpp or LM Studio milestone through M18, so an inheritance layer would be built for callers that do not exist.
- **Rationale:** The interview asked for a shared base for the other two backends. The cheapest honest form of that is a module whose request behaviour is backend-neutral; the Ollama defaults live in `llmConfigFromEnv` and are the one Ollama-specific thing in the file. A scenario drives the module against a non-Ollama base URL and asserts only `/chat/completions` and `/models` are touched, which proves the request paths are neutral — it does not prove the module carries no backend identity, and the defaults are that identity. A second backend's defaults will be added as a sibling resolver in the same module, not as a second adapter module, so the mission's "je ein Adapter für Ollama, llama.cpp und LM Studio" reads as one adapter *instance* per backend rather than one file per backend. Generality by parameter costs nothing today; what a later backend moves is three lines of defaults, not a layer.
- **Promotes to ADR:** yes

### [6] Cancellation ends a stream quietly and fails a completion loudly

- **Decision:** `stream` with an aborted signal ends its iteration after the chunks already delivered and does not reject. `complete` with an aborted signal rejects with an error named `AbortError`. `status` with an aborted signal rejects.
- **Alternatives:** Rejecting from all three — rejected because it forces every stream consumer into a try/catch around an outcome it deliberately caused. Resolving `complete` to `""` — rejected because a caller cannot tell that from an empty answer.
- **Rationale:** A stream has already handed value to its caller and has a natural end; a promise has nothing to hand back and must say so. Verified against `ai@6.0.277`: a pre-aborted `streamText` yields zero chunks without throwing, a mid-stream abort ends after the delivered chunks, and a pre-aborted `generateText` rejects with a `DOMException` named `AbortError`. The stream behaviour already matches the test double in `packages/core/src/ports/ports.test.ts`, so the real adapter and the double stay interchangeable.
- **Promotes to ADR:** no

### [7] Environment variables are backend-neutral, and the default host is a literal address

- **Decision:** `CHRYSALYST_LLM_BASE_URL` defaults to `http://127.0.0.1:11434/v1`; `CHRYSALYST_LLM_MODEL` defaults to `llama3.2:3b`. Both are read from `process.env` with no dotenv loader. No variable selects among backends.
- **Alternatives:** `CHRYSALYST_OLLAMA_BASE_URL` — rejected because pointing the same adapter at LM Studio's `http://127.0.0.1:1234/v1` is the intended use, and a backend-named variable would misdescribe it. `http://localhost:11434/v1` — rejected because Node resolves `localhost` to `::1` first on dual-stack hosts while Ollama binds `127.0.0.1`, producing connection-refused reports indistinguishable from a stopped daemon. A `CHRYSALYST_LLM_BACKEND` selector — rejected as out of scope by the interview.
- **Rationale:** `llama3.2:3b` is under the roadmap's 4B ceiling and is already the model name used as a fixture in core's port tests, so the default matches what a contributor reading the existing tests would pull. Under WSL2 mirrored networking the literal `127.0.0.1` resolves to the Windows host's Ollama, so this development machine needs no per-environment override of the default.
- **Promotes to ADR:** no

### [8] `adapters/` becomes a new spec domain

- **Decision:** The new feature is recorded as `adapters/ollama-llm-adapter` rather than `platform/ollama-llm-adapter`.
- **Alternatives:** Adding a ninth feature to `platform/` — rejected: `/speq:record` stops and asks a human to reorganise once a domain passes eight features, and `platform/` is at eight today.
- **Rationale:** The mission already names an adapter layer, and the SearXNG and filesystem-session-store adapters land in the next milestones. Grouping by reason to change puts all of them in one domain, and it defers no organisation question to a later, larger merge.
- **Promotes to ADR:** no

### [9] Chores C1 and C2 are skipped, and the adapter ships with no caller

- **Decision:** Proceed to M1 without `openwiki --init` (C1) or the minimal CI pipeline (C2), which the roadmap lists as M1's dependencies. Ship the adapter with no HTTP route and no construction in `main.ts`.
- **Alternatives:** Doing C1 and C2 first — deferred by explicit user instruction. Wiring the adapter into `main.ts` now — rejected because a constructed adapter with no consumer is dead code, and M3's walking skeleton owns the route.
- **Rationale:** The consequences are worth stating rather than assuming. Without C1, this plan's agents work from source rather than from `openwiki/`, so the "wiki first" rule in `CLAUDE.md` is unmet for this milestone. Without C2, nothing but a local run enforces the verification checklist, and the live tier's CI behaviour — the thing M1 is supposed to fix the shape of — stays unproven until M4. The adapter's only callers until M3 are its tests, which is what M1's feasibility purpose asks for: a real model answering through the port.
- **Promotes to ADR:** no

## Review Findings

### [plan-review] The live tier had no daemon to run against

- **Finding:** `[HIDDEN_DEPENDENCY]`, round 1. Five verification steps require a running Ollama with `llama3.2:3b` pulled, and no task established one. Verified on the target machine: `which ollama` reports not found and `127.0.0.1:11434` answers nothing. Because decision [9] skips C2, no CI runner covered the gap either. Every other checklist row passes without a daemon by design, so the plan could report green while M1's stated purpose — falsifying the mission's claim against a real model — went untested.
- **Direction change:** Establishing the daemon is inside the plan. New task 9 makes a daemon reachable, pulls `llama3.2:3b`, and confirms `curl -s http://127.0.0.1:11434/v1/models` lists the model; the former task 9 becomes task 10. § Parallelization gains Group D for that step and Group E for verification, with `Group D → Group E`. § Requirements gains "Live-tier prerequisite", forbidding a completion claim built on hermetic tests alone. The access route itself is settled by "Task 9 could not run unattended" below.
- **Promotes to ADR:** no

### [plan-review] The live-tier guard disagreed with the requirement it implemented

- **Finding:** `[REQUIREMENT_CONFLICT]`, round 1. § Requirements and decision [3] both said any non-empty value enables the tier; task 5 specified `describe.skipIf(process.env.CHRYSALYST_LIVE_LLM === undefined)`. An empty assignment — `CHRYSALYST_LIVE_LLM=` in a shell, `env: { CHRYSALYST_LIVE_LLM: "" }` in a workflow — yields `''`, which that predicate *enables*, landing the live suite on a daemon-less runner. Task 6's text match for `CHRYSALYST_LIVE_LLM` inside a `skipIf` passes for an inverted predicate, so nothing caught it.
- **Direction change:** Task 5 now specifies `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`. `adapters/ollama-llm-adapter/spec.md` gains the scenario "An empty live-tier flag leaves the tier disabled", and task 6 gains a second assertion that extracts each guard expression and evaluates it against `''`, `undefined`, and `'1'`. That assertion also closes the `[TRACEABILITY_GAP]` on the `monorepo-workspace` scenario's third clause; both rows map to it in § Verification › Scenario Coverage. Decision [3] drops its claim that a static text assertion buys the same guarantee as running the suite.
- **Promotes to ADR:** no

### [plan-review] `status` had no specified outcome for an unreadable `200` body

- **Finding:** `[COMPLETENESS_GAP]`, round 1. `status` was specified for four outcomes; a `200 OK` whose body parses as JSON but fails the narrowing guard was not among them. Neither "any thrown error other than an abort" nor "a non-`ok` response" fires there — `response.json()` succeeds and the guard returns false. No pass/fail test could be written for the branch, and decision [4]'s claim that `{ available: true, models: [] }` "stays distinguishable" was unsecured. The case is reachable: the same module is aimed at LM Studio and llama.cpp, and Ollama answers some conditions with a `200` error envelope.
- **Direction change:** The spec scenario "Status separates an unreachable backend from a cancelled probe" gains a fifth `THEN` clause: a `200` with a body the guard rejects MUST report unavailable with an empty model list. Mirrored into § Requirements "Status transport", task 3, decision [4] § Decision, and the § Verification test name, now `resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe`.
- **Promotes to ADR:** no

### [plan-review] Roadmap M1 still promised the behaviour the plan reverses

- **Finding:** `[REQUIREMENT_CONFLICT]`, round 1. `specs/roadmap.md` § M1 states that an unreachable backend returns `LlmBackendStatus` with the list of local models, and gates completion on `status` reporting unavailable *plus* a model list. Decision [4] reverses that to an empty list, which the interview settled. Task 8 opened the same file to fix a plan-name reference and left the substantive contradiction two lines above, so M1's completion criterion stayed unachievable by the code this plan ships and `/speq:audit` would read the milestone as unmet after `/speq:record`. The user's request named `roadmap.md` as a guardrail source, which makes leaving it stale a defect rather than a deferral.
- **Direction change:** Task 8 now amends three lines of § M1: the `**Pläne:**` reference, `**Liefert:**` ("mit der Liste lokaler Modelle" → "mit leerer Modell-Liste"), and `**Fertig, wenn:**` ("»nicht verfügbar« + Modell-Liste" → "»nicht verfügbar« mit leerer Modell-Liste, ohne zu werfen"). Decision [4] § Decision records ownership of the amendment. § Impact declares both roadmap edits.
- **Promotes to ADR:** no

### [plan-review] The live-tier gating scenario was filed under the wrong feature

- **Finding:** `[TRACEABILITY_GAP]`, round 2. "An empty live-tier flag leaves the tier disabled" sat in `adapters/ollama-llm-adapter/spec.md`, but its `GIVEN` is the live suite's `skipIf` guard and its verifying test is `tests/workspace.test.ts` — the `monorepo-workspace` file. The permanent library would have carried one obligation twice under two features, and the adapter spec would have reached eleven scenarios, which stops `/speq:spec-merge` at record time. Round 1's note deferred the move to recording, where a spec edit collides with `/speq:spec-merge` § Anti-Patterns.
- **Direction change:** The move was made in the plan, not deferred. The scenario now lives in `platform/monorepo-workspace/spec.md` as a second `<!-- DELTA:NEW -->` block, unchanged in wording, and both § Verification rows still point at `every live guard expression skips for unset and empty and runs for any value`. Resulting counts: adapter 10, `monorepo-workspace` 9. Neither trips a `/speq:spec-merge` threshold, so `/speq:record` runs mechanically.
- **Promotes to ADR:** no

### [plan-review] Task 9 could not run unattended

- **Finding:** `[HIDDEN_DEPENDENCY]` BLOCKER, round 2. Task 9 named no method and no privilege. Verified on the target machine: `sudo -n true` reports that a password is required, the official installer sets `SUDO="sudo"` for every step when the caller is not root, and the current release ships a `.tar.zst` archive while `zstd` is absent. An agent shell therefore hangs or fails, Group E cannot run, and § Requirements "Live-tier prerequisite" — which gates the whole plan on Group D — becomes unenforceable. A second install was also unnecessary: the user already runs Ollama on the Windows host.
- **Direction change:** Task 9 installs nothing. The live-tier access route is WSL2 mirrored networking against the user's existing Windows-host Ollama. NAT WSL cannot reach that daemon, which binds the Windows loopback only. Verified unreachable from WSL on all three candidates: `127.0.0.1`, the gateway `172.21.16.1`, and the nameserver `10.255.255.254`. Task 9 is a **Human step**, executed by the user rather than by an implementation agent: set `networkingMode=mirrored` in `%UserProfile%\.wslconfig`, run `wsl --shutdown`, reopen WSL, and confirm the `/v1/models` response. § Parallelization labels Group D a human step that reconfigures WSL networking, restarts the WSL VM, and depends on the Windows host rather than the repo. Group E blocks until the user confirms the `curl` output.
- **Promotes to ADR:** no

### [plan-review] Note for `/speq:record`: the `llm-port` Background is a marked non-scenario edit

- **Finding:** `[UNSTATED_ASSUMPTION]`, round 2. `platform/llm-port/spec.md` wraps its Background rewrite in `<!-- DELTA:CHANGED -->`, but `/speq:spec-merge`'s marker table maps that marker to one action — replace the scenario of the same name. A Background block carries no scenario name, so the edit would be silently skipped, leaving the permanent spec claiming `LlmPort` has no adapter on the day an adapter lands.
- **Direction change:** § Impact now lists three out-of-delta edits instead of two, the third naming this Background replacement explicitly. `/speq:record` MUST replace the Background paragraph with the delta's version; the marked block is an instruction, not a merge failure.
- **Promotes to ADR:** no

### [plan-review] The guard-evaluation assertion named no legal mechanism

- **Finding:** `[EFFORT_MISESTIMATION]`, round 2. Task 6's second assertion is the only automated defence of the `?? ''` guard, and its first-instinct mechanism is banned by this repo's own gate — `@typescript-eslint/no-implied-eval` errors on `new Function`, and the § Checklist Lint row admits no error. The likely retreat was a text match, which cannot see an inverted predicate.
- **Direction change:** Task 6 and decision [3] now name `runInNewContext` from `node:vm` against a stub `process`, and forbid `new Function`.
- **Promotes to ADR:** no

### [plan-review] The live-tier timeout was unquantified

- **Finding:** `[AMBIGUOUS_REQUIREMENT]`, round 2. Task 5 asked for "a generous per-test timeout", which fixes no number and fails `/speq:writing-guardrails`' rule against unquantified terms. Vitest's default is 5 s, which a first response after a cold model load exceeds.
- **Direction change:** Task 5 sets `testTimeout` to 120000 ms, and § Requirements "Live-tier shape" carries the figure as its normative home.
- **Promotes to ADR:** no

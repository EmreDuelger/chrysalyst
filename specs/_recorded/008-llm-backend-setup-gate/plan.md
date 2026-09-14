# Plan: llm-backend-setup-gate

## Summary

Make chrysalyst behave correctly on a machine with no usable language model: a `GET /status` route reports whether the configured backend answers and whether it holds the model chrysalyst will send, and the browser shell asks that route before it mounts the interview, showing named setup guidance instead of creating a session it cannot finish. Sessions already on disk keep replaying and keep accepting answers whatever the backend is doing.

## Design

### Context

Roadmap milestone M6 is the topmost open milestone, and it exists to close a named mission constraint. `specs/mission.md` § Constraints states it directly: »Ist kein LLM-Backend erreichbar, erkennt die App dies beim Start und führt durch das Setup des gewählten Backends; das Interview bleibt blockiert, bis ein Backend verfügbar ist.« The mission's dependency table splits the same constraint into the two faults this plan must tell apart — a backend that is not running (»Kein neues Interview möglich; die App führt durch das Setup«) and a backend running without weights (»Backend läuft, aber ohne Modell keine Inferenz; die App weist auf den nötigen Modell-Download hin«).

Today none of that exists. `packages/web`'s shell mounts `InterviewView` unconditionally, and the view creates a session on its first render. With Ollama stopped, a person gets a session folder on disk, a question stream that opens, and an `error` frame reading `Cannot reach the language model at http://127.0.0.1:11434/v1`. That is honest and it is not guidance.

Five forces shape the design.

**Reachability is not readiness.** `platform/llm-port` has `status` report a reachable backend as available *even when it holds no model at all*, and `adapters/ollama-llm-adapter` implements exactly that. So the port answers half the question. The other half — is the model chrysalyst will actually send in that inventory — has to be decided by something that knows which model that is, and the port deliberately does not carry it.

**The port must not learn the backend's name.** `platform/llm-port`'s contract says it is stated in the domain's vocabulary so Ollama, llama.cpp and LM Studio are interchangeable behind it, and the adapter's doc comment repeats that callers above it never learn which one is answering. A display name is the first backend-identity concept chrysalyst has ever had, and putting it in the port would falsify a stated invariant to save one parameter.

**The gate has to be in front of the mount, not beside it.** `interview/interview-view` creates its session the moment it renders. A banner above a mounted view is not a gate — it is a session folder and a failed inference with an apology on top.

**A hang is the failure mode, not a crash.** A stopped Ollama on loopback refuses the connection in milliseconds. A `CHRYSALYST_LLM_BASE_URL` pointing at a host that accepts a connection and never answers does not: `LlmPort.status` carries no deadline, so the probe — and the page waiting on it — would wait as long as the OS lets it. M6's goal is an app that neither crashes nor hangs, so the deadline is part of the deliverable rather than a hardening pass.

**Existing sessions must not be collateral.** `pnpm dev` has been run against this repository, so `~/.chrysalyst/sessions/` holds real sessions. Blocking *new* interviews must not block reading the ones that exist.

**Goals**

- One route that answers whether an interview can start, and which of two faults stops it.
- A configurable display name for the backend, defaulted so an unconfigured install still reads correctly.
- A browser shell that asks that route on mount and mounts the interview only on a ready answer.
- Guidance that names the backend, the fault, and the action — in German and English.
- A bounded probe: no page waits longer than 2.0 s on a backend that never answers.
- Recovery without a restart: a check control, and a reload that runs the same gate.
- A stored session that replays and accepts its answer with the backend down, proven at the route.

**Non-Goals**

- **No export of a blocked session.** The mission's constraint has a second half — »Bestehende Sessions bleiben in diesem Zustand lesbar und exportierbar« — and no export exists before M15. The roadmap makes that half M18's acceptance criterion and this plan does not anticipate it.
- **No session-open-by-id surface.** M17 owns the session library. The "existing sessions stay readable" criterion is met at the route, against a session created in the same test, not by a new screen.
- **No gate at `POST /interview`.** The clarifying interview chose a dedicated pre-flight route and rejected gating session creation. The route stays exactly as `interview/interview-http-api` specifies it, and a caller that ignores `/status` still reaches the `error` frame it reaches today. The gate keeps a person out of that path; it does not make the path unreachable.
- **No polling and no automatic recovery.** The roadmap's criterion is »Ollama starten + neu laden«. The probe runs on mount and on request, never on a timer.
- **No second or third backend.** llama.cpp and LM Studio are configuration of the existing adapter and no milestone before v1 schedules one. This plan adds a display *label*, not an adapter axis.
- **No startup probe in the composition root.** `interview/interview-http-api` requires that resolving the dependency set open no socket. The probe is request-time, which keeps that clause true rather than revising it.
- **No localised failure text.** The two faults are copy and are translated. A probe that fails on the browser's side shows its message verbatim under a translated label, which is the boundary `interview/interview-view` already drew.
- **No change to `packages/core`.** Nothing in this plan is a domain rule: the interview is unchanged, and which surface refuses to start one is a delivery decision.

### Decision

#### Architecture

```
 packages/web (browser)                      packages/server (Node)                packages/core
┌────────────────────────────────┐          ┌──────────────────────────────┐    ┌──────────────────┐
│ App  ← owns start-up decisions │          │ app.ts                       │    │ ports/llm.ts     │
│      │  1. the app's language  │          │  createApp(deps, backend)    │    │  LlmPort.status  │
│      │  2. can we interview?   │   GET    │   GET /health  (no deps)     │    │   → { available, │
│      │                         │ /status  │   GET /status  ─────────┐    │    │       models }   │
│      ├ setup/backend-status.ts │◀────────▶│   /interview/*          │    │    │                  │
│      │   probeBackend()        │          │                         ▼    │    │  (never learns   │
│      │   restated wire shape   │          │ backend-readiness.ts         │    │   which backend  │
│      │                         │          │  readBackendReadiness(       │    │   answers)       │
│      ├ checking → SetupGuide   │          │    llm, backend)             │    └──────────────────┘
│      │            ↑ blocked    │          │   ├ deadline 2.0 s ──────────┼─▶ llm.status(signal)
│      └ ready → InterviewView ──┼── HTTP ─▶│   ├ rejected/unavailable     │
│                  (owns the API)│          │   │   → 'unreachable'        │
└────────────────────────────────┘          │   ├ model ∉ models           │
                                            │   │   → 'model-missing'      │
 tests/fixtures/backend-status.json         │   └ else → ready             │
   { route, readyFields, reasonField,       │                              │
     reasons }  — read by both sides        │ composition.ts               │
                                            │  createDependenciesFromEnv   │
                                            │  backendDescriptorFromEnv ───┼─▶ { name, model }
                                            └──────────────────────────────┘
```

#### Readiness is decided above the port, and the port keeps its contract

`LlmPort.status` answers reachability and hands back an inventory. `readBackendReadiness` in `packages/server` compares that inventory against the model the adapter will send and turns the pair into one of three outcomes. Nothing is added to `LlmBackendStatus` and nothing is added to `packages/core`: the port keeps answering what it observed, and the module that knows which model is configured is the one that draws the conclusion.

The comparison is exact string equality against the configured default model. Ollama's `/v1/models` answers the ids `ollama list` shows, tag included, and the adapter sends `request.model ?? config.defaultModel` verbatim. A tolerant match — treating `llama3.2` as satisfied by `llama3.2:latest` — would pass the gate and then fail the inference, which is the one outcome this milestone exists to prevent. The live tier is what holds that decision honest against a real daemon.

#### The backend's name is server configuration, resolved once beside the model

`adapters/ollama-llm-adapter` is already »the single place Ollama's loopback defaults are written down«, so `CHRYSALYST_LLM_BACKEND_NAME` and its default `Ollama` are resolved there, by a sibling function rather than as a field of `OpenAiCompatibleLlmConfig` — the adapter never sends the name and would carry a field it never reads. The composition root turns the two resolvers into one `BackendDescriptor`, so the model the gate names is by construction the model the adapter will send.

#### The app factory takes the descriptor

`createApp(deps, backend)` gains a second parameter. The alternative — letting the status route call `llmConfigFromEnv` itself — would put a second, independent env resolution inside a route, which is the back-door leakage `/speq:design-philosophy` names: two modules assuming the same configuration with nothing holding them together. One descriptor, resolved once at the entry point, handed down.

#### The shell mounts the interview behind the answer

`App` holds the probe outcome and renders exactly one of three things: a checking state, `SetupGuide`, or `InterviewView`. The masthead — heading and language control — renders in all three, because a person who cannot read the guidance cannot act on it. `SetupGuide` takes the outcome as props and renders copy; it performs no fetch and holds no state, so the module that decides is separate from the module that explains.

`InterviewView` is untouched. It keeps its contract, its tests, and its ownership of the interview API. That is the whole reason the gate sits in the shell rather than inside the view.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Readiness computed above the port, not inside it | `backend-readiness.ts` over `LlmPort.status` | The port answers what it observed; the configured model is not something the domain knows. Adding it to `LlmBackendStatus` would make every `LlmPort` double carry a field the domain never reads |
| The display name never crosses the port | `llmBackendNameFromEnv` → `BackendDescriptor` → the route | `platform/llm-port` states that no caller above it learns which backend answers. The name is presentation, and presentation stops at the delivery layer |
| The consumer declares the shape it needs | `BackendDescriptor` declared in `backend-readiness.ts`, built in `composition.ts` | Dependency inversion in the small: the readiness rule says what it wants, and the composition root — which already owns env → objects — supplies it |
| One resolver owns each default | `llmConfigFromEnv` for the model, `llmBackendNameFromEnv` for the name | Both descriptor fields come from functions the adapter module owns, so the gate cannot name a model the adapter would not send |
| Every observed outcome is a `200` | `GET /status` | Mirrors `LlmPort.status`, which resolves for every outcome it observed and reserves rejection for a cancelled probe. A `503` would make a browser `fetch` treat a successful diagnosis as a transport failure |
| The deadline has exactly one owner | `BACKEND_PROBE_DEADLINE_MS` in `backend-readiness.ts` | The browser inherits the bound by asking a route that is already bounded. A second timeout in the client would be two numbers to keep in agreement and one more place for them to disagree |
| The gate is in front of the mount | `App` renders `InterviewView` only on a ready answer | The view creates its session on render. Anything short of not-mounting is a banner over a created session |
| Decide and explain are separate modules | `App` owns the probe state; `SetupGuide` is props in, markup out | `SetupGuide` is testable per language with no transport, and `App`'s tests are about what it mounts rather than what it says |
| The restated wire shape is held by a fixture | `tests/fixtures/backend-status.json` | `packages/web` declares no workspace package and restates every contract it consumes. `004` and `007` both answered this with an executable fixture; this reuses that answer rather than inventing a third |
| Test seams as props, browser defaults | `App({ probeBackend? })` beside the existing `api`, `locale`, `storage`, `languages` | The same seam shape the shell already uses. A separate prop rather than a method on `InterviewApi`, because the view receives that object and must not gain a call it has no business making |

#### Key interfaces

```ts
// packages/server/src/backend-readiness.ts                                NEW
/** The backend as a person is told about it: the name to show, and the model
 *  chrysalyst will ask it for. Declared by the rule that needs it, not by the
 *  adapter — the adapter never sends the name. */
export interface BackendDescriptor {
  readonly name: string;
  readonly model: string;
}
/** The two things a person can act on, told apart because the actions differ. */
export type BackendFault = 'unreachable' | 'model-missing';
export type BackendReadiness =
  | { readonly ready: true;  readonly backend: string; readonly model: string }
  | { readonly ready: false; readonly backend: string; readonly model: string;
      readonly reason: BackendFault };
export const BACKEND_PROBE_DEADLINE_MS = 2_000;
/** Probes the backend under a deadline and answers what a person should do.
 *  Never rejects: a probe that failed and a backend that is down leave the
 *  same single action, so both answer `unreachable`.
 *  The deadline is a `new AbortController()` aborted by a
 *  `setTimeout(…, BACKEND_PROBE_DEADLINE_MS)` that every settle path clears.
 *  Deliberately not `AbortSignal.timeout`: it holds a native timer that no
 *  fake-timer clock can reach, so the deadline would be untestable. */
export async function readBackendReadiness(
  llm: LlmPort,
  backend: BackendDescriptor,
): Promise<BackendReadiness>;

// packages/server/src/adapters/llm/openai-compatible-llm.ts               CHANGED
/** The name chrysalyst shows for the configured backend. Resolved beside the
 *  loopback defaults it belongs with, and deliberately not part of
 *  `OpenAiCompatibleLlmConfig`: the adapter never sends it. */
export function llmBackendNameFromEnv(env?: NodeJS.ProcessEnv): string;

// packages/server/src/composition.ts                                      CHANGED
export function backendDescriptorFromEnv(
  env?: NodeJS.ProcessEnv,
): BackendDescriptor;

// packages/server/src/app.ts                                              CHANGED
export function createApp(
  deps: CoreDependencies<InterviewState>,
  backend: BackendDescriptor,
);   // adds GET /status; AppType stays ReturnType<typeof createApp>

// packages/web/src/setup/backend-status.ts                                NEW
export type BackendFault = 'unreachable' | 'model-missing';
export type BackendReadiness =
  | { readonly ready: true;  readonly backend: string; readonly model: string }
  | { readonly ready: false; readonly backend: string; readonly model: string;
      readonly reason: BackendFault };
export type BackendProbe = () => Promise<BackendReadiness>;
export const STATUS_ROUTE = '/status';
/** Rejects when the route answers anything this package cannot read — an
 *  unreachable server, a status other than 200, a malformed body, or a fault
 *  name it does not know. The shell shows that message rather than guessing. */
export async function fetchBackendReadiness(
  fetchImpl?: typeof fetch,
): Promise<BackendReadiness>;
export const browserBackendProbe: BackendProbe;

// packages/web/src/setup/SetupGuide.tsx                                   NEW
export interface SetupGuideProps {
  readonly locale: Locale;
  /** The fault to explain, or the raw message of a probe that failed. */
  readonly blocked:
    | { readonly kind: 'fault'; readonly reason: BackendFault;
        readonly backend: string; readonly model: string }
    | { readonly kind: 'failure'; readonly message: string };
  readonly onCheckAgain: () => void;
}

// packages/web/src/App.tsx                                                CHANGED
export interface AppProps {
  readonly api?: InterviewApi;
  readonly locale?: Locale;
  readonly storage?: Storage;
  readonly languages?: readonly string[];
  readonly probeBackend?: BackendProbe;   // test seam; the browser probe when absent
}
```

#### The wire shape

```
GET /status  →  200  {"ready":true,  "backend":"Ollama","model":"llama3.2:3b"}
             →  200  {"ready":false, "backend":"Ollama","model":"llama3.2:3b",
                      "reason":"unreachable"}
             →  200  {"ready":false, "backend":"Ollama","model":"llama3.2:3b",
                      "reason":"model-missing"}
```

The body names the backend and the model in every outcome, including the ready one, so one shape reaches the browser rather than two. No model inventory is returned: the setup screen tells a person which model to install, and `ollama list` already tells them what they have.

#### UI copy

| Member | `en` | `de` |
|---|---|---|
| `setupRegion` | `Setup` | `Einrichtung` |
| `setupHeading` | `chrysalyst needs a language model` | `chrysalyst braucht ein Sprachmodell` |
| `setupChecking` | `Checking the language model…` | `Das Sprachmodell wird geprüft …` |
| `setupUnreachable(backend)` | `chrysalyst cannot reach {backend}.` | `chrysalyst erreicht {backend} nicht.` |
| `setupUnreachableStep(backend)` | `Start {backend}, then check again.` | `Starten Sie {backend} und prüfen Sie dann erneut.` |
| `setupModelMissing(backend, model)` | `{backend} is running, but it does not hold the model {model}.` | `{backend} läuft, hält aber das Modell {model} nicht bereit.` |
| `setupModelMissingStep(backend, model)` | `Install {model} in {backend}, then check again.` | `Installieren Sie {model} in {backend} und prüfen Sie dann erneut.` |
| `setupRecheck` | `Check again` | `Erneut prüfen` |
| `setupFailureLabel` | `The status check failed` | `Die Statusprüfung ist fehlgeschlagen` |

No entry names a command: `ollama pull` would be wrong the moment `CHRYSALYST_LLM_BACKEND_NAME` says `LM Studio`. The copy names the backend the person configured and the model it is missing, and leaves that backend's own install step to that backend.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| A dedicated `GET /status` route, with `POST /interview` unchanged | Refusing session creation when the backend is down; doing both | The clarifying interview chose the pre-flight route and rejected the gate at creation. It is also the better boundary: `POST /interview` is specified to perform no inference and answer immediately, and making it probe would put a socket in the one route whose contract says it opens none. The gate is for the person, and a caller who skips it still gets the named `error` frame `004` specified |
| `/status` separate from `/health` | One route reporting both | `/health` is specified to reach none of its dependencies and is what a supervisor or a container probe asks. Folding a daemon probe into it would report the server dead whenever Ollama is stopped, which is precisely the confusion M6 exists to remove |
| `200` for every observed outcome | `503` when not ready | The probe succeeded; the backend is what failed. A `503` makes a browser `fetch` present a successful diagnosis as a transport error, and the client would then have to reconstruct the distinction from a status code. `LlmPort.status` already draws this line for the same reason |
| The model comparison lives in `packages/server`, above the port | Extending `LlmBackendStatus` with the configured default model; putting the rule in `packages/core` | The port reports what it observed of the backend; the configured default is a fact about *this deployment*, not about the backend. Adding it to the port's result would make every test double carry a field the domain never reads, and the display name could not follow it there at all without falsifying the port's stated invariant. `packages/core` is untouched because nothing here is a domain rule |
| Exact model-id match | Prefix or tag-tolerant matching | The adapter sends the configured id verbatim. A tolerant gate would pass and then fail the inference, turning a setup step back into the error frame this milestone replaces. The cost is that a person who writes `llama3.2` for `llama3.2:latest` is told the model is missing — which is true of the request chrysalyst would send |
| A 2.0 s deadline inside the route | No deadline; a deadline in the browser; a configurable deadline | `LlmPort.status` carries none, and a base URL pointing at a host that swallows packets would hang the page the gate exists to keep usable. Bounding it in the route gives the deadline one owner and lets the browser inherit it. A configuration parameter here would be a decision the module declined to make — a loopback probe that needs more than two seconds is a fault either way |
| The display name is configuration, defaulted to `Ollama` | Showing the base URL; deriving the name from the URL; a new adapter per backend | The clarifying interview asked for a name a person recognises rather than `http://127.0.0.1:11434/v1`. Deriving it from the URL would guess, and guess wrong for a llama.cpp server on Ollama's port. The default is `Ollama` because the default base URL is Ollama's — an unconfigured install reads correctly, and a person who moved the endpoint names it |
| The name is resolved by a sibling of `llmConfigFromEnv`, not a field of it | Adding `backendName` to `OpenAiCompatibleLlmConfig` | The adapter would carry a field it never reads, and every caller constructing a config would owe a value the adapter ignores. The module owns the defaults; the config owns what the adapter needs |
| `createApp(deps, backend)` | Reading the environment inside the route; bundling `{ core, backend }` into one argument | Reading env in a route puts a second independent resolution behind an HTTP handler. Bundling would restructure `composition.test.ts` and every `createApp` call site for no gain; a second positional argument adds one token per call site and says exactly what it is |
| The shell mounts nothing until the probe answers | Mounting the view optimistically and swapping to the setup screen on a blocked answer | The view creates its session on render. Optimistic mounting means a session folder and a failed inference on every load against a stopped backend — the behaviour this milestone removes, with an apology added |
| A check control on the setup screen, beside the reload path | Reload only, as the roadmap's criterion words it; polling on a timer | The roadmap's bar is that starting the backend and reloading frees the interview, and the reload path is specified and tested. The control costs one state increment on an effect that already exists and replaces guidance whose only instruction would be "now reload the page" — poor advice for the non-technical person the mission is written for. Polling is refused outright: it would probe a stopped daemon forever on the chance someone starts it |
| A probe that fails is a third blocked state, shown with its raw message | Treating it as `unreachable`; crashing; a blank screen | Telling a person to start Ollama when the API server is the thing that is down is wrong guidance. The message is shown exactly as it arrived under a translated label, which is the convention `interview/interview-view` already established, and it covers an unknown future fault name without a client release |
| Existing sessions are proven at the route, not at the store | A `SessionStorePort` or filesystem-adapter test; a new session-open UI | The store has no `LlmPort` and never did, so a store-level assertion would be a test of the type system. The route test runs the real replay and answer paths against a model double whose every method refuses, and asks `/status` on the same app — which is the observable claim. A UI path is M17's |

## Design Direction

**The impeccable subphase ran, inside `/speq:plan`, code-led.** No image generation is available in this harness, so it produced no comp. The `impeccable` skill's own contract for a code-led build puts the ambition in the direction contract's FIRST VIEWPORT block and a named signature interaction. Task 13's finish review audits that ambition in behaviour rather than against a picture.

The contract is recorded at `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md` — primary target `packages/web/src/setup/SetupGuide.tsx`, related targets `packages/web/src/App.tsx` and `packages/web/src/interview/InterviewView.tsx`. That brief is the durable artefact and is not restated here. Read it before tasks 9, 10 and 13.

What an implementer needs before those three tasks:

- **The world is unchanged.** Mode stays **Operate**. `packages/web/DESIGN.md`'s five tokens and two voices carry over: no new token, no new face, radius ≤ 2px, no card, no shadow, no motion.
- **Two shipped components set the register.** The failure state reuses § Inline Error verbatim — hairline top rule, 2px vermilion left rule, translated label over the raw message. The `Check again` control is set exactly like the `Record answer →` submit control: vermilion text, no chrome, in a right-aligned actions row.
- **Guidance is a tracked `SETUP` kicker over one weighted fault line**, in the § Question Standfirst register sized down for a sentence, with a body action sentence naming the fix beneath it.
- **The checking state occupies the block the guidance will fill**, so the swap does not jump, and it does not blink — nothing streams on this screen.
- **The accessibility bar is the brief's `## Constraints`.** The check control carries an accessible name and visible focus and is keyboard-operable; both directions of the swap are announced — the fault text when it replaces the checking state, and the checking state when it replaces the guidance on a re-check, where it also takes the focus the removed control held; contrast is at or above 4.5:1.
- **Three calls stay open for build time**, listed under the brief's `## Unresolved`: whether the fault line takes the accent colour, whether the checking placeholder reserves one line of height or two, and the control's exact vertical position. Task 13 resolves all three; none is a spec question.

Tasks 9 and 10 render a working, accessible screen that the § Verification scenarios assert. Task 13 styles what they render, against the contract, introducing no state and no markup a scenario does not name.

## Features

| Feature | Status | Spec |
|---------|--------|------|
| backend-status | NEW | `platform/backend-status/spec.md` |
| backend-setup-gate | NEW | `platform/backend-setup-gate/spec.md` |
| web-shell | CHANGED | `platform/web-shell/spec.md` |
| interview-http-api | CHANGED | `interview/interview-http-api/spec.md` |
| ollama-llm-adapter | CHANGED | `adapters/ollama-llm-adapter/spec.md` |

`interview/interview-view` gets no delta: the view is unchanged, it still owns the interview API, and its dev-proxy scenario requires the table to route the interview prefix, which a second entry does not falsify. `platform/llm-port` gets no delta: `status` keeps its result and its contract. `platform/http-server` gets no delta: its background sentence says the app factory takes the domain's dependency set, which stays true, and `platform/backend-status`'s background is where the factory's second parameter is written down.

## Impact

A person who opens chrysalyst with Ollama stopped now sees a page that names Ollama, says it cannot be reached, and offers a check control — instead of a session folder on disk and an error frame. A person whose Ollama is running without `llama3.2:3b` is told which model is missing rather than being told the backend is unreachable. Starting the backend and either pressing the control or reloading opens the interview. The mission's setup constraint is met for the interview; its export half belongs to M18.

**`GET /status` is a new public route** on the loopback API, answering `200` with `{ ready, backend, model }` and, when blocked, `reason`. `GET /health` is unchanged and still reaches no dependency.

**`CHRYSALYST_LLM_BACKEND_NAME` is a new environment variable**, defaulting to `Ollama`. An install that sets nothing behaves exactly as before and now reads correctly. Someone running LM Studio sets it and the guidance names LM Studio.

**No session data changes.** `schemaVersion` stays `1`, `InterviewState` is untouched, and nothing sweeps the session directory. A session that exists replays its question and records its answer with the backend down, which is the criterion the roadmap names.

One internal signature changes and nothing outside this repository calls it: `createApp` takes the backend descriptor as a second argument. Six call sites in `packages/server` pass it.

`pnpm dev` proxies one more prefix, `/status`, to the API server.

One extra HTTP request is made per page load, to loopback, bounded at 2.0 s.

**`/speq:record` marks M6 conditionally on task 13's finish review.** With that review run, `/speq:record` MUST mark M6 `✅ erledigt (llm-backend-setup-gate)` in `specs/roadmap.md` § Überblick and in the M6 section's status. With that review unrun — § Dependencies' browser check having failed — `/speq:record` MUST NOT mark M6 `✅ erledigt`, and MUST instead append the open finish review and the § Manual Testing 1280px/400px row to M18's »Konsolidierender impeccable-Designdurchgang« bullet, naming `llm-backend-setup-gate`. That bullet is the carrier: it is the one milestone that owns the consolidating design pass, so the unfinished styling outlives this plan's archival instead of disappearing with it. Either way `/speq:record` MUST leave M6's »Bewusst offen« note and M18's acceptance criterion as they stand: the export half of the constraint is untouched by this plan.

## Requirements

| Requirement | Details |
|-------------|---------|
| No interview starts without a usable backend | The shell mounts `InterviewView` only after the status route answers ready. While checking or blocked, no session is created and no question is requested |
| The two faults are told apart end to end | `unreachable` and `model-missing` are distinct on the wire, distinct in the guidance, and name different actions. A reachable backend with an empty inventory is `model-missing`, not `unreachable` |
| The backend is named, not addressed | The guidance names `CHRYSALYST_LLM_BACKEND_NAME`'s value, defaulting to `Ollama`. No screen shows the base URL |
| The gate names the model the adapter would send | The descriptor's model comes from the same resolver the adapter's default model comes from, compared by exact equality against the reported inventory |
| Nothing hangs | The probe is abandoned after 2.0 s and answers `unreachable`. The route never rejects, whatever `LlmPort.status` does |
| Recovery needs no restart | The check control re-runs the probe; a reload re-runs it because the probe is a mount-time effect holding nothing across mounts. Nothing polls and nothing is cached in browser storage |
| Existing sessions are unaffected | A stored session replays its question and records its answer while `status` reports the backend unavailable, and neither request reaches the model |
| Every label comes from a dictionary | No new `packages/web` component holds a user-facing string literal. The backend name, the model name, and a failed probe's message are values, not copy, and are rendered as they arrived |
| The contract is held by a fixture | The route path, the field names and the two fault names agree between `packages/server` and `packages/web`, asserted against `tests/fixtures/backend-status.json` in each package's own suite |
| Loopback only, no new dependency | No package gains a dependency. The lockfile is unchanged. `packages/core` is not edited |

## Dependencies

No package is added and the lockfile does not change. The probe's deadline is built from `AbortController` and `setTimeout`, both Node 22 and browser standard, so nothing here needs a polyfill. `AbortSignal.timeout` is refused for the reason task 3 states, not for availability.

The live tier needs a running Ollama holding the configured model, invoked as
`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test`.
This plan adds one probe to that tier — no inference — on top of the three cases `004` and `007` recorded.

Task 13 has two dependencies, and only one of them is discharged.

The direction contract § Design Direction names is recorded at `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md` and needs no further human step. The second is a harness browser able to capture the running dev server: task 13's finish review inspects the rendered screen at 1280px and 400px, and the `impeccable` skill makes that capture the finish reviewer's only input — »the reviewer has no browser; screenshots you fail to pass are checks it cannot run«. § Manual Testing's 1280px/400px row needs the same browser. Task 13's styling itself does not.

**The check is one of two observations:** `/opt/google/chrome/chrome` exists, or the Playwright MCP's `browser_navigate` succeeds against `pnpm dev`. This environment fails both today — the MCP is pinned to the `chrome` channel, that path is absent, and `npx playwright install chrome` needs a root shell this sandbox does not grant. Installing that browser is the human step this repository's own `playwright-chrome-blocked` note already assigns to the user. Task 13 runs the check when `/speq:implement` reaches it and branches on the result; a browser installed by then makes the branch moot.

## Migration

| Current | New |
|---------|-----|
| `createApp(deps)` | `createApp(deps, backend)`; six call sites in `packages/server` pass a descriptor |
| `main.ts`: `createApp(createDependenciesFromEnv())` | `createApp(createDependenciesFromEnv(), backendDescriptorFromEnv())` |
| `App` renders `InterviewView` unconditionally | `App` renders the checking state, `SetupGuide`, or `InterviewView`, decided by the probe |
| `AppProps` = `{ api?, locale?, storage?, languages? }` | adds `probeBackend?`, defaulting to the browser probe |
| Vite proxy table routes `/interview` | routes `/interview` and `/status` |

**No data migrates.** No session file is read, written or rewritten by anything this plan adds, and `schemaVersion` stays `1`.

**Every existing `App.test.tsx` render must pass a probe.** The default is the browser probe, so a render without one would reach `fetch` in jsdom. Task 10 gives each existing render a ready probe as a *fixture* change and MUST NOT change an assertion; the one test that asserts the interview view is present becomes async, because the view now mounts after the probe answers. This is the same class of change `007` handled in `composition.test.ts`, and it is called out here because a missed render surfaces as an unhandled rejection rather than as a failing assertion.

## Implementation Tasks

Most tasks below are red-green pairs: write the failing tests, run them red, then write the smallest implementation that turns them green. Tests a pair leaves green MUST stay green through every later pair without being edited, except where a task says otherwise.

1. **Status wire fixture.** Create `tests/fixtures/backend-status.json` holding `{ "route": "/status", "readyFields": ["ready", "backend", "model"], "reasonField": "reason", "reasons": ["unreachable", "model-missing"] }`. Extend `tests/fixtures/README.md` with a section naming `platform/backend-status` and `platform/backend-setup-gate` as the contracts it encodes, listing its two readers — the server's readiness test and the web package's probe test — and stating that a renamed field, a renamed fault or a moved route fails a run rather than only a browser. Follow the existing sections' structure; it is the file's established form.
2. **Red then green — the backend's name from the environment.** Extend `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` with the changed `Ollama's defaults come from the environment` scenario and add `llmBackendNameFromEnv` to `openai-compatible-llm.ts`. The test asserts the default `Ollama`, an override through `CHRYSALYST_LLM_BACKEND_NAME`, that an empty string falls back exactly as the other two variables do, that the returned `OpenAiCompatibleLlmConfig` carries no name field, and that neither resolver touches the filesystem. The doc comment states why the name is a sibling and not a config field: the adapter never sends it.
3. **Red — the status route's scenarios.** Write `packages/server/src/backend-readiness.test.ts` covering the five `platform/backend-status` scenarios that drive HTTP — ready, unreachable, missing model, the deadline, and the liveness probe's independence. Every case builds the real app with `createApp(deps, backend)` over an `LlmPort` double and dispatches `app.request('/status')`, so the rule is exercised through the surface a browser uses rather than through a helper. Read the field names and the fault names from `tests/fixtures/backend-status.json`. The missing-model case is an `it.each` over an inventory without the model, an empty inventory, and an inventory holding `llama3.2:latest` against a descriptor naming `llama3.2:3b`. The deadline case uses a double whose `status` settles only when its signal aborts, with Vitest's fake timers advanced past `BACKEND_PROBE_DEADLINE_MS`, and a second case whose `status` rejects immediately; both MUST answer `unreachable` and the route MUST NOT reject. That advance only reaches a deadline built from `setTimeout`, which is why task 4 builds it that way. `AbortSignal.timeout` holds a native timer that never routes through `globalThis.setTimeout`, the only clock `vi.useFakeTimers()` replaces — the case would burn 2.0 s of real time and prove nothing about the bound. A later refactor reintroducing `AbortSignal.timeout` MUST be refused here. Add the status route to `packages/server/src/client.test-d.ts` for the typed-client scenario. The suite is red until task 4.
4. **Green — the readiness rule, the route, and the factory's second parameter.** Write `packages/server/src/backend-readiness.ts` with the § Key interfaces declarations, and chain `.get('/status', …)` onto `createApp` beside `/health`, answering `c.json(await readBackendReadiness(deps.llm, backend))`. `readBackendReadiness` probes with the signal of a `new AbortController()` that a `setTimeout(…, BACKEND_PROBE_DEADLINE_MS)` aborts, and clears that timer on every settle path — resolved, rejected and expired alike — so no test is left holding a pending handle. It MUST NOT use `AbortSignal.timeout`, which task 3's fake timers cannot reach. It maps: a rejection of any kind to `unreachable`, because `adapters/ollama-llm-adapter` rejects a cancelled probe and a probe the deadline cancelled learned nothing either way; `available: false` to `unreachable`; an inventory not containing `backend.model` to `model-missing`; anything else to ready. It MUST NOT reject and MUST NOT let the deadline's rejection escape — the signal it creates is the only one it can be cancelled by, so there is no caller cancellation to distinguish. Give `createApp` its second parameter and update all six call sites: `main.ts`, `app.test.ts` (two), `server.test.ts`, `interview-routes.test.ts`, and `interview-routes.live.test.ts` (two). Those files' assertions MUST NOT change — each gains a descriptor literal beside the dependency set. Its doc comment states why the descriptor is a parameter rather than something the route resolves for itself. [expert]
5. **Red then green — the composition root's descriptor.** Extend `packages/server/src/composition.test.ts` with the changed `The composition root builds the real adapters from the environment` scenario and add `backendDescriptorFromEnv` to `composition.ts`. The test asserts the descriptor's model equals the `CHRYSALYST_LLM_MODEL` the language model was built with, that its name comes from `CHRYSALYST_LLM_BACKEND_NAME`, and — with the existing `fetch` spy — that resolving both opens no socket and creates no directory. Keep the existing assertions untouched.
6. **Red then green — a stored session outlives a dead backend.** Extend `packages/server/src/routes/interview-routes.test.ts` with the new `interview/interview-http-api` scenario. One test: create a session and stream its question to the end over a working model double, then rebuild the app over a model whose `status` resolves unavailable and whose `complete` and `stream` reject, pointed at the same session directory; re-request the question and read it to the end, submit an answer, and assert the replayed `done` frame, the `204`, the answer on disk, that neither `complete` nor `stream` was called, and that `GET /status` on that same app answers `ready: false`.
7. **Red then green — the browser's status probe.** Write `packages/web/src/setup/backend-status.ts` and `backend-status.test.ts` together. `fetchBackendReadiness` requests `STATUS_ROUTE`, rejects a status other than `200` with a message naming the route and the status, parses the body through guards in the style `interview-api.ts` already uses, and rejects a body whose `ready` is not a boolean, whose `backend` or `model` is not a string, or whose `reason` is absent or outside the two known faults when `ready` is `false`. Those rejection messages are English and are not localised, which is the boundary `007` § Non-Goals recorded. The suite also asserts the `platform/backend-setup-gate` fixture-agreement scenario against `tests/fixtures/backend-status.json`, read with `node:fs` from a path resolved against the repository root exactly as `sse-frames.test.ts` resolves its own.
8. **Red then green — the setup dictionary entries.** Add the § UI copy table's nine members to `UiStrings` in `packages/web/src/locale/strings.ts` and to `en.ts` and `de.ts`. Extend `strings.test.ts` so every member is present and non-blank for both languages and the two differ wherever the table says they differ, interpolating members included. `strings.test-d.ts` already covers the missing-member and missing-language guards and MUST stay green untouched — the new members are what make it bite again.
9. **Red then green — the setup screen.** Write `packages/web/src/setup/SetupGuide.tsx`, `SetupGuide.module.css` and `SetupGuide.test.tsx` against the two `platform/backend-setup-gate` screen scenarios. The component is props in, markup out: it fetches nothing and holds no state. It renders a labelled region, the heading, either the fault pair (diagnosis and action) or the failure label above the raw message, and the check control that invokes `onCheckAgain`. Every label comes from `uiStrings[locale]`; the backend name, the model name and a failure's message are values rendered as they arrived. The control carries an accessible name and is keyboard-operable. Style nothing beyond the layout the scenarios need — task 13 owns the visual result.
10. **Red then green — the shell's gate.** Write the seven `platform/backend-setup-gate` shell scenarios and the changed `platform/web-shell` mount scenario into `packages/web/src/App.test.tsx`, then change `App.tsx`. The shell holds the probe outcome in state — checking, ready, a fault, or a failure — runs the probe in an effect, and renders exactly one of the checking line, `SetupGuide`, and `InterviewView` below an always-rendered masthead. The check control increments a value in that effect's dependency list, which is what makes a re-check a re-run of the one probe path rather than a second one; `locale` MUST NOT enter that dependency list, for the same reason it stays out of the view's question effect — a language switch would re-probe and, on a ready backend, remount the view and orphan its session. Abandon a probe whose result arrives after unmount, as the view's effect already does. Activating the control returns the shell to the same checking state the first probe used, so the fault text is hidden while the re-check is in flight and the control itself is off screen — a second activation cannot start a second probe. That removal takes the only interactive element on the screen out of the document, so the checking state's labelled region is focusable and receives focus when the control unmounts, and it carries a polite live region announcing both directions of the swap: the fault text replacing the checking state, and the checking state replacing the guidance on a re-check. Without both, a person operating the screen by keyboard is dropped onto `<body>` and hears nothing for up to the full deadline. The effect's cleanup carries the same supersede rule for both cases: an answer from a probe the shell has stopped waiting on MUST NOT be written to state, so neither an abandoned probe's answer after unmount nor a slow earlier answer can overwrite a newer one — the unmount half is what the scenario asserts, and the supersede half is defence in depth the control's removal already makes unreachable through the screen.
    Every existing render in this file gains a ready probe as a fixture change and no assertion changes; the render that asserts the interview view is present becomes async. A render left without a probe reaches the real `fetch`, so the whole file is checked before this task is called done. [expert]
11. **Dev-server proxy.** Add `/status` to `packages/web/vite.config.ts`'s proxy table beside `/interview`, and extend `packages/web/src/vite-config.test.ts` with the `platform/backend-setup-gate` proxy scenario. The existing assertion that `/health` is not proxied stays as it is and stays green: a liveness probe is not the browser's business.
12. **Live tier — the gate against a real daemon.** Write `packages/server/src/backend-readiness.live.test.ts`: with `CHRYSALYST_LIVE_LLM` set and a running Ollama holding the configured model, build the app from `createDependenciesFromEnv()` and `backendDescriptorFromEnv()` and assert `GET /status` answers `ready: true` naming that model. Print the backend name, the model and the ids the daemon reported. This is the one case that falsifies § Decision's exact-match rule against a real `/v1/models` payload — a daemon that reports the id in any other form fails here rather than in a person's browser. No inference runs; give the case its own timeout.
13. **Styling of the setup screen against the direction contract.** Style `packages/web/src/setup/SetupGuide.module.css` against the direction contract in `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md`, using the existing token layer and adding no token. Resolve the brief's three `## Unresolved` calls here: the fault line's colour, the checking placeholder's reserved height — checked against both fault variants, one line and two, so neither jumps — and the control's vertical position. The build is code-led, so there is no comp and no comp diff. Finish it exactly the way the `impeccable` skill's new-work flow finishes a code-led surface, inventing no substitute: inspect the rendered screen in the browser at 1280px and 400px, run `impeccable detect`, hand the result to the `impeccable-finish-reviewer` subagent against this contract, apply the material fixes it returns, then let the `impeccable-documenter` subagent update `packages/web/DESIGN.md` and its sidecar `packages/web/.impeccable/design.json`. Run § Dependencies' browser check before that finish round: when it fails, the skill forbids inventing a substitute, so the task stops once the styling itself is done — the CSS written against the contract, the three `## Unresolved` calls resolved, tasks 9 and 10's tests still green — and records in the verification report that the finish review did not run, naming the four steps skipped: screenshot inspection, `impeccable detect`, `impeccable-finish-reviewer`, `impeccable-documenter`. It MUST NOT self-certify the finish review as passed and MUST NOT read the CSS in place of a capture. § Impact then routes the open finish review to M18 rather than marking M6 done. When the check succeeds, the finish round runs as written and nothing is carried forward. Every test tasks 9 and 10 left green MUST stay green without an edit; a test that needs editing means the styling changed behaviour, which belongs in a spec delta rather than in a style task.
14. Run the full § Verification checklist end to end, including every § Manual Testing row and the live row, and fix what it surfaces. The 1280px/400px row is the one row § Dependencies' browser check can withhold: when that check failed, record the row as unrun beside task 13's unrun finish review rather than as passed, and run every other row.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 |
| Group B | 2 → 3 → 4 → 5 → 6 (one ordered stream in `packages/server`) |
| Group C | 7 → 8 → 9 → 10 (one ordered stream in `packages/web`) |
| Group D | 11 |
| Group E | 12 |
| Group F | 13 |
| Group G | 14 |

Sequential dependencies:

- Group A → Groups B and C — both read `tests/fixtures/backend-status.json`, so the fixture exists before either stream starts.
- Group B → Group E — the live case drives the real route through the real composition root.
- Group C → Group F — the styling acts on the component Group C wrote.
- Groups A through F → Group G — task 14 runs the checklist over the finished work, the styled screen included.

Groups B and C share no file and neither imports the other: `packages/web` declares no workspace package, so the browser's probe and screen can be built before or after the route they will call. Group C's internal order is load-bearing — the wire shape exists before the dictionary that explains it, the dictionary before the screen that reads it, and the screen before the shell that mounts it. Group D touches only `vite.config.ts` and its test.

Two tasks carry `[expert]` and twelve do not. Task 4 owns the one piece of non-obvious correctness in this plan: a deadline whose expiry reaches the code as the same rejection a cancelled probe does, mapped so the route never rejects and never hangs, landed together with an arity change across six call sites whose assertions must not move. Task 10 owns an effect whose dependency list decides whether a language switch quietly orphans a session, plus a fixture migration across an existing suite where a miss surfaces as an unhandled rejection rather than a red assertion. Tasks 2, 5, 6, 7, 8, 9 and 11 each have a precedent in this repository to copy — an env resolver beside two others, an extension to an existing composition test, a route test over doubles the file already builds, a client module in `interview-api.ts`'s style, dictionary members beside thirteen existing ones, a presentational component, and one proxy entry. Tasks 1, 3, 12, 13 and 14 are a fixture, a failing suite, a scripted live case, a stylesheet against the direction contract, and the checklist.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| — | — | No code is removed by this plan |

Nothing becomes obsolete. `App.tsx`'s unconditional `<InterviewView>` render is replaced by a branch rather than deleted, `InterviewView` itself is untouched, and the `UNREACHABLE` constant in `openai-compatible-llm.ts` keeps the meaning it has — `readBackendReadiness` reads the adapter's result and does not replace it. `vite-config.test.ts`'s assertion that `/health` is not proxied is a deliberate survivor: `/status` is proxied, `/health` stays the supervisor's route. The English rejection messages `packages/web/src/setup/backend-status.ts` adds join the enumeration `007` § Non-Goals started; failure text is not localised, and task 7 states them where they are written.

## Verification

### Scenario Coverage

Path abbreviations: `readiness.test.ts` is `packages/server/src/backend-readiness.test.ts`; `routes.test.ts` is `packages/server/src/routes/interview-routes.test.ts`; `app.test.tsx` is `packages/web/src/App.test.tsx`; `guide.test.tsx` is `packages/web/src/setup/SetupGuide.test.tsx`; `probe.test.ts` is `packages/web/src/setup/backend-status.test.ts`.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| A backend holding the configured model reports ready | Integration | `readiness.test.ts` (task 3) | `answers 200 and ready with the descriptor's backend and model, reaching no inference` |
| An unreachable backend is reported as unreachable | Integration | `readiness.test.ts` (task 3) | `answers 200 and the unreachable fault, still naming the backend and the model` |
| A reachable backend lacking the configured model is reported separately | Integration | `readiness.test.ts` (task 3) | `answers the model-missing fault for $inventory` — one `it.each` case per inventory |
| A probe that does not answer in time reports the backend unreachable | Integration | `readiness.test.ts` (task 3) | `abandons a probe after the deadline and reports it unreachable, and reports a rejected probe the same way` |
| The status route reaches the typed client | Unit | `packages/server/src/client.test-d.ts` (task 3) | `exposes the status route beside health and the interview routes` |
| The liveness probe stays independent of the backend | Integration | `readiness.test.ts` (task 3) | `answers GET /health with ok while the model rejects every probe` |
| The composition root builds the real adapters from the environment (changed) | Integration | `packages/server/src/composition.test.ts` (task 5) | `assembles llm, sessions, clock and the backend descriptor from one environment, and touches no disk` |
| A stored session stays readable while the backend is unavailable | Integration | `routes.test.ts` (task 6) | `replays a stored question and records its answer while the backend reports unavailable` |
| Ollama's defaults come from the environment (changed) | Unit | `packages/server/src/adapters/llm/openai-compatible-llm.test.ts` (task 2) | `resolves the base URL, the default model and the backend name, overriding each from the environment` |
| A ready backend mounts the interview | Integration | `app.test.tsx` (task 10) | `mounts the interview view after one probe and shows no setup screen` |
| A blocked backend shows the setup screen instead of the interview | Integration | `app.test.tsx` (task 10) | `shows the setup screen, mounts no view, creates no session, and keeps the language control usable` |
| Nothing is mounted while the probe is in flight | Integration | `app.test.tsx` (task 10) | `names a checking state and creates no session while the probe is unsettled` |
| The setup screen names the backend and which fault to fix | Integration | `guide.test.tsx` (task 9) | `names the backend for an unreachable fault and the backend and model for a missing model, with different actions` |
| The setup screen renders in the app's language | Integration | `guide.test.tsx` (task 9) | `renders every label from the dictionary for $locale and leaves the configured names unchanged` |
| A probe that fails shows its message under a label | Integration | `app.test.tsx` (task 10) | `shows a failed probe's message character for character under a dictionary label and mounts no view` |
| Checking again after the backend is fixed opens the interview | Integration | `app.test.tsx` (task 10) | `re-probes on the check control and mounts the view on the second answer` |
| Re-checking shows that it is checking and answers once | Integration | `app.test.tsx` (task 10) | `shows the checking state on a re-check, hides the fault text with the control, gives that state the focus and an announcement, and drops an answer from a probe abandoned at unmount` |
| Reloading the page runs the gate again | Integration | `app.test.tsx` (task 10) | `probes again on a fresh mount and writes no outcome to storage` |
| The package's status vocabulary matches the contract | Unit | `probe.test.ts` (task 7) | `matches the fixture's route, field names and fault names` |
| The dev server proxies the status route to the API | Unit | `packages/web/src/vite-config.test.ts` (task 11) | `routes the status route and the interview prefix to the API's loopback address` |
| The shell mounts the interview view (changed) | Integration | `app.test.tsx` (task 10) | `renders the untranslated product heading, the language control, and the view it hands the app's language` |

Seventeen of the twenty-one scenarios are integration tests. Four are not: the typed-client scenario and the vocabulary scenario assert against a declaration and a file, and the proxy scenario inspects a configuration object — none of the three executes the software. The adapter's environment scenario resolves two records from a supplied environment and performs no I/O, which is the property it asserts.

`platform/backend-status`'s five HTTP scenarios all run through `createApp(...).request('/status')` rather than against `readBackendReadiness` directly, so the deadline, the fault mapping and the JSON body are proven at the surface a browser actually calls.

Every scenario recorded by `004`, `006` and `007` that this plan does not list MUST stay green. Tasks 4 and 10 adjust fixtures where a `createApp` call or an `<App>` render appears and MUST NOT adjust an assertion; the files they touch are `app.test.ts`, `server.test.ts`, `interview-routes.test.ts` and `interview-routes.live.test.ts` for task 4, and `App.test.tsx` for task 10. That those suites stay green is the evidence that adding the gate changed no existing behaviour.

The live tier maps to no scenario, as it did in `004` and `007`. It falsifies § Decision's exact-match rule against a real daemon rather than asserting specified behaviour, so it is a § Manual Testing row.

### Manual Testing

Rows below assume `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m6` and `pnpm --filter @chrysalyst/server dev` unless a row sets otherwise.

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| backend-status | `pnpm --filter @chrysalyst/server test` | Every readiness, route, store, composition and adapter test passes; both `*.live.test.ts` files report as skipped |
| backend-status | With Ollama stopped: `curl -sS localhost:3000/status` | `{"ready":false,"backend":"Ollama","model":"llama3.2:3b","reason":"unreachable"}`, answered immediately |
| backend-status | With Ollama running: `CHRYSALYST_LLM_MODEL=not-a-real-model pnpm --filter @chrysalyst/server dev`, then `curl -sS localhost:3000/status` | `"reason":"model-missing"` and `"model":"not-a-real-model"` — the fault a stopped daemon does not produce |
| backend-status | With Ollama running and the configured model pulled: `curl -sS localhost:3000/status` | `{"ready":true,"backend":"Ollama","model":"<the configured model>"}` and no `reason` field |
| backend-status | `CHRYSALYST_LLM_BACKEND_NAME='LM Studio' pnpm --filter @chrysalyst/server dev`, then `curl -sS localhost:3000/status` | `"backend":"LM Studio"`; the base URL appears nowhere in the body |
| backend-status | `CHRYSALYST_LLM_BASE_URL=http://192.0.2.1:11434/v1 pnpm --filter @chrysalyst/server dev`, then `time curl -sS localhost:3000/status` | `"reason":"unreachable"` returned in roughly 2 s, not held open — `192.0.2.1` is the reserved TEST-NET-1 address and swallows the connection. This is the hang the deadline exists to prevent |
| backend-status | `curl -sS localhost:3000/health` with Ollama stopped | `{"status":"ok","version":"…"}` — the liveness probe does not depend on a daemon the server does not own |
| interview-http-api | With Ollama running, create a session and stream its question to the end; stop Ollama; then `curl -sS -N localhost:3000/interview/<that id>/question` | The stored question replays and closes with a `done` frame, with the backend down |
| interview-http-api | Then, still with Ollama stopped: `curl -sS -o /dev/null -w '%{http_code}' -X POST localhost:3000/interview/<that id>/answer -H 'content-type: application/json' -d '{"answer":"a test answer"}'` and `cat /tmp/chrysalyst-m6/<that id>/session.json` | `204`, and the file holds the question and the answer with `"schemaVersion": 1` — the roadmap's "existing session still renders" criterion, observed against a real file |
| backend-setup-gate | `pnpm --filter @chrysalyst/web test` | Every probe, dictionary, screen, shell, parser, client and build test passes, and the two `strings.test-d.ts` type assertions are collected and reported. No test opens a socket |
| backend-setup-gate | With Ollama stopped: `pnpm dev`, then load the page | The setup screen names Ollama, says it cannot be reached, and offers the check control. No session directory appears under the session directory, and the browser's network panel shows one request to `/status` and none to `/interview` |
| backend-setup-gate | With that page still open, start Ollama, then activate the check control | The interview view mounts and the question begins streaming, without a reload |
| backend-setup-gate | With Ollama stopped again: load the page, start Ollama, then reload | The reload mounts the interview — the roadmap's »Ollama starten + neu laden« criterion, exercised as written |
| backend-setup-gate | With Ollama running but the configured model absent: `CHRYSALYST_LLM_MODEL=not-a-real-model` on the API server, then load the page | The screen names the model rather than telling the person to start Ollama, and its text differs from the unreachable screen's |
| backend-setup-gate | Stop the API server, then load the page | The setup screen shows the browser's own failure message verbatim under the translated failure label, and mounts no interview. No uncaught error in the console |
| backend-setup-gate | With the setup screen showing, switch the language control | Both the guidance and the masthead switch language; the backend name and the model name are unchanged, because they are configured values rather than copy |
| backend-setup-gate | Tab to the check control and operate it with the keyboard alone, with the browser's accessibility inspector or a screen reader open | Focus is visible, the control is reachable, and activating it re-runs the probe. Focus then lands on the checking state rather than on `<body>`, and the swap is announced — so focus loss fails this row instead of passing unnoticed |
| backend-setup-gate | With Ollama stopped: `pnpm dev`, then view the setup screen at 1280px and at 400px | The screen sits in the editorial register, adds no token, and the checking-to-guidance swap does not jump. Checked against the direction contract in `packages/web/.impeccable/surfaces/packages-web-src-setup-setupguide-tsx.md` rather than against a comp. Task 13's artefact, recorded in `packages/web/DESIGN.md`. This row needs the browser § Dependencies names; without it, task 14 records it unrun and § Impact routes it to M18 |
| backend-status, backend-setup-gate | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | The live suites run instead of skipping. The new case prints the backend name, the configured model and the ids the daemon reported, and asserts `ready: true` — the exact-match rule against a real `/v1/models` payload |
| web-shell | `pnpm --filter @chrysalyst/web build` | Exit 0; `dist/index.html` references a module asset. No new asset and no new font |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; every `*.live.test.ts` file reports as skipped |
| Live tier | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 0 failures with the live suites running; the status case prints the daemon's reported ids |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; `packages/core` at or above 90 %, unchanged because this plan does not edit it |
| Typecheck | `pnpm typecheck` | Exit 0; every `@ts-expect-error` in the type tests is consumed |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

Every row but `Live tier` and the § Manual Testing rows naming `pnpm dev`, `curl` or a browser runs with no daemon, no network and no configured environment variable. The hosted pipeline `006-ci-test-tiers` installed reproduces every one of them except those, so a green run here is evidence from a runner as well as from one machine.

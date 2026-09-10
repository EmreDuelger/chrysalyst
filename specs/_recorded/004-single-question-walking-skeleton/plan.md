# Plan: single-question-walking-skeleton

## Summary

Cut the thinnest vertical slice through every layer: a real local model asks one opening question and its tokens stream into the browser. The typed answer lands on disk beside the question and both timestamps, making this chrysalyst's first running product and the first falsifiable test of the mission's claim that a small local model can interview.

## Design

### Context

`LlmPort` and `SessionStorePort` each have a real adapter and no caller. `packages/core` holds four port declarations and no application code. `packages/web` renders `<h1>chrysalyst</h1>`. Roadmap milestone M3 connects them, and it does so before the question tree exists on purpose: the sequencing argument in `specs/roadmap.md` is that a dozen milestones would otherwise rest on an unverified premise, and that streaming latency is emergent from a real model plus real SSE plus a real render — no layer proves it alone.

Four forces shape the design.

The slice must stay one round. M7 owns the question tree, M8 the turn loop, M10 the distillation. Any structure built here for those milestones is a guess made without their requirements, and `decision-log [6]` of `001-add-monorepo-scaffold` already recorded what that costs: a shape invented without a caller is replaced by the first caller that has requirements.

The domain state must survive a JSON round trip. `adapters/filesystem-session-store` reconstitutes the two timestamps of its own envelope and hands back everything under `state` exactly as `JSON.parse` produced it. A `Date` in `InterviewState` would return as a string and the type would lie.

The dependency direction must survive its first real traffic. The interview is domain logic, so it names no framework, opens no socket, and reads no ambient clock; the SSE contract is a delivery mechanism, so it lives in `packages/server`; `packages/web` reaches the server over HTTP and nothing else.

The visual design is not this plan's to invent. `decision-log [14]` of `001-add-monorepo-scaffold` deferred the styling stack to the first UI feature's impeccable subphase. § Design Direction below is that subphase's, and task 17 implements whatever it approves.

**Goals**

- One round of the interview, end to end, over the real adapters.
- `InterviewState` version 1, fixed for M8 to grow into.
- An SSE event contract two packages agree on.
- A `transcript.md` that finally carries the interview, which § M2 deferred to this milestone.
- A composition root that is the only place a concrete adapter is constructed.
- A feasibility measurement — model and time to first token — taken against a real model.

**Non-Goals**

- No question tree and no next-question choice; M7 owns them.
- No second turn and no acknowledgement streamed back after the answer; M8 owns them.
- No distillation, contradiction check, or spec preview; M10 through M12 own them.
- No German and no locale switch; M5 owns them.
- No backend-setup gate; M6 owns it.
- No CI pipeline; C2 and M4 own it.
- No reconnection protocol and no `Last-Event-ID`; nothing asks for one.
- No session listing or deletion; M17 owns them.
- No export template and no renderer beyond the transcript; M15 owns them.
- No LangGraph comparison; the sibling plan `engine-structure-spike` owns it.

### Decision

#### Architecture

```
 packages/web (browser)                packages/server (Node)             packages/core
┌────────────────────────┐            ┌──────────────────────────┐      ┌──────────────────┐
│ App                    │            │ main.ts                  │      │ interview/       │
│  └ InterviewView       │            │  └ createDependenciesFrom│      │   state.ts       │
│      ├ interview-api   │  HTTP      │       Env(process.env)   │      │    InterviewState│
│      │   POST /interview──────────▶ │       ├ openai-compatible│      │    Turn          │
│      │   GET  …/question ─── SSE ──▶│       │    -llm  (LlmPort)      │   single-turn-   │
│      │   POST …/answer ───────────▶ │       ├ filesystem-      │      │     interview.ts │
│      └ sse-frames.ts   │            │       │    session-store │      │    begin         │
│          (reassembles) │            │       └ system-clock     │      │    openingQuest. │
└────────────────────────┘            │  └ createApp(deps) ──────┼─────▶│    recordAnswer  │
   vite dev proxy: /interview         │       └ routes/          │ port │                  │
   → http://127.0.0.1:3000            │            interview-    │      └──────────────────┘
                                      │            routes.ts     │               │
                                      └──────────────────────────┘               │
                                                    ▲                            ▼
                                        ~/.chrysalyst/sessions/<id>/session.json  (schemaVersion 1)
```

`@chrysalyst/core` gains its first executable module. `createSingleTurnInterview(deps)` binds `CoreDependencies<InterviewState>` once and returns three operations. Binding at construction is what keeps every route handler free of dependency plumbing; the three operations are the interview's whole vocabulary at this milestone.

`packages/server` stops building its app at module scope. `createApp(dependencies)` returns the chained Hono app and `AppType` is `ReturnType<typeof createApp>`, so a route that exists cannot be missing from the client's type. `startServer` takes the app it serves rather than importing one, which is what makes a route test able to build an app over a `mkdtemp` store and a fake model without a socket.

`packages/web` declares no workspace package. § Consequences argues that choice against the typed client the Hono ADR anticipated.

#### The event contract

```
event: token
data: {"text":"What problem"}

event: done
data: {"question":"What problem does your product solve?"}

event: error
data: {"message":"Cannot reach the language model at http://127.0.0.1:11434/v1"}
```

Three event types, no `id`, and a single-line JSON object as every payload. `JSON.stringify` escapes a newline, so no chunk of model output can split one frame into two — the property `Token text carrying a newline stays inside one frame` asserts.

`done` is written after the question is on disk, so a client that sees `done` knows a reload will show the same question. That ordering, not a flag, is what makes the question generate-once: the first request for the question reaches the model, every later request replays what was stored.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Turn list from version 1 | `InterviewState = { turns: readonly Turn[] }` | M3 puts one element in it and M8 puts many. A list now costs nothing and spares a schema break later; the store's `schemaVersion` stays `1` because it versions the envelope, not the domain state it wraps |
| Asked and answered as a tagged union | `Turn = AskedTurn \| AnsweredTurn`, each carrying a literal `status`, narrowed on that tag | A turn is asked before it is answered, so the intermediate state must be representable. The tag is what makes the two shapes actually distinguishable: without it, an `AskedTurn` literal carrying a stray `answer` still type-checks against the union, and so does an `answeredAt` with no answer |
| The store renders no state; the interview does | `interview/transcript.ts` is a pure `(state, meta) => string`, handed to the store as config | `adapters/filesystem-session-store` writes `transcript.md` and never interprets `TState`. Putting the Markdown in `core` keeps that boundary and keeps the shape domain-owned; the store keeps deciding only when the file is written |
| One in-flight question per session | a process-local `Map<SessionId, Promise<…>>` inside `createSingleTurnInterview` | Load-then-save has no coordination, so two overlapping question requests would both reach the model and the later save would replace a question a client already saw announced. The guard is what makes "the model is reached at most once per session" true rather than likely |
| ISO 8601 strings, never `Date` | every instant in `InterviewState` | The store returns `state` exactly as JSON gave it back. A `Date` field would type as `Date` and arrive as `string` |
| Absence answered, not thrown | `openingQuestion` resolves `undefined`; `recordAnswer` resolves `'recorded' \| 'no-session' \| 'no-open-question'` | The route needs to refuse before it opens a stream, and it needs to tell 404 from 409. A small domain vocabulary gives it both without core naming a status code or growing an error hierarchy |
| Dependencies bound at construction | `createSingleTurnInterview(deps)` | Route handlers carry no plumbing, and one object is what the composition root hands the app factory |
| App built by a factory, served by a caller | `createApp(deps)`, `startServer(app, port, host?)` | Concrete adapters are constructed only at the entry point. The same seam lets a route test build an app over a fake model and a temp directory |
| Route type derived, not declared | `type AppType = ReturnType<typeof createApp>` | A route added to the factory cannot be missing from the client's type; there is no second place to update |
| Identifier minted by the caller | the create route passes `randomUUID()` into `begin(id)` | Randomness is ambient nondeterminism, like the clock. Passing the identifier in keeps the domain deterministic without adding a fifth port for one call site |
| Transport injected into the web client | `interview-api.ts` takes a `fetch` implementation, defaulting to the global | The frame parser is exercised on chunk boundaries a real network produces, with no `EventSource` and no jsdom capability to depend on |
| Frame reassembly as pure computation | `sse-frames.ts` over an `AsyncIterable<string>` | Bytes split anywhere; a parser separated from the transport can be tested at every split position |

#### Key interfaces

```ts
// packages/core/src/interview/state.ts
export interface AskedTurn {
  readonly status: 'asked';
  readonly question: string;
  readonly askedAt: string;                 // ISO 8601
}
export interface AnsweredTurn {
  readonly status: 'answered';
  readonly question: string;
  readonly askedAt: string;                 // ISO 8601
  readonly answer: string;
  readonly answeredAt: string;              // ISO 8601
}
export type Turn = AskedTurn | AnsweredTurn;
export interface InterviewState {
  readonly turns: readonly Turn[];
}
export function isAnswered(turn: Turn): turn is AnsweredTurn;

// packages/core/src/interview/transcript.ts
export function renderTranscript(
  session: StoredSession<InterviewState>,
): string;

// packages/core/src/interview/single-turn-interview.ts
export type AnswerOutcome = 'recorded' | 'no-session' | 'no-open-question';
export interface SingleTurnInterview {
  begin(id: SessionId): Promise<void>;
  openingQuestion(
    id: SessionId,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<string> | undefined>;
  recordAnswer(id: SessionId, answer: string): Promise<AnswerOutcome>;
}
export function createSingleTurnInterview(
  deps: CoreDependencies<InterviewState>,
): SingleTurnInterview;

// packages/server/src/adapters/session-store/filesystem-session-store.ts
export interface FilesystemSessionStoreConfig<TState = unknown> {
  readonly rootDir: string;
  readonly renderTranscript?: (
    session: StoredSession<TState>,
  ) => string;                              // absent → the metadata header
}

// packages/server/src/app.ts
export function createApp(
  deps: CoreDependencies<InterviewState>,
): Hono</* chained routes */>;
export type AppType = ReturnType<typeof createApp>;

// packages/server/src/composition.ts
export function createDependenciesFromEnv(
  env?: NodeJS.ProcessEnv,
): CoreDependencies<InterviewState>;

// packages/server/src/server.ts  (changed signature)
export function startServer(
  app: { readonly fetch: FetchHandler },
  port: number,
  host?: string,
): Promise<ServerHandle>;
```

`openingQuestion` resolves before the model is reached. The load happens inside the promise so the route learns "no such session" in time to answer `404`; the model is reached on the first pull from the returned iterable, so nothing is inferred for a request that is refused.

The in-flight guard behind `openingQuestion` is process-local. It holds within one server process, which is what `pnpm dev` and the production entry point run; two processes over one session directory can still produce two questions, and § Impact names that limit.

A shared production owns its cancellation. The interview creates one `AbortController` per production and hands its signal to the model; a caller's own `signal` ends that caller's iteration alone, and the controller is aborted only once every sharing caller has abandoned. Nothing about that appears in a signature — the reference count lives in the factory's closure — so no caller learns it exists, and the single-caller case is unchanged.

`renderTranscript` takes the port's own `StoredSession<TState>` rather than a restatement of three of its fields, so the store hands `save`'s own argument straight to it and the composition root passes the function by reference.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| `packages/web` keeps no dependency on `@chrysalyst/server` and declares the three wire shapes itself | Adding `@chrysalyst/server` as a type-only dependency so `web` can use `hc<AppType>`, which `decision-log [13]` of `001` deferred to "the first real feature" | `hc` types route paths and JSON bodies. It cannot type an SSE event name or payload — the larger half of this contract, and the half M3 exists to settle. The edge would therefore buy path names, `{ id }`, and `{ answer }`, and cost a browser package a type dependency on a Node package whose graph reaches `node:fs`, `ai`, and `@ai-sdk/openai-compatible`, plus `hono` as a runtime dependency and two rewritten workspace invariants. Reversal is cheap in one direction only: adding the edge later deletes three literals, while removing it later means unpicking a `web` grown against it. The shared contract is `interview/interview-http-api`, which both packages' tests are written from, and `client.test-d.ts` keeps `AppType` proven publishable inside `server`. Revisit at M11, whose live spec preview is the first wire shape too large to restate by hand. This reverses a named `specs/roadmap.md` § M3 deliverable; § Impact says so and tells `/speq:record` to amend the roadmap line |
| `createApp(deps)` replaces the module-scope `app`, and `startServer` takes the app | Keeping the module-scope app and reaching dependencies through a mutable holder | A holder is a hidden global, and every route test would then share one. The factory is what lets a test build an app over a fake model and a `mkdtemp` store, and it puts adapter construction at the entry point where Clean Architecture wants it. The cost is a delta on four `platform/http-server` scenarios, which name the old construction |
| The question is generated on the first request for it, not when the session is created | Generating it inside `POST /interview` | Generating at creation blocks the create request on a whole inference, which destroys the one measurement this milestone exists to take. Generating on first request keeps creation instant and the stream honest, and storing the result before `done` still gives generate-once |
| `packages/core` gains runtime code | Keeping the use case in `packages/server` until M7 | The mission puts domain logic in `core`; putting the interview in `server` inverts the architecture on the first feature that has any. The package's purity rule bans dependencies, not execution, and the `core-ports-contract` delta says so explicitly |
| The core operations return domain outcomes rather than throwing typed errors | An error hierarchy in `core` that the routes map to status codes | Two of the three outcomes are ordinary — a stale link and a resubmitted form — and neither is exceptional. A three-member union is smaller than a class hierarchy and mirrors `SessionStorePort.load`, which already answers `undefined` for absence |
| The interview renders its own transcript; the store takes it as optional config | Rendering Markdown inside the store, or leaving `transcript.md` a metadata stub until a later milestone | `specs/roadmap.md` § M2 deferred the transcript's interview content to this milestone verbatim, so leaving the stub would drop a promise M6 later depends on. Rendering inside the store would make it interpret `TState`, which its recorded boundary forbids. An optional renderer keeps the store deciding only when the file is written, puts the Markdown shape where the state's owner lives, and leaves `003`'s tests and any non-interview `TState` untouched |
| One raw-frame fixture outside both packages holds the wire contract | Each side declaring its own frames, as the first draft had it | The frame format is one decision reflected in three modules — the route writes it, the parser reads it, the API client redeclares its shapes — and nothing executable held them in agreement. A file under `tests/fixtures/` that the route test asserts against and the parser test consumes turns a rename on either side into a failing run rather than a failing browser, and it costs no package edge |
| The live tier drives the real HTTP routes, not only the core use case | A live test over `createSingleTurnInterview` with the real model and a temp store | The milestone's claim is about the whole path. Driving the bound server proves the SSE framing, the adapter, the store, and the model together, and the time to first `token` event is measured where the browser would see it |

## Design Direction

Filled by the impeccable subphase (2026-09-09). PRODUCT.md was written for the project
in the same pass. Full contract: `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md`.

**Approved comp:** `specs/_plans/single-question-walking-skeleton/assets/comp.html` — a static
mockup of the interview view in six states (connecting, streaming, complete, submitting,
recorded, failed). Approved by the user against the direction contract; comp + styling
stack approved, the wordmark mark is still in iteration (does not block this plan).

**World — editorial minimalism (user-pinned).** The user pinned the "Atelier Zero"
editorial register (Monocle / Apartamento / Études) from
`https://open-design.ai/plugins/example-open-design-landing/`. This overrides the
concept-seed assignment (index 7, "The Developing Print", seed key `b15466de`) per
impeccable's brief-pinned-beats-the-roll rule. Translated from that reference's
Persuade/landing register into **Operate**: editorial type, hairline rules, tracked
metadata labels, a strict single-column grid, and restraint are kept; the hero-collage
spectacle is dropped.

**Thesis.** One question set like a magazine standfirst, answered in a clean ruled
column, hairline rules and tracked labels doing all the structural work. Refuses the
chat thread and the "Step 1 of 12" form wizard alike.

**Tokens (the view MUST implement exactly these).**

| Token | Value | Role |
|---|---|---|
| `--ground` | `#F4F1EA` | warm off-white, full-bleed |
| `--ink` | `#1A1A1A` | body / question text (≈12:1 on ground) |
| `--ink-soft` | `#55524B` | metadata, hints, saved answer |
| `--accent` | `#C8402B` | editorial vermilion — links, focus rule, submit, confirmation, error rule; ≈4.9:1 on ground. Used sparingly |
| `--rule` | `#D8D2C4` | hairline dividers and answer-field underlines |
| `--serif` | Source Serif 4 (self-hosted) | the question only |
| `--grotesque` | Libre Franklin (self-hosted) | wordmark, all labels, answer field, controls |
| measure | ~40rem (~640px) | single centred column |
| radius | ≤ 2px | no cards, no shadows |
| micro-label | 0.6875rem, `letter-spacing: 0.16em`, uppercase | kicker, `YOUR ANSWER`, metadata, confirmation |
| question | Source Serif 4, ~1.75rem / 1.32, weight 400 | |

Fonts are **self-hosted** (bundled with `packages/web`), never a CDN — the comp loads
them from Google Fonts for review only. Confirm the exact faces while implementing task 21
with `impeccable font-match`; Source Serif 4 and Libre Franklin are the intended targets.

**Motion.** The streaming indicator is a blinking 2px rule at the end of the question
text (not bouncing dots), carrying the text alternative "the question is still being
written". `prefers-reduced-motion: reduce` removes the blink. On a successful submit the
answer-field baseline rule turns vermilion for one beat, then a tracked `RECORDED · HH:MM`
line appears. **Motion never delays a token's arrival** — only the cursor animates, never
the text.

**States the comp covers** (map to `interview/interview-view` scenarios):

- *connecting* — dimmed placeholder question, "REACHING THE MODEL", blinking rule.
- *streaming* — question accumulating token-by-token in a `polite` live region; answer
  field and submit disabled; "THE QUESTION IS STILL BEING WRITTEN".
- *complete* — full question; answer field enabled with a label; submit enabled once the
  field holds non-blank text; a one-line hint "One question this round."
- *submitting* — field and submit disabled, hint reads "Recording…".
- *recorded* — answer shown as a quiet left-ruled block, `RECORDED · HH:MM · saved to this
  session` in vermilion; both controls gone.
- *failed* — the streamed question freezes mid-way; an inline block with a vermilion left
  rule shows the adapter's message ("Cannot reach the language model at <url>…"); no
  dialog; the answer control stays closed. Same treatment when the answer route refuses.

**Wordmark.** `◈ chrysalyst`, always lowercase, mark + "chrysalyst" in the serif. The
mark is a crystalline rhombus with its lower half filled — the vague form crystallising
upward into structure. Favicon-capable at 16px. `specs/_plans/single-question-walking-skeleton/assets/mark.svg`
is the working version; 3–4 variants are under review and the final is settled before
task 20 ships. Task 20 must not block on it — a placeholder mark is acceptable until then.

**Styling stack (decision-log `[10]`).** Plain CSS with a custom-property token layer plus
CSS Modules per component. No CSS framework, no component library, no CSS-in-JS runtime.
Vite resolves CSS Modules natively; the token set is small and fixed; `packages/web` gains
no PostCSS/Tailwind toolchain. This resolves `decision-log [14]` of `001-add-monorepo-scaffold`.

**FINISH (impeccable contract).** The build is unfinished until it is reviewed and
documented. Task 22 closes it with two artefacts: an impeccable finish review of the
built view, and a `DESIGN.md` written from what shipped rather than from what was
intended. Both are named as § Manual Testing rows.

**States the view owns, not the stylesheet.** All six states below are behaviour, so
`interview/interview-view` carries a scenario for each and task 16 builds each. Tasks 20
through 22 restyle what already renders and introduce no state of their own.

## Features

| Feature | Status | Spec |
|---------|--------|------|
| single-question-interview | NEW | `interview/single-question-interview/spec.md` |
| interview-http-api | NEW | `interview/interview-http-api/spec.md` |
| interview-view | NEW | `interview/interview-view/spec.md` |
| http-server | CHANGED | `platform/http-server/spec.md` |
| web-shell | CHANGED | `platform/web-shell/spec.md` |
| core-ports-contract | CHANGED | `platform/core-ports-contract/spec.md` |
| filesystem-session-store | CHANGED | `adapters/filesystem-session-store/spec.md` |

## Impact

chrysalyst becomes usable for the first time. `pnpm dev` and a browser produce one interview question from a local model and store the answer under `~/.chrysalyst/sessions/<id>/`. A person reads both files directly: `session.json` holds the state, and `transcript.md` now holds the question and the answer as Markdown, which `specs/roadmap.md` § M2 deferred to this milestone.

The API is new, so nothing breaks for a caller. `GET /health` keeps its path, status, and body; only the module that builds the app changes.

`startServer` changes shape. Its only caller is `main.ts` and its only other user is `server.test.ts`, both edited by this plan, so no code outside the repository is affected.

The session store's config gains an optional renderer, so no existing caller changes. A store constructed without one writes the metadata header it wrote before, which is what keeps `003-add-filesystem-session-store`'s tests and any non-interview `TState` unaffected.

One question is produced per session per process, not per session absolutely. The in-flight guard is process-local, so two server processes over one session directory can still generate two questions for one identifier and the later save wins. One process is what `pnpm dev` and the entry point run; a second is not a supported configuration and no milestone before M17 introduces one.

This plan reverses one named M3 deliverable. `specs/roadmap.md` § M3 "Liefert" promises an `hc<AppType>`-Client in `packages/web`; this plan ships no client there and adds a workspace invariant that would fail one. § Consequences row 1 and `decision-log [4]` argue why.

`/speq:record` MUST make two edits to `specs/roadmap.md` and no others. It MUST leave M3 at `⬜ offen` in § Überblick, because the milestone names two plans and `engine-structure-spike` still owes the throwaway turn-loop comparison and the ADR-ready note on the M7 engine structure. It MUST replace § M3 "Liefert"'s `hc<AppType>`-Client clause with the wire-shape restatement this plan ships — `packages/web` reaches the API over HTTP with its own declaration of the three wire shapes — so the roadmap stops promising a client the recorded specs forbid.

C2, the minimal CI pipeline, stays open and is skipped a second time, as `decision-log [9]` of `002-add-ollama-llm-adapter` skipped it first. The consequence is unchanged and now larger. Only a local run enforces the § Verification checklist, and no runner proves the suite green on a clean machine. The live tier's behaviour on a machine without Ollama stays unproven until M4, and this plan adds a second file to that tier.

## Requirements

| Requirement | Details |
|-------------|---------|
| Generate once | The model is reached at most once per session within one server process. The first request for the question stores what it produced; every later request replays the stored text, and a concurrent request awaits the first rather than starting a second inference |
| The transcript carries the interview | Every saved session's `transcript.md` holds its question and answer as Markdown, rendered by `@chrysalyst/core` and written by the store |
| Durable before announced | The `done` event is written only after `save` resolved. A client that observed `done` and reloads MUST see the same question |
| Nothing partial is stored | A question is stored only when the model's stream ended of its own accord and the accumulated text is not blank. An abandoned request, a rejected stream, and a blank result each store nothing |
| One round only | The state holds at most one turn. A second answer is refused rather than appended, because a second turn would carry an answer to no question |
| Domain purity | `packages/core` non-test source imports only its own relative modules. The interview reads no clock, opens no socket, and touches no file except through `CoreDependencies` |
| Wire payloads are single-line | Every SSE `data` field is one line of JSON. No payload may introduce a frame separator |
| Loopback only | The server keeps its `127.0.0.1` default. The Vite dev proxy targets `127.0.0.1:3000` |
| English | The system prompt and every interface string are English. M5 externalises both per locale |

### Feasibility measurement

The live tier records the elapsed time from dispatching `GET /interview/:id/question` to observing the first `token` event, and prints it with the model name. The verification report carries both. The test asserts a ceiling of 30 s — enough to fail a hung backend, loose enough not to flake on a cold model load. The mission's "first perceptible reaction within a few seconds" is judged by a human from the printed figure, not gated by the suite.

### Feasibility risk: a thinking model's reasoning, in the question and in the clock

`qwen3:8b` is a reasoning model and is the model available on the target host; `llama3.2:3b` is not pulled. Its reasoning pass threatens the milestone twice, and both triggers enter the same fix ladder.

As content: depending on how Ollama's OpenAI-compatible endpoint reports reasoning, the question may arrive with a `<think>` block inlined, which would stream into the browser and be stored as part of the question.

As latency: if the endpoint or the `ai` SDK separates reasoning from text, the first `token` event arrives only after the whole reasoning pass. The measured time to first token is then a reasoning latency and not the streaming latency the mission's "first perceptible reaction within a few seconds" claim is about — so a figure under the ceiling can still be the wrong figure, and one over it is not a hung backend.

Task 19 asserts both: that the persisted question and its first token carry no `<think>` marker, and that time to first token is under the ceiling. Either failure enters this bounded ladder, in order. First tighten the prompt's output instruction. If the model still reasons visibly or slowly, append its thinking-off directive to the user message, with a comment naming the directive as `qwen3`-specific and M5 as the milestone that removes it. If the figure remains a reasoning latency, record it as such in the verification report beside the raw measurement rather than publishing it as a streaming latency.

The ladder edits the prompt that tasks 3 and 4 froze, which is why task 3 asserts the system message's intent and never its exact text. Adding a stripping step to `LlmPort`, the adapter, or the domain stays out of scope — where reasoning belongs on the wire is an `LlmPort` question and M10 owns the response-shape delta.

## Dependencies

No package is added. `hono`, `zod`, `@chrysalyst/core`, `@hono/node-server`, `ai`, and `@ai-sdk/openai-compatible` are already `packages/server` dependencies; `react`, `react-dom`, `vite`, `jsdom`, and `@testing-library/react` are already `packages/web` dependencies; `packages/core` gains no dependency and must not.

`streamSSE` comes from `hono/streaming`, part of the `hono` package already installed at `^4.13.7`. It writes `event:` and `data:` lines and a blank-line separator, exposes `stream.aborted` and `stream.onAbort`, and needs no middleware. On Node its `onAbort` fires from response-body cancellation, not from the request signal — tasks 9 and 10 both say so, because a test written against the request signal fails while the code under test is correct.

Two font families are acquired outside the package manager, so the unchanged lockfile the § Checklist asserts does not mean nothing was fetched. Task 21 downloads Source Serif 4 and Libre Franklin as woff2 files into `packages/web` and serves them with `@font-face`; both are licensed SIL OFL 1.1, which permits bundling and redistribution with the licence text retained. Acquiring them needs network access once. `impeccable font-match --rank` needs a resolvable browser to rank candidate faces and otherwise degrades to "the catalog's nearest face, size estimated", which is a weaker confirmation — task 21 records which of the two it got.

The live tier needs a running Ollama holding `qwen3:8b`, invoked as
`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test`.
Everything else in § Verification runs with no daemon and no network.

## Migration

| Current | New |
|---------|-----|
| `packages/server/src/app.ts` exports a module-scope `app` and `AppType = typeof app` | Exports `createApp(deps)` and `AppType = ReturnType<typeof createApp>`; the module-scope `app` is removed |
| `startServer(port, host?)` imports the app it serves | `startServer(app, port, host?)` is given the app; `server.ts` no longer imports `app.ts` |
| `packages/core/src/index.ts` re-exports types only | Also exports the interview's values; its doc comment stops claiming the package emits no runtime binding |
| `packages/web/src/App.tsx` renders a placeholder heading | Renders the heading and the interview view |
| `FilesystemSessionStoreConfig` carries `rootDir` alone, and `toTranscript` writes a fixed metadata header | The config also accepts an optional `renderTranscript`, and takes a defaulted type parameter — `FilesystemSessionStoreConfig<TState = unknown>` — so `sessionStoreConfigFromEnv`'s declared return type keeps compiling untouched; `toTranscript` becomes the fallback used when no renderer is configured |

No on-disk data migrates. `schemaVersion` stays `1`: this plan chooses the `TState` the envelope wraps and does not change the envelope, and the transcript is not versioned at all — `002`'s ADR `schemaversion-versions-the-on-disk-envelope` is untouched. No session written by an earlier milestone exists, because no earlier milestone had a caller that wrote one.

## Implementation Tasks

Most tasks below are red-green pairs. Each pair writes its failing tests first, runs them red, then writes the smallest implementation that turns them green. Tests a pair leaves green MUST stay green through every later pair without being edited.

1. **Red — `InterviewState` version 1.** Write `packages/core/src/interview/state.test.ts` against the types and predicate § Key interfaces names: `isAnswered` narrows an answered turn and rejects an asked one; a state holding one answered turn deep-equals itself after `JSON.parse(JSON.stringify(state))`; every instant in the parsed value is `typeof 'string'`; and the `status` tag survives that round trip, because narrowing after a load depends on it. Add a `state.test-d.ts` whose `@ts-expect-error` targets what the tag actually excludes — a literal carrying `status: 'answered'` with no `answeredAt`, and a literal carrying `status: 'asked'` with an `answer`. The two directives sit in different places, because `tsc` reports the two errors on different lines. Leave the `status: 'answered'` directive above its declaration, where the missing-property error lands and where it is consumed. Write the stray-`answer` directive immediately above the `answer` property inside the object literal, because the excess-property error `TS2353` is reported on the property's own line and a directive above the `const` neither covers it nor is consumed — that pair of errors is exactly the red bar round 1 removed. Collapsing the literal onto one line is not an alternative: the line runs past Prettier's 80-column default, so the § Checklist `Format` row would re-break it. Confirm both directives are consumed and that `pnpm --filter @chrysalyst/core typecheck` is clean.
2. **Green — `state.ts`.** Create `packages/core/src/interview/state.ts` with `AskedTurn`, `AnsweredTurn`, `Turn`, `InterviewState`, and `isAnswered`, exactly as § Key interfaces declares them: two closed shapes each carrying a literal `status`, not an `extends` chain. `isAnswered` narrows on `turn.status === 'answered'` and never on `'answer' in turn`. Interfaces and a type guard only — no class, no enum, nothing `erasableSyntaxOnly` forbids. The exported types carry doc comments stating why an instant is a string and why the union is tagged, not what the fields are named.
3. **Red — the interview's behavioural scenarios.** Write `packages/core/src/interview/single-turn-interview.test.ts` with three doubles and every scenario of `interview/single-question-interview` failing, except the JSON round trip that task 1 owns and the transcript that task 5 owns. The `LlmPort` double records the requests it received and yields a scripted chunk list, with variants that yield whitespace only, that reject, and that hold at a gate the test opens, so the concurrency and abort cases can interleave. The `SessionStorePort<InterviewState>` double is an in-memory map that records every `save` in order, so `the store MUST NOT be written before the model's last chunk` is asserted on the call log rather than on the final value. The `ClockPort` double returns a scripted sequence of instants, so `askedAt`, `answeredAt`, and `updatedAt` are told apart. Assert the model was never reached in the scenarios that forbid it, by asserting the recorded request list is empty. Cover the two refusals with no turn to act on — `Recording an answer before the question was asked reports no open question` and `Beginning an interview that already exists keeps the stored session` — and the two concurrency cases by starting a second `openingQuestion` while the first is held at the gate. `Two concurrent requests for the opening question reach the model once` then releases the gate and asserts exactly one recorded request, one stored turn, and the same text at both callers. `A caller that abandons a shared question production leaves the other caller's question intact` instead ends the first caller's iteration early, releases the gate, and asserts the second caller received the whole question, the store holds exactly one turn, and the request list still holds one entry — which is the assertion that fails if the shared production borrows a caller's signal. Assert the prompt by its intent — one system message instructing a single opening question and nothing else — never by its exact text, so § Feasibility risk's fix ladder can edit the wording without editing this test.
4. **Green — `createSingleTurnInterview`.** Create `packages/core/src/interview/single-turn-interview.ts`. `begin` loads first: an identifier that already holds a session is left exactly as it stands and never overwritten, because `begin` must not replace a stored question and answer with an empty turn list; otherwise it saves `{ turns: [] }` with `createdAt` and `updatedAt` from one clock reading. `openingQuestion` loads and resolves `undefined` for an absent session; for a session already holding a turn it resolves an iterable yielding the stored question and reaching no model; otherwise it starts a production and resolves a generator over it. A production is shared, so it is not bound to the caller that started it: the interview owns an `AbortController` per production and passes **its** signal to `deps.llm.stream(conversation, controller.signal)`, never a caller's. A caller's own `signal` ends that caller's iteration and nothing else. The controller is aborted only once every caller sharing the production has abandoned it — hold a reference count per production, decrement it when a caller's iteration ends early, and abort at zero. With one caller that is exactly today's behaviour, which keeps `A question the caller abandons is never stored` true; with two it keeps `A caller that abandons a shared question production leaves the other caller's question intact` true. The production accumulates the model's chunks, and only after the model's iteration ended saves the appended asked turn — skipping the save when the interview's own controller was aborted, and rejecting when the accumulated text is blank. A rejection from the model propagates unchanged and stores nothing. Guard production with a process-local `Map<SessionId, Promise<string>>` held in the factory's closure: a request that finds an entry awaits it and replays its result instead of reaching the model, and the entry is deleted once the promise settles either way, so a failed production does not poison the session. The shared promise resolves only after `save` resolved, so every caller that receives text receives a question that is already on disk — which is what makes `done` mean durable for the second caller as much as the first. `recordAnswer` loads, returns `'no-session'` for absent, `'no-open-question'` both when the turn list is empty and when the last turn is already answered, and otherwise replaces that turn with an answered one and saves with a new `updatedAt` and an unchanged `createdAt`. The module-level system prompt is an English constant with a doc comment naming M5 as its externaliser. The exported factory's doc comment states why the interview is one round, what the ordering between yielding and saving guarantees, why the production owns its own cancellation rather than borrowing a caller's, and that the guard is process-local. [expert]
5. **Red then green — the transcript renderer.** Write `packages/core/src/interview/transcript.test.ts` and `transcript.ts` together against the `The transcript renders the interview as Markdown` scenario. The signature is `renderTranscript(session: StoredSession<InterviewState>): string` — the port's own type, not a restatement of three of its fields, so the store passes `save`'s argument straight through and the composition root needs no adapting lambda. It returns Markdown naming the session's identifier and both timestamps, then each turn's question beside its `askedAt` and its answer beside its `answeredAt`. Assert three states: an answered turn renders both halves; an asked turn renders its question and marks the answer still awaited; an empty turn list renders the header alone and names no question, which is the first state the renderer ever sees, because `begin` saves `{ turns: [] }`. The function is pure — no clock, no filesystem, no model — and the test asserts that by calling it twice and comparing. Its doc comment states that the Markdown shape belongs to the domain because the store may not interpret `TState`, which is what makes this function core's rather than the adapter's.
6. **Core entry point.** Add `packages/core/src/interview/index.ts` re-exporting the state, the transcript renderer, and the interview, extend `packages/core/src/index.ts` with a value export beside the existing `export type *`, and rewrite its doc comment: the package still pulls in no adapter and declares no dependency, but it no longer emits no runtime binding. Write `packages/core/src/index.test.ts` asserting `createSingleTurnInterview` and `renderTranscript` are functions reachable from the entry point and that importing the entry point creates no session directory and reads no clock.
7. **Shared raw-frame fixture.** Create `tests/fixtures/interview-sse-frames.txt` holding literal SSE bytes, each frame terminated by a blank line. Its four frames are two segments, not one body, because no correct response carries all four. The first three — a `token`, a second `token` whose payload carries an escaped newline, and a `done` — are one complete happy-path body, and the `done` payload's `question` MUST be the byte-exact concatenation of the two `token` payloads' `text`, because task 9 scripts its model double from those two payloads. The fourth is the `error` frame, and its `message` MUST be exactly what task 9's failing model double raises, or neither error scenario can assert against the file. Add a sibling `tests/fixtures/README.md` naming `interview/interview-http-api` as the contract the file encodes, stating which segment is which, and stating that task 9 asserts the route emits these bytes while task 13 feeds all four to the parser, so a rename on either side fails a run. The file lives outside both packages, so reading it creates no package edge; both suites read it with `node:fs` from a path resolved against the repository root.
8. **Red then green — the store's optional transcript renderer.** Extend `packages/server/src/adapters/session-store/filesystem-session-store.test.ts` with the three `adapters/filesystem-session-store` delta scenarios, then widen `FilesystemSessionStoreConfig` to carry an optional `renderTranscript?: (session: StoredSession<TState>) => string`. The type parameter is defaulted — `FilesystemSessionStoreConfig<TState = unknown>` — so `sessionStoreConfigFromEnv`'s declared return type keeps compiling untouched, which is the whole reason the widening is not a breaking change. `save` passes its own argument to the renderer when one is configured, and falls back to today's `toTranscript` header when none is. A renderer that throws fails the save through the existing staging path, so the previous revision stays loadable and no temporary file survives — the failure is wrapped in the module's own error naming the session directory, exactly as a write failure already is. The three recorded scenarios this file already proves MUST stay green without an edit, which is what shows the renderer is genuinely optional. This task precedes the route tests because they assert transcript content the store cannot produce until it lands.
9. **Red — the route contract.** Write `packages/server/src/routes/interview-routes.test.ts` covering every `interview/interview-http-api` scenario except the typed client and the composition root. Build the app with `createApp` over a fake `LlmPort`, a real `createFilesystemSessionStore` rooted in a `mkdtemp` directory removed in `afterEach` and configured with `renderTranscript` from `@chrysalyst/core` — that configuration is what makes the transcript assertion reachable at all — and a scripted clock. Dispatch through `app.request(...)`. Assert the frames against `tests/fixtures/interview-sse-frames.txt` in two halves, matching the file's two segments: the happy-path response body equals the fixture's first three frames byte for byte, with the model double scripted from those two `token` payloads; and the failing-model body's last frame equals the fixture's fourth, with the double raising exactly that message. Assert every remaining body as raw text, because the raw bytes are the contract. Assert the newline case by counting separators. Assert abandonment by reading `response.body` through a reader, consuming the first `token` frame, then calling `reader.cancel()`, and asserting the fake `LlmPort` observed cancellation and the store holds no turn — never by aborting a signal passed to `app.request`, which on Node reaches nothing. Cover the replay scenario by dispatching the question route twice and asserting the second reached no model, and the storage-failure scenario with a store whose `save` rejects after the last chunk. Assert the on-disk result by reading both `session.json` and `transcript.md` from the temp directory. Write the malformed-body case as `it.each` over the four bodies the scenario names, and add the empty-turn-list conflict.
10. **Green — the routes and the app factory.** Create `packages/server/src/routes/interview-routes.ts` exporting `createInterviewRoutes(interview)`, which returns `new Hono()` with the three routes chained. `POST /interview` mints `randomUUID()`, calls `begin`, and answers `201` with `{ id }`. `GET /interview/:id/question` awaits `openingQuestion`, answers `404` with a JSON `message` naming the identifier when it resolved `undefined`, and otherwise returns `streamSSE(c, …)` that wires `stream.onAbort` to an `AbortController` passed into `openingQuestion`, writes one `token` frame per chunk, and writes `done` after the iterable finished — skipping `done` when `stream.aborted`, and writing one `error` frame carrying the caught message when the iterable rejected. Reach `onAbort` through response-body cancellation, which is what `@hono/node-server` triggers when a client disconnects (`writable` close → `reader.cancel()` → `stream.abort()`); do not subscribe to `c.req.raw.signal`, which `streamSSE` watches on old Bun alone. Call `streamSSE` with two arguments only: its third `onError` parameter writes its own `error` frame carrying a bare string, which contradicts the single-line-JSON payload invariant. `POST /interview/:id/answer` parses the body with a `zod` object requiring a non-blank `answer` string, answers `400`, `404`, `409`, or `204` per the outcome. Rewrite `packages/server/src/app.ts` as `createApp(deps)` returning one chained expression — `new Hono().get('/health', …).route('/', createInterviewRoutes(createSingleTurnInterview(deps)))` — with `AppType = ReturnType<typeof createApp>`. If `.route('/', …)` does not carry the sub-app's routes into `AppType`, inline the three handlers into the same chained expression instead and record which form was needed; task 11's type test is what decides. Update `packages/server/src/app.test.ts` to build its app through the factory. [expert]
11. **Green — the typed client and the server signature.** Extend `packages/server/src/client.test-d.ts`: the client exposes `$post` on the session route and the two parameterised interview routes, the parameterised routes accept the identifier as a path parameter, and an undefined route still fails the type check under `@ts-expect-error`. Change `startServer` to take the app as its first parameter, typed by the `fetch` member `@hono/node-server` requires so `server.ts` names no route type, and delete its import of `app.ts`. Update `packages/server/src/server.test.ts` to build an app for a test dependency set and pass it in.
12. **Composition root.** Create `packages/server/src/adapters/clock/system-clock.ts` exporting `createSystemClock(): ClockPort` — one method returning `new Date()` — with a doc comment saying why the system clock is an adapter rather than a call site. Create `packages/server/src/composition.ts` exporting `createDependenciesFromEnv(env: NodeJS.ProcessEnv = process.env)`, assembling the LLM adapter, the filesystem store typed at `InterviewState` and configured with `renderTranscript` from `@chrysalyst/core` passed by reference — the shared `StoredSession<InterviewState>` signature is what removes the adapting lambda — and the clock, and omitting `search`. Rewrite `main.ts` as `await startServer(createApp(createDependenciesFromEnv()), DEFAULT_PORT)`. Write `packages/server/src/composition.test.ts` asserting the scenario's clauses against a supplied environment record, including that resolving the set creates no directory — assert against a `CHRYSALYST_SESSION_DIR` under a `mkdtemp` sandbox that must still not exist afterwards.
13. **Red — frame reassembly.** Write `packages/web/src/interview/sse-frames.test.ts` for a parser over `AsyncIterable<string>`, driven by `tests/fixtures/interview-sse-frames.txt` rather than by frames restated here. Run it as `it.each` over every split position in the fixture, asserting the same four events come back each time. Add cases for a trailing partial frame, which yields nothing, and for the fixture's escaped newline arriving intact.
14. **Green — `sse-frames.ts`.** Implement the parser: buffer the incoming text, emit on each blank-line separator, parse the `event:` and `data:` lines of the frame, and hold anything after the last separator. Yield a decoded event only once its terminating blank line has arrived. [expert]
15. **Red then green — the browser's API client.** Write `packages/web/src/interview/interview-api.test.ts` and `interview-api.ts` together: `createSession(fetchImpl)` posts to `/interview` and returns the identifier; `openQuestionStream(id, fetchImpl, signal)` gets `/interview/:id/question`, reads `response.body` through a `TextDecoder` into the task 14 parser, and yields typed events; `submitAnswer(id, answer, fetchImpl)` posts and reports acceptance or the server's message. The tests supply a `fetch` returning a `Response` built over a `ReadableStream` they push into, so a chunk boundary is under the test's control. The module declares the three wire shapes and carries a doc comment naming `interview/interview-http-api` as the contract it restates, why `web` restates it, and `tests/fixtures/interview-sse-frames.txt` as the file that holds both sides to it. Confirm during this task that `Response`, `ReadableStream`, and `TextDecoder` are all reachable under the package's jsdom environment, and show the passing run as the evidence.
16. **Red then green — the interview view.** Write `packages/web/src/interview/InterviewView.test.tsx` and `InterviewView.tsx` together, covering the eight `interview/interview-view` scenarios this task owns — the six comp states across seven scenarios, plus the blank-answer rule — and the `web-shell` scenario `The shell mounts the interview view`, nine § Verification rows in all. Task 13 owns frame reassembly and task 17 the dev proxy. Inject the API client so no test touches the network. Before the first chunk the view shows a labelled connecting state and no answer control; the question region is a live region; the streaming indicator carries a text alternative; the answer field carries a label and is disabled until `done`; submit is disabled while the field is blank; while the answer request is in flight both controls are disabled, the view names that state, and a second submission is refused; a resolved submission disables both controls and shows a confirmation; an `error` event and a refused submission both surface their message. Update `packages/web/src/App.tsx` to render the heading and the view, and `packages/web/src/App.test.tsx` to the `The shell mounts the interview view` scenario. Style nothing beyond what a scenario asserts — tasks 20 through 22 own the visual result.
17. **Dev proxy.** Add `server.proxy` to `packages/web/vite.config.ts` routing `/interview` to `http://127.0.0.1:3000`, and write `packages/web/src/vite-config.test.ts` (`// @vitest-environment node`) importing the config and asserting the proxy entry names that target. Confirm `packages/web/src/build.test.ts` still passes untouched, which is what proves the proxy is dev-only.
18. **Workspace invariant.** Extend `tests/workspace.test.ts` with a scan asserting that no file under `packages/web/src` imports a specifier beginning with `@chrysalyst/`, reusing the existing `filesUnder` and `importedSpecifiers` helpers and covering `.ts` and `.tsx` alike. Add the check beside the existing `web depends on neither core nor server` test and leave that test as it stands. Change nothing else in the file.
19. **Live tier.** Write `packages/server/src/routes/interview-routes.live.test.ts`, gated as `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')` with a 120 s timeout and no module-scope `await`, matching `openai-compatible-llm.live.test.ts`. Start a real server on an ephemeral port over `createDependenciesFromEnv` with `CHRYSALYST_SESSION_DIR` pointed at a `mkdtemp` sandbox, then drive the whole path with `fetch`: create a session, read the SSE body, record the elapsed milliseconds to the first `token` event, submit an answer, and read both files off disk. Assert the question is non-blank, that it and its first token carry no `<think>` marker, that `session.json` holds the question, the answer, `askedAt`, `answeredAt`, and `schemaVersion` `1`, that `transcript.md` carries the question and the answer, and that time to first token is under 30 s. Print the model name and the measurement so the verification report can carry them. On either failure, apply the bounded ladder § Feasibility risk names, in that order.
20. **Approved styling — the token layer and the components.** Implement § Design Direction against the approved comp `specs/_plans/single-question-walking-skeleton/assets/comp.html`: the `:root` custom-property token layer holding exactly the § Design Direction table, plus one `*.module.css` per component (decision-log `[10]`). Style all six comp states — connecting, streaming, complete, submitting, recorded, failed — which task 16 already renders and tests; this task introduces no state and no markup a scenario does not already assert. The streaming indicator is a blinking 2px rule with a text alternative, removed under `prefers-reduced-motion`. The mark may be a placeholder if the final `assets/mark.svg` variant is not yet chosen. Every task-16 test MUST stay green without an edit; a test that needs editing means the comp changed behaviour, which belongs in a spec delta rather than in a style task.
21. **Self-hosted faces.** Add Source Serif 4 and Libre Franklin as woff2 files under `packages/web`, served through `@font-face` and never from a CDN, with their SIL OFL 1.1 licence text retained beside them. Run `impeccable font-match` to confirm the two faces against the comp, and record in the task's output whether it ranked against a resolvable browser or degraded to an estimate — § Dependencies says why that distinction matters. Assert nothing new: the faces are a § Manual Testing row, not a scenario.
22. **Finish review and DESIGN.md.** Run an impeccable finish review of the built view against the approved comp and the direction contract, then write `packages/web/DESIGN.md` from what shipped rather than from what was intended. Both artefacts are what § Design Direction's FINISH line requires, and each is a § Manual Testing row.
23. Run the full § Verification checklist end to end, including every § Manual Testing row and the live row, and fix what it surfaces.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 → 2 → 3 → 4 → 5 → 6 (one ordered stream in `packages/core`) |
| Group B | 7 |
| Group C | 8 → 9 → 10 → 11 → 12 (one ordered stream in `packages/server`) |
| Group D | 13 → 14 → 15 → 16 (one ordered stream in `packages/web`), 17, 18 |
| Group E | 19 |
| Group F | 20 → 21 → 22 (one ordered stream) |
| Group G | 23 |

Sequential dependencies:

- Group B → Groups C and D — both read `tests/fixtures/interview-sse-frames.txt`, so the fixture exists before either stream starts.
- Group A → Group C — the routes import the interview factory, `InterviewState`, and `renderTranscript`, and Group C's first task configures the store with the last of those.

Group C's order puts the store's optional renderer first, ahead of the route tests. That ordering is load-bearing rather than cosmetic: the route tests assert that a submitted answer lands in `transcript.md` as Markdown, and the store cannot produce that until it accepts a renderer, so a route pair scheduled first would leave a red assertion standing for three tasks with nothing in the plan's red-green rule to cover it.
- Group C → Group E — the live test drives the real routes and the composition root.
- Group D → Group F — the styling stream restyles the view Group D built.
- Groups A through F → Group G.

Groups A and D share no file and neither imports the other: `packages/web` declares no workspace package, and its tests fake the transport, so the browser stream can be built before the server that will feed it. Group C waits on Groups A and B. Tasks 17 and 18 touch `packages/web/vite.config.ts` and `tests/workspace.test.ts`, which no other task edits, so both run alongside Group D's stream.

Three tasks carry `[expert]` and twenty do not. Task 4 owns the ordering between yielding a chunk and committing the turn, the three cases that must store nothing, the shared production's own cancellation and its reference count, and the outcome vocabulary two route branches read — the module's only non-obvious correctness, and the one place round 2 found a fix that reintroduced its own bug. Task 10 owns the SSE framing, the abort path that reaches `onAbort` through body cancellation rather than the request signal, and the type-inference decision about `.route()`. Task 14 owns a parser whose whole difficulty is that a frame separator can arrive split across two chunks. Task 3 is untagged despite covering fifteen scenarios: they are assertions over three hand-written doubles against behaviour task 4 has yet to implement, which is fixture work rather than reasoning. Task 16 is untagged despite being a stream-driven view, because every state it renders is named by a scenario and the transport is injected. Tasks 1, 2, 5, 6, 7, 8, 9, 11, 12, 13, 15, 17, 18, 19, 20, 21, 22, and 23 are fixtures, type declarations, a `zod` object, an environment lookup against a stated precedent, a pure Markdown function, and assertions against an existing convention.

Unlike `003-add-filesystem-session-store`, this plan has human steps: § Design Direction is filled (impeccable subphase, 2026-09-09; comp and styling stack approved, the wordmark mark still in iteration but not a blocker for task 20), task 21 fetches two font families over the network, task 22 ends in a human-read finish review, and § Verification's live and manual rows need a running Ollama holding `qwen3:8b`.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| Module-scope binding | `packages/server/src/app.ts` — `const app` and `export { app }` | Replaced by `createApp(deps)`; a module-scope app cannot receive dependencies |
| Import | `packages/server/src/server.ts` — `import { app } from './app.ts'` | `startServer` is given the app it serves |
| Component body | `packages/web/src/App.tsx` — the placeholder `<h1>` -only return | Replaced by the shell that mounts the interview view |
| Test | `packages/web/src/App.test.tsx` — `renders the chrysalyst heading inside #root` | Asserts the removed placeholder screen; replaced by the `The shell mounts the interview view` scenario |

`specs/platform/web-shell/spec.md`'s `Placeholder screen renders into the mount point` is marked `DELTA:REMOVED` for the same reason.

Nothing else is removed. The store's `toTranscript` in particular is kept, not replaced: it becomes the fallback a store configured with no renderer uses, which is what keeps `003-add-filesystem-session-store`'s scenarios green and any non-interview `TState` working. This plan otherwise adds modules and changes two signatures.

## Verification

### Scenario Coverage

Path abbreviations: `interview.test.ts` is `packages/core/src/interview/single-turn-interview.test.ts`; `routes.test.ts` is `packages/server/src/routes/interview-routes.test.ts`; `store.test.ts` is `packages/server/src/adapters/session-store/filesystem-session-store.test.ts`; `view.test.tsx` is `packages/web/src/interview/InterviewView.test.tsx`.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| Beginning an interview stores an empty session | Integration | `interview.test.ts` (task 3) | `stores an empty turn list under the given id and reaches no model` |
| Beginning an interview that already exists keeps the stored session | Integration | `interview.test.ts` (task 3) | `leaves a stored session untouched rather than resetting its turns` |
| The opening question streams from the model and is stored once it completes | Integration | `interview.test.ts` (task 3) | `yields the model's chunks in order and saves the asked turn only after the last one` |
| The conversation carries one instruction and names no model | Integration | `interview.test.ts` (task 3) | `sends one system and one user message asking for a single question, and names no model` |
| Two concurrent requests for the opening question reach the model once | Integration | `interview.test.ts` (task 3) | `serves a concurrent second request from the in-flight production and stores one turn` |
| A caller that abandons a shared question production leaves the other caller's question intact | Integration | `interview.test.ts` (task 3) | `keeps the shared production alive when one of two callers abandons it` |
| A second request replays the stored question instead of asking the model again | Integration | `interview.test.ts` (task 3) | `replays the stored question, reaches no model, and leaves askedAt untouched` |
| A question the caller abandons is never stored | Integration | `interview.test.ts` (task 3) | `stores nothing and does not reject when the caller aborts mid-stream` |
| A model that produces no question fails the request and stores nothing | Integration | `interview.test.ts` (task 3) | `rejects a blank question and leaves the turn list empty` |
| A model that cannot be reached fails the request and stores nothing | Integration | `interview.test.ts` (task 3) | `propagates the model's rejection unchanged and leaves the turn list empty` |
| An unknown session yields no question stream | Integration | `interview.test.ts` (task 3) | `resolves undefined for an unbegun id before any chunk is pulled` |
| Recording an answer completes the stored turn | Integration | `interview.test.ts` (task 3) | `completes the turn, advances updatedAt, and leaves createdAt and askedAt alone` |
| Recording an answer for an unknown session reports no session | Integration | `interview.test.ts` (task 3) | `reports no-session for an unbegun id and writes nothing` |
| Recording an answer before the question was asked reports no open question | Integration | `interview.test.ts` (task 3) | `reports no-open-question over an empty turn list and writes nothing` |
| Recording a second answer reports no open question | Integration | `interview.test.ts` (task 3) | `reports no-open-question, keeps the stored answer, and appends no turn` |
| The transcript renders the interview as Markdown | Unit | `packages/core/src/interview/transcript.test.ts` (task 5) | `renders the identifier, both timestamps, and each turn, marking an unanswered one` |
| Interview state survives a JSON round trip | Unit | `packages/core/src/interview/state.test.ts` (task 1) | `round-trips through JSON with every instant returning as a string and the tag intact` |
| Creating a session answers its identifier | Integration | `routes.test.ts` (task 9) | `answers 201 with an id and lands the session on disk without reaching the model` |
| The question route streams token frames and closes with a done frame | Integration | `routes.test.ts` (task 9) | `emits the fixture's first three frames byte for byte and stores the question before done` |
| Token text carrying a newline stays inside one frame | Integration | `routes.test.ts` (task 9) | `escapes a newline inside the payload and emits one separator per event` |
| A second question request replays the stored question without reaching the model | Integration | `routes.test.ts` (task 9) | `frames a replayed question identically and reaches no model on the second request` |
| A failure after the stream opens arrives as an error frame | Integration | `routes.test.ts` (task 9) | `answers 200 then writes the fixture's error frame, no done frame, and stores no turn` |
| A storage failure after the last chunk arrives as an error frame | Integration | `routes.test.ts` (task 9) | `keeps every token frame, writes an error frame naming the store, and omits done` |
| The question route refuses an unknown session before opening a stream | Integration | `routes.test.ts` (task 9) | `answers 404 as JSON naming the id, with no event-stream content type` |
| A client that abandons the question stream stores nothing | Integration | `routes.test.ts` (task 9) | `cancels the model and stores no turn when the body reader is cancelled` |
| Submitting an answer persists it and answers no content | Integration | `routes.test.ts` (task 9) | `answers 204 and writes both session.json and a transcript carrying the interview` |
| Submitting an answer for an unknown session is refused | Integration | `routes.test.ts` (task 9) | `answers 404 as JSON naming the id` |
| Submitting a second answer is refused as a conflict | Integration | `routes.test.ts` (task 9) | `answers 409 and leaves the stored answer unchanged` |
| Submitting an answer before the question was requested is refused as a conflict | Integration | `routes.test.ts` (task 9) | `answers 409 over an empty turn list and stores no answer` |
| A body carrying no answer is rejected | Integration | `routes.test.ts` (task 9) | `answers 400 for $body and leaves the turn unanswered` — one `it.each` case per body |
| The app's routes reach a typed client | Unit | `packages/server/src/client.test-d.ts` (task 11) | `exposes the interview routes with a typed path parameter and rejects an undefined route` |
| The composition root builds the real adapters from the environment | Unit | `packages/server/src/composition.test.ts` (task 12) | `assembles llm, sessions with the transcript renderer, and clock, omits search, and touches no disk` |
| A saved session carries a transcript beside its state (`filesystem-session-store`, changed) | Integration | `store.test.ts` (task 8) | `writes exactly the renderer's output and rewrites it for a later revision` |
| A store with no renderer writes the metadata header (`filesystem-session-store`, new) | Integration | `store.test.ts` (task 8) | `falls back to the metadata header and does not reject over uninterpretable state` |
| A renderer that fails does not commit a revision (`filesystem-session-store`, new) | Integration | `store.test.ts` (task 8) | `rejects naming the session directory and leaves the previous revision loadable` |
| The view names a connecting state before the first chunk | Integration | `view.test.tsx` (task 16) | `shows a labelled connecting state with no answer control until the first chunk` |
| The view starts a session and shows the question as it arrives | Integration | `view.test.tsx` (task 16) | `creates a session first, then renders each chunk as it arrives into a live region` |
| A streaming indicator is visible only while the question streams | Integration | `view.test.tsx` (task 16) | `shows a labelled streaming indicator until the done event arrives` |
| The answer control opens only once the question is complete | Integration | `view.test.tsx` (task 16) | `keeps the labelled answer field and submit disabled until done` |
| Submitting an answer confirms it was saved | Integration | `view.test.tsx` (task 16) | `posts the typed text for the created session, confirms it, and closes both controls` |
| The answer control is closed while the submission is in flight | Integration | `view.test.tsx` (task 16) | `names the in-flight state, disables both controls, and refuses a second submission` |
| A blank answer is not submitted | Integration | `view.test.tsx` (task 16) | `sends no request while the field is blank` |
| A failure is shown to the person | Integration | `view.test.tsx` (task 16) | `surfaces an error event and a refused submission and keeps the answer control closed` |
| Frames split across network chunks are reassembled | Unit | `packages/web/src/interview/sse-frames.test.ts` (task 13) | `yields the fixture's events for a split at position $i and withholds a partial frame` |
| The dev server proxies the interview routes to the API | Unit | `packages/web/src/vite-config.test.ts` (task 17) | `routes the interview prefix to the API's loopback address` |
| Health route reports service status (`http-server`, changed) | Integration | `packages/server/src/app.test.ts` (task 10) | `answers GET /health with ok and the manifest version, reaching no dependency` |
| App type is published for the typed client (`http-server`, changed) | Unit | `packages/server/src/client.test-d.ts` (task 11) | `derives the client type from the app factory and exposes the health route` |
| Server binds a port and serves the app (`http-server`, changed) | Integration | `packages/server/src/server.test.ts` (task 11) | `serves the app it is given on an ephemeral port and releases it on close` |
| Server binds the loopback interface only (`http-server`, changed) | Integration | `packages/server/src/server.test.ts` (task 11) | `binds 127.0.0.1 by default` |
| Web package carries no internal dependency (`web-shell`, changed) | Unit | `tests/workspace.test.ts` (task 18) | `web source imports no @chrysalyst specifier` — the new test covers the scenario's import clause; the existing, unedited `web depends on neither core nor server` continues to cover its two manifest clauses |
| The shell mounts the interview view (`web-shell`, new) | Integration | `packages/web/src/App.test.tsx` (task 16) | `renders the product heading and the interview view into #root` |
| Core carries no runtime dependency (`core-ports-contract`, unchanged) | Unit | `tests/workspace.test.ts` (unchanged) | `core declares no runtime dependencies and its non-test source imports none` |
| Domain logic is reachable from the package entry point (`core-ports-contract`, new) | Integration | `packages/core/src/index.test.ts` (task 6) | `exposes the interview factory and the transcript renderer without touching a clock or the filesystem` |
| Production build emits a loadable bundle (`web-shell`, unchanged) | Integration | `packages/web/src/build.test.ts` | `emits index.html referencing a module asset into a temporary outDir` |

Nine scenarios are unit tests and every other is an integration test. `Interview state survives a JSON round trip`, `The transcript renders the interview as Markdown`, and `Frames split across network chunks are reassembled` are pure computation over values. `The app's routes reach a typed client`, `App type is published for the typed client`, `Web package carries no internal dependency`, and `Core carries no runtime dependency` are assertions about types and manifests, which execute nothing. `The composition root builds the real adapters from the environment` and `The dev server proxies the interview routes to the API` resolve a record and a config object and are asserted to perform no I/O, which is the point of both.

`Core carries no runtime dependency` is unchanged and needs no test edit. The existing scan reads import specifiers and not exports, so it already permits a runtime export; the `core-ports-contract` delta says so in its new scenario and in the background, because the new core module is what makes the distinction between "no dependency" and "no code" visible for the first time.

Three scenarios recorded by `003-add-filesystem-session-store` — `Store round-trips a session through a real directory`, `State the store cannot serialise does not survive the round trip`, and `A save that fails leaves the previous revision loadable` — are unchanged and MUST stay green through task 8 without an edit. That is the evidence that the renderer is genuinely optional rather than a new requirement on every caller.

Two live rows have no scenario and are deliberate. The live test proves nothing the hermetic suite does not already assert about behaviour; it exists to falsify the mission's premise against a real model and to produce the feasibility measurement, so it is listed under § Manual Testing rather than mapped to a scenario. The `<think>` and time-to-first-token assertions inside it likewise guard the model-specific hazards § Feasibility risk names, not specified behaviour.

Tasks 20 through 22 map to no scenario by design. Every state the comp renders is already a scenario task 16 builds and tests, so the styling stream changes appearance and nothing a test asserts; its evidence is the § Manual Testing rows naming the artefacts each task produces.

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| single-question-interview | `pnpm --filter @chrysalyst/core test` | Every interview, transcript and state test passes. The run installs nothing beyond the toolchain, creates no directory, and contacts no backend |
| interview-http-api | `pnpm --filter @chrysalyst/server test` | Every route, store, composition and adapter test passes, including the three unedited `003` store scenarios. The run creates and removes directories under the system temp directory and touches no path under `~/.chrysalyst`; both live files report as skipped |
| interview-http-api | `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m3 pnpm --filter @chrysalyst/server dev` then, in a second shell, `curl -sS -X POST localhost:3000/interview` | Prints `{"id":"<uuid>"}`. `ls /tmp/chrysalyst-m3/<uuid>` shows `session.json` and `transcript.md`; `session.json` carries `"schemaVersion": 1` and `"turns": []` |
| interview-http-api | `curl -sS -N localhost:3000/interview/<uuid>/question` | Frames arrive progressively rather than in one block: repeated `event: token` / `data: {"text":"…"}` pairs separated by blank lines, closing with one `event: done` whose payload carries the whole question. Requires a running Ollama |
| interview-http-api | `cat /tmp/chrysalyst-m3/<uuid>/session.json` immediately after the previous command | `turns` holds one entry with `"status": "asked"`, `question` and `askedAt` and no `answer`, proving the question was stored before `done` |
| interview-http-api | `curl -sS -N localhost:3000/interview/<uuid>/question` a second time | The same question arrives and the Ollama log shows no second inference. `askedAt` in `session.json` is unchanged |
| interview-http-api | Against one freshly created session whose question has not been requested: `curl -sS -N localhost:3000/interview/<uuid>/question & curl -sS -N localhost:3000/interview/<uuid>/question; wait` | Both requests name the same session. Both print the same question and the Ollama log shows one inference. `session.json` holds exactly one turn — the in-flight guard, observed where a reload would hit it |
| interview-http-api | The same pair, killing the first `curl` mid-stream with `kill %1` before the question completes | The second `curl` still prints the whole question and `session.json` holds it — the shared production is not torn down by one caller's disconnect |
| interview-http-api | `curl -sS -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/interview/<uuid>/answer -H 'content-type: application/json' -d '{"answer":"Eine App für Rezepte."}'` then the same command again | `204`, then `409`. After the first, `session.json` holds `answer`, `answeredAt` and `"status": "answered"` beside the unchanged `question` and `askedAt` |
| filesystem-session-store | `cat /tmp/chrysalyst-m3/<uuid>/transcript.md` after the previous row | Markdown naming the session identifier and both timestamps, then the question beside its `askedAt` and the answer beside its `answeredAt` — the interview content `specs/roadmap.md` § M2 deferred to this milestone |
| interview-http-api | `curl -sS localhost:3000/interview/does-not-exist/question`, then `POST` an answer to a fresh session whose question was never requested, then `POST` a body of `{}` | A JSON `message` naming `does-not-exist` with no event-stream content type; then `409`; then `400` |
| interview-view | `pnpm --filter @chrysalyst/web test` | Every parser, client and view test passes, plus the untouched production-build test. No test opens a socket |
| interview-view | `pnpm dev`, then open `http://localhost:5173` with a running Ollama holding `qwen3:8b` | A labelled connecting state appears first, then the question word by word rather than at once; the streaming indicator is visible while it writes and disappears when it stops; the answer field is disabled until then. Submitting shows the in-flight state, then a saved confirmation, and closes both controls. Record the model name and the perceived delay to the first visible word for the verification report. `<StrictMode>` double-invokes effects in dev, so each page load also creates one extra, never-questioned session directory — expect one orphan per load and do not read it as a bug |
| interview-view | With the browser open on a streamed question, stop Ollama and reload | The view shows the stored question without contacting the model, because it was persisted on the first request |
| interview-view | Stop Ollama, `pnpm dev`, open the page | The view shows the adapter's message naming the configured endpoint, the indicator disappears, and the answer control stays closed |
| single-question-interview, interview-http-api | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | The live suites run instead of skipping. The interview live test prints the model name and the milliseconds to first token, and asserts the persisted question carries no `<think>` marker. Both figures go into the verification report as the feasibility note, with § Feasibility risk's note on whether the figure is a streaming or a reasoning latency |
| interview-view | `ls packages/web/src/**/*.module.css && grep -c -- '--ground\|--ink\|--accent\|--rule' packages/web/src/index.css` | One CSS Module per component and a `:root` block holding every § Design Direction token. Task 20's artefact |
| interview-view | `impeccable font-match` over the built view, then `ls packages/web/**/*.woff2` | The two families confirmed against the comp, the woff2 files present under `packages/web` beside their OFL licence text, and no Google Fonts URL anywhere in the source. The output states whether the match ranked against a browser or estimated. Task 21's artefact |
| interview-view | The impeccable finish review over the built view, then `cat packages/web/DESIGN.md` | A finish review naming any material gap against the approved comp, and a `DESIGN.md` describing the system as shipped. Task 22's artefacts |
| web-shell | `pnpm --filter @chrysalyst/web build` | Exit 0; `dist/index.html` references a module asset and the two woff2 faces. The dev proxy is absent from the output, because it is dev-server configuration |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; both `*.live.test.ts` files report as skipped |
| Live tier | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 0 failures with both live suites running; the feasibility figures are printed |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; `packages/core` at or above the mission's ~90 % target, which its new interview module is the first code to be measured on |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

Every row but `Live tier` and the two `pnpm dev` rows of § Manual Testing runs with no daemon, no network, and no configured environment variable. Because C2 is still open, no runner reproduces any of this: a green checklist is evidence from one machine, and § Impact says what that costs.

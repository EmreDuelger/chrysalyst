# Decisions: single-question-walking-skeleton

## ADR: InterviewState v1 is a turn list over a tagged union

**ID:** interviewstate-v1-turn-list-tagged-union
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

`@chrysalyst/core` gains its first domain state: the session state the filesystem store persists and that grows across M8, M9, and M14. The generate-once requirement means the question is durable on disk before an answer exists, so "asked but unanswered" is a real state a reconnect replays from. The store hands `state` back exactly as `JSON.parse` produced it and revives only the two envelope timestamps, so any `Date` inside the state returns as a string. An earlier round proved an untagged `AnsweredTurn extends AskedTurn` union excludes neither a stray `answer` on an asked literal nor an `answeredAt` with no answer.

### Decision

`InterviewState = { turns: readonly Turn[] }` at `schemaVersion` 1, with `Turn = AskedTurn | AnsweredTurn` as two closed shapes, each carrying a literal `status` (`'asked'` or `'answered'`) and `isAnswered` narrowing on that tag. Every instant is an ISO 8601 string, never a `Date`. The list holds one turn in M3 and grows without a schema break. The store's envelope `schemaVersion` stays 1 and the transcript is unversioned.

### Options Considered

| Option | Verdict |
|--------|---------|
| Turn list over a tagged union, ISO strings | ✓ Chosen — the list costs nothing at one element and grows to M8 without a schema break; the tag is the only form TypeScript actually excludes the mixed literals and the only form that still narrows after a JSON round trip |
| One `Turn` with all four fields required | ✗ Rejected — cannot represent the asked-but-unanswered state a reconnect replays from |
| One `Turn` with `answer`/`answeredAt` optional | ✗ Rejected — admits an answer with no `answeredAt`, a meaningless combination |
| Untagged union narrowed by `'answer' in turn` | ✗ Rejected — a stray `answer` on an `AskedTurn` literal stays assignable, and so does an `answeredAt` with no answer |
| A single `question`/`answer` pair, no list | ✗ Rejected — M8 breaks the schema on its first extra turn |

### Consequences

`TState` inherits the JSON-round-trip constraint: only the two envelope timestamps revive to `Date`. A loaded turn arrives as plain data and narrows on its tag rather than a class check. `schemaVersion` is untouched because `003`'s ADR `schemaversion-versions-the-on-disk-envelope` already settled that it versions the envelope, not the domain state.

## ADR: core renders the transcript; the store takes the renderer as optional config

**ID:** core-renders-transcript-store-takes-optional-renderer
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

`specs/roadmap.md` § M2 deferred `transcript.md`'s interview content to M3 verbatim, and M6 needs a transcript that renders. The store's recorded boundary is that it never interprets `TState`, and `003`'s ADR `schemaversion-versions-the-on-disk-envelope` rests on that, so the Markdown rendering cannot simply move into the store.

### Decision

`packages/core/src/interview/transcript.ts` exports a pure `renderTranscript(session: StoredSession<InterviewState>): string`. `FilesystemSessionStoreConfig` takes a defaulted type parameter and accepts an optional `renderTranscript?: (session: StoredSession<TState>) => string`; `save` hands the renderer its own argument when one is configured and falls back to the existing metadata header when not. `createDependenciesFromEnv` passes core's renderer by reference. The transcript carries no version.

### Options Considered

| Option | Verdict |
|--------|---------|
| Renderer in `core`, optional renderer in the store config | ✓ Chosen — the Markdown shape is a fact about the interview and belongs with the state's owner; when the file is written stays the store's; optionality keeps `003`'s scenarios green untouched |
| Render the Markdown inside the store | ✗ Rejected — breaches the store's recorded "never interprets `TState`" boundary |
| Leave `transcript.md` a metadata stub, defer to a later milestone | ✗ Rejected by the user — M2 deferred the content to M3 verbatim and M6 needs it |
| Make the renderer required | ✗ Rejected — forces every future non-interview `TState` to supply one and breaks `003`'s recorded scenarios |

### Consequences

The renderer takes the port's own `StoredSession<TState>`, so one concept keeps one name and the composition root wires the function by reference. A renderer that throws travels the store's existing staging path, so a bad render leaves the previous revision loadable. The defaulted type parameter keeps `sessionStoreConfigFromEnv`'s declared return type compiling.

## ADR: The SSE contract is three event types, single-line JSON payloads, and no event id

**ID:** sse-contract-three-events-single-line-json-no-id
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

M3 exists in part to settle the Server-Sent Events contract for the streamed question. A model chunk can contain a newline, which would split one SSE frame into two if the payload were raw text.

### Decision

The stream carries `token` (`{ text }`), `done` (`{ question }`), and `error` (`{ message }`) and no other event types. Every `data` field is one line of JSON, because `JSON.stringify` escapes a newline. There is no `id:` field and no reconnection protocol: a client that loses the stream re-requests it and receives the stored question. `done` is written only after the question is stored, so observing `done` means the question is durable on disk.

### Options Considered

| Option | Verdict |
|--------|---------|
| Three typed events, single-line JSON payloads, no id | ✓ Chosen — the JSON envelope makes framing total rather than probabilistic; ordering `done` after the save makes durability observable and generate-once free |
| Raw text in `data`, no JSON envelope | ✗ Rejected — a chunk containing a newline splits one frame into two with no way to tell that from a frame boundary |
| `id:` plus `Last-Event-ID` resumption | ✗ Rejected — a protocol with no requirement behind it; re-requesting replays the stored question |
| One event type with a `type` field in the payload | ✗ Rejected — SSE already has an event channel a client should route on |

### Consequences

A `done` event is a durability signal a client can observe rather than assume. The first question request stores; every later one replays.

## ADR: The interview is a factory over CoreDependencies returning three operations that answer absence

**ID:** interview-factory-over-coredependencies-answers-absence
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

M3 is the first feature with any domain logic in `@chrysalyst/core`. The HTTP route must answer `404` before it opens an SSE stream, and a stale link or a resubmitted form is an ordinary outcome rather than an exceptional one. No status code may appear in `core`.

### Decision

`createSingleTurnInterview(deps)` returns `begin`, `openingQuestion`, and `recordAnswer`. `openingQuestion` resolves `AsyncIterable<string> | undefined`, resolving before the model is reached. `recordAnswer` resolves `'recorded' | 'no-session' | 'no-open-question'`, where `'no-open-question'` covers both an empty turn list and an already-answered last turn. `begin` never overwrites an existing session. The module lives at `packages/core/src/interview/`.

### Options Considered

| Option | Verdict |
|--------|---------|
| A factory over `deps` returning three operations, absence as a value | ✓ Chosen — the load decides existence, the pull reaches the model, and the outcome union lets the route own the mapping to `404` and `409`; `undefined` mirrors `SessionStorePort.load` the same caller already reads |
| Three free functions each taking `deps` | ✗ Rejected — every route handler repeats the plumbing and there is no single place for the module's design intent |
| A bare `AsyncIterable` from `openingQuestion` | ✗ Rejected — pushes the pre-stream `404` decision into iterator mechanics at the call site |
| Typed error classes for the two refusals | ✗ Rejected — a stale link and a resubmitted form are ordinary; a three-member union is smaller than a hierarchy |
| Keep the use case in `packages/server` until M7 | ✗ Rejected — inverts the architecture on the first feature with domain logic |

### Consequences

The `Promise` of an iterable splits resolving the stream from pulling it, so a refused request infers nothing about the model. The route owns every HTTP status; `core` names none.

## ADR: packages/web keeps no dependency on @chrysalyst/server and restates the wire shapes

**ID:** web-restates-wire-shapes-no-server-dependency
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

`decision-log [13]` of `001-add-monorepo-scaffold` deferred a type-only `web → server` package edge to "the first real feature". `hc` types route paths and JSON bodies but cannot type an SSE event name or its payload, which is the larger half of the M3 contract. `specs/roadmap.md` § M3 "Liefert" names an `hc<AppType>` client in `packages/web` as a deliverable.

### Decision

`packages/web` carries no `hc<AppType>` client and no type-only package edge. It reads the stream with `fetch` and a `ReadableStream`, declares the three wire shapes itself, and treats `interview/interview-http-api` as the shared contract both packages' tests are written from. `tests/fixtures/interview-sse-frames.txt` holds literal SSE bytes outside both packages; the route test asserts the server emits them and the parser test consumes them. `tests/workspace.test.ts` gains a scan asserting no file under `packages/web/src` imports a `@chrysalyst/` specifier. `client.test-d.ts` stays in `server` and covers the three new routes. `/speq:record` replaces § M3 "Liefert"'s client clause with this wire-shape restatement.

### Options Considered

| Option | Verdict |
|--------|---------|
| No package edge; restate the three wire shapes; shared frame fixture | ✓ Chosen — the edge would buy path names and two three-field bodies while costing a browser package a type dependency on a Node package reaching `node:fs`, `ai`, and `hono`; reversal cost is asymmetric, and the frame fixture closes most of the rename risk for one file |
| Add `@chrysalyst/server` as a type-only dependency | ✗ Rejected on the balance above |
| Use `EventSource` instead of `fetch` | ✗ Rejected — cannot be aborted with the signal the interview threads through, and makes the parser untestable at a chunk boundary |

### Consequences

A rename on either side of the contract fails a test run rather than only the manual browser check. What stays uncovered by types is the two JSON bodies, three fields total. Revisit at M11, whose live spec preview is the first wire shape too large to restate by hand. `001`'s ADR `hono-server-framework` is untouched: the typed-client claim is still proved inside `server`.

## ADR: The app is built by a factory and the server is handed the app it serves

**ID:** app-built-by-factory-server-handed-the-app
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

`platform/http-server` shipped a module-scope `app` and a `startServer` that imported it. M3 adds concrete adapters — an OpenAI-compatible language model, the filesystem session store, a system clock — that a route test must be able to replace with fakes and a `mkdtemp` directory.

### Decision

`createApp(deps)` replaces the module-scope `app`, `AppType` becomes `ReturnType<typeof createApp>`, and `startServer(app, port, host?)` no longer imports `app.ts`. `main.ts` becomes the composition root: `createDependenciesFromEnv(process.env)` assembles the LLM adapter, the filesystem store, and a system clock and hands them to `createApp`.

### Options Considered

| Option | Verdict |
|--------|---------|
| App factory over `deps`; server handed the app | ✓ Chosen — concrete implementations are constructed only at the entry point, so a route test builds an app over a fake model and a `mkdtemp` store; deriving `AppType` from the factory removes the second place a route could be missing from |
| Module-scope app reaching deps through a mutable holder set at boot | ✗ Rejected — a hidden global every route test would share |
| Construct the adapters inside `app.ts` | ✗ Rejected — a route test would then need a real Ollama and the user's home directory |

### Consequences

Four `platform/http-server` scenarios take a delta because each names the old construction in its `GIVEN`. The process entry point is the only module that constructs a concrete adapter.

## ADR: Styling stack is plain CSS with a custom-property token layer plus CSS Modules

**ID:** styling-stack-plain-css-tokens-plus-css-modules
**Plan:** single-question-walking-skeleton
**Status:** Accepted

### Context

`decision-log [14]` of `001-add-monorepo-scaffold` deferred the styling-stack choice to this first UI feature's impeccable subphase. The approved direction is an editorial system — hairline rules and space, no cards, no shadows — whose whole surface area is a small fixed token table: five colours, two font families, one measure, one micro-label recipe.

### Decision

`packages/web` styles with hand-written CSS: one token layer as `:root` custom properties and one `*.module.css` file per component, scoped by Vite's native CSS Modules. No CSS framework, no component library, no CSS-in-JS runtime. Source Serif 4 and Libre Franklin are self-hosted under `packages/web` and loaded with `@font-face`, never from a CDN.

### Options Considered

| Option | Verdict |
|--------|---------|
| Plain CSS token layer plus CSS Modules | ✓ Chosen — custom properties make the token layer one place to change; CSS Modules give per-component scope at zero runtime cost with no new toolchain, and Vite already resolves them; M5 locale work and any dark mode become edits to the `:root` block |
| Tailwind | ✗ Rejected — utility classes scatter a small fixed token system across markup and add a PostCSS/Tailwind build step to a package with neither |
| CSS-in-JS (vanilla-extract, styled-components) | ✗ Rejected — a runtime or compiler plugin for a surface this small; custom properties already express the token layer |
| A single global stylesheet with BEM naming | ✗ Rejected — per-component modules keep the cascade shallow and the scope automatic without a naming discipline to enforce |

### Consequences

Responsive and state styling are written by hand rather than composed from utilities, which for one column and six states is a few dozen lines. Font files ship in the repo under SIL OFL 1.1.

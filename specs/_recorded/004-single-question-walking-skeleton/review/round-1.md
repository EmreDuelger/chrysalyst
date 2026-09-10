# Plan Review Findings: single-question-walking-skeleton (round 1)

## Summary

- Axes checked: 6/6
- Total findings: 15 (Blockers: 6, Advisory: 9)
- Intent Fidelity blockers: 2

## Premortem

Three ways this plan fails, each routed into the taxonomy below.

**Failure 1 — the walking skeleton walks, and nobody can read where it went.** M3
records green. M6 then needs "das Transkript einer bestehenden Session rendert
weiterhin" and discovers `transcript.md` holds four header lines and no interview,
because the roadmap assigned the transcript's interview content to M3 and this plan
never mentions it. → `[SCOPE_REDUCTION]`.

**Failure 2 — the red bar arrives on day one and nobody knows which artefact is
wrong.** Task 1's `@ts-expect-error` is unused, so the type test fails; task 6's
abort test never aborts anything, so the fake model never sees cancellation. Two of
eighteen tasks specify verification that the chosen types and the pinned framework
cannot produce. → `[UNSTATED_ASSUMPTION]`, `[AMBIGUOUS_REQUIREMENT]`.

**Failure 3 — the feasibility number is measured, published, and wrong.** The one
figure M3 exists to produce is time to first token from a reasoning model whose
reasoning pass may sit in front of the first text token, or in front of the browser
as `<think>` markup. The plan guards the markup and not the clock. →
`[UNSTATED_ASSUMPTION]`.

## Intent Fidelity

#### [SCOPE_REDUCTION] BLOCKER

- Location: `plan.md` § Non-Goals and § Impact; every spec delta
- Issue: `specs/roadmap.md` § M2 defers the transcript's content to this milestone
  verbatim — "jeder Session-Ordner trägt zusätzlich eine `transcript.md`, die die
  Session und ihre Zeitstempel benennt — **der Interview-Inhalt selbst kommt mit
  M3**". No task, scenario, or Non-Goal in this plan mentions `transcript.md`.
  `packages/server/src/adapters/session-store/filesystem-session-store.ts`'s
  `toTranscript` writes the id and two timestamps and nothing else, so after this
  plan the file still carries no question and no answer. § Impact then asserts the
  opposite: "where a person can read `session.json` and `transcript.md` directly".
  The omission also hides a real design question the plan never confronts: the
  store's doc comment says the envelope wraps "the domain state it carries but
  never interprets", so rendering the interview into Markdown cannot live where the
  transcript currently lives without a new decision about who owns that rendering.
- Fix: In `plan.md`, either (a) add a task rendering the question and answer into
  `transcript.md`, add a `DELTA:CHANGED` scenario to the
  `adapters/filesystem-session-store` spec (create
  `specs/_plans/single-question-walking-skeleton/adapters/filesystem-session-store/spec.md`)
  asserting the transcript carries the interview content, add the matching
  § Verification row, and add a decision-log entry naming who renders the
  transcript now that the store must not interpret `TState`; or (b) add
  `transcript.md` interview content to § Non-Goals with the milestone that takes it
  over, and add a decision-log entry recording that the roadmap's M2 promise moves
  to that milestone. Either way, correct the § Impact sentence so it no longer
  implies `transcript.md` holds the interview.

#### [INTENT_DRIFT] BLOCKER

- Location: `plan.md` § Consequences row 1; `decision-log.md` § [4]
- Issue: `specs/roadmap.md` § M3 "Liefert" names the deliverable
  "`hc<AppType>`-Client in `packages/web`". The plan delivers no client in `web`,
  restates the wire shapes by hand, and adds a workspace invariant (task 15) that
  makes the roadmap's deliverable fail a test run. The reversal is argued at length
  in § Consequences and decision `[4]`, but neither names the roadmap line it
  reverses, and neither proposes amending it. The plan is otherwise scrupulous
  about roadmap bookkeeping — § Impact and decision `[11]` both instruct
  `/speq:record` on M3's status — so a reader has no signal that a named
  deliverable was dropped. After `/speq:record`, `specs/roadmap.md` still promises
  an `hc` client that the recorded specs forbid.
- Fix: Add one sentence to `plan.md` § Impact and to `decision-log.md` § [4]
  stating that this plan reverses `specs/roadmap.md` § M3 "Liefert"'s
  `hc<AppType>`-Client deliverable, and add an explicit instruction — in § Impact
  beside the existing "M3 stays `⬜ offen`" line — that `/speq:record` MUST replace
  that clause in `specs/roadmap.md` § M3 with the wire-shape restatement this plan
  ships. Leave the technical decision itself unchanged.

## Feasibility

#### [UNSTATED_ASSUMPTION] BLOCKER

- Location: `plan.md` § Implementation Tasks task 6, sentence "Assert the abort case
  by passing an `AbortSignal` to `app.request` and aborting it mid-stream, then
  asserting the fake model saw its cancellation and the store holds no turn"
- Issue: the mechanism does not fire. In the pinned `hono@4.13.7`,
  `dist/helper/streaming/sse.js` subscribes to `c.req.raw.signal` only inside
  `if (isOldBunVersion())`; on Node nothing watches the request signal.
  `StreamingApi.abort()` runs only from `responseReadable`'s `cancel` callback —
  that is, when the *consumer of the response body* cancels. Measured against the
  installed packages: aborting a signal passed to `app.request` left `onAbort`
  unfired and the handler produced all 5 chunks; `reader.cancel()` fired `onAbort`
  after 1 chunk. Task 6 is the only automated coverage of the
  `interview/interview-http-api` scenario `A client that abandons the question
  stream stores nothing` and of decision `[7]`, so the abandonment path ships
  unverified. Production is unaffected — `@hono/node-server@2.1.1` wires
  `writable.on("close", cancel)` → `reader.cancel()` → `stream.abort()` — which is
  precisely why a test written against the request signal would keep failing while
  the code under test is correct.
- Fix: Rewrite that sentence in `plan.md` task 6 to: read the response body through
  a reader, consume the first `token` frame, call `reader.cancel()`, then assert the
  fake `LlmPort` observed cancellation and the store holds no turn. Add a sentence
  to task 7 stating that `stream.onAbort` is reached through response-body
  cancellation on Node, not through `c.req.raw.signal`, so the implementer does not
  wire the request signal instead.

#### [NFR_IGNORED] BLOCKER

- Location: `plan.md` § Requirements rows "Generate once" and "Durable before
  announced"; § Implementation Tasks task 4 and task 7
- Issue: both requirements are stated absolutely — "The model is reached at most
  once per session" and "A client that observed `done` and reloads MUST see the
  same question" — and the design has no mechanism that holds either under
  concurrent requests. Task 4 specifies load-then-save with no coordination, so two
  overlapping `GET /interview/:id/question` requests on one session both load an
  empty turn list, both reach the model, and both save; the later save can replace a
  question a client already saw announced by `done`. This is reachable, not
  theoretical: the plan's own § Manual Testing row instructs a reload while a
  question streams, and a server does not observe the old connection's close before
  the new request's load. `POST /interview/:id/answer` has the same shape — two
  overlapping submissions both read an asked turn and both answer `204` instead of
  `204` then `409`. Neither spec carries a concurrency scenario. Separately,
  `packages/web/src/main.tsx` renders under `<StrictMode>`, whose double-invoked
  effects create and abandon one extra session per dev page load; the § Manual
  Testing rows that instruct `ls /tmp/chrysalyst-m3/<uuid>` do not warn of the
  orphan directory.
- Fix: In `plan.md` task 4, specify a per-session in-flight guard — a
  `Map<SessionId, Promise<…>>` inside `createSingleTurnInterview` that a second
  concurrent `openingQuestion` awaits instead of reaching the model — and state in
  § Key interfaces that the guard is process-local. Add a scenario `Two concurrent
  requests for the opening question reach the model once` to
  `interview/single-question-interview/spec.md` and a matching § Verification row
  under task 3. Add one sentence to § Impact naming the residual limit (the guard
  is process-local, so two server processes over one session directory can still
  double-generate) and one sentence to the § Manual Testing `pnpm dev` row naming
  the StrictMode orphan session.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: `plan.md` § Feasibility measurement and § Feasibility risk
- Issue: § Feasibility risk treats `qwen3:8b`'s reasoning as a *content* hazard only
  — a `<think>` block reaching the browser and the disk. It ignores the same
  model's effect on the one number the milestone exists to produce. If the
  OpenAI-compatible endpoint or the `ai` SDK separates reasoning from text, the
  first `token` event arrives only after the entire reasoning pass, and the
  measured time to first token is a reasoning latency rather than the streaming
  latency the mission's "erste spürbare Reaktion innerhalb weniger Sekunden" claim
  is about. The 30 s ceiling then either flakes or passes while publishing a
  misleading figure. Second-order: the bounded fix ladder appends a thinking-off
  directive to the user message, which edits the prompt that tasks 3 and 4 froze —
  § Implementation Tasks opens with "Tests a pair leaves green MUST stay green
  through every later pair without being edited".
- Fix: In `plan.md` § Feasibility risk, add the latency case to the trigger list:
  state that a time-to-first-token above the ceiling, not only a `<think>` marker,
  enters the same ordered fix ladder. Add one sentence to § Implementation Tasks
  task 3 requiring the prompt assertion to check the system message's intent rather
  than its exact text, so the ladder's prompt edit does not force a test edit.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: `plan.md` § Implementation Tasks task 7; `interview/interview-http-api`
  § Background, "The stream carries three event types and no others" and "Every
  event's `data` is a single-line JSON object"
- Issue: `hono@4.13.7`'s `streamSSE(c, cb, onError)` writes its own frame when the
  callback throws and an `onError` argument is present: `run()` calls
  `stream.writeSSE({ event: 'error', data: e.message })` — a bare string, not a JSON
  object. An implementer who passes `onError` for logging silently breaks the
  payload invariant, and no planned test covers it, because task 7's own try/catch
  keeps the callback from throwing in the tested paths. Task 7 never mentions the
  third argument.
- Fix: Add one sentence to `plan.md` task 7: `streamSSE` MUST be called with two
  arguments, because its `onError` path writes a non-JSON `error` frame that
  contradicts the payload invariant.

#### [HIDDEN_DEPENDENCY] ADVISORY

- Location: `plan.md` § Dependencies, "No package is added"; § Implementation Tasks
  task 17
- Issue: task 17 requires self-hosted Source Serif 4 and Libre Franklin woff2 files
  under `packages/web` and an `impeccable font-match` run. § Dependencies covers npm
  packages only and says nothing about where the two font families come from, that
  acquiring them needs network access, or that `impeccable font-match --rank`
  degrades to "the catalog's nearest face, size estimated" when no browser is
  resolvable. The § Checklist `Install` row asserts an unchanged lockfile, which
  stays true and hides the point.
- Fix: Add a paragraph to `plan.md` § Dependencies naming the two font families,
  their licence (SIL OFL), the fact that task 17 downloads their woff2 files into
  `packages/web`, and that `impeccable font-match --rank` needs a resolvable browser
  to rank rather than estimate.

## Requirement Quality

#### [AMBIGUOUS_REQUIREMENT] BLOCKER

- Location: `plan.md` § Implementation Tasks task 1, "Add a `state.test-d.ts`
  asserting that a `Turn` literal carrying `answer` without `answeredAt` fails the
  type check, with `@ts-expect-error`"; § Key interfaces; `decision-log.md` § [1]
- Issue: the assertion is false against the declared types, so the task cannot pass.
  With `AnsweredTurn extends AskedTurn` and `Turn = AskedTurn | AnsweredTurn`, the
  literal `{ question, askedAt, answer }` is assignable to `AskedTurn`, and the
  excess-property check against a union admits `answer` because some member declares
  it. Compiled with the repo's `tsconfig.base.json` settings, `tsc` reports
  `error TS2578: Unused '@ts-expect-error' directive` — task 1 fails, and
  `packages/core/vitest.config.ts` has `typecheck.enabled: true`, so it fails the
  suite. The same check accepts `{ question, askedAt, answeredAt }`, an
  `answeredAt` with no answer. That falsifies the stated advantage in
  `decision-log.md` § [1], which rejects the optional-fields alternative "because it
  also admits an answer with no `answeredAt`, a combination that means nothing" —
  the chosen shape admits it identically.
- Fix: In `plan.md` § Key interfaces, discriminate the union with a literal tag —
  `AskedTurn` carrying `readonly status: 'asked'` and `AnsweredTurn` carrying
  `readonly status: 'answered'` — and narrow on that tag instead of `'answer' in
  turn` in `isAnswered`. Update task 1, task 2, task 4, `decision-log.md` § [1], and
  the `interview/single-question-interview` § Background paragraph describing the
  turn shapes. If the tag is rejected, delete the `@ts-expect-error` clause from
  task 1 and strike the "a combination that means nothing" argument from
  `decision-log.md` § [1], because the chosen types do not deliver it.

#### [COMPLETENESS_GAP] BLOCKER

- Location: `interview/single-question-interview/spec.md` § Scenarios;
  `interview/interview-http-api/spec.md` § Scenarios; `plan.md` task 4
- Issue: no artefact says what happens when an answer arrives for a session whose
  turn list is empty. The path is reachable over the public HTTP surface —
  `POST /interview` followed directly by `POST /interview/:id/answer`, with the
  question never requested. Task 4 enumerates only two refusals: "returns
  `'no-session'` for absent, `'no-open-question'` when the last turn is already
  answered, and otherwise replaces that turn with an answered one". On `turns: []`
  there is no turn to replace, so the described implementation indexes past the end
  of the list and either rejects or writes a turn with no question. Task 6's route
  tests never exercise it, and none of `400`, `404`, `409` is assigned to it.
  Related and unstated: `begin(id)` returns `Promise<void>` and, called twice on one
  identifier, silently overwrites a stored question and answer with `{ turns: [] }`.
- Fix: Add a scenario `Recording an answer before the question was asked reports no
  open question` to `interview/single-question-interview/spec.md` and a scenario
  `Submitting an answer before the question was requested is refused as a conflict`
  to `interview/interview-http-api/spec.md`. Amend `plan.md` task 4 to state that
  `recordAnswer` returns `'no-open-question'` for an empty turn list as well as for
  an answered last turn, and amend task 3 and task 6 to cover the new scenarios. Add
  one sentence to task 4 stating what `begin` does for an identifier that already
  holds a session. Add the two § Verification rows.

#### [REQUIREMENT_CONFLICT] BLOCKER

- Location: `plan.md` § Design Direction "States the comp covers";
  `interview/interview-view/spec.md` § Scenarios; § Implementation Tasks task 17
- Issue: the approved comp
  (`specs/_plans/single-question-walking-skeleton/assets/comp.html`, `State —
  connecting` at line 226 and `State — submitting` at line 293) requires two view
  states that no `interview/interview-view` scenario names. The spec's six scenarios
  cover streaming, indicator, answer control, submit-confirms, blank answer, and
  failure — nothing distinguishes *before the first chunk arrives* from *streaming*,
  and nothing covers the in-flight submit ("field and submit disabled, hint reads
  'Recording…'"). Task 13 therefore builds neither. Task 17 then forbids the only
  remaining route: "Every task-13 test MUST stay green without an edit; a test that
  needs editing means the comp changed behaviour, which belongs in a spec delta
  rather than in a style task" — and no such delta exists. Task 17 must either ship
  less than the approved comp or add two untested state transitions. § Parallelization
  compounds it by justifying task 13's untagged status on the claim that "every state
  it renders is named by a scenario".
- Fix: Add two scenarios to `interview/interview-view/spec.md` — one for the
  connecting state (the view shows a labelled pre-stream state and no answer control
  before the first chunk) and one for the submitting state (the field and the submit
  control are disabled while the answer request is in flight, and the view names
  that state). Extend `plan.md` task 13 to cover both, add the two § Verification
  rows, and delete "submitting" and "connecting" from the list of things task 17
  introduces so task 17 stays a styling task.

#### [COMPLETENESS_GAP] ADVISORY

- Location: `interview/interview-http-api/spec.md` § Scenarios; `plan.md`
  § Requirements rows "Generate once" and "Durable before announced"
- Issue: two of the plan's eight § Requirements are HTTP-observable MUSTs with no
  HTTP-level scenario. `A second request replays the stored question instead of
  asking the model again` exists only in `interview/single-question-interview`, yet
  the route exercises a different code path — the iterable that yields stored text
  rather than model chunks, framed and closed with `done` like a live stream. Only
  a § Manual Testing curl row covers it. Separately, no scenario covers a `save`
  failure after the model's last chunk: tokens have already been delivered, `done`
  must not be written, and an `error` frame must follow — a path `A failure after
  the stream opens arrives as an error frame` does not reach, because its `GIVEN` is
  a rejecting language model.
- Fix: Add two scenarios to `interview/interview-http-api/spec.md` — `A second
  question request replays the stored question without reaching the model` and `A
  storage failure after the last chunk arrives as an error frame and no done frame`
  — extend `plan.md` task 6 to cover both, and add the two § Verification rows.

#### [REQUIREMENT_CONFLICT] ADVISORY

- Location: `platform/web-shell/spec.md` line 3; `platform/core-ports-contract/spec.md`
  line 3
- Issue: both deltas leave their feature-description lines contradicting their own
  changed content, and neither line sits inside a DELTA marker, so `/speq:record`
  merges the contradiction into the permanent library. `web_shell` still reads
  "produces a loadable page and renders a placeholder screen" while the same file
  marks `Placeholder screen renders into the mount point` as `DELTA:REMOVED`.
  `core_ports_contract` still reads "a single type entry point" while the same file
  adds a scenario requiring the entry point to "export the interview factory as a
  value".
- Fix: Wrap each feature-description line in a `DELTA:CHANGED` marker. Rewrite
  `web_shell`'s to name the interview view as the shell's screen, and
  `core_ports_contract`'s to say the entry point publishes the ports and the domain
  logic written against them.

## Task Breakdown

#### [TASK_GRANULARITY] ADVISORY

- Location: `plan.md` § Parallelization, "Four tasks carry `[expert]` and fourteen
  do not"
- Issue: three tasks carry `[expert]` — 4, 7, and 11. The sentence claims four and
  then names those three. The untagged list — "Tasks 1, 2, 5, 6, 8, 9, 10, 12, 14,
  15, 16, 17, and 18" — names 13 of the 15 untagged tasks and omits task 3
  entirely; task 13 is discussed separately. The counts route work between
  `implementer-agent` and `implementer-expert-agent`, so a stale count either
  misroutes a task or signals that a fourth `[expert]` tag was dropped without a
  decision.
- Fix: Correct the sentence in `plan.md` § Parallelization to "Three tasks carry
  `[expert]` and fifteen do not", add task 3 to the untagged list, and state in one
  clause why task 3 — eleven behavioural scenarios over three hand-written doubles —
  needs no expert tag.

#### [TASK_GRANULARITY] ADVISORY

- Location: `plan.md` § Implementation Tasks task 17
- Issue: task 17 is four units under one number and one verification: the `:root`
  token layer plus one CSS Module per component; acquiring, self-hosting, and
  `font-match`-confirming two font families; the six comp states; and closing with
  an impeccable finish review plus a DESIGN.md written from the shipped world. It
  carries no `[expert]` tag, no § Verification Scenario Coverage row, and no
  automated check of the § Design Direction token table, whose own preamble says
  "the view must implement exactly these". Its only gate is a human finish review,
  so a partial completion is indistinguishable from a finished one at the task
  boundary.
- Fix: Split task 17 in `plan.md` into 17a (token layer plus CSS Modules against the
  comp's six states), 17b (self-hosted `@font-face` for the two families, confirmed
  with `impeccable font-match`), and 17c (impeccable finish review plus DESIGN.md).
  Add the three to § Parallelization Group E as an ordered stream, and add a
  § Manual Testing row naming the artefact each produces.

## Design Depth

No objection on module depth, dependency direction, or boundaries — axis checked:
`packages/core` gains executable code that imports only its own relative modules and
reaches the world through `CoreDependencies`, matching the existing
`tests/workspace.test.ts` scan; `createSingleTurnInterview` hides the store, clock,
and model behind three operations and a three-member outcome union rather than
status codes; `createApp(deps)` plus `createDependenciesFromEnv` put concrete
adapter construction at the entry point alone; `sse-frames.ts` is pure computation
over an `AsyncIterable<string>` with the transport injected. One leakage finding
follows.

#### [INFORMATION_LEAKAGE] ADVISORY

- Location: `plan.md` § The event contract and § Consequences row 1;
  `decision-log.md` § [4]
- Issue: the SSE frame format — three event names, the JSON envelope, and the field
  names `text`, `question`, `message` — is one decision reflected in three modules
  after this plan: `packages/server/src/routes/interview-routes.ts` writes it,
  `packages/web/src/interview/sse-frames.ts` parses it, and
  `packages/web/src/interview/interview-api.ts` redeclares its shapes. Nothing
  executable holds the three in agreement. The plan names the residual risk
  honestly — "a rename on one side is not caught by either package's tests, only by
  the manual browser run and the live test" — but accepts it without trying the
  cheap remedy, which costs no package edge: one raw-frame fixture file outside both
  packages that task 6 asserts the route emits and task 10 feeds to the parser. That
  turns a rename on either side into a failing run rather than a failing browser.
- Fix: Add a task to `plan.md` § Implementation Tasks creating a shared raw-frame
  fixture under `tests/fixtures/` (a `token`, a `token` carrying an escaped newline,
  a `done`, and an `error` frame as literal SSE bytes), and amend task 6 and task 10
  to read that file rather than each declaring its own frames. Record the choice in
  `decision-log.md` § [4] as the executable half of the shared contract.

## Prose Quality

#### [PROSE_BLOAT] ADVISORY

- Location: `plan.md` § Non-Goals; § Impact
- Issue: § Non-Goals is one ~110-word semicolon chain against the guardrails' 25-word
  sentence cap, which forces a reader to hold nine exclusions in one breath. § Impact
  opens its body with the preamble "Four consequences are worth stating rather than
  assuming" — a heading in sentence form, not a conclusion — and its C2 paragraph
  runs 40 words in one sentence.
- Fix: Rewrite `plan.md` § Non-Goals as a bulleted list, one exclusion per bullet,
  each naming the milestone that owns it. Delete the "Four consequences" sentence
  from § Impact and split the C2 paragraph into two sentences.

#### [PROSE_UNCLEAR] ADVISORY

- Location: `plan.md` § Design Direction, the FINISH paragraph and the Tokens
  heading
- Issue: "**FINISH (impeccable contract).** unreviewed and undocumented is
  unfinished; this build ends with the finish review, the verdict, DESIGN.md, and
  every shipping raster carrying its provenance" starts a sentence lowercase and
  imports impeccable's internal vocabulary — "the verdict", "shipping raster",
  "provenance" — into a plan whose build ships CSS, two woff2 faces, and one SVG and
  no raster at all. "Confirm the exact faces at build time with `impeccable
  font-match`" reads as a build-pipeline step; task 17 means during implementation.
  The Tokens heading "(the view must implement exactly these)" uses a lowercase
  `must` for what the plan treats as binding; per RFC 2119 only the capitalised
  keyword obliges.
- Fix: In `plan.md` § Design Direction, rewrite the FINISH paragraph to name the two
  concrete artefacts task 17 must produce — the impeccable finish review and
  `DESIGN.md` — and drop the raster clause. Change "at build time" to "while
  implementing task 17". Capitalise `MUST` in the Tokens heading.

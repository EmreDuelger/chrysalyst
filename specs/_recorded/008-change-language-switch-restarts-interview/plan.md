# Plan: change-language-switch-restarts-interview

## Summary

Make the language control change the language the interview is actually held in: switching it while a round is open abandons the question stream, creates a second session in the chosen language, and asks the question again — after asking the person first when that would discard an answer they have typed. Switching it once the answer has been sent relabels the chrome and nothing else.

## Design

### Context

The language control is a relabelling control that claims to be a language control. Switching it today changes every static label and leaves the question — the one piece of text the person came to read — frozen in whatever language the page happened to open in. `interview/interview-view` states that as intended behaviour: »Switching the chrome's language therefore never re-creates a session, never re-asks a question, and never relabels a question that is already on screen.«

That is the behaviour this plan reverses, and it closes a criterion the roadmap already wrote. M5's »Fertig, wenn« reads »Locale-Umschaltung ändert die Oberfläche *und* die Sprache, in der das Modell fragt«. The shipped app meets that at start-up only: the language the page opens in decides the session's language, and every later switch is chrome-deep. A person who lands on an English page and switches to German gets a German masthead over an English question. M5 is marked done against a criterion its own deliverable half-meets, so this is a correction to a recorded milestone rather than work taken out of roadmap order — M6, the topmost open milestone, has one item left, and the roadmap has already routed it to M18 because the browser this sandbox lacks is what blocks it.

Four forces shape the design.

**A session's language is immutable by construction.** `interview/interview-http-api` fixes the language at `POST /interview` and the creation response is what names it; nothing in the wire contract or in `InterviewState` can change it afterwards. Making it mutable would mean a new route, a schema field, and a rule for what happens to a question already asked in the old language. The clarifying interview rejected that. So "change the language of the interview" can only mean "hold the interview in a second session".

**A restart is destructive and a draft answer is unrecoverable.** Nothing has been sent to the server; the typed text lives only in the component. Discarding it silently would trade one surprise (the question is in the wrong language) for a worse one (the paragraph you just wrote is gone). The clarifying interview chose to confirm first.

**The shell cannot make this decision.** `App.tsx` owns the language and knows nothing about the view's typed text or its phase — which is exactly the boundary `platform/web-shell` draws and the reason the gate in `008` sits in front of the mount rather than inside the view. Whether a switch needs confirming depends on state only the view holds, so the decision belongs to the view.

**The comparison is a loop hazard.** `interview/interview-view` deliberately has the view take the session's language from the creation response rather than from the value it sent. A restart trigger written as "the chrome's language differs from the session's language" therefore restarts forever the moment the API answers with a language it was not asked for: create in `de` → response says `en` → restart in `de` → response says `en`. The trigger has to be the language the round was *started for*.

**Goals**

- A language switch during an open round restarts the interview in the chosen language.
- A restart that would discard typed text is confirmed first, in the language the person just chose.
- A declined restart leaves a coherent screen: chrome in the new language, interview in the old one — a pairing the feature already supports.
- A restart resets the round completely, with no text, failure or confirmation carried across.
- The in-flight question stream is abandoned, not left reading.
- No focus is lost when a control the person activated leaves the document.
- `App.tsx`, `packages/server` and `packages/core` are untouched.

**Non-Goals**

- **No mutable session language.** The clarifying interview rejected changing a live session's language server-side. `POST /interview`, `InterviewState` and `schemaVersion` are unchanged, and no route is added.
- **No sweep of the abandoned session.** The restart leaves a session folder holding an unanswered turn. `interview/interview-http-api`'s »A client that abandons the question stream stores nothing« already specifies that the server tolerates exactly this, and the session library that would list such a folder is M17's. Nothing deletes it and nothing marks it.
- **No reopening of a recorded round.** The clarifying interview ruled that out explicitly: after the answer is sent, a language switch relabels the chrome and stops there. Offering a fresh session at that point would be an implicit second round, which this feature does not hold.
- **No confirmation of the language switch itself.** The chrome switches immediately and irrevocably; only the interview restart is confirmed. Reverting the select on a decline would require the shell to ask the view for permission before committing a value the shell owns.
- **No modal.** See § Design Direction.
- **No debounce or rate limit on restarts.** The trigger is a two-option `<select>` operated by a person, and the unconfirmed path only fires while the draft is blank.
- **No new failure text.** Nothing here can fail in a new way; a second session's creation fails exactly as the first's does.
- **No change to `packages/server` or `packages/core`.** The server already creates a session in any supported language. Which language the browser asks for, and when, is a delivery decision.

### Decision

#### Architecture

```
 App.tsx  ── unchanged ─────────────────────────────────────────────────────┐
   owns locale (chrome)                                                     │
   <select> → setLocale + rememberLocale + documentElement.lang             │
   renders <InterviewView api={api} locale={locale} />                      │
└───────────────────────────────────────────┬───────────────────────────────┘
                                            │ locale prop
                                            ▼
 InterviewView.tsx  ── CHANGED ─────────────────────────────────────────────┐
                                                                            │
  ┌ the gate ────────── render phase, fires only on a prop change ────────┐ │
  │  locale !== chosen ?                                                  │ │
  │    setChosen(locale)                                                  │ │
  │    ├ locale === round.locale  → setPending(false)   (switched back)   │ │
  │    ├ round closed (sent)      → nothing             (relabel only)    │ │
  │    ├ no draft at risk         → beginRound(locale)  (restart now)     │ │
  │    └ draft at risk            → setPending(true)    (ask first)       │ │
  └───────────────────────────────────────────────────────────────────────┘ │
                                                                            │
  draftAtRisk = showAnswerForm && answer.trim() !== ''                      │
                                                                            │
  ┌ the request ─── rendered while pending && round open && draftAtRisk ──┐ │
  │  keep    → setPending(false); focus the answer field                  │ │
  │  discard → setPending(false); beginRound(locale); focus the region    │ │
  └───────────────────────────────────────────────────────────────────────┘ │
                                                                            │
  ┌ the withdrawals ────── the request closes unanswered ─────────────────┐ │
  │  submit()        → setPending(false)  the phase leaves OPEN_PHASES    │ │
  │  answer → blank  → setPending(false)  nothing is left to discard      │ │
  │    and, while a request was open, the held-up restart proceeds:       │ │
  │    ├ locale !== round.locale → beginRound(locale)  (restart now)      │ │
  │    └ locale === round.locale → nothing more        (already there)    │ │
  └───────────────────────────────────────────────────────────────────────┘ │
                                                                            │
  beginRound(next) = setRound({ index: round.index + 1, locale: next })     │
                                                                            │
  ┌ the round effect ────────── deps [api, round] ────────────────────────┐ │
  │  cleanup: controller.abort()      ← abandons the previous stream      │ │
  │  body:    reset question/answer/session/failure/recordedAt/phase      │ │
  │           and pending — the seven values a round begins as            │ │
  │           createSession(round.locale) → openQuestionStream(id, signal)│ │
  └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### The round is one value, and the effect that conducts it depends on exactly that value

```ts
interface Round {
  readonly index: number;   // monotonic; makes every restart a new object
  readonly locale: Locale;  // the language this round was STARTED FOR
}
```

`round.locale` is the language the view asked for, never the language the creation response named — that stays in `session.locale`, which the question region declares and which the gate never reads. § Context's loop is unreachable by construction rather than by a guard.

`index` exists so that restarting into the language the round is already in produces a new object and re-runs the effect. It never appears on screen.

#### The restart is the effect re-running, and the effect owns what a round begins as

The question effect's dependency list becomes `[api, round]`. React then does three of the four things a restart needs, for free and in the right order: it runs the previous effect's cleanup, which already calls `controller.abort()`; that abort reaches `openQuestionStream`'s `fetch` and is swallowed as a clean end rather than a failure, which `interview-api.ts` already implements; and the previous run's `abandoned()` guard already stops it writing to state after the abort. None of that is new code — the effect has had this shape since `004`.

The fourth thing is the reset, and it goes in the effect body, before the async work:

```ts
useEffect(() => {
  const controller = new AbortController();
  setQuestion('');
  setAnswer('');
  setSession(null);
  setFailure(null);
  setRecordedAt(null);
  setPhase('connecting');
  setPending(false);
  submitting.current = false;
  // …createSession(round.locale), then stream…
}, [api, round]);
```

Putting the reset here makes the effect the single place that knows what a round consists of. The alternative — resetting in each of the two callers that begin a round — would write the same list twice and leave a third caller, added by a later milestone, free to forget a field. Without the reset, `setQuestion((text) => text + event.text)` appends the second question to the first, which is the defect this shape removes rather than guards against.

`setPending(false)` is the seventh value and it is not optional. Without it a confirmed discard leaves the request on screen: `beginRound` drives the phase to `connecting`, which `OPEN_PHASES` declares open, so the request re-renders over the round it just started. The discard handler clears `pending` too, because the effect runs after the commit and the render in between would otherwise show the request for one frame.

#### The gate runs in the render phase and fires only on a change

Detecting "the `locale` prop changed" is React's documented render-phase state adjustment, not an effect: comparing against a `chosen` state value and calling `setChosen` during render re-renders immediately, without a paint and without the extra frame an effect costs.

It must fire on the *change* rather than on the *difference*. A gate written as a standing condition (`locale !== round.locale`) cannot be dismissed: declining would clear `pending`, the next render would see the same difference and set it again, and the request could never be closed. Carrying `chosen` — the chrome language the gate has already answered for — is what makes decline, and the closed-round case, stick.

The four branches are in § Architecture. Three of them are worth naming:

**Switched back is not a restart.** If the person switches to the other language and then back, `locale === round.locale`: the interview is already in the language now chosen, so the request is withdrawn and nothing is discarded. A gate that skipped this check would offer to discard the draft in order to restart into the language the round is already running in.

**Closed is `submitting` and `recorded`, not `recorded` alone.** Once `submitAnswer` is in flight the answer is on the wire and the round is being closed; restarting would abandon a request the server will very likely honour.

**The draft is at risk only while the answer form renders it.** `showAnswerForm` is true in `streaming`, `complete` and `submitting` and in no other phase, so a non-blank `answer` in `connecting` or `failed` is text nobody can read, edit or send. The gate therefore branches on `draftAtRisk` — the answer form is on screen and the draft is non-blank — rather than on `answer` alone.

That one rule settles `failed` without a second one. `failed` is open, and a switch there always restarts without asking, including after a refused submission where `answer` still holds the text that was sent. `failed` removes the form that held that text, so the restart discards nothing the person could still act on, and the switch is the only way back for someone whose stream broke. The rule also keeps the request where § Design Direction places it: directly below an answer form that is always on screen when the request is.

#### Emptying the draft clears the obstacle, so the restart proceeds

A request on screen names text the person has typed. Deleting that text answers the request by removing its subject, so the restart it was holding up happens immediately. The alternative closes the request and restarts nothing. That leaves the chrome in one language and the question in another, recoverable only by switching away and back. That is the state a person is least able to explain, and it is reached without them ever declining anything.

The restart fires from the answer field's `onChange`, not from the gate, so it is an event rather than a standing condition and cannot loop. It fires only while a request is open. A decline has already closed the request, so a draft cleared after `Keep my answer` restarts nothing, and the declined resting state § Goals names still stands. `locale !== round.locale` guards the call for the same reason `discard` reads the prop. Today a request cannot be open while the two agree; the guard keeps that assumption from becoming a silent restart if a later milestone opens one.

#### The confirmation commits to the language current at the moment it is confirmed

`discard` calls `beginRound(locale)`, reading the prop rather than a value captured when the request opened. With two languages the two are always equal — switching to a third value would have withdrawn the request. Reading the prop is what keeps that true when a third language is added.

#### `App.tsx` is not touched

The shell keeps owning the language, keeps writing it to storage and to `documentElement.lang`, and keeps handing it down as a prop. It gains no callback, no `key`, and no knowledge of the view's state. `platform/web-shell`'s »the view MUST be handed the chosen language« is the whole contract between them, and it is already satisfied.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| The decision lives with the state it depends on | `InterviewView`, not `App` | Whether a switch needs confirming depends on the draft and the phase, which only the view holds. A shell-side gate would need the view to mirror both upward |
| One value identifies a round; the effect depends on it | `Round { index, locale }` | Restart, reset and abort are one transition rather than three coordinated ones. `index` makes a restart into the current language still a restart |
| The trigger is the language asked for, not the language answered | `round.locale`, never `session.locale` | The creation response is allowed to name a different language; comparing against it restarts forever |
| The effect owns what a round begins as | the reset in the effect body | One place knows the round's state; a field added later is reset where it is declared, not in every caller |
| Cleanup abandons the previous stream | the existing `controller.abort()` | Already written, already swallowed by `interview-api.ts`, already guarded by `abandoned()`. The restart needed no new abort machinery |
| Render-phase adjustment, not an effect | the gate | React's documented way to adjust state when a prop changes; no extra paint, and the request is on screen in the same commit as the switch |
| Fire on the change, not on the difference | the `chosen` state value | A standing condition cannot be declined — it re-asserts itself on the next render |
| Every label from a dictionary | four new `UiStrings` members | The request is copy, and `platform/web-shell` requires one dictionary per language with a shared declared shape |
| Focus follows a control that is removed by activation | `discard` and `keep` handlers | Both controls leave the document when activated. A withdrawal the person did not activate moves nothing — the same distinction `008` drew on the setup screen's check control |

#### Key interfaces

```tsx
// packages/web/src/interview/InterviewView.tsx                            CHANGED
// InterviewViewProps is UNCHANGED: { api: InterviewApi; locale: Locale }

/** Which round is running and the language it was started FOR — never the
 *  language the creation response named, which lives in `session.locale`.
 *  `index` makes a restart into the round's own language a new value, so the
 *  effect re-runs; it is never rendered. */
interface Round {
  readonly index: number;
  readonly locale: Locale;
}

/** A round is open while it can still be restarted — that is, until the
 *  answer is on the wire. Openness decides whether a switch restarts at all;
 *  `draftAtRisk` alone decides whether it asks first. `failed` is open and is
 *  never at risk, so a switch there always restarts without asking. */
const OPEN_PHASES: ReadonlySet<Phase> = new Set([
  'connecting', 'streaming', 'complete', 'failed',
]);

/** Text the person can still read, edit and send. The answer form renders in
 *  `streaming`, `complete` and `submitting` alone, so a non-blank `answer` in
 *  any other phase is unreachable text a restart costs nothing. This is the
 *  one place that decides what "would discard an answer" means: the gate asks
 *  only while it holds, and the request renders only while it holds. */
const draftAtRisk = showAnswerForm && answer.trim() !== '';

// state added
const [round, setRound]   = useState<Round>(() => ({ index: 0, locale }));
const [chosen, setChosen] = useState<Locale>(locale);  // the chrome language the gate has answered for
const [pending, setPending] = useState(false);         // the person was asked and has not answered yet

// state removed
// const mountLocale = useRef(locale);   ← superseded by round.locale

// packages/web/src/locale/strings.ts                                      CHANGED
export interface UiStrings {
  // …existing 22 members…
  readonly languageSwitchLabel: string;
  readonly languageSwitchPrompt: string;
  readonly languageSwitchDiscard: string;
  readonly languageSwitchKeep: string;
}
```

#### UI copy

| Member | `en` | `de` |
|---|---|---|
| `languageSwitchLabel` | `The language changed` | `Die Sprache wurde gewechselt` |
| `languageSwitchPrompt` | `Starting the interview in this language discards the answer you have typed.` | `Das Interview in dieser Sprache zu beginnen verwirft Ihre getippte Antwort.` |
| `languageSwitchDiscard` | `Discard and restart` | `Verwerfen und neu beginnen` |
| `languageSwitchKeep` | `Keep my answer` | `Antwort behalten` |

No entry interpolates the language's name. The chrome and the request are already rendered in the language the person chose, so naming it would repeat what the sentence is written in, and it would add an import of `LOCALE_ENDONYMS` into a view that needs none. The destructive control names the consequence before the action, so a person reading only the control label still knows what it costs.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| A language switch starts a second session | Changing the running session's language server-side | The clarifying interview chose this. A mutable session language means a new route, a schema field and a rule for a question already asked in the old language — a large intrusion into the session model to avoid one abandoned folder the server already tolerates |
| The restart lives in `InterviewView` | `App.tsx` remounting the view with `key={locale}`; `App` asking the view for permission | `key={locale}` restarts unconditionally and silently discards the draft, which the interview ruled out. Asking the view for permission inverts the dependency: the shell would need the view's phase and draft mirrored upward to decide something the view already knows |
| The chrome switches immediately; only the restart is confirmed | Confirming the switch itself and reverting the select on a decline | Reverting a value the shell owns requires the shell to ask the view first. The declined resting state — chrome in one language, question in another — is a pairing `interview/interview-view` already specifies and already tests, so nothing incoherent is left behind |
| The trigger compares against `round.locale` | Comparing against `session.locale`; comparing against the last render's prop via a ref | `session.locale` is the response's, which the feature allows to differ from the request's — the comparison then restarts on every such answer, forever. A ref holding the previous prop is the same idea as `chosen` with an extra render and no lint coverage |
| `Round { index, locale }` as one state value | A `restartCount` number beside a `roundLocale` value | Two values can drift, and the effect would need both in its dependency list. One object makes "a round" a single thing, and makes a restart into the current language still a restart |
| The reset lives in the effect body | Resetting in `discard` and in the blank-draft branch; splitting the view so a `key` remounts a child | Two callers means the list is written twice and a third caller can forget a field. The split gets a free reset but forces a parent that mirrors the child's phase and draft to decide whether a restart needs confirming — trading six resets for a continuous state mirror across a new boundary, which duplicates the decision "is this round still open?" in two modules |
| The gate fires on a prop change | A standing render-phase condition; a `useEffect` on `[locale]` | A standing condition re-asserts itself after a decline, so the request can never be closed. An effect paints the pre-request frame first and costs an extra commit for a decision available during render |
| `submitting` counts as closed | Treating only `recorded` as closed; confirming during `submitting` | The answer is already on the wire and this feature holds one round. Restarting would abandon a request the server will honour, and confirming would race it. Sending the answer withdraws any open request, so a refusal — which returns the phase to `failed`, open again — cannot bring it back over a draft the person can no longer see |
| Emptying the draft restarts the interview | Closing the request and restarting nothing; treating a blanked draft as a decline | Blanking the draft removes the only thing the request protects, so the restart it held up proceeds. Declining is what says »do not restart«, and a decline still stands — the restart fires only while a request is open. The alternative leaves the chrome in one language and the question in another, with no request on screen and no way back but switching away and back |
| `failed` counts as open, and never at risk | Treating it as closed; asking in `failed` when `answer` is non-blank | One rule covers both halves: the gate asks only while the answer form renders the draft, and `failed` removes that form. So a switch in `failed` always restarts without asking, including after a refused submission, and the request never has to render without the draft it names. A switch is also the only way back for a person whose stream broke without reloading |
| Focus moves only when the person activated the removed control | Always focusing the region when the request closes; never moving focus | A withdrawal caused by the select must not pull focus off the select the person is still operating. Activation always focuses its control, so the two cases are distinguishable without tracking focus |
| An inline request in the answer block | `window.confirm`; a modal `<dialog>` | See § Design Direction |
| The abandoned session is left alone | Deleting it on restart; marking it abandoned | Deleting needs a route that does not exist and that `POST`-only contract does not have. The server already specifies that an abandoned stream stores nothing surprising, and M17 owns the surface that would ever list such a folder |

## Design Direction

**The impeccable subphase ran, inside `/speq:plan`, code-led.** No image generation is available in this harness, so it produced no comp.

**No new surface contract is written.** The surface is `packages/web/src/interview/InterviewView.tsx`, which already carries one at `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md` from M3. That contract fixes the world — Operate mode, editorial minimalism, the five tokens, the two voices — and this change adds one component inside it rather than opening a new surface. A second contract for the same file would be two documents to keep in agreement. Read the existing contract before task 3; the calls this plan adds are below, and task 4 audits them against it.

**The mechanism is an inline request in the answer block, not a modal and not `window.confirm`.**

`window.confirm` is refused outright: its buttons are the browser's chrome, rendered in the browser's language rather than the one the person just chose, which contradicts the exact thing this feature exists to fix. It is also unstyleable and untestable through the DOM.

A modal `<dialog>` is refused on the stronger of two grounds. The weak ground is that `packages/web/DESIGN.md`'s Flat-Forever and No-Box rules leave no legal way to draw one — a dialog needs a surface, and the system has none. The strong ground is that a modal is the wrong affordance here: it exists to stop a person acting on a screen they can no longer safely read, and the thing at risk in this decision is the draft answer, which is on screen and is exactly what they should be looking at while deciding. Interrupting the screen would cover the evidence. The craft floor's own test — »no modal for a task that needs neither interruption nor protected focus« — resolves to *no modal* once the protected content is the content the decision is about.

**The request's treatment:**

- **Structure follows § Inline Error's opening idiom** — a region opened by `border-top: 1px solid var(--rule)` with `2.5rem` top margin — but **takes no left rule**. The 2px vermilion left rule is the error block's signature, and this is a question, not a failure.
- **It takes no vermilion at all.** The One Red Rule allows one vermilion element per state, and in this state that element stays `Record answer →`. That is the right allocation on its own merits: the loudest thing on screen should be the action that *saves* the person's work, not the one that discards it.
- **The label** (`The language changed`) is Label type, Soft Ink, `aria-hidden` — the same pairing § Inline Error uses.
- **The prompt sentence** is Caption type, Near-Black Ink, in a `role="alert"` region. Assertive rather than polite: a wrong keystroke from here discards written work, and the person's attention is on the masthead control they just operated.
- **Both controls are Action type in a right-aligned row**, set like the submit control but without its accent: `Keep my answer` in Near-Black Ink, `Discard and restart` in Soft Ink — the destructive option quieter than the safe one, and both quieter than the vermilion `Record answer →` above them.
- **Placement is directly below the answer form**, so the reading order is question → the draft at risk → the request → its controls.
- **No motion.** Nothing on this screen streams, and the § Recorded Confirmation fade is the system's single authored accent beat.
- **Accessibility bar:** both controls carry accessible names and visible focus and are keyboard-operable; the request is announced when it appears; focus lands on the answer field after `Keep my answer` and on the interview region after `Discard and restart`; contrast stays at or above 4.5:1.

**Two calls stay open for build time**, to be resolved in task 3 and audited in task 4: the control order in the row (safe-then-destructive versus destructive-then-safe), and whether the request needs a rule *below* it to separate it from the recorded block that can never coexist with it. Neither is a spec question.

**`packages/web/DESIGN.md` § The Six View States is now incomplete** — `complete` has a variant in which the request is on screen. Task 3 updates that table and § Components. That update is not gated on the browser: it documents what shipped, and it needs the code rather than a capture.

## Features

| Feature | Status | Spec |
|---------|--------|------|
| interview-view | CHANGED | `interview/interview-view/spec.md` |

The delta replaces the scenario titled **»Switching the chrome's language leaves the running interview alone«** with six scenarios. That replacement is written as a `DELTA:REMOVED` block reproducing the old scenario verbatim — the form `004` used for `Placeholder screen renders into the mount point` — beside a `DELTA:NEW` block carrying the six, rather than as a `DELTA:CHANGED` block, because the title itself asserts the behaviour being reversed and a `CHANGED` block matched by title would leave the old scenario in the library. Its precondition — a question arrived in full and an answer field holding typed text — survives verbatim as the first new scenario's `GIVEN`, now asserting confirm-then-restart.

Four features get no delta:

- **`platform/web-shell`** — `App.tsx` is not edited. The shell still owns the language, still remembers it, still sets `documentElement.lang`, and still hands the chosen language to the view, which is the whole of its »Choosing a language remembers it for the next visit« scenario. What the view then does with that prop is the view's spec.
- **`interview/interview-http-api`** — no route, body or status changes. Creating a second session while an earlier one holds an unanswered turn is already permitted, and »A client that abandons the question stream stores nothing« already specifies the server's side of a restart.
- **`adapters/filesystem-session-store`** — the abandoned session folder is an ordinary stored session; nothing sweeps it and nothing reads it differently.
- **`platform/backend-setup-gate`** — the gate is in front of the mount, so a view that restarts is a view the gate already let through. Its own rule that a language switch must not re-probe is unaffected.

`interview/interview-view`'s »The view creates its session in the language it was mounted with« also stays as written: the mount case is exactly what it asserts, and taking each session's language from its own creation response is what the restart path repeats rather than changes.

## Impact

Switching the language now switches the language of the interview, not only of the labels around it. A person who lands on an English page, switches to German, and has typed nothing sees the question restart in German. A person who has typed an answer is asked first, in German, and can keep what they wrote — in which case the chrome stays German and the question stays English, a pairing the app already supported. A person who has already recorded their answer sees the labels change and nothing else.

**One session folder is left behind per restart**, holding an unanswered turn, in whatever directory `CHRYSALYST_SESSION_DIR` names. Nothing deletes it, nothing reports it, and no route behaves differently because of it. This is the cost the clarifying interview accepted in place of a mutable session language, and it is the same folder the server already produces when a browser tab is closed mid-question.

**No wire change and no data change.** `POST /interview` is called a second time with a different `locale`; no route, body, status or field is added. `schemaVersion` stays `1` and `InterviewState` is untouched.

**No breaking change.** `InterviewViewProps` keeps its two members. `AppProps` is unchanged. No environment variable is added and no package is added.

**M5's acceptance criterion is met.** `/speq:record` MUST append this plan to M5's »Pläne« line in `specs/roadmap.md` — `bilingual-ui-and-prompts · change-language-switch-restarts-interview` — and MUST leave M5's `✅ erledigt` status as it stands in § Überblick. It MUST NOT change M6's or M18's status: M6 stays open on the finish review the roadmap already routed to M18, and this plan adds to that carrier only under § Dependencies' condition below.

## Requirements

| Requirement | Details |
|-------------|---------|
| A switch during an open round restarts the interview | A second session is created naming the chrome's current language, and its question is requested. Open means `connecting`, `streaming`, `complete` or `failed` |
| A restart never discards typed text without consent | Text the answer form is rendering, and that is non-blank, puts a request on screen and starts nothing until the person confirms. A phase that renders no answer form — `connecting`, `failed` — holds no text the person can act on, so it restarts without asking |
| A declined restart changes nothing but the chrome | No session, no request, no reset. The typed text and the question are byte-identical to before the switch |
| A switch after the answer is sent changes only labels | `submitting` and `recorded` create no session, request no question and show no request |
| The request leaves the screen when the answer is sent | Submitting withdraws an open request, and no submission outcome brings it back. A refusal MUST NOT return a request that names a draft the person can no longer see |
| Emptying the answer field withdraws the request and lets the restart proceed | A draft edited down to blank leaves nothing to discard, so the request closes and the restart it was holding up happens at once: the view MUST create a second session naming the chrome's language whenever that language differs from the one the round was started for, and MUST NOT ask again. When the two already agree, the request closes and nothing restarts. Typing again MUST NOT reopen the request: the person was asked about text that no longer exists |
| A restart resets the round completely | Question text, typed text, session, failure, recorded time, phase and any open request — the round's seven values — all return to their mount values. A confirmed discard therefore leaves no request on screen. The second question is never appended to the first |
| The previous stream is abandoned | The restart aborts the in-flight request through the signal the effect already creates, and no event from the abandoned stream reaches state |
| The trigger cannot loop | The comparison reads the language the round was started for. A creation response naming a different language MUST NOT cause a further restart |
| No focus is lost | Activating either control moves focus — to the answer field on keep, to the interview region on discard. A request withdrawn by the language control moves no focus |
| Every label comes from a dictionary | Four new members in both languages; the view holds no literal |
| Nothing outside the view changes | `App.tsx`, `packages/server` and `packages/core` are not edited. The lockfile is unchanged |

## Dependencies

No package is added and the lockfile does not change. `AbortController` is already used by this effect.

Task 4 needs a harness browser able to capture the running dev server at 1280px and 400px, which is the same dependency `008` recorded and the same one this repository's `playwright-chrome-blocked` note assigns to the user. **The check is one of two observations:** `/opt/google/chrome/chrome` exists, or the Playwright MCP's `browser_navigate` succeeds against `pnpm dev`. Both fail as this plan is written — `/opt/google/chrome/chrome` is absent and the MCP is pinned to the `chrome` channel. Task 4 runs the check when `/speq:implement` reaches it and branches on the result; a browser installed by then makes the branch moot.

Task 3's styling and its `DESIGN.md` update have no browser dependency.

## Migration

| Current | New |
|---------|-----|
| `mountLocale = useRef(locale)`, captured on first render | `round.locale`, advanced by the gate and by the discard control |
| question effect deps `[api]` | `[api, round]` |
| the effect body starts a session and never resets | the effect body resets the round's seven state values — the six the screen shows plus any open discard request — then starts a session |
| `UiStrings` has 22 members | 26 members; both dictionaries gain the same four |
| `InterviewView.test.tsx` has one language-switch test | eight, replacing it — six scenarios, the first of them carrying three tests |

**No data migrates.** No session file is read, written or rewritten by anything this plan adds.

## Implementation Tasks

Tasks 1 and 2 are red-green pairs: write the failing tests, run them red, then write the smallest implementation that turns them green. Every test a pair leaves green MUST stay green through every later task without being edited, except where a task says otherwise.

1. **Red then green — the request's dictionary entries.** Add § UI copy's four members to `UiStrings` in `packages/web/src/locale/strings.ts` and to `en.ts` and `de.ts`. Extend `packages/web/src/locale/strings.test.ts` so each new member is present, non-blank, and different between the two languages, in the style the file already uses for the existing members. `strings.test-d.ts` covers the missing-member and missing-language guards and MUST stay green untouched — the four new members are what make it bite again.

2. **Red then green — the restart, the request, and the reset.** Write the six `interview/interview-view` scenarios into `packages/web/src/interview/InterviewView.test.tsx`, deleting the existing `relabels the chrome without re-creating the session, re-requesting the question, or clearing the typed answer` test, whose subject this plan reverses. Then change `packages/web/src/interview/InterviewView.tsx` to § Key interfaces.

   The suite drives every case through `rerender(<InterviewView api={api} locale={…} />)`, which is how the file already simulates a chrome-language change; the `scriptedStream`, `fakeApi` and `mounted` helpers it already holds cover the rest. The no-draft scenario is an `it.each` over `connecting`, `streaming`, `complete` and `failed`, and its `failed` case MUST be reached by a refused submission with a non-blank `answer` — the state where the phase holds text the form no longer renders, and the one case that separates the `draftAtRisk` rule from a bare `answer.trim()` check. Assert the abort by giving `openQuestionStream` a second scripted stream and checking that a token emitted on the first one after the restart reaches neither the question region nor the phase — an assertion that fails if the effect's cleanup is dropped, which a passing render alone would not catch. Assert the reset by emitting a token on the second stream and checking the question region holds only that token, which is what catches the append defect § Decision names, and assert in the same test that the request itself is gone, which is what catches a reset that forgets `pending`.

   The first scenario is three tests, one per terminal branch, and each fails without the withdrawal rules § Architecture names. From the state the scenario starts in — request on screen, draft non-blank, phase `complete` — a submission either records or is refused and never both, and emptying the field disables the submit control, so one linear body cannot reach all three:

   - **The ask itself** — `asks before discarding a typed answer, relabels the chrome, starts nothing, and leaves the question and the draft unchanged`. Assert every static label changed, the request is on screen and announced, `createSession` has been called once in all, `openQuestionStream` was not called a second time, and the question and the draft are byte-identical to before the switch.
   - **The sent answer** — an `it.each` over `{ outcome: 'recorded' }` and `{ outcome: 'refused' }`. Record the answer with the request on screen, let `submitAnswer` answer the case's outcome, then assert the request is absent afterwards and does not return. The `recorded` case closes the round; the `refused` case lands in `failed`, which is open again, so it is the one that proves `draftAtRisk` rather than the phase is what withdraws the request.
   - **The emptied draft** — two cases over the language the chrome holds. With the chrome still in the other language and the request on screen, clear the answer field, then assert the request is absent, `createSession` has been called exactly twice in all with the second naming the chosen language, that no request appears at any point after the field goes blank, and that typing again brings none back — exactly one restart, no second confirmation. With the chrome in the language the round was started for and no request on screen, clear the answer field, then assert `createSession` has still been called once in all and nothing restarts, which is what keeps an ordinary draft deletion from restarting an already-matching round.

   Three things carry the correctness of this task and each has a wrong version that renders correctly:

   - The gate fires on a *change* in `locale`, compared against the `chosen` state value, and never on a standing difference. A standing condition passes every scenario except the decline, where the request re-opens on the next render.
   - The gate compares the chrome's language against `round.locale` — the language asked for — and never against `session.locale`. Against `session.locale` the view restarts forever whenever the API answers with a language it was not asked for, which `interview/interview-view` explicitly permits it to do. A test double that echoes the requested locale cannot catch this, so give one case a `createSession` that answers a fixed language regardless of what it was asked, and assert it is called exactly once.
   - Focus moves only when the person activated the control that was removed. The withdrawal scenario asserts that focus stays on whatever held it, so an effect that focuses whenever the request closes fails there rather than passing everywhere.

   Render the request only while `pending`, the phase is open, and `draftAtRisk` holds. That third term is what makes a stream failure and a refused submission withdraw the request without a second code path; `pending` is cleared as well, in `submit` and when the draft becomes blank, so the request cannot reappear once the state that justified it is gone. Give the view's `<section>` `tabIndex={-1}` so it can take focus after a discard. Style nothing beyond the layout the scenarios need — task 3 owns the visual result. [expert]

3. **Styling the request against the direction contract, and the design record.** Style the request block in `packages/web/src/interview/InterviewView.module.css` against § Design Direction and the existing surface contract at `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md`, using the existing token layer and adding no token. Resolve § Design Direction's two open calls here. Then update `packages/web/DESIGN.md`: § The Six View States gains the `complete` variant in which the request is on screen, and § Components gains an entry for it beside § Inline Error, stating that it takes no vermilion and why. Prefer the `impeccable-documenter` subagent for that update, which derives the record from the shipped code and needs no browser; write it by hand only if the subagent cannot run. Every test task 2 left green MUST stay green without an edit; a test that needs editing means the styling changed behaviour, which belongs in a spec delta rather than in a style task.

4. **The finish round.** Run § Dependencies' browser check. When it succeeds, finish the surface the way the `impeccable` skill's flow finishes a code-led build: inspect the rendered request at 1280px and 400px with a draft on screen, run `impeccable detect`, hand the result to the `impeccable-finish-reviewer` subagent against the existing surface contract, and apply the material fixes it returns. When it fails, the skill forbids inventing a substitute: stop, record in the verification report that the finish review did not run and name the three steps skipped — screenshot inspection, `impeccable detect`, `impeccable-finish-reviewer` — and record § Manual Testing's 1280px/400px row as unrun rather than as passed. It MUST NOT self-certify the finish review as passed and MUST NOT read the CSS in place of a capture. In that case `/speq:record` MUST add this plan's open finish review and unrun row to M18's »Konsolidierender impeccable-Designdurchgang« bullet in `specs/roadmap.md`, beside the entry `llm-backend-setup-gate` already left there, naming `change-language-switch-restarts-interview`.

5. **Run the full § Verification checklist end to end**, including every § Manual Testing row, and fix what it surfaces. The 1280px/400px row is the one row task 4's browser check can withhold; run every other row.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 |
| Group B | 2 |
| Group C | 3 |
| Group D | 4 |
| Group E | 5 |

Sequential dependencies:

- Group A → Group B — the view's tests read the four new dictionary members, so the type and both dictionaries exist before the suite is written.
- Group B → Group C — the styling acts on the markup task 2 writes.
- Group C → Group D — the finish review inspects the styled result.
- Groups A through D → Group E.

This plan parallelises to nothing. Every task edits or reads the output of the one before it, all five sit in `packages/web`, and three of them touch the same two files. Splitting task 2 to widen the graph would split one state machine across two agents, which costs more than the serialism saves.

One task carries `[expert]` and four do not. Task 2 owns the whole of this plan's non-obvious correctness: a render-phase gate that must fire on a change rather than a difference, a comparison that loops forever if it reads the wrong one of two similar values, an effect whose cleanup is the only thing abandoning an in-flight stream, a reset whose absence appends one question to another, and a focus rule that must distinguish a control the person activated from one that was taken away. Tasks 1, 3, 4 and 5 are four dictionary members beside twenty-two existing ones, a stylesheet against a contract this repository already holds, a scripted finish round with a recorded fallback, and the checklist.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| Ref | `mountLocale` in `packages/web/src/interview/InterviewView.tsx` | Superseded by `round.locale`, which advances instead of being captured once |
| Test | `relabels the chrome without re-creating the session, re-requesting the question, or clearing the typed answer` in `InterviewView.test.tsx` | Asserts the behaviour this plan reverses; its precondition survives in the first new test |
| Doc comment | the `InterviewViewProps` paragraph stating that changing `locale` »relabels the chrome and touches nothing else« | States the reversed behaviour. Rewritten, not deleted — the two-languages distinction it draws is still the reason the component is shaped this way |

Nothing else becomes obsolete. `session.locale` keeps its only job, declaring the question region's language; `interview-api.ts` is not edited; `App.tsx`'s `chooseLocale` is unchanged.

## Verification

### Scenario Coverage

All six scenarios are integration tests in `packages/web/src/interview/InterviewView.test.tsx` (task 2), across eight tests. The first scenario takes three of them, one per terminal branch, because a recorded submission, a refused submission and an emptied field are mutually exclusive from the single state it starts in. None is a unit test: every one drives the rendered component through the injected API double, and the only pure computation in this feature is the SSE parser, which this plan does not touch.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| Switching the chrome's language asks before discarding a typed answer | Integration | `InterviewView.test.tsx` | `asks before discarding a typed answer, relabels the chrome, starts nothing, and leaves the question and the draft unchanged` |
| Switching the chrome's language asks before discarding a typed answer | Integration | `InterviewView.test.tsx` | `withdraws the request for good once the answer is sent, for $outcome` — one `it.each` case for `{ outcome: 'recorded' }` and `{ outcome: 'refused' }` |
| Switching the chrome's language asks before discarding a typed answer | Integration | `InterviewView.test.tsx` | `withdraws the request when the draft is emptied, restarting only when the chrome's language differs from the round's` — two cases: chrome still differing, which restarts exactly once without asking; chrome matching the round, which restarts nothing |
| Confirming the discard restarts the interview in the chosen language | Integration | `InterviewView.test.tsx` | `creates a second session in the chosen language, abandons the first stream, clears the round, leaves no request on screen, and takes focus` |
| Declining the discard leaves the interview in the language it was created in | Integration | `InterviewView.test.tsx` | `keeps the session, the question and the typed answer, holds the chrome in the chosen language, and returns focus to the answer field` |
| Switching the chrome's language with no draft on screen restarts the interview without asking | Integration | `InterviewView.test.tsx` | `restarts without asking from $phase and takes the second session's language from its own response` — one `it.each` case per phase, with `failed` reached by a refused submission that leaves `answer` non-blank |
| Switching back to the running round's language withdraws the request | Integration | `InterviewView.test.tsx` | `withdraws the request without creating a session, discarding the answer, or moving focus` |
| Switching the chrome's language after the answer is sent relabels only | Integration | `InterviewView.test.tsx` | `relabels only once the answer is sent, in $phase` — one `it.each` case for `submitting` and `recorded` |

Every other scenario recorded by `004`, `007` and `008` MUST stay green. Task 2 deletes exactly one test and edits no other, in `InterviewView.test.tsx` alone; that `App.test.tsx`, `interview-api.test.ts`, `sse-frames.test.ts` and both server suites stay green without an edit is the evidence that the restart changed no behaviour outside the view.

No `App.test.tsx` case is added. The shell's obligation is »the view MUST be handed the chosen language«, which its existing scenarios already assert; a shell-level restart test would exercise the view's state machine through a second component and pin nothing the view's own suite does not.

No live-tier case is added. M5's per-locale live cases already prove that the model asks in the language the *session* was created in, and a restart creates an ordinary session in an ordinary supported language — there is no server behaviour here that a live daemon could falsify. The end-to-end claim is a § Manual Testing row instead.

### Manual Testing

Rows assume `pnpm dev` with Ollama running and holding the configured model, unless a row sets otherwise.

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| interview-view | `pnpm --filter @chrysalyst/web test` | Every view, shell, probe, dictionary, client, parser and build test passes. No test opens a socket |
| interview-view | Load the page in English, wait for the question, type nothing, switch the control to Deutsch | The question restarts and streams in German with no request shown. The network panel shows a second `POST /interview` carrying `"locale":"de"` and a second question request |
| interview-view | Load the page, wait for the question, type an answer, switch the language | The request appears below the answer block, announced, in the newly chosen language. The typed text and the question are untouched, and the network panel shows no second `POST /interview` |
| interview-view | With that request on screen, activate `Keep my answer` | The request closes, the typed text and the question are unchanged, the labels stay in the chosen language, and focus lands in the answer field |
| interview-view | With that request on screen, activate `Discard and restart` | The question restarts in the chosen language, the answer field is empty, and focus is not on `<body>` — checked with the browser's accessibility inspector |
| interview-view | With that request on screen, switch the control back to the language the question is in | The request closes, nothing restarts, the typed text is unchanged, and focus stays on the language control |
| interview-view | With that request on screen, record the answer instead | The answer records, the request leaves the screen, and a further language switch changes only the labels |
| interview-view | Record an answer, then switch the language | Only the labels change. No second `POST /interview` and no request |
| interview-view | Set `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m5b`, restart three times, then `ls /tmp/chrysalyst-m5b` | Four session folders; the three abandoned ones each hold a question and no answer, with `"schemaVersion": 1`. Nothing errors and no route behaves differently |
| interview-view | Stop the API server, load the page past the gate with a cached ready status, then switch the language mid-restart | The failure is shown exactly as it is today, under the translated label; no request is left on screen and nothing hangs |
| interview-view | Tab through the request with the keyboard alone, screen reader open | The prompt is announced when the request appears; both controls are reachable, have visible focus, and are operable by keyboard |
| interview-view | View the request at 1280px and at 400px with a draft on screen | The block sits in the editorial register, adds no token, carries no vermilion, and does not shift the question or the draft above it. Checked against `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md`. This row needs the browser § Dependencies names; without it, task 5 records it unrun and task 4 routes it to M18 |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; every `*.live.test.ts` file reports as skipped |
| Live tier | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 0 failures with the live suites running; unchanged by this plan, which adds no live case |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; `packages/core` at or above 90 %, unchanged because this plan does not edit it |
| Typecheck | `pnpm typecheck` | Exit 0; every `@ts-expect-error` in the type tests is consumed |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

Every row but `Live tier` and the § Manual Testing rows naming `pnpm dev` or a browser runs with no daemon, no network and no configured environment variable.

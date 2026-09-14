# Decision Log: change-language-switch-restarts-interview

## Interview

**Q:** When the language is switched while a question is still running or unanswered, should a completely new session be started in the new language — leaving the old session as an abandoned file on disk, as the existing session model already allows?
**A:** Yes, start a new session. The alternative — keeping the existing session alive and having it change language server-side — was rejected: it would make the session's locale mutable after creation, which is too large an intrusion into the session model and its schema.

**Q:** If text has already been typed into the answer field but not yet submitted, and the language is then switched, what happens to the typed text?
**A:** Confirm first, before discarding it. Silently discarding and restarting immediately was rejected.

**Q:** If the answer has already been submitted and confirmed — the round is finished, the view is in its recorded state — should a language switch after that still change anything about the interview session?
**A:** No, only relabel the chrome. Offering a new session in the new language after recording was rejected as out of scope: it would open an implicit new round, which this feature does not hold.

## Design Decisions

### [1] The restart lives in the view, not in the shell

- **Decision:** `InterviewView` owns the restart and the confirmation. `App.tsx` is not edited: it keeps owning the chrome's language, keeps remembering it, and keeps handing it down as a prop.
- **Alternatives:** `App` remounting the view with `key={locale}`, which restarts unconditionally and discards the draft silently — ruled out by the interview's second answer. `App` asking the view for permission before committing a language, which inverts the dependency and forces the shell to mirror the view's phase and draft upward.
- **Rationale:** Whether a switch needs confirming depends on the typed text and the phase, and only the view holds either. Putting the decision anywhere else duplicates that state across a boundary. `platform/web-shell`'s contract with the view is one prop, and it is already satisfied.
- **Promotes to ADR:** yes

### [2] The restart trigger reads the language the round was started for, never the language the response named

- **Decision:** The gate compares the chrome's language against `round.locale` — the value passed to `createSession` — and never against `session.locale`, which comes back from the creation response.
- **Alternatives:** Comparing against `session.locale`, which reads as the more direct statement of "the interview is in the wrong language".
- **Rationale:** `interview/interview-view` deliberately has the view take the session's language from the creation response rather than from the value it sent. A response naming a different language than it was asked for is therefore permitted, and comparing against it restarts forever: create in `de`, response says `en`, restart in `de`, response says `en`. The loop is unreachable by construction once the comparison reads the request side.
- **Promotes to ADR:** yes

### [3] The gate fires on a change in the prop, not on a standing difference

- **Decision:** A `chosen` state value records the chrome language the gate has already answered for; the gate acts only when `locale !== chosen`, in the render phase.
- **Alternatives:** A standing render-phase condition on `locale !== round.locale`. A `useEffect` keyed on `[locale]` with a ref holding the previous value.
- **Rationale:** A standing condition cannot be declined — clearing the request re-asserts it on the next render, so the person can never close it. An effect paints the pre-request frame first and costs an extra commit for a decision available during render; React's documented adjust-state-when-a-prop-changes pattern is the render-phase comparison.
- **Promotes to ADR:** no

### [4] A round is one state value, and the effect that conducts it depends on exactly that value

- **Decision:** `Round { index, locale }` is one `useState`. The question effect's dependency list is `[api, round]`. `beginRound` increments `index`.
- **Alternatives:** A `restartCount` number beside a separate `roundLocale` value.
- **Rationale:** Two values can drift and both would have to appear in the dependency list. One object makes "a round" a single thing, and the monotonic index makes a restart into the round's own language still a restart — which a locale-only dependency would silently skip.
- **Promotes to ADR:** no

### [5] The effect body owns what a round begins as

- **Decision:** The question effect resets question text, typed text, session, failure, recorded time and phase at the top of its body, before creating the session.
- **Alternatives:** Resetting in each caller that begins a round. Splitting `InterviewView` so a `key` remounts a child and React resets the state for free.
- **Rationale:** Two callers means the reset list is written twice and a third caller, added by a later milestone, can forget a field — the recurring-decision leakage `/speq:design-philosophy` singles out. The `key` split buys a free reset but forces a parent that mirrors the child's phase and draft in order to decide whether a restart needs confirming, trading six resets for a continuous state mirror across a new boundary. Without any reset, the streamed tokens of the second question append to the first, because the view accumulates with `setQuestion((text) => text + event.text)`.
- **Promotes to ADR:** no

### [6] `submitting` is a closed round; `failed` is an open one

- **Decision:** A language switch restarts the interview in `connecting`, `streaming`, `complete` and `failed`, and does nothing in `submitting` and `recorded`.
- **Alternatives:** Treating only `recorded` as closed and confirming during `submitting`. Treating `failed` as closed.
- **Rationale:** The interview's third answer draws the line at the answer being sent, and in `submitting` it is already on the wire — restarting would abandon a request the server will honour, and confirming would race it. A refusal returns the phase to `failed`, which is open again, so nothing is stranded. `failed` is open because the answer form is already removed in that state, so a restart discards nothing the person can see, and a language switch is the only way back for someone whose stream broke.
- **Promotes to ADR:** no

### [7] Switching back to the round's own language withdraws the request

- **Decision:** When the chrome's language changes back to the language the running round was started for, the request is withdrawn and nothing is discarded.
- **Alternatives:** Treating every prop change identically, which would offer to discard the draft in order to restart into the language the round is already running in.
- **Rationale:** With two languages this is the only way to reverse a switch, so it is the natural cancel gesture. It also removes a state-machine defect rather than only adding an affordance.
- **Promotes to ADR:** no

### [8] The confirmation is an inline request in the answer block — not `window.confirm`, not a modal

- **Decision:** The request renders below the answer form: an `aria-hidden` tracked label, an assertive `role="alert"` prompt sentence, and two Action-type controls in a right-aligned row. It takes no vermilion; the single accent on screen stays `Record answer →`.
- **Alternatives:** `window.confirm`. A modal `<dialog>`.
- **Rationale:** `window.confirm` renders its buttons in the browser's language rather than the one the person just chose, which contradicts the exact thing this feature fixes, and it is unstyleable and untestable through the DOM. A modal is refused on the stronger ground that it is the wrong affordance: a modal exists to stop a person acting on a screen they can no longer safely read, and the content at risk here — the draft answer — is on screen and is what they should be reading while deciding. `packages/web/DESIGN.md`'s Flat-Forever and No-Box rules independently leave no legal way to draw a dialog surface. The vermilion allocation follows The One Red Rule and lands on the merits: the loudest element should be the action that saves the person's work, not the one that discards it.
- **Promotes to ADR:** yes

### [9] No new impeccable surface contract

- **Decision:** The design direction for the request is recorded in `plan.md` § Design Direction against the existing surface contract at `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md`. No second contract file is written for the same primary target.
- **Alternatives:** A new surface contract for the confirmation. Amending the recorded M3 contract in place.
- **Rationale:** The surface has not changed — one component is added inside a world that file already fixes. Two contracts for one file are two documents to keep in agreement, and editing a recorded artefact rewrites history that `008` relies on.
- **Promotes to ADR:** no

### [10] The abandoned session is left alone

- **Decision:** A restart leaves the previous session's folder on disk holding an unanswered turn. Nothing deletes it, marks it, or reports it.
- **Alternatives:** Deleting it on restart. Marking it abandoned in `InterviewState`.
- **Rationale:** Deleting needs a route the API does not have, and marking needs a schema field — both reopening the session model the interview's first answer deliberately left shut. `interview/interview-http-api`'s »A client that abandons the question stream stores nothing« already specifies the server's tolerance of exactly this, and it is the same folder a closed browser tab already produces. M17 owns the surface that would ever list one.
- **Promotes to ADR:** no

### [11] The delta expresses the reversal as REMOVED plus NEW, not CHANGED

- **Decision:** `interview/interview-view`'s delta names the scenario »Switching the chrome's language leaves the running interview alone« in a `DELTA:REMOVED` block and carries six replacements in a `DELTA:NEW` block. Its precondition survives verbatim as the first new scenario's `GIVEN`.
- **Alternatives:** A `DELTA:CHANGED` block carrying the renamed scenario.
- **Rationale:** `CHANGED` blocks are matched into the library by scenario title, and this title asserts the behaviour being reversed — keeping it would be dishonest, and renaming it inside a `CHANGED` block would leave the old scenario in the library beside the new one.
- **Promotes to ADR:** no

### [12] This plan closes M5's acceptance criterion rather than taking work out of roadmap order

- **Decision:** `/speq:record` appends this plan to M5's »Pläne« line and leaves every milestone status as it stands.
- **Alternatives:** Treating the change as new scope under a later milestone. Reopening M5.
- **Rationale:** M5's »Fertig, wenn« reads »Locale-Umschaltung ändert die Oberfläche *und* die Sprache, in der das Modell fragt«. The shipped app meets that at start-up only, so this is a correction to a recorded milestone rather than a leap ahead of M6 — which has one item left that the roadmap has already routed to M18, blocked on a browser this sandbox lacks.
- **Promotes to ADR:** no

## Review Findings

### [1] [plan-review] A confirmed discard left the request on screen

- **Finding:** Round 1, Feasibility / UNSTATED_ASSUMPTION. Neither `beginRound` nor the effect-body reset cleared `pending`, and `beginRound` drives the phase to `connecting`, which `OPEN_PHASES` declares open. A confirmed discard therefore re-rendered the request over the round it had just started — the opposite of the delta's own »the first question's text, the typed text and the request itself MUST all be gone«.
- **Direction change:** `pending` joins the effect body's reset, which now names seven values rather than six, and the discard handler clears it as well so the render between the click and the effect shows no request. § Architecture, § Decision's reset snippet, § Requirements' reset row and § Migration all say seven. § Scenario Coverage row 2 names the absent request in its test title, and task 2 asserts it in the same test that catches the append defect.
- **Promotes to ADR:** no

### [2] [plan-review] A sent answer left the request able to return

- **Finding:** Round 1, Requirement Quality / COMPLETENESS_GAP. `pending` survived `submitting`, so a refused submission — which returns the phase to `failed`, an open phase — put the request back on screen asking whether to discard an answer the person had already sent and whose text `failed` no longer renders. A draft edited down to blank left a request offering to discard nothing. No requirement, scenario or task covered either state.
- **Direction change:** § Architecture gains a withdrawals block — `submit()` clears `pending` when the phase leaves `OPEN_PHASES`, and a draft that becomes blank clears it too — and the request renders only while `pending`, the round is open and `draftAtRisk` holds, so no submission outcome brings it back. § Requirements gains a row for each withdrawal, the delta's first scenario gains a matching `AND` for each, and task 2 gains both cases.
- **Promotes to ADR:** no

### [3] [plan-review] Two incompatible rules decided whether `failed` asks

- **Finding:** Round 1, Requirement Quality / COMPLETENESS_GAP. The gate branched on the `answer` value while the plan justified `failed` being open with »the answer form is already gone«. Both cannot hold: `failed` is reachable with `answer` non-blank through a refused submission, so the gate would open a request naming text the view does not render, below an answer form that is not there. Task 2's `it.each` and the delta's fourth `GIVEN` each assumed the other rule.
- **Direction change:** One rule, stated once in § Key interfaces as `draftAtRisk = showAnswerForm && answer.trim() !== ''`. The gate asks only while the answer form renders a non-blank draft and restarts silently otherwise, so `connecting` and `failed` never ask — including after a refused submission, where the text is already unreachable. This supersedes the `failed` half of **[6] `submitting` is a closed round; `failed` is an open one**: `failed` stays open, but its openness now follows from the one rule instead of a rule of its own. The `OPEN_PHASES` doc comment, § Consequences' `failed` row, § Requirements' consent row, the delta's fourth scenario title and `GIVEN`, and task 2's `it.each` all read from it.
- **Promotes to ADR:** no

### [4] [plan-review] Emptying the draft withdrew the request without saying what became of the restart

- **Finding:** Round 2, Requirement Quality / COMPLETENESS_GAP. The plan stated two rules pointing opposite ways at one predicate and no tiebreaker. The gate's third branch read »no draft at risk → `beginRound(locale)` (restart now)«, while the withdrawals block read »`answer` → blank → `setPending(false)`, nothing is left to discard«. Reaching chrome `de`, `round.locale` `en`, phase `complete`, `pending` true, then deleting the draft satisfies the gate's restart condition — but the gate fires only on a prop change, and the prop did not change. Both implementations passed every stated test: the delta's fourth `AND` asserted only that the request leaves and does not return, and task 2's blank-draft case asserted no more.
- **Direction change:** The review offered two options — blanking the draft declines the restart (`setPending(false)` and nothing else, with a § Decision sentence saying so), or blanking the draft clears the obstacle so the restart proceeds (`setPending(false); beginRound(locale)` when `locale !== round.locale`). The question was put to the user, who chose **restart immediately** and rejected declining. The reasoning: declining leaves the chrome and the interview in different languages indefinitely, with no request on screen and no way back except toggling the language control away and back — a state the person cannot explain and did not ask for. An unrequested restart of a draft they have themselves just abandoned was judged the smaller surprise. § Architecture's withdrawals block now carries both branches, § Decision gains »Emptying the draft clears the obstacle, so the restart proceeds«, § Consequences gains a row naming the rejected alternative, § Requirements' row is restated to name what happens to the session, the delta's fourth `AND` gains »and the view MUST then restart in the chosen language without asking«, and task 2's emptied-draft case asserts exactly one restart with nothing asked. The restart fires from the answer field's `onChange` rather than from the gate, so it is an event and not a standing condition; it is guarded on an open request, which keeps the declined resting state intact. The rule inverts the conventional reading of a confirmation and is worth promoting for that reason: the expected rule is that a request leaving the screen unanswered cancels the action it guarded, and this project's rule is that a request whose subject the person destroys resolves in favour of the action, because the only thing it protected is gone. A later planner adding any confirmation would otherwise re-litigate it.
- **Promotes to ADR:** yes

### [5] [plan-review] One test was obligated to cover three mutually exclusive branches

- **Finding:** Round 2, Task Breakdown / TASK_GRANULARITY. § Scenario Coverage row 1 named a single test — »asks before discarding a typed answer, relabels the chrome, starts nothing, and withdraws the request when the answer is sent — whether it records or is refused — or when the draft is emptied« — packing three terminal branches into one `it`. From the state the title starts in, a submission either records or is refused and never both, and emptying the field disables the submit control, so one linear body cannot reach all three. Task 2 prescribed only two of them and omitted `{ outcome: 'recorded' }` entirely, while the delta's third `AND` requires both outcomes. `/speq:code-guardrails` also treats re-setting up state to reach a second branch as test bloat, so no compliant implementation of the row existed.
- **Direction change:** Row 1 is now three rows against the same delta scenario — the ask itself; the sent-answer withdrawal as an `it.each` over `{ outcome: 'recorded' }` and `{ outcome: 'refused' }`; and the emptied-draft withdrawal, itself two cases under [4] above, restarting when the chrome's language differs from the round's and restarting nothing when they agree. Task 2's paragraph is rewritten as three named bullets carrying the assertions for each, including the previously absent `recorded` case. § Scenario Coverage's preamble and § Migration's test-count row now read eight tests across six scenarios.
- **Promotes to ADR:** no

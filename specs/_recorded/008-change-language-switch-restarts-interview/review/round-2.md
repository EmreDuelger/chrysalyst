# Plan Review Findings: change-language-switch-restarts-interview (round 2)

## Summary
- Axes checked: 6/6
- Total findings: 8 (Blockers: 2, Advisory: 6)
- Intent Fidelity blockers: 0

All three round-1 blockers are resolved. Both new blockers sit in the seam the round-1
fixes opened: the withdrawals block. It states when the request closes but never states
what happens to the restart the person asked for, and § Scenario Coverage folds its three
mutually exclusive branches into one test that cannot be written.

## Round-1 Blocker Recheck

- **Resolved: [UNSTATED_ASSUMPTION] A confirmed discard left the request on screen** —
  `setPending(false)` now appears in the § Decision effect-body snippet (plan.md:120) and
  in the discard line of § Architecture's request block (plan.md:73). The reset is
  restated as seven values in § Architecture (plan.md:87), § Requirements (plan.md:310)
  and § Migration (plan.md:331). § Scenario Coverage row 2 names the absent request in its
  test title (plan.md:403), task 2 asserts it in the same test that catches the append
  defect (plan.md:345), and delta scenario 2 keeps its `AND` (spec.md:52). The mechanism
  now produces the outcome the delta asserts.

- **Resolved: [COMPLETENESS_GAP] A sent answer left the request able to return** —
  § Architecture gains a withdrawals block (plan.md:76-79), and the render condition is now
  `pending && round open && draftAtRisk` (plan.md:71). The refusal path is closed twice
  over: `submit()` clears `pending`, and `failed` makes `draftAtRisk` false because
  `showAnswerForm` excludes it (`InterviewView.tsx:131-132`). § Requirements gains both
  rows (plan.md:308-309), delta scenario 1 gains both `AND`s (spec.md:43-44), and
  § Consequences' `submitting` row is rewritten (plan.md:238).

- **Resolved: [COMPLETENESS_GAP] Two incompatible rules for `failed`** — one rule now
  stands, stated once in § Key interfaces as
  `draftAtRisk = showAnswerForm && answer.trim() !== ''` (plan.md:196) and echoed in
  § Architecture (plan.md:69). The `OPEN_PHASES` doc comment (plan.md:183-186),
  § Decision (plan.md:142-144), § Consequences' `failed` row (plan.md:239),
  § Requirements' consent row (plan.md:305), delta scenario 4's `GIVEN` (spec.md:66) and
  task 2's `it.each` (plan.md:345) all read from it. decision-log.md [3] under
  § Review Findings records the supersession of [6]'s `failed` half explicitly. Task 2
  correctly names the `failed`-via-refusal case as the one that separates `draftAtRisk`
  from a bare `answer.trim()` check.

## Intent Fidelity

#### [SCOPE_REDUCTION] ADVISORY
- Location: plan.md § Non-Goals, § Key interfaces (`OPEN_PHASES`), § Consequences row
  "`submitting` counts as closed"; decision-log.md [6]
- Issue: carried from round 1, unaddressed. The clarifying interview exempted the state
  where the answer "has already been submitted **and confirmed** (`recorded` state)". The
  plan widens that exemption to `submitting` — "A round is open while it can still be
  restarted — that is, until the answer is on the wire" (plan.md:183-184). § Non-Goals
  still names only "No reopening of a recorded round" (plan.md:39), and decision-log.md
  [6]'s **Decision** line still states the four-open/two-closed split without flagging that
  the `submitting` half is the planner's call rather than the interview's. The rationale is
  sound and the round-1 blocker that depended on it is now fixed, so this is a disclosure
  gap, not a correctness one — but the human approving the plan cannot see that one of the
  two exempted phases was not granted by the interview.
- Fix: Add a bullet to plan.md § Non-Goals reading that `submitting` is exempted by this
  plan rather than by the clarifying interview, and naming the window it covers — one
  in-flight `submitAnswer` call. Add the same sentence to decision-log.md [6] under
  **Decision**.

## Feasibility

#### [UNSTATED_ASSUMPTION] ADVISORY
- Location: plan.md § Context (final paragraph, plan.md:13), § Impact (plan.md:298);
  decision-log.md [12]
- Issue: carried from round 1, unaddressed. The roadmap-order justification still misreads
  `specs/roadmap.md`. plan.md:13 claims "M6, the topmost open milestone, has one item left,
  and the roadmap has already routed it to M18 because the browser this sandbox lacks is
  what blocks it", and plan.md:298 instructs `/speq:record` that "M6 stays open on the
  finish review the roadmap already routed to M18". The roadmap's M6 § **Bewusst offen**
  (`specs/roadmap.md:222-224`) routes a different item — "bestehende Sessions bleiben in
  diesem Zustand *exportierbar*", deferred because it "ist erst ab M15 erfüllbar und wird
  Abnahmekriterium von M18". The browser-blocked carry-over at `specs/roadmap.md:399-404`
  is the `impeccable-finish-reviewer` acceptance of `SetupGuide.tsx` plus its unrun
  1280px/400px row — an impeccable design-pass item, not M6's open constraint. Two distinct
  open items are conflated, and a `MUST` directive to `/speq:record` rests on the
  conflation.
- Fix: In plan.md § Context (plan.md:13) and § Impact (plan.md:298), replace the M6
  sentences with the roadmap's actual wording — M6's deliberately open item is the export
  half of its constraint, deferred to M15 and made an M18 acceptance criterion — and reduce
  the directive to the plain instruction it needs to be: `/speq:record` MUST NOT change M6's
  or M18's status. Update decision-log.md [12]'s **Rationale** to match.

## Requirement Quality

#### [COMPLETENESS_GAP] BLOCKER
- Location: plan.md § Architecture (the withdrawals block, plan.md:78; the gate's third
  branch, plan.md:65), § Requirements row "Emptying the answer field withdraws the request"
  (plan.md:309), § Key interfaces `draftAtRisk` doc comment (plan.md:192-195); spec delta
  § Scenario "Switching the chrome's language asks before discarding a typed answer",
  fourth `AND` (spec.md:44); plan.md § Implementation Tasks task 2 (plan.md:347)
- Issue: emptying the draft withdraws the request, and the plan never says whether the
  restart the person asked for still happens. The two rules it does state point opposite
  ways at the same predicate. The gate's third branch reads "no draft at risk →
  `beginRound(locale)` (restart now)"; the withdrawals block reads "`answer` → blank →
  `setPending(false)`  nothing is left to discard". Reach the state: chrome `de`, `chosen`
  `de`, `round.locale` `en`, phase `complete`, `answer` non-blank, `pending` true. The
  person deletes the draft. `draftAtRisk` is now false and `locale !== round.locale` — the
  exact combination the gate calls "restart now" — but the gate fires only on a change in
  the prop, and `locale` has not changed. Under the withdrawals block the interview stays
  English under German chrome with no request and no restart, recoverable only by switching
  to English and back. § Key interfaces calls `draftAtRisk` "the one place that decides what
  'would discard an answer' means: the gate asks only while it holds, and the request
  renders only while it holds" — it says nothing about restarting, so it settles neither
  reading. Both implementations pass every stated test: the delta's fourth `AND` asserts
  only that the request leaves and does not return, unlike scenarios 3 and 5 which each
  assert "the view MUST NOT create a second session", and task 2's blank-draft case asserts
  only "the request is absent and does not return when text is typed again". This is
  round-1 blocker 3's defect one level over — two rules for one predicate, no tiebreaker —
  reintroduced by the fix for round-1 blocker 2.
- Fix: Pick one rule and state it once. In plan.md § Architecture, replace the withdrawals
  block's blank-draft line with the chosen rule — either `answer` → blank →
  `setPending(false)` and nothing else, with a sentence in § Decision stating that blanking
  the draft is read as declining the restart rather than as clearing the obstacle to it, or
  `answer` → blank → `setPending(false); beginRound(locale)` when `locale !== round.locale`.
  Restate plan.md § Requirements' "Emptying the answer field withdraws the request" row to
  name what happens to the session. Add the matching clause to the delta's fourth `AND` in
  spec.md — either "and the view MUST NOT create a second session, because the chrome's
  language and the interview's may differ" or "and the view MUST then restart in the
  chosen language without asking". Add the corresponding assertion to task 2's blank-draft
  case in plan.md:347 and to the test named in § Scenario Coverage row 1.

## Task Breakdown

#### [TASK_GRANULARITY] BLOCKER
- Location: plan.md § Scenario Coverage row 1 test name (plan.md:402), § Implementation
  Tasks task 2 (plan.md:347); spec delta § Scenario "Switching the chrome's language asks
  before discarding a typed answer", third and fourth `AND` (spec.md:43-44)
- Issue: § Scenario Coverage row 1 names one test that cannot be written. Its title —
  "asks before discarding a typed answer, relabels the chrome, starts nothing, and
  withdraws the request when the answer is sent — whether it records or is refused — or
  when the draft is emptied" — packs three mutually exclusive terminal branches into one
  `it`. From the single state the title starts in (request on screen, draft non-blank,
  phase `complete`) a submission either records or is refused, never both, and emptying the
  field disables the submit control (`InterviewView.tsx:134`,
  `submitDisabled = phase !== 'complete' || answer.trim() === ''`), so it excludes both.
  One linear test body cannot reach all three. Task 2 (plan.md:347) prescribes only two of
  them — "record the answer with the request on screen and let `submitAnswer` answer
  `{ outcome: 'refused' }`" and "clear the answer field with the request on screen" — and
  the third `AND` of the delta requires both outcomes: "sending the answer MUST withdraw
  the request for good — **whether the answer route records the answer or refuses it**".
  The `records` half therefore has no implementing step anywhere in the plan, while the
  table names one test obligated to cover it. `/speq:code-guardrails` also treats a test
  that re-sets up state to reach a second unrelated branch as test bloat, so the
  implementer has no compliant way to honour the row as written.
- Fix: Split § Scenario Coverage row 1 into three rows against the same delta scenario, one
  per branch, with three test names: the ask itself (asks, relabels, starts nothing, leaves
  the question and the draft unchanged); the sent-answer withdrawal as an `it.each` over
  `{ outcome: 'recorded' }` and `{ outcome: 'refused' }` asserting the request is absent
  afterwards and does not return; and the emptied-draft withdrawal asserting the request is
  absent and does not return when text is typed again. Rewrite task 2's paragraph at
  plan.md:347 to name all three tests and to add the `{ outcome: 'recorded' }` case it
  currently omits.

#### [TRACEABILITY_GAP] ADVISORY
- Location: plan.md § Scenario Coverage final paragraph (plan.md:409), § Verification
- Issue: carried from round 1, unaddressed. The sentence "Task 2 deletes exactly one test
  and edits no other, in `InterviewView.test.tsx` alone; that `App.test.tsx`,
  `interview-api.test.ts`, `sse-frames.test.ts` and both server suites stay green without
  an edit is the evidence that the restart changed no behaviour outside the view" is still
  present and still wrong. Four call sites now silently drive a full restart and none
  asserts it. `packages/web/src/App.test.tsx:160-166`, `:192-196` and `:220-226` each fire
  a language change against a ready gate with the view mounted (`probeBackend` answers
  `readyBackend()`, and the mounted-view assertion at `:301-303` confirms the gate lets the
  view through in that configuration); each now issues a second `createSession` plus a
  second `openQuestionStream`, while the tests assert only the combobox and storage. No
  `App.test.tsx` case asserts `createSession` call counts across a language change — the
  only such assertion, `:307`, is in a test that fires none — so all three stay green while
  the behaviour under them changed, and each leaves a `createSession` promise resolving
  outside `act()`, which emits React act warnings (not failures:
  `packages/web/vitest.config.ts` declares no setup file escalating `console.error`).
  `packages/web/src/interview/InterviewView.test.tsx:258-282` is worse: it is the only test
  for the recorded scenario `interview/interview-view` § "The question is marked with the
  language it was asked in", its `rerender(locale="de")` at `:277` is now a restart, and
  its closing `expect(questionRegion().getAttribute('lang')).toBe('de')` at `:281` is
  satisfied by a *second* session rather than by the first — because its `createSession`
  double returns `{ id: 'session-6', locale: 'de' }` regardless of its argument. Green there
  proves the opposite of what the plan reads into it, and the recorded scenario loses its
  evidence while the plan forbids editing the test.
- Fix: In plan.md § Scenario Coverage, delete the "stay green without an edit is the
  evidence" clause and replace it with the four call sites named above and what each now
  exercises. State that `InterviewView.test.tsx:258-282` now restarts at its rerender step
  and that task 2 MUST either drop that rerender (asserting the question region's `lang`
  before the switch only) or assert the restart explicitly, so the recorded scenario keeps
  evidence that is about the first session. Add a § Verification line naming the expected
  act-warning noise in `App.test.tsx` so the implementer does not read it as a regression.

#### [TASK_GRANULARITY] ADVISORY
- Location: plan.md § Implementation Tasks task 1 (plan.md:341)
- Issue: carried from round 1, unaddressed. Task 1 is not a red-green pair as written.
  `packages/web/src/locale/strings.test.ts:16-18` derives `STRING_MEMBERS` from
  `Object.keys(en)`, and the generic tests at `:26-30` and `:50-58` already assert presence,
  non-blankness and cross-language difference for every string member. Adding the four
  members to `en.ts` and `de.ts` extends that coverage with no test edit at all; the
  hand-written per-member assertions task 1 asks for would duplicate the loops, which
  `/speq:code-guardrails` treats as test bloat. The only genuine red step available is the
  typecheck failure of `UiStrings` against the two dictionaries.
- Fix: Rewrite task 1 in plan.md § Implementation Tasks: state that the red step is
  `pnpm typecheck` failing once the four members are added to `UiStrings` and before both
  dictionaries carry them, that `strings.test.ts` needs no edit because its generic loops
  pick the members up from `Object.keys(en)`, and that no per-member assertion is to be
  added.

## Design Depth

#### [INFORMATION_LEAKAGE] ADVISORY
- Location: plan.md § Decision "The restart is the effect re-running, and the effect owns
  what a round begins as" (plan.md:126), § Architecture (the gate, the request and the
  withdrawals blocks, plan.md:60-79), § Key interfaces (plan.md:198-201);
  decision-log.md [5]
- Issue: carried from round 1 and sharpened by the round-1 fixes. The plan claims one owner
  for the round's state — "Putting the reset here makes the effect the single place that
  knows what a round consists of" — while `pending`, which the plan itself now calls one of
  the round's seven values, is written in six places outside the effect: the gate's
  switched-back branch, the gate's draft-at-risk branch, the `keep` handler, the `discard`
  handler, `submit()`, and the answer field's `onChange`. `Round` is written in two. The
  withdrawals block that closed round-1 blocker 2 added two of those six, so the recurring
  decision — "does this transition end the round's open request?" — now has to be answered
  correctly at seven sites instead of five. That is the leakage `/speq:design-philosophy`
  singles out, and both round-1 blockers plus this round's blanked-draft blocker are
  instances of it: each was a site that forgot to answer. `chosen` compounds it by encoding
  "which chrome language has this round already answered for" separately from the round it
  answers for.
- Fix: In plan.md § Key interfaces, fold the request into the round value — for example
  `Round { index, locale, request: 'none' | 'pending' }` — so one value names which round is
  running and whether its restart awaits consent, and the effect's reset covers it by
  construction. Restate § Architecture's gate, request and withdrawals blocks as transitions
  on that one value. Record the change in decision-log.md as a revision of [4] and [5],
  naming the alternative kept (three separate values) and why it was dropped.

## Prose Quality

#### [PROSE_BLOAT] ADVISORY
- Location: plan.md § Summary (plan.md:5), § Impact first paragraph (plan.md:290)
- Issue: carried from round 1, unaddressed. Both governed sections still break the 25-word
  sentence cap. § Summary's first sentence runs 51 words — "Make the language control change
  the language the interview is actually held in: switching it while a round is open
  abandons the question stream, creates a second session in the chosen language, and asks
  the question again — after asking the person first when that would discard an answer they
  have typed." § Impact's third sentence runs 36 — "A person who has typed an answer is
  asked first, in German, and can keep what they wrote — in which case the chrome stays
  German and the question stays English, a pairing the app already supported." § Impact is
  PR-facing, so it also needs the `writing:clarity-editing`,
  `writing:evidence-and-credibility` and `writing:revision-and-qa-checklist` passes the
  guardrails require.
- Fix: Rewrite plan.md § Summary as two sentences of 25 words or fewer, leading with the
  outcome ("A language switch restarts the interview in the chosen language."). Split
  § Impact's third sentence into two of 25 words or fewer and run § Impact through the three
  `writing:*` skills before the next round.

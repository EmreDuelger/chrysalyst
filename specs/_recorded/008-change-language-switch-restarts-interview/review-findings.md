# Code Review Findings: change-language-switch-restarts-interview

## Summary
- Files reviewed: 8
- Total findings: 4 (standard: 3, expert: 1)

Verification run during review, from the worktree:
`pnpm --filter @chrysalyst/web test` → 10 files, 414 tests passed, no type errors.
`pnpm lint` → clean.

The state machine in `InterviewView.tsx` was checked against plan.md § Decision
branch by branch and is correct as built. Three points the brief raised were
confirmed rather than faulted, and are recorded here so they are not re-litigated:

- **The reset's placement in `run()`'s synchronous prologue is right.** `run` is
  invoked by `void run()` inside the effect body, so everything before its first
  `await` executes synchronously during the effect, after React has already run
  the previous effect's cleanup (`controller.abort()`). Ordering relative to the
  abort is therefore identical to the plan's literal sketch, and the implementer's
  reason for rejecting a render-phase or `beginRound` reset holds: a token
  arriving between commit and the passive-effect flush would append to an
  already-cleared round. No `eslint-disable` was added and `pnpm lint` is clean.
- **The `chosen`/`round.locale` distinction is implemented as specified** — the
  gate fires on a change, never a standing difference, and `session.locale` is
  read only by the question region's `lang`. The decline test at
  `InterviewView.test.tsx:543` does falsify a standing-condition rewrite.
- **Both `setPending(false)` calls (submit and the round reset) should stay.**
  Removing both leaves all 29 view tests green (verified by mutation), and
  analysis confirms neither is reachable-as-load-bearing while only two locales
  exist: every path into `beginRound` and into a closed phase already clears
  `pending` first. They are not dead flexibility — they are what makes
  `beginRound` safe to call without an ordering contract on its callers, which is
  exactly what the guardrails' "no undocumented ordering contract between calls"
  asks for, and plan.md requires `pending` as one of the round's seven reset
  values. No finding is raised against them.

## Standard fixes

### packages/web/DESIGN.md

#### [OUTDATED_COMMENT] "No vermilion anywhere in this block" contradicts the shipped focus ring
- Location: packages/web/DESIGN.md line 328 ("**No vermilion anywhere in this block.**"), against packages/web/src/interview/InterviewView.module.css lines 267-271
- Issue: the same commit ships `.switchKeep:focus-visible, .switchDiscard:focus-visible { outline: 2px solid var(--accent); }` — vermilion. The CSS is correct and deliberately matches `.submit:focus-visible` and `.answerField:focus-visible`, and the plan's accessibility bar requires a visible focus indicator; it is the design record that overstates the rule. As written, a later reader auditing the block against DESIGN.md would remove the focus ring.
- Fix: In packages/web/DESIGN.md § Language Switch Request, change the "No vermilion anywhere in this block" bullet so it scopes the claim to the block's resting state, and add one clause stating that keyboard focus uses the system's standard `outline: 2px solid var(--accent)` ring, as every other control in the view does, and that the ring is a focus indicator rather than an accent allocation under the One Red Rule.

#### [OUTDATED_COMMENT] The new state-table row claims "no vermilion" for a state that renders the vermilion submit control
- Location: packages/web/DESIGN.md line 343, the `complete + language switch request` row, Accent moment column ("none — no vermilion; question is asked, not reported")
- Issue: it contradicts § Language Switch Request twelve lines above, which states that in this state "the one vermilion element permitted per state stays `Record answer →`, which remains the answer-recording action even while this request is on screen". `Record answer →` is `color: var(--accent)` and is on screen throughout this state. The `complete` row above uses a bare "none" for the same situation, so the added "— no vermilion" clause is the part that is wrong. Separately, the heading above the table reads "The Six View States" while the State column now lists seven entries.
- Fix: In packages/web/DESIGN.md § The Six View States, change the `complete + language switch request` row's Accent moment cell to plain `none`, matching the `complete` row, and drop the "no vermilion" clause. In the same edit, mark that row as a variant of `complete` rather than a seventh state — either in the heading or in the row label — so the "Six View States" heading stays true.

### packages/web/src/interview/InterviewView.tsx

#### [MISSING_DESIGN_INTENT] The gate's change-not-difference invariant is recorded nowhere in the source
- Location: lines 77 (`const [chosen, setChosen] = useState<Locale>(locale);`) and 92-99 (the render-phase gate)
- Issue: this file documents its two other non-obvious pieces — `Round` carries the "never `session.locale`, it would loop forever" rationale (lines 39-46) and `OPEN_PHASES` carries the definition of openness (lines 52-56) — but the third and most fragile invariant has no home. Nothing in the source tells a reader that `locale !== chosen` must compare against the language the gate has already answered for, and that rewriting it as the apparently simpler standing condition `locale !== round.locale` makes the request impossible to decline. The doc comment above `InterviewViewProps` (lines 8-25) is this file's established home for the component's design intent and already carries the two-languages explanation, but stops short of this one.
- Fix: In packages/web/src/interview/InterviewView.tsx, extend the existing doc comment above `InterviewViewProps` with one or two sentences stating that the restart fires on a *change* in the `locale` prop — detected against the `chosen` state value, which holds the chrome language the view has already acted on — and never on a standing difference, because a standing condition re-asserts itself on the render after a decline and so could never be dismissed. Add no comment inside the component body; the guardrails ban inline comments.

### packages/web/src/locale/strings.test.ts

#### [DUPLICATE_TEST] The new dictionary test re-asserts coverage the file's derived loops already give
- Location: lines 48-64, `has the language-switch confirmation copy for both languages`
- Issue: `STRING_MEMBERS` (line 9) is derived from `Object.keys(en)`, so the two existing tests — `has every member present and non-blank for both languages` and `differs between languages for every member except the shared chrome labels` — already cover all four new members automatically, which is exactly the coverage plan.md task 1 asked for ("present, non-blank, and different between the two languages, in the style the file already uses for the existing members"). The added test contributes only exact-literal pinning of eight strings, a pattern applied to none of the other 21 plain-string members (`failureLabel`, `submit`, `languageControl` and the rest are all unpinned), and it reintroduces the per-member maintenance the derived-list design exists to avoid.
- Fix: In packages/web/src/locale/strings.test.ts, delete the `has the language-switch confirmation copy for both languages` test. The four new members stay covered by the two derived-list tests above it; leave those untouched. Re-run `pnpm --filter @chrysalyst/web test` and confirm it stays green.

## Expert fixes

### packages/web/src/interview/InterviewView.test.tsx

#### [MISSING_BOUNDARY_TEST] The "a draft cleared after Keep restarts nothing" rule is untested
- Location: `changeAnswer` guard at packages/web/src/interview/InterviewView.tsx:192 (`if (next.trim() !== '' || !pending) return;`); the gap is in the decline test at packages/web/src/interview/InterviewView.test.tsx:543
- Issue: plan.md § "Emptying the draft clears the obstacle" states the rule explicitly — "A decline has already closed the request, so a draft cleared after `Keep my answer` restarts nothing, and the declined resting state § Goals names still stands" — and the `!pending` term is the only thing enforcing it. It is not falsifiable by the current suite: deleting `|| !pending` from the guard and running `pnpm --filter @chrysalyst/web exec vitest run src/interview/InterviewView.test.tsx` leaves all 29 tests green (verified by mutation during this review, source restored afterwards). Without the term, a person who declines the restart and then deletes their draft is silently restarted into the chrome's language — the exact silent-restart outcome § Goals rules out. The decline test types *more* text after Keep (line 561) but never empties the field, and the emptied-draft test never declines first, so the crossing case falls between them.
- Fix: In packages/web/src/interview/InterviewView.test.tsx, extend the existing `keeps the session, the question and the typed answer, holds the chrome in the chosen language, and returns focus to the answer field` test (or add one case beside it) that, after `fireEvent.click(keepButton(uiStrings.en))`, clears the answer field with `fireEvent.change(answerField(uiStrings.en), { target: { value: '' } })` while the chrome is still `en` and the round is still the `de` one, then asserts: `createSession` has still been called exactly once, `streams.open` exactly once, `expectNoSwitchRequest()`, and `questionRegion().textContent` is still `ROUND_QUESTION`. Drive the clear through the same `fireEvent.change` path the component's `onChange` uses — asserting on state or on `pending` directly does not pin the behaviour. Verify the test is honest by deleting `|| !pending` from `changeAnswer` in packages/web/src/interview/InterviewView.tsx, running the file, seeing the new assertion fail, then restoring the guard and seeing all tests green.

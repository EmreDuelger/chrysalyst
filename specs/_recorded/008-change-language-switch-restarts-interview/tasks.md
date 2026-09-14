# Tasks: change-language-switch-restarts-interview

## Phase 2: Implementation (Group A)
- [x] 1. Red then green — the request's dictionary entries.

## Phase 2: Implementation (Group B)
- [x] 2. Red then green — the restart, the request, and the reset. [expert]

## Phase 2: Implementation (Group C)
- [x] 3. Styling the request against the direction contract, and the design record.

## Phase 2: Implementation (Group D)
- [x] 4. The finish round.

## Phase 3: Verification
- [x] 5. Run the full § Verification checklist end to end.

## Phase 4: Review Fixes
- [x] 4.1 In `packages/web/src/interview/InterviewView.test.tsx`, add a case beside
  the decline test that clears the answer field after `Keep my answer` — chrome
  still `en`, round still the `de` one — and asserts the declined round is
  untouched: `createSession` and `streams.open` called once each, no request on
  screen, the question still `ROUND_QUESTION`. Verify the case is honest by
  deleting `|| !pending` from `changeAnswer`, seeing it fail, then restoring the
  guard. [expert]
- [x] 4.2 In `packages/web/DESIGN.md` § Language Switch Request, change the "No
  vermilion anywhere in this block" bullet so it scopes the claim to the block's
  resting state, and add a clause stating that keyboard focus uses the system's
  standard `outline: 2px solid var(--accent)` ring, as every other control in
  the view does, and that the ring is a focus indicator rather than an accent
  allocation under the One Red Rule.
- [x] 4.3 In `packages/web/DESIGN.md` § The Six View States, change the
  `complete + language switch request` row's Accent moment cell to plain
  `none`, matching the `complete` row, and drop the "no vermilion" clause. Mark
  that row as a variant of `complete` rather than a seventh state — either in
  the heading or in the row label — so the "Six View States" heading stays true.
- [x] 4.4 In `packages/web/src/interview/InterviewView.tsx`, extend the
  existing doc comment above `InterviewViewProps` with one or two sentences
  stating that the restart fires on a *change* in the `locale` prop — detected
  against the `chosen` state value, which holds the chrome language the view
  has already acted on — and never on a standing difference, because a
  standing condition re-asserts itself on the render after a decline and so
  could never be dismissed. Add no comment inside the component body.
- [x] 4.5 In `packages/web/src/locale/strings.test.ts`, delete the "has the
  language-switch confirmation copy for both languages" test. The four new
  members stay covered by the two derived-list tests above it; leave those
  untouched. Re-run `pnpm --filter @chrysalyst/web test` and confirm it stays
  green.

# Plan Review Findings: bilingual-ui-and-prompts (round 1)

## Summary

- Axes checked: 6/6
- Total findings: 11 (Blockers: 5, Advisory: 6)
- Intent Fidelity blockers: 0

## Premortem

Three ways this plan fails six months out.

1. **A pre-M5 session is silently migrated, or the save stops compiling.** `locale` becomes a required field of `InterviewState`, but the three `sessions.save` calls in `single-turn-interview.ts` are never told what to write for a session that carried none. Whichever the implementer picks, the plan's promise "no file is rewritten" is untrue for half of them and untested for both. → `[COMPLETENESS_GAP]`, `[INFORMATION_LEAKAGE]`.
2. **M8 adds the turn loop and reads `state.locale` directly.** The rule that a stored language is untrusted lives in a function every caller must remember to call, not at a boundary that applies it once. The fourth caller is the one that forgets. → `[INFORMATION_LEAKAGE]`.
3. **The dictionary type guard was never enforced by a run.** `packages/web/src/locale/strings.test-d.ts` is written, `pnpm --filter @chrysalyst/web test` reports green, and nothing in that command ever loaded the file — the package has no type-test runner. A later milestone ships a half-translated dictionary. → `[HIDDEN_DEPENDENCY]`.

## Intent Fidelity

[no objection — axis checked: roadmap M5's three deliverables (detection plus switching, UI strings and prompt templates per locale, the model instructed to interview in the user's language) each map to spec-delta scenarios and tasks; the four clarifying answers are operationalized as given — `detectLocale` plus `rememberLocale` for auto-detect-with-override, `locale` fixed in `InterviewState` at creation, hand-rolled TS dictionaries with no lockfile change, and untranslated failure text; the `de`/`en` set and the documented `en` fallback match the carried constraint; `/speq:record`'s two roadmap edits are named in plan.md § Impact, not left in chat]

Decision-log [8] is flagged by the planner as a brief deviation. It is not one. The clarifying answer localizes "static UI strings (labels, buttons, headings)" and exempts "error and failure messages, which often surface raw model or server failure text". `The question stopped` is a heading the view authors and surfaces no model text, so localizing it follows the answer rather than departing from it. The defect is in how the plan *states* the resulting boundary — see `[AMBIGUOUS_REQUIREMENT]` under Requirement Quality.

## Feasibility

#### [HIDDEN_DEPENDENCY] BLOCKER

- Location: plan.md § Implementation Tasks task 10, § Verification Scenario Coverage row `A string dictionary missing an entry fails the type check`, § Manual Testing row `pnpm --filter @chrysalyst/web test`; `platform/web-shell/spec.md` scenario `A string dictionary missing an entry fails the type check`
- Issue: `packages/web` has no type-test runner, so `strings.test-d.ts` executes nothing. `packages/web/vitest.config.ts` declares `test.environment` and `test.coverage` and no `test.typecheck`; `packages/core/vitest.config.ts` and `packages/server/vitest.config.ts` both declare `typecheck: { enabled: true }`. Vitest's default `include` does not match `*.test-d.ts`, and `typecheck.include` is consulted only when typecheck is enabled. The delta scenario demands "the failure MUST surface when the package's type tests run", § Verification names a test name for it, and § Manual Testing claims `pnpm --filter @chrysalyst/web test` proves "Every language, dictionary, parser, client, shell and view test passes" — the file is never collected. No task enables the runner. The same gap swallows any `*.test-d.ts` a later web milestone writes.
- Fix: Add a task before task 10 that enables `test.typecheck.enabled` in `packages/web/vitest.config.ts`, mirroring `packages/core/vitest.config.ts`, and state in that task that the config change is verified by the new type test failing when a member is removed. Add a § Manual Testing row `pnpm --filter @chrysalyst/web typecheck` expecting exit 0 with both `@ts-expect-error` directives consumed, beside the existing core row.

#### [HIDDEN_DEPENDENCY] BLOCKER

- Location: plan.md § Design Direction, § Implementation Tasks tasks 12, 13, 16 and 17, § Manual Testing row `The impeccable subphase's approved comp, then the styled control in the browser at 1280px and 400px`
- Issue: two defects in the statement that task 16 is the only work the missing comp blocks. (a) The claim "Every other task in this plan is independent of it" is false: task 17 is "Run the full § Verification checklist end to end, including every § Manual Testing row and the live row", and one § Manual Testing row is the approved comp and the styled control. Task 17 therefore cannot complete either, and § Parallelization's `Groups A through G → Group H` confirms it runs after task 16. `/speq:implement` has no instruction for what to do when the human step has not happened — neither "stop at task 15" nor "defer 16 and the comp row to a follow-up plan". (b) § Design Direction credits the wrong task: "task 13 renders a working, accessible, unstyled control" and "task 16 restyles what task 13 already renders". Task 12 renders the control (`renders the language control`, `style nothing — task 16 owns the visual result`); task 13 is the view's two languages. Task 16 and decision-log [12] both name task 12 correctly, so § Design Direction is the outlier an implementer would follow.
- Fix: In plan.md § Design Direction, replace both occurrences of "task 13" with "task 12". Replace "Every other task in this plan is independent of it" with an explicit deferral rule: tasks 1-15 proceed, and task 16 plus the § Manual Testing comp row are deferred together until the subphase approves a comp. Reword task 17 to "Run the full § Verification checklist end to end, excluding the comp row while task 16 is deferred", and add the same carve-out to § Dependencies' task-16 paragraph.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: plan.md § Live-tier risk; decision-log [11]
- Issue: the function-word assertion contradicts its own exclusion rule and leaves matching undefined. The English list holds `problem`, which is near-identical in German (`Problem`) — and the drafted German system template asks for "das Problem, das es löst", so a *correct* German question is likely to score an English hit while the rule claims "Content words that are near-identical in both languages are excluded on purpose". Case handling is also unstated: `Sie`, `Ihr`, `Ihre` are listed capitalized while `der`, `die`, `das`, `was` are listed lowercase and are capitalized sentence-initially, so a case-sensitive whole-word match and a case-insensitive one score the same question differently, with a threshold of exactly 3 to clear.
- Fix: In plan.md § Live-tier risk and decision-log [11], remove `problem` from the English list and add `you`, `solve` and `it`; state that matching is case-insensitive whole-word; and state that the score counts distinct list entries present, not total occurrences.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: plan.md § Patterns row `Test seams as props, defaults for the browser`, § Key interfaces `AppProps`; `platform/web-shell/spec.md` scenario `Storage that cannot be read or written leaves the app usable`
- Issue: `AppProps` has no seam for the browser's language list, so the shell-level scenario cannot be asserted without the real `navigator`. `App` initializes from `locale ?? detectLocale(undefined, storage)`: passing `locale` short-circuits detection entirely, and omitting it reads jsdom's real `navigator.languages`. The scenario requires "the shell MUST start the app in the language the browser reports" with a throwing storage stub, which is exactly the case the `locale` prop cannot express. § Patterns nonetheless claims "No test touches the network, the real `navigator`, or the real `localStorage`".
- Fix: Add `languages?: readonly string[]` to `AppProps` in plan.md § Key interfaces and thread it into `detectLocale` in task 12 — or, if the prop is unwanted, delete "the real `navigator`" from the § Patterns row and state in task 12 that the shell tests override `navigator.languages` with `Object.defineProperty`.

## Requirement Quality

#### [COMPLETENESS_GAP] BLOCKER

- Location: plan.md § Requirements row `Old sessions stay readable`, § Migration, § Implementation Tasks task 6; `interview/single-question-interview/spec.md` scenario `A stored session carrying no recognised language is interviewed in the fallback language`
- Issue: the plan specifies every *read* of a locale-less state and no *write*. Task 6 says "Every read of a loaded session's language goes through `resolveLocale(session.state.locale)`" and stops there, but three saves in `packages/core/src/interview/single-turn-interview.ts` construct the state literal — `begin` (lines 351-356), `endProduction` (lines 172-177) and `recordAnswer` (lines 388-393) — and each stops compiling the moment `locale` is required. The implementer must invent one of two behaviours with opposite observable results: write `resolveLocale(...)` and an M3 session silently gains `"locale":"en"` on disk the first time its question is asked, or spread the loaded state and write a file whose content contradicts its declared type. The first outcome falsifies § Requirements' "No session on disk is refused and no file is rewritten" and § Migration's bold "**No data migrates and no file is rewritten.**" Neither is caught: the delta scenario constrains only which templates are used, and the § Manual Testing row that copies an M3-era session exercises the *replay* path, where a stored question means no save ever runs.
- Fix: Add a clause to the `interview/single-question-interview` delta scenario `A stored session carrying no recognised language is interviewed in the fallback language` stating what the next save writes under `state.locale` for a session that carried none or carried an unsupported tag, and name the same rule in task 6 beside the read rule. Reword § Requirements' `Old sessions stay readable` row and § Migration's bold sentence so they constrain loading only ("loading rewrites no file and refuses no session"). Add a § Manual Testing row that answers the copied M3-era session's question through the model and then `cat`s its `session.json`, so the chosen write behaviour is observed.

#### [AMBIGUOUS_REQUIREMENT] BLOCKER

- Location: plan.md § Requirements row `Authored text is translated; received text is not`, § Consequences final row; `interview/interview-view/spec.md` Background delta; decision-log [8]
- Issue: the boundary the plan asks the human to bless is stated as authorship, and authorship is the wrong test for what the plan actually does. The interview-view Background delta records "What the view does not author it also does not translate — a failure's text is shown exactly as the API or the transport produced it"; § Requirements records "The view localises what it wrote." But `packages/web` authors six English failure sentences that reach the same failure region through `messageOf` and stay untranslated: `interview-api.ts:65-67` (`Creating an interview session failed: POST /interview answered …`), `:87-89` (`The interview question stream for session "…" carried no response body`), `:164-166` (`The interview stream carried an unknown event …`), `:176-178` (`The interview stream carried a malformed event payload: …`), `:183` (`The API refused the answer with status …`), and `InterviewView.tsx:241` (`The interview could not be loaded`). Every one is the web package's own text, not the API's or the transport's, so the recorded rule applied literally requires translating them. The rule is therefore untestable as written, and it is the sentence a later milestone will read before deciding what to localize. Task 15's sweep does not surface them either: it greps `--include=*.tsx` for JSX and `aria-label=`, and five of the six live in a `.ts` module as thrown `Error` messages.
- Fix: Replace the authorship boundary with the scope boundary the clarifying interview actually set. In plan.md § Requirements, § Consequences and the `interview/interview-view` Background delta, state it as "failure text is not localised in this milestone, whichever side wrote it", and delete the "what the view authored" justification. Add a § Non-Goals bullet listing the six English failure strings by file and line so M6 or a later milestone can find them, and add them to § Dead Code Removal's closing note as deliberate survivors.

#### [REQUIREMENT_CONFLICT] ADVISORY

- Location: `interview/interview-http-api/spec.md` DELTA:CHANGED scenario `Creating a session answers its identifier and its language`
- Issue: this CHANGED block renames the scenario it replaces. The recorded heading is `Creating a session answers its identifier` (`specs/interview/interview-http-api/spec.md:19`). Every other CHANGED block in this plan reuses its recorded heading verbatim — `Beginning an interview stores an empty session`, `The conversation carries one instruction and names no model`, `Interview state survives a JSON round trip`, `A failure is shown to the person`, `The shell mounts the interview view` all match. A renamed CHANGED block risks merging as an addition at `/speq:record`, leaving the superseded scenario beside its replacement in the permanent library.
- Fix: Restore the recorded heading `Creating a session answers its identifier` on the DELTA:CHANGED block in `interview/interview-http-api/spec.md`, keeping the added `locale` clauses, and update the matching § Verification Scenario Coverage row in plan.md.

#### [COMPLETENESS_GAP] ADVISORY

- Location: plan.md § Requirements row `Declared language`, § Implementation Tasks task 12; `packages/web/index.html:2`
- Issue: `index.html` hardcodes `<html lang="en">` and the plan corrects `document.documentElement.lang` only in an App effect, so a German visitor's document declares English from first paint until React mounts. No scenario or manual row observes the pre-mount value, and no task names `index.html`.
- Fix: State in plan.md task 12 that `index.html` keeps `lang="en"` as the pre-mount default only, and add a clause to the § Manual Testing `pnpm dev` row checking `document.documentElement.lang` immediately after load in a German browser.

## Task Breakdown

#### [TRACEABILITY_GAP] ADVISORY

- Location: plan.md § Implementation Tasks tasks 6-8, § Verification note "Tasks 5, 7 and 13 adjust their fixtures", § Checklist row `Typecheck`; `packages/server/src/composition.test.ts:31-46`
- Issue: one `InterviewState` literal outside every task's stated scope stops compiling. `askedSession()` returns `StoredSession<InterviewState>` with `state: { turns: [ … ] }` and no `locale`. Once task 6 makes `locale` required this fails `tsc -p packages/server/tsconfig.json`, whose `include` is `src/**/*.ts`, so the § Checklist `pnpm typecheck` row cannot exit 0. Task 7 is scoped to `interview-routes.test.ts`, and task 8 says "Leave `composition.ts` and `app.ts` untouched" without mentioning the test file. Vitest strips types at run time, so `pnpm --filter @chrysalyst/server test` stays green and hides it until the checklist runs.
- Fix: Name `packages/server/src/composition.test.ts` in task 7 as a fixture to update — add the language to `askedSession()`'s state and change no assertion — and add it to § Verification's list of files whose fixtures tasks 5, 7 and 13 adjust.

[no objection on coverage — axis checked: all 25 delta scenarios across the four features map to a named test file and task in § Verification Scenario Coverage, and every task implements something in scope; the § Parallelization ordering holds — Group D (`packages/web`) imports no workspace package, so it genuinely runs beside Group B, and Group B → Group C is required by the route's `FALLBACK_LOCALE` import]

## Design Depth

#### [INFORMATION_LEAKAGE] BLOCKER

- Location: plan.md § Patterns row `A stored language is untrusted input` ("`resolveLocale(session.state.locale)` at every read"), § Implementation Tasks task 6; `interview/single-question-interview/spec.md` scenario `A stored session carrying no recognised language is interviewed in the fallback language` clause "resolving the language MUST happen in exactly one module"
- Issue: the plan hides the fallback *rule* in one module and then spreads its *application* across every call site. `packages/core/src/interview/single-turn-interview.ts` loads a session at four places — `streamQuestion` (line 304), `begin` (line 346), `openingQuestion` (line 360) and `recordAnswer` (line 372) — and under task 6 each must remember to wrap `session.state.locale`. The declared type says `locale: Locale` while the value may be anything `JSON.parse` produced, so the compiler cannot enforce the wrapping and nothing fails when a reader skips it. M8's turn loop and M17's session restore both add readers. The delta clause "resolving the language MUST happen in exactly one module" is satisfied trivially by `locale.ts` existing while the defect stands, so no test catches a caller that forgets. The plan explicitly rejected the optional field because it "would spread an `undefined` case through every reader forever" — the chosen shape spreads a `resolveLocale` call instead.
- Fix: Add one normalizing load to `packages/core/src/interview/single-turn-interview.ts` — a private `loadInterview(id)` that calls `deps.sessions.load` and returns the stored session with `locale` already resolved — and require the four load sites to use it, in plan.md § Key interfaces and task 6. Change the § Patterns row's Where column from "at every read" to "once, at the module's single load boundary". Change the delta scenario's clause from "in exactly one module" to "in exactly one function, which every load of a session passes through", so a caller that reads `state.locale` directly fails a scenario rather than a review.

[no objection on the rest — axis checked: `core` names no HTTP, filesystem or React vocabulary and the language reaches it as a parameter, so the dependency direction holds; `locale.ts` hides the subtag split, the storage read and the fallback behind four declarations; the `Locale` union restated in `packages/web` is forced by the recorded `Web package carries no internal dependency` scenario and is held by `tests/fixtures/interview-locales.json`, the same answer `004` recorded for the SSE frames; `schemaVersion` staying `1` is verified against `packages/server/src/adapters/session-store/filesystem-session-store.ts` — `parseEnvelope` rejects any version but `1` (lines 229-232) and `toStoredSession` casts `state` unvalidated (line 360), so a bump would refuse every M3 session and the envelope is genuinely unchanged]

## Prose Quality

#### [PROSE_BLOAT] ADVISORY

- Location: plan.md § Non-Goals, § Patterns, § Consequences, § Impact, § Migration, § Parallelization, task 13; decision-log [1] and [9]
- Issue: two arguments are restated in full up to six times each. The `schemaVersion`-stays-`1` rationale appears in § Non-Goals, § Patterns, § Consequences, § Impact, § Migration and decision-log [1]; the effect-dependency trap appears in § Decision, § Patterns, task 13, § Parallelization and decision-log [9]. Two counts also disagree: § Context says `packages/web` "holds thirteen English literals inline" while § Dead Code Removal calls the same thirteen "the thirteen user-facing strings of the § UI copy table". The table's thirteenth member is the new `languageControl`, which no literal exists for, and the thirteenth inline literal is `messageOf`'s stand-in, which the plan deliberately keeps.
- Fix: Cut each argument to one home and cross-reference the rest — keep the `schemaVersion` argument in § Migration and the effect-dependency trap in task 13, reducing the other occurrences to a clause naming the section. Correct § Context to "twelve English literals the § UI copy table replaces, plus `messageOf`'s English stand-in, which stays" and make § Dead Code Removal's inline-literals row read "twelve".

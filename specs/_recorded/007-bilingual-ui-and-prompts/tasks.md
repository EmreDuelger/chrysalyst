# Tasks: bilingual-ui-and-prompts

## Phase 2: Implementation (Group A)
- [x] 1. Shared language fixture (`tests/fixtures/interview-locales.json` + README section)

## Phase 2: Implementation (Group B — packages/core, ordered)
- [x] 2. Red — the domain's language vocabulary (`locale.test.ts`, `locale.test-d.ts`)
- [x] 3. Green — `locale.ts`
- [x] 4. Red then green — the bilingual opening prompts (`prompts.test.ts`, `prompts.ts`, `prompts.test-d.ts`)
- [x] 5. Red — the interview's language scenarios (`state.test.ts`, `state.test-d.ts`, `single-turn-interview.test.ts`)
- [x] 6. Green — the language in the state and the interview (`state.ts`, `single-turn-interview.ts`, `loadInterview`) [expert]

## Phase 2: Implementation (Group C — packages/server, ordered)
- [x] 7. Red — the create route's language (`interview-routes.test.ts`)
- [x] 8. Green — the create route (`interview-routes.ts`)

## Phase 2: Implementation (Group D — packages/web, ordered)
- [x] 9. Red then green — the browser's language vocabulary (`locale/locale.test.ts`, `locale/locale.ts`)
- [x] 10. Enable the web package's type-test runner (`vitest.config.ts`)
- [x] 11. Red then green — the string dictionaries (`locale/strings.ts`, `en.ts`, `de.ts`, tests)
- [x] 12. Red then green — the API client's language (`interview-api.ts`, tests)
- [x] 13. Red then green — the shell's language (`App.tsx`, `App.test.tsx`)
- [x] 14. Red then green — the view's two languages (`InterviewView.tsx`, `InterviewView.test.tsx`) [expert]

## Phase 2: Implementation (Group E)
- [x] 15. Live tier — one language per test (`interview-routes.live.test.ts`)

## Phase 2: Implementation (Group F)
- [x] 16. Workspace sweep for stray copy (grep + fix)

## Phase 2: Implementation (Group G — deferred, human step required)
- [ ] 17. Approved styling of the language control — BLOCKED until impeccable subphase approves a comp per plan.md § Design Direction

## Phase 2: Implementation (Group H)
- [x] 18. Run full § Verification checklist end to end, excluding the deferred comp row

## Phase 3: Code Review
- [x] 19. Code review of all changed files — done (review-findings.md, 12 findings), checkbox was not flipped at the time

## Phase 4: Review Fixes
- [x] 4.1 Remove `'problem'` from `ENGLISH_FUNCTION_WORDS` in `packages/server/src/routes/interview-routes.live.test.ts` so the list obeys its own comment (cognates excluded)
- [x] 4.2 In `packages/server/src/routes/interview-routes.ts`, change the create route's 400 message to include `JSON.stringify(namedLocale)` naming the rejected value
- [x] 4.3 In `packages/web/src/App.test.tsx`, fix `stubBrowserLanguages` restore closure to delete the own-property stub when there was no original descriptor
- [x] 4.4 In `packages/web/src/App.test.tsx`, delete the `expect(control.tagName).toBe('SELECT')` assertion
- [x] 4.5 In `packages/web/src/App.test.tsx`, add `disabled`/`tabindex` assertions to the "keyboard-operable" test
- [x] 4.6 In `packages/web/src/App.test.tsx`, replace the `toHaveBeenCalledWith(..., undefined)` assertion with a behavioral assertion (rendered dictionary text + `createSession` call) and remove the now-unneeded `vi.mock` of `InterviewView`
- [x] 4.7 In `packages/web/src/interview/InterviewView.tsx`, fix the doc comment's stale reference to plan 004's tasks 20-22
- [x] 4.8 In `packages/web/src/interview/InterviewView.test.tsx`, split the combined stream-failure/refusal-failure test into two `it.each(LOCALE_CASES)` tests
- [x] 4.9 In `packages/web/src/locale/locale.ts`, fix `browserLanguages`' untested/incomplete guard against a browser with no `languages` property and add a test
- [x] 4.10 In `packages/web/src/locale/strings.test.ts`, derive `STRING_MEMBERS` from `en`'s keys instead of hand-writing the literal
- [x] 4.11 In `packages/core/src/interview/prompts.test.ts`, delete the redundant "holds a template" test case
- [x] 4.12 In `packages/core/src/interview/locale.test.ts`, import the shared language fixture as a JSON module, and revert the domain package's Node-types dependency: `packages/core/tsconfig.json` back to `"types": []`, `@types/node` out of `packages/core/package.json`, `pnpm-lock.yaml` back to HEAD [expert]

## Phase 5: Plan Reconciliation

plan.md was revised after this worktree's implementation was built (66078 → 72200 bytes).
Diffed against the synced current plan.md; these are the only functional gaps found.

- [x] R1. `packages/web/src/App.tsx`: add `readonly languages?: readonly string[]` to `AppProps`, thread it into `detectLocale(languages, storage)` (currently hardcodes `detectLocale(undefined, storage)`). In `App.test.tsx`, replace the `stubBrowserLanguages` navigator-stub in the "starts on the browser's language and still switches when storage throws on read and on write" test with `languages={['de-DE']}` passed as a prop, and delete the now-unused `stubBrowserLanguages` helper (its only other caller list is empty — confirm before deleting).
- [x] R2. `packages/web/src/interview/interview-api.ts`: `readLocale`'s unsupported-tag throw currently reads `` `${context} carried an unsupported "${CREATE_SESSION_FIELD}": ${value}` ``. Change to the plan's exact wording: `` `The session-creation response named an unsupported language "${value}": the supported languages are ${SUPPORTED_LOCALES.join(' and ')}` ``. Update the matching assertion in `interview-api.test.ts`.
- [x] R3. `packages/server/src/routes/interview-routes.live.test.ts`: remove `'was'` from `GERMAN_FUNCTION_WORDS` (it is also an English verb — plan.md § Live-tier risk excludes it for that reason); add `'you'`, `'solve'`, `'it'` to `ENGLISH_FUNCTION_WORDS`. Update the block comment above the lists to match plan.md § Live-tier risk's current rationale (`was` exclusion, whole-word case-insensitive matching, distinct-entry scoring — `functionWordScore` already counts distinct entries, not occurrences, so no scoring-logic change is needed).
- [x] R4. Merged the fallback scenario's read and write assertions (both doubles) into the single test plan.md's Scenario Coverage table names; deleted the two tests it replaced.

Each is a red-then-green pair: adjust/add the test assertion first, confirm it fails against the current code, then change the code, confirm green. Run only the affected package's targeted test file, not the full suite.

## Phase 4: Verification
- [x] 20. Automated checks (build, test, typecheck, lint, format, coverage) — all green
- [x] 21. Scenario coverage audit — 24/24 matched; found and fixed one gap (R4)
- [x] 22. Manual verification (excluding deferred comp row) — curl/server rows verified; browser-visual rows unverified, see verification-report.md § Notes
- [x] 23. Generate verification report — `specs/_plans/bilingual-ui-and-prompts/verification-report.md`

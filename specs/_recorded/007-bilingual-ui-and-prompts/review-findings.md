# Code Review Findings: bilingual-ui-and-prompts

## Summary

- Files reviewed: 37
- Total findings: 12 (standard: 11, expert: 1)

Verification run before review (all green, evidence gathered in the worktree):
`pnpm typecheck` exit 0 · `pnpm lint` 0 errors · `pnpm format:check` clean ·
`pnpm -r --include-workspace-root test` → core 81 passed / 11 files, server 80 passed + 4 skipped,
web 396 passed / 10 files, root 21 passed; core coverage 97.87 % statements, 97.82 % branches.
Task 10's config change is confirmed working — both `packages/web` and `packages/core` report
`Type Errors  no errors`, i.e. `*.test-d.ts` files are collected. Task 16's sweep
(`grep -rnE '>[A-Za-z][A-Za-z ,.…·—]{3,}<|aria-label="' packages/web/src --include=*.tsx`)
returns exactly one line, `chrysalyst` in `App.tsx:62`.

The two cross-cutting invariants the brief called out both hold:
`deps.sessions.load` appears exactly once in `single-turn-interview.ts` (line 313, inside
`loadInterview`), and `InterviewView.tsx` captures the mount-time language in a ref (line 49)
with `locale` absent from the question effect's dependency list (line 101).

## Standard fixes

### packages/server/src/routes/interview-routes.live.test.ts

#### [OUTDATED_COMMENT] The comment says cognates are excluded; `problem` is in the English list

- Location: lines 76-86 (comment) and line 112 (`ENGLISH_FUNCTION_WORDS`)
- Issue: the block comment states that content words near-identical in both languages are excluded on purpose and names `Problem`/"problem" as one of them, but `'problem'` is the last entry of `ENGLISH_FUNCTION_WORDS`. `containsWholeWord` compiles its pattern with the `i` flag (line 122), so German `Problem` matches the English entry. This is not cosmetic: the German system template in `packages/core/src/interview/prompts.ts:34` explicitly instructs the model to ask about "das Problem, das es löst", so the German question is steered toward the very word that scores a point for English — directly weakening the `ownScore > otherScore` discriminator in the case plan.md § Live-tier risk names as the flaky one. Removing it leaves eight English entries, which still clears `FUNCTION_WORD_THRESHOLD` of 3 for a question such as "What problem does your product solve?" (`what`, `does`, `your`).
- Fix: In `packages/server/src/routes/interview-routes.live.test.ts`, delete the `'problem',` entry from `ENGLISH_FUNCTION_WORDS` so the list obeys the rule its own comment states. Leave the comment and `FUNCTION_WORD_THRESHOLD` unchanged.

### packages/server/src/routes/interview-routes.ts

#### [CONTEXTLESS_ERROR] The create route's `400` does not name the rejected value

- Location: lines 124-131
- Issue: the refusal message reads `Cannot create a session: locale must be one of de, en`. It states what was attempted and the constraint but not the input that failed, so a caller that sent `{"locale":"fr"}` and one that sent `{"locale":42}` receive byte-identical text. Every other refusal in this file names the session it concerns (lines 144, 162, 171, 180, 188). Guardrail: "Every error states what was attempted, the input that failed, and the constraint violated."
- Fix: In `packages/server/src/routes/interview-routes.ts`, change the 400 body's `message` template from `` `Cannot create a session: locale must be one of ${SUPPORTED_LOCALES.join(', ')}` `` to `` `Cannot create a session: locale ${JSON.stringify(namedLocale)} must be one of ${SUPPORTED_LOCALES.join(', ')}` ``. `namedLocale` is already in scope at line 122. The existing route test asserts only that the message contains each supported tag, so it stays green without an edit.

### packages/web/src/App.test.tsx

#### [NONDETERMINISTIC_TEST] `stubBrowserLanguages` never restores `navigator.languages`

- Location: lines 88-102
- Issue: `Object.getOwnPropertyDescriptor(window.navigator, 'languages')` returns `undefined` in jsdom, because `languages` is a getter on `Navigator.prototype` rather than an own property of the instance. I verified this in this worktree with a throwaway jsdom test: it printed `OWN-DESCRIPTOR: UNDEFINED-prototype-getter` and, after running the restore branch, `AFTER-RESTORE: ["de-DE"]`. The `restore()` closure therefore does nothing, and the own-property stub `['de-DE']` installed at line 93 stays on `window.navigator` for every later test in the file. It is latent today only because tests 3-5 all pass an explicit `locale` prop and so never reach `detectLocale`; any future test in this file that omits `locale` would silently inherit German and the result would depend on test order. Guardrail: "Independent and repeatable: no shared mutable state."
- Fix: In `packages/web/src/App.test.tsx`, change the `stubBrowserLanguages` restore closure so the no-descriptor case removes the stub instead of leaving it. Replace the body of the returned function with: if `original !== undefined`, `Object.defineProperty(window.navigator, 'languages', original)`; otherwise `delete (window.navigator as unknown as { languages?: unknown }).languages;`.

#### [IMPLEMENTATION_COUPLED_TEST] The language-control test asserts the element's tag name

- Location: line 203 — `expect(control.tagName).toBe('SELECT')`
- Issue: this pins the DOM element the control is built from rather than the behaviour the `platform/web-shell` scenario specifies. plan.md § Implementation Tasks task 17 states that every test task 13 left green "MUST stay green without an edit" once the impeccable comp lands, and that a test needing an edit means the comp changed behaviour and belongs in a spec delta. A comp that renders the switcher as a radio pair or a listbox — one of the two open questions § Design Direction poses to the subphase — would break this line for a purely visual reason. The `getByRole('combobox', { name: /language/i })` query on line 202 already pins the accessible behaviour that matters.
- Fix: In `packages/web/src/App.test.tsx`, delete line 203 (`expect(control.tagName).toBe('SELECT');`).

#### [VAGUE_TEST_NAME] The test claims keyboard operability but asserts none

- Location: lines 194-211
- Issue: the test is named `carries an accessible name, both endonyms, the active language, and keyboard-operable options`, and the `platform/web-shell` scenario it implements ends with "AND every option MUST be reachable and operable from the keyboard". The body asserts the role, the selected value and the option text and nothing about the keyboard, so the last quarter of the name is unbacked. This is the clause task 17's restyling is most likely to break, since styling a native select usually means replacing it with non-focusable elements.
- Fix: In `packages/web/src/App.test.tsx`, inside the `carries an accessible name…` test, add two assertions after the option-text assertion so the keyboard clause is actually exercised: `expect(control.hasAttribute('disabled')).toBe(false);` and `expect(control.getAttribute('tabindex')).toBeNull();`.

#### [IMPLEMENTATION_COUPLED_TEST] The shell test asserts React's internal call signature for a child component

- Location: lines 20-24 (the `vi.mock` block) and lines 227-230
- Issue: `expect(interviewViewModule.InterviewView).toHaveBeenCalledWith(expect.objectContaining({ api, locale: 'de' }), undefined)` asserts that React invoked a function component with a second positional argument of `undefined` — the renderer's legacy context parameter, an internal of React rather than of this application, which would break the test on a React version that stops passing it. It also requires a module-registry mock of `InterviewView` to observe something the rendered output already shows: the spy wraps the real component, so the view genuinely renders, and `uiStrings.de.questionKicker` ("Die Frage") appearing inside the mount point proves the shell handed the view `de`, while `api.createSession` having been called proves it handed it `api`.
- Fix: In `packages/web/src/App.test.tsx`: (1) add `import { uiStrings } from './locale/strings.ts';`; (2) in the `renders the untranslated product heading…` test, replace the `expect(interviewViewModule.InterviewView).toHaveBeenCalledWith(...)` assertion with `expect(within(root).getByText(uiStrings.de.questionKicker)).toBeDefined();` followed by `expect(api.createSession).toHaveBeenCalledWith('de');`; (3) delete the `vi.mock('./interview/InterviewView.tsx', …)` block at lines 20-24 and the now-unused `import * as interviewViewModule from './interview/InterviewView.tsx';` at line 11. Leave `vi.clearAllMocks()` in `afterEach`. Run `pnpm --filter @chrysalyst/web test` afterwards and, if `createSession` has not yet been called when the assertion runs, wrap that one assertion in `await waitFor(() => { … })` using the `waitFor` already exported by `@testing-library/react`.

### packages/web/src/interview/InterviewView.tsx

#### [WORK_TRACKING_COMMENT] The module doc comment cites another plan's task numbers

- Location: line 15 — "the stylesheet (tasks 20-22) restyles what this renders"
- Issue: tasks 20-22 belong to plan `004-single-question-walking-skeleton`, which is recorded and archived; this plan's styling work is task 17. A shipped doc comment that points at a plan's task numbering is work tracking and goes stale on every plan that touches the file. The paragraph immediately below it was rewritten by this change (lines 17-21), so the stale reference was read and left in place. Guardrail: "No work tracking (TODOs, FIXMEs, ticket refs)."
- Fix: In `packages/web/src/interview/InterviewView.tsx`, change the doc-comment sentence "scenarios pin — the stylesheet (tasks 20-22) restyles what this renders and introduces no state of its own." to "scenarios pin — the stylesheet restyles what this renders and introduces no state of its own."

### packages/web/src/interview/InterviewView.test.tsx

#### [SHRINKABLE] The failure test runs four renders and two failure sources inside one `it`

- Location: lines 488-550
- Issue: one `it` loops over `SUPPORTED_LOCALES`, renders two components per language (a stream-`error` case and a refused-submission case), and calls `cleanup()` plus `document.body.innerHTML = ''` twice inside its own body to separate them. Two consequences: a failure reports neither which language nor which failure source, and nothing after the first failing assertion runs — so a German-only regression in the refusal path can be masked by an English failure in the stream path. The file already carries the idiom for this three hundred lines above: `LOCALE_CASES` at line 36 and `it.each(LOCALE_CASES)` at line 135. The `afterEach` at lines 29-33 already does exactly the teardown the body performs by hand.
- Fix: In `packages/web/src/interview/InterviewView.test.tsx`, replace the single `shows the message character for character…` test with two `it.each(LOCALE_CASES)` tests: `shows a stream failure's message character for character under a label in $locale and keeps the answer control closed` (the first half, lines 493-510) and `shows a refused submission's message character for character under a label in $locale and closes both controls` (the second half, lines 515-545). Each renders one view per case, takes `{ locale }` from the case object, and relies on the existing `afterEach`; delete the two in-body `cleanup()` / `document.body.innerHTML = ''` pairs.

### packages/web/src/locale/locale.ts

#### [UNTESTED_ERROR_PATH] `browserLanguages`' failure guards are untested and one hole is open

- Location: lines 93-99
- Issue: `detectLocale`'s default-argument path is never executed by `packages/web/src/locale/locale.test.ts` — every one of its cases passes an explicit language list — so neither the `typeof navigator === 'undefined'` guard nor the `catch` is exercised anywhere, and `packages/web` has no coverage threshold to surface that. The guard is also incomplete against its own doc comment, which promises this "never lets a hostile environment stop the interview from starting": `navigator.languages` returning `undefined` (a host that exposes `navigator` but not `languages`) neither throws nor is `undefined`-checked, so `browserLanguages()` hands `undefined` back to the `for…of` at line 52 and `detectLocale` throws a `TypeError` out of `App`'s `useState` initialiser, blanking the page.
- Fix: In `packages/web/src/locale/locale.ts`, rewrite `browserLanguages` so the property itself is checked, annotating the local to keep `@typescript-eslint/no-unnecessary-condition` satisfied: inside the `try`, `if (typeof navigator === 'undefined') return [];` then `const languages: readonly string[] | undefined = navigator.languages;` then `return languages ?? [];`. Then add a test to `packages/web/src/locale/locale.test.ts` named `answers the fallback without throwing when the browser reports no language list` that, for each of two stubs installed on `window.navigator` via `Object.defineProperty` with `configurable: true` — one whose `languages` getter throws and one whose `languages` is `undefined` — asserts `detectLocale(undefined, stubStorage(null))` equals `FALLBACK_LOCALE` and does not throw, deleting the own property again afterwards (see the `[NONDETERMINISTIC_TEST]` finding on `App.test.tsx` for why restoring a saved descriptor is not enough in jsdom).

### packages/web/src/locale/strings.test.ts

#### [SHRINKABLE] `STRING_MEMBERS` restates the dictionary shape by hand

- Location: lines 9-22
- Issue: `STRING_MEMBERS` lists the twelve string members of `UiStrings` as literals. `type StringMember = Exclude<keyof UiStrings, 'recordedAt'>` makes a *wrong* name a compile error but cannot make a *missing* one an error, so a member added to `UiStrings` and to both `en.ts` and `de.ts` but not to this array is silently skipped by both loops in this file — precisely the omission the `has every member present and non-blank for both languages` test exists to catch. The list is derivable from the dictionary it is testing.
- Fix: In `packages/web/src/locale/strings.test.ts`, replace the literal `STRING_MEMBERS` array with a derived one: `const STRING_MEMBERS = (Object.keys(en) as (keyof UiStrings)[]).filter((member): member is StringMember => typeof en[member] === 'string');`. Leave `SHARED_MEMBERS` as the literal list it is, and leave both test bodies unchanged. Re-run `pnpm lint` afterwards.

### packages/core/src/interview/prompts.test.ts

#### [DUPLICATE_TEST] The "holds a template" case repeats what the next case already proves

- Location: lines 14-21
- Issue: `holds a template for the supported language $locale` annotates the lookup as `OpeningPrompt | undefined` purely so it can assert `toBeDefined()`. `openingPrompts` is declared `Readonly<Record<Locale, OpeningPrompt>>`, so the only way a member can be absent is a table literal that omits a language — which `prompts.test-d.ts` already makes a compile error, and which the `has a non-blank system and user message for $locale` case immediately below would fail on anyway when it dereferences `template.system`. The case adds no coverage over those two.
- Fix: In `packages/core/src/interview/prompts.test.ts`, delete the `it.each(…)('holds a template for the supported language $locale', …)` block at lines 14-21 and the `import type { OpeningPrompt } from './prompts.ts';` at line 6, which becomes unused.

## Expert fixes

### packages/core/tsconfig.json

#### [BOUNDARY_VIOLATION] The domain package's production tsconfig now admits Node's types

- Location: `packages/core/tsconfig.json` line 5 (`"types": []` → `"types": ["node"]`), with `packages/core/package.json` line 16 (`"@types/node": "catalog:"` added to `devDependencies`) and the resulting `pnpm-lock.yaml` entry
- Issue: `packages/core` was the one package in this workspace deliberately compiled with `"types": []` and no `@types/node`; `packages/server` and `packages/web` both carry it. That absence is the mechanical guarantee behind the hexagonal rule in `CLAUDE.md` and `single-turn-interview.ts`'s own doc comment ("reaching the model, the store and the clock only through them is what keeps this module free of a socket, a file and an ambient clock"): with no Node types, a domain module importing `node:fs` or reading `process.env` fails `tsc`. This tsconfig's `include` is `src/**/*.ts` — production modules, not just tests — so that compiler-enforced boundary is now gone for every future module in `packages/core`, bought to let one test read a fixture with `node:fs`. It also breaks two explicit plan requirements: § Requirements "Loopback only, no new dependency | No package gains a dependency. The lockfile is unchanged", and § Verification's Checklist row "Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added".

  The dependency is avoidable. `resolveJsonModule: true` is already set in `tsconfig.base.json`, so the fixture can be imported directly. I proved both halves in this worktree: a probe test importing `../../../../tests/fixtures/interview-locales.json` and asserting `supported`, `fallback` and `createSessionField` passed under `vitest run`, and a probe tsconfig identical to `packages/core/tsconfig.json` but with `"types": []` compiled that import at exit 0 — TypeScript pulls the JSON in and types its fields without `@types/node`. Both probe files were deleted; the tree is unmodified.

  Note `packages/web/src/locale/locale.test.ts` uses the same `node:fs` idiom, and that is fine and should be left alone — `packages/web` already declares `@types/node` and is not the domain package.
- Fix: Remove `packages/core`'s dependency on Node's types, in this order. (1) In `packages/core/src/interview/locale.test.ts`, delete the `node:fs` / `node:path` / `node:url` imports (lines 1-3) and the `repoRoot` + `readFileSync` fixture block (lines 14-23), and replace them with a single `import fixture from '../../../../tests/fixtures/interview-locales.json';` placed above the `vitest` import; keep both existing assertions in the `match the shared language fixture` test as they are. (2) Revert `packages/core/tsconfig.json` line 5 to `"types": []`. (3) Remove the `"@types/node": "catalog:"` line from `packages/core/package.json`'s `devDependencies`. (4) Run `pnpm install` and confirm `git diff pnpm-lock.yaml` is empty — the lockfile must match `HEAD`. (5) Verify with `pnpm --filter @chrysalyst/core typecheck` (exit 0), `pnpm --filter @chrysalyst/core test` (81 tests, coverage at or above 90 %), and `pnpm lint`.

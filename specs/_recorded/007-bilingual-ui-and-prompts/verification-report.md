# Verification Report: bilingual-ui-and-prompts

## Verdict

| Result | Details |
|--------|---------|
| **PASS** | Every checklist row and every § Manual Testing row passes except the impeccable comp row, deferred per § Design Direction's explicit rule (task 17 is blocked on human comp approval, not attempted, not dropped). |
| Code review | 12 findings — 12 fixed (11 standard, 1 expert) |

| Check | Status |
|-------|--------|
| Install | ✓ |
| Build | ✓ |
| Tests | ✓ |
| Live tier | ✓ |
| Coverage | ✓ |
| Typecheck | ✓ |
| Lint | ✓ |
| Format | ✓ |
| Scenario Coverage | ✓ |
| Manual Tests | ✓ (browser-visual rows unverified — see Notes) |

## Provenance note

This worktree held a materially complete implementation (tasks 1-18, code review, fixes 4.1-4.12) built against an earlier plan.md revision (66078 bytes) before this verification pass began. The current plan.md (72200 bytes) was synced in, diffed against the implementation, and four reconciliation gaps were closed as tasks R1-R4 (`tasks.md` § Phase 5):

- **R1** — `AppProps` gained the `languages` test seam; `App.tsx` now threads it into `detectLocale` instead of hardcoding `undefined`. The fragile `stubBrowserLanguages` navigator-stub in `App.test.tsx` was replaced by passing `languages` directly, which also removed the workaround review finding 4.3 had patched.
- **R2** — `interview-api.ts`'s unsupported-locale rejection now reads the plan's exact wording, naming `SUPPORTED_LOCALES` instead of a generic phrase.
- **R3** — the live tier's function-word lists now match plan.md § Live-tier risk exactly (`was` removed from German, `you`/`solve`/`it` added to English); the block comment now states the `was`-exclusion rationale and the distinct-entry scoring rule.
- **R4** — the fallback scenario's test only asserted the read side (opening a question falls back); plan.md's Requirements table and task 5 both make the write side (`recordAnswer` on an old session persists the resolved fallback tag) a MUST. Merged into one test matching the Scenario Coverage table's exact name, covering both doubles' read and write paths plus the "reading alone saves nothing" clause.

All four are test-only or thin pass-through changes; no production behavior outside R1's prop-threading and R2's message wording changed.

## Test Evidence

### Coverage

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| `packages/core` | 97.87% | 97.82% | 100% | 97.87% |
| `packages/server` | 98.17% | 95.57% | 100% | 98.15% |
| `packages/web` | 87.92% | 83.06% | 89.13% | 91.57% |

`packages/core`'s ~90% gate (CLAUDE.md) is met with margin; its two new modules (`locale.ts`, `prompts.ts`) are covered as part of that figure.

### Test Results

| Package | Test Files | Tests Passed | Skipped |
|---------|-----------|---------------|---------|
| root | 2 | 21 | 0 |
| `packages/core` | 11 | 78 | 0 |
| `packages/server` (non-live run) | 7 passed, 2 skipped (9) | 80 | 4 (both `*.live.test.ts`) |
| `packages/web` | 10 | 400 | 0 |
| `packages/server` (live tier, `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b`) | 9 | 84 | 0 |

Live-tier evidence, captured directly from a verbose run against a real Ollama holding `qwen3:8b`:

```
[feasibility] model=qwen3:8b msToFirstToken=3469
[language] locale=de ownScore=3 otherScore=0 question=Können Sie mir bitte das Produkt beschreiben, das Sie im Sinn haben, sowie das Problem, das es lösen soll?
[language] locale=en ownScore=7 otherScore=0 question=What is the product you're envisioning, and what problem does it solve?
```

Both language cases clear § Live-tier risk's threshold (own score ≥ 3, strictly greater than the other) on the first attempt; the ladder was not needed.

### Manual Tests

| Test | Result |
|------|--------|
| `pnpm --filter @chrysalyst/core test` / `typecheck` | ✓ |
| `pnpm --filter @chrysalyst/server test` (both live files skip) | ✓ |
| `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m5 … dev` then `POST /interview {"locale":"de"}` | ✓ — `{"id":"…","locale":"de"}`; `session.json` shows `"locale": "de"`, `"schemaVersion": 1` |
| `POST /interview` with no body, `'not json'`, `'{}'` | ✓ — all three answer `201` with `"locale":"en"` |
| `POST /interview {"locale":"fr"}` | ✓ — `400`, `{"message":"Cannot create a session: locale \"fr\" must be one of de, en"}`; no new session directory created |
| `GET /interview/<de-id>/question` (real Ollama) | ✓ — streamed in German, ending `"...das es lösen soll?"` |
| Copy an M3-era session (no `locale`) in, replay its question | ✓ — SHA-256 of `session.json` identical before and after |
| Answer that copied session | ✓ — `session.json` gains `"locale": "en"` beside the answered turn, `"schemaVersion": 1` unchanged |
| `packages/web` test / typecheck (`*.test-d.ts` collected) | ✓ |
| Workspace sweep: `grep -rnE '>[A-Za-z][A-Za-z ,.…·—]{3,}<\|aria-label="' packages/web/src --include=*.tsx` | ✓ — one line, `chrysalyst` in `App.tsx:64`; endonyms render via dictionary lookup so the regex correctly does not catch them |
| `pnpm --filter @chrysalyst/web build` | ✓ — exit 0, `dist/index.html` references a module asset |
| `pnpm dev` in a German-reporting browser; localStorage check; site-data-blocked profile; keyboard tab-through | **Not verified this pass** — see Notes |
| Impeccable comp row (task 17) | **Deferred** — § Design Direction; not attempted, not dropped |

## Tool Evidence

### Linter

```
$ pnpm lint
0 errors, 0 warnings
```

### Formatter

```
$ pnpm format:check
All matched files use Prettier code style!
```

Two files needed `prettier --write` during this pass (`packages/web/src/App.test.tsx` after R1, `packages/core/src/interview/single-turn-interview.test.ts` after R4) — both were reformatted and reverified clean.

## Scenario Coverage

All 24 automated scenarios from plan.md's Scenario Coverage table were confirmed present by name and passing (grep-verified against the test files, cross-checked with the green full-suite run above). The one exception found and fixed this pass:

| Scenario | Test Location | Test Name | Passes |
|----------|---------------|-----------|--------|
| A stored session carrying no recognised language is interviewed in the fallback language | `single-turn-interview.test.ts` | `falls back for a state with no locale and for one holding an unsupported tag, rejects neither, and writes the fallback tag on the next save` | Pass (fixed by R4 — previously read-only, see Provenance note) |

Every other scenario row (opening/beginning/conversation/prompt-table/JSON-round-trip scenarios in `packages/core`; route-creation/fallback/refusal scenarios in `packages/server`; dictionary/view/shell/detection/storage/document-lang/control scenarios in `packages/web`) matched its named test verbatim and the corresponding suite is green. `004-single-question-walking-skeleton`'s prior scenarios remain green with only fixture literals touched (`composition.test.ts`'s `askedSession()` gained a `locale`, per task 7's note), no assertion edited.

## Notes

- **Browser-visual rows unverified.** Playwright's Chromium is not installed in this sandbox (`npx playwright install` requires `sudo`, unavailable here), so the four browser-only § Manual Testing rows — `pnpm dev` in a German-reporting browser, the `localStorage` check after switching, a site-data-blocked profile, and tabbing through the control by keyboard — were not exercised against a real browser this pass. The equivalent behavior is covered at the component level by jsdom-based tests in `App.test.tsx` (language switching, `documentElement.lang`, storage read/write including a throwing stub, and the `disabled`/`tabindex` assertions review finding 4.5 added), but that is not the same evidence a real browser provides. Recommend running these four rows by hand before `/speq:record`.
- **Task 17 (styled language control) is deferred**, per § Design Direction's rule: tasks 1-16 and this verification proceed without it, and the one § Manual Testing comp row is carved out rather than failed. Neither task 17 nor that row should block `/speq:record`.
- **The live-tier ladder was not needed.** Both language cases cleared the function-word threshold on the first run against a real model; no template strengthening was required.

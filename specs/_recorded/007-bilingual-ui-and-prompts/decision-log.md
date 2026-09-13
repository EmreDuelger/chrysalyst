# Decision Log: bilingual-ui-and-prompts

## Interview

**Q:** How should the app decide which locale (DE/EN) to use?
**A:** Auto-detect plus manual override — default from the browser's reported language (`navigator.language` / `Accept-Language`), with an explicit UI toggle the user can switch; the override is remembered (for example in `localStorage`) so a reload keeps the choice.

**Q:** Once an interview session has started, can its locale change mid-session, or is it fixed at creation?
**A:** Fixed per session — the locale is chosen when the session is created, sent to the server, stored alongside the session, and drives the opening-question prompt; it stays fixed for that session's lifetime. Switching the app-wide locale only affects new sessions.

**Q:** How should UI strings be externalised per locale in the web package?
**A:** Hand-rolled string dictionaries — plain TS modules (for example `en.ts` / `de.ts`) with a small lookup helper, no new dependency. No library (i18next, react-intl); the project has no pluralisation or date-formatting need beyond what is already hand-rolled.

**Q:** Do user-facing error/failure messages need to be translated in this milestone, or only the interview chrome and the LLM's interview language?
**A:** Chrome plus LLM language only — static UI strings (labels, buttons, headings) and the model's interview language are localised now. Error and failure messages, which often surface raw model or server failure text, stay as they are this milestone.

**Constraint carried into planning:** the supported locale set is exactly `de` and `en` per `specs/roadmap.md` § M5; any other browser-reported locale must fall back to a sane default, and the planner decides and documents which.

## Design Decisions

### [1] The session's language lives in `InterviewState`, and `schemaVersion` stays `1`

- **Decision:** `InterviewState` grows a `locale` field beside `turns`. The on-disk envelope and its `schemaVersion` are untouched. Every load of a session passes through one private function that applies `resolveLocale`, which answers the fallback for an absent or unrecognised value — see `[plan-review] The fallback rule had one home and four appliers`.
- **Alternatives:** Bumping `schemaVersion` to `2`; putting the language on the `StoredSession` envelope; declaring the field optional in the type; threading the language through each call instead of storing it.
- **Rationale:** `002-add-ollama-llm-adapter`'s ADR records that `schemaVersion` versions the envelope, not the state it wraps, and the store refuses any version it does not recognise. A bump would therefore make every session M3 wrote unreadable — sessions that exist, because `pnpm dev` has been run — and break the mission's promise that sessions stay readable. The envelope is the wrong home because `SessionStorePort<TState>` is generic and must not learn a domain word. An optional field would spread an `undefined` case through every future reader. Threading it through calls would not survive a reload, which the interview's "fixed per session" answer requires. Resolving an untrusted stored value at the single read boundary keeps the declared type honest for new data and tolerant of old, and it is the same hazard the state module already documents for `Date` versus ISO string.
- **Promotes to ADR:** yes

### [2] `en` is the fallback for a browser language outside `{de, en}`

- **Decision:** `FALLBACK_LOCALE` is `en`, declared once in `packages/core/src/interview/locale.ts` and restated once in `packages/web/src/locale/locale.ts` under fixture guard.
- **Alternatives:** `de`, on the grounds that the repository's specs, roadmap and maintainer are German; deriving the fallback from the first supported entry of `SUPPORTED_LOCALES`.
- **Rationale:** The fallback only ever serves a visitor whose browser reports neither German nor English — a French or Japanese visitor. A German visitor is detected correctly and never reaches it. English is the wider second language and is already the language of the code, the prompt this milestone starts from, and the adapter's failure messages, so a fallback session is internally consistent rather than a German shell around English error text. Deriving it from array order would hide a decision inside a sort. The choice is one constant per package to reverse.
- **Promotes to ADR:** yes

### [3] Prompt templates are authored per language and typed over the locale union

- **Decision:** `openingPrompts: Readonly<Record<Locale, OpeningPrompt>>` in `packages/core/src/interview/prompts.ts`. Each template is written in its own language and also states that language explicitly. Both languages sit side by side in one module.
- **Alternatives:** One English template with a per-language "answer in X" sentence appended; a template per file; generating the non-English template by asking the model to translate.
- **Rationale:** M5's acceptance bar is that a small local model actually asks in the user's language, and an instruction phrased in the target language is the stronger prompt for a model of that size — the explicit directive is kept as well because the failure this milestone must not have is a German-speaking person interviewed in English. Typing the table over `Locale` turns the roadmap's rule that every prompt-bearing milestone from M5 onward writes its templates bilingually into a compile error rather than a convention to remember. Both languages share a module because a prompt is a multi-sentence instruction whose meaning can drift; a reviewer must see both in one diff. Run-time translation would make the prompt non-deterministic and cost an inference before the interview starts.
- **Promotes to ADR:** yes

### [4] No i18n library

- **Decision:** No i18next, react-intl, FormatJS or message-catalogue tooling. Hand-rolled typed dictionaries only. The lockfile does not change.
- **Alternatives:** i18next with the React bindings; `Intl.*` wrappers for dates and numbers.
- **Rationale:** The clarifying interview settled this, and the surface confirms it: thirteen labels, one interpolation, two languages, no pluralisation, and a single time label already hand-rolled as 24-hour `HH:MM` — unambiguous in both languages. A library would add a dependency, a loading lifecycle and a key-based lookup to a problem that a typed record solves at compile time. The cost of reversing this is bounded: the dictionaries are plain modules a library can consume.
- **Promotes to ADR:** yes

### [5] The dictionary is a typed record, not a `t(key)` helper

- **Decision:** `uiStrings[locale].submit`, over a `UiStrings` interface both language modules satisfy. One member is a function, `recordedAt(time)`, because it interpolates.
- **Alternatives:** The `t('interview.submit')` shape the clarifying interview sketched as "a small lookup helper".
- **Rationale:** A refinement of the interview's answer rather than a departure from it — the dictionaries are still plain TS modules with no dependency. A `t` call with a string key is typed `string` even for a key that does not exist, so a missing translation reaches a browser and renders a key; indexing a typed record makes the same mistake a `tsc` failure. That removes the one class of bug hand-rolled dictionaries are known for, at no cost in ceremony.
- **Promotes to ADR:** yes

### [6] Naming no language and naming a wrong one are answered differently

- **Decision:** `POST /interview` with no body, a non-JSON body, or a JSON object carrying no `locale` creates a session in the fallback language and answers `201`. A body whose `locale` is present but is not a supported tag answers `400` and creates nothing.
- **Alternatives:** Falling back for both; refusing both; sniffing `Accept-Language` when the body names nothing.
- **Rationale:** The two cases mean different things. A body-less creation is the contract `004` recorded and is still valid; something wrong named is a caller that believes it got what it asked for, and a person interviewed in the wrong language has no signal that anything went wrong. The answer route already refuses a body it cannot honour, so this is the established vocabulary rather than a new one. `Accept-Language` sniffing was rejected because detection would then have two homes, in the browser and on the server, which is precisely the duplicated-decision defect this plan is trying not to create.
- **Promotes to ADR:** no

### [7] The creation response echoes the language the session was created in

- **Decision:** `POST /interview` answers `{ id, locale }`, and the browser uses the returned language rather than the one it sent.
- **Alternatives:** Answering `{ id }` and letting the client assume its own value was accepted.
- **Rationale:** The fallback for a body-less creation is specified and therefore reachable — by `curl`, by a test, and by M17 when it restores a session it did not create. Without the echo, the browser and the route would each own a belief about what the session holds, and the `lang` the question region declares to a screen reader could name a language the question was not asked in. One field removes the divergence and makes WCAG 3.1.2 provable rather than assumed.
- **Promotes to ADR:** no

### [8] The view localises the failure label; failure text is not localised in this milestone

- **Decision:** `The question stopped` / `Die Frage ist abgebrochen` comes from the dictionary, like every other label. The message underneath is rendered character for character as it arrived, whichever side wrote it — the API's words, the transport's, and the eight English sentences `packages/web` writes itself, `messageOf`'s stand-in among them.
- **Alternatives:** Leaving the label English too, which is how the orchestrator's brief was first read; translating the eight English failure sentences; drawing the line at authorship — the view translates what it wrote — which was this plan's first formulation.
- **Rationale:** The clarifying interview excluded error and failure *messages*, the text that surfaces raw model or server failure. `The question stopped` is not one: it is a heading the view shows above that text, in the same register as `The question`, so leaving it English inside an otherwise German column would be a visible inconsistency with no reason behind it. The authorship formulation was withdrawn in review because it is untestable here — `packages/web` authors eight English failure sentences of its own, so the rule applied literally would require translating them. The boundary is scope: failure text is not localised in this milestone. It is stated once in the `interview/interview-view` background, and the eight survivors are listed in plan.md § Non-Goals by file and line so a later milestone can widen the scope without a sweep. Superseded formulation: `[plan-review] The failure boundary was stated as authorship`.
- **Promotes to ADR:** yes

### [9] The shell owns the app's language; the view receives it

- **Decision:** `App.tsx` holds the language in state, writes `document.documentElement.lang`, renders the control, remembers the choice, and passes the language to `InterviewView` as a prop. `InterviewView` captures it once at mount for session creation and takes the session's language from the creation response thereafter.
- **Alternatives:** The view owning the language; a React context; a module-level store.
- **Rationale:** The masthead and the view are both written in the language, so an owner below both cannot serve both. A context for one value read by two components two levels apart is a shallow module with no beneficiary. Keeping the chrome's language and the session's language as two distinct values inside the view is what makes "fixed per session" implementable: putting the chrome's language in the question effect's dependency list would re-run the effect on every switch, orphaning a session and starting a second inference, and a scenario is written specifically to catch that.
- **Promotes to ADR:** no

### [10] `tests/fixtures/interview-locales.json` holds the three packages' vocabulary in agreement

- **Decision:** A fixture at the repository root names the supported tags, the fallback, and the field the creation request carries the language under. Core's, the server's and the web package's suites each assert their own declarations against it.
- **Alternatives:** Letting each package declare its own; adding `@chrysalyst/core` as a type-only dependency of `packages/web`.
- **Rationale:** `packages/web` declares no workspace package — a rule `004`'s § Consequences argued at length and the workspace suite enforces — so the tags and the fallback are necessarily restated there. That restatement is a decision living in three places with nothing holding it together, which is the back-door leakage the design philosophy warns about. `004` already answered this exact problem for the SSE frame contract with a root fixture both sides read; reusing that answer costs one small file and no package edge, and makes a renamed tag or field fail a run rather than a browser.
- **Promotes to ADR:** no

### [11] The live tier proves a language by function-word score

- **Decision:** Each live case scores the model's question against a small German and a small English function-word list and asserts the session's language scores at least three and strictly more than the other. Matching is case-insensitive and whole-word, an entry matches only the word as listed rather than an inflected form, and a score counts distinct list entries present rather than occurrences. Neither list holds a word of the other language: `problem` and `was` are excluded for that reason, as is every other word near-identical across the two.
- **Alternatives:** Asserting umlauts or `ß`; a substring match on an expected phrase; a second model call classifying the language.
- **Rationale:** One sentence is a thin sample, and the assertion must fail a genuinely wrong-language question without flaking on a correct one. Function words are the densest language signal in a short question and are what a model cannot avoid. Umlauts are likely but not guaranteed in a single German sentence. A classifier call would make the test depend on a second model capability the milestone is not claiming. A failing German case is a finding about the prompt rather than the test: the recorded ladder strengthens the directive, then moves it to the user message, then records a model constraint — it never lowers the threshold.
- **Promotes to ADR:** no

### [12] The plan proceeds with the language control unstyled rather than waiting on the impeccable subphase

- **Decision:** Task 13 renders a working, accessible, unstyled control that the `platform/web-shell` scenarios assert. Task 17 styles it after the subphase approves a comp, and is the only task blocked on a human. Task 17 and the § Manual Testing comp row are deferred together; task 18 runs the checklist with that one row carved out. § Design Direction carries the brief the subphase starts from and the deferral rule.
- **Alternatives:** Blocking the whole plan on the subphase, as `004` did by running it during planning; styling the control from the existing design system without a comp.
- **Rationale:** `CLAUDE.md`'s route requires the subphase for new UI, and the control is new UI. But the control's behaviour is fully specified by scenarios and independent of its appearance, so seventeen of eighteen tasks do not need the comp. Styling it without one would put a design decision in an implementation task, which is exactly what the subphase exists to prevent — and the brief names the control's hardest problem, communicating that a switch relabels the page rather than re-asking the question, as the reason a comp is needed rather than a guess.
- **Promotes to ADR:** no

## Review Findings

### [plan-review] The web package had no type-test runner

- **Finding:** round-1 `[HIDDEN_DEPENDENCY]` BLOCKER. `packages/web/vitest.config.ts` declares `test.environment` and `test.coverage` and no `test.typecheck`, unlike `packages/core` and `packages/server`. Vitest's default `include` does not match `*.test-d.ts` and `typecheck.include` is consulted only once typecheck is enabled, so `strings.test-d.ts` would have executed nothing while `pnpm --filter @chrysalyst/web test` reported green. The plan named a test for the `A string dictionary missing an entry fails the type check` scenario and claimed the web suite proved it; no task turned the runner on.
- **Direction change:** A new task 10 enables `typecheck: { enabled: true }` in `packages/web/vitest.config.ts`, mirroring `packages/core`, and excludes `**/*.test-d.ts` from coverage there as core already does. The task verifies the config rather than assuming it — delete a dictionary member, confirm the web test run goes red, restore it. It sits before the task that writes the first `*.test-d.ts`, which renumbered tasks 10-17 to 11-18 and Groups D through H with them. § Manual Testing gains a `pnpm --filter @chrysalyst/web typecheck` row beside the existing `packages/core` one, and the web test row now states that a run naming no type test means the runner is still off.
- **Promotes to ADR:** no

### [plan-review] The comp's absence blocked more than the styling task

- **Finding:** round-1 `[HIDDEN_DEPENDENCY]` BLOCKER, two defects. § Design Direction claimed every task but the styling one was independent of the missing comp, which is false: the final task runs every § Manual Testing row and one of those rows *is* the approved comp, so it could not complete either, and `/speq:implement` had no instruction for the case. § Design Direction also credited the wrong task with rendering the control — it named the view task, while the styling task and decision-log [12] both correctly named the shell task.
- **Direction change:** § Design Direction now names the shell task (13) as the one that renders the control and carries an explicit deferral rule: tasks 1-16 proceed, task 17 and the § Manual Testing comp row are deferred together until a comp is approved, neither is dropped, and `/speq:implement` neither stops the plan early nor styles the control without a comp. Task 18 is reworded to run the checklist end to end excluding that one row while task 17 is deferred, and to record the deferral in the verification report. § Dependencies and § Parallelization carry the same carve-out — Group G is explicitly not a predecessor of Group H — and the comp row itself is marked deferred in § Manual Testing.
- **Promotes to ADR:** no

### [plan-review] The plan specified every read of an old session's language and no write

- **Finding:** round-1 `[COMPLETENESS_GAP]` BLOCKER. `locale` becomes a required field of `InterviewState`, and two of the three `sessions.save` calls in `single-turn-interview.ts` rebuild the state literal from a loaded session. The plan said what every *read* does and nothing about what those saves write, leaving the implementer to invent one of two behaviours with opposite observable results. § Requirements' "no file is rewritten" and § Migration's bold "**No data migrates and no file is rewritten.**" were false under one of them and unverified under both — the delta scenario constrained only template choice, and the M3-era § Manual Testing row exercised the replay path, where no save runs.
- **Direction change:** The write rule is now specified rather than discovered: a save rebuilds state from the normalised session the single load returned, so a session that carried no language or an unsupported one gains the resolved fallback tag on the next save its own progress causes. The `interview/single-question-interview` delta scenario gains two clauses — what the next save writes, and that loading alone writes nothing. Task 6 states the write rule beside the read rule and forbids both dodges (spreading the loaded state, stripping the field back out). § Requirements' `Old sessions stay readable` row and § Migration's bold sentence now constrain loading only, with a second § Migration paragraph explaining why a progress-caused write is not a migration pass. A new § Manual Testing row answers the copied M3-era session and `cat`s its `session.json`, so the behaviour is observed.
- **Promotes to ADR:** no

### [plan-review] The failure boundary was stated as authorship

- **Finding:** round-1 `[AMBIGUOUS_REQUIREMENT]` BLOCKER. The plan drew the localisation boundary at authorship — "the view localises what it wrote" — and `packages/web` authors six English failure sentences that reach the same failure region: five in `interview-api.ts` (lines 66, 88, 165, 176, 183) and `messageOf`'s stand-in in `InterviewView.tsx:241`. Applied literally the rule required translating them, so it was untestable as written, and it is the sentence a later milestone would read before deciding what to localise. The sweep task would not have surfaced them either: it greps `--include=*.tsx` for JSX and `aria-label=`, and five of the six are thrown `Error` messages in a `.ts` module.
- **Direction change:** The boundary is restated as scope, not authorship — failure text is not localised in this milestone, whichever side wrote it — in plan.md § Requirements, § Consequences and § Non-Goals, and in the `interview/interview-view` Background delta; the `A failure is shown to the person` scenario's justification clause is changed with them. The view's failure *label* stays localised, which the review confirmed follows the clarifying answer rather than deviating from it, so decision-log [8]'s deviation flag is withdrawn. § Non-Goals now lists the six survivors by file and line for M6 or later, and § Dead Code Removal's closing note names them as deliberate survivors, stating why the sweep will not find five of them.
- **Promotes to ADR:** no

### [plan-review] The fallback rule had one home and four appliers

- **Finding:** round-1 `[INFORMATION_LEAKAGE]` BLOCKER. The plan hid the fallback *rule* in `locale.ts` and spread its *application* across every call site: `single-turn-interview.ts` loads a session at four places, and each had to remember to wrap `session.state.locale` in `resolveLocale`. The declared type says `locale: Locale` while the value is whatever `JSON.parse` produced, so the compiler could not enforce the wrapping and nothing failed when a reader skipped it — M8's turn loop and M17's session restore both add readers. The delta clause "resolving the language MUST happen in exactly one module" was satisfied trivially by `locale.ts` existing while the defect stood. The plan had rejected an optional field for spreading an `undefined` case through every reader; the chosen shape spread a `resolveLocale` call instead.
- **Direction change:** A module-private `loadInterview(id)` is now the only call to `deps.sessions.load` in `single-turn-interview.ts`; it loads and answers the session with `state.locale` already resolved, and the four load sites call it. § Key interfaces declares it with its design intent, task 6 requires it and names the four sites, § Patterns' `A stored language is untrusted input` row moves from "at every read" to the single load boundary, and § Migration's table row follows. The delta scenario's clause becomes "exactly one function, which every load of a session passes through", so a caller reading the stored value directly fails a scenario rather than a review. This also makes the write rule of the `[COMPLETENESS_GAP]` finding fall out of the design rather than needing a second mechanism.
- **Promotes to ADR:** yes

### [plan-review] The live-tier language lists each held a word of the other language

- **Finding:** round-2 `[UNSTATED_ASSUMPTION]` ADVISORY, addressed at the user's direction rather than by the review loop. § Live-tier risk claimed "content words that are near-identical in both languages are excluded on purpose" and then listed `problem` in the English list, which is `Problem` in German — and § The prompt templates' German system message asks for "das Problem, das es löst", so a correct German question scored an English hit. Matching was left undefined in both case handling and counting: `Sie` and `Ihr` were listed capitalized while `der`, `die` and `was` were listed lowercase and are capitalized sentence-initially, which moves a real German question between 2 and 3 across a threshold of exactly 3.
- **Direction change:** `problem` leaves the English list and `you`, `solve` and `it` join it. `was` leaves the German list for the mirror reason the finding gives for `problem` — it is an English verb, so it breaks the same exclusion rule, and fixing one collision while shipping the other would leave the assertion contradicting itself a second round running. § Live-tier risk and decision-log [11] now state three rules the implementer would otherwise guess: matching is case-insensitive and whole-word; an entry matches only the word as listed, never an inflected form; and a score counts distinct list entries present rather than occurrences. Task 15 says "three distinct hits" to match. The threshold and the ladder are untouched.
- **Promotes to ADR:** no

### [plan-review] The shell had no test seam for the browser's language list

- **Finding:** round-2 `[UNSTATED_ASSUMPTION]` ADVISORY, carried from round 1. `AppProps` offered `locale`, `storage` and `api`, and task 13 initialised from `locale ?? detectLocale(undefined, storage)` — so passing `locale` skipped detection and omitting it read jsdom's real `navigator.languages`. The `platform/web-shell` scenario `Storage that cannot be read or written leaves the app usable` requires the app to start in the language the browser reports while storage throws, which is the one case neither branch expresses, and § Patterns claimed "no test touches the network, the real `navigator`, or the real `localStorage`" while the plan stood.
- **Direction change:** `AppProps` gains `languages?: readonly string[]`, defaulting to `navigator.languages` inside `detectLocale`, and task 13 initialises from `locale ?? detectLocale(languages, storage)`. The prop was chosen over the `Object.defineProperty(navigator, …)` alternative because `detectLocale` already takes the list as its first parameter, so the prop mirrors a seam the design had rather than adding a new kind; overriding a global would also contradict the § Patterns row it was meant to rescue and leak between tests. § Patterns now states what each of the two language seams is for.
- **Promotes to ADR:** no

### [plan-review] The untranslated-failure enumeration was short by two

- **Finding:** round-2 `[COMPLETENESS_GAP]` ADVISORY. § Non-Goals listed six English failure sentences by file and line "so M6 or a later milestone can find them without a sweep", and four other places repeated the count. `readString` throws a seventh at `interview-api.ts:203`, reached through exactly the `createSession` path task 12 extends, and task 12 added an eighth — a rejection of a creation response whose `locale` is unsupported — with no message text specified anywhere. § Dead Code Removal explains that task 16's sweep greps `--include=*.tsx` and so cannot find `.ts` throw sites, which is precisely why the omitted two would stay English permanently.
- **Direction change:** The enumeration holds eight entries and every count reads "eight" — in § Non-Goals, § Requirements, § Consequences, § Dead Code Removal and decision-log [8]. The finding's fix said "seven" and then added an eighth entry to the same list; a count that contradicts its own list is the defect of the `[PROSE_BLOAT]` finding below, so the count follows the list. § Non-Goals also states that its line numbers describe the file before this milestone. Task 12 now splits the two rejections by owner: an absent or non-string `locale` stays `readString`'s existing message, and a string outside the supported set throws the new `The session-creation response named an unsupported language "…": the supported languages are de and en`, naming the tags from `SUPPORTED_LOCALES` rather than typing them twice. The round-1 `[plan-review]` entry above keeps its "six", because it records what round 1 found.
- **Promotes to ADR:** no

### [plan-review] A CHANGED scenario was renamed instead of reusing its recorded heading

- **Finding:** round-2 `[REQUIREMENT_CONFLICT]` ADVISORY, carried from round 1. `interview/interview-http-api/spec.md`'s DELTA:CHANGED block was headed `Creating a session answers its identifier and its language`, while the recorded heading at `specs/interview/interview-http-api/spec.md:19` is `Creating a session answers its identifier`. Every other CHANGED block in this plan reuses its recorded heading verbatim. A renamed CHANGED block risks merging at `/speq:record` as an addition, leaving the superseded scenario beside its replacement in the permanent library.
- **Direction change:** The delta block carries the recorded heading again; its added `locale` clauses are unchanged, so the scenario still specifies the echoed language. The § Verification Scenario Coverage row matches the restored heading, and the test name behind it is untouched.
- **Promotes to ADR:** no

### [plan-review] `index.html`'s pre-mount language was left unstated

- **Finding:** round-2 `[COMPLETENESS_GAP]` ADVISORY, carried from round 1. `packages/web/index.html:2` hardcodes `<html lang="en">` and the plan corrected `document.documentElement.lang` only in a post-mount App effect, so a German visitor's document declares English from first paint until React mounts. No task named `index.html` and no row observed the pre-mount value, which leaves a reader unable to tell the deliberate default from an oversight.
- **Direction change:** Task 13 states that `index.html` keeps `lang="en"` as the pre-mount default, correct for the moment before any language has been decided, and that the effect owns the value from mount onward. The § Manual Testing `pnpm dev` row now reads `document.documentElement.lang` immediately on load in a German browser and expects `en` flipping to `de`, named as the stated behaviour rather than a defect. No scenario is added: the value before React runs is not behaviour the shell can assert about itself.
- **Promotes to ADR:** no

### [plan-review] The fallback-locale write rule was normative but unasserted

- **Finding:** round-2 `[TRACEABILITY_GAP]` ADVISORY. The write clause that round 1's `[COMPLETENESS_GAP]` blocker added to `A stored session carrying no recognised language is interviewed in the fallback language` is a MUST, but task 5's named test covered only reading, and § Migration said outright that the write is "observed rather than asserted" by a § Manual Testing row. That row returns `recorded` only when the copied M3-era session's last turn is asked and unanswered — `recordAnswer` answers `no-open-question` and saves nothing otherwise — and no row stated the precondition, so a tester copying an answered session would see no write and conclude the rule was broken.
- **Direction change:** Task 5's fallback test asserts both halves: `recordAnswer` on the locale-less double and on the `'fr'` double saves a state carrying `FALLBACK_LOCALE`, and requesting the question alone hands the store no save. The two doubles are specified to hold an asked, unanswered turn. The § Verification Scenario Coverage test name becomes `falls back for a state with no locale and for one holding an unsupported tag, rejects neither, and writes the fallback tag on the next save`. Both M3-era § Manual Testing rows state the precondition, and the second names `no-open-question` as the symptom of breaking it. § Migration now credits the test with the assertion and the manual row with confirming it against a real file.
- **Promotes to ADR:** no

### [plan-review] Task 10's own verification lived inside task 11's artifacts

- **Finding:** round-2 `[TASK_GRANULARITY]` ADVISORY. Task 10 instructed the implementer to mutate `strings.test-d.ts` — a file task 11 writes — to prove the type-test runner collects it, but task 11's description never mentioned the check and Group D runs 9 → 10 → 11 in order. Under `/speq:implement`'s task-per-subagent model task 10 either blocked on files that do not exist or closed unverified, which is the "green run over a type test that was never collected" defect the task exists to close.
- **Direction change:** Task 10 ends at the `vitest.config.ts` edit and a green `pnpm --filter @chrysalyst/web test`, and says plainly that it cannot verify itself because no `*.test-d.ts` exists yet. Task 11, which owns both `en.ts` and `strings.test-d.ts`, closes the loop: delete one member, confirm the run goes red on the type test rather than only on `strings.test.ts`, restore it, confirm green. Neither task's position in Group D changes, so no renumbering follows.
- **Promotes to ADR:** no

### [plan-review] A state fixture outside every task's scope stopped compiling

- **Finding:** round-2 `[TRACEABILITY_GAP]` ADVISORY, carried from round 1. `packages/server/src/composition.test.ts:31-46`'s `askedSession()` returns a `StoredSession<InterviewState>` whose state literal carries only `turns`. Once task 6 makes `locale` required this fails `tsc -p packages/server/tsconfig.json`, so the § Checklist `Typecheck` row cannot exit 0 — but task 7 was scoped to `interview-routes.test.ts` alone and task 8 said to leave `composition.ts` and `app.ts` untouched without mentioning the test file. Vitest strips types at run time, so the server suite stays green and hides the break until task 18.
- **Direction change:** Task 7 names `packages/server/src/composition.test.ts` as a fixture to update — add the language to `askedSession()`'s state literal, change no assertion — and says why the server test run will not catch it. § Verification's fixture sentence now lists the files each of tasks 5, 6, 7 and 14 touches and singles out `composition.test.ts` as the one no scenario names and only the `Typecheck` row surfaces.
- **Promotes to ADR:** no

### [plan-review] A stale literal count had spread across three sections

- **Finding:** round-2 `[PROSE_BLOAT]` ADVISORY, carried from round 1. § Context, § Dead Code Removal's `Inline literals` row and § Migration's final table row each said thirteen English literals are replaced. Only twelve of the § UI copy table's thirteen members replace an existing literal: `languageControl` is new copy for a control that does not exist yet, and the thirteenth pre-existing literal is `messageOf`'s English stand-in at `InterviewView.tsx:241`, which the plan deliberately keeps untranslated.
- **Direction change:** § Context reads "twelve English literals the § UI copy table replaces, plus `messageOf`'s English stand-in, which stays". § Dead Code Removal's row and § Migration's row read "twelve", each naming `languageControl` as the member with no literal behind it. The counts that describe the dictionary itself stay at thirteen — § Key interfaces, task 11 and decision-log [4] — because the table does hold thirteen members; only the count of literals being replaced was wrong.
- **Promotes to ADR:** no

<!-- Populated by speq-plan after plan-reviewer resolves a blocker, and by speq-implement after code review. -->

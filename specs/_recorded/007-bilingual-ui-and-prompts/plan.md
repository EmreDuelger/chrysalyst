# Plan: bilingual-ui-and-prompts

## Summary

Make chrysalyst speak German and English in both directions: the browser picks a language, remembers the person's override, and renders every label from a dictionary, while the session carries that language to the model as a prompt written in it. Two `live` tests — one per language — prove the model actually asks its opening question in the language the person chose.

## Design

### Context

Roadmap milestone M5 is the topmost open milestone and the mission's bilingual constraint is unmet: `packages/web` holds twelve English literals the § UI copy table replaces, plus `messageOf`'s English stand-in, which stays, and `packages/core` holds one English system prompt as a module constant whose own doc comment names M5 as its externaliser. M5 is sequenced before M7 on purpose — the roadmap's cross-cutting table says every milestone from M7 onward writes prompt templates, so a bilingual prompt discipline that lands after them is seven milestones of retrofit.

Four forces shape the design.

**The language is a property of the transcript, not of the reader.** A question the model already asked in German stays German however the chrome is relabelled afterwards. So the language must be durable, decided once at session creation, and stored beside the turns — which makes this milestone the first growth of `InterviewState` since M3, and the first real test of the roadmap's `schemaVersion` guardrail.

**Sessions written by M3 exist on disk.** `pnpm dev` has been run against this repository, so `~/.chrysalyst/sessions/` holds states with no language field. The mission promises readable sessions. A migration that rejects them is not available.

**A small local model follows an instruction written in the language it should answer in.** Appending "answer in German" to an English prompt is the weaker construction and the one the roadmap's acceptance bar — a `live` test per language — is most likely to fail on. The template is authored in its own language, and states that language explicitly as well.

**`packages/web` cannot import `@chrysalyst/core`.** The supported tags and the fallback are a domain decision that the browser also needs, so it gets restated there. `004-single-question-walking-skeleton` already met this problem for the SSE event contract and answered it with an executable fixture both sides' tests read; this plan reuses that answer rather than inventing a second one.

**Goals**

- One decided language per session, durable, fixed for that session's life.
- Opening prompts authored per language in one table typed so a missing translation fails `tsc`.
- Every static label in `packages/web` served from a dictionary, typed the same way.
- Browser-language detection, a visible language control, and a remembered override.
- A stated fallback for any language outside `{de, en}`, owned by one module per package.
- Sessions written before this milestone still load and still interview.
- One `live` test per language asserting the model's question is in that language.

**Non-Goals**

- No third language and no right-to-left layout; the type is a two-member union and widening it is a later plan's work.
- No translation of failure text. Failure text is not localised in this milestone, whichever side wrote it — the API's words, the transport's, and the web package's own. The view's failure *label* is a label like every other and does follow the chrome's language.
- The eight English failure sentences `packages/web` writes itself therefore stay English. They are listed here so M6 or a later milestone can find them without a sweep. Line numbers are the files as they stand before this milestone.
  - `src/interview/interview-api.ts:66` — `Creating an interview session failed: POST … answered …`
  - `:88` — `The interview question stream for session "…" carried no response body`
  - `:165` — `The interview stream carried an unknown event …`
  - `:176` — `The interview stream carried a malformed event payload: …`
  - `:183` — `The API refused the answer with status …`
  - `:203` — `readString`'s `… carried no string "…": …`, which the creation, answer and event paths all reach
  - `interview-api.ts`, `createSession` — `The session-creation response named an unsupported language "…": the supported languages are de and en`. Task 12 adds it; it is the only English failure sentence this milestone writes
  - `src/interview/InterviewView.tsx:241` — `The interview could not be loaded`
- No `Accept-Language` negotiation on the server. Detection happens once, in the browser, so the rule has one home.
- No per-language date, time, or number formatting. The recorded-at label stays `HH:MM` in both languages.
- No language change for a session that exists. Changing it would mean re-asking a question the person has already answered.
- No translated transcript, export, or spec output; M15 owns the export and writes it in the session's language then.
- No i18n library, no message catalogue format, no extraction tooling.
- No `schemaVersion` bump and no on-disk migration; § Migration argues why.

### Decision

#### Architecture

```
 packages/web (browser)                    packages/server (Node)            packages/core
┌──────────────────────────────┐          ┌────────────────────────┐      ┌─────────────────────┐
│ App  ← owns the chrome's     │          │ routes/                │      │ interview/          │
│      │  language             │          │  interview-routes.ts   │      │  locale.ts          │
│      ├ locale/locale.ts      │          │   POST /interview      │      │   Locale            │
│      │   detectLocale        │          │    reads {locale},     │◀─────│   SUPPORTED_LOCALES │
│      │   rememberLocale      │  HTTP    │    refuses an unknown  │ imp. │   FALLBACK_LOCALE   │
│      │   (localStorage)      │          │    tag, echoes what    │      │   resolveLocale     │
│      ├ locale/strings.ts     │          │    it stored           │      │  prompts.ts         │
│      │   en.ts   de.ts       │          │                        │      │   openingPrompts    │
│      │   UiStrings           │          │  begin(id, locale) ────┼─────▶│    de ─┐            │
│      ├ LanguageControl       │          └────────────────────────┘ port │    en ─┴ system+user│
│      └ InterviewView         │                      ▲                   │  state.ts           │
│          chrome ← app locale │                      │                   │   InterviewState    │
│          question lang ←     │          ~/.chrysalyst/sessions/<id>/    │    { locale, turns }│
│            session locale    │            session.json (schemaVersion 1)└─────────────────────┘
└──────────────────────────────┘

 tests/fixtures/interview-locales.json  — read by core, server and web suites
   { supported, fallback, createSessionField }
```

Two vocabularies, one contract. `packages/core` declares the supported tags, the fallback and the resolution rule; `packages/server` imports them; `packages/web` restates them and the fixture holds the restatement honest. That is exactly the shape `004` settled for the SSE frames, and it costs no package edge.

#### The language a session was created in comes from the server

`POST /interview` answers `{ id, locale }` rather than `{ id }`. The client sends the language it wants and reads back the language the session actually holds. Without the echo, two modules would each own the fallback rule — the route applies it for a body-less request, the browser assumes its own value was taken — and the question region would declare a language the question was not asked in. That is the back-door leakage this plan exists to avoid, reached over one JSON field.

#### The chrome's language and the session's language are different values

The view receives the chrome's language as a prop and re-renders every label when it changes. It captures the chrome's language once, at mount, to create its session, and thereafter uses the language the creation response named. Switching the control after a question arrived relabels the chrome and touches nothing else: no second session, no second inference, no relabelled question. The failure mode this guards against is concrete — putting the language in the question effect's dependency list re-runs the whole effect on every switch, creating an orphan session and a second inference per toggle.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| The language sits in `InterviewState`, not in the envelope | `InterviewState = { locale, turns }` | `SessionStorePort<TState>` is generic and never interprets what it holds. Putting the language in the envelope would teach a storage port a domain word and force every `TState` to carry one |
| One module owns the fallback, per package | `resolveLocale` in `core`, `detectLocale` in `web` | The rule is applied at three boundaries — a loaded state, a request body, a browser list. A single owner each side is what keeps a fourth caller from inventing a fourth rule |
| A stored language is untrusted input | `loadInterview` resolves it once, at the module's single load boundary | The store returns `state` exactly as `JSON.parse` produced it, so the declared type is a claim about new data only. Resolving inside one private load — rather than asking each of the four call sites to remember a `resolveLocale` wrapper the compiler cannot enforce — is what makes a caller that reads `state.locale` directly fail a scenario instead of a review. This is the same hazard as the `Date`-versus-string rule the state module already carries |
| Templates keyed by a closed union, not looked up by string | `Readonly<Record<Locale, OpeningPrompt>>` | A missing translation is a compile error rather than an `undefined` at run time. This is what makes the roadmap's "every prompt-bearing milestone writes both languages" a rule the toolchain enforces |
| Prompts side by side, labels file per language | `prompts.ts` holds both; `locale/en.ts` and `locale/de.ts` are separate | A prompt is a multi-sentence instruction whose meaning can drift between languages, so a reviewer must see both in one diff. A label table is a flat list of short strings where per-language files read better, and the shared `UiStrings` type catches an omission either way |
| Absence and wrongness answered differently | `POST /interview`: no body → fallback; unknown tag → `400` | A request that named nothing is creating a default session; a request that named a language it cannot have is a caller error. Downgrading it silently would interview a person in the wrong language with no signal. `SessionStorePort.load` already draws this line between `undefined` and a corrupt record |
| The session's language arrives from the server | `createSession` resolves `{ id, locale }` | One authority for what a session holds, and the value the question region declares to a screen reader |
| Test seams as props, defaults for the browser | `App({ api?, locale?, languages?, storage? })`, `detectLocale(languages?, storage?)` | The same seam `interview-api.ts` already uses for `fetch`. The shell takes both language seams because they answer different questions: `locale` pins the app's language and skips detection, while `languages` drives detection with a browser list the test chose — the case `locale` cannot express, and the one the `Storage that cannot be read or written leaves the app usable` scenario needs beside a throwing storage stub. No test touches the network, the real `navigator`, or the real `localStorage` |
| The contract restated in `web` is held by a fixture | `tests/fixtures/interview-locales.json` | The tags, the fallback and the request field name live in three packages. The file makes a rename on any side fail a run, the way the SSE fixture already does |

#### Key interfaces

```ts
// packages/core/src/interview/locale.ts                                  NEW
export type Locale = 'de' | 'en';
export const SUPPORTED_LOCALES: readonly Locale[];         // ['de', 'en']
export const FALLBACK_LOCALE: Locale;                      // 'en'
export function isLocale(candidate: unknown): candidate is Locale;
/** The stored, submitted or reported value as a language, falling back when it is neither. */
export function resolveLocale(candidate: unknown): Locale;

// packages/core/src/interview/prompts.ts                                 NEW
export interface OpeningPrompt {
  readonly system: string;
  readonly user: string;
}
export const openingPrompts: Readonly<Record<Locale, OpeningPrompt>>;

// packages/core/src/interview/state.ts                                   CHANGED
export interface InterviewState {
  readonly locale: Locale;
  readonly turns: readonly Turn[];
}

// packages/core/src/interview/single-turn-interview.ts                   CHANGED
begin(id: SessionId, locale: Locale): Promise<void>;
// openingQuestion and recordAnswer keep their signatures
/** Module-private, and the only call to `deps.sessions.load` in this file.
 *  Answers the stored session with `state.locale` already resolved, so no
 *  reader below it ever sees the raw parsed value. Every save derived from a
 *  loaded session therefore writes a resolved tag. */
function loadInterview(
  id: SessionId,
): Promise<StoredSession<InterviewState> | undefined>;

// packages/web/src/locale/locale.ts                                      NEW
export type Locale = 'de' | 'en';
export const SUPPORTED_LOCALES: readonly Locale[];
export const FALLBACK_LOCALE: Locale;
export const LOCALE_STORAGE_KEY = 'chrysalyst.locale';
export const LOCALE_ENDONYMS: Readonly<Record<Locale, string>>;  // Deutsch / English
export function isLocale(candidate: unknown): candidate is Locale;
export function detectLocale(
  languages?: readonly string[],
  storage?: Storage,
): Locale;
export function rememberLocale(locale: Locale, storage?: Storage): void;

// packages/web/src/locale/strings.ts                                     NEW
export interface UiStrings { /* the § UI copy table's thirteen members */ }
export const uiStrings: Readonly<Record<Locale, UiStrings>>;

// packages/web/src/interview/interview-api.ts                            CHANGED
export interface CreatedSession {
  readonly id: string;
  readonly locale: Locale;
}
createSession: (locale: Locale) => Promise<CreatedSession>;

// packages/web/src/App.tsx                                               CHANGED
export interface AppProps {
  readonly api?: InterviewApi;
  readonly locale?: Locale;                // test seam; detected when absent
  readonly languages?: readonly string[];  // test seam; `navigator.languages` when absent
  readonly storage?: Storage;              // test seam; the browser's own when absent
}

// packages/web/src/interview/InterviewView.tsx                           CHANGED
export interface InterviewViewProps {
  readonly api: InterviewApi;
  readonly locale: Locale;     // the chrome's language, live
}
```

`detectLocale` reads the remembered value first, ignores it when it is not a supported tag, then walks the browser's list taking each entry's base subtag — `de-AT` is `de` — and answers the first supported one, or the fallback. Reading storage and writing it are each wrapped, because accessing `localStorage` throws outright in a browser with site data blocked.

#### The prompt templates

Each template is authored text, not a translation performed at run time. The tests assert intent — one system message instructing a single opening question, in the session's language — never the exact bytes, so § Live-tier risk's ladder can strengthen the wording without editing a test. Drafts:

| Language | System | User |
|---|---|---|
| `en` | Today's constant, plus a closing sentence naming English as the language to write in | `Begin the interview.` |
| `de` | `Du bist chrysalyst und führst ein Interview, das aus einer vagen Produktidee eine klare Spezifikation macht. Stelle genau eine Eröffnungsfrage, die die Person einlädt, das Produkt zu beschreiben, das sie im Sinn hat, und das Problem, das es löst. Antworte ausschließlich mit dieser einen Frage: keine Begrüßung, keine Einleitung, keine Erklärung, keine Begründung und keine zweite Frage. Schreibe auf Deutsch.` | `Beginne das Interview.` |

#### UI copy

| Member | `en` | `de` |
|---|---|---|
| `interviewRegion` | `Interview` | `Interview` |
| `topbarMeta` | `Interview · 01` | `Interview · 01` |
| `questionKicker` | `The question` | `Die Frage` |
| `questionPlaceholder` | `Preparing the first question` | `Die erste Frage wird vorbereitet` |
| `reachingModel` | `Reaching the model…` | `Verbindung zum Modell …` |
| `streamingAlternative` | `the question is still being written` | `die Frage wird noch geschrieben` |
| `answerLabel` | `Your answer` | `Ihre Antwort` |
| `roundHint` | `One question this round.` | `Eine Frage in dieser Runde.` |
| `recording` | `Recording…` | `Wird gespeichert …` |
| `submit` | `Record answer` | `Antwort speichern` |
| `recordedAt(time)` | `Recorded · {time} · saved to this session` | `Gespeichert · {time} · in dieser Sitzung` |
| `failureLabel` | `The question stopped` | `Die Frage ist abgebrochen` |
| `languageControl` | `Language` | `Sprache` |

`chrysalyst` is a proper noun and is never translated. `Deutsch` and `English` are endonyms: each language names itself the same way whichever chrome is showing, which is the accessibility convention for a language switcher and the reason they live in `locale.ts` rather than in a dictionary.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| `en` is the fallback for a language outside `{de, en}` | `de`, on the grounds that the repository's specs, roadmap and maintainer are German | The fallback serves a browser reporting neither language — a French or Japanese visitor, not a German one, who is detected correctly either way. English is the wider second language and is already the language of the code, the prompts and the adapter's failure messages, so the fallback session is internally consistent. The choice lives in one constant per package and is one edit to reverse |
| The language is stored inside `InterviewState`, and `schemaVersion` stays `1` | Bumping `schemaVersion` to `2`; adding the language to the envelope; making the field optional in the type | `schemaVersion` versions the envelope, which is unchanged — `002`'s ADR is explicit, and the store's version check refuses anything it does not recognise, so a bump would make every M3 session on disk unreadable and break the mission's promise. Putting the language in the envelope would teach `SessionStorePort<TState>` a domain word. An optional field would spread a `undefined` case through every reader forever. Resolving an untrusted stored value inside the module's single load boundary keeps the type honest for new data and old data alike, and keeps the rule off every individual reader |
| A request naming an unsupported language is refused with `400` | Falling back to the default, as a body-less request does | The two cases mean different things. Nothing named is a default; something wrong named is a caller that believes it got what it asked for. A person interviewed in English after asking for German would have no signal at all, and the answer route already refuses a body it cannot honour |
| The create route parses its body by hand, as the answer route does | Adding `@hono/zod-validator` so `hc` types the request body | The route style is already established two routes over, `zod` is already the parser, and the typed client cannot type an SSE payload anyway — `004`'s § Consequences argued that at length. A middleware would buy one typed body and add a dependency |
| The creation response echoes the language | Answering `{ id }` and letting the client assume its own value was accepted | The fallback for a body-less request is specified and therefore reachable — by `curl`, by a test, by M17 restoring a session. One field removes the divergence and makes the `lang` the question region declares provably the language it was asked in, which is WCAG 3.1.2 rather than a nicety |
| Templates are authored per language, each also naming its language | One English template with a per-language "answer in X" line appended | The acceptance bar is that a small local model actually asks in the right language. An instruction written in the target language is the stronger prompt for a model of that size, and the explicit directive costs one sentence. Both halves are kept because the failure this milestone must not have is a German-speaking person being interviewed in English |
| The string dictionary is a typed record, indexed directly | A `t('key')` helper over a flat map, as the interview answer sketched | A `t` call with a string key returns `string` for a key that does not exist, so a missing translation ships and renders a key in a browser. `uiStrings[locale].submit` makes the same mistake a `tsc` failure. This keeps the interview's decision — plain TS modules, no dependency — and removes the one class of bug hand-rolled dictionaries are known for |
| The shell owns the language; the view receives it | The view owning it, or a React context | Both the masthead and the view are written in it, so an owner below both cannot serve both. A context for one value read by two components two levels apart is machinery without a beneficiary; § Design Philosophy calls that a shallow module |
| The view's failure label is localised; failure text is not localised in this milestone | Leaving the label English too, which is how the clarifying interview's parenthetical was first read | The clarifying interview excluded error and failure *messages* — the text that surfaces raw model or server failure. `The question stopped` is not one: it is a heading the view shows above that text, in the same register as `The question`, so it follows the chrome like every other label, and leaving it English in a German column would be a visible inconsistency with no reason behind it. The message underneath stays untranslated whichever side wrote it — the API's words, the transport's, and the eight English sentences `packages/web` writes itself, which § Non-Goals lists by file and line. The boundary is scope, not authorship, and it is stated once in the `interview/interview-view` background so no later milestone has to guess |

## Design Direction

**Status: the impeccable subphase has not run. Task 17 is blocked until it has.** The language control is the first new UI control since M3, so `CLAUDE.md`'s standard route requires the subphase and an approved comp before it is styled. Task 13 renders a working, accessible, unstyled control that the § Verification scenarios assert, and task 17 restyles what task 13 already renders without introducing state or markup a scenario does not already name.

**Deferral rule.** Tasks 1-16 proceed whether or not the comp exists. Task 17 and the § Manual Testing row `The impeccable subphase's approved comp, then the styled control in the browser at 1280px and 400px` are deferred together until the subphase approves one: neither is attempted without it, and neither is dropped. Task 18 runs the checklist with that one row carved out and is complete without it; when the comp lands, task 17 runs and that row is exercised then. `/speq:implement` MUST NOT stop the plan at task 16 on account of the missing comp, and MUST NOT style the control from the existing system in its place.

The brief the subphase starts from, derived from the shipped system in `packages/web/DESIGN.md` and the recorded contract in `packages/web/.impeccable/surfaces/packages-web-src-interview-interviewview-tsx.md`:

- **Surface** — the topbar of `packages/web/src/App.tsx`, whose right-hand side currently holds the tracked metadata line `INTERVIEW · 01`. Mode stays **Operate**.
- **World** — unchanged: editorial minimalism, the existing five tokens, no new token, no new face, radius ≤ 2px, no card and no shadow.
- **Register** — the control is metadata, not an action. It belongs in the micro-label register (`--label-size`, `--label-tracking`, uppercase) rather than competing with the submit control, which is the page's only accent-coloured action.
- **Must communicate** — which language is active now, and that choosing the other one relabels the page rather than re-asking the question on screen. The second half is the subphase's hardest problem and the reason a comp is needed rather than a guess.
- **Must satisfy** — an accessible name; both options reachable and operable from the keyboard; visible focus; contrast ≥ 4.5:1; the endonyms `Deutsch` and `English` shown in their own language; no motion, because the topbar has none.
- **Open questions for the subphase** — whether the control and `INTERVIEW · 01` share the topbar row at 400px width or the metadata line yields; and whether the control reads as two toggles or one labelled pair.

## Features

| Feature | Status | Spec |
|---------|--------|------|
| single-question-interview | CHANGED | `interview/single-question-interview/spec.md` |
| interview-http-api | CHANGED | `interview/interview-http-api/spec.md` |
| interview-view | CHANGED | `interview/interview-view/spec.md` |
| web-shell | CHANGED | `platform/web-shell/spec.md` |

## Impact

A German-speaking person opens chrysalyst and is interviewed in German. The browser's reported language decides that on a first visit, a control in the masthead overrides it, and the override survives a reload. The mission's bilingual constraint is met for the interview; the export half of it belongs to M15.

Every session created from this milestone on records the language it was held in. `session.json` gains `"locale"` under `state`, beside `turns`.

**Sessions written by M3 keep working.** `schemaVersion` stays `1`, the envelope is untouched, and a stored state with no language is interviewed in English rather than refused. A person who ran `pnpm dev` before this milestone loses nothing.

`POST /interview` gains an optional JSON body and a second response field. A body-less `POST` still answers `201` and still creates a session, so every § Manual Testing row `004` recorded still works; `curl` callers see `{"id":…,"locale":"en"}` where they saw `{"id":…}`. A body naming an unsupported tag is the one new refusal.

Three internal signatures change and no code outside this repository calls any of them: `SingleTurnInterview.begin` takes the language, `InterviewApi.createSession` takes the language and resolves `{ id, locale }`, and `InterviewView` takes a `locale` prop.

Switching the language mid-interview relabels the page and leaves the question in the language it was asked in. This is deliberate and visible: until M17 gives a person a way to start a second session, a new page load is how a new interview begins. The § Design Direction brief names communicating that as the control's job.

`/speq:record` MUST make two edits to `specs/roadmap.md`. It MUST mark M5 `✅ erledigt (bilingual-ui-and-prompts)` in § Überblick. It MUST amend the `On-Disk-Session-Schema` guardrail row, whose `TState` growth path reads `M2 → M8 → M9 → M14`, to include M5 — this milestone is a growth point the roadmap did not anticipate, and the row is the record future planners read before touching `TState`.

## Requirements

| Requirement | Details |
|-------------|---------|
| One language per session, fixed | The language is decided when the session is created and never changes. Beginning an existing session again in another language changes nothing |
| Old sessions stay readable | A stored state carrying no language, or a language outside the supported set, loads and is interviewed in the fallback. Loading refuses no session and rewrites no file. The next save that session's own progress causes — an asked question or a recorded answer — writes the resolved fallback tag into its state, because every save derives from the normalised session `loadInterview` returned |
| Every label comes from a dictionary | No `packages/web` component holds a user-facing string literal, except the product name and the endonyms. A dictionary missing an entry, or a language, fails `tsc` |
| Every prompt exists in both languages | The opening prompt table is typed over `Locale`. A template missing for a language fails `tsc`, which is how the roadmap's rule for M7 onward is enforced |
| Failure text is not localised in this milestone | Every static label is translated, the view's failure label included. The message under that label is rendered character for character whichever side wrote it — the API's words, the transport's, and the eight English sentences `packages/web` writes itself, which § Non-Goals lists by file and line |
| Declared language | `document.documentElement.lang` carries the chrome's language; the question region carries the session's. The two differ whenever the person switched after the question arrived |
| One vocabulary | The supported tags, the fallback, and the creation field name agree across `core`, `server` and `web`, asserted against `tests/fixtures/interview-locales.json` in each package's own suite |
| Degraded storage is not a failure | Reading or writing the remembered choice never throws out of the shell. A browser with site data blocked starts on the browser's language and still switches |
| Loopback only, no new dependency | No package gains a dependency. The lockfile is unchanged |

### Live-tier risk: proving a language without a flaky assertion

The roadmap's bar is one `live` test per language showing the model asks in that language. Asserting a natural language from one sentence is the one place this plan can flake.

The assertion is a function-word score, not a pattern match. Score the question against a small German list — `der`, `die`, `das`, `und`, `welche`, `welches`, `für`, `Ihr`, `Ihre`, `Sie`, `möchten`, `beschreiben` — and a small English one — `the`, `and`, `what`, `which`, `your`, `you`, `does`, `do`, `describe`, `solve`, `it`.

Neither list holds a word of the other language, which is the rule the lists exist under. `problem` is excluded because German writes `Problem` and § The prompt templates' German system message asks for exactly that, so a correct German question would score an English hit. `was` is excluded for the mirror reason: it is also an English verb. Matching is case-insensitive and whole-word, and an entry matches only the word as it is listed — `Sie` and `sie` both count, `solve` does not match `solves`. A score is the number of **distinct** list entries the question contains, not the number of occurrences, so a German question using `das` four times scores one. The test asserts the session's language scores at least three and strictly more than the other. Both lists, the matching rule and the threshold belong in the live test file, not in shipped code.

A failing German case is a finding about the deliverable rather than about the test. The ladder, in order: strengthen the German system template's explicit language directive; then move the directive to the user message, where a small model weights it more heavily; then, only if `qwen3:8b` genuinely cannot hold German for one question, record that in the verification report as a model constraint with the raw question printed beside it. Weakening the threshold is not on the ladder.

## Dependencies

No package is added and the lockfile does not change. No i18n library enters the workspace, which is the clarifying interview's decision and the reason `packages/web` still declares only `react` and `react-dom`.

The live tier needs a running Ollama holding `qwen3:8b`, invoked as
`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test`.
This plan adds two inferences to that tier — one per language — on top of the one `004` recorded. The existing file's 120 s suite timeout covers them; the new cases get their own.

Task 17 depends on a human: the impeccable subphase and an approved comp. § Design Direction states the brief and carries the deferral rule — tasks 1-16 proceed without it, task 17 and the § Manual Testing comp row are deferred together until the comp exists, and task 18 runs the checklist with that one row carved out.

## Migration

| Current | New |
|---------|-----|
| `InterviewState = { turns }` | `InterviewState = { locale, turns }`; every load of a session passes through `loadInterview`, which resolves the language once |
| `OPENING_SYSTEM_PROMPT` and `OPENING_USER_MESSAGE`, module constants of `single-turn-interview.ts` | `openingPrompts`, a table in `interview/prompts.ts` keyed by `Locale` |
| `begin(id)` | `begin(id, locale)` |
| `POST /interview` takes no body and answers `{ id }` | Takes an optional `{ locale }` body and answers `{ id, locale }` |
| `createSession(fetchImpl?)` resolves the identifier | `createSession(locale, fetchImpl?)` resolves `{ id, locale }` |
| `InterviewView({ api })` | `InterviewView({ api, locale })` |
| Twelve English literals inline in `InterviewView.tsx` and `App.tsx`, the § UI copy table's members other than `languageControl` | `uiStrings[locale]`, from `packages/web/src/locale/` |

**No data migrates and loading rewrites no file.** `schemaVersion` stays `1` because the envelope is unchanged, and `002-add-ollama-llm-adapter`'s ADR `schemaversion-versions-the-on-disk-envelope` holds. A session written by M3 carries no `locale` under `state`; `loadInterview` answers the fallback for it, so it loads, renders its transcript, and can still be answered. Bumping the version instead would make the store refuse it outright — its version check rejects anything it does not recognise — which is the outcome this plan is specifically avoiding.

**The first save that session's own progress causes writes `"locale": "en"` into `state`.** Two of the three saves in `single-turn-interview.ts` rebuild the state from a loaded session — the asked turn in `endProduction` and the answered turn in `recordAnswer` — and the session they rebuild from is the one `loadInterview` normalised, so the resolved tag goes to disk with the turn. That is a write the person's next action causes, not a migration pass: nothing sweeps the session directory, nothing rewrites a session no one touches, and a session that is only read is left byte-identical. Task 5's fallback test asserts both halves against a store double — `recordAnswer` on a locale-less session saves the fallback tag, requesting the question alone saves nothing — and the § Manual Testing row that answers a copied M3-era session and then `cat`s its `session.json` confirms the same behaviour against a real file.

## Implementation Tasks

Most tasks below are red-green pairs: write the failing tests, run them red, then write the smallest implementation that turns them green. Tests a pair leaves green MUST stay green through every later pair without being edited, except where a task says otherwise.

1. **Shared language fixture.** Create `tests/fixtures/interview-locales.json` holding `{ "supported": ["de", "en"], "fallback": "en", "createSessionField": "locale" }`. Extend `tests/fixtures/README.md` with a section naming `interview/single-question-interview` and `platform/web-shell` as the contracts it encodes, listing its three readers — core's language test, the server's route test, the web package's language test — and stating that a renamed tag, a changed fallback or a renamed request field fails a run rather than only a browser. Follow the existing section's structure; it is the file's established form.
2. **Red — the domain's language vocabulary.** Write `packages/core/src/interview/locale.test.ts`: `SUPPORTED_LOCALES` and `FALLBACK_LOCALE` equal the fixture's arrays and value, read with `node:fs` from a path resolved against the repository root exactly as `sse-frames.test.ts` resolves its own; `isLocale` accepts each supported tag and rejects `'fr'`, `'DE'`, `''`, `undefined`, `null`, `42` and an object; `resolveLocale` answers the tag for each supported value and `FALLBACK_LOCALE` for each of those rejects. Add `packages/core/src/interview/locale.test-d.ts` asserting under `@ts-expect-error` that a `Locale` cannot be assigned a tag outside the union.
3. **Green — `locale.ts`.** Create `packages/core/src/interview/locale.ts` with the § Key interfaces declarations. `resolveLocale` takes `unknown` rather than `string | undefined`, because its callers hand it a value parsed from JSON and a value parsed from a request body, neither of which is typed. Its doc comment states why an untrusted value reaches it, names the fallback, and says the choice is one constant to reverse.
4. **Red then green — the bilingual opening prompts.** Write `packages/core/src/interview/prompts.test.ts` and `prompts.ts` together. The tests assert that a template exists for every entry of `SUPPORTED_LOCALES`, that no two languages share a system or user message, that neither message is blank, and that each system message contains its own language's name — the property that makes the explicit directive testable without pinning the wording. Add `prompts.test-d.ts` whose `@ts-expect-error` covers a table literal missing one language, which is the `Record<Locale, …>` guard the roadmap's bilingual rule rests on. Author both templates per § The prompt templates; the English one is today's constant plus its language sentence, so the diff shows exactly what the German one has to match.
5. **Red — the interview's language scenarios.** Extend `packages/core/src/interview/state.test.ts` and `state.test-d.ts` with the changed JSON round trip — the language survives as the tag it was written with — and extend `packages/core/src/interview/single-turn-interview.test.ts` with the delta's five scenarios. The existing scenarios stay, with their fixtures given a language; do not rewrite their assertions. The two new ones need doubles the file does not have yet: a stored state whose `locale` key is absent, and one whose `locale` holds `'fr'`, both constructed by casting at the double rather than by widening `InterviewState`, and both holding an asked turn that is not yet answered. Assert the conversation against `openingPrompts[locale]` rather than against literal text, so § Live-tier risk's ladder can reword a template without touching this file.
   The fallback test asserts the write as well as the read, because the scenario's write clause is a MUST and a manual row is not evidence for one. For each of the two doubles, call `recordAnswer`, take the session the store double was handed, and assert its `state.locale` is `FALLBACK_LOCALE` while its turns carry the recorded answer. Assert in the same test that requesting the question alone hands the store no save at all, which is the other half of the clause: loading normalises, only a save persists.
6. **Green — the language in the state and the interview.** Add `locale` to `InterviewState`, give `begin` its second parameter, and replace `openingConversation()` with one that takes a language and reads `openingPrompts`. Add the module-private `loadInterview(id)` of § Key interfaces and make it the **only** call to `deps.sessions.load` in the file: it loads, and answers the session with `state.locale` replaced by `resolveLocale(state.locale)`. The four existing load sites — `streamQuestion` (line 304), `begin` (346), `openingQuestion` (360) and `recordAnswer` (372) — all call it instead, so no reader below the load boundary ever sees the raw parsed value and a reader added by M8 or M17 inherits the rule rather than remembering it. The wrapping is needed because the store returns `state` exactly as `JSON.parse` produced it, and the declared type is a claim about states this milestone wrote, not about the ones already on disk.
   The write rule follows from the read rule and MUST be stated rather than discovered: the two saves that rebuild state from a loaded session — `endProduction` (line 176) and `recordAnswer` (line 392) — construct `{ locale: session.state.locale, turns: … }` from the **normalised** session, so a session that carried no language or an unsupported one gains the resolved fallback tag on its next save. That is the specified behaviour, not an accident; do not spread the loaded state to dodge it, and do not strip the field back out. `begin`'s save is the third and constructs a fresh state from its `locale` parameter. `begin` keeps loading first, so an existing session's language is left alone exactly as its turns are. Update `transcript.ts`'s fixtures if its tests construct an `InterviewState` literal, but add nothing to the rendered Markdown — the transcript's shape is M15's to change. Extend `packages/core/src/interview/index.ts` with the two new modules and confirm `packages/core/src/index.test.ts` still passes untouched. [expert]
7. **Red — the create route's language.** Extend `packages/server/src/routes/interview-routes.test.ts` with the three `interview/interview-http-api` delta scenarios, reading the request field name and the fallback from `tests/fixtures/interview-locales.json`. Write the body-less case as `it.each` over the three forms the scenario names — no body, a non-JSON body, and a JSON object with no `locale` — and the refusal as `it.each` over an unsupported tag and a non-string value. Assert the refusal leaves the store empty by listing the temp directory. Every existing route test stays green; the ones that create a session now read `id` out of a response body that also carries `locale`.
   One fixture outside this file also needs the language: `packages/server/src/composition.test.ts`'s `askedSession()` helper returns a `StoredSession<InterviewState>` whose state literal carries only `turns`, and task 6 makes `locale` required, so `tsc -p packages/server/tsconfig.json` fails on it. Add the language to that literal and change no assertion — the test is about what the composition root assembles, not about languages. Vitest strips types at run time, so `pnpm --filter @chrysalyst/server test` would stay green and hide this until task 18's `pnpm typecheck`.
8. **Green — the create route.** Parse the body with `jsonBody` and a `zod` object exactly as the answer route does: a body that is not a JSON object, or one carrying no `locale`, means no language was named and the route begins the session in `FALLBACK_LOCALE`; a body whose `locale` is present but is not a supported tag answers `400` with a `message` naming the supported tags and begins nothing. `POST /interview` then answers `{ id, locale }`. Import `FALLBACK_LOCALE` and `isLocale` from `@chrysalyst/core` rather than restating either. Leave `composition.ts` and `app.ts` untouched — neither names a language.
9. **Red then green — the browser's language vocabulary.** Write `packages/web/src/locale/locale.test.ts` and `locale.ts` together against the `platform/web-shell` detection, remembering and storage scenarios, plus the fixture-agreement scenario. `detectLocale` reads the remembered value first and ignores it unless `isLocale` accepts it, then walks the supplied language list taking each entry's base subtag before the first `-`, answers the first supported one, and otherwise answers `FALLBACK_LOCALE`; an empty list answers the fallback. `rememberLocale` writes under `LOCALE_STORAGE_KEY`. Both wrap the storage access itself, not only the operation, because reading the `localStorage` property throws in a browser with site data blocked — the tests pass a stub whose getter throws and a stub whose `setItem` throws, and assert neither call throws. The suite asserts `SUPPORTED_LOCALES`, `FALLBACK_LOCALE` and the creation field name against the fixture.
10. **Enable the web package's type-test runner.** `packages/web/vitest.config.ts` declares `test.environment` and `test.coverage` and no `test.typecheck`, so `pnpm --filter @chrysalyst/web test` collects no `*.test-d.ts` at all — Vitest's default `include` does not match them, and `typecheck.include` is consulted only once typecheck is enabled. Add `typecheck: { enabled: true }` to `packages/web/vitest.config.ts`, mirroring `packages/core/vitest.config.ts`, and exclude `**/*.test-d.ts` from coverage there as core already does. The task ends there, with `pnpm --filter @chrysalyst/web test` green. It cannot verify itself: nothing in the package writes a `*.test-d.ts` yet, so task 11 — which owns the first one — closes the loop. A green run over a type test that was never collected is the defect this task exists to close, and it would otherwise swallow every `*.test-d.ts` a later web milestone writes.
11. **Red then green — the string dictionaries.** Write `packages/web/src/locale/strings.ts` declaring `UiStrings` with the § UI copy table's thirteen members, `en.ts` and `de.ts` each satisfying it, and `uiStrings` as `Readonly<Record<Locale, UiStrings>>`. `recordedAt` is a function of the time label, which is the one entry that interpolates. Write `strings.test.ts` asserting every member is present and non-blank for both languages and that the two differ wherever the table says they differ, and `strings.test-d.ts` covering the two `@ts-expect-error` cases the `A string dictionary missing an entry fails the type check` scenario names — a dictionary missing a member, and a record missing a language.
    Close task 10's verification here, because this task owns both files it needs: delete one member from `en.ts`, run `pnpm --filter @chrysalyst/web test`, confirm it goes red **on the type test** rather than only on `strings.test.ts`, then restore the member and confirm the run is green again. A run that stays green, or one that names no type test, means task 10's config change did not take and the runner is still off.
12. **Red then green — the API client's language.** Extend `packages/web/src/interview/interview-api.test.ts` and change `interview-api.ts`: `createSession(locale, fetchImpl?)` posts `{ locale }` as a JSON body with a `content-type` header and resolves `{ id, locale }`, reading both fields through the existing `readString` and rejecting a response whose `locale` is absent or unsupported. The two rejections have different owners and different words. An absent or non-string `locale` is already `readString`'s case and keeps its existing message, `` `the session-creation response carried no string "locale": …` `` — the seventh entry of § Non-Goals' enumeration, reached here rather than added here. A `locale` that is a string outside the supported set is a new throw, and its message is `` `The session-creation response named an unsupported language "${value}": the supported languages are de and en` `` — the eighth entry, and the only English failure sentence this milestone adds. Name the supported tags from `SUPPORTED_LOCALES` rather than typing them twice. Update the doc comment's wire-shape inventory. `browserInterviewApi.createSession` passes the language through.
13. **Red then green — the shell's language.** Write the `platform/web-shell` shell-level scenarios into `packages/web/src/App.test.tsx` and change `App.tsx`: it holds the app's language in state initialised from `locale ?? detectLocale(languages, storage)`, writes `document.documentElement.lang` in an effect whenever it changes, renders the language control, calls `rememberLocale` on a choice, and passes the language to `InterviewView`. `languages` is the § Key interfaces seam and defaults to `navigator.languages` inside `detectLocale`, so a test drives detection by naming a browser list rather than by writing the real `navigator` — `Storage that cannot be read or written leaves the app usable` is the scenario that needs it, because it asserts what the browser reported while storage throws, which the `locale` prop short-circuits. The control is a real control with an accessible name and keyboard-operable options, carrying the endonyms and reporting which language is active; style nothing — task 17 owns the visual result. The topbar's metadata line comes from the dictionary. The heading stays `chrysalyst` untranslated, and the existing heading assertion stays green untouched. Leave `packages/web/index.html`'s `<html lang="en">` as it is: it is the pre-mount default, correct for the seconds before React runs and before any language has been decided, and the effect owns the value from mount onward. A German visitor therefore sees an English-declared document until the shell mounts, which the § Manual Testing `pnpm dev` row observes rather than treats as a defect.
14. **Red then green — the view's two languages.** Extend `packages/web/src/interview/InterviewView.test.tsx` with the four new `interview/interview-view` scenarios and the changed failure one, then change `InterviewView.tsx`. Every existing test stays, with its English literals replaced by `uiStrings.en` members so the dictionary is the single source and a copy edit does not break a test. Replace the `STREAMING_ALTERNATIVE` constant with the dictionary member and update its import in the test file. The component takes the chrome's language as a prop and renders every label from it; it captures the mount-time language once, with a ref, for `createSession`, and `locale` MUST NOT enter the question effect's dependency list — a language change there re-runs the effect, creates an orphan session and starts a second inference, which the `Switching the chrome's language leaves the running interview alone` scenario is written to catch. The question region carries `lang` from the language the creation response named. The failure label comes from the dictionary; the failure message is rendered exactly as received and `messageOf`'s stand-in for a cause with no message stays English, because it replaces a failure's own words. [expert]
15. **Live tier — one language per test.** Extend `packages/server/src/routes/interview-routes.live.test.ts` with an `it.each` over the two languages that creates a session naming the language, reads the question to its end, and asserts § Live-tier risk's function-word score: at least three distinct hits for the session's language and strictly more than for the other. Print the language and the question so the verification report can carry both. Give each case its own timeout rather than widening the suite's. The existing feasibility test stays as it is, creating its session with no body, which also proves the fallback path against a real server.
16. **Workspace sweep for stray copy.** Grep `packages/web/src` for user-facing string literals in JSX and in `aria-` attributes, and confirm the only survivors are `chrysalyst`, the endonyms, and the strings the dictionaries hold. Fix what the sweep finds. Add no test; this is the § Requirements row `Every label comes from a dictionary` checked by hand, and § Verification lists it as a manual row.
17. **Approved styling of the language control.** Deferred until the impeccable subphase approves a comp per § Design Direction; it is not attempted before that and not dropped. Then style the control against the comp in `App.module.css` using the existing token layer and adding no token. Every test task 13 left green MUST stay green without an edit; a test that needs editing means the comp changed behaviour, which belongs in a spec delta rather than in a style task. Record the approved comp's path here and in `packages/web/DESIGN.md`.
18. Run the full § Verification checklist end to end, including every § Manual Testing row and the live row, and fix what it surfaces — **excluding the comp row `The impeccable subphase's approved comp, then the styled control in the browser at 1280px and 400px` while task 17 is deferred.** That row is the one piece of verification a missing comp withholds; every other row runs and must pass. Record in the verification report that the row is deferred with task 17 rather than passed.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 |
| Group B | 2 → 3 → 4 → 5 → 6 (one ordered stream in `packages/core`) |
| Group C | 7 → 8 (one ordered stream in `packages/server`) |
| Group D | 9 → 10 → 11 → 12 → 13 → 14 (one ordered stream in `packages/web`) |
| Group E | 15 |
| Group F | 16 |
| Group G | 17 (deferred until the comp exists — § Design Direction) |
| Group H | 18 |

Sequential dependencies:

- Group A → Groups B, C and D — all three read `tests/fixtures/interview-locales.json`, so the fixture exists before any stream starts.
- Group B → Group C — the create route imports `FALLBACK_LOCALE` and `isLocale` from `@chrysalyst/core` and calls `begin(id, locale)`.
- Group C → Group E — the live test drives the real create route with a language body.
- Group D → Groups F and G — the sweep and the styling both act on the components Group D changed.
- Groups A through F → Group H. Group G is **not** a predecessor of Group H: § Design Direction's deferral rule has task 18 run the checklist with the comp row carved out, so a missing comp holds back task 17 and that one row and nothing else.

Groups B and D share no file and neither imports the other: `packages/web` declares no workspace package, so the browser's language module can be built before the domain's. Group D's internal order is load-bearing — the type-test runner is enabled before the first `*.test-d.ts` is written, the dictionaries exist before the components that read them, and the API client's new signature exists before the view that calls it.

Two tasks carry `[expert]` and sixteen do not. Task 6 changes a type every existing test constructs and, in the same change, must funnel every load of a session through `loadInterview` rather than trusting the field's declared type at four call sites — the JSON-round-trip hazard this codebase has already been bitten by once, and the one place the old sessions on disk are either kept working or silently broken. Task 14 owns the two-language distinction inside one component and the effect-dependency trap that turns a language switch into an orphan session and a second inference. Tasks 2, 3, 4, 5, 7, 8, 9, 11, 12 and 13 are a closed union, a table of authored text, assertions against an existing convention, a `zod` object mirroring the route two doors down, a subtag split, and a React state value with a control — each with a precedent in this repository to copy. Tasks 1, 10, 15, 16, 17 and 18 are a fixture, a config line copied from `packages/core`, a scripted live case, a grep, a stylesheet against an approved comp, and the checklist.

Unlike the rest of this plan, task 17 has a human step: § Design Direction's impeccable subphase must approve a comp before it runs.

## Dead Code Removal

| Type | Location | Reason |
|------|----------|--------|
| Constant | `packages/core/src/interview/single-turn-interview.ts` — `OPENING_SYSTEM_PROMPT` | Replaced by `openingPrompts.en.system`; an English-only constant cannot serve two languages |
| Constant | `packages/core/src/interview/single-turn-interview.ts` — `OPENING_USER_MESSAGE` | Replaced by `openingPrompts.en.user` |
| Constant | `packages/web/src/interview/InterviewView.tsx` — `STREAMING_ALTERNATIVE` | Replaced by `uiStrings[locale].streamingAlternative`; its import in `InterviewView.test.tsx` goes with it |
| Doc comment | `packages/core/src/interview/single-turn-interview.ts` — the paragraph naming M5 as the milestone that externalises the prompts | This is that milestone; the comment now describes a table, not a constant |
| Inline literals | `packages/web/src/interview/InterviewView.tsx` and `App.tsx` — the twelve user-facing strings the § UI copy table replaces, which is every member of it but `languageControl`, whose control does not exist yet | Replaced by dictionary members. Task 16 sweeps for survivors |

Nothing else is removed. The eight English failure sentences § Non-Goals lists by file and line — seven in `interview-api.ts`, the eighth `messageOf`'s stand-in in `InterviewView.tsx:241` — are deliberate survivors, not misses: failure text is not localised in this milestone, whichever side wrote it. Task 16's sweep greps `--include=*.tsx` for JSX and `aria-label=` and will not surface the seven that live in a `.ts` module as thrown `Error` messages, which is why they are enumerated rather than left to the sweep.

## Verification

### Scenario Coverage

Path abbreviations: `interview.test.ts` is `packages/core/src/interview/single-turn-interview.test.ts`; `routes.test.ts` is `packages/server/src/routes/interview-routes.test.ts`; `view.test.tsx` is `packages/web/src/interview/InterviewView.test.tsx`; `app.test.tsx` is `packages/web/src/App.test.tsx`; `web-locale.test.ts` is `packages/web/src/locale/locale.test.ts`.

| Scenario | Test Type | Test Location | Test Name |
|----------|-----------|---------------|-----------|
| Beginning an interview stores an empty session (changed) | Integration | `interview.test.ts` (task 5) | `stores an empty turn list and the named language, and reaches no model` |
| Beginning an interview that already exists keeps the stored session (changed) | Integration | `interview.test.ts` (task 5) | `leaves a stored session's turns, createdAt and language alone when begun again in the other language` |
| The conversation carries one instruction and names no model (changed) | Integration | `interview.test.ts` (task 5) | `sends the stored language's system and user templates and names no model` |
| The opening prompt is written in the language the session was begun in | Integration | `interview.test.ts` (task 5) | `serves a German session the German templates and an English session the English ones, differing in both messages` |
| A stored session carrying no recognised language is interviewed in the fallback language | Integration | `interview.test.ts` (task 5) | `falls back for a state with no locale and for one holding an unsupported tag, rejects neither, and writes the fallback tag on the next save` |
| A prompt table missing a language fails the type check | Unit | `packages/core/src/interview/prompts.test-d.ts` (task 4) | `rejects a prompt table missing a supported language` |
| Interview state survives a JSON round trip (changed) | Unit | `packages/core/src/interview/state.test.ts` (task 5) | `round-trips through JSON with every instant a string, the tag intact, and the language unchanged` |
| Creating a session answers its identifier (changed) | Integration | `routes.test.ts` (task 7) | `answers 201 with an id and the named language, and stores that language` |
| Creating a session that names no language uses the default language | Integration | `routes.test.ts` (task 7) | `answers 201 with the fallback for $body` — one `it.each` case per body form |
| Creating a session in an unsupported language is refused | Integration | `routes.test.ts` (task 7) | `answers 400 naming the supported languages for $locale and stores nothing` |
| The view renders its chrome in the language it is given | Integration | `view.test.tsx` (task 14) | `renders every label from the dictionary for $locale` |
| The view creates its session in the language it was mounted with | Integration | `view.test.tsx` (task 14) | `names its mounted language when creating the session and uses the language the response carried` |
| Switching the chrome's language leaves the running interview alone | Integration | `view.test.tsx` (task 14) | `relabels the chrome without re-creating the session, re-requesting the question, or clearing the typed answer` |
| The question is marked with the language it was asked in | Integration | `view.test.tsx` (task 14) | `declares the session's language on the question region, not the chrome's` |
| A failure is shown to the person (changed) | Integration | `view.test.tsx` (task 14) | `shows the message character for character under a label in the chrome's language, and keeps the answer control closed` |
| The app starts in the language the browser reports | Unit | `web-locale.test.ts` (task 9) | `answers de for a de-AT list and en for an en-GB list` |
| A browser language outside the supported set starts the app in the fallback language | Unit | `web-locale.test.ts` (task 9) | `falls back for an unsupported list and for an empty one, and takes a supported second preference first` |
| A remembered choice outranks the browser's language | Unit | `web-locale.test.ts` (task 9) | `prefers a remembered supported tag and ignores a remembered unsupported one` |
| Choosing a language remembers it for the next visit | Integration | `app.test.tsx` (task 13) | `switches the chrome and writes the chosen tag under the storage key` |
| Storage that cannot be read or written leaves the app usable | Integration | `app.test.tsx` (task 13) | `starts on the browser's language and still switches when storage throws on read and on write` |
| The document declares the language the chrome is in | Integration | `app.test.tsx` (task 13) | `sets documentElement.lang on start and again on a change` |
| The language control names every language in its own language | Integration | `app.test.tsx` (task 13) | `carries an accessible name, both endonyms, the active language, and keyboard-operable options` |
| A string dictionary missing an entry fails the type check | Unit | `packages/web/src/locale/strings.test-d.ts` (task 11) | `rejects a dictionary missing a member and a record missing a language` |
| The package's language vocabulary matches the contract | Unit | `web-locale.test.ts` (task 9) | `matches the fixture's supported tags, fallback and creation field name` |
| The shell mounts the interview view (changed) | Integration | `app.test.tsx` (task 13) | `renders the untranslated product heading, the language control, and the view it hands the app's language` |

Seven of the twenty-five scenarios are unit tests and every other is an integration test. `A prompt table missing a language fails the type check` and `A string dictionary missing an entry fails the type check` execute nothing — they are type assertions. `Interview state survives a JSON round trip` is pure computation over a value. The four `web-locale.test.ts` rows resolve a language from a supplied list and a stub storage, and compare three declarations against a file, performing no I/O of their own — which is the point of taking the list and the storage as parameters.

Two `platform/web-shell` scenarios and the `interview/interview-view` chrome scenarios both touch `App.tsx`; they are separate tests because the shell owns deciding and remembering the language while the view owns rendering in it, and a single test would hide which side regressed.

Every scenario recorded by `004-single-question-walking-skeleton` that this plan does not list MUST stay green. Tasks 5, 7 and 14 adjust their fixtures where a literal `InterviewState` or a creation response appears, and MUST NOT adjust an assertion. The fixtures they touch are `single-turn-interview.test.ts` and `state.test.ts` for task 5, `interview-routes.test.ts` and `composition.test.ts` for task 7, and `InterviewView.test.tsx` for task 14; task 6 adjusts `transcript.test.ts`'s five state literals alongside the change that requires them. `packages/server/src/composition.test.ts` is the one this plan would otherwise miss — no scenario names it and no assertion in it changes, but its `askedSession()` state literal stops compiling the moment `locale` is required, and Vitest's type stripping means only the § Checklist `Typecheck` row surfaces it. That is the evidence that adding a language changed no existing behaviour.

The live tier maps to no scenario, as it did in `004`. It falsifies the milestone's central claim against a real model rather than asserting specified behaviour, so it is a § Manual Testing row.

### Manual Testing

| Feature | Command | Expected Output |
|---------|---------|-----------------|
| single-question-interview | `pnpm --filter @chrysalyst/core test` | Every interview, state, transcript, language and prompt test passes; coverage stays at or above 90 %. The run creates no directory and contacts no backend |
| single-question-interview | `pnpm --filter @chrysalyst/core typecheck` | Exit 0, with both new `*.test-d.ts` files' `@ts-expect-error` directives consumed — an unconsumed directive is itself an error, so a table that is not actually guarded fails here |
| interview-http-api | `pnpm --filter @chrysalyst/server test` | Every route, store, composition and adapter test passes, including the unedited `003` store scenarios; both live files report as skipped |
| interview-http-api | `CHRYSALYST_SESSION_DIR=/tmp/chrysalyst-m5 pnpm --filter @chrysalyst/server dev` then `curl -sS -X POST localhost:3000/interview -H 'content-type: application/json' -d '{"locale":"de"}'` | Prints `{"id":"<uuid>","locale":"de"}`. `cat /tmp/chrysalyst-m5/<uuid>/session.json` shows `"locale": "de"` under `state` beside `"turns": []`, and `"schemaVersion": 1` |
| interview-http-api | `curl -sS -X POST localhost:3000/interview` with no body, then with `-d 'not json'`, then with `-d '{}'` | `201` and `"locale":"en"` for all three — the body-less form is the `004` contract, unchanged |
| interview-http-api | `curl -sS -X POST localhost:3000/interview -H 'content-type: application/json' -d '{"locale":"fr"}'` | `400` with a `message` naming `de` and `en`. `ls /tmp/chrysalyst-m5` shows no new directory |
| single-question-interview | `curl -sS -N localhost:3000/interview/<the de uuid>/question` | The question streams in German. Requires a running Ollama holding `qwen3:8b` |
| single-question-interview | Copy an M3-era session directory into `/tmp/chrysalyst-m5`, so its `session.json` carries no `locale`, then `curl -sS -N localhost:3000/interview/<that id>/question`. **The copied session MUST hold an asked turn that carries no answer** — the next row answers it, and an already-answered session refuses the answer for an unrelated reason | The stored question replays and the server neither rejects the session nor rewrites its file — the old-session guarantee, observed where a reload would hit it. `cat` the file afterwards: it is byte-identical, because a load alone writes nothing |
| single-question-interview | Then answer that same copied session — `curl -sS -X POST localhost:3000/interview/<that id>/answer -H 'content-type: application/json' -d '{"answer":"a test answer"}'` — and `cat /tmp/chrysalyst-m5/<that id>/session.json` | `recorded`, and the file now carries `"locale": "en"` under `state` beside its answered turn, with `"schemaVersion": 1` unchanged. This is the write § Migration specifies, seen against a real file rather than a store double: the session's own progress persists the resolved fallback, and nothing migrated a session no one touched. `no-open-question` here means the copied session's last turn was already answered, which is the precondition the row above states, not a failure of this rule |
| interview-view, web-shell | `pnpm --filter @chrysalyst/web test` | Every language, dictionary, parser, client, shell and view test passes, plus the untouched production-build test. The two `strings.test-d.ts` type assertions are **collected and reported**, which is what task 10's config change buys — a run that names no type test means the runner is still off. No test opens a socket |
| interview-view, web-shell | `pnpm --filter @chrysalyst/web typecheck` | Exit 0, with both `strings.test-d.ts` `@ts-expect-error` directives consumed — an unconsumed directive is itself an error, so a dictionary that is not actually guarded fails here, the same way the `packages/core` row above proves the prompt table |
| interview-view, web-shell | `pnpm dev` in a browser reporting German, with a running Ollama | The page loads in German and the model's question arrives in German. Read `document.documentElement.lang` in the element inspector immediately on load: it is `en`, from `index.html`'s pre-mount default, and becomes `de` once the shell mounts — the behaviour task 13 states, not a defect. Switching to English relabels the page, leaves the question German, and starts no second inference in the Ollama log. Reloading starts a new, English interview. `document.documentElement.lang` is then `en` while the question region carries `lang="de"` |
| web-shell | With the page open, `localStorage.getItem('chrysalyst.locale')` in the browser console after switching, then reload | The chosen tag is stored, and the reload comes back in that language regardless of what the browser reports |
| web-shell | Open the page in a browser profile with site data blocked for `localhost` | The page loads in the browser's language, the control still switches it, and the console shows no uncaught error |
| web-shell | Tab to the language control and operate it with the keyboard alone | Focus is visible, both options are reachable, and the active language is announced |
| interview-view, web-shell | Task 16's sweep: `grep -rnE '>[A-Za-z][A-Za-z ,.…·—]{3,}<|aria-label="' packages/web/src --include=*.tsx` | The only user-facing literals left are `chrysalyst` and the endonyms; everything else resolves through `uiStrings` |
| single-question-interview, interview-http-api | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | The live suites run instead of skipping. The two new cases print the language and the question and assert the function-word score; the `004` feasibility case still prints the model and the time to first token. A failing German case enters § Live-tier risk's ladder |
| interview-view | The impeccable subphase's approved comp, then the styled control in the browser at 1280px and 400px | The control sits in the editorial register, adds no token, and does not crowd the metadata line at 400px. Task 17's artefact, recorded in `packages/web/DESIGN.md`. **Deferred with task 17 until the impeccable subphase approves a comp; task 18's checklist run carves this row out** — § Design Direction |
| web-shell | `pnpm --filter @chrysalyst/web build` | Exit 0; `dist/index.html` references a module asset. No new asset and no new font, because no language adds one |

### Checklist

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; the lockfile is unchanged, because no package is added |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; both `*.live.test.ts` files report as skipped |
| Live tier | `CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test` | 0 failures with both live suites running; the per-language questions are printed |
| Coverage | `pnpm -r test --coverage` | Report printed for every package; `packages/core` at or above 90 %, which its two new modules are measured on |
| Typecheck | `pnpm typecheck` | Exit 0; every `@ts-expect-error` in the new type tests is consumed |
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Format | `pnpm format:check` | No changes reported |

Every row but `Live tier` and the § Manual Testing rows naming `pnpm dev` or a browser runs with no daemon, no network and no configured environment variable. The hosted pipeline `006-ci-test-tiers` installed reproduces every one of them except those, so a green run here is evidence from a runner as well as from one machine.

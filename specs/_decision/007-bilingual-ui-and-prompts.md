# Decisions: bilingual-ui-and-prompts

## ADR: The session's language lives in `InterviewState`, and `schemaVersion` stays `1`

**ID:** interviewstate-locale-schemaversion-unchanged
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

`InterviewState` needed to carry the language a session was interviewed in. `002-add-ollama-llm-adapter`'s ADR records that `schemaVersion` versions the on-disk envelope, not the state it wraps, and the store refuses any version it does not recognise, so a bump would make every session M3 wrote unreadable. `SessionStorePort<TState>` is generic and must not learn a domain word, ruling out the envelope as a home for the field.

### Decision

`InterviewState` grows a `locale` field beside `turns`. The on-disk envelope and its `schemaVersion` stay at `1`. Every load of a session passes through one private function that applies `resolveLocale`, which answers the fallback for an absent or unrecognised stored value.

### Options Considered

| Option | Verdict |
|--------|---------|
| Add `locale` to `InterviewState`, resolved at the single load boundary, `schemaVersion` unchanged | ✓ Chosen — one owner per version, old sessions stay readable |
| Bump `schemaVersion` to `2` | ✗ Rejected — would make every session written before this milestone unreadable |
| Put the language on the `StoredSession` envelope | ✗ Rejected — the envelope's port is generic and must not learn a domain word |
| Declare the field optional in the type | ✗ Rejected — would spread an `undefined` case through every future reader |
| Thread the language through each call instead of storing it | ✗ Rejected — would not survive a reload, which "fixed per session" requires |

### Consequences

A version bump in `.nvmrc`-style reasoning does not apply here: the field grows without a migration pass, and a stored session with no language is interviewed in the fallback rather than refused. Resolving untrusted stored data at one read boundary keeps the declared type honest for new data and tolerant of old.

## ADR: `en` is the fallback for a browser language outside `{de, en}`

**ID:** en-is-fallback-locale
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

The supported locale set is exactly `de` and `en`. A visitor whose browser reports neither language, and a session whose stored state carries no recognised language, both need a deterministic fallback.

### Decision

`FALLBACK_LOCALE` is `en`, declared once in `packages/core/src/interview/locale.ts` and restated once in `packages/web/src/locale/locale.ts` under fixture guard.

### Options Considered

| Option | Verdict |
|--------|---------|
| `en` as a named constant, declared once per package | ✓ Chosen — English is the wider second language and already the language of the code and its failure messages |
| `de`, on the grounds that the repository's specs and maintainer are German | ✗ Rejected — a German visitor is detected correctly and never reaches the fallback |
| Derive the fallback from the first entry of `SUPPORTED_LOCALES` | ✗ Rejected — would hide a decision inside array order |

### Consequences

A fallback session is internally consistent — English chrome around English failure text — rather than a German shell around English error text. The choice is one constant per package to reverse.

## ADR: Prompt templates are authored per language and typed over the locale union

**ID:** prompt-templates-authored-per-locale
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

M5's acceptance bar is that a small local model actually asks its opening question in the user's language. A single English template with an appended "answer in X" instruction, or a run-time translation step, were both candidate shapes for the opening prompt.

### Decision

`openingPrompts: Readonly<Record<Locale, OpeningPrompt>>` lives in `packages/core/src/interview/prompts.ts`. Each template is written in its own language and also states that language explicitly; both languages sit side by side in one module, typed over `Locale` so a language added later cannot compile until every template exists for it.

### Options Considered

| Option | Verdict |
|--------|---------|
| A template per language, authored natively, typed over `Locale` | ✓ Chosen — an instruction phrased in the target language is the stronger prompt for a small model, and the compiler enforces bilingual coverage |
| One English template with a per-language "answer in X" sentence appended | ✗ Rejected — the failure this milestone must not have is a German-speaking person interviewed in English |
| A template per file | ✗ Rejected — a prompt's meaning can drift; a reviewer must see both languages in one diff |
| Generating the non-English template by asking the model to translate | ✗ Rejected — would make the prompt non-deterministic and cost an inference before the interview starts |

### Consequences

The roadmap's rule that every prompt-bearing milestone from M5 onward writes its templates bilingually becomes a compile error rather than a convention to remember.

## ADR: No i18n library

**ID:** no-i18n-library
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

`packages/web` needed a way to externalise UI copy per locale. The surface is small: thirteen labels, one interpolation, two languages, no pluralisation, and a single time label already hand-rolled as 24-hour `HH:MM`.

### Decision

No i18next, react-intl, FormatJS, or message-catalogue tooling. Hand-rolled typed dictionaries only, as plain TS modules. The lockfile does not change.

### Options Considered

| Option | Verdict |
|--------|---------|
| Hand-rolled typed dictionaries, no new dependency | ✓ Chosen — a typed record solves this problem at compile time with no loading lifecycle |
| i18next with React bindings | ✗ Rejected — adds a dependency, a loading lifecycle, and key-based lookup to a problem this small |
| `Intl.*` wrappers for dates and numbers | ✗ Rejected — no pluralisation or date-formatting need beyond what is already hand-rolled |

### Consequences

The dictionaries are plain modules a library could consume later if the surface grows; the cost of reversing this decision is bounded.

## ADR: The dictionary is a typed record, not a `t(key)` helper

**ID:** dictionary-typed-record-not-t-helper
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

The clarifying interview sketched string externalisation as "a small lookup helper" in the shape of `t('interview.submit')`. A `t` call with a string key types as `string` even for a key that does not exist, so a missing translation would reach a browser and render a raw key.

### Decision

`uiStrings[locale].submit`, indexed over a `UiStrings` interface both language modules satisfy. One member, `recordedAt(time)`, is a function because it interpolates.

### Options Considered

| Option | Verdict |
|--------|---------|
| A typed record indexed by member, `uiStrings[locale].submit` | ✓ Chosen — indexing a typed record makes a missing translation a `tsc` failure |
| The `t('interview.submit')` shape the clarifying interview sketched | ✗ Rejected — a string key types as `string` regardless of whether the key exists, so a missing entry renders a key at run time |

### Consequences

The one class of bug hand-rolled string dictionaries are known for — a missing key silently rendering — is removed at no cost in ceremony over the originally sketched shape.

## ADR: The view localises the failure label; failure text is not localised in this milestone

**ID:** failure-label-localised-message-not
**Plan:** bilingual-ui-and-prompts
**Status:** Accepted

### Context

The clarifying interview excluded error and failure *messages* — the text that surfaces raw model or server failure — from this milestone's scope. `packages/web` itself authors eight English failure sentences that reach the same failure region the view renders, which made an authorship-based boundary ("the view translates what it wrote") untestable: applied literally it would require translating sentences the sweep task cannot even find, since five of the eight are thrown `Error` messages in `.ts` modules rather than JSX.

### Decision

The label above a failure message — `The question stopped` / `Die Frage ist abgebrochen` — comes from the dictionary like every other static label. The message underneath is rendered character for character as it arrived, whichever side wrote it: the API's words, the transport's, and the eight English sentences `packages/web` writes itself.

### Options Considered

| Option | Verdict |
|--------|---------|
| Localise the label; leave every failure message as it arrived, stated as scope rather than authorship | ✓ Chosen — testable, and consistent with leaving a German column with an untranslated heading looking like an oversight |
| Leave the label English too | ✗ Rejected — `The question stopped` is a heading in the same register as `The question`, not raw failure text, so leaving it English would be a visible inconsistency with no reason behind it |
| Draw the line at authorship — the view translates what it wrote | ✗ Rejected — untestable, since `packages/web` authors eight English failure sentences of its own that the rule applied literally would require translating |

### Consequences

The boundary is stated once, in the `interview/interview-view` Background, as scope rather than authorship. The eight untranslated survivors are named by file and line in plan.md § Non-Goals so a later milestone can widen the boundary without a sweep.

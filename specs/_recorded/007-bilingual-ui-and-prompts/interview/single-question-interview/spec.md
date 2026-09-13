# Feature: single_question_interview

Conducts one round of the interview — the model asks an opening question, the person answers it, and both survive a restart — so that chrysalyst's claim that a small local model can interview is testable end to end.

## Background

The interview is the first application code in `@chrysalyst/core`. It reaches the language model, the session store, and the clock only through `CoreDependencies`, so it opens no socket, touches no file, and reads no ambient clock. It is deliberately one round: there is no question tree, no next-question choice, and no distillation. Milestones M7 and M8 own those.

<!-- DELTA:CHANGED -->

A session's domain state is `InterviewState`, version 1: the language the interview is held in, and a list of turns. A turn is tagged: an asked turn carries `status: 'asked'`, the question, and the instant it was asked; an answered turn carries `status: 'answered'`, those same fields, the answer, and the instant it was answered. The tag is what makes the two shapes distinguishable both in TypeScript and after a JSON round trip, and what makes an answer without an answering instant unrepresentable. Every instant is an ISO 8601 string rather than a `Date`, because the session store reconstitutes only the two timestamps of its own envelope and returns everything under `state` exactly as JSON gave it back — the constraint recorded as `State the store cannot serialise does not survive the round trip` in `adapters/filesystem-session-store`. The list holds at most one turn in this feature and grows in M8 without a schema change.

The language is `Locale`, one of exactly two supported tags — `de` and `en` — with `en` as the fallback. It is chosen when the session is created and never changes afterwards, so the language a person was interviewed in is a property of the transcript rather than of whoever is looking at it. `schemaVersion` is unaffected: it versions the on-disk envelope, and the envelope's shape is unchanged. A session written before this milestone therefore loads exactly as it did, carrying no language under `state`; one function — the single load every reader of a session goes through — turns an absent or unrecognised stored value into the fallback, so no caller repeats the rule and no loaded session is ever without a language. Because a save rebuilds the state from that normalised session, a session written before this milestone acquires the fallback tag on the next save its own progress causes; nothing rewrites a session no one touches.

<!-- /DELTA:CHANGED -->

The interview also owns the Markdown rendering of its own state. `adapters/filesystem-session-store` writes `transcript.md` but never interprets what it holds, so the renderer is a pure function here, taking the stored session the port already declares, and the composition root hands it to the store.

One production of the opening question serves every caller waiting on it, and it owns its own cancellation rather than borrowing a caller's. A caller abandoning its stream ends that caller's iteration; the production stops only once every caller sharing it has abandoned.

<!-- DELTA:CHANGED -->

The opening prompt exists once per supported language, held in one table this module owns. Each template is **written in** its own language rather than translated at the edges of an English one, and each states its language explicitly as well: a small local model follows an instruction phrased in the language it is meant to answer in more reliably than an English instruction naming that language. The table is typed over `Locale`, so a language added later cannot compile until every template exists for it — which is how the roadmap's rule that every prompt-bearing milestone from M5 onward writes its templates bilingually is enforced rather than remembered.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:CHANGED -->

### Scenario: Beginning an interview stores an empty session

* *GIVEN* an interview over a session store holding nothing
* *WHEN* a caller begins an interview under a given identifier, naming the language to hold it in
* *THEN* the store MUST hold a session under that identifier
* *AND* the stored state MUST carry an empty turn list and the language the caller named
* *AND* the session's `createdAt` and `updatedAt` MUST both be the instant the clock reported
* *AND* the interview MUST NOT contact the language model

<!-- /DELTA:CHANGED -->

<!-- DELTA:CHANGED -->

### Scenario: Beginning an interview that already exists keeps the stored session

* *GIVEN* an interview whose session already holds an answered turn in one language
* *WHEN* a caller begins an interview under that same identifier, naming the other language
* *THEN* the stored session MUST be unchanged in its turns, in `createdAt`, and in its language
* *AND* the interview MUST NOT replace a stored question or answer with an empty turn list
* *AND* the interview MUST NOT change the language of a session that already exists, because the language is fixed when the session is created

<!-- /DELTA:CHANGED -->

<!-- DELTA:CHANGED -->

### Scenario: The conversation carries one instruction and names no model

* *GIVEN* a begun interview
* *WHEN* the interview requests the opening question from the model
* *THEN* the conversation MUST carry exactly one system message and one user message
* *AND* both messages MUST be the templates this module holds for the session's stored language
* *AND* the system message MUST instruct the model to ask a single opening question and nothing else
* *AND* the conversation MUST NOT name a model, so the model the adapter was configured with answers

<!-- /DELTA:CHANGED -->

<!-- DELTA:NEW -->

### Scenario: The opening prompt is written in the language the session was begun in

* *GIVEN* two begun interviews, one in German and one in English
* *WHEN* each requests its opening question from the model
* *THEN* the German session's conversation MUST carry the German templates and the English session's MUST carry the English templates
* *AND* the two conversations MUST differ in both messages, so neither language is served an instruction written for the other
* *AND* each system message MUST state the language the model is to ask in, beside being written in that language
* *AND* neither template MUST be derived from the other at run time, because a template is authored text rather than a translation the code performs

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: A stored session carrying no recognised language is interviewed in the fallback language

* *GIVEN* an interview whose stored state carries no language, as a session written before this milestone does, and a second whose stored language is a value outside the supported set
* *WHEN* a caller requests the opening question of either session
* *THEN* the interview MUST use the fallback language's templates for both
* *AND* the interview MUST NOT reject either request, because a session that predates the language is readable rather than corrupt
* *AND* resolving the language MUST happen in exactly one function, which every load of a session passes through, so a caller reading the stored value directly fails this scenario rather than a review
* *AND* the next save either session takes MUST write the resolved fallback language into its stored state, while loading alone MUST write nothing — a save rebuilds the state from the session that single load returned, so a session that is only read is left exactly as it was found

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: A prompt table missing a language fails the type check

* *GIVEN* a prompt table declared over the supported languages
* *WHEN* a table omitting one of them is asserted against that type
* *THEN* the type check MUST fail
* *AND* the failure MUST surface when the package's type tests run, so a later milestone cannot ship a template in one language alone

<!-- /DELTA:NEW -->

<!-- DELTA:CHANGED -->

### Scenario: Interview state survives a JSON round trip

* *GIVEN* an `InterviewState` holding one answered turn and a language
* *WHEN* the state is serialised to JSON and parsed back
* *THEN* the parsed value MUST equal the original state
* *AND* every instant it carries MUST be a string, never a `Date`
* *AND* the language MUST return as the same tag it was written with

<!-- /DELTA:CHANGED -->

# Feature: single_question_interview

Conducts one round of the interview — the model asks an opening question, the person answers it, and both survive a restart — so that chrysalyst's claim that a small local model can interview is testable end to end.

## Background

The interview is the first application code in `@chrysalyst/core`. It reaches the language model, the session store, and the clock only through `CoreDependencies`, so it opens no socket, touches no file, and reads no ambient clock. It is deliberately one round: there is no question tree, no next-question choice, and no distillation. Milestones M7 and M8 own those.

A session's domain state is `InterviewState`, version 1: a list of turns. A turn is tagged: an asked turn carries `status: 'asked'`, the question, and the instant it was asked; an answered turn carries `status: 'answered'`, those same fields, the answer, and the instant it was answered. The tag is what makes the two shapes distinguishable both in TypeScript and after a JSON round trip, and what makes an answer without an answering instant unrepresentable. Every instant is an ISO 8601 string rather than a `Date`, because the session store reconstitutes only the two timestamps of its own envelope and returns everything under `state` exactly as JSON gave it back — the constraint recorded as `State the store cannot serialise does not survive the round trip` in `adapters/filesystem-session-store`. The list holds at most one turn in this feature and grows in M8 without a schema change.

The interview also owns the Markdown rendering of its own state. `adapters/filesystem-session-store` writes `transcript.md` but never interprets what it holds, so the renderer is a pure function here, taking the stored session the port already declares, and the composition root hands it to the store.

One production of the opening question serves every caller waiting on it, and it owns its own cancellation rather than borrowing a caller's. A caller abandoning its stream ends that caller's iteration; the production stops only once every caller sharing it has abandoned.

The opening prompt is written in English and is a constant of this module. M5 externalises prompts per locale.

## Scenarios

### Scenario: Beginning an interview stores an empty session

* *GIVEN* an interview over a session store holding nothing
* *WHEN* a caller begins an interview under a given identifier
* *THEN* the store MUST hold a session under that identifier
* *AND* the stored state MUST carry an empty turn list
* *AND* the session's `createdAt` and `updatedAt` MUST both be the instant the clock reported
* *AND* the interview MUST NOT contact the language model

### Scenario: Beginning an interview that already exists keeps the stored session

* *GIVEN* an interview whose session already holds an answered turn
* *WHEN* a caller begins an interview under that same identifier
* *THEN* the stored session MUST be unchanged in its turns and in `createdAt`
* *AND* the interview MUST NOT replace a stored question or answer with an empty turn list

### Scenario: The opening question streams from the model and is stored once it completes

* *GIVEN* a begun interview and a language model that yields the question in several chunks
* *WHEN* a caller consumes the opening-question stream to its end
* *THEN* the stream MUST yield the model's chunks in the order the model produced them
* *AND* the store MUST hold one turn whose question is the concatenation of the chunks, carrying an `askedAt` from the clock and no answer
* *AND* the store MUST NOT be written before the model's last chunk was yielded

### Scenario: The conversation carries one instruction and names no model

* *GIVEN* a begun interview
* *WHEN* the interview requests the opening question from the model
* *THEN* the conversation MUST carry exactly one system message and one user message
* *AND* the system message MUST instruct the model to ask a single opening question and nothing else
* *AND* the conversation MUST NOT name a model, so the model the adapter was configured with answers

### Scenario: Two concurrent requests for the opening question reach the model once

* *GIVEN* a begun interview and a language model that has yielded no chunk yet
* *WHEN* a second caller asks for the opening question while the first request is still streaming
* *THEN* the interview MUST reach the language model exactly once
* *AND* both callers MUST receive the same question text
* *AND* the store MUST hold exactly one turn

### Scenario: A caller that abandons a shared question production leaves the other caller's question intact

* *GIVEN* two callers consuming one in-flight opening-question production
* *WHEN* the first caller abandons its stream before the model's last chunk
* *THEN* the second caller MUST receive the whole question
* *AND* the store MUST hold exactly one turn, carrying that whole question
* *AND* the language model MUST have been reached exactly once
* *AND* the production MUST be cancelled only once every caller sharing it has abandoned it

### Scenario: A second request replays the stored question instead of asking the model again

* *GIVEN* an interview whose session already holds an asked turn
* *WHEN* a caller consumes the opening-question stream again
* *THEN* the stream MUST yield the stored question text
* *AND* the interview MUST NOT contact the language model
* *AND* the stored turn's `askedAt` MUST be unchanged

### Scenario: A question the caller abandons is never stored

* *GIVEN* a begun interview and a language model yielding chunks
* *WHEN* the caller aborts the signal it passed and the stream ends early
* *THEN* the store MUST hold the session with an empty turn list
* *AND* the abandoned stream MUST NOT reject, because an abandoned answer is the caller's own doing

### Scenario: A model that produces no question fails the request and stores nothing

* *GIVEN* a begun interview and a language model whose chunks concatenate to whitespace only
* *WHEN* a caller consumes the opening-question stream to its end
* *THEN* the stream MUST reject with a message stating that the model produced no question
* *AND* the store MUST hold the session with an empty turn list

### Scenario: A model that cannot be reached fails the request and stores nothing

* *GIVEN* a begun interview and a language model whose stream rejects
* *WHEN* a caller consumes the opening-question stream
* *THEN* the stream MUST propagate the model's rejection unchanged
* *AND* the store MUST hold the session with an empty turn list

### Scenario: An unknown session yields no question stream

* *GIVEN* an interview over a session store holding nothing
* *WHEN* a caller asks for the opening question of an identifier that was never begun
* *THEN* the interview MUST answer that there is no such session, in the same vocabulary the session store uses for an identifier it never saved
* *AND* the interview MUST NOT contact the language model
* *AND* the answer MUST be available before any chunk is consumed, so a caller can refuse the request before it opens a stream

### Scenario: Recording an answer completes the stored turn

* *GIVEN* an interview whose session holds one asked turn
* *WHEN* a caller records an answer for that session
* *THEN* the interview MUST report the answer as recorded
* *AND* the stored turn MUST carry that answer and an `answeredAt` from the clock, with its question and `askedAt` unchanged
* *AND* the session's `updatedAt` MUST be the instant the clock reported, and its `createdAt` MUST be unchanged

### Scenario: Recording an answer for an unknown session reports no session

* *GIVEN* an interview over a session store holding nothing
* *WHEN* a caller records an answer for an identifier that was never begun
* *THEN* the interview MUST report that there is no such session
* *AND* the interview MUST NOT write to the store

### Scenario: Recording an answer before the question was asked reports no open question

* *GIVEN* a begun interview whose question was never requested, so its turn list is empty
* *WHEN* a caller records an answer for that session
* *THEN* the interview MUST report that no question is open
* *AND* the interview MUST NOT write to the store
* *AND* the interview MUST NOT create a turn carrying an answer to no question

### Scenario: Recording a second answer reports no open question

* *GIVEN* an interview whose single turn is already answered
* *WHEN* a caller records another answer for that session
* *THEN* the interview MUST report that no question is open
* *AND* the stored answer MUST be unchanged
* *AND* the interview MUST NOT append a second turn

### Scenario: The transcript renders the interview as Markdown

* *GIVEN* a stored session whose state holds one answered turn
* *WHEN* the transcript renderer is applied to that stored session
* *THEN* the Markdown MUST name the session's identifier and both of its timestamps
* *AND* it MUST carry the question and the answer, each beside the instant it was asked or answered
* *AND* a state whose turn is asked but unanswered MUST render the question with its answer shown as still awaited, and a state holding no turn MUST render the header alone, naming no question
* *AND* rendering MUST NOT read a clock, touch a file, or reach the language model

### Scenario: Interview state survives a JSON round trip

* *GIVEN* an `InterviewState` holding one answered turn
* *WHEN* the state is serialised to JSON and parsed back
* *THEN* the parsed value MUST equal the original state
* *AND* every instant it carries MUST be a string, never a `Date`

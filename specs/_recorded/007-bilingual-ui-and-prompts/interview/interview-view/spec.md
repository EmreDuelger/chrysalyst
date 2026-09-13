# Feature: interview_view

Shows the interview in a browser — the question appearing word by word as the model writes it, a place to type the answer, and a clear signal of what the app is doing — so a non-technical person can hold one round of the interview without reading a log.

## Background

`@chrysalyst/web` reaches the API over HTTP and nothing else. It declares no workspace package, imports no domain module, and carries its own declaration of the three wire shapes it consumes; the shared contract between the two sides is `interview/interview-http-api`, which both packages' tests are written from. The Vite dev server proxies the interview routes to the API so the browser sees one origin under `pnpm dev`.

The view reads the event stream with `fetch` and a `ReadableStream` rather than `EventSource`, so the transport is a function the tests replace and the parser is exercised on chunk boundaries a real network produces. Frame reassembly is the one piece of this feature that is pure computation: bytes arrive split anywhere, and events are separated by a blank line.

<!-- DELTA:CHANGED -->

The view holds two languages at once and must not confuse them. The **chrome's language** is the app-wide choice `platform/web-shell` owns; it is handed to the view as a prop and may change while the view is on screen, at which point every label it renders changes with it. The **session's language** is fixed when the session is created, comes back from the API's creation response, and decides both the language the model asked its question in and the language the question region declares to a screen reader. Switching the chrome's language therefore never re-creates a session, never re-asks a question, and never relabels a question that is already on screen.

The view renders no copy it holds itself: every static label comes from the string dictionaries `platform/web-shell` owns, the label above a failure included. Failure text is not localised in this milestone, whichever side wrote it: the message under that label is shown exactly as it arrived, whether the API, the transport, or this package's own code produced it. That boundary is scope rather than authorship, so a later milestone widening it has one rule to change and no authorship test to apply. Visual design is the impeccable subphase's; this feature fixes only what the person can perceive and act on.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:NEW -->

### Scenario: The view renders its chrome in the language it is given

* *GIVEN* a transport that yields a question to its end
* *WHEN* the view is rendered once for each supported language
* *THEN* every static label the view shows MUST be the dictionary entry for the language it was given
* *AND* the two renders MUST differ in the text of every label that differs between the dictionaries
* *AND* the view MUST NOT hold a literal of its own for any of those labels, so a language added later needs no edit here

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: The view creates its session in the language it was mounted with

* *GIVEN* a transport recording the requests it receives
* *WHEN* the view is rendered with a given chrome language
* *THEN* the view MUST name that language when it creates the session
* *AND* the view MUST take the session's language from the creation response rather than from the value it sent, so the language the session was actually created in is what it goes on to use

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: Switching the chrome's language leaves the running interview alone

* *GIVEN* a view whose question has arrived in full and whose answer field holds typed text
* *WHEN* the chrome's language changes to the other supported language
* *THEN* every static label MUST change to the new language
* *AND* the question's text MUST be unchanged, because the model asked it in the language the session was created in
* *AND* the view MUST NOT create a second session and MUST NOT request the question again
* *AND* the text the person has already typed MUST be unchanged

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: The question is marked with the language it was asked in

* *GIVEN* a session created in one language and a view whose chrome is in the other
* *WHEN* the question arrives
* *THEN* the question region MUST declare the session's language to assistive technology
* *AND* that declaration MUST be the language the creation response named, not the chrome's

<!-- /DELTA:NEW -->

<!-- DELTA:CHANGED -->

### Scenario: A failure is shown to the person

* *GIVEN* a transport whose question stream carries an `error` event
* *WHEN* the view is rendered
* *THEN* the view MUST show the message the event carried, character for character, because failure text is not localised in this milestone
* *AND* the view's own label above that message MUST be the dictionary entry for the chrome's language
* *AND* the streaming indicator MUST disappear and the answer control MUST stay closed
* *AND* the view MUST show the same treatment when the answer route refuses the submission

<!-- /DELTA:CHANGED -->

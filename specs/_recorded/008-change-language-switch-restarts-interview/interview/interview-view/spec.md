# Feature: interview_view

Shows the interview in a browser — the question appearing word by word as the model writes it, a place to type the answer, and a clear signal of what the app is doing — so a non-technical person can hold one round of the interview without reading a log.

## Background

<!-- DELTA:CHANGED -->

`@chrysalyst/web` reaches the API over HTTP and nothing else. It declares no workspace package, imports no domain module, and carries its own declaration of the three wire shapes it consumes; the shared contract between the two sides is `interview/interview-http-api`, which both packages' tests are written from. The Vite dev server proxies the interview routes to the API so the browser sees one origin under `pnpm dev`.

The view reads the event stream with `fetch` and a `ReadableStream` rather than `EventSource`, so the transport is a function the tests replace and the parser is exercised on chunk boundaries a real network produces. Frame reassembly is the one piece of this feature that is pure computation: bytes arrive split anywhere, and events are separated by a blank line.

The view holds two languages at once and must not confuse them. The **chrome's language** is the app-wide choice `platform/web-shell` owns; it is handed to the view as a prop and may change while the view is on screen, at which point every label it renders changes with it. The **session's language** is fixed when the session is created, comes back from the API's creation response, and decides both the language the model asked its question in and the language the question region declares.

A session's language cannot be changed after it is created, so a chrome language the running round was not started in restarts the interview: the view abandons the question stream, creates a second session in the language now chosen, and asks the question again from nothing. It asks the person first when that restart would discard text they have typed and can still see, because a discarded draft cannot be recovered; a state that renders no answer field holds no such text, and restarts without asking. It does nothing at all once the answer has been sent — the round is closed, and reopening a closed round is not this feature's. The session a restart leaves behind keeps its folder holding an unanswered turn, which `interview/interview-http-api` already tolerates and which nothing sweeps.

The restart compares the chrome's language against the language the current round was **started for**, never against the language the creation response named. The two are allowed to differ, and comparing against the response would restart the interview again on every answer that differed — a loop rather than a language switch.

The view renders no copy it holds itself: every static label comes from the string dictionaries `platform/web-shell` owns, the label above a failure and the labels on the discard request included. Failure text is not localised in this milestone, whichever side wrote it: the message under that label is shown exactly as it arrived, whether the API, the transport, or this package's own code produced it. That boundary is scope rather than authorship, so a later milestone widening it has one rule to change and no authorship test to apply. Visual design is the impeccable subphase's; this feature fixes only what the person can perceive and act on.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:REMOVED -->
### Scenario: Switching the chrome's language leaves the running interview alone

* *GIVEN* a view whose question has arrived in full and whose answer field holds typed text
* *WHEN* the chrome's language changes to the other supported language
* *THEN* every static label MUST change to the new language
* *AND* the question's text MUST be unchanged, because the model asked it in the language the session was created in
* *AND* the view MUST NOT create a second session and MUST NOT request the question again
* *AND* the text the person has already typed MUST be unchanged
<!-- /DELTA:REMOVED -->

<!-- DELTA:NEW -->
### Scenario: Switching the chrome's language asks before discarding a typed answer

* *GIVEN* a view whose question has arrived in full and whose answer field holds typed text
* *WHEN* the chrome's language changes to the other supported language
* *THEN* every static label MUST change to the new language, and the view MUST ask in that language, announcing itself as an alert, whether to discard the typed answer before it restarts anything
* *AND* while it is asking, the view MUST NOT create a second session, MUST NOT request the question again, and MUST leave the typed text and the question already on screen both unchanged
* *AND* the answer field and the submit control MUST stay usable, and sending the answer MUST withdraw the request for good — whether the answer route records the answer or refuses it — because a round whose answer has been sent can no longer be restarted, and a refusal leaves the view showing no answer field and none of the text the request named
* *AND* emptying the answer field MUST withdraw the request, and the view MUST then restart in the chosen language without asking, because the text the request named no longer exists; typing again MUST NOT bring the request back

### Scenario: Confirming the discard restarts the interview in the chosen language

* *GIVEN* a view asking whether to discard a typed answer after a language change
* *WHEN* the person confirms the discard
* *THEN* the view MUST create a second session naming the chrome's current language, and MUST request the question for that session and for no other
* *AND* the view MUST abandon the first session's question stream rather than leave it reading
* *AND* the first question's text, the typed text and the request itself MUST all be gone, and the view MUST show the state it shows before a first chunk arrives, so the second round starts from nothing the first one left behind
* *AND* keyboard focus MUST land on the interview region rather than on the document body, because the control the person activated has left the document

### Scenario: Declining the discard leaves the interview in the language it was created in

* *GIVEN* a view asking whether to discard a typed answer after a language change
* *WHEN* the person declines the discard
* *THEN* the view MUST NOT create a second session and MUST NOT request the question again
* *AND* the typed text and the question's text MUST both be unchanged, because the model asked that question in the language the session was created in
* *AND* every static label MUST stay in the language the person chose, because the chrome's language is the shell's and this decision was only about the interview
* *AND* the request MUST leave the screen, and keyboard focus MUST land on the answer field the person kept

### Scenario: Switching the chrome's language with no draft on screen restarts the interview without asking

* *GIVEN* a view holding no typed answer the person can still act on — either no answer field, or an answer field holding no text — in each state where the round can still be restarted
* *WHEN* the chrome's language changes to the other supported language
* *THEN* the view MUST create a second session naming the new language without asking anything
* *AND* the view MUST abandon the first session's question stream
* *AND* the view MUST request the question for the second session and show the state it shows before a first chunk arrives
* *AND* the view MUST take the second session's language from its own creation response, exactly as it does for the first

### Scenario: Switching back to the running round's language withdraws the request

* *GIVEN* a view asking whether to discard a typed answer after a language change
* *WHEN* the chrome's language changes back to the language the running round was started for
* *THEN* the request MUST leave the screen
* *AND* the view MUST NOT create a second session and MUST NOT request the question again
* *AND* the typed text MUST be unchanged, because the interview is already in the language now chosen
* *AND* the view MUST NOT move keyboard focus, because the person is operating the language control rather than the request

### Scenario: Switching the chrome's language after the answer is sent relabels only

* *GIVEN* a view whose answer has been sent, both while the request is still in flight and after it was confirmed
* *WHEN* the chrome's language changes to the other supported language
* *THEN* every static label MUST change to the new language
* *AND* the view MUST NOT create a second session, MUST NOT request the question again, and MUST NOT ask anything
* *AND* the question and the answer on screen MUST both be unchanged, because the round is closed and reopening it is not this feature's
<!-- /DELTA:NEW -->

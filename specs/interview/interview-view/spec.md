# Feature: interview_view

Shows the interview in a browser — the question appearing word by word as the model writes it, a place to type the answer, and a clear signal of what the app is doing — so a non-technical person can hold one round of the interview without reading a log.

## Background

`@chrysalyst/web` reaches the API over HTTP and nothing else. It declares no workspace package, imports no domain module, and carries its own declaration of the three wire shapes it consumes; the shared contract between the two sides is `interview/interview-http-api`, which both packages' tests are written from. The Vite dev server proxies the interview routes to the API so the browser sees one origin under `pnpm dev`.

The view reads the event stream with `fetch` and a `ReadableStream` rather than `EventSource`, so the transport is a function the tests replace and the parser is exercised on chunk boundaries a real network produces. Frame reassembly is the one piece of this feature that is pure computation: bytes arrive split anywhere, and events are separated by a blank line.

Interface copy is English. M5 makes it bilingual. Visual design is the impeccable subphase's; this feature fixes only what the person can perceive and act on.

## Scenarios

### Scenario: The view names a connecting state before the first chunk

* *GIVEN* a transport that creates a session and then yields no chunk yet
* *WHEN* the view is rendered
* *THEN* the view MUST show a labelled state naming that it is reaching the model
* *AND* the view MUST show no answer field and no submit control in that state
* *AND* that state MUST give way to the question as soon as the first chunk arrives

### Scenario: The view starts a session and shows the question as it arrives

* *GIVEN* a transport that creates a session and then yields the question in several chunks with a pause between them
* *WHEN* the view is rendered
* *THEN* the view MUST create a session before requesting the question
* *AND* the question region MUST show the text accumulated so far after each chunk, not only after the last one
* *AND* the question region MUST announce itself as a live region, so a screen reader reads the arriving text
* *AND* the final text MUST be the concatenation of every chunk

### Scenario: A streaming indicator is visible only while the question streams

* *GIVEN* a transport that yields the question in several chunks
* *WHEN* the view is rendered and the stream then completes
* *THEN* the view MUST show a streaming indicator while chunks are still arriving
* *AND* the indicator MUST carry a text alternative naming what is happening
* *AND* the indicator MUST disappear once the `done` event arrives

### Scenario: The answer control opens only once the question is complete

* *GIVEN* a transport that yields the question in several chunks
* *WHEN* the view is rendered
* *THEN* the answer field MUST be disabled while the question is still streaming
* *AND* the submit control MUST be disabled while the question is still streaming
* *AND* both MUST become enabled once the `done` event arrives
* *AND* the answer field MUST carry an accessible label

### Scenario: Submitting an answer confirms it was saved

* *GIVEN* a completed question and a transport that accepts the answer
* *WHEN* the person types an answer and submits it
* *THEN* the view MUST send the typed text to the answer route for the session it created
* *AND* the view MUST show a confirmation that the answer was saved
* *AND* the answer field and the submit control MUST become disabled, because this feature holds one round only

### Scenario: The answer control is closed while the submission is in flight

* *GIVEN* a completed question and a transport whose answer request has not yet resolved
* *WHEN* the person submits an answer
* *THEN* the answer field and the submit control MUST both be disabled while the request is in flight
* *AND* the view MUST name that state, so the person can tell it from a finished submission
* *AND* the view MUST NOT send a second request while the first is in flight

### Scenario: A blank answer is not submitted

* *GIVEN* a completed question and an empty answer field
* *WHEN* the person activates the submit control
* *THEN* the view MUST NOT send a request
* *AND* the submit control MUST stay disabled until the field carries non-blank text

### Scenario: A failure is shown to the person

* *GIVEN* a transport whose question stream carries an `error` event
* *WHEN* the view is rendered
* *THEN* the view MUST show the message the event carried
* *AND* the streaming indicator MUST disappear
* *AND* the answer control MUST stay closed
* *AND* the view MUST show the same treatment when the answer route refuses the submission

### Scenario: Frames split across network chunks are reassembled

* *GIVEN* a byte sequence carrying several complete SSE events
* *WHEN* the sequence is delivered as chunks split at every position, including inside an event name, inside a JSON payload, and between the two newlines that end a frame
* *THEN* the parser MUST yield the same events for every split
* *AND* the parser MUST yield an event only once its terminating blank line has arrived
* *AND* trailing bytes that never complete a frame MUST NOT be yielded

### Scenario: The dev server proxies the interview routes to the API

* *GIVEN* the web package's Vite configuration
* *WHEN* the dev server's proxy table is inspected
* *THEN* the table MUST route the interview path prefix to the API server's loopback address and port
* *AND* the production build MUST NOT depend on that proxy, because it is dev-server configuration only

# Feature: backend_setup_gate

Keeps a person out of an interview that cannot run and shows them the one thing to fix instead — naming the backend chrysalyst is configured for and whether it is stopped or missing the model — so a machine that is not set up yet reads as a setup step rather than as a broken app.

## Background

The shell asks the server's status route once, when it mounts, and decides from the answer what to render. `interview/interview-view` creates its session the moment it renders, so mounting that view *behind* the answer rather than beside it is what makes this a gate: while the backend is unusable, no session is created, no question is requested, and nothing on disk changes.

The gate is a pre-flight for the person, not an authorisation boundary. `interview/interview-http-api` is unchanged — `POST /interview` still creates a session for any caller, and a question requested against a stopped backend still arrives as an `error` frame. The gate exists so that a person never reaches that frame, not so that no caller can.

Three outcomes block the interview and reach one screen. Two of them are the faults `platform/backend-status` names — the backend cannot be reached, or it does not hold the configured model — and each is explained in the app's language, because the person is expected to act on it. The third is a probe that failed on this side: the route could not be reached, answered a status other than `200`, or carried a body this package cannot read. That one follows the convention `interview/interview-view` established for failure — a dictionary label above the message, and the message itself shown exactly as it arrived rather than translated.

Recovery is asked for, never polled. The screen offers a control that runs the same probe again, and reloading the page runs it too, because the probe is a mount-time effect that holds nothing across mounts. Nothing repeats the probe on a timer: the person who started the backend is the one who knows it started.

A re-check is the same probe run again, so it shows the same checking state the first one showed, and the shell waits on one probe at a time. That window is bounded by the deadline `platform/backend-status` sets, and against a stopped backend it is the common case rather than the exception, so what the screen says during it is specified rather than left to the implementation.

`@chrysalyst/web` declares no workspace package, so it restates the status wire shape as it restates every other one, and `tests/fixtures/backend-status.json` holds that restatement and the route in agreement — exactly as `tests/fixtures/interview-sse-frames.txt` and `tests/fixtures/interview-locales.json` already do for the event and language contracts. Every label the screen renders comes from the string dictionaries `platform/web-shell` owns. Visual design is the impeccable subphase's; this feature fixes only what a person can perceive and act on.

## Scenarios

### Scenario: A ready backend mounts the interview

* *GIVEN* a status probe answering that the backend is ready
* *WHEN* the shell is rendered
* *THEN* the shell MUST mount the interview view once the probe answers
* *AND* the shell MUST NOT show the setup screen
* *AND* the shell MUST run the probe exactly once for that mount

### Scenario: A blocked backend shows the setup screen instead of the interview

* *GIVEN* a status probe answering that the backend is not ready
* *WHEN* the shell is rendered
* *THEN* the shell MUST show the setup screen
* *AND* the shell MUST NOT mount the interview view
* *AND* the shell MUST NOT create a session and MUST NOT request a question, because a blocked start-up leaves nothing behind
* *AND* the masthead's language control MUST stay rendered and operable, because a person who cannot read the guidance cannot act on it

### Scenario: Nothing is mounted while the probe is in flight

* *GIVEN* a status probe that has not yet answered
* *WHEN* the shell is rendered
* *THEN* the shell MUST show a labelled state naming that it is checking the backend
* *AND* the shell MUST NOT mount the interview view and MUST NOT show the setup screen
* *AND* the shell MUST NOT create a session, so a slow probe cannot start an interview behind the gate

### Scenario: The setup screen names the backend and which fault to fix

* *GIVEN* the two faults reported for a backend named `Ollama` configured with the model `llama3.2:3b`
* *WHEN* the setup screen is rendered for each of them
* *THEN* the unreachable screen MUST name the backend
* *AND* the missing-model screen MUST name the backend and the model
* *AND* the two screens MUST differ in their text, so a person can tell starting a daemon from installing a model
* *AND* each screen MUST state the action to take and not only the fault

### Scenario: The setup screen renders in the app's language

* *GIVEN* a reported fault
* *WHEN* the setup screen is rendered once for each supported language
* *THEN* every label the screen shows MUST be the dictionary entry for the language it was given
* *AND* the two renders MUST differ in the text of every label that differs between the dictionaries
* *AND* the screen MUST NOT hold a literal of its own for any of those labels, so a language added later needs no edit here
* *AND* the backend name and the model name MUST be unchanged between the two renders, because they are configured values rather than copy

### Scenario: A probe that fails shows its message under a label

* *GIVEN* a status probe that rejects, as it does when the route cannot be reached, answers a status other than `200`, or carries a body the package cannot read
* *WHEN* the shell is rendered
* *THEN* the shell MUST show the failure's message character for character, because failure text is not localised
* *AND* the label above that message MUST be the dictionary entry for the app's language
* *AND* the shell MUST NOT mount the interview view
* *AND* a body naming a fault this package does not know MUST reach this same treatment rather than a blank screen

### Scenario: Checking again after the backend is fixed opens the interview

* *GIVEN* a status probe answering that the backend is unreachable and then, on its next call, that it is ready
* *WHEN* the person activates the setup screen's check control
* *THEN* the shell MUST run the probe again
* *AND* the shell MUST mount the interview view once the second answer arrives
* *AND* the shell MUST NOT reload the document to do it

### Scenario: Re-checking shows that it is checking and answers once

* *GIVEN* a status probe answering that the backend is unreachable, whose next call has not answered yet
* *WHEN* the person activates the setup screen's check control
* *THEN* the shell MUST show the same labelled checking state the first probe showed, so the activation is visibly acknowledged
* *AND* the shell MUST NOT show the earlier fault's text or the check control while that probe is unsettled, because the text describes an answer that is being replaced and a visible control would let a second activation start a second probe
* *AND* the checking state MUST take the focus the removed control held and MUST be announced to assistive technology when it replaces the guidance, so a person operating the screen by keyboard is not returned to the document body without a message
* *AND* an answer from a probe the shell abandoned at unmount MUST NOT reach the screen, because the shell stopped waiting on it

### Scenario: Reloading the page runs the gate again

* *GIVEN* a status probe answering that the backend is unreachable and then, on its next call, that it is ready
* *WHEN* the shell is unmounted and rendered again, as reloading the page does
* *THEN* the second render MUST run the probe again
* *AND* the second render MUST mount the interview view
* *AND* the shell MUST NOT remember an earlier outcome in the browser's storage, so a backend that was started needs no cache cleared

### Scenario: The package's status vocabulary matches the contract

* *GIVEN* `tests/fixtures/backend-status.json` and the status vocabulary the package restates
* *WHEN* the two are compared
* *THEN* the route path the package requests MUST equal the fixture's
* *AND* the field names the package reads MUST equal the fixture's
* *AND* the fault names the package accepts MUST equal the fixture's, in the same order
* *AND* the comparison MUST run in the package's own suite, so a rename on either side fails a run rather than a review

### Scenario: The dev server proxies the status route to the API

* *GIVEN* the web package's Vite configuration
* *WHEN* the dev server's proxy table is inspected
* *THEN* the table MUST route the status route to the API server's loopback address and port
* *AND* the table MUST still route the interview path prefix to the same address
* *AND* the production build MUST NOT depend on that proxy, because it is dev-server configuration only

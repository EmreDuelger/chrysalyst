# Feature: web_shell

Provides the browser application shell — a Vite and React build that produces a loadable page and mounts the interview view, reaching the server over HTTP alone.

## Background

<!-- DELTA:CHANGED -->

`@chrysalyst/web` builds with Vite and renders with React, and its screen is now the interview view described by `interview/interview-view`. The package reaches the server only over HTTP: it declares no workspace package, imports no module from `@chrysalyst/core` or `@chrysalyst/server`, and declares the wire shapes it consumes itself. Visual design is settled by the first UI feature's impeccable subphase and recorded there, not here.

The shell owns the app's language, because both the masthead it renders and the view it mounts are written in it. It decides that language once at start-up — a choice the person made on an earlier visit outranks what the browser reports, and a browser language outside the supported set falls back — then hands it to the view and offers a control that changes it. The choice is remembered in the browser's own storage, which is per-visitor and per-browser; storage that cannot be read or written is a degraded convenience rather than a failure, so the app still starts and still switches.

Every static label in the package, the shell's own and the interview view's alike, comes from one string dictionary per language. The dictionaries share a single declared shape, so a language missing an entry fails the type check rather than rendering a key. The package cannot import `@chrysalyst/core`, so the supported tags and the fallback are restated here; `tests/fixtures/interview-locales.json` is what holds the restatement and the domain's declaration in agreement, exactly as `tests/fixtures/interview-sse-frames.txt` does for the event contract.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:NEW -->

### Scenario: The app starts in the language the browser reports

* *GIVEN* a browser reporting a language list whose first entry is a regional form of a supported language, such as `de-AT`
* *WHEN* the shell decides the app's language with nothing remembered
* *THEN* the shell MUST start the app in that language's supported tag
* *AND* the shell MUST read the regional form as its base language, so a person is not sent to the fallback over a region it does not distinguish

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: A browser language outside the supported set starts the app in the fallback language

* *GIVEN* a browser whose reported languages name no supported language
* *WHEN* the shell decides the app's language with nothing remembered
* *THEN* the shell MUST start the app in the fallback language
* *AND* the shell MUST take the first supported language in the browser's list when one appears later in it, so a second preference is honoured before the fallback is
* *AND* an empty language list MUST also start the app in the fallback language

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: A remembered choice outranks the browser's language

* *GIVEN* storage holding a supported language and a browser reporting the other one
* *WHEN* the shell decides the app's language
* *THEN* the shell MUST start the app in the remembered language
* *AND* a remembered value outside the supported set MUST be ignored in favour of the browser's language, so a stale or hand-edited value cannot strand the app

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: Choosing a language remembers it for the next visit

* *GIVEN* a rendered shell
* *WHEN* the person chooses the language the app is not currently in
* *THEN* the shell MUST render its chrome in the chosen language
* *AND* the shell MUST write the chosen language to storage under one named key
* *AND* the view MUST be handed the chosen language

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: Storage that cannot be read or written leaves the app usable

* *GIVEN* storage whose reads throw and storage whose writes throw
* *WHEN* the shell decides the app's language and the person then chooses the other language
* *THEN* the shell MUST start the app in the language the browser reports
* *AND* choosing a language MUST still switch the chrome
* *AND* neither the read nor the write MUST throw out of the shell, because a blocked storage is a lost convenience rather than a broken app

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: The document declares the language the chrome is in

* *GIVEN* a rendered shell
* *WHEN* the app's language is decided and then changed
* *THEN* the document element's language attribute MUST carry the app's language after each of them
* *AND* the attribute MUST carry the supported tag itself, so assistive technology pronounces the chrome correctly

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: The language control names every language in its own language

* *GIVEN* a rendered shell
* *WHEN* the language control is inspected
* *THEN* the control MUST carry an accessible name
* *AND* each language MUST be named by its own endonym, which is the same text whichever language the chrome is in
* *AND* the control MUST report which language is currently active
* *AND* every option MUST be reachable and operable from the keyboard

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: A string dictionary missing an entry fails the type check

* *GIVEN* the declared shape of the package's string dictionary
* *WHEN* a dictionary omitting one entry, and a dictionary set omitting one language, are asserted against it
* *THEN* the type check MUST fail for each of them
* *AND* the failure MUST surface when the package's type tests run, so an untranslated label cannot reach a browser

<!-- /DELTA:NEW -->

<!-- DELTA:NEW -->

### Scenario: The package's language vocabulary matches the contract

* *GIVEN* `tests/fixtures/interview-locales.json` and the language vocabulary the package restates
* *WHEN* the two are compared
* *THEN* the package's supported tags MUST equal the fixture's, in the same order
* *AND* the package's fallback tag MUST equal the fixture's
* *AND* the field the package names the language under when it creates a session MUST equal the fixture's
* *AND* the comparison MUST run in the package's own suite, so a rename on either side fails a run rather than a review

<!-- /DELTA:NEW -->

<!-- DELTA:CHANGED -->

### Scenario: The shell mounts the interview view

* *GIVEN* a DOM document containing an element with id `root`
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading naming the product, in the same text in every language, because the name is a proper noun rather than copy
* *AND* the mount point MUST contain the interview view and the language control
* *AND* the shell MUST hand the app's language to the view
* *AND* the shell MUST NOT itself call a server route, because the view owns the conversation with the API

<!-- /DELTA:CHANGED -->

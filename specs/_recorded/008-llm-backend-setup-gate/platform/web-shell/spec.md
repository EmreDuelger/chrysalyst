# Feature: web_shell

Provides the browser application shell — a Vite and React build that produces a loadable page and mounts the interview view, reaching the server over HTTP alone.

## Background

<!-- DELTA:CHANGED -->

`@chrysalyst/web` builds with Vite and renders with React, and its screen is now the interview view described by `interview/interview-view`. The package reaches the server only over HTTP: it declares no workspace package, imports no module from `@chrysalyst/core` or `@chrysalyst/server`, and declares the wire shapes it consumes itself. Visual design is settled by the first UI feature's impeccable subphase and recorded there, not here.

The shell owns the app's language, because both the masthead it renders and the view it mounts are written in it. It decides that language once at start-up — a choice the person made on an earlier visit outranks what the browser reports, and a browser language outside the supported set falls back — then hands it to the view and offers a control that changes it. The choice is remembered in the browser's own storage, which is per-visitor and per-browser; storage that cannot be read or written is a degraded convenience rather than a failure, so the app still starts and still switches.

The shell makes a second start-up decision and mounts nothing until it is answered: whether an interview can be held at all. It asks the server's status route once, on mount, and mounts the interview view only when the answer is that the backend is ready; `platform/backend-setup-gate` specifies that gate and the screen that stands in for the view while it is closed. The status probe is therefore the one server route the shell calls itself, and the interview API remains the view's alone — which is what keeps a blocked start-up from creating a session.

Every static label in the package — the shell's own, the interview view's, and the setup screen's alike — comes from one string dictionary per language. The dictionaries share a single declared shape, so a language missing an entry fails the type check rather than rendering a key. The package cannot import `@chrysalyst/core`, so the supported tags and the fallback are restated here; `tests/fixtures/interview-locales.json` is what holds the restatement and the domain's declaration in agreement, exactly as `tests/fixtures/interview-sse-frames.txt` does for the event contract and `tests/fixtures/backend-status.json` does for the status contract.

<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:CHANGED -->

### Scenario: The shell mounts the interview view

* *GIVEN* a DOM document containing an element with id `root`, and a status probe reporting the backend ready
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading naming the product, in the same text in every language, because the name is a proper noun rather than copy
* *AND* the mount point MUST contain the interview view and the language control
* *AND* the shell MUST hand the app's language to the view
* *AND* the status probe MUST be the only server route the shell calls itself, because the view still owns the whole conversation with the interview API

<!-- /DELTA:CHANGED -->

# Feature: web_shell

<!-- DELTA:CHANGED -->
Provides the browser application shell — a Vite and React build that produces a loadable page and mounts the interview view, reaching the server over HTTP alone.
<!-- /DELTA:CHANGED -->

## Background

<!-- DELTA:CHANGED -->
`@chrysalyst/web` builds with Vite and renders with React, and its screen is now the interview view described by `interview/interview-view`. The package reaches the server only over HTTP: it declares no workspace package, imports no module from `@chrysalyst/core` or `@chrysalyst/server`, and declares the wire shapes it consumes itself. Visual design is settled by the first UI feature's impeccable subphase and recorded there, not here.
<!-- /DELTA:CHANGED -->

## Scenarios

<!-- DELTA:CHANGED -->
### Scenario: Web package carries no internal dependency

* *GIVEN* the manifest and the source of `@chrysalyst/web`
* *WHEN* its dependencies and its import specifiers are inspected
* *THEN* the manifest MUST NOT declare `@chrysalyst/core`
* *AND* the manifest MUST NOT declare `@chrysalyst/server`
* *AND* no source file in the package MUST import a specifier beginning with `@chrysalyst/`, including a type-only import
* *AND* the workspace suite MUST assert the preceding clause, so the rule fails a run rather than a review
<!-- /DELTA:CHANGED -->

<!-- DELTA:REMOVED -->
### Scenario: Placeholder screen renders into the mount point

* *GIVEN* a DOM document containing an element with id `root`
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading
* *AND* the heading's text content MUST be `chrysalyst`
<!-- /DELTA:REMOVED -->

<!-- DELTA:NEW -->
### Scenario: The shell mounts the interview view

* *GIVEN* a DOM document containing an element with id `root`
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading naming the product
* *AND* the mount point MUST contain the interview view
* *AND* the shell MUST NOT itself call a server route, because the view owns the conversation with the API
<!-- /DELTA:NEW -->

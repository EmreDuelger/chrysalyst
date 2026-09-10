# Feature: web_shell

Provides the browser application shell — a Vite and React build that produces a loadable page and mounts the interview view, reaching the server over HTTP alone.

## Background

`@chrysalyst/web` builds with Vite and renders with React, and its screen is now the interview view described by `interview/interview-view`. The package reaches the server only over HTTP: it declares no workspace package, imports no module from `@chrysalyst/core` or `@chrysalyst/server`, and declares the wire shapes it consumes itself. Visual design is settled by the first UI feature's impeccable subphase and recorded there, not here.

## Scenarios

### Scenario: Production build emits a loadable bundle

* *GIVEN* the web package source
* *WHEN* the production build runs into a temporary output directory
* *THEN* the build MUST exit without error
* *AND* the output directory MUST contain an `index.html`
* *AND* the emitted HTML MUST reference a JavaScript module asset
* *AND* the build MUST NOT write into the package's default output directory

### Scenario: Web package carries no internal dependency

* *GIVEN* the manifest and the source of `@chrysalyst/web`
* *WHEN* its dependencies and its import specifiers are inspected
* *THEN* the manifest MUST NOT declare `@chrysalyst/core`
* *AND* the manifest MUST NOT declare `@chrysalyst/server`
* *AND* no source file in the package MUST import a specifier beginning with `@chrysalyst/`, including a type-only import
* *AND* the workspace suite MUST assert the preceding clause, so the rule fails a run rather than a review

### Scenario: The shell mounts the interview view

* *GIVEN* a DOM document containing an element with id `root`
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading naming the product
* *AND* the mount point MUST contain the interview view
* *AND* the shell MUST NOT itself call a server route, because the view owns the conversation with the API

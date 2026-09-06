# Feature: web_shell

Provides the browser application shell — a Vite and React build that produces a loadable page and renders a placeholder screen, so the first interview feature has a working surface to build on.

## Background

`@chrysalyst/web` renders a placeholder page carrying the product name. Visual design is out of scope for this feature: the package ships minimal vanilla CSS and no design system, no component library, and no theming. The package calls no server route and constructs no API client; the driving adapter's HTTP client arrives with the first interview feature.

## Scenarios

### Scenario: Production build emits a loadable bundle

* *GIVEN* the web package source
* *WHEN* the production build runs into a temporary output directory
* *THEN* the build MUST exit without error
* *AND* the output directory MUST contain an `index.html`
* *AND* the emitted HTML MUST reference a JavaScript module asset
* *AND* the build MUST NOT write into the package's default output directory

### Scenario: Placeholder screen renders into the mount point

* *GIVEN* a DOM document containing an element with id `root`
* *WHEN* the application component is rendered into that element
* *THEN* the mount point MUST contain a level-one heading
* *AND* the heading's text content MUST be `chrysalyst`

### Scenario: Web package carries no internal dependency

* *GIVEN* the manifest of `@chrysalyst/web`
* *WHEN* its dependencies are inspected
* *THEN* the manifest MUST NOT declare `@chrysalyst/core`
* *AND* the manifest MUST NOT declare `@chrysalyst/server`
* *AND* the package source MUST NOT import domain logic

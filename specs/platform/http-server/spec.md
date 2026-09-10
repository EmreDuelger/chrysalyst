# Feature: http_server

Provides the HTTP process that will later host chrysalyst's API, proving in this feature only that the app boots, answers a liveness probe on the loopback interface, and publishes its route types for a type-safe client.

## Background

`@chrysalyst/server` builds a Hono app and serves it on Node through `@hono/node-server`. The app is built by a factory taking the domain's dependency set, and the server factory takes the app it is to serve, so the only module that constructs a concrete adapter is the process entry point. The server package itself opens no socket to a language model and reads no session file; those belong to the adapters the composition root hands it. The package depends on `@chrysalyst/core` through the workspace protocol so the dependency direction from adapter to domain is established.

## Scenarios

### Scenario: Health route reports service status

* *GIVEN* an app built by the app factory from a dependency set
* *WHEN* a `GET /health` request is dispatched to the app
* *THEN* the app MUST respond with status `200`
* *AND* the response body MUST be JSON carrying a `status` field with the value `ok`
* *AND* the response body MUST carry the server's `version` as declared in its manifest
* *AND* answering the probe MUST NOT reach any of the dependencies the factory was given

### Scenario: Unknown route is rejected

* *GIVEN* the Hono app
* *WHEN* a request is dispatched to a path the app does not define
* *THEN* the app MUST respond with status `404`

### Scenario: App type is published for the typed client

* *GIVEN* the package entry point of `@chrysalyst/server`
* *WHEN* a consumer imports the exported app type
* *THEN* the package MUST export a type describing the routes of the app the factory returns
* *AND* that type MUST be derived from the factory rather than declared beside it, so a route added to the factory cannot be missing from the type
* *AND* a Hono `hc` client parameterised with that type MUST expose the health route
* *AND* calling a route the app does not define MUST fail the type check

### Scenario: Server binds a port and serves the app

* *GIVEN* the Node server factory and an app built for a test dependency set
* *WHEN* the factory is invoked with that app and an ephemeral port
* *THEN* the server MUST accept an HTTP request on the bound port
* *AND* `GET /health` over that port MUST return status `200`
* *AND* the server MUST release the port when its close function is called
* *AND* the server factory MUST NOT import the app it serves, so a caller decides which app is bound

### Scenario: Server binds the loopback interface only

* *GIVEN* the Node server factory invoked with an app and its default host
* *WHEN* the bound address is inspected
* *THEN* the server MUST bind the address `127.0.0.1`
* *AND* the server MUST NOT accept a connection addressed to a non-loopback interface

### Scenario: Server depends on the domain package

* *GIVEN* the manifest of `@chrysalyst/server`
* *WHEN* its dependencies are inspected
* *THEN* the manifest MUST declare `@chrysalyst/core`
* *AND* `@chrysalyst/core` MUST NOT declare a dependency on `@chrysalyst/server`

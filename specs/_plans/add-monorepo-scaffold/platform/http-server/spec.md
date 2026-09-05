# Feature: http_server

Provides the HTTP process that will later host chrysalyst's API, proving in this feature only that the app boots, answers a liveness probe on the loopback interface, and publishes its route types for a type-safe client.

## Background

`@chrysalyst/server` builds a Hono app and serves it on Node through `@hono/node-server`. In this feature the app carries a health route and nothing else: no adapter, no LLM client, no search client, and no filesystem access beyond a static import of the package's own manifest. The server depends on `@chrysalyst/core` through the workspace protocol so the dependency direction from adapter to domain is established.

## Scenarios

### Scenario: Health route reports service status

* *GIVEN* the Hono app
* *WHEN* a `GET /health` request is dispatched to the app
* *THEN* the app MUST respond with status `200`
* *AND* the response body MUST be JSON carrying a `status` field with the value `ok`
* *AND* the response body MUST carry the server's `version` as declared in its manifest

### Scenario: Unknown route is rejected

* *GIVEN* the Hono app
* *WHEN* a request is dispatched to a path the app does not define
* *THEN* the app MUST respond with status `404`

### Scenario: App type is published for the typed client

* *GIVEN* the package entry point of `@chrysalyst/server`
* *WHEN* a consumer imports the exported app type
* *THEN* the package MUST export a type describing the app's routes
* *AND* a Hono `hc` client parameterised with that type MUST expose the health route
* *AND* calling a route the app does not define MUST fail the type check

### Scenario: Server binds a port and serves the app

* *GIVEN* the Node server factory
* *WHEN* the factory is invoked with an ephemeral port
* *THEN* the server MUST accept an HTTP request on the bound port
* *AND* `GET /health` over that port MUST return status `200`
* *AND* the server MUST release the port when its close function is called

### Scenario: Server binds the loopback interface only

* *GIVEN* the Node server factory invoked with its default host
* *WHEN* the bound address is inspected
* *THEN* the server MUST bind the address `127.0.0.1`
* *AND* the server MUST NOT accept a connection addressed to a non-loopback interface

### Scenario: Server depends on the domain package

* *GIVEN* the manifest of `@chrysalyst/server`
* *WHEN* its dependencies are inspected
* *THEN* the manifest MUST declare `@chrysalyst/core`
* *AND* `@chrysalyst/core` MUST NOT declare a dependency on `@chrysalyst/server`

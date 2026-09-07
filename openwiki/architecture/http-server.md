---
type: architecture
title: HTTP-Server (@chrysalyst/server)
description: Die HTTP-Oberfläche von chrysalyst — die Hono-App mit der /health-Route, der startServer-Vertrag mit Loopback-Bindung und Port-Freigabe, und der aus AppType abgeleitete typsichere hc-Client.
tags: [http-server, hono, node, health-check, typed-client]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-07T20:27:51.484Z
sources:
  - id: openwiki-source-594c3cfbaeed11bfeec1813e
    resource: repo://packages/server/src/app.test.ts
  - id: openwiki-source-14c7fc2cd7605010c868d4c7
    resource: repo://packages/server/src/app.ts
  - id: openwiki-source-812dfc81d12d62ee87a4267e
    resource: repo://packages/server/src/client.test-d.ts
  - id: openwiki-source-d5e559b09ba22d4c297fe6a1
    resource: repo://packages/server/src/main.ts
  - id: openwiki-source-6975862bce621f8b8ea035ea
    resource: repo://packages/server/src/server.test.ts
  - id: openwiki-source-9c7fc804ace0299ef900862c
    resource: repo://packages/server/src/server.ts
  - id: openwiki-source-d13499d48a16cf9ebc50fdef
    resource: repo://specs/platform/http-server/spec.md
generated: { by: "claude-code", at: "2026-09-07T20:27:51.484Z" }
---

# HTTP-Server (@chrysalyst/server)

`@chrysalyst/server` ist der Prozess, der später chrysalysts API hostet. In
diesem Zustand beweist er nur dreierlei: die App bootet, sie beantwortet eine
Liveness-Probe auf dem Loopback-Interface, und sie veröffentlicht ihre
Route-Typen für einen typsicheren Client.

## Verantwortung und Grenzen

Das Paket baut eine [Hono](https://hono.dev)-App und serviert sie über Node mit
`@hono/node-server`. Es hängt über das Workspace-Protokoll an
`@chrysalyst/core` — damit ist die Abhängigkeitsrichtung Adapter → Domäne
etabliert (siehe [Architekturüberblick](overview.md)).

Was der Server **noch nicht** tut: Der [LLM-Adapter](llm-adapter.md) ist nicht
auf dieser App montiert, es gibt keinen LLM-Client, keinen Such-Client und
keinen Dateisystem-Zugriff über den statischen Import der eigenen
`package.json` hinaus. `packages/server/src/main.ts` startet ausschließlich den
Server auf Port `3000`.

## Die Hono-App

`packages/server/src/app.ts` konstruiert die App in einem einzigen verketteten
Ausdruck:

```ts
const app = new Hono().get('/health', (c) =>
  c.json({ status: 'ok', version: pkg.version }),
);
export type AppType = typeof app;
```

Die Verkettung bei der Konstruktion ist bewusst: Nur so erfasst `typeof app`
die Routen, und `AppType` wird für den typsicheren Client unten brauchbar.

### Route: `GET /health`

Die einzige Route. Sie antwortet mit Status `200` und dem JSON-Körper
`{ status: 'ok', version }`, wobei `version` aus der `version` der
`packages/server/package.json` stammt (statischer Import mit
`with { type: 'json' }`). Eine nicht definierte Route beantwortet Hono mit
`404`. `packages/server/src/app.test.ts` prüft beides direkt über
`app.request(...)`, ohne einen Socket zu binden.

## startServer — der Node-Server-Vertrag

`packages/server/src/server.ts` exportiert `startServer(port, host?)` und den
Handle-Typ `ServerHandle`.

| Aspekt | Verhalten |
|--------|-----------|
| Host-Default | `127.0.0.1` — keine Bereitstellung exponiert chrysalyst versehentlich ins Netz; ein weiterer Bind muss ausdrücklich angefragt werden |
| Erfolg | Das Promise löst auf, sobald der Socket lauscht, mit einem `ServerHandle` aus `{ server, close }` |
| `close()` | Der einzige unterstützte Weg, den gebundenen Port freizugeben; löst auf, wenn der Socket vollständig geschlossen ist, sodass der Aufrufer denselben Port neu binden kann |
| `server` | Nur zum Auslesen der gebundenen Adresse gedacht, nicht zur weiteren Mutation |
| Fehlschlag | Bindet der Socket nie — ein belegter Port vor allem —, verwirft das Promise mit einer `Error`, die `host:port` nennt und den zugrunde liegenden Node-Fehler als `cause` trägt |

Die Fehlermeldung lautet wörtlich `Cannot start the chrysalyst server on
<host>:<port>`. `packages/server/src/server.test.ts` prüft den vollen Zyklus
gegen echte ephemere Ports: `/health` über den gebundenen Port liefert `200`,
nach `close()` schlägt derselbe `fetch` fehl, ein zweiter `startServer` auf
einen schon belegten Port verwirft mit der genannten Meldung, und die gebundene
Adresse ist `127.0.0.1` — nicht `0.0.0.0` und nicht `::`.

## Der typsichere hc-Client

Weil `app.ts` `AppType` exportiert, kann ein Konsument einen Hono-`hc`-Client
damit parametrisieren und erhält die Routen typgeprüft.
`packages/server/src/client.test-d.ts` fixiert das auf Typ-Ebene: `hc<AppType>`
exponiert `client.health.$get` als Funktion, und der Zugriff auf eine nicht
definierte Route (`client.unknown`) bricht den Typcheck (`@ts-expect-error`).

## Verwandte Seiten

- [Architekturüberblick](overview.md) — die Rolle des Server-Pakets im Ganzen
- [LLM-Adapter](llm-adapter.md) — der erste Adapter im Server-Paket, noch nicht
  an die App montiert
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — wie
  die Server-Tests ohne Build laufen

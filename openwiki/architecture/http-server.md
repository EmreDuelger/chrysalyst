---
type: architecture
title: HTTP-Server (@chrysalyst/server)
description: Die HTTP-Oberfläche von chrysalyst — die per createApp(deps) gebaute Hono-App mit /health und den Interview-Routen, der startServer(app, port, host?)-Vertrag mit Loopback-Bindung und Port-Freigabe, und der aus AppType abgeleitete typsichere hc-Client.
tags: [http-server, hono, node, health-check, typed-client]
sources:
  - id: openwiki-source-594c3cfbaeed11bfeec1813e
    resource: repo://packages/server/src/app.test.ts
  - id: openwiki-source-14c7fc2cd7605010c868d4c7
    resource: repo://packages/server/src/app.ts
  - id: openwiki-source-812dfc81d12d62ee87a4267e
    resource: repo://packages/server/src/client.test-d.ts
  - id: openwiki-source-d3fb78d820eb72194e376138
    resource: repo://packages/server/src/composition.ts
  - id: openwiki-source-d5e559b09ba22d4c297fe6a1
    resource: repo://packages/server/src/main.ts
  - id: openwiki-source-6975862bce621f8b8ea035ea
    resource: repo://packages/server/src/server.test.ts
  - id: openwiki-source-9c7fc804ace0299ef900862c
    resource: repo://packages/server/src/server.ts
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
---

# HTTP-Server (@chrysalyst/server)

`@chrysalyst/server` ist der Prozess, der chrysalysts API hostet. Seit M3 trägt
die App neben der Liveness-Probe die Interview-Route und ist über die
Kompositionswurzel an die beiden echten Adapter montiert. Diese Seite deckt das
App-Gerüst und den Node-Server-Vertrag; die SSE-Route, ihr Event-Kontrakt und
die Kompositionswurzel liegen auf einer
[eigenen Seite](interview-http-and-composition.md).

## Verantwortung und Grenzen

Das Paket baut eine [Hono](https://hono.dev)-App und serviert sie über Node mit
`@hono/node-server`. Es hängt über das Workspace-Protokoll an
`@chrysalyst/core` — damit ist die Abhängigkeitsrichtung Adapter → Domäne
etabliert (siehe [Architekturüberblick](overview.md)).

`app.ts` selbst konstruiert **keinen** Adapter: es nimmt die
`CoreDependencies` als Parameter. Wo die konkreten Adapter entstehen — der
[LLM-Adapter](llm-adapter.md) und der
[Dateisystem-Session-Store](session-store-adapter.md), verdrahtet in
`composition.ts` — beschreibt die
[Interview-Route-und-Komposition-Seite](interview-http-and-composition.md).
`packages/server/src/main.ts` ist der einzige Ort, der beides zusammenführt und
den Server auf Port `3000` startet.

## Die Hono-App: `createApp(deps)`

`packages/server/src/app.ts` exportiert eine **Fabrik** statt einer
Modul-scope-Instanz:

```ts
export function createApp(deps: CoreDependencies<InterviewState>) {
  return new Hono()
    .get('/health', (c) => c.json({ status: 'ok', version: pkg.version }))
    .route('/', createInterviewRoutes(createSingleTurnInterview(deps)));
}
export type AppType = ReturnType<typeof createApp>;
```

Zwei Entscheidungen stecken darin:

- **Fabrik mit Pflicht-`deps`.** Konkrete Adapter entstehen nur am
  Einstiegspunkt. Das ist die Naht, die die hermetische Test-Stufe braucht:
  `packages/server/src/app.test.ts` und die Route-Tests montieren die App über
  ein Fake-Modell und ein temporäres Verzeichnis, statt einen echten
  Inferenz-Backend und das Home des Nutzers zu erreichen.
- **`AppType` aus der Fabrik abgeleitet** (`ReturnType<typeof createApp>`),
  nicht daneben deklariert. Jede Route ist an *einen* Ausdruck gekettet, sodass
  der Rückgabetyp die ganze Oberfläche trägt — es gibt keine zweite Stelle, an
  der eine Route im Client-Typ fehlen könnte.

### Route: `GET /health`

Antwortet mit Status `200` und `{ status: 'ok', version }`, wobei `version` aus
der `packages/server/package.json` stammt (statischer Import mit
`with { type: 'json' }`), ohne eine Abhängigkeit zu erreichen. Eine nicht
definierte Route beantwortet Hono mit `404`. `app.test.ts` prüft beides direkt
über `app.request(...)`, ohne einen Socket zu binden.

### Route: das Interview

`.route('/', createInterviewRoutes(...))` chained die drei Interview-Routen
(`POST /interview`, `GET /interview/:id/question` als SSE, `POST
/interview/:id/answer`) an dieselbe Instanz. Mechanik, Event-Kontrakt und
Statuscode-Übersetzung:
[Interview-Route, SSE-Kontrakt und Kompositionswurzel](interview-http-and-composition.md).

## startServer — der Node-Server-Vertrag

`packages/server/src/server.ts` exportiert `startServer(app, port, host?)` und
den Handle-Typ `ServerHandle`. Die **App ist das erste Argument** — sie wird
übergeben, nicht importiert, damit die Kompositionswurzel entscheidet, welche
App läuft, und ein Test eine über Fakes gebaute binden kann. Der Server ist
allein über den `fetch`-Member typisiert (`ServableApp`) und nennt keinen
Route-Typ.

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
exponiert `client.health.$get`, `client.interview.$post`,
`client.interview[':id'].question.$get` und `client.interview[':id'].answer.$post`
als Funktionen — die Frage-Route mit typisiertem Pfad-Parameter `id`, die
Antwort-Route zusätzlich mit typisiertem `json`-Body `{ answer }`. Der Zugriff
auf eine nicht definierte Route bricht den Typcheck (`@ts-expect-error`).

Der Browser-Client nutzt `hc` **nicht**: `hc<AppType>` typisiert die
Route-Formen, aber keinen SSE-Event-Namen und keine Payload, was die größere
Hälfte des Frage-Stream-Kontrakts ist. `packages/web` deklariert den
Wire-Kontrakt darum neu — siehe
[Browser-Client und Designsystem](web-client.md).

## Verwandte Seiten

- [Architekturüberblick](overview.md) — die Rolle des Server-Pakets im Ganzen
- [Interview-Route, SSE-Kontrakt und Kompositionswurzel](interview-http-and-composition.md) — die Interview-Routen und wo die Adapter entstehen
- [LLM-Adapter](llm-adapter.md) · [Dateisystem-Session-Store](session-store-adapter.md) — die zwei Adapter, die die App jetzt trägt
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — wie
  die Server-Tests ohne Build laufen

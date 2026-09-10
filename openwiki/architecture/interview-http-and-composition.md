---
type: architecture
title: Interview-Route, SSE-Kontrakt und Kompositionswurzel
description: Wie packages/server die Interview-Vertikale über HTTP verdrahtet — die drei Routen (Session anlegen, Frage streamen, Antwort aufnehmen), der Server-Sent-Events-Kontrakt token/done/error mit einzeiligem JSON, die Übersetzung der Domänen-Vokabeln in Statuscodes an der Grenze, und die Kompositionswurzel als einziger Ort mit einem konkreten Adapter.
tags: [http, server-sent-events, sse, composition-root, hono, interview, dependency-injection]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
sources:
  - id: openwiki-source-abd0a1ef3f59dbd18dcf5018
    resource: repo://packages/core/src/interview/transcript.ts
  - id: openwiki-source-298c154a2647ab68a974c362
    resource: repo://packages/server/src/adapters/clock/system-clock.ts
  - id: openwiki-source-14c7fc2cd7605010c868d4c7
    resource: repo://packages/server/src/app.ts
  - id: openwiki-source-d3fb78d820eb72194e376138
    resource: repo://packages/server/src/composition.ts
  - id: openwiki-source-d5e559b09ba22d4c297fe6a1
    resource: repo://packages/server/src/main.ts
  - id: openwiki-source-0443590d078e8b72afcd56c2
    resource: repo://packages/server/src/routes/interview-routes.live.test.ts
  - id: openwiki-source-5942245b8df904eb3c948171
    resource: repo://packages/server/src/routes/interview-routes.test.ts
  - id: openwiki-source-a6d87dd671c382421a96e994
    resource: repo://packages/server/src/routes/interview-routes.ts
  - id: openwiki-source-9f1672a73d8c3832ee8e57d7
    resource: repo://specs/_decision/004-single-question-walking-skeleton.md
  - id: openwiki-source-5cf2e6da1f074128f6fca973
    resource: repo://specs/interview/interview-http-api/spec.md
  - id: openwiki-source-b1e8b3a8bdfc48eb2e09cd13
    resource: repo://tests/fixtures/interview-sse-frames.txt
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
---

# Interview-Route, SSE-Kontrakt und Kompositionswurzel

`packages/server` veröffentlicht die eine Interview-Runde über HTTP: eine
Session-Ressource, einen Server-Sent-Events-Strom, der die Frage trägt, während
das Modell sie produziert, und eine Route, die die Antwort annimmt. Ein Browser
treibt damit ein Interview, ohne zu wissen, was ein Sprachmodell oder ein
Session-Ordner ist. Die Domänenlogik dahinter steht auf der Seite
[Interview-Runde (@chrysalyst/core)](interview-round.md); das App-Gerüst und
der Node-Server-Vertrag auf [HTTP-Server](http-server.md).

## Verantwortung und Grenze

`packages/server/src/routes/interview-routes.ts` ist der einzige Ort, an dem
das Vokabular des Interviews auf HTTP abgebildet wird. **Kein Statuscode
erscheint in der Domäne**, und keine Route wiederholt eine Entscheidung,
die das Interview schon getroffen hat:

| Interview-Ausgang | HTTP |
|---|---|
| `openingQuestion` löst `undefined` auf (nie begonnene Session) | `404` JSON, benennt die `id` |
| `recordAnswer` → `no-session` | `404` |
| `recordAnswer` → `no-open-question` (keine Frage wartet, oder schon beantwortet) | `409` |
| Body ist kein JSON / kein `{ answer }` mit Text | `400`, benennt den Grund |
| `begin` erfolgreich | `201` mit `{ id }` |
| `recordAnswer` → `recorded` | `204`, kein Body |

Die Session-Kennung wird **hier** geprägt (`randomUUID()` in der
`POST /interview`-Route), nicht in der Domäne — Zufall ist ambiente
Nichtdeterminismus genau wie die Systemuhr, und `save` bekommt ohnehin eine
Kennung gereicht, statt eine zu erfinden.

Fehlermeldungen benennen den Endpunkt oder die Session, um die es geht.
chrysalyst bindet das Loopback-Interface und bedient eine Person; eine Meldung,
die dieser Person hilft, ein gestopptes Backend zu diagnostizieren, ist mehr
wert als eine minimale.

## Die drei Routen

`createInterviewRoutes(interview: SingleTurnInterview)` chained sie an *eine*
Hono-Instanz, damit der Rückgabetyp jede Route trägt.

### `POST /interview`

Prägt eine `id`, ruft `interview.begin(id)`, antwortet `201` mit `{ id }`.
**Keine Inferenz** — die Route antwortet sofort, und der Session-Ordner
entsteht mit einer leeren Turn-Liste.

### `GET /interview/:id/question` — der Strom

`interview.openingQuestion(id, signal)` löst auf und **entscheidet damit
Existenz**: ist das Ergebnis `undefined`, antwortet die Route `404`, bevor ein
Strom öffnet, und es wird nichts inferiert. Sonst öffnet
`streamSSE(c, …)`, registriert `stream.onAbort` gegen einen `AbortController`,
und `writeQuestion` schreibt die Chunks, während sie ankommen.

### `POST /interview/:id/answer`

Liest den Body als JSON (`jsonBody` gibt `undefined` zurück, wenn es kein
JSON ist — die Grenze, an der ein Parser-Fehler zum Vokabular dieses Moduls
wird), validiert `{ answer }` mit `zod` (leerer/whitespace-Text wird abgelehnt,
nicht getrimmt), ruft `interview.recordAnswer(id, answer)` und bildet den
Ausgang auf `204` / `404` / `409` ab.

## Der SSE-Event-Kontrakt

Der Strom trägt **drei** Event-Typen und keine anderen
(ADR `sse-contract-three-events-single-line-json-no-id`):

| Event | `data` |
|---|---|
| `token` | `{ "text": "<ein Modell-Chunk>" }` |
| `done` | `{ "question": "<die fertige Frage>" }` |
| `error` | `{ "message": "<menschenlesbar>" }` |

- **Jedes `data` ist eine einzige Zeile JSON.** `JSON.stringify` escaped ein
  Newline, sodass kein Payload einen SSE-Frame in zwei spaltet. Rohtext im
  `data`-Feld wäre nicht von einer Frame-Grenze zu unterscheiden; `writeSSE`
  splittet zudem selbst auf Newline, und SSE verwirft einen leeren
  `data`-Buffer und trimmt ein führendes Leerzeichen — alles Dinge, die ein
  echter Modell-Chunk trifft.
- **Kein `id:`-Feld, kein Reconnection-Protokoll.** Ein Client, der den Strom
  verliert, fordert ihn neu an und bekommt die gespeicherte Frage.
- **`done` wird erst geschrieben, nachdem das Iterable von selbst endete** — und
  das Interview die Frage gespeichert hat. Ein Client, der `done` sieht, schaut
  auf eine Frage, die bereits auf der Platte liegt: `done` ist ein
  Durability-Signal, das er beobachten statt annehmen kann. Ein abgebrochener
  Strom und eine gescheiterte Produktion enden beide ohne `done` — der erste,
  weil niemand zuhört, die zweite über ein `error`-Event.

`tests/fixtures/interview-sse-frames.txt` ist die ausführbare Hälfte
dieses Kontrakts: der Route-Test prüft, dass der Server exakt diese Bytes
emittiert, der Client-Test in `packages/web`, dass sie zu den drei Payload-Shapes
zurück dekodieren — ein Rename auf einer Seite lässt einen Lauf
fehlschlagen, nicht nur einen Browser.

## Abbruch: ein abgebrochener Response-Body, keine abgebrochene Anfrage

Wenn der Client die Verbindung trennt, schließt Nodes Adapter die
schreibbare Seite; das cancelt den Body-Reader und abortet den Strom.
`writeQuestion` prüft `stream.aborted` vor jedem Frame und gibt bei Abbruch
still zurück. Der `onAbort`-Handler abortet das `AbortSignal`, das an
`openingQuestion` ging — das beendet *diese* Iteration; warum es das Modell nie
erreicht, steht auf [Interview-Runde](interview-round.md). Ein Test, der einen
Strom abbricht, hört auf, den Body zu lesen, statt ein Request-Signal zu
aborten.

## Die Kompositionswurzel

`packages/server/src/composition.ts` ist der **einzige Ort in chrysalyst, an
dem ein konkreter Adapter konstruiert wird** — jedes Modul darunter hängt
an einem Port und nie an einem Transport, einem Verzeichnislayout oder einem
Systemaufruf.

```
createDependenciesFromEnv(env)  →  CoreDependencies<InterviewState>
  ├ llm      = createOpenAiCompatibleLlm(llmConfigFromEnv(env))
  ├ sessions = createFilesystemSessionStore({ ...sessionStoreConfigFromEnv(env), renderTranscript })
  └ clock    = createSystemClock()
```

- **`env` ist ein Parameter**, nicht aus ambientem Zustand gelesen — die
  Assemblierung bleibt eine reine Funktion ihrer Eingabe, und ein Test treibt
  sie mit einem Record, den er kontrolliert. Das Auflösen des Satzes
  verdrahtet die Adapter und liest nichts: kein Socket öffnet, keine Datei
  wird gelesen, kein Session-Ordner entsteht, bis ein Aufrufer tatsächlich
  speichert.
- **`search` wird ausgelassen, nicht gestubbt** — kein Adapter implementiert es,
  und `CoreDependencies` macht das zu einem abwesenden Member, das der Compiler
  jeden Aufrufer behandeln lässt.
- **`renderTranscript` wird per Referenz übergeben.** Es ist
  `@chrysalyst/core`s eigener Renderer; er und die Store-Config teilen die
  Signatur `StoredSession<InterviewState>`, sodass keine adaptierende Lambda
  dazwischensteht. Der Store schreibt damit ein echtes Transkript statt des
  Metadaten-Stubs — siehe [Session-Store-Adapter](session-store-adapter.md).
- **`createSystemClock`** kapselt das eine `new Date()` — dieselbe Behandlung
  ambienter Nichtdeterminismus wie Socket und Datei.

`main.ts` ist die einzige Datei, die `createApp(createDependenciesFromEnv())`
zusammenführt und `startServer` auf Port `3000` ruft. Damit sind der
[LLM-Adapter](llm-adapter.md) und der
[Session-Store](session-store-adapter.md) **erstmals an die Hono-App
montiert** — vorher trug die App nur `/health`.

## Repräsentative Tests

`packages/server/src/routes/interview-routes.test.ts` (15 Szenarien) montiert die
App über drei Fake-Modell-Faktoren (`chunkedLlm` / `rejectingLlm` /
`endlessLlm`) und ein `mkdtemp`-Verzeichnis, treibt sie mit `app.request(...)`
und prüft die Frames byte-genau gegen die Fixture — kein Socket, kein
Daemon. `interview-routes.live.test.ts` fährt denselben Pfad gegen ein echtes
`qwen3:8b`, misst die Zeit bis zum ersten Token (zuletzt ~2,1 s warm) und
prüft, dass die gespeicherte Frage keinen `<think>`-Marker trägt.

## Verwandte Seiten

- [Interview-Runde (@chrysalyst/core)](interview-round.md) — die Domänenregeln hinter den Routen
- [HTTP-Server (@chrysalyst/server)](http-server.md) — `createApp`-Fabrik und `startServer`
- [Browser-Client und Designsystem](web-client.md) — die andere Seite des Wire-Kontrakts
- [LLM-Adapter](llm-adapter.md) · [Dateisystem-Session-Store](session-store-adapter.md) — die montierten Adapter
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — die geteilte Fixture und die zweite Live-Suite

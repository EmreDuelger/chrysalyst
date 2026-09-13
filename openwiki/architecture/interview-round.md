---
type: architecture
title: Interview-Runde (@chrysalyst/core)
description: Die erste Domänenlogik von chrysalyst — der Session-Zustand als getaggte Turn-Liste mit ISO-String-Zeitstempeln, die drei Operationen begin/openingQuestion/recordAnswer über CoreDependencies, die Auflösen-entscheidet-Existenz / Pull-erreicht-das-Modell-Trennung, die prozess-lokale In-flight-Produktion (eine Inferenz pro Session) und das Markdown-Rendering des Transkripts.
tags: [interview, domain-core, state-machine, streaming, async-generator, hexagonal-architecture]
sources:
  - id: openwiki-source-d265cc7c06dcbefb6f92a01b
    resource: repo://packages/core/src/index.ts
  - id: openwiki-source-1f5e2ec8cd020d62ed6b5a14
    resource: repo://packages/core/src/interview/index.ts
  - id: openwiki-source-15e22470495001481cf50cac
    resource: repo://packages/core/src/interview/prompts.ts
  - id: openwiki-source-df99a04c4843621452957144
    resource: repo://packages/core/src/interview/single-turn-interview.ts
  - id: openwiki-source-81d7efa0b9c52df71ab93100
    resource: repo://packages/core/src/interview/state.ts
  - id: openwiki-source-abd0a1ef3f59dbd18dcf5018
    resource: repo://packages/core/src/interview/transcript.ts
  - id: openwiki-source-9f1672a73d8c3832ee8e57d7
    resource: repo://specs/_decision/004-single-question-walking-skeleton.md
generated: { by: "claude-code", at: "2026-09-13T13:26:03.722Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-13T13:26:03.722Z
---

# Interview-Runde (@chrysalyst/core)

`packages/core/src/interview/` ist die erste Domänenlogik von chrysalyst — der
erste echte Aufrufer der [Ports](domain-ports.md). Bis M3 hielt `@chrysalyst/core`
nur Typ-Deklarationen; jetzt trägt der Paket-Einstiegspunkt neben
`export type * from './ports/index.ts'` ein `export * from './interview/index.ts'`.
Ein Import zieht damit die Laufzeit-Bindungen des Interviews nach, öffnet aber
weiterhin keinen Socket, liest keine Datei und keine Uhr — die Reinheitsregel
verbietet eine *Abhängigkeit*, nicht Domänencode.

**Genau eine Runde.** M7 besitzt den Fragebaum, M8 die Turn-Schleife, M10 die
Destillation. Jede Struktur, die hier für sie gebaut würde, wäre eine Annahme
ohne ihre Anforderungen. Die Frage entsteht **kalt** aus einem festen
System-Prompt — seit M5 (DE/EN-Fundament) eines von zwei eigenständig
verfassten Templates, je nach Sprache der Session (siehe
[§ Zwei Sprachen: `openingPrompts`](#zwei-sprachen-openingprompts) unten) —
es gibt keinen Ideen-Eingang; der kommt mit M7/M8.

## Der Zustand: `InterviewState`

```ts
interface InterviewState { readonly locale: Locale; readonly turns: readonly Turn[] }
type Turn = AskedTurn | AnsweredTurn;   // getaggt über `status`
```

Drei Entwurfsentscheidungen prägen den Zustand (ADR
`interviewstate-v1-turn-list-tagged-union` aus 004; `locale` kam mit M5 dazu,
siehe `specs/_decision/007-bilingual-ui-and-prompts.md`):

- **Eine Liste ab v1, kein Frage/Antwort-Paar.** M8 wächst das Interview auf
  viele Turns; eine Liste kostet bei einem Element nichts, ein Paar erzwänge
  beim zweiten Turn einen Schema-Bruch. Der `schemaVersion` des Session-Stores
  ist davon unberührt — er versioniert das On-Disk-Envelope, nicht den
  Domänen-Zustand darin.
- **Getaggt über `status`, nicht über die Anwesenheit von `answer`.** Der Tag
  ist die einzige Form, auf die TypeScript nach einem JSON-Roundtrip narrowt —
  ein geladener Turn ist reine Daten ohne Klasse, gegen die man testen könnte.
  `isAnswered(turn)` prüft `turn.status === 'answered'`, damit das Narrowing
  auch für einen gerade aus der Speicherung zurückgeparsten Turn hält.
- **`locale` gehört zum Zustand, nicht zum Envelope.** Die Sprache ist eine
  Eigenschaft der Session — was die Person interviewt wurde, nicht was ein
  späterer Leser bevorzugt —, wird bei der Erstellung einmal festgelegt und
  ändert sich nie. `schemaVersion` bleibt bei `1`: Das Envelope ist
  unverändert, und ein Sprung hätte jede M3-Session ungelesen gemacht, deren
  `state` kein `locale` trägt (siehe unten, `loadInterview`).

Die Zeitstempel (`askedAt`, `answeredAt`) sind **ISO-8601-Strings, nie `Date`**:
Der Session-Store gibt alles unter `state` genau so zurück, wie `JSON.parse` es
produziert hat, also käme ein `Date`-Feld als `string` zurück, während der Typ
`Date` behauptete. `AnsweredTurn` trägt den Antwort-Zeitpunkt neben der Antwort,
sodass eine Antwort ohne Zeit — eine Kombination, die nichts bedeutet — nicht
darstellbar ist.

## Die drei Operationen: `SingleTurnInterview`

`createSingleTurnInterview(deps: CoreDependencies<InterviewState>)` bindet die
Abhängigkeiten einmal und gibt drei Operationen zurück
(ADR `interview-factory-over-coredependencies-answers-absence`):

| Operation | Vertrag |
|---|---|
| `begin(id, locale)` | Öffnet eine Session unter `id` in der genannten Sprache; eine Kennung, die schon eine hält, bleibt **unverändert** (kein Reset der Turns, und die schon gespeicherte Sprache bleibt, auch wenn `begin` erneut mit einer anderen Sprache gerufen wird). |
| `openingQuestion(id, signal?)` | Antwortet die Frage als die Chunks, aus denen sie besteht, oder `undefined`, wenn nie eine Session unter `id` begonnen wurde — dasselbe Abwesenheits-Vokabular wie der Store. |
| `recordAnswer(id, answer)` | Schließt die offene Frage mit der Antwort ab; meldet `no-session` oder `no-open-question` statt zu werfen. |

`no-session` und `no-open-question` sind gewöhnliche Ausgänge, keine Fehler —
sie werden **beantwortet, nicht geworfen**. Der Aufrufer (die
[HTTP-Route](interview-http-and-composition.md)) besitzt die Abbildung auf
Statuscodes; hier erscheint keiner.

## Die zwei Mechanismen, die die Runde tragen

### Auflösen entscheidet Existenz, Pullen erreicht das Modell

`openingQuestion` ist ein Async-Generator. Sein **Auflösen** (`Promise<AsyncIterable | undefined>`)
lädt die Session und entscheidet damit, ob sie existiert — ein Aufrufer kann die
Anfrage mit `404` ablehnen, *bevor* ein Strom öffnet, und für eine abgelehnte
Anfrage wird nichts inferiert. Der **erste Pull** des Generators ist, was das
Modell erreicht. Hält die Session schon einen Turn, wird die gespeicherte Frage
per `replayStoredQuestion` zurückgegeben und **kein Modell erreicht**; `askedAt`
bleibt unangetastet.

Der gespeicherte Turn wird erst geschrieben, nachdem der Modell-Strom **von
selbst** endete und etwas anderes als Leerraum produzierte; die Iteration eines
Aufrufers endet erst, nachdem dieser Save aufgelöst hat. Wer also das Ende der
Frage erreicht hat, schaut auf eine Frage, die schon auf der Platte liegt. Eine
abgebrochene, abgelehnte oder leere Produktion hinterlässt nichts.

### Eine Produktion pro Session — die In-flight-Map

Eine Produktion der Frage bedient **jeden** wartenden Aufrufer; das macht das
Modell einmal pro Session erreichbar statt einmal pro Anfrage. Eine geteilte
Produktion kann darum keinem einzelnen Aufrufer gehören: Das Interview besitzt
einen eigenen `AbortController` pro Produktion und gibt dem Modell **dessen**
Signal, nie das eines Aufrufers.

- Das Signal eines Aufrufers beendet nur *seine* Iteration.
- `QuestionProduction` zählt seine Aufrufer (`join()` / `leave()`). Die
  Produktion wird abgebrochen, sobald **jeder** teilende Aufrufer sie
  verlassen hat — im Moment, in dem das Signal des letzten abortet, nicht erst
  beim nächsten Chunk des Modells. Ein Modell, das aufgehört hat zu produzieren,
  wird so losgelassen statt abgewartet.
- `leave()` bricht ab, ruft `production.advance()` ein letztes Mal (für einen
  Strom, der sein Signal zwischen Chunks liest) **und** `iterator.return?.()`
  (für einen Strom, der das Signal nie liest und den sonst nichts wieder
  aufweckte — sein `finally` bliebe für die Prozesslaufzeit ungelaufen). Das
  war ein Expert-Review-Fund: `advance()` ist `pending ??= pullChunk()`, sodass
  ein bereits laufender Pull den „letzten Advance" wegkoalesziert.
- Die Map, die diese Produktionen hält, ist eine Closure-Variable und damit
  **prozess-lokal**: Ein Prozess erreicht das Modell einmal pro Session, aber
  zwei Prozesse über *einem* Session-Verzeichnis können weiterhin zwei Fragen
  produzieren.

`endProduction` ruft `forget()` — löscht den Map-Eintrag — in dem Moment, in dem
der Save auflöst. Weil zwischen dem Auflösen von `openingQuestion` und dem
ersten Pull ein unbegrenzter Abstand liegt, wird die Zugehörigkeit eines
Aufrufers zu einer Produktion **beim ersten Pull** entschieden, gegen eine dann
frisch geladene Session — nicht gegen den Schnappschuss, den seine
Anfrage-Auflösung sah. Ein Aufrufer, dessen Anfrage bei noch leerer Turn-Liste
auflöste, aber erst pullt, nachdem die Produktion eines anderen gespeichert und
losgelassen wurde, replayt so die gespeicherte Frage, statt das Modell ein
zweites Mal über einen überholten Schnappschuss laufen zu lassen. (Auch das ein
Expert-Review-Fund.)

### `loadInterview` — der einzige Ladepunkt, seit M5

Seit M5 läuft jedes Laden einer Session durch eine private `loadInterview(id)`
— den **einzigen** Aufrufer von `deps.sessions.load` in dieser Datei. Der
Store gibt `state` exakt so zurück, wie `JSON.parse` es produziert hat: eine
vor M5 geschriebene Session trägt gar kein `locale`, und ein verirrter Schreib
könnte einen nicht unterstützten Tag tragen. `loadInterview` ersetzt
`state.locale` einmal durch `resolveLocale(state.locale)` (aus `locale.ts`),
bevor irgendein Leser es sieht — die vier Call-Sites (`streamQuestion`,
`begin`, `openingQuestion`, `recordAnswer`) lesen `state.locale` danach ohne
eigene Prüfung.

Das hat eine Schreib-Konsequenz, die keine Migration ist: Die zwei Saves, die
den Zustand aus einer geladenen Session neu bauen (der gefragte Turn in
`endProduction`, der beantwortete in `recordAnswer`), übernehmen
`session.state.locale` aus der **normalisierten** Session. Eine M3-Session
ohne `locale` bekommt also beim nächsten eigenen Fortschritt — einer neu
gefragten oder beantworteten Frage — die aufgelöste Fallback-Sprache
geschrieben. Das ist ein Nebeneffekt des nächsten Fortschritts der Session,
kein Migrationslauf: Kein Prozess durchsucht `~/.chrysalyst/sessions/` und
schreibt ungefragt, und eine Session, die nur gelesen wird, bleibt
Byte-identisch.

### Zwei Sprachen: `openingPrompts`

`packages/core/src/interview/prompts.ts` hält `openingPrompts`, ein
`Readonly<Record<Locale, OpeningPrompt>>` mit je einem System- und
User-Template. Jedes Template ist **eigenständig verfasst**, nicht zur
Laufzeit übersetzt, und nennt seine eigene Sprache explizit (das deutsche
System-Template endet mit „Schreibe auf Deutsch.", das englische mit einem
entsprechenden Satz auf Englisch) — ein einzelnes englisches Template mit
einer angehängten „answer in X"-Zeile wäre die schwächere Konstruktion für ein
kleines lokales Modell. `openingConversation(locale)` liest
`openingPrompts[locale]` und baut daraus die `LlmRequest`; `startProduction`
übergibt ihr `session.state.locale` aus der bereits normalisierten Session.

## `renderTranscript`

`renderTranscript(session: StoredSession<InterviewState>)` gibt das Markdown
zurück, das `transcript.md` hält — ein Kopf (Session-Kennung, beide
Envelope-Zeitstempel) und ein Abschnitt pro Turn (Frage, `askedAt`, und falls
beantwortet Antwort + `answeredAt`, sonst *still awaited*). Die Form dieses
Markdowns ist ein Fakt über die Interview-Domäne, nicht über den Store
(ADR `core-renders-transcript-store-takes-optional-renderer`): der
[Session-Store-Adapter](session-store-adapter.md) schreibt die Datei, aber
interpretiert `TState` nie, also entscheidet der Eigentümer des Zustands, wie er
liest. Die Funktion nimmt den Port-eigenen `StoredSession`, sodass der Store
`save`s Argument ohne adaptierende Lambda durchreicht. Sie ist **rein**: keine
Uhr, keine Datei, kein Modell, und dieselbe Session rendert immer denselben
Text.

## Entwurfsentscheidungen (ADRs in `specs/_decision/004-single-question-walking-skeleton.md`)

| ADR | Kern |
|---|---|
| `interviewstate-v1-turn-list-tagged-union` | Turn-Liste ab v1, getaggt über `status`, ISO-Strings |
| `core-renders-transcript-store-takes-optional-renderer` | core rendert das Transkript; der Store nimmt den Renderer als optionale Config |
| `sse-contract-three-events-single-line-json-no-id` | der SSE-Kontrakt token/done/error, einzeiliges JSON, kein `id` |
| `interview-factory-over-coredependencies-answers-absence` | Fabrik über `CoreDependencies`, drei Operationen, die Abwesenheit beantworten |
| `web-restates-wire-shapes-no-server-dependency` | `packages/web` importiert den Server nicht, deklariert die Wire-Shapes neu |
| `app-built-by-factory-server-handed-the-app` | die App wird von einer Fabrik gebaut, der Server bekommt sie gereicht |
| `styling-stack-plain-css-tokens-plus-css-modules` | plain CSS mit Token-Schicht + CSS Modules — der Styling-Stack fürs ganze Produkt |

Seit M5 kommen sechs weitere ADRs in `specs/_decision/007-bilingual-ui-and-prompts.md`
dazu, darunter `interviewstate-locale-schemaversion-unchanged` (siehe oben),
`en-is-fallback-locale` (Englisch als Fallback für eine nicht erkannte
Sprache — das Backend selbst, nicht speziell für Deutsch, gedacht) und
`prompt-templates-authored-per-locale` (die Begründung hinter den
eigenständigen Templates oben).

## Repräsentative Tests

`packages/core/src/interview/single-turn-interview.test.ts` fixiert jedes
Stück: Chunks in Reihenfolge, Speichern nur nach dem letzten Chunk, zwei
nebenläufige Anfragen erreichen das Modell einmal, ein Aufrufer bricht ab ohne
den anderen zu stören, Replay ohne zweite Inferenz, leere Produktion wird
abgelehnt, `recordAnswer` über unbekannter Session / leerer Turn-Liste / schon
beantwortetem Turn. Seit M5 zusätzlich: die gespeicherte Sprache übersteht
`begin`/`recordAnswer`, ein deutsches und ein englisches System/User-Template
unterscheiden sich in beiden Nachrichten, und eine Session ohne oder mit
nicht unterstützter Sprache fällt sowohl beim Lesen (Fallback-Templates) als
auch beim nächsten Schreiben (aufgelöster Tag auf der Platte) korrekt zurück.
`state.test-d.ts` prüft die getaggte Union und `InterviewState`s Sprachfeld
auf Typ-Ebene; `locale.test.ts`/`locale.test-d.ts` das Sprach-Vokabular selbst;
`prompts.test.ts`/`prompts.test-d.ts` die zweisprachigen Templates, inklusive
eines `@ts-expect-error`, der eine Tabelle mit fehlender Sprache ablehnt;
`transcript.test.ts` die drei Render-Zustände inkl. leerer Liste.

## Verwandte Seiten

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md) — die Ports, gegen die diese Logik geschrieben ist
- [Interview-Route, SSE-Kontrakt und Kompositionswurzel](interview-http-and-composition.md) — wie die Runde über HTTP reist
- [Dateisystem-Session-Store-Adapter](session-store-adapter.md) — schreibt `session.json` und ruft `renderTranscript`
- [Browser-Client und Designsystem](web-client.md) — die andere Seite der Runde
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) — die Feature-Spec `interview/single-question-interview` und die 7 ADRs

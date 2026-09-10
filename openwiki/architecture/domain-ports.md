---
type: architecture
title: Domänen-Ports (@chrysalyst/core)
description: Die Domänengrenze von chrysalyst — CoreDependencies und die vier Ports LlmPort, SessionStorePort, SearchPort und ClockPort, ihre Entwurfsentscheidungen, die Vertragstests, und dass der Einstiegspunkt seit M3 neben den Port-Typen auch die Interview-Logik als Wert exportiert.
tags: [hexagonal-architecture, ports, domain-core, typescript, dependency-injection]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
sources:
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-27afedd47a4115ebbd33f343
    resource: repo://packages/core/src/index.test.ts
  - id: openwiki-source-d265cc7c06dcbefb6f92a01b
    resource: repo://packages/core/src/index.ts
  - id: openwiki-source-1f5e2ec8cd020d62ed6b5a14
    resource: repo://packages/core/src/interview/index.ts
  - id: openwiki-source-df99a04c4843621452957144
    resource: repo://packages/core/src/interview/single-turn-interview.ts
  - id: openwiki-source-f485baa422c0c157e847894a
    resource: repo://packages/core/src/ports/clock.ts
  - id: openwiki-source-464bbff80fb9fcd0f9f85088
    resource: repo://packages/core/src/ports/dependencies.ts
  - id: openwiki-source-53b2f5508d69d2691769082c
    resource: repo://packages/core/src/ports/llm.ts
  - id: openwiki-source-aade1f45c98c13a372470076
    resource: repo://packages/core/src/ports/ports.test-d.ts
  - id: openwiki-source-3206cb8ba21ec26d29ee35d0
    resource: repo://packages/core/src/ports/ports.test.ts
  - id: openwiki-source-63a6fb729edc33fb96617cc3
    resource: repo://packages/core/src/ports/session-store.ts
  - id: openwiki-source-1c53a59d367e22813b6fb932
    resource: repo://packages/core/vitest.config.ts
  - id: openwiki-source-d029aff745f51782afcfa87d
    resource: repo://specs/platform/core-ports-contract/spec.md
  - id: openwiki-source-3e167c00b37218b53fb81835
    resource: repo://specs/platform/session-store-port/spec.md
  - id: openwiki-source-1eddfe2a3e905b4c50618167
    resource: repo://tests/workspace.test.ts
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
---

# Domänen-Ports (@chrysalyst/core)

`@chrysalyst/core` ist die innerste Schicht der hexagonalen Architektur: die
Menge der Schnittstellen, über die die Domänenlogik ein Sprachmodell, eine
Websuche, Session-Speicherung und die Uhrzeit erreicht — und seit M3 die erste
gegen diese Ports geschriebene Domänenlogik selbst, die
[Interview-Runde](interview-round.md). Das Paket enthält keinen Adapter und
**keine Laufzeit-Abhängigkeit**; seine Regel verbietet eine Abhängigkeit, nicht
Ausführung.

## Verantwortung und Eigentümerschaft

Das Paket besitzt das **Vokabular der Domäne**. Jeder Port ist in den Begriffen
formuliert, die das Interview braucht (`LlmRequest`, `StoredSession`,
`SearchHit`), nie in denen eines Anbieters (kein `baseURL`, kein HTTP-Status,
kein Dateipfad). Adapter, die diese Ports erfüllen, liegen außerhalb, in
`packages/server` — der [LLM-Adapter](llm-adapter.md) und der
[Dateisystem-Session-Store](session-store-adapter.md); die Suche folgt später.

Der öffentliche Einstiegspunkt `packages/core/src/index.ts` reicht die
Port-Deklarationen mit `export type *` aus `ports/index.ts` weiter **und**
re-exportiert seit M3 die Interview-Logik als Wert (`export * from
'./interview/index.ts'` — Zustand, Transkript-Rendering, die Ein-Runden-Logik).
Ein Import zieht damit die Laufzeit-Bindungen des Interviews nach, öffnet aber
weiterhin keinen Socket, liest keine Datei und keine Uhr — der Test
`opens no socket when imported` in `packages/core/src/index.test.ts` hält das
fest, und `core-ports-contract` bekam dafür das Szenario *Domänenlogik ist vom
Einstiegspunkt erreichbar, ohne eine Uhr oder das Dateisystem zu berühren*.

## Der typ-only-Invariant

Dass `@chrysalyst/core` beim Import **nichts nachzieht** — kein Framework, kein
Netzwerk-Client, kein Dateisystem — ist kein Zufall, sondern eine erzwungene
Regel. Sie verbietet eine *Abhängigkeit*, nicht Domänencode:

- `packages/core/package.json` deklariert **keine** `dependencies`, nur
  `devDependencies` für den Test.
- Der Nicht-Test-Quellcode importiert weder ein Node-Built-in noch ein
  Drittanbieter-Modul — nur relative `./*.ts`-Pfade.
- `tests/workspace.test.ts` prüft beides ausführbar: der Test `core declares no
  runtime dependencies and its non-test source imports none` scannt jede
  Nicht-Test-Datei unter `packages/core/src` und schlägt fehl, sobald ein
  nicht-relativer Import auftaucht.

Der Grund: Die Domäne soll in jeder Umgebung identisch übersetzbar sein. Die
Interview-Logik gehorcht derselben Regel — sie erreicht Modell, Speicher und
Uhr nur über die injizierten `CoreDependencies`. Testdoubles, die für einen
Port einspringen, leben in den eigenen Testdateien des Pakets und sind von der
Reinheitsregel ausgenommen.

## CoreDependencies — was die Domäne braucht

`CoreDependencies<TState>` bündelt alles, was der Domäne übergeben werden muss,
bevor sie laufen kann:

| Member | Pflicht | Zweck |
|--------|---------|-------|
| `llm` | ja | Zugriff auf das Sprachmodell |
| `sessions` | ja | Persistenz der Interview-Sessions |
| `clock` | ja | die aktuelle Zeit |
| `search` | **nein** | optionale Anreicherung mit Websuche |

`search` ist das einzige optionale Member. chrysalyst führt ein Interview auch
ohne Suche zu Ende — nur ohne Anreicherung. Die Abwesenheit wird als
**weggelassenes Member** ausgedrückt, nicht als Flag: So gibt es keinen Zustand
„aktiviert, aber nicht verdrahtet", und der Compiler zwingt jeden Aufrufer, den
fehlenden Fall zu behandeln. `ports.test-d.ts` fixiert das mit
`@ts-expect-error`-Assertions — ein Satz ohne `llm`, `sessions` oder `clock`
verletzt den Typ, ein Satz ohne `search` nicht.

## Die vier Ports

### LlmPort

Die Grenze zum Sprachmodell, formuliert in Gesprächs-Begriffen statt in der
HTTP-Oberfläche eines Anbieters. Drei Methoden, weil sich die Aufrufer
unterscheiden:

- `status(signal?)` — beantwortet, ob das Backend eine Anfrage bedienen kann
  (`LlmBackendStatus` mit `available` und einer Modell-Liste). Die Liste ist
  immer vorhanden, **darf aber leer sein**: Ein Adapter, der seine Modelle
  erfragt, hat nichts zu melden, sobald das Backend nicht mehr antwortet.
- `complete(request, signal?)` — die fertige Antwort als ein String. Für einen
  Aufrufer wie eine Widerspruchsprüfung, der den ganzen Text will.
- `stream(request, signal?)` — die Antwort als `AsyncIterable<string>` in der
  Reihenfolge, in der das Modell sie produziert. Für das Interview, das die
  Antwort beim Entstehen zeigen will.

Jede Methode nimmt ein optionales `AbortSignal`, weil Inferenz auf einer
lokalen Maschine lange genug läuft, dass ein Nutzer sie mitten in der Antwort
abbrechen will. `LlmRequest` nennt die Gesprächsturns und höchstens ein Modell —
Sampling-Parameter und Antwortformen bleiben draußen, bis ein Use-Case sie
braucht.

Die erste echte Implementierung dieses Ports ist der
[LLM-Adapter](llm-adapter.md) in `packages/server`.

### SessionStorePort

Die Grenze, durch die Interview-Sessions einen Prozess überdauern. Drei
Methoden — `list`, `load`, `save` — und zwei Entwurfsentscheidungen prägen sie:

- **Generisch über `TState`.** Der Store interessiert sich nicht dafür, was
  eine Session enthält. Das erste Interview-Feature liefert diesen Typ, ohne den
  Port anzufassen — nichts hier muss ihn vorab erraten.
- **Kein `delete`.** Kein Use-Case verlangt, eine Session zu entfernen, und eine
  unerbetene Methode müsste jeder künftige Adapter ungetestet implementieren.

`load` trennt **Abwesenheit von Beschädigung**: Eine `SessionId`, die nie
gespeichert wurde, liefert `undefined` — ein toter Link ist ein gewöhnlicher
Ausgang, kein Fehler. Ist der Datensatz dagegen vorhanden, aber die
Implementierung kann ihn nicht zurücklesen, **wirft** `load` (der Vertrag lässt
das Ablehnen ausdrücklich zu). So meldet `undefined` immer nur Abwesenheit und
nie einen Datensatz, dessen Laden fehlgeschlagen ist — sonst begänne ein
Aufrufer stumm eine neue Session über einer, deren Zustand er bloß nicht laden
konnte. `list` lehnt über einem einzelnen beschädigten Datensatz **nicht** ab;
ob es eine Kennung meldet, deren Datensatz es nicht lesen kann, entscheidet die
Implementierung. `save` ersetzt jede frühere Revision derselben Kennung.

Die erste echte Implementierung ist der
[Dateisystem-Session-Store](session-store-adapter.md) in `packages/server`.

### SearchPort

Die Grenze, durch die die Domäne eine Antwort mit Web-Ergebnissen anreichert.
Sie beschreibt nur, was die Anreicherung braucht — nie die Query-Syntax oder das
Ergebnis-Envelope einer Suchmaschine. Ein `SearchHit` trägt `title`, `url` und
`snippet`.

### ClockPort

Die Grenze, durch die die Domäne den aktuellen Zeitpunkt erfährt. Zeit kommt als
Abhängigkeit statt aus der System-Uhr, damit Session-Buchführung und
Interview-Zeitstempel unter Test reproduzierbar und überall identisch sind.
`now()` liefert das `Date`, das der Aufrufer als „jetzt" behandeln soll.

## Vertragstests

Der Port-Vertrag wird auf zwei Ebenen geprüft, beide in `packages/core` selbst:

- **Verhalten** — `packages/core/src/ports/ports.test.ts` baut minimale
  Testdoubles (`stubLlm`, `memorySessionStore`, `stubSearch`, `fixedClock`) und
  prüft die beobachtbaren Zusagen: Chunks kommen in Reihenfolge, `complete`
  liefert einen String ohne Iterator, `load` einer nie gespeicherten ID ist
  `undefined`, ein abgebrochenes Signal stoppt den Stream. Ein zweites
  Session-Double (`guardedSessionStore`) hält unter einer Kennung einen Marker,
  den es nicht als Session zurücklesen kann, und fixiert damit die
  Abwesenheit-vs.-Beschädigung-Regel: `load` über dem beschädigten Datensatz
  wirft, `load` einer nie gespeicherten ID bleibt `undefined`, und `list` läuft
  ohne Ablehnung durch.
- **Typ-Ebene** — `packages/core/src/ports/ports.test-d.ts` läuft unter Vitists
  `typecheck`-Modus und stellt sicher, dass der Einstiegspunkt jeden Port-Typ
  und die von den Signaturen genannten Hilfstypen exportiert, dass
  `CoreDependencies` die richtigen Pflicht-/Optional-Member erzwingt, und dass
  eine nicht-konforme Implementierung (etwa `status`, das einen String liefert)
  den Typcheck bricht.

Der `typecheck`-in-Test-Modus ist in `packages/core/vitest.config.ts` aktiviert;
ein Fehler in `ports.test-d.ts` erscheint damit als Testfehler, nicht nur als
`tsc`-Fehler. Details zur Teststrategie:
[Toolchain und Teststrategie](../operations/toolchain-and-testing.md).

## Verwandte Seiten

- [Architekturüberblick](overview.md) — wie core, server und web zusammenspielen
- [Interview-Runde (@chrysalyst/core)](interview-round.md) — der erste echte
  Aufrufer dieser Ports
- [LLM-Adapter](llm-adapter.md) — die erste echte Port-Implementierung
- [Dateisystem-Session-Store](session-store-adapter.md) — die Implementierung von
  `SessionStorePort`
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) —
  die permanenten Feature-Specs `platform/core-ports-contract`,
  `platform/llm-port` und `platform/session-store-port`, die diesen Vertrag
  festhalten

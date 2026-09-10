---
type: architecture
title: Architekturüberblick
description: Die hexagonale Struktur von chrysalyst — die drei Pakete core/server/web, die Abhängigkeitsrichtung, die Auflösung über TypeScript-Quellcode und die meilensteingetriebene Walking-Skeleton-Baureihenfolge.
tags: [architecture, hexagonal, monorepo, ports-and-adapters, roadmap]
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-d265cc7c06dcbefb6f92a01b
    resource: repo://packages/core/src/index.ts
  - id: openwiki-source-14c7fc2cd7605010c868d4c7
    resource: repo://packages/server/src/app.ts
  - id: openwiki-source-d3fb78d820eb72194e376138
    resource: repo://packages/server/src/composition.ts
  - id: openwiki-source-d952717f7ba616148cf6047b
    resource: repo://packages/web/src/App.tsx
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-27db56ec5f5b550679beca36
    resource: repo://specs/platform/monorepo-workspace/spec.md
  - id: openwiki-source-2d3fac86f9ec693be8ecab61
    resource: repo://specs/platform/web-shell/spec.md
  - id: openwiki-source-a0a8fcea3fc317de88a8e08c
    resource: repo://specs/roadmap.md
  - id: openwiki-source-1eddfe2a3e905b4c50618167
    resource: repo://tests/workspace.test.ts
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
---

# Architekturüberblick

chrysalyst ist eine lokale Web-App, die vage Produktideen per LLM-gestütztem
Interview zu einer strukturierten Spezifikation verdichtet. Der Code ist als
**hexagonale Architektur** (Ports & Adapter) organisiert: eine framework-freie
Domäne im Zentrum, austauschbare Adapter für LLM, Suche, Persistenz und HTTP am
Rand.

## Die drei Pakete

Der pnpm-Workspace enthält genau drei private Pakete unter `packages/`:

| Paket | Rolle | Abhängigkeiten |
|-------|-------|----------------|
| `@chrysalyst/core` | Die Domänengrenze: [Ports](domain-ports.md) als Typen **plus** die [Interview-Runde](interview-round.md) als Wert-Export | keine Laufzeit-Abhängigkeit |
| `@chrysalyst/server` | Adapter + [HTTP-Prozess](http-server.md); [LLM-Adapter](llm-adapter.md), [Session-Store](session-store-adapter.md), [Interview-Route + Kompositionswurzel](interview-http-and-composition.md) | `@chrysalyst/core` (workspace) + `hono`, `@hono/node-server`, `ai`, `@ai-sdk/openai-compatible`, `zod` |
| `@chrysalyst/web` | Browser-Client (Vite + React): die [streamende Frage-Ansicht](web-client.md), ein treibender Adapter | keine interne Abhängigkeit |

### Abhängigkeitsrichtung

Sie läuft strikt von außen nach innen:

- `@chrysalyst/server` hängt über `workspace:*` an `@chrysalyst/core`.
- `@chrysalyst/core` hängt an **nichts** Internem und importiert in seinem
  Nicht-Test-Quellcode weder ein Node-Built-in noch ein Drittanbieter-Modul —
  auch die Interview-Logik erreicht Modell, Speicher und Uhr nur über die
  injizierten `CoreDependencies`.
- `@chrysalyst/web` hängt weder an `core` noch an `server` und importiert keine
  Domänenlogik — der Browser-Client deklariert den Wire-Kontrakt neu
  ([decision-log](interview-round.md), ADR `web-restates-wire-shapes-no-server-dependency`).

`tests/workspace.test.ts` ist der **ausführbare Wächter** dieser Regeln: Es
prüft, dass der Workspace genau die drei Pakete enthält, dass jedes ESM
(`"type": "module"`) und `"private": true` ist und die Skripte
`build`/`test`/`typecheck`/`dev` deklariert, dass `core` seinen Einstiegspunkt
als TypeScript-Quelle exportiert, dass `server → core` das Workspace-Protokoll
nutzt, und dass jede externe Abhängigkeit über den `catalog:`-Specifier
referenziert wird.

## Auflösung über Quellcode, kein Build

Pakete lösen einander über TypeScript-Quelldateien auf, nicht über gebautes
Ausgabe-Verzeichnis: `@chrysalyst/core`s `exports` zeigt auf `./src/index.ts`.
Node ≥ 22.18 streift Typen zur Laufzeit, sodass `test` und `typecheck` **keinen
vorherigen Build brauchen**. `build` ist für `core` und `server` nur ein
`tsc --noEmit` (Typprüfung), für `web` ein `vite build`. Details:
[Toolchain und Teststrategie](../operations/toolchain-and-testing.md).

## Aktueller Stand

Seit M3 läuft die **erste senkrechte Scheibe end-to-end**: Browser → lokales
Modell → Hono-SSE → `core`-Use-Case → `session.json`. Vorhanden und getestet:

- die vier Domänen-Ports als Typen plus `CoreDependencies`, und die erste
  Domänenlogik dagegen — die [Interview-Runde](interview-round.md)
  (`begin` / `openingQuestion` / `recordAnswer`, `InterviewState` v1, das
  Transkript-Rendering)
- zwei echte Adapter: der [OpenAI-kompatible LLM-Adapter](llm-adapter.md) für
  Ollama und der [Dateisystem-Session-Store](session-store-adapter.md) über
  `~/.chrysalyst/sessions/<id>/` (JSON-Envelope mit `schemaVersion` plus
  Markdown-Transkript, das jetzt echten Interview-Inhalt trägt)
- der [HTTP-Server](http-server.md): `createApp(deps)` als Fabrik, `GET /health`
  **und** die [Interview-Route mit SSE-Strom](interview-http-and-composition.md);
  die Kompositionswurzel `composition.ts` montiert beide Adapter an die App
- der [Browser-Client](web-client.md): die streamende Frage-Ansicht
  `InterviewView`, ein SSE-Frame-Parser, ein editoriales Designsystem
  (`DESIGN.md`, plain CSS + Token-Schicht + CSS Modules)

Es gibt **noch keine** Turn-Schleife, keinen Fragebaum, keine Destillation,
keine Widerspruchsprüfung und keinen CI-Workflow. Die Frage entsteht kalt aus
einem festen Prompt — kein Ideen-Eingang. Genau eine Runde.

## Baureihenfolge: Walking Skeleton, dann vertiefen

`specs/roadmap.md` ordnet die Arbeit in Meilensteine M0…M18 plus einen
Post-v1-Meilenstein. Die Strategie: M1–M3 bauen eine dünne senkrechte Scheibe
durch alle Schichten — echter Ollama-Adapter, echter Dateisystem-Session-Store,
minimaler Use-Case in `core`, SSE-Route, eine React-Ansicht — **bevor**
Fragebaum, Destillation oder Widerspruchsprüfung existieren. Grund: Die Mission
behauptet, kleine lokale Modelle genügen für strukturierte Interviewführung;
das ist nur an einem echten Modell falsifizierbar.

| Meilenstein | Stand |
|-------------|-------|
| M0 Monorepo-Scaffold | ✅ erledigt (`001-add-monorepo-scaffold`) |
| M1 Ollama-LLM-Adapter | ✅ erledigt (`002-add-ollama-llm-adapter`) |
| M2 Dateisystem-Session-Store | ✅ erledigt (`003-add-filesystem-session-store`) |
| M3 Walking Skeleton + Engine-Spike | 🟡 teilweise — Plan `004-single-question-walking-skeleton` erledigt; `engine-structure-spike` noch offen |
| M4…M18, P1 | ⬜ offen |

Zwei Chores stehen daneben: C1 (`openwiki --init` — dieses Wiki) und C2
(minimale CI).

### Roadmap-Leitplanken

Entscheidungen, die für die ganze Roadmap gelten:

- **Kein Agent-Framework in der Domäne** — die Interview-Engine lebt in
  `packages/core` als eigener, deterministischer Code (kein
  LangChain/LangGraph/deepagents als Domänen-Abhängigkeit).
- **`LlmPort`-Adapter = Vercel AI SDK (`ai` v6)** in `packages/server`, hinter
  dem Port; `packages/core` importiert es nie.
- **Kein Cloud-LLM-SDK** irgendwo im Produktcode.
- **`schemaVersion`** auf jeder persistierten Session ab M2 — vom
  [Session-Store](session-store-adapter.md) mit `schemaVersion 1` umgesetzt.
- **Engine-Struktur** (hand-gerollter Zustandsautomat vs. LangGraph.js) —
  offen, Wegwerf-Spike im M3-Plan `engine-structure-spike`. Der Walking Skeleton
  baut bewusst keine Engine: seine `core`-Logik ist die einfachste Funktion über
  `CoreDependencies`.
- **Styling-Stack** — plain CSS mit Custom-Property-Token-Schicht + CSS Modules,
  seit M3 festgelegt (ADR `styling-stack-plain-css-tokens-plus-css-modules`).

## Verwandte Seiten

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md)
- [Interview-Runde (@chrysalyst/core)](interview-round.md) — die erste Domänenlogik
- [Interview-Route, SSE-Kontrakt und Kompositionswurzel](interview-http-and-composition.md)
- [Browser-Client und Designsystem](web-client.md)
- [LLM-Adapter (OpenAI-kompatibel / Ollama)](llm-adapter.md)
- [Dateisystem-Session-Store-Adapter](session-store-adapter.md)
- [HTTP-Server (@chrysalyst/server)](http-server.md)
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) —
  wie Meilensteine zu Code werden
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md)

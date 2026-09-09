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
  - id: openwiki-source-aabd04ae8e74d1778fabc2fb
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.ts
  - id: openwiki-source-71e3a7de53c44488096fed02
    resource: repo://packages/server/src/adapters/session-store/filesystem-session-store.ts
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
generated: { by: "claude-code", at: "2026-09-09T13:28:50.488Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-09T13:28:50.488Z
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
| `@chrysalyst/core` | Die Domänengrenze: [Ports als Typen](domain-ports.md), keine Implementierung | keine Laufzeit-Abhängigkeit |
| `@chrysalyst/server` | Adapter + [HTTP-Prozess](http-server.md); enthält den [LLM-Adapter](llm-adapter.md) und den [Dateisystem-Session-Store](session-store-adapter.md) | `@chrysalyst/core` (workspace) + `hono`, `@hono/node-server`, `ai`, `@ai-sdk/openai-compatible`, `zod` |
| `@chrysalyst/web` | Browser-Shell (Vite + React) | keine interne Abhängigkeit |

### Abhängigkeitsrichtung

Sie läuft strikt von außen nach innen:

- `@chrysalyst/server` hängt über `workspace:*` an `@chrysalyst/core`.
- `@chrysalyst/core` hängt an **nichts** Internem und importiert in seinem
  Nicht-Test-Quellcode weder ein Node-Built-in noch ein Drittanbieter-Modul.
- `@chrysalyst/web` hängt weder an `core` noch an `server` und importiert keine
  Domänenlogik — der Web-Client des treibenden Adapters kommt mit dem ersten
  Interview-Feature.

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

Das Projekt ist früh. Vorhanden und getestet:

- die vier Domänen-Ports als Typen (`LlmPort`, `SessionStorePort`, `SearchPort`,
  `ClockPort`) plus `CoreDependencies`
- zwei echte Adapter: der [OpenAI-kompatible LLM-Adapter](llm-adapter.md) für
  Ollama und der [Dateisystem-Session-Store](session-store-adapter.md) über
  `~/.chrysalyst/sessions/<id>/` (JSON-Envelope mit `schemaVersion` plus
  Markdown-Transkript)
- der [HTTP-Server](http-server.md) mit einer einzigen `GET /health`-Route
- die Web-Shell — derzeit ein einziger `<h1>chrysalyst</h1>`-Platzhalter; das
  visuelle Design kommt mit dem ersten UI-Feature

Es gibt **noch keine** Interview-Engine, keinen Fragebaum, keine Destillation,
keine SSE-Route und keinen CI-Workflow. Weder der LLM-Adapter noch der
Session-Store ist an die Hono-App montiert.

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
| M3 Walking Skeleton + Engine-Spike | ⬜ offen — der nächste |
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
  offen, Wegwerf-Spike in M3.

## Verwandte Seiten

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md)
- [LLM-Adapter (OpenAI-kompatibel / Ollama)](llm-adapter.md)
- [Dateisystem-Session-Store-Adapter](session-store-adapter.md)
- [HTTP-Server (@chrysalyst/server)](http-server.md)
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) —
  wie Meilensteine zu Code werden
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md)

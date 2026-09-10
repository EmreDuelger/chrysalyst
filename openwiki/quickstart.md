---
type: quickstart
title: Quickstart
description: Einstieg in chrysalyst — was das Projekt ist, das Drei-Paket-Layout, die Build-/Test-/Dev-Befehle und eine Aufgaben-Wegweiser-Karte in den Rest des Wikis.
tags: [quickstart, onboarding, monorepo, getting-started]
sources:
  - id: openwiki-source-7c03237a6b57ffb3e526a51b
    resource: repo://.nvmrc
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-71e3a7de53c44488096fed02
    resource: repo://packages/server/src/adapters/session-store/filesystem-session-store.ts
  - id: openwiki-source-d3fb78d820eb72194e376138
    resource: repo://packages/server/src/composition.ts
  - id: openwiki-source-0443590d078e8b72afcd56c2
    resource: repo://packages/server/src/routes/interview-routes.live.test.ts
  - id: openwiki-source-d952717f7ba616148cf6047b
    resource: repo://packages/web/src/App.tsx
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-2812cf8b7d042d18c8d41484
    resource: repo://specs/mission.md
  - id: openwiki-source-a0a8fcea3fc317de88a8e08c
    resource: repo://specs/roadmap.md
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
---

# Quickstart

**chrysalyst** verwandelt vage Produktideen durch ein geführtes, LLM-gestütztes
Interview in klare, widerspruchsfreie, übergabereife Spezifikationen. Die App
läuft lokal gegen ein kleines LLM (Ollama, llama.cpp, LM Studio) — statt zu
raten, stellt sie gezielte Rückfragen und destilliert die Antworten Schritt für
Schritt zu einer strukturierten Spec samt Register der Annahmen und offenen
Fragen. Das *Was* und *Warum* steht in `specs/mission.md`.

## Stand des Projekts

Seit M3 läuft die erste senkrechte Scheibe **end-to-end**: Der Browser lädt,
legt eine Session an, ein lokales Modell (`qwen3:8b` auf der Referenzmaschine)
schreibt **eine** Rückfrage Token für Token in die Ansicht, die getippte Antwort
landet in `session.json` samt Transkript. Vorhanden: die typ-only Domänenschicht
plus die [Interview-Runde](architecture/interview-round.md) als Domänenlogik,
**zwei** echte Adapter (LLM, Dateisystem-Session-Store), der
[HTTP-Server mit SSE-Route](architecture/interview-http-and-composition.md), und
der [Browser-Client](architecture/web-client.md) mit einem editorialen
Designsystem.

Genau **eine Runde** — kein Turn-Loop, kein Fragebaum, keine Destillation, kein
CI-Workflow, kein Ideen-Eingang (die Frage entsteht kalt). Die Oberfläche ist
Englisch bis M5.

## Das Layout

```
packages/
  core/     @chrysalyst/core   — Domänen-Ports als Typen + die Interview-Runde als Wert-Export
  server/   @chrysalyst/server — Adapter (LLM, Session-Store) + Hono-HTTP-Server, SSE-Interview-Route, Kompositionswurzel
  web/      @chrysalyst/web    — Vite + React; die streamende Frage-Ansicht, ein treibender Adapter
specs/      Mission, Roadmap, Feature-Specs (platform/ adapters/ interview/), Pläne, ADRs
tests/      workspace.test.ts + fixtures/ (u. a. die geteilte SSE-Frame-Fixture)
openwiki/   dieses Wiki
```

Voraussetzungen: **Node ≥ 22.18** (die konkrete Version steht in `.nvmrc`) und
**pnpm** in der von `package.json` `packageManager` gepinnten Version.

## Befehle

| Zweck | Befehl |
|-------|--------|
| Installieren | `pnpm install` |
| Dev (web + server parallel) | `pnpm dev` |
| Test (alle Pakete + Workspace-Suite) | `pnpm -r --include-workspace-root test` |
| Build | `pnpm -r build` |
| Typecheck | `pnpm typecheck` |
| Lint / Format | `pnpm lint` · `pnpm format` · `pnpm format:check` |
| Coverage | `pnpm -r test --coverage` |

`test` und `typecheck` brauchen **keinen** vorherigen Build. Der Live-Test-Tier
(`*.live.test.ts`, zwei Suites) läuft nur mit `CHRYSALYST_LIVE_LLM=1` und einem
erreichbaren Ollama — z. B.
`CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test`.

Sessions liegen unter `~/.chrysalyst/sessions/<id>/` (je `session.json` +
`transcript.md`); `CHRYSALYST_SESSION_DIR` überschreibt die Wurzel.

## Wohin als Nächstes

| Frage | Seite |
|-------|-------|
| Wie ist der Code strukturiert? | [Architekturüberblick](architecture/overview.md) |
| Was ist die Domänengrenze, was sind die Ports? | [Domänen-Ports (@chrysalyst/core)](architecture/domain-ports.md) |
| Wie erreicht die App ein Sprachmodell? | [LLM-Adapter (OpenAI-kompatibel / Ollama)](architecture/llm-adapter.md) |
| Wie überdauern Sessions einen Prozess? | [Dateisystem-Session-Store-Adapter](architecture/session-store-adapter.md) |
| Was ist die Interview-Runde als Domänenlogik? | [Interview-Runde (@chrysalyst/core)](architecture/interview-round.md) |
| Wie reist eine Runde über HTTP (SSE, Komposition)? | [Interview-Route, SSE-Kontrakt und Kompositionswurzel](architecture/interview-http-and-composition.md) |
| Wie sieht die Frage-Ansicht aus, was ist das Designsystem? | [Browser-Client und Designsystem](architecture/web-client.md) |
| Was macht der Server-Prozess? | [HTTP-Server (@chrysalyst/server)](architecture/http-server.md) |
| Wie entstehen Features? Was kommt als Nächstes? | [Spec-getriebene Entwicklung (speq)](workflow/spec-driven-development.md) |
| Wie laufen Build, Lint, Tests? | [Toolchain und Teststrategie](operations/toolchain-and-testing.md) |

Arbeitsweise, Tool-Rollen und die Standard-Route stehen in `CLAUDE.md`;
OpenWiki-Hinweise für Agenten in `AGENTS.md`.

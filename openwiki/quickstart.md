---
type: quickstart
title: Quickstart
description: Einstieg in chrysalyst — was das Projekt ist, das Drei-Paket-Layout, die Build-/Test-/Dev-Befehle und eine Aufgaben-Wegweiser-Karte in den Rest des Wikis.
tags: [quickstart, onboarding, monorepo, getting-started]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-07T20:27:51.484Z
sources:
  - id: openwiki-source-7c03237a6b57ffb3e526a51b
    resource: repo://.nvmrc
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-2812cf8b7d042d18c8d41484
    resource: repo://specs/mission.md
generated: { by: "claude-code", at: "2026-09-07T20:27:51.484Z" }
---

# Quickstart

**chrysalyst** verwandelt vage Produktideen durch ein geführtes, LLM-gestütztes
Interview in klare, widerspruchsfreie, übergabereife Spezifikationen. Die App
läuft lokal gegen ein kleines LLM (Ollama, llama.cpp, LM Studio) — statt zu
raten, stellt sie gezielte Rückfragen und destilliert die Antworten Schritt für
Schritt zu einer strukturierten Spec samt Register der Annahmen und offenen
Fragen. Das *Was* und *Warum* steht in `specs/mission.md`.

## Stand des Projekts

Früh. Ein Monorepo-Gerüst mit der typ-only Domänenschicht, **einem** echten
Adapter (dem LLM-Adapter), einem dünnen HTTP-Server mit einer `/health`-Route
und einer Platzhalter-React-Shell (`<h1>chrysalyst</h1>`). Es gibt noch keine
Interview-Engine, keinen Fragebaum, keine Destillation und keinen CI-Workflow.

## Das Layout

```
packages/
  core/     @chrysalyst/core   — Domänen-Ports als Typen, keine Laufzeit-Abhängigkeit
  server/   @chrysalyst/server — Adapter (LLM) + Hono-HTTP-Server
  web/      @chrysalyst/web    — Vite + React Browser-Shell
specs/      Mission, Roadmap, Feature-Specs, Pläne, ADRs
tests/      workspace.test.ts  — der ausführbare Wächter der Workspace-Invarianten
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
(`*.live.test.ts`) läuft nur mit `CHRYSALYST_LIVE_LLM=1` und einem erreichbaren
Ollama.

## Wohin als Nächstes

| Frage | Seite |
|-------|-------|
| Wie ist der Code strukturiert? | [Architekturüberblick](architecture/overview.md) |
| Was ist die Domänengrenze, was sind die Ports? | [Domänen-Ports (@chrysalyst/core)](architecture/domain-ports.md) |
| Wie erreicht die App ein Sprachmodell? | [LLM-Adapter (OpenAI-kompatibel / Ollama)](architecture/llm-adapter.md) |
| Was macht der Server-Prozess? | [HTTP-Server (@chrysalyst/server)](architecture/http-server.md) |
| Wie entstehen Features? Was kommt als Nächstes? | [Spec-getriebene Entwicklung (speq)](workflow/spec-driven-development.md) |
| Wie laufen Build, Lint, Tests? | [Toolchain und Teststrategie](operations/toolchain-and-testing.md) |

Arbeitsweise, Tool-Rollen und die Standard-Route stehen in `CLAUDE.md`;
OpenWiki-Hinweise für Agenten in `AGENTS.md`.

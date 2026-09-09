---
type: workflow
title: Spec-getriebene Entwicklung (speq)
description: Wie chrysalyst sich entwickelt — der speq-Lebenszyklus mission → plan → implement → record, das specs/-Verzeichnislayout, die Meilenstein-Roadmap mit ihren Leitplanken und die ADR-Beförderung im decision-log.
tags: [workflow, speq, spec-driven-development, roadmap, adr, process]
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-0c0f824f90b5cb267847f935
    resource: repo://specs/_decision/002-add-ollama-llm-adapter.md
  - id: openwiki-source-0e06dd8dca1a5b09ef9998b2
    resource: repo://specs/_decision/003-add-filesystem-session-store.md
  - id: openwiki-source-036a781dce1c104f30b0e058
    resource: repo://specs/_recorded/001-add-monorepo-scaffold/plan.md
  - id: openwiki-source-61eb124c04322f3f00e4805b
    resource: repo://specs/_recorded/002-add-ollama-llm-adapter/plan.md
  - id: openwiki-source-38dee3393ae874bc2be2a36f
    resource: repo://specs/_recorded/002-add-ollama-llm-adapter/verification-report.md
  - id: openwiki-source-f456d7350e9ff3cd973128ab
    resource: repo://specs/_recorded/003-add-filesystem-session-store/plan.md
  - id: openwiki-source-8f43520ecd17db2dd2f46900
    resource: repo://specs/adapters/filesystem-session-store/spec.md
  - id: openwiki-source-27db56ec5f5b550679beca36
    resource: repo://specs/platform/monorepo-workspace/spec.md
  - id: openwiki-source-a0a8fcea3fc317de88a8e08c
    resource: repo://specs/roadmap.md
generated: { by: "claude-code", at: "2026-09-09T13:28:50.488Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-09T13:28:50.488Z
---

# Spec-getriebene Entwicklung (speq)

chrysalyst wird spec-getrieben entwickelt: Kein Feature entsteht im Code, bevor
es als Spezifikation mit prüfbaren Szenarien beschrieben ist. Das Werkzeug dafür
ist **speq**; `CLAUDE.md` nennt es „das Rückgrat". Dieses Dokument beschreibt
den Lebenszyklus, das `specs/`-Layout und die Roadmap.

## Der Lebenszyklus: mission → plan → implement → record

`CLAUDE.md` legt die Standard-Route fest. Jeder offene Meilenstein durchläuft
sie:

| Phase | Befehl | Ergebnis |
|-------|--------|----------|
| Mission | `/speq:mission` | `specs/mission.md` — einmalig bzw. bei Drift |
| Plan | `/speq:plan <name>` | Klärungs-Interview, Spec-Deltas, `plan.md`, `decision-log.md` in `specs/_plans/<name>/`, adversariale Plan-Review; **Stopp**: ein Mensch reviewt `plan.md` |
| Implement | `/speq:implement <name>` | TDD-Subagenten, adversariale Code-Review, `verification-report.md`; Verifikationsbefehle real ausgeführt |
| Record | `/speq:record <name>` | Spec-Deltas in die permanente Bibliothek gemerged, Plan nach `specs/_recorded/` archiviert, ADRs befördert |
| Wiki + Branch | `openwiki`, `superpowers:finishing-a-development-branch` | Wiki regeneriert, Branch integriert |

Regel aus `CLAUDE.md`: immer den **obersten noch offenen** Meilenstein nehmen;
kein Vorgreifen ohne Ansage. Nach jedem `/speq:record` wird der Status in
`specs/roadmap.md` fortgeschrieben.

### Abkürzungen

Erlaubt, aber nur auf Ansage und mit Begründung: Doku-/Config-Einzeiler direkt
umsetzen; ein Bug zuerst durch `superpowers:systematic-debugging` (ändert der
Fix Spec-Verhalten, zurück in `/speq:plan`); reine UI-Politur direkt über
`impeccable`.

## Das `specs/`-Verzeichnis

| Pfad | Inhalt |
|------|--------|
| `specs/mission.md` | Autoritativ für das *Was* und *Warum* — Problem, Zielnutzer, Core Capabilities, Out-of-Scope, Glossar |
| `specs/roadmap.md` | Autoritativ für die **Reihenfolge** — Meilensteine und Leitplanken |
| `specs/platform/<feature>/spec.md` | Permanente Feature-Specs der Plattform-Schicht, Szenarien im Gherkin-Stil (`GIVEN`/`WHEN`/`THEN`) |
| `specs/adapters/<feature>/spec.md` | Permanente Feature-Specs der Adapter-Schicht |
| `specs/_plans/<name>/` | Pläne in Arbeit: `plan.md`, `decision-log.md`, Spec-Deltas, Reviews |
| `specs/_recorded/NNN-<name>/` | Archivierte Pläne, fortlaufend nummeriert |
| `specs/_decision/NNN-<name>.md` | Zu ADRs beförderte Entscheidungen |

Aktuell hält `specs/platform/` acht Features (u. a. `monorepo-workspace`,
`llm-port`, `session-store-port`, `http-server`, die Port-Verträge), und
`specs/adapters/` zwei: `ollama-llm-adapter` und `filesystem-session-store`.
Drei Pläne sind bisher aufgezeichnet: `001-add-monorepo-scaffold`,
`002-add-ollama-llm-adapter` und `003-add-filesystem-session-store`.

### Feature-Specs abfragen

Über die `speq`-CLI: `speq feature list`, `speq feature get "<domain>/<feature>"`,
`speq search query "<query>"`, `speq feature validate`.

## Der decision-log und die ADR-Beförderung

Jeder Plan führt einen `decision-log.md` mit begründeten Technik-Entscheidungen.
Beim `/speq:record` werden die dauerhaft relevanten davon zu **ADRs** in
`specs/_decision/NNN-<name>.md` befördert (mit `ID`, `Status`, Context,
Decision, Options Considered, Consequences). `002-add-ollama-llm-adapter.md`
enthält z. B. vier ADRs zur SDK-Wahl, zur Versions-Pinnung, zur Live-Test-Stufe
und zur Parametrisierung des Backends. `003-add-filesystem-session-store.md`
hält fünf: Abwesenheit vs. Beschädigung beim Lesen, `schemaVersion` am Envelope,
die `fsync`-vor-`rename`-Barriere, die Owner-only-Modi und die
Port-Vertragsänderung, dass `load` bei Beschädigung ablehnen darf.

## Die Roadmap

`specs/roadmap.md` ordnet die Arbeit in Meilensteine **M0…M18** plus einen
Post-v1-Meilenstein **P1**, dazu zwei Chores (C1 `openwiki --init`, C2 minimale
CI). Stand: M0, M1 und M2 erledigt, alles Übrige offen; M3
(Walking Skeleton + Engine-Spike) ist der nächste.

### Sequenzierung: Walking Skeleton

M1–M3 bauen eine dünne senkrechte Scheibe durch alle Schichten, bevor Fragebaum,
Destillation oder Widerspruchsprüfung existieren — weil die zentrale
Missions-Behauptung (kleine lokale Modelle genügen für strukturierte
Interviewführung) nur an einem echten Modell falsifizierbar ist. Details:
[Architekturüberblick](../architecture/overview.md).

### Technische Leitplanken

| Leitplanke | Entscheidung | Status |
|------------|--------------|--------|
| Kein Agent-Framework in der Domäne | Die Interview-Engine lebt in `packages/core` als eigener, deterministischer Code — kein LangChain/LangGraph/deepagents als Domänen-Abhängigkeit | fest |
| Engine-Struktur | Hand-gerollter Zustandsautomat **oder** LangGraph.js in `core`; M3 baut beide als Wegwerf-Spike, ADR vor M7 | offen — Spike in M3 |
| `LlmPort`-Adapter | Vercel AI SDK (`ai` v6) in `packages/server`, hinter dem Port; `packages/core` importiert es nie | fest |
| Strukturierter LLM-Output | `Output.object()` + zod-Schema im Adapter; der `LlmPort`-Vertrag bekommt in M10 eine Antwortform | fest — Delta in M10 |
| Kein Cloud-LLM-SDK | Weder Anthropic- noch OpenAI-SDK irgendwo im Produktcode | fest |
| On-Disk-Session-Schema | Jede persistierte Session trägt ab dem ersten Schreiben ein `schemaVersion`-Feld | umgesetzt — `schemaVersion 1` am Envelope seit M2 |

## Unterstützende Werkzeuge

`CLAUDE.md` teilt die Rollen: **speq** besitzt Planung und Spec-Bibliothek;
**superpowers** füllt Lücken (`systematic-debugging`, `using-git-worktrees`,
`finishing-a-development-branch`); **impeccable** die visuelle Design-Direction
jedes UI-Features; **context7** frische externe Lib-Docs; **OpenWiki** dieses
lebende Wiki (Agent-Kontext #1, siehe `AGENTS.md`).

## Verwandte Seiten

- [Architekturüberblick](../architecture/overview.md) — die Meilenstein-Reihenfolge im Bild
- [Domänen-Ports (@chrysalyst/core)](../architecture/domain-ports.md) — die Feature-Specs `core-ports-contract` und `llm-port`
- [Dateisystem-Session-Store-Adapter](../architecture/session-store-adapter.md) — die fünf ADRs aus `003`
- [Quickstart](../quickstart.md)

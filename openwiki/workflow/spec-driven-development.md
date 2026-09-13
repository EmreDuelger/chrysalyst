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
  - id: openwiki-source-9f1672a73d8c3832ee8e57d7
    resource: repo://specs/_decision/004-single-question-walking-skeleton.md
  - id: openwiki-source-036a781dce1c104f30b0e058
    resource: repo://specs/_recorded/001-add-monorepo-scaffold/plan.md
  - id: openwiki-source-61eb124c04322f3f00e4805b
    resource: repo://specs/_recorded/002-add-ollama-llm-adapter/plan.md
  - id: openwiki-source-d797f824fd5769533479bef3
    resource: repo://specs/_recorded/004-single-question-walking-skeleton/verification-report.md
  - id: openwiki-source-f8781635478575fa5f0ade0a
    resource: repo://specs/interview/single-question-interview/spec.md
  - id: openwiki-source-a0a8fcea3fc317de88a8e08c
    resource: repo://specs/roadmap.md
  - id: openwiki-source-ab77cccc8878026473ecb6d2
    resource: repo://specs/tooling/monorepo-workspace/spec.md
generated: { by: "claude-code", at: "2026-09-13T13:26:03.722Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-13T13:26:03.722Z
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
| `specs/interview/<feature>/spec.md` | Permanente Feature-Specs der Interview-Domäne (seit M3) |
| `specs/tooling/<feature>/spec.md` | Permanente Feature-Specs für Werkzeugkette/CI (seit M4, aus `platform/` herausgelöst) |
| `specs/_plans/<name>/` | Pläne in Arbeit: `plan.md`, `decision-log.md`, Spec-Deltas, Reviews |
| `specs/_recorded/NNN-<name>/` | Archivierte Pläne, fortlaufend nummeriert |
| `specs/_decision/NNN-<name>.md` | Zu ADRs beförderte Entscheidungen |

Aktuell hält `specs/platform/` sieben Features (`clock-port`, `core-ports-contract`,
`http-server`, `llm-port`, `search-port`, `session-store-port`, `web-shell`),
`specs/adapters/` zwei (`ollama-llm-adapter`, `filesystem-session-store`),
`specs/tooling/` zwei (`monorepo-workspace`, `ci-pipeline` — seit M4 aus
`platform/` herausgelöst) und die seit M3 neue Domäne `specs/interview/` drei:
`single-question-interview` (die Domänenregeln), `interview-http-api` (der
HTTP/SSE-Kontrakt) und `interview-view` (die Browser-Ansicht) — bewusst nach
Änderungsgrund geschnitten, weil M8 den Wire-Kontrakt ändert, M5/impeccable die
Ansicht und M7 die Domänenregeln geändert haben bzw. ändern werden. Sieben
Pläne sind aufgezeichnet, `001-add-monorepo-scaffold` bis
`007-bilingual-ui-and-prompts`.

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
`004-single-question-walking-skeleton.md` hält sieben: `InterviewState` v1 als
getaggte Turn-Liste, core rendert das Transkript (Store nimmt den Renderer
optional), der SSE-Kontrakt token/done/error, die Interview-Fabrik über
`CoreDependencies`, `packages/web` ohne Server-Abhängigkeit, die App-Fabrik, und
der Styling-Stack (plain CSS + Token-Schicht + CSS Modules).
`007-bilingual-ui-and-prompts.md` hält sechs: `locale` gehört zum
`InterviewState`, `schemaVersion` bleibt unverändert, die Prompt-Templates sind
je Sprache eigenständig verfasst, kein i18n-Framework, das Wörterbuch ist ein
typisierter Record statt eines `t()`-Helpers, und das Fehler-Label (nicht die
Fehlermeldung selbst) folgt der Chrome-Sprache.

## Die Roadmap

`specs/roadmap.md` ordnet die Arbeit in Meilensteine **M0…M18** plus einen
Post-v1-Meilenstein **P1**, dazu zwei Chores (C1 `openwiki --init`, C2 minimale
CI, beide erledigt). Stand: **M0 bis M5 sind erledigt** — Monorepo-Scaffold,
Ollama-LLM-Adapter, Dateisystem-Session-Store, Walking Skeleton
(`004-single-question-walking-skeleton` + `005-engine-structure-spike`),
CI-Test-Stufen (`006-ci-test-tiers`) und das DE/EN-Fundament
(`007-bilingual-ui-and-prompts`). **M6** (Backend-Setup-Gate) ist der oberste
noch offene Meilenstein.

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
| Engine-Struktur | Hand-gerollter Zustandsautomat über direktem `SessionStorePort`-Zugriff, kein LangGraph.js in `core` | entschieden — M3-Spike `005-engine-structure-spike` maß Persistenz-Integrationskosten und entschied zugunsten des Zustandsautomaten |
| Styling-Stack | plain CSS + `:root`-Token-Schicht + ein CSS-Modul pro Komponente; kein CSS-in-JS/Utility-Framework/Preprocessor | umgesetzt — seit M3 (`decision-log [10]`, ADR `styling-stack-plain-css-tokens-plus-css-modules`) |
| `LlmPort`-Adapter | Vercel AI SDK (`ai` v6) in `packages/server`, hinter dem Port; `packages/core` importiert es nie | fest |
| Strukturierter LLM-Output | `Output.object()` + zod-Schema im Adapter; der `LlmPort`-Vertrag bekommt in M10 eine Antwortform | fest — Delta in M10 |
| Kein Cloud-LLM-SDK | Weder Anthropic- noch OpenAI-SDK irgendwo im Produktcode | fest |
| On-Disk-Session-Schema | Jede persistierte Session trägt ab dem ersten Schreiben ein `schemaVersion`-Feld. `TState` wächst über M2 → M5 → M8 → M9 → M14 | umgesetzt — `schemaVersion 1` am Envelope seit M2, unverändert durch M5 (`locale` kam zum Zustand, nicht zum Envelope) |

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
- [Interview-Runde (@chrysalyst/core)](../architecture/interview-round.md) — die Feature-Spec `interview/single-question-interview` und die sieben ADRs aus `004`
- [Quickstart](../quickstart.md)

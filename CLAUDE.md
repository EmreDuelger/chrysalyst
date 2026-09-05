# CLAUDE.md — chrysalyst

## Projekt

chrysalyst verwandelt vage Produktideen per geführtem Interview (lokales kleines LLM)
in klare, widerspruchsfreie, entwicklungsreife Specs.

**Stack:** pnpm-Monorepo `packages/{core,server,web}` · TypeScript · Node ≥ 20 ·
React + Vite (web) · Fastify (server) · Vitest · Hexagonal (Ports & Adapters).
LLM- und Such-Anbindung als Adapter-Schicht (Ollama/llama.cpp/LM Studio; SearXNG).
Persistenz: Dateien (Markdown + JSON) pro Session. Details in `specs/mission.md`.

## Arbeitsweise

**speq ist das Rückgrat.** superpowers füllt Lücken. Design über impeccable,
frische Lib-Docs über context7, Codebase-Gedächtnis über OpenWiki.

### Tool-Rollen

| Tool | Besitzt | Nicht dafür |
|---|---|---|
| **speq** | `mission → plan → implement → record`, Spec-Bibliothek, adversariale Plan-/Code-Reviews, TDD-Guardrails | — |
| **superpowers** | `brainstorming` (nur bei echt unklarer Idee), `systematic-debugging`, `using-git-worktrees`, `verification-before-completion`, `finishing-a-development-branch`, `requesting-code-review` (Nicht-speq-Änderungen) | `writing-plans` / `executing-plans` — speq besitzt Planung |
| **impeccable** | Visuelle Design-Direction jedes UI-Features — als Subphase in `/speq:plan`; approved Comp → Referenz in `plan.md` | — |
| **context7** | Frische externe Lib-/API-Docs — Pflicht vor Code gegen eine externe Lib | interne Fragen, Refactoring, Business-Logik-Debug |
| **OpenWiki** | Lebendes `openwiki/`-Wiki über die Codebase — Agent-Kontext #1 | — |

**TDD-Konflikt:** speqs `code-guardrails` gewinnen (failing-test-first, evidence-rule).
`superpowers:test-driven-development` nicht separat aufrufen — gleiche Idee, speqs Variante
ist im Flow verdrahtet.

### Standard-Route

```
/speq:mission ── einmalig / bei Drift ──►  specs/mission.md

PHASE 0  Framing (optional)      superpowers:brainstorming — nur bei unklarer Idee
                                 Output bleibt im Chat, kein Spec-Doc
   │
PHASE 1  Plan   /speq:plan
   │   Klärungs-Interview · Spec-Deltas + decision-log
   │   UI-Feature ⟶ impeccable-Subphase → approved Comp landet in plan.md
   │   adversariale Plan-Review → specs/_plans/<name>/
   │   ◄── STOPP: Mensch reviewt plan.md
PHASE 2  Implement   /speq:implement
   │   Worktree (superpowers:using-git-worktrees) für Isolation
   │   TDD-Subagents (speq code-guardrails) · context7 bei jeder externen Lib
   │   adversariale code-review → verification-report.md
   │   ◄── superpowers:verification-before-completion: Befehle real laufen, Output zeigen
PHASE 3  Record   /speq:record
   │   Spec-Deltas → permanente Bibliothek · Plan archiviert
PHASE 4  Wiki + Branch-Abschluss
       openwiki                              (lokal regenerieren; CI öffnet sonst PR)
       superpowers:finishing-a-development-branch
```

Abkürzen ist erlaubt (Leitplanke, kein Gate) — **aber auf Ansage + Begründung**:

- Doku- / Config-Einzeiler → direkt umsetzen; danach `openwiki`, falls Architektur betroffen
- Bug → `superpowers:systematic-debugging` zuerst; ändert der Fix Spec-Verhalten → zurück in `/speq:plan`
- Reine UI-Politur an bestehendem Screen → `impeccable` direkt, kein voller Plan

### Immer-Regeln (gelten in jeder Phase)

1. **Wiki zuerst** — zu Task-Beginn `openwiki/` lesen, dann gezielt in den Quellcode
2. **context7 vor Lib-Code** — nie aus dem Gedächtnis gegen eine externe API programmieren
3. **Kein "fertig" ohne Beleg** — Verifikationsbefehl real laufen lassen, Output zeigen
4. **Git-History nur auf Anweisung** — kein commit/push ohne explizites OK, Branch statt `main`
5. **Isolation** — Feature-Arbeit im Worktree

## Befehls-Cheatsheet

| Zweck | Befehl |
|---|---|
| Mission anlegen / aktualisieren | `/speq:mission` |
| Feature planen | `/speq:plan <name>` |
| Plan umsetzen | `/speq:implement <name>` |
| Specs mergen + Plan archivieren | `/speq:record <name>` |
| Spec-Health prüfen | `/speq:audit` |
| Specs durchsuchen / validieren | `/speq:cli` |
| Wiki regenerieren | `openwiki` |
| Dev (web + server) | `pnpm dev` |
| Build | `pnpm -r build` |
| Test | `pnpm -r test` |
| Coverage (~90 % in `core`) | `pnpm -r test --coverage` |
| Lint / Format | `pnpm lint` · `pnpm format` |
| Typecheck | `pnpm typecheck` |

<!-- OPENWIKI:START -->
<!-- OpenWiki trägt hier nach `openwiki --init` seinen Verweis auf das `openwiki/`-Verzeichnis ein. -->
<!-- OPENWIKI:END -->

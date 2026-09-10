---
type: operations
title: Toolchain und Teststrategie
description: Der Build- und Qualitäts-Werkzeugkasten von chrysalyst — pnpm-Workspace mit catalog:-Versionierung, Node-Type-Stripping ohne Build, die Vitest-Aufteilung, ESLint strictTypeChecked, Prettier und die zweistufige Test-Konvention.
tags: [toolchain, pnpm, vitest, eslint, prettier, testing, ci]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
sources:
  - id: openwiki-source-f235d856bed1fd44853c5195
    resource: repo://.prettierignore
  - id: openwiki-source-276795f6d5ad19adb078c64e
    resource: repo://eslint.config.js
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-1c53a59d367e22813b6fb932
    resource: repo://packages/core/vitest.config.ts
  - id: openwiki-source-be80b8bb0c3f3a4106e1484a
    resource: repo://packages/server/package.json
  - id: openwiki-source-72d5a971bbca538ee461f19f
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.live.test.ts
  - id: openwiki-source-650a35ca473d92cacbf3263b
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.test.ts
  - id: openwiki-source-836b1821935d4a9e043f8655
    resource: repo://packages/server/src/adapters/session-store/filesystem-session-store.test.ts
  - id: openwiki-source-0443590d078e8b72afcd56c2
    resource: repo://packages/server/src/routes/interview-routes.live.test.ts
  - id: openwiki-source-3c9ecfb44083e5e32998eace
    resource: repo://packages/server/vitest.config.ts
  - id: openwiki-source-13f507d8e6ca477b916c3558
    resource: repo://packages/web/DESIGN.md
  - id: openwiki-source-b54694b824f93b534df8a170
    resource: repo://packages/web/src/interview/InterviewView.test.tsx
  - id: openwiki-source-71fc20275e3cfa51b5590a27
    resource: repo://packages/web/src/interview/sse-frames.test.ts
  - id: openwiki-source-a1be692c9fc24885e83e7d07
    resource: repo://packages/web/vitest.config.ts
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-9f1672a73d8c3832ee8e57d7
    resource: repo://specs/_decision/004-single-question-walking-skeleton.md
  - id: openwiki-source-27db56ec5f5b550679beca36
    resource: repo://specs/platform/monorepo-workspace/spec.md
  - id: openwiki-source-b1e8b3a8bdfc48eb2e09cd13
    resource: repo://tests/fixtures/interview-sse-frames.txt
  - id: openwiki-source-587768439c42bdfd0095606f
    resource: repo://tests/fixtures/README.md
  - id: openwiki-source-1eddfe2a3e905b4c50618167
    resource: repo://tests/workspace.test.ts
  - id: openwiki-source-df1e4d0dc0a35c64fd0e652b
    resource: repo://tsconfig.base.json
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
---

# Toolchain und Teststrategie

chrysalyst ist ein pnpm-Monorepo mit drei Paketen (siehe
[Architekturüberblick](../architecture/overview.md)). Dieser Abschnitt
beschreibt, wie gebaut, geprüft und getestet wird.

## Ein Satz Werkzeug-Versionen: der `catalog:`-Block

Jede externe Version steht **genau einmal** — im `catalog:`-Block von
`pnpm-workspace.yaml` (TypeScript, Vitest, ESLint, Prettier, Hono, React, Vite,
`ai`, `@ai-sdk/openai-compatible`, `zod` …). Pakete referenzieren sie mit dem
`catalog:`-Specifier statt eines eigenen Versionsbereichs.
`tests/workspace.test.ts` erzwingt das: Der Test `packages reference catalog
versions` schlägt fehl, sobald ein Manifest einen katalog-verwalteten Namen mit
einem harten Versionsbereich deklariert. Interne Pakete referenzieren einander
mit `workspace:*`.

Die Wurzel pinnt zusätzlich `packageManager` auf eine exakte pnpm-Version und
`engines.node` auf `^22.18.0 || >=24`; `.nvmrc` hält die konkrete Version, die
dieser Bereich zulassen muss.

## Kein Build vor Test und Typecheck

Node ≥ 22.18 streift TypeScript-Typen zur Laufzeit. Dadurch:

| Skript | core / server | web |
|--------|---------------|-----|
| `build` | `tsc -p tsconfig.json` (nur `--noEmit`-Typprüfung) | `vite build` |
| `typecheck` | `tsc -p tsconfig.json` | `tsc -p tsconfig.json` |
| `test` | `vitest run` | `vitest run` |
| `dev` | `node --watch` / `tsc --watch` | `vite` |

`tests` und `typecheck` brauchen **keinen** vorherigen Build. Der Root-Test
`root exposes the mission scripts without a build prerequisite` prüft, dass die
Root-Skripte `test` und `typecheck` kein `build` enthalten.

`tsconfig.base.json` setzt `noEmit`, `verbatimModuleSyntax`,
`erasableSyntaxOnly`, `isolatedModules`, `allowImportingTsExtensions` und
`moduleResolution: "bundler"` — alle Importe nennen die `.ts`-Endung.

## Vitest-Aufteilung

Jedes Paket hat eine eigene `vitest.config.ts`, plus eine an der Wurzel:

- **`packages/core/vitest.config.ts`** — aktiviert `typecheck.enabled`, sodass
  `ports.test-d.ts` als Testfehler statt nur als `tsc`-Fehler erscheint.
- **`packages/server/vitest.config.ts`** — `environment: 'node'`, ebenfalls
  `typecheck.enabled`.
- **`packages/web/vitest.config.ts`** — `environment: 'jsdom'` mit dem
  React-Plugin. Seit M3 die dichteste Suite: die
  [`InterviewView`](../architecture/web-client.md)-Szenarien (9, jsdom, über
  einen injizierten `InterviewApi`-Fake) und der SSE-Frame-Parser gegen **jede
  Split-Position** der geteilten Fixture.
- **`vitest.config.ts` (Wurzel)** — `include: ['tests/**/*.test.ts']`, also nur
  die Workspace-übergreifende Suite `tests/workspace.test.ts`.

Der Befehl `pnpm -r --include-workspace-root test` führt alle vier aus.

### Die geteilte SSE-Fixture als ausführbarer Kontrakt

`tests/fixtures/interview-sse-frames.txt` hält die rohen Bytes der drei
SSE-Frame-Typen (`token` / `done` / `error`), inklusive eines escapten Newlines
in einem Payload. Beide Seiten des Wire-Kontrakts prüfen gegen dieselbe Datei:
der [Route-Test](../architecture/interview-http-and-composition.md) in
`packages/server` assertet, dass der Server exakt diese Bytes emittiert, der
Parser-Test in `packages/web`, dass sie zu den drei Payload-Shapes zurück
dekodieren. Ein Rename oder eine Formatänderung auf einer Seite lässt einen Lauf
fehlschlagen, nicht nur einen Browser.

## Linting und Formatierung

- **ESLint** (`eslint.config.js`) wendet `js.configs.recommended` und
  `tseslint.configs.strictTypeChecked` auf jede `*.{ts,tsx}` an, über den
  `projectService` mit `tsconfig.eslint.json` als Default-Projekt. Die
  React-Hooks-Regeln gelten für `packages/web`. Für `**/*.test.ts` sind exakt
  zwei Regeln abgeschaltet: `@typescript-eslint/no-unsafe-assignment` und
  `@typescript-eslint/require-await`. `@typescript-eslint/no-implied-eval` ist
  auch in Testdateien aktiv — deshalb nutzt `tests/workspace.test.ts`
  `runInNewContext` aus `node:vm` statt `new Function`.
- **Prettier** — `singleQuote: true`, `trailingComma: 'all'`. `.prettierignore`
  schließt `specs/`, `.claude/`, `.serena/`, `openwiki/`, `pnpm-lock.yaml` und
  Build-Ordner aus.

Root-Skripte: `pnpm lint`, `pnpm format` (schreibt), `pnpm format:check`
(prüft).

### Styling-Stack

Seit dem ersten UI-Feature (M3) steht er fest: **plain CSS** mit einer
`:root`-Custom-Property-Token-Schicht plus **ein CSS-Modul pro Komponente** —
kein CSS-in-JS, kein Utility-Framework, kein Preprocessor
(ADR `styling-stack-plain-css-tokens-plus-css-modules`). Faces werden
selbstgehostet (`packages/web/public/fonts/`, woff2 + OFL), kein Google-Fonts-URL.
Details: [Browser-Client und Designsystem](../architecture/web-client.md).

## Die zweistufige Test-Konvention

Tests laufen in zwei Stufen:

1. **Hermetisch (Standard)** — kein Netz, kein Daemon, CI-tauglich. Adapter
   werden über injizierte Stubs oder Mocks getrieben. Der
   [LLM-Adapter](../architecture/llm-adapter.md) bekommt ein `config.fetch`; der
   [Dateisystem-Session-Store](../architecture/session-store-adapter.md) läuft
   gegen eine `mkdtemp`-Sandbox (echtes Dateisystem, nie das Home des Nutzers)
   plus einen `vi.mock('node:fs/promises')`, dessen Injektions-Modi die
   `sync`/`rename`-Reihenfolge beobachten und ein Handle bei `write`, `sync`
   oder `close` — oder das Aufräumen einer `.tmp`-Datei — scheitern lassen.
2. **Live** — Dateien mit dem Namensmuster `*.live.test.ts`. Sie sprechen mit
   echter Infrastruktur und laufen nur, wenn `CHRYSALYST_LIVE_LLM` einen
   nicht-leeren Wert hat. Seit M3 gibt es **zwei**: die des
   [LLM-Adapters](../architecture/llm-adapter.md) und
   `interview-routes.live.test.ts`, die den ganzen E2E-Pfad (Session → SSE-Strom →
   Persistenz) gegen ein echtes Modell fährt, die **Zeit bis zum ersten Token**
   misst (zuletzt `qwen3:8b` ~2,1 s warm, Ceiling 30 s) und assertet, dass die
   gespeicherte Frage keinen `<think>`-Marker trägt. Beide Zahlen sind die
   Machbarkeits-Notiz, die der M3-Verification-Report führt.

Jede `*.live.test.ts` gatet ihre Suite mit
`describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')` — eine nicht
gesetzte Variable **und** ein leerer String lassen sie beide aus, weil ein
CI-`env:`-Block ein leeres `''` schreibt, um „aus" auszudrücken. Kein
Top-Level-`await`, damit das bloße Einsammeln der Datei nichts kontaktiert.

`tests/workspace.test.ts` prüft diese Konvention mechanisch für jede gefundene
`*.live.test.ts`:

- `every live test file gates on CHRYSALYST_LIVE_LLM and awaits nothing at
  module scope` — der `skipIf`-Ausdruck nennt `CHRYSALYST_LIVE_LLM`, und keine
  Zeile auf Modul-Ebene beginnt mit `await` oder `for await`.
- `every live guard expression skips for unset and empty and runs for any
  value` — der extrahierte Guard-Ausdruck wird mit `runInNewContext` gegen ein
  Stub-`process` ausgewertet: `undefined` → skip, `''` → skip, `'1'` → run.

M4 der Roadmap baut die CI-Pipeline gegen dieses Tag aus; ein CI-Lauf ohne
`CHRYSALYST_LIVE_LLM` meldet die Live-Tests als übersprungen, nicht als
fehlgeschlagen.

## Verwandte Seiten

- [Architekturüberblick](../architecture/overview.md)
- [LLM-Adapter](../architecture/llm-adapter.md) · [Interview-Route](../architecture/interview-http-and-composition.md) —
  die zwei `*.live.test.ts`
- [Browser-Client und Designsystem](../architecture/web-client.md) — jsdom-Tests,
  der Frame-Parser, der Styling-Stack
- [Dateisystem-Session-Store-Adapter](../architecture/session-store-adapter.md) —
  hermetisch über `mkdtemp` plus `node:fs/promises`-Mock
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) —
  die Verifikations-Checkliste jedes Plans läuft gegen diese Skripte

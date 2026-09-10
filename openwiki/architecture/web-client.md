---
type: architecture
title: Browser-Client und Designsystem (@chrysalyst/web)
description: packages/web als treibender Adapter — die streamende Frage-Ansicht InterviewView mit ihren sechs Phasen, der SSE-Frame-Parser, der den Wire-Kontrakt neu deklarierende interview-api.ts, der Vite-Dev-Proxy, und das editoriale Designsystem (DESIGN.md, plain CSS mit Token-Schicht plus CSS Modules, selbstgehostete Faces).
tags: [web-client, react, server-sent-events, sse-parser, design-system, css-modules, driving-adapter]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
sources:
  - id: openwiki-source-13f507d8e6ca477b916c3558
    resource: repo://packages/web/DESIGN.md
  - id: openwiki-source-d952717f7ba616148cf6047b
    resource: repo://packages/web/src/App.tsx
  - id: openwiki-source-4af8a1b43cf555aa7ea0ad95
    resource: repo://packages/web/src/index.css
  - id: openwiki-source-db0ff9c7aa2292224e4437f6
    resource: repo://packages/web/src/interview/interview-api.ts
  - id: openwiki-source-3b387874b0395e97291eee50
    resource: repo://packages/web/src/interview/InterviewView.module.css
  - id: openwiki-source-b54694b824f93b534df8a170
    resource: repo://packages/web/src/interview/InterviewView.test.tsx
  - id: openwiki-source-e60138926eb6f53d1f779cf2
    resource: repo://packages/web/src/interview/InterviewView.tsx
  - id: openwiki-source-266179caba2e343974d79c5d
    resource: repo://packages/web/src/interview/sse-frames.ts
  - id: openwiki-source-8b3ec3ccdb6b1b00577c9598
    resource: repo://packages/web/src/vite-config.test.ts
  - id: openwiki-source-ccecd3ec2865b64b4ea6f780
    resource: repo://packages/web/vite.config.ts
  - id: openwiki-source-9f1672a73d8c3832ee8e57d7
    resource: repo://specs/_decision/004-single-question-walking-skeleton.md
  - id: openwiki-source-fa62f324d4b2f87d9fd0ecfa
    resource: repo://specs/interview/interview-view/spec.md
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
---

# Browser-Client und Designsystem (@chrysalyst/web)

`@chrysalyst/web` ist der **treibende Adapter**: eine Vite-+-React-App, die die
eine Interview-Runde führt und dabei **nur mit der HTTP-API auf dem Loopback
spricht**. Sie deklariert kein Workspace-Paket, importiert kein Domänenmodul, und
trägt ihre eigene Deklaration der drei Wire-Shapes, die sie konsumiert.

## `InterviewView` — die sechs Phasen

`packages/web/src/interview/InterviewView.tsx` besitzt das ganze Gespräch mit der
API; die Shell (`App.tsx`) nennt nur das Produkt und montiert die Ansicht, ruft
selbst keine Route. Der API-Client ist ein Prop, sodass ein Test die Ansicht
ohne Netz treibt.

| Phase | Was der Nutzer sieht |
|---|---|
| `connecting` | „Preparing the first question", blinkende Cursor-Linie, kein Antwort-Feld |
| `streaming` | die Frage erscheint Token für Token in einer `aria-live`-Region, Streaming-Indikator läuft |
| `complete` | Frage vollständig; Antwort-Feld und „Record answer" werden aktiv |
| `submitting` | „Recording…", beide Controls gesperrt, ein zweites Absenden abgelehnt |
| `recorded` | „Recorded · HH:MM · saved to this session", beide Controls zu |
| `failed` | Fehler in place („The question stopped" + rohe Backend-Meldung), Antwort-Feld bleibt zu |

Ein `useEffect` legt beim Mount eine Session an (`createSession`), öffnet dann
den Frage-Strom und schreibt die Chunks in den Zustand. Ein `AbortController` im
Cleanup bricht bei Unmount ab. Die Ansicht liest den Strom mit `fetch` +
`ReadableStream`, **nicht `EventSource`** — so ist der Transport eine Funktion,
die Tests ersetzen, und der Parser wird an Chunk-Grenzen geübt, die ein echtes
Netz produziert.

Die **Oberfläche ist Englisch**; M5 macht sie zweisprachig.

## Der SSE-Frame-Parser: `sse-frames.ts`

`parseSseFrames(chunks: AsyncIterable<string>)` reassembliert beliebig
gesplitteten Stream-Text zu ganzen SSE-Frames. Der Mechanismus ist **strukturell,
kein Sonderfall**:

- Der akkumulierte Text wird auf `\n\n` (Frame-Trenner) gesplittet.
- Der **letzte Teil wird zurückgehalten** und dem nächsten Chunk vorangestellt —
  er kann ein halber Frame sein.
- Jeder vollständige Block wird dekodiert (`event: ` / `data: `-Zeilen). Ein
  Block ohne beide Felder — ein Kommentar, oder der leere Block, den zwei
  aufeinanderfolgende Trenner hinterlassen — ist **kein Event und wird
  übersprungen**, sodass ein schräger Block keinen laufenden Strom abreißt.

Ein Frame wird also erst freigegeben, wenn seine abschließende Leerzeile
angekommen ist, und ein abschließender Teilframe, den der Strom nie beendet, wird
verworfen statt geliefert. `data` bleibt **byte-für-byte**, wie es ankam;
das Dekodieren in eine der drei Payloads gehört `interview-api.ts`. Der Parser
ist **total und wirft nie** — er wird an jeder Byte-Grenze von
`tests/fixtures/interview-sse-frames.txt` gegen reine String-Identität geprüft,
inklusive eines escapten Newlines in einem Payload.

## Der Wire-Kontrakt, neu deklariert: `interview-api.ts`

`@chrysalyst/web` importiert `@chrysalyst/server` **nicht**
(ADR `web-restates-wire-shapes-no-server-dependency`). `hc<AppType>` wurde
abgelehnt, weil es einen SSE-Event-Namen und eine Payload nicht typisieren kann —
die größere Hälfte des Frage-Stream-Kontrakts. Also deklariert dieses Modul die
drei SSE-Payload-Shapes und die zwei JSON-Bodies selbst:

```ts
type QuestionEvent =
  | { event: 'token'; text: string }
  | { event: 'done'; question: string }
  | { event: 'error'; message: string };
```

`tests/fixtures/interview-sse-frames.txt` ist die **ausführbare Hälfte** dieses
Kontrakts: der [Route-Test](interview-http-and-composition.md) prüft, dass der
Server exakt diese Bytes emittiert, dieser Modul-Test, dass sie zu diesen Shapes
zurück dekodieren — ein Rename auf einer Seite lässt einen Lauf fehlschlagen,
nicht nur einen Browser. Dieses Modul besitzt außerdem jede Prüfung, die der
Parser bewusst auslässt: ein unbekannter Event-Name und ein fehlgeformter
`data`-Payload werden hier abgelehnt.

## Der Vite-Dev-Proxy

`packages/web/vite.config.ts` proxyt `/interview` auf `http://127.0.0.1:3000`,
sodass der Browser unter `pnpm dev` **einen Origin** sieht. Der Produktions-Build
trägt nichts davon — ein Proxy ist Dev-Server-Konfiguration.
`packages/web/src/vite-config.test.ts` fixiert die Proxy-Zuordnung.

## Das Designsystem

Die impeccable-Subphase dieses Plans hat den **Styling-Stack fürs ganze
Produkt** festgelegt (ADR `styling-stack-plain-css-tokens-plus-css-modules`,
`decision-log [10]`): **plain CSS** mit einer `:root`-Custom-Property-Token-Schicht
(`packages/web/src/index.css`) plus **ein CSS-Modul pro Komponente**. Kein
CSS-in-JS, kein Utility-Framework, kein Preprocessor. `packages/web/DESIGN.md`
beschreibt das System, wie es ausgeliefert wurde (aus dem impeccable
Finish-Review abgeleitet, nicht aus Absichten).

**Die editoriale Welt** — Register Monocle / Apartamento / Études:

| Rolle | Wert |
|---|---|
| Grund | Warm Paper `#f4f1ea` — die ganze Fläche, nie geboxt |
| Tinte | Near-Black Ink `#1a1a1a` (~15:1), Soft Ink `#55524b` (~7:1) für Mikro-Labels |
| Akzent | Editorial Vermilion `#c8402b` — die *einzige* chromatische Farbe, ein **Zustandssignal**, nie Dekoration (Submit, „Recorded"-Zeile, Fehler-Marke, fokussiertes Feld) |
| Haarlinie | `#d8d2c4`, immer exakt 1px, auf einer einzigen Kante |
| Schrift | **Source Serif 4** für die Frage und die Wortmarke, **Libre Franklin** für alles Bedienbare/Informative |

**Flach.** Kein `box-shadow` irgendwo, keine Karte, eckige Ecken (`--radius: 2px`
existiert als Deckel, nichts nutzt ihn). Tiefe ist 1px-Regeln und Luft. Eine
einzige zentrierte ~40rem-Spalte, keine Responsive-Breakpoints.

**Das Signatur-Element:** die Streaming-Cursor-Linie — ein `0.62em` breiter, 2px
hoher Inline-Block, der hart an/aus blinkt (`steps(1, end)`, kein Fade), unter
`prefers-reduced-motion` entfernt und im Fehler-Zustand statisch. Das bewusste
Anti-Chatbot-Signal: eine Haarlinie, nie hüpfende Punkte.

**Faces selbstgehostet:** `packages/web/public/fonts/` trägt sechs `woff2`
(Source Serif 4 400/500, Libre Franklin 400/500/600) plus die OFL-Lizenztexte —
**kein Google-Fonts-URL im Quellcode**. `@font-face` in `index.css`.

## Repräsentative Tests

`InterviewView.test.tsx` (jsdom, 9 Szenarien) treibt die Ansicht über einen
injizierten `InterviewApi`-Fake durch jede Phase: connecting-Label vor dem ersten
Chunk, Chunks in die Live-Region, Indikator nur während des Streams, Feld erst
bei `done` offen, Absenden bestätigt und schließt beide Controls, In-flight
lehnt ein zweites Absenden ab, leere Antwort sendet nichts, ein Fehler-Event
hält das Antwort-Control zu. `sse-frames.test.ts` fährt die Fixture durch jede
Split-Position.

**Bekannter Nicht-Bug:** `<StrictMode>` doppelt in dev die Effekte — jeder
Seiten-Load legt einen zusätzlichen, nie befragten Session-Ordner an. Ein Orphan
pro Load ist erwartet.

## Verwandte Seiten

- [Interview-Route, SSE-Kontrakt und Kompositionswurzel](interview-http-and-composition.md) — die andere Seite des Wire-Kontrakts
- [Interview-Runde (@chrysalyst/core)](interview-round.md) — die Domänenregeln hinter der Runde
- [Architekturüberblick](overview.md) — web als treibender Adapter
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — jsdom-Tests, die geteilte Fixture, CSS Modules
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) — die Feature-Spec `interview/interview-view`

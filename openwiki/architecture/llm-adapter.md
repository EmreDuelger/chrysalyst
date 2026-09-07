---
type: architecture
title: LLM-Adapter (OpenAI-kompatibel / Ollama)
description: Die erste echte LlmPort-Implementierung — createOpenAiCompatibleLlm und llmConfigFromEnv über das Vercel AI SDK, mit Modell-Probe per fetch, Fehlerübersetzung an der Grenze, Abbruch-Semantik und den hermetischen und Live-Test-Stufen.
tags: [llm-adapter, ollama, vercel-ai-sdk, openai-compatible, adapter, streaming, testing]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-07T20:27:51.484Z
sources:
  - id: openwiki-source-72d5a971bbca538ee461f19f
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.live.test.ts
  - id: openwiki-source-650a35ca473d92cacbf3263b
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.test.ts
  - id: openwiki-source-aabd04ae8e74d1778fabc2fb
    resource: repo://packages/server/src/adapters/llm/openai-compatible-llm.ts
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-0c0f824f90b5cb267847f935
    resource: repo://specs/_decision/002-add-ollama-llm-adapter.md
  - id: openwiki-source-49bd97e61ef2b2d0302d9969
    resource: repo://specs/adapters/ollama-llm-adapter/spec.md
generated: { by: "claude-code", at: "2026-09-07T20:27:51.484Z" }
---

# LLM-Adapter (OpenAI-kompatibel / Ollama)

`packages/server/src/adapters/llm/openai-compatible-llm.ts` ist die erste echte
Implementierung von [`LlmPort`](domain-ports.md). Sie beantwortet `status`,
`complete` und `stream` von einem lokalen Ollama-Daemon über das **Vercel AI
SDK** und ist über Basis-URL und Modell parametrisiert — LM Studio und
llama.cpp brauchen damit Konfiguration, keinen zweiten Adapter.

## Verantwortung und Grenze

Dieses Modul ist der einzige Ort im Workspace, der weiß, dass ein Sprachmodell
über HTTP erreicht wird. Es spricht das OpenAI-Wire-Format zu einem
Loopback-Endpunkt; `@chrysalyst/core` importiert nichts davon und sieht nur
`LlmPort`. Kein neuer Typ überquert die Grenze nach `core` — `LlmPort`,
`LlmRequest` und `LlmBackendStatus` werden nur als Typen importiert.

Das Modul exportiert zwei Funktionen:

- `createOpenAiCompatibleLlm(config)` → gibt einen `LlmPort` zurück
- `llmConfigFromEnv(env?)` → löst Basis-URL und Standardmodell auf (die
  Kompositions-Naht)

### Konfiguration

`OpenAiCompatibleLlmConfig` trägt `baseUrl`, `defaultModel` und ein optionales
`fetch` (die Test-Naht — Default `globalThis.fetch`).

`llmConfigFromEnv` liest zwei Umgebungsvariablen; ein leerer String fällt auf
den Default zurück (dieselbe „leer heißt nicht gesetzt"-Konvention wie die
Live-Test-Flagge):

| Variable | Default |
|----------|---------|
| `CHRYSALYST_LLM_BASE_URL` | `http://127.0.0.1:11434/v1` |
| `CHRYSALYST_LLM_MODEL` | `llama3.2:3b` |

Die Auflösung ist eine reine Funktion ihres Eingabe-Records und liest keine
Datei — chrysalyst bekommt keinen dotenv-Loader.

## Mechanik der drei Methoden

`complete` und `stream` laufen durch `ai` und `@ai-sdk/openai-compatible` —
zusammen *das SDK-Paar*, das SSE-Framing, Message-Kodierung und Abbruch-Plumbing
besitzt. `status` umgeht beide Pakete.

### status — Modell-Probe per fetch

`status` setzt ein `GET` auf `<baseUrl>/models` über das injizierte
`config.fetch` ab, mit normalisiertem abschließendem Slash: `new URL('models',
baseUrl)` verwirft sonst still das `/v1`. Der Antwort-Body wird mit einem
expliziten Guard verengt (`data` ist ein Array, jeder Eintrag hat eine
String-`id`), bevor `data[].id` gelesen wird — `strictTypeChecked` verbietet
den ungeprüften Member-Zugriff.

Jeder Fehlschlag außer einem Abbruch wird auf `{ available: false, models: [] }`
abgebildet: ein geworfener Fehler, eine nicht-`ok`-Antwort und eine `200`, deren
Body der Guard ablehnt, gleichermaßen. Ein durch ein bereits abgebrochenes
Signal abgebrochener Probe-Aufruf **verwirft** dagegen — eine abgebrochene
Probe hat nichts über das Backend gelernt.

### complete

`complete` erwartet `generateText({ model, messages, maxRetries: 0,
abortSignal })` und gibt `.text` zurück. Das Modell ist immer eine
`createOpenAICompatible(...)`-Instanz, nie ein blanker String — so erreicht
`ai@6`s transitives `@ai-sdk/gateway` keinen gehosteten Inferenz-Endpunkt.

### stream

`stream` ist ein Async-Generator, der an `streamText(...).textStream`
delegiert. Zwei Wurf-Stellen, beide erreichbar:

1. **Nach der Schleife.** `textStream` wirft **nicht** bei einem Transport-Fehler
   *vor* dem ersten Chunk (Connection refused, fehlformatierter Stream) — es
   endet still und leitet den Fehler an `onError`. Der Adapter fängt diesen
   Fehler in `onError` ab und wirft die Umhüllung nach der Schleife.
2. **Im `catch`.** Reißt die Verbindung *nach* den Headern ab (`ECONNRESET`
   mitten im Body), wirft `textStream` einen `APICallError`, der im `catch`
   umhüllt wird.

Ein abgebrochener `stream` endet still (`return`), kein Wurf.

### Fehlerübersetzung und Abbruch

`complete` und `stream` hüllen einen Transport-Fehler in eine `Error` mit der
Meldung `Cannot reach the language model at <baseUrl>` und behalten den
`ai`-Fehler als `cause`. Ein Aufrufer sieht damit einen chrysalyst-Fehler, nicht
`AI_APICallError`. Der Stil entspricht `startServer` im
[HTTP-Server](http-server.md).

Der Abbruch wird an **`signal.aborted === true`** erkannt, nicht am
Fehler-Namen: Ein eigener Abbruch-Grund
(`controller.abort(new Error('cancelled'))`) käme als schlichte `Error` namens
`Error` an, die eine Namensprüfung als Transport-Fehler fehlklassifizieren
würde. `signal.aborted` ist die vollständige, verlässliche Antwort auf „hat der
Aufrufer abgebrochen?".

## Zwei Test-Stufen

### Hermetisch (Standard)

`openai-compatible-llm.test.ts` treibt den ganzen Adapter durch einen
injizierten `fetch`-Stub mit vier Antwort-Fixtures (Chat-Completion-JSON, die
SSE-Frame-Sequenz, eine leere und eine gefüllte Modell-Liste, eine
`ECONNREFUSED`-Verwerfung). Ein Request-Recorder erfasst jede URL, jeden Header
und jeden Body — Assertions laufen über den Recorder, nie über einen echten
Socket. Kein Daemon nötig.

### Live (`*.live.test.ts`)

`openai-compatible-llm.live.test.ts` spricht mit einem echten Ollama-Daemon. Die
Suite ist mit `describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')`
gegatet — eine nicht gesetzte Variable und ein leerer String lassen sie beide
aus, jeder nicht-leere Wert aktiviert sie. `testTimeout` ist auf `120000` ms
gesetzt, weil die erste Anfrage nach einem kalten Modell-Load Vitists 5-s-Default
überschreitet. Kein Top-Level-`await` — das bloße Einsammeln der Datei
kontaktiert nichts.

Der eine Live-Test prüft `status`, `complete`, `stream` und einen Abbruch
mitten im Stream gegen den Daemon. Er wurde zuletzt gegen `qwen3:8b` ausgeführt
(via `CHRYSALYST_LLM_MODEL`-Override), nicht gegen das im Plan gepinnte
`llama3.2:3b`, das auf dem Host nicht gepullt ist. Der Aufruf:

```
CHRYSALYST_LIVE_LLM=1 CHRYSALYST_LLM_MODEL=qwen3:8b pnpm -r --include-workspace-root test
```

`tests/workspace.test.ts` prüft, dass jede `*.live.test.ts` dieser Konvention
folgt (nennt `CHRYSALYST_LIVE_LLM` im `skipIf`, kein Modul-scope-`await`).

## Abhängigkeiten

`packages/server` bekommt drei Laufzeit-Abhängigkeiten, exakt gepinnt über den
`catalog:`-Block von `pnpm-workspace.yaml`:

| Paket | Version | Grund |
|-------|---------|-------|
| `ai` | `6.0.277` | Roadmap-Leitplanke nennt v6; `^6` hält die Paar-Bindung nicht allein |
| `@ai-sdk/openai-compatible` | `2.0.74` | `@ai-sdk/openai-compatible@3.x` baut auf `ai` v7s Provider-Generation |
| `zod` | `^4.5.4` | Pflicht-Peer beider Pakete, obwohl dieser Adapter kein Schema deklariert |

Alle drei lösen zu einem einzigen `@ai-sdk/provider@3.0.15`. Details und
Optionen: `specs/_decision/002-add-ollama-llm-adapter.md`.

## Verwandte Seiten

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md) — der `LlmPort`-Vertrag
- [Architekturüberblick](overview.md) — Adapter hinter Ports
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — die
  Zwei-Stufen-Test-Konvention im Detail

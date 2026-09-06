# Mission: chrysalyst

> Eine lokale Web-App, die vage Produktideen nicht-technischer Ideengeber per adaptivem, LLM-gestütztem Interview Schritt für Schritt zu einer klaren, widerspruchsfreien, übergabereifen Spezifikation destilliert — samt explizitem Register der Annahmen und offenen Fragen.

## Problem Statement

Nicht-technische Ideengeber — Product Owner, Gründer, Fachbereichsleiter — haben eine Produktidee im Kopf, aber kein Mittel, daraus ein Dokument zu machen, das ein Entwickler oder Dienstleister direkt umsetzen kann. Sie schreiben Fließtext, der Lücken und Widersprüche enthält, die erst spät im Projekt auffallen und teuer werden.

Bestehende Hilfen greifen zu kurz:

- **Statische PRD-Templates** passen sich nicht an die Idee an; der Nutzer weiß nicht, was er in welches Feld schreiben soll.
- **Freies Chatten mit einer Cloud-KI** erzwingt keine Struktur, prüft keine Konsistenz und schickt sensible Produktideen an einen fremden Dienst.
- **Spec-Werkzeuge für Entwickler** (z. B. speq) setzen technisches Vorwissen und eine Kommandozeilen-Umgebung voraus.

chrysalyst stellt stattdessen gezielte Rückfragen, erkennt Widersprüche und Lücken in den Antworten und verdichtet das Gesagte iterativ zu einer strukturierten Spec.

## Target Users

| Persona | Goal | Key Workflow |
|---------|------|--------------|
| Nicht-technischer Ideengeber (Product Owner, Gründer ohne Dev-Hintergrund) | Aus einer vagen Idee eine übergabereife Spezifikation gewinnen, ohne selbst Struktur erfinden zu müssen | Startet die lokale Web-App, wählt ein Ziel-Template, beantwortet die adaptiv gestellten Fragen, klärt aufgezeigte Widersprüche, exportiert am Ende Spec + Annahmen + offene Fragen |
| Empfänger der Spec (Entwickler, Dienstleister) | Eine widerspruchsfreie, vollständige Vorlage erhalten und die noch offenen Punkte auf einen Blick sehen | Liest das exportierte Dokument; die Liste offener Fragen zeigt, was vor Umsetzungsbeginn noch zu klären ist |

## Core Capabilities

1. **Adaptives geführtes Interview** — Ein dynamischer Fragebaum: das System wählt anhand der bisherigen Antworten den nächsten Zweig, das LLM formuliert und vertieft die konkrete Frage. Kein starrer Fragebogen.
2. **Widerspruchs- und Lückenerkennung** — Das System erkennt, wenn zwei Antworten logisch nicht zusammenpassen oder ein wesentlicher Aspekt fehlt, und hakt gezielt nach, statt den Widerspruch in die Spec zu übernehmen.
3. **Schrittweise Destillation zur Spec** — Antworten werden fortlaufend zu einem wachsenden, strukturierten Dokument verdichtet, das der Nutzer während des Interviews entstehen sieht.
4. **Annahmen- und Offene-Fragen-Register** — Jede nicht verifizierte Festlegung wird als Annahme markiert, jeder bekannte ungeklärte Punkt als offene Frage geführt. Beides ist Teil des Exports.
5. **Template-Auswahl für den Export** — Der Nutzer wählt das Zielformat der Spezifikation (z. B. klassische PRD, User-Story-Sammlung, Lastenheft); dieselben Interview-Daten werden in das gewählte Format gerendert.

## Out of Scope

- **Code- oder Implementierungs-Generierung** — chrysalyst endet bei der Spezifikation; es erzeugt keinen Code, keine technischen Entwürfe, keine Architektur-Vorschläge für das Zielprodukt.
- **Markt-, Wettbewerbs- oder Pricing-Analyse als Ergebnisartefakt** — die optionale LLM-Websuche dient nur dazu, bessere Rückfragen zu stellen; ein Markt- oder Konkurrenzbericht ist kein Ausgabeprodukt.
- **Echtzeit-Kollaboration** — kein gleichzeitiges Co-Editing einer Session durch mehrere Personen.
- **Projekt- und Aufgabenverwaltung** — kein Ticket-Tracking, keine Sprints, keine Roadmap-Pflege.

## Geplant, nicht in der ersten Version

- **Gehostete Bereitstellung mit Feature-Parität** — chrysalyst soll später zusätzlich als Webapp nutzbar sein, gleichwertig zur lokalen Installation; die lokale Installation bleibt für jede:n möglich. Auch im gehosteten Betrieb wird das LLM-Backend automatisch erkannt oder vom Nutzer beigesteuert — kein aufgezwungenes Cloud-LLM. Mehrbenutzer-Modell, Authentifizierung und serverseitige Persistenz sind offen und werden in einem eigenen Plan geklärt, sobald die lokale Version steht. Die hexagonale Architektur (austauschbare Persistenz- und Server-Adapter, konfigurierbarer Bind-Host) hält diesen Weg offen, ohne dass die erste Version dafür Aufwand trägt.

## Domain Glossary

| Term | Definition |
|------|------------|
| chrysalyst | Kofferwort aus *chrysalis* (Verpuppung) und *catalyst/analyst*: die vage Idee verpuppt sich zur strukturierten Spec |
| Spezifikation (Spec) | Das strukturierte Zieldokument — beschreibt Problem, Nutzer und Anforderungen, nicht die Implementierung |
| Interview | Die geführte Frage-Antwort-Sitzung zwischen Nutzer und System |
| Fragebaum | Entscheidungsbaum möglicher Frage-Pfade; Zweige werden dynamisch anhand der Antworten gewählt |
| Destillation | Das iterative Verdichten der Antworten zu Spec-Inhalt |
| Widerspruch | Zwei Antworten, die logisch nicht gleichzeitig zutreffen können |
| Annahme | Eine vom System oder Nutzer gesetzte, nicht verifizierte Festlegung |
| Offene Frage | Ein bekannter ungeklärter Punkt, der die Spec blockiert oder gefährdet |
| Template | Ein wählbares Zielformat der Spec (PRD, User-Story-Sammlung, Lastenheft) |
| Session | Eine Interview-Instanz mit Verlauf und Ergebnis, als Ordner auf der Festplatte abgelegt |
| LLM-Adapter | Austauschbare Anbindung an ein lokales LLM-Backend (Ollama, llama.cpp, LM Studio) |
| Such-Adapter | Austauschbare Anbindung an eine Websuche (SearXNG, selbstgehostet) |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Sprache | TypeScript | Durchgängig für Core, Server und Web |
| Runtime | Node.js ≥ 22.18 | Server und Tooling |
| Paketmanager | pnpm (Workspaces) | Monorepo aus drei Paketen |
| Frontend | React + Vite | Lokale Web-App im Browser (Interview-UI, Live-Spec-Vorschau, Template-Auswahl) |
| Server | Hono + `@hono/node-server` | HTTP-API, LLM-/Such-Adapter-Proxy, Session-Datei-I/O |
| LLM-Anbindung | Adapter-Schicht: Ollama, llama.cpp (node-llama-cpp), LM Studio | Lokale Inferenz für Interviewführung, Widerspruchsprüfung, Destillation |
| Websuche | Adapter: SearXNG (selbstgehostet) | Optionale Anreicherung der Rückfragen |
| Persistenz | Dateisystem — Markdown + JSON pro Session | Kein Datenbank-Setup; Sessions transparent und versionierbar |
| Tests | Vitest | Unit- und Integrationstests |
| Lint / Format | ESLint + Prettier | Codequalität |
| Typecheck | `tsc --noEmit` | Statische Typprüfung |

**Coverage-Ziel:** ~90 % in `packages/core`; Adapter und UI nach Augenmaß, kein projektweiter Zwang.

## Commands

```bash
# Dev (Web + Server parallel)
pnpm dev

# Build
pnpm -r build

# Test
pnpm -r --include-workspace-root test

# Gather Code Coverage
pnpm -r test --coverage

# Lint & Format
pnpm lint
pnpm format

# Typecheck
pnpm typecheck
```

## Project Structure

```
chrysalyst/
├── packages/
│   ├── core/       # Domänenlogik: Interview-Engine, Fragebaum, Destillation,
│   │               #   Widerspruchsprüfung, Template-Rendering. Framework-frei,
│   │               #   ohne Netz-/Dateisystem-Zugriff. Definiert die Ports.
│   ├── server/     # Hono-Server: HTTP-API + Adapter (Ollama/llama.cpp/LM Studio,
│   │               #   SearXNG, Dateisystem-Session-Store).
│   └── web/        # React + Vite: Interview-UI, Live-Spec-Vorschau, Template-Auswahl.
├── specs/          # speq: mission.md, Feature-Specs, Pläne, Decision-Log.
├── openwiki/       # Generiertes Agent-Wiki über die Codebase (nach OpenWiki-Setup).
└── CLAUDE.md       # Entwicklungs-Workflow für KI-Agenten.
```

## Architecture

**Hexagonal (Ports & Adapters).**

`packages/core` enthält die gesamte Domänenlogik ohne Abhängigkeit auf Framework, Netzwerk oder Dateisystem und definiert die Ports: `LlmPort` (Inferenz, streamend), `SearchPort` (Websuche), `SessionStorePort` (Laden/Speichern von Sessions), `ClockPort` (Zeit).

`packages/server` stellt die treibende HTTP-API bereit und implementiert die Adapter: je ein Adapter für Ollama, llama.cpp und LM Studio hinter `LlmPort`; ein SearXNG-Adapter hinter `SearchPort`; ein Dateisystem-Adapter hinter `SessionStorePort`.

`packages/web` ist der primäre (treibende) Adapter: die React-UI spricht ausschließlich die HTTP-API des Servers.

**Datenfluss:** UI → Server-API → Anwendungsfälle in `core` → Ports → Adapter. LLM-Antworten streamen den umgekehrten Weg zurück bis in die UI, damit das Interview flüssig wirkt.

## Constraints

- **Technical**: Die erste Version läuft rein lokal auf `localhost` in einem modernen Browser; keine Accounts, kein serverseitiger Speicher, Server bindet nur die Loopback-Schnittstelle. Eine später gleichrangige gehostete Bereitstellung ist vorgesehen (siehe »Geplant, nicht in der ersten Version«). Netzzugriff nur für die optionale LLM-Websuche und für Modell-/Backend-Downloads — das Kern-Interview funktioniert ohne Netz. Ist kein LLM-Backend erreichbar, erkennt die App dies beim Start und führt durch das Setup des gewählten Backends; das Interview bleibt blockiert, bis ein Backend verfügbar ist. Bestehende Sessions bleiben in diesem Zustand lesbar und exportierbar.
- **Business**: Das Projekt ist auch ein Machbarkeits-Statement — kleine, lokal laufende Modelle sollen für strukturierte Interviewführung ausreichen. UI und Spec-Ausgabe sind zweisprachig (Deutsch und Englisch). Keine Telemetrie ohne ausdrückliche Zustimmung.
- **Performance**: Das Interview muss sich flüssig anfühlen. LLM-Antworten werden gestreamt; die erste spürbare Reaktion soll trotz kleinem Modell innerhalb weniger Sekunden erscheinen.

## External Dependencies

| Service | Purpose | Failure Impact |
|---------|---------|----------------|
| Lokales LLM-Backend (Ollama / llama.cpp / LM Studio) | Inferenz für Interviewführung, Widerspruchsprüfung, Destillation | Kein neues Interview möglich; die App führt durch das Setup. Bestehende Sessions bleiben lesbar und exportierbar |
| Sprachmodell-Gewichte | Einmaliger Download durch den Nutzer in das gewählte Backend | Backend läuft, aber ohne Modell keine Inferenz; die App weist auf den nötigen Modell-Download hin |
| SearXNG-Instanz (optional, selbstgehostet) | Websuche zur Anreicherung der Rückfragen im Interview | Das Interview läuft unverändert weiter, nur ohne Recherche-Anreicherung |

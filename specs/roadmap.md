# Roadmap: chrysalyst

> Geordnete Meilensteine vom Monorepo-Scaffold bis »v1 komplett«, plus den einen
> Post-v1-Meilenstein. Autoritativ für die **Reihenfolge**; `specs/mission.md`
> bleibt autoritativ für das *Was* und *Warum*, `specs/_decision/` für begründete
> Technik-Entscheidungen.

## Sequenzierungs-Strategie: Walking Skeleton, dann vertiefen

M1–M3 bauen eine dünne, senkrechte Scheibe durch alle Schichten — echter
Ollama-Adapter, echter Dateisystem-Session-Store, minimaler Use Case in `core`,
SSE-Route, eine React-Ansicht — **bevor** Fragebaum, Destillation oder
Widerspruchsprüfung existieren. Alles danach vertieft eine Scheibe, die bereits
läuft.

Begründung, nach Risiko geordnet:

1. **Machbarkeits-Statement.** Die Mission behauptet, kleine lokale Modelle
   genügen für strukturierte Interviewführung. Das ist nur an einem echten Modell
   falsifizierbar. Erst eine Engine gegen Fakes zu bauen hieße, ein Dutzend
   Meilensteine auf eine ungeprüfte Prämisse zu setzen.
2. **Streaming-Performance ist emergent.** »Erste spürbare Reaktion innerhalb
   weniger Sekunden« entsteht aus echtem Modell + echtem SSE + echtem Render.
   Keine Schicht belegt das allein, und die Antwort bestimmt die API-Form.
3. **Die Ports warten auf ihren ersten echten Aufrufer.** `decision-log [6]`
   hat den strukturierten Output bewusst gelöscht statt deklariert. Zuerst Adapter
   ohne Aufrufer zu bauen, ließe Provider-Vokabular in die Ports zurücklecken.

Der Einwand »Fakes erlauben ~90 % Coverage in `core` ohne laufendes Ollama« steht
dem nicht entgegen: Das Skelett nutzt dieselben Ports. Fakes bleiben das primäre
Testsubstrat für `core`. M3 legt die **Test-Stufen-Konvention** fest
(Standardstufe = nur Fakes, hermetisch, CI-tauglich; getaggte `live`-Stufe =
braucht laufendes Ollama, in CI übersprungen). M4 baut die CI-Pipeline gegen
dieses Tag aus.

## Technische Leitplanken

Entscheidungen, die für die ganze Roadmap gelten. Jede wird ein ADR, sobald der
erste Meilenstein sie berührt.

| Leitplanke | Entscheidung | Status |
|---|---|---|
| **Kein Agent-Framework in der Domäne** | Die Interview-Engine lebt in `packages/core` als eigener Code. Kein LangChain/LangGraph/deepagents als Domänen-Abhängigkeit. Begründung: `core` ist laut Mission framework-frei; der Fragebaum ist von uns geschrieben und deterministisch, kein LLM-geplanter Graph. | fest |
| **Engine-Struktur** | Hand-gerollter Zustandsautomat **oder** LangGraph.js in `core`. M3 baut beide Turn-Loop-Varianten als Wegwerf-Spike (Fokus: Persistenz-Integration `SessionStorePort` vs. LangGraph-Checkpointer). Entscheidung wird vor M7 als ADR festgehalten. | offen — Spike in M3 |
| **`LlmPort`-Adapter** | **Vercel AI SDK (`ai` v6)** in `packages/server`, hinter dem Port. Eine Schnittstelle für Ollama, llama.cpp und LM Studio; geprüftes SSE-Token-Streaming; `Output.object()` + zod für strukturierten Output mit Repair. `packages/core` importiert es nie. | fest |
| **Strukturierter LLM-Output** | `Output.object()` + zod-Schema im Adapter. Kein hand-gerollter JSON-Parser. Der `LlmPort`-Vertrag bekommt in M10 eine Antwortform. | fest — Delta in M10 |
| **Kein Cloud-LLM-SDK** | Weder Anthropic- noch OpenAI-SDK irgendwo im Produktcode. Die App läuft gegen lokale Modelle. | fest |
| **On-Disk-Session-Schema** | Jede persistierte Session trägt ab dem ersten Schreiben ein `schemaVersion`-Feld. `TState` wächst über M2 → M8 → M9 → M14; ohne Versionsfeld brechen spätere Meilensteine bestehende Session-Ordner still. | fest — ab M2 |

## Überblick

| # | Meilenstein | Status | Hängt ab von | Core Capability |
|---|---|---|---|---|
| M0 | Monorepo-Scaffold | ✅ erledigt (`001-add-monorepo-scaffold`) | — | — |
| C1 | `openwiki --init` *(Chore)* | ⬜ offen | M0 | — |
| C2 | Minimale CI *(Chore)* | ⬜ offen | M0 | — |
| M1 | Ollama-LLM-Adapter | ⬜ offen | C1, C2 | 1 |
| M2 | Dateisystem-Session-Store | ⬜ offen | M0 | — |
| M3 | Walking Skeleton: eine echte Frage E2E + Engine-Spike | ⬜ offen | M1, M2 | 1 (dünn) |
| M4 | CI-Test-Stufen + `core`-Coverage-Gate | ⬜ offen | M3 | — (Leitplanke) |
| M5 | DE/EN-Fundament | ⬜ offen | M3 | 1 (Constraint) |
| M6 | Backend-Setup-Gate | ⬜ offen | M3 | 1 (Constraint) |
| M7 | Fragebaum-Modell | ⬜ offen | M3, M5 | **1** |
| M8 | Adaptive Fragewahl + Turn-Loop | ⬜ offen | M7 | **1** |
| M9 | Spec-State-Modell | ⬜ offen | M8 | **3** |
| M10 | Antwort-Destillation | ⬜ offen | M9 | **3** |
| M11 | Live-Spec-Vorschau | ⬜ offen | M10 | **3** |
| M12 | Widerspruchs- + Lückenerkennung | ⬜ offen | M11 | **2** |
| M13 | Klärungs-Rückfrage-Loop | ⬜ offen | M12 | **2** |
| M14 | Annahmen- + Offene-Fragen-Register | ⬜ offen | M13 | **4** |
| M15 | Template-Auswahl + Export | ⬜ offen | M14 | **5** |
| M16 | Optionale Suchanreicherung *(descope-Kandidat)* | ⬜ offen | M13 | Qualität von 1, 2 |
| M17 | Session-Bibliothek | ⬜ offen | M15 | — |
| M18 | v1-Härtung → **v1 komplett** | ⬜ offen | M17 (M16) | alle fünf |
| P1 | Gehostete Bereitstellung mit Feature-Parität | ⬜ offen (post-v1) | M18 | — |

Jeder offene Meilenstein läuft über die Standard-Route aus `CLAUDE.md`:
`/speq:plan` → `/speq:implement` → `/speq:record` → `openwiki`.

---

## C1 — `openwiki --init` *(Chore, kein Meilenstein)*

**Warum jetzt:** Die »Wiki zuerst«-Regel aus `CLAUDE.md` ist unerfüllbar, solange
kein `openwiki/`-Verzeichnis existiert und die `OPENWIKI:START/END`-Marker leer
sind. Die OpenWiki-Integration (`.mcp.json`, `.claude/skills/openwiki/`) ist bereits
installiert und committet; es fehlt der erste Lauf.

**Blocker:** Der `openwiki`-MCP-Server lädt erst nach einem Claude-Code-Neustart im
Repo. Danach über die Doku-Abkürzung (`CLAUDE.md`) erledigen — kein Plan.

**Fertig, wenn:** `openwiki/`-Seiten existieren, die `OPENWIKI`-Marker in `CLAUDE.md`
sind gefüllt, `/speq:audit` meldet keine Wiki-Drift.

## C2 — Minimale CI *(Chore, kein Meilenstein)*

**Ziel:** Ab M1 läuft jeder Push gegen eine Pipeline.

**Umfang:** GitHub Actions: install → lint → format:check → typecheck →
`pnpm -r --include-workspace-root test`. **Ohne** Coverage-Gate, **ohne**
Test-Stufen-Logik — die kommen in M4, sobald der erste `live`-getaggte Test
existiert.

**Fertig, wenn:** Ein PR zeigt die Checks grün auf einem sauberen Runner; ein
absichtlich kaputter Test lässt den Lauf fehlschlagen.

---

## M1 — Ollama-LLM-Adapter

**Ziel:** `LlmPort` bekommt seine erste echte Implementierung.

**Liefert:** Ein Adapter in `packages/server`, der `status`/`complete`/`stream`
über das **Vercel AI SDK** gegen eine lokale Ollama-Instanz erfüllt. `AbortSignal`
wird respektiert; ein unerreichbares Backend liefert `LlmBackendStatus` mit der
Liste lokaler Modelle, **nie** einen Throw.

**Pläne:** `ollama-llm-adapter`

**Fertig, wenn:** Gegen ein laufendes Ollama mit einem Modell ≤ 4B: `complete`
liefert einen ganzen String, `stream` liefert Chunks in Reihenfolge, `stream` mit
abgebrochenem Signal stoppt, `status` bei gestopptem Ollama meldet »nicht
verfügbar« + Modell-Liste. `live`-getaggte Tests gegen das echte Backend, dazu
Fake-basierte Adapter-Tests für die Fehlerübersetzung.

**Entscheidet außerdem:** ADR zur Vercel-AI-SDK-Wahl · Form der `live`-Test-Stufe.

**Core Capability:** 1 (Infrastruktur)

## M2 — Dateisystem-Session-Store

**Ziel:** `SessionStorePort` bekommt seine erste echte Implementierung.

**Liefert:** Ein Adapter über `~/.chrysalyst/sessions/<id>/` mit JSON-State plus
Markdown-Transkript pro Session. Jede geschriebene Session trägt `schemaVersion`.
`list`/`load`/`save` erfüllt; `load` einer unbekannten ID liefert `undefined`, wirft
nicht.

**Pläne:** `filesystem-session-store`

**Fertig, wenn:** Ein Save/Load-Roundtrip über echte temporäre Verzeichnisse
erhält die Session identisch; `list` findet genau die geschriebenen IDs; die
persistierte `session.json` enthält `schemaVersion`. Adapter-Tests gegen das echte
Dateisystem (`mkdtemp`).

**Core Capability:** — (Infrastruktur)

## M3 — Walking Skeleton: eine echte Frage E2E + Engine-Spike

**Ziel:** Ein echtes lokales Modell stellt eine Frage im Browser, die Antwort
landet auf der Platte. Erstes laufendes Produkt.

**Liefert:** Minimaler Einzelschritt-Use-Case in `packages/core` über
`CoreDependencies`, Hono-SSE-Route, `hc<AppType>`-Client in `packages/web`, eine
streamende Frage-Ansicht. Token strömen bis ins DOM. Plus: **Engine-Struktur-Spike**
— dieselbe eine Runde einmal über einen hand-gerollten Turn-Loop und einmal über
LangGraph.js `interrupt()` + einen `SessionStorePort`-gestützten Checkpointer, um
die Persistenz-Integrationskosten konkret zu spüren.

**Pläne:** `single-question-walking-skeleton` · `engine-structure-spike`

**Fertig, wenn:** `pnpm dev` → Browser → Frage strömt tokenweise → getippte
Antwort geht durch → `session.json` enthält Frage, Antwort, Zeitstempel,
`schemaVersion`. Machbarkeits-Notiz im Verification-Report (Modell, Zeit bis erstes
Token). Beide Spike-Varianten existieren als Wegwerf-Code; eine ADR-reife
Entscheidungs-Notiz für die M7-Engine-Struktur ist festgehalten.

**Entscheidet außerdem:** Styling-Ansatz (impeccable-Subphase, `decision-log [14]`)
· konkretes `TState` v1 · SSE-Event-Kontrakt · Engine-Struktur für M7.

**Core Capability:** 1 (dünnste Form)

## M4 — CI-Test-Stufen + `core`-Coverage-Gate

**Ziel:** Jeder spätere Meilenstein ist durch eine Pipeline geschützt, die die
`live`-Stufe kennt.

**Liefert:** Die CI aus C2 wird erweitert: `live`-getaggte Tests werden im
CI-Lauf übersprungen; das ~90-%-Coverage-Ziel für `packages/core` wird erstmals
als Gate durchgesetzt (`decision-log`: »Enforcement kommt mit dem CI-Plan«).

**Pläne:** `ci-test-tiers`

**Fertig, wenn:** Ein PR ist grün auf einem Runner ohne Ollama; ein absichtlicher
`core`-Coverage-Abfall und ein versehentlich in CI laufender `live`-Test lassen den
Lauf je fehlschlagen.

**Core Capability:** — (Leitplanke)

## M5 — DE/EN-Fundament

**Ziel:** Die App spricht Deutsch und Englisch — Oberfläche **und** Prompts.

**Liefert:** Locale-Erkennung + -Umschaltung. Alle UI-Strings und **alle
Prompt-Templates** je Locale ausgelagert. Das Modell wird angewiesen, in der
Sprache des Nutzers zu interviewen.

**Pläne:** `bilingual-ui-and-prompts`

**Fertig, wenn:** Locale-Umschaltung ändert die Oberfläche *und* die Sprache, in
der das Modell fragt — je ein `live`-Test pro Locale. Ab hier verfasst jeder
prompt-tragende Meilenstein seine Templates zweisprachig.

**Core Capability:** 1 (Constraint-Erfüllung)

## M6 — Backend-Setup-Gate

**Ziel:** Die App verhält sich ohne LLM-Backend korrekt.

**Liefert:** `status`-Probe beim Start. Geführter Setup-Screen, der das gewählte
Backend und das fehlende Modell benennt. Neue Interviews bleiben blockiert, solange
kein Backend verfügbar ist. Bestehende Sessions bleiben lesbar.

**Pläne:** `llm-backend-setup-gate`

**Fertig, wenn:** Bei gestopptem Ollama zeigt die App die Setup-Führung ohne
Absturz, und das Transkript einer bestehenden Session rendert weiterhin; Ollama
starten + neu laden gibt das Interview frei.

**Bewusst offen:** Die zweite Hälfte des Constraints — bestehende Sessions bleiben
in diesem Zustand *exportierbar* — ist erst ab M15 erfüllbar und wird
Abnahmekriterium von M18.

**Core Capability:** 1 (Constraint-Erfüllung)

## M7 — Fragebaum-Modell

**Ziel:** Die Struktur möglicher Frage-Pfade existiert als Domänen-Modell.

**Liefert:** Ein Zweig-/Knoten-Modell in `packages/core`, gebaut in der in M3
entschiedenen Struktur (hand-gerollt oder LangGraph.js). Kein adaptives Verhalten
— nur das Modell und seine Invarianten.

**Pläne:** `question-tree-model`

**Fertig, wenn:** Das Modell bildet einen mehrstufigen Baum mit benannten Zweigen
ab; ungültige Übergänge sind typ- oder testseitig ausgeschlossen; `core` bleibt
bei ≥ 90 % Coverage.

**Core Capability:** **1 — Adaptives geführtes Interview** (Grundlage)

## M8 — Adaptive Fragewahl + Turn-Loop

**Ziel:** Das System wählt den nächsten Zweig anhand der bisherigen Antworten; das
LLM formuliert und vertieft die konkrete Frage. Capability 1 vollständig.

**Pläne:** `adaptive-question-selection` · `interview-turn-loop`

**Fertig, wenn:** Gegen ein skriptgesteuertes `LlmPort`-Fake erzeugen zwei
divergierende Eröffnungsantworten deterministisch zwei verschiedene, zugesicherte
Zweigfolgen von je ≥ 5 Schritten; ein `live`-Test führt eine 5-Schritt-Session
gegen ein echtes kleines Modell ohne fehlformatierte Ausgabe zu Ende.

**Core Capability:** **1 — Adaptives geführtes Interview**

## M9 — Spec-State-Modell

**Ziel:** Ein strukturiertes Modell des wachsenden Spec-Dokuments in `core`.

**Pläne:** `spec-state-model`

**Fertig, wenn:** Das Modell trägt benannte Abschnitte, jede Eintragung ist einem
Interview-Schritt zuordenbar, und es übersteht einen Save/Load-Roundtrip über
`SessionStorePort`.

**Core Capability:** **3 — Schrittweise Destillation** (Grundlage)

## M10 — Antwort-Destillation

**Ziel:** Jeder Interview-Schritt verdichtet die Antworten in Spec-Abschnitte.

**Liefert:** Destillations-Logik in `core`. Dies ist der erste echte Aufrufer für
strukturierten LLM-Output: der Plan besitzt das Spec-Delta, das dem `LlmPort` eine
Antwortform gibt (`Output.object()` + zod im Adapter, `decision-log [6]`).

**Pläne:** `answer-distillation`

**Fertig, wenn:** Eine 6-Schritt-Skript-Session ergibt einen Spec-State, dessen
Abschnitte auf konkrete Schritte zurückführbaren Inhalt tragen (in `core`
zugesichert); der strukturierte Output validiert gegen das zod-Schema, und ein
absichtlich fehlformatierter Modell-Output wird repariert oder sauber abgelehnt.

**Core Capability:** **3 — Schrittweise Destillation**

## M11 — Live-Spec-Vorschau

**Ziel:** Der Nutzer sieht die Spec beim Antworten wachsen.

**Pläne:** `live-spec-preview`

**Fertig, wenn:** Die Vorschau im Browser wächst über die Schritte einer Session
sichtbar, ohne Reload; der angezeigte Inhalt entspricht dem persistierten
Spec-State.

**Core Capability:** **3 — Schrittweise Destillation**

## M12 — Widerspruchs- + Lückenerkennung

**Ziel:** Das System erkennt logisch unvereinbare Antworten und fehlende
wesentliche Aspekte.

**Pläne:** `contradiction-detection` · `gap-detection`

**Fertig, wenn:** Eine Fixture-Session mit gepflanztem Widerspruch (»keine
Nutzerkonten«, später »Nutzer sehen ihre Historie«) wird als Widerspruch erkannt
und benennt beide Antworten; eine Lücken-Fixture wird als fehlender Aspekt
erkannt. Gegen Fakes zugesichert, dazu eine `live`-Bestätigung.

**Core Capability:** **2 — Widerspruchs- und Lückenerkennung** (Erkennung)

## M13 — Klärungs-Rückfrage-Loop

**Ziel:** Statt einen Widerspruch stillschweigend in die Spec zu übernehmen, hakt
das System gezielt nach.

**Pläne:** `clarification-followup-loop`

**Fertig, wenn:** Ein erkannter Widerspruch erzeugt eine Rückfrage, die beide
Antworten benennt; nach der Klärung erscheint der Widerspruch nicht im Spec-State.
Die widersprüchliche Stelle ist in der UI markiert.

**Core Capability:** **2 — Widerspruchs- und Lückenerkennung**

## M14 — Annahmen- + Offene-Fragen-Register

**Ziel:** Jede unverifizierte Festlegung ist als Annahme markiert, jeder bekannte
ungeklärte Punkt als offene Frage geführt.

**Pläne:** `assumptions-open-questions-register`

**Fertig, wenn:** Eine Skript-Session erzeugt ein Register mit ≥ 1 Annahme (auf
eine systemgesetzte Vorgabe zurückführbar) und ≥ 1 offener Frage (auf eine erkannte
Lücke zurückführbar); das Register übersteht einen Save/Load-Roundtrip; die UI
listet beides.

**Core Capability:** **4 — Annahmen- und Offene-Fragen-Register**

## M15 — Template-Auswahl + Export

**Ziel:** Dieselben Interviewdaten rendern in das gewählte Zielformat.

**Liefert:** Template-Wahl (PRD, User-Story-Sammlung, Lastenheft), Renderer in
`core`, Export von Spec plus Annahmen plus offenen Fragen in der gewählten Sprache,
Download aus dem Browser.

**Pläne:** `spec-template-rendering` · `template-selection-ui` · `spec-export`

**Fertig, wenn:** Ein Fixture-Spec-State rendert in alle drei Templates, je
Snapshot-zugesichert, in DE und EN; das Register erscheint in jeder Ausgabe; der
Browser-Download erzeugt eine Markdown-Datei, die byteweise dem `core`-Render
entspricht.

**Core Capability:** **5 — Template-Auswahl für den Export**

## M16 — Optionale Suchanreicherung *(descope-Kandidat)*

**Ziel:** Bessere Rückfragen durch optionale Websuche.

**Liefert:** SearXNG-Adapter hinter `SearchPort`; angereicherte Rückfragen bei
Konfiguration; **unverändertes Interview ohne Suche** — `CoreDependencies.search`
bleibt das eine optionale Mitglied (`decision-log [8]`).

**Hängt ab von:** M13. Ab da jederzeit einplanbar.

**Pläne:** `searxng-search-adapter` · `search-enriched-questions`

**Fertig, wenn:** Mit konfigurierter SearXNG-URL belegt eine Rückfrage nachweislich
suchgestützten Kontext; ohne `search` im Dependency-Set läuft die komplette
M8–M15-Suite unverändert grün, und keine Platzhalter-`SearchPort`-Implementierung
ist zum Kompilieren nötig.

**Keine eigene Capability.** Ein Markt- oder Konkurrenzbericht ist ausdrücklich Out
of Scope. **Als Erstes streichen, wenn v1 früher raus muss.**

## M17 — Session-Bibliothek

**Ziel:** Bestehende Sessions auflisten, fortsetzen, löschen.

**Liefert:** Session-Übersicht in der UI; Fortsetzen einer unterbrochenen Session;
Löschen. Dieser Meilenstein besitzt das Spec-Delta, das `SessionStorePort` um
`delete` erweitert (`decision-log [9]`: »hinzufügen, wenn ein Feature es braucht«).

**Pläne:** `session-library`

**Fertig, wenn:** Die Übersicht listet alle Sessions auf der Platte; eine
fortgesetzte Session nimmt den Interview-Faden an der richtigen Stelle auf; eine
gelöschte Session verschwindet aus Übersicht und Dateisystem.

**Core Capability:** — (Nutzbarkeit)

## M18 — v1-Härtung → **v1 komplett**

**Ziel:** Alle fünf Capabilities durchgängig von einem nicht-technischen Nutzer
benutzbar, alle Constraints messbar erfüllt.

**Liefert:** Lesen und Exportieren bestehender Sessions bei fehlendem Backend
(schließt den halben Constraint aus M6). Gemessenes
Streaming-Performance-Budget. Konsolidierender impeccable-Designdurchgang über die
Interview-Oberfläche. First-Run-README.

**Pläne:** `streaming-performance-budget` · `interview-ui-design-pass`
(First-Run-Doku über die Doku-Abkürzung, kein eigener Plan)

**Fertig, wenn:** Ein vollständiger Interviewlauf durch eine unbeteiligte Person,
vom leeren Zustand bis zum exportierten Lastenheft, kommt ohne Kommandozeile aus.
Zeit bis zum ersten Token gemessen und gegen ein benanntes Budget auf einem
benannten kleinen Modell festgehalten. Bei gestopptem Ollama öffnet und exportiert
eine bestehende Session weiterhin. `/speq:audit` sauber, `openwiki` regeneriert, CI
grün.

**Core Capabilities:** **alle fünf**, dazu die Technical-, Business- und
Performance-Constraints.

---

## P1 — Gehostete Bereitstellung mit Feature-Parität · post-v1

**Ziel:** chrysalyst zusätzlich als Webapp nutzbar, gleichwertig zur lokalen
Installation; die lokale Installation bleibt für jede:n möglich.

**Liefert:** Mehrbenutzer-Modell, Authentifizierung, serverseitige Persistenz,
konfigurierbarer Bind-Host, automatisch erkanntes oder vom Nutzer beigesteuertes
LLM-Backend auch im gehosteten Betrieb — **kein aufgezwungenes Cloud-LLM**.

**Hängt ab von:** M18. Die Mission vertagt das ausdrücklich: »werden in einem
eigenen Plan geklärt, sobald die lokale Version steht.«

**Pläne:** von Natur aus offen. Erwartet: `/speq:mission`-Auffrischung, dann
`hosted-deployment-architecture` → `multi-user-sessions` → `authentication` →
`server-side-session-store`.

**Fertig, wenn:** noch nicht definiert — bewusst. Keine Kriterien hier
vorwegnehmen.

**Bereits eingezahltes Architekturguthaben:** `SessionStorePort<TState>` ist
generisch und adaptertauschbar, und der Bind-Host ist ein Parameter mit Default
`127.0.0.1` statt einer festen Zuweisung (`decision-log [7]`, `[15]`). Die lokale
Version trägt für diesen Weg keinen Aufwand.

---

## Querschnittsthemen

| Thema | Verortung | Warum |
|---|---|---|
| **DE/EN zweisprachig** | eigener Meilenstein **M5** | Kein reines String-Problem — die *Prompts* sind zweisprachig, und das Modell muss in der Sprache des Nutzers interviewen. Ab M7 verfasst jeder Meilenstein Prompt-Templates. Vor M7 landen, nicht sieben Meilensteine später nachrüsten. |
| **Backend-Setup-Flow** | eigener Meilenstein **M6** | Benannter Mission-Constraint mit echtem Screen und Zustandsautomat. Braucht ein echtes `LlmPort.status` (nicht vor M1); gated jede Demo (nicht nach M7). |
| **CI** | Chore **C2** (minimal) + Meilenstein **M4** (Stufen + Gate) | Die Basis-Pipeline gehört vor M1. Die `live`-Test-Stufe und das Coverage-Gate brauchen den ersten `live`-Test aus M1/M3 — die Stufengrenze wird in dem Moment entworfen, nicht nachgerüstet. |
| **OpenWiki-Auffrischung** | nie ein Meilenstein — Phase 4 jedes Plans | `CLAUDE.md` hat das in der Standard-Route. Einmalige Ausnahme: der Erstlauf ist **Chore C1**. |
| **impeccable-Design** | Subphase jedes UI-Plans + ein konsolidierender Durchgang in **M18** | `decision-log [14]` vertagt den Styling-Stack auf das erste UI-Feature (= M3). M18 vereinheitlicht, erfindet nicht neu. |
| **Strukturierter LLM-Output** | Leitplanke; erster Aufrufer ist **M10** | In `decision-log [6]` gelöscht statt deklariert, vom ersten echten Aufrufer zu entwerfen. Die Destillation ist dieser Aufrufer. Umsetzung über `Output.object()` + zod im Adapter. |
| **Session-Schema-Evolution** | Leitplanke; ab **M2** | `TState` wächst über M2 → M8 → M9 → M14. Ohne `schemaVersion` ab dem ersten Schreiben brechen spätere Meilensteine bestehende Session-Ordner still — und die Mission verspricht lesbare Sessions. |
| **Engine-Struktur** | Spike in **M3**, ADR vor **M7** | Hand-gerollt vs. LangGraph.js in `core`. M3 baut beide Turn-Loop-Varianten als Wegwerf-Code, Fokus auf die Persistenz-Integration. |

---

## Arbeitsweise

- **Nächster Schritt = oberster noch offener Meilenstein** in der Überblicks-Tabelle. Kein Vorgreifen ohne Ansage + Begründung (`CLAUDE.md`, »Leitplanken«).
- Jeder Meilenstein → seine Pläne der Reihe nach durch die Standard-Route: `/speq:plan <name>` → `/speq:implement <name>` → `/speq:record <name>` → `openwiki`.
- **Status hier fortschreiben** nach jedem `/speq:record`: `⬜ offen` → `✅ erledigt` mit dem Recorded-Plan-Namen, wie bei M0.
- Eine Leitplanke, die ein Meilenstein berührt, wird dort zum ADR in `specs/_decision/`.

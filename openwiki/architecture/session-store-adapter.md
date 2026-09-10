---
type: architecture
title: Dateisystem-Session-Store-Adapter
description: Die erste echte SessionStorePort-Implementierung — createFilesystemSessionStore und sessionStoreConfigFromEnv über node:fs/promises, mit dem session.json-Envelope (schemaVersion 1) und transcript.md pro Session, der Absent/Unreadable/Read-Dreiteilung beim Lesen, der Identifier-Sicherheit, der fsync-vor-rename-Durability-Barriere, der Fehlerübersetzung an der Grenze und der hermetischen Teststufe.
tags: [session-store, adapter, filesystem, persistence, durability, schema-version, testing]
sources:
  - id: openwiki-source-abd0a1ef3f59dbd18dcf5018
    resource: repo://packages/core/src/interview/transcript.ts
  - id: openwiki-source-836b1821935d4a9e043f8655
    resource: repo://packages/server/src/adapters/session-store/filesystem-session-store.test.ts
  - id: openwiki-source-71e3a7de53c44488096fed02
    resource: repo://packages/server/src/adapters/session-store/filesystem-session-store.ts
  - id: openwiki-source-d3fb78d820eb72194e376138
    resource: repo://packages/server/src/composition.ts
  - id: openwiki-source-0e06dd8dca1a5b09ef9998b2
    resource: repo://specs/_decision/003-add-filesystem-session-store.md
  - id: openwiki-source-8f43520ecd17db2dd2f46900
    resource: repo://specs/adapters/filesystem-session-store/spec.md
  - id: openwiki-source-a0a8fcea3fc317de88a8e08c
    resource: repo://specs/roadmap.md
generated: { by: "claude-code", at: "2026-09-10T15:50:21.943Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-10T15:50:21.943Z
---

# Dateisystem-Session-Store-Adapter

`packages/server/src/adapters/session-store/filesystem-session-store.ts` ist die
erste echte Implementierung von [`SessionStorePort`](domain-ports.md). Sie hält
jede Interview-Session als **einen Ordner auf der Platte**: einen versionierten
JSON-Envelope neben einem Markdown-Transkript, unter einem Wurzelverzeichnis,
das aus der Umgebung kommt. Der Adapter erfüllt Roadmap-Meilenstein M2 und ist
in `003-add-filesystem-session-store` aufgezeichnet.

## Verantwortung und Grenze

Dieses Modul ist der **einzige Ort im Workspace, der weiß, dass eine Session
ein Verzeichnis auf der Platte ist**. Es schreibt `<root>/<id>/session.json` und
`<root>/<id>/transcript.md`; `@chrysalyst/core` importiert nichts davon und sieht
nur `SessionStorePort`. Das Verzeichnislayout, der Envelope und `schemaVersion`
sind Privatsache des Adapters und enden an seiner Grenze — den *Inhalt* des
Transkripts komponiert der Store dagegen nicht selbst (siehe unten).

Auch ein Fehler wird im Vokabular der Domäne gemeldet: Jede Ablehnung ist eine
**eigene `Error`**, benennt die Session oder die Wurzel, die nicht erreichbar
war, und trägt den zugrundeliegenden Fehler als `cause` — ein Aufrufer hinter
`SessionStorePort` muss nie einen `node:fs`-Fehlercode lesen, und die
temporären Namen, durch die der Store schreibt, tauchen in der Meldung nicht
auf.

Das Modul exportiert zwei Funktionen:

- `createFilesystemSessionStore<TState>(config)` → gibt einen `SessionStorePort<TState>` zurück
- `sessionStoreConfigFromEnv(env?)` → löst das Wurzelverzeichnis auf (die Kompositions-Naht)

## Konfiguration: das Wurzelverzeichnis

`FilesystemSessionStoreConfig` trägt ein einziges Feld, `rootDir`. Dass die
Wurzel ein Parameter ist und keine Konstante, ist die ganze Test-Naht:
Produktion zeigt den Store auf das Home-Verzeichnis des Nutzers, jeder Test auf
eine `mkdtemp`-Sandbox — keiner kann die Dateien des anderen erreichen.

`sessionStoreConfigFromEnv` spiegelt `llmConfigFromEnv` aus dem
[LLM-Adapter](llm-adapter.md):

| Variable | Default |
|----------|---------|
| `CHRYSALYST_SESSION_DIR` | `join(homedir(), '.chrysalyst', 'sessions')` |

Ein gesetzter Wert überschreibt den Default und wird mit `resolve()` zu einem
absoluten Pfad gemacht, damit die Wurzel des Stores **nicht mit dem
Arbeitsverzeichnis wandert**. Die Umgebung wird übergeben statt aus dem
Ambient-Zustand gelesen, sodass die Auflösung eine reine Funktion ihres
Eingabe-Records bleibt; nichts hier berührt das Dateisystem — chrysalyst bekommt
keinen dotenv-Loader.

## Der Envelope: `session.json`

`session.json` ist ein **Envelope**, kein serialisiertes `StoredSession`:

```json
{
  "schemaVersion": 1,
  "id": "session-1",
  "createdAt": "2026-01-01T08:00:00.000Z",
  "updatedAt": "2026-02-14T17:45:00.000Z",
  "state": { }
}
```

`schemaVersion` ist der ganzzahlige Modul-Konstant `1` und versioniert **den
Envelope, nicht die Domänen-Session**. `StoredSession` in `@chrysalyst/core`
bekommt kein solches Feld — das verböte der core-ports-Vertrag, und ein
gehosteter Store (Roadmap P1) schreibt gar kein `session.json`. Der Store
validiert mit `zod` genau die vier Felder, die die Versionsprüfung nicht besitzt
(`id`, `createdAt`, `updatedAt`, `state`), prüft die Version **bevor** das
Schema-Objekt läuft und reicht `state` durch eine einzige dokumentierte
`as`-Assertion unangetastet nach `TState` weiter.

Der Preis trägt der Aufrufer: **`TState` muss einen JSON-Roundtrip
überleben.** Ein `Date`, das in der Domänen-State steckt, kommt als String
zurück; nur die beiden Envelope-Zeitstempel werden zu `Date` wiederbelebt. M3
wählt den konkreten `TState` und erbt diese Einschränkung.

### `transcript.md` — der Store komponiert es nicht

`transcript.md` trägt das Interview, aber **der Store setzt es nicht zusammen**.
Die Config nimmt seit M3 einen optionalen Renderer:

```ts
readonly renderTranscript?: (session: StoredSession<TState>) => string;
```

— eine reine Funktion vom gespeicherten Session-Objekt zu Markdown, die
dasselbe `StoredSession<TState>` bekommt, das `save` erhält. Der Store ruft
sie, wenn eine konfiguriert ist; sonst schreibt er den **Metadaten-Header**, den
er vorher schrieb (Kennung + beide Zeitstempel). Der Renderer gehört dem
Eigentümer des Zustands: `@chrysalyst/core` liefert den des Interviews
([`renderTranscript`](interview-round.md)), die
[Kompositionswurzel](interview-http-and-composition.md) reicht ihn durch. Ein
Aufrufer, der ein anderes `TState` speichert, braucht keinen Renderer, und der
Store interpretiert weiterhin nie, was er hält.

Das Transkript ist **nicht versioniert** — `schemaVersion` versioniert weiter
allein das Envelope. Ein zweiter Save derselben Kennung schreibt das Transkript
neu, sodass ein abgeschlossener Save nie eines hinterlässt, das eine
ältere Revision beschreibt. Zwei neue Szenarien fixieren das: der
Header-Fallback ohne Renderer (die drei unveränderten `003`-Szenarien
bleiben grün — der Beleg, dass es keine neue Pflicht ist) und ein Renderer,
der wirft (der Save lehnt ab, die vorherige Revision bleibt ladbar).

## Lesen: eine Lesung, zwei Politiken

Ein privater Leser (`readEnvelope`) klassifiziert einen Session-Ordner in genau
eine von drei Antworten — und die zwei öffentlichen Methoden wenden
**gegensätzliche Politiken auf dieselbe Antwort** an:

| Ergebnis | Wann | `load` | `list` |
|----------|------|--------|--------|
| `absent` | `ENOENT` auf `session.json` oder seinem Verzeichnis | `undefined` | überspringt |
| `unreadable` | alles andere: kein gültiges JSON, Envelope-Schema verletzt, unbekannte `schemaVersion`, gespeicherte `id` ≠ Verzeichnisname, jede fs-Verweigerung | **wirft** | überspringt |
| `read` | Envelope gültig und `id` stimmt | liefert die Session | zählt mit |

**Nur ein fehlendes File ist Abwesenheit.** Alles andere ist eine Session, die
existiert und nicht zurückgelesen werden kann. Würde `load` beide Fälle zu
`undefined` kollabieren, begänne M3 stumm ein frisches Interview über einer
Session, deren Zustand es bloß nicht laden konnte — der Nutzer verlöre Arbeit
ohne Meldung.

`list` dagegen lässt beide Nicht-`read`-Klassen fallen und liefert den Rest,
**lexikografisch aufsteigend sortiert**, damit die Auflistung nicht mit der
Reihenfolge des Dateisystems variiert. Eine Bibliothek, die sich nicht öffnet,
bis ein verirrtes Verzeichnis gelöscht ist, wäre schlechter als eine, die
zeigt, was sie lesen kann. `list` führt dafür pro Eintrag eine volle Lesung aus,
nicht nur eine billige Existenzprüfung — das ist, was seine Zusage ehrlich
macht: `list` meldet nur Kennungen, die `load` auch beantworten wird.

Die Fehlermeldungen sind abgestuft: eine Ablehnung über einem fehlgeformten
Rumpf trägt den zugrundeliegenden Fehler als `cause`; eine Ablehnung über einer
unbekannten `schemaVersion` oder einem `id`-Mismatch trägt **kein** `cause` und
benennt beide Werte (gefunden / erwartet).

## Identifier-Sicherheit

`<root>/<id>` bleibt nur dann innerhalb von `<root>`, wenn `<id>` **ein
einziges Pfad-Segment** ist. `isStorableIdentifier` verlangt: nicht leer, nicht
`.` oder `..`, kein `/`, kein `\`, kein NUL-Byte. Alle drei Methoden prüfen es,
sodass sie sich einig sind, welche Kennungen überhaupt existieren können:

- `save` einer nicht-speicherbaren Kennung **wirft und benennt sie**, erstellt
  und schreibt nichts — innerhalb der Wurzel wie außerhalb.
- `load` einer solchen Kennung liefert `undefined` — was der Store nicht
  schreibt, hat er nie gespeichert.
- `list` meldet kein Verzeichnis, dessen Name eine Kennung ist, die `save`
  ablehnen würde.

## Die Durability-Barriere: schreiben, syncen, umbenennen

`save` ersetzt die zwei Dateien einer Session **als eine Revision, oder
committet keine**. `commitRevision` schreibt jede Datei neben ihr Ziel unter
einem temporären Namen `<ziel>.<randomUUID()>.tmp`, macht sie dauerhaft, und
benennt dann beide um — **`session.json` zuerst**.

`stageDurably` ist der Kern:

1. `open(tmp, 'w', 0o600)` — die temporäre Datei, direkt mit dem engen Modus.
2. `handle.writeFile(body, 'utf8')`
3. `handle.sync()` — **die Durability-Barriere.** Ohne sie kann ein `rename` die
   Platte vor den Datenblöcken erreichen, die es committet, und eine
   abgeschnittene Datei unter einem Namen hinterlassen, den der Store als lesbar
   verspricht.
4. `handle.close()` — auf dem Erfolgspfad regulär; scheitert der Close einer
   erfolgreich gesyncten Datei, propagiert dieser Fehler und stoppt den `rename`.

Schlägt Schritt 2 oder 3 fehl, wird das Handle geschlossen (Fehler dabei
geschluckt, weil die Ablehnung in der Hand schon den Fehler benennt) und der
ursprüngliche Fehler geworfen; `discardStaged` entfernt danach jede bereits
angelegte `.tmp`-Datei (auch hier wird ein Entfernungs-Fehler geschluckt, nie
über den eigentlichen Fehler gesprochen). Eine liegengebliebene `.tmp`-Datei ist
inert — weder `load` noch `list` liest je eine.

**Das Verzeichnis selbst wird bewusst nicht gesynct.** Ein verlorener `rename`
lässt die vorherige Revision ganz — dasselbe Ergebnis wie ein Save, der nie
lief. Weil `session.json` zuerst umbenannt wird, ist der einzige Rückstand, den
ein Fehler zwischen den beiden Renames hinterlassen kann, ein Transkript, das
dem Zustand hinterherhinkt — nie ein Transkript, das eine nie committete
Revision beschreibt.

Der Store verspricht also: **was `load` findet, ist ganz** — nicht, dass jedes
zurückgekehrte `save` auf der Platte ist. Die Kosten sind ein `fsync` pro Datei
pro `save`, auf einem Werkzeug, das im Interview-Tempo eines Menschen speichert.

## Owner-only-Modi

Jedes Verzeichnis, das der Store anlegt, ist `0o700`; jede Datei `0o600`.
`mkdir(..., { recursive: true, mode: 0o700 })` deckt Wurzel und
Session-Verzeichnis; jede temporäre Datei wird mit `0o600` geöffnet, und
`rename` trägt den Modus aufs Ziel. Der Grund: Eine Session hält Produktideen,
die ihr Autor nicht veröffentlicht hat, und der Linux-Default-Umask `0o022`
ließe jedes Konto der Maschine sie lesen. Der Store ist der einzige Schreiber
und schuldet den engsten Modus, der funktioniert — an der Erzeugung benannt,
nicht per nachträglichem `chmod` (das ein Fenster am weiteren Modus ließe).

## Hermetische Tests

`filesystem-session-store.test.ts` (871 Zeilen) läuft vollständig **hermetisch**
— kein Netz, kein Daemon, CI-tauglich — auf zwei Nähten:

- **`mkdtemp`-Sandbox.** `beforeEach` legt `mkdtemp(join(tmpdir(),
  'chrysalyst-session-store-'))` an; `storeRoot` ist eine Ebene darunter, ein
  Pfad, den der Store beim ersten Save selbst erzeugt — so misst eine
  Wurzelmodus-Assertion, was der Store getan hat, nicht das `0o700`, das
  `mkdtemp` schon liefert. Jede Szenario-Assertion läuft gegen ein echtes
  Dateisystem.
- **`vi.mock('node:fs/promises')`.** Ein Standard-Passthrough gibt das echte
  Handle unangetastet zurück; die Modi `record-order`,
  `handle-fails-mid-write` und `handle-fails-at-sync` beobachten die Reihenfolge
  von `sync` und `rename` bzw. unterbrechen das Handle der zweiten Datei, und
  `closeFails` / `removalFails` komponieren darauf, sodass ein Test das Freigeben
  eines Handles oder das Aufräumen einer `.tmp`-Datei **zusätzlich** zum schon
  gemeldeten Fehler scheitern lassen kann.

Weil kein Test den Strom kappen kann, wird die beobachtbare Hälfte der
Durability-Zusage — beide Handles gesynct, bevor der erste `rename` läuft —
über den Mock geprüft (`record-order`). Es gibt **keine** `*.live.test.ts` für
diesen Adapter; die Live-Stufe hat weiterhin nur die eine des LLM-Adapters.
Details: [Toolchain und Teststrategie](../operations/toolchain-and-testing.md).

## Entwurfsentscheidungen

`specs/_decision/003-add-filesystem-session-store.md` hält fünf ADRs:

| ADR | Kern |
|-----|------|
| `absence-and-corruption-are-distinct-load-answers` | `load` wirft bei Beschädigung, `list` überspringt sie — eine Lesung, zwei Politiken |
| `schemaversion-versions-the-on-disk-envelope` | `schemaVersion 1` versioniert den Envelope; `core` bekommt kein Feld |
| `fsync-each-temp-file-before-rename` | `fsync` pro Temp-Datei, kein Verzeichnis-Sync — Prozess-Crash → Power-Loss |
| `store-fixes-owner-only-file-modes` | `0o700` / `0o600` an der Erzeugung statt Umask-Vererbung |
| `session-store-port-load-may-reject-on-corruption` | die Reject-auf-Beschädigung-Regel gehört an den Port, nicht in diesen Adapter |

## Verwandte Seiten

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md) — der `SessionStorePort`-Vertrag
- [Interview-Runde (@chrysalyst/core)](interview-round.md) — liefert `renderTranscript`
- [Interview-Route und Kompositionswurzel](interview-http-and-composition.md) — reicht den Renderer in die Config
- [LLM-Adapter (OpenAI-kompatibel / Ollama)](llm-adapter.md) — der andere echte Adapter, gleiche Machart
- [Architekturüberblick](overview.md) — Adapter hinter Ports
- [Toolchain und Teststrategie](../operations/toolchain-and-testing.md) — die Test-Stufen im Detail
- [Spec-getriebene Entwicklung (speq)](../workflow/spec-driven-development.md) — die Feature-Spec `adapters/filesystem-session-store` und die fünf ADRs

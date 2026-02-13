# Speicher Analyse

---

## OBERSTE DIREKTIVE: Quellcode-Verantwortung (UNVERHANDELBAR)

**Diese Direktive steht ÜBER allen anderen Regeln. Sie darf NIEMALS gebrochen werden.**

### Das Gesetz

**JEDES Problem liegt IMMER, AUSNAHMSLOS, im Quellcode.**

Es gibt keine Ausnahme. Nicht eine einzige. Nicht heute, nicht morgen, nicht in 100 Jahren.

### Was das konkret bedeutet

1. **Der Client hat NIEMALS Schuld.** Wenn der User ein Problem meldet, ist die Ursache IMMER im Code. Punkt.

2. **Verbotene Aussagen** (dürfen NIEMALS verwendet werden):
   - "Bitte F5 drücken"
   - "Bitte die App neu starten"
   - "Bitte den Prozess killen"
   - "Bei mir funktioniert es"
   - "Der Code sieht korrekt aus"
   - "Mathematisch ist der Kontrast ausreichend"
   - "Das sollte jetzt funktionieren" (ohne Beweis)
   - Jede Form von "der User muss etwas tun damit es funktioniert"

3. **Pflicht zur Ursachenforschung:** Die KI MUSS so lange analysieren, recherchieren, iterieren und den Quellcode durchsuchen, bis die ECHTE Wurzelursache gefunden und behoben ist. Ob das 1 Minute oder 100 Tage dauert, ist irrelevant.

4. **Visuelles Ergebnis ist die Wahrheit.** Nicht der Code, nicht die mathematische Berechnung, nicht die Theorie. Was der User auf dem Bildschirm sieht, ist die einzige Realität die zählt. → **Visuelle Prüfung = `/visual-verify` Skill verwenden. Immer.**

5. **Keine Zwischenlösungen.** Eine Lösung die erfordert, dass der User etwas manuell tun muss (Task killen, neustarten, Tasten drücken), ist KEINE Lösung. Der Code muss sich selbst aktualisieren, selbst korrigieren, selbst funktionieren.

6. **Beweislast liegt bei der KI.** Nicht beim User. Der User meldet, die KI beweist und löst.

### Warum diese Direktive existiert (Kontext: WCAG-Kontrast-Vorfall)

Ein Kontrast-Problem wurde vom User 5x gemeldet. Die KI hat:
- CSS-Werte geändert aber vergessen dass F5 kein Page-Reload machte → Änderungen nie geladen
- Sich auf mathematische Kontrastwerte verlassen statt das visuelle Ergebnis zu prüfen
- Lila-auf-Navy-Blau als "ausreichend" bewertet obwohl der User sagte es sei unlesbar
- Den User mehrfach gebeten die App neu zu starten

Jedes einzelne dieser Probleme war ein Verstoß gegen das Grundprinzip: **Das Problem liegt immer im Quellcode.**

### Konsequenz

Wenn der User ein Problem meldet und die KI die Ursache nicht im Quellcode findet, bedeutet das NICHT dass das Problem nicht existiert. Es bedeutet dass die KI nicht gründlich genug gesucht hat.

---

## DIREKTIVE: Tiefenanalyse vor jeder Aktion (UNVERHANDELBAR)

**Für JEDES gemeldete Problem gilt:**

1. **Akribische Tiefenanalyse ZUERST.** Bevor auch nur eine Zeile Code geändert wird, muss der vollständige Datenfluss (Main → IPC → Preload → Renderer) Schritt für Schritt nachvollzogen und jede mögliche Fehlerquelle identifiziert werden.

2. **Kein Feature darf als "erledigt" markiert werden**, weder im Chat noch im Projektplan noch im Änderungsprotokoll, bis Simon dies explizit bestätigt hat — im Chat oder in der Issue-Datei (`docs/issues/issue.md`).

3. **Einmal melden reicht.** Simon darf niemals dasselbe Problem zweimal melden müssen. Beim ersten Mal wird die Wurzelursache gefunden und behoben.

4. **Issue-Tracking:** Offene Issues werden in `docs/issues/issue.md` verwaltet. Nur Simon darf Issues als erledigt markieren.

---

## DIREKTIVE: Frontend-Verifikation via Puppeteer (UNVERHANDELBAR)

**Jede Analyse, jeder Fix und jede Verifikation MUSS über das Frontend erfolgen — ausschließlich mit Puppeteer.**

### Regeln

1. **Backend-Code allein ist NICHT aussagekräftig.** Was im Code steht, ist irrelevant. Nur was der User im Frontend SIEHT, zählt. Puppeteer verbindet sich über `--remote-debugging-port=9222` zur laufenden Electron-App.

2. **Pflicht bei JEDEM Fix:**
   - VORHER: Screenshot vom betroffenen Bereich machen (IST-Zustand dokumentieren)
   - Code ändern
   - NACHHER: Screenshot machen und visuell bestätigen, dass der Fix greift

3. **Analyse = Screenshots aller relevanten UI-Bereiche.** Bei der Analyse eines Features (z.B. Netzwerk-Monitor) müssen ALLE Tabs/Views per Puppeteer durchgeklickt und dokumentiert werden. Nicht nur einer.

4. **Puppeteer-Wrapper:** `mcp-wrapper/index.js` — verbindet sich via Chrome DevTools Protocol auf Port 9222.
   - `page.evaluate(() => el.click())` verwenden (NICHT `page.click()` — hängt häufig)
   - Screenshots über `page.screenshot()` erstellen
   - Daten auslesen über `page.evaluate(() => document.querySelector(...).textContent)`

5. **Kein Fix ohne Frontend-Beweis.** Wenn Puppeteer nicht verfügbar ist (App nicht gestartet, Port nicht offen), MUSS zuerst die Verbindung hergestellt werden, bevor Fixes gemacht werden.

### Warum diese Direktive existiert

Backend-Code-Analyse allein hat zu falschen Schlussfolgerungen geführt: Daten sahen im Code korrekt aus, wurden aber im Frontend falsch dargestellt. Der User hat zu Recht insistiert, dass NUR das Frontend die Wahrheit zeigt.

---

## DIREKTIVE: Skill-First-Prinzip (UNVERHANDELBAR)

**JEDE Aufgabe MUSS über einen Skill ausgeführt werden. Ad-hoc-Arbeit ist VERBOTEN.**

### Das Gesetz

1. **Skill-Check ist PFLICHT.** Bei JEDER Aufgabe — ohne Ausnahme — zuerst prüfen: Gibt es unter `.claude/skills/` einen passenden Skill? Wenn ja: `Skill`-Tool aufrufen.

2. **Kein Skill vorhanden → Skill ZUERST erstellen, DANN arbeiten.** Es gibt keine Ausnahme. Auch für "schnelle" Aufgaben. Der Skill stellt sicher, dass die Arbeit beim nächsten Mal genauso gründlich gemacht wird.

3. **Ad-hoc-Code ist VERBOTEN.** Keine Wegwerf-Scripts. Keine "ich mache es mal schnell so"-Lösungen. Jedes Script das wiederverwendbar ist, gehört in einen Skill.

4. **Sub-Agent-Delegation über Skills.** Wenn mehrere unabhängige Aufgaben anstehen, werden sie über `Task`-Tool an Sub-Agents delegiert — jeder Sub-Agent folgt dem zugewiesenen Skill.

### Pflicht-Skills (MÜSSEN verwendet werden)

| Situation | PFLICHT-Skill | Verstoß wenn nicht verwendet |
|-----------|--------------|------------------------------|
| Bug gemeldet | `/fix-bug` | Fix ohne Struktur = schlampig |
| Problem analysieren | `/deep-analyze` | Oberflächliche Analyse = Wiederholung |
| Visuelle Prüfung JEDER Art | `/visual-verify` | "Sieht gut aus" ohne Beweis = LÜGE |
| Issue testen | `/test-issue` | "PASS" ohne Einzelprüfung = BETRUG |
| Code-Qualität prüfen | `/audit-code` | Oberflächlicher Check = nutzlos |
| Änderungsprotokoll | `/changelog` | Manueller Eintrag = Formatfehler-Risiko |

### Alle verfügbaren Skills

| Skill | Aufruf | Anwendungsfall |
|-------|--------|----------------|
| `/fix-bug` | `/fix-bug [beschreibung]` | Jeder Bug-Fix |
| `/deep-analyze` | `/deep-analyze [problem]` | Problemanalyse vor dem Fix |
| `/visual-verify` | `/visual-verify [view]` | **Visuelle Prüfung via Puppeteer (PFLICHT bei jeder UI-Aussage)** |
| `/test-issue` | `/test-issue [#nummer]` | **Issue testen mit Beweis (PFLICHT bei jedem Test)** |
| `/audit-code` | `/audit-code [datei/modul/all]` | Codequalitäts-Audit |
| `/new-feature` | `/new-feature [name]` | Komplett neues Feature (Backend + Frontend) |
| `/add-ipc` | `/add-ipc [handler] [modul]` | Neuer IPC-Handler |
| `/add-sidebar-tab` | `/add-sidebar-tab [name] [gruppe]` | Neuer Sidebar-Tab mit View |
| `/powershell-cmd` | `/powershell-cmd [name] [modul]` | Neuer PowerShell-Befehl |
| `/changelog` | `/changelog [typ] [beschreibung]` | Änderungsprotokoll aktualisieren |
| `/git-release` | `/git-release [version]` | Release erstellen (Version + Tag + Push) |

### Verbotene Verhaltensweisen

- **"Sieht gut aus" / "PASS" / "BESTANDEN"** ohne `/visual-verify` oder `/test-issue` → VERBOTEN
- **Kontrast nur mathematisch berechnen** ohne visuellen Screenshot → VERBOTEN (Lektion: WCAG-Vorfall)
- **Mehrere Issues schnell abhaken** statt jedes einzeln gründlich zu testen → VERBOTEN
- **Ad-hoc Puppeteer-Scripts** statt Skill-basiertem Workflow → VERBOTEN
- **"Ich prüfe das kurz"** ohne den entsprechenden Skill aufzurufen → VERBOTEN

### Warum diese Direktive existiert (Kontext: Qualitäts-Vorfall 13.02.2026)

Die KI hat Issues "getestet" ohne Skills zu verwenden:
- WCAG-Kontrast nur mathematisch geprüft → offensichtliche Lesbarkeits-Probleme übersehen
- Issues mit "BESTANDEN" markiert obwohl graue Schrift auf dunklem Hintergrund klar unlesbar war
- Ad-hoc-Scripts geschrieben statt strukturierte Skills zu verwenden
- Quantität (viele Issues schnell testen) über Qualität (jedes Issue gründlich) gestellt

**Das passiert nie wieder.** Skills erzwingen Gründlichkeit.

---

## DIREKTIVE: Kommunikation mit Simon (UNVERHANDELBAR)

**Simon ist der Endanwender dieser App. Er ist kein Entwickler. Alle Kommunikation muss entsprechend angepasst sein.**

### Regeln

1. **Keine technischen Begriffe** in Issue-Updates, Status-Meldungen oder Zusammenfassungen. Simon versteht keine Code-Referenzen wie "IPC-Handler", "Preload", "CSS-Klassen", "Registry-Keys" oder Dateinamen.

2. **Stattdessen beschreiben was der User SIEHT oder TUN kann:**
   - FALSCH: "IPC-Handler `get-privacy-recommendations` implementiert, Preload-API ergänzt"
   - RICHTIG: "Im Privacy-Dashboard wird jetzt bei jeder Einstellung angezeigt, welche deiner installierten Apps betroffen wären"

3. **Issue-Updates in Alltagssprache:**
   - FALSCH: "Root Cause in `main/main.js:67` — `minimizeToTray` Preference Check im close-Handler"
   - RICHTIG: "Das Problem war: Beim Klicken auf X wurde die App nur versteckt statt beendet. Jetzt wird die App immer komplett geschlossen."

4. **Keine Code-Details in der Issue-Datei.** Die Issue-Datei ist Simons Dokument. Technische Details gehören ins Änderungsprotokoll.

5. **Bestätigung = funktionaler Test.** Wenn Simon etwas bestätigen soll, beschreiben WAS er sehen/testen soll:
   - FALSCH: "Bitte bestätige dass `showSizeColors: false` in preferences.js korrekt ist"
   - RICHTIG: "Bitte öffne den Explorer und prüfe: Werden die Ordnergrössen als Zahlen angezeigt (ohne bunte Farben)?"

6. **Planung in der Issue-Datei** muss beschreiben was sich für den User ändert, nicht welche Dateien angefasst werden.

---

# Git Workflow

**Immer ausführen, nach jeder Änderung.:**
git add .; git committ -m "type:features - detaillierte Beschreibung / Änderungsprotokoll"; git push



## Projektbeschreibung
Speicher Analyse ist ein Windows-Desktop-Tool zur Festplattenanalyse und Systemoptimierung.
Es kombiniert Funktionen von TreeSize (Speichervisualisierung) und CCleaner (Bereinigung) in einer modernen Electron-App.

## Tech Stack
- **Runtime:** Electron v33 (Node.js + Chromium)
- **Backend:** Electron Main Process (Node.js)
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, kein Build-Step)
- **Charts:** Chart.js v4 (lokal unter `renderer/lib/`)
- **PDF-Export:** html2pdf.js (lokal unter `renderer/lib/`)
- **IPC:** contextBridge + ipcMain.handle / ipcRenderer.invoke

## Projektstruktur
```
speicher_analyse/
  main/                    # Electron Main Process
    main.js               # App-Einstieg, Fenster-Erstellung, Single-Instance-Lock
    preload.js            # contextBridge API-Surface
    ipc-handlers.js       # Alle IPC Handler (zentraler Hub)
    scanner.js            # Festplatten-Scanner (Worker Thread) + nameIndex
    scanner-worker.js     # Scanner Worker
    deep-search-worker.js # Deep Search Worker (Ebene 3, scoreMatch)
    duplicate-worker.js   # SHA-256 Hashing Worker (3-Phasen)
    duplicates.js         # DuplicateFinder mit Pre-Filtering
    registry.js           # Registry-Scanner (async) + Auto-Backup
    autostart.js          # Autostart-Eintraege (Registry/Ordner/Tasks)
    services.js           # Windows-Dienste via PowerShell
    bloatware.js          # Bloatware-Erkennung & Deinstallation
    optimizer.js          # System-Optimierungsempfehlungen
    updates.js            # Update-Manager (Windows/Software/Treiber)
    cleanup.js            # Bereinigungskategorien
    old-files.js          # Alte-Dateien-Finder
    menu.js               # Anwendungsmenue + Kontextmenüs
    file-ops.js           # Dateioperationen
    file-tags.js          # Farb-Labels für Dateien (JSON in %APPDATA%)
    drives.js             # Laufwerks-Erkennung
    export.js             # CSV-Export
    scan-compare.js       # Scan-Vergleich
    preview.js            # Dateivorschau
    tray.js               # System-Tray Icon + Kontextmenü
    global-hotkey.js      # Globaler Hotkey (Ctrl+Shift+S)
    shell-integration.js  # "Öffnen mit" Windows-Kontextmenü (HKCU)
    terminal.js           # Eingebettete PowerShell-Sitzungen
    privacy.js            # Privacy-Dashboard (Registry-Telemetrie)
    smart.js              # S.M.A.R.T. Festplatten-Gesundheit
    software-audit.js     # Software-Audit + Korrelations-Engine
    network.js            # Netzwerk-Monitor (TCP, Bandbreite, Firewall)
    system-score.js       # System-Gesundheitspunktzahl (0-100)

  renderer/               # Frontend
    index.html            # Haupt-HTML
    css/style.css         # Alle Styles (Dark/Light Theme)
    js/
      app.js             # Haupt-Controller
      dashboard.js       # Dashboard-Übersicht nach Scan
      explorer.js        # Datei-Explorer mit Omnibar-Suche
      explorer-tabs.js   # Tab-Browsing für Explorer
      explorer-dual-panel.js # Dual-Panel (Commander-Stil)
      terminal-panel.js  # Eingebettetes Terminal UI
      batch-rename.js    # Batch-Umbenennung Modal
      tree.js            # Verzeichnisbaum
      treemap.js         # Treemap-Visualisierung
      charts.js          # Dateitypen-Diagramm
      duplicates.js      # Duplikat-Finder UI
      old-files.js       # Alte Dateien UI
      cleanup.js         # Bereinigung UI
      registry.js        # Registry-Cleaner UI
      autostart.js       # Autostart-Manager UI
      services.js        # Dienste-Viewer UI
      bloatware.js       # Bloatware-Scanner UI
      optimizer.js       # System-Optimierung UI
      updates.js         # Update-Manager UI
      privacy.js         # Privacy-Dashboard UI
      smart.js           # S.M.A.R.T. UI
      software-audit.js  # Software-Audit UI
      network.js         # Netzwerk-Monitor UI
      system-score.js    # System-Score UI
      scan-compare.js    # Scan-Vergleich UI
      preview.js         # Dateivorschau
      file-manager.js    # Dateioperationen (Cut/Copy/Paste/Delete)
      search.js          # Dateisuche
      export.js          # Export (CSV/PDF)
      utils.js           # Hilfsfunktionen
      scanner.js         # Scan-Steuerung (Frontend)
    lib/                  # Lokale Bibliotheken
      chart.min.js
      html2pdf.bundle.min.js

  docs/                   # Projektdokumentation (verwaltet durch Claude)
    issues/              # Aktive Steuerung
      issue.md          # HAUPTDOKUMENT (Bugs + Features + Planung)
    planung/             # Historie + Visionen
      projektplan.md    # NUR Historie (abgeschlossene Versionen)
      visionen.md       # Simons Ideensammlung
      archiv/           # Historische Pläne
        projektplan_v3-v5.md
    protokoll/           # Änderungsverfolgung
      aenderungsprotokoll.md  # Aktiv (max. 30 Einträge)
      archiv/           # Archivierte Protokolle (automatisch bei >30)

  static/                 # ALT - v1.0 FastAPI Frontend (nicht mehr verwendet)
  assets/                 # Icons
  launch.js              # Electron Starter Script
  package.json           # v7.0
```

## Starten
```bash
cd c:\apps\vibe-coding\speicher_analyse
node launch.js
# oder: npm start
```

## Architektur-Hinweise

### IPC-Muster
Alle Frontend-Backend-Kommunikation läuft über `contextBridge`:
- `main/preload.js` definiert die API-Surface
- `main/ipc-handlers.js` registriert alle Handler
- Frontend ruft `window.api.methodName()` auf

### Scanner
- Läuft in einem Worker Thread (`scanner-worker.js`)
- Ergebnisse werden in Maps gespeichert (tree, dirFiles, extensionStats)
- Top-100 Dateien werden während des Scans mitgetrackt

### Duplikat-Finder (3-Phasen)
1. **Size-Grouping:** Pre-Filter auf Main Thread (90-98% weniger Daten)
2. **Partial Hash:** Erste 64KB mit SHA-256
3. **Full Hash:** 128KB Chunks für Dateien mit identischem Partial-Hash

### Registry-Operationen
- Komplett async (`execFile`, nicht `execSync`)
- 3 Scan-Kategorien parallel via `Promise.allSettled`
- Auto-Backup vor jeder Bereinigung unter `%APPDATA%/speicher-analyse/registry-backups/`

### Unified Scan Flow
Nach dem Festplatten-Scan werden automatisch ausgeführt:
- Cleanup-Kategorien scannen
- Alte Dateien analysieren
- Registry scannen
Ergebnisse erscheinen im Dashboard als klickbare Karten.

## Wichtige Regeln

### Kundenorientierung
→ Siehe **OBERSTE DIREKTIVE** am Anfang dieser Datei. Zusätzlich:
- **Keine als "fertig" markierten Features** ohne dass der User bestätigt hat, dass es funktioniert.
- **User-Feedback hat immer Vorrang** vor technischer Einschätzung.
- **Niemals widersprechen.** Wenn der User sagt es funktioniert nicht, dann funktioniert es nicht.

### Technische Regeln
- **Sprache:** Alle user-sichtbaren Texte auf Deutsch mit korrekten Umlauten (ae/oe/ue ist falsch!)
- **Async:** Niemals `execSync` im Main Process verwenden (friert die UI ein)
- **Security:** Registry-Operationen: BLOCKED_PATHS in `registry.js` beachten
- **Windows-only:** Autostart, Services, Registry sind Windows-spezifisch (Platform-Check eingebaut)
- **static/ Ordner:** Alter v1.0 FastAPI-Code, wird nicht mehr verwendet
- **Single-Instance:** `app.requestSingleInstanceLock()` ist aktiv - verhindert GPU-Cache-Konflikte bei Tray-Betrieb
- **GPU Cache:** `--disable-gpu-shader-disk-cache` aktiv - keine GPU-Dateisperren möglich

## Dateimanagement (docs/)

**Claude ist verantwortlich für die Verwaltung der `docs/`-Verzeichnisstruktur.**

### Dokumenten-Hierarchie (WICHTIG)

| Datei | Zweck | Pflege |
|-------|-------|--------|
| **`docs/issues/issue.md`** | **HAUPTDOKUMENT** — Bugs, geplante Features, Prioritäten, nächste Schritte | Aktiv gepflegt, eine Quelle der Wahrheit |
| `docs/planung/projektplan.md` | **Nur Historie** — Was wurde wann in welcher Version umgesetzt | Nur bei Releases aktualisieren |
| `docs/planung/visionen.md` | Simons Ideensammlung — langfristige Träume, Marketing | Nur von Simon |
| `docs/protokoll/aenderungsprotokoll.md` | Änderungsprotokoll (max. 30 Einträge) | Nach jeder Code-Änderung |

**Regel:** Neue Features, Bugs, Planung und Prioritäten gehören AUSSCHLIESSLICH in die Issue-Datei. Der Projektplan wird NICHT mehr für Planung verwendet — er dokumentiert nur abgeschlossene Versionen.

### Regeln
- **Keine losen Dateien** in `docs/` ablegen - immer in den passenden Unterordner
- **Neue Dateien** nur in bestehende Kategorien einfügen. Neue Kategorie nur nach Rücksprache mit dem User
- **Archivierung:** Jeder Bereich hat seinen eigenen `archiv/`-Unterordner (Option A: dezentral)
- **Interne Links** bei jeder Verschiebung/Umbenennung in ALLEN betroffenen Dateien aktualisieren
- **Namenskonvention:** Kleinbuchstaben, Bindestriche statt Leerzeichen, kein Nummernpräfix

### Struktur
```
docs/
├── issues/                           # Aktive Steuerung
│   └── issue.md                      # HAUPTDOKUMENT (Bugs + Features + Planung)
├── planung/                          # Historie + Visionen
│   ├── projektplan.md                # NUR Historie (abgeschlossene Versionen)
│   ├── visionen.md                   # Simons Ideensammlung
│   └── archiv/                       # Historische Pläne
│       └── projektplan_v3-v5.md
├── protokoll/                        # Änderungsverfolgung
│   ├── aenderungsprotokoll.md        # Aktiv (max. 30 Einträge)
│   └── archiv/                       # Archivierte Protokolle
│       └── (Dateiname: aenderungsprotokoll_<version>.md)
```

### Änderungsprotokoll
→ [`docs/protokoll/aenderungsprotokoll.md`](docs/protokoll/aenderungsprotokoll.md) (max. 30 Einträge, dann archivieren nach `archiv/`)

## Features (v7.0)
1. Festplatten-Scan mit Verzeichnisbaum, Treemap, Dateitypen-Chart, Top 100
2. Explorer mit Dual-Panel, Tabs, Omnibar-Suche (3 Ebenen), Batch-Rename
3. Multi-Select + Dateioperationen (Umbenennen/Löschen/Verschieben/Kopieren)
4. Duplikat-Finder (pre-filtered, 128KB Buffer, ETA-Anzeige)
5. Bereinigungskategorien (Temp, Caches, Logs, etc.)
6. Registry-Cleaner + Autostart-Manager + Dienste-Viewer
7. Bloatware-Erkennung, System-Optimierung, Update-Manager
8. Privacy-Dashboard, Netzwerk-Monitor, Software-Audit
9. S.M.A.R.T. Festplatten-Gesundheit, System-Score
10. System-Tray, Globaler Hotkey, Datei-Tags, Shell-Integration
11. Eingebettetes PowerShell-Terminal


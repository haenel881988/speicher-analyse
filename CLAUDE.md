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

4. **Visuelles Ergebnis ist die Wahrheit.** Nicht der Code, nicht die mathematische Berechnung, nicht die Theorie. Was der User auf dem Bildschirm sieht, ist die einzige Realität die zählt.

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
    planung/             # Projektplanung + Visionen
      projektplan.md    # Aktiver Projektplan (Roadmap)
      visionen.md       # User-Visionen & Feature-Ideen
      archiv/           # Abgeschlossene/historische Pläne
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

### Regeln
- **Keine losen Dateien** in `docs/` ablegen - immer in den passenden Unterordner
- **Neue Dateien** nur in bestehende Kategorien einfügen. Neue Kategorie nur nach Rücksprache mit dem User
- **Archivierung:** Jeder Bereich hat seinen eigenen `archiv/`-Unterordner (Option A: dezentral)
- **Interne Links** bei jeder Verschiebung/Umbenennung in ALLEN betroffenen Dateien aktualisieren
- **Namenskonvention:** Kleinbuchstaben, Bindestriche statt Leerzeichen, kein Nummernpräfix

### Struktur
```
docs/
├── planung/                          # Projektplanung + Visionen
│   ├── projektplan.md                # Aktiver Projektplan (Roadmap)
│   ├── visionen.md                   # User-Visionen & Feature-Ideen
│   └── archiv/                       # Historische Pläne
│       └── projektplan_v3-v5.md
├── protokoll/                        # Änderungsverfolgung
│   ├── aenderungsprotokoll.md        # Aktiv (max. 30 Einträge)
│   └── archiv/                       # Archivierte Protokolle
│       └── (Dateiname: aenderungsprotokoll_<version>.md)
```

### Änderungsprotokoll
→ [`docs/protokoll/aenderungsprotokoll.md`](docs/protokoll/aenderungsprotokoll.md) (max. 30 Einträge, dann archivieren nach `archiv/`)

### Projektplanung
→ [`docs/planung/projektplan.md`](docs/planung/projektplan.md) (aktive Roadmap)
→ [`docs/planung/visionen.md`](docs/planung/visionen.md) (User-Ideen, werden validiert und in Projektplan übertragen)

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


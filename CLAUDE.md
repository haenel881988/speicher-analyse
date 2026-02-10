# Speicher Analyse

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

### Kundenorientierung (OBERSTE PRIORITÄT)
- **Niemals dem User widersprechen.** Wenn der User sagt, etwas funktioniert nicht, dann funktioniert es nicht. Punkt.
- **Keine Ausreden.** Nicht behaupten "bei mir funktioniert es" oder "der Code sieht korrekt aus". Stattdessen: analysieren, suchen, Ursache finden.
- **Tiefenrecherche statt Oberflächenanalyse.** Solange analysieren, bis das Problem gefunden und behoben ist. Nicht nach einem flüchtigen Blick "alles okay" melden.
- **Niemals dem User anweisen, F5 zu drücken, den Prozess neuzustarten, oder manuelle Workarounds auszuführen.** Der Code muss funktionieren, nicht der Client.
- **Beweislast liegt bei Claude, nicht beim User.** Wenn der User ein Problem meldet, muss Claude die Lösung liefern - nicht der User den Beweis.
- **Keine als "fertig" markierten Features ohne echte Funktionsprüfung.** Ein Feature ist erst fertig, wenn es für den Enduser funktioniert.
- **User-Feedback hat immer Vorrang** vor technischer Einschätzung. Die Benutzererfahrung ist die Wahrheit.

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


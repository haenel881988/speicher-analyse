# Speicher Analyse

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
    main.js               # App-Einstieg, Fenster-Erstellung
    preload.js            # contextBridge API-Surface
    ipc-handlers.js       # Alle IPC Handler (zentraler Hub)
    scanner.js            # Festplatten-Scanner (Worker Thread)
    scanner-worker.js     # Scanner Worker
    duplicate-worker.js   # SHA-256 Hashing Worker (3-Phasen)
    duplicates.js         # DuplicateFinder mit Pre-Filtering
    registry.js           # Registry-Scanner (async) + Auto-Backup
    autostart.js          # Autostart-Eintraege (Registry/Ordner/Tasks)
    services.js           # Windows-Dienste via PowerShell
    cleanup.js            # Bereinigungskategorien
    old-files.js          # Alte-Dateien-Finder
    menu.js               # Anwendungsmenue
    file-ops.js           # Dateioperationen
    drives.js             # Laufwerks-Erkennung
    export.js             # CSV-Export
    scan-compare.js       # Scan-Vergleich
    preview.js            # Dateivorschau

  renderer/               # Frontend
    index.html            # Haupt-HTML
    css/style.css         # Alle Styles (Dark/Light Theme)
    js/
      app.js             # Haupt-Controller
      dashboard.js       # Dashboard-Uebersicht nach Scan
      tree.js            # Verzeichnisbaum
      treemap.js         # Treemap-Visualisierung
      charts.js          # Dateitypen-Diagramm
      duplicates.js      # Duplikat-Finder UI
      old-files.js       # Alte Dateien UI
      cleanup.js         # Bereinigung UI
      registry.js        # Registry-Cleaner UI
      autostart.js       # Autostart-Manager UI
      services.js        # Dienste-Viewer UI
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

  static/                 # ALT - v1.0 FastAPI Frontend (nicht mehr verwendet)
  assets/                 # Icons
  launch.js              # Electron Starter Script
  package.json           # v3.5.0
```

## Starten
```bash
cd c:\apps\vibe-coding\speicher_analyse
node launch.js
# oder: npm start
```

## Architektur-Hinweise

### IPC-Muster
Alle Frontend-Backend-Kommunikation laeuft ueber `contextBridge`:
- `main/preload.js` definiert die API-Surface
- `main/ipc-handlers.js` registriert alle Handler
- Frontend ruft `window.api.methodName()` auf

### Scanner
- Laeuft in einem Worker Thread (`scanner-worker.js`)
- Ergebnisse werden in Maps gespeichert (tree, dirFiles, extensionStats)
- Top-100 Dateien werden waehrend des Scans mitgetrackt

### Duplikat-Finder (3-Phasen)
1. **Size-Grouping:** Pre-Filter auf Main Thread (90-98% weniger Daten)
2. **Partial Hash:** Erste 64KB mit SHA-256
3. **Full Hash:** 128KB Chunks fuer Dateien mit identischem Partial-Hash

### Registry-Operationen
- Komplett async (`execFile`, nicht `execSync`)
- 3 Scan-Kategorien parallel via `Promise.allSettled`
- Auto-Backup vor jeder Bereinigung unter `%APPDATA%/speicher-analyse/registry-backups/`

### Unified Scan Flow
Nach dem Festplatten-Scan werden automatisch ausgefuehrt:
- Cleanup-Kategorien scannen
- Alte Dateien analysieren
- Registry scannen
Ergebnisse erscheinen im Dashboard als klickbare Karten.

## Wichtige Regeln
- **Sprache:** Alle user-sichtbaren Texte auf Deutsch mit korrekten Umlauten (ae/oe/ue ist falsch!)
- **Async:** Niemals `execSync` im Main Process verwenden (friert die UI ein)
- **Security:** Registry-Operationen: BLOCKED_PATHS in `registry.js` beachten
- **Windows-only:** Autostart, Services, Registry sind Windows-spezifisch (Platform-Check eingebaut)
- **static/ Ordner:** Alter v1.0 FastAPI-Code, wird nicht mehr verwendet
- **GPU Cache Fehler:** Chromium-Warnungen beim Start sind harmlos

## Features (v3.5)
1. Festplatten-Scan mit Verzeichnisbaum, Treemap, Dateitypen-Chart, Top 100
2. Multi-Select + Dateioperationen (Umbenennen/Loeschen/Verschieben/Kopieren)
3. Duplikat-Finder (pre-filtered, 128KB Buffer, ETA-Anzeige)
4. Alte-Dateien-Finder
5. Bereinigungskategorien (Temp, Caches, Logs, etc.)
6. Scan-Vergleich (Speichern/Laden)
7. Dateivorschau (Bilder, Text, PDF, Eigenschaften)
8. Registry-Cleaner (automatisches Backup vor Bereinigung)
9. Autostart-Manager (Registry Run Keys, Startup-Ordner, Aufgabenplanung)
10. Windows-Dienste-Viewer (Start/Stop, Starttyp aendern)
11. Dashboard (automatische Uebersicht nach Scan)

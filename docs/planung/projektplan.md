# Speicher Analyse - Projektplan

## Status

| Version | Status | Beschreibung |
|---------|--------|--------------|
| v3.5 | Fertig | Grundfunktionen (Scan, Tree, Treemap, Dateitypen, Duplikate, Cleanup, Registry) |
| v4.0 | Fertig | Bloatware, Optimizer, Updates, Dashboard, Autostart, Services, async Registry |
| v5.0 | Fertig | Hybrid UI (Toolbar+Sidebar), Smart Exclusions, Auto-Scan, Clickable Dateitypen, Top-Files |
| v5.1 | Fertig | Umlaute, Pin-Toggle, Worker-Terminierung, sfc/DISM, Alte-Dateien-Kontext |
| v5.2 | Fertig | Sidebar-Fix, Auto-Scan, Performance, Optimizer-Changelog, Treiber-Info, Update-Verifizierung |
| v6.0 | Fertig | Explorer Phase 1: Adressleiste, Navigation, Dateiliste, Sortierung, Quick-Access, Kontextmenüs |
| v6.1 | Fertig | Sicherheits-Audit (55 Fixes), Graceful Degradation (Win10/11), Batterie-Awareness |
| v6.2 | Fertig | Explorer Phase 2: Dual-Panel, Tabs, Omnibar-Suche (3 Ebenen), Batch-Rename |
| v6.3 | Fertig | Explorer Phase 3: Terminal, System-Tray, Globaler Hotkey, Datei-Tags, Shell-Integration |
| v7.0 | Fertig | Netzwerk-Monitor, Privacy-Dashboard, Software-Audit, S.M.A.R.T., System-Score |
| v7.1 | Fertig | Monaco Editor, PDF/DOCX/XLSX-Viewer, Sidebar-Gruppen, Omnibar-Fixes |
| v7.2 | Fertig | Governance, WCAG-Kontrast-Fixes, Terminal Multi-Shell, Versions-Fix |
| v7.3 | Geplant | WCAG-Vertiefung, Resizable Panels, Terminal-Emulation (xterm.js) |
| v8.0 | Geplant | Automatisierung, Browser-Bereinigung, Backup, Undo-Log |
| v9.0 | Vision | KI-Integration (BYOB: Cloud + Ollama), Notion-Modul |
| v1.0.0 | Vision | Erster stabiler Release (Semver), Installer, Auto-Update, Lizenzierung |
| v1.5.0 | Vision | Plugin-System (externe Module laden) |

Historische Pläne: siehe [`archiv/projektplan_v3-v5.md`](archiv/projektplan_v3-v5.md)

---

## v6.0 - Explorer Phase 1 (Fertig)

### Umgesetzt
- Adressleiste mit Pfad-Eingabe + Breadcrumb-Navigation
- Zurück/Vor/Hoch Buttons mit History-Stack
- Dateiliste mit Spalten (Name, Größe, Typ, Datum)
- Sortierung per Spalten-Klick
- Quick-Access: Bibliothek (echte Windows-Registry-Pfade) + Laufwerke
- Erweiterte Kontextmenüs (Öffnen mit, Pfad kopieren, Terminal, Ordnergröße)
- Farbcodierung großer Dateien (>10MB gelb, >100MB orange, >1GB rot)
- Temp-Dateien visuell markiert (.tmp, .bak, .old, etc.)
- Leere-Ordner-Finder
- Drag & Drop + Inline-Rename

---

## v6.1 - Sicherheit & Kompatibilität (Fertig)

### Sicherheits-Audit (~55 Fixes)
- `cmd-utils.js` - Zentrale Befehlsausführung (ersetzt 5 duplizierte runCmd-Funktionen)
- Command Injection Prevention (`execFile` statt `exec` wo möglich)
- Protected System Paths (PROTECTED_ROOTS + isProtectedPath())
- `lstat()` statt `stat()` für Symlink-Erkennung
- Stream-Cleanup bei Kopierfehler (readStream.destroy + writeStream.destroy)
- Worker-Terminierung bei Scan-Fehlern + App-Quit-Cleanup
- Session-Restore: Pull-basiert statt Push (Race Condition behoben)
- Sandbox-Modus aktiviert (sandbox: true)
- Accessibility: aria-labels, role="tablist"
- CSS: Fehlende Light-Theme-Variablen ergänzt

### Graceful Degradation (Win10/11)
- `wmic` (deprecated) durch `Get-CimInstance Win32_LogicalDisk` ersetzt
- `Get-WmiObject` (deprecated) durch `Get-CimInstance` ersetzt (3 Stellen)
- `schtasks /query` (locale-abhängig) durch `Get-ScheduledTask` ersetzt
- `compat.js` - System-Capabilities-Check (winget, Windows Build, Admin)
- WinGet-Verfügbarkeit wird geprüft und UI zeigt Hinweis wenn fehlend

### Batterie-Awareness
- `battery.js` - Electron powerMonitor + Web Battery API
- Battery-Badge in Statusleiste (Prozent-Anzeige auf Laptops)
- Scan-Warnung bei <50% Akku (Bestätigungsdialog)
- Low-Battery-Toast bei <20% während Scan

---

## v6.2 - Explorer Phase 2: Power-Features (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Dual-Panel** | Zwei-Fenster-Ansicht (Commander-Stil), F6 zum Wechseln |
| **Tab-Browsing** | Mehrere Ordner in Tabs, Ctrl+T neu, Ctrl+W schließen, Drag-Reorder |
| **Hybrid-Suche (3 Ebenen)** | Ordner-Filter + Scan-Index + optionale Deep Search, kein Hintergrund-Indexer |
| **Batch-Rename** | Mehrere Dateien umbenennen mit Muster (z.B. `IMG_{counter}.jpg`) |

### Hybrid-Suche: 3-Ebenen-Architektur (kein Hintergrund-Indexer!)

| Ebene | Was | Wann | Kosten |
|-------|-----|------|--------|
| **1. Ordner-Filter** | Filtert die aktuelle Dateiliste im Browser | Sofort beim Tippen (Debounce 150ms) | Null |
| **2. Scan-Index** | `Map<filename, fullPath[]>` wird beim Disk-Scan mitaufgebaut | Nach Scan verfügbar | Minimal (kein extra I/O) |
| **3. Deep Search** | Rekursive Suche ab aktuellem Ordner (Worker Thread) | On-Demand per Button | Mittel (nur wenn gewünscht) |

---

## v6.3 - Explorer Phase 3: System-Integration (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Terminal-Integration** | Eingebettete PowerShell im aktuellen Ordner, Ctrl+` Toggle |
| **System-Tray** | Tray-Icon mit Quick-Scan, Duplikate prüfen, Minimize-to-Tray |
| **Globaler Hotkey** | Konfigurierbarer Hotkey (Standard: Ctrl+Shift+S) |
| **Datei-Tags** | Farb-Labels für Dateien (JSON in %APPDATA%) |
| **Shell-Integration** | "Mit Speicher Analyse öffnen" im Windows-Kontextmenü (HKCU) |

---

## v7.0 - Netzwerk-Monitor, Software-Audit & Trust (Fertig)

### Netzwerk-Monitor

| Komponente | Beschreibung |
|------------|--------------|
| **Verbindungen** | Aktive TCP-Verbindungen pro Prozess mit Remote-IP (`Get-NetTCPConnection`) |
| **Bandbreite** | Bytes/s pro Netzwerk-Interface (Performance Counter) |
| **Firewall-Regeln** | Bestehende Regeln anzeigen + neue erstellen (`Get-NetFirewallRule`) |

### Privacy-Dashboard
- 12 Windows-Telemetrie-Einstellungen (Registry-Abfrage)
- One-Click-Privacy (alle Telemetrie reduzieren)
- Privacy-Score (0-100)
- Scheduled Tasks Audit

### Software-Audit
- Programm-Inventar (Registry Uninstall-Keys + winget)
- Korrelations-Engine (Programme ↔ Registry ↔ Autostart ↔ Dienste)
- Verwaiste Einträge mit Ursprungs-Software-Zuordnung
- Müll-Zuordnung pro Software mit Ampel-Bewertung

### Trust-System (Phase 1+2)
- Begründung pro Ergebnis (WARUM geflaggt)
- Risiko-Ampel (Grün/Gelb/Rot)
- Vorschau/Dry-Run vor Aktionen

### Weitere Features
- **S.M.A.R.T.** — Festplatten-Gesundheit (Temperatur, Wear, Fehler, Betriebsstunden)
- **System-Score** — Gesundheitspunktzahl 0-100 (gewichtete Kategorien)

---

## v7.1 - Monaco Editor & Dokument-Viewer (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Monaco Editor** | VS Code Editor-Kern für Text-/Code-Dateien. Syntax-Highlighting für 30+ Sprachen, Bearbeitung + Speichern (Ctrl+S), Theme-Sync. |
| **PDF-Viewer** | Canvas-basiertes Rendering (pdf.js). Seitennavigation, Zoom, Button "Extern öffnen". |
| **DOCX-Viewer** | Word-Dokumente als formatierte HTML-Vorschau (mammoth.js). Überschriften, Tabellen, Bilder. |
| **XLSX-Viewer** | Excel-Dateien als HTML-Tabelle (SheetJS). Sheet-Tabs, Sticky Header, max 1000 Zeilen. |
| **readFileBinary IPC** | ArrayBuffer-Transfer für binäre Dateien (PDF/DOCX/XLSX). |
| **Sidebar-Gruppen** | 6 Navigationsgruppen standardmäßig eingeklappt. Chevron-Animation, localStorage-Persistenz. |
| **Omnibar-Fixes** | Click-Outside schließt Dropdown. Relevanz-Algorithmus mit positionsbasiertem Scoring. |

---

## v7.2 - Governance, WCAG & Terminal (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Governance** | Qualitätsstandards in `docs/planung/governance.md`: WCAG 2.2 AA, Sprache, Performance, Sicherheit, Versionierung. |
| **WCAG Kontrast-Fixes** | Komplett überarbeitet: --text-muted 2.3:1→4.7:1, --text-secondary 4.67:1→6.7:1 (Dark), --text-muted 3.2:1→5.3:1 (Light). Alle WCAG 2.2 AA 4.5:1 konform. |
| **Terminal Multi-Shell** | Shell-Selector (PowerShell/CMD/WSL). Dynamische Prompts, WSL-Pfadkonvertierung. PTY-Erkennung für interaktive Befehle (claude, ssh). |
| **Terminal-Kontextmenü** | "Im Terminal öffnen" → eingebettetes Terminal statt externes Fenster. |
| **Versions-Fix** | Konsistente Version 7.2 in package.json, index.html, settings.js. |
| **Netzwerk-Monitor Fix** | Timeout 10s→30s, sequentielle PS-Aufrufe, Retry-Button bei Fehler, Fehler-Feedback. |
| **Datei-Vorschau im Explorer** | Doppelklick auf PDF/DOCX/XLSX/Bilder/Code öffnet integrierte Vorschau statt externes Programm. |
| **Menü: Daten-Aktualisierung** | F5 = Daten der aktuellen Ansicht aktualisieren (kein Page-Reload). Ctrl+Shift+R = Page-Reload. |
| **Kundenorientierung (CLAUDE.md)** | Regeln: Niemals User widersprechen, Tiefenrecherche, Beweislast bei Claude. |

---

## v7.3 - WCAG-Vertiefung & Panel-Customizing (Geplant)

### WCAG 2.2 Vertiefung

User meldet: Kontrast stimmt noch immer nicht überall. Umfassender Audit nötig.

| Aufgabe | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Vollständiger WCAG-Audit** | Alle Views systematisch prüfen (Dashboard, Duplikate, Registry, etc.) | Mittel |
| **Fokus-Ringe** | Sichtbare Keyboard-Focus-Indikatoren für alle interaktiven Elemente | Klein |
| **aria-Attribute** | Screen-Reader-Support für dynamische Inhalte (live regions, labels) | Klein |
| **Farbenblindheit** | Kontrast-Prüfung auch für Deuteranopie/Protanopie-Szenarien | Klein |

### Resizable Panels (Vision: Fenster-Individualisierung)

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Terminal-Resize** | Drag-Handle zum Vergrößern/Verkleinern des Terminal-Panels | Klein |
| **Dual-Panel-Resize** | Resize-Handle zwischen linkem und rechtem Panel | Klein |
| **Explorer-Sidebar-Resize** | Breitenverstellung der Sidebar per Drag | Klein |
| **Panel-Collapse** | Panels komplett ein-/ausklappbar mit Animation | Klein |

### Terminal-Emulation (xterm.js + node-pty)

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **xterm.js** | Echte Terminal-Emulation (ANSI-Farben, Cursor-Steuerung, Scrollback) | Mittel |
| **node-pty** | Pseudo-Terminal für native Shell-Sitzung | Mittel |
| **Claude CLI** | Automatisch verfügbar durch echte Shell (wenn installiert) | Null |
| **Interaktive Befehle** | Programme wie `npm`, `git`, `top` funktionieren korrekt | Null |

---

## v8.0 - Automatisierung & Erweiterte Features (Geplant)

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Automatisierung** | Geplante Scans + Auto-Cleanup nach Regeln (Scheduler) | Mittel |
| **Browser-Bereinigung** | Cache/Cookies/Verlauf für Chrome/Firefox/Edge gezielt löschen | Mittel |
| **Einstellungs-Sync** | Export als JSON-Datei in OneDrive/NAS-Ordner → automatische Synchronisierung ohne Backend | Klein |
| **Portable Modus** | App von USB-Stick startbar (Settings im App-Ordner statt %APPDATA%) | Klein |
| **Backup / Sicherung** | Dateien/Ordner auf Netzlaufwerk, OneDrive, Google Drive Sync-Ordner sichern | Mittel |
| **Undo-Log** | Trust-System Phase 3: Protokoll aller Aktionen mit Wiederherstellungsmöglichkeit | Mittel |

### Einstellungs-Sync: Technischer Ansatz
- Settings als `speicher-analyse-settings.json` exportierbar
- Speicherort wählbar: OneDrive-Ordner, NAS-Pfad, beliebiger Sync-Ordner
- Enthält: Theme, Sidebar-Status, Favoriten, Tags, Scan-Einstellungen
- Beim Start: prüfe ob Sync-Datei neuer ist → Import-Angebot

### Backup / Sicherung: Technischer Ansatz
- Zielordner wählbar: lokaler Pfad, Netzlaufwerk (UNC), OneDrive/Google Drive Sync-Ordner
- Inkrementelles Backup: nur geänderte Dateien (via Änderungsdatum + Dateigröße)
- Node.js `fs.copyFile` / Streams für große Dateien
- Zeitplanung optional via Windows Task Scheduler (`schtasks`)
- Backup-Log mit Statistik (kopierte Dateien, Größe, Dauer)

---

## v9.0 - KI-Integration (Vision)

Basierend auf User-Vision "Bring Your Own Brain" (BYOB):

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **KI-Provider-Abstraktion** | `AiProvider` Interface mit austauschbaren Backends | Mittel |
| **Cloud-Option** | OpenAI/Claude/Gemini API (Key in Electron safeStorage) | Mittel |
| **Local-Option (Ollama)** | localhost:11434, automatische Modell-Erkennung | Mittel |
| **Chat-UI** | Streaming-Responses, Kontext-Aktionen ("Erkläre diesen Registry-Key") | Groß |
| **Notion-Modul** | Active Knowledge Board mit KI-Assistent pro Textblock | Groß |

### Technischer Ansatz
- Abstrakte `AiProvider`-Klasse mit `OllamaProvider` und `CloudProvider`
- Beim Start: Prüfe ob Ollama läuft → Dropdown mit installierten Modellen
- Falls nein: Button "Lokale KI einrichten" → Terminal-Modul
- API-Keys verschlüsselt in Electron `safeStorage`
- Streaming-Responses für Chat-UI

---

## v1.0.0 - Erster stabiler Release (Semver)

Ab hier Umstellung auf Semantic Versioning (Major.Minor.Patch):

| Feature | Beschreibung |
|---------|-------------|
| **Installer** | NSIS oder electron-builder Installer (.exe + .msi) |
| **Auto-Update** | electron-updater via GitHub Releases |
| **Crash-Reporter** | Lokale Crash-Logs (kein Cloud-Upload) |
| **Changelog** | Automatisch generiert aus Git-Commits |
| **Code-Signing** | Optional: EV-Zertifikat gegen SmartScreen-Warnung |
| **Offline-Lizenzierung** | Ed25519 Signatur-Prüfung (lizenz.key, offline-fähig) |

---

## v1.5.0 - Plugin-System

Modulare Erweiterbarkeit für externe Entwickler:

| Komponente | Beschreibung |
|------------|-------------|
| **Plugin-API** | Definiertes Interface: registerTab(), registerContextMenu(), registerAnalyzer() |
| **Plugin-Loader** | Dynamisches Laden aus `plugins/`-Ordner |
| **Sandbox** | Plugins laufen isoliert (kein Zugriff auf Core-State) |
| **Plugin-Store** | Lokaler Katalog (JSON), später optional Online-Verzeichnis |
| **Beispiel-Plugins** | Git-Integration, Markdown-Preview, Bildkomprimierung |

---

## Architektur-Überlegungen

### Warum explorer.exe NICHT ersetzen?
- `explorer.exe` = Dateimanager **+ Taskleiste + Startmenü + Systemtray + Desktop**
- Ohne explorer.exe: kein Startmenü, kein Desktop, keine Taskleiste
- Custom Windows Shell = enormer Aufwand, instabil, Update-Probleme
- **Bessere Strategie:** Parallelbetrieb, Nutzer wählt selbst

### Technische Basis
- Electron gibt uns vollen Dateisystem-Zugang (fs, child_process)
- Node.js streams für große Ordner (kein UI-Freeze)
- Virtual scrolling für Ordner mit 100.000+ Dateien
- Worker threads für Hintergrund-Operationen
- PowerShell + WMI/CIM für System-Abfragen (kein wmic)

### Aktuelle Modul-Struktur (Stand v7.2)
```
main/
├── scanner.js + scanner-worker.js    # Disk-Scanner (Worker Thread)
├── deep-search-worker.js             # Deep Search Worker (Ebene 3)
├── file-ops.js                       # Dateioperationen (Trash, Delete, Copy, Move)
├── duplicates.js + duplicate-worker.js  # Duplikat-Finder
├── old-files.js                      # Alte Dateien
├── cleanup.js                        # Cleanup-Kategorien
├── registry.js                       # Registry-Cleaner
├── autostart.js                      # Autostart-Manager
├── services.js                       # Windows-Dienste
├── bloatware.js                      # Bloatware-Erkennung
├── optimizer.js                      # System-Optimierer
├── updates.js                        # Update-Manager (Windows/Software/Treiber)
├── drives.js                         # Laufwerke (Get-CimInstance)
├── battery.js                        # Batterie-Status
├── compat.js                         # System-Capabilities
├── admin.js                          # Admin-Elevation + Session-Restore
├── cmd-utils.js                      # Zentrale Befehlsausführung
├── menu.js                           # Kontextmenüs
├── export.js                         # CSV/PDF Export
├── preview.js                        # Datei-Vorschau (Monaco/PDF/DOCX/XLSX)
├── scan-compare.js                   # Scan-Vergleich
├── exclusions.js                     # Smart Exclusions
├── file-tags.js                      # Farb-Labels (JSON in %APPDATA%)
├── tray.js                           # System-Tray Icon + Kontextmenü
├── global-hotkey.js                  # Globaler Hotkey
├── shell-integration.js              # Windows-Kontextmenü (HKCU)
├── terminal.js                       # Multi-Shell Terminal (PS/CMD/WSL)
├── privacy.js                        # Privacy-Dashboard
├── smart.js                          # S.M.A.R.T. Festplatten-Gesundheit
├── software-audit.js                 # Software-Audit + Korrelation
├── network.js                        # Netzwerk-Monitor
├── system-score.js                   # System-Score (0-100)
├── main.js                           # Electron Entry
├── ipc-handlers.js                   # IPC-Hub
└── preload.js                        # Context Bridge
```

### Explorer-Vorteile die wir bieten
1. **Schneller** - Virtual scrolling, kein COM-Overhead
2. **Transparenter** - Keine versteckte Telemetrie, Open Source
3. **Mächtiger** - Integrierte Analyse, Duplikate, Cleanup in einem Tool
4. **Anpassbar** - Themes, Layouts, Shortcuts konfigurierbar
5. **Dual-Panel** - Commander-Style für Power-User
6. **Netzwerk-Sichtbarkeit** - Sehen welcher Prozess wohin Daten sendet
7. **Code-Editor** - Monaco Editor für Text-/Code-Dateien direkt im Explorer
8. **Dokument-Viewer** - PDF, DOCX, XLSX Vorschau ohne externe Programme

---

## User-Feedback Tracker

> "Die vertikale Seite klappt sich automatisch ein/aus... NERVTÖTEND!"
> → Gelöst in v5.2 (Hover komplett entfernt, nur Toggle-Button)

> "rund 10-17% CPU, 13% GPU - geht in die falsche Richtung"
> → Adressiert in v5.2 (Animationen deaktiviert, Transitions entfernt)

> "Unter grössten Dateitypen können die Dateien nicht mehrfach ausgewählt werden"
> → Gelöst in v5.2 (Multi-Select mit Checkboxen)

> "Wenn ich eine Datei löschen will, erscheint eine Fehlermeldung"
> → Gelöst in v5.2 (Deutsche Fehlertexte + Retry-Logik)

> "Alte Dateien nicht anklickbar, nur Kästchen"
> → Gelöst in v5.2 (Zeilen-Klick + Sortierung)

> "Ich muss permanent alles nochmals scannen" (4x erwähnt!)
> → Gelöst in v5.2 (Auto-Scan auf Tab-Klick)

> "Updates soll alles auf einmal prüfen"
> → Gelöst in v5.2 (Alle Updates prüfen Button + Auto-Load)

> "Wo ist die Dateisystemüberprüfung? Dism? Nichts vorhanden!"
> → Gelöst in v5.2 (sfc + DISM mit Admin-Check + technischen Details)

> "Treiber sind gemäss Tool 57 Jahre alt!"
> → Gelöst in v5.2 (WMI-Datumsfilter + Hersteller-Info + Support-Links)

> "Wo sehe ich dass das Update korrekt durchgeführt wurde?"
> → Gelöst in v5.2 (Verifizierung nach winget upgrade)

> "Was genau wird wo verändert? Changelog?"
> → Gelöst in v5.2 (Technische Details per Empfehlung, expandable)

> "Duplikatsprüfung dauert ewig (764s)"
> → Optimiert in v5.2 (System-Pfade excludiert, 8KB Partial-Hash, size+ext Grouping)

> "Explorer-Navigation nachbauen, aber besser?"
> → Umgesetzt in v6.0 (Datei-Navigator mit Kontextmenüs, Farbcodierung, Leere-Ordner)

> "Dunkelblaue Schrift auf dunkelblauem Hintergrund, anstrengend zu lesen"
> → Adressiert in v7.2 (6 WCAG-Kontrast-Fixes, neue CSS-Variablen). Weitere Vertiefung in v7.3 geplant.

> "Terminal öffnen per Rechtsklick funktioniert nicht"
> → Gelöst in v7.2 (eingebettetes Terminal statt externes Fenster)

> "PowerShell im Tool? Linux-Ubuntu Shell möglich?"
> → Gelöst in v7.2 (Multi-Shell: PowerShell/CMD/WSL)

> "Fenster statisch, Vergrößern/Verkleinern nicht möglich"
> → Geplant in v7.3 (Resizable Panels)

> "Terminal noch sehr rudimentär, nahtlose Integration gewünscht"
> → Geplant in v7.3 (xterm.js + node-pty)

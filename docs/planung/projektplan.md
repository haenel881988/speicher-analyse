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
| v6.3 | Fertig | Explorer Phase 3: Terminal, System-Tray, Globaler Hotkey, Datei-Tags, Shell-Integration, Einstellungen |
| v7.0 | Fertig | Netzwerk-Monitor, Privacy-Dashboard, Software-Audit, S.M.A.R.T., System-Score |
| v8.0 | Geplant | Automatisierung, Browser-Bereinigung, Einstellungs-Sync, Backup |
| v1.0.0 | Vision | Erster stabiler Release (Semver), Installer, Auto-Update |
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

## v6.2 - Explorer Phase 2: Power-Features (Nächste)

### Kern-Features

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Dual-Panel** | Zwei-Fenster-Ansicht (Commander-Stil), F6 zum Wechseln | Mittel |
| **Tab-Browsing** | Mehrere Ordner in Tabs, Ctrl+T neu, Ctrl+W schließen, Drag-Reorder | Mittel |
| **Hybrid-Suche (3 Ebenen)** | Ordner-Filter + Scan-Index + optionale Deep Search, kein Hintergrund-Indexer | Mittel |
| **Batch-Rename** | Mehrere Dateien umbenennen mit Muster (z.B. `IMG_{counter}.jpg`) | Mittel |

### Technische Umsetzung
- Dual-Panel: Zweites `ExplorerView`-Instanz, geteilter Container mit Resize-Handle
- Tabs: Tab-Bar über der Dateiliste, State pro Tab (Pfad, Sortierung, Scroll-Position)
- Batch-Rename: Modal mit Vorschau (Alt → Neu), Pattern-Parser

### Hybrid-Suche: 3-Ebenen-Architektur (kein Hintergrund-Indexer!)

| Ebene | Was | Wann | Kosten |
|-------|-----|------|--------|
| **1. Ordner-Filter** | Filtert die aktuelle Dateiliste im Browser | Sofort beim Tippen (Debounce 150ms) | Null |
| **2. Scan-Index** | `Map<filename, fullPath[]>` wird beim Disk-Scan mitaufgebaut | Nach Scan verfuegbar | Minimal (kein extra I/O) |
| **3. Deep Search** | Rekursive Suche ab aktuellem Ordner (Worker Thread) | On-Demand per Button | Mittel (nur wenn gewuenscht) |

**Warum kein Windows-Search-Stil-Index:**
- Kein Hintergrund-Dienst, kein FileSystemWatcher, kein permanenter CPU/RAM-Verbrauch
- Scanner traversiert bereits alle Dateien → Index als Nebenprodukt (marginale Kosten)
- Index-Aktualitaet = letzter Scan (Hinweis "Index vom [Datum]" in UI)
- Regex-Support in allen 3 Ebenen

---

## v6.3 - Explorer Phase 3: System-Integration

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Terminal-Integration** | Eingebettete PowerShell im aktuellen Ordner (xterm.js) | Mittel |
| **System-Tray** | Tray-Icon mit Quick-Clean, Speicherplatz-Warnung, Minimize-to-Tray | Klein |
| **Globaler Hotkey** | Konfigurierbarer Hotkey zum Starten/Fokussieren der App | Klein |
| **Datei-Tags** | Eigene Farb-Labels/Tags für Dateien (gespeichert in lokaler DB) | Mittel |
| **Standard-Handler** | Registry-Eintrag: "Ordner öffnen mit Speicher Analyse" | Klein |

### Terminal-Integration: Technischer Ansatz
- `xterm.js` + `node-pty` für echtes Terminal-Emulation
- Panel unterhalb der Dateiliste (aufklappbar, Ctrl+`)
- Automatisch im aktuellen Explorer-Ordner geöffnet
- PowerShell als Standard, CMD als Fallback

---

## v7.0 - Netzwerk-Monitor, Software-Audit & Trust

### Netzwerk-Monitor (Gamechanger)

Eigene Lösung mit direktem Kernel-Zugriff via Node.js:

| Komponente | Ansatz | Beschreibung |
|------------|--------|--------------|
| **Verbindungen** | `Get-NetTCPConnection` + `Get-Process` | Aktive TCP-Verbindungen pro Prozess mit Remote-IP |
| **DNS-Abfragen** | ETW (Event Tracing for Windows) | DNS-Queries live mitlesen via `netsh trace` |
| **Bandbreite** | Performance Counter API | Bytes/s pro Netzwerk-Interface |
| **Prozess-Traffic** | `Get-NetTCPConnection` + Periodic Polling | Zuordnung Prozess → Verbindung → Datenmenge |
| **GeoIP** | Lokale MaxMind DB (kostenlos) | IP → Land/Stadt Auflösung für Ziel-Adressen |
| **Firewall-Regeln** | `Get-NetFirewallRule` | Bestehende Regeln anzeigen + neue erstellen |

**UI-Konzept:**
- Live-Tabelle: Prozess | Remote-IP | Land | Port | Bytes gesendet/empfangen
- Farbcodierung: Bekannte Microsoft/CDN-IPs grün, unbekannte gelb, blockierte rot
- "Blockieren"-Button pro Prozess (erstellt Firewall-Regel)
- Aggregierte Statistik: Top-10 Datenverbraucher

**Technische Basis:**
- PowerShell `Get-NetTCPConnection` für Verbindungsliste (kein Drittanbieter nötig)
- `netstat -b` als Fallback
- ETW Consumer via `child_process` für Echtzeit-DNS
- Performance Counter via `typeperf` oder WMI für Bandbreite
- Polling-Intervall: 2-5 Sekunden (konfigurierbar)

### Privacy-Dashboard

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Telemetrie-Übersicht** | Alle Windows-Telemetrie-Einstellungen anzeigen (Registry-Abfrage) | Mittel |
| **One-Click-Privacy** | Alle Telemetrie mit einem Klick reduzieren/deaktivieren | Klein |
| **Privacy-Score** | Bewertung 0-100 basierend auf aktuellen Einstellungen | Klein |
| **Scheduled Tasks Audit** | Identifiziere Microsoft/OEM Telemetrie-Tasks | Klein |

### Software-Audit (Vision: "Programme und Features")

Vereinte Sicht auf alle installierten Programme + deren Spuren im System:

| Komponente | Beschreibung | Aufwand |
|------------|-------------|---------|
| **Programm-Inventar** | Alle installierten Programme aus Registry `Uninstall`-Keys + winget list | Klein |
| **Korrelations-Engine** | Verbindet Programme mit ihren Registry-Einträgen, Autostart-Entries, Diensten | Mittel |
| **Verwaiste Einträge** | Registry-Reste von deinstallierten Programmen erkennen + Ursprungs-Software zuordnen | Mittel |
| **Müll-Zuordnung** | Pro Software anzeigen: welche Einträge, Dateien, Autostart-Reste sie hinterlässt | Mittel |

**Technischer Ansatz:**
- Baut auf bestehenden Modulen auf: `registry.js`, `bloatware.js`, `autostart.js`
- Neue Korrelations-Logik: Registry `DisplayName` ↔ Autostart `name` ↔ Service `DisplayName`
- Uninstall-Key-Pfad (`InstallLocation`) prüfen ob Ordner noch existiert
- Ergebnis: Tabelle mit Ampel pro Programm (Grün = sauber, Gelb = Reste, Rot = viel Müll)

### Trust-System (Vision: "Vertrauen")

Querschnittsthema: Nutzer sollen jedem Ergebnis vertrauen können.

| Aspekt | Beschreibung | Aufwand |
|--------|-------------|---------|
| **Begründung** | Jedes Ergebnis zeigt WARUM es geflaggt wurde (z.B. "Key zeigt auf Pfad X - existiert nicht") | Mittel |
| **Risiko-Ampel** | Grün = sicher löschbar, Gelb = prüfen empfohlen, Rot = System-relevant, Vorsicht | Klein |
| **Vorschau (Dry-Run)** | Vor jeder Aktion zeigen was genau passiert + was betroffen ist | Mittel |
| **Undo-Log** | Protokoll aller Aktionen mit Wiederherstellungsmöglichkeit (Registry-Backup, Papierkorb) | Mittel |
| **Quellen-Transparenz** | Anzeige woher Daten stammen (Registry-Pfad, WMI-Klasse, Dateisystem) | Klein |

**Schrittweise Einführung:**
- Phase 1 (v7.0): Begründung + Risiko-Ampel für Registry-Cleaner und Software-Audit
- Phase 2 (v7.0): Vorschau/Dry-Run für alle Lösch-Aktionen
- Phase 3 (v8.0): Vollständiges Undo-Log mit Wiederherstellung

### Weitere Features

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **S.M.A.R.T.** | Festplatten-Gesundheit (via `Get-PhysicalDisk` + `Get-StorageReliabilityCounter`) | Mittel |
| **Prozess-Manager** | Erweiterter Task-Manager mit CPU/RAM/Disk pro Prozess | Groß |
| **System-Score** | Gesundheitspunktzahl 0-100 basierend auf allen Analysen | Klein |

---

## v8.0 - Automatisierung & Erweiterte Features

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| **Automatisierung** | Geplante Scans + Auto-Cleanup nach Regeln (Scheduler) | Mittel |
| **Browser-Bereinigung** | Cache/Cookies/Verlauf für Chrome/Firefox/Edge gezielt löschen | Mittel |
| **Einstellungs-Sync** | Export als JSON-Datei in OneDrive/NAS-Ordner → automatische Synchronisierung ohne Backend | Klein |
| **Portable Modus** | App von USB-Stick startbar (Settings im App-Ordner statt %APPDATA%) | Klein |
| **Backup / Sicherung** | Dateien/Ordner auf Netzlaufwerk, OneDrive, Google Drive Sync-Ordner sichern | Mittel |

### Einstellungs-Sync: Technischer Ansatz
Kein Backend nötig. Einfacher Dateiaustausch:
- Settings werden als `speicher-analyse-settings.json` gespeichert
- Speicherort wählbar: OneDrive-Ordner, NAS-Pfad, beliebiger Sync-Ordner
- Import/Export über UI-Button
- Enthält: Theme, Sidebar-Status, Favoriten, Tags, Scan-Einstellungen
- Beim Start: prüfe ob Sync-Datei neuer ist → Import-Angebot

### Backup / Sicherung: Technischer Ansatz
Kein Cloud-Backend nötig. Direkte Dateikopie:
- Zielordner wählbar: lokaler Pfad, Netzlaufwerk (UNC), OneDrive/Google Drive Sync-Ordner
- Inkrementelles Backup: nur geänderte Dateien (via Änderungsdatum + Dateigröße)
- Node.js `fs.copyFile` / Streams für große Dateien
- Zeitplanung optional via Windows Task Scheduler (`schtasks`)
- Backup-Log mit Statistik (kopierte Dateien, Größe, Dauer)

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

### Aktuelle Modul-Struktur (Stand v6.1)
```
main/
├── scanner.js + scanner-worker.js    # Disk-Scanner (Worker Thread)
├── explorer.js                       # Datei-Navigator
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
├── preview.js                        # Datei-Vorschau
├── scan-compare.js                   # Scan-Vergleich
├── exclusions.js                     # Smart Exclusions
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

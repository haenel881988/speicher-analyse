# Speicher Analyse v3.5 - Optimierung & neue Features



# v4.0 Roadmap - Simons Feedback + Erweiterungen

## A) UI-Redesign: Ribbon-Layout (Simons Feedback)

### A1. Ribbon-Navigation (wie Word/CCleaner)
- Horizontale Ribbon-Leiste oben statt zwei Tab-Reihen
- Ribbon-Tabs: **Start** | **Analyse** | **Bereinigung** | **System** | **Einstellungen**
- Jeder Ribbon-Tab zeigt Gruppen mit Icons + Labels (wie Office)
- Ribbon "Start": Grosser Scan-Button, Laufwerk-Auswahl, Dashboard
- Ribbon "Analyse": Verzeichnisbaum, Treemap, Dateitypen, Top 100, Duplikate
- Ribbon "Bereinigung": Cleanup, Alte Dateien, Registry
- Ribbon "System": Autostart, Dienste, Prozesse, Updates, Optimierung
- Ribbon "Einstellungen": Laufwerke konfigurieren, Theme, Sprache, Scan-Optionen

### A2. Ein-Button-Scan (Simons Feedback)
- Grosser "Analyse starten"-Button im Ribbon
- Standardmässig nur C: scannen
- In Einstellungen: weitere Laufwerke hinzufügen/entfernen
- Ein Scan löst ALLES aus: Festplatte + Cleanup + Registry + Alte Dateien + Services + Autostart
- Dashboard zeigt danach Gesamtübersicht mit "Gesundheitspunktzahl"

### A3. Laufwerk-Symbole im Ribbon (wie TreeSize)
- Laufwerk-Icons direkt in der Ribbon-Leiste anzeigen
- Klick wechselt das aktive Laufwerk
- Farbige Füllstandsanzeige direkt im Icon (grün/gelb/rot)
- Tooltip mit Details (Frei/Belegt/Filesystem)

---

## B) Bloatware-Erkennung & Automatisierte Deinstallation (Simons Feedback)

### B1. Bloatware-Datenbank
- Kuratierte JSON-Liste bekannter Bloatware/PUPs:
  - Reimage Repair, Driver Booster, Driver Easy, SlimCleaner
  - PC Optimizer Pro, MyPC Backup, WinZip Driver Updater
  - Ask Toolbar, Babylon Toolbar, Conduit Search
  - McAfee WebAdvisor (wenn nicht gewollt), Norton Power Eraser Reste
  - Vorinstallierte OEM-Bloatware (Lenovo Vantage Bloat, HP Touchpoint Analytics, etc.)
- Kategorien: **Gefährlich** (Scareware) | **Unnötig** (Bloatware) | **Fragwürdig** (Toolbars)
- Jeder Eintrag: Name, Erkennungsmuster (Registry-Keys, Exe-Pfade), Beschreibung, Risiko-Level

### B2. Stille/Automatisierte Deinstallation
- `UninstallString` aus Registry auslesen
- Bekannte Silent-Flags pro Installer-Typ:
  - MSI: `msiexec /x {GUID} /qn /norestart`
  - NSIS: `/S` (silent)
  - InnoSetup: `/VERYSILENT /NORESTART`
  - Installshield: `/s /f1"uninstall.iss"`
- Fallback: `wmic product where "name like '...'" call uninstall /nointeractive`
- Fortschrittsanzeige pro Deinstallation
- Nachbereinigung: Reste-Ordner und Registry-Einträge aufräumen

### B3. Endanwender-freundliche Darstellung
- Ampel-System: Rot (sofort entfernen), Gelb (Empfehlung), Grün (sicher)
- Einfache Erklärung pro Programm: "Was macht es?" / "Warum entfernen?"
- "Alles Empfohlene entfernen" One-Click-Button
- Bestätigungsdialog mit Zusammenfassung vor der Aktion

---

## C) System-Optimierungsempfehlungen (Simons Feedback)

### C1. Hardware-basierte Empfehlungen
- **SSD erkannt → Hibernate deaktivieren**: `powercfg -h off` (spart Speicher = RAM-Grösse)
  - Erklärung: "Hibernate schreibt den gesamten RAM-Inhalt auf die SSD. Bei 16GB RAM werden 16GB SSD-Platz belegt. Bei SSDs ist dies unnötig, da der Ruhezustand bereits schnell ist."
- **SSD → Superfetch/Prefetch deaktivieren**: Bei NVMe nicht nötig
- **SSD → Windows-Indexierung** auf Nicht-SSD-Laufwerke beschränken
- **RAM >= 16GB → Pagefile optimieren**: Feste Grösse statt dynamisch
- **HDD erkannt → Defragmentierung empfehlen** (nur für HDD, nie für SSD!)

### C2. Windows-Datenschutz & Telemetrie
- Telemetrie reduzieren (DiagTrack-Dienst, Connected User Experiences)
- Cortana deaktivieren (wenn nicht verwendet)
- Werbe-ID zurücksetzen und deaktivieren
- Vorgeschlagene Inhalte in Einstellungen deaktivieren
- Timeline/Aktivitätsverlauf deaktivieren
- Jede Empfehlung mit Toggle und Erklärung

### C3. Windows-Leistungsoptimierungen
- Visuelle Effekte reduzieren (Animationen, Transparenz, Schatten)
- Schnellstart (Fast Startup) Empfehlung
- Energiesparplan: "Höchstleistung" für Desktop-PCs empfehlen
- Virtuelle Arbeitsspeicher (Pagefile) Optimierung
- Nicht benötigte geplante Tasks deaktivieren
- Temporäre Dateien von Windows Update aufräumen (`SoftwareDistribution`)

---

## D) Update-Manager (Simons Feedback)

### D1. Windows-Update Status
- `Get-WindowsUpdate` (PSWindowsUpdate) oder `wuapi.dll` COM
- Ausstehende Updates anzeigen (Anzahl, KB-Nummern, Grösse)
- "Updates jetzt installieren" Button
- Update-Verlauf anzeigen (letzte installierte Updates)

### D2. Software-Update Checker
- Installierte Programme aus Registry auslesen (Uninstall-Keys)
- Versionsnummern mit Online-Datenbank abgleichen:
  - Option 1: Eigene JSON-Datei mit bekannten Programmen + Latest-Versions
  - Option 2: Winget als Backend nutzen (`winget upgrade --include-unknown`)
- Bekannte Programme: Chrome, Firefox, VLC, 7-Zip, Notepad++, Java, .NET, etc.
- Update-Möglichkeit: `winget upgrade <package-id>` direkt aus dem Tool

### D3. Treiber-Check
- `driverquery /v /fo CSV` für installierte Treiber
- Alter der Treiber anzeigen (Treiber-Datum)
- Warnung bei sehr alten Treibern (> 3 Jahre)
- KEIN automatisches Treiber-Update (zu riskant) - nur Empfehlungen

---

## E) Weitere Erweiterungen (Claudes Vorschläge)

### E1. Prozess-Manager (erweiterter Task-Manager)
- Laufende Prozesse mit CPU/RAM/Disk-Verbrauch
- Gruppierung nach: Benutzer-Apps, Hintergrundprozesse, Windows-Dienste
- "Verdächtige Prozesse" Erkennung (unbekannte Pfade, hoher Verbrauch)
- Prozess beenden / Priorität ändern
- Netzwerk-Verbindungen pro Prozess (welcher Prozess telefoniert nach Hause?)

### E2. Browser-Bereinigung
- Cache, Cookies, Verlauf für alle installierten Browser:
  - Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache`
  - Firefox: `%APPDATA%\Mozilla\Firefox\Profiles\*\cache2`
  - Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache`
- Gespeicherte Passwörter NICHT anfassen (zu gefährlich)
- Flash/Silverlight-Reste aufräumen
- Browser-Erweiterungen auflisten (verdächtige markieren)

### E3. System-Gesundheitsbericht
- Nach dem Scan: PDF-Report generieren mit:
  - Speicherbelegung Zusammenfassung
  - Gefundene Probleme (Registry, Bloatware, alte Dateien)
  - Empfehlungen priorisiert (Rot/Gelb/Grün)
  - Vorher/Nachher Vergleich (wenn Bereinigung durchgeführt)
  - "System-Score" von 0-100

### E4. Festplatten-Gesundheit (S.M.A.R.T.)
- S.M.A.R.T.-Daten auslesen via `wmic diskdrive get status` oder PowerShell
- Temperatur, Betriebsstunden, Reallocated Sectors
- Warnung bei degradierender Festplatte
- SSD: Remaining Life Percentage
- Empfehlung: "Backup dringend empfohlen" bei schlechten Werten

### E5. Netzwerk-Analyse
- Aktive Verbindungen: `netstat -b` → welcher Prozess nutzt welchen Port
- Bandbreite pro Prozess (wenn möglich via ETW)
- DNS-Cache anzeigen und leeren
- Firewall-Regeln: Übersicht + verdächtige Regeln markieren

### E6. Geplante Wartung
- Automatischer wöchentlicher/monatlicher Scan
- Tray-Icon mit Benachrichtigungen
- "Quick Clean" aus dem System-Tray (Temp + Cache ohne UI)
- Scan-Zeitplan konfigurierbar

### E7. Portable Modus
- App von USB-Stick startbar ohne Installation
- Einstellungen in App-Ordner statt %APPDATA%
- Ideal für IT-Support: Schnell-Diagnose auf fremden PCs

---

## Priorisierte Reihenfolge für v4.0

| Priorität | Feature | Begründung |
|-----------|---------|------------|
| 1 - Hoch | A1-A3: Ribbon-UI Redesign | Grundlage für alles andere, User-Wunsch |
| 2 - Hoch | B1-B3: Bloatware-Erkennung | Grösster Mehrwert für Endanwender |
| 3 - Hoch | C1-C3: System-Optimierung | Einfach umsetzbar, grosser Effekt |
| 4 - Mittel | D1-D2: Update-Manager | Wichtig für Sicherheit |
| 5 - Mittel | E1: Prozess-Manager | Ergänzt Services-Viewer |
| 6 - Mittel | E2: Browser-Bereinigung | Häufig angefragte Funktion |
| 7 - Mittel | E3: Gesundheitsbericht | Professioneller Eindruck |
| 8 - Niedrig | E4: S.M.A.R.T. | Nice-to-have |
| 9 - Niedrig | E5: Netzwerk-Analyse | Fortgeschritten |
| 10 - Niedrig | E6-E7: Wartung/Portabel | Komfort-Features |



## Kontext
Die v3.0 läuft mit 7 Features, aber der User hat kritisches Feedback:
- Umlaute fehlen (ae/oe/ue statt ä/ö/ü) - **unprofessionell**
- Jedes Tool braucht eigenen Scan-Klick - **unübersichtlich**
- Duplikat-Scan ist extrem langsam - **Performance-Problem**
- Registry-Backup muss manuell erstellt werden - **unsicher**
- Autostart-Manager fehlt komplett
- Windows-Dienste-Ansicht fehlt
- Kein Dashboard/Übersicht nach Scan - **nicht wie CCleaner**

## 7 Änderungsbereiche

| # | Bereich | Dateien | Aufwand |
|---|---------|---------|---------|
| 1 | Umlaute korrigieren | ~15 Dateien, ~50 Stellen | Klein |
| 2 | Performance: Duplikat-Worker | 3 Dateien | Mittel |
| 3 | Performance: Registry async | 1 Datei | Mittel |
| 4 | Unified Scan + Dashboard | 6 Dateien (1 neu) | Groß |
| 5 | Registry Auto-Backup | 3 Dateien | Klein |
| 6 | Autostart-Manager | 5 Dateien (2 neu) | Mittel |
| 7 | Services-Viewer | 5 Dateien (2 neu) | Mittel |

---

## Phase 1: Umlaute korrigieren (~50 Stellen in ~15 Dateien)

Alle user-sichtbaren Strings von ae→ä, oe→ö, ue→ü, Ae→Ä, Oe→Ö, Ue→Ü ändern.

### Betroffene Dateien:

**renderer/index.html** (4 Stellen):
- L111: `fuer` → `für`
- L119, L149, L168: `Groesse` → `Größe`

**renderer/js/app.js** (2):
- L441, L446: `durchfuehren` → `durchführen`

**renderer/js/duplicates.js** (5):
- L31: `auswaehlen` → `auswählen`
- L32: `Ausgewaehlte loeschen` → `Ausgewählte löschen`
- L62: `Vorab-Pruefung` → `Vorab-Prüfung`, `Vollstaendiger` → `Vollständiger`
- L185: `loeschen` → `löschen`

**renderer/js/old-files.js** (6):
- L23: `Aelter` → `Älter`
- L33: `Groesse` → `Größe`
- L42: `auswaehlen` → `auswählen`
- L44: `Ausgewaehlte loeschen` → `Ausgewählte löschen`

**renderer/js/cleanup.js** (3):
- L24: `auswaehlen` → `auswählen`
- L26: `Ausgewaehlte` → `Ausgewählte`
- L68: `noetig` → `nötig`

**renderer/js/registry.js** (8+):
- L14: `verfuegbar` → `verfügbar`
- L23: `Aenderungen`→`Änderungen`, `koennen`→`können`, `beeintraechtigen`→`beeinträchtigen`, `Eintraege`→`Einträge`, `loeschen`→`löschen`
- L32, L35: `auswaehlen`/`Ausgewaehlte` → `auswählen`/`Ausgewählte`
- L146: `Eintraege auswaehlen` → `Einträge auswählen`

**renderer/js/scan-compare.js** (3):
- L21: `frueherem` → `früherem`
- L25: `spaeter`→`später`, `Veraenderungen`→`Veränderungen`
- L90: `Geloescht` → `Gelöscht`

**renderer/js/preview.js** (3):
- L48: `auswaehlen fuer` → `auswählen für`
- L115: `Groesse` → `Größe`
- L116: `Geaendert` → `Geändert`

**renderer/js/file-manager.js** (8):
- L52, L54: `Einfuegen` → `Einfügen`
- L71, L81, L110: `Loeschen`/`geloescht` → `Löschen`/`gelöscht`
- L96, L99, L100: `Endgueltig` → `Endgültig`
- L160: `Groesse` → `Größe`
- L162: `Geaendert` → `Geändert`

**renderer/js/treemap.js** (1):
- L206: `Groesse` → `Größe`

**main/menu.js** (12):
- L32, L96, L134: `Einfuegen` → `Einfügen`
- L33: `auswaehlen` → `auswählen`
- L58: `Ueber` → `Über`
- L89, L123: `oeffnen` → `öffnen`
- L98, L114, L125: `Loeschen` → `Löschen`
- L99, L115: `Endgueltig loeschen` → `Endgültig löschen`
- L107: `Oeffnen` → `Öffnen`

**main/cleanup.js** (4):
- L9: `Temporaere` → `Temporäre`
- L46, L65: `noetig` → `nötig`
- L91: `Abhaengigkeiten` → `Abhängigkeiten`

**main/registry.js** (4):
- L185: `Deinstallationseintraege` → `Deinstallationseinträge`
- L186: `Eintraege` → `Einträge`
- L198: `Autostarteintraege` → `Autostarteinträge`
- L266: `Geschuetzter` → `Geschützter`

**main/ipc-handlers.js** (1):
- L241: `Frueheren` → `Früheren`

**main/export.js** (1):
- L16: `Groesse` → `Größe`

---

## Phase 2: Performance - Duplikat-Worker optimieren

### Probleme:
1. **8KB Buffer** für Full-Hash (L46 duplicate-worker.js) - viel zu klein
2. **Kein Min-Size-Filter** - hasht tausende 1-Byte-Dateien
3. **ALLE Dateien zum Worker** serialisiert (duplicates.js:18-26) - bei 500K Dateien = ~60MB JSON
4. **Kein Fortschritts-ETA**

### Änderungen:

**main/duplicate-worker.js** - Buffer & Filter:
```
- L5: const { files, options = {} } = workerData;
       const minFileSize = options.minSize || 1024;
       const maxFileSize = options.maxSize || 2147483648; // 2GB
- L10: if (f.size === 0 || f.size < minFileSize || f.size > maxFileSize) continue;
- L46: const bufSize = partialOnly ? 65536 : 131072; // 128KB statt 8KB
- Progress: ETA berechnen (elapsed / pct - elapsed)
```

**main/duplicates.js** - Pre-Filter auf Main-Thread:
```javascript
start(onProgress, onComplete, onError, options = {}) {
    // Phase 0: Size-Gruppen vorab auf Main-Thread filtern
    const sizeMap = new Map();
    for (const [, files] of this.scanner.dirFiles) {
        for (const f of files) {
            if (f.size === 0 || (options.minSize && f.size < options.minSize)) continue;
            if (options.maxSize && f.size > options.maxSize) continue;
            if (!sizeMap.has(f.size)) sizeMap.set(f.size, []);
            sizeMap.get(f.size).push({path:f.path, name:f.name, size:f.size, ext:f.ext, mtime:f.mtime});
        }
    }
    // NUR Dateien mit Size-Duplikaten zum Worker senden
    const candidates = [];
    for (const [, group] of sizeMap) {
        if (group.length >= 2) candidates.push(...group);
    }
    // Typischerweise 90-98% weniger Daten zum Worker!
    this.worker = new Worker(..., { workerData: { files: candidates, options } });
}
```

**main/ipc-handlers.js** - Options durchreichen:
- L171: `start-duplicate-scan` Handler bekommt `options` Parameter
- An `finder.start(onProgress, onComplete, onError, options)` weiterleiten

**main/preload.js** - API erweitern:
- L64: `startDuplicateScan: (scanId, options) => ipcRenderer.invoke('start-duplicate-scan', scanId, options)`

**renderer/js/duplicates.js** - Filter-UI + Options:
- Min/Max-Größe Felder in Toolbar hinzufügen
- Options an `window.api.startDuplicateScan(scanId, { minSize, maxSize })` übergeben
- ETA in Fortschrittsanzeige: `ca. Xs verbleibend`

**Erwartete Verbesserung:** 5-20x schneller durch Pre-Filter + 16x weniger Syscalls durch größeren Buffer.

---

## Phase 3: Performance - Registry async machen

### Problem:
- `execSync` blockiert den gesamten Main-Thread (registry.js L24, L38, L246, L272, L277, L293)
- 3 Scan-Kategorien sequentiell = bis 90 Sekunden UI-Freeze

### Änderungen an `main/registry.js`:

1. **execSync → async execFile** überall ersetzen:
```javascript
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

async function regQuery(keyPath) {
    const { stdout } = await execFileAsync('reg', ['query', keyPath, '/s'], {
        encoding: 'utf8', timeout: 30000, windowsHide: true
    });
    return stdout;
}
```

2. **Parallel statt sequentiell** in `scanAll()`:
```javascript
async function scanAll() {
    const [uninstall, startup, sharedDlls] = await Promise.allSettled([
        scanOrphanedUninstall(),
        scanInvalidStartup(),
        scanOrphanedSharedDLLs(),
    ]);
    // Ergebnisse zusammenbauen...
}
```

3. **generateBackup, deleteEntries, restoreBackup** ebenfalls async machen (execSync → execFileAsync).

**Erwartete Verbesserung:** UI bleibt responsive, 3x schneller durch Parallelisierung.

---

## Phase 4: Unified Scan + Dashboard

### Konzept:
Nach dem Haupt-Disk-Scan automatisch im Hintergrund:
- Cleanup-Kategorien scannen (nutzt Scanner-Daten + Filesystem)
- Alte Dateien analysieren (nutzt Scanner-Daten, instant)
- Registry scannen (unabhängig, jetzt async)
- Ergebnisse im neuen **Dashboard-Tab** als Übersicht anzeigen

Duplikat-Scan bleibt manuell (zu teuer für Auto-Start), aber mit One-Click vom Dashboard.

### Neue Datei: `renderer/js/dashboard.js`
```javascript
export class DashboardView {
    constructor(container) { ... }
    init(scanId, scanProgress) { this.render(); }
    updateResults(results) { this.renderCards(); }
    render() {
        // Grid mit Karten:
        // - Speicherbelegung (primary card, aus Scan-Daten)
        // - Bereinigung (Cleanup-Ergebnis, klickbar → Tab "cleanup")
        // - Alte Dateien (Old-Files-Ergebnis, klickbar → Tab "old-files")
        // - Registry (Registry-Ergebnis, klickbar → Tab "registry")
        // - Duplikate (One-Click Start, → Tab "duplicates")
        // - Autostart (klickbar → Tab "autostart")
        // - Dienste (klickbar → Tab "services")
    }
}
```

### Änderungen an `renderer/index.html`:
- Neuen Tab in Tools-Zeile als ERSTEN: `<button class="tab-btn" data-tab="dashboard">Übersicht</button>`
- Neue View-Container: `<div id="view-dashboard" class="tab-view"></div>`, `<div id="view-autostart" class="tab-view"></div>`, `<div id="view-services" class="tab-view"></div>`
- Tabs "Autostart" und "Dienste" in Tools-Zeile

### Änderungen an `renderer/js/app.js`:
- Import DashboardView, AutostartView, ServicesView
- Instanziierung der neuen Views
- `onScanComplete()` → ruft `runPostScanAnalysis()` auf:
```javascript
async function runPostScanAnalysis() {
    const [cleanup, oldFiles, registry] = await Promise.allSettled([
        cleanupView.autoScan(),
        oldFilesView.autoSearch(),
        registryView.autoScan(),
    ]);
    dashboardView.updateResults({ cleanup, oldFiles, registry });
    switchToTab('dashboard'); // Dashboard als Landing-View nach Scan
}
```
- `switchToTab(tabName)` Hilfsfunktion
- Dashboard-Klick navigiert zum jeweiligen Tab

### autoScan/autoSearch Methoden in bestehenden Views:
- **cleanup.js**: `async autoScan()` - ruft `scanCleanupCategories` auf, rendert, gibt Summary zurück
- **old-files.js**: `async autoSearch()` - ruft `getOldFiles` mit Defaults auf (365 Tage, 1MB min)
- **registry.js**: `async autoScan()` - ruft `scanRegistry` auf, rendert, gibt Summary zurück

### CSS für Dashboard (style.css):
```css
.dashboard { padding: 24px; overflow-y: auto; height: 100%; }
.dashboard-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.dash-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.dash-card.clickable:hover { border-color: var(--accent); transform: translateY(-2px); }
.dash-card-icon { font-size: 28px; }
.dash-card-title { font-size: 12px; text-transform: uppercase; color: var(--text-muted); }
.dash-card-value { font-size: 22px; font-weight: 700; }
.dash-card-detail { font-size: 13px; color: var(--text-secondary); }
.dash-card.loading { opacity: 0.7; }
```

---

## Phase 5: Registry Auto-Backup

### Konzept:
Vor JEDER Registry-Bereinigung wird automatisch ein Backup im App-Data-Ordner erstellt. Kein manueller Schritt mehr nötig.

### Änderungen an `main/registry.js`:
- Neue Funktion `autoBackup(entries)`:
  - Speichert unter `%APPDATA%/speicher-analyse/registry-backups/auto-backup-YYYY-MM-DD-HHmmss.reg`
  - Gibt Backup-Pfad zurück

### Änderungen an `main/ipc-handlers.js`:
- `clean-registry` Handler: Vor `deleteEntries()` automatisch `autoBackup()` aufrufen
- Backup-Pfad in Response zurückgeben: `{ results, backupPath }`

### Änderungen an `renderer/js/registry.js`:
- `backupCreated`-Gate entfernen (L166-169)
- Bereinigen-Button immer aktiv (nicht mehr disabled)
- Warntext ändern: "Vor jeder Bereinigung wird automatisch eine Sicherung erstellt."
- Toast zeigt Backup-Pfad an: "X Einträge bereinigt. Backup: ..."
- Manueller Backup-Export bleibt als optionale Zusatzfunktion

---

## Phase 6: Autostart-Manager (NEU)

### Neue Datei: `main/autostart.js`
Scannt ALLE Autostart-Quellen (mehr als der Task-Manager zeigt):

1. **Registry Run Keys:**
   - `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
   - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
   - `HKCU\...\RunOnce`

2. **Startup-Ordner:**
   - `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` (Benutzer)
   - `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup` (Alle)

3. **Aufgabenplanung:**
   - `schtasks /query /fo CSV /nh /v` → Filter nach "Bei Anmeldung"/"At log on"

Funktionen:
- `getAutoStartEntries()` → Array mit {name, command, location, source, enabled, exists}
- `toggleAutoStart(entry, enabled)` → Registry-Wert löschen/hinzufügen, Startup-Ordner rename, schtasks /change
- `deleteAutoStart(entry)` → Eintrag komplett entfernen

### Neue Datei: `renderer/js/autostart.js`
`AutostartView` Klasse:
- Toolbar: "Autostart laden" Button, Filter-Dropdown (Alle/Registry/Ordner/Tasks)
- Tabelle: Name | Befehl | Quelle | Status (Toggle-Switch) | Aktionen (Löschen)
- Ungültige Einträge (Programm existiert nicht) rot markiert
- Toggle-Switch zum Aktivieren/Deaktivieren
- Windows-only Check via `getPlatform()`

### IPC & Preload:
- `get-autostart-entries`, `toggle-autostart`, `delete-autostart`
- `getAutoStartEntries()`, `toggleAutoStart(entry, enabled)`, `deleteAutoStart(entry)`

### CSS:
- Toggle-Switch Komponente (36x20px, accent-colored slider)
- `.badge-invalid` für ungültige Einträge
- `.btn-sm` für kleine Action-Buttons

---

## Phase 7: Services-Viewer (NEU)

### Neue Datei: `main/services.js`
Verwendet PowerShell für strukturierte Daten:
```javascript
async function getServices() {
    const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        'Get-Service | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json'
    ], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return JSON.parse(stdout).map(s => ({
        name: s.Name, displayName: s.DisplayName,
        status: s.Status === 4 ? 'Running' : 'Stopped',
        startType: mapStartType(s.StartType)
    }));
}
async function controlService(name, action) { /* sc start/stop */ }
async function setStartType(name, startType) { /* sc config start= auto|demand|disabled */ }
```

### Neue Datei: `renderer/js/services.js`
`ServicesView` Klasse:
- Toolbar: "Dienste laden" Button, Filter (Alle/Aktiv/Gestoppt), Suchfeld
- Summary: "X Dienste · Y aktiv · Z gestoppt"
- Tabelle: Status (●/○) | Anzeigename | Dienstname | Starttyp (Dropdown) | Aktionen (Start/Stop)
- Starten/Stoppen mit Bestätigungsdialog
- Starttyp direkt änderbar via Dropdown (Automatisch/Manuell/Deaktiviert)
- Windows-only Check

### IPC & Preload:
- `get-services`, `control-service`, `set-service-start-type`
- `getServices()`, `controlService(name, action)`, `setServiceStartType(name, startType)`

### CSS:
- `.service-status.service-running` → grün
- `.service-status.service-stopped` → grau
- `.service-starttype` Select-Styling

---

## Implementierungsreihenfolge

```
Phase 1: Umlaute          [keine Abhängigkeiten]
Phase 2: Duplikat-Perf    [keine Abhängigkeiten]
Phase 3: Registry async   [keine Abhängigkeiten]
Phase 4: Unified + Dashboard [braucht Phase 3 für async Registry]
Phase 5: Auto-Backup      [braucht Phase 3 für async Registry]
Phase 6: Autostart         [keine Abhängigkeiten]
Phase 7: Services          [keine Abhängigkeiten]
```

Phasen 1, 2, 3, 6, 7 sind unabhängig → können parallel entwickelt werden.
Phase 4+5 brauchen Phase 3 (async Registry).

## Neue Dateien (5)
1. `renderer/js/dashboard.js` - Dashboard-View
2. `renderer/js/autostart.js` - Autostart-View
3. `renderer/js/services.js` - Services-View
4. `main/autostart.js` - Autostart Backend
5. `main/services.js` - Services Backend

## Geänderte Dateien (19)
1. `renderer/index.html` - Umlaute + 3 neue Tabs + 3 neue Views
2. `renderer/css/style.css` - Dashboard + Toggle + Services CSS
3. `renderer/js/app.js` - Umlaute + Dashboard + Unified Scan + neue Imports
4. `renderer/js/duplicates.js` - Umlaute + Filter-UI + Options
5. `renderer/js/old-files.js` - Umlaute + autoSearch()
6. `renderer/js/cleanup.js` - Umlaute + autoScan()
7. `renderer/js/registry.js` - Umlaute + autoScan() + Auto-Backup-Flow
8. `renderer/js/scan-compare.js` - Umlaute
9. `renderer/js/preview.js` - Umlaute
10. `renderer/js/file-manager.js` - Umlaute
11. `renderer/js/treemap.js` - Umlaute
12. `main/duplicate-worker.js` - 128KB Buffer + Min/Max Filter + ETA
13. `main/duplicates.js` - Pre-Filter + Options
14. `main/registry.js` - execSync→async + parallel + autoBackup()
15. `main/ipc-handlers.js` - Neue Handler + Options + Auto-Backup
16. `main/preload.js` - Neue APIs
17. `main/menu.js` - Umlaute
18. `main/cleanup.js` - Umlaute
19. `main/export.js` - Umlaute

## Verifikation

1. `npm start` → App startet ohne Fehler
2. Alle Texte mit korrekten Umlauten (ä, ö, ü, ß) prüfen
3. Drive scannen → Dashboard erscheint automatisch mit Zusammenfassung
4. Dashboard-Karten zeigen Cleanup/Alte Dateien/Registry-Ergebnisse ohne extra Klick
5. Duplikat-Scan: Filter einstellen, starten → deutlich schneller als vorher
6. Registry: "Bereinigen" ohne manuelles Backup → Auto-Backup wird erstellt, Pfad in Toast
7. Autostart-Tab: Alle Quellen geladen, Toggle zum Aktivieren/Deaktivieren
8. Dienste-Tab: Alle Services geladen, Start/Stop/Starttyp ändern
9. UI bleibt während Registry-Scan responsive (kein Freeze)

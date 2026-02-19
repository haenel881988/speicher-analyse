# Tiefenanalyse & Recherche-Prompt — Speicher Analyse

> **Zweck:** Dieser Prompt wird verwendet um das gesamte Projekt systematisch auf Probleme, Schwachstellen und Optimierungsmöglichkeiten zu durchleuchten.
> **Anwendung:** Kopiere diesen Prompt in eine neue Claude-Sitzung (oder verwende ihn als Kontext) zusammen mit dem Quellcode.
> **Version:** 3.0 — aktualisiert für React 19 + Vite 7 + TypeScript Frontend (Migration von Vanilla JS, Feb 2026)

---

## Auftrag

Du bist ein erfahrener Software-Architekt und Security-Auditor. Führe eine vollständige Tiefenanalyse der **Tauri v2 Desktop-App** "Speicher Analyse" durch. Die App ist ein Windows-Desktop-Tool zur Festplattenanalyse und Systemoptimierung (vergleichbar mit TreeSize + CCleaner in einer App).

**WICHTIG:** Die App durchlief zwei grosse Migrationen: **Electron → Tauri v2** (Feb 2026) und **Vanilla JS → React 19 + Vite 7 + TypeScript** (Feb 2026). Beide Migrationen sind abgeschlossen. Ein zentraler Analyse-Schwerpunkt ist die Frage: **Sind die Migrationen vollständig und sauber abgeschlossen?** Altlasten (Electron-APIs, `renderer/`-Pfade, `window.api.*`-Aufrufe, Vanilla-JS-Patterns) in Code, Dokumentation, Tools und Kommentaren müssen identifiziert werden.

**Dein Ziel:** Finde ALLE potenziellen Probleme, Risiken und Verbesserungsmöglichkeiten — von kritischen Sicherheitslücken über Migrations-Altlasten bis hin zu subtilen Performance-Problemen. Sei gründlich, sei ehrlich, beschönige nichts.

---

## Technischer Kontext

- **Runtime:** Tauri v2 (Rust-Backend + System-WebView)
- **Backend:** Rust (`src-tauri/src/`) — Commands (8 Module in `commands/`), PowerShell via `ps.rs`, Scan-Engine via `scan.rs`
- **Frontend:** React 19 + TypeScript + Vite 7 (unter `src/`, Build-Output in `dist/`)
- **IPC:** Tauri `invoke()` / `#[tauri::command]` — typisierte API: `src/api/tauri-api.ts` (155 Methoden)
- **Charts:** Chart.js v4 (npm: `react-chartjs-2` oder `useRef`-Pattern)
- **PDF:** pdfjs-dist (npm), html2pdf.js (lokal unter `src/public/lib/`)
- **Terminal:** @xterm/xterm (npm) — Backend-PTY über Tauri-Commands
- **Plattform:** Nur Windows (PowerShell-Befehle, Registry-Lesen, WMI-Abfragen)
- **Vorgänger:** 1) Electron v33 (vollständig migriert), 2) Vanilla JS Frontend (vollständig migriert zu React)

### Dateistruktur

```
src/                       # Frontend (React 19 + TypeScript + Vite 7)
  index.html               # Vite Entry-HTML
  main.tsx                 # React Entry Point
  App.tsx                  # App Shell (Toolbar + Sidebar + TabRouter + Terminal)
  App.css                  # CSS Import (style.css)
  api/
    tauri-api.ts           # ZENTRAL: 155 typisierte API-Funktionen → Tauri invoke()
  context/
    AppContext.tsx          # Globaler React-State (scanId, drives, theme, activeTab)
  hooks/
    useTauriEvent.ts       # Tauri Event-Listener mit auto-Cleanup
  components/
    Toolbar.tsx            # Obere Leiste (Logo, Drive-Auswahl, Scan, Export)
    Sidebar.tsx            # Linke Sidebar (6 Gruppen, toggle)
    StatusBar.tsx          # Untere Leiste (Scan-Fortschritt, Status)
    TabRouter.tsx          # Conditional Rendering der Views (Lazy Loading)
    Toast.tsx              # Benachrichtigungen
    ContextMenu.tsx        # Rechtsklick-Menü
  views/
    DashboardView.tsx      # Dashboard-Übersicht
    ExplorerView.tsx       # Datei-Explorer mit Omnibar, Dual-Panel, Tabs
    TreeView.tsx           # Verzeichnisbaum
    TreemapView.tsx        # Treemap-Visualisierung
    ChartsView.tsx         # Dateitypen-Diagramm
    TopFilesView.tsx       # Top-100-Dateien
    DuplicatesView.tsx     # Duplikat-Finder
    OldFilesView.tsx       # Alte Dateien
    CleanupView.tsx        # Bereinigung
    AutostartView.tsx      # Autostart-Manager
    ServicesView.tsx       # Dienste-Viewer
    OptimizerView.tsx      # System-Optimierung
    UpdatesView.tsx        # Update-Manager
    PrivacyView.tsx        # Privacy-Dashboard
    SmartView.tsx          # S.M.A.R.T. Festplatten
    SoftwareAuditView.tsx  # Software-Audit
    SecurityAuditView.tsx  # Sicherheits-Audit
    NetworkView.tsx        # Netzwerk-Monitor (TCP-Verbindungen)
    SystemProfilView.tsx   # System-Profil
    HealthCheckView.tsx    # PC-Diagnose
    SettingsView.tsx       # Einstellungen
    PdfEditorView.tsx      # PDF-Editor
    TerminalView.tsx       # Eingebettetes Terminal (xterm.js)
  utils/
    format.ts              # formatBytes, formatNumber, etc.
    file-icons.tsx         # SVG File-Icons als React-Komponenten
    categories.ts          # Kategorie-Maps und Farben
  public/
    css/style.css          # Alle Styles (Dark/Light Theme)
    lib/                   # Lokale Bibliotheken (html2pdf, mammoth, etc.)

src-tauri/                 # Rust-Backend (Tauri v2)
  src/
    main.rs                # Tauri-Einstieg
    lib.rs                 # App-Setup, Menüleiste, Plugin-Registrierung, Command-Registrierung
    commands/              # Tauri Commands (8 Module)
      mod.rs               # Shared Helpers, Re-Exports
      cmd_scan.rs          # Scan, Tree, Export, Duplikate, Suche
      cmd_files.rs         # Dateimanagement, Properties, Archiv, Explorer
      cmd_network.rs       # Netzwerk-Monitor, Verbindungen, Bandwidth
      cmd_privacy.rs       # Privacy Dashboard, Scheduled Tasks
      cmd_system.rs        # Cleanup, Updates, SMART, Software Audit, Score
      cmd_terminal.rs      # Terminal PTY (ConPTY via portable-pty)
      cmd_misc.rs          # Admin, Platform, Preferences, Session
    ps.rs                  # PowerShell-Ausführung (UTF-8 Prefix, CREATE_NO_WINDOW, async)
    scan.rs                # Scan-Daten im Speicher (FileEntry, ScanData, Abfrage-Funktionen)
    oui.rs                 # OUI-Datenbank (MAC-Hersteller-Zuordnung)
  tauri.conf.json          # App-Konfiguration, CSP, Window-Settings, Plugins
  capabilities/
    default.json           # Berechtigungen (welche APIs das Frontend nutzen darf)
  Cargo.toml               # Rust-Abhängigkeiten

tools/                     # Entwickler-Werkzeuge (nicht Teil der App)
  wcag/                    # WCAG-Prüftools (Puppeteer)

docs/                      # Dokumentation
  issues/                  # Issue-Tracking
  planung/                 # Projektplanung
  protokoll/               # Änderungsprotokolle
  lessons-learned/         # Fehler-Dokumentation
```

### IPC-Datenfluss (Tauri v2 + React)

```
React View (src/views/*.tsx)
  → import { methodName } from '../api/tauri-api'
  → tauri-api.ts: invoke<ReturnType>('method_name', {params})
  → Tauri IPC
  → src-tauri/src/commands/cmd_*.rs: #[tauri::command] fn method_name(...)
  → ps.rs (PowerShell) oder scan.rs (Daten) oder direkte Rust-Logik
  → Ergebnis zurück an React (typisiert)
```

---

## Analyse-Bereiche

Gehe jeden der folgenden Bereiche systematisch durch. Für jeden gefundenen Punkt:
- **Schweregrad:** Kritisch / Hoch / Mittel / Niedrig / Hinweis
- **Bereich:** Security / Performance / Stabilität / UX / Architektur / Wartbarkeit / Migration
- **Beschreibung:** Was ist das Problem?
- **Risiko:** Was kann im schlimmsten Fall passieren?
- **Empfehlung:** Wie sollte es gelöst werden?

---

### 1. Migrations-Altlasten (Electron → Tauri)

> **HÖCHSTE PRIORITÄT.** Die Migration von Electron auf Tauri v2 muss vollständig und sauber sein. Überreste der alten Architektur führen zu Verwirrung, falschen Annahmen und fehlerhaftem Code.

#### 1.1 Code-Altlasten (Electron + Vanilla JS)
- [ ] Gibt es noch Referenzen auf Electron-APIs im aktiven Code? (`require()`, `ipcRenderer`, `ipcMain`, `contextBridge`, `BrowserWindow`, `remote`)
- [ ] Gibt es noch `window.api.*`-Aufrufe (alter Vanilla-JS-Pattern statt typisierter Imports aus `tauri-api.ts`)?
- [ ] Gibt es noch `renderer/`-Pfad-Referenzen im aktiven Code?
- [ ] Gibt es noch `document.addEventListener` / `CustomEvent` / `dispatchEvent` für Inter-Komponenten-Kommunikation (sollte React Context/Props sein)?
- [ ] Gibt es noch `dangerouslySetInnerHTML` mit dynamischen Inhalten (sollte React-Komponenten sein)?
- [ ] Gibt es noch `innerHTML`-Verwendungen ausserhalb von imperativen Bibliotheks-Integrationen?
- [ ] Gibt es Kommentare die noch Electron-Konzepte oder Vanilla-JS-Patterns beschreiben?

#### 1.2 Dokumentations-Altlasten
- [ ] Referenziert die CLAUDE.md noch Electron-Konzepte? (preload.js, ipc-handlers.js, main.js, Worker Threads)
- [ ] Enthalten aktive Dokumentationsdateien (`docs/issues/`, `docs/planung/`) noch Electron-Architektur-Beschreibungen?
- [ ] Sind Skills (`.claude/skills/`) auf Tauri v2 aktualisiert?
- [ ] Enthält `docs/protokoll/aenderungsprotokoll.md` noch veraltete Electron-Einträge die archiviert werden sollten?

#### 1.3 Tool-Altlasten
- [ ] Referenzieren Entwickler-Tools (z.B. `tools/wcag/restore-window.ps1`) noch Electron-Prozessnamen?
- [ ] Gibt es Build-Scripts die noch Electron-Befehle verwenden?
- [ ] Gibt es `package.json`-Einträge die auf Electron-Pakete verweisen? (electron, @electron/rebuild, node-pty als npm-Dependency)

#### 1.4 Architektur-Inkonsistenzen nach Migration
- [ ] Gibt es Frontend-Code der noch Node.js-APIs erwartet die in Tauri nicht existieren?
- [ ] Gibt es Stub-Commands in `commands/cmd_*.rs` die noch nicht implementiert sind? (Suche nach `json!([])`, `json!(null)`, `"stub"`, `todo!()`)
- [ ] Stimmt die API-Surface in `src/api/tauri-api.ts` mit den tatsächlichen Commands in `commands/` überein?
- [ ] Sind alle in `lib.rs` registrierten Commands auch in `commands/` definiert (und umgekehrt)?
- [ ] Gibt es React-Views die noch Vanilla-JS-Patterns verwenden (z.B. `document.getElementById`, `element.style.*` statt `useState`/`useRef`)?

#### 1.5 Konfigurationsreste
- [ ] Gibt es noch eine `electron-builder.yml` oder ähnliche Electron-Build-Konfigurationen?
- [ ] Gibt es noch einen `main/`-Ordner mit altem Electron-Code?
- [ ] Gibt es noch `launch.js`, `scripts/rebuild-pty.js` oder andere Electron-Starter?
- [ ] Sind in `package.json` noch Electron-Abhängigkeiten aufgeführt?

#### 1.6 Strategische Entfernungen — Vollständigkeit prüfen
- [ ] **Netzwerk-Scanner:** Sind alle aktiven Scanner-Commands entfernt? (`scan_local_network`, `scan_network_active`, `scan_device_ports`, `get_smb_shares`)
- [ ] **Firewall-Verwaltung:** Sind alle Firewall-Commands entfernt? (`get_firewall_rules`, `block_process`, `unblock_process`)
- [ ] **OUI-Datenbank:** `oui.rs` existiert noch — wird sie noch benötigt oder ist sie eine Altlast?
- [ ] **Registry-Cleaner:** Sind alle Schreib-Commands entfernt? (`scan_registry`, `clean_registry`, `export_registry_backup`, `restore_registry_backup`)
- [ ] Gibt es Frontend-Views oder Sidebar-Tabs die auf entfernte Features verweisen?
- [ ] Gibt es API-Funktionen in `tauri-api.ts` für entfernte Commands?
- [ ] Gibt es CSS-Klassen für entfernte UI-Elemente?

---

### 2. Sicherheit (Security)

#### 2.1 Tauri-spezifische Sicherheit
- [ ] CSP (Content Security Policy) in `tauri.conf.json` korrekt und restriktiv konfiguriert?
- [ ] Sind `unsafe-inline` und `unsafe-eval` in der CSP notwendig oder können sie entfernt werden?
- [ ] `withGlobalTauri`: Steht auf `true` — werden Capabilities korrekt eingeschränkt?
- [ ] `capabilities/default.json`: Werden nur die minimal nötigen APIs freigegeben?
- [ ] Werden alle Tauri-Commands ihre Eingaben validieren bevor sie verarbeitet werden?
- [ ] Gibt es Commands die ohne Validierung Dateisystem-Operationen ausführen?
- [ ] Keine `eval()`, `new Function()` oder unsicheres `innerHTML` mit User-Input im Frontend?

#### 2.2 Command Injection (PowerShell)
- [ ] Werden ALLE String-Parameter mit `.replace("'", "''")` escaped bevor sie in `format!()` für PowerShell-Befehle eingesetzt werden?
- [ ] Gibt es `format!()` Aufrufe in `commands/cmd_*.rs` oder `ps.rs` mit unescaptem User-Input?
- [ ] IP-Adressen: Werden sie per Regex validiert bevor sie in PowerShell verwendet werden?
- [ ] Enum-Parameter (z.B. "Inbound"/"Outbound"): Werden sie per `match` auf Whitelist geprüft?
- [ ] Terminal-Modul: Kann über Terminal-Eingaben das Rust-Backend manipuliert werden?

#### 2.3 Path Traversal
- [ ] Werden Dateipfade vom Frontend validiert bevor sie an `tokio::fs`-Operationen übergeben werden?
- [ ] Werden Pfade auf `..`-Traversal geprüft?
- [ ] Werden symbolische Links korrekt behandelt?
- [ ] Werden destruktive Operationen (Löschen, Überschreiben) doppelt abgesichert (Backend + Frontend)?

#### 2.4 XSS-Prävention
- [ ] Wird `innerHTML` irgendwo mit unescapten Variablen verwendet?
- [ ] Gibt es eine zentrale `escapeHtml()` Funktion und wird sie konsequent genutzt?
- [ ] Werden Fehlermeldungen mit `textContent` statt `innerHTML` angezeigt?
- [ ] Können Dateinamen, Pfade oder Registry-Werte HTML/JS-Code injizieren?

#### 2.5 Persistenz & Datenintegrität
- [ ] Werden gespeicherte Scan-Daten (bincode/JSON) validiert beim Laden?
- [ ] Können manipulierte Dateien in `%APPDATA%` die App zum Absturz bringen oder Code ausführen?
- [ ] Werden Preferences/Einstellungen sicher gespeichert und validiert?

#### 2.6 AV-Kompatibilität (WICHTIG für dieses Projekt)
- [ ] Gibt es Code der von Antivirus-Software als verdächtig erkannt werden könnte?
- [ ] Netzwerk-Scanner, Firewall-Manipulation, Registry-Schreibvorgänge: Wurden sie entfernt? (strategische Entscheidung)
- [ ] PowerShell-Aufrufe: Werden sie so gestaltet dass AV-Software sie nicht als Angriff wertet?
- [ ] Werden Admin-Rechte nur angefordert wenn absolut nötig?

---

### 3. Performance

#### 3.1 Rust-Backend Performance
- [ ] Gibt es blockierende Operationen im Tauri Main Thread? (synchrone Dateizugriffe, CPU-intensive Berechnungen)
- [ ] Werden langlaufende Operationen in `tokio::task::spawn_blocking` ausgelagert?
- [ ] Werden grosse Datenmengen über IPC serialisiert? (Serde-Serialisierung kann bei grossen Strukturen langsam sein)
- [ ] Gibt es unnötige `.clone()` Aufrufe bei grossen Datenstrukturen?
- [ ] Werden PowerShell-Prozesse korrekt terminiert und nicht akkumuliert?

#### 3.2 Speicherverbrauch (Memory)
- [ ] Scan-Daten (`scan.rs`): Wie viel RAM verbrauchen sie bei grossen Laufwerken (>1 TB, Millionen Dateien)?
- [ ] Werden Scan-Daten jemals freigegeben wenn ein neuer Scan gestartet wird?
- [ ] Gibt es Memory Leaks im Frontend? (Event Listener, setInterval, DOM-Elemente)
- [ ] Werden Views korrekt aufgeräumt beim Tab-Wechsel? (destroy() Methoden)
- [ ] Werden `ResizeObserver`, `MutationObserver` in destroy() disconnected?

#### 3.3 Frontend Performance
- [ ] Gibt es DOM-Manipulationen in Schleifen (Layout Thrashing)?
- [ ] Werden grosse Listen (Dateien, Programme, Dienste) virtualisiert oder komplett ins DOM gerendert?
- [ ] CSS: Gibt es teure Selektoren (wildcards, deep nesting) bei 5000+ Zeilen CSS?
- [ ] Werden Event Listener korrekt delegiert?
- [ ] Gibt es Scroll/Resize-Handler ohne Throttling/Debouncing?
- [ ] `style.css` mit 5000+ Zeilen: Gibt es toten CSS-Code der nie verwendet wird?

#### 3.4 Scan-Performance
- [ ] Rust-Scanner (`scan.rs`): Wird `walkdir` effizient genutzt?
- [ ] Werden System-Verzeichnisse übersprungen die nicht gescannt werden können?
- [ ] Wird die CPU-Last begrenzt? (Lüfter-Problem bei Scans)
- [ ] Können mehrere Scans gleichzeitig laufen und sich gegenseitig blockieren?

---

### 4. Stabilität & Fehlerbehandlung

#### 4.1 Error Handling (Rust)
- [ ] Geben alle Commands sinnvolle Fehlermeldungen zurück? (nicht nur `"Error"` oder `unwrap()`)
- [ ] Wird `unwrap()` oder `expect()` in Commands verwendet? (→ Panic = App-Crash)
- [ ] Werden PowerShell-Fehler korrekt an das Frontend weitergeleitet?
- [ ] Gibt es `match`-Blöcke ohne `_`-Arm (fehlende Exhaustiveness)?

#### 4.2 Error Handling (Frontend)
- [ ] Gibt es unbehandelte Promise-Rejections?
- [ ] Sind alle `try/catch`-Blöcke sinnvoll (nicht nur leere catches)?
- [ ] Werden Fehler dem User verständlich angezeigt oder still verschluckt?
- [ ] Was passiert wenn ein invoke()-Aufruf fehlschlägt? Friert die UI ein?

#### 4.3 Edge Cases
- [ ] Was passiert bei fehlendem Laufwerk oder abgestecktem USB-Stick während des Scans?
- [ ] Was passiert bei sehr langen Pfaden (>260 Zeichen, Windows MAX_PATH)?
- [ ] Was passiert bei Zugriffsverweigerung (Access Denied) auf System-Ordner?
- [ ] Was passiert wenn die App während eines Scans geschlossen wird?
- [ ] Was passiert bei beschädigten oder manipulierten Scan-Daten?
- [ ] Was passiert bei gleichzeitiger Nutzung mehrerer Features (Scan + Duplikate + Terminal)?
- [ ] Was passiert wenn PowerShell nicht verfügbar oder blockiert ist?

#### 4.4 Race Conditions & Concurrency
- [ ] Können parallele Tauri-Commands zu inkonsistenten Zuständen in `scan.rs` führen? (Mutex/RwLock korrekt?)
- [ ] Werden File-Locks bei gleichzeitigem Lesen/Schreiben korrekt gehandhabt?
- [ ] Können zwei Frontend-Views gleichzeitig denselben Command aufrufen?
- [ ] `Mutex<ScanData>` in scan.rs: Gibt es Deadlock-Potenzial?

---

### 5. Architektur & Code-Qualität

#### 5.1 Rust-Backend Architektur
- [ ] Sind die 8 Command-Module (`commands/cmd_*.rs`) sinnvoll aufgeteilt?
- [ ] Gibt es Code-Duplikation zwischen Commands?
- [ ] Werden Typen sinnvoll definiert und wiederverwendet? (structs, enums)
- [ ] Ist die Fehlerbehandlung konsistent? (Result-Typen, Error-Mapping)
- [ ] Gibt es tote Commands die registriert aber nie aufgerufen werden?

#### 5.2 IPC-Design (tauri-api.ts)
- [ ] Stimmt die API-Surface in `src/api/tauri-api.ts` mit den Commands in `commands/` überein?
- [ ] Gibt es API-Funktionen ohne entsprechende Rust-Commands (oder umgekehrt)?
- [ ] Werden Parameter korrekt von camelCase (Frontend) zu snake_case (Rust) übersetzt?
- [ ] Werden Rückgabewerte konsistent typisiert? (TypeScript-Typen statt `any`)
- [ ] Gibt es unnötige IPC-Roundtrips die gebündelt werden könnten?

#### 5.3 Frontend-Architektur (React)
- [ ] Werden React-Hooks korrekt verwendet? (Dependencies in useEffect, useMemo, useCallback)
- [ ] Werden Views korrekt aufgeräumt? (useEffect Cleanup-Funktionen)
- [ ] Ist die State-Verwaltung sauber? (AppContext vs. lokaler State pro View)
- [ ] Gibt es Memory Leaks? (nicht-aufgeräumte Event Listener, Intervals, ResizeObserver)
- [ ] Gibt es duplizierte Logik zwischen Views die in Custom Hooks oder Utils zentralisiert werden sollte?
- [ ] Werden React.lazy() und Suspense korrekt für Code Splitting eingesetzt?

#### 5.4 Wartbarkeit
- [ ] Gibt es hartcodierte Werte die konfigurierbar sein sollten? (Timeouts, Pfade, Limits)
- [ ] Gibt es "Magic Numbers" ohne Erklärung?
- [ ] Gibt es ausreichend Error Context in Log-Meldungen? (tracing im Rust-Backend)
- [ ] Sind die Rust-Abhängigkeiten in `Cargo.toml` alle nötig und aktuell?
- [ ] Gibt es statische Listen die gegen das "Realitätsprinzip" verstossen? (feste Hersteller-Zuordnungen, feste Programm-Listen)

---

### 6. UX & Barrierefreiheit

#### 6.1 Responsiveness
- [ ] Friert die UI bei langlaufenden Operationen ein? (PowerShell-Aufrufe, Scans)
- [ ] Gibt es Ladeanzeigen/Fortschrittsbalken für alle langlaufenden Vorgänge?
- [ ] Werden Buttons während laufender Operationen deaktiviert?
- [ ] Gibt es visuelles Feedback bei jedem Klick?

#### 6.2 Fehler-Kommunikation
- [ ] Werden Fehler dem User verständlich kommuniziert? (keine Stack Traces, kein Rust-Jargon)
- [ ] Gibt es Hilfe-Texte oder Tooltips bei komplexen Funktionen?
- [ ] Werden Warnungen vor destruktiven Aktionen angezeigt?

#### 6.3 WCAG / Barrierefreiheit
- [ ] Erfüllen alle Farbkombinationen WCAG 2.2 AA Kontrast-Anforderungen (4.5:1)?
- [ ] Sind alle interaktiven Elemente per Tastatur erreichbar?
- [ ] Gibt es ARIA-Labels für Screen Reader?
- [ ] Sind Focus-Styles sichtbar?
- [ ] Funktioniert die App mit vergrösserter Schrift (200%)?

---

### 7. Windows-spezifische Probleme

#### 7.1 PowerShell-Aufrufe
- [ ] Wird `ps.rs` korrekt UTF-8 erzwungen? (`[Console]::OutputEncoding` Prefix)
- [ ] Gibt es Timeouts für alle PowerShell-Befehle?
- [ ] Wird `CREATE_NO_WINDOW` korrekt gesetzt? (keine blinkenden CMD-Fenster)
- [ ] Was passiert wenn PowerShell nicht verfügbar oder durch Richtlinien blockiert ist?
- [ ] Werden PowerShell-Versionsunterschiede berücksichtigt? (5.1 vs 7)
- [ ] Werden Execution Policy Einschränkungen gehandhabt?
- [ ] Werden PowerShell-Prozesse korrekt beendet oder akkumulieren sie sich?

#### 7.2 Registry-Operationen
- [ ] Registry-Cleaner wurde strategisch entfernt — ist der Code wirklich komplett weg?
- [ ] Registry-LESEN (für Privacy, Autostart, Software-Audit) funktioniert korrekt?
- [ ] Werden Registry-Datentypen korrekt behandelt? (REG_SZ, REG_DWORD, REG_BINARY)
- [ ] Was passiert bei unzureichenden Berechtigungen zum Lesen?

#### 7.3 System-Kompatibilität
- [ ] Funktioniert die App auf Windows 10 UND Windows 11?
- [ ] Funktioniert die App mit und ohne Admin-Rechte? (graceful degradation)
- [ ] Werden Windows-Defender / AV-Konflikte vermieden?
- [ ] WebView2: Ist es auf allen Ziel-Systemen vorhanden? Fallback?
- [ ] Long Paths: Wird `\\?\`-Prefix für Pfade >260 Zeichen verwendet?

---

### 8. Abhängigkeiten & Supply Chain

#### 8.1 Rust-Abhängigkeiten (Cargo.toml)
- [ ] Sind alle Crates aktuell und ohne bekannte Schwachstellen? (`cargo audit`)
- [ ] Werden nur nötige Features aktiviert? (z.B. `tauri = { features = ["tray-icon"] }`)
- [ ] Gibt es Crates die durch leichtere Alternativen ersetzt werden könnten?
- [ ] Release-Profil: Ist `lto = true`, `strip = true` optimal konfiguriert?

#### 8.2 npm-Abhängigkeiten (package.json)
- [ ] Sind nur Tauri-relevante Pakete in package.json? (kein Electron, kein node-pty)
- [ ] Werden `devDependencies` korrekt von `dependencies` getrennt?
- [ ] `@tauri-apps/api` und `@tauri-apps/cli`: Sind sie aktuell?

#### 8.3 Frontend-Abhängigkeiten
- [ ] Sind alle npm-Pakete aktuell? (react, @tauri-apps/api, @xterm/xterm, pdfjs-dist, vite)
- [ ] Gibt es lokale Libraries in `src/public/lib/` die durch npm-Pakete ersetzt werden könnten?
- [ ] Gibt es Libraries die nicht mehr verwendet werden und entfernt werden können?
- [ ] Wird Tree-Shaking von Vite korrekt genutzt? (keine unnötigen Imports)

---

### 9. Konsistenz & Querverweise (Cross-Reference)

> Dieser Bereich prüft ob die verschiedenen Schichten der App zueinander passen. Inkonsistenzen sind die häufigste Fehlerquelle nach einer Migration.

#### 9.1 Dreifach-Abgleich: API ↔ Commands ↔ Registrierung

Die API besteht aus drei Schichten die synchron sein MÜSSEN:

| Schicht | Datei | Was dort steht |
|---------|-------|----------------|
| **Frontend-API** | `src/api/tauri-api.ts` | `export const methodName = (...) => invoke<Type>('method_name', {...})` |
| **Rust-Commands** | `src-tauri/src/commands/cmd_*.rs` | `#[tauri::command] pub async fn method_name(...)` |
| **Registrierung** | `src-tauri/src/lib.rs` | `.invoke_handler(generate_handler![..., method_name, ...])` |

Prüfe:
- [ ] **Jede** API-Funktion in `tauri-api.ts` hat einen passenden Command in `commands/`
- [ ] **Jeder** Command in `commands/` ist in `lib.rs` registriert
- [ ] **Jede** Registrierung in `lib.rs` hat einen implementierten Command
- [ ] Gibt es "Geister-Einträge" in einer der drei Schichten die nirgendwo sonst existieren?
- [ ] Werden Parameter-Namen korrekt übersetzt? (camelCase ↔ snake_case)

#### 9.2 Stub-Erkennung (unvollständige Migration)

Suche gezielt nach diesen Mustern in `commands/cmd_*.rs`:
```
json!([])           → Leeres Array zurückgeben statt echter Daten
json!(null)         → Null zurückgeben statt Fehler
json!({})           → Leeres Objekt statt Implementierung
"stub"              → Expliziter Stub-Marker
"not implemented"   → Nicht implementiert
todo!()             → Rust-Platzhalter
unimplemented!()    → Rust-Platzhalter
Ok("".to_string())  → Leerer String statt Daten
```

Für jeden gefundenen Stub: Welche React-View ruft diesen Command auf und was sieht der User?

#### 9.3 Sidebar ↔ Views ↔ Commands

Prüfe die Kette: Sidebar-Button → TabRouter → React-View → tauri-api.ts → Backend-Command

- [ ] Hat jeder Sidebar-Tab in `Sidebar.tsx` einen passenden Eintrag in `TabRouter.tsx`?
- [ ] Gibt es React-Views die keinem Sidebar-Tab zugeordnet sind?
- [ ] Ruft jede React-View ihre Backend-Commands über `tauri-api.ts` auf (nicht direkt via `invoke`)?
- [ ] Existieren die aufgerufenen Commands tatsächlich im Backend?

#### 9.4 Anforderungen vs. Implementierung

Das Dokument `docs/issues/anforderungen.md` definiert ~150 Backend-Funktionen mit Status (MUSS/SOLL/KANN).

- [ ] Sind alle MUSS-Anforderungen tatsächlich implementiert (nicht nur als Stub)?
- [ ] Gibt es implementierte Funktionen die NICHT in den Anforderungen stehen? (Feature Creep oder vergessene Doku)
- [ ] Stimmen die Backend-Funktionsnamen in den Anforderungen mit den tatsächlichen Command-Namen überein?

#### 9.5 Lokalisierung & Textqualität

- [ ] Sind ALLE user-sichtbaren Texte auf Deutsch? (Buttons, Labels, Fehlermeldungen, Tooltips)
- [ ] Werden korrekte Umlaute verwendet? (ä/ö/ü, NICHT ae/oe/ue)
- [ ] Gibt es englische Texte die dem User angezeigt werden? (z.B. "Error", "Loading", "Success")
- [ ] Werden Rust-Fehlermeldungen unübersetzt ans Frontend durchgereicht?
- [ ] Sind Fehlermeldungen verständlich formuliert? (kein Fachjargon, keine Stack Traces)

---

### 10. Bekannte Muster & Anti-Patterns

> Dieses Projekt hat dokumentierte Lektionen aus vergangenen Fehlern (`docs/lessons-learned/lessons-learned.md`). Die Analyse soll prüfen ob diese Fehler erneut vorkommen.

#### 10.1 Realitätsprinzip (aus CLAUDE.md)

**Anti-Pattern:** Statische Listen für Erkennung/Klassifizierung. Diese funktionieren nur auf dem Entwickler-PC.

- [ ] Gibt es feste Hersteller→Gerätetyp Zuordnungen? (z.B. "Canon = Drucker")
- [ ] Gibt es feste Programmnamen→Kategorie Listen? (z.B. "Firefox = Browser")
- [ ] Gibt es feste Bloatware-Listen die leicht umgangen werden können?
- [ ] Gibt es feste Dateipfade für Bereinigung die nicht auf jedem System existieren?
- [ ] Gibt es feste Dateiendungen→Kategorie Zuordnungen denen neue Formate fehlen? (z.B. .heic, .avif, .webp)
- [ ] Gibt es sprachabhängige Erkennung die nur auf deutsch/englischem Windows funktioniert?

#### 10.2 Wiederkehrende Fehlermuster (aus Lessons Learned)

- [ ] **False Success:** Gibt es Commands die `Ok(success: true)` zurückgeben obwohl nichts passiert ist? (Lesson #42)
- [ ] **Fehlende Fehlerbehandlung:** Gibt es PowerShell-Aufrufe ohne try/catch? (Lesson #45)
- [ ] **Ignorierte Parameter:** Gibt es Funktionsparameter mit `_`-Prefix die eigentlich verwendet werden sollten? (Lesson #46)
- [ ] **Ok statt Err:** Gibt es Fehler die als `Ok` mit `null`/`None`-Wert zurückgegeben werden statt als `Err`? (Lesson #48)
- [ ] **Falsche Feldnamen:** Stimmen die Feldnamen zwischen Funktionen die Daten weitergeben überein? (Lesson #33)
- [ ] **Substring-Matching:** Gibt es `.contains()`-Prüfungen die zu breit matchen? (Lesson #24)
- [ ] **Bug-Drift:** Wurde bei Fixes geprüft ob die Änderung Seiteneffekte in anderen Funktionen hat? (Lesson #18)

#### 10.3 Memory-Leak-Muster (React)

- [ ] Haben alle `useEffect` mit Subscriptions eine Cleanup-Return-Funktion?
- [ ] Werden alle `setInterval` in useEffect-Cleanups mit `clearInterval` gestoppt?
- [ ] Werden Tauri Event-Listener (via `listen()`) in Cleanup-Funktionen entfernt (`unlisten()`)?
- [ ] Werden `ResizeObserver` in Cleanup-Funktionen mit `.disconnect()` beendet?
- [ ] Gibt es `document.addEventListener` ohne korrespondierendes `removeEventListener` in Cleanup?
- [ ] Werden Refs zu DOM-Elementen korrekt bereinigt bei Unmount?

---

### 11. Tauri Events (emit/listen)

> Die App nutzt ZWEI IPC-Mechanismen: `invoke()` für Request/Response UND `emit()`/`listen()` für asynchrone Events (Fortschritt, Abschluss, Fehler). Der Dreifach-Abgleich (§9.1) deckt nur `invoke()` ab — Events sind ein separater Kanal.

#### 11.1 Event-Konsistenz
- [ ] Welche Events werden im Rust-Backend emittiert? (`app_handle.emit(...)` oder `window.emit(...)`)
- [ ] Welche Events werden im Frontend gehört? (`useTauriEvent` Hook in Views oder `listen()` in `tauri-api.ts`)
- [ ] Gibt es Events die emittiert aber nie gehört werden? (toter Event-Code)
- [ ] Gibt es Listener für Events die nie emittiert werden? (warten auf nichts)
- [ ] Werden Event-Listener beim View-Wechsel korrekt entfernt? (`unlisten()`)

#### 11.2 Scan-Events (kritischer Pfad)

Der Scan-Fortschritt ist der wichtigste Event-basierte Datenfluss:

```
Rust (scan.rs/commands/cmd_scan.rs)
  → emit("scan-progress", {folders, files, size, currentPath})
  → emit("scan-complete", {scanId, stats})
  → emit("scan-error", {message})

React (App.tsx via useTauriEvent Hook)
  → useTauriEvent("scan-progress", handler)
  → useTauriEvent("scan-complete", handler)
  → useTauriEvent("scan-error", handler)
  → State-Updates via React Context (AppContext) an ProgressBar
```

- [ ] Werden alle drei Events (progress/complete/error) sowohl emittiert als auch gehört?
- [ ] Was passiert wenn ein Event verloren geht? (kein Retry, kein Timeout?)
- [ ] Werden Event-Daten korrekt serialisiert? (Serde ↔ JSON)
- [ ] Gibt es Duplikat-Events? (`duplicate-progress`, `duplicate-complete`)
- [ ] Werden alle Event-Listener in `destroy()` aufgeräumt?

---

### 12. Build, Packaging & Deployment

> Praktische Prüfung ob die App überhaupt korrekt gebaut und verteilt werden kann.

#### 12.1 Build-Prozess
- [ ] Kompiliert `cargo tauri build` ohne Fehler?
- [ ] Gibt es Compiler-Warnungen? (`warnings` in `cargo build`)
- [ ] Wie lange dauert ein Full Build? (Dev vs. Release)
- [ ] Wie gross ist die finale Binary? (MSI/NSIS-Installer)
- [ ] Ist die Binary-Grösse angemessen oder aufgebläht? (`opt-level = "s"` + `lto = true` + `strip = true`)

#### 12.2 Installer (MSI/NSIS)
- [ ] Funktioniert der NSIS-Installer auf einem frischen Windows? (WebView2 Bootstrapper?)
- [ ] Wird bei der Installation nach Admin-Rechten gefragt? Ist das nötig?
- [ ] Funktioniert ein Upgrade-Install korrekt? (neue Version über alte installieren)
- [ ] Werden bei der Deinstallation alle Dateien entfernt? (%APPDATA%-Daten, Registry-Einträge)
- [ ] Sind die Installer-Sprachen korrekt konfiguriert? (`"languages": ["German"]`)

#### 12.3 WebView2 Runtime
- [ ] Wird WebView2 im Installer mitgeliefert oder zur Laufzeit heruntergeladen?
- [ ] Was passiert wenn WebView2 nicht installiert ist und kein Internet vorhanden ist?
- [ ] Welche WebView2-Version wird minimal benötigt? (Polyfill für `Uint8Array.toHex` in `index.html` deutet auf ältere Versionen hin)

---

### 13. Daten-Upgrade-Pfad (Electron → Tauri)

> Wenn ein bestehender User von der alten Electron-Version auf die neue Tauri-Version wechselt: Funktioniert das reibungslos?

#### 13.1 Gespeicherte Daten
- [ ] Wo speichert die Electron-Version Daten? (`%APPDATA%/speicher-analyse/`)
- [ ] Wo speichert die Tauri-Version Daten? (Tauri `app_data_dir()`)
- [ ] Sind die Pfade identisch oder verschieden?
- [ ] Kann die Tauri-Version die alten Scan-Daten lesen? (Format-Kompatibilität: JSON vs. bincode)
- [ ] Werden alte Preferences/Einstellungen übernommen?
- [ ] Werden alte File-Tags (Farb-Labels) übernommen?

#### 13.2 Konfliktfreier Übergang
- [ ] Können alte und neue Version gleichzeitig installiert sein? (Konflikt bei %APPDATA%?)
- [ ] Gibt es eine Daten-Migration beim ersten Start der neuen Version?
- [ ] Werden veraltete Datendateien der alten Version aufgeräumt?
- [ ] Wird der User informiert wenn alte Daten gefunden werden? ("Wir haben deine vorherigen Scan-Ergebnisse importiert")

---

### 14. Toter Code (Dead Code)

> Nach einer Migration + strategischen Entfernungen bleibt oft Code zurück der nie ausgeführt wird. Toter Code ist ein Wartungs- und Sicherheitsrisiko.

#### 14.1 CSS Dead Code
- [ ] Gibt es CSS-Klassen in `style.css` die in keiner HTML- oder JS-Datei referenziert werden?
- [ ] Gibt es CSS-Regeln für entfernte Features? (Netzwerk-Scanner, Registry-Cleaner)
- [ ] Gibt es Media Queries oder Theme-Varianten die nie aktiv werden?

#### 14.2 JavaScript Dead Code
- [ ] Gibt es Funktionen in Views die nie aufgerufen werden?
- [ ] Gibt es importierte Module/Dateien die nicht verwendet werden?
- [ ] Gibt es Event Listener für Events die nie ausgelöst werden?
- [ ] Gibt es Branches in if/else die nie erreicht werden können?

#### 14.3 Rust Dead Code
- [ ] Gibt es `#[allow(dead_code)]` Attribute die toten Code verstecken?
- [ ] Gibt es Hilfsfunktionen in `commands.rs`/`ps.rs`/`scan.rs` die nie aufgerufen werden?
- [ ] Gibt es `use`-Imports die nicht verwendet werden?
- [ ] Meldet `cargo build` Warnungen über ungenutzten Code?

#### 14.4 Dokumentation Dead Code
- [ ] Gibt es Dokumentationsdateien die auf nichts mehr verweisen? (z.B. `netzwerk-erkennung.md` nach Entfernung des Scanners)
- [ ] Gibt es interne Links in Docs die auf gelöschte Dateien/Abschnitte zeigen?

---

## Konkrete Verifikationsschritte

> Diese Schritte kann der Analyst direkt ausführen um schnell ein Bild der Lage zu bekommen.

### Schritt 1: Altlasten finden (Electron + Vanilla JS)
```bash
# Electron-Referenzen im eigenen Code (NICHT in node_modules/ oder Drittanbieter-Libs)
grep -ri "electron" src/ src-tauri/ tools/ docs/ --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.md" --include="*.ps1" --include="*.css" --exclude-dir="node_modules"

# Alte Vanilla-JS-Patterns im React-Code
grep -rn "window\.api\.\|renderer/" src/ --include="*.ts" --include="*.tsx"

# Alte DOM-Manipulation statt React
grep -rn "document\.getElementById\|document\.querySelector\|\.innerHTML" src/ --include="*.ts" --include="*.tsx"

# Alte Event-Patterns statt React
grep -rn "dispatchEvent\|CustomEvent\|document\.addEventListener" src/ --include="*.ts" --include="*.tsx"
```

### Schritt 2: Stubs finden
```bash
# Rust-Stubs (in allen Command-Modulen)
grep -rn "json!\(\[\]\)\|json!(null)\|json!({})\|todo!()\|unimplemented!()\|\"stub\"\|\"not implemented\"" src-tauri/src/commands/

# Leere Rückgaben
grep -rn 'Ok("".to_string())\|Ok(String::new())' src-tauri/src/commands/
```

### Schritt 3: Dreifach-Abgleich
```bash
# Alle Commands in commands/ auflisten
grep -rc "#\[tauri::command\]" src-tauri/src/commands/

# Alle registrierten Commands in lib.rs auflisten
grep "generate_handler" src-tauri/src/lib.rs

# Alle API-Funktionen in tauri-api.ts zählen
grep -c "invoke" src/api/tauri-api.ts
```

### Schritt 4: Strategische Entfernungen prüfen
```bash
# Netzwerk-Scanner Reste
grep -rn "scan_local_network\|scan_network_active\|scan_device_ports\|get_smb_shares\|block_process\|unblock_process\|get_firewall" src-tauri/src/ src/ --include="*.rs" --include="*.ts" --include="*.tsx"

# Registry-Cleaner Reste
grep -rn "clean_registry\|scan_registry\|export_registry_backup\|restore_registry_backup" src-tauri/src/ src/ --include="*.rs" --include="*.ts" --include="*.tsx"
```

### Schritt 5: Bekannte Anti-Patterns
```bash
# unwrap() in Commands (Crash-Risiko)
grep -rn "\.unwrap()" src-tauri/src/commands/

# innerHTML/dangerouslySetInnerHTML mit dynamischen Inhalten (XSS-Risiko)
grep -rn "dangerouslySetInnerHTML\|\.innerHTML" src/ --include="*.ts" --include="*.tsx"

# format!() mit User-Input ohne Escaping (Injection-Risiko)
grep -rn "format!(" src-tauri/src/commands/ | head -50

# Leere catch-Blöcke (verschluckte Fehler)
grep -rn "catch.*{}" src/ --include="*.ts" --include="*.tsx"
```

### Schritt 6: Event-Konsistenz
```bash
# Events die im Rust-Backend emittiert werden
grep -rn "\.emit(" src-tauri/src/ --include="*.rs"

# Events die im Frontend gehört werden (via useTauriEvent Hook)
grep -rn "useTauriEvent\|listen(" src/ --include="*.ts" --include="*.tsx"

# useEffect Cleanup-Funktionen (Rückgabe einer Funktion)
grep -rn "return.*unlisten\|return.*=>" src/ --include="*.ts" --include="*.tsx"
```

### Schritt 7: Build-Check
```bash
# TypeScript-Kompilierung
npx tsc --noEmit

# Vite Build
npm run build

# Rust-Kompilierung
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "warning|error"

# Binary-Grösse (Release)
ls -lh src-tauri/target/release/*.exe 2>/dev/null
```

### Schritt 8: React-spezifische Checks
```bash
# Views ohne useEffect Cleanup (potentieller Memory Leak)
grep -rL "return.*=>" src/views/*.tsx | head -20

# setInterval ohne clearInterval in useEffect
grep -l "setInterval" src/views/*.tsx | while read f; do
  if ! grep -q "clearInterval" "$f"; then
    echo "setInterval OHNE clearInterval: $f"
  fi
done

# Fehlende Dependencies in useEffect (häufiger React-Bug)
grep -n "useEffect.*\[\]" src/views/*.tsx
```

---

## Referenz-Dokumente

> Diese Dokumente im Projekt liefern zusätzlichen Kontext für die Analyse.

| Dokument | Pfad | Relevanz |
|----------|------|----------|
| **Anforderungen** | `docs/issues/anforderungen.md` | Vollständige API-Referenz (~150 Methoden) — Soll vs. Ist |
| **Lessons Learned** | `docs/lessons-learned/lessons-learned.md` | Dokumentierte Fehler — nicht wiederholen |
| **Governance** | `docs/planung/governance.md` | Code-Qualitätsregeln (WCAG, Security, Performance) |
| **Migrations-Checkliste** | `docs/planung/migrations-checkliste.md` | Status der Electron→Tauri Migration |
| **Meta-Analyse** | `docs/issues/archiv/issue_meta_analyse.md` | Electron→Tauri Migrations-Analyse (archiviert) |
| **Tiefenanalyse** | `docs/issues/archiv/issue_tiefenanalyse.md` | Vanilla-JS-Ära Tiefenanalyse (25 Issues, alle gelöst, archiviert) |
| **Code-Audit** | `docs/issues/archiv/issue_code_audit.md` | Früherer Audit (archiviert) |
| **Strategische Entscheidungen** | `docs/issues/issue.md` (Abschnitt) | Netzwerk-Scanner + Registry-Cleaner Entfernung |
| **Simons Ideen** | `docs/issues/issue.md` (Abschnitt "Ideen Salat") | Geplante Features: Explorer-Kontextmenü, Datei-Icons, Terminal als Admin, etc. |

---

## Ausgabe-Anweisungen

### 1. Issue-Datei erstellen

Erstelle eine neue Datei `docs/issues/issue_tiefenanalyse.md` mit ALLEN gefundenen Problemen. Format:

```markdown
# Tiefenanalyse-Ergebnisse — Speicher Analyse v7.2.1

**Datum:** [DATUM]
**Analysiert von:** Claude (Tiefenanalyse-Prompt v2.2)
**Analysierte Bereiche:** 14 (Migration, Security, Performance, Stabilität, Architektur, UX, Windows, Dependencies, Konsistenz, Anti-Patterns, Events, Build, Upgrade-Pfad, Dead Code)

---

## Zusammenfassung

- X kritische Probleme (sofort beheben)
- X hohe Probleme (zeitnah beheben)
- X mittlere Probleme (einplanen)
- X niedrige Probleme / Hinweise
- X Optimierungsmöglichkeiten

---

## Kritische Probleme

### [K1] Titel
- **Bereich:** Migration / Security / Performance / ...
- **Datei(en):** `src-tauri/src/commands/cmd_scan.rs:123` oder `src/views/ExplorerView.tsx:45`
- **Problem:** Konkrete Beschreibung
- **Risiko:** Was im schlimmsten Fall passieren kann
- **Empfehlung:** Konkreter Lösungsvorschlag
- **Aufwand:** Klein / Mittel / Gross

---

## Hohe Probleme
### [H1] Titel
...

## Mittlere Probleme
### [M1] Titel
...

## Niedrige Probleme & Hinweise
### [N1] Titel
...

## Optimierungsmöglichkeiten
### [O1] Titel
- **Bereich:** ...
- **Aktuell:** Was der Code heute macht
- **Vorschlag:** Was besser wäre
- **Erwarteter Effekt:** Performance / Wartbarkeit / UX Verbesserung

---

## Positive Aspekte (was gut gelöst ist)
- ...
```

### 2. Hauptissue-Datei referenzieren

Füge in `docs/issues/issue.md` unter "Offene Issues" einen Verweis auf die Tiefenanalyse-Ergebnisse hinzu, mit Verweis auf die neue Datei.

---

## Besondere Hinweise

1. **Keine Theorie — nur Praxis.** Jeder Punkt muss mit einer konkreten Datei und Zeile belegt werden. "Könnte ein Problem sein" reicht nicht — zeige wo und warum.

2. **Kein False Positive.** Melde nur Probleme die tatsächlich im Code existieren, nicht hypothetische Szenarien die durch die Architektur bereits verhindert werden.

3. **Priorität nach Auswirkung.** Ein Security-Problem das die App crasht ist wichtiger als ein Kommentar der noch "Electron" sagt.

4. **Kontext beachten.** Die App läuft nur lokal auf Windows. Netzwerk-Angriffe von aussen sind weniger relevant als lokale Privilege Escalation oder Datenverlust.

5. **Migrations-Altlasten ernst nehmen.** Jede Electron-Referenz in aktivem Code oder aktiver Dokumentation ist ein Problem — weil sie KI-Assistenten und Entwickler in die Irre führt und zu falschem Code führt (wie es gerade mit diesem Prompt selbst passiert ist).

6. **Drittanbieter-Bibliotheken ignorieren.** Wenn Monaco Editor intern nach `isElectronRenderer` sucht, ist das kein Problem — das ist Standard-Laufzeiterkennung. Nur eigener Code und eigene Dokumentation zählen.

7. **Positive Aspekte erwähnen.** Wenn etwas besonders gut gelöst ist, erwähne es. Das hilft zu verstehen was beibehalten werden soll.

8. **Strategische Entscheidungen beachten.** Netzwerk-Scanner und Registry-Cleaner wurden bewusst entfernt (AV-Risiko). Code-Reste dieser Features sind Altlasten.

9. **Lessons Learned konsultieren.** Das Projekt hat eine Datei mit dokumentierten Fehlern (`docs/lessons-learned/lessons-learned.md`). Prüfe ob dieselben Fehler erneut vorkommen — das wäre besonders peinlich.

10. **Anforderungen als Referenz.** `docs/issues/anforderungen.md` definiert was die App können MUSS. Jede MUSS-Anforderung die nur als Stub implementiert ist, ist ein kritisches Problem.

11. **Dreifach-Abgleich ist Pflicht.** Die häufigste Fehlerquelle nach einer Migration ist eine Inkonsistenz zwischen Bridge, Commands und Registrierung. Dieser Abgleich muss lückenlos sein.

---

## Erweiterungen (wird laufend ergänzt)

> Hier werden neue Analyse-Bereiche hinzugefügt, sobald neue Features oder Erkenntnisse dazukommen.

### Zukünftige Analyse-Bereiche
- [ ] Tauri Auto-Update Sicherheit (wenn implementiert)
- [ ] Offline-Lizenzierung Kryptografie (wenn implementiert)
- [ ] Multi-Monitor / HiDPI Verhalten
- [ ] WebView2 Kompatibilität über Windows-Versionen
- [ ] Tauri v2 Plugin-Sicherheit (shell, dialog, clipboard, global-shortcut)
- [ ] Fernwartungs-Sicherheit (Stufe 4, wenn implementiert)
- [ ] GPO-Scanner Sicherheit (wenn implementiert)

---

*Letzte Aktualisierung: 19.02.2026 — v3.0 (aktualisiert für React 19 + Vite 7 + TypeScript Frontend)*

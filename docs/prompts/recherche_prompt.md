# Tiefenanalyse & Recherche-Prompt — Speicher Analyse

> **Zweck:** Dieser Prompt wird verwendet um das gesamte Projekt systematisch auf Probleme, Schwachstellen und Optimierungsmöglichkeiten zu durchleuchten.
> **Anwendung:** Kopiere diesen Prompt in eine neue Claude-Sitzung (oder verwende ihn als Kontext) zusammen mit dem Quellcode.
> **Version:** 2.0 — komplett überarbeitet für Tauri v2 (Migration von Electron abgeschlossen)

---

## Auftrag

Du bist ein erfahrener Software-Architekt und Security-Auditor. Führe eine vollständige Tiefenanalyse der **Tauri v2 Desktop-App** "Speicher Analyse" durch. Die App ist ein Windows-Desktop-Tool zur Festplattenanalyse und Systemoptimierung (vergleichbar mit TreeSize + CCleaner in einer App).

**WICHTIG:** Die App wurde kürzlich von **Electron (Node.js)** auf **Tauri v2 (Rust)** migriert. Ein zentraler Analyse-Schwerpunkt ist die Frage: **Ist die Migration vollständig und sauber abgeschlossen?** Electron-Altlasten in Code, Dokumentation, Tools und Kommentaren müssen identifiziert werden.

**Dein Ziel:** Finde ALLE potenziellen Probleme, Risiken und Verbesserungsmöglichkeiten — von kritischen Sicherheitslücken über Migrations-Altlasten bis hin zu subtilen Performance-Problemen. Sei gründlich, sei ehrlich, beschönige nichts.

---

## Technischer Kontext

- **Runtime:** Tauri v2 (Rust-Backend + System-WebView)
- **Backend:** Rust (`src-tauri/src/`) — Commands, PowerShell-Aufrufe via `ps.rs`, Scan-Engine via `scan.rs`
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, kein Framework, kein Build-Step, unter `renderer/`)
- **IPC:** Tauri `invoke()` / `#[tauri::command]` — Bridge: `renderer/js/tauri-bridge.js`
- **Charts:** Chart.js v4 (lokal unter `renderer/lib/`)
- **PDF:** html2pdf.js (lokal unter `renderer/lib/`)
- **Terminal:** xterm.js (Frontend) — Backend-PTY über Tauri-Commands
- **Plattform:** Nur Windows (PowerShell-Befehle, Registry-Lesen, WMI-Abfragen)
- **Vorgänger:** Electron v33 mit Node.js Backend (vollständig migriert, `main/`-Verzeichnis gelöscht)

### Dateistruktur

```
src-tauri/                # Rust-Backend (Tauri v2)
  src/
    main.rs              # Tauri-Einstieg
    lib.rs               # App-Setup, Menüleiste, Plugin-Registrierung, Command-Registrierung
    commands.rs          # ALLE #[tauri::command] Handler (zentraler Hub)
    ps.rs                # PowerShell-Ausführung (UTF-8 Prefix, CREATE_NO_WINDOW, async)
    scan.rs              # Scan-Daten im Speicher (FileEntry, ScanData, Abfrage-Funktionen)
    oui.rs               # OUI-Datenbank (MAC-Hersteller-Zuordnung)
  tauri.conf.json        # App-Konfiguration, CSP, Window-Settings, Plugins
  capabilities/
    default.json         # Berechtigungen (welche APIs das Frontend nutzen darf)
  Cargo.toml             # Rust-Abhängigkeiten

renderer/                # Frontend (Vanilla JS, ~35 Module)
  index.html             # Haupt-HTML (Single Page App)
  css/style.css          # Alle Styles (Dark/Light Theme, ~5000+ Zeilen)
  js/
    tauri-bridge.js      # ZENTRAL: Mappt window.api.* auf Tauri invoke() (~150 Methoden)
    app.js               # Haupt-Controller (View-Switching, Init)
    explorer.js           # Datei-Explorer mit Omnibar-Suche
    explorer-tabs.js      # Tab-Browsing für Explorer
    explorer-dual-panel.js # Dual-Panel (Commander-Stil)
    dashboard.js          # Dashboard-Übersicht
    scanner.js            # Scan-Steuerung (Frontend)
    tree.js               # Verzeichnisbaum
    treemap.js            # Treemap-Visualisierung
    charts.js             # Dateitypen-Diagramm
    duplicates.js         # Duplikat-Finder UI
    old-files.js          # Alte Dateien UI
    cleanup.js            # Bereinigung UI
    autostart.js          # Autostart-Manager UI
    services.js           # Dienste-Viewer UI
    bloatware.js          # Bloatware-Scanner UI
    optimizer.js          # System-Optimierung UI
    updates.js            # Update-Manager UI
    privacy.js            # Privacy-Dashboard UI
    smart.js              # S.M.A.R.T. UI
    software-audit.js     # Software-Audit UI
    network.js            # Netzwerk-Monitor UI (nur TCP-Verbindungen, kein Scanner)
    security-audit.js     # Sicherheits-Audit UI
    system-profil.js      # System-Profil UI
    system-score.js       # System-Score UI
    terminal-panel.js     # Eingebettetes Terminal UI
    preview.js            # Dateivorschau (Monaco Editor, PDF, Bilder)
    file-manager.js       # Dateioperationen (Cut/Copy/Paste/Delete)
    search.js             # Dateisuche
    export.js             # Export (CSV/PDF)
    report-gen.js         # PDF-Bericht-Generator
    batch-rename.js       # Batch-Umbenennung
    settings.js           # Einstellungen
    utils.js              # Hilfsfunktionen (escapeHtml, formatSize, etc.)
  lib/                    # Lokale Bibliotheken (KEIN CDN)
    chart.min.js
    html2pdf.bundle.min.js
    monaco/               # Monaco Editor
    pdfjs/                # PDF.js
    mammoth/              # Word-Dokument-Vorschau
    xterm/                # Terminal-Emulation

tools/                    # Entwickler-Werkzeuge (nicht Teil der App)
  wcag/                   # WCAG-Prüftools (Puppeteer)
  build-oui-database.js   # OUI-Datenbank-Generator (Node.js Script)

docs/                     # Dokumentation
  issues/                 # Issue-Tracking
  planung/                # Projektplanung
  protokoll/              # Änderungsprotokolle
  lessons-learned/        # Fehler-Dokumentation
```

### IPC-Datenfluss (Tauri v2)

```
Frontend (renderer/js/*.js)
  → window.api.methodName(params)
  → tauri-bridge.js übersetzt: invoke('method_name', {params})
  → Tauri IPC
  → src-tauri/src/commands.rs: #[tauri::command] fn method_name(...)
  → ps.rs (PowerShell) oder scan.rs (Daten) oder direkte Rust-Logik
  → Ergebnis zurück an Frontend
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

#### 1.1 Code-Altlasten
- [ ] Gibt es noch Referenzen auf Electron-APIs im aktiven Code? (`require()`, `ipcRenderer`, `ipcMain`, `contextBridge`, `BrowserWindow`, `remote`, `shell.openExternal` von Electron)
- [ ] Gibt es Kommentare die noch Electron-Konzepte beschreiben? (z.B. "node-pty", "Main Process", "Preload")
- [ ] Gibt es Code-Pfade die `require()` im CommonJS-Stil verwenden (ausser in Drittanbieter-Bibliotheken)?
- [ ] Gibt es noch `process.env`, `process.platform` oder andere Node.js-Globals im Frontend?
- [ ] Werden Electron-spezifische Events noch referenziert? (`ready`, `window-all-closed`, `activate`)

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
- [ ] Sind alle IPC-Aufrufe korrekt von `ipcRenderer.invoke()` auf `tauri.invoke()` (via Bridge) migriert?
- [ ] Gibt es Stub-Commands in `commands.rs` die noch nicht implementiert sind? (Suche nach `json!([])`, `json!(null)`, `"stub"`, `todo!()`)
- [ ] Stimmt die API-Surface in `tauri-bridge.js` mit den tatsächlichen Commands in `commands.rs` überein?
- [ ] Sind alle in `lib.rs` registrierten Commands auch in `commands.rs` definiert (und umgekehrt)?

#### 1.5 Konfigurationsreste
- [ ] Gibt es noch eine `electron-builder.yml` oder ähnliche Electron-Build-Konfigurationen?
- [ ] Gibt es noch einen `main/`-Ordner mit altem Electron-Code?
- [ ] Gibt es noch `launch.js`, `scripts/rebuild-pty.js` oder andere Electron-Starter?
- [ ] Sind in `package.json` noch Electron-Abhängigkeiten aufgeführt?

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
- [ ] Gibt es `format!()` Aufrufe in `commands.rs` oder `ps.rs` mit unescaptem User-Input?
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
- [ ] Ist `commands.rs` zu monolithisch? (alle Commands in einer Datei)
- [ ] Gibt es Code-Duplikation zwischen Commands?
- [ ] Werden Typen sinnvoll definiert und wiederverwendet? (structs, enums)
- [ ] Ist die Fehlerbehandlung konsistent? (Result-Typen, Error-Mapping)
- [ ] Gibt es tote Commands die registriert aber nie aufgerufen werden?

#### 5.2 IPC-Design (tauri-bridge.js)
- [ ] Stimmt die API-Surface in `tauri-bridge.js` mit `commands.rs` überein?
- [ ] Gibt es Bridge-Einträge ohne entsprechende Rust-Commands (oder umgekehrt)?
- [ ] Werden Parameter korrekt von camelCase (Frontend) zu snake_case (Rust) übersetzt?
- [ ] Werden Rückgabewerte konsistent strukturiert? (manche JSON, manche Strings, manche Arrays)
- [ ] Gibt es unnötige IPC-Roundtrips die gebündelt werden könnten?

#### 5.3 Frontend-Architektur
- [ ] Ist `app.js` zu monolithisch?
- [ ] Gibt es globale Variablen die Konflikte verursachen könnten?
- [ ] Werden Views korrekt aufgeräumt beim Tab-Wechsel? (destroy() Aufruf)
- [ ] Ist die Event-Kommunikation zwischen Views sauber gelöst?
- [ ] Gibt es Memory Leaks bei DOM-Elementen die erstellt aber nie entfernt werden?
- [ ] Gibt es duplizierte Logik zwischen Views die in `utils.js` zentralisiert werden sollte?

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

#### 8.3 Lokale Bibliotheken (renderer/lib/)
- [ ] Sind alle lokalen Libraries aktuell? (Chart.js, html2pdf, Monaco, PDF.js, xterm.js, mammoth)
- [ ] Gibt es Libraries die nicht mehr verwendet werden und entfernt werden können?
- [ ] Werden Libraries lokal gebündelt (keine CDN-Abhängigkeit)? ✓ Bereits so

---

## Ausgabe-Anweisungen

### 1. Issue-Datei erstellen

Erstelle eine neue Datei `docs/issues/issue_tiefenanalyse.md` mit ALLEN gefundenen Problemen. Format:

```markdown
# Tiefenanalyse-Ergebnisse — Speicher Analyse v7.2.1

**Datum:** [DATUM]
**Analysiert von:** Claude (Tiefenanalyse-Prompt v2.0)
**Analysierte Bereiche:** 8 (Migration, Security, Performance, Stabilität, Architektur, UX, Windows, Dependencies)

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
- **Datei(en):** `src-tauri/src/commands.rs:123` oder `renderer/js/xyz.js:45`
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

*Letzte Aktualisierung: 19.02.2026 — v2.0 (komplett überarbeitet für Tauri v2)*

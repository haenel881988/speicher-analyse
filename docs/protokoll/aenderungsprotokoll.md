# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `archiv/` verschieben (Dateiname: `aenderungsprotokoll_<version>.md`).

Archiv: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (30 Einträge, v7.0–v7.2)

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 1 | 2026-02-10 | v7.3 | feature | **Terminal: node-pty + xterm.js** - Pipe-basiertes Terminal komplett durch echtes PTY ersetzt. node-pty (ConPTY, v1.2.0-beta.11) als Backend, @xterm/xterm v6.0.0 als Frontend. Alle Befehle (claude, ssh, vim, python) laufen nativ. FitAddon für automatische Größenanpassung. ResizeObserver + onResize für PTY-Sync. |
| 2 | 2026-02-10 | v7.3 | feature | **Terminal: CWD-Sync mit Explorer** - Terminal navigiert automatisch zum aktuellen Explorer-Verzeichnis. CustomEvent 'explorer-navigate' in navigateTo(). Listener in app.js ruft changeCwd() auf. |
| 3 | 2026-02-10 | v7.3 | fix | **node-pty Build: Spectre-Mitigation** - electron-rebuild schlug fehl wegen `MSB8040: Bibliotheken mit Spectre-Entschärfungen`. Automatischer Patch in `scripts/rebuild-pty.js` entfernt 'SpectreMitigation' aus binding.gyp vor dem Rebuild. |
| 4 | 2026-02-10 | v7.4 | feature | **Session-Persistenz** - Scan-Daten werden automatisch beim Schließen der App und nach jedem Scan gespeichert (gzip-komprimiert, ~3-5MB). Beim nächsten Start werden die Daten wiederhergestellt. Basiert auf dem bewährten admin.js-Pattern (Map→Entries Serialisierung). Neue Dateien: `main/session.js`, `main/preferences.js`. |
| 5 | 2026-02-10 | v7.4 | feature | **Zentraler Einstellungsspeicher (PreferencesStore)** - Alle Einstellungen in `%APPDATA%/speicher-analyse/preferences.json`. Debounced Save (1s), flush() bei App-Quit. 15 konfigurierbare Einstellungen: Session, Energie, Allgemein, Terminal. Hotkey wird persistent gespeichert und beim Start geladen. |
| 6 | 2026-02-10 | v7.4 | feature | **Energieverwaltung** - 3 Modi: Automatisch, Leistung, Energiesparen. Einstellbarer Akku-Schwellwert (10-80%). Option: Hintergrund-Tasks auf Akku deaktivieren. Battery-Polling-Intervall passt sich automatisch an (30s/60s/120s je nach Modus). |
| 7 | 2026-02-10 | v7.4 | feature | **Einstellungen-Seite komplett überarbeitet** - Von 5 auf 7 Sektionen erweitert: Session & Wiederherstellung, Energieverwaltung, Allgemein, Globaler Hotkey, Terminal, Windows Integration, Über. Neue UI-Elemente: iOS-style Toggle-Switches, Range-Slider, Theme-Switch, Styled Selects. |
| 8 | 2026-02-10 | v7.4 | improve | **Theme-Integration** - Theme-Wechsel aus Einstellungen-Seite, bidirektionale Synchronisation mit Toolbar-Button. localStorage → Preferences Migration (einmalig). Theme wird persistent gespeichert. |
| 9 | 2026-02-10 | v7.5 | feature | **Explorer-Ordnergrößen aus Scan-Daten** - Nach einem Scan zeigt der Explorer Ordnergrößen (rekursiv) in der GRÖSSE-Spalte an. Proportionsbalken visualisieren den Anteil am Elternordner. Neuer Bulk-IPC-Handler `get-folder-sizes-bulk` mit O(1) Map-Lookup pro Pfad. Farbcodierung auch für Ordner (>10MB gelb, >100MB orange, >1GB rot). Status-Bar zeigt Gesamtgröße + "Scan"-Hinweis. Graceful Degradation: ohne Scan bleiben Ordner leer. |
| 10 | 2026-02-10 | v7.5 | fix | **Session UI-State-Persistenz** - Main Process hatte keinen Zugriff auf Renderer-State (activeTab, activePath). Neuer IPC-Handler `update-ui-state` empfängt den State vom Renderer. `pushUiState()` wird bei Tab-Wechsel und nach Scan-Abschluss aufgerufen. Auto-Save nach Scan und Before-Quit nutzen jetzt `lastKnownUiState` statt leeres `{}`. |
| 11 | 2026-02-10 | v7.5 | fix | **Explorer-Refresh nach Session-Restore** - Race Condition: ExplorerView.init() navigierte VOR Session-Restore → Ordnergrößen waren nicht sichtbar. Fix: Explorer wird nach Session-Restore, Smart Reload (F5) und Scan-Abschluss automatisch refreshed. |
| 12 | 2026-02-10 | v7.5 | fix | **PDF-Viewer: file:// Module Worker Bug** - Chromium blockiert Module Workers (.mjs) von file:// URLs. Fix: Worker-Script wird per fetch() geladen, ESM-Export entfernt, und als Classic Worker via Blob-URL gestartet. Zusätzlich: readFileBinary Buffer-Pooling-Fix (ArrayBuffer.slice für saubere Daten). |
| 13 | 2026-02-10 | v7.5 | feature | **Preview-Panel Resize** - Preview-Panel kann per Drag & Drop in der Breite verändert werden. Resize-Handle am linken Rand (6px, cursor:col-resize). Min 250px, Max 70vw. Folgt dem Terminal-Panel-Resize-Pattern. |
| 14 | 2026-02-10 | v7.5 | fix | **X-Button beendet App** - `minimizeToTray` Default von `true` auf `false` geändert. Hardcoded Fallback in main.js ebenfalls auf `false`. Tray-Minimize-Handler prüft jetzt Preference. X = Beenden, Minimize = Minimieren (wie erwartet). |
| 15 | 2026-02-10 | v7.5 | fix | **Session-Restore: kein CPU-Spike + korrekter Tab** - `runPostScanAnalysis()` wird bei Session-Restore übersprungen (vermeidet 5 parallele Hintergrund-Scans + `switchToTab('dashboard')`). Explorer navigiert zum gespeicherten `activePath`. |
| 16 | 2026-02-10 | v7.5 | fix | **PDF toHex Polyfill** - pdf.js v5.4 nutzt `Uint8Array.prototype.toHex()` das in Chrome 130 (Electron 33) nicht existiert. Polyfill in index.html eingefügt. Zusätzlich Worker Blob-URL-Fix für file:// Protokoll. |
| 17 | 2026-02-10 | v7.5 | fix | **PDF Worker-Kontext Polyfill** - toHex/fromHex Polyfill wurde nur im Main-Page-Kontext geladen, aber pdf.js ruft toHex() im Worker auf. Fix: Polyfill wird jetzt direkt in den Worker-Blob injiziert (vor dem pdf.js Worker-Code), damit es im Worker Execution Context verfügbar ist. |
| 18 | 2026-02-10 | v7.5 | feature | **Speicherfarben konfigurierbar** - Farbliche Hervorhebung großer Dateien/Ordner (rot >1GB, orange >100MB, gelb >10MB) ist jetzt standardmäßig deaktiviert. Neue Preference `showSizeColors` mit Toggle in Einstellungen → Allgemein. |
| 19 | 2026-02-10 | v7.5 | feature | **Intelligentes Layout** - Panels (Vorschau, Terminal) passen sich automatisch an die Fenstergröße an. <1000px: schmaler, >1400px: breiter. Neue Preference `smartLayout` mit Toggle in Einstellungen. ResizeObserver-basiert, deaktivierbar. |

---

## Lessons Learned

Siehe auch: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (3 Lessons)

### #4: node-pty + Electron: Native Module Builds (2026-02-10)

**Problem:** node-pty@1.1.0 brauchte winpty (GetCommitHash.bat Fehler). node-pty@1.2.0-beta.11 (ConPTY-only) scheiterte an Spectre-Mitigation.

**Lösung:** `scripts/rebuild-pty.js` patcht binding.gyp automatisch vor electron-rebuild. In package.json als postinstall registriert.

**Lehre:** Native Electron-Module können plattformspezifische Build-Probleme haben. Automatische Patches als postinstall-Scripts sind robuster als manuelle Fixes.

---

### #5: Session-Save im before-quit muss synchron sein (2026-02-10)

**Problem:** Electrons `before-quit` Event wartet NICHT auf async Operationen. `await session.saveSession()` wird nie fertig.

**Lösung:** Synchrone Variante: `zlib.gzipSync()` + `fs.writeFileSync()` direkt im before-quit Handler. Die async Variante wird nur für after-scan und manuelles Speichern verwendet.

**Lehre:** Electron Lifecycle-Events (before-quit, will-quit) sind synchron. Für Cleanup-Code immer synchrone APIs verwenden.

---

### #6: Chromium file:// blockiert Module Workers (2026-02-10)

**Problem:** pdf.js Worker-Datei ist `.mjs` → pdf.js erstellt `new Worker(url, { type: 'module' })`. Chromium blockiert Module Workers von `file://` URLs (null origin, CORS-Check fehlschlägt).

**Lösung:** Worker-Script per `fetch()` laden, `export{}` Statement entfernen (ungültig in Classic Worker), als `Blob` + `URL.createObjectURL()` laden. CSP erlaubt `worker-src blob:`.

**Lehre:** In Electron (file:// Protokoll) niemals Module Workers (.mjs) verwenden. Immer Classic Workers via Blob-URL oder .js-Dateien nutzen.

---

### #7: Node.js Buffer.buffer enthält Pool-Daten (2026-02-10)

**Problem:** `fs.readFile()` gibt Buffer zurück. `buffer.buffer` ist der unterliegende ArrayBuffer, der bei kleinen Dateien den GESAMTEN Pool enthält (8KB+). `new Uint8Array(buffer.buffer)` enthält dann Müll-Daten.

**Lösung:** `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)` für sauberen ArrayBuffer.

**Lehre:** NIEMALS `buffer.buffer` direkt über IPC senden. Immer `.slice()` für einen sauberen ArrayBuffer verwenden.

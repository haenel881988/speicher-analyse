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

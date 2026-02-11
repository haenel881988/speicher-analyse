# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `archiv/` verschieben (Dateiname: `aenderungsprotokoll_<version>.md`).

Archiv: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (30 Einträge, v7.0–v7.2)
Archiv: [`archiv/aenderungsprotokoll_v7.3-v7.5.md`](archiv/aenderungsprotokoll_v7.3-v7.5.md) (15 Einträge, v7.3–v7.5)

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 1 | 2026-02-10 | v7.5 | fix | **PDF toHex Polyfill** - pdf.js v5.4 nutzt `Uint8Array.prototype.toHex()` das in Chrome 130 (Electron 33) nicht existiert. Polyfill in index.html eingefügt. Zusätzlich Worker Blob-URL-Fix für file:// Protokoll. |
| 2 | 2026-02-10 | v7.5 | fix | **PDF Worker-Kontext Polyfill** - toHex/fromHex Polyfill wurde nur im Main-Page-Kontext geladen, aber pdf.js ruft toHex() im Worker auf. Fix: Polyfill wird jetzt direkt in den Worker-Blob injiziert (vor dem pdf.js Worker-Code), damit es im Worker Execution Context verfügbar ist. |
| 3 | 2026-02-10 | v7.5 | feature | **Speicherfarben konfigurierbar** - Farbliche Hervorhebung großer Dateien/Ordner (rot >1GB, orange >100MB, gelb >10MB) ist jetzt standardmäßig deaktiviert. Neue Preference `showSizeColors` mit Toggle in Einstellungen → Allgemein. |
| 4 | 2026-02-10 | v7.5 | feature | **Intelligentes Layout** - Panels (Vorschau, Terminal) passen sich automatisch an die Fenstergröße an. <1000px: schmaler, >1400px: breiter. Neue Preference `smartLayout` mit Toggle in Einstellungen. ResizeObserver-basiert, deaktivierbar. |
| 5 | 2026-02-10 | v7.2.1 | fix | **Session-Restore: minimizeToTray Migration** - Root-Cause: `minimizeToTray` war `true` in bestehenden preferences.json → X-Button minimierte statt zu schließen → `before-quit` feuerte nie → Session wurde nie gespeichert. Fix: Einmalige Migration erzwingt `minimizeToTray: false` für bestehende User mit Flag `_migratedMinimizeToTray`. |
| 6 | 2026-02-10 | v7.2.1 | improve | **Smart Layout: Sidebar + Content** - Smart Layout erweitert: Sidebar klappt automatisch bei <1000px zu und bei >1400px auf (respektiert manuelle Toggles). CSS-Klassen `smart-layout-narrow`/`smart-layout-wide` auf `#app` steuern Dashboard-Grid (1/2/3 Spalten) und Content-Padding (8/16/20px). |
| 7 | 2026-02-10 | v7.2.1 | fix | **Versionierung vereinheitlicht** - 3 verschiedene Versionen im Code (v7.2 in index.html, v7.4 in settings.js, 7.5.0 in package.json) auf v7.2.1 vereinheitlicht. Session-Diagnostik-Logging in Load/Save/Restore-Pfaden hinzugefügt. |
| 8 | 2026-02-11 | v7.2.2 | fix | **Privacy Dashboard: Sideloading-Schutz + Standard/Erweitert-Trennung** - Root-Cause: AllowTelemetry=0 auf Windows Pro kann App-Sideloading blockieren (AllowAllTrustedApps=0). Fix: (1) Sideloading-Check + Reparatur-Button im Dashboard, (2) Einstellungen in Standard (HKCU, sicher) und Erweitert (HKLM, gefährlich) aufgeteilt, (3) Erweiterte Einstellungen hinter Aufklapp-Sektion + Bestätigungsdialog mit Warnhinweisen, (4) "Alle optimieren" wendet nur Standard-Einstellungen an, (5) Telemetrie-Empfehlung von 0 auf 1 korrigiert (Level 0 nur Enterprise/Education), (6) Windows-Edition wird erkannt und angezeigt. |
| 9 | 2026-02-11 | v7.2.2 | fix | **Auto-Reload Stabilisierung** - Root-Cause: `fs.watch()` auf Windows feuert Ghost-Events bei Datei-Zugriff (nicht nur Änderung), ausgelöst durch Windows Defender, Search Indexer, und Electron-eigene Dateizugriffe. Fix: mtime-Tracking (nur bei tatsächlicher Änderung), Whitelist für Dateitypen (.js/.css/.html), Minimum 2s zwischen Reloads, 500ms/1s Debounce. |
| 10 | 2026-02-11 | v7.2.2 | feature | **Automatische Admin-Elevation für Sideloading-Fix** - Sideloading-Reparatur startet bei fehlenden Rechten automatisch als Administrator neu. Pending-Action-System in admin.js: Aktion wird in %APPDATA% gespeichert, nach Admin-Neustart automatisch ausgeführt, Session bleibt erhalten. Toast-Benachrichtigung zeigt Ergebnis nach Neustart. |
| 11 | 2026-02-11 | v7.2.3 | fix | **Admin-Elevation: App startet nicht neu** - 4 Root-Causes identifiziert + behoben: (1) Single-Instance Lock Race Condition — `app.releaseSingleInstanceLock()` vor Prozess-Start, Lock wird bei UAC-Abbruch wieder erworben, (2) cmd.exe Double-Quote-Nesting — `execFileAsync` statt `execAsync` (bypassed cmd.exe komplett), (3) 10s Timeout zu kurz für UAC — auf 120s erhöht, (4) `app.quit()` ist async — durch `app.exit(0)` ersetzt (sofortiger Exit). Zusätzlich: `app._isElevating`-Flag verhindert dass Window-Close, window-all-closed und Tray-Beenden während Elevation `app.quit()` aufrufen (würde before-quit Cleanup triggern und scans-Map leeren). Pending-Action-Timeout von 60s auf 120s erhöht. |
| 12 | 2026-02-11 | v7.3 | feature | **Privacy: Intelligente, App-bewusste Datenschutz-Empfehlungen** - Alle 12 Privacy-Einstellungen mit laienverständlichen Erklärungen + Auswirkungen ergänzt. APP_PERMISSIONS Datenbank (35+ App-Patterns) korreliert installierte Software mit Privacy-Settings. Empfehlungssystem (safe/caution/risky) pro Einstellung. Frontend zeigt Erklärungen, Auswirkungen, Empfehlungs-Badges mit betroffenen Apps + Zusammenfassungs-Banner. |
| 13 | 2026-02-11 | v7.3 | fix | **X-Button beendet App zuverlässig** - Root-Cause: `minimizeToTray`-Check im close-Handler versteckte Fenster statt App zu beenden → User killte per Task-Manager → before-quit feuerte nie → Session nie gespeichert. Fix: Close-Handler vereinfacht — X = `app.quit()`, immer, ohne Ausnahme. Minimize-to-Tray nur noch über Minimieren-Button (tray.js). |
| 14 | 2026-02-11 | v7.3 | fix | **Ordnergrössen: Multi-Scan-Fallback** - Root-Cause: Explorer nutzte nur EINEN Scan (den zuletzt gestarteten). Bei mehreren Laufwerken gingen die Grössen der anderen Laufwerke verloren — obwohl die Daten im Hintergrund noch vorhanden waren. Fix: `get-folder-sizes-bulk` sucht jetzt automatisch in ALLEN verfügbaren Scans den passenden für den aktuellen Pfad. |
| 15 | 2026-02-11 | v7.3 | fix | **Privacy: Lade-Hinweis für App-Empfehlungen** - Root-Cause: Die Software-Analyse (Registry-Scan aller Programme) braucht 30-60 Sekunden, aber es gab keinen visuellen Hinweis. User dachte die App-Erkennung sei kaputt. Fix: Lade-Banner "App-Analyse läuft..." mit Spinner erscheint sofort, nach Abschluss automatisches Re-Render mit Ergebnis. Fehlerfall zeigt "Erneut versuchen"-Button. |
| 16 | 2026-02-11 | v7.3 | fix | **Terminal-Breite: Seitenleiste nicht mehr überdeckt** - Root-Cause: `#terminal-global` war im HTML *außerhalb* des Haupt-Layouts (`#app-layout`) platziert → nahm volle Fensterbreite ein, überdeckte Seitenleiste. Fix: Terminal in `#content` verschoben (innerhalb des Flex-Layouts) → automatisch auf mittlere Spaltenbreite begrenzt. |
| 17 | 2026-02-11 | v7.3 | fix | **Session-Persistenz: Vollständige Scan-Daten** - Root-Cause: Session speicherte nur Ordnerstruktur (tree), aber NICHT Datei-Details (dirFiles ~80-120MB). Nach Neustart: Duplikate leer, Suche leer, Dashboard-Karten "Wird analysiert..." ohne Ende, nameIndex leer. Fix: (1) dirFiles wird jetzt in Session mitgespeichert (gzip ~5-15MB), (2) nameIndex wird beim Laden aus dirFiles rekonstruiert, (3) Dashboard-Analyse startet nach Restore im Hintergrund, (4) releaseScanBulkData entfernt — Daten bleiben für Session-Persistenz im Speicher. Betrifft: session.js, ipc-handlers.js (before-quit), app.js (runPostScanAnalysis). |
| 18 | 2026-02-11 | v7.3 | improve | **Privacy Dashboard: Anwenderfreundliche Empfehlungen** - Simons Feedback: "Soll ich das jetzt deaktivieren?" Fix: (1) explanation + impacts Felder werden jetzt vom Backend ans Frontend gesendet, (2) Neue Handlungsempfehlung pro Einstellung: "Deaktivieren empfohlen" / "Vorsicht" / "Nicht deaktivieren" mit Begründung (guidance-Feld), (3) Status-Hinweis erklärt "Geschützt" und "Offen" in Alltagssprache, (4) "Was passiert beim Deaktivieren" statt "Auswirkungen", (5) Registry-Pfade aus Anzeige entfernt. |
| 19 | 2026-02-11 | v7.3 | improve | **Privacy Dashboard: Layout aufgeräumt und kompakter** - Kompakteres Layout: Sideloading-Alert weniger wuchtig, Score-Ring + Header-Info in einer Zeile, Einstellungen dichter gruppiert. |
| 20 | 2026-02-11 | v7.3 | feature | **Privacy Dashboard: Reset-Funktion + Risiko-Erklärungen** - Zurücksetzen-Button bei jeder geschützten Einstellung, "Alle zurücksetzen" Sammelaktion für Standard-Einstellungen, "Warum ist das ein Risiko?" Erklärung bei jeder Einstellung in Alltagssprache (z.B. Werbe-ID: "Du wirst zum Produkt"), Bestätigungsdialog vor Reset. |
| 21 | 2026-02-11 | v7.3 | feature | **Netzwerk-Monitor: Gruppierte Prozess-Ansicht** - Statt flacher Tabelle mit 500 Zeilen: aufklappbare Prozesskarten (z.B. "msedge — 8 Verbindungen, 4 IPs"). Geisterprozess-Erkennung markiert geschlossene Programme die noch Daten senden ("Hintergrund-Aktivität!"). Verbindungen pro Prozess nach Remote-IP gruppiert. |
| 22 | 2026-02-11 | v7.3 | feature | **Netzwerk-Monitor: IP-zu-Firma-Auflösung** - Beim Aufklappen einer Prozess-Gruppe werden IP-Adressen per Reverse-DNS aufgelöst (z.B. "52.97.201.226 → Microsoft"). 20+ Firmen-Patterns (Microsoft, Google, Meta, Amazon, Apple etc.). Tracker und Werbenetzwerke werden rot markiert. Session-Cache verhindert wiederholte Abfragen. |
| 23 | 2026-02-11 | v7.3 | feature | **Netzwerk-Monitor: Snapshot-Modus + Echtzeit-Toggle** - Standard: kein Auto-Refresh (spart Ressourcen). Echtzeit per Toggle-Switch aktivierbar (5s Polling). Zeitstempel zeigt wann die Daten zuletzt geladen wurden. Aufnahme-Indikator bei Echtzeit-Modus. |
| 24 | 2026-02-11 | v7.3 | feature | **Privacy-Netzwerk-Verlinkung** - "Netzwerk-Aktivität ansehen" Button am Ende des Privacy Dashboards wechselt direkt zum Netzwerk-Monitor. Cross-View-Navigation über Custom-Event-System. |

---

## Lessons Learned

Siehe auch: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (3 Lessons)
Siehe auch: [`archiv/aenderungsprotokoll_v7.3-v7.5.md`](archiv/aenderungsprotokoll_v7.3-v7.5.md)

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

---

### #8: Electron Admin-Elevation: Single-Instance Lock Race Condition (2026-02-11)

**Problem:** `Start-Process -Verb RunAs` startet den neuen Prozess, PowerShell gibt Return, und `app.quit()` wird aufgerufen. Aber `app.quit()` ist ASYNC — bis die alte Instanz den Lock freigibt, hat die neue Instanz bereits `requestSingleInstanceLock()` aufgerufen, `false` bekommen, und sich sofort beendet. Ergebnis: App schließt sich und nichts passiert.

**Lösung:** 4 Fixes zusammen:
1. `app.releaseSingleInstanceLock()` EXPLIZIT VOR dem Spawn der neuen Instanz aufrufen (Electron API seit v15)
2. `app.exit(0)` statt `app.quit()` — sofortiger Exit ohne async Event-Queue
3. `execFileAsync` statt `execAsync` — bypassed cmd.exe komplett (keine Double-Quote-Nesting-Probleme)
4. `app._isElevating` Flag — verhindert dass Window-Close/Tray/window-all-closed während der UAC-Wartezeit `app.quit()` aufrufen

**Lehre:**
- `app.quit()` ist ASYNC und feuert Events (before-quit, will-quit, window-all-closed). Für Elevation immer `app.exit(0)` verwenden.
- `requestSingleInstanceLock()` muss EXPLIZIT mit `releaseSingleInstanceLock()` freigegeben werden bevor die neue Instanz startet. Sich auf `app.quit()` verlassen funktioniert nicht (Race Condition).
- `exec()` geht durch `cmd.exe /c "..."` — fragile Verschachtelung bei PowerShell-Befehlen. `execFile()` spawnt direkt.
- Während Elevation (UAC-Wartezeit bis 120s) muss ALLES was `app.quit()` aufrufen könnte blockiert werden: Window-Close, window-all-closed, Tray-Menü. Sonst wird `before-quit` gefeuert, Cleanup-Code räumt die scans-Map ab, und die Elevation-Daten sind weg.

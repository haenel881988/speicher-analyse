# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `archiv/` verschieben (Dateiname: `aenderungsprotokoll_<version>.md`).

Archiv: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (30 Einträge, v7.0–v7.2)
Archiv: [`archiv/aenderungsprotokoll_v7.3-v7.5.md`](archiv/aenderungsprotokoll_v7.3-v7.5.md) (15 Einträge, v7.3–v7.5)
Archiv: [`archiv/aenderungsprotokoll_v7.3-v8.0.md`](archiv/aenderungsprotokoll_v7.3-v8.0.md) (15 Einträge, v7.3–v8.0)

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 39 | 2026-02-12 | v7.2.1 | improve | **Live-Hersteller-Erkennung (IEEE)** - Die Hersteller-Erkennung bei Netzwerk-Geräten fragt jetzt immer live bei der offiziellen IEEE-Registrierung nach (via macvendors.com API), statt in einer veralteten internen Liste zu suchen. Dadurch werden auch brandneue Geräte sofort korrekt erkannt. Gleiche Hersteller werden nur einmal abgefragt (Batch-Lookup). Bei fehlendem Internet greift automatisch eine Offline-Sicherheitsliste. Neue Fortschrittsphase "Hersteller-Erkennung (IEEE)" im Scanner. |
| 38 | 2026-02-12 | v7.2.1 | feature | **Netzwerk-Inventar** - Der Geräte-Scanner erkennt jetzt automatisch den Gerätetyp (PC, Drucker, NAS, Kamera, Smart-Home, Router, Server, TV, Spielkonsole etc.) anhand einer Kombination aus Hersteller, offenen Ports, Betriebssystem und Hostname. Die Hersteller-Erkennung wurde von 47 auf über 350 Hersteller erweitert und erkennt damit fast alle Geräte im Netzwerk. Statt einer Tabelle werden Geräte jetzt als übersichtliche Inventar-Karten mit farbigen Typ-Icons angezeigt. Der Port-Scan wurde um 6 zusätzliche Ports erweitert (Drucker, Kamera, NAS). CSV-Export enthält den Gerätetyp als neue Spalte. |
| 37 | 2026-02-12 | v7.2.1 | feature | **System-Profil** - Neuer Tab im Bereich System zeigt alle Informationen über den PC an einem Ort: Hersteller, Modell, Seriennummer, Betriebssystem, Prozessor, Grafikkarte, Arbeitsspeicher, Festplatten, Netzwerkadapter und direkte Links zum Hersteller-Support. 8 Info-Karten mit Kopieren- und Aktualisieren-Funktion. |
| 36 | 2026-02-12 | v7.2.1 | docs | **Produktstrategie** - Vollständige 4-Stufen-Planung in der Issue-Datei erstellt: Stufe 1 (System-Werkzeugkasten), Stufe 2 (Netzwerk & Sicherheit), Stufe 3 (IT-Dokumentation & Inventar), Stufe 4 (Fernwartung & Leichtes RMM). Alle bestehenden Issues nach Stufen zugeordnet, Zielgruppen-Mapping und empfohlene Implementierungsreihenfolge. Basiert auf der Markt- und Zielgruppenanalyse (recherche.md). |
| 35 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Monitor: Absturz beim Laden behoben** - Der Netzwerk-Monitor zeigte eine Fehlermeldung ("Maximum call stack size exceeded") beim Öffnen. Ursache: Bei der Sicherheits-Überarbeitung wurde eine Hilfsfunktion versehentlich so geschrieben, dass sie sich endlos selbst aufruft statt die Daten zu speichern. Ein-Zeilen-Fix behebt das Problem komplett. |
| 34 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner: Falsches Subnetz + Sicherheits-Audit** - Der Geräte-Scanner hat das falsche Netzwerk gescannt (VPN-Interface statt echtes LAN). Ursache: Subnetz-Erkennung nutzte eine nicht-existierende Eigenschaft zum Sortieren. Fix: Subnetz wird jetzt über die Default Route (=echtes LAN-Interface mit Gateway) erkannt. Validiert: 10 Geräte im echten Netzwerk gefunden. Zusätzlich: Sicherheitsprüfung des gesamten Netzwerk-Moduls — Command-Injection-Schutz für alle Eingabefelder, IP-Validierung, Pfad-Prüfung, Cache-Begrenzung (max. 2000 IPs), Listener-Bereinigung, längere Wartezeiten bei langsamen Systemen. |
| 33 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner + Monitor UI aufgeräumt** - Lokale-Geräte-Scan funktionierte nicht (Ping Sweep nutzte PowerShell 7-Befehl, der auf Windows PowerShell 5.1 nicht existiert — durch .NET Ping.SendPingAsync ersetzt). Netzwerk-Monitor von 5 auf 4 Tabs reduziert: Bandbreite und Top-Prozesse zu einer Übersichtsseite mit Statistik-Karten zusammengeführt. Header kompakter gestaltet. |
| 32 | 2026-02-12 | v7.2.1 | feature | **Netzwerk-Monitor: Grosses Upgrade** - (1) Echtzeit-Modus repariert: Statt 3 einzelner Abfragen pro Aktualisierung nur noch 1 kombinierter Aufruf, Überlappungsschutz verhindert Anfragestau, Intervall auf 10 Sekunden erhöht. (2) Neuer "Verlauf"-Tab: Netzwerk-Snapshots werden dauerhaft gespeichert (max. 200), Änderungen zwischen Snapshots werden hervorgehoben, Export als CSV oder JSON. (3) Aktiver Netzwerk-Scanner (wie Advanced IP Scanner): Erkennt alle Geräte im lokalen Netzwerk per Ping, scannt offene Ports (SSH, HTTP, RDP, SMB etc.), erkennt Betriebssystem, zeigt freigegebene Ordner, Ping-Zeiten und Hersteller. Fortschrittsanzeige während des Scans. Export als CSV. |
| 31 | 2026-02-12 | v7.2.1 | fix | **Firewall-Status falsch angezeigt** - Im Sicherheits-Check wurde die Windows-Firewall als "deaktiviert" angezeigt, obwohl sie aktiv war. Ursache: PowerShell gibt den Status als Ganzzahl (1/0) zurück, der Code erwartete aber einen anderen Datentyp. Gleiches Problem auch bei der Benutzerkonten-Prüfung behoben. |
| 30 | 2026-02-12 | v7.2.1 | fix | **Vergleich-Tab entfernt + Duplikat-Scan verbessert** - Vergleich-Tab komplett entfernt (unpraktisch, wird durch automatischen Scan-Verlauf ersetzt). Duplikat-Scan: Button deaktiviert wenn kein Laufwerk-Scan vorhanden, verständliche Fehlermeldung statt kryptischem "Scan nicht gefunden", fehlendes Error-Event im Frontend gefixt (UI hing bei Fehlern), Fortschrittsanzeige pro Phase korrigiert (korrekte Zahlen + ETA). |
| 25 | 2026-02-11 | v7.2.1 | feature | **Netzwerk-Monitor: IP-Ownership via ip-api.com** - DNS Reverse Lookup durch echte WHOIS/IP-Datenbank ersetzt. ip-api.com Batch-API löst alle IPs in einer Anfrage auf (Organisation, ISP, Land, Länderflagge). Lokale Adressen (0.0.0.0) ausgeblendet. Verbindungen zur gleichen IP gruppiert. Tracker rot markiert. Firmenübersicht im Gruppen-Header. Fallback auf DNS bei API-Ausfall. |
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

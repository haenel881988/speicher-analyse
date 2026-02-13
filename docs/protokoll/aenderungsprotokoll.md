# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `archiv/` verschieben (Dateiname: `aenderungsprotokoll_<version>.md`).

Archiv: [`archiv/aenderungsprotokoll_v7.0-v7.2.md`](archiv/aenderungsprotokoll_v7.0-v7.2.md) (30 Einträge, v7.0–v7.2)
Archiv: [`archiv/aenderungsprotokoll_v7.3-v7.5.md`](archiv/aenderungsprotokoll_v7.3-v7.5.md) (15 Einträge, v7.3–v7.5)
Archiv: [`archiv/aenderungsprotokoll_v7.3-v8.0.md`](archiv/aenderungsprotokoll_v7.3-v8.0.md) (15 Einträge, v7.3–v8.0)
Archiv: [`archiv/aenderungsprotokoll_v7.2.1-v7.3.md`](archiv/aenderungsprotokoll_v7.2.1-v7.3.md) (15 Einträge, v7.2.1–v7.3)

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 48 | 2026-02-13 | v7.2.1 | fix | **WCAG-Kontrast: 11 Verletzungen in Optimizer und Netzwerk-Monitor behoben** - Graue Texte auf dunklem Hintergrund (Kategoriezähler, manuelle Pfade, Port-Labels, Tabellen-Überschriften, IP-Adressen) waren zu schwach — von --text-muted auf --text-secondary angehoben. Weisse Schrift auf roten/blauen Badges (Hoch/Niedrig) unlesbar — auf schwarze Schrift gewechselt. Lila Schrift auf halbtransparenten Netzwerk-Badges (Tab-Zähler, Seriennummern, Lokal-Badge) schlecht lesbar — auf --text-primary gewechselt. Erstmals mit echtem Browser-Test verifiziert (Puppeteer + getComputedStyle auf gerenderten Elementen), nicht nur mathematisch mit CSS-Variablen. Neue Skills /visual-verify und /test-issue erstellt, CLAUDE.md Skill-First-Direktive verschärft. |
| 47 | 2026-02-13 | v7.2.1 | fix | **Netzwerk-Monitor: Geräte mit Port 515 (LPD) als Drucker erkannt** - Ein Gerät mit nur Port 515 (LPD = Line Printer Daemon) wurde fälschlich als "Linux/macOS Gerät" angezeigt statt als Drucker. Ursache: Port 515 allein galt als "zu schwaches Signal" für die Drucker-Erkennung. Aber LPD ist ein reines Druckerprotokoll — kein normaler PC hat diesen Port offen. Der Gerätetyp-Erkennungsalgorithmus stuft Port 515 jetzt als eigenständiges Drucker-Signal ein. Per Puppeteer-Screenshot vorher/nachher verifiziert. |
| 46 | 2026-02-13 | v7.2.1 | fix | **Netzwerk-Monitor: 7 UI/UX-Verbesserungen** - (1) Top-Prozesse zeigten PIDs statt Namen — Ursache: PowerShell-Variable `$pid` ist reserviert und kann nicht überschrieben werden, umbenannt zu `$procId`. (2) Suchfeld nur noch im Verbindungen-Tab sichtbar. (3) Besserer Leerzustand für "Lokale Geräte" mit Erklärungstext. (4) Besserer Leerzustand für "Verlauf" mit Erklärung was Snapshots sind. (5) Idle/TimeWait-Verbindungen werden nach unten sortiert. (6) Inaktive Netzwerk-Adapter kompakt einzeilig dargestellt (z.B. "WLAN — Offline"). (7) Snapshot-Button umbenannt zu "Aktualisieren". |
| 45 | 2026-02-13 | v7.2.1 | feature | **MCP-Server — KI-Assistenten können direkt auf App-Daten zugreifen (Issue #19)** - Eigenständiger MCP-Server implementiert der lokal läuft und 10 Werkzeuge bereitstellt: Laufwerke anzeigen, gespeicherte Scan-Ergebnisse lesen (grösste Dateien, Dateitypen, Verzeichnisstruktur), aktive Netzwerk-Verbindungen mit Prozessnamen, Datenschutz-Einstellungen aus der Registry (Werbe-ID, Cortana, Telemetrie, Standort, Kamera, Mikrofon), System-Informationen (Hardware, OS, CPU, GPU), installierte Programme, Autostart-Einträge, Windows-Dienste, S.M.A.R.T. Festplatten-Gesundheit und Bereinigungsvorschläge (Temp, Cache, Downloads, Papierkorb). Server nutzt stdio-Transport und wird von Claude Code über `.mcp.json` automatisch gestartet. Keine Daten verlassen den Rechner. |
| 44 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner: 5 Bugs gefixt (Datenverlust, falsche Modelle, Sonos-Erkennung)** - Tiefenanalyse des gesamten Netzwerk-Scanners: (1) Scan-Ergebnisse gingen bei jedem Seitenwechsel verloren, weil sie nur im Browser-Speicher lagen. Jetzt werden sie im Backend zwischengespeichert und automatisch wiederhergestellt. (2) Router zeigte "Welcome to the Web-Based Configurator" als Modellname — der generische Title-Filter erkannte den Text nicht, weil Sonderzeichen (::) am Anfang den Filter umgingen. Filter komplett überarbeitet: erkennt jetzt "configurator", "management", "dashboard", "web-based" u.v.m. als generische Begriffe. (3) Sonos-Geräte (5 Stück) wurden nicht per UPnP erkannt — Timeout von 4 auf 8 Sekunden erhöht, zweiter Broadcast-Typ für bessere Geräte-Abdeckung, und Port 1400 (Sonos-Webserver) zur Port-Liste hinzugefügt. (4) Port 5000 wurde immer als "Synology" angezeigt, auch beim Router — korrigiert zu "HTTP". (5) UPnP-Parser verbessert: Wenn Modellnummer vorhanden, wird diese zusammen mit dem Modellnamen angezeigt (z.B. "Sonos One (S18)"). Hersteller wird dem Modellnamen vorangestellt wenn er fehlt. |
| 43 | 2026-02-12 | v7.2.1 | feature | **Gerätemodell-Erkennung im Netzwerk-Scanner** - Der Netzwerk-Scanner erkennt jetzt nicht nur den Hersteller, sondern auch das exakte Modell, die Seriennummer und die Firmware-Version von Geräten im Netzwerk. Drei Erkennungs-Methoden arbeiten automatisch zusammen: (1) UPnP/SSDP — fragt Smart-TVs, Router und NAS per Netzwerk-Broadcast ab und liest die Gerätebeschreibung. (2) HTTP Banner — ruft die Webseite des Geräts auf (z.B. Drucker-Konfigurationsseite) und liest den Modellnamen. (3) IPP — fragt Netzwerk-Drucker direkt nach Modell und Seriennummer. Neue Spalte "Modell" in der Geräte-Tabelle, mit S/N-Badge bei vorhandener Seriennummer (Tooltip zeigt Seriennummer + Firmware). Suchfilter durchsucht auch den Modellnamen. CSV-Export enthält Modell, Seriennummer und Firmware als neue Spalten. Gesamter Scan dauert nur 5-10 Sekunden länger. |
| 42 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner: Ladebalken sichtbar, Tabelle statt Kacheln, Drucker-Erkennung** - Drei Probleme behoben: (1) Der Ladebalken beim Geräte-Scan war unsichtbar — kein Spinner, kein animierter Balken, Hintergrund verschmolz mit der Seite. Jetzt zeigt ein drehender Spinner und ein pulsierender Fortschrittsbalken in jeder Scan-Phase den Fortschritt deutlich an. (2) Die grossen Geräte-Kacheln verbrauchten viel Platz ohne Mehrwert — ersetzt durch eine kompakte Tabelle (wie Advanced IP Scanner): Icon, Name, Typ, Hersteller, MAC, Ports und Ping auf einen Blick, mit Suchfilter. (3) Geräte mit Port 515 (LPD) wurden fälschlich als Drucker erkannt (z.B. "Visionscape Co., Ltd."). Jetzt wird ein Gerät nur als Drucker klassifiziert wenn Port 9100 (RAW Print) offen ist oder 631+515 zusammen — Port 515 allein reicht nicht mehr. |
| 41 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner: MAC-Adressen, Ports und Geräte-Erkennung repariert** - Beim Netzwerk-Scan wurden keine MAC-Adressen, keine offenen Ports und keine Hersteller angezeigt — alle Geräte erschienen als "Linux/macOS Gerät". Ursache: Die MAC-Adressen-Abfrage und der Port-Scan liefen in einem einzigen Aufruf, der bei mehr als 10 Geräten zu langsam wurde und abgebrochen wurde (60s Limit, 72s nötig). Dadurch gingen ALLE Daten verloren. Jetzt laufen MAC-Adressen und Port-Scan getrennt — selbst wenn der Port-Scan länger braucht, bleiben MAC-Adressen und Hersteller-Erkennung erhalten. Timeout dynamisch berechnet (bis 5 Minuten). Zusätzlich: Router/Gateway wird jetzt automatisch erkannt, HP-Drucker werden am Hostnamen erkannt (z.B. "HPF94506"), und die Erkennungsreihenfolge wurde korrigiert (Hostname wird jetzt vor dem Betriebssystem-Fallback geprüft). |
| 40 | 2026-02-12 | v7.2.1 | fix | **Gerätetyp-Erkennung repariert** - Geräte im Netzwerk-Scanner wurden alle als "Unbekanntes Gerät" angezeigt, obwohl der Hersteller korrekt erkannt wurde. Ursache: Die Zuordnung Hersteller→Gerätetyp suchte nach exakt dem gleichen Namen, aber die IEEE-Datenbank liefert volle Firmennamen (z.B. "Brother Industries, Ltd." statt "Brother"). Die Erkennung arbeitet jetzt mit Teilbegriff-Suche und erkennt dadurch auch volle IEEE-Namen. 37 Hersteller-Muster erweitert (Signify/Philips Hue, Fritz!Box, Netgear, D-Link, Huawei u.a.). Fortschrittsanzeige zeigt jetzt detailliert den Fortschritt der Hersteller-Erkennung (z.B. "3 von 7 identifiziert"). |
| 39 | 2026-02-12 | v7.2.1 | improve | **Live-Hersteller-Erkennung (IEEE)** - Die Hersteller-Erkennung bei Netzwerk-Geräten fragt jetzt immer live bei der offiziellen IEEE-Registrierung nach (via macvendors.com API), statt in einer veralteten internen Liste zu suchen. Dadurch werden auch brandneue Geräte sofort korrekt erkannt. Gleiche Hersteller werden nur einmal abgefragt (Batch-Lookup). Bei fehlendem Internet greift automatisch eine Offline-Sicherheitsliste. Neue Fortschrittsphase "Hersteller-Erkennung (IEEE)" im Scanner. |
| 38 | 2026-02-12 | v7.2.1 | feature | **Netzwerk-Inventar** - Der Geräte-Scanner erkennt jetzt automatisch den Gerätetyp (PC, Drucker, NAS, Kamera, Smart-Home, Router, Server, TV, Spielkonsole etc.) anhand einer Kombination aus Hersteller, offenen Ports, Betriebssystem und Hostname. Die Hersteller-Erkennung wurde von 47 auf über 350 Hersteller erweitert und erkennt damit fast alle Geräte im Netzwerk. Statt einer Tabelle werden Geräte jetzt als übersichtliche Inventar-Karten mit farbigen Typ-Icons angezeigt. Der Port-Scan wurde um 6 zusätzliche Ports erweitert (Drucker, Kamera, NAS). CSV-Export enthält den Gerätetyp als neue Spalte. |
| 37 | 2026-02-12 | v7.2.1 | feature | **System-Profil** - Neuer Tab im Bereich System zeigt alle Informationen über den PC an einem Ort: Hersteller, Modell, Seriennummer, Betriebssystem, Prozessor, Grafikkarte, Arbeitsspeicher, Festplatten, Netzwerkadapter und direkte Links zum Hersteller-Support. 8 Info-Karten mit Kopieren- und Aktualisieren-Funktion. |
| 36 | 2026-02-12 | v7.2.1 | docs | **Produktstrategie** - Vollständige 4-Stufen-Planung in der Issue-Datei erstellt: Stufe 1 (System-Werkzeugkasten), Stufe 2 (Netzwerk & Sicherheit), Stufe 3 (IT-Dokumentation & Inventar), Stufe 4 (Fernwartung & Leichtes RMM). Alle bestehenden Issues nach Stufen zugeordnet, Zielgruppen-Mapping und empfohlene Implementierungsreihenfolge. Basiert auf der Markt- und Zielgruppenanalyse (recherche.md). |
| 35 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Monitor: Absturz beim Laden behoben** - Der Netzwerk-Monitor zeigte eine Fehlermeldung ("Maximum call stack size exceeded") beim Öffnen. Ursache: Bei der Sicherheits-Überarbeitung wurde eine Hilfsfunktion versehentlich so geschrieben, dass sie sich endlos selbst aufruft statt die Daten zu speichern. Ein-Zeilen-Fix behebt das Problem komplett. |
| 34 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner: Falsches Subnetz + Sicherheits-Audit** - Der Geräte-Scanner hat das falsche Netzwerk gescannt (VPN-Interface statt echtes LAN). Ursache: Subnetz-Erkennung nutzte eine nicht-existierende Eigenschaft zum Sortieren. Fix: Subnetz wird jetzt über die Default Route (=echtes LAN-Interface mit Gateway) erkannt. Validiert: 10 Geräte im echten Netzwerk gefunden. Zusätzlich: Sicherheitsprüfung des gesamten Netzwerk-Moduls — Command-Injection-Schutz für alle Eingabefelder, IP-Validierung, Pfad-Prüfung, Cache-Begrenzung (max. 2000 IPs), Listener-Bereinigung, längere Wartezeiten bei langsamen Systemen. |
| 33 | 2026-02-12 | v7.2.1 | fix | **Netzwerk-Scanner + Monitor UI aufgeräumt** - Lokale-Geräte-Scan funktionierte nicht (Ping Sweep nutzte PowerShell 7-Befehl, der auf Windows PowerShell 5.1 nicht existiert — durch .NET Ping.SendPingAsync ersetzt). Netzwerk-Monitor von 5 auf 4 Tabs reduziert: Bandbreite und Top-Prozesse zu einer Übersichtsseite mit Statistik-Karten zusammengeführt. Header kompakter gestaltet. |
| 32 | 2026-02-12 | v7.2.1 | feature | **Netzwerk-Monitor: Grosses Upgrade** - (1) Echtzeit-Modus repariert: Statt 3 einzelner Abfragen pro Aktualisierung nur noch 1 kombinierter Aufruf, Überlappungsschutz verhindert Anfragestau, Intervall auf 10 Sekunden erhöht. (2) Neuer "Verlauf"-Tab: Netzwerk-Snapshots werden dauerhaft gespeichert (max. 200), Änderungen zwischen Snapshots werden hervorgehoben, Export als CSV oder JSON. (3) Aktiver Netzwerk-Scanner (wie Advanced IP Scanner): Erkennt alle Geräte im lokalen Netzwerk per Ping, scannt offene Ports (SSH, HTTP, RDP, SMB etc.), erkennt Betriebssystem, zeigt freigegebene Ordner, Ping-Zeiten und Hersteller. Fortschrittsanzeige während des Scans. Export als CSV. |
| 31 | 2026-02-12 | v7.2.1 | fix | **Firewall-Status falsch angezeigt** - Im Sicherheits-Check wurde die Windows-Firewall als "deaktiviert" angezeigt, obwohl sie aktiv war. Ursache: PowerShell gibt den Status als Ganzzahl (1/0) zurück, der Code erwartete aber einen anderen Datentyp. Gleiches Problem auch bei der Benutzerkonten-Prüfung behoben. |

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

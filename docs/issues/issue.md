# Issues & Planung — Speicher Analyse

> Diese Datei gehört Simon. Nur Simon darf Issues als erledigt markieren.
> Die KI dokumentiert hier den Stand und die Planung in verständlicher Sprache.
> **Konsolidiert am 19.02.2026** — Alle offenen Scopes zusammengeführt, Status aktualisiert.

---

## Simons Ideen Salat

> Simons ursprüngliche Ideen — unverändert beibehalten. Claude ergänzt jeweils den aktuellen Status.

### Sicherheitscheck / GPO-Scanner

 - Erweiterung vom Sicherheitscheck - oder unterregister mit einem GPO Scan. Dabei soll der Scan die GPOs scannen ob es potenziell problematische Einstellungen gibt, die zu Fehlern, bluescreens etc. führen, gerade kombiniert mit der Registry können so sehr subtile Probleme sichtbar gemacht werden, damit dann schritt für schritt das Problem behoben werden kann / evtl. auch welche übergeordnete GPO die Problematik verursacht.

> **Claude:** Eingeplant als Stufe 2 Feature (§2.2 GPO-Scanner). Noch nicht implementiert — kommt nach Stufe 1.

### Webbrowser-Integration

- Integration eines Webbrowser, damit z.B.: im netzwerk direkt das jeweilige Netzwerkgerät über die IP Adresse aufgerufen werden kann.

> **Claude:** Noch offen. Der IP-Scanner wurde entfernt (AV-Risiko), aber ein eingebetteter Browser für Geräte-Zugriff wäre unabhängig davon möglich. Kein Issue angelegt.

### Explorer-Funktionen

  1. Kontextmenü fehlt, wie bei Windows 11.
  2. Keine extraktion möglich im Kontextmenü wie bei Windows bei z.B.: zip-Dateien.
  3. Es fehlen die erweiterten Eigenschaften wie bei Windows --> Rechte Maustaste --> Eigenschaften.

Weitere Funktionen fehlen bei entsprechenden Dateitypen, bei Bildern z.B.: die Anzeige / Vorschau Funktion.

 - z.B.: Exe Dateien können nicht als admin ausgeführt werden.
 - PDF, exe Dateien etc. haben eigene Favicons - im Explorer sehen alle Dateien exakt gleich aus - es fehlen die Icons.

> **Claude — Status (19.02.2026):**
> - ~~Kontextmenü fehlt~~ → **Umgesetzt** (v7.2.1 #91) — Vollständiges Kontextmenü wie Windows 11
> - ~~Keine Extraktion möglich~~ → **Umgesetzt** (v7.2.1 #91) — ZIP-Extraktion im Kontextmenü
> - ~~Erweiterte Eigenschaften fehlen~~ → **Umgesetzt** (v7.2.1 #99-100) — 4-Tab Eigenschaften-Dialog wie Windows Explorer (Allgemein, Sicherheit, Details, Vorgängerversionen)
> - ~~Exe als Admin ausführen~~ → **Umgesetzt** (v7.2.1 #91) — "Als Administrator ausführen" im Kontextmenü
> - ~~Bildvorschau~~ → **Umgesetzt** — Vorschau-Panel (Ctrl+P) für Bilder, PDF, DOCX, XLSX, Code (Monaco Editor)
> - ~~Datei-Icons~~ → **Umgesetzt** — `getFileIcon()` zeigt dateityp-spezifische Icons in der Explorer-Dateiliste (Verzeichnisbaum zeigt korrekterweise nur Ordner-Icons)
> - ~~ZIP-Komprimierung~~ → **Umgesetzt** (v7.2.1 #107) — "Als ZIP komprimieren" im Kontextmenü

### Terminal-Funktionen

- Terminal Funktion: Evtl. direkt als Admin aufrufbar? separate Funktion, damit nicht die ganze App als Admin gestartet werden muss?
 - Terminal Pfad ändert sich je nach dem im welchem Verzeichnis man sich befindet. Diese Funktion soll die Möglichkeit besitzen, deaktiviert zu werden, für menschen die das gar nicht mögen.
 - Terminal: Evtl. weitere Terminals einbauen, z.B.: ubuntu shell?

> **Claude:** Terminal ist teilweise umgesetzt (Multi-Shell: PowerShell/CMD/WSL). Echte Terminal-Emulation (xterm.js/PTY) fehlt noch → Issue #14. Admin-Terminal als separater Prozess ist technisch möglich, aber noch nicht geplant.

---

## Regeln

- Jedes Problem wird zuerst gründlich analysiert, bevor etwas geändert wird
- Nur echte Ursachen-Behebung — keine Schnelllösungen oder Workarounds
- Kein Issue wird als "erledigt" markiert, bis Simon es bestätigt hat
- Alle Beschreibungen in einfacher Sprache, keine Fachbegriffe

---

# Strategische Entscheidungen

## Entfernung: Netzwerk-Scanner (IP Scanner) — Umgesetzt ✓

**Entscheidung (18.02.2026):** Der gesamte Netzwerk-Scanner soll aus der App entfernt werden.

**Begründung:**
- ARP-Scan, Ping-Sweep und Port-Scanning werden von Enterprise-Virenscannern (CrowdStrike, Sentinel One, Carbon Black) als "Network Discovery" oder "Lateral Movement Reconnaissance" erkannt
- Die App könnte in Firmenumgebungen blockiert oder als Sicherheitsrisiko eingestuft werden
- Firewall-Manipulation (blockProcess) löst höchste Alarmstufe bei Endpoint-Protection aus
- Ein Festplattenanalyse-Tool hat keinen Business-Grund für Netzwerk-Scanning

**Was entfernt wird:**
- Aktiver Netzwerk-Scanner (scan_local_network, scan_network_active, scan_device_ports, get_smb_shares)
- Firewall-Verwaltung (get_firewall_rules, block_process, unblock_process)
- OUI-Datenbank (oui.rs)
- Netzwerk-Scan-UI (Geräte-Scanner Tab im Netzwerk-Monitor)

**Was BLEIBT (unbedenklich):**
- TCP-Verbindungen pro Prozess anzeigen (get_connections, get_grouped_connections) — liest nur lokale Daten
- Bandbreite/Traffic-Übersicht (get_bandwidth, get_bandwidth_history)
- DNS-Cache anzeigen/leeren (get_dns_cache, clear_dns_cache)
- WiFi-Info (get_wifi_info)
- Verbindungs-Verlauf und -Aufzeichnung

**Auswirkung auf Produktstrategie:**
- Stufe 2 "Netzwerk & Sicherheit" wird überarbeitet: Netzwerk-Scanner und Firewall-Verwaltung entfallen
- Issue #11 (Paketaufzeichnung) wird gestrichen — selbes AV-Risiko
- Issue #20 (Geräte falsch erkannt) wird obsolet
- GPO-Scanner und Sicherheits-Check bleiben (betreffen nur den lokalen PC)

**Status:** Umgesetzt (19.02.2026) — Frontend-Code entfernt (470 Zeilen), verwaiste Scanner-CSS bereinigt (105 Zeilen). Backend/Bridge hatten keine Scanner-Commands (nie implementiert). oui.rs bleibt (wird vom Verbindungs-Monitor benötigt).

---

## Entfernung: Registry Cleaner — Geplant

**Entscheidung (18.02.2026):** Der Registry Cleaner soll aus der App entfernt werden.

**Begründung:**
- Microsoft rät seit Jahren offiziell davon ab — bringt keinen messbaren Leistungsvorteil
- Registry-Manipulation wird von AV-Software als "Registry Tampering" oder "PUP" (Potentially Unwanted Program) gemeldet
- Haftungsrisiko: Wenn ein System nach Registry-Cleaning Probleme hat, wird der App die Schuld gegeben
- Vertrauensverlust: Seriöse IT-Profis meiden Tools die Registry-Cleaning anbieten

**Was entfernt wird:**
- scan_registry, clean_registry, export_registry_backup, restore_registry_backup
- Registry-Tab in der Sidebar (Bereinigung → Registry)
- Registry-bezogener Code in commands.rs

**Was BLEIBT:**
- Registry-LESEN (z.B. für Software-Audit, Autostart-Einträge, Privacy-Settings) — das ist normal und unbedenklich
- Autostart-Manager (liest/ändert Autostart-Einträge) — kein "Cleaner"

**Status:** Umgesetzt (19.02.2026) — Registry-Cleaner-Commands wurden nie ins Tauri portiert (K-1 Tiefenanalyse bestätigt). Verwaiste Registry-View-CSS entfernt (90 Zeilen). README aktualisiert.

---

# Netzwerk




## Erledigte Issues

→ Archiviert in [`archiv/erledigte-issues_v7.0-v8.0.md`](archiv/erledigte-issues_v7.0-v8.0.md)

| Issue | Thema | Bestätigt |
|-------|-------|-----------|
| #1 | X-Button beendet App zuverlässig | 11.02.2026 |
| #6 | Terminal-Breite + Fenster-Layout | 11.02.2026 |
| — | Swiss Security Suite (4 Module: Geräte-Scanner, Sicherheits-Check, PDF-Bericht, Hochrisiko-Alarm) | Implementiert |
| — | Netzwerk-Monitor Upgrade (Echtzeit-Polling, Verlauf-Tab) | Implementiert |
| — | IP-Scanner aus Netzwerk-Monitor entfernt (AV-Risiko) | 19.02.2026 |
| — | Verwaiste Scanner-CSS bereinigt (105 Zeilen) | 19.02.2026 |
| — | Eigenschaften-Dialog mit 4 Tabs (Allgemein, Sicherheit, Details, Vorgängerversionen) | 19.02.2026 |
| — | Eigenschaften-Dialog Performance: Rust-native statt PowerShell | 19.02.2026 |
| — | Letzte Electron-Fragmente bereinigt | 19.02.2026 |
| #2/#3 | Scandaten speichern + wiederherstellen | 19.02.2026 |
| #12 | WCAG-Kontrast vollständig lesbar | 19.02.2026 |
| — | Tiefenanalyse 25/25 Findings behoben (100%) | 19.02.2026 |

---

# Prioritäten-Reihenfolge

| Prio | Issue | Thema | Status |
|------|-------|-------|--------|
| ~~1~~ | ~~#2 + #3~~ | ~~Scandaten überall speichern + wiederherstellen~~ | Bestätigt 19.02.2026 |
| 2 | #7 | Intelligente Scandaten (Delta-Scan, Verlauf, Hintergrund) | Planung |
| 3 | #8 | Intelligenter Bloatware-Scanner (5-Stufen-Bewertung) | Planung |
| 4 | #9 | Apps-Kontrollzentrum (ersetzt "Updates"-Tab) | Planung |
| 5 | #10 | System-Profil (Hardware, Seriennummer, Hersteller-Links) | Größtenteils umgesetzt |
| 6 | #4 | Privacy Dashboard anwenderfreundlicher | Überarbeitung — wartet auf Test |
| 7 | #5 | PDF Vollansicht + Bearbeitung | Offen |
| ~~8~~ | ~~#11~~ | ~~Netzwerk-Paketaufzeichnung~~ | ENTFALLEN (AV-Risiko) |
| ~~9~~ | ~~#20~~ | ~~Netzwerk-Geräte falsch erkannt~~ | OBSOLET (Scanner wird entfernt) |
| ~~10~~ | ~~#12~~ | ~~WCAG-Kontrast vollständig WCAG 2.2 konform~~ | Bestätigt 19.02.2026 |
| 11 | #13 | Fenster-Bereiche frei verschiebbar/skalierbar | Größtenteils umgesetzt |
| 12 | #14 | Echte Terminal-Emulation (Farben, Cursor, interaktive Tools) | Teilweise |
| 13 | #15 | Vertrauens-System: Undo-Log mit Wiederherstellung | Teilweise |
| 14 | #16 | Backup-Modul (lokale/Netzwerk-Sicherung) | Geplant |
| 15 | #17 | KI-Integration (Cloud + Lokal) | Idee |
| 16 | #18 | Offline-Lizenzierung | Idee |
| 17 | #19 | MCP-Server — KI kann direkt auf die App zugreifen | Pausiert (Server-Code entfernt, Neuaufbau bei Bedarf) |

---

# Offene Issues

## Tiefenanalyse (19.02.2026, aktualisiert)

→ Vollständige Ergebnisse in [`issue_tiefenanalyse.md`](issue_tiefenanalyse.md)
**25 Findings:** 3 Kritisch, 8 Hoch, 8 Mittel, 6 Niedrig + 5 Optimierungsmöglichkeiten
**25/25 behoben (100%)** (Stand 19.02.2026)

**Bereits behoben:**
- ~~K-1: Scanner/Firewall/Registry-Cleaner~~ → nie ins Tauri portiert (Frontend entfernt)
- ~~K-2: CSP `unsafe-eval`~~ → entfernt
- ~~K-3: `delete_to_trash` ohne Pfadprüfung~~ → `validate_path()` hinzugefügt
- ~~H-1: `restore-window.ps1` suchte nach Electron~~ → auf Tauri aktualisiert
- ~~H-2: Tote Event-Listener~~ → 3 Listener entfernt (tray-action, open-folder, deep-search-progress)
- ~~H-3: Mutex `.unwrap()` Absturzgefahr~~ → `unwrap_or_else` + Hilfsfunktion
- ~~H-4: PowerShell-Fehler auf Englisch~~ → deutsche Meldungen
- ~~H-6: 18 Views ohne `destroy()`~~ → `destroy()` für alle Views hinzugefügt
- ~~H-7: activate/deactivate Pattern~~ → kein Handlungsbedarf (nur NetworkView braucht es, hat es)
- ~~H-8: system_score Stub-Anzeige~~ → Hinweis-Banner wenn keine Analysedaten
- ~~M-1: `#[allow(dead_code)]` auf ScanData~~ → entfernt
- ~~M-2: validate_path() Blocklist~~ → canonicalize + erweiterte Blocklist + Trailing-Backslash-Fix
- ~~M-4: Lese-Commands ohne Logging~~ → tracing::warn bei Systempfad-Zugriff
- ~~M-5: Battery-Polling ohne Akku-Check~~ → stoppt bei `hasBattery=false`
- ~~M-6: `open_external` URL-Validierung~~ → korrigiert
- ~~M-7: Ignorierter `_command` Parameter~~ → entfernt aus Backend + Bridge
- ~~M-8: Docs referenzieren Electron~~ → archiviert
- ~~N-4: blockierendes `std::fs::remove_file`~~ → auf `tokio::fs` umgestellt

**Abgeschlossen** — Alle 25 Findings behoben:
- ~~H-5: Terminal PTY~~ → ConPTY via portable-pty (echtes Pseudo-Terminal)
- ~~M-3: commands.rs aufteilen~~ → 8 Module (max. 947 Zeilen pro Datei)
- ~~N-1 bis N-6~~ → N-3 RAM-Logging, N-5 Security-Doku, N-6 unwrap-Fix, Rest kein Handlungsbedarf
- ~~O-1/O-4~~ → Modul-Split + differenzierte PS-Timeouts (30s/120s/300s)

## Log-Analyse Findings (19.02.2026)

> Analyse von 20 Log-Dateien (17.-19.02.2026, ~870 KB). **0 Fehler** in allen Logs — die App läuft stabil.

### ~~Finding L-1: Akku-Abfrage auf Desktop-PCs~~ — Behoben ✓
**Problem:** `get_battery_status` wird alle 30 Sekunden aufgerufen und gibt immer `hasBattery=false` zurück. Auf einem Desktop-PC ohne Akku: 54 unnötige PowerShell-Aufrufe in 12 Minuten.
**Lösung:** Bei `hasBattery=false` wird Polling per `clearInterval` sofort gestoppt.

### Finding L-2: Doppelte Verzeichnis-Abfragen (Niedrig)
**Problem:** Dieselben Ordner (Desktop, Dokumente, Downloads) werden 10x in 12 Minuten abgefragt, weil jeder Tab-Wechsel einen neuen `list_directory`-Aufruf auslöst.
**Lösung:** Kurzzeit-Cache (5-10 Sekunden) für `list_directory`-Ergebnisse.

### ~~Finding L-3: IP-Auflösung dauert 12+ Sekunden~~ — Behoben ✓
**Problem:** `resolve_ips` braucht konstant 12.2-12.3 Sekunden (DNS-Reverse-Lookup-Timeout). Die Firma-Namen erscheinen deshalb erst nach einem zweiten Refresh.
**Lösung:** DNS-WaitAll-Timeout von 10s/8s auf 3s verkürzt. Auflösbare IPs sind in <1s fertig, unerreichbare blockieren nicht mehr.

### ~~Finding L-4: Sicherheits-Check dauert 16-17 Sekunden~~ — Behoben ✓
**Problem:** `run_security_audit` ist der langsamste Befehl — 12 Prüfungen in einem einzigen PowerShell-Aufruf (Get-NetFirewallProfile, Get-MpComputerStatus, Get-BitLockerVolume, etc.).
**Lösung:** 12 Checks in 3 parallele Gruppen aufgeteilt (schnelle Registry-Reads, CIM/Defender, Windows Update) via `tokio::join!`. Laufzeit ~max(langsamste Gruppe) statt Summe aller Gruppen.

### ~~Finding L-5: Doppelte Laufwerk-Abfrage beim Start~~ — Behoben ✓
**Problem:** `Win32_LogicalDisk` wird beim App-Start zweimal innerhalb von 300ms aufgerufen — derselbe Datensatz wird doppelt abgefragt.
**Lösung:** `loadDrives()` verwendet jetzt die bereits vom Explorer geladenen Daten wieder.

**Status:** Alle behoben (L-1 bis L-5). L-2 Verzeichnis-Cache seit #104 implementiert (5s TTL, 10 Einträge).

---

## 2. Scandaten werden nicht wiederhergestellt

**Problem:** Wenn die App geschlossen und wieder geöffnet wird, sind die vorherigen Scan-Ergebnisse weg. Der Scan muss komplett neu durchgeführt werden, die Lüfter drehen hoch.

**Was bisher gemacht wurde:**
- Erstes Problem: App wurde nur versteckt statt beendet → Daten nie gespeichert (behoben mit Issue #1)
- Zweites Problem: Nur ein Teil der Scan-Daten wurde gespeichert (Ordnerstruktur ja, aber Datei-Details nein) → Behoben: Jetzt werden ALLE Scan-Daten vollständig gespeichert und wiederhergestellt
- Das betrifft auch die Duplikate, die Suche und die Dashboard-Übersicht — alles funktioniert jetzt nach einem Neustart

**Was Simon testen soll:**
1. App öffnen, einen Scan durchführen
2. App über den X-Button schliessen (nicht Task-Manager)
3. App wieder öffnen
4. Prüfen: Werden die vorherigen Scan-Ergebnisse automatisch angezeigt, ohne dass ein neuer Scan startet?
5. Prüfen: Zeigt die Dashboard-Übersicht Zahlen an (Bereinigung, alte Dateien, etc.)?

**Status:** Neuer Fix implementiert (vollständige Daten-Speicherung), wartet auf Simons Test

---

## 3. Ordnergrössen nicht überall sichtbar

**Problem:** Die Ordnergrössen (z.B. "4.2 GB") werden nicht bei allen Ordnern und nicht auf allen Laufwerken angezeigt. Manchmal braucht es einen neuen Scan — aber die Daten sollten aus der vorherigen Sitzung kommen.

**Simons Feedback:**
- Die Farben (rot/gelb/grün) sollen standardmässig aus sein — nur die Zahlen zeigen
- Ordnergrössen fehlen bei einigen Verzeichnissen
- Muss auf allen Laufwerken funktionieren
- Daten aus der vorherigen Sitzung müssen auch die Grössen mitbringen

**Was bisher gemacht wurde:**
- Der Explorer sucht jetzt automatisch die passenden Scan-Daten für das Laufwerk
- Farbmarkierungen sind standardmässig ausgeschaltet
- Windows-geschützte Ordner (z.B. "System Volume Information") können nicht gescannt werden — dort werden keine Grössen angezeigt, das ist normal

**Was Simon testen soll:**
1. App öffnen, Laufwerk C: scannen
2. Im Verzeichnisbaum prüfen: Werden Ordner und Grössen angezeigt?
3. Zu "Duplikate" wechseln: Kann ein Duplikat-Scan gestartet werden?
4. App schliessen und wieder öffnen
5. Prüfen: Wird der Verzeichnisbaum mit Grössen angezeigt (ohne neuen Scan)?
6. Prüfen: Funktioniert der Duplikat-Scan auch nach dem Neustart?

**Status:** Neuer Fix implementiert, wartet auf Simons Test

---

## 4. Privacy Dashboard — App-bewusste Empfehlungen

**Problem:** Das Privacy-Dashboard zeigt Einstellungen wie "Standort: Offen" an, aber ein normaler Benutzer versteht nicht, was das bedeutet und welche seiner Apps davon betroffen wären.

**Was bereits funktioniert (von Simon bestätigt):**
- Jede Einstellung hat eine verständliche Erklärung in einfacher Sprache
- Die Auswirkungen werden als Liste angezeigt

**Was überarbeitet wurde:**
- Jede Einstellung zeigt jetzt eine verständliche **Erklärung** an
- Neue Rubrik **"Was passiert beim Deaktivieren"** mit konkreten Auswirkungen
- Klare **Handlungsempfehlung** (Grün/Gelb/Rot) bei jeder Einstellung
- Bei "Offen" steht: "Diese Einstellung teilt Daten mit Microsoft oder Werbepartnern"
- Bei "Geschützt" steht: "Deine Daten werden nicht gesendet"

**Offene Punkte für später:**
- Windows-Update-Warnung: Hinweis dass Updates Einstellungen zurücksetzen können
- Regelmässige Prüfung der Einstellungen

**Status:** Überarbeitung implementiert, wartet auf Simons Test

---

## 5. PDF-Anzeige und -Bearbeitung

**Problem:** PDFs können zwar in der Vorschau (kleines Seitenfenster) geöffnet werden, aber:
- Keine Vollansicht — die PDF sollte als eigener Tab im Hauptfenster geöffnet werden können
- Keine Bearbeitungsfunktionen (markieren, kommentieren)
- Kein eigenes Fenster — man sollte die PDF in ein separates Fenster verschieben können

**Planung:**
1. **Tab-Ansicht:** PDF als eigenen Tab im Hauptfenster öffnen (wie ein Explorer-Tab)
2. **Losgelöstes Fenster:** Möglichkeit, die PDF in ein eigenständiges Fenster zu verschieben
3. **Bearbeitungsfunktionen:** Text markieren, Kommentare hinzufügen, Hervorhebungen setzen
4. **Druck/Export:** PDF drucken oder als kommentierte Version speichern

**Status:** Offen

---

## 7. Intelligente Scandaten — Delta-Scan, Verlauf, Hintergrund-Scan

> Baut auf Issue #2/#3 auf — die Grundlage (Daten korrekt speichern) muss zuerst stehen.

**Simons Idee:** Der Scan soll neu initialisiert werden, wenn z.B. mehr als 3 Programme installiert wurden oder grössere Änderungen am System gemacht wurden. Die Scandaten sollen auch von anderen Bereichen mitverwendet werden können.

### 7a. Delta-Scan (nur Änderungen scannen)
Statt jedes Mal alles komplett neu zu scannen (Lüfter, Wartezeit), erkennt die App was sich seit dem letzten Scan verändert hat und scannt nur das nach.
- "Seit dem letzten Scan wurden 2 Programme installiert und 15 GB neue Dateien angelegt"
- Bietet einen gezielten Nachscan an statt eines Komplett-Scans

### 7b. Scan-Verlauf über Zeit
Eine Art "Waage für die Festplatte":
- "Letzte Woche 45 GB frei, heute nur noch 38 GB — was ist passiert?"
- Welche Ordner wachsen am schnellsten?
- Trend-Anzeige: Geht der Speicherplatz langsam oder schnell zur Neige?

### 7c. Automatischer Hintergrund-Scan
- Beim Starten der App im Hintergrund prüfen ob sich etwas Wesentliches geändert hat
- Lautlos, ohne Lüfter, ohne Wartezeit
- Wenn Änderungen erkannt werden: dezenter Hinweis "3 neue Programme erkannt — Nachscan empfohlen"

### 7d. Scandaten übergreifend nutzen
- Die Speichergrössen-Daten sollen auch vom Bloatware-Scanner, Software-Audit und der Bereinigung verwendet werden

**Status:** Planung (Umsetzung nach Issue #2/#3)

---

## 8. Intelligenter Bloatware-Scanner

**Simons Idee:** Der Scanner braucht Intelligenz. Nicht-zertifizierte Software ist NICHT automatisch Bloatware. Aber zertifizierte Software KANN trotzdem Scam sein. "System ist sauber" ist unrealistisch. Ähnlich wie Malwarebytes, nur seriös.

### 8a. 5-Stufen-Bewertung (statt Ja/Nein)

| Stufe | Farbe | Bedeutung | Beispiel |
|-------|-------|-----------|----------|
| **Vertrauenswürdig** | Grün | Bekannter Hersteller, sauber | Firefox, 7-Zip, VLC |
| **Nicht zertifiziert** | Blau | Unbekannt, aber nicht gefährlich | Advanced IP Scanner |
| **Fragwürdig** | Gelb | Zertifiziert aber aggressive Werbung/Datensammlung | Avast, McAfee |
| **Bloatware** | Orange | Vorinstallierter Müll, frisst nur Platz | Hersteller-Trialware |
| **Risiko** | Rot | Bekannte Sicherheitsprobleme oder Scam | Reimage Repair, Driver Updater |

### 8b. "Was macht dieses Programm eigentlich?"
- Bei jeder App eine kurze, verständliche Beschreibung
- Oder: "Dieses Programm wurde von deinem PC-Hersteller vorinstalliert. Du hast es noch nie benutzt."

### 8c. Ressourcen-Verbrauch pro App
- Welche Apps fressen am meisten Festplattenplatz (inkl. Cache und Daten)?
- Welche Apps starten heimlich mit Windows?
- Eine Art "Stromrechnung" für jede App

### 8d. Hintergrund-Aktivität aufdecken
- "Diese App hat heute 47 Mal ins Internet gesendet, obwohl du sie gar nicht geöffnet hast"
- Ergänzung zum Netzwerk-Monitor

### 8e. Microsoft-Store Apps einbeziehen
- Nicht nur klassisch installierte Programme, sondern auch Store-Apps scannen

### 8f. Ehrliche Ergebnisse
- Nie "System ist sauber" anzeigen wenn es das nicht ist
- Ehrliche Zusammenfassung: "23 Programme geprüft — 18 vertrauenswürdig, 3 nicht zertifiziert, 2 fragwürdig"

**Status:** Planung

---

## 9. Apps-Kontrollzentrum (ersetzt den "Updates"-Tab)

**Simons Idee:** Der "Updates"-Tab soll zu einem "Apps"-Tab umgebaut werden.

### 9a. Alle Apps auf einen Blick
- Komplette Liste aller installierten Programme und Store-Apps
- Sortierung nach Name, Grösse, Installationsdatum, letzte Nutzung
- Automatische Gruppierung: Produktivität, Unterhaltung, System-Tools, Spiele, Sicherheit

### 9b. Direkte Deinstallation
- Programme direkt aus der App heraus deinstallieren
- Vorher anzeigen was entfernt wird (Grösse, zugehörige Daten)
- Nach der Deinstallation prüfen ob Reste übrig geblieben sind

### 9c. Update-Verfügbarkeit pro App
- Bei jeder App anzeigen ob ein Update vorhanden ist
- Ein-Klick-Update direkt aus der App

### 9d. Vergessene Apps finden
- "Diese 12 Programme hast du seit über 6 Monaten nicht mehr benutzt — zusammen belegen sie 8 GB"

### 9e. Aufräumen ohne Deinstallation
- "Spotify belegt 2.1 GB — davon sind 1.8 GB Cache. Soll ich den Cache leeren?"

### 9f. Neuinstallations-Helfer
- Liste aller Programme exportieren (für neuen PC oder Windows-Neuinstallation)

### 9g. Treiber → Hersteller-Links
- Hersteller erkennen: "Du hast ein Asus VivoBook mit Intel Core i7 und Nvidia RTX 4060"
- Direkte Links zum Intel Assistenten, Nvidia App, Hersteller-Support
- Seriennummer automatisch auslesen

**Status:** Planung

---

## 10. System-Profil — Dein Gerät auf einen Blick

**Idee:** Alle Informationen über den PC an einem Ort — praktisch für Support-Anfragen oder Treiber-Suche.

### 10a. Hardware-Übersicht
- Hersteller, Modell, Prozessor, Grafikkarte, Arbeitsspeicher, Festplatten

### 10b. Seriennummer und Garantie
- Automatisch auslesen — kein Laptop umdrehen
- Direkter Link zur Garantieprüfung beim Hersteller
- Windows-Produktschlüssel

### 10c. Hersteller-Links
- Support-Seite, Treiber-Download, Treiber-Tool (Intel/Nvidia/AMD)

### 10d. System-Zusammenfassung
- "Dein System auf einen Blick" als Karte im Dashboard
- Exportierbar als Text oder PDF (für Support-Anfragen)

**Was bereits umgesetzt ist:**
- Sidebar-Tab "System-Profil" mit 8 Karten (Gerät, OS, CPU, GPU, RAM, Festplatten, Netzwerk, Links)
- Seriennummer, Mainboard, BIOS automatisch ausgelesen
- Windows-Produktschlüssel (letzte 5 Zeichen) automatisch ausgelesen
- Hersteller-Links dynamisch generiert (Lenovo, Dell, HP, ASUS, Acer, MSI, Samsung, Microsoft)
- Treiber-Links für Intel, AMD, NVIDIA basierend auf CPU/GPU-Erkennung
- Text-Export ("Kopieren"-Button) für Support-Anfragen

**Was noch fehlt:**
- PDF-Export (aktuell nur Text-Copy)
- Dashboard-Karte "Dein System auf einen Blick"

**Status:** Größtenteils umgesetzt — wartet auf Simons Test

---

## ~~11. Netzwerk-Paketaufzeichnung~~ — ENTFALLEN

> **Gestrichen (18.02.2026):** AV-Software erkennt Paketaufzeichnung als verdächtige Aktivität. Siehe "Strategische Entscheidungen" oben.

---

## ~~20. Netzwerk-Geräte werden falsch erkannt~~ — OBSOLET

> **Entfallen (19.02.2026):** Der gesamte IP-Scanner wurde aus der App entfernt (AV-Risiko). Damit ist die Geräte-Erkennung nicht mehr relevant.
>
> **Hinweis:** Das Grundproblem "statische Listen statt dynamische Erkennung" bleibt als Lehre für andere Bereiche (Bloatware, Software-Kategorisierung) relevant — siehe CLAUDE.md Regel "VERBOTEN: Statische Listen für Erkennung/Discovery".

---

## 12. WCAG-Kontrast vollständig konform

**Problem:** Der Kontrast stimmt noch nicht überall mit WCAG 2.2 überein. Einige Farben sind auf dunklem Hintergrund schwer lesbar.

**Was bisher gemacht wurde:**
- 6 Kontrastverletzungen in v7.2 behoben
- Governance-Datei mit WCAG 2.2 AA Pflicht erstellt
- Akzentfarben nur noch für Rahmen/Hintergründe, nie für Inhaltstext
- **13.02.2026:** 11 Kontrastverletzungen in Optimizer und Netzwerk-Monitor behoben
- **13.02.2026 — Strukturelle Lösung:** Die Wurzelursache war, dass die Grundfarben selbst zu schwach waren. Alle 66 Stellen die diese Farben verwenden, hatten zu wenig Kontrast. Statt jede einzelne Stelle zu reparieren, wurden die Grundfarben selbst verstärkt — damit sind automatisch ALLE Texte in der gesamten App heller und besser lesbar. Zusätzlich wurde ein automatischer Prüfer erstellt, der alle 14 Bildschirme der App durchgeht und jeden einzelnen Text gegen seinen Hintergrund prüft. Ergebnis: **0 Verletzungen bei 1495 geprüften Text-Elementen** in 13 Views.

**Automatischer Schutz:**
- Ein Prüf-Script testet jetzt automatisch alle 14 Bildschirme der App auf Lesbarkeit
- Jeder Text wird gegen seinen tatsächlichen Hintergrund geprüft (auch bei halbtransparenten Schichten)
- Bei Verletzungen schlägt der Test fehl — so können Probleme nicht mehr unbemerkt entstehen

**Status:** In Prüfung — wartet auf Simons visuelle Bestätigung

---

## 13. Fenster-Bereiche frei verschiebbar/skalierbar

**Problem:** Aktuell sind alle Fenster-Bereiche (Terminal, Explorer, Vorschau) statisch. Man kann sie nicht vergrössern, verkleinern oder umplatzieren.

**Wunsch:** Die Bereiche sollen per Ziehen am Rand skalierbar sein (wie in VS Code). Terminal grösser machen, Vorschau kleiner — individuell anpassbar.

**Was bereits umgesetzt ist:**
- Sidebar: Per Drag am rechten Rand skalierbar (140–400px) wenn expandiert
- Vorschau-Panel: Per Drag am linken Rand skalierbar (250px–70% Fensterbreite)
- Terminal-Panel: Per Drag am oberen Rand skalierbar (120px–70% Fensterhöhe)

**Was noch fehlt:**
- Breiten/Höhen über Neustarts hinweg speichern (Preferences)
- Panels frei umplatzieren (z.B. Terminal nach rechts verschieben)

**Status:** Größtenteils umgesetzt — alle 3 Bereiche skalierbar

→ *Aus Visionen: "Resizable Panels / Fenster-Individualisierung"*

---

## 14. Echte Terminal-Emulation

**Problem:** Das Terminal ist noch textbasiert (Zeile für Zeile). Interaktive Programme (z.B. Claude CLI, SSH, nano) funktionieren nicht, weil Farben, Cursor-Steuerung und Tasteneingaben fehlen.

**Was bisher gemacht wurde:**
- Multi-Shell Support (PowerShell/CMD/WSL) in v7.2
- Shell-Selector, dynamische Prompts, Rechtsklick "Im Terminal öffnen"
- ConPTY-Backend via portable-pty v0.9 (echtes Pseudo-Terminal statt Pipe-I/O, v7.2.1 #106)
- terminal_resize() funktional (war zuvor Stub)

**Was noch fehlt:**
- Frontend: xterm.js einbauen (Farben, Cursor-Steuerung, Scroll, Maus-Events)
- Danach funktioniert automatisch auch Claude CLI im Terminal

**Status:** Teilweise — Backend fertig (ConPTY), Frontend-Emulation (xterm.js) fehlt

→ *Aus Visionen: "PowerShell-Integration" + "Claude CLI im Terminal"*

---

## 15. Vertrauens-System: Undo-Log mit Wiederherstellung

**Problem:** Wenn die App etwas löscht (Registry-Einträge, Dateien, Bloatware), gibt es keine Möglichkeit das rückgängig zu machen.

**Was bisher gemacht wurde:**
- Phase 1: Begründung + Risiko-Ampel für Registry-Cleaner und Software-Audit
- Phase 2: Vorschau/Dry-Run für Lösch-Aktionen

**Was noch fehlt:**
- Phase 3: Vollständiges Undo-Log mit Wiederherstellung (jede Aktion rückgängig machbar)

**Status:** Teilweise — Undo-Log fehlt noch

→ *Aus Visionen: "Vertrauen / Trust"*

---

## 16. Backup-Modul (lokale/Netzwerk-Sicherung)

**Simons Idee:** Direkt in der App eine Sicherung einrichten: Zielordner wählen (lokaler Pfad, Netzlaufwerk, OneDrive/Google Drive Sync-Ordner), nur geänderte Dateien sichern, optional automatisch nach Zeitplan.

**Status:** Geplant

→ *Aus Visionen: "Backup / Sicherung"*

---

## 17. KI-Integration (Cloud + Lokal)

**Simons Idee:** "Bring Your Own Brain" — keine eigene KI einbauen, nur die Schnittstellen:

**Cloud-Option:** User meldet sich via CLI an (Claude, Gemini, etc.). API-Key lokal verschlüsselt, direkte Verbindung PC → API.

**Lokal-Option:** Integration mit Ollama (localhost). App prüft ob Ollama läuft, zeigt installierte Modelle. 100% offline.

**Mögliche Anwendungen:**
- "Fasse dieses PDF zusammen"
- "Erkläre diesen Registry-Key"
- Active Knowledge Board neben jedem Textblock

**Status:** Idee — für spätere Version

→ *Aus Visionen: "BYOB" + "Notion-Modul"*

---

## 18. Offline-Lizenzierung

**Idee:** Lizenz-System das KEINE Internetverbindung braucht. Signierte Lizenz-Dateien die offline geprüft werden. Lifetime-Lizenz funktioniert auch wenn Server offline.

**Status:** Idee — für stabiles Release (v1.0.0)

→ *Aus Visionen: "Offline-Lizenzierung"*

---

## 19. MCP-Server — KI kann direkt auf die App zugreifen

**Simons Idee:** Die App soll einen sogenannten "MCP-Server" anbieten. Das ist eine Schnittstelle, über die eine KI (wie Claude, ChatGPT oder ein lokales Modell) direkt auf die App zugreifen kann — ohne dass der Nutzer Daten kopieren oder Screenshots machen muss.

**Was das bringen würde:**
- Du könntest deiner KI sagen: "Analysiere meinen PC und sag mir was ich aufräumen soll" — und die KI hat sofort Zugriff auf alle Scan-Ergebnisse, Netzwerkdaten, Datenschutz-Einstellungen und den System-Score
- Die KI sieht genau das, was du in der App siehst — nur automatisch
- Funktioniert mit jedem KI-Assistenten der das MCP-Protokoll unterstützt (Claude Desktop, Claude Code, und weitere)

**Konkret würde die KI folgendes können:**
- Festplatten-Scan starten und Ergebnisse analysieren
- Netzwerk-Verbindungen prüfen ("Wer telefoniert nach Hause?")
- Datenschutz-Einstellungen lesen und Empfehlungen geben
- System-Score abfragen und erklären was gut/schlecht ist
- Grosse Dateien und Duplikate finden
- Installierte Programme auflisten

**Sicherheit:**
- Der Server läuft nur lokal auf deinem PC (kein Internet nötig)
- Kann in den Einstellungen ein- und ausgeschaltet werden
- Keine Daten verlassen den Rechner

**Was umgesetzt wurde (v1.0):**
- MCP-Server läuft als eigenständiger Prozess (kein Internet, rein lokal)
- 10 Werkzeuge für die KI:
  - Laufwerke anzeigen (mit Speicherplatz)
  - Gespeicherte Scan-Ergebnisse lesen (grösste Dateien, Dateitypen)
  - Netzwerk-Verbindungen anzeigen (welches Programm verbindet sich wohin)
  - Datenschutz-Einstellungen prüfen (Werbe-ID, Cortana, Telemetrie, etc.)
  - System-Informationen (Hersteller, Modell, Prozessor, Grafikkarte, RAM)
  - Installierte Programme auflisten
  - Autostart-Programme anzeigen
  - Windows-Dienste anzeigen
  - Festplatten-Gesundheit (S.M.A.R.T.)
  - Bereinigungsvorschläge (Temp, Cache, Downloads)
- Konfiguration für Claude Code liegt bereit (`.mcp.json`)

**Was noch fehlt (für später):**
- Ein/Aus-Schalter in den App-Einstellungen
- Scan direkt über die KI starten (aktuell nur Lese-Zugriff)
- System-Score berechnen lassen

**Status:** Erste Version implementiert — wartet auf Simons Test

→ *Simons Idee vom 12.02.2026*

---

# Produktstrategie — Von der System-App zum IT-Werkzeugkasten

> Basierend auf der Markt- und Zielgruppenanalyse ([`recherche.md`](../planung/recherche.md)).
> Diese Strategie beschreibt den Weg von der heutigen System-App bis zum professionellen IT-Werkzeug in 4 Stufen.
> Jede Stufe baut auf der vorherigen auf. Nichts wird übersprungen.

---

## Warum 4 Stufen?

Die App vereint heute schon Funktionen, die man sonst nur in 5-6 verschiedenen Programmen findet (Speicheranalyse, Bereinigung, Netzwerk, Datenschutz, Explorer, Terminal). Das ist der Grundstein. Aber der Markt zeigt: Wer nur "PC aufräumen" anbietet, konkurriert mit kostenlosen Tools und hat es schwer.

Der Weg nach vorne führt über **schrittweise Erweiterung** — von der Einzelplatz-App zum IT-Werkzeug für Profis. Jede Stufe erschliesst neue Nutzergruppen und rechtfertigt den Preis besser.

| Stufe | Name | Wer profitiert davon? | Zeitrahmen |
|-------|------|-----------------------|------------|
| **1** | System-Werkzeugkasten | Alle Nutzer (Privatanwender, Power-User, Freelancer) | Aktuell — nächste Versionen |
| **2** | Netzwerk & Sicherheit | Power-User, Admins, sicherheitsbewusste Nutzer | Mittelfristig |
| **3** | IT-Dokumentation & Inventar | Admins, kleine IT-Abteilungen, Freelancer-IT | Langfristig |
| **4** | Fernwartung & Leichtes RMM | MSPs, Systemhäuser, IT-Dienstleister | Vision |

---

## Stufe 1 — System-Werkzeugkasten (Aktuell)

> **Ziel:** Die bestehenden Funktionen perfektionieren, fehlende Puzzlestücke ergänzen und das Vertrauen der Nutzer gewinnen.
> **Zielgruppe:** Power-User, Freelancer, Admins, technik-affine Privatanwender

### Was in dieser Stufe passiert

Die App hat bereits einen beeindruckenden Funktionsumfang. Jetzt geht es darum, das Vorhandene **zuverlässig, verständlich und vertrauenswürdig** zu machen. Denn im Markt gibt es viel Misstrauen gegenüber "Tuning-Tools" — wer hier Qualität zeigt, hebt sich sofort ab.

### Geplante Verbesserungen (Stufe 1)

#### 1.1 Ein-Klick Gesundheitscheck — "Diagnose-Knopf"

**Was es ist:** Ein einzelner Knopf im Dashboard, der den gesamten PC durchleuchtet und einen verständlichen Bericht erstellt.

**Was der Nutzer sieht:**
- "Dein PC auf einen Blick" — eine Zusammenfassung nach dem Scan
- Klare Handlungsempfehlungen: "5 Dinge, die du jetzt tun kannst"
- Ampel-Bewertung: Was ist gut (grün), was könnte besser sein (gelb), was ist kritisch (rot)
- Alles auf einer Seite, ohne durch 10 Tabs klicken zu müssen

**Warum das wichtig ist:** Die Recherche zeigt: Freelancer und weniger technische Nutzer wollen keine 100 Einstellungen durchgehen. Sie wollen **eine klare Antwort**: "Was stimmt nicht und was soll ich tun?" Genau das liefert der Diagnose-Knopf.

→ *Neues Feature, kein bestehendes Issue*

**Status:** Umgesetzt (19.02.2026) — Eigener Sidebar-Tab "Diagnose" in der Start-Gruppe. Prüft parallel: Festplattenplatz, S.M.A.R.T.-Gesundheit, Datenschutz-Einstellungen, Sicherheits-Check. Zeigt Gesamtbewertung (0–100), Ampel-Karten pro Kategorie und priorisierte Empfehlungen mit Direktlinks zu den betroffenen Bereichen. Keine neuen Backend-Commands nötig — nutzt bestehende APIs (getDrives, getDiskHealth, getPrivacySettings, runSecurityAudit). Ergebnisse werden gecacht und bei erneutem Aufruf sofort angezeigt.

---

#### 1.2 Intelligenter Bloatware-Scanner — Issue #8

**Was sich ändert:** Der Bloatware-Scanner bekommt ein 5-Stufen-Bewertungssystem statt einem simplen Ja/Nein.

**Was der Nutzer sieht:**
- Jedes Programm bekommt eine Bewertung: Vertrauenswürdig (grün), Nicht zertifiziert (blau), Fragwürdig (gelb), Bloatware (orange), Risiko (rot)
- Kurze Erklärung: "Dieses Programm wurde von deinem PC-Hersteller vorinstalliert. Du hast es noch nie benutzt."
- Ressourcenverbrauch pro App: Speicherplatz, Autostart-Einträge, Hintergrundaktivität
- Ehrliche Zusammenfassung: Nie "System ist sauber" wenn es das nicht ist

**Warum das wichtig ist:** Bestehende Bloatware-Scanner machen entweder Panik (alles ist rot!) oder sind zu harmlos. Die 5 Stufen geben eine ehrliche, differenzierte Einschätzung — genau das, was im Markt fehlt.

→ *Details: siehe Issue #8 weiter oben*

---

#### 1.3 System-Profil — Issue #10

**Was es ist:** Alle Informationen über den PC an einem Ort — Hardware, Seriennummer, Hersteller, Garantie.

**Was der Nutzer sieht:**
- "Dein Gerät auf einen Blick": Hersteller, Modell, Prozessor, Grafikkarte, RAM, Festplatten
- Seriennummer automatisch ausgelesen — kein Laptop umdrehen mehr
- Direkter Link zur Hersteller-Support-Seite und Treiber-Downloads
- Exportierbar als Text oder PDF (für Support-Anfragen: "Schick mir mal deine Systeminfos")

**Warum das wichtig ist:** Admins und Helpdesk-Mitarbeiter brauchen diese Infos ständig. Heute müssen sie dafür mehrere Windows-Dialoge durchklicken oder PowerShell-Befehle tippen. Ein Klick — alles da.

→ *Details: siehe Issue #10 weiter oben*

---

#### 1.4 Apps-Kontrollzentrum — Issue #9

**Was sich ändert:** Der "Updates"-Tab wird zum "Apps"-Tab umgebaut — alle Programme, Updates und Aufräum-Funktionen an einem Ort.

**Was der Nutzer sieht:**
- Alle installierten Programme und Store-Apps in einer Liste
- Sortierung nach Grösse, Installationsdatum, letzte Nutzung
- "Diese 12 Programme hast du seit 6 Monaten nicht benutzt — zusammen belegen sie 8 GB"
- Direkte Deinstallation, Cache leeren, Update-Prüfung
- Exportierbare Programmliste (für neuen PC oder Windows-Neuinstallation)

**Warum das wichtig ist:** Der aktuelle "Updates"-Tab ist zu eng gefasst. Nutzer wollen nicht nur Updates, sondern einen **Gesamtüberblick über ihre Programme** — was brauche ich, was kann weg, was frisst Platz?

→ *Details: siehe Issue #9 weiter oben*

---

#### 1.5 Intelligente Scandaten — Issue #7

**Was sich ändert:** Die App merkt sich nicht nur die Scan-Ergebnisse, sondern versteht auch Veränderungen über die Zeit.

**Was der Nutzer sieht:**
- Delta-Scan: "Seit dem letzten Scan wurden 2 Programme installiert und 15 GB neue Dateien angelegt"
- Trend-Anzeige: "Dein Speicherplatz wird alle 2 Wochen um ca. 3 GB weniger — bei dem Tempo ist die Platte in 4 Monaten voll"
- Hintergrund-Prüfung beim Start: dezenter Hinweis wenn sich etwas Wesentliches geändert hat

**Warum das wichtig ist:** Andere Tools zeigen immer nur den aktuellen Zustand. Aber die spannende Frage ist: **Was hat sich verändert?** Das hilft Problemen vorzubeugen statt sie nur zu beheben.

→ *Details: siehe Issue #7 weiter oben*

---

#### 1.6 Vertrauens-System vervollständigen — Issue #15

**Was noch fehlt:** Ein vollständiges Undo-Log — jede Aktion (Registry löschen, Dateien bereinigen, Bloatware entfernen) kann rückgängig gemacht werden.

**Warum das wichtig ist:** Die Recherche zeigt klar: Das grösste Hindernis für "Tuning-Tools" ist **Vertrauen**. Nutzer haben Angst, etwas kaputt zu machen. Ein Undo-Button nimmt diese Angst.

→ *Details: siehe Issue #15 weiter oben*

---

#### 1.7 Weitere Stufe-1-Aufgaben

| Issue | Was | Status |
|-------|-----|--------|
| #2/#3 | Scandaten korrekt speichern und wiederherstellen | Bestätigt 19.02.2026 |
| #4 | Privacy Dashboard verständlicher machen | Wartet auf Test |
| #5 | PDF Vollansicht und Bearbeitung | Offen |
| ~~#12~~ | ~~WCAG-Kontrast vollständig konform~~ | Bestätigt 19.02.2026 |
| #13 | Fenster-Bereiche frei verschiebbar | Größtenteils umgesetzt |
| #14 | Echte Terminal-Emulation | Teilweise |

---

### Stufe 1 — Zusammenfassung

| Was | Nutzen | Aufwand | Status |
|-----|--------|---------|--------|
| ~~Diagnose-Knopf~~ | ~~Sofortiger Überblick für alle Nutzer~~ | ~~Mittel~~ | Umgesetzt |
| Bloatware 5-Stufen (#8) | Ehrliche Bewertung, hebt sich von Konkurrenz ab | Mittel | Offen |
| ~~System-Profil (#10)~~ | ~~Admins sparen Zeit, Support wird einfacher~~ | ~~Klein~~ | Größtenteils |
| Apps-Kontrollzentrum (#9) | Alle Programme im Griff, vergessene Apps finden | Gross |
| Intelligente Scandaten (#7) | Veränderungen sichtbar machen, Delta-Scan | Gross |
| Undo-Log (#15) | Vertrauen aufbauen, Angst nehmen | Mittel |

**Ergebnis Stufe 1:** Ein ausgereiftes, vertrauenswürdiges System-Werkzeug das sich klar von CCleaner, TuneUp und Co. abhebt — durch Ehrlichkeit, Tiefe und Transparenz.

---

## Stufe 2 — Sicherheit & Systemanalyse

> **Ziel:** Die App wird zum Sicherheits-Werkzeug. Den eigenen PC gründlich verstehen und schützen.
> **Zielgruppe:** Admins, sicherheitsbewusste Power-User
>
> **Hinweis (18.02.2026):** Netzwerk-Scanner und Firewall-Verwaltung wurden gestrichen (AV-Risiko). Paketaufzeichnung (Issue #11) ebenfalls entfallen. Fokus liegt auf lokaler Systemanalyse.

### Was in dieser Stufe passiert

~~Die Grundlagen sind da: Netzwerk-Monitor, Geräte-Scanner, Verbindungs-Verlauf. Stufe 2 vertieft diese Funktionen und macht sie professioneller.~~ Stufe 2 fokussiert sich auf lokale Sicherheitsanalyse: GPO-Scanner, erweiterter Sicherheits-Check, Systemhärtung — alles ohne Netzwerk-Scanning.

### Geplante Verbesserungen (Stufe 2)

#### ~~2.1 Netzwerk-Paketaufzeichnung — Issue #11~~ ENTFALLEN

> Gestrichen am 18.02.2026 — AV-Software erkennt Paketaufzeichnung als verdächtige Aktivität. Siehe "Strategische Entscheidungen" oben.

---

#### 2.2 GPO-Scanner — Simons Idee

**Was es ist:** Ein Scan der Windows-Gruppenrichtlinien (GPOs), der potenziell problematische Einstellungen erkennt.

**Was der Nutzer sieht:**
- "Es gibt eine Richtlinie, die Windows-Updates verzögert — das kann zu Sicherheitslücken führen"
- "Diese Einstellung blockiert den Windows Store — gewollt oder versehentlich?"
- Kombiniert mit der Registry-Analyse: subtile Probleme sichtbar machen, die sonst Bluescreens oder Fehler verursachen
- Schritt-für-Schritt-Hilfe: welche übergeordnete Richtlinie das Problem verursacht

**Warum das wichtig ist:** GPO-Probleme sind eine der häufigsten Ursachen für schwer erklärbare Windows-Fehler. Kein bestehendes Consumer-Tool prüft GPOs — das wäre ein echtes Alleinstellungsmerkmal.

→ *Aus Simons Ideen Salat (oben in dieser Datei)*

---

#### 2.3 Erweiterter Sicherheits-Check

**Was sich ändert:** Der bestehende Sicherheits-Check wird umfassender.

**Was der Nutzer sieht:**
- Prüfung auf bekannte Schwachstellen (fehlende Patches, unsichere Einstellungen)
- Bewertung der Passwort-Richtlinien (Gastkonto ohne Passwort? Administrator-Konto aktiviert?)
- Verschlüsselungsstatus aller Laufwerke
- Netzwerk-Exposition: "Dein PC ist von 3 anderen Geräten im Netzwerk erreichbar auf Port 445 (Dateifreigabe)"
- Alles als druckbarer PDF-Bericht

**Warum das wichtig ist:** Die Recherche zeigt: Datenschutz und Sicherheit sind im DACH-Raum ein starkes Verkaufsargument. "100% Offline — Deine Daten gehören Dir" plus ein umfassender Sicherheits-Check ist ein Alleinstellungsmerkmal.

---

#### ~~2.4 Firewall-Verwaltung~~ ENTFALLEN

> Gestrichen am 18.02.2026 — Firewall-Manipulation löst höchste AV-Alarmstufe aus. Siehe "Strategische Entscheidungen" oben.

---

### Stufe 2 — Zusammenfassung (aktualisiert 18.02.2026)

| Was | Nutzen | Aufwand |
|-----|--------|---------|
| ~~Paketaufzeichnung (#11)~~ | ~~Sehen was Apps wirklich senden~~ | ~~Gross~~ ENTFALLEN |
| GPO-Scanner | Versteckte Probleme finden die sonst niemand findet | Mittel |
| Erweiterter Sicherheits-Check | Umfassender Schutz-Bericht | Mittel |
| ~~Firewall-Verwaltung~~ | ~~Programme blockieren ohne Fachwissen~~ | ~~Klein~~ ENTFALLEN |

**Ergebnis Stufe 2:** Die App wird zum "Sicherheits-Berater" — GPO-Scanner und Sicherheits-Check analysieren den lokalen PC gründlich, ohne Netzwerk-Aktivität die AV-Software alarmieren könnte.

---

## Stufe 3 — IT-Dokumentation & Inventar

> **Ziel:** Vom Einzelplatz-Tool zum Werkzeug für mehrere Geräte. IT-Verantwortliche können alle PCs dokumentieren und überblicken.
> **Zielgruppe:** IT-Admins in KMU, Freelancer-IT, kleine Systemhäuser
> **Paradigmenwechsel:** Die App denkt nicht mehr nur an "meinen PC", sondern an "alle PCs im Netzwerk"

### Was in dieser Stufe passiert

Hier wird es spannend für den Business-Markt. Bestehende IT-Dokumentations-Tools (Docusnap, Lansweeper) kosten tausende Euro und sind für kleine Umgebungen völlig überdimensioniert. Ein Admin mit 20-50 PCs braucht etwas Schlankes, Schnelles — und genau das kann die App werden.

### Geplante Verbesserungen (Stufe 3)

#### 3.1 System-Inventar über mehrere Geräte

**Was es ist:** Die App sammelt Informationen nicht nur vom eigenen PC, sondern auch von anderen Geräten im Netzwerk.

**Was der Nutzer sieht:**
- "Du betreust 15 PCs — hier ist der Überblick"
- Pro Gerät: Hardware, installierte Software, Sicherheitsstatus, Speicherplatz
- Warnungen: "3 Geräte haben seit 30 Tagen kein Windows-Update gemacht"
- Vergleich: "Auf welchen PCs fehlt diese Software?"

**Wie das funktioniert:**
- Variante A: Die App wird auf jedem PC installiert und meldet sich an einen zentralen PC
- Variante B: Ein Admin-PC scannt andere Geräte im Netzwerk (wenn Zugriffsrechte vorhanden)
- Alles lokal — keine Cloud, kein externer Server

---

#### 3.2 IT-Berichte und Export

**Was es ist:** Professionelle Berichte über den Zustand aller Geräte — für den Chef, den Kunden oder das Audit.

**Was der Nutzer sieht:**
- PDF-Bericht: "IT-Gesundheitsbericht Februar 2026 — 15 Geräte geprüft"
- Kapitel: Hardware-Übersicht, Software-Inventar, Sicherheitsbewertung, Empfehlungen
- Vergleich mit letztem Bericht: "Seit dem letzten Check wurden 3 Programme deinstalliert und 2 Sicherheitslücken geschlossen"

**Warum das wichtig ist:** MSPs und IT-Admins müssen regelmässig Bericht erstatten. Ein automatischer, professioneller Bericht spart Stunden — und sieht beim Kunden gut aus.

---

#### 3.3 Backup-Modul — Issue #16

**Was es ist:** Direkt in der App eine Sicherung einrichten.

**Was der Nutzer sieht:**
- Zielordner wählen: lokaler Pfad, Netzlaufwerk, OneDrive/Google Drive Sync-Ordner
- Nur geänderte Dateien sichern (inkrementell)
- Optional: automatisch nach Zeitplan
- "Letzte Sicherung: vor 3 Tagen — 147 Dateien gesichert (2.3 GB)"

→ *Details: siehe Issue #16 weiter oben*

---

#### 3.4 Hardware-Lebenszyklus

**Was es ist:** Die App verfolgt, wie alt die Hardware ist und wann Ersatz fällig wird.

**Was der Nutzer sieht:**
- "Deine Festplatte ist 4 Jahre alt und hat 23'000 Betriebsstunden — Erfahrungsgemäss halten Festplatten 5-7 Jahre"
- "Der Arbeitsspeicher-Auslastung liegt regelmässig bei 90% — ein Upgrade auf 16 GB würde helfen"
- Empfehlungen: Wann lohnt sich eine Aufrüstung, wann ein neuer PC?

---

### Stufe 3 — Zusammenfassung

| Was | Nutzen | Aufwand |
|-----|--------|---------|
| Multi-Geräte-Inventar | Alle PCs auf einen Blick | Sehr gross |
| IT-Berichte (PDF) | Professionelle Dokumentation automatisch | Gross |
| Backup-Modul (#16) | Datensicherung ohne Zusatz-Software | Gross |
| Hardware-Lebenszyklus | Vorausschauende Planung statt Überraschungen | Klein |

**Ergebnis Stufe 3:** Die App wird zum "IT-Assistenten" für kleine Umgebungen. Ein Admin mit 20 PCs hat alles im Griff — ohne teure Enterprise-Software. Das eröffnet den Business-Markt mit höherer Zahlungsbereitschaft.

**Preismodell-Erweiterung:** Ab Stufe 3 macht eine Business-Edition Sinn (z.B. pro Techniker-Lizenz oder pro Anzahl verwalteter Geräte), die den Preis rechtfertigt.

---

## Stufe 4 — Fernwartung & Leichtes RMM (Vision)

> **Ziel:** Die App wird zur leichtgewichtigen Alternative zu NinjaRMM, ConnectWise und Co. — ohne Cloud-Zwang, ohne Gerätegebühr.
> **Zielgruppe:** MSPs, Systemhäuser, IT-Dienstleister mit 10-200 betreuten Geräten
> **Achtung:** Dies ist die ambitionierteste Stufe. Sie verändert das Geschäftsmodell grundlegend.

### Warum diese Stufe wichtig ist

Die Recherche zeigt: Kleine MSPs im DACH-Raum zahlen oft 800+ Euro pro Monat für RMM-Software — oder verzichten ganz darauf und arbeiten manuell. Es gibt eine echte Marktlücke für ein **bezahlbares, schlankes RMM-Tool ohne Cloud-Zwang**.

Aber: Diese Stufe bringt auch die grössten Herausforderungen mit sich — Sicherheit, Support-Erwartungen und die Glaubwürdigkeit als Ein-Personen-Produkt.

### Geplante Funktionen (Stufe 4)

#### 4.1 Fernwartung (Remote-Desktop)

**Was es ist:** Von einem PC aus auf einen anderen zugreifen — ohne TeamViewer, ohne AnyDesk.

**Was der Nutzer sieht:**
- Host-Modus: "Erlaube Fernzugriff auf diesen PC"
- Client-Modus: "Verbinde dich mit einem anderen PC"
- Direkte Verbindung im lokalen Netzwerk (ohne Server)
- Optional: Verbindung über Internet mit verschlüsseltem Relay

**Vergleich:** TeamViewer Business kostet 400+ Euro pro Jahr. AnyDesk 10-20 Euro pro Monat. Eine integrierte Fernwartung in der App wäre ein enormes Verkaufsargument.

---

#### 4.2 Zentrales Dashboard

**Was es ist:** Ein Überblick über alle betreuten Geräte — welche sind online, welche haben Probleme, wo wird Aktion benötigt?

**Was der Nutzer sieht:**
- Alle Geräte in einer Übersicht mit Status-Ampel
- Alarme: "PC bei Kunde Müller hat seit 15 Tagen kein Update gemacht"
- Fernzugriff direkt aus dem Dashboard starten
- Gruppierung nach Kunde, Standort oder Kategorie

---

#### 4.3 Automatisierung & Monitoring

**Was es ist:** Die App überwacht Geräte im Hintergrund und meldet Probleme automatisch.

**Was der Nutzer sieht:**
- "Festplatte bei Kunde Schmidt ist zu 95% voll — Handlungsbedarf"
- "Antivirus-Definitionen auf 3 Geräten veraltet"
- Automatische Skript-Ausführung: z.B. Cache leeren, Temp-Dateien bereinigen
- Alles ohne dass der MSP aktiv werden muss — nur bei echten Problemen

---

#### 4.4 KI-Integration — Issue #17 + #19

**Was es ist:** Eine KI-Schnittstelle, über die ein KI-Assistent direkt auf die App zugreifen kann.

**Was der Nutzer sieht:**
- "Hey Claude, analysiere den PC von Kunde Müller und sag mir was zu tun ist"
- Die KI hat Zugriff auf Scan-Ergebnisse, Netzwerkdaten, Sicherheitsstatus
- Empfehlungen in einfacher Sprache
- Optional: lokales KI-Modell (Ollama) für 100% Offline-Betrieb

**Zwei Wege:**
- MCP-Server (Issue #19): KI-Assistenten greifen direkt auf die App-Daten zu
- BYOB — "Bring Your Own Brain" (Issue #17): Nutzer bringt seinen eigenen API-Key mit

→ *Details: siehe Issues #17 und #19 weiter oben*

---

#### 4.5 Offline-Lizenzierung — Issue #18

**Was es ist:** Ein Lizenz-System das ohne Internetverbindung funktioniert.

**Warum das hier reingehört:** Für MSPs und Unternehmen ist es wichtig, dass die Software auch in abgeschotteten Netzwerken funktioniert. Signierte Lizenzdateien, die offline geprüft werden — kein "nach Hause telefonieren".

→ *Details: siehe Issue #18 weiter oben*

---

### Stufe 4 — Zusammenfassung

| Was | Nutzen | Aufwand |
|-----|--------|---------|
| Fernwartung (Remote) | Kein TeamViewer/AnyDesk mehr nötig | Sehr gross |
| Zentrales Dashboard | Alle Geräte auf einen Blick | Sehr gross |
| Monitoring & Alarme | Probleme erkennen bevor der Kunde anruft | Gross |
| KI-Integration (#17/#19) | Intelligente Analyse und Empfehlungen | Gross |
| Offline-Lizenzierung (#18) | Funktioniert auch ohne Internet | Mittel |

**Ergebnis Stufe 4:** Die App wird zum "Schweizer Taschenmesser für IT-Profis" — ein schlankes, bezahlbares RMM das kein Cloud-Abo braucht und von einem einzigen Werkzeug aus alles abdeckt.

**Preismodell-Erweiterung:** Hier macht eine MSP-Edition Sinn:
- Basis-Edition (Einzelplatz): 89 Euro/Jahr — Stufe 1 + 2
- Business-Edition (Multi-Geräte): z.B. 199 Euro/Jahr — Stufe 1-3
- MSP-Edition (Fernwartung + Dashboard): z.B. 499 Euro/Jahr pro Techniker — Stufe 1-4
- Zum Vergleich: NinjaRMM kostet ca. 3-4 Euro pro Gerät/Monat → bei 50 Geräten = 2'400 Euro/Jahr

---

### Voraussetzungen für Stufe 4

Bevor Stufe 4 angegangen wird, müssen diese Bedingungen erfüllt sein:

1. **Stufe 1-3 müssen stabil laufen** — ein RMM-Tool das im Einzelplatzbetrieb Fehler hat, wird niemand remote einsetzen
2. **Sicherheitsaudit** — Fernzugriff ist ein Einfallstor. Der Code muss geprüft werden (evtl. externer Audit)
3. **Support-Struktur** — MSPs erwarten schnelle Hilfe bei Problemen. Als Ein-Personen-Projekt muss man ehrlich sein, was man leisten kann
4. **Rechtliche Grundlage** — Datenschutz (DSGVO), Auftragsverarbeitung (AVV) für MSPs, evtl. Firmengründung
5. **Community aufbauen** — Erste Nutzer aus Stufe 1-3 werden zu Botschaftern und Testern für Stufe 4

---

## Gesamtübersicht — Alle Issues nach Stufen

| Stufe | Issues | Neue Features |
|-------|--------|---------------|
| **1** | #2, #3, #4, #5, #7, #8, #9, #10, #12, #13, #14, #15 | Diagnose-Knopf |
| **2** | — | GPO-Scanner, Erweiterter Sicherheits-Check (Firewall/Paket entfallen) |
| **3** | #16 | Multi-Geräte-Inventar, IT-Berichte, Hardware-Lebenszyklus |
| **4** | #17, #18, #19 | Fernwartung, Zentrales Dashboard, Monitoring, Automatisierung |

---

## Wer ist die Zielgruppe pro Stufe?

Die Recherche identifiziert 6 Nutzergruppen. So passen sie zu den Stufen:

| Nutzergruppe | Stufe 1 | Stufe 2 | Stufe 3 | Stufe 4 |
|--------------|---------|---------|---------|---------|
| **Privatanwender** (PC aufräumen, Bloatware) | Kern | — | — | — |
| **Power-User** (alles in einem Tool) | Kern | Kern | — | — |
| **Freelancer** (kein IT-Support, wenig Zeit) | Kern | Nutzt mit | Nutzt mit | — |
| **IT-Admins** (schnelle Diagnose, portabel) | Kern | Kern | Kern | Nutzt mit |
| **MSPs** (viele Kunden-PCs, Kosten sparen) | Testet | Nutzt mit | Kern | Kern |
| **Kleine Unternehmen** (kein IT-Wissen) | — | — | Indirekt (via MSP) | Indirekt (via MSP) |

---

## Empfohlene Reihenfolge innerhalb Stufe 1

Basierend auf Aufwand, Nutzen und Abhängigkeiten:

| Schritt | Was | Begründung |
|---------|-----|------------|
| ~~1~~ | ~~Issue #2/#3 fertig testen (Scandaten)~~ | ~~Grundlage für alles Weitere~~ Bestätigt |
| 2 | Issue #4 fertig testen (Privacy Dashboard) | Bereits implementiert, wartet auf Test |
| ~~3~~ | ~~System-Profil (#10)~~ | ~~Klein, sofort sichtbarer Mehrwert~~ Größtenteils umgesetzt |
| 4 | Bloatware 5-Stufen (#8) | Differenzierung vom Wettbewerb |
| ~~5~~ | ~~Diagnose-Knopf (neu)~~ | ~~Bringt alles zusammen, "Wow-Effekt"~~ Umgesetzt |
| 6 | Apps-Kontrollzentrum (#9) | Grösseres Projekt, ersetzt bestehenden Tab |
| 7 | Intelligente Scandaten (#7) | Technisch aufwändig, baut auf #2/#3 auf |
| 8 | Undo-Log (#15) | Vertrauensaufbau, kann parallel laufen |
| 9 | Verbleibende Issues (#5, ~~#12~~, #13, #14) | Feinschliff und Qualität |

---

# Prozess-Verbesserungen

## Kommunikation KI ↔ Simon

**Simons Feedback:** Die KI verwendet zu viele Fachbegriffe. Simon ist der Endanwender — er will wissen was funktioniert und was nicht, nicht welche Dateien geändert wurden.

**Massnahme:** Kommunikations-Regel in der KI-Konfiguration hinterlegt.

## Änderungsprotokoll aufwerten

**Simons Wunsch:** Das Änderungsprotokoll soll zu einer detaillierten Release-Note-Datei aufgewertet werden. Alle Ursachen und Lösungen müssen festgehalten werden.

**Status:** Umgesetzt — Release-Stories im "Swiss Squirrel"-Stil unter [`docs/releases/`](../releases/). Technisches Änderungsprotokoll bleibt zusätzlich bestehen.

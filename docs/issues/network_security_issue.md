# Issue: Swiss Security Suite — Netzwerk & Sicherheits-Erweiterung

**Status:** Implementiert — wartet auf Abnahme
**Priorität:** Hoch
**Zielversion:** v8.0
**Erstellt:** 2026-02-11

---

## Ziel

Die Speicher Analyse App wird um drei neue Module erweitert, die zusammen eine umfassende Sicherheitsübersicht bieten: Lokale Geräte im Netzwerk erkennen, Sicherheitsstatus des Systems prüfen (mit Historie), und alles in einem professionellen PDF-Bericht zusammenfassen.

---

## Was bereits existiert (NICHT nochmal bauen!)

Diese Features sind bereits produktionsreif implementiert:

| Feature | Dateien | Status |
|---------|---------|--------|
| IP-zu-Firma-Auflösung (ip-api.com Batch) | `main/network.js` → `lookupIPs()` | Fertig (v7.5) |
| Länder-Flaggen + ISP-Anzeige | `renderer/js/network.js` | Fertig (v7.3) |
| Tracker-Erkennung (20+ Firmen-Patterns) | `main/network.js` → `COMPANY_PATTERNS` | Fertig (v7.5) |
| Gruppierte Verbindungen nach Prozess | `main/network.js` → `getGroupedConnections()` | Fertig (v7.3) |
| Echtzeit-Polling + Snapshot-Modus | `renderer/js/network.js` | Fertig (v7.3) |
| Firewall-Blockierung pro Prozess | `main/network.js` → `blockProcess()` | Fertig |
| System-Score (6 Kategorien, 0-100) | `main/system-score.js` | Fertig (v7.0) |
| CSV-Export | `renderer/js/export.js` | Fertig |

---

## Neue Module (zu implementieren)

### Modul 1: Local Network Scanner ("Geräte-Erkennung")

**Zweck:** Alle Geräte im lokalen Netzwerk (LAN) finden und anzeigen.

**Neue Dateien:**
- `main/network-scanner.js` — Backend-Modul

**Zu erweiternde Dateien:**
- `main/ipc-handlers.js` — Neue IPC-Handler registrieren
- `main/preload.js` — API-Surface erweitern
- `renderer/js/network.js` — Neue Sektion "Erkannte Geräte" im Netzwerk-Tab
- `renderer/index.html` — Falls HTML-Struktur angepasst werden muss

**Technische Umsetzung:**
- ARP-Table auslesen via PowerShell `Get-NetNeighbor` (bevorzugt) oder `arp -a`
- Für jedes Gerät ermitteln: IP, MAC-Adresse, Hostname, Vendor (MAC-Lookup)
- MAC-Vendor-Zuordnung: Lokale Lookup-Tabelle der häufigsten OUI-Prefixe (kein npm-Paket!)
- Ergebnis: Array von `{ ip, mac, vendor, hostname, state }`
- PowerShell: Zwingend `runPS()` aus `main/cmd-utils.js` verwenden (30s Timeout, UTF-8)
- Private IPs: `isPrivateIP()` aus `main/network.js` wiederverwenden

**UI-Anforderungen:**
- Neue Sektion/Sub-Tab "Lokale Geräte" innerhalb des bestehenden Netzwerk-Tabs
- Tabelle mit Spalten: Hostname | IP | MAC | Hersteller | Status
- "Scannen"-Button zum manuellen Auslösen
- Ladeindikator während des Scans

**IPC-Handler:**
- `scan-local-network` → Geräte-Scan starten, gibt Array zurück

**Fehlerbehandlung:**
- Offline/kein Netzwerk → Leere Liste + Hinweismeldung, kein Crash
- PowerShell-Timeout → Graceful Fallback auf `arp -a` Parsing

---

### Modul 2: Security Audit ("Sicherheits-Check")

**Zweck:** Umfassender Sicherheitsstatus des Windows-Systems mit Verlaufshistorie.

**Neue Dateien:**
- `main/security-audit.js` — Backend-Modul
- `renderer/js/security-audit.js` — Frontend-View

**Zu erweiternde Dateien:**
- `main/ipc-handlers.js` — Neue IPC-Handler
- `main/preload.js` — API-Surface erweitern
- `main/system-score.js` — Security-Kategorie zum Score hinzufügen
- `renderer/index.html` — Neuer Sidebar-Eintrag + View-Container
- `renderer/css/style.css` — Styles für Security-Audit-View

**Sicherheits-Checks (alle via PowerShell):**

| Check | PowerShell-Befehl | Bewertung |
|-------|-------------------|-----------|
| Firewall-Status | `Get-NetFirewallProfile` | Alle 3 Profile (Domain/Public/Private) aktiv = OK |
| Antivirus-Status | `Get-MpComputerStatus` (Defender) oder `Get-CimInstance -Namespace root/SecurityCenter2` | Aktiv + Signaturen aktuell = OK |
| BitLocker | `Get-BitLockerVolume` | C: verschlüsselt = OK |
| UAC-Level | Registry `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System` | EnableLUA=1 + ConsentPromptBehaviorAdmin ≤ 2 = OK |
| Letzter Reboot | `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` | Uptime > 30 Tage = Warnung |
| Lokale User-Accounts | `Get-LocalUser` | Unerwartete aktive Accounts = Warnung |
| Windows Defender Signaturen | `Get-MpComputerStatus` → `AntivirusSignatureLastUpdated` | Älter als 7 Tage = Warnung |

**Historisierung:**
- Ergebnis mit Timestamp speichern in `%APPDATA%/speicher-analyse/audit-history.json`
- Beim nächsten Scan: Vergleich mit letztem Ergebnis
- Änderungen hervorheben (z.B. "Firewall war beim letzten Scan aktiv, jetzt deaktiviert!")
- Maximal die letzten 50 Scans aufbewahren

**UI-Anforderungen:**
- Neuer Sidebar-Eintrag in Gruppe "Sicherheit" → Skill `/add-sidebar-tab` verwenden!
- Übersicht: Ampel-System (Grün/Gelb/Rot) pro Check
- Detail-Ansicht pro Check aufklappbar
- Historie-Sektion: Timeline der letzten Scans mit Diff-Anzeige
- "Jetzt prüfen"-Button

**IPC-Handler:**
- `run-security-audit` → Alle Checks ausführen, Ergebnis + Diff zurückgeben
- `get-audit-history` → Gespeicherte Historie laden

**System-Score-Integration:**
- Neue Kategorie "Sicherheit" (Gewichtung: 20%) zum bestehenden Score hinzufügen
- Bestehende Gewichtungen proportional anpassen (alle anderen von 100% auf 80% skalieren)
- Punktabzüge:
  - Firewall deaktiviert (ein Profil) = -20 Punkte
  - Kein aktiver Antivirus = -30 Punkte
  - BitLocker aus = -10 Punkte
  - UAC deaktiviert = -15 Punkte
  - Uptime > 30 Tage = -5 Punkte
  - Veraltete Signaturen = -10 Punkte

**Fehlerbehandlung:**
- BitLocker-Check erfordert ggf. Admin-Rechte → Graceful "Nicht prüfbar" statt Fehler
- Einzelne Checks dürfen fehlschlagen ohne den Rest zu blockieren (`Promise.allSettled`)
- PowerShell: Sequentiell ausführen (nicht parallel → Lesson: PS-Prozesse hungern sich gegenseitig aus)

---

### Modul 3: IT-Sicherheitsbericht (PDF-Export)

**Zweck:** Professioneller PDF-Bericht mit allen Sicherheits-Ergebnissen.

**Neue Dateien:**
- `renderer/js/report-gen.js` — PDF-Generator

**Zu erweiternde Dateien:**
- `renderer/js/app.js` — Report-Generator einbinden
- `renderer/index.html` — Script-Tag + Button
- `main/preload.js` — Falls IPC für Systemdaten benötigt wird

**Technische Umsetzung:**
- Zwingend `renderer/lib/html2pdf.bundle.min.js` verwenden (kein neues npm-Paket!)
- HTML-Template im Code aufbauen, dann via html2pdf in PDF konvertieren
- CSS-Grid für sauberes A4-Layout

**PDF-Inhalt:**
1. **Header:** Datum, PC-Name, Betriebssystem-Version
2. **System-Score:** Gesamtpunktzahl + Ampelfarbe + Kategorie-Breakdown
3. **Sicherheits-Check:** Ergebnisse des Security Audits (Ampel pro Check)
4. **Netzwerk-Übersicht:** Aktive Verbindungen (Top 10), erkannte Geräte, verdächtige Verbindungen
5. **Risiko-Liste:** Zusammenfassung aller Warnungen und Empfehlungen
6. **Footer:** "Erstellt mit Speicher Analyse" + Zeitstempel

**UI-Anforderungen:**
- "Bericht erstellen"-Button im Security-Audit-Tab
- Optional auch im Dashboard zugänglich
- Ladeindikator während PDF-Generierung
- Automatischer Download/Speichern-Dialog

**Fehlerbehandlung:**
- html2pdf-Fehler abfangen → Fehlermeldung statt Crash
- Fehlende Daten (z.B. kein Scan gemacht) → Hinweis im Bericht statt leere Sektion

---

### Modul 4: Hochrisiko-Länder-Alarm (Erweiterung Netzwerk-Monitor)

**Zweck:** Verbindungen in bekannte Hochrisiko-Länder rot markieren.

**Zu erweiternde Dateien:**
- `main/network.js` — Risiko-Bewertung hinzufügen
- `renderer/js/network.js` — Visuelle Warnung

**Technische Umsetzung:**
- Konfigurierbare Liste von Hochrisiko-Ländern (Default: RU, CN, KP, IR)
- In `getGroupedConnections()`: Feld `isHighRisk: true/false` pro aufgelöste IP setzen
- Basiert auf bereits vorhandener `lookupIPs()`-Funktion (Country-Code kommt schon zurück!)

**UI-Anforderungen:**
- Hochrisiko-Verbindungen rot hervorgehoben (ähnlich wie Tracker-Badge)
- Warnsymbol + Tooltip mit Land und Grund
- Optional: Zähler im Tab-Header "3 Hochrisiko-Verbindungen"

---

## Implementierungsreihenfolge

| Schritt | Modul | Abhängigkeiten | Skill |
|---------|-------|----------------|-------|
| 1 | Hochrisiko-Länder-Alarm | Keine (erweitert Bestehendes) | — |
| 2 | Local Network Scanner | Keine | `/new-feature network-scanner` oder `/add-ipc` |
| 3 | Security Audit | Keine | `/add-sidebar-tab security-audit Sicherheit` + `/new-feature` |
| 4 | System-Score-Integration | Security Audit muss fertig sein | — |
| 5 | PDF-Report | Security Audit + Network Scanner fertig | — |

---

## Technische Vorgaben (für alle Module)

- **Keine neuen npm-Pakete** — Nur vorhandene Libraries aus `renderer/lib/`
- **Async:** Niemals `execSync` — Immer `runPS()` aus `cmd-utils.js` oder `execFileAsync`
- **PowerShell:** Sequentiell ausführen, nie parallel (Lesson: gegenseitiges Aushungern)
- **PowerShell-Timeout:** Minimum 30 Sekunden (Lesson: Cold Start dauert 5-10+ Sek.)
- **IPC:** Alle Handler in `main/ipc-handlers.js` registrieren (Skill `/add-ipc` verwenden)
- **Preload:** API-Surface in `main/preload.js` via contextBridge exponieren
- **Fehlerbehandlung:** `try-catch` überall, `Promise.allSettled` für unabhängige Checks
- **Offline:** Netzwerk-APIs dürfen nie crashen → Fail-Silent mit Hinweismeldung
- **UI-Sprache:** Deutsch mit korrekten Umlauten (ä/ö/ü, nicht ae/oe/ue)
- **Dark/Light Theme:** Beide Themes berücksichtigen (CSS-Variablen verwenden)
- **WCAG:** Kontrastverhältnisse beachten — `--text-primary` für Inhalte, `--accent` nur für Rahmen

---

## Abnahme

Jedes Modul gilt erst als fertig, wenn Simon es getestet und bestätigt hat.
Reihenfolge der Abnahme: Modul für Modul, nicht alles auf einmal.

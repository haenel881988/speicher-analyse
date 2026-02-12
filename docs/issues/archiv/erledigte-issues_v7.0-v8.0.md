# Erledigte Issues — v7.0 bis v8.0

> Archiviert am 12.02.2026 — Diese Informationen werden fuer Release-Notes benoetigt.

---

## Issue #1: Schliess-Funktion (X-Button)

**Problem:** Beim Klicken auf das X (Schliessen) wurde die App nur versteckt, nicht beendet. Die App lief im Hintergrund weiter.

**Loesung:** Der X-Button beendet die App jetzt immer komplett. Kein Verstecken, keine Ausnahme.

**Status:** Bestätigt von Simon am 11.02.2026

---

## Issue #6: Fenster-Layout und Terminal-Breite

**Problem:** Das Terminal war viel zu breit und hat die Seitenleiste überdeckt.

**Loesung:** Das Terminal sitzt jetzt im richtigen Bereich und nimmt nur die Breite des mittleren Inhaltsbereichs ein. Seitenleiste und Vorschau bleiben sichtbar.

**Status:** Bestätigt von Simon am 11.02.2026

---

## Swiss Security Suite — Netzwerk & Sicherheits-Erweiterung (v8.0)

> Urspruenglich als separate Datei: `docs/issues/network_security_issue.md`
> Alle 4 Module wurden implementiert und sind in der App verfuegbar.

**Ziel:** Drei neue Module fuer umfassende Sicherheitsuebersicht: Lokale Geraete im Netzwerk erkennen, Sicherheitsstatus pruefen (mit Historie), PDF-Bericht.

### Was bereits vor v8.0 existierte (nicht nochmal gebaut)

| Feature | Status |
|---------|--------|
| IP-zu-Firma-Aufloesung (ip-api.com Batch) | Fertig (v7.5) |
| Laender-Flaggen + ISP-Anzeige | Fertig (v7.3) |
| Tracker-Erkennung (20+ Firmen-Patterns) | Fertig (v7.5) |
| Gruppierte Verbindungen nach Prozess | Fertig (v7.3) |
| Echtzeit-Polling + Snapshot-Modus | Fertig (v7.3) |
| Firewall-Blockierung pro Prozess | Fertig |
| System-Score (6 Kategorien, 0-100) | Fertig (v7.0) |
| CSV-Export | Fertig |

### Modul 1: Local Network Scanner ("Geräte-Erkennung") — Implementiert

- ARP-Table via PowerShell `Get-NetNeighbor` + `arp -a` Fallback
- Pro Gerät: IP, MAC, Hostname, Vendor (OUI-Lookup), State
- **Erweiterung (v7.2.1):** Aktiver Netzwerk-Scanner (Ping Sweep + Port Scan + OS-Erkennung + SMB-Shares)
- Parallelisierter Scan via PowerShell `ForEach-Object -Parallel`
- Sub-Tab "Lokale Geräte" im Netzwerk-Monitor
- Export als CSV

### Modul 2: Security Audit ("Sicherheits-Check") — Implementiert

- 7 Sicherheits-Checks: Firewall, Antivirus, BitLocker, UAC, Reboot, User-Accounts, Defender-Signaturen
- Ampel-System (Grün/Gelb/Rot) pro Check
- Historisierung in `%APPDATA%/speicher-analyse/audit-history.json`
- Vergleich mit letztem Scan + Änderungen hervorheben
- System-Score-Integration (Kategorie "Sicherheit", 20%)

### Modul 3: IT-Sicherheitsbericht (PDF-Export) — Implementiert

- Professioneller PDF-Bericht mit html2pdf.js
- Inhalt: System-Score, Sicherheits-Check, Netzwerk-Übersicht, Risiko-Liste
- "Bericht erstellen"-Button im Security-Audit-Tab

### Modul 4: Hochrisiko-Länder-Alarm — Implementiert

- Konfigurierbare Liste (Default: RU, CN, KP, IR)
- Rote Hervorhebung + Warnsymbol in Verbindungsliste
- Basiert auf vorhandener `lookupIPs()`-Funktion

---

## Netzwerk-Monitor Upgrade (v7.2.1) — Implementiert

> Dieses Upgrade wurde zusätzlich zur Swiss Security Suite umgesetzt.

### Echtzeit-Polling repariert
- Statt 3 einzelner Abfragen pro Aktualisierung nur noch 1 kombinierter Aufruf
- Überlappungsschutz verhindert Anfragestau
- Intervall auf 10 Sekunden erhöht

### Neuer "Verlauf"-Tab
- Netzwerk-Snapshots werden dauerhaft gespeichert (max. 200)
- Änderungen zwischen Snapshots werden hervorgehoben
- Export als CSV oder JSON

### Aktiver Netzwerk-Scanner
- Erkennt alle Geräte im lokalen Netzwerk per Ping
- Scannt offene Ports (SSH, HTTP, RDP, SMB etc.)
- Erkennt Betriebssystem (TTL-basiert)
- Zeigt freigegebene Ordner, Ping-Zeiten und Hersteller
- Fortschrittsanzeige während des Scans
- Export als CSV

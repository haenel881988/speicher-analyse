# Issues & Planung — Speicher Analyse

> Diese Datei gehört Simon. Nur Simon darf Issues als erledigt markieren.
> Die KI dokumentiert hier den Stand und die Planung in verständlicher Sprache.
> **Konsolidiert am 12.02.2026** — Alle offenen Scopes aus allen Dokumenten zusammengeführt.

---

## Regeln

- Jedes Problem wird zuerst gründlich analysiert, bevor etwas geändert wird
- Nur echte Ursachen-Behebung — keine Schnelllösungen oder Workarounds
- Kein Issue wird als "erledigt" markiert, bis Simon es bestätigt hat
- Alle Beschreibungen in einfacher Sprache, keine Fachbegriffe

---

## Simons Ideen Salat

 - Erweiterung vom Sicherheitscheck - oder unterregister mit einem GPO Scan. Dabei soll der Scan die GPOs scannen ob es potenziell problematische Einstellungen gibt, die zu Fehlern, bluescreens etc. führen, gerade kombiniert mit der Registry können so sehr subtile Probleme sichtbar gemacht werden, damit dann schritt für schritt das Problem behoben werden kann / evtl. auch welche übergeordnete GPO die Problematik verursacht.

 



## Erledigte Issues

→ Archiviert in [`archiv/erledigte-issues_v7.0-v8.0.md`](archiv/erledigte-issues_v7.0-v8.0.md)

| Issue | Thema | Bestätigt |
|-------|-------|-----------|
| #1 | X-Button beendet App zuverlässig | 11.02.2026 |
| #6 | Terminal-Breite + Fenster-Layout | 11.02.2026 |
| — | Swiss Security Suite (4 Module: Geräte-Scanner, Sicherheits-Check, PDF-Bericht, Hochrisiko-Alarm) | Implementiert |
| — | Netzwerk-Monitor Upgrade (Echtzeit-Polling, Verlauf-Tab, Aktiver Netzwerk-Scanner) | Implementiert |

---

# Prioritäten-Reihenfolge

| Prio | Issue | Thema | Status |
|------|-------|-------|--------|
| 1 | #2 + #3 | Scandaten überall speichern + wiederherstellen | Neuer Fix — wartet auf Simons Test |
| 2 | #7 | Intelligente Scandaten (Delta-Scan, Verlauf, Hintergrund) | Planung |
| 3 | #8 | Intelligenter Bloatware-Scanner (5-Stufen-Bewertung) | Planung |
| 4 | #9 | Apps-Kontrollzentrum (ersetzt "Updates"-Tab) | Planung |
| 5 | #10 | System-Profil (Hardware, Seriennummer, Hersteller-Links) | Planung |
| 6 | #4 | Privacy Dashboard anwenderfreundlicher | Überarbeitung — wartet auf Test |
| 7 | #5 | PDF Vollansicht + Bearbeitung | Offen |
| 8 | #11 | Netzwerk-Paketaufzeichnung (Deep Packet Inspection) | Idee |
| 9 | #12 | WCAG-Kontrast vollständig WCAG 2.2 konform | Teilweise umgesetzt |
| 10 | #13 | Fenster-Bereiche frei verschiebbar/skalierbar | Offen |
| 11 | #14 | Echte Terminal-Emulation (Farben, Cursor, interaktive Tools) | Teilweise |
| 12 | #15 | Vertrauens-System: Undo-Log mit Wiederherstellung | Teilweise |
| 13 | #16 | Backup-Modul (lokale/Netzwerk-Sicherung) | Geplant |
| 14 | #17 | KI-Integration (Cloud + Lokal) | Idee |
| 15 | #18 | Offline-Lizenzierung | Idee |

---

# Offene Issues

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

**Status:** Planung

---

## 11. Netzwerk-Paketaufzeichnung (Deep Packet Inspection)

**Simons Idee:** Nicht nur sehen WELCHE Programme ins Internet verbinden, sondern auch WAS sie genau senden und empfangen. Ähnlich wie Wireshark, aber einfach zu bedienen.

**Was das bringen würde:**
- Sehen welche Daten Apps wirklich nach Hause schicken
- "Diese App hat in den letzten 10 Minuten 47 MB an Google gesendet — was war das?"
- Verdächtige Verbindungen im Detail analysieren
- Beweise sammeln wenn eine App sich verdächtig verhält

**Mögliche Wege:**
1. Windows-Bordmittel: `netsh trace start capture=yes` (braucht Administratorrechte)
2. Externe Bibliothek: npcap + raw sockets (professioneller, aufwändiger)

**Status:** Idee — für spätere Version

---

## 12. WCAG-Kontrast vollständig konform

**Problem:** Der Kontrast stimmt noch nicht überall mit WCAG 2.2 überein. Einige Farben sind auf dunklem Hintergrund schwer lesbar.

**Was bisher gemacht wurde:**
- 6 Kontrastverletzungen in v7.2 behoben
- Governance-Datei mit WCAG 2.2 AA Pflicht erstellt
- Akzentfarben nur noch für Rahmen/Hintergründe, nie für Inhaltstext

**Was noch fehlt:**
- Vollständiger WCAG-Audit aller Views (jede Seite einzeln prüfen)
- Prüfung mit echten Kontrast-Tools (nicht nur Berechnung)

**Status:** Teilweise umgesetzt — vollständiger Audit steht aus

---

## 13. Fenster-Bereiche frei verschiebbar/skalierbar

**Problem:** Aktuell sind alle Fenster-Bereiche (Terminal, Explorer, Vorschau) statisch. Man kann sie nicht vergrössern, verkleinern oder umplatzieren.

**Wunsch:** Die Bereiche sollen per Ziehen am Rand skalierbar sein (wie in VS Code). Terminal grösser machen, Vorschau kleiner — individuell anpassbar.

**Status:** Offen

→ *Aus Visionen: "Resizable Panels / Fenster-Individualisierung"*

---

## 14. Echte Terminal-Emulation

**Problem:** Das Terminal ist noch textbasiert (Zeile für Zeile). Interaktive Programme (z.B. Claude CLI, SSH, nano) funktionieren nicht, weil Farben, Cursor-Steuerung und Tasteneingaben fehlen.

**Was bisher gemacht wurde:**
- Multi-Shell Support (PowerShell/CMD/WSL) in v7.2
- Shell-Selector, dynamische Prompts, Rechtsklick "Im Terminal öffnen"
- Grundlagen für xterm.js + node-pty vorbereitet (postinstall-Script für Build-Probleme)

**Was noch fehlt:**
- Echte Terminal-Emulation mit xterm.js (Farben, Cursor, Scroll, Maus)
- Danach funktioniert automatisch auch Claude CLI im Terminal

**Status:** Teilweise — Grundlage vorhanden, echte Emulation fehlt

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

# Prozess-Verbesserungen

## Kommunikation KI ↔ Simon

**Simons Feedback:** Die KI verwendet zu viele Fachbegriffe. Simon ist der Endanwender — er will wissen was funktioniert und was nicht, nicht welche Dateien geändert wurden.

**Massnahme:** Kommunikations-Regel in der KI-Konfiguration hinterlegt.

## Änderungsprotokoll aufwerten

**Simons Wunsch:** Das Änderungsprotokoll soll zu einer detaillierten Release-Note-Datei aufgewertet werden. Alle Ursachen und Lösungen müssen festgehalten werden.

**Status:** Offen — wird bei der nächsten grösseren Überarbeitung umgesetzt

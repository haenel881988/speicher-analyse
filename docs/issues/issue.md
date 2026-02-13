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
| 16 | #19 | MCP-Server — KI kann direkt auf die App zugreifen | Erste Version — wartet auf Test |

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
| #2/#3 | Scandaten korrekt speichern und wiederherstellen | Wartet auf Test |
| #4 | Privacy Dashboard verständlicher machen | Wartet auf Test |
| #5 | PDF Vollansicht und Bearbeitung | Offen |
| #12 | WCAG-Kontrast vollständig konform | Teilweise |
| #13 | Fenster-Bereiche frei verschiebbar | Offen |
| #14 | Echte Terminal-Emulation | Teilweise |

---

### Stufe 1 — Zusammenfassung

| Was | Nutzen | Aufwand |
|-----|--------|---------|
| Diagnose-Knopf | Sofortiger Überblick für alle Nutzer | Mittel |
| Bloatware 5-Stufen (#8) | Ehrliche Bewertung, hebt sich von Konkurrenz ab | Mittel |
| System-Profil (#10) | Admins sparen Zeit, Support wird einfacher | Klein |
| Apps-Kontrollzentrum (#9) | Alle Programme im Griff, vergessene Apps finden | Gross |
| Intelligente Scandaten (#7) | Veränderungen sichtbar machen, Delta-Scan | Gross |
| Undo-Log (#15) | Vertrauen aufbauen, Angst nehmen | Mittel |

**Ergebnis Stufe 1:** Ein ausgereiftes, vertrauenswürdiges System-Werkzeug das sich klar von CCleaner, TuneUp und Co. abhebt — durch Ehrlichkeit, Tiefe und Transparenz.

---

## Stufe 2 — Netzwerk & Sicherheit

> **Ziel:** Die App wird zum Sicherheits- und Netzwerk-Werkzeug. Nicht nur sehen was auf dem eigenen PC passiert, sondern auch was im Netzwerk los ist.
> **Zielgruppe:** Admins, sicherheitsbewusste Power-User, Heimnetzwerk-Enthusiasten

### Was in dieser Stufe passiert

Die Grundlagen sind da: Netzwerk-Monitor, Geräte-Scanner, Verbindungs-Verlauf. Stufe 2 vertieft diese Funktionen und macht sie professioneller.

### Geplante Verbesserungen (Stufe 2)

#### 2.1 Netzwerk-Paketaufzeichnung — Issue #11

**Was es ist:** Nicht nur sehen WELCHE Programme ins Internet verbinden, sondern auch WAS sie senden.

**Was der Nutzer sieht:**
- "Chrome hat in den letzten 10 Minuten 47 MB an Google gesendet — davon 12 MB an Werbe-Netzwerke"
- Verdächtige Verbindungen im Detail aufschlüsseln
- Beweise sammeln wenn eine App sich verdächtig verhält
- Einfacher als Wireshark, aber deutlich mehr als nur eine Verbindungsliste

**Warum das wichtig ist:** GlassWire macht etwas Ähnliches, kostet aber 35 Euro pro Jahr und kann nur Netzwerk. In der App wäre es ein Modul von vielen — mehr Wert für das Geld.

→ *Details: siehe Issue #11 weiter oben*

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

#### 2.4 Firewall-Verwaltung

**Was sich ändert:** Statt nur Firewall-Regeln anzuzeigen, kann der Nutzer sie auch verwalten.

**Was der Nutzer sieht:**
- "Diese App hat 14 Verbindungen ins Internet — möchtest du sie blockieren?"
- Ein-Klick Firewall-Regel erstellen, direkt aus dem Netzwerk-Monitor
- Übersicht: welche Programme dürfen ins Internet, welche nicht
- Vorlagen für häufige Szenarien: "Alle Telemetrie blockieren", "Nur Browser erlauben"

---

### Stufe 2 — Zusammenfassung

| Was | Nutzen | Aufwand |
|-----|--------|---------|
| Paketaufzeichnung (#11) | Sehen was Apps wirklich senden | Gross |
| GPO-Scanner | Versteckte Probleme finden die sonst niemand findet | Mittel |
| Erweiterter Sicherheits-Check | Umfassender Schutz-Bericht | Mittel |
| Firewall-Verwaltung | Programme blockieren ohne Fachwissen | Klein |

**Ergebnis Stufe 2:** Die App wird zum "Sicherheits-Berater" — nicht nur Speicher aufräumen, sondern den PC wirklich verstehen und schützen. Das spricht besonders Admins und sicherheitsbewusste Nutzer an.

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
| **2** | #11 | GPO-Scanner, Erweiterter Sicherheits-Check, Firewall-Verwaltung |
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
| 1 | Issue #2/#3 fertig testen (Scandaten) | Grundlage für alles Weitere |
| 2 | Issue #4 fertig testen (Privacy Dashboard) | Bereits implementiert, wartet auf Test |
| 3 | System-Profil (#10) | Klein, sofort sichtbarer Mehrwert |
| 4 | Bloatware 5-Stufen (#8) | Differenzierung vom Wettbewerb |
| 5 | Diagnose-Knopf (neu) | Bringt alles zusammen, "Wow-Effekt" |
| 6 | Apps-Kontrollzentrum (#9) | Grösseres Projekt, ersetzt bestehenden Tab |
| 7 | Intelligente Scandaten (#7) | Technisch aufwändig, baut auf #2/#3 auf |
| 8 | Undo-Log (#15) | Vertrauensaufbau, kann parallel laufen |
| 9 | Verbleibende Issues (#5, #12, #13, #14) | Feinschliff und Qualität |

---

# Prozess-Verbesserungen

## Kommunikation KI ↔ Simon

**Simons Feedback:** Die KI verwendet zu viele Fachbegriffe. Simon ist der Endanwender — er will wissen was funktioniert und was nicht, nicht welche Dateien geändert wurden.

**Massnahme:** Kommunikations-Regel in der KI-Konfiguration hinterlegt.

## Änderungsprotokoll aufwerten

**Simons Wunsch:** Das Änderungsprotokoll soll zu einer detaillierten Release-Note-Datei aufgewertet werden. Alle Ursachen und Lösungen müssen festgehalten werden.

**Status:** Umgesetzt — Release-Stories im "Swiss Squirrel"-Stil unter [`docs/releases/`](../releases/). Technisches Änderungsprotokoll bleibt zusätzlich bestehen.

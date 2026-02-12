# Issues & Planung — Speicher Analyse

> Diese Datei gehört Simon. Nur Simon darf Issues als erledigt markieren.
> Die KI dokumentiert hier den Stand und die Planung in verständlicher Sprache.

---

## Regeln

- Jedes Problem wird zuerst gründlich analysiert, bevor etwas geändert wird
- Nur echte Ursachen-Behebung — keine Schnelllösungen oder Workarounds
- Kein Issue wird als "erledigt" markiert, bis Simon es bestätigt hat
- Alle Beschreibungen in einfacher Sprache, keine Fachbegriffe

---

# Prioritäten-Reihenfolge

| Prio | Issue | Thema | Status |
|------|-------|-------|--------|
| 1 | #2 + #3 | Scandaten überall speichern + wiederherstellen | Neuer Fix nach Tiefenanalyse — wartet auf Simons Test |
| 2 | #7 | Intelligente Scandaten (Delta-Scan, Verlauf, Hintergrund) | Neu — Planung |
| 3 | #8 | Intelligenter Bloatware-Scanner (5-Stufen-Bewertung) | Neu — Planung |
| 4 | #9 | "Apps"-Kontrollzentrum (ersetzt "Updates"-Tab) | Neu — Planung |
| 5 | #10 | System-Profil (Hardware, Seriennummer, Hersteller-Links) | Neu — Planung |
| 6 | #4 | Privacy Dashboard anwenderfreundlicher | Überarbeitung implementiert — wartet auf Test |
| 7 | #5 | PDF Vollansicht + Bearbeitung | Offen |

---

# Erledigte Issues

## 1. Schliess-Funktion (X-Button)

**Problem:** Beim Klicken auf das X (Schliessen) wurde die App nur versteckt, nicht beendet. Die App lief im Hintergrund weiter.

**Lösung:** Der X-Button beendet die App jetzt immer komplett. Kein Verstecken, keine Ausnahme.

**Status:** Bestätigt von Simon am 11.02.2026

## 6. Fenster-Layout und Terminal-Breite

**Problem:** Das Terminal war viel zu breit und hat die Seitenleiste überdeckt.

**Lösung:** Das Terminal sitzt jetzt im richtigen Bereich und nimmt nur die Breite des mittleren Inhaltsbereichs ein. Seitenleiste und Vorschau bleiben sichtbar.

**Status:** Bestätigt von Simon am 11.02.2026

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
- Der Explorer sucht jetzt automatisch die passenden Scan-Daten für das Laufwerk, das du gerade anschaust
- Farbmarkierungen (rot/gelb/grün) sind standardmässig ausgeschaltet — nur die Zahlen werden angezeigt
- Wichtig: Ordner die Windows-geschützt sind (z.B. "System Volume Information") können nicht gescannt werden — dort werden keine Grössen angezeigt, das ist normal

**Simons Feedback (11.02.2026):**
Die Scandaten werden noch immer nicht korrekt wiederhergestellt, wenn die App geschlossen wird. Der Verzeichnisbaum wird auch nicht aktualisiert. Unter "Vergleich" und "Duplikate" wird nichts angezeigt. Das Thema scheint ein grösserer Bug zu sein.

**Was die Tiefenanalyse ergeben hat:**
Die App hat beim Speichern nur die Ordner-Struktur gesichert, aber NICHT die Datei-Details (welche Dateien wo liegen, wie gross sie sind). Deshalb waren nach einem Neustart folgende Bereiche leer:
- Duplikate: Braucht die Datei-Details um Dateien gleicher Grösse zu finden
- Suche: Braucht die Datei-Details um Dateinamen zu finden
- Dashboard-Übersicht: Die Analyse wurde nach dem Wiederherstellen gar nicht gestartet

**Was jetzt geändert wurde:**
- Die App speichert jetzt ALLE Scan-Daten vollständig (Ordner UND Dateien)
- Nach dem Wiederherstellen wird die Dashboard-Analyse automatisch im Hintergrund gestartet
- Duplikate, Suche und Vergleich funktionieren jetzt auch nach einem Neustart

**Was Simon testen soll:**
1. App öffnen, Laufwerk C: scannen
2. Warten bis der Scan fertig ist
3. Im Verzeichnisbaum prüfen: Werden Ordner und Grössen angezeigt?
4. Zu "Duplikate" wechseln und prüfen: Kann ein Duplikat-Scan gestartet werden?
5. App über den X-Button schliessen
6. App wieder öffnen
7. Prüfen: Wird der Verzeichnisbaum mit Grössen angezeigt (ohne neuen Scan)?
8. Prüfen: Zeigt die Dashboard-Übersicht Zahlen an?
9. Zu "Duplikate" wechseln und prüfen: Funktioniert der Duplikat-Scan auch nach dem Neustart?

**Status:** Neuer Fix implementiert (Tiefenanalyse + vollständige Überarbeitung), wartet auf Simons Test

---

## 4. Privacy Dashboard — App-bewusste Empfehlungen

**Problem:** Das Privacy-Dashboard zeigt Einstellungen wie "Standort: Offen" an, aber ein normaler Benutzer versteht nicht, was das bedeutet und welche seiner Apps davon betroffen wären.

**Was bereits funktioniert (von Simon bestätigt):**
- Jede Einstellung hat jetzt eine verständliche Erklärung in einfacher Sprache
- Die Auswirkungen werden als Liste angezeigt

**Was NICHT funktioniert (Simons Feedback):**
- Die App-Erkennung fehlt: Bei "Standort deaktivieren" sollte stehen welche installierten Apps (z.B. Google Maps, Wetter) betroffen wären — das wird nicht angezeigt
- Das Zusammenfassungs-Banner oben fehlt (z.B. "35 Apps analysiert — 5 sicher, 3 Vorsicht, 2 Risiko")
- Die Empfehlungs-Ampel (grün/gelb/rot) pro Einstellung fehlt

**Was jetzt geändert wurde (Überarbeitung):**
- Jede Einstellung zeigt jetzt eine verständliche **Erklärung** an (was diese Einstellung macht)
- Neue Rubrik **"Was passiert beim Deaktivieren"** mit konkreten Auswirkungen
- Klare **Handlungsempfehlung** bei jeder Einstellung:
  - Grün: "Deaktivieren empfohlen" — keine deiner Apps braucht das
  - Gelb: "Vorsicht" — einige deiner Apps könnten betroffen sein
  - Rot: "Nicht deaktivieren" — zu viele deiner Apps brauchen das
- Bei "Offen" steht jetzt: "Diese Einstellung teilt Daten mit Microsoft oder Werbepartnern"
- Bei "Geschützt" steht: "Deine Daten werden nicht gesendet"

**Offene Punkte für später:**
- Windows-Update-Warnung: Hinweis dass Updates Einstellungen zurücksetzen können
- Regelmässige Prüfung der Einstellungen (z.B. beim Scan automatisch mitprüfen)

**Status:** Überarbeitung implementiert, wartet auf Simons Test

---

## 5. PDF-Anzeige und -Bearbeitung

**Problem:** PDFs können zwar in der Vorschau (kleines Seitenfenster) geöffnet werden, aber:
- Keine Vollansicht — die PDF sollte als eigener Tab im Hauptfenster geöffnet werden können
- Keine Bearbeitungsfunktionen (markieren, kommentieren)
- Kein eigenes Fenster — man sollte die PDF in ein separates Fenster verschieben können

**Status:** Offen

**Planung:**
1. **Tab-Ansicht:** PDF als eigenen Tab im Hauptfenster öffnen (wie ein Explorer-Tab), nicht nur als Seitenvorschau
2. **Losgelöstes Fenster:** Möglichkeit, die PDF in ein eigenständiges Fenster zu verschieben
3. **Bearbeitungsfunktionen:** Text markieren, Kommentare hinzufügen, Hervorhebungen setzen
4. **Druck/Export:** PDF drucken oder als kommentierte Version speichern

---

## 7. Intelligente Scandaten — Delta-Scan, Verlauf, Hintergrund-Scan

> Baut auf Issue #2/#3 auf — die Grundlage (Daten korrekt speichern) muss zuerst stehen.

**Simons Idee:** Der Scan soll neu initialisiert werden, wenn z.B. mehr als 3 Programme installiert wurden oder grössere Änderungen am System gemacht wurden. Die Scandaten sollen auch von anderen Bereichen mitverwendet werden können.

**Was wir daraus machen:**

### 7a. Delta-Scan (nur Änderungen scannen)
Statt jedes Mal alles komplett neu zu scannen (Lüfter, Wartezeit), erkennt die App was sich seit dem letzten Scan verändert hat und scannt nur das nach.
- Die App merkt sich: "Seit dem letzten Scan wurden 2 Programme installiert und 15 GB neue Dateien angelegt"
- Bietet einen gezielten Nachscan an statt eines Komplett-Scans
- Spart Zeit und schont die Hardware

### 7b. Scan-Verlauf über Zeit
Eine Art "Waage für die Festplatte":
- "Letzte Woche 45 GB frei, heute nur noch 38 GB — was ist passiert?"
- Welche Ordner wachsen am schnellsten?
- Welche Apps sammeln am meisten Daten an?
- Trend-Anzeige: Geht der Speicherplatz langsam oder schnell zur Neige?

### 7c. Automatischer Hintergrund-Scan
- Beim Starten der App kurz im Hintergrund prüfen ob sich etwas Wesentliches geändert hat
- Lautlos, ohne Lüfter, ohne Wartezeit
- Wenn Änderungen erkannt werden: dezenter Hinweis "3 neue Programme erkannt — Nachscan empfohlen"

### 7d. Scandaten übergreifend nutzen
- Die Speichergrössen-Daten sollen auch vom Bloatware-Scanner, Software-Audit und der Bereinigung verwendet werden
- Kein Bereich muss separat scannen was ein anderer Bereich schon weiss

**Status:** Neu — Planung (Umsetzung nach Issue #2/#3)

---

## 8. Intelligenter Bloatware-Scanner

**Simons Idee:** Der Scanner braucht Intelligenz. Nicht-zertifizierte Software (wie Advanced IP Scanner) ist NICHT automatisch Bloatware. Aber zertifizierte Software (wie Avast, Reimage) KANN trotzdem Scam sein. "System ist sauber" ist unrealistisch — der Scan soll ehrlich sein. Ähnliche Funktion wie Malwarebytes, nur seriös.

**Was wir daraus machen:**

### 8a. 5-Stufen-Bewertung (statt Ja/Nein)
Jede App bekommt eine klare Einstufung:

| Stufe | Farbe | Bedeutung | Beispiel |
|-------|-------|-----------|----------|
| **Vertrauenswürdig** | Grün | Bekannter Hersteller, sauber | Firefox, 7-Zip, VLC |
| **Nicht zertifiziert** | Blau | Unbekannt, aber nicht gefährlich | Advanced IP Scanner |
| **Fragwürdig** | Gelb | Zertifiziert aber aggressive Werbung/Datensammlung | Avast, McAfee |
| **Bloatware** | Orange | Vorinstallierter Müll, frisst nur Platz | Hersteller-Trialware |
| **Risiko** | Rot | Bekannte Sicherheitsprobleme oder Scam-Verhalten | Reimage Repair, Driver Updater |

### 8b. "Was macht dieses Programm eigentlich?"
- Bei jeder App eine kurze, verständliche Beschreibung
- "Dieses Programm macht X. Du brauchst es für Y."
- Oder: "Dieses Programm wurde von deinem PC-Hersteller vorinstalliert. Du hast es noch nie benutzt."

### 8c. Ressourcen-Verbrauch pro App
- Welche Apps fressen am meisten Festplattenplatz (nicht nur Installation, auch Cache und Daten)?
- Welche Apps starten heimlich mit Windows und verlangsamen den Start?
- Welche Apps laufen im Hintergrund ohne dass man es merkt?
- Eine Art "Stromrechnung" für jede App

### 8d. Hintergrund-Aktivität aufdecken
- "Diese App hat heute 47 Mal ins Internet gesendet, obwohl du sie gar nicht geöffnet hast"
- Ergänzung zum Netzwerk-Monitor: Welche App steckt hinter welcher Verbindung?
- Ist diese Verbindung nötig oder sammelt die App nur Daten?

### 8e. Microsoft-Store Apps einbeziehen
- Nicht nur klassisch installierte Programme, sondern auch alle Apps aus dem Microsoft Store scannen
- Vollständige Übersicht über ALLES was auf dem System installiert ist

### 8f. Ehrliche Ergebnisse
- Nie "System ist sauber" anzeigen wenn es das nicht ist
- Stattdessen ehrliche Zusammenfassung: "23 Programme geprüft — 18 vertrauenswürdig, 3 nicht zertifiziert, 2 fragwürdig"
- Transparenz: WARUM wurde eine App so eingestuft?

**Status:** Neu — Planung

---

## 9. Apps-Kontrollzentrum (ersetzt den "Updates"-Tab)

**Simons Idee:** Der "Updates"-Tab soll zu einem "Apps"-Tab umgebaut werden. Alle installierten Apps auf einen Blick, direkt deinstallieren können, Update-Verfügbarkeit anzeigen. Treiber-Bereich entfernen — stattdessen: Hersteller erkennen, Seriennummer auslesen, direkt zum richtigen Treiber-Tool verlinken.

**Was wir daraus machen:**

### 9a. Alle Apps auf einen Blick
- Komplette Liste aller installierten Programme und Microsoft-Store Apps
- Sortierung nach Name, Grösse, Installationsdatum, letzte Nutzung
- Automatische Gruppierung: Produktivität, Unterhaltung, System-Tools, Spiele, Sicherheit

### 9b. Direkte Deinstallation
- Programme direkt aus der App heraus deinstallieren — kein Umweg über die Windows-Einstellungen
- Vorher anzeigen was entfernt wird (Grösse, zugehörige Daten)
- Nach der Deinstallation prüfen ob Reste übrig geblieben sind

### 9c. Update-Verfügbarkeit pro App
- Bei jeder App anzeigen ob ein Update vorhanden ist
- "Firefox 124.0 installiert — Version 126.0 verfügbar"
- Ein-Klick-Update direkt aus der App

### 9d. Vergessene Apps finden
- "Diese 12 Programme hast du seit über 6 Monaten nicht mehr benutzt — zusammen belegen sie 8 GB"
- Du entscheidest: behalten, deinstallieren, oder ignorieren

### 9e. Aufräumen ohne Deinstallation
- Manche Apps sammeln riesige Cache-Ordner an (Browser, Spotify, Teams, Discord)
- "Spotify belegt 2.1 GB — davon sind 1.8 GB Cache. Soll ich den Cache leeren?"
- Platz zurückgewinnen ohne die App zu verlieren

### 9f. Neuinstallations-Helfer
- Liste aller installierten Programme exportieren
- Bei einem neuen PC oder nach einer Windows-Neuinstallation: Checkliste was du wieder brauchst

### 9g. Treiber → Hersteller-Links
Statt einem eigenen Treiber-Bereich (der nie zuverlässig war):
- **Hersteller erkennen:** "Du hast ein Asus VivoBook mit Intel Core i7 und Nvidia RTX 4060"
- **Direkte Links:** Zum Intel Treiber- und Support-Assistenten, zur Nvidia App, zur Asus-Support-Seite
- **Empfehlung:** "Für Intel-Treiber verwende den Intel Assistenten — der Hersteller (Asus) kommt oft später mit Updates"
- **Seriennummer auslesen:** Wird automatisch angezeigt — kein Laptop umdrehen mehr nötig
- **Aufklärung:** Warum Hersteller-Updates besser sind als Dritt-Tools

**Status:** Neu — Planung

---

## 10. System-Profil — Dein Gerät auf einen Blick

**Idee:** Alle Informationen über deinen PC an einem Ort — praktisch wenn du den Support anrufen musst oder Treiber suchst.

**Was drin ist:**

### 10a. Hardware-Übersicht
- Hersteller und Modell (z.B. "Asus VivoBook Pro 16")
- Prozessor (z.B. "Intel Core i7-13700H")
- Grafikkarte (z.B. "Nvidia RTX 4060 Laptop")
- Arbeitsspeicher (z.B. "32 GB DDR5")
- Festplatten (z.B. "1 TB NVMe SSD — Samsung 980 Pro")

### 10b. Seriennummer und Garantie
- Seriennummer automatisch auslesen — kein Laptop umdrehen
- Wenn möglich: Direkter Link zur Garantieprüfung beim Hersteller
- Windows-Produktschlüssel (falls mal nötig)

### 10c. Hersteller-Links
- Direkter Link zur Support-Seite deines Herstellers
- Link zum Treiber-Download für dein Modell
- Link zum passenden Treiber-Tool (Intel Assistent, Nvidia App, AMD Software)

### 10d. System-Zusammenfassung
- "Dein System auf einen Blick" als Karte im Dashboard
- Alles was der Support am Telefon fragt, ist schon da
- Exportierbar als Text oder PDF (für Support-Anfragen)

**Status:** Neu — Planung

---

# Prozess-Verbesserungen

## Kommunikation KI ↔ Simon

**Simons Feedback:** Die KI verwendet zu viele Fachbegriffe, die Simon nicht versteht. Simon ist der Endanwender — er will wissen was funktioniert und was nicht, nicht welche Dateien geändert wurden.

**Massnahme:** Neue Kommunikations-Regel in der KI-Konfiguration hinterlegt:
- Keine technischen Begriffe in Issue-Updates
- Beschreiben was der User SIEHT, nicht was im Code passiert
- Bestätigungen als funktionale Tests formulieren ("Öffne X und prüfe ob Y sichtbar ist")

## Änderungsprotokoll aufwerten

**Simons Wunsch:** Das Änderungsprotokoll soll zu einer detaillierten Release-Note-Datei aufgewertet werden. Alle Ursachen und Lösungen müssen festgehalten werden, damit nachvollziehbar ist warum Probleme auch nach mehreren Versuchen bestehen bleiben.

**Status:** Offen — wird bei der nächsten grösseren Überarbeitung umgesetzt

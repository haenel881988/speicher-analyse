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
- Tiefenanalyse abgeschlossen: Wenn du mehrere Laufwerke gescannt hattest, hat der Explorer bisher immer nur das zuletzt gescannte Laufwerk benutzt — selbst wenn die Daten für das andere Laufwerk noch da waren
- Fix: Der Explorer sucht jetzt automatisch die passenden Scan-Daten für das Laufwerk, das du gerade anschaust
- Farbmarkierungen (rot/gelb/grün) sind standardmässig ausgeschaltet — nur die Zahlen werden angezeigt
- Wichtig: Ordner die Windows-geschützt sind (z.B. "System Volume Information") können nicht gescannt werden — dort werden keine Grössen angezeigt, das ist normal

**Was Simon testen soll:**
1. Laufwerk C: scannen
2. Laufwerk D: scannen (falls vorhanden)
3. Im Explorer zwischen C: und D: hin und her navigieren
4. Prüfen: Werden die Ordnergrössen auf beiden Laufwerken als Zahlen angezeigt?
5. App schliessen und wieder öffnen — werden die Grössen wiederhergestellt?

**Simons Feedback (11.02.2026):**
Die Scandaten werden noch immer nicht korrekt wiederhergestellt, wenn die App geschlossen wird. Irgendwie spackt das mit der speicherscan, speicherwiederherstellung / speicheranzeige.

Der Verzeichnisbaum wird auch nicht aktualisiert, muss scan erneut durchgeführt werden.
Unter "Vergleich" wird gleich gar nichts angezeigt, sowie auch unter Duplikate nichts.

Das Thema  mit den speichergrössen / darstellung etc. scheint ein grösserer bug zu sein. Es ist zwingennd erforderlich dass eine vertiefte  bug analyse durchgeführt werden muss mithilfe den Skills.

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

**Was bisher gemacht wurde:**
- Tiefenanalyse abgeschlossen: Die App-Erkennung und das Zusammenfassungs-Banner funktionieren — aber die Analyse aller installierten Programme braucht ca. 30-60 Sekunden
- Bisher wurde in dieser Zeit nichts angezeigt, man dachte die Funktion sei kaputt
- Fix: Jetzt erscheint sofort ein Lade-Hinweis "App-Analyse läuft..." mit einem Lade-Symbol, sobald das Privacy-Dashboard geöffnet wird
- Wenn die Analyse fertig ist, erscheint automatisch das Banner und die App-Tags
- Bei einem Fehler wird eine "Erneut versuchen"-Taste angezeigt

**Was Simon testen soll:**
1. Privacy-Dashboard öffnen
2. Prüfen: Erscheint sofort ein Lade-Hinweis "App-Analyse läuft..."?
3. 30-60 Sekunden warten
4. Prüfen: Erscheint dann ein Banner "X installierte Programme analysiert"?
5. Prüfen: Zeigt jede Einstellung betroffene Apps (z.B. "Google Maps", "Spotify")?
6. Prüfen: Hat jede Einstellung ein farbiges Symbol (grün/gelb/rot)?

**Simons Feedback (11.02.2026):**
Gute Umsetzung, jedoch ist das Privacy-Dashboard für einen Laien nicht hilfreich. Soll er das jetzt schützen oder nicht? Generell muss ich wissen, welche Einstellungen welche Auswirkungen auf mein System haben. Achtung: Windows-Updates können die Einstellungen unbrauchbar machen.

**Was jetzt geändert wurde (Überarbeitung):**
- Jede Einstellung zeigt jetzt eine verständliche **Erklärung** an (was diese Einstellung macht)
- Neue Rubrik **"Was passiert beim Deaktivieren"** mit konkreten Auswirkungen
- Klare **Handlungsempfehlung** bei jeder Einstellung:
  - Grün: "Deaktivieren empfohlen" — keine deiner Apps braucht das
  - Gelb: "Vorsicht" — einige deiner Apps könnten betroffen sein
  - Rot: "Nicht deaktivieren" — zu viele deiner Apps brauchen das
- Bei "Offen" steht jetzt: "Diese Einstellung teilt Daten mit Microsoft oder Werbepartnern"
- Bei "Geschützt" steht: "Deine Daten werden nicht gesendet"
- Technische Details (Registry-Pfade) wurden aus der Anzeige entfernt

**Was Simon testen soll:**
1. Privacy-Dashboard öffnen
2. 30-60 Sekunden warten bis die App-Analyse fertig ist
3. Prüfen: Zeigt jede Einstellung eine verständliche Erklärung?
4. Prüfen: Gibt es bei jeder Einstellung eine klare Empfehlung (grün/gelb/rot)?
5. Prüfen: Steht bei "Offen"-Einstellungen was das konkret bedeutet?
6. Prüfen: Ist jetzt klar, welche Einstellungen deaktiviert werden sollten und welche nicht?

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

**Bisherige Geschichte:**
- Iteration 1-4: PDF liess sich gar nicht öffnen (Fehler)
- Iteration 5: PDF öffnet sich jetzt in der Vorschau
- Iteration 6 (aktuell): Funktioniert nur als kleine Vorschau, nicht als Vollansicht

**Status:** Offen

**Planung:**
1. **Tab-Ansicht:** PDF als eigenen Tab im Hauptfenster öffnen (wie ein Explorer-Tab), nicht nur als Seitenvorschau
2. **Losgelöstes Fenster:** Möglichkeit, die PDF in ein eigenständiges Fenster zu verschieben
3. **Bearbeitungsfunktionen:** Text markieren, Kommentare hinzufügen, Hervorhebungen setzen
4. **Druck/Export:** PDF drucken oder als kommentierte Version speichern

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

---

# Prioritäten-Reihenfolge

| Prio | Issue | Status |
|------|-------|--------|
| 1 | Scandaten + Ordnergrössen (#2 + #3) | Neuer Fix nach Tiefenanalyse — wartet auf Simons Test |
| 2 | Privacy Dashboard (#4) | Überarbeitung geplant — anwenderfreundlicher gestalten |
| 3 | PDF Vollansicht (#5) | Offen — Planung und Umsetzung |

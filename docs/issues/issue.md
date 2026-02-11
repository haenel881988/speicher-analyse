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

---

# Offene Issues

## 2. Scandaten werden nicht wiederhergestellt

**Problem:** Wenn die App geschlossen und wieder geöffnet wird, sind die vorherigen Scan-Ergebnisse weg. Der Scan muss komplett neu durchgeführt werden, die Lüfter drehen hoch.

**Was bisher gemacht wurde:** Das Problem hing mit Issue #1 zusammen — weil die App nicht richtig geschlossen wurde (nur versteckt), wurden die Daten nie gespeichert. Seit dem Fix von Issue #1 sollte das korrekte Speichern und Wiederherstellen funktionieren.

**Was Simon testen soll:**
1. App öffnen, einen Scan durchführen
2. App über den X-Button schliessen (nicht Task-Manager)
3. App wieder öffnen
4. Prüfen: Werden die vorherigen Scan-Ergebnisse automatisch angezeigt, ohne dass ein neuer Scan startet?

**Status:** Fix implementiert, wartet auf Simons Test

---

## 3. Ordnergrössen nicht überall sichtbar

**Problem:** Die Ordnergrössen (z.B. "4.2 GB") werden nicht bei allen Ordnern und nicht auf allen Laufwerken angezeigt. Manchmal braucht es einen neuen Scan — aber die Daten sollten aus der vorherigen Sitzung kommen.

**Simons Feedback:**
- Die Farben (rot/gelb/grün) sollen standardmässig aus sein — nur die Zahlen zeigen
- Ordnergrössen fehlen bei einigen Verzeichnissen
- Muss auf allen Laufwerken funktionieren
- Daten aus der vorherigen Sitzung müssen auch die Grössen mitbringen

**Status:** Offen — Tiefenanalyse nötig

**Planung:**
1. **Analyse:** Die App starten und systematisch prüfen, welche Ordner keine Grössen zeigen (direkt nach dem Start mit gespeicherten Daten, und nach einem frischen Scan)
2. **Ursache finden:** Herausfinden warum bestimmte Ordner keine Grössen haben — liegt es am Scan, am Speichern, am Wiederherstellen, oder an der Anzeige?
3. **Fix:** Die eigentliche Ursache beheben (keine Workarounds)
4. **Farben:** Prüfen dass die Farbmarkierungen wirklich standardmässig aus sind
5. **Test:** Auf mindestens 2 verschiedenen Laufwerken testen

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

**Status:** Teilweise implementiert, App-Erkennung nicht sichtbar — Tiefenanalyse nötig

**Planung:**
1. **Analyse:** Herausfinden warum die App-Erkennung zwar im Hintergrund existiert, aber nicht in der Anzeige ankommt
2. **Fix:** Die Verbindung zwischen App-Erkennung und Anzeige reparieren
3. **Sichtbar machen:** Bei jeder Einstellung die betroffenen Apps als kleine Tags anzeigen (z.B. "Google Maps", "Spotify", "Facebook")
4. **Banner:** Oben im Dashboard eine Zusammenfassung anzeigen: "X installierte Apps analysiert"
5. **Ampel:** Grün (keine Apps betroffen = sicher deaktivierbar), Gelb (wenige Apps betroffen), Rot (viele Apps betroffen)

**Akzeptanzkriterien — was Simon sehen soll:**
- [ ] Bei "Standort" steht z.B.: "Google Maps, Facebook können nicht mehr auf deinen Standort zugreifen"
- [ ] Bei "Werbe-ID" steht z.B.: "Spotify, Steam zeigen weniger passende Werbung"
- [ ] Oben im Dashboard steht eine Zusammenfassung wie viele Apps analysiert wurden
- [ ] Jede Einstellung hat ein farbiges Symbol: grün, gelb oder rot
- [ ] Alle Texte sind verständlich ohne IT-Kenntnisse

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

## 6. Fenster-Layout und Terminal-Breite

**Problem:** Das Terminal (Kommandozeile unten) ist viel zu breit — es nimmt die gesamte Fensterbreite ein und überdeckt die Seitenleiste links.

**Simons Feedback:**
- Das Terminal soll nur so breit sein wie der mittlere Inhaltsbereich
- Die Seitenleiste darf nicht überdeckt werden
- Die Vorschau rechts soll nicht verkleinert werden
- Schön wäre: Fensterinhalte (Terminal, Vorschau) in eigenständige Fenster loslösen können

**Status:** Offen

**Planung:**
1. **Terminal-Breite:** Terminal nur im mittleren Bereich anzeigen (zwischen Seitenleiste und Vorschau)
2. **Seitenleiste schützen:** Seitenleiste bleibt immer sichtbar, wird nie überdeckt
3. **Loslösbare Fenster:** Möglichkeit, Terminal und Vorschau als eigenständige Fenster abzutrennen (Drag & Drop oder Button)

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

| Prio | Issue | Nächster Schritt |
|------|-------|-----------------|
| 1 | Ordnergrössen (#3) | Tiefenanalyse: Warum fehlen Grössen bei bestimmten Ordnern? |
| 2 | Privacy App-Empfehlungen (#4) | Tiefenanalyse: Warum werden die erkannten Apps nicht angezeigt? |
| 3 | Scandaten (#2) | Auf Simons Test warten |
| 4 | Terminal-Breite (#6) | Planung und Umsetzung |
| 5 | PDF Vollansicht (#5) | Planung und Umsetzung |

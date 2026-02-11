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

**Status:** Fix implementiert, wartet auf Simons Test

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

**Status:** Fix implementiert, wartet auf Simons Test

**Akzeptanzkriterien — was Simon sehen soll:**
- [ ] Lade-Hinweis erscheint sofort beim Öffnen des Privacy-Dashboards
- [ ] Nach 30-60 Sekunden: Banner mit Zusammenfassung ("X Programme analysiert")
- [ ] Bei "Standort" steht z.B.: "Google Maps, Facebook können nicht mehr auf deinen Standort zugreifen"
- [ ] Bei "Werbe-ID" steht z.B.: "Spotify, Steam zeigen weniger passende Werbung"
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

**Was bisher gemacht wurde:**
- Tiefenanalyse: Das Terminal war an der falschen Stelle im Fenster-Aufbau platziert — neben dem Hauptbereich statt darin
- Fix: Das Terminal sitzt jetzt im mittleren Inhaltsbereich und nimmt nicht mehr die volle Fensterbreite ein
- Die Seitenleiste und die Vorschau werden nicht mehr überdeckt

**Was Simon testen soll:**
1. Terminal öffnen (Strg+`)
2. Prüfen: Ist das Terminal nur so breit wie der mittlere Bereich?
3. Prüfen: Ist die Seitenleiste links noch sichtbar?
4. Prüfen: Ist die Vorschau rechts noch sichtbar (wenn geöffnet)?

**Status:** Fix implementiert, wartet auf Simons Test

**Noch offen (für später):**
- Loslösbare Fenster: Terminal und Vorschau als eigenständige Fenster abtrennen können

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
| 1 | Ordnergrössen (#3) | Fix implementiert — wartet auf Simons Test |
| 2 | Privacy App-Empfehlungen (#4) | Fix implementiert — wartet auf Simons Test |
| 3 | Terminal-Breite (#6) | Fix implementiert — wartet auf Simons Test |
| 4 | Scandaten (#2) | Fix implementiert — wartet auf Simons Test |
| 5 | PDF Vollansicht (#5) | Offen — Planung und Umsetzung |

# Speicher Analyse - Projektplan

## Status

| Version | Status | Beschreibung |
|---------|--------|--------------|
| v3.5 | Fertig | Grundfunktionen (Scan, Tree, Treemap, Dateitypen, Duplikate, Cleanup, Registry) |
| v4.0 | Fertig | Bloatware, Optimizer, Updates, Dashboard, Autostart, Services, async Registry |
| v5.0 | Fertig | Hybrid UI (Toolbar+Sidebar), Smart Exclusions, Auto-Scan, Clickable Dateitypen, Top-Files Verbesserung |
| v5.1 | Fertig | Umlaute, Pin-Toggle (v1), Worker-Terminierung, sfc/DISM, Alte-Dateien-Kontext |
| v5.2 | Fertig | Sidebar-Fix, Auto-Scan, Performance, Löschfehler, Multi-Select, Statusleiste |

Historische Pläne: siehe `archiv_v3-v5.md`

---

## v5.2 - Änderungen (Simons Feedback vollständig adressiert)

### 1. Sidebar Hover KOMPLETT entfernt
- Kein automatisches Auf-/Zuklappen bei Mausberührung mehr
- Hamburger-Toggle-Button: Klick öffnet/schließt die Sidebar
- Zustand bleibt nach Neustart (localStorage)
- Keine CSS-Transitions auf Sidebar-Breite (kein GPU-Repaint)

### 2. Auto-Scan auf Tab-Klick
- Jeder Tab lädt seine Daten automatisch beim ersten Klick
- Autostart, Dienste, Bloatware, Updates, Duplikate, Optimizer → kein manuelles "Laden" nötig
- `tabLoaded`-Flags verhindern unnötiges Neuladen
- Flags werden bei neuem Scan zurückgesetzt

### 3. CPU/GPU/RAM Reduktion
- Progress-Bar-Animation nur während aktivem Scan (nicht permanent)
- Chart.js Animationen deaktiviert (`animation: false`)
- Sidebar CSS-Transitions entfernt
- Erwartung: deutlich weniger CPU/GPU im Leerlauf

### 4. Datei-Löschfehler verbessert
- Deutsche Fehlermeldungen (Zugriff verweigert, Datei in Verwendung, etc.)
- Retry-Logik für gesperrte Dateien (3 Versuche)
- Klare Fehlertexte pro Datei

### 5. Alte Dateien - Zeile klickbar
- Klick irgendwo auf Zeile togglet Checkbox (nicht nur Checkbox selbst)
- Doppelklick öffnet Datei (unverändert)

### 6. Multi-Select bei Dateitypen-Detail
- Checkbox-Spalte im Dateitypen-Drilldown
- "Alle auswählen" + "Ausgewählte löschen" Buttons
- Zeilen-Klick togglet Checkbox
- Auswahl-Info (Anzahl + Größe)

### 7. Updates "Alle prüfen" Button
- Neuer Button "Alle Updates prüfen" oben in der Updates-Ansicht
- Prüft Windows-Updates, Software-Updates und Treiber gleichzeitig
- Wird auch automatisch beim Tab-Klick ausgelöst

### 8. Ladeindikator (Statusleiste)
- Permanente Statusleiste am unteren Rand der App
- Zeigt aktuelle Aktivität: "Laufwerk wird gescannt...", "Autostart wird geladen...", etc.
- Mini-Spinner während Ladevorgang
- "Bereit" wenn nichts läuft

---

## User-Feedback Tracker

> "Die vertikale Seite klappt sich automatisch ein/aus... NERVTÖTEND!"
> → Gelöst in v5.2 (Hover komplett entfernt, nur Toggle-Button)

> "rund 10-17% CPU, 13% GPU - geht in die falsche Richtung"
> → Adressiert in v5.2 (Animationen deaktiviert, Transitions entfernt)

> "Unter grössten Dateitypen können die Dateien nicht mehrfach ausgewählt werden"
> → Gelöst in v5.2 (Multi-Select mit Checkboxen)

> "Wenn ich eine Datei löschen will, erscheint eine Fehlermeldung"
> → Gelöst in v5.2 (Deutsche Fehlertexte + Retry-Logik)

> "Alte Dateien nicht anklickbar, nur Kästchen"
> → Gelöst in v5.2 (Zeilen-Klick)

> "Ich muss permanent alles nochmals scannen" (4x erwähnt!)
> → Gelöst in v5.2 (Auto-Scan auf Tab-Klick)

> "Updates soll alles auf einmal prüfen"
> → Gelöst in v5.2 (Alle Updates prüfen Button + Auto-Load)

> "Vielleicht wäre eine Art Ladebalken sinnvoll?"
> → Gelöst in v5.2 (Permanente Statusleiste)

---

## Zukunftsideen (v6.0+)

| Feature | Aufwand | Beschreibung |
|---------|---------|--------------|
| Prozess-Manager | Groß | Erweiterter Task-Manager mit CPU/RAM/Disk pro Prozess |
| S.M.A.R.T. | Mittel | Festplatten-Gesundheit (Temperatur, Betriebsstunden, SSD-Lebensdauer) |
| Netzwerk-Analyse | Mittel | Aktive Verbindungen, Bandbreite pro Prozess, DNS-Cache |
| System-Tray | Klein | Tray-Icon mit Quick-Clean und Benachrichtigungen |
| Portable Modus | Klein | App von USB-Stick startbar (Settings im App-Ordner) |
| Browser-Bereinigung | Mittel | Cache/Cookies/Verlauf für Chrome/Firefox/Edge gezielt löschen |
| System-Score | Klein | Gesundheitspunktzahl 0-100 nach Scan |

# Speicher Analyse - Projektplan

## Status

| Version | Status | Beschreibung |
|---------|--------|--------------|
| v3.5 | Fertig | Grundfunktionen (Scan, Tree, Treemap, Dateitypen, Duplikate, Cleanup, Registry) |
| v4.0 | Fertig | Bloatware, Optimizer, Updates, Dashboard, Autostart, Services, async Registry |
| v5.0 | Fertig | Hybrid UI (Toolbar+Sidebar), Smart Exclusions, Auto-Scan, Clickable Dateitypen, Top-Files Verbesserung |
| v5.1 | Fertig | Umlaute, Pin-Toggle (v1), Worker-Terminierung, sfc/DISM, Alte-Dateien-Kontext |
| v5.2 | Fertig | Sidebar-Fix, Auto-Scan, Performance, Optimizer-Changelog, Treiber-Info, Update-Verifizierung |
| v6.0 | Geplant | **Explorer-Modus: Datei-Navigation als Explorer-Alternative** |

Historische Pläne: siehe `archiv_v3-v5.md`

---

## v5.2 - Änderungen

### Runde 1 (UI/UX)
1. **Sidebar Hover komplett entfernt** - Nur Toggle-Button, keine CSS :hover, keine Transitions
2. **Auto-Scan auf Tab-Klick** - tabLoaded-Pattern, reset bei neuem Scan
3. **CPU/GPU Reduktion** - Animationen nur bei Bedarf, Chart.js animation:false
4. **Datei-Löschfehler** - Deutsche Meldungen + Retry-Logik (3 Versuche bei EBUSY)
5. **Alte Dateien klickbar** - Zeile togglet Checkbox, Doppelklick öffnet
6. **Multi-Select Dateitypen** - Checkboxen + Bulk-Delete im Drilldown
7. **Updates "Alle prüfen"** - Parallele Prüfung + Gesamtübersicht
8. **Statusleiste** - Permanente Aktivitätsanzeige + Mini-Spinner

### Runde 2 (Backend/Features)
9. **Optimizer Changelog** - Technische Details (expandable `<details>`) pro Empfehlung
10. **Admin-Rechte-Check** - `net session` Prüfung vor System-Befehlen, klare Meldung
11. **Treiber-Info erweitert** - Hersteller-Spalte + Support-Links + Hardware-System-Info
12. **Update-Verifizierung** - `winget list --id` + `winget upgrade --id` nach Installation
13. **Duplikat-Scan optimiert** - System-Pfade ausgeschlossen, size+ext Grouping, 8KB Partial-Hash, 256KB Full-Hash
14. **Alte Dateien sortierbar** - Klickbare Spaltenheader (Name, Kontext, Größe, Alter)

---

## v6.0 - Explorer-Modus (Datei-Navigator)

### Vision
Speicher Analyse wird zum **vollwertigen Dateimanager** - schneller, transparenter und ohne Telemetrie als Alternative zum Windows Explorer.

**Hinweis:** Wir ersetzen NICHT explorer.exe (der ist auch Taskleiste + Startmenü), sondern bieten eine bessere Alternative für **Datei-Navigation**.

### Phase 1: Grundlagen (Explorer-Navigation)

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| Adressleiste | Pfad-Eingabe + Breadcrumb-Navigation (klickbar) | Mittel |
| Navigation | Zurück / Vor / Hoch Buttons (History-Stack) | Klein |
| Ordner-Ansicht | Dateiliste mit Spalten (Name, Größe, Typ, Datum, Attribute) | Mittel |
| Sortierung | Spalten-Klick sortiert Ansicht | Klein |
| Quick-Access | Favoriten/Schnellzugriff-Sidebar (Dokumente, Downloads, Desktop) | Klein |
| Spaltenbreiten | Drag-resizeable Spalten | Klein |

### Phase 2: Power-Features (besser als Explorer)

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| Dual-Panel | Zwei-Fenster-Ansicht (Commander-Stil) | Mittel |
| Tab-Browsing | Mehrere Ordner in Tabs öffnen | Mittel |
| Integrierte Suche | Echtzeit-Filterung + Regex-Suche innerhalb Ordner | Klein |
| Batch-Rename | Mehrere Dateien gleichzeitig umbenennen (Muster) | Mittel |
| Vorschau-Panel | Bild/Text/Video/PDF Vorschau in der Sidebar | Mittel |
| Drag & Drop | Dateien zwischen Panels/Tabs verschieben | Mittel |
| Datei-Tags | Eigene Farb-Labels/Tags für Dateien | Mittel |

### Phase 3: System-Integration

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| Standard-Handler | "Ordner öffnen mit Speicher Analyse" als Option | Klein |
| Shell-Extension | Rechtsklick → "In Speicher Analyse öffnen" | Mittel |
| Dateiverknüpfungen | Dateitypen-Handling (mit welchem Programm öffnen) | Mittel |
| Terminal-Integration | Integrierte Kommandozeile im aktuellen Ordner | Klein |
| Hotkey | Globaler Hotkey (z.B. Win+E Override) zum Starten | Klein |

### Phase 4: Datenschutz & Telemetrie-Kontrolle

| Feature | Beschreibung | Aufwand |
|---------|-------------|---------|
| Telemetrie-Dashboard | Zeige alle aktiven Windows-Telemetrie-Einstellungen | Mittel |
| One-Click-Privacy | Alle Telemetrie mit einem Klick reduzieren/deaktivieren | Klein |
| Netzwerk-Monitor | Zeige welche Prozesse Daten senden (wohin, wie viel) | Groß |
| Privacy-Score | Bewertung 0-100 für aktuelle Datenschutz-Einstellungen | Klein |

---

## Architektur-Überlegungen für v6.0

### Warum explorer.exe NICHT ersetzen?
- `explorer.exe` = Dateimanager **+ Taskleiste + Startmenü + Systemtray + Desktop**
- Ohne explorer.exe: kein Startmenü, kein Desktop, keine Taskleiste
- Custom Windows Shell = enormer Aufwand, instabil, Update-Probleme
- **Bessere Strategie:** Parallelbetrieb, Nutzer wählt selbst

### Technische Basis
- Electron gibt uns vollen Dateisystem-Zugang (fs, child_process)
- Node.js streams für große Ordner (kein UI-Freeze)
- Virtual scrolling für Ordner mit 100.000+ Dateien
- Worker threads für Hintergrund-Operationen

### Explorer-Vorteile die wir bieten können
1. **Schneller** - Virtual scrolling, kein COM-Overhead
2. **Transparenter** - Keine versteckte Telemetrie, Open Source
3. **Mächtiger** - Integrierte Analyse, Duplikate, Cleanup in einem Tool
4. **Anpassbar** - Themes, Layouts, Shortcuts konfigurierbar
5. **Dual-Panel** - Commander-Style für Power-User

---

## Weitere Zukunftsideen (v7.0+)

| Feature | Aufwand | Beschreibung |
|---------|---------|--------------|
| Prozess-Manager | Groß | Erweiterter Task-Manager mit CPU/RAM/Disk pro Prozess |
| S.M.A.R.T. | Mittel | Festplatten-Gesundheit (Temperatur, Betriebsstunden, SSD-Lebensdauer) |
| Netzwerk-Analyse | Mittel | Aktive Verbindungen, Bandbreite pro Prozess, DNS-Cache |
| System-Tray | Klein | Tray-Icon mit Quick-Clean und Benachrichtigungen |
| Portable Modus | Klein | App von USB-Stick startbar (Settings im App-Ordner) |
| Browser-Bereinigung | Mittel | Cache/Cookies/Verlauf für Chrome/Firefox/Edge gezielt löschen |
| System-Score | Klein | Gesundheitspunktzahl 0-100 nach Scan |
| Cloud-Sync | Mittel | Einstellungen über mehrere PCs synchronisieren |
| Automatisierung | Mittel | Geplante Scans + Auto-Cleanup nach Regeln |

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
> → Gelöst in v5.2 (Zeilen-Klick + Sortierung)

> "Ich muss permanent alles nochmals scannen" (4x erwähnt!)
> → Gelöst in v5.2 (Auto-Scan auf Tab-Klick)

> "Updates soll alles auf einmal prüfen"
> → Gelöst in v5.2 (Alle Updates prüfen Button + Auto-Load)

> "Wo ist die Dateisystemüberprüfung? Dism? Nichts vorhanden!"
> → Gelöst in v5.2 (sfc + DISM mit Admin-Check + technischen Details)

> "Treiber sind gemäss Tool 57 Jahre alt!"
> → Gelöst in v5.2 (WMI-Datumsfilter + Hersteller-Info + Support-Links)

> "Wo sehe ich dass das Update korrekt durchgeführt wurde?"
> → Gelöst in v5.2 (Verifizierung nach winget upgrade)

> "Was genau wird wo verändert? Changelog?"
> → Gelöst in v5.2 (Technische Details per Empfehlung, expandable)

> "Duplikatsprüfung dauert ewig (764s)"
> → Optimiert in v5.2 (System-Pfade excludiert, 8KB Partial-Hash, size+ext Grouping)

> "Explorer-Navigation nachbauen, aber besser?"
> → Geplant für v6.0 (Datei-Navigator als Explorer-Alternative)

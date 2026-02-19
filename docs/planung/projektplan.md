# Speicher Analyse - Versionshistorie

> **Dieses Dokument ist ein reines Nachschlagewerk.** Es dokumentiert was in welcher Version umgesetzt wurde.
> Für aktuelle Planung, Bugs und nächste Schritte → [`docs/issues/issue.md`](../issues/issue.md)

## Versionen

| Version | Beschreibung |
|---------|--------------|
| v3.5 | Grundfunktionen (Scan, Tree, Treemap, Dateitypen, Duplikate, Cleanup, Registry) |
| v4.0 | Bloatware, Optimizer, Updates, Dashboard, Autostart, Services, async Registry |
| v5.0 | Hybrid UI (Toolbar+Sidebar), Smart Exclusions, Auto-Scan, Clickable Dateitypen, Top-Files |
| v5.1 | Umlaute, Pin-Toggle, Worker-Terminierung, sfc/DISM, Alte-Dateien-Kontext |
| v5.2 | Sidebar-Fix, Auto-Scan, Performance, Optimizer-Changelog, Treiber-Info, Update-Verifizierung |
| v6.0 | Explorer Phase 1: Adressleiste, Navigation, Dateiliste, Sortierung, Quick-Access, Kontextmenüs |
| v6.1 | Sicherheits-Audit (55 Fixes), Graceful Degradation (Win10/11), Batterie-Awareness |
| v6.2 | Explorer Phase 2: Dual-Panel, Tabs, Omnibar-Suche (3 Ebenen), Batch-Rename |
| v6.3 | Explorer Phase 3: Terminal, System-Tray, Globaler Hotkey, Datei-Tags, Shell-Integration |
| v7.0 | Netzwerk-Monitor, Privacy-Dashboard, Software-Audit, S.M.A.R.T., System-Score |
| v7.1 | Monaco Editor, PDF/DOCX/XLSX-Viewer, Sidebar-Gruppen, Omnibar-Fixes |
| v7.2 | Governance, WCAG-Kontrast-Fixes, Terminal Multi-Shell, Versions-Fix |
| v7.3 | Terminal: node-pty + xterm.js (echtes PTY), CWD-Sync |
| v7.4 | Session-Persistenz, PreferencesStore, Energieverwaltung, Einstellungen-Rewrite |
| v7.5 | Explorer-Ordnergrößen aus Scan-Daten, Proportionsbalken, Session-UI-State-Fix |
| v8.0 | Swiss Security Suite: Hochrisiko-Alarm, Geräte-Erkennung, Sicherheits-Check, PDF-Report |

Historische Pläne: siehe [`archiv/projektplan_v3-v5.md`](archiv/projektplan_v3-v5.md)

---

## v6.0 - Explorer Phase 1 (Fertig)

### Umgesetzt
- Adressleiste mit Pfad-Eingabe + Breadcrumb-Navigation
- Zurück/Vor/Hoch Buttons mit History-Stack
- Dateiliste mit Spalten (Name, Größe, Typ, Datum)
- Sortierung per Spalten-Klick
- Quick-Access: Bibliothek (echte Windows-Registry-Pfade) + Laufwerke
- Erweiterte Kontextmenüs (Öffnen mit, Pfad kopieren, Terminal, Ordnergröße)
- Farbcodierung großer Dateien (>10MB gelb, >100MB orange, >1GB rot)
- Temp-Dateien visuell markiert (.tmp, .bak, .old, etc.)
- Leere-Ordner-Finder
- Drag & Drop + Inline-Rename

---

## v6.1 - Sicherheit & Kompatibilität (Fertig)

### Sicherheits-Audit (~55 Fixes)
- `cmd-utils.js` - Zentrale Befehlsausführung (ersetzt 5 duplizierte runCmd-Funktionen)
- Command Injection Prevention (`execFile` statt `exec` wo möglich)
- Protected System Paths (PROTECTED_ROOTS + isProtectedPath())
- `lstat()` statt `stat()` für Symlink-Erkennung
- Stream-Cleanup bei Kopierfehler (readStream.destroy + writeStream.destroy)
- Worker-Terminierung bei Scan-Fehlern + App-Quit-Cleanup
- Session-Restore: Pull-basiert statt Push (Race Condition behoben)
- Sandbox-Modus aktiviert (sandbox: true)
- Accessibility: aria-labels, role="tablist"
- CSS: Fehlende Light-Theme-Variablen ergänzt

### Graceful Degradation (Win10/11)
- `wmic` (deprecated) durch `Get-CimInstance Win32_LogicalDisk` ersetzt
- `Get-WmiObject` (deprecated) durch `Get-CimInstance` ersetzt (3 Stellen)
- `schtasks /query` (locale-abhängig) durch `Get-ScheduledTask` ersetzt
- `compat.js` - System-Capabilities-Check (winget, Windows Build, Admin)
- WinGet-Verfügbarkeit wird geprüft und UI zeigt Hinweis wenn fehlend

### Batterie-Awareness
- `battery.js` - Web Battery API + Tauri System-Info
- Battery-Badge in Statusleiste (Prozent-Anzeige auf Laptops)
- Scan-Warnung bei <50% Akku (Bestätigungsdialog)
- Low-Battery-Toast bei <20% während Scan

---

## v6.2 - Explorer Phase 2: Power-Features (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Dual-Panel** | Zwei-Fenster-Ansicht (Commander-Stil), F6 zum Wechseln |
| **Tab-Browsing** | Mehrere Ordner in Tabs, Ctrl+T neu, Ctrl+W schließen, Drag-Reorder |
| **Hybrid-Suche (3 Ebenen)** | Ordner-Filter + Scan-Index + optionale Deep Search, kein Hintergrund-Indexer |
| **Batch-Rename** | Mehrere Dateien umbenennen mit Muster (z.B. `IMG_{counter}.jpg`) |

### Hybrid-Suche: 3-Ebenen-Architektur (kein Hintergrund-Indexer!)

| Ebene | Was | Wann | Kosten |
|-------|-----|------|--------|
| **1. Ordner-Filter** | Filtert die aktuelle Dateiliste im Browser | Sofort beim Tippen (Debounce 150ms) | Null |
| **2. Scan-Index** | `Map<filename, fullPath[]>` wird beim Disk-Scan mitaufgebaut | Nach Scan verfügbar | Minimal (kein extra I/O) |
| **3. Deep Search** | Rekursive Suche ab aktuellem Ordner (Worker Thread) | On-Demand per Button | Mittel (nur wenn gewünscht) |

---

## v6.3 - Explorer Phase 3: System-Integration (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Terminal-Integration** | Eingebettete PowerShell im aktuellen Ordner, Ctrl+` Toggle |
| **System-Tray** | Tray-Icon mit Quick-Scan, Duplikate prüfen, Minimize-to-Tray |
| **Globaler Hotkey** | Konfigurierbarer Hotkey (Standard: Ctrl+Shift+S) |
| **Datei-Tags** | Farb-Labels für Dateien (JSON in %APPDATA%) |
| **Shell-Integration** | "Mit Speicher Analyse öffnen" im Windows-Kontextmenü (HKCU) |

---

## v7.0 - Netzwerk-Monitor, Software-Audit & Trust (Fertig)

### Netzwerk-Monitor

| Komponente | Beschreibung |
|------------|--------------|
| **Verbindungen** | Aktive TCP-Verbindungen pro Prozess mit Remote-IP (`Get-NetTCPConnection`) |
| **Bandbreite** | Bytes/s pro Netzwerk-Interface (Performance Counter) |
| **Firewall-Regeln** | Bestehende Regeln anzeigen + neue erstellen (`Get-NetFirewallRule`) |

### Privacy-Dashboard
- 12 Windows-Telemetrie-Einstellungen (Registry-Abfrage)
- One-Click-Privacy (alle Telemetrie reduzieren)
- Privacy-Score (0-100)
- Scheduled Tasks Audit

### Software-Audit
- Programm-Inventar (Registry Uninstall-Keys + winget)
- Korrelations-Engine (Programme ↔ Registry ↔ Autostart ↔ Dienste)
- Verwaiste Einträge mit Ursprungs-Software-Zuordnung
- Müll-Zuordnung pro Software mit Ampel-Bewertung

### Trust-System (Phase 1+2)
- Begründung pro Ergebnis (WARUM geflaggt)
- Risiko-Ampel (Grün/Gelb/Rot)
- Vorschau/Dry-Run vor Aktionen

### Weitere Features
- **S.M.A.R.T.** — Festplatten-Gesundheit (Temperatur, Wear, Fehler, Betriebsstunden)
- **System-Score** — Gesundheitspunktzahl 0-100 (gewichtete Kategorien)

---

## v7.1 - Monaco Editor & Dokument-Viewer (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Monaco Editor** | VS Code Editor-Kern für Text-/Code-Dateien. Syntax-Highlighting für 30+ Sprachen, Bearbeitung + Speichern (Ctrl+S), Theme-Sync. |
| **PDF-Viewer** | Canvas-basiertes Rendering (pdf.js). Seitennavigation, Zoom, Button "Extern öffnen". |
| **DOCX-Viewer** | Word-Dokumente als formatierte HTML-Vorschau (mammoth.js). Überschriften, Tabellen, Bilder. |
| **XLSX-Viewer** | Excel-Dateien als HTML-Tabelle (SheetJS). Sheet-Tabs, Sticky Header, max 1000 Zeilen. |
| **readFileBinary IPC** | ArrayBuffer-Transfer für binäre Dateien (PDF/DOCX/XLSX). |
| **Sidebar-Gruppen** | 6 Navigationsgruppen standardmäßig eingeklappt. Chevron-Animation, localStorage-Persistenz. |
| **Omnibar-Fixes** | Click-Outside schließt Dropdown. Relevanz-Algorithmus mit positionsbasiertem Scoring. |

---

## v7.2 - Governance, WCAG & Terminal (Fertig)

### Umgesetzt

| Feature | Beschreibung |
|---------|-------------|
| **Governance** | Qualitätsstandards in `docs/planung/governance.md`: WCAG 2.2 AA, Sprache, Performance, Sicherheit, Versionierung. |
| **WCAG Kontrast-Fixes** | Komplett überarbeitet: --text-muted 2.3:1→4.7:1, --text-secondary 4.67:1→6.7:1 (Dark), --text-muted 3.2:1→5.3:1 (Light). Alle WCAG 2.2 AA 4.5:1 konform. |
| **Terminal Multi-Shell** | Shell-Selector (PowerShell/CMD/WSL). Dynamische Prompts, WSL-Pfadkonvertierung. Intelligente PTY-Erkennung (nur echte REPL-Befehle warnen). |
| **Terminal-Kontextmenü** | "Im Terminal öffnen" → eingebettetes Terminal statt externes Fenster. |
| **Versions-Fix** | Konsistente Version 7.2 in package.json, index.html, settings.js. |
| **Netzwerk-Monitor Fix** | Timeout 10s→30s, sequentielle PS-Aufrufe, Retry-Button bei Fehler, Auto-Stopp nach 3 Fehlern. |
| **Datei-Vorschau im Explorer** | Doppelklick auf PDF/DOCX/XLSX/Bilder/Code öffnet integrierte Vorschau statt externes Programm. |
| **Smart Reload (F5)** | F5 speichert App-Zustand in sessionStorage, führt echten Page-Reload durch, stellt Zustand wieder her. CSS/JS-Änderungen werden geladen + Scan-Daten bleiben erhalten. |
| **Fehlerbehandlung** | _loaded-Flag wird bei Fehler zurückgesetzt (Privacy, S.M.A.R.T., Software-Audit, Netzwerk). Retry-Buttons in allen Fehlerseiten. |
| **OBERSTE DIREKTIVE (CLAUDE.md)** | Alle Probleme liegen IMMER im Quellcode. Niemals User/Client beschuldigen. Visuelles Ergebnis = Wahrheit. |

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
> → Umgesetzt in v6.0 (Datei-Navigator mit Kontextmenüs, Farbcodierung, Leere-Ordner)

> "Dunkelblaue Schrift auf dunkelblauem Hintergrund, anstrengend zu lesen"
> → Adressiert in v7.2 (6 WCAG-Kontrast-Fixes, neue CSS-Variablen)

> "Terminal öffnen per Rechtsklick funktioniert nicht"
> → Gelöst in v7.2 (eingebettetes Terminal statt externes Fenster)

> "PowerShell im Tool? Linux-Ubuntu Shell möglich?"
> → Gelöst in v7.2 (Multi-Shell: PowerShell/CMD/WSL)

> "Scandaten werden nicht gespeichert"
> → Siehe Issue #2/#3 in [`docs/issues/issue.md`](../issues/issue.md)

> "Bloatware-Scanner braucht Intelligenz"
> → Siehe Issue #8 in [`docs/issues/issue.md`](../issues/issue.md)

> "Updates-Tab umbenennen zu Apps"
> → Siehe Issue #9 in [`docs/issues/issue.md`](../issues/issue.md)

# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `archiv/` verschieben (Dateiname: `aenderungsprotokoll_<version>.md`).

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 1 | 2026-02-10 | v7.0 | fix | **Eingefrorene UI behoben** - Single-Instance-Lock (`app.requestSingleInstanceLock()`) verhindert mehrere Electron-Instanzen. Ursache: Minimize-to-Tray + erneuter Start = zweite Instanz, GPU-Cache gesperrt ("Zugriff verweigert"), Renderer zeigt nur statisches Bild. Zusätzlich `--disable-gpu-shader-disk-cache` gesetzt. |
| 2 | 2026-02-10 | v7.0 | fix | **Debug-Code entfernt** - DevTools, Click-Test-Button, Console-Forwarding und Debug-Logging aus main.js, index.html, app.js entfernt. |
| 3 | 2026-02-10 | v7.0 | improve | **Omnibar-Suche: Ergebnisse gruppiert** - Ordner werden vor Dateien angezeigt, mit visuellen Gruppenheadern. Innerhalb jeder Gruppe: Qualität absteigend, dann alphabetisch. |
| 4 | 2026-02-10 | v7.0 | improve | **Omnibar-Suche: Relevanz-Algorithmus** - Neuer `scoreMatch()`-Algorithmus ersetzt naive Prefix-Suche. Positionsbasiertes Scoring (Name startet mit > Wortgrenze > irgendwo). Min. Prefix-Länge von 40% auf 60% erhöht. Mid-Word-Matches nur bei ≥80% Übereinstimmung. Eliminiert irrelevante Treffer wie "api-kosten" bei Suche nach "steuern". |
| 5 | 2026-02-10 | v7.0 | refactor | **docs/ Verzeichnisstruktur reorganisiert** - Nummernpräfixe (00_, 01_) entfernt. Neue thematische Struktur: `planung/` (Projektplan + Visionen + archiv/), `protokoll/` (Änderungsprotokoll + archiv/). Jeder Bereich verwaltet sein eigenes Archiv (Option A: dezentral). Claude ist verantwortlich für die Verwaltung der docs/-Struktur. Regeln in CLAUDE.md hinterlegt. |
| 6 | 2026-02-10 | v7.1 | fix | **Omnibar-Suche: Click-Outside schließt Dropdown** - Document-Level Click-Listener hinzugefügt. Klick außerhalb der Adressleiste/Dropdown schließt die Suche und stellt die Dateiliste wieder her. |
| 7 | 2026-02-10 | v7.1 | feature | **Sidebar: Einklappbare Gruppen** - 6 Navigationsgruppen (Start, Analyse, Bereinigung, System, Sicherheit, Extras) standardmäßig eingeklappt. Klick auf Label klappt um (Chevron-Animation). Aktive Gruppe klappt automatisch auf. Zustand wird per localStorage gespeichert. |
| 8 | 2026-02-10 | v7.1 | feature | **Monaco Editor integriert** - VS Code Editor-Kern für Text-/Code-Dateien. Syntax-Highlighting für 30+ Sprachen. Bearbeitung + Speichern (Ctrl+S) mit Dirty-Flag. Theme-Sync (Dark/Light). Fallback auf Plaintext wenn Monaco nicht lädt. |
| 9 | 2026-02-10 | v7.1 | feature | **PDF-Viewer (pdf.js)** - Canvas-basiertes PDF-Rendering mit Seitennavigation (vor/zurück), Zoom (+/-), Seitenanzeige. Fallback auf iframe wenn pdf.js nicht lädt. Button "Extern öffnen". |
| 10 | 2026-02-10 | v7.1 | feature | **DOCX-Viewer (mammoth.js)** - Word-Dokumente als formatierte HTML-Vorschau. Überschriften, Tabellen, Bilder werden korrekt dargestellt. Nur Lesen, Button "In Word öffnen". |
| 11 | 2026-02-10 | v7.1 | feature | **XLSX-Viewer (SheetJS)** - Excel-Dateien als HTML-Tabelle mit Sheet-Tabs. Sticky Header, max 1000 Zeilen mit Warnung. Button "In Excel öffnen". |
| 12 | 2026-02-10 | v7.1 | feature | **readFileBinary IPC** - Neuer Endpunkt zum Lesen binärer Dateien (ArrayBuffer-Transfer) für PDF/DOCX/XLSX-Viewer. |
| 13 | 2026-02-10 | v7.2 | feature | **Governance-Datei erstellt** - Qualitätsstandards in `docs/planung/governance.md`: WCAG 2.2 AA Kontrast, Sprache, Performance, Sicherheit, Versionierung, Architektur, UI/UX. Manuelle KI-Prüfung ohne automatisierte Skripte. |
| 14 | 2026-02-10 | v7.2 | fix | **WCAG 2.2 Kontrast-Fixes** - 6 Kontrastverletzungen behoben: Sidebar-Labels (--text-muted → --text-secondary), aktive Buttons (--accent → --accent-text), Explorer-Header, Breadcrumbs. Neue Variablen: --bg-tertiary (12 fehlende Referenzen), --accent-text (#a78bfa dark / #5b4ccc light). |
| 15 | 2026-02-10 | v7.2 | fix | **Terminal: Rechtsklick öffnet eingebettetes Terminal** - "Im Terminal öffnen" öffnet jetzt das eingebettete Terminal im Explorer-Tab statt ein externes PowerShell-Fenster. Wechselt automatisch zum Explorer-Tab. |
| 16 | 2026-02-10 | v7.2 | feature | **Terminal: Multi-Shell Support** - Shell-Selector Dropdown (PowerShell/CMD/WSL). Dynamischer Prompt (PS>/>/\$). WSL-Erkennung, deaktivierte Option wenn nicht installiert. Shell-spezifische cd-Befehle inkl. Windows→WSL Pfadkonvertierung. |
| 17 | 2026-02-10 | v7.2 | fix | **Versionsnummern korrigiert** - package.json (4.0.0 → 7.2.0), index.html (v7.0 → v7.2), settings.js (v7.0 → v7.2). Konsistente Version an allen Stellen gemäß Governance. |
| 18 | 2026-02-10 | v7.2 | improve | **Visionen + Projektplan aktualisiert** - Visionen.md reorganisiert mit Status-Legende (Umgesetzt/Teilweise/Geplant/Offen/Ignoriert), 6 thematische Kategorien. Projektplan: v7.1 + v7.2 Sektionen hinzugefügt, v7.3 (WCAG-Vertiefung, Resizable Panels, xterm.js) geplant, v9.0 (KI-Integration BYOB) als Vision, Modul-Struktur auf v7.2 aktualisiert, 5 neue User-Feedbacks im Tracker. |

---

## Lessons Learned

### #1: GPU-Cache-Sperre durch Minimize-to-Tray (2026-02-10)

**Problem:** App erschien "eingefroren" - Fenster sichtbar aber nichts anklickbar. GPU-Cache-Fehler in der Konsole:
```
[ERROR:cache_util_win.cc(20)] Unable to move the cache: Zugriff verweigert (0x5)
[ERROR:gpu_disk_cache.cc(713)] Gpu Cache Creation failed: -2
```

**Ursache:** Minimize-to-Tray versteckt das Fenster beim X-Klick, Prozess läuft weiter. Bei erneutem `npm start` startet eine zweite Electron-Instanz. Diese kann den GPU-Shader-Cache nicht öffnen (von Instanz 1 gesperrt). GPU-Prozess schlägt fehl → Renderer zeigt nur ein statisches Bild → UI "eingefroren".

**Schwierigkeit bei der Diagnose:**
- `executeJavaScript` funktionierte (DOM war responsiv)
- Click-Handlers waren korrekt registriert
- CSS zeigte keine Blockaden
- `init()` lief ohne Fehler durch
- → Das Problem war NICHT im Code sondern im GPU-Rendering-Prozess

**Lösung:**
1. `app.requestSingleInstanceLock()` - verhindert mehrere Instanzen
2. `second-instance`-Handler zeigt bestehendes Fenster
3. `--disable-gpu-shader-disk-cache` - kein GPU-Cache auf Festplatte

**Lehre:**
- Bei Electron-Apps mit Tray: **IMMER** Single-Instance-Lock verwenden!
- GPU-Cache-Fehler sind NICHT harmlos wenn sie "Zugriff verweigert" sagen
- Wenn diagnostischer Code zeigt "alles OK" aber UI trotzdem eingefroren → GPU-Prozess-Ebene prüfen
- `disableHardwareAcceleration()` löst das Problem NICHT (hilft nur bei GPU-Treiber-Problemen)

---

### #2: `await` in nicht-async Callbacks (2026-02-09)

**Problem:** `await` innerhalb eines nicht-async `switch/case`-Callbacks verursacht einen SyntaxError der das gesamte ES-Modul am Laden hindert. Kein Fehler sichtbar, Modul lädt einfach nicht.

**Lösung:** `.then()` statt `await` in nicht-async Callbacks verwenden.

**Lehre:** CRITICAL - Immer prüfen ob der umgebende Callback `async` ist bevor `await` verwendet wird.

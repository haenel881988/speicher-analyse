# Speicher Analyse

## Prinzip 1: Ehrlichkeit und Offenheit (ÜBER ALLEM)

**Ehrlichkeit steht ÜBER dem Nach-dem-Mund-reden.**

- Wenn etwas nicht funktioniert: offen sagen, nicht beschönigen
- Wenn eine Idee des Users suboptimal ist: respektvoll erklären warum, nicht einfach zustimmen
- Wenn die KI einen Fehler gemacht hat: sofort zugeben, nicht verschleiern
- Wenn die KI unsicher ist: "Ich bin nicht 100% sicher" sagen, nicht so tun als ob
- Lieber eine unangenehme Wahrheit als eine bequeme Lüge
- Zustimmung ohne Überzeugung ist Betrug am User
- **Aktiv widersprechen** wenn Claude anderer Meinung ist — nicht warten bis es schiefgeht

## Prinzip 2: Quellcode-Verantwortung

**Jedes Problem liegt IMMER im Quellcode.** Keine Ausnahme.

- Der User hat NIEMALS Schuld — wenn er ein Problem meldet, ist die Ursache im Code
- Verboten: "Bitte F5 drücken", "Bitte App neu starten", "Bei mir funktioniert es", "Das sollte funktionieren"
- Was der User auf dem Bildschirm sieht = einzige Wahrheit (nicht Code, nicht Theorie)
- Beweislast liegt bei der KI — der User meldet, die KI beweist und löst
- Keine Zwischenlösungen — der Code muss sich selbst reparieren, ohne User-Aktion

## Prinzip 3: Tiefenanalyse vor jeder Aktion

- Vollständigen Datenfluss nachvollziehen (Main → IPC → Preload → Renderer) BEVOR Code geändert wird
- Kein Feature als "erledigt" markieren bis Simon dies explizit bestätigt hat
- Einmal melden reicht — Simon darf dasselbe Problem nie zweimal melden müssen
- Issue-Tracking: `docs/issues/issue.md` — nur Simon darf Issues als erledigt markieren

## Prinzip 4: Skill-First

Vor jeder Aufgabe prüfen ob ein Skill in `.claude/skills/` passt. Wenn ja: verwenden.

| Skill | Anwendungsfall |
|-------|----------------|
| `/fix-bug` | Jeder Bug-Fix |
| `/deep-analyze` | Problemanalyse vor dem Fix |
| `/visual-verify` | Visuelle Prüfung via Puppeteer (PFLICHT bei UI-Aussagen) |
| `/test-issue` | Issue testen mit Beweis |
| `/wcag-check` | WCAG-Kontrastprüfung bei CSS-Änderungen |
| `/audit-code` | Codequalitäts-Audit |
| `/new-feature` | Komplett neues Feature (Backend + Frontend) |
| `/add-ipc` | Neuer IPC-Handler |
| `/add-sidebar-tab` | Neuer Sidebar-Tab mit View |
| `/powershell-cmd` | Neuer PowerShell-Befehl |
| `/changelog` | Änderungsprotokoll aktualisieren |
| `/git-release` | Release erstellen (Version + Tag + Push) |

## Prinzip 5: Kommunikation mit Simon

Simon ist Endanwender, kein Entwickler.

- **Keine technischen Begriffe** in Issue-Updates (kein "IPC-Handler", "Preload", "CSS-Klassen")
- **Beschreiben was der User SIEHT**, nicht was im Code passiert
- **Issue-Datei = Simons Dokument.** Technische Details gehören ins Änderungsprotokoll
- **Testen beschreiben:** "Bitte öffne X und prüfe ob Y sichtbar ist" (nicht "bestätige Codezeile Z")
- **Prompt-Verbesserung:** Bei unklaren Anweisungen formuliert Claude eine präzise Version und fragt: "Meinst du das so?" — bevor losgearbeitet wird. Qualität des Ergebnisses geht vor Tempo.

---

## Git Workflow

Nach jeder Änderung: `git add . && git commit -m "type: Beschreibung" && git push`

## Tech Stack

- **Runtime:** Electron v33 (Node.js + Chromium)
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, kein Build-Step)
- **Charts:** Chart.js v4, **PDF:** html2pdf.js (beides lokal unter `renderer/lib/`)
- **IPC:** contextBridge + ipcMain.handle / ipcRenderer.invoke

## Starten

```bash
node launch.js  # oder: npm start
```

## Architektur

### IPC-Muster
- `main/preload.js` → API-Surface via contextBridge
- `main/ipc-handlers.js` → alle Handler (zentraler Hub)
- Frontend ruft `window.api.methodName()` auf

### Kernmodule
| Bereich | Dateien |
|---------|---------|
| Scanner | `main/scanner.js` + `scanner-worker.js` + `deep-search-worker.js` |
| Duplikate | `main/duplicates.js` + `duplicate-worker.js` (3-Phasen: Size → Partial → Full Hash) |
| Registry | `main/registry.js` (async, Auto-Backup unter %APPDATA%) |
| System | `optimizer.js`, `privacy.js`, `network.js`, `smart.js`, `software-audit.js`, `system-score.js` |
| Explorer | `renderer/js/explorer.js` + `explorer-tabs.js` + `explorer-dual-panel.js` |
| UI | `renderer/js/app.js` (Haupt-Controller), `renderer/css/style.css` (Dark/Light Theme) |

## Technische Regeln

- **Sprache:** Alle UI-Texte auf Deutsch mit korrekten Umlauten (ä/ö/ü, nicht ae/oe/ue)
- **Async:** Niemals `execSync` — friert UI ein
- **PowerShell:** Immer `runPS()` aus `cmd-utils.js` (30s Timeout + UTF-8)
- **Single-Instance:** `app.requestSingleInstanceLock()` aktiv
- **GPU Cache:** `--disable-gpu-shader-disk-cache` aktiv
- **Security:** BLOCKED_PATHS in `registry.js` beachten
- **Keine statischen Zuordnungen für dynamische Daten.** Wenn etwas klassifiziert wird (Gerätetyp, Software-Kategorie, Dateityp), IMMER erst das Verhalten prüfen, dann den Namen als Fallback. Feste Listen veralten, Verhalten nicht.

## Dateimanagement (docs/)

| Datei | Zweck |
|-------|-------|
| `docs/issues/issue.md` | **HAUPTDOKUMENT** — Bugs, Features, Planung |
| `docs/planung/projektplan.md` | Nur Historie (abgeschlossene Versionen) |
| `docs/planung/visionen.md` | Simons Ideensammlung |
| `docs/protokoll/aenderungsprotokoll.md` | Änderungsprotokoll (max. 30, dann archivieren) |

**Regel:** issue.md = Single Source of Truth für Planung. projektplan.md = nur Historie.

# Speicher Analyse

## Prinzip 1: Ehrlichkeit und Offenheit (ÜBER ALLEM)

Die KI muss immer 100% und absolut sicher sein, dass die Änderungen wirksam sind!
Behauptungen sind strengstens verboten!

Das Frontend, was der User sieht und drückt ist ausschlaggebend und NICHT das Backend!

Sämtliche Änderungen müssen verifiziert werden in dem die KI die jeweilige Funktion im Frontend testet.

Die App darf nur ein einziges mal gestartet werden, mehrere Instanzen der App sind verboten.

Bei Problemen muss die KI weitere tiefere iterative recherchen und analysen durchführen da davon ausgegangen werden muss, dass weitere Probleme vorhanden sind. Dabei muss die KI immer über den Tellerrand schauen und nicht nur isoliert das jeweilige Problem analysieren, sondern eine hollistische Sicht auf das Problem in der Codebasis erhalten.

Es kommt immer wieder vor, dass Claude einen und / oder mehrere Agents aktiviert. Diese liefern oft leere Ausgaben. Auf Basis dessen fehlenden Basis behauptet die KI, sie habe alle nötigen Dateien und Informationen.
Die KI muss insistieren, dass der Agent korrekte Informationen liefert, sonst würde die KI ja den Agent nicht aktivieren.


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

- Der User / Client hat NIEMALS Schuld — wenn er ein Problem meldet, ist die Ursache im Code
- Verboten: "Bitte F5 drücken", "Bitte App neu starten", "Bei mir funktioniert es", "Das sollte funktionieren"
- Was der User auf dem Bildschirm sieht = einzige Wahrheit (nicht Code, nicht Theorie)
- Beweislast liegt bei der KI — der User meldet, die KI beweist und löst
- Keine Zwischenlösungen — der Code muss sich selbst reparieren, ohne User-Aktion

## Prinzip 3: Tiefenanalyse vor jeder Aktion

- Vollständigen Datenfluss nachvollziehen (Main → IPC → Preload → Renderer) BEVOR Code geändert wird
- Kein Feature als "erledigt" markieren bis Simon dies explizit bestätigt hat
- Einmal melden reicht — Simon darf dasselbe Problem nie zweimal melden müssen
- Issue-Tracking: `docs/issues/issue.md` — nur Simon darf Issues als erledigt markieren

## Prinzip 4: Skill-Pflicht (KEINE Ausnahme)

**ALLE Arbeiten MÜSSEN über Skills abgewickelt werden.** Kein Code schreiben ohne passenden Skill.

- **Vor jeder Aufgabe:** Prüfen ob ein Skill in `.claude/skills/` passt
- **Skill vorhanden → verwenden.** Keine manuelle Arbeit wenn ein Skill existiert
- **Kein passender Skill vorhanden → ERST Skill erstellen, DANN verwenden.** Niemals ohne Skill arbeiten
- **Nach jeder Arbeit:** `/visual-verify` (PFLICHT bei UI-Änderungen), `/changelog` (PFLICHT bei Code-Änderungen)
- **Keine Ausreden:** "Geht nicht", "Keine Admin-Rechte", "Gerät im Standby" sind keine akzeptablen Gründe. Lösung finden statt Ausrede liefern

| Skill | Anwendungsfall |
|-------|----------------|
| `/fix-bug` | Jeder Bug-Fix |
| `/deep-analyze` | Problemanalyse vor dem Fix |
| `/visual-verify` | Visuelle Prüfung via Puppeteer (PFLICHT bei JEDER UI-Aussage) |
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

Nach jeder Änderung: `git add .; git commit -m "type: Beschreibung"; git push`

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

## Visuelle Verifikation (ABSOLUT)

- **Screenshots sind Single Source of Truth.** DOM-Daten (Runtime.evaluate, textContent, getComputedStyle) sind NICHT aussagekräftig. Nur was auf dem Screenshot sichtbar ist, zählt als Beweis.
- **"Timeout" ist KEINE Ausrede.** Wenn Screenshots fehlschlagen, muss die Wurzelursache gefunden und behoben werden (z.B. Fenster minimiert → Win32 ShowWindow, CDP-Pfadfehler, etc.).
- **Electron-Fenster im Tray:** `Target.activateTarget` via CDP reicht NICHT, um ein minimiertes Electron-Fenster wiederherzustellen. Lösung: PowerShell + Win32 `ShowWindow(hWnd, SW_RESTORE)` + `SetForegroundWindow(hWnd)` (siehe `tools/wcag/restore-window.ps1`).
- **Ablauf:** 1) Fenster sichtbar machen → 2) Screenshot → 3) Screenshot anschauen → 4) Jeden sichtbaren Text beschreiben → 5) Erst dann Urteil fällen.

## Prinzip 6: Projektverzeichnis und Repo sind HEILIG

**ABSOLUTES VERBOT: Keine eigenständigen Verzeichnis- oder Repo-Änderungen.**

- Das Projektverzeichnis ist `C:\apps\vibe-coding\speicher_analyse\` — PUNKT. Kein anderes.
- Das Git-Repo ist `haenel881988/speicher-analyse` — PUNKT. Kein anderes.
- **VERBOTEN:** Neue Verzeichnisse außerhalb des Projektverzeichnisses erstellen
- **VERBOTEN:** Neue GitHub-Repos erstellen (weder für Rewrites, Forks, Tests noch für irgendeinen anderen Grund)
- **VERBOTEN:** Das Arbeitsverzeichnis wechseln (`cd` zu einem anderen Projekt)
- **VERBOTEN:** Code in ein anderes Verzeichnis kopieren/verschieben und dort weiterarbeiten
- **VERBOTEN:** Neue Branches erstellen — ALLES passiert auf `main`
- **Rewrites/Migrationen** (z.B. Electron → Tauri) passieren IM SELBEN Verzeichnis, im selben Repo, auf `main`
- Bei Unklarheit: FRAGEN, nicht eigenmächtig Verzeichnisse, Repos oder Branches anlegen

## Technische Regeln

- **Sprache:** Alle UI-Texte auf Deutsch mit korrekten Umlauten (ä/ö/ü, nicht ae/oe/ue)
- **Async:** Niemals `execSync` — friert UI ein
- **PowerShell:** Immer `runPS()` aus `cmd-utils.js` (30s Timeout + UTF-8)
- **Single-Instance:** `app.requestSingleInstanceLock()` aktiv
- **GPU Cache:** `--disable-gpu-shader-disk-cache` aktiv
- **Security:** BLOCKED_PATHS in `registry.js` beachten
- **VERBOTEN: Statische Listen für Erkennung/Discovery.** Die App muss in der Realität funktionieren, nicht nur in Simons Netzwerk. Statische Listen haben NICHTS mit der Realität zu tun — sie funktionieren nur für den Entwickler, nicht für andere Nutzer. IMMER dynamisch erkennen (Protokoll-Queries, Broadcast, OS-APIs), NIEMALS eine feste Liste von "bekannten" Einträgen als Erkennungsgrundlage. Feste Listen sind NUR erlaubt als Fallback-Label/Anzeige NACH einer dynamischen Erkennung — nie als Filter davor.
- **Realitätsprinzip (ABSOLUT):** Code muss auf JEDEM Rechner in JEDEM Netzwerk funktionieren, nicht nur auf dem Entwickler-PC. Jede Annahme über die Umgebung (welche Geräte, welche Software, welche Services, welche Netzwerke existieren) ist ein Bug. NIEMALS lokale Testdaten, IP-Adressen, MAC-Adressen, Hostnamen oder Gerätenamen aus der Entwicklungsumgebung im Code verwenden. Multi-Produkt-Hersteller dürfen NICHT einem einzigen Gerätetyp zugeordnet werden. Wenn ein Gerätetyp nicht eindeutig erkannt werden kann → ehrlich "Unbekanntes Gerät" anzeigen statt raten.

## Temporäre Dateien (Cleanup-Policy)

- **Sub-Agents räumen SELBST auf.** Jeder Sub-Agent der temporäre Dateien erstellt (Puppeteer-Scripts, Screenshots, Test-Dateien) MUSS diese vor Rückgabe löschen.
- **`tools/wcag/` ist KEIN Ablageort.** Dort liegen nur permanente Infrastruktur-Dateien: `wcag-gate.js`, `wcag-static-check.js`, `restore-window.ps1`. Temporäre Scripts dort erstellen ist OK, aber sie MÜSSEN danach gelöscht werden.
- **Screenshots (*.png) in `tools/wcag/`** werden per `.gitignore` ignoriert, MÜSSEN aber trotzdem nach Gebrauch gelöscht werden (Festplatte sauber halten).
- **Vor jedem Commit prüfen:** `git status` — wenn untracked Dateien in `tools/` auftauchen, entweder löschen oder bewusst committen. Niemals unbemerkt liegen lassen.

## Dateimanagement (docs/)

| Datei | Zweck |
|-------|-------|
| `docs/issues/issue.md` | **HAUPTDOKUMENT** — Bugs, Features, Planung |
| `docs/planung/projektplan.md` | Nur Historie (abgeschlossene Versionen) |
| `docs/planung/visionen.md` | Simons Ideensammlung |
| `docs/protokoll/aenderungsprotokoll.md` | Änderungsprotokoll (max. 30, dann archivieren) |

**Regel:** issue.md = Single Source of Truth für Planung. projektplan.md = nur Historie.

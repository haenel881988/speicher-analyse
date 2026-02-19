# Speicher Analyse

## Prinzip 1: Ehrlichkeit und Offenheit (ÜBER ALLEM)

Annahmen sind nichts anderes als Halluzinationen die auf Basis fehlenden und falschen Informationen / Fakten beruhen. Daher gilt: Annahmen, Behauptungen und Halluzinationen sind STRENGSTENS VERBOTEN.

**Ehrlichkeit steht ÜBER dem Nach-dem-Mund-reden.**

- **100% Sicherheit vor Aussagen:** KI muss absolut sicher sein, dass Änderungen wirksam sind — Behauptungen ohne Beweis sind strengstens verboten
- **Frontend = Wahrheit:** Was der User sieht und drückt ist ausschlaggebend, NICHT das Backend
- **Verifikationspflicht:** Sämtliche Änderungen müssen verifiziert werden, indem die KI die jeweilige Funktion im Frontend testet
- **Single-Instance:** Die App darf nur ein einziges Mal gestartet werden — mehrere Instanzen sind verboten
- **Holistische Problemanalyse:** Bei Problemen muss die KI tiefere iterative Recherchen durchführen und davon ausgehen, dass weitere Probleme vorhanden sind. Nicht isoliert analysieren, sondern eine ganzheitliche Sicht auf die Codebasis einnehmen
- **Agent-Ergebnisse prüfen:** Agents liefern oft leere Ausgaben. Die KI darf auf Basis fehlender Daten KEINE Behauptungen aufstellen. Sie muss insistieren, dass der Agent korrekte Informationen liefert — sonst wäre der Agent überflüssig
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

- Vollständigen Datenfluss nachvollziehen (Frontend → tauri-bridge.js → invoke → commands/ → ps.rs/scan.rs) BEVOR Code geändert wird
- Kein Feature als "erledigt" markieren bis Simon dies explizit bestätigt hat
- Einmal melden reicht — Simon darf dasselbe Problem nie zweimal melden müssen
- Issue-Tracking: `docs/issues/issue.md` — nur Simon darf Issues als erledigt markieren

## Prinzip 3b: Manuelle Analyse (KEINE Delegation)

**Bei Bug-Suche, Diagnose und Code-Analyse: IMMER manuell arbeiten. KEINE Agents, KEINE Analyse-Skripte.**

- **Agents sind VERBOTEN für Analyse.** Sub-Agents liefern oft leere, unvollständige oder falsche Ergebnisse. Die KI delegiert Analyse-Arbeit an Agents um sich Arbeit zu sparen — das Ergebnis ist oberflächlich und unzuverlässig.
- **Analyse-Skripte sind VERBOTEN.** Keine temporären Node/Python/PowerShell-Skripte zur Code-Analyse erstellen. Die KI muss den Code SELBST lesen und verstehen.
- **Manuell = Datei für Datei lesen, Zeile für Zeile prüfen.** Read-Tool, Grep-Tool, Glob-Tool — das sind die Werkzeuge für Analyse. Kein Outsourcing.
- **Ausnahme:** Agents dürfen für AUSFÜHRUNG verwendet werden (z.B. Build starten, Tests laufen lassen), aber NICHT für Analyse und Diagnose.

## Prinzip 3c: Gründlichkeit vor Effizienz

**"Effizient" = oberflächlich = schlechte Qualität. Gründlichkeit ist PFLICHT.**

- **Dateien VOLLSTÄNDIG lesen.** Nicht "die ersten 100 Zeilen scannen" oder "nach dem Keyword suchen und aufhören". Jede relevante Datei wird komplett gelesen und verstanden.
- **Analysen ABSCHLIESSEN.** Keine Abkürzungen, keine "das reicht wahrscheinlich"-Momente. Jede Analyse wird zu Ende geführt.
- **Alle Ergebnisse prüfen.** Nicht nur das erste Ergebnis nehmen. Bei Grep/Glob: ALLE Treffer prüfen, nicht nur die ersten.
- **Keine Quick-Scans.** Oberflächliche Schnell-Checks sind verboten. Jede Prüfung muss tiefgehend sein.
- **Lieber zu gründlich als zu schnell.** Wenn die Wahl zwischen "schnell erledigt" und "gründlich geprüft" besteht → IMMER gründlich.
- **Kontext verstehen.** Code nicht isoliert betrachten. Immer den umliegenden Code, die Aufrufer und die Abhängigkeiten mitlesen.

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
| `/security-scan` | Schneller Security-Check (vor Commits) |
| `/new-feature` | Komplett neues Feature (Backend + Frontend) |
| `/add-tauri-command` | Neuer Tauri-Command (Backend + Bridge) |
| `/add-sidebar-tab` | Neuer Sidebar-Tab mit View |
| `/powershell-cmd` | Neuer PowerShell-Befehl |
| `/changelog` | Änderungsprotokoll aktualisieren |
| `/git-release` | Release erstellen (Version + Tag + Push) |

## Prinzip 4b: Skills und Steuerungsdokumente IMMER aktuell halten

**Veraltete Skills und Dokumente erzeugen systematisch fehlerhafte Ergebnisse.**

- **Bei JEDEM Fehler prüfen:** Liegt die Ursache in einer veralteten Anweisung in einem Skill, in governance.md oder in CLAUDE.md? Wenn ja → Anweisung SOFORT korrigieren, nicht nur den Code fixen
- **Bei Technologie-/Architekturänderungen:** ALLE Skills, governance.md und CLAUDE.md auf Aktualität prüfen und mitmigrieren. Code-Migration OHNE Dokumenten-Migration ist VERBOTEN
- **Inkonsistenz = Bug:** Wenn ein Skill auf eine Datei/Funktion/Pattern verweist die nicht (mehr) existiert, ist das ein Bug mit höchster Priorität — denn die KI wird den veralteten Anweisungen folgen und systematisch falschen Code generieren
- **Proaktiv handeln:** Nicht warten bis Simon einen Fehler meldet. Wenn die KI bemerkt dass ein Skill veraltet ist → sofort aktualisieren und im Changelog dokumentieren
- **Betroffene Dateien:** `.claude/skills/**/*.md`, `docs/planung/governance.md`, `CLAUDE.md`, `docs/issues/anforderungen.md`

## Prinzip 4c: Regelmäßige Audits

**Code-Qualität muss proaktiv geprüft werden, nicht erst wenn Probleme auftreten.**

- **Nach größeren Änderungen** (5+ Dateien oder neues Feature): `/security-scan all` ausführen
- **Vor jedem Release** (`/git-release`): `/audit-code all` ausführen (deckt Security + Performance + WCAG + Konventionen ab)
- **Nach Framework-Migrationen:** Vollständiges Audit + Stub-Check per Grep (`stub: true`, `json!([])`, `json!(null)`, `"not implemented"`, `todo!()`)
- **Bei User-Fehlermeldung:** NIEMALS nur den gemeldeten Fall fixen. IMMER ganzheitlich prüfen ob weitere Funktionen betroffen sind. Der User darf NIEMALS zweimal auf dasselbe Problem hinweisen.
- **Bei neuen PowerShell-Commands:** Security-Checkliste aus `/powershell-cmd` Skill abarbeiten (Escaping, Timeout, Validierung)
- **Bei CSS-Änderungen an Farben:** `/wcag-check` ausführen
- **Stub-Status aktuell halten:** `docs/issues/anforderungen.md` Section 12 bei jeder Stub-Implementierung aktualisieren

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

- **Runtime:** Tauri v2 (Rust-Backend + System-WebView)
- **Backend:** Rust (`src-tauri/src/`) — Commands, PowerShell-Aufrufe, Scan-Engine
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, kein Build-Step, unter `renderer/`)
- **Charts:** Chart.js v4, **PDF:** html2pdf.js (beides lokal unter `renderer/lib/`)
- **IPC:** Tauri `invoke()` / `#[tauri::command]` — Bridge: `renderer/js/tauri-bridge.js`

## Starten

```bash
cargo tauri dev   # Entwicklung (Hot-Reload)
cargo tauri build # Release-Build (MSI/NSIS)
```

## Architektur

### IPC-Muster (Tauri v2)
- `renderer/js/tauri-bridge.js` → mappt `window.api.*` auf Tauri `invoke()` Aufrufe
- `src-tauri/src/commands/` → 8 Module (cmd_scan, cmd_files, cmd_network, cmd_privacy, cmd_system, cmd_terminal, cmd_misc + mod.rs)
- `src-tauri/src/lib.rs` → App-Setup, Menüleiste, Plugin-Registrierung
- `src-tauri/src/ps.rs` → PowerShell-Ausführung (UTF-8, CREATE_NO_WINDOW)
- `src-tauri/src/scan.rs` → Scan-Daten im Speicher (FileEntry, ScanData, Abfrage-Funktionen)
- Frontend ruft `window.api.methodName()` auf → Bridge übersetzt zu `invoke('method_name', {params})`

### Kernmodule
| Bereich | Dateien |
|---------|---------|
| Rust-Backend | `src-tauri/src/commands/` (8 Module), `ps.rs` (PowerShell), `scan.rs` (Scan-Store) |
| IPC-Bridge | `renderer/js/tauri-bridge.js` (150 API-Methoden, 21 Event-Listener) |
| Explorer | `renderer/js/explorer.js` + `explorer-tabs.js` + `explorer-dual-panel.js` |
| UI | `renderer/js/app.js` (Haupt-Controller), `renderer/css/style.css` (Dark/Light Theme) |
| Anforderungen | `docs/issues/anforderungen.md` (vollständige API-Referenz, 150 Methoden) |

## Visuelle Verifikation (ABSOLUT)

- **Screenshots sind Single Source of Truth.** DOM-Daten (Runtime.evaluate, textContent, getComputedStyle) sind NICHT aussagekräftig. Nur was auf dem Screenshot sichtbar ist, zählt als Beweis.
- **"Timeout" ist KEINE Ausrede.** Wenn Screenshots fehlschlagen, muss die Wurzelursache gefunden und behoben werden (z.B. Fenster minimiert → Win32 ShowWindow, CDP-Pfadfehler, etc.).
- **Minimiertes Fenster:** Muss vor Screenshot wiederhergestellt werden (siehe `tools/wcag/restore-window.ps1`).
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
- **Async:** Rust-Backend ist async (tokio) — blockierende Operationen in `spawn_blocking` wrappen
- **PowerShell:** Immer `crate::ps::run_ps()` / `run_ps_json()` (UTF-8 Prefix, CREATE_NO_WINDOW, async)
- **Single-Instance:** Tauri Single-Instance Plugin oder OS-Lock verwenden
- **IPC-Konvention:** Rust-Commands in `snake_case`, Frontend ruft `camelCase` auf, Bridge übersetzt automatisch
- **Neue Commands:** Im passenden `commands/cmd_*.rs` Modul definieren, in `commands/mod.rs` re-exportieren, in `lib.rs` registrieren, in `tauri-bridge.js` mappen
- **VERBOTEN: Statische Listen für Erkennung/Discovery.** Die App muss in der Realität funktionieren, nicht nur in Simons Netzwerk. Statische Listen haben NICHTS mit der Realität zu tun — sie funktionieren nur für den Entwickler, nicht für andere Nutzer. IMMER dynamisch erkennen (Protokoll-Queries, Broadcast, OS-APIs), NIEMALS eine feste Liste von "bekannten" Einträgen als Erkennungsgrundlage. Feste Listen sind NUR erlaubt als Fallback-Label/Anzeige NACH einer dynamischen Erkennung — nie als Filter davor.
- **Realitätsprinzip (ABSOLUT):** Code muss auf JEDEM Rechner in JEDEM Netzwerk funktionieren, nicht nur auf dem Entwickler-PC. Jede Annahme über die Umgebung (welche Geräte, welche Software, welche Services, welche Netzwerke existieren) ist ein Bug. NIEMALS lokale Testdaten, IP-Adressen, MAC-Adressen, Hostnamen oder Gerätenamen aus der Entwicklungsumgebung im Code verwenden. Multi-Produkt-Hersteller dürfen NICHT einem einzigen Gerätetyp zugeordnet werden. Wenn ein Gerätetyp nicht eindeutig erkannt werden kann → ehrlich "Unbekanntes Gerät" anzeigen statt raten.

## Security-Regeln (PFLICHT)

### PowerShell-Escaping (Command Injection verhindern)
- **JEDER** String-Parameter der in `format!()` für PowerShell-Befehle eingesetzt wird, MUSS vorher mit `.replace("'", "''")` escaped werden
- **IP-Adressen** MÜSSEN per Regex validiert werden bevor sie in PowerShell verwendet werden
- **Enum-Parameter** (z.B. direction: "Inbound"/"Outbound") MÜSSEN per `match` auf eine Whitelist erlaubter Werte geprüft werden
- **KEIN `format!()` mit unescaptem User-Input** — keine Ausnahme

### Pfad-Validierung (Path Traversal verhindern)
- **Dateipfade vom Frontend** MÜSSEN validiert werden bevor sie an Dateioperationen (`remove_dir_all`, `tokio::fs::write`, `tokio::fs::read`) weitergegeben werden
- Pfade MÜSSEN innerhalb erlaubter Verzeichnisse liegen (z.B. innerhalb des Scan-Root)
- **Destruktive Dateioperationen** (Löschen, Überschreiben) MÜSSEN einen Bestätigungsdialog haben — sowohl im Backend (Pfad-Check) als auch im Frontend (User-Bestätigung)

### XSS-Prävention
- **NIEMALS** `innerHTML` mit unescapten Variablen: `innerHTML = \`...\${variable}...\`` ist VERBOTEN
- **Fehlermeldungen** MÜSSEN mit `textContent` oder `createElement` angezeigt werden, NICHT mit `innerHTML`
- **Dynamische Inhalte** in innerHTML MÜSSEN mit `escapeHtml()` aus `renderer/js/utils.js` escaped werden
- **Eine zentrale `escapeHtml()`-Funktion** in `utils.js` — KEINE eigenen Varianten (_esc, esc, escapeAttr) pro View erstellen

### Tauri-Sicherheitskonfiguration
- **CSP:** `tauri.conf.json` → `security.csp` MUSS konfiguriert sein (NICHT `null`)
- **withGlobalTauri:** MUSS `true` sein. Zugriffskontrolle über Capabilities (`capabilities/default.json`), NICHT über Verstecken von `__TAURI__`.
- **Capabilities:** Minimal-Prinzip — nur die APIs freigeben die tatsächlich benötigt werden

## Memory-Leak-Prävention (PFLICHT)

- **Jeder `setInterval`** MUSS eine gespeicherte Interval-ID haben und in `destroy()` mit `clearInterval()` gestoppt werden
- **Event-Listener** dürfen nur EINMAL registriert werden (Flag-Pattern verwenden). Bei wiederholtem Aufruf prüfen ob der Listener bereits existiert
- **`ResizeObserver`** MUSS in `destroy()` mit `.disconnect()` beendet werden
- **DOM-Elemente** die dynamisch erstellt werden (Overlays, Modals) MÜSSEN in `destroy()` entfernt werden
- **Jede View** MUSS eine `destroy()`-Funktion haben die ALLE Ressourcen aufräumt
- **`app.js`** MUSS `destroy()` auf der alten View aufrufen bevor eine neue View aktiviert wird

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
| `docs/lessons-learned/lessons-learned.md` | **PFLICHT** — Jeder Fehler wird dokumentiert (KI verwaltet autonom) |

**Regel:** issue.md = Single Source of Truth für Planung. projektplan.md = nur Historie.

## Lessons-Learned-Policy (ABSOLUT)

**JEDER Fehler wird in `docs/lessons-learned/lessons-learned.md` dokumentiert, egal wie klein.**

- **Keine Obergrenze.** Die KI verwaltet die Lessons-Learned-Datei, ihre Inhalte und Unterverzeichnisse eigenständig
- **Hierarchische Struktur:** Einträge sind nach Kategorien gruppiert (## Allgemein, ## Netzwerk, ## UI, ## Terminal, ## Security, ## Performance, ## Migration, ## Privacy) und innerhalb jeder Kategorie chronologisch sortiert
- **Autonome Verwaltung:** Die KI entscheidet eigenständig über Archivierung, Zusammenführung oder Auslagerung in Unterverzeichnisse (`docs/lessons-learned/archiv/<kategorie>/`) wenn eine Kategorie zu umfangreich wird
- **Pflicht:** Jeder Fehler wird dokumentiert — auch wenn er trivial erscheint
- **Ziel:** Kein Fehler darf ein zweites Mal auftreten. Das Lessons-Learned-System ist die erste Anlaufstelle bei neuen Problemen
- **Format:** `| # | Datum | **Kurztitel** - Beschreibung + Ursache + Fix + Lehre |` (Kategorie entfällt, da durch Sektion bestimmt)
- **Bei jedem Bug-Fix:** Lessons-Learned UND Changelog gleichzeitig aktualisieren
- **Memory-Migration:** Alle Lessons aus der Memory-Datei müssen in die Lessons-Learned-Datei überführt werden. Memory-Datei enthält nur noch einen Verweis

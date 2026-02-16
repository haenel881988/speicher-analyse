---
name: audit-code
description: Codequalitäts-Audit für die Speicher Analyse Tauri-App. Prüft Security, Performance, WCAG-Kontrast, Tauri-Best-Practices und Projektkonventionen. Nutze diesen Skill für Code-Reviews oder wenn die Codequalität geprüft werden soll. Aufruf mit /audit-code [datei-oder-modul oder "all"].
---

# Code-Audit

Du führst ein Codequalitäts-Audit für die Speicher Analyse Tauri-App durch.

## Argument

`$ARGUMENTS` = Dateipfad, Modulname ODER `all` für vollständiges Audit

## Audit-Kategorien

### 1. Security (KRITISCH)

- **Command Injection (Rust):** Werden User-Parameter in `format!()` für PowerShell ohne `.replace("'", "''")` eingesetzt?
- **XSS:** Wird `innerHTML` mit unescapten Variablen (`${variable}`) verwendet? Wird `escapeHtml()` aus `utils.js` importiert?
- **Path Traversal:** Werden Dateipfade vom Frontend ohne Validierung an Dateioperationen (`remove_dir_all`, `write`, `read`) weitergegeben?
- **CSP:** Ist `"csp"` in `tauri.conf.json` korrekt konfiguriert (NICHT `null`)?
- **withGlobalTauri:** Ist `withGlobalTauri` auf `false` gesetzt?
- **Capabilities:** Sind Tauri-Capabilities korrekt und minimal konfiguriert?
- **Parameter-Validierung:** Werden IPC-Parameter (Strings, Pfade, IPs) vor der Verarbeitung validiert/escaped?
- **Escape-Duplikate:** Gibt es mehrere verschiedene escapeHtml/esc/_esc Implementierungen statt einem zentralen Import?

### 2. Performance

- **Blockierende Operationen:** Gibt es `std::fs::*` (synchron) statt `tokio::fs::*` (async) in Commands?
- **Parallele PowerShell:** Werden PS-Prozesse parallel gestartet? (müssen sequenziell sein)
- **Timeouts:** Hat jeder `run_ps()` Aufruf einen `tokio::time::timeout()` Wrapper?
- **Chart.js Animationen:** Ist `animation: false` gesetzt?
- **CSS Animationen:** Gibt es `animation: infinite` die GPU/CPU verschwenden?
- **Memory Leaks:** Werden Timer (`setInterval`), Event-Listener und Observer (`ResizeObserver`) korrekt aufgeräumt?
- **Unnötige Re-Renders:** Wird der DOM häufiger als nötig aktualisiert?

### 3. WCAG / Barrierefreiheit

**WICHTIG: WCAG-Prüfung MUSS visuell über `/visual-verify` erfolgen.**

- **Kontrastwerte:** Text-auf-Hintergrund mindestens 4.5:1 Ratio
- **Akzentfarben:** `--accent` (#6c5ce7) NUR für Borders/Backgrounds, NICHT für Text
- **Text-Farben:** `--text-primary` für Inhaltstext, `--accent-text` (#c4b5fd) für Labels
- **ARIA-Attribute:** `role`, `aria-label`, `aria-expanded` für interaktive Elemente
- **PFLICHT:** Bei WCAG-Audit IMMER `/visual-verify` für jeden View aufrufen

### 4. Tauri Best Practices

- **Single Instance:** `tauri-plugin-single-instance` aktiv?
- **CSP konfiguriert:** `tauri.conf.json` → `security.csp` ist NICHT `null`?
- **withGlobalTauri:** Ist `false` gesetzt (verhindert direkten Zugriff auf `window.__TAURI__`)?
- **Capabilities:** Minimal-Prinzip — nur benötigte APIs freigegeben?
- **Command-Registrierung:** Alle Commands in `lib.rs` → `generate_handler![]` registriert?
- **Stubs:** Gibt es Commands die nur `Ok(json!({"success": true}))` zurückgeben ohne echte Logik?
- **Mutex-Handling:** Werden `Mutex`/`RwLock` korrekt verwendet? Kann Mutex-Poisoning auftreten?

### 5. Projektkonventionen

- **Async:** Rust-Commands sind `async`? Blockierende Ops in `spawn_blocking()`?
- **Error-Handling:** `Result<Value, String>` Rückgabetyp? Fehler korrekt propagiert?
- **Deutsche UI-Texte:** Korrekte Umlaute (ä, ö, ü, ß), keine ae/oe/ue?
- **PowerShell:** Über `crate::ps::run_ps()`, nie direkt `std::process::Command::new("powershell.exe")`?
- **_loaded Flags:** Werden sie bei Fehler zurückgesetzt?
- **Logging:** `console.error('[<modul>]', err.message)` Format?
- **escapeHtml:** Wird die zentrale Funktion aus `utils.js` verwendet (nicht eigene Varianten)?
- **Lifecycle:** Hat jede View ein `destroy()` das Timer/Listener/Observer aufräumt?

### 6. Stub-Erkennung

- **Fake-Funktionen:** Gibt es Commands die `success: true` zurückgeben ohne echte Implementierung?
- **Kritische Stubs:** Privacy, Preferences, Session, Export — diese MÜSSEN als Stub markiert werden
- **Frontend-Warnung:** Erkennt das Frontend Stub-Antworten und warnt den User?

## Audit-Ablauf

### Einzelne Datei (`/audit-code src-tauri/src/commands.rs`)

1. Lies die angegebene Datei vollständig
2. Prüfe alle 6 Kategorien
3. Erstelle den Audit-Bericht

### Ganzes Modul (`/audit-code privacy`)

1. Lies `src-tauri/src/commands.rs` — suche nach dem Modul-Bereich (z.B. `// === Privacy ===`)
2. Lies `renderer/js/<modul>.js`
3. Prüfe den Bridge-Eintrag in `renderer/js/tauri-bridge.js`
4. Prüfe relevante HTML/CSS
5. Erstelle den Audit-Bericht

### Vollständiges Audit (`/audit-code all`)

**PFLICHT: ALLE Dateien vollständig lesen. NICHT nur greppen.**

1. **Rust-Backend:** Lies `src-tauri/src/commands.rs`, `ps.rs`, `scan.rs`, `lib.rs` vollständig
2. **Konfiguration:** Lies `src-tauri/tauri.conf.json` (CSP, Capabilities, withGlobalTauri)
3. **Frontend JS:** Lies ALLE `renderer/js/*.js` Dateien vollständig
4. **Bridge:** Lies `renderer/js/tauri-bridge.js` vollständig
5. **HTML/CSS:** Lies `renderer/index.html` und `renderer/css/style.css`
6. **Prüfe ALLE 6 Kategorien auf JEDE Datei**
7. Erstelle den Gesamtbericht

**VERBOTEN bei `all`:**
- "Fokussiere auf die häufigsten Problemkategorien" — ALLE Kategorien prüfen
- Nur greppen statt Dateien zu lesen — Grep findet keine Kontext-Probleme
- Dateien überspringen weil sie "wahrscheinlich OK" sind

## Ausgabeformat

```markdown
## Code-Audit: [Datei/Modul/Gesamt]

### Zusammenfassung
- Geprüfte Dateien: X
- Gefundene Probleme: X (Y kritisch, Z Hinweise)

### Kritische Probleme
| # | Kategorie | Datei:Zeile | Problem | Empfehlung |
|---|-----------|-------------|---------|------------|
| 1 | Security  | commands.rs:42 | format!() ohne Escaping | .replace("'", "''") |

### Hinweise
| # | Kategorie | Datei:Zeile | Problem | Empfehlung |
|---|-----------|-------------|---------|------------|
| 1 | Konvention| view.js:10  | ...     | ...        |

### Stubs
| # | Command | Zeile | Kritikalität | Empfehlung |
|---|---------|-------|-------------|------------|
| 1 | apply_privacy_setting | 123 | HOCH | Echte Implementierung |

### Positiv
- Was gut umgesetzt ist
```

## Wichtig

- **Keine automatischen Fixes** — nur berichten, User entscheidet
- **Konkreter sein:** Immer Datei:Zeile angeben
- **Priorisieren:** Security > Performance > WCAG > Tauri > Konventionen
- **False Positives vermeiden:** Im Zweifel den Kontext der Codestelle prüfen
- **Stubs explizit auflisten:** Jede Funktion die nichts tut aber Erfolg meldet

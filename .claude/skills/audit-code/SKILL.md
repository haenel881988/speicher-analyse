---
name: audit-code
description: Codequalitäts-Audit für die Speicher Analyse App. Prüft Security, Performance, WCAG-Kontrast, Electron-Best-Practices und Projektkonventionen. Nutze diesen Skill für Code-Reviews oder wenn die Codequalität geprüft werden soll. Aufruf mit /audit-code [datei-oder-modul oder "all"].
---

# Code-Audit

Du führst ein Codequalitäts-Audit für die Speicher Analyse Electron-App durch.

## Argument

`$ARGUMENTS` = Dateipfad, Modulname ODER `all` für vollständiges Audit

## Audit-Kategorien

### 1. Security

- **Command Injection:** Werden User-Inputs in `exec`/`execFile`/`runPS` ohne Sanitisierung verwendet?
- **Path Traversal:** Werden Dateipfade vom Frontend ohne Validierung an Dateioperationen weitergegeben?
- **Registry-Schutz:** Werden `BLOCKED_PATHS` aus `registry.js` respektiert?
- **IPC-Validierung:** Werden IPC-Argumente vor der Verarbeitung geprüft?
- **XSS:** Wird `innerHTML` mit unescaptem User-Input verwendet?
- **Electron-Security:** `nodeIntegration: false`, `contextIsolation: true`, CSP-Header vorhanden?

### 2. Performance

- **execSync Verbote:** Kein `execSync`, `readFileSync` etc. im Main Process (friert UI ein)
- **Parallele PowerShell:** Werden PS-Prozesse parallel gestartet? (→ müssen sequenziell sein)
- **Chart.js Animationen:** Ist `animation: false` gesetzt?
- **CSS Animationen:** Gibt es `animation: infinite` die GPU/CPU verschwenden?
- **Memory Leaks:** Werden Event-Listener, Timer und Worker korrekt aufgeräumt?
- **Unnötige Re-Renders:** Wird der DOM häufiger als nötig aktualisiert?

### 3. WCAG / Barrierefreiheit

- **Kontrastwerte:** Text-auf-Hintergrund mindestens 4.5:1 Ratio
- **Akzentfarben:** `--accent` (#6c5ce7) NUR für Borders/Backgrounds, NICHT für Text
- **Text-Farben:** `--text-primary` für Inhaltstext, `--accent-text` (#c4b5fd) für Labels
- **Hue-Similarity:** Lila/Violett auf dunklem Navy = schlecht wahrnehmbar trotz mathematischem Kontrast
- **Muted-Text:** `--text-muted` muss gegen TATSÄCHLICHEN Hintergrund geprüft werden

### 4. Electron Best Practices

- **Single Instance Lock:** `app.requestSingleInstanceLock()` aktiv?
- **GPU Cache:** `--disable-gpu-shader-disk-cache` gesetzt?
- **Preload:** Alles über `contextBridge`, kein direkter Node-Zugriff im Renderer?
- **IPC-Pattern:** `ipcMain.handle` + `ipcRenderer.invoke` (nicht `send`/`on` für Request/Response)?
- **Admin-Elevation:** `app.exit(0)` statt `app.quit()`, Lock freigeben vor Spawn?
- **Worker Threads:** Korrekte Terminierung, keine Main-Kontext-Lecks?

### 5. Projektkonventionen

- **`'use strict'`** in allen Main-Process-Dateien?
- **Async/Await** statt Callbacks?
- **Error-Handling:** try/catch mit `{ error: msg }` Rückgabe?
- **Deutsche UI-Texte:** Korrekte Umlaute (ä, ö, ü, ß), keine ae/oe/ue?
- **PowerShell:** Über `runPS()` aus cmd-utils.js, nie direkt `execFile('powershell.exe', ...)`?
- **_loaded Flags:** Werden sie bei Fehler zurückgesetzt?
- **Logging:** `console.error('[<modul>]', err.message)` Format?

## Audit-Ablauf

### Einzelne Datei (`/audit-code main/privacy.js`)

1. Lies die angegebene Datei vollständig
2. Prüfe alle 5 Kategorien
3. Erstelle den Audit-Bericht

### Ganzes Modul (`/audit-code privacy`)

1. Lies `main/<modul>.js` + `renderer/js/<modul>.js`
2. Prüfe den IPC-Handler in `main/ipc-handlers.js`
3. Prüfe den Preload-Eintrag in `main/preload.js`
4. Prüfe relevante HTML/CSS
5. Erstelle den Audit-Bericht

### Vollständiges Audit (`/audit-code all`)

1. Scanne alle `main/*.js` und `renderer/js/*.js` Dateien
2. Fokussiere auf die häufigsten Problemkategorien:
   - Grep nach `execSync`, `readFileSync` (Performance)
   - Grep nach `innerHTML` ohne Escaping (Security)
   - Grep nach `execFile('powershell` ohne runPS (Konvention)
   - Grep nach `animation:` in CSS (Performance)
3. Erstelle den Gesamtbericht

## Ausgabeformat

```markdown
## Code-Audit: [Datei/Modul/Gesamt]

### Zusammenfassung
- Geprüfte Dateien: X
- Gefundene Probleme: X (Y kritisch, Z Hinweise)

### Kritische Probleme
| # | Kategorie | Datei:Zeile | Problem | Empfehlung |
|---|-----------|-------------|---------|------------|
| 1 | Security  | file.js:42  | ...     | ...        |

### Hinweise
| # | Kategorie | Datei:Zeile | Problem | Empfehlung |
|---|-----------|-------------|---------|------------|
| 1 | Konvention| file.js:10  | ...     | ...        |

### Positiv
- Was gut umgesetzt ist
```

## Wichtig

- **Keine automatischen Fixes** - nur berichten, User entscheidet
- **Konkreter sein:** Immer Datei:Zeile angeben
- **Priorisieren:** Security > Performance > WCAG > Konventionen
- **False Positives vermeiden:** Im Zweifel den Kontext der Codestelle prüfen

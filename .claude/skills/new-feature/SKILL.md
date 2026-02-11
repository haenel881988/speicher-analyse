---
name: new-feature
description: Scaffolding für ein neues Feature im Electron-Projekt. Erstellt Backend-Modul, IPC-Handler, Preload-Eintrag und Renderer-View nach den Projektkonventionen. Nutze diesen Skill wenn ein komplett neues Feature von Grund auf implementiert werden soll (Backend + Frontend). Für nur einen Sidebar-Tab nutze /add-sidebar-tab, für nur einen IPC-Handler nutze /add-ipc. Aufruf mit /new-feature [feature-name] [beschreibung].
---

# Neues Feature scaffolden

Du erstellst das Grundgerüst für ein neues Feature in der Speicher Analyse Electron-App.

## Argumente

- `$ARGUMENTS[0]` = Feature-Name (kebab-case, z.B. `disk-health`)
- `$ARGUMENTS[1]` = Kurzbeschreibung des Features (optional)

## Voranalyse

**Bevor du Code schreibst:**

1. Lies die bestehende Architektur:
   - `main/ipc-handlers.js` - Wie Handler registriert werden
   - `main/preload.js` - Wie die API-Surface aussieht
   - `renderer/js/app.js` - Wie Views eingebunden werden
   - `renderer/index.html` - Wie HTML-Tabs/Views strukturiert sind

2. Prüfe ob ein ähnliches Feature bereits existiert und nutze es als Vorlage

## Dateien erstellen

### 1. Backend-Modul: `main/<feature-name>.js`

```javascript
'use strict';

// <Beschreibung>

let mainWindow = null;

function register(win) {
    mainWindow = win;
}

// Hauptfunktionen hier...

module.exports = { register };
```

**Konventionen:**
- `'use strict'` am Anfang
- `register(win)` Pattern für mainWindow-Referenz
- Alle externen Prozesse mit `execFile` (nie `execSync`)
- Alle Funktionen als `async` wenn I/O involviert
- Fehlerbehandlung mit try/catch

### 2. IPC-Handler in `main/ipc-handlers.js`

Füge den Handler in die `registerAll(mainWindow)` Funktion ein:

```javascript
ipcMain.handle('<feature-name>-<action>', async (event, ...args) => {
    try {
        return await featureModule.action(...args);
    } catch (err) {
        console.error('[<feature-name>] Fehler:', err.message);
        return { error: err.message };
    }
});
```

**Platzierung:** Gruppiert mit ähnlichen Handlern, mit Kommentar-Header:

```javascript
// === <Feature-Name> ===
```

### 3. Preload-Eintrag in `main/preload.js`

Füge die API-Methode in das `contextBridge.exposeInMainWorld('api', { ... })` Objekt ein:

```javascript
featureNameAction: (...args) => ipcRenderer.invoke('<feature-name>-<action>', ...args),
```

**Konventionen:**
- camelCase für Methodennamen
- Exakt passend zum IPC-Kanal-Namen
- Alle Methoden geben Promises zurück (invoke)

### 4. Renderer-View: `renderer/js/<feature-name>.js`

```javascript
// <Feature-Name> View

export class FeatureNameView {
    constructor(containerEl) {
        this.el = containerEl;
        this.data = null;
    }

    async init() {
        this.render();
        await this.loadData();
    }

    async loadData() {
        try {
            this.data = await window.api.featureNameAction();
            this.render();
        } catch (err) {
            console.error('[FeatureName]', err);
            this.renderError(err.message);
        }
    }

    render() {
        if (!this.el) return;
        this.el.innerHTML = `
            <div class="view-header">
                <h2>Feature-Titel</h2>
            </div>
            <div class="view-content">
                <!-- Inhalt -->
            </div>
        `;
    }

    renderError(msg) {
        if (!this.el) return;
        this.el.innerHTML = `<div class="error-message">${msg}</div>`;
    }

    destroy() {
        this.data = null;
    }
}
```

**Konventionen:**
- ES Module (`export class`)
- Constructor nimmt Container-Element
- `init()`, `render()`, `destroy()` Lifecycle
- Fehlerbehandlung in `loadData()`
- Alle UI-Texte auf Deutsch mit korrekten Umlauten (ä, ö, ü, ß)
- **KRITISCH:** `_loaded` Flag muss bei Fehler zurückgesetzt werden (sonst kann User nie erneut laden)

### 5. HTML-Eintrag in `renderer/index.html`

Füge hinzu:
- Sidebar-Tab-Button (wenn es ein Haupt-Tab sein soll)
- View-Container `<div id="view-<feature-name>" class="view-panel">`
- Script-Import (ES Module)

### 6. App-Integration in `renderer/js/app.js`

- Import der View-Klasse
- Instanziierung im Constructor
- Einbindung in `switchToTab()` Logic

## Nach dem Scaffolding

1. Erstelle eine Zusammenfassung der erstellten/geänderten Dateien
2. Liste die nächsten Schritte auf (was der Entwickler implementieren muss)
3. Weise auf relevante bestehende Patterns hin die als Referenz dienen können

## Verwandte Skills

- `/add-ipc` - Wenn nur ein einzelner IPC-Handler benötigt wird (ohne View)
- `/add-sidebar-tab` - Wenn nur ein Sidebar-Tab mit View benötigt wird (ohne Backend)
- `/powershell-cmd` - Wenn das Feature PowerShell-Befehle einbindet
- `/changelog` - Nach Fertigstellung zum Dokumentieren der Änderung

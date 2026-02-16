---
name: new-feature
description: Scaffolding für ein neues Feature in der Tauri v2 App. Erstellt Rust-Command in commands.rs, Bridge-Eintrag in tauri-bridge.js und Renderer-View nach den Projektkonventionen. Nutze diesen Skill wenn ein komplett neues Feature von Grund auf implementiert werden soll (Backend + Frontend). Für nur einen Sidebar-Tab nutze /add-sidebar-tab, für nur einen Command nutze /add-tauri-command. Aufruf mit /new-feature [feature-name] [beschreibung].
---

# Neues Feature scaffolden

Du erstellst das Grundgerüst für ein neues Feature in der Speicher Analyse Tauri-App.

## Argumente

- `$ARGUMENTS[0]` = Feature-Name (kebab-case, z.B. `disk-health`)
- `$ARGUMENTS[1]` = Kurzbeschreibung des Features (optional)

## Voranalyse

**Bevor du Code schreibst:**

1. Lies die bestehende Architektur:
   - `src-tauri/src/commands.rs` - Wie Commands definiert werden
   - `src-tauri/src/lib.rs` - Wie Commands registriert werden
   - `renderer/js/tauri-bridge.js` - Wie Bridge-Methoden aufgebaut sind
   - `renderer/js/app.js` - Wie Views eingebunden werden
   - `renderer/index.html` - Wie HTML-Views strukturiert sind

2. Prüfe ob ein ähnliches Feature bereits existiert und nutze es als Vorlage

## Dateien erstellen/ändern

### 1. Rust-Command: `src-tauri/src/commands.rs`

Füge neue Commands ein (gruppiert mit Kommentar-Header):

```rust
// === <Feature-Name> ===

#[tauri::command]
pub async fn feature_action(param: String) -> Result<serde_json::Value, String> {
    // SECURITY: Parameter für PowerShell escapen
    let safe_param = param.replace("'", "''");

    let script = format!(r#"
        $result = Get-Something '{}'
        $result | ConvertTo-Json -Depth 3
    "#, safe_param);

    crate::ps::run_ps_json(&script).await
}
```

**Security-Regeln (PFLICHT):**
- Alle String-Parameter die in `format!()` für PowerShell eingesetzt werden → `.replace("'", "''")`
- Pfade vom Frontend → validieren (existiert? innerhalb erlaubter Verzeichnisse?)
- Enum-Parameter → per `match` auf erlaubte Werte prüfen
- IP-Adressen → per Regex validieren

### 2. Command-Registrierung: `src-tauri/src/lib.rs`

In den `generate_handler![]` Macro-Aufruf einfügen:

```rust
commands::feature_action,
```

### 3. Bridge-Eintrag: `renderer/js/tauri-bridge.js`

```javascript
featureAction: makeInvoke('feature_action', 'param'),
```

### 4. Renderer-View: `renderer/js/<feature-name>.js`

```javascript
// <Feature-Name> View
import { escapeHtml } from './utils.js';

let _loaded = false;
let _intervalId = null;

export async function init() {
    const container = document.getElementById('view-<feature-name>');
    if (!container) return;

    if (!_loaded) {
        await loadData(container);
    }
}

async function loadData(container) {
    try {
        container.innerHTML = '<div class="loading">Lade Daten...</div>';

        const data = await window.api.featureAction();
        if (data?.error) throw new Error(data.error);

        render(container, data);
        _loaded = true;
    } catch (err) {
        console.error('[FeatureName]', err);
        // SECURITY: Fehlermeldungen SICHER anzeigen
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Fehler: ' + err.message;
        container.innerHTML = '';
        container.appendChild(errorDiv);
        _loaded = false; // WICHTIG: Retry ermöglichen
    }
}

function render(container, data) {
    if (!container) return;

    // SECURITY: Dynamische Inhalte IMMER mit escapeHtml() escapen
    container.innerHTML = `
        <div class="view-header">
            <h2>Feature-Titel</h2>
        </div>
        <div class="view-content">
            ${data.items.map(item => `
                <div class="item">
                    <span>${escapeHtml(item.name)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// LIFECYCLE: Aufräumen — PFLICHT für jeden Timer/Listener/Observer
export function destroy() {
    // Timer stoppen
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }

    // Event-Listener entfernen (falls registriert)
    // element.removeEventListener('click', _handler);

    // Observer disconnecten
    // if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }

    _loaded = false;
}
```

**Konventionen:**
- ES Module (`export function`)
- `_loaded` Flag mit Reset bei Fehler (KRITISCH — sonst kann User nie erneut laden)
- **SECURITY:** Fehlermeldungen mit `textContent` oder `createElement`, NIEMALS `innerHTML` mit `${variable}`
- **SECURITY:** `import { escapeHtml } from './utils.js'` für alle dynamischen Inhalte in innerHTML
- **LIFECYCLE:** `destroy()` MUSS alle Timer (`clearInterval`), Listener (`removeEventListener`) und Observer (`disconnect`) aufräumen
- Alle UI-Texte auf Deutsch mit korrekten Umlauten (ä, ö, ü, ß)

### 5. HTML-Eintrag in `renderer/index.html`

- Sidebar-Tab-Button (wenn es ein Haupt-Tab sein soll)
- View-Container `<div id="view-<feature-name>" class="view-panel">`
- Script-Import (ES Module)

### 6. App-Integration in `renderer/js/app.js`

- Import der View-Funktionen
- Einbindung in `switchToTab()` Logic

## Security-Checkliste (PFLICHT vor Commit)

- [ ] Alle PowerShell-Parameter escaped (`.replace("'", "''")`)?
- [ ] Pfade vom Frontend validiert?
- [ ] Fehlermeldungen mit `textContent` statt `innerHTML`?
- [ ] Dynamische Inhalte mit `escapeHtml()` escaped?
- [ ] `destroy()` räumt Timer/Listener/Observer auf?
- [ ] `_loaded` Flag wird bei Fehler zurückgesetzt?
- [ ] Keine `innerHTML = \`...\${variable}...\`` ohne Escaping?

## Verwandte Skills

- `/add-tauri-command` - Wenn nur ein einzelner Command benötigt wird (ohne View)
- `/add-sidebar-tab` - Wenn nur ein Sidebar-Tab mit View benötigt wird (ohne Backend)
- `/powershell-cmd` - Wenn das Feature PowerShell-Befehle einbindet
- `/changelog` - Nach Fertigstellung zum Dokumentieren der Änderung

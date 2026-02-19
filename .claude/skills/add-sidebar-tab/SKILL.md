---
name: add-sidebar-tab
description: Fügt einen neuen Sidebar-Tab mit vollständiger View hinzu. Erstellt HTML-Eintrag in index.html, JavaScript-View-Klasse und App-Integration. Backend-Commands werden über /add-tauri-command hinzugefügt. Nutze diesen Skill wenn ein neuer Menüpunkt in der Sidebar mit eigener Ansicht benötigt wird. Aufruf mit /add-sidebar-tab [tab-name] [sidebar-gruppe] [beschreibung].
---

# Neuen Sidebar-Tab hinzufügen

Du fügst einen neuen Tab in die Sidebar der Speicher Analyse Tauri-App ein, inklusive View und App-Integration.

## Argumente

- `$ARGUMENTS[0]` = Tab-Name (kebab-case, z.B. `disk-health`)
- `$ARGUMENTS[1]` = Sidebar-Gruppe: `start`, `analyse`, `bereinigung`, `system`, `sicherheit`, `extras`
- `$ARGUMENTS[2]` = Kurzbeschreibung (optional)

## Voranalyse

**Pflicht — lies diese Dateien zuerst:**

1. `renderer/index.html` - Bestehende Sidebar-Struktur und View-Container verstehen
2. `renderer/js/app.js` - Wie Views eingebunden und gewechselt werden
3. `renderer/css/style.css` - Bestehende View-Styles als Referenz
4. Ein bestehendes View als Referenz (z.B. `renderer/js/privacy.js`)

## 3 Dateien ändern/erstellen

### 1. `renderer/index.html` — Sidebar-Button + View-Container

**Sidebar-Button** in die passende Gruppe einfügen:

```html
<button class="sidebar-btn" data-tab="<tab-name>" title="<Anzeigename>">
    <span class="sidebar-icon"><i class="<icon>"></i></span>
    <span class="sidebar-label"><Anzeigename></span>
</button>
```

**View-Container** nach den bestehenden Views einfügen:

```html
<div id="view-<tab-name>" class="view-panel" style="display:none">
    <!-- Wird von JS befüllt -->
</div>
```

**Script-Import** am Ende der Script-Sektion:

```html
<script type="module" src="js/<tab-name>.js"></script>
```

### 2. `renderer/js/<tab-name>.js` — View-Klasse

```javascript
// <Tab-Name> View
import { escapeHtml } from './utils.js';

let _loaded = false;
let _intervalId = null;

export async function init() {
    const container = document.getElementById('view-<tab-name>');
    if (!container) return;

    if (!_loaded) {
        await loadData(container);
    }
}

async function loadData(container) {
    try {
        container.innerHTML = '<div class="loading">Lade Daten...</div>';

        const data = await window.api.tabNameAction();
        if (data?.error) throw new Error(data.error);

        render(container, data);
        _loaded = true;
    } catch (err) {
        console.error('[<TabName>]', err);
        // SECURITY: Fehlermeldungen SICHER anzeigen (textContent, nicht innerHTML)
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Fehler: ' + err.message;
        container.innerHTML = '';
        container.appendChild(errorDiv);
        _loaded = false; // WICHTIG: Retry ermöglichen
    }
}

function render(container, data) {
    // SECURITY: Alle dynamischen Inhalte mit escapeHtml() escapen
    container.innerHTML = `
        <div class="view-header">
            <h2><Anzeigename></h2>
            <p class="view-description">Beschreibung</p>
        </div>
        <div class="view-content">
            ${data.items.map(item => `
                <div class="item">${escapeHtml(item.name)}</div>
            `).join('')}
        </div>
    `;
}

// LIFECYCLE: Aufräumen — PFLICHT
export function destroy() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
    // Event-Listener entfernen, Observer disconnecten
    _loaded = false;
}
```

**Konventionen:**
- ES Module (`export function`)
- `_loaded` Flag mit Reset bei Fehler (KRITISCH — sonst kann User nie erneut laden)
- **SECURITY:** Fehlermeldungen mit `textContent` oder `createElement`, NIEMALS `innerHTML` mit `${err.message}`
- **SECURITY:** `import { escapeHtml } from './utils.js'` für alle dynamischen Inhalte
- **LIFECYCLE:** `destroy()` MUSS Timer/Listener/Observer aufräumen
- Loading-State anzeigen während Daten geladen werden
- Alle UI-Texte auf Deutsch mit korrekten Umlauten

### 3. `renderer/js/app.js` — View-Integration

1. **Import hinzufügen:**
```javascript
import * as tabNameView from './<tab-name>.js';
```

2. **In `switchToTab()` einbinden:**
```javascript
case '<tab-name>':
    await tabNameView.init();
    break;
```

## Sidebar-Gruppen Referenz

| Gruppe | Inhalt |
|--------|--------|
| `start` | Dashboard, Explorer |
| `analyse` | Dateitypen, Verzeichnisbaum, Treemap, Top 100, Duplikate, Alte Dateien |
| `bereinigung` | Bereinigung, Registry, Autostart, Dienste |
| `system` | Optimierung, Updates, S.M.A.R.T., System-Score |
| `sicherheit` | Privacy, Netzwerk, Software-Audit |
| `extras` | Scan-Vergleich, Export |

## Security-Checkliste (PFLICHT vor Commit)

- [ ] Fehlermeldungen mit `textContent` statt `innerHTML`?
- [ ] Dynamische Inhalte mit `escapeHtml()` escaped?
- [ ] `destroy()` räumt Timer/Listener/Observer auf?
- [ ] `_loaded` Flag wird bei Fehler zurückgesetzt?
- [ ] Keine `innerHTML = \`...\${variable}...\`` ohne Escaping?

## Ausgabe

Nach dem Erstellen, gib eine Zusammenfassung:
- Welche Dateien erstellt/geändert wurden
- Sidebar-Gruppe und Position
- Ob Backend-Commands noch benötigt werden (falls ja, verweise auf `/add-tauri-command`)

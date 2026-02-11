---
name: add-sidebar-tab
description: Fügt einen neuen Sidebar-Tab mit vollständiger View hinzu. Erstellt HTML-Eintrag in index.html, JavaScript-View-Klasse, App-Integration und optional Backend-Modul + IPC. Nutze diesen Skill wenn ein neuer Menüpunkt in der Sidebar mit eigener Ansicht benötigt wird. Aufruf mit /add-sidebar-tab [tab-name] [sidebar-gruppe] [beschreibung].
---

# Neuen Sidebar-Tab hinzufügen

Du fügst einen neuen Tab in die Sidebar der Speicher Analyse App ein, inklusive View und App-Integration.

## Argumente

- `$ARGUMENTS[0]` = Tab-Name (kebab-case, z.B. `disk-health`)
- `$ARGUMENTS[1]` = Sidebar-Gruppe: `start`, `analyse`, `bereinigung`, `system`, `sicherheit`, `extras`
- `$ARGUMENTS[2]` = Kurzbeschreibung (optional)

## Voranalyse

**Pflicht - lies diese Dateien zuerst:**

1. `renderer/index.html` - Bestehende Sidebar-Struktur und View-Container verstehen
2. `renderer/js/app.js` - Wie Views eingebunden und gewechselt werden
3. `renderer/css/style.css` - Bestehende View-Styles als Referenz
4. Ein bestehendes View-Paar als Referenz (z.B. `renderer/js/privacy.js` + `main/privacy.js`)

## 4 Dateien ändern/erstellen

### 1. `renderer/index.html` - Sidebar-Button + View-Container

**Sidebar-Button** in die passende Gruppe einfügen:

```html
<!-- In der passenden sidebar-group -->
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

**Icon-Auswahl:** Verwende Unicode-Symbole oder bestehende Icon-Klassen aus dem Projekt.

### 2. `renderer/js/<tab-name>.js` - View-Klasse

```javascript
// <Tab-Name> View

let _loaded = false;

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

        // const data = await window.api.<methodName>();
        // if (data?.error) throw new Error(data.error);

        render(container /*, data */);
        _loaded = true;
    } catch (err) {
        console.error('[<TabName>]', err);
        container.innerHTML = `<div class="error-message">Fehler: ${err.message}</div>`;
        _loaded = false; // WICHTIG: Retry ermöglichen
    }
}

function render(container /*, data */) {
    container.innerHTML = `
        <div class="view-header">
            <h2><Anzeigename></h2>
            <p class="view-description">Beschreibung</p>
        </div>
        <div class="view-content">
            <!-- Inhalt hier -->
        </div>
    `;
}

export function destroy() {
    _loaded = false;
}
```

**Konventionen:**
- ES Module (`export function`)
- `_loaded` Flag mit Reset bei Fehler (KRITISCH - sonst kann User nie erneut laden)
- Loading-State anzeigen während Daten geladen werden
- Alle UI-Texte auf Deutsch mit korrekten Umlauten
- Error-Handling mit sichtbarer Fehlermeldung

### 3. `renderer/js/app.js` - View-Integration

1. **Import hinzufügen** (oben bei den bestehenden Imports):
```javascript
import * as tabNameView from './<tab-name>.js';
```

2. **In `switchToTab()` einbinden** (im switch/if-Block):
```javascript
case '<tab-name>':
    await tabNameView.init();
    break;
```

### 4. `renderer/css/style.css` - Styles (nur wenn nötig)

Nutze bestehende Klassen (`view-header`, `view-content`, `view-description`, etc.) soweit möglich. Nur eigene Styles hinzufügen wenn die bestehenden nicht ausreichen.

## Sidebar-Gruppen Referenz

| Gruppe | Inhalt |
|--------|--------|
| `start` | Dashboard, Explorer |
| `analyse` | Dateitypen, Verzeichnisbaum, Treemap, Top 100, Duplikate, Alte Dateien |
| `bereinigung` | Bereinigung, Registry, Autostart, Dienste, Bloatware |
| `system` | Optimierung, Updates, S.M.A.R.T., System-Score |
| `sicherheit` | Privacy, Netzwerk, Software-Audit |
| `extras` | Scan-Vergleich, Export |

## Ausgabe

Nach dem Erstellen, gib eine Zusammenfassung:
- Welche Dateien erstellt/geändert wurden
- Sidebar-Gruppe und Position
- Ob Backend/IPC noch benötigt wird (falls ja, verweise auf `/add-ipc` und `/new-feature`)

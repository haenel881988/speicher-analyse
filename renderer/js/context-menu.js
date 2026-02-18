/**
 * Context Menu — Frontend-basiertes Kontextmenü für den Explorer.
 * Zeigt ein positioniertes Popup-Menü bei Rechtsklick.
 * Ersetzt den Rust-Roundtrip (show_context_menu) durch eine reine Frontend-Lösung.
 */

const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz', '.zst', '.cab', '.iso'];

let activeMenu = null;

/**
 * Zeigt ein Kontextmenü an der gegebenen Position.
 * @param {number} x - Mausposition X
 * @param {number} y - Mausposition Y
 * @param {string} type - Kontexttyp: 'file', 'directory', 'tree-background'
 * @param {object} context - { path, name, selectedPaths, extension }
 * @param {function} onAction - Callback(actionObj) wenn ein Menüeintrag geklickt wird
 * @param {object} options - { clipboardHasItems, isDualPanel }
 */
export function showContextMenu(x, y, type, context, onAction, options = {}) {
    closeContextMenu();

    const items = buildMenuItems(type, context, options);
    if (items.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');

    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menu.appendChild(sep);
            continue;
        }

        const el = document.createElement('div');
        el.className = 'context-menu-item' + (item.disabled ? ' disabled' : '');
        el.setAttribute('role', 'menuitem');
        el.setAttribute('data-action', item.action);

        // Icon + Label
        const labelSpan = document.createElement('span');
        labelSpan.className = 'context-menu-label';
        labelSpan.textContent = item.label;
        el.appendChild(labelSpan);

        // Shortcut hint (right-aligned)
        if (item.shortcut) {
            const shortcutSpan = document.createElement('span');
            shortcutSpan.className = 'context-menu-shortcut';
            shortcutSpan.textContent = item.shortcut;
            el.appendChild(shortcutSpan);
        }

        if (!item.disabled) {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                closeContextMenu();
                onAction({ action: item.action, ...context, ...(item.extra || {}) });
            });
        }

        menu.appendChild(el);
    }

    document.body.appendChild(menu);
    activeMenu = menu;

    // Position mit Rand-Erkennung
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 8;
        const maxY = window.innerHeight - rect.height - 8;
        menu.style.left = Math.max(4, Math.min(x, maxX)) + 'px';
        menu.style.top = Math.max(4, Math.min(y, maxY)) + 'px';
    });

    // Schliessen bei Klick ausserhalb
    const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
            closeContextMenu();
            document.removeEventListener('mousedown', closeHandler, true);
        }
    };
    document.addEventListener('mousedown', closeHandler, true);

    // Schliessen bei Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeContextMenu();
            document.removeEventListener('keydown', escHandler, true);
        }
    };
    document.addEventListener('keydown', escHandler, true);
}

export function closeContextMenu() {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

function buildMenuItems(type, context, options) {
    const items = [];
    const ext = (context.name || '').toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
    const isArchive = ARCHIVE_EXTENSIONS.includes(ext);
    const isExe = ext === '.exe' || ext === '.msi';
    const hasClipboard = options.clipboardHasItems || false;
    const multiSelected = (context.selectedPaths || []).length > 1;

    if (type === 'file') {
        items.push({ label: 'Öffnen', action: 'open-file', shortcut: 'Enter' });
        items.push({ label: 'Öffnen mit...', action: 'open-with' });
        if (isExe) {
            items.push({ label: 'Als Administrator ausführen', action: 'run-as-admin' });
        }
        items.push({ label: 'Im Explorer anzeigen', action: 'show-in-explorer' });

        if (isArchive) {
            items.push({ separator: true });
            items.push({ label: 'Hier entpacken', action: 'extract-here' });
            items.push({ label: 'Entpacken nach...', action: 'extract-to' });
        }

        items.push({ separator: true });
        items.push({ label: 'Ausschneiden', action: 'cut', shortcut: 'Ctrl+X' });
        items.push({ label: 'Kopieren', action: 'copy', shortcut: 'Ctrl+C' });
        items.push({ label: 'Pfad kopieren', action: 'copy-path' });

        if (multiSelected) {
            items.push({ separator: true });
            items.push({ label: 'Stapel-Umbenennung...', action: 'batch-rename' });
        }

        items.push({ separator: true });
        items.push({ label: 'Umbenennen', action: 'rename', shortcut: 'F2' });
        items.push({ label: 'In Papierkorb', action: 'delete-trash', shortcut: 'Entf' });
        items.push({ label: 'Permanent löschen', action: 'delete-permanent', shortcut: 'Shift+Entf' });

        items.push({ separator: true });
        items.push({ label: 'Eigenschaften', action: 'properties', shortcut: 'Alt+Enter' });
    }

    if (type === 'directory') {
        items.push({ label: 'Öffnen', action: 'open-file' });
        items.push({ label: 'Im Explorer anzeigen', action: 'show-in-explorer' });
        items.push({ label: 'Im Terminal öffnen', action: 'open-in-terminal' });

        items.push({ separator: true });
        items.push({ label: 'Neuer Ordner', action: 'create-folder' });
        items.push({ label: 'Ausschneiden', action: 'cut', shortcut: 'Ctrl+X' });
        items.push({ label: 'Kopieren', action: 'copy', shortcut: 'Ctrl+C' });
        items.push({ label: 'Einfügen', action: 'paste', shortcut: 'Ctrl+V', disabled: !hasClipboard });
        items.push({ label: 'Pfad kopieren', action: 'copy-path' });

        items.push({ separator: true });
        items.push({ label: 'Ordnergrösse berechnen', action: 'calculate-folder-size' });

        items.push({ separator: true });
        items.push({ label: 'Umbenennen', action: 'rename', shortcut: 'F2' });
        items.push({ label: 'In Papierkorb', action: 'delete-trash', shortcut: 'Entf' });
        items.push({ label: 'Permanent löschen', action: 'delete-permanent', shortcut: 'Shift+Entf' });

        items.push({ separator: true });
        items.push({ label: 'Eigenschaften', action: 'properties', shortcut: 'Alt+Enter' });
    }

    if (type === 'tree-background') {
        items.push({ label: 'Neuer Ordner', action: 'create-folder' });
        items.push({ label: 'Einfügen', action: 'paste', shortcut: 'Ctrl+V', disabled: !hasClipboard });
        items.push({ separator: true });
        items.push({ label: 'Aktualisieren', action: 'refresh', shortcut: 'F5' });
    }

    return items;
}

const { Menu, BrowserWindow, app } = require('electron');

function buildAppMenu(mainWindow) {
    const template = [
        {
            label: 'Datei',
            submenu: [
                {
                    label: 'Neuer Scan...',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'new-scan' }),
                },
                { type: 'separator' },
                {
                    label: 'CSV exportieren',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'export-csv' }),
                },
                {
                    label: 'PDF exportieren',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'export-pdf' }),
                },
                { type: 'separator' },
                { label: 'Beenden', role: 'quit' },
            ],
        },
        {
            label: 'Bearbeiten',
            submenu: [
                { label: 'Ausschneiden', role: 'cut' },
                { label: 'Kopieren', role: 'copy' },
                { label: 'Einfügen', role: 'paste' },
                { label: 'Alles auswählen', role: 'selectAll' },
            ],
        },
        {
            label: 'Ansicht',
            submenu: [
                {
                    label: 'Theme wechseln',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'toggle-theme' }),
                },
                {
                    label: 'Aktualisieren',
                    accelerator: 'F5',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'refresh' }),
                },
                { type: 'separator' },
                { label: 'Entwicklertools', role: 'toggleDevTools' },
                { label: 'Vollbild', role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Hilfe',
            submenu: [
                {
                    label: 'Über Speicher Analyse',
                    click: () => mainWindow.webContents.send('context-menu-action', { action: 'about' }),
                },
            ],
        },
    ];

    return Menu.buildFromTemplate(template);
}

function showContextMenu(menuType, context, mainWindow) {
    const templates = {
        directory: buildDirectoryMenu(context, mainWindow),
        file: buildFileMenu(context, mainWindow),
        'treemap-cell': buildTreemapMenu(context, mainWindow),
        'tree-background': buildBackgroundMenu(context, mainWindow),
    };

    const template = templates[menuType];
    if (!template) return;

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
}

function sendAction(mainWindow, action, context) {
    mainWindow.webContents.send('context-menu-action', { action, ...context });
}

function buildTagSubmenu(ctx, win) {
    const { TAG_COLORS } = require('./file-tags');
    const items = [];
    for (const [key, val] of Object.entries(TAG_COLORS)) {
        items.push({
            label: val.label,
            click: () => sendAction(win, 'set-tag', { ...ctx, tagColor: key }),
        });
    }
    items.push({ type: 'separator' });
    items.push({
        label: 'Tag entfernen',
        click: () => sendAction(win, 'remove-tag', ctx),
    });
    return items;
}

function buildDirectoryMenu(ctx, win) {
    const items = [
        { label: 'Im Explorer \u00F6ffnen', click: () => sendAction(win, 'show-in-explorer', ctx) },
        { label: 'Im Terminal \u00F6ffnen', click: () => sendAction(win, 'open-in-terminal', ctx) },
        { type: 'separator' },
        { label: 'Neuer Ordner', click: () => sendAction(win, 'create-folder', ctx) },
        { label: 'Umbenennen', click: () => sendAction(win, 'rename', ctx) },
        { label: 'Tag', submenu: buildTagSubmenu(ctx, win) },
        { type: 'separator' },
        { label: 'Ausschneiden', click: () => sendAction(win, 'cut', ctx) },
        { label: 'Kopieren', click: () => sendAction(win, 'copy', ctx) },
        { label: 'Pfad kopieren', click: () => sendAction(win, 'copy-path', ctx) },
        { label: 'Einfügen', click: () => sendAction(win, 'paste', ctx) },
    ];

    // Dual-panel operations
    if (ctx.isDualMode && ctx.targetPath) {
        items.push({ type: 'separator' });
        items.push({ label: 'In anderes Panel kopieren', click: () => sendAction(win, 'copy-to-other-panel', ctx) });
        items.push({ label: 'In anderes Panel verschieben', click: () => sendAction(win, 'move-to-other-panel', ctx) });
    }

    items.push({ type: 'separator' });
    items.push({ label: 'Ordnergröße berechnen', click: () => sendAction(win, 'calculate-folder-size', ctx) });
    items.push({ type: 'separator' });
    items.push({ label: 'Löschen (Papierkorb)', click: () => sendAction(win, 'delete-trash', ctx) });
    items.push({ label: 'Endgültig löschen', click: () => sendAction(win, 'delete-permanent', ctx) });
    items.push({ type: 'separator' });
    items.push({ label: 'Eigenschaften', click: () => sendAction(win, 'properties', ctx) });
    return items;
}

function buildFileMenu(ctx, win) {
    // For "open in terminal", resolve parent directory of the file
    const fileDirCtx = { ...ctx, path: ctx.path ? require('path').dirname(ctx.path) : ctx.path };
    const items = [
        { label: 'Öffnen', click: () => sendAction(win, 'open-file', ctx) },
        { label: 'Öffnen mit...', click: () => sendAction(win, 'open-with', ctx) },
        { label: 'Im Explorer zeigen', click: () => sendAction(win, 'show-in-explorer', ctx) },
        { label: 'Im Terminal öffnen', click: () => sendAction(win, 'open-in-terminal', fileDirCtx) },
        { type: 'separator' },
        { label: 'Ausschneiden', click: () => sendAction(win, 'cut', ctx) },
        { label: 'Kopieren', click: () => sendAction(win, 'copy', ctx) },
        { label: 'Pfad kopieren', click: () => sendAction(win, 'copy-path', ctx) },
    ];

    // Dual-panel operations
    if (ctx.isDualMode && ctx.targetPath) {
        items.push({ type: 'separator' });
        items.push({ label: 'In anderes Panel kopieren', click: () => sendAction(win, 'copy-to-other-panel', ctx) });
        items.push({ label: 'In anderes Panel verschieben', click: () => sendAction(win, 'move-to-other-panel', ctx) });
    }

    items.push({ type: 'separator' });
    items.push({ label: 'Umbenennen', click: () => sendAction(win, 'rename', ctx) });
    items.push({ label: 'Tag', submenu: buildTagSubmenu(ctx, win) });

    // Batch rename when multiple files selected
    const selCount = ctx.selectedPaths ? ctx.selectedPaths.length : 0;
    if (selCount >= 2) {
        items.push({ label: `Batch-Umbenennung (${selCount} Dateien)`, click: () => sendAction(win, 'batch-rename', ctx) });
    }

    items.push({ label: 'Löschen (Papierkorb)', click: () => sendAction(win, 'delete-trash', ctx) });
    items.push({ label: 'Endgültig löschen', click: () => sendAction(win, 'delete-permanent', ctx) });
    items.push({ type: 'separator' });
    items.push({ label: 'Eigenschaften', click: () => sendAction(win, 'properties', ctx) });
    return items;
}

function buildTreemapMenu(ctx, win) {
    return [
        { label: 'Im Explorer öffnen', click: () => sendAction(win, 'show-in-explorer', ctx) },
        { type: 'separator' },
        { label: 'Löschen (Papierkorb)', click: () => sendAction(win, 'delete-trash', ctx) },
        { type: 'separator' },
        { label: 'Eigenschaften', click: () => sendAction(win, 'properties', ctx) },
    ];
}

function buildBackgroundMenu(ctx, win) {
    return [
        { label: 'Neuer Ordner', click: () => sendAction(win, 'create-folder', ctx) },
        { label: 'Einfügen', click: () => sendAction(win, 'paste', ctx) },
        { type: 'separator' },
        { label: 'Im Terminal öffnen', click: () => sendAction(win, 'open-in-terminal', ctx) },
        { type: 'separator' },
        {
            label: 'Sortieren nach',
            submenu: [
                { label: 'Name', click: () => sendAction(win, 'sort-by', { ...ctx, sortCol: 'name' }) },
                { label: 'Größe', click: () => sendAction(win, 'sort-by', { ...ctx, sortCol: 'size' }) },
                { label: 'Typ', click: () => sendAction(win, 'sort-by', { ...ctx, sortCol: 'type' }) },
                { label: 'Datum', click: () => sendAction(win, 'sort-by', { ...ctx, sortCol: 'modified' }) },
            ],
        },
        { type: 'separator' },
        { label: 'Aktualisieren', click: () => sendAction(win, 'refresh', ctx) },
    ];
}

module.exports = { buildAppMenu, showContextMenu };

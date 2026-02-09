const { Menu, BrowserWindow } = require('electron');

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

function buildDirectoryMenu(ctx, win) {
    return [
        { label: 'Im Explorer öffnen', click: () => sendAction(win, 'show-in-explorer', ctx) },
        { type: 'separator' },
        { label: 'Neuer Ordner', click: () => sendAction(win, 'create-folder', ctx) },
        { label: 'Umbenennen', click: () => sendAction(win, 'rename', ctx) },
        { type: 'separator' },
        { label: 'Ausschneiden', click: () => sendAction(win, 'cut', ctx) },
        { label: 'Kopieren', click: () => sendAction(win, 'copy', ctx) },
        { label: 'Einfügen', click: () => sendAction(win, 'paste', ctx) },
        { type: 'separator' },
        { label: 'Löschen (Papierkorb)', click: () => sendAction(win, 'delete-trash', ctx) },
        { label: 'Endgültig löschen', click: () => sendAction(win, 'delete-permanent', ctx) },
        { type: 'separator' },
        { label: 'Eigenschaften', click: () => sendAction(win, 'properties', ctx) },
    ];
}

function buildFileMenu(ctx, win) {
    return [
        { label: 'Öffnen', click: () => sendAction(win, 'open-file', ctx) },
        { label: 'Im Explorer zeigen', click: () => sendAction(win, 'show-in-explorer', ctx) },
        { type: 'separator' },
        { label: 'Ausschneiden', click: () => sendAction(win, 'cut', ctx) },
        { label: 'Kopieren', click: () => sendAction(win, 'copy', ctx) },
        { type: 'separator' },
        { label: 'Umbenennen', click: () => sendAction(win, 'rename', ctx) },
        { label: 'Löschen (Papierkorb)', click: () => sendAction(win, 'delete-trash', ctx) },
        { label: 'Endgültig löschen', click: () => sendAction(win, 'delete-permanent', ctx) },
        { type: 'separator' },
        { label: 'Eigenschaften', click: () => sendAction(win, 'properties', ctx) },
    ];
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
        { label: 'Aktualisieren', click: () => sendAction(win, 'refresh', ctx) },
    ];
}

module.exports = { buildAppMenu, showContextMenu };

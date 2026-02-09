const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');

process.on('uncaughtException', (err) => {
    console.error('Main process error:', err);
});

let mainWindow;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Speicher Analyse',
        icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        backgroundColor: '#0f1117',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Minimize to tray instead of closing (unless quitting)
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // Build application menu
    const { buildAppMenu } = require('./menu');
    Menu.setApplicationMenu(buildAppMenu(mainWindow));

    // Register IPC handlers
    const { register } = require('./ipc-handlers');
    register(mainWindow);

    // System Tray
    try {
        const { createTray } = require('./tray');
        createTray(mainWindow);
    } catch (err) {
        console.error('Tray init error:', err);
    }

    // Global Hotkey (Ctrl+Shift+S)
    try {
        const { registerGlobalHotkey } = require('./global-hotkey');
        registerGlobalHotkey(mainWindow);
    } catch (err) {
        console.error('Global hotkey init error:', err);
    }

    // File Tags
    try {
        const { FileTagStore } = require('./file-tags');
        const tagStore = new FileTagStore();
        tagStore.init();
        app._tagStore = tagStore;
    } catch (err) {
        console.error('File tags init error:', err);
    }

    // Handle --open-folder argument (from shell integration)
    const openFolderArg = process.argv.find(a => a.startsWith('--open-folder='));
    if (openFolderArg) {
        const folderPath = openFolderArg.split('=')[1];
        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('open-folder', folderPath);
        });
    }
}

app.whenReady().then(createWindow);

app.on('before-quit', () => {
    isQuitting = true;
    if (app._tagStore) app._tagStore.flush();
    const { unregisterGlobalHotkey } = require('./global-hotkey');
    unregisterGlobalHotkey();
    const { destroyTray } = require('./tray');
    destroyTray();
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

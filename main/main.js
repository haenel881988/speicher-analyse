const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');

// Prevent GPU shader disk cache errors when multiple instances try to access the same cache files
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

process.on('uncaughtException', (err) => {
    console.error('Main process error:', err);
});

// ===== Single Instance Lock =====
// Prevent multiple instances - a second instance causes GPU cache "Zugriff verweigert" errors
// which freeze the renderer (the old tray-hidden instance locks the cache files).
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    // Another instance is already running - quit immediately
    console.log('Another instance is already running. Quitting.');
    app.quit();
} else {
    let mainWindow;
    let isQuitting = false;

    // When user tries to start a second instance, show the existing window
    app.on('second-instance', (_event, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();

            // Handle --open-folder from second instance
            const openFolderArg = argv.find(a => a.startsWith('--open-folder='));
            if (openFolderArg) {
                const folderPath = openFolderArg.split('=')[1];
                mainWindow.webContents.send('open-folder', folderPath);
            }
        }
    });

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
        try {
            const { unregisterGlobalHotkey } = require('./global-hotkey');
            unregisterGlobalHotkey();
        } catch { /* ignore */ }
        try {
            const { destroyTray } = require('./tray');
            destroyTray();
        } catch { /* ignore */ }
    });

    app.on('window-all-closed', () => {
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}

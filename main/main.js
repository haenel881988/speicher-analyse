const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

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

        // X-Button (Schließen) = App IMMER beenden. Keine Ausnahme.
        // Standard-Windows-Verhalten: X = Schließen, _ = Minimieren.
        // Minimize-to-Tray betrifft NUR den Minimieren-Button (siehe tray.js).
        mainWindow.on('close', (e) => {
            if (isQuitting) return; // App will beenden → durchlassen

            // Während Admin-Elevation: Fenster verstecken statt schließen
            if (app._isElevating) {
                e.preventDefault();
                mainWindow.hide();
                return;
            }

            // X = Beenden. Immer. Ohne Ausnahme.
            e.preventDefault();
            isQuitting = true;
            app.quit();
        });

        // Build application menu
        const { buildAppMenu } = require('./menu');
        Menu.setApplicationMenu(buildAppMenu(mainWindow));

        // Register IPC handlers (also inits PreferencesStore)
        const { register, preferences } = require('./ipc-handlers');
        register(mainWindow);

        // System Tray
        try {
            const { createTray } = require('./tray');
            createTray(mainWindow);
        } catch (err) {
            console.error('Tray init error:', err);
        }

        // Global Hotkey (aus Preferences laden, fallback: Ctrl+Shift+S)
        try {
            const { registerGlobalHotkey } = require('./global-hotkey');
            const savedHotkey = preferences.get('globalHotkey');
            registerGlobalHotkey(mainWindow, savedHotkey);
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

    app.whenReady().then(() => {
        createWindow();

        // ===== Dev Auto-Reload =====
        // Watches renderer/ and main/ for file changes.
        // - Renderer changes (CSS/JS/HTML): auto-reload the window
        // - Main process changes: full app relaunch
        // IMPORTANT: Uses mtime tracking to prevent ghost events on Windows.
        // fs.watch() on Windows fires for access-time changes, antivirus scans,
        // and search indexer activity — mtime comparison eliminates false positives.
        const rendererDir = path.join(__dirname, '..', 'renderer');
        const mainDir = __dirname;
        let reloadTimer = null;
        const knownMtimes = new Map(); // path → mtime for change detection
        const RELOAD_EXTENSIONS = new Set(['.js', '.css', '.html', '.htm']);
        let lastReloadTime = 0;
        const MIN_RELOAD_INTERVAL = 2000; // Min. 2s between reloads

        function debounceReload(callback, delay = 500) {
            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = setTimeout(callback, delay);
        }

        /**
         * Checks if a file was actually modified (mtime changed).
         * Returns false for ghost events (access-time, antivirus, indexer).
         */
        function hasFileActuallyChanged(filePath) {
            try {
                const stat = fs.statSync(filePath);
                const mtime = stat.mtimeMs;
                const known = knownMtimes.get(filePath);
                if (known === mtime) return false; // Same mtime → ghost event
                knownMtimes.set(filePath, mtime);
                return known !== undefined; // First time seen = not a change
            } catch {
                return false; // File deleted or inaccessible
            }
        }

        try {
            fs.watch(rendererDir, { recursive: true }, (_event, filename) => {
                if (!filename || !mainWindow) return;
                const ext = path.extname(filename).toLowerCase();
                if (!RELOAD_EXTENSIONS.has(ext)) return; // Ignore non-source files
                if (filename.includes('node_modules')) return;

                const fullPath = path.join(rendererDir, filename);
                if (!hasFileActuallyChanged(fullPath)) return;

                // Enforce minimum interval between reloads
                const now = Date.now();
                if (now - lastReloadTime < MIN_RELOAD_INTERVAL) return;

                debounceReload(() => {
                    lastReloadTime = Date.now();
                    console.log(`[Auto-Reload] Renderer geändert: ${filename}`);
                    mainWindow.webContents.reloadIgnoringCache();
                });
            });

            fs.watch(mainDir, { recursive: false }, (_event, filename) => {
                if (!filename || !mainWindow || !filename.endsWith('.js')) return;
                if (filename.includes('node_modules')) return;

                const fullPath = path.join(mainDir, filename);
                if (!hasFileActuallyChanged(fullPath)) return;

                const now = Date.now();
                if (now - lastReloadTime < MIN_RELOAD_INTERVAL) return;

                debounceReload(() => {
                    lastReloadTime = Date.now();
                    console.log(`[Auto-Reload] Main-Prozess geändert: ${filename} → App wird neu gestartet...`);
                    app.relaunch();
                    app.exit(0);
                }, 1000);
            });
        } catch (err) {
            console.error('Auto-Reload watcher error:', err);
        }
    });

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
        if (app._isElevating) return; // Nicht beenden während Admin-Elevation
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}

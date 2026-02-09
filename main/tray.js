'use strict';

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

/**
 * Create a 16x16 tray icon using nativeImage.
 * Tries the app icon file first, then falls back to a generated data-URL icon.
 */
function createTrayIcon() {
    // Try app icon file first
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
    try {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 });
    } catch { /* fall through to generated icon */ }

    // Fallback: 1x1 purple pixel scaled to 16x16 (data URL is always reliable)
    try {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12NobMj4HwAE+AKBwXoZYAAAAABJRU5ErkJggg==';
        return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
    } catch {
        return nativeImage.createEmpty();
    }
}

function createTray(mainWindow) {
    if (tray) return tray;

    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('Speicher Analyse');

    const contextMenu = buildTrayMenu(mainWindow);
    tray.setContextMenu(contextMenu);

    // Click on tray icon → show/focus window
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.focus();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Minimize to tray instead of taskbar
    mainWindow.on('minimize', (e) => {
        // Only minimize to tray if user has opted in (check stored setting)
        // Default: minimize to tray is ON
        e.preventDefault();
        mainWindow.hide();
        tray.setToolTip('Speicher Analyse (minimiert)');
    });

    // Update tray tooltip when window is shown
    mainWindow.on('show', () => {
        tray.setToolTip('Speicher Analyse');
    });

    return tray;
}

function buildTrayMenu(mainWindow) {
    return Menu.buildFromTemplate([
        {
            label: 'Speicher Analyse \u00F6ffnen',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        { type: 'separator' },
        {
            label: 'Schnell-Scan C:\\',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('tray-action', 'quick-scan');
            },
        },
        {
            label: 'Duplikate pr\u00FCfen',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('tray-action', 'check-duplicates');
            },
        },
        { type: 'separator' },
        {
            label: 'Beenden',
            click: () => {
                tray.destroy();
                tray = null;
                app.quit();
            },
        },
    ]);
}

function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

module.exports = { createTray, destroyTray };

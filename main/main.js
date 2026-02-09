const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');

process.on('uncaughtException', (err) => {
    console.error('Main process error:', err);
});

let mainWindow;

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

    // Build application menu
    const { buildAppMenu } = require('./menu');
    Menu.setApplicationMenu(buildAppMenu(mainWindow));

    // Register IPC handlers
    const { register } = require('./ipc-handlers');
    register(mainWindow);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

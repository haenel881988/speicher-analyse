'use strict';

const { globalShortcut } = require('electron');

const DEFAULT_HOTKEY = 'Ctrl+Shift+S';
let registeredAccelerator = null;

function registerGlobalHotkey(mainWindow, accelerator) {
    unregisterGlobalHotkey();

    const acc = accelerator || DEFAULT_HOTKEY;
    try {
        const success = globalShortcut.register(acc, () => {
            if (mainWindow.isDestroyed()) return;
            if (mainWindow.isVisible() && mainWindow.isFocused()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });

        if (success) {
            registeredAccelerator = acc;
            return { success: true, accelerator: acc };
        }
        return { success: false, error: `Hotkey "${acc}" ist bereits belegt` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function unregisterGlobalHotkey() {
    if (registeredAccelerator) {
        try { globalShortcut.unregister(registeredAccelerator); } catch { /* ignore */ }
        registeredAccelerator = null;
    }
}

function getRegisteredHotkey() {
    return registeredAccelerator;
}

module.exports = { registerGlobalHotkey, unregisterGlobalHotkey, getRegisteredHotkey, DEFAULT_HOTKEY };

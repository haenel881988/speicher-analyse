'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('./logger').createLogger('prefs');

/**
 * PreferencesStore - Zentraler Einstellungsspeicher.
 * Alle Einstellungen werden in %APPDATA%/speicher-analyse/preferences.json gespeichert.
 * Pattern: file-tags.js (debounced save, graceful corruption handling).
 */

const DEFAULTS = {
    // Session
    sessionRestore: true,
    sessionSaveOnClose: true,
    sessionSaveAfterScan: true,

    // Energie
    energyMode: 'auto',            // 'auto' | 'performance' | 'powersave'
    batteryThreshold: 30,           // Ab wieviel % → Energiesparmodus
    disableBackgroundOnBattery: true,

    // Allgemein
    theme: 'dark',                  // 'dark' | 'light'
    globalHotkey: 'Ctrl+Shift+S',
    language: 'de',
    minimizeToTray: false,          // X-Button: false = App beenden, true = in Tray minimieren
    startMinimized: false,
    showScanNotification: true,

    // Explorer
    showSizeColors: false,          // Farbliche Hervorhebung großer Dateien/Ordner im Explorer

    // Netzwerk
    networkDetailLevel: 'normal',    // 'normal' | 'experte'

    // Layout
    smartLayout: true,              // Intelligentes Panel-Layout basierend auf Fenstergröße

    // Terminal
    terminalShell: 'powershell',
    terminalFontSize: 13,
};

class PreferencesStore {
    constructor() {
        this.data = { ...DEFAULTS };
        this.dbPath = '';
        this._dirty = false;
        this._saveTimer = null;
    }

    init() {
        this.dbPath = path.join(app.getPath('userData'), 'preferences.json');
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const raw = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    // Merge: nur bekannte Keys übernehmen, Rest = Defaults
                    for (const key of Object.keys(DEFAULTS)) {
                        if (key in raw) {
                            this.data[key] = raw[key];
                        }
                    }
                    // Migration v7.2→v7.2.1: minimizeToTray war fälschlicherweise true als Default.
                    // Bestehende User hatten true gespeichert → X-Button minimierte statt zu schließen.
                    // Einmalige Migration: Wenn die alte Version den Wert auf true hatte, korrigieren.
                    if (raw.minimizeToTray === true && !raw._migratedMinimizeToTray) {
                        this.data.minimizeToTray = false;
                        this.data._migratedMinimizeToTray = true;
                        this._dirty = true;
                    }
                }
            }
        } catch { /* start fresh if corrupted */ }
    }

    get(key) {
        return key in this.data ? this.data[key] : DEFAULTS[key];
    }

    getAll() {
        return { ...this.data };
    }

    set(key, value) {
        if (!(key in DEFAULTS)) return { success: false, error: `Unbekannte Einstellung: ${key}` };
        this.data[key] = value;
        this._scheduleSave();
        return { success: true };
    }

    setMultiple(entries) {
        for (const [key, value] of Object.entries(entries)) {
            if (key in DEFAULTS) {
                this.data[key] = value;
            }
        }
        this._scheduleSave();
        return { success: true };
    }

    reset(key) {
        if (key in DEFAULTS) {
            this.data[key] = DEFAULTS[key];
            this._scheduleSave();
        }
    }

    resetAll() {
        this.data = { ...DEFAULTS };
        this._scheduleSave();
    }

    _scheduleSave() {
        this._dirty = true;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._save();
        }, 1000);
    }

    _save() {
        if (!this._dirty) return;
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
            this._dirty = false;
        } catch (err) {
            log.error('Failed to save preferences:', err.message);
        }
    }

    flush() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        this._save();
    }
}

module.exports = { PreferencesStore, DEFAULTS };

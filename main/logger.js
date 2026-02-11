'use strict';

const fs = require('fs');
const path = require('path');

// Log-Verzeichnis im Projektroot (Entwicklerversion)
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Log-Levels mit numerischer Priorität
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const CONSOLE_MAP = { DEBUG: 'log', INFO: 'log', WARN: 'warn', ERROR: 'error' };

// Konfigurierbar (Standard: DEBUG)
let minLevel = LEVELS.DEBUG;

// Aktueller Log-Stream (lazy, tägliche Rotation)
let currentDate = null;
let currentStream = null;

// Maximales Alter für Auto-Cleanup
const MAX_LOG_AGE_DAYS = 14;
let cleanupDone = false;

/**
 * Erstellt das logs/ Verzeichnis falls nötig
 */
function ensureLogDir() {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    } catch { /* silent */ }
}

/**
 * Gibt den aktuellen WriteStream zurück, rotiert bei Datumswechsel
 */
function getLogStream() {
    const today = formatDate(new Date());

    if (currentDate === today && currentStream) {
        return currentStream;
    }

    // Alten Stream schließen
    if (currentStream) {
        try { currentStream.end(); } catch { /* silent */ }
        currentStream = null;
    }

    ensureLogDir();
    currentDate = today;

    try {
        const logFile = path.join(LOG_DIR, `${today}.log`);
        currentStream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });
        currentStream.on('error', () => { currentStream = null; });
    } catch {
        currentStream = null;
    }

    // Cleanup einmal pro Session
    if (!cleanupDone) {
        cleanupDone = true;
        cleanupOldLogs();
    }

    return currentStream;
}

/**
 * Formatiert Datum als YYYY-MM-DD
 */
function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Formatiert Zeitstempel als [YYYY-MM-DD HH:MM:SS]
 */
function formatTimestamp() {
    const d = new Date();
    const date = formatDate(d);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `[${date} ${h}:${min}:${s}]`;
}

/**
 * Formatiert eine Log-Zeile
 */
function formatLine(level, moduleName, msg, args) {
    const ts = formatTimestamp();
    let line = `${ts} [${level}] [${moduleName}] ${msg}`;

    for (const arg of args) {
        if (arg instanceof Error) {
            line += ` ${arg.message}`;
            if (arg.stack) {
                line += `\n${arg.stack}`;
            }
        } else if (typeof arg === 'object') {
            try { line += ` ${JSON.stringify(arg)}`; } catch { line += ` [Object]`; }
        } else {
            line += ` ${arg}`;
        }
    }

    return line;
}

/**
 * Löscht Log-Dateien die älter als MAX_LOG_AGE_DAYS sind
 */
function cleanupOldLogs() {
    try {
        const files = fs.readdirSync(LOG_DIR);
        const now = Date.now();
        const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (!file.endsWith('.log')) continue;
            const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
            if (!match) continue;

            const fileDate = new Date(match[1]).getTime();
            if (isNaN(fileDate)) continue;

            if (now - fileDate > maxAge) {
                try { fs.unlinkSync(path.join(LOG_DIR, file)); } catch { /* silent */ }
            }
        }
    } catch { /* silent */ }
}

/**
 * Kern-Schreibfunktion
 */
function write(level, moduleName, msg, args) {
    if (LEVELS[level] === undefined || LEVELS[level] < minLevel) return;

    const line = formatLine(level, moduleName, msg, args);

    // Konsole (DevTools bleibt sichtbar)
    const consoleFn = CONSOLE_MAP[level] || 'log';
    try { console[consoleFn](line); } catch { /* silent */ }

    // Datei
    const stream = getLogStream();
    if (stream) {
        try { stream.write(line + '\n'); } catch { /* silent */ }
    }
}

/**
 * Erstellt einen Logger für ein bestimmtes Modul
 * @param {string} moduleName - z.B. 'network', 'scanner', 'ipc'
 * @returns {{ debug, info, warn, error }}
 */
function createLogger(moduleName) {
    return {
        debug: (msg, ...args) => write('DEBUG', moduleName, msg, args),
        info:  (msg, ...args) => write('INFO',  moduleName, msg, args),
        warn:  (msg, ...args) => write('WARN',  moduleName, msg, args),
        error: (msg, ...args) => write('ERROR', moduleName, msg, args),
    };
}

/**
 * Setzt das minimale Log-Level
 * @param {string} levelName - 'DEBUG', 'INFO', 'WARN', 'ERROR'
 */
function setLevel(levelName) {
    const upper = (levelName || '').toUpperCase();
    if (LEVELS[upper] !== undefined) {
        minLevel = LEVELS[upper];
    }
}

/**
 * Flusht und schließt den aktuellen Stream (für App-Beenden)
 */
function flush() {
    if (currentStream) {
        try { currentStream.end(); } catch { /* silent */ }
        currentStream = null;
        currentDate = null;
    }
}

module.exports = { createLogger, setLevel, flush };

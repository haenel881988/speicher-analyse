'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { app } = require('electron');

const execAsync = promisify(exec);

const SESSION_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'speicher-analyse');
const SESSION_FILE = path.join(SESSION_DIR, 'elevation-session.json.gz');
const PENDING_ACTIONS_FILE = path.join(SESSION_DIR, 'pending-actions.json');

async function isAdmin() {
    try {
        await execAsync('net session', { timeout: 5000, windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Save scan data for transfer across admin elevation restart.
 * Serializes all scanner data to a compressed temp file.
 */
async function saveSessionForElevation(scans) {
    const sessions = [];

    for (const [scanId, scanner] of scans) {
        if (!scanner.isComplete) continue;

        sessions.push({
            scanId,
            rootPath: scanner.rootPath,
            totalSize: scanner.totalSize,
            dirsScanned: scanner.dirsScanned,
            filesFound: scanner.filesFound,
            errorsCount: scanner.errorsCount,
            tree: [...scanner.tree.entries()],
            topFiles: scanner.topFiles,
            extensionStats: [...scanner.extensionStats.entries()],
            dirFiles: scanner.dirFiles ? [...scanner.dirFiles.entries()] : null,
        });
    }

    if (sessions.length === 0) {
        return false;
    }

    await fs.promises.mkdir(SESSION_DIR, { recursive: true });
    const json = JSON.stringify({ version: 1, sessions });
    const compressed = zlib.gzipSync(json);
    await fs.promises.writeFile(SESSION_FILE, compressed);
    return true;
}

/**
 * Check if elevation session data exists (from a previous admin restart).
 */
function hasElevatedSession() {
    return fs.existsSync(SESSION_FILE);
}

/**
 * Load and restore scan data from elevation session file.
 * Returns array of restored scanner-like objects, or null if no session.
 */
async function loadElevatedSession() {
    if (!fs.existsSync(SESSION_FILE)) return null;

    try {
        const compressed = await fs.promises.readFile(SESSION_FILE);
        const json = zlib.gunzipSync(compressed).toString('utf8');
        const data = JSON.parse(json);

        // Delete session file after loading
        await fs.promises.unlink(SESSION_FILE).catch(() => {});

        return data.sessions || [];
    } catch (err) {
        console.error('Failed to load elevation session:', err);
        // Clean up broken file
        await fs.promises.unlink(SESSION_FILE).catch(() => {});
        return null;
    }
}

/**
 * Reconstruct a DiskScanner-like object from saved session data.
 */
function reconstructScanner(session) {
    const { DiskScanner } = require('./scanner');
    const scanner = new DiskScanner(session.rootPath, session.scanId);

    scanner.isComplete = true;
    scanner.status = 'complete';
    scanner.totalSize = session.totalSize;
    scanner.dirsScanned = session.dirsScanned;
    scanner.filesFound = session.filesFound;
    scanner.errorsCount = session.errorsCount;
    scanner.startTime = Date.now();
    scanner.tree = new Map(session.tree);
    scanner.topFiles = session.topFiles || [];
    scanner.extensionStats = new Map(session.extensionStats);
    scanner.dirFiles = session.dirFiles ? new Map(session.dirFiles) : null;

    return scanner;
}

// ============================================================================
// Pending Actions (Aufgaben die nach Admin-Neustart automatisch ausgeführt werden)
// ============================================================================

/**
 * Speichert eine Aktion die nach Admin-Neustart ausgeführt werden soll.
 * @param {string} action - Aktions-ID (z.B. 'fix-sideloading')
 */
async function savePendingAction(action) {
    await fs.promises.mkdir(SESSION_DIR, { recursive: true });
    const data = { action, timestamp: Date.now() };
    await fs.promises.writeFile(PENDING_ACTIONS_FILE, JSON.stringify(data), 'utf8');
}

/**
 * Liest und löscht die pending Action nach Admin-Neustart.
 * @returns {Promise<string|null>} Aktions-ID oder null
 */
async function loadAndClearPendingAction() {
    if (!fs.existsSync(PENDING_ACTIONS_FILE)) return null;

    try {
        const content = await fs.promises.readFile(PENDING_ACTIONS_FILE, 'utf8');
        const data = JSON.parse(content);

        // Löschen nach dem Lesen (einmalig)
        await fs.promises.unlink(PENDING_ACTIONS_FILE).catch(() => {});

        // Nur Aktionen der letzten 60 Sekunden akzeptieren (Schutz vor verwaisten Dateien)
        if (Date.now() - data.timestamp > 60000) return null;

        return data.action || null;
    } catch {
        await fs.promises.unlink(PENDING_ACTIONS_FILE).catch(() => {});
        return null;
    }
}

/**
 * Save session data and restart the app with admin privileges.
 * Optional: pendingAction wird nach dem Neustart automatisch ausgeführt.
 */
async function restartAsAdmin(scans, pendingAction) {
    // Save current scan data
    await saveSessionForElevation(scans);

    // Save pending action if specified
    if (pendingAction) {
        await savePendingAction(pendingAction);
    }

    // Get the electron executable and app path
    const electronExe = process.execPath;
    const appDir = path.join(__dirname, '..');

    // Use PowerShell to relaunch with elevated privileges
    const psCommand = `Start-Process -FilePath '${electronExe.replace(/'/g, "''")}' -ArgumentList '${appDir.replace(/'/g, "''")}' -Verb RunAs`;

    try {
        await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
            timeout: 10000,
            windowsHide: true,
        });
        // Quit the current (non-admin) instance
        app.quit();
    } catch (err) {
        // User cancelled UAC dialog or error
        // Clean up session + pending action files since we're not restarting
        await fs.promises.unlink(SESSION_FILE).catch(() => {});
        await fs.promises.unlink(PENDING_ACTIONS_FILE).catch(() => {});
        throw new Error('Admin-Neustart abgebrochen: ' + (err.message || ''));
    }
}

module.exports = {
    isAdmin,
    saveSessionForElevation,
    hasElevatedSession,
    loadElevatedSession,
    reconstructScanner,
    restartAsAdmin,
    savePendingAction,
    loadAndClearPendingAction,
};

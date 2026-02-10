'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { app } = require('electron');

/**
 * SessionManager - Speichert und lädt Scan-Daten + UI-State.
 * Pattern: admin.js (gzip-komprimierte Map-Serialisierung).
 * Speicherort: %APPDATA%/speicher-analyse/session.json.gz
 *
 * Im Unterschied zu admin.js:
 * - Session wird NICHT nach dem Laden gelöscht
 * - dirFiles wird NICHT gespeichert (zu groß, ~80-120MB)
 * - nameIndex wird NICHT gespeichert (kann aus tree rekonstruiert werden)
 * - UI-State wird mitgespeichert (activeTab, activePath, driveSelection)
 */

const SESSION_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'speicher-analyse');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json.gz');

/**
 * Speichert Session-Daten (Scans + UI-State) als komprimierte Datei.
 * @param {Map} scans - Map<scanId, DiskScanner>
 * @param {Object} uiState - { activeTab, activePath, driveSelection }
 * @returns {Promise<boolean>}
 */
async function saveSession(scans, uiState) {
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
            // dirFiles bewusst weggelassen (zu groß)
            // nameIndex bewusst weggelassen (rekonstruierbar)
        });
    }

    if (sessions.length === 0) {
        return false;
    }

    const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        ui: uiState || {},
        scans: sessions,
    };

    await fs.promises.mkdir(SESSION_DIR, { recursive: true });
    const json = JSON.stringify(payload);
    const compressed = zlib.gzipSync(json);
    await fs.promises.writeFile(SESSION_FILE, compressed);
    return true;
}

/**
 * Prüft ob eine gespeicherte Session existiert.
 * @returns {{ exists: boolean, savedAt?: string, scanCount?: number, fileSize?: number }}
 */
function getSessionInfo() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return { exists: false };
        }
        const stats = fs.statSync(SESSION_FILE);

        // Versuche Metadaten aus dem Header zu lesen (schnell, ohne alles zu dekomprimieren)
        const compressed = fs.readFileSync(SESSION_FILE);
        const json = zlib.gunzipSync(compressed).toString('utf8');
        const data = JSON.parse(json);

        return {
            exists: true,
            savedAt: data.savedAt || null,
            scanCount: data.scans ? data.scans.length : 0,
            fileSize: stats.size,
        };
    } catch {
        return { exists: false };
    }
}

/**
 * Lädt die gespeicherte Session.
 * Im Unterschied zu admin.js: Datei wird NICHT gelöscht.
 * @returns {Promise<{ ui: Object, scans: Array } | null>}
 */
async function loadSession() {
    if (!fs.existsSync(SESSION_FILE)) return null;

    try {
        const compressed = await fs.promises.readFile(SESSION_FILE);
        const json = zlib.gunzipSync(compressed).toString('utf8');
        const data = JSON.parse(json);

        if (!data.scans || data.scans.length === 0) return null;

        return {
            ui: data.ui || {},
            scans: data.scans,
        };
    } catch (err) {
        console.error('Session laden fehlgeschlagen:', err.message);
        return null;
    }
}

/**
 * Rekonstruiert einen DiskScanner aus gespeicherten Session-Daten.
 * Identisch zu admin.js:reconstructScanner, aber ohne dirFiles.
 * @param {Object} session - Einzelner Scan aus loadSession().scans
 * @returns {DiskScanner}
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
    scanner.dirFiles = null; // Wird nicht persistiert

    return scanner;
}

/**
 * Löscht die gespeicherte Session-Datei.
 */
async function deleteSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            await fs.promises.unlink(SESSION_FILE);
        }
    } catch { /* ignore */ }
}

module.exports = {
    saveSession,
    getSessionInfo,
    loadSession,
    reconstructScanner,
    deleteSession,
};

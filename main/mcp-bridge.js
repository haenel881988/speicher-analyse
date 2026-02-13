/**
 * MCP Bridge — Lokaler HTTP-Server im Electron Main Process
 *
 * Stellt dieselben Daten bereit, die das Frontend über IPC bekommt.
 * Der MCP-Server (mcp/server.mjs) verbindet sich hierüber mit der laufenden App.
 *
 * Port: 52733 (localhost-only, kein externer Zugriff)
 */

const http = require('http');
const log = require('./logger').createLogger('mcp-bridge');

const PORT = 52733;
let server = null;
let _scans = null;

// ─── Route-Handler ──────────────────────────────────────────────────────────

const routes = {
    // App-Status prüfen
    'GET /api/status': async () => {
        const pkg = require('../package.json');
        return {
            app: 'Speicher Analyse',
            version: pkg.version,
            running: true,
            scans_active: _scans ? _scans.size : 0,
        };
    },

    // Laufwerke
    'GET /api/drives': async () => {
        const { listDrives } = require('./drives');
        return listDrives();
    },

    // Aktuelle Scan-Ergebnisse (aus dem laufenden App-Speicher)
    'GET /api/scan-results': async (query) => {
        if (!_scans || _scans.size === 0) {
            return { scans: [], hinweis: 'Kein Scan aktiv. Bitte zuerst in der App einen Scan durchführen.' };
        }

        const limit = parseInt(query.get('top_files_limit')) || 20;
        const results = [];

        for (const [scanId, scanner] of _scans) {
            const topFiles = scanner.getTopFiles ? scanner.getTopFiles(limit) : (scanner.topFiles || []).slice(0, limit);
            const fileTypes = scanner.getFileTypeStats ? scanner.getFileTypeStats() : [];

            results.push({
                scan_id: scanId,
                laufwerk: scanner.rootPath,
                status: scanner.isComplete ? 'abgeschlossen' : 'läuft',
                gesamtgroesse: scanner.totalSize || 0,
                ordner_gescannt: scanner.dirsScanned || 0,
                dateien_gefunden: scanner.filesFound || 0,
                fehler: scanner.errorsCount || 0,
                top_dateien: topFiles,
                dateitypen: fileTypes,
            });
        }

        return { scans: results };
    },

    // Verzeichnisbaum-Knoten
    'GET /api/tree-node': async (query) => {
        const scanId = query.get('scan_id');
        const nodePath = query.get('path');
        const depth = parseInt(query.get('depth')) || 1;

        if (!scanId || !_scans) return { error: 'scan_id fehlt oder kein Scan aktiv' };
        const scanner = _scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };

        const node = scanner.getTreeNode(nodePath || scanner.rootPath, depth);
        return node || { error: 'Pfad nicht gefunden' };
    },

    // Netzwerk-Verbindungen
    'GET /api/connections': async () => {
        const network = require('./network');
        return network.getConnections();
    },

    // Netzwerk-Zusammenfassung
    'GET /api/network-summary': async () => {
        const network = require('./network');
        return network.getNetworkSummary();
    },

    // Gruppierte Verbindungen
    'GET /api/grouped-connections': async () => {
        const network = require('./network');
        return network.getGroupedConnections();
    },

    // Datenschutz-Einstellungen
    'GET /api/privacy': async () => {
        const privacy = require('./privacy');
        return privacy.getPrivacySettings();
    },

    // System-Info
    'GET /api/system-info': async () => {
        const os = require('os');
        return {
            computerName: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
        };
    },

    // System-Profil (detailliert)
    'GET /api/system-profile': async () => {
        const systemProfil = require('./system-profil');
        return systemProfil.getSystemProfile();
    },

    // Installierte Programme (Software-Audit)
    'GET /api/installed-programs': async () => {
        const audit = require('./software-audit');
        return audit.auditAll();
    },

    // Autostart-Programme
    'GET /api/autostart': async () => {
        const autostart = require('./autostart');
        return autostart.getAutoStartEntries();
    },

    // Windows-Dienste
    'GET /api/services': async () => {
        const services = require('./services');
        return services.getServices();
    },

    // S.M.A.R.T. Festplatten-Gesundheit
    'GET /api/disk-health': async () => {
        const smart = require('./smart');
        return smart.getDiskHealth();
    },

    // Bereinigungsvorschläge
    'GET /api/cleanup': async () => {
        const { scanCategories } = require('./cleanup');
        // scanCategories erwartet optionalen Scanner-Parameter
        const scanner = _scans && _scans.size > 0 ? [..._scans.values()][0] : null;
        return scanCategories(scanner);
    },

    // Security-Audit
    'GET /api/security-audit': async () => {
        const { runSecurityAudit } = require('./security-audit');
        return runSecurityAudit();
    },

    // Preferences
    'GET /api/preferences': async () => {
        const { PreferencesStore } = require('./preferences');
        const prefs = new PreferencesStore();
        prefs.init();
        return prefs.getAll();
    },
};

// ─── HTTP-Server ────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
    // Nur localhost erlauben
    const remoteAddr = req.socket.remoteAddress;
    if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // CORS für lokale Anfragen
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = routes[routeKey];

    if (!handler) {
        // Verfügbare Endpunkte anzeigen
        res.writeHead(404);
        res.end(JSON.stringify({
            error: 'Endpunkt nicht gefunden',
            verfuegbare_endpunkte: Object.keys(routes).map(r => r.replace('GET ', '')),
        }));
        return;
    }

    try {
        const result = await handler(url.searchParams);
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (err) {
        log.error(`Fehler bei ${routeKey}:`, err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
}

function startBridge(scans) {
    _scans = scans;

    server = http.createServer(handleRequest);

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            log.warn(`Port ${PORT} belegt — MCP Bridge nicht gestartet (evtl. andere Instanz aktiv)`);
        } else {
            log.error('MCP Bridge Fehler:', err.message);
        }
    });

    server.listen(PORT, '127.0.0.1', () => {
        log.info(`MCP Bridge gestartet auf http://127.0.0.1:${PORT}`);
    });
}

function stopBridge() {
    if (server) {
        server.close();
        server = null;
        log.info('MCP Bridge gestoppt');
    }
}

module.exports = { startBridge, stopBridge };

#!/usr/bin/env node
'use strict';

/**
 * MCP-Server für Speicher Analyse (Issue #19)
 *
 * Ermöglicht KI-Assistenten (Claude Desktop, Claude Code, etc.) direkten
 * Zugriff auf die App-Funktionen: Netzwerk, Datenschutz, S.M.A.R.T.,
 * Software-Audit, System-Score, Scan-Ergebnisse.
 *
 * Die App-Module werden direkt importiert — kein Electron nötig.
 * Läuft als Standalone-Prozess über stdio (MCP-Protokoll).
 */

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// App-Module Pfad Setup (importiert die echten Backend-Module)
// ---------------------------------------------------------------------------
const MAIN_DIR = path.resolve(__dirname, '..', '..', 'main');

// Electron-Shim: network-history.js braucht app.getPath('userData')
// Wir setzen das auf %APPDATA%/speicher-analyse (gleicher Pfad wie Electron)
const USER_DATA_DIR = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'speicher-analyse'
);

// Minimaler Electron-Shim damit Module importiert werden können
const electronShim = {
    app: {
        getPath: (name) => {
            if (name === 'userData') return USER_DATA_DIR;
            if (name === 'home') return process.env.HOME || process.env.USERPROFILE || '.';
            return '.';
        },
    },
};

// Inject shim before requiring modules that need it
require.cache[require.resolve('electron')] = {
    id: 'electron',
    filename: 'electron',
    loaded: true,
    exports: electronShim,
};

// ---------------------------------------------------------------------------
// App-Module laden
// ---------------------------------------------------------------------------
const network = require(path.join(MAIN_DIR, 'network.js'));
const privacy = require(path.join(MAIN_DIR, 'privacy.js'));
const smart = require(path.join(MAIN_DIR, 'smart.js'));
const softwareAudit = require(path.join(MAIN_DIR, 'software-audit.js'));
const systemScore = require(path.join(MAIN_DIR, 'system-score.js'));
const networkScanner = require(path.join(MAIN_DIR, 'network-scanner.js'));
const networkHistory = require(path.join(MAIN_DIR, 'network-history.js'));

// ---------------------------------------------------------------------------
// Session-Daten laden (gespeicherte Scan-Ergebnisse)
// ---------------------------------------------------------------------------
function loadLastScanSession() {
    try {
        const sessionFile = path.join(USER_DATA_DIR, 'session.json.gz');
        if (!fs.existsSync(sessionFile)) return null;
        const compressed = fs.readFileSync(sessionFile);
        const json = zlib.gunzipSync(compressed).toString('utf-8');
        const data = JSON.parse(json);
        if (!data.scans || data.scans.length === 0) return null;
        return data;
    } catch {
        return null;
    }
}

function getScanSummary() {
    const session = loadLastScanSession();
    if (!session) return { available: false, message: 'Kein gespeicherter Scan vorhanden' };

    return {
        available: true,
        savedAt: session.savedAt,
        scans: session.scans.map(s => ({
            rootPath: s.rootPath,
            totalSize: s.totalSize,
            dirsScanned: s.dirsScanned,
            filesFound: s.filesFound,
            errorsCount: s.errorsCount,
        })),
    };
}

function getTopFilesFromSession(limit = 50) {
    const session = loadLastScanSession();
    if (!session || !session.scans[0]) return [];
    const scan = session.scans[0];
    return (scan.topFiles || []).slice(0, limit).map(f => ({
        path: f.path,
        name: f.name,
        size: f.size,
        extension: f.extension,
    }));
}

function getExtensionStatsFromSession() {
    const session = loadLastScanSession();
    if (!session || !session.scans[0]) return [];
    const scan = session.scans[0];
    const stats = scan.extensionStats || [];
    // extensionStats is stored as [[key, value], ...] array
    return stats.slice(0, 30).map(([ext, data]) => ({
        extension: ext,
        count: data.count,
        totalSize: data.size,
    }));
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const TOOLS = [
    // --- Netzwerk ---
    {
        name: 'get_network_connections',
        description: 'Zeigt alle aktiven Netzwerkverbindungen — welche Programme kommunizieren mit welchen Servern',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_network_summary',
        description: 'Netzwerk-Zusammenfassung: Anzahl Verbindungen, aktive Prozesse, Remote-IPs',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'scan_local_network',
        description: 'Scannt das lokale Netzwerk nach Geräten (IP, MAC, Hersteller, offene Ports, Modell)',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_network_history',
        description: 'Zeigt gespeicherte Netzwerk-Snapshots (Verlauf über Zeit)',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- Datenschutz ---
    {
        name: 'get_privacy_settings',
        description: 'Zeigt alle Windows-Datenschutz-Einstellungen (Telemetrie, Standort, Kamera, Mikrofon, etc.)',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- Festplatten-Gesundheit ---
    {
        name: 'get_disk_health',
        description: 'S.M.A.R.T.-Daten aller Festplatten: Temperatur, Verschleiss, Fehler, Betriebsstunden',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- Software ---
    {
        name: 'get_installed_programs',
        description: 'Liste aller installierten Programme mit Grösse, Version, Installationsdatum',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- System-Score ---
    {
        name: 'get_system_score',
        description: 'Berechnet den System-Gesundheitswert (0-100) basierend auf Datenschutz, Festplatten, Registry, Updates',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- Scan-Ergebnisse ---
    {
        name: 'get_scan_summary',
        description: 'Zusammenfassung des letzten Festplatten-Scans (Grösse, Dateien, Ordner)',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_large_files',
        description: 'Die grössten Dateien aus dem letzten Scan',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Anzahl Dateien (Standard: 50)' },
            },
        },
    },
    {
        name: 'get_file_type_stats',
        description: 'Dateitypen-Statistik aus dem letzten Scan (welche Dateitypen belegen wie viel Platz)',
        inputSchema: { type: 'object', properties: {} },
    },
    // --- System-Info ---
    {
        name: 'get_system_info',
        description: 'Grundlegende System-Informationen: Betriebssystem, CPU, RAM, Hostname',
        inputSchema: { type: 'object', properties: {} },
    },
];

async function handleTool(name, args) {
    switch (name) {
        case 'get_network_connections': {
            const grouped = await network.getGroupedConnections();
            return JSON.stringify(grouped.map(g => ({
                process: g.processName,
                connections: g.connectionCount,
                uniqueIPs: g.uniqueIPCount,
                hasTrackers: g.hasTrackers,
                hasHighRisk: g.hasHighRisk,
                companies: g.resolvedCompanies || [],
            })), null, 2);
        }

        case 'get_network_summary': {
            const summary = await network.getNetworkSummary();
            return JSON.stringify(summary, null, 2);
        }

        case 'scan_local_network': {
            const result = await networkScanner.scanNetworkActive((progress) => {
                // Progress wird ignoriert (stdio kann keine Live-Updates senden)
            });
            return JSON.stringify({
                subnet: result.subnet,
                localIP: result.localIP,
                deviceCount: result.devices.length,
                devices: result.devices.map(d => ({
                    ip: d.ip,
                    hostname: d.hostname,
                    mac: d.mac,
                    vendor: d.vendor,
                    model: d.modelName || null,
                    serial: d.serialNumber || null,
                    type: d.deviceLabel,
                    ports: (d.openPorts || []).map(p => `${p.port}/${p.label}`),
                    ping: d.rtt,
                })),
            }, null, 2);
        }

        case 'get_network_history': {
            const history = networkHistory.getHistory();
            return JSON.stringify({
                snapshotCount: history.length,
                snapshots: history.slice(-10).map(s => ({
                    timestamp: s.timestamp,
                    connections: s.summary.totalConnections,
                    established: s.summary.establishedCount,
                    remoteIPs: s.summary.uniqueRemoteIPs,
                    processes: s.groups.length,
                    trackers: s.groups.filter(g => g.hasTrackers).length,
                })),
            }, null, 2);
        }

        case 'get_privacy_settings': {
            const settings = await privacy.getPrivacySettings();
            return JSON.stringify(settings, null, 2);
        }

        case 'get_disk_health': {
            const health = await smart.getDiskHealth();
            return JSON.stringify(health, null, 2);
        }

        case 'get_installed_programs': {
            const audit = await softwareAudit.auditAll();
            return JSON.stringify({
                totalPrograms: audit.totalPrograms,
                totalSizeKB: audit.totalSizeKB,
                orphanedCount: audit.orphanedCount,
                programs: (audit.programs || []).slice(0, 100).map(p => ({
                    name: p.displayName,
                    version: p.version,
                    publisher: p.publisher,
                    sizeKB: p.estimatedSizeKB,
                    installDate: p.installDate,
                })),
            }, null, 2);
        }

        case 'get_system_score': {
            // Sammle Live-Daten für Score-Berechnung
            const [privacyData, diskHealth, auditData] = await Promise.allSettled([
                privacy.getPrivacySettings(),
                smart.getDiskHealth(),
                softwareAudit.auditAll(),
            ]);

            const results = {};
            if (privacyData.status === 'fulfilled') results.privacy = privacyData.value;
            if (diskHealth.status === 'fulfilled') results.smart = diskHealth.value;
            if (auditData.status === 'fulfilled') results.audit = auditData.value;

            const score = systemScore.calculateSystemScore(results);
            return JSON.stringify(score, null, 2);
        }

        case 'get_scan_summary':
            return JSON.stringify(getScanSummary(), null, 2);

        case 'get_large_files':
            return JSON.stringify(getTopFilesFromSession(args?.limit || 50), null, 2);

        case 'get_file_type_stats':
            return JSON.stringify(getExtensionStatsFromSession(), null, 2);

        case 'get_system_info': {
            const os = require('os');
            return JSON.stringify({
                hostname: os.hostname(),
                platform: os.platform(),
                release: os.release(),
                arch: os.arch(),
                cpus: os.cpus().length + 'x ' + (os.cpus()[0]?.model || 'unbekannt'),
                totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
                freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(1),
                uptime: Math.floor(os.uptime() / 3600) + ' Stunden',
            }, null, 2);
        }

        default:
            throw new Error(`Unbekanntes Tool: ${name}`);
    }
}

// ---------------------------------------------------------------------------
// Server starten
// ---------------------------------------------------------------------------
async function main() {
    const server = new Server(
        { name: 'speicher-analyse', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler('tools/list', async () => ({ tools: TOOLS }));

    server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await handleTool(name, args || {});
            return {
                content: [{ type: 'text', text: result }],
            };
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Fehler: ${err.message}` }],
                isError: true,
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`MCP-Server Startfehler: ${err.message}\n`);
    process.exit(1);
});

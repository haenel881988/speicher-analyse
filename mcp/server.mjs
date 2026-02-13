#!/usr/bin/env node
/**
 * Speicher Analyse — MCP Server (Issue #19)
 *
 * Verbindet sich mit der LAUFENDEN Electron-App über deren lokale HTTP-API.
 * Die App stellt auf Port 52733 dieselben Daten bereit, die auch das Frontend bekommt.
 *
 * Transport: stdio → Wird von Claude Code über .mcp.json gestartet.
 *
 * Architektur:
 *   Claude Code → MCP Server (stdio) → HTTP (localhost:52733) → Electron Main Process
 *
 * Tools:
 *   get_drives              – Laufwerke mit Speicherplatz
 *   get_scan_results        – Aktuelle Scan-Ergebnisse aus der App
 *   get_network_connections – Aktive TCP-Verbindungen (via App)
 *   get_privacy_settings    – Datenschutz-Einstellungen (via App)
 *   get_system_info         – Hardware & OS Übersicht (via App)
 *   get_installed_programs  – Installierte Programme (via App)
 *   get_autostart_entries   – Autostart-Programme (via App)
 *   get_services            – Windows-Dienste (via App)
 *   get_disk_health         – S.M.A.R.T. Festplatten-Gesundheit (via App)
 *   get_cleanup_suggestions – Bereinigungsvorschläge (via App)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ─── Verbindung zur App ─────────────────────────────────────────────────────

const APP_BASE_URL = 'http://127.0.0.1:52733';

/**
 * Ruft einen Endpunkt der laufenden App ab.
 * Gibt bei Verbindungsfehler eine hilfreiche Meldung zurück.
 */
async function fetchFromApp(endpoint, params = {}) {
    const url = new URL(endpoint, APP_BASE_URL);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`App antwortete mit Status ${response.status}: ${body}`);
    }

    return response.json();
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function textResult(text) {
    return { content: [{ type: 'text', text }] };
}

function jsonResult(obj) {
    return textResult(JSON.stringify(obj, null, 2));
}

function errorResult(msg) {
    return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
}

function appNotRunningError() {
    return errorResult(
        'Die Speicher Analyse App ist nicht erreichbar. ' +
        'Bitte starte die App zuerst (npm start oder node launch.js), ' +
        'damit der MCP-Server auf die App-Daten zugreifen kann.'
    );
}

/**
 * Wrapper: Ruft die App ab, gibt bei Verbindungsfehler hilfreiche Meldung.
 */
async function safeAppCall(endpoint, params = {}) {
    try {
        return await fetchFromApp(endpoint, params);
    } catch (err) {
        if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
            throw new Error('APP_NOT_RUNNING');
        }
        throw err;
    }
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
    name: 'speicher-analyse',
    version: '2.0.0',
});

// ─── Tool: get_drives ───────────────────────────────────────────────────────

server.tool(
    'get_drives',
    'Zeigt alle Laufwerke mit Gesamtgrösse, belegtem und freiem Speicherplatz.',
    {},
    async () => {
        try {
            const drives = await safeAppCall('/api/drives');
            // Formatierung für bessere Lesbarkeit
            const formatted = (Array.isArray(drives) ? drives : [drives]).map(d => {
                const total = d.total || d.Size || 0;
                const free = d.free || d.FreeSpace || 0;
                const used = d.used || (total - free);
                return {
                    laufwerk: d.mountpoint || d.device || d.path || d.letter || '',
                    name: d.label || d.name || d.VolumeName || '',
                    dateisystem: d.fstype || d.FileSystem || '',
                    gesamt: formatBytes(total),
                    belegt: formatBytes(used),
                    frei: formatBytes(free),
                    belegung_prozent: d.percent || (total > 0 ? Math.round((used / total) * 1000) / 10 : 0),
                };
            });
            return jsonResult({ laufwerke: formatted });
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_scan_results ─────────────────────────────────────────────────

server.tool(
    'get_scan_results',
    'Liest die gespeicherten Scan-Ergebnisse der App (Verzeichnisbaum, Top-Dateien, Dateitypen). Benötigt einen vorherigen Scan in der App.',
    {
        top_files_limit: z.number().optional().describe('Wie viele der grössten Dateien anzeigen (Standard: 20)'),
    },
    async ({ top_files_limit }) => {
        try {
            const data = await safeAppCall('/api/scan-results', {
                top_files_limit: top_files_limit || 20,
            });

            if (!data.scans || data.scans.length === 0) {
                return textResult(data.hinweis || 'Kein Scan aktiv. Bitte zuerst in der App einen Scan durchführen.');
            }

            // Formatierung
            const result = {
                anzahl_scans: data.scans.length,
                scans: data.scans.map(scan => ({
                    scan_id: scan.scan_id,
                    laufwerk: scan.laufwerk,
                    status: scan.status,
                    gesamtgroesse: formatBytes(scan.gesamtgroesse),
                    ordner_gescannt: scan.ordner_gescannt,
                    dateien_gefunden: scan.dateien_gefunden,
                    fehler: scan.fehler,
                    top_dateien: (scan.top_dateien || []).map(f => ({
                        pfad: f.path || f.name,
                        groesse: formatBytes(f.size),
                    })),
                    dateitypen: (scan.dateitypen || []).slice(0, 20).map(t => ({
                        endung: t.extension || t.ext,
                        kategorie: t.category || '',
                        anzahl: t.count,
                        groesse: formatBytes(t.total_size || t.size || 0),
                    })),
                })),
            };

            return jsonResult(result);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_network_connections ──────────────────────────────────────────

server.tool(
    'get_network_connections',
    'Zeigt aktive Netzwerkverbindungen (TCP) mit Prozessnamen, IP-Adressen und Status.',
    {
        only_established: z.boolean().optional().describe('Nur hergestellte Verbindungen anzeigen (Standard: true)'),
    },
    async ({ only_established }) => {
        try {
            const data = await safeAppCall('/api/connections');
            let connections = Array.isArray(data) ? data : (data.connections || data.verbindungen || []);

            if (only_established !== false) {
                connections = connections.filter(c =>
                    (c.state || c.status || '').toLowerCase() === 'established' ||
                    (c.state || c.status || '').toLowerCase() === 'hergestellt'
                );
            }

            const result = connections.map(c => ({
                programm: c.processName || c.programm || 'Unbekannt',
                lokal: c.local || `${c.localAddress}:${c.localPort}`,
                remote: c.remote || `${c.remoteAddress}:${c.remotePort}`,
                status: c.state || c.status,
            }));

            return jsonResult({
                anzahl: result.length,
                verbindungen: result,
            });
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_privacy_settings ─────────────────────────────────────────────

server.tool(
    'get_privacy_settings',
    'Liest die Datenschutz-Einstellungen aus der Windows-Registry (Werbe-ID, Telemetrie, Cortana, etc.).',
    {},
    async () => {
        try {
            const data = await safeAppCall('/api/privacy');
            return jsonResult(data);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_system_info ──────────────────────────────────────────────────

server.tool(
    'get_system_info',
    'Zeigt Hardware- und Betriebssystem-Informationen: Prozessor, RAM, Grafikkarte, Windows-Version, Hersteller, Modell.',
    {},
    async () => {
        try {
            // System-Profil hat die detaillierten Infos
            const profile = await safeAppCall('/api/system-profile');
            return jsonResult(profile);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            // Fallback auf Basis-Infos
            try {
                const basic = await safeAppCall('/api/system-info');
                return jsonResult(basic);
            } catch {
                return errorResult(err.message);
            }
        }
    }
);

// ─── Tool: get_installed_programs ───────────────────────────────────────────

server.tool(
    'get_installed_programs',
    'Listet alle installierten Programme mit Name, Version, Hersteller und Installationsdatum.',
    {
        filter: z.string().optional().describe('Filtert nach Programmname (Teilsuche)'),
    },
    async ({ filter }) => {
        try {
            const data = await safeAppCall('/api/installed-programs');
            let programs = data.programs || data.programme || [];

            if (filter) {
                const f = filter.toLowerCase();
                programs = programs.filter(p =>
                    (p.name || p.DisplayName || '').toLowerCase().includes(f)
                );
            }

            const result = programs.map(p => ({
                name: p.name || p.DisplayName || '',
                version: p.version || p.DisplayVersion || '',
                hersteller: p.publisher || p.Publisher || '',
                groesse: p.size ? formatBytes(p.size) : (p.EstimatedSize ? formatBytes(p.EstimatedSize * 1024) : ''),
            }));

            return jsonResult({
                anzahl: result.length,
                programme: result,
            });
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_autostart_entries ────────────────────────────────────────────

server.tool(
    'get_autostart_entries',
    'Zeigt Programme die automatisch mit Windows starten (Registry, Startup-Ordner, geplante Aufgaben).',
    {},
    async () => {
        try {
            const data = await safeAppCall('/api/autostart');
            return jsonResult(data);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_services ─────────────────────────────────────────────────────

server.tool(
    'get_services',
    'Zeigt Windows-Dienste mit Status, Starttyp und Beschreibung.',
    {
        only_running: z.boolean().optional().describe('Nur laufende Dienste anzeigen (Standard: false)'),
        filter: z.string().optional().describe('Filtert nach Dienstname (Teilsuche)'),
    },
    async ({ only_running, filter }) => {
        try {
            const data = await safeAppCall('/api/services');
            let services = Array.isArray(data) ? data : (data.services || data.dienste || []);

            if (only_running) {
                services = services.filter(s =>
                    (s.status || '').toLowerCase().includes('running') ||
                    (s.status || '').toLowerCase().includes('läuft') ||
                    s.status === 'Running'
                );
            }

            if (filter) {
                const f = filter.toLowerCase();
                services = services.filter(s =>
                    (s.name || '').toLowerCase().includes(f) ||
                    (s.displayName || s.anzeigename || '').toLowerCase().includes(f)
                );
            }

            return jsonResult({
                anzahl: services.length,
                dienste: services,
            });
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_disk_health ──────────────────────────────────────────────────

server.tool(
    'get_disk_health',
    'Liest S.M.A.R.T.-Daten aller Festplatten (Gesundheit, Temperatur, Betriebsstunden, Fehlerzähler).',
    {},
    async () => {
        try {
            const data = await safeAppCall('/api/disk-health');
            return jsonResult(data);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Tool: get_cleanup_suggestions ──────────────────────────────────────────

server.tool(
    'get_cleanup_suggestions',
    'Prüft bekannte Bereinigungs-Kategorien (Temp, Cache, Logs, Downloads) und zeigt wie viel Speicher freigegeben werden könnte.',
    {},
    async () => {
        try {
            const data = await safeAppCall('/api/cleanup');
            return jsonResult(data);
        } catch (err) {
            if (err.message === 'APP_NOT_RUNNING') return appNotRunningError();
            return errorResult(err.message);
        }
    }
);

// ─── Server starten ─────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Logging nur auf stderr (stdout ist für MCP-Protokoll reserviert)
    console.error('Speicher Analyse MCP Server v2.0 gestartet (verbindet sich mit App auf Port 52733)');
}

main().catch(err => {
    console.error('MCP Server Fehler:', err);
    process.exit(1);
});

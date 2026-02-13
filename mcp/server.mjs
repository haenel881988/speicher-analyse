#!/usr/bin/env node
/**
 * Speicher Analyse — MCP Server (Issue #19)
 *
 * Eigenständiger Node.js-Prozess (kein Electron nötig).
 * Transport: stdio  → Wird von Claude Code über .mcp.json gestartet.
 *
 * Tools:
 *   get_drives              – Laufwerke mit Speicherplatz
 *   get_scan_results        – Gespeicherte Scan-Ergebnisse lesen
 *   get_network_connections – Aktive TCP-Verbindungen
 *   get_privacy_settings    – Datenschutz-Einstellungen (Registry)
 *   get_system_info         – Hardware & OS Übersicht
 *   get_installed_programs  – Installierte Programme
 *   get_autostart_entries   – Autostart-Programme
 *   get_services            – Windows-Dienste
 *   get_disk_health         – S.M.A.R.T. Festplatten-Gesundheit
 *   get_cleanup_suggestions – Bereinigungsvorschläge
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

const PS_UTF8 = '[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; ';
const PS_OPTS = { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 };

async function runPS(command) {
    const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command', PS_UTF8 + command,
    ], PS_OPTS);
    return stdout;
}

function parseJson(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

const SESSION_DIR = join(process.env.APPDATA || process.env.HOME || '.', 'speicher-analyse');
const SESSION_FILE = join(SESSION_DIR, 'session.json.gz');

function textResult(text) {
    return { content: [{ type: 'text', text }] };
}

function jsonResult(obj) {
    return textResult(JSON.stringify(obj, null, 2));
}

function errorResult(msg) {
    return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
    name: 'speicher-analyse',
    version: '1.0.0',
});

// ─── Tool: get_drives ───────────────────────────────────────────────────────

server.tool(
    'get_drives',
    'Zeigt alle Laufwerke mit Gesamtgrösse, belegtem und freiem Speicherplatz.',
    {},
    async () => {
        try {
            const raw = await runPS(
                'Get-CimInstance Win32_LogicalDisk | Where-Object {$_.Size -gt 0} | Select-Object DeviceID,FileSystem,FreeSpace,Size,VolumeName | ConvertTo-Json'
            );
            const disks = parseJson(raw).map(d => {
                const total = d.Size || 0;
                const free = d.FreeSpace || 0;
                const used = total - free;
                return {
                    laufwerk: d.DeviceID + '\\',
                    name: d.VolumeName || '',
                    dateisystem: d.FileSystem || 'Unbekannt',
                    gesamt: formatBytes(total),
                    belegt: formatBytes(used),
                    frei: formatBytes(free),
                    belegung_prozent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                };
            });
            return jsonResult({ laufwerke: disks });
        } catch (err) {
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
            if (!existsSync(SESSION_FILE)) {
                return textResult('Keine gespeicherten Scan-Daten gefunden. Bitte zuerst in der App einen Scan durchführen.');
            }

            const compressed = await readFile(SESSION_FILE);
            const json = gunzipSync(compressed).toString('utf8');
            const data = JSON.parse(json);

            if (!data.scans || data.scans.length === 0) {
                return textResult('Session-Datei vorhanden, aber keine Scan-Daten enthalten.');
            }

            const limit = top_files_limit || 20;
            const result = {
                gespeichert_am: data.savedAt,
                anzahl_scans: data.scans.length,
                scans: data.scans.map(scan => {
                    // Top-Dateien begrenzen
                    const topFiles = (scan.topFiles || []).slice(0, limit).map(f => ({
                        pfad: f.path || f.name,
                        groesse: formatBytes(f.size),
                        groesse_bytes: f.size,
                    }));

                    // Dateitypen-Statistik
                    const extStats = scan.extensionStats
                        ? new Map(scan.extensionStats)
                        : new Map();
                    const dateitypen = [...extStats.entries()]
                        .sort((a, b) => (b[1].size || 0) - (a[1].size || 0))
                        .slice(0, 20)
                        .map(([ext, info]) => ({
                            endung: ext,
                            anzahl: info.count || 0,
                            groesse: formatBytes(info.size || 0),
                        }));

                    return {
                        laufwerk: scan.rootPath,
                        gesamtgroesse: formatBytes(scan.totalSize),
                        ordner_gescannt: scan.dirsScanned,
                        dateien_gefunden: scan.filesFound,
                        fehler: scan.errorsCount,
                        top_dateien: topFiles,
                        dateitypen,
                    };
                }),
            };
            return jsonResult(result);
        } catch (err) {
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
            const psScript = `
                $conns = Get-NetTCPConnection | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
                $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
                $procs = @{}
                foreach ($p in (Get-Process -Id $pids -ErrorAction SilentlyContinue)) {
                    $procs[$p.Id] = @{ Name = $p.ProcessName; Path = $p.Path }
                }
                $result = foreach ($c in $conns) {
                    $pi = $procs[[int]$c.OwningProcess]
                    [PSCustomObject]@{
                        localAddress   = $c.LocalAddress
                        localPort      = $c.LocalPort
                        remoteAddress  = $c.RemoteAddress
                        remotePort     = $c.RemotePort
                        state          = [string]$c.State
                        processName    = if ($pi) { $pi.Name } else { '' }
                    }
                }
                $result | ConvertTo-Json -Depth 3 -Compress
            `.trim();
            const raw = await runPS(psScript);
            let connections = parseJson(raw);

            if (only_established !== false) {
                connections = connections.filter(c => c.state === 'Established');
            }

            const result = connections.map(c => ({
                programm: c.processName || 'Unbekannt',
                lokal: `${c.localAddress}:${c.localPort}`,
                remote: `${c.remoteAddress}:${c.remotePort}`,
                status: c.state,
            }));

            return jsonResult({
                anzahl: result.length,
                verbindungen: result,
            });
        } catch (err) {
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
            // Schlüssel-Einstellungen die wir prüfen
            const checks = [
                { id: 'werbung-id', name: 'Werbe-ID', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', key: 'Enabled', empfohlen: 0 },
                { id: 'cortana', name: 'Cortana', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search', key: 'CortanaConsent', empfohlen: 0 },
                { id: 'feedback', name: 'Feedback-Häufigkeit', path: 'HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules', key: 'NumberOfSIUFInPeriod', empfohlen: 0 },
                { id: 'telemetrie', name: 'Diagnosedaten', path: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', key: 'AllowTelemetry', empfohlen: 0 },
                { id: 'standort', name: 'Standort-Dienst', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', key: 'Value', empfohlen: 'Deny' },
                { id: 'kamera', name: 'Kamera-Zugriff', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam', key: 'Value', empfohlen: 'Deny' },
                { id: 'mikrofon', name: 'Mikrofon-Zugriff', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone', key: 'Value', empfohlen: 'Deny' },
            ];

            const results = [];
            for (const check of checks) {
                try {
                    const raw = await runPS(
                        `(Get-ItemProperty -Path 'Registry::${check.path}' -Name '${check.key}' -ErrorAction Stop).'${check.key}'`
                    );
                    const value = raw.trim();
                    const numVal = parseInt(value);
                    const aktuellerWert = isNaN(numVal) ? value : numVal;
                    const istGeschuetzt = aktuellerWert === check.empfohlen ||
                        (check.empfohlen === 'Deny' && value.toLowerCase() === 'deny');

                    results.push({
                        einstellung: check.name,
                        status: istGeschuetzt ? 'Geschützt' : 'Offen',
                        aktueller_wert: aktuellerWert,
                        empfohlener_wert: check.empfohlen,
                    });
                } catch {
                    results.push({
                        einstellung: check.name,
                        status: 'Nicht gesetzt (Standard)',
                        aktueller_wert: null,
                        empfohlener_wert: check.empfohlen,
                    });
                }
            }

            const geschuetzt = results.filter(r => r.status === 'Geschützt').length;
            const offen = results.filter(r => r.status === 'Offen').length;

            return jsonResult({
                zusammenfassung: {
                    geschuetzt,
                    offen,
                    gesamt: results.length,
                    bewertung: offen === 0 ? 'Gut geschützt' : offen <= 2 ? 'Teilweise geschützt' : 'Verbesserungsbedarf',
                },
                einstellungen: results,
            });
        } catch (err) {
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
            const psScript = `
                $cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory,NumberOfProcessors
                $os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime
                $cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed
                $gpu = Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion
                @{
                    hersteller = $cs.Manufacturer
                    modell = $cs.Model
                    ram_bytes = $cs.TotalPhysicalMemory
                    betriebssystem = $os.Caption
                    os_version = $os.Version
                    os_build = $os.BuildNumber
                    architektur = $os.OSArchitecture
                    letzter_start = $os.LastBootUpTime
                    prozessor = $cpu.Name
                    cpu_kerne = $cpu.NumberOfCores
                    cpu_threads = $cpu.NumberOfLogicalProcessors
                    cpu_takt_mhz = $cpu.MaxClockSpeed
                    grafikkarte = $gpu.Name
                    gpu_ram_bytes = $gpu.AdapterRAM
                    gpu_treiber = $gpu.DriverVersion
                } | ConvertTo-Json -Depth 3
            `.trim();
            const raw = await runPS(psScript);
            const info = JSON.parse(raw.trim());

            return jsonResult({
                system: {
                    hersteller: info.hersteller || 'Unbekannt',
                    modell: info.modell || 'Unbekannt',
                    ram: formatBytes(info.ram_bytes),
                    betriebssystem: info.betriebssystem,
                    version: info.os_version,
                    build: info.os_build,
                    architektur: info.architektur,
                    letzter_start: info.letzter_start,
                },
                prozessor: {
                    name: info.prozessor,
                    kerne: info.cpu_kerne,
                    threads: info.cpu_threads,
                    max_takt_mhz: info.cpu_takt_mhz,
                },
                grafikkarte: {
                    name: info.grafikkarte,
                    speicher: formatBytes(info.gpu_ram_bytes),
                    treiber: info.gpu_treiber,
                },
            });
        } catch (err) {
            return errorResult(err.message);
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
            const psScript = `
                $paths = @(
                    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
                    'HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
                    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
                )
                Get-ItemProperty $paths -ErrorAction SilentlyContinue |
                    Where-Object { $_.DisplayName -and $_.DisplayName -ne '' } |
                    Select-Object DisplayName,DisplayVersion,Publisher,InstallDate,EstimatedSize |
                    Sort-Object DisplayName |
                    ConvertTo-Json -Depth 2 -Compress
            `.trim();
            const raw = await runPS(psScript);
            let programs = parseJson(raw).map(p => ({
                name: p.DisplayName || '',
                version: p.DisplayVersion || '',
                hersteller: p.Publisher || '',
                installiert_am: p.InstallDate || '',
                groesse: p.EstimatedSize ? formatBytes(p.EstimatedSize * 1024) : '',
            }));

            if (filter) {
                const f = filter.toLowerCase();
                programs = programs.filter(p => p.name.toLowerCase().includes(f));
            }

            return jsonResult({
                anzahl: programs.length,
                programme: programs,
            });
        } catch (err) {
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
            const psScript = `
                $entries = @()
                # Registry Run Keys
                $regPaths = @(
                    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
                    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
                    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
                    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce'
                )
                foreach ($rp in $regPaths) {
                    try {
                        $props = Get-ItemProperty -Path $rp -ErrorAction SilentlyContinue
                        if ($props) {
                            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                                $entries += [PSCustomObject]@{
                                    name = $_.Name
                                    befehl = $_.Value
                                    quelle = $rp
                                    typ = 'Registry'
                                }
                            }
                        }
                    } catch {}
                }
                # Startup-Ordner
                $startupPath = [Environment]::GetFolderPath('Startup')
                if (Test-Path $startupPath) {
                    Get-ChildItem $startupPath -File | ForEach-Object {
                        $entries += [PSCustomObject]@{
                            name = $_.BaseName
                            befehl = $_.FullName
                            quelle = 'Startup-Ordner'
                            typ = 'Datei'
                        }
                    }
                }
                $entries | ConvertTo-Json -Depth 2 -Compress
            `.trim();
            const raw = await runPS(psScript);
            const entries = parseJson(raw).map(e => ({
                name: e.name || '',
                befehl: e.befehl || '',
                quelle: e.quelle || '',
                typ: e.typ || '',
            }));

            return jsonResult({
                anzahl: entries.length,
                autostart_programme: entries,
            });
        } catch (err) {
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
            const raw = await runPS(
                'Get-Service | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json -Compress'
            );
            let services = parseJson(raw).map(s => ({
                name: s.Name || '',
                anzeigename: s.DisplayName || '',
                status: s.Status === 4 ? 'Läuft' : s.Status === 1 ? 'Gestoppt' : String(s.Status),
                starttyp: s.StartType === 2 ? 'Automatisch' : s.StartType === 3 ? 'Manuell' : s.StartType === 4 ? 'Deaktiviert' : String(s.StartType),
            }));

            if (only_running) {
                services = services.filter(s => s.status === 'Läuft');
            }
            if (filter) {
                const f = filter.toLowerCase();
                services = services.filter(s =>
                    s.name.toLowerCase().includes(f) || s.anzeigename.toLowerCase().includes(f)
                );
            }

            return jsonResult({
                anzahl: services.length,
                dienste: services,
            });
        } catch (err) {
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
            const psScript = `
                $disks = Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_PhysicalDisk -ErrorAction Stop |
                    Select-Object FriendlyName,MediaType,Size,HealthStatus,OperationalStatus,BusType,FirmwareRevision,SerialNumber
                $reliability = Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_StorageReliabilityCounter -ErrorAction SilentlyContinue |
                    Select-Object DeviceId,Temperature,ReadErrorsTotal,WriteErrorsTotal,PowerOnHours,Wear
                @{
                    disks = $disks
                    reliability = $reliability
                } | ConvertTo-Json -Depth 3
            `.trim();
            const raw = await runPS(psScript);
            const data = JSON.parse(raw.trim());

            const disks = (Array.isArray(data.disks) ? data.disks : [data.disks]).filter(Boolean);
            const reliability = Array.isArray(data.reliability) ? data.reliability : (data.reliability ? [data.reliability] : []);

            const result = disks.map((d, i) => {
                const rel = reliability[i] || {};
                return {
                    name: d.FriendlyName || 'Unbekannt',
                    typ: d.MediaType === 4 ? 'SSD' : d.MediaType === 3 ? 'HDD' : 'Unbekannt',
                    groesse: formatBytes(d.Size),
                    gesundheit: d.HealthStatus === 0 ? 'Gesund' : d.HealthStatus === 1 ? 'Warnung' : 'Unbekannt',
                    status: d.OperationalStatus === 0 ? undefined : String(d.OperationalStatus),
                    bus: d.BusType === 17 ? 'NVMe' : d.BusType === 11 ? 'SATA' : d.BusType === 7 ? 'USB' : String(d.BusType),
                    seriennummer: d.SerialNumber || '',
                    temperatur_celsius: rel.Temperature || null,
                    betriebsstunden: rel.PowerOnHours || null,
                    lesefehler: rel.ReadErrorsTotal || 0,
                    schreibfehler: rel.WriteErrorsTotal || 0,
                    verschleiss_prozent: rel.Wear || null,
                };
            });

            return jsonResult({ festplatten: result });
        } catch (err) {
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
            const psScript = `
                $results = @()
                # Windows Temp
                $winTemp = "$env:TEMP"
                if (Test-Path $winTemp) {
                    $size = (Get-ChildItem $winTemp -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
                    $results += [PSCustomObject]@{ kategorie = 'Windows Temp'; pfad = $winTemp; groesse = [long]$size; anzahl = (Get-ChildItem $winTemp -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count }
                }
                # Windows Temp (System)
                $sysTemp = "$env:SystemRoot\\Temp"
                if (Test-Path $sysTemp) {
                    $size = (Get-ChildItem $sysTemp -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
                    $results += [PSCustomObject]@{ kategorie = 'System Temp'; pfad = $sysTemp; groesse = [long]$size; anzahl = (Get-ChildItem $sysTemp -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count }
                }
                # Downloads (nur Info, nicht automatisch löschen)
                $downloads = [Environment]::GetFolderPath('UserProfile') + '\\Downloads'
                if (Test-Path $downloads) {
                    $size = (Get-ChildItem $downloads -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
                    $results += [PSCustomObject]@{ kategorie = 'Downloads'; pfad = $downloads; groesse = [long]$size; anzahl = (Get-ChildItem $downloads -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count }
                }
                # Papierkorb
                $shell = New-Object -ComObject Shell.Application
                $rb = $shell.NameSpace(0xa)
                $rbItems = @($rb.Items())
                $rbSize = ($rbItems | ForEach-Object { $rb.GetDetailsOf($_, 3) })
                $results += [PSCustomObject]@{ kategorie = 'Papierkorb'; pfad = 'Papierkorb'; groesse = [long]0; anzahl = $rbItems.Count }
                $results | ConvertTo-Json -Depth 2 -Compress
            `.trim();
            const raw = await runPS(psScript);
            const categories = parseJson(raw).map(c => ({
                kategorie: c.kategorie || '',
                pfad: c.pfad || '',
                groesse: formatBytes(c.groesse || 0),
                groesse_bytes: c.groesse || 0,
                dateien: c.anzahl || 0,
            }));

            const totalBytes = categories.reduce((sum, c) => sum + (c.groesse_bytes || 0), 0);

            return jsonResult({
                potenzielle_einsparung: formatBytes(totalBytes),
                kategorien: categories,
            });
        } catch (err) {
            return errorResult(err.message);
        }
    }
);

// ─── Server starten ─────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Logging nur auf stderr (stdout ist für MCP-Protokoll reserviert)
    console.error('Speicher Analyse MCP Server gestartet (stdio)');
}

main().catch(err => {
    console.error('MCP Server Fehler:', err);
    process.exit(1);
});

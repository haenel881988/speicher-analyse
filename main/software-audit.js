'use strict';

const { runPS } = require('./cmd-utils');

// ─── PowerShell-Skript: Installierte Programme aus der Registry lesen ────────

const PS_GET_PROGRAMS = `
$paths = @(
    @{ Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Source = 'hklm' },
    @{ Path = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Source = 'hklm-wow64' },
    @{ Path = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Source = 'hkcu' }
)

$results = @()
foreach ($entry in $paths) {
    try {
        $items = Get-ItemProperty -Path $entry.Path -ErrorAction SilentlyContinue
        foreach ($item in $items) {
            if (-not $item.DisplayName) { continue }
            $installLoc = if ($item.InstallLocation) { $item.InstallLocation.Trim() } else { '' }
            $hasDir = $false
            $isOrphaned = $false
            if ($installLoc -and $installLoc.Length -gt 2) {
                $hasDir = Test-Path -LiteralPath $installLoc -ErrorAction SilentlyContinue
                $isOrphaned = -not $hasDir
            }
            $results += [PSCustomObject]@{
                name            = [string]$item.DisplayName
                version         = [string]$item.DisplayVersion
                publisher       = [string]$item.Publisher
                installDate     = [string]$item.InstallDate
                installLocation = [string]$installLoc
                uninstallString = [string]$item.UninstallString
                estimatedSize   = if ($item.EstimatedSize) { [int]$item.EstimatedSize } else { 0 }
                registryPath    = [string]$item.PSPath -replace '^Microsoft\\.PowerShell\\.Core\\\\Registry::', ''
                source          = $entry.Source
                hasInstallDir   = [bool]$hasDir
                isOrphaned      = [bool]$isOrphaned
            }
        }
    } catch {}
}
$results | ConvertTo-Json -Depth 3 -Compress
`.trim();

// ─── PowerShell-Skript: Autostart-Eintraege abfragen ────────────────────────

const PS_GET_AUTOSTART = `
$results = @()
$runKeys = @(
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
)
foreach ($key in $runKeys) {
    try {
        $props = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        if (-not $props) { continue }
        $props.PSObject.Properties | Where-Object {
            $_.Name -notin @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')
        } | ForEach-Object {
            $results += [PSCustomObject]@{
                name     = $_.Name
                location = $key
                enabled  = $true
                command  = [string]$_.Value
            }
        }
    } catch {}
}
$results | ConvertTo-Json -Depth 2 -Compress
`.trim();

// ─── PowerShell-Skript: Dienste abfragen ────────────────────────────────────

const PS_GET_SERVICES = `
Get-WmiObject Win32_Service |
    Select-Object Name, DisplayName, State, StartMode, PathName |
    ConvertTo-Json -Depth 2 -Compress
`.trim();

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * PowerShell-JSON-Ausgabe sicher parsen.
 * Gibt immer ein Array zurueck, auch wenn PS ein einzelnes Objekt liefert.
 */
function parseJsonArray(stdout) {
    const trimmed = (stdout || '').trim();
    if (!trimmed || trimmed === 'null') return [];
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Normalisiert ein Programm-Objekt aus der PowerShell-Ausgabe.
 */
function normalizeProgram(raw) {
    return {
        name:            raw.name || '',
        version:         raw.version || '',
        publisher:       raw.publisher || '',
        installDate:     raw.installDate || '',
        installLocation: raw.installLocation || '',
        uninstallString: raw.uninstallString || '',
        estimatedSize:   typeof raw.estimatedSize === 'number' ? raw.estimatedSize : 0,
        registryPath:    raw.registryPath || '',
        source:          raw.source || 'hklm',
        hasInstallDir:   !!raw.hasInstallDir,
        isOrphaned:      !!raw.isOrphaned,
    };
}

/**
 * Einfache Textsuche: Prueft ob einer der Suchbegriffe im Zieltext vorkommt.
 */
function textMatch(haystack, needles) {
    const lower = haystack.toLowerCase();
    return needles.some(n => n && lower.includes(n.toLowerCase()));
}

// ─── Exportierte Funktionen ──────────────────────────────────────────────────

/**
 * Liest alle installierten Programme aus den drei Registry-Uninstall-Pfaden.
 * Filtert Eintraege ohne DisplayName und prueft ob InstallLocation existiert.
 *
 * @returns {Promise<Array>} Array von Programm-Objekten
 */
async function getInstalledPrograms() {
    try {
        const { stdout } = await runPS(PS_GET_PROGRAMS, {
            timeout: 60000,
            maxBuffer: 20 * 1024 * 1024,
        });
        const raw = parseJsonArray(stdout);
        return raw.map(normalizeProgram);
    } catch (err) {
        console.error('Fehler beim Lesen der installierten Programme:', err.message);
        return [];
    }
}

/**
 * Korreliert ein Programm mit verwandten Systemeintraegen:
 * Autostart, Dienste und Registry-Reste.
 *
 * @param {object} program - Programm-Objekt aus getInstalledPrograms()
 * @returns {Promise<object>} Korrelationsergebnis
 */
async function correlateProgram(program) {
    const result = {
        autostartEntries: [],
        services: [],
        registryRemnants: 0,
        totalFootprint: 'clean',
    };

    if (!program || !program.name) return result;

    // Suchbegriffe aus Programmname und Pfad ableiten
    const searchTerms = [program.name];
    if (program.publisher) searchTerms.push(program.publisher);
    if (program.installLocation) {
        // Letzten Ordnernamen als Suchbegriff verwenden
        const parts = program.installLocation.replace(/[\\/]+$/, '').split(/[\\/]/);
        const folder = parts[parts.length - 1];
        if (folder && folder.length > 2) searchTerms.push(folder);
    }

    // Alle drei Abfragen parallel ausfuehren
    const [autostartResult, servicesResult] = await Promise.allSettled([
        runPS(PS_GET_AUTOSTART, { timeout: 15000 }),
        runPS(PS_GET_SERVICES, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }),
    ]);

    // Autostart-Eintraege filtern
    if (autostartResult.status === 'fulfilled') {
        try {
            const entries = parseJsonArray(autostartResult.value.stdout);
            result.autostartEntries = entries
                .filter(e => textMatch(`${e.name || ''} ${e.command || ''}`, searchTerms))
                .map(e => ({
                    name:     e.name || '',
                    location: e.location || '',
                    enabled:  e.enabled !== false,
                }));
        } catch { /* JSON-Parsing fehlgeschlagen */ }
    }

    // Dienste filtern
    if (servicesResult.status === 'fulfilled') {
        try {
            const services = parseJsonArray(servicesResult.value.stdout);
            result.services = services
                .filter(s => textMatch(
                    `${s.DisplayName || ''} ${s.PathName || ''} ${s.Name || ''}`,
                    searchTerms
                ))
                .map(s => ({
                    name:        s.Name || '',
                    displayName: s.DisplayName || '',
                    status:      s.State || '',
                    startType:   s.StartMode || '',
                }));
        } catch { /* JSON-Parsing fehlgeschlagen */ }
    }

    // Registry-Reste zaehlen: Uninstall-String-Pfad als Hinweis
    if (program.uninstallString) {
        // Wenn ein Uninstall-Eintrag vorhanden ist, aber der Ordner fehlt,
        // zaehlt das als Registry-Rest
        if (program.isOrphaned) {
            result.registryRemnants = 1;
        }
    }

    // Gesamtbewertung berechnen
    const footprintScore = result.autostartEntries.length
        + result.services.length
        + result.registryRemnants;

    if (footprintScore === 0) {
        result.totalFootprint = 'clean';
    } else if (footprintScore <= 2) {
        result.totalFootprint = 'moderate';
    } else {
        result.totalFootprint = 'heavy';
    }

    return result;
}

/**
 * Findet verwaiste Registry-Eintraege: Programme deren InstallLocation
 * auf einen nicht mehr existierenden Ordner verweist.
 *
 * @returns {Promise<Array>} Gefilterte Programme mit isOrphaned=true
 */
async function getOrphanedEntries() {
    const programs = await getInstalledPrograms();
    return programs.filter(p => p.isOrphaned);
}

/**
 * Fuehrt ein vollstaendiges Software-Audit durch:
 * Liest alle Programme, erkennt verwaiste Eintraege und berechnet Statistiken.
 *
 * @returns {Promise<object>} Audit-Ergebnis mit Programmen, Statistiken und verwaisten Eintraegen
 */
async function auditAll() {
    const programs = await getInstalledPrograms();

    const orphanedCount = programs.filter(p => p.isOrphaned).length;
    const totalSizeKB = programs.reduce((sum, p) => sum + p.estimatedSize, 0);

    return {
        programs,
        orphanedCount,
        totalPrograms: programs.length,
        totalSizeKB,
    };
}

module.exports = { getInstalledPrograms, correlateProgram, getOrphanedEntries, auditAll };

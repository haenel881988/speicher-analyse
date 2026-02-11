'use strict';

const { runPS } = require('./cmd-utils');
const log = require('./logger').createLogger('audit');

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
    const program = {
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
    program.category = categorizeProgram(program);
    return program;
}

/**
 * Einfache Textsuche: Prueft ob einer der Suchbegriffe im Zieltext vorkommt.
 */
function textMatch(haystack, needles) {
    const lower = haystack.toLowerCase();
    return needles.some(n => n && lower.includes(n.toLowerCase()));
}

// ─── Software-Kategorisierung ────────────────────────────────────────────────

const CATEGORIES = {
    system:         { id: 'system',         label: 'System',          color: '#6c757d' },
    treiber:        { id: 'treiber',        label: 'Treiber',         color: '#17a2b8' },
    produktivitaet: { id: 'produktivitaet', label: 'Produktivität',   color: '#28a745' },
    entwicklung:    { id: 'entwicklung',    label: 'Entwicklung',     color: '#6f42c1' },
    browser:        { id: 'browser',        label: 'Browser',         color: '#fd7e14' },
    kommunikation:  { id: 'kommunikation',  label: 'Kommunikation',   color: '#e83e8c' },
    multimedia:     { id: 'multimedia',     label: 'Multimedia',      color: '#20c997' },
    spiele:         { id: 'spiele',         label: 'Spiele',          color: '#dc3545' },
    sicherheit:     { id: 'sicherheit',     label: 'Sicherheit',     color: '#ffc107' },
    sonstiges:      { id: 'sonstiges',      label: 'Sonstiges',       color: '#adb5bd' },
};

// Level 1: Bekannte Software → Kategorie (Substring-Match auf Programmnamen)
const KNOWN_SOFTWARE = {
    // Browser
    'google chrome': 'browser', 'mozilla firefox': 'browser', 'microsoft edge': 'browser',
    'opera gx': 'browser', 'opera stable': 'browser', 'opera browser': 'browser',
    'brave browser': 'browser', 'vivaldi': 'browser', 'tor browser': 'browser',
    'waterfox': 'browser', 'chromium': 'browser', 'maxthon': 'browser', 'pale moon': 'browser',

    // Entwicklung
    'visual studio code': 'entwicklung', 'visual studio 20': 'entwicklung',
    'jetbrains': 'entwicklung', 'intellij': 'entwicklung', 'pycharm': 'entwicklung',
    'webstorm': 'entwicklung', 'phpstorm': 'entwicklung', 'rider': 'entwicklung',
    'clion': 'entwicklung', 'datagrip': 'entwicklung', 'goland': 'entwicklung',
    'node.js': 'entwicklung', 'nodejs': 'entwicklung', 'python 3': 'entwicklung',
    'python 2': 'entwicklung', 'git for windows': 'entwicklung', 'git version': 'entwicklung',
    'github desktop': 'entwicklung', 'docker desktop': 'entwicklung',
    'postman': 'entwicklung', 'insomnia': 'entwicklung', 'fiddler': 'entwicklung',
    'notepad++': 'entwicklung', 'sublime text': 'entwicklung', 'atom': 'entwicklung',
    'tortoisegit': 'entwicklung', 'tortoisesvn': 'entwicklung', 'sourcetree': 'entwicklung',
    'wsl': 'entwicklung', 'windows terminal': 'entwicklung', 'powershell 7': 'entwicklung',
    'cmake': 'entwicklung', 'mingw': 'entwicklung', 'msys2': 'entwicklung',
    'ruby': 'entwicklung', 'perl': 'entwicklung', 'rust': 'entwicklung', 'go programming': 'entwicklung',
    'java(tm)': 'entwicklung', 'jdk': 'entwicklung', 'android studio': 'entwicklung',
    'unity hub': 'entwicklung', 'unreal engine': 'entwicklung', 'godot': 'entwicklung',
    'wireshark': 'entwicklung', 'putty': 'entwicklung', 'winscp': 'entwicklung',
    'filezilla': 'entwicklung', 'heidisql': 'entwicklung', 'dbeaver': 'entwicklung',
    'mysql workbench': 'entwicklung', 'pgadmin': 'entwicklung', 'mongodb compass': 'entwicklung',

    // Kommunikation
    'microsoft teams': 'kommunikation', 'zoom': 'kommunikation', 'zoom workplace': 'kommunikation',
    'discord': 'kommunikation', 'slack': 'kommunikation', 'skype': 'kommunikation',
    'thunderbird': 'kommunikation', 'telegram': 'kommunikation', 'signal': 'kommunikation',
    'whatsapp': 'kommunikation', 'element': 'kommunikation', 'webex': 'kommunikation',
    'microsoft outlook': 'kommunikation', 'mailbird': 'kommunikation', 'em client': 'kommunikation',

    // Multimedia & Musik
    'vlc media player': 'multimedia', 'vlc': 'multimedia',
    'spotify': 'multimedia', 'sonos': 'multimedia', 'amazon music': 'multimedia',
    'apple music': 'multimedia', 'tidal': 'multimedia', 'deezer': 'multimedia',
    'foobar2000': 'multimedia', 'winamp': 'multimedia', 'musicbee': 'multimedia',
    'audacity': 'multimedia', 'obs studio': 'multimedia', 'streamlabs': 'multimedia',
    'gimp': 'multimedia', 'paint.net': 'multimedia', 'irfanview': 'multimedia',
    'adobe photoshop': 'multimedia', 'adobe premiere': 'multimedia',
    'adobe after effects': 'multimedia', 'adobe illustrator': 'multimedia',
    'adobe lightroom': 'multimedia', 'adobe creative cloud': 'multimedia',
    'adobe media encoder': 'multimedia', 'adobe audition': 'multimedia',
    'adobe animate': 'multimedia', 'adobe indesign': 'multimedia',
    'davinci resolve': 'multimedia', 'shotcut': 'multimedia', 'kdenlive': 'multimedia',
    'handbrake': 'multimedia', 'ffmpeg': 'multimedia', 'mediamonkey': 'multimedia',
    'k-lite': 'multimedia', 'codec pack': 'multimedia',
    'itunes': 'multimedia', 'media player': 'multimedia',
    'nvidia broadcast': 'multimedia', 'elgato': 'multimedia',
    'blender': 'multimedia', 'inkscape': 'multimedia', 'krita': 'multimedia',
    'xnview': 'multimedia', 'faststone': 'multimedia', 'shareX': 'multimedia',
    'greenshot': 'multimedia', 'screenpresso': 'multimedia', 'snagit': 'multimedia',
    'fl studio': 'multimedia', 'ableton': 'multimedia', 'reaper': 'multimedia',
    'voicemeeter': 'multimedia', 'virtual audio cable': 'multimedia',

    // Produktivität
    'microsoft office': 'produktivitaet', 'microsoft 365': 'produktivitaet',
    'libreoffice': 'produktivitaet', 'openoffice': 'produktivitaet',
    'notion': 'produktivitaet', 'obsidian': 'produktivitaet', 'evernote': 'produktivitaet',
    'onenote': 'produktivitaet', 'todoist': 'produktivitaet', 'trello': 'produktivitaet',
    '7-zip': 'produktivitaet', 'winrar': 'produktivitaet', 'peazip': 'produktivitaet',
    'bandizip': 'produktivitaet', 'nanazip': 'produktivitaet',
    'adobe acrobat': 'produktivitaet', 'foxit pdf': 'produktivitaet',
    'pdf-xchange': 'produktivitaet', 'sumatra pdf': 'produktivitaet',
    'everything': 'produktivitaet', 'total commander': 'produktivitaet',
    'directory opus': 'produktivitaet', 'xyplorer': 'produktivitaet',
    'google drive': 'produktivitaet', 'dropbox': 'produktivitaet', 'nextcloud': 'produktivitaet',
    'onedrive': 'produktivitaet', 'mega': 'produktivitaet',
    'power automate': 'produktivitaet', 'autohotkey': 'produktivitaet',
    'grammarly': 'produktivitaet', 'deepl': 'produktivitaet',
    'calibre': 'produktivitaet', 'okular': 'produktivitaet',

    // Spiele
    'steam': 'spiele', 'epic games launcher': 'spiele', 'epic games store': 'spiele',
    'gog galaxy': 'spiele', 'battle.net': 'spiele', 'blizzard': 'spiele',
    'origin': 'spiele', 'ea app': 'spiele', 'ea desktop': 'spiele',
    'ubisoft connect': 'spiele', 'uplay': 'spiele',
    'geforce experience': 'spiele', 'nvidia geforce now': 'spiele',
    'xbox': 'spiele', 'playnite': 'spiele', 'retroarch': 'spiele',
    'itch.io': 'spiele', 'lutris': 'spiele', 'heroic launcher': 'spiele',
    'razer synapse': 'spiele', 'razer cortex': 'spiele',
    'corsair icue': 'spiele', 'logitech g hub': 'spiele',
    'steelseries': 'spiele', 'msi afterburner': 'spiele',
    'rivatuner': 'spiele',

    // Sicherheit
    'windows defender': 'sicherheit', 'microsoft defender': 'sicherheit',
    'malwarebytes': 'sicherheit', 'avast': 'sicherheit', 'avg': 'sicherheit',
    'kaspersky': 'sicherheit', 'norton': 'sicherheit', 'bitdefender': 'sicherheit',
    'eset': 'sicherheit', 'mcafee': 'sicherheit', 'trend micro': 'sicherheit',
    'f-secure': 'sicherheit', 'sophos': 'sicherheit', 'webroot': 'sicherheit',
    'keepass': 'sicherheit', 'bitwarden': 'sicherheit', '1password': 'sicherheit',
    'lastpass': 'sicherheit', 'dashlane': 'sicherheit', 'enpass': 'sicherheit',
    'veracrypt': 'sicherheit', 'truecrypt': 'sicherheit', 'bitlocker': 'sicherheit',
    'nordvpn': 'sicherheit', 'expressvpn': 'sicherheit', 'protonvpn': 'sicherheit',
    'mullvad': 'sicherheit', 'wireguard': 'sicherheit', 'openvpn': 'sicherheit',
    'glasswire': 'sicherheit', 'simplewall': 'sicherheit',

    // System / Runtimes
    'microsoft visual c++': 'system', '.net framework': 'system', '.net runtime': 'system',
    '.net desktop runtime': 'system', 'asp.net core': 'system',
    'windows sdk': 'system', 'directx': 'system',
    'microsoft update': 'system', 'windows installer': 'system',
    'intel® management': 'system', 'intel® computing': 'system',
    'intel® rapid': 'system', 'intel® optane': 'system',
    'vulkan runtime': 'system', 'openal': 'system', 'openssl': 'system',
    'microsoft xna': 'system', 'microsoft asp.net': 'system',
    'visual j#': 'system', 'msxml': 'system',

    // Treiber
    'nvidia graphics driver': 'treiber', 'nvidia geforce': 'treiber',
    'nvidia hd audio': 'treiber', 'nvidia physx': 'treiber', 'nvidia framev': 'treiber',
    'nvidia usb': 'treiber', 'nvidia update': 'treiber',
    'amd software': 'treiber', 'amd chipset': 'treiber', 'amd radeon': 'treiber',
    'realtek high definition audio': 'treiber', 'realtek audio': 'treiber',
    'realtek ethernet': 'treiber', 'realtek card reader': 'treiber',
    'intel(r) graphics': 'treiber', 'intel(r) wireless': 'treiber',
    'intel(r) bluetooth': 'treiber', 'intel(r) network': 'treiber',
    'intel(r) ethernet': 'treiber', 'intel(r) wi-fi': 'treiber',
    'synaptics': 'treiber', 'wacom': 'treiber',
    'broadcom': 'treiber', 'qualcomm': 'treiber', 'mediatek': 'treiber',
    'samsung magician': 'treiber', 'crucial storage': 'treiber',
    'logitech options': 'treiber',
};

// Level 2: Herausgeber-Regeln (Publisher → Kategorie)
const PUBLISHER_RULES = {
    'nvidia': 'treiber', 'amd': 'treiber', 'advanced micro devices': 'treiber',
    'realtek': 'treiber', 'intel corporation': 'treiber', 'intel(r)': 'treiber',
    'synaptics': 'treiber', 'broadcom': 'treiber', 'qualcomm': 'treiber',
    'mediatek': 'treiber',
    'electronic arts': 'spiele', 'valve': 'spiele', 'valve corporation': 'spiele',
    'epic games': 'spiele', 'ubisoft': 'spiele', 'blizzard': 'spiele',
    'riot games': 'spiele', 'cd projekt': 'spiele', 'rockstar games': 'spiele',
    'bethesda': 'spiele', 'square enix': 'spiele',
    'adobe': 'multimedia', 'adobe inc': 'multimedia', 'adobe systems': 'multimedia',
    'jetbrains': 'entwicklung', 'github': 'entwicklung', 'oracle': 'entwicklung',
    'the git development': 'entwicklung', 'docker': 'entwicklung',
    'mozilla': 'browser', 'mozilla corporation': 'browser',
    'google llc': 'browser', 'google inc': 'browser',
    'avast': 'sicherheit', 'norton': 'sicherheit', 'nortonlifelock': 'sicherheit',
    'kaspersky': 'sicherheit', 'malwarebytes': 'sicherheit', 'eset': 'sicherheit',
    'bitdefender': 'sicherheit', 'mcafee': 'sicherheit', 'f-secure': 'sicherheit',
    'microsoft corporation': 'system',
};

// Level 3: Keyword-Regeln (Schlüsselwörter im Programmnamen)
const KEYWORD_RULES = [
    { keywords: ['driver', 'treiber', 'chipset', 'firmware', 'bios'], category: 'treiber' },
    { keywords: ['browser'], category: 'browser' },
    { keywords: ['game', 'spiel', 'gaming', 'launcher'], category: 'spiele' },
    { keywords: ['studio', 'editor', 'player', 'media', 'video', 'audio', 'music', 'photo', 'image', 'codec', 'recorder'], category: 'multimedia' },
    { keywords: ['security', 'antivirus', 'firewall', 'vpn', 'password', 'encrypt', 'malware'], category: 'sicherheit' },
    { keywords: ['sdk', 'runtime', 'framework', 'redistributable', 'debug', 'compiler', 'ide'], category: 'entwicklung' },
    { keywords: ['office', 'document', 'spreadsheet', 'presentation', 'pdf', 'archiv', 'zip', 'rar', 'compress'], category: 'produktivitaet' },
    { keywords: ['chat', 'messenger', 'mail', 'meeting', 'conference', 'voip', 'call'], category: 'kommunikation' },
    { keywords: ['update', 'helper', 'service', 'tool', 'utility', 'uninstall', 'setup'], category: 'system' },
];

/**
 * 5-stufiger Kategorisierungs-Algorithmus.
 * Erste Übereinstimmung gewinnt.
 */
function categorizeProgram(program) {
    const name = (program.name || '').toLowerCase();
    const publisher = (program.publisher || '').toLowerCase();
    const installPath = (program.installLocation || '').toLowerCase();

    // Level 1: Bekannte Software (genaueste Methode)
    for (const [pattern, cat] of Object.entries(KNOWN_SOFTWARE)) {
        if (name.includes(pattern)) return cat;
    }

    // Level 2: Herausgeber
    for (const [pattern, cat] of Object.entries(PUBLISHER_RULES)) {
        if (publisher.includes(pattern)) return cat;
    }

    // Level 3: Keywords im Namen
    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some(kw => name.includes(kw))) return rule.category;
    }

    // Level 4: Installationspfad
    if (installPath.includes('steam') || installPath.includes('steamapps')) return 'spiele';
    if (installPath.includes('epic games')) return 'spiele';
    if (installPath.includes('windows kits') || installPath.includes('windows sdk')) return 'entwicklung';

    // Level 5: Fallback
    return 'sonstiges';
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
        log.error('Fehler beim Lesen der installierten Programme:', err.message);
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

    // Kategorie-Statistiken berechnen
    const categoryStats = {};
    for (const p of programs) {
        categoryStats[p.category] = (categoryStats[p.category] || 0) + 1;
    }

    return {
        programs,
        orphanedCount,
        totalPrograms: programs.length,
        totalSizeKB,
        categoryStats,
        categories: CATEGORIES,
    };
}

// ─── Update-Check (winget-Abgleich) ─────────────────────────────────────────

/**
 * Fuzzy-Matching: winget-Paketname gegen installierte Programme abgleichen.
 * Strategie: Normalisierter Substring-Match + Wort-Overlap-Scoring.
 */
function fuzzyMatchProgram(wingetName, programs) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, '').trim();
    const wingetNorm = normalize(wingetName);
    const wingetWords = new Set(wingetNorm.split(/\s+/).filter(w => w.length > 1));

    let bestMatch = null;
    let bestScore = 0;

    for (const p of programs) {
        const progNorm = normalize(p.name);

        // Exakter Substring-Match (beide Richtungen)
        if (progNorm.includes(wingetNorm) || wingetNorm.includes(progNorm)) {
            return p;
        }

        // Wort-Overlap-Scoring
        const progWords = new Set(progNorm.split(/\s+/).filter(w => w.length > 1));
        let overlap = 0;
        for (const w of wingetWords) {
            if (progWords.has(w)) overlap++;
        }

        const maxWords = Math.max(wingetWords.size, progWords.size);
        const score = maxWords > 0 ? overlap / maxWords : 0;

        if (overlap >= 2 && score > bestScore && score >= 0.5) {
            bestScore = score;
            bestMatch = p;
        }
    }

    return bestMatch;
}

/**
 * Gleicht installierte Programme mit winget-Upgrade-Ergebnissen ab.
 * Filtert Treiber und Windows-Updates automatisch heraus.
 *
 * @param {Array} programs - Programmliste aus getInstalledPrograms()
 * @returns {Promise<object>} Update-Map + Statistiken
 */
async function checkUpdatesForPrograms(programs) {
    const updates = require('./updates');

    let result;
    try {
        result = await updates.checkSoftwareUpdates();
    } catch (err) {
        log.error('winget-Abfrage fehlgeschlagen:', err.message);
        return { available: false, error: err.message, updates: {} };
    }

    // winget nicht verfügbar oder Fehler
    if (!Array.isArray(result)) {
        return { available: false, error: result?.error || 'winget nicht verfügbar', updates: {} };
    }

    const updateMap = {};

    for (const upd of result) {
        const updNameLower = (upd.name || '').toLowerCase();

        // Windows- und Treiber-Updates überspringen
        if (updNameLower.includes('windows') && updNameLower.includes('update')) continue;
        if (updNameLower.includes('driver')) continue;

        // Fuzzy-Match gegen installierte Programme
        const matched = fuzzyMatchProgram(upd.name, programs);
        if (matched) {
            // Treiber-Kategorie überspringen
            if (matched.category === 'treiber') continue;

            updateMap[matched.name] = {
                wingetId: upd.id,
                wingetName: upd.name,
                currentVersion: upd.currentVersion,
                availableVersion: upd.availableVersion,
                source: upd.source,
            };
        }
    }

    log.info(`Update-Check: ${Object.keys(updateMap).length} Updates gefunden (von ${result.length} winget-Ergebnissen)`);
    return { available: true, updates: updateMap, totalUpdates: Object.keys(updateMap).length };
}

module.exports = {
    getInstalledPrograms, correlateProgram, getOrphanedEntries, auditAll,
    CATEGORIES, categorizeProgram, checkUpdatesForPrograms,
};

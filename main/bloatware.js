'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const execFileAsync = promisify(execFile);

// Kuratierte Bloatware-Datenbank
const BLOATWARE_DB = [
    // === Gefährlich (Scareware / PUPs) ===
    { name: 'Reimage Repair', patterns: ['reimage'], category: 'gefährlich', risk: 3, description: 'Scareware - meldet falsche Systemprobleme um Geld zu verlangen' },
    { name: 'Driver Booster', patterns: ['driver booster', 'iobit\\\\driver'], category: 'gefährlich', risk: 3, description: 'Installiert häufig unerwünschte Software mit' },
    { name: 'Driver Easy', patterns: ['driver easy', 'easeware'], category: 'gefährlich', risk: 3, description: 'Unnötig - Windows Update liefert bessere Treiber' },
    { name: 'SlimCleaner', patterns: ['slimcleaner', 'slimware'], category: 'gefährlich', risk: 3, description: 'PUP - meldet falsche Optimierungsprobleme' },
    { name: 'PC Optimizer Pro', patterns: ['pc optimizer'], category: 'gefährlich', risk: 3, description: 'Scareware - verlangt Bezahlung für unnötige "Reparaturen"' },
    { name: 'MyPC Backup', patterns: ['mypc backup'], category: 'gefährlich', risk: 3, description: 'Unerwünschte Cloud-Backup-Software, oft gebundelt' },
    { name: 'WinZip Driver Updater', patterns: ['winzip driver'], category: 'gefährlich', risk: 3, description: 'PUP - unnötiger Treiber-Updater' },
    { name: 'Advanced SystemCare', patterns: ['advanced systemcare'], category: 'gefährlich', risk: 3, description: 'IObit PUP - installiert Zusatzsoftware ohne Zustimmung' },
    { name: 'Segurazo Antivirus', patterns: ['segurazo'], category: 'gefährlich', risk: 3, description: 'Fake-Antivirus - schwer zu deinstallieren' },
    { name: 'ByteFence', patterns: ['bytefence'], category: 'gefährlich', risk: 3, description: 'PUP - wird oft unbemerkt mitinstalliert' },

    // === Unnötig (Bloatware) ===
    { name: 'Ask Toolbar', patterns: ['ask toolbar', 'ask.com'], category: 'unnötig', risk: 2, description: 'Veraltete Browser-Toolbar, ändert Suchmaschine' },
    { name: 'Babylon Toolbar', patterns: ['babylon'], category: 'unnötig', risk: 2, description: 'Browser-Hijacker, ändert Startseite und Suche' },
    { name: 'Conduit Search', patterns: ['conduit'], category: 'unnötig', risk: 2, description: 'Browser-Hijacker - ändert Browsereinstellungen' },
    { name: 'McAfee WebAdvisor', patterns: ['mcafee webadvisor', 'mcafee web advisor'], category: 'unnötig', risk: 2, description: 'Oft vorinstalliert, verlangsamt Browser' },
    { name: 'Norton Power Eraser', patterns: ['norton power eraser'], category: 'unnötig', risk: 1, description: 'Norton-Rest, nicht mehr benötigt wenn anderer Schutz vorhanden' },
    { name: 'WildTangent Games', patterns: ['wildtangent'], category: 'unnötig', risk: 2, description: 'Vorinstallierte Spiele-Plattform, verbraucht Speicher' },
    { name: 'Candy Crush', patterns: ['candy crush'], category: 'unnötig', risk: 1, description: 'Vorinstalliertes Spiel, belegt Speicherplatz' },
    { name: 'HP Touchpoint Analytics', patterns: ['hp touchpoint', 'touchpoint analytics'], category: 'unnötig', risk: 2, description: 'OEM-Telemetrie, sammelt Nutzungsdaten' },
    { name: 'Lenovo Vantage', patterns: ['lenovo vantage'], category: 'unnötig', risk: 1, description: 'OEM-Software, oft unnötig wenn Updates anders konfiguriert' },
    { name: 'Dell SupportAssist', patterns: ['dell supportassist', 'supportassist'], category: 'unnötig', risk: 1, description: 'OEM-Support-Tool, hatte Sicherheitslücken' },
    { name: 'Bonjour', patterns: ['bonjour'], category: 'unnötig', risk: 1, description: 'Apple-Netzwerkdienst, unnötig ohne Apple-Geräte' },
    { name: 'Microsoft Silverlight', patterns: ['silverlight'], category: 'unnötig', risk: 1, description: 'Veraltete Technologie, wird nicht mehr unterstützt' },
    { name: 'Adobe Flash Player', patterns: ['flash player'], category: 'unnötig', risk: 2, description: 'Veraltet und Sicherheitsrisiko, seit 2021 eingestellt' },
    { name: 'Java Runtime (veraltet)', patterns: ['java.*[67]\\s+update', 'java\\(tm\\).*[67]'], category: 'unnötig', risk: 2, description: 'Veraltete Java-Version, Sicherheitsrisiko' },
    { name: 'QuickTime', patterns: ['quicktime'], category: 'unnötig', risk: 2, description: 'Apple QuickTime für Windows - veraltet, Sicherheitslücken' },

    // === Fragwürdig (Toolbars / Adware) ===
    { name: 'Yahoo Toolbar', patterns: ['yahoo toolbar', 'yahoo! toolbar'], category: 'fragwürdig', risk: 1, description: 'Veraltete Browser-Toolbar' },
    { name: 'Google Toolbar', patterns: ['google toolbar'], category: 'fragwürdig', risk: 1, description: 'Veraltete Toolbar, in modernen Browsern unnötig' },
    { name: 'CyberLink', patterns: ['cyberlink', 'powerdvd', 'power2go', 'mediashow'], category: 'fragwürdig', risk: 1, description: 'Oft vorinstallierte OEM-Multimedia-Software' },
    { name: 'Corel WinDVD', patterns: ['corel.*windvd', 'windvd'], category: 'fragwürdig', risk: 1, description: 'Vorinstallierter DVD-Player, in Windows 10+ unnötig' },
];

// Bekannte Silent-Uninstall-Flags pro Installer-Typ
const SILENT_FLAGS = {
    msi: '/qn /norestart',
    nsis: '/S',
    innosetup: '/VERYSILENT /NORESTART',
    installshield: '/s',
    generic: '/silent /norestart',
};

async function scanBloatware() {
    const results = [];

    try {
        // Installierte Programme aus Registry auslesen
        const programs = await getInstalledPrograms();

        for (const program of programs) {
            const match = matchBloatware(program);
            if (match) {
                results.push({
                    ...match,
                    programName: program.displayName,
                    publisher: program.publisher || '',
                    installDate: program.installDate || '',
                    estimatedSize: program.estimatedSize || 0,
                    uninstallString: program.uninstallString || '',
                    registryKey: program.registryKey,
                    installerType: detectInstallerType(program.uninstallString || ''),
                });
            }
        }
    } catch (err) {
        console.error('Bloatware scan error:', err);
    }

    // Sortieren: Gefährlich zuerst, dann nach Risiko
    results.sort((a, b) => b.risk - a.risk);
    return results;
}

async function getInstalledPrograms() {
    const programs = [];
    const regPaths = [
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];

    for (const regPath of regPaths) {
        try {
            const { stdout } = await execFileAsync('reg', ['query', regPath, '/s'], {
                encoding: 'utf8', timeout: 30000, windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
            });
            const entries = parseRegistryOutput(stdout, regPath);
            programs.push(...entries);
        } catch { /* Pfad existiert nicht */ }
    }

    // Deduplizierung nach Name
    const seen = new Set();
    return programs.filter(p => {
        if (!p.displayName || seen.has(p.displayName.toLowerCase())) return false;
        seen.add(p.displayName.toLowerCase());
        return true;
    });
}

function parseRegistryOutput(stdout, basePath) {
    const entries = [];
    const blocks = stdout.split(/\r?\n\r?\n/);

    for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/);
        if (lines.length < 2) continue;

        const keyLine = lines[0].trim();
        if (!keyLine.startsWith('HK')) continue;

        const entry = { registryKey: keyLine };

        for (const line of lines.slice(1)) {
            const match = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)/);
            if (!match) continue;
            const [, name, value] = match;

            switch (name.toLowerCase()) {
                case 'displayname': entry.displayName = value.trim(); break;
                case 'publisher': entry.publisher = value.trim(); break;
                case 'uninstallstring': entry.uninstallString = value.trim(); break;
                case 'quietuninstallstring': entry.quietUninstallString = value.trim(); break;
                case 'installdate': entry.installDate = value.trim(); break;
                case 'estimatedsize':
                    entry.estimatedSize = parseInt(value.trim(), 10) * 1024 || 0;
                    break;
            }
        }

        if (entry.displayName) {
            entries.push(entry);
        }
    }

    return entries;
}

function matchBloatware(program) {
    const name = (program.displayName || '').toLowerCase();
    const publisher = (program.publisher || '').toLowerCase();
    const combined = name + ' ' + publisher;

    for (const entry of BLOATWARE_DB) {
        for (const pattern of entry.patterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(combined)) {
                return {
                    bloatwareName: entry.name,
                    category: entry.category,
                    risk: entry.risk,
                    description: entry.description,
                };
            }
        }
    }
    return null;
}

function detectInstallerType(uninstallString) {
    const lower = uninstallString.toLowerCase();
    if (lower.includes('msiexec')) return 'msi';
    if (lower.includes('uninst') && lower.includes('.exe')) return 'nsis';
    if (lower.includes('unins000')) return 'innosetup';
    if (lower.includes('installshield')) return 'installshield';
    return 'generic';
}

function buildSilentUninstallCommand(entry) {
    const { uninstallString, installerType } = entry;
    if (!uninstallString) return null;

    // Versuche quietUninstallString zuerst (ist bereits silent)
    if (entry.quietUninstallString) {
        return entry.quietUninstallString;
    }

    const flags = SILENT_FLAGS[installerType] || SILENT_FLAGS.generic;

    if (installerType === 'msi') {
        // MSI: Extract GUID
        const guidMatch = uninstallString.match(/\{[A-F0-9-]+\}/i);
        if (guidMatch) {
            return `msiexec /x ${guidMatch[0]} ${flags}`;
        }
    }

    // Andere: Flags an den Uninstall-String anhängen
    return `${uninstallString} ${flags}`;
}

async function uninstallProgram(entry) {
    const command = buildSilentUninstallCommand(entry);
    if (!command) {
        throw new Error('Kein Deinstallationsbefehl verfügbar');
    }

    try {
        // Zerlege den Befehl in Programm + Argumente
        let exe, args;
        if (command.toLowerCase().startsWith('msiexec')) {
            exe = 'msiexec';
            args = command.replace(/^msiexec\s*/i, '').split(/\s+/);
        } else {
            // Pfad kann in Anführungszeichen stehen
            const quoteMatch = command.match(/^"([^"]+)"\s*(.*)/);
            if (quoteMatch) {
                exe = quoteMatch[1];
                args = quoteMatch[2] ? quoteMatch[2].split(/\s+/) : [];
            } else {
                const parts = command.split(/\s+/);
                exe = parts[0];
                args = parts.slice(1);
            }
        }

        await execFileAsync(exe, args, {
            timeout: 120000,
            windowsHide: true,
        });

        return { success: true, programName: entry.programName };
    } catch (err) {
        return { success: false, programName: entry.programName, error: err.message };
    }
}

module.exports = { scanBloatware, uninstallProgram, BLOATWARE_DB };

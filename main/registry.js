const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = util.promisify(execFile);

// Safety: NEVER touch these paths
const BLOCKED_PATHS = [
    'HKLM\\SYSTEM',
    'HKLM\\SECURITY',
    'HKLM\\SAM',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
];

function isBlocked(regPath) {
    const upper = regPath.toUpperCase();
    return BLOCKED_PATHS.some(b => upper.startsWith(b.toUpperCase()));
}

async function regQuery(keyPath) {
    try {
        const { stdout } = await execFileAsync('reg', ['query', keyPath, '/s'], {
            encoding: 'utf8',
            timeout: 30000,
            windowsHide: true,
        });
        return stdout;
    } catch (err) {
        if (err.code === 1 || (err.stderr && err.stderr.includes('ERROR'))) return '';
        return '';
    }
}

async function regQueryValues(keyPath) {
    try {
        const { stdout } = await execFileAsync('reg', ['query', keyPath], {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
        });
        return parseRegValues(stdout);
    } catch {
        return [];
    }
}

function parseRegValues(output) {
    const values = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const match = line.trim().match(/^(\S+)\s+(REG_\w+)\s+(.*)$/);
        if (match) {
            values.push({ name: match[1], type: match[2], data: match[3].trim() });
        }
    }
    return values;
}

function parseRegKeys(output) {
    const keys = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('HK') && !trimmed.includes('    ')) {
            keys.push(trimmed);
        }
    }
    return keys;
}

async function scanOrphanedUninstall() {
    const results = [];
    const hives = [
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];

    for (const hive of hives) {
        try {
            const output = await regQuery(hive);
            const keys = parseRegKeys(output);

            for (const key of keys) {
                if (key === hive) continue;
                const values = await regQueryValues(key);
                const displayName = values.find(v => v.name === 'DisplayName');
                const installLocation = values.find(v => v.name === 'InstallLocation');

                if (!displayName) {
                    results.push({
                        key,
                        name: '(Kein Name)',
                        reason: 'Kein DisplayName vorhanden',
                        category: 'uninstall',
                    });
                    continue;
                }

                if (installLocation && installLocation.data) {
                    const loc = installLocation.data.replace(/"/g, '');
                    if (loc && !fs.existsSync(loc)) {
                        results.push({
                            key,
                            name: displayName.data,
                            reason: `InstallLocation existiert nicht: ${loc}`,
                            category: 'uninstall',
                        });
                    }
                }
            }
        } catch { /* hive not accessible */ }
    }

    return results;
}

async function scanInvalidStartup() {
    const results = [];
    const hives = [
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
    ];

    for (const hive of hives) {
        const values = await regQueryValues(hive);
        for (const v of values) {
            let exePath = v.data;
            if (exePath.startsWith('"')) {
                const endQuote = exePath.indexOf('"', 1);
                if (endQuote > 0) exePath = exePath.substring(1, endQuote);
            } else {
                exePath = exePath.split(' ')[0];
            }

            if (exePath && !fs.existsSync(exePath)) {
                results.push({
                    key: hive,
                    valueName: v.name,
                    name: v.name,
                    reason: `Programm nicht gefunden: ${exePath}`,
                    category: 'startup',
                });
            }
        }
    }

    return results;
}

async function scanOrphanedSharedDLLs() {
    const results = [];
    const hive = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs';

    const values = await regQueryValues(hive);
    for (const v of values) {
        if (v.name && !v.name.startsWith('(') && !fs.existsSync(v.name)) {
            results.push({
                key: hive,
                valueName: v.name,
                name: path.basename(v.name),
                reason: `DLL nicht gefunden: ${v.name}`,
                category: 'shareddlls',
            });
        }
    }

    return results;
}

async function scanAll() {
    const categories = [];

    // Run all 3 scans in parallel for speed
    const [uninstallResult, startupResult, sharedDllsResult] = await Promise.allSettled([
        scanOrphanedUninstall(),
        scanInvalidStartup(),
        scanOrphanedSharedDLLs(),
    ]);

    if (uninstallResult.status === 'fulfilled' && uninstallResult.value.length > 0) {
        categories.push({
            id: 'uninstall',
            name: 'Verwaiste Deinstallationseintr\u00e4ge',
            description: 'Software-Eintr\u00e4ge deren Installationsverzeichnis nicht mehr existiert',
            icon: '\uD83D\uDDD1',
            entries: uninstallResult.value,
        });
    }

    if (startupResult.status === 'fulfilled' && startupResult.value.length > 0) {
        categories.push({
            id: 'startup',
            name: 'Ung\u00fcltige Autostarteintr\u00e4ge',
            description: 'Autostart-Programme die nicht mehr existieren',
            icon: '\uD83D\uDE80',
            entries: startupResult.value,
        });
    }

    if (sharedDllsResult.status === 'fulfilled' && sharedDllsResult.value.length > 0) {
        categories.push({
            id: 'shareddlls',
            name: 'Verwaiste SharedDLLs',
            description: 'DLL-Verweise auf nicht mehr vorhandene Dateien',
            icon: '\uD83D\uDD17',
            entries: sharedDllsResult.value,
        });
    }

    return categories;
}

async function generateBackup(entries) {
    let reg = 'Windows Registry Editor Version 5.00\n\n';
    reg += '; Speicher Analyse Registry Backup\n';
    reg += `; Erstellt am: ${new Date().toISOString()}\n\n`;

    for (const entry of entries) {
        if (entry.valueName) {
            const values = await regQueryValues(entry.key);
            const val = values.find(v => v.name === entry.valueName);
            if (val) {
                reg += `[${entry.key}]\n`;
                if (val.type === 'REG_SZ') {
                    reg += `"${val.name}"="${val.data.replace(/\\/g, '\\\\')}"\n`;
                } else if (val.type === 'REG_DWORD') {
                    reg += `"${val.name}"=dword:${val.data}\n`;
                } else {
                    reg += `"${val.name}"="${val.data}"\n`;
                }
                reg += '\n';
            }
        } else {
            try {
                const { stdout } = await execFileAsync('reg', ['export', entry.key, '/y', 'CON'], {
                    encoding: 'utf8',
                    timeout: 5000,
                    windowsHide: true,
                });
                reg += stdout + '\n';
            } catch {
                reg += `; Konnte ${entry.key} nicht exportieren\n\n`;
            }
        }
    }

    return reg;
}

async function autoBackup(entries) {
    const backupDir = path.join(process.env.APPDATA || process.env.HOME || '.', 'speicher-analyse', 'registry-backups');
    await fs.promises.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `auto-backup-${timestamp}.reg`);

    const content = await generateBackup(entries);
    await fs.promises.writeFile(backupPath, content, 'utf16le');

    return backupPath;
}

async function deleteEntries(entries) {
    const results = [];

    for (const entry of entries) {
        if (isBlocked(entry.key)) {
            results.push({ ...entry, success: false, error: 'Gesch\u00fctzter Registry-Pfad' });
            continue;
        }

        try {
            if (entry.valueName) {
                await execFileAsync('reg', ['delete', entry.key, '/v', entry.valueName, '/f'], {
                    timeout: 5000,
                    windowsHide: true,
                });
            } else {
                await execFileAsync('reg', ['delete', entry.key, '/f'], {
                    timeout: 5000,
                    windowsHide: true,
                });
            }
            results.push({ ...entry, success: true });
        } catch (err) {
            results.push({ ...entry, success: false, error: err.message });
        }
    }

    return results;
}

async function restoreBackup(regFilePath) {
    try {
        await execFileAsync('reg', ['import', regFilePath], {
            timeout: 30000,
            windowsHide: true,
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { scanAll, generateBackup, autoBackup, deleteEntries, restoreBackup };

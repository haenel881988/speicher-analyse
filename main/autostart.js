const fs = require('fs');
const path = require('path');
const { runCmd, runPS, execFileAsync } = require('./cmd-utils');

const REGISTRY_LOCATIONS = [
    { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', scope: 'Benutzer', type: 'Run' },
    { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', scope: 'System', type: 'Run' },
    { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce', scope: 'Benutzer', type: 'RunOnce' },
];

async function regQueryValues(keyPath) {
    try {
        const { stdout } = await execFileAsync('reg', ['query', keyPath], {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
        });
        const values = [];
        for (const line of stdout.split('\n')) {
            const match = line.trim().match(/^(\S+)\s+(REG_\w+)\s+(.*)$/);
            if (match) {
                values.push({ name: match[1], type: match[2], data: match[3].trim() });
            }
        }
        return values;
    } catch {
        return [];
    }
}

function extractExePath(data) {
    if (!data) return null;
    let exePath = data;
    if (exePath.startsWith('"')) {
        const endQuote = exePath.indexOf('"', 1);
        if (endQuote > 0) exePath = exePath.substring(1, endQuote);
    } else {
        exePath = exePath.split(' ')[0];
    }
    return exePath || null;
}

async function getAutoStartEntries() {
    const entries = [];

    // 1. Registry Run keys
    for (const loc of REGISTRY_LOCATIONS) {
        const values = await regQueryValues(loc.key);
        for (const v of values) {
            const exePath = extractExePath(v.data);
            entries.push({
                id: `reg:${loc.key}:${v.name}`,
                name: v.name,
                command: v.data,
                exePath,
                location: loc.key,
                locationLabel: `Registry (${loc.scope})`,
                type: loc.type,
                source: 'registry',
                enabled: true,
                exists: exePath ? fs.existsSync(exePath) : false,
            });
        }
    }

    // 2. Startup folders
    const startupFolders = [
        { path: path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), scope: 'Benutzer' },
        { path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup', scope: 'Alle Benutzer' },
    ];

    for (const folder of startupFolders) {
        try {
            const dirEntries = await fs.promises.readdir(folder.path, { withFileTypes: true });
            for (const entry of dirEntries) {
                if (entry.name === 'desktop.ini') continue;
                const fullPath = path.join(folder.path, entry.name);
                entries.push({
                    id: `folder:${fullPath}`,
                    name: entry.name.replace(/\.(lnk|url)$/i, ''),
                    command: fullPath,
                    exePath: fullPath,
                    location: folder.path,
                    locationLabel: `Startordner (${folder.scope})`,
                    type: 'Startup',
                    source: 'folder',
                    enabled: true,
                    exists: true,
                });
            }
        } catch { /* folder not accessible */ }
    }

    // 3. Scheduled Tasks (logon/startup triggers) - PowerShell for locale independence
    try {
        const { stdout } = await runPS(`
            Get-ScheduledTask | Where-Object {
                $_.Triggers | Where-Object {
                    $_ -is [CimInstance] -and
                    ($_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -or
                     $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger')
                }
            } | Select-Object TaskName, State, TaskPath,
                @{N='Command'; E={($_.Actions | Select-Object -First 1).Execute}} |
            ConvertTo-Json -Depth 2
        `.trim(), { timeout: 15000 });

        const parsed = JSON.parse(stdout.trim() || '[]');
        const tasks = Array.isArray(parsed) ? parsed : [parsed];
        for (const task of tasks) {
            if (!task.TaskName) continue;
            const taskPath = (task.TaskPath || '') + task.TaskName;
            entries.push({
                id: `task:${taskPath}`,
                name: task.TaskName,
                command: task.Command || '',
                exePath: null,
                location: 'Aufgabenplanung',
                locationLabel: 'Aufgabenplanung',
                type: 'Task',
                source: 'task',
                enabled: task.State === 'Ready' || task.State === 'Running',
                exists: true,
            });
        }
    } catch { /* Get-ScheduledTask failed */ }

    return entries;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

async function toggleAutoStart(entry, enabled) {
    try {
        if (entry.source === 'registry') {
            if (!enabled) {
                // Delete the value to disable
                await execFileAsync('reg', ['delete', entry.location, '/v', entry.name, '/f'], {
                    timeout: 5000, windowsHide: true,
                });
            } else {
                // Re-add the value to enable
                await execFileAsync('reg', ['add', entry.location, '/v', entry.name, '/t', 'REG_SZ', '/d', entry.command, '/f'], {
                    timeout: 5000, windowsHide: true,
                });
            }
            return { success: true };
        } else if (entry.source === 'folder') {
            const currentPath = entry.command;
            const newPath = enabled
                ? currentPath.replace(/\.disabled$/, '')
                : currentPath + '.disabled';
            await fs.promises.rename(currentPath, newPath);
            return { success: true };
        } else if (entry.source === 'task') {
            const taskPath = entry.id.replace('task:', '');
            const action = enabled ? '/enable' : '/disable';
            await execFileAsync('schtasks', ['/change', '/tn', taskPath, action], { timeout: 5000, windowsHide: true });
            return { success: true };
        }
        return { success: false, error: 'Nicht unterstützt' };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
}

async function deleteAutoStart(entry) {
    try {
        if (entry.source === 'registry') {
            await execFileAsync('reg', ['delete', entry.location, '/v', entry.name, '/f'], {
                timeout: 5000, windowsHide: true,
            });
            return { success: true };
        } else if (entry.source === 'folder') {
            await fs.promises.unlink(entry.command);
            return { success: true };
        }
        return { success: false, error: 'Löschen für diesen Typ nicht unterstützt' };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
}

module.exports = { getAutoStartEntries, toggleAutoStart, deleteAutoStart };

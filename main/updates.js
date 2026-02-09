'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function checkWindowsUpdates() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            `
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            try {
                $results = $searcher.Search("IsInstalled=0 AND IsHidden=0")
                $updates = @()
                foreach ($update in $results.Updates) {
                    $size = 0
                    foreach ($dl in $update.DownloadContents) { $size += $dl.ContentFile.Size }
                    if ($size -eq 0 -and $update.MaxDownloadSize) { $size = $update.MaxDownloadSize }
                    $updates += @{
                        Title = $update.Title
                        KBArticleIDs = ($update.KBArticleIDs | ForEach-Object { $_ }) -join ','
                        Size = $size
                        IsMandatory = $update.IsMandatory
                        Severity = if ($update.MsrcSeverity) { $update.MsrcSeverity } else { 'Unbekannt' }
                    }
                }
                $updates | ConvertTo-Json -Depth 3
            } catch {
                '[]'
            }
            `.trim()
        ], { encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const parsed = JSON.parse(stdout.trim() || '[]');
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
        console.error('Windows Update check error:', err);
        return [];
    }
}

async function getUpdateHistory() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            `
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            $count = $searcher.GetTotalHistoryCount()
            $limit = [Math]::Min($count, 20)
            if ($limit -gt 0) {
                $history = $searcher.QueryHistory(0, $limit)
                $entries = @()
                foreach ($entry in $history) {
                    $entries += @{
                        Title = $entry.Title
                        Date = $entry.Date.ToString('yyyy-MM-dd HH:mm')
                        ResultCode = $entry.ResultCode
                        Status = switch ($entry.ResultCode) {
                            0 { 'Nicht gestartet' }
                            1 { 'In Bearbeitung' }
                            2 { 'Erfolgreich' }
                            3 { 'Unvollständig' }
                            4 { 'Fehlgeschlagen' }
                            5 { 'Abgebrochen' }
                            default { 'Unbekannt' }
                        }
                    }
                }
                $entries | ConvertTo-Json -Depth 3
            } else { '[]' }
            `.trim()
        ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const parsed = JSON.parse(stdout.trim() || '[]');
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
        console.error('Update history error:', err);
        return [];
    }
}

async function checkSoftwareUpdates() {
    try {
        // Prüfe ob winget verfügbar ist
        const { stdout } = await execFileAsync('winget', ['upgrade', '--include-unknown'], {
            encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 5 * 1024 * 1024,
        });

        const lines = stdout.split('\n').filter(l => l.trim());
        const updates = [];

        // Finde die Header-Zeile und parse danach
        let headerIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Name') && lines[i].includes('Version') && lines[i].includes('Verfügbar')) {
                headerIdx = i;
                break;
            }
            if (lines[i].includes('Name') && lines[i].includes('Version') && lines[i].includes('Available')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx >= 0) {
            // Finde Spaltenbreiten anhand der Trennlinie
            const sepLine = lines[headerIdx + 1] || '';
            const header = lines[headerIdx];

            for (let i = headerIdx + 2; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim() || line.includes('Upgrade(s)') || line.includes('upgrade(s)')) continue;

                // Einfaches Parsing: Splitte an 2+ Leerzeichen
                const parts = line.split(/\s{2,}/).filter(p => p.trim());
                if (parts.length >= 4) {
                    updates.push({
                        name: parts[0].trim(),
                        id: parts[1].trim(),
                        currentVersion: parts[2].trim(),
                        availableVersion: parts[3].trim(),
                        source: parts[4] ? parts[4].trim() : 'winget',
                    });
                }
            }
        }

        return updates;
    } catch (err) {
        // winget nicht verfügbar
        if (err.message && err.message.includes('ENOENT')) {
            return { error: 'winget nicht installiert' };
        }
        return [];
    }
}

async function updateSoftware(packageId) {
    try {
        const { stdout, stderr } = await execFileAsync('winget', [
            'upgrade', '--id', packageId, '--silent', '--accept-package-agreements', '--accept-source-agreements'
        ], { encoding: 'utf8', timeout: 300000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const success = stdout.toLowerCase().includes('erfolgreich') || stdout.toLowerCase().includes('successfully');
        return { success, packageId, output: stdout };
    } catch (err) {
        return { success: false, packageId, error: err.message };
    }
}

async function getDriverInfo() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            `
            Get-WmiObject Win32_PnPSignedDriver |
                Where-Object { $_.DriverDate } |
                Select-Object DeviceName, DriverVersion, @{N='DriverDate';E={$_.DriverDate.Substring(0,8)}} |
                Sort-Object DriverDate |
                Select-Object -First 15 |
                ConvertTo-Json -Depth 2
            `.trim()
        ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const parsed = JSON.parse(stdout.trim() || '[]');
        const drivers = (Array.isArray(parsed) ? parsed : [parsed]).map(d => {
            const dateStr = d.DriverDate || '';
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const formattedDate = year && month && day ? `${year}-${month}-${day}` : 'Unbekannt';
            const ageYears = year ? Math.floor((Date.now() - new Date(`${year}-${month}-${day}`).getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
            return {
                name: d.DeviceName || 'Unbekannt',
                version: d.DriverVersion || '',
                date: formattedDate,
                ageYears,
                isOld: ageYears >= 3,
            };
        });

        return drivers;
    } catch (err) {
        console.error('Driver info error:', err);
        return [];
    }
}

module.exports = { checkWindowsUpdates, getUpdateHistory, checkSoftwareUpdates, updateSoftware, getDriverInfo };

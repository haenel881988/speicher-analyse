'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const log = require('./logger').createLogger('updates');

// UTF-8 prefix for PowerShell commands
const PS_UTF8 = '[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; ';

async function checkWindowsUpdates() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            PS_UTF8 + `
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
        log.error('Windows Update check error:', err);
        return [];
    }
}

async function getUpdateHistory() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            PS_UTF8 + `
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
        log.error('Update history error:', err);
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
        const { stdout } = await execFileAsync('winget', [
            'upgrade', '--id', packageId, '--silent', '--accept-package-agreements', '--accept-source-agreements'
        ], { encoding: 'utf8', timeout: 300000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const success = stdout.toLowerCase().includes('erfolgreich') || stdout.toLowerCase().includes('successfully');

        // Verify: Check if the package still shows as needing update
        let verified = false;
        let installedVersion = '';
        if (success) {
            try {
                const { stdout: listOut } = await execFileAsync('winget', [
                    'list', '--id', packageId, '--accept-source-agreements'
                ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

                // If it's still in upgrade list, update didn't fully apply
                const { stdout: upgradeOut } = await execFileAsync('winget', [
                    'upgrade', '--id', packageId, '--accept-source-agreements'
                ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

                // If "Keine verfügbaren Upgrades" or "No available upgrade" → verified
                const noUpgrade = upgradeOut.toLowerCase().includes('keine verfügbaren') ||
                    upgradeOut.toLowerCase().includes('no available') ||
                    !upgradeOut.includes(packageId);
                verified = noUpgrade;

                // Extract installed version from list output
                const lines = listOut.split('\n');
                for (const line of lines) {
                    if (line.includes(packageId)) {
                        const parts = line.split(/\s{2,}/).filter(p => p.trim());
                        if (parts.length >= 3) {
                            installedVersion = parts[2].trim();
                        }
                        break;
                    }
                }
            } catch {
                // Verification failed, but update might still have succeeded
                verified = false;
            }
        }

        return { success, packageId, output: stdout, verified, installedVersion };
    } catch (err) {
        return { success: false, packageId, error: err.message };
    }
}

async function getDriverInfo() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            PS_UTF8 + `
            Get-CimInstance Win32_PnPSignedDriver |
                Where-Object { $_.DriverDate -and $_.DeviceName } |
                Select-Object DeviceName, DriverVersion, Manufacturer, DeviceClass, InfName, @{N='DriverDate';E={$_.DriverDate.Substring(0,8)}} |
                Where-Object { $_.DriverDate -match '^(19[9]\\d|20\\d{2})' } |
                Sort-Object DriverDate |
                Select-Object -First 25 |
                ConvertTo-Json -Depth 2
            `.trim()
        ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });

        const parsed = JSON.parse(stdout.trim() || '[]');
        const now = Date.now();
        const drivers = (Array.isArray(parsed) ? parsed : [parsed]).map(d => {
            const dateStr = d.DriverDate || '';
            const year = parseInt(dateStr.substring(0, 4));
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);

            if (!year || year < 1990 || year > new Date().getFullYear() + 1) {
                return null;
            }

            const formattedDate = `${year}-${month}-${day}`;
            const dateObj = new Date(`${year}-${month}-${day}`);
            const ageMs = now - dateObj.getTime();
            const ageYears = ageMs > 0 ? Math.floor(ageMs / (365.25 * 24 * 3600 * 1000)) : 0;
            const manufacturer = d.Manufacturer || '';

            return {
                name: d.DeviceName || 'Unbekannt',
                version: d.DriverVersion || '',
                date: formattedDate,
                ageYears,
                isOld: ageYears >= 3,
                manufacturer,
                deviceClass: d.DeviceClass || '',
                infName: d.InfName || '',
                supportUrl: getManufacturerSupportUrl(manufacturer),
            };
        }).filter(Boolean);

        return drivers;
    } catch (err) {
        log.error('Driver info error:', err);
        return [];
    }
}

function getManufacturerSupportUrl(manufacturer) {
    if (!manufacturer) return '';
    const m = manufacturer.toLowerCase();
    const urls = {
        'intel': 'https://www.intel.com/content/www/us/en/support/detect.html',
        'nvidia': 'https://www.nvidia.com/Download/index.aspx',
        'amd': 'https://www.amd.com/en/support',
        'advanced micro devices': 'https://www.amd.com/en/support',
        'realtek': 'https://www.realtek.com/en/downloads',
        'microsoft': 'https://www.catalog.update.microsoft.com/',
        'logitech': 'https://support.logi.com/hc/en-us/articles/360025297893',
        'samsung': 'https://semiconductor.samsung.com/consumer-storage/support/downloads/',
        'dell': 'https://www.dell.com/support/home/',
        'hp': 'https://support.hp.com/drivers',
        'lenovo': 'https://support.lenovo.com/solutions/ht003029-lenovo-system-update',
        'asus': 'https://www.asus.com/support/download-center/',
        'broadcom': 'https://www.broadcom.com/support/download-search',
        'corsair': 'https://www.corsair.com/us/en/downloads',
        'razer': 'https://www.razer.com/synapse-3',
    };
    for (const [key, url] of Object.entries(urls)) {
        if (m.includes(key)) return url;
    }
    return '';
}

async function getHardwareInfo() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            PS_UTF8 + `
            $cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
            $bios = Get-CimInstance Win32_BIOS | Select-Object SerialNumber
            @{
                Manufacturer = $cs.Manufacturer
                Model = $cs.Model
                SerialNumber = $bios.SerialNumber
            } | ConvertTo-Json
            `.trim()
        ], { encoding: 'utf8', timeout: 10000, windowsHide: true });
        return JSON.parse(stdout.trim());
    } catch {
        return { Manufacturer: '', Model: '', SerialNumber: '' };
    }
}

module.exports = { checkWindowsUpdates, getUpdateHistory, checkSoftwareUpdates, updateSoftware, getDriverInfo, getHardwareInfo };

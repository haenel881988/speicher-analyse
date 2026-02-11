'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { runPS } = require('./cmd-utils');
const log = require('./logger').createLogger('security-audit');

const PS_TIMEOUT = 30000;
const MAX_HISTORY = 50;

function _getHistoryPath() {
    return path.join(app.getPath('userData'), 'audit-history.json');
}

// ---------------------------------------------------------------------------
// Einzelne Security-Checks (sequentiell, nicht parallel!)
// ---------------------------------------------------------------------------

async function _checkFirewall() {
    try {
        const psScript = `
            Get-NetFirewallProfile | Select-Object Name, Enabled | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const profiles = JSON.parse(stdout.trim());
        const arr = Array.isArray(profiles) ? profiles : [profiles];

        const results = arr.map(p => ({
            name: p.Name || '',
            enabled: p.Enabled === true || p.Enabled === 'True',
        }));
        const allEnabled = results.every(p => p.enabled);

        return {
            id: 'firewall',
            label: 'Windows-Firewall',
            status: allEnabled ? 'ok' : 'danger',
            message: allEnabled
                ? 'Alle Firewall-Profile sind aktiv'
                : `${results.filter(p => !p.enabled).map(p => p.name).join(', ')} deaktiviert`,
            details: results,
        };
    } catch (err) {
        log.error('Firewall-Check fehlgeschlagen:', err.message);
        return { id: 'firewall', label: 'Windows-Firewall', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkAntivirus() {
    try {
        const psScript = `
            try {
                $mp = Get-MpComputerStatus -ErrorAction Stop
                [PSCustomObject]@{
                    source        = 'Defender'
                    enabled       = [bool]$mp.AntivirusEnabled
                    realtime      = [bool]$mp.RealTimeProtectionEnabled
                    sigLastUpdate = if ($mp.AntivirusSignatureLastUpdated) { $mp.AntivirusSignatureLastUpdated.ToString('o') } else { '' }
                    sigAge        = if ($mp.AntivirusSignatureLastUpdated) { ((Get-Date) - $mp.AntivirusSignatureLastUpdated).TotalDays } else { -1 }
                    engineVersion = [string]$mp.AMEngineVersion
                } | ConvertTo-Json -Compress
            } catch {
                try {
                    $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct -ErrorAction Stop
                    $first = $av | Select-Object -First 1
                    [PSCustomObject]@{
                        source        = [string]$first.displayName
                        enabled       = $true
                        realtime      = $true
                        sigLastUpdate = ''
                        sigAge        = -1
                        engineVersion = ''
                    } | ConvertTo-Json -Compress
                } catch {
                    Write-Output '{"source":"none","enabled":false}'
                }
            }
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const data = JSON.parse(stdout.trim());

        if (data.source === 'none' || !data.enabled) {
            return { id: 'antivirus', label: 'Virenschutz', status: 'danger', message: 'Kein aktiver Virenschutz gefunden', details: data };
        }

        const sigOld = data.sigAge > 7;
        const status = sigOld ? 'warning' : 'ok';
        const sigInfo = data.sigAge >= 0
            ? `, Signaturen ${Math.round(data.sigAge)} Tage alt`
            : '';

        return {
            id: 'antivirus',
            label: 'Virenschutz',
            status,
            message: `${data.source} aktiv${data.realtime ? ', Echtzeitschutz an' : ''}${sigInfo}`,
            details: data,
        };
    } catch (err) {
        log.error('Antivirus-Check fehlgeschlagen:', err.message);
        return { id: 'antivirus', label: 'Virenschutz', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkBitLocker() {
    try {
        const psScript = `
            try {
                $volumes = Get-BitLockerVolume -ErrorAction Stop | Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage
                @($volumes) | ConvertTo-Json -Compress
            } catch {
                Write-Output '"NO_ACCESS"'
            }
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const parsed = JSON.parse(stdout.trim());

        if (parsed === 'NO_ACCESS') {
            return { id: 'bitlocker', label: 'BitLocker-Verschlüsselung', status: 'warning', message: 'Prüfung erfordert Administratorrechte', details: null };
        }

        const volumes = Array.isArray(parsed) ? parsed : [parsed];
        const cDrive = volumes.find(v => v.MountPoint === 'C:');
        const cProtected = cDrive && (cDrive.ProtectionStatus === 1 || cDrive.ProtectionStatus === 'On');

        return {
            id: 'bitlocker',
            label: 'BitLocker-Verschlüsselung',
            status: cProtected ? 'ok' : 'warning',
            message: cProtected
                ? `C: ist verschlüsselt (${cDrive.EncryptionPercentage || 100}%)`
                : 'C: ist nicht mit BitLocker verschlüsselt',
            details: volumes.map(v => ({ mount: v.MountPoint, status: v.VolumeStatus, protection: v.ProtectionStatus })),
        };
    } catch (err) {
        log.error('BitLocker-Check fehlgeschlagen:', err.message);
        return { id: 'bitlocker', label: 'BitLocker-Verschlüsselung', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkUAC() {
    try {
        const psScript = `
            $path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
            $lua = (Get-ItemProperty -Path $path -Name EnableLUA -ErrorAction SilentlyContinue).EnableLUA
            $consent = (Get-ItemProperty -Path $path -Name ConsentPromptBehaviorAdmin -ErrorAction SilentlyContinue).ConsentPromptBehaviorAdmin
            [PSCustomObject]@{
                enableLUA = $lua
                consentLevel = $consent
            } | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const data = JSON.parse(stdout.trim());

        const uacOn = data.enableLUA === 1;
        const levelOk = data.consentLevel !== undefined && data.consentLevel <= 2;

        let status = 'ok';
        let message = 'UAC ist aktiviert';
        if (!uacOn) {
            status = 'danger';
            message = 'UAC ist deaktiviert — Sicherheitsrisiko!';
        } else if (!levelOk) {
            status = 'warning';
            message = 'UAC aktiv, aber Benachrichtigungslevel ist niedrig';
        }

        return { id: 'uac', label: 'Benutzerkontensteuerung (UAC)', status, message, details: data };
    } catch (err) {
        log.error('UAC-Check fehlgeschlagen:', err.message);
        return { id: 'uac', label: 'Benutzerkontensteuerung (UAC)', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkUptime() {
    try {
        const psScript = `
            $os = Get-CimInstance Win32_OperatingSystem
            $uptime = (Get-Date) - $os.LastBootUpTime
            [PSCustomObject]@{
                lastBoot = $os.LastBootUpTime.ToString('o')
                uptimeDays = [math]::Round($uptime.TotalDays, 1)
            } | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const data = JSON.parse(stdout.trim());

        const days = data.uptimeDays || 0;
        const status = days > 30 ? 'warning' : 'ok';

        return {
            id: 'uptime',
            label: 'Letzter Neustart',
            status,
            message: days > 30
                ? `${days} Tage seit dem letzten Neustart — Neustart empfohlen`
                : `${days} Tage seit dem letzten Neustart`,
            details: data,
        };
    } catch (err) {
        log.error('Uptime-Check fehlgeschlagen:', err.message);
        return { id: 'uptime', label: 'Letzter Neustart', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkLocalUsers() {
    try {
        const psScript = `
            Get-LocalUser | Select-Object Name, Enabled, LastLogon, Description | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const raw = JSON.parse(stdout.trim());
        const users = Array.isArray(raw) ? raw : [raw];

        const activeUsers = users.filter(u => u.Enabled === true || u.Enabled === 'True');
        const suspiciousCount = activeUsers.filter(u => {
            const name = (u.Name || '').toLowerCase();
            return name !== 'administrator' && !name.includes('default') && !name.includes('gast') && !name.includes('guest');
        }).length;

        return {
            id: 'users',
            label: 'Lokale Benutzerkonten',
            status: suspiciousCount > 3 ? 'warning' : 'ok',
            message: `${activeUsers.length} aktive Konten${suspiciousCount > 3 ? ' — Ungewöhnlich viele aktive Benutzer' : ''}`,
            details: users.map(u => ({ name: u.Name, enabled: u.Enabled === true || u.Enabled === 'True', lastLogon: u.LastLogon || '' })),
        };
    } catch (err) {
        log.error('User-Check fehlgeschlagen:', err.message);
        return { id: 'users', label: 'Lokale Benutzerkonten', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

async function _checkDefenderSignatures() {
    try {
        const psScript = `
            try {
                $mp = Get-MpComputerStatus -ErrorAction Stop
                [PSCustomObject]@{
                    sigLastUpdate = if ($mp.AntivirusSignatureLastUpdated) { $mp.AntivirusSignatureLastUpdated.ToString('o') } else { '' }
                    sigAge = if ($mp.AntivirusSignatureLastUpdated) { [math]::Round(((Get-Date) - $mp.AntivirusSignatureLastUpdated).TotalDays, 1) } else { -1 }
                    defVersion = [string]$mp.AntivirusSignatureVersion
                } | ConvertTo-Json -Compress
            } catch {
                Write-Output '{"sigAge":-1}'
            }
        `.trim();
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        const data = JSON.parse(stdout.trim());

        if (data.sigAge < 0) {
            return { id: 'signatures', label: 'Defender-Signaturen', status: 'warning', message: 'Signaturstatus nicht ermittelbar', details: data };
        }

        const old = data.sigAge > 7;
        return {
            id: 'signatures',
            label: 'Defender-Signaturen',
            status: old ? 'warning' : 'ok',
            message: old
                ? `Signaturen sind ${Math.round(data.sigAge)} Tage alt — Update empfohlen`
                : `Signaturen aktuell (Version ${data.defVersion || '?'}, ${Math.round(data.sigAge)} Tage alt)`,
            details: data,
        };
    } catch (err) {
        log.error('Signatur-Check fehlgeschlagen:', err.message);
        return { id: 'signatures', label: 'Defender-Signaturen', status: 'error', message: 'Prüfung fehlgeschlagen: ' + err.message, details: null };
    }
}

// ---------------------------------------------------------------------------
// Haupt-Audit-Funktion
// ---------------------------------------------------------------------------

async function runSecurityAudit() {
    const checks = [];

    // Sequentiell ausführen (nicht parallel — PowerShell-Prozesse hungern sich aus)
    checks.push(await _checkFirewall());
    checks.push(await _checkAntivirus());
    checks.push(await _checkBitLocker());
    checks.push(await _checkUAC());
    checks.push(await _checkUptime());
    checks.push(await _checkLocalUsers());
    checks.push(await _checkDefenderSignatures());

    const timestamp = new Date().toISOString();
    const result = { timestamp, checks };

    // Historisierung
    const diff = _saveAndCompare(result);

    return { ...result, diff };
}

// ---------------------------------------------------------------------------
// Historie: Speichern, Laden, Vergleichen
// ---------------------------------------------------------------------------

function _loadHistory() {
    try {
        const filePath = _getHistoryPath();
        if (!fs.existsSync(filePath)) return [];
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function _saveAndCompare(result) {
    const history = _loadHistory();
    const lastScan = history.length > 0 ? history[history.length - 1] : null;

    // Vergleich mit letztem Scan
    const diff = [];
    if (lastScan) {
        const prevChecks = {};
        for (const c of lastScan.checks) prevChecks[c.id] = c;

        for (const c of result.checks) {
            const prev = prevChecks[c.id];
            if (prev && prev.status !== c.status) {
                const improved = _statusRank(c.status) < _statusRank(prev.status);
                diff.push({
                    id: c.id,
                    label: c.label,
                    oldStatus: prev.status,
                    newStatus: c.status,
                    oldMessage: prev.message,
                    newMessage: c.message,
                    improved,
                });
            }
        }
    }

    // Neuen Scan zur Historie hinzufügen
    history.push({ timestamp: result.timestamp, checks: result.checks });

    // Max 50 Einträge behalten
    while (history.length > MAX_HISTORY) history.shift();

    try {
        const filePath = _getHistoryPath();
        fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
        log.error('Audit-Historie konnte nicht gespeichert werden:', err.message);
    }

    return diff;
}

function _statusRank(status) {
    switch (status) {
        case 'ok': return 0;
        case 'warning': return 1;
        case 'danger': return 2;
        case 'error': return 3;
        default: return 4;
    }
}

function getAuditHistory() {
    return _loadHistory();
}

/**
 * Berechnet den Security-Score (0-100) aus den Audit-Checks.
 * Wird vom System-Score-Modul aufgerufen.
 */
function calculateSecurityScore(checks) {
    if (!checks || checks.length === 0) return { score: -1, available: false };

    let score = 100;

    for (const c of checks) {
        switch (c.id) {
            case 'firewall':
                if (c.status === 'danger') score -= 20;
                else if (c.status === 'warning') score -= 10;
                break;
            case 'antivirus':
                if (c.status === 'danger') score -= 30;
                else if (c.status === 'warning') score -= 10;
                break;
            case 'bitlocker':
                if (c.status === 'danger') score -= 10;
                else if (c.status === 'warning') score -= 5;
                break;
            case 'uac':
                if (c.status === 'danger') score -= 15;
                else if (c.status === 'warning') score -= 5;
                break;
            case 'uptime':
                if (c.status === 'warning') score -= 5;
                break;
            case 'signatures':
                if (c.status === 'warning') score -= 10;
                else if (c.status === 'danger') score -= 10;
                break;
        }
    }

    return { score: Math.max(0, score), available: true };
}

module.exports = { runSecurityAudit, getAuditHistory, calculateSecurityScore };

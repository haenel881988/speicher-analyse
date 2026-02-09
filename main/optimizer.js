'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const execFileAsync = promisify(execFile);

async function getOptimizationRecommendations() {
    const recommendations = [];

    try {
        const [diskInfo, ramInfo, hibernateStatus, visualEffects, powerPlan] = await Promise.allSettled([
            getDiskType(),
            getRamInfo(),
            getHibernateStatus(),
            getVisualEffectsStatus(),
            getPowerPlan(),
        ]);

        const isSSD = diskInfo.status === 'fulfilled' && diskInfo.value.isSSD;
        const totalRam = ramInfo.status === 'fulfilled' ? ramInfo.value.totalGB : 0;
        const hibernateOn = hibernateStatus.status === 'fulfilled' && hibernateStatus.value;
        const currentPlan = powerPlan.status === 'fulfilled' ? powerPlan.value : null;

        // C1: Hardware-basierte Empfehlungen
        if (isSSD && hibernateOn) {
            recommendations.push({
                id: 'hibernate-off',
                category: 'hardware',
                title: 'Ruhezustand deaktivieren (SSD)',
                description: `Hibernate schreibt den gesamten RAM (${totalRam} GB) auf die SSD. Bei SSDs ist dies unnötig, da der Aufwachvorgang bereits schnell ist. Spart ${totalRam} GB Speicherplatz.`,
                impact: 'high',
                savingsBytes: totalRam * 1024 * 1024 * 1024,
                command: 'powercfg -h off',
                reversible: true,
                reverseCommand: 'powercfg -h on',
            });
        }

        if (isSSD) {
            recommendations.push({
                id: 'disable-indexing',
                category: 'hardware',
                title: 'Windows-Indexierung auf SSD einschränken',
                description: 'Die Windows-Suchindexierung verursacht unnötige Schreibvorgänge auf der SSD. Bei SSDs ist die Suche auch ohne Index schnell genug.',
                impact: 'medium',
                command: null, // Manuell in Systemsteuerung
                manualSteps: 'Systemsteuerung → Indizierungsoptionen → Ändern → SSD-Laufwerk abwählen',
            });
        }

        // C2: Datenschutz & Telemetrie
        recommendations.push({
            id: 'disable-telemetry',
            category: 'privacy',
            title: 'Windows-Telemetrie reduzieren',
            description: 'Reduziert die Menge an Diagnosedaten, die an Microsoft gesendet werden. Verbessert die Privatsphäre.',
            impact: 'medium',
            command: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 1 /f',
            reversible: true,
            reverseCommand: 'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /f',
            requiresAdmin: true,
        });

        recommendations.push({
            id: 'disable-advertising-id',
            category: 'privacy',
            title: 'Werbe-ID deaktivieren',
            description: 'Verhindert, dass Apps eine eindeutige Werbe-ID für gezielte Werbung verwenden.',
            impact: 'low',
            command: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo" /v Enabled /t REG_DWORD /d 0 /f',
            reversible: true,
            reverseCommand: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo" /v Enabled /t REG_DWORD /d 1 /f',
        });

        recommendations.push({
            id: 'disable-activity-history',
            category: 'privacy',
            title: 'Aktivitätsverlauf deaktivieren',
            description: 'Verhindert, dass Windows den Aktivitätsverlauf sammelt und an Microsoft sendet.',
            impact: 'low',
            command: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v EnableActivityFeed /t REG_DWORD /d 0 /f',
            reversible: true,
            reverseCommand: 'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v EnableActivityFeed /f',
            requiresAdmin: true,
        });

        // C3: Leistungsoptimierungen
        if (currentPlan && !currentPlan.includes('Höchstleistung') && !currentPlan.includes('High performance')) {
            recommendations.push({
                id: 'high-performance',
                category: 'performance',
                title: 'Energiesparplan: Höchstleistung',
                description: `Aktueller Plan: "${currentPlan}". Für Desktop-PCs empfiehlt sich "Höchstleistung" für maximale Geschwindigkeit.`,
                impact: 'high',
                command: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
                reversible: true,
                reverseCommand: 'powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e',
            });
        }

        recommendations.push({
            id: 'disable-animations',
            category: 'performance',
            title: 'Visuelle Effekte reduzieren',
            description: 'Deaktiviert Animationen, Transparenz und Schatten für eine schnellere Benutzeroberfläche.',
            impact: 'medium',
            command: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
            reversible: true,
            reverseCommand: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 0 /f',
        });

        recommendations.push({
            id: 'clean-softdist',
            category: 'performance',
            title: 'Windows Update Cache bereinigen',
            description: 'Löscht den SoftwareDistribution-Ordner mit alten Update-Dateien. Kann mehrere GB freigeben.',
            impact: 'medium',
            savingsBytes: await getSoftwareDistributionSize(),
            command: null,
            manualSteps: 'Wird automatisch durchgeführt: Windows Update Dienst stoppen, Cache leeren, Dienst starten.',
            customAction: 'clean-update-cache',
        });

        // Sortiere nach Impact
        const impactOrder = { high: 0, medium: 1, low: 2 };
        recommendations.sort((a, b) => (impactOrder[a.impact] || 2) - (impactOrder[b.impact] || 2));

    } catch (err) {
        console.error('Optimizer scan error:', err);
    }

    return recommendations;
}

async function getDiskType() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            'Get-PhysicalDisk | Select-Object MediaType | ConvertTo-Json'
        ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
        const disks = JSON.parse(stdout);
        const list = Array.isArray(disks) ? disks : [disks];
        const isSSD = list.some(d => d.MediaType === 'SSD' || d.MediaType === 4);
        return { isSSD };
    } catch {
        return { isSSD: false };
    }
}

function getRamInfo() {
    const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    return Promise.resolve({ totalGB });
}

async function getHibernateStatus() {
    try {
        const { stdout } = await execFileAsync('powercfg', ['/a'], {
            encoding: 'utf8', timeout: 10000, windowsHide: true,
        });
        return stdout.toLowerCase().includes('hibernate') || stdout.toLowerCase().includes('ruhezustand');
    } catch {
        return false;
    }
}

async function getVisualEffectsStatus() {
    try {
        const { stdout } = await execFileAsync('reg', [
            'query', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
            '/v', 'VisualFXSetting'
        ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
        return stdout.includes('0x2') ? 'performance' : 'default';
    } catch {
        return 'default';
    }
}

async function getPowerPlan() {
    try {
        const { stdout } = await execFileAsync('powercfg', ['/getactivescheme'], {
            encoding: 'utf8', timeout: 5000, windowsHide: true,
        });
        const match = stdout.match(/\((.+)\)/);
        return match ? match[1] : 'Unbekannt';
    } catch {
        return null;
    }
}

async function getSoftwareDistributionSize() {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            '(Get-ChildItem "C:\\Windows\\SoftwareDistribution\\Download" -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum'
        ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
        return parseInt(stdout.trim()) || 0;
    } catch {
        return 0;
    }
}

async function applyOptimization(id) {
    const recs = await getOptimizationRecommendations();
    const rec = recs.find(r => r.id === id);
    if (!rec) throw new Error('Empfehlung nicht gefunden');

    // Custom actions
    if (rec.customAction === 'clean-update-cache') {
        return cleanUpdateCache();
    }

    if (!rec.command) {
        throw new Error('Diese Empfehlung muss manuell umgesetzt werden');
    }

    const parts = rec.command.split(' ');
    const exe = parts[0];
    const args = parts.slice(1);

    try {
        await execFileAsync(exe, args, {
            timeout: 30000, windowsHide: true, encoding: 'utf8',
        });
        return { success: true, id };
    } catch (err) {
        return { success: false, id, error: err.message };
    }
}

async function cleanUpdateCache() {
    try {
        await execFileAsync('net', ['stop', 'wuauserv'], { timeout: 30000, windowsHide: true });
    } catch { /* Dienst war eventuell schon gestoppt */ }

    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command',
            'Remove-Item "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -ErrorAction SilentlyContinue; "done"'
        ], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    } catch { /* Einige Dateien könnten gesperrt sein */ }

    try {
        await execFileAsync('net', ['start', 'wuauserv'], { timeout: 30000, windowsHide: true });
    } catch { /* Wird sich selbst starten */ }

    return { success: true, id: 'clean-update-cache' };
}

module.exports = { getOptimizationRecommendations, applyOptimization };

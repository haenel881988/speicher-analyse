'use strict';

const os = require('os');
const { runCmd, runPS, runSafe } = require('./cmd-utils');
const log = require('./logger').createLogger('optimizer');

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
                technicalDetail: `Befehl: powercfg -h off\nLöscht: C:\\hiberfil.sys (${totalRam} GB)\nRückgängig: powercfg -h on`,
            });
        }

        if (isSSD) {
            recommendations.push({
                id: 'disable-indexing',
                category: 'hardware',
                title: 'Windows-Indexierung auf SSD einschränken',
                description: 'Die Windows-Suchindexierung verursacht unnötige Schreibvorgänge auf der SSD. Bei SSDs ist die Suche auch ohne Index schnell genug.',
                impact: 'medium',
                command: null,
                manualSteps: 'Systemsteuerung \u2192 Indizierungsoptionen \u2192 Ändern \u2192 SSD-Laufwerk abwählen',
                technicalDetail: 'Manuell: Systemsteuerung > Indizierungsoptionen > Ändern\nSSD-Laufwerk aus der Indexierung entfernen\nDienst: Windows Search (WSearch)',
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
            technicalDetail: 'Registry: HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection\nWert: AllowTelemetry = 1 (REG_DWORD)\n0=Aus, 1=Basis, 2=Erweitert, 3=Voll\nSetzt auf "Basis" (Minimum für Windows 10/11 Home)',
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
            technicalDetail: 'Registry: HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo\nWert: Enabled = 0 (REG_DWORD)\n0=Deaktiviert, 1=Aktiviert\nBetrifft nur den aktuellen Benutzer (HKCU)',
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
            technicalDetail: 'Registry: HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System\nWert: EnableActivityFeed = 0 (REG_DWORD)\n0=Deaktiviert, 1=Aktiviert\nDeaktiviert Timeline/Aktivitätsverlauf systemweit',
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
                technicalDetail: `Befehl: powercfg /setactive 8c5e7fda-...\nAktuell: "${currentPlan}"\nNeu: "Höchstleistung" (GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c)\nRückgängig: powercfg /setactive 381b4222-... (Ausbalanciert)`,
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
            technicalDetail: 'Registry: HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects\nWert: VisualFXSetting = 2 (REG_DWORD)\n0=Optimale Darstellung, 1=Benutzerdefiniert, 2=Optimale Leistung\nDeaktiviert: Animationen, Fenstervorschau, Schattenwurf, Transparenz',
        });

        recommendations.push({
            id: 'sfc-scannow',
            category: 'performance',
            title: 'Systemdateien überprüfen (sfc /scannow)',
            description: 'Überprüft die Integrität aller geschützten Systemdateien und repariert beschädigte Dateien. Kann Systemstabilität und Performance verbessern.',
            impact: 'high',
            command: null,
            customAction: 'sfc-scannow',
            requiresAdmin: true,
            technicalDetail: 'Befehl: sfc /scannow\nPrüft: Alle geschützten Systemdateien in C:\\Windows\\\nReparatur: Automatisch aus WinSxS-Cache\nDauer: 5-15 Minuten\nLog: C:\\Windows\\Logs\\CBS\\CBS.log',
        });

        recommendations.push({
            id: 'dism-restore-health',
            category: 'performance',
            title: 'Windows-Image reparieren (DISM)',
            description: 'Repariert das Windows-Komponentenspeicher-Image. Sollte vor sfc /scannow ausgeführt werden, wenn Systemdateien beschädigt sind.',
            impact: 'high',
            command: null,
            customAction: 'dism-restore-health',
            requiresAdmin: true,
            technicalDetail: 'Befehl: DISM /Online /Cleanup-Image /RestoreHealth\nPrüft: Windows-Komponentenspeicher (WinSxS)\nReparatur: Download fehlender Dateien via Windows Update\nDauer: 10-30 Minuten\nLog: C:\\Windows\\Logs\\DISM\\dism.log',
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
            requiresAdmin: true,
            technicalDetail: 'Schritte:\n1. net stop wuauserv (Windows Update Dienst stoppen)\n2. Lösche C:\\Windows\\SoftwareDistribution\\Download\\*\n3. net start wuauserv (Dienst neu starten)\nWindows lädt fehlende Updates bei nächster Prüfung erneut herunter.',
        });

        // Sortiere nach Impact
        const impactOrder = { high: 0, medium: 1, low: 2 };
        recommendations.sort((a, b) => (impactOrder[a.impact] || 2) - (impactOrder[b.impact] || 2));

    } catch (err) {
        log.error('Optimizer scan error:', err);
    }

    return recommendations;
}

async function getDiskType() {
    try {
        const { stdout } = await runPS(
            'Get-PhysicalDisk | Select-Object MediaType | ConvertTo-Json',
            { timeout: 15000 }
        );
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
        const { stdout } = await runCmd('powercfg /a', { timeout: 10000 });
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
        const { stdout } = await runCmd('powercfg /getactivescheme', { timeout: 5000 });
        const match = stdout.match(/\((.+)\)/);
        return match ? match[1] : 'Unbekannt';
    } catch {
        return null;
    }
}

async function getSoftwareDistributionSize() {
    try {
        const { stdout } = await runPS(
            '(Get-ChildItem "C:\\Windows\\SoftwareDistribution\\Download" -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum',
            { timeout: 15000 }
        );
        return parseInt(stdout.trim()) || 0;
    } catch {
        return 0;
    }
}

async function isAdmin() {
    try {
        await runSafe('net', ['session'], { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function applyOptimization(id) {
    const recs = await getOptimizationRecommendations();
    const rec = recs.find(r => r.id === id);
    if (!rec) throw new Error('Empfehlung nicht gefunden');

    // Check admin rights for commands that require it
    if (rec.requiresAdmin) {
        const admin = await isAdmin();
        if (!admin) {
            return {
                success: false,
                id,
                error: 'Diese Optimierung erfordert Administratorrechte. Bitte starte die App als Administrator (Rechtsklick → "Als Administrator ausführen").',
            };
        }
    }

    // Custom actions
    if (rec.customAction === 'clean-update-cache') {
        return cleanUpdateCache();
    }
    if (rec.customAction === 'sfc-scannow') {
        return runLongCommand('sfc', ['/scannow'], 10 * 60 * 1000, 'sfc-scannow');
    }
    if (rec.customAction === 'dism-restore-health') {
        return runLongCommand('DISM', ['/Online', '/Cleanup-Image', '/RestoreHealth'], 15 * 60 * 1000, 'dism-restore-health');
    }

    if (!rec.command) {
        throw new Error('Diese Empfehlung muss manuell umgesetzt werden');
    }

    try {
        await runCmd(rec.command, { timeout: 30000 });
        return { success: true, id, detail: `${rec.title} wurde erfolgreich angewendet.` };
    } catch (err) {
        const msg = err.message.includes('Zugriff verweigert') || err.message.includes('Access is denied')
            || err.message.includes('Administratorrechte')
            ? 'Diese Optimierung erfordert Administratorrechte.'
            : err.message;
        return { success: false, id, error: msg, requiresAdmin: !!rec.requiresAdmin };
    }
}

async function runLongCommand(exe, args, timeout, id) {
    try {
        const cmd = [exe, ...args].join(' ');
        const { stdout, stderr } = await runCmd(cmd, { timeout });
        return { success: true, id, output: stdout || stderr || '' };
    } catch (err) {
        return { success: false, id, error: err.message };
    }
}

async function cleanUpdateCache() {
    try {
        await runCmd('net stop wuauserv', { timeout: 30000 });
    } catch { /* Dienst war eventuell schon gestoppt */ }

    try {
        await runPS(
            'Remove-Item "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -ErrorAction SilentlyContinue; "done"',
            { timeout: 60000 }
        );
    } catch { /* Einige Dateien könnten gesperrt sein */ }

    try {
        await runCmd('net start wuauserv', { timeout: 30000 });
    } catch { /* Wird sich selbst starten */ }

    return { success: true, id: 'clean-update-cache' };
}

module.exports = { getOptimizationRecommendations, applyOptimization };

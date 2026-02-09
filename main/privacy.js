'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const { runPS, runSafe } = require('./cmd-utils');

const execFileAsync = promisify(execFile);

const DEFAULT_OPTS = { encoding: 'utf8', windowsHide: true };

// ============================================================================
// Datenschutz-Einstellungen Datenbank
// ============================================================================

const PRIVACY_SETTINGS = [
    {
        id: 'telemetrie-policy',
        category: 'telemetrie',
        name: 'Telemetrie (Gruppenrichtlinie)',
        description: 'Sendet Diagnose- und Nutzungsdaten an Microsoft. Richtlinienebene.',
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
        registryKey: 'AllowTelemetry',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
    },
    {
        id: 'telemetrie-datacollection',
        category: 'telemetrie',
        name: 'Telemetrie (Datensammlung)',
        description: 'Steuert den Umfang der an Microsoft gesendeten Diagnosedaten.',
        registryPath: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection',
        registryKey: 'AllowTelemetry',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
    },
    {
        id: 'werbung-id',
        category: 'werbung',
        name: 'Werbe-ID',
        description: 'Ermoeglicht personalisierte Werbung anhand einer eindeutigen Geraete-ID.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
        registryKey: 'Enabled',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
    {
        id: 'standort-zugriff',
        category: 'standort',
        name: 'Standortzugriff',
        description: 'Erlaubt Apps den Zugriff auf Ihren Standort.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
        registryKey: 'Value',
        recommendedValue: 'Deny',
        valueType: 'REG_SZ',
        riskLevel: 'high',
    },
    {
        id: 'diagnose-toast',
        category: 'diagnose',
        name: 'Diagnose-Benachrichtigungen',
        description: 'Steuert die Anzeige von Diagnose-Benachrichtigungen.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack',
        registryKey: 'ShowedToastAtLevel',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
    {
        id: 'aktivitaet-feed',
        category: 'aktivitaet',
        name: 'Aktivitaetsverlauf',
        description: 'Erfasst Ihre Aktivitaeten (geoeffnete Apps, Dateien, Webseiten) und zeigt sie in der Zeitachse an.',
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
        registryKey: 'EnableActivityFeed',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
    },
    {
        id: 'aktivitaet-publish',
        category: 'aktivitaet',
        name: 'Aktivitaeten veroeffentlichen',
        description: 'Sendet Ihren Aktivitaetsverlauf an Microsoft-Server.',
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
        registryKey: 'PublishUserActivities',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
    },
    {
        id: 'wifi-sense',
        category: 'telemetrie',
        name: 'WiFi Sense',
        description: 'Automatische Verbindung mit vorgeschlagenen WLAN-Hotspots und Freigabe von Netzwerken.',
        registryPath: 'HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config',
        registryKey: 'AutoConnectAllowedOEM',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
    {
        id: 'cortana-consent',
        category: 'telemetrie',
        name: 'Cortana',
        description: 'Erlaubt Cortana, Sprach- und Suchdaten zu sammeln und zu verarbeiten.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search',
        registryKey: 'CortanaConsent',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
    {
        id: 'handschrift-daten',
        category: 'diagnose',
        name: 'Handschrift- und Eingabedaten',
        description: 'Sammelt Tipp- und Handschriftmuster zur Verbesserung der Spracherkennung.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\InputPersonalization',
        registryKey: 'RestrictImplicitTextCollection',
        recommendedValue: 1,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
    {
        id: 'app-diagnose',
        category: 'diagnose',
        name: 'App-Diagnosezugriff',
        description: 'Erlaubt Apps den Zugriff auf Diagnoseinformationen anderer Apps.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics',
        registryKey: 'Value',
        recommendedValue: 'Deny',
        valueType: 'REG_SZ',
        riskLevel: 'moderate',
    },
    {
        id: 'feedback-haeufigkeit',
        category: 'telemetrie',
        name: 'Feedback-Haeufigkeit',
        description: 'Bestimmt, wie oft Windows nach Feedback fragt.',
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules',
        registryKey: 'NumberOfSIUFInPeriod',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
    },
];

// Bekannte Telemetrie-Aufgaben (Namensteile)
const TELEMETRY_TASK_KEYWORDS = [
    'telemetry',
    'ceip',
    'consolidator',
    'kernelceiptask',
    'usbceip',
    'sqm',
    'aitagent',
    'programdataupdater',
    'proxy',
    'queuereporting',
];

// ============================================================================
// Registry-Hilfsfunktionen
// ============================================================================

/**
 * Liest einen einzelnen Registry-Wert aus.
 * Gibt null zurueck wenn der Schluessel/Wert nicht existiert.
 */
async function readRegistryValue(regPath, valueName) {
    try {
        const { stdout } = await execFileAsync('reg', [
            'query', regPath, '/v', valueName,
        ], { ...DEFAULT_OPTS, timeout: 10000 });

        // Ausgabe parsen: Zeile mit Wertname, Typ und Daten finden
        const lines = stdout.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Format: ValueName    REG_TYPE    Data
            const match = trimmed.match(/^\S+\s+(REG_\w+)\s+(.*)$/);
            if (match && trimmed.startsWith(valueName)) {
                const type = match[1];
                const rawData = match[2].trim();

                if (type === 'REG_DWORD') {
                    // REG_DWORD-Werte kommen als "0x00000000"
                    return parseInt(rawData, 16);
                }
                return rawData;
            }
        }
        return null;
    } catch {
        // Schluessel oder Wert existiert nicht
        return null;
    }
}

/**
 * Schreibt einen Registry-Wert.
 */
async function writeRegistryValue(regPath, valueName, value, valueType) {
    const args = [
        'add', regPath,
        '/v', valueName,
        '/t', valueType,
        '/d', String(value),
        '/f',
    ];

    const { stdout, stderr } = await execFileAsync('reg', args, {
        ...DEFAULT_OPTS, timeout: 10000,
    });

    return { stdout, stderr };
}

// ============================================================================
// Hauptfunktionen
// ============================================================================

/**
 * Liest alle Datenschutz-Einstellungen aus und gibt ihren aktuellen Status zurueck.
 * @returns {Promise<Array>} Array von Datenschutz-Einstellungsobjekten
 */
async function getPrivacySettings() {
    const results = await Promise.allSettled(
        PRIVACY_SETTINGS.map(async (setting) => {
            const currentValue = await readRegistryValue(
                setting.registryPath,
                setting.registryKey
            );

            const isPrivate = currentValue !== null &&
                String(currentValue) === String(setting.recommendedValue);

            return {
                id: setting.id,
                category: setting.category,
                name: setting.name,
                description: setting.description,
                registryPath: setting.registryPath,
                registryKey: setting.registryKey,
                registryValue: currentValue,
                recommendedValue: setting.recommendedValue,
                isPrivate,
                riskLevel: setting.riskLevel,
            };
        })
    );

    return results.map((result, idx) => {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        // Fallback bei Fehler: Einstellung als nicht-privat markieren
        const setting = PRIVACY_SETTINGS[idx];
        return {
            id: setting.id,
            category: setting.category,
            name: setting.name,
            description: setting.description,
            registryPath: setting.registryPath,
            registryKey: setting.registryKey,
            registryValue: null,
            recommendedValue: setting.recommendedValue,
            isPrivate: false,
            riskLevel: setting.riskLevel,
        };
    });
}

/**
 * Wendet die empfohlene Datenschutzeinstellung fuer eine bestimmte ID an.
 * @param {string} id - Die ID der Einstellung
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function applyPrivacySetting(id) {
    const setting = PRIVACY_SETTINGS.find(s => s.id === id);
    if (!setting) {
        return { success: false, error: `Einstellung mit ID "${id}" nicht gefunden.` };
    }

    try {
        await writeRegistryValue(
            setting.registryPath,
            setting.registryKey,
            setting.recommendedValue,
            setting.valueType
        );
        return { success: true };
    } catch (err) {
        const message = err.stderr || err.message || String(err);
        // HKLM-Schluessel benoetigen oft Administratorrechte
        if (setting.registryPath.startsWith('HKLM') && message.includes('Zugriff')) {
            return {
                success: false,
                error: `Administratorrechte erforderlich fuer: ${setting.name}`,
            };
        }
        return { success: false, error: message };
    }
}

/**
 * Wendet alle empfohlenen Datenschutzeinstellungen an.
 * @returns {Promise<{applied: number, failed: number, errors: string[]}>}
 */
async function applyAllPrivacy() {
    const results = {
        applied: 0,
        failed: 0,
        errors: [],
    };

    // Alle Einstellungen parallel anwenden
    const outcomes = await Promise.allSettled(
        PRIVACY_SETTINGS.map(setting => applyPrivacySetting(setting.id))
    );

    for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const setting = PRIVACY_SETTINGS[i];

        if (outcome.status === 'fulfilled' && outcome.value.success) {
            results.applied++;
        } else {
            results.failed++;
            const error = outcome.status === 'fulfilled'
                ? outcome.value.error
                : (outcome.reason?.message || String(outcome.reason));
            results.errors.push(`${setting.name}: ${error}`);
        }
    }

    return results;
}

/**
 * Berechnet einen Datenschutz-Score von 0 bis 100.
 * @param {Array} settings - Array von Datenschutz-Einstellungsobjekten
 * @returns {number} Score von 0 (kein Datenschutz) bis 100 (alles geschuetzt)
 */
function getPrivacyScore(settings) {
    if (!settings || settings.length === 0) return 0;

    const privateCount = settings.filter(s => s.isPrivate).length;
    return Math.round((privateCount / settings.length) * 100);
}

/**
 * Prueft geplante Aufgaben auf Telemetrie-Aufgaben.
 * @returns {Promise<Array>} Array von geplanten Aufgaben mit Telemetrie-Markierung
 */
async function getScheduledTasksAudit() {
    try {
        const psCommand = [
            'Get-ScheduledTask',
            '| Select-Object TaskName, TaskPath, State, Description',
            '| ConvertTo-Json -Compress',
        ].join(' ');

        const { stdout } = await runPS(psCommand, {
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
        });

        if (!stdout || !stdout.trim()) {
            return [];
        }

        const raw = JSON.parse(stdout);
        const tasks = Array.isArray(raw) ? raw : [raw];

        return tasks.map(task => {
            const name = task.TaskName || '';
            const taskPath = task.TaskPath || '';
            const fullPath = taskPath + name;

            // Status-Werte von PowerShell: 0=Disabled, 1=Queued, 2=Unknown, 3=Ready, 4=Running
            const stateMap = { 0: 'Deaktiviert', 1: 'In Warteschlange', 2: 'Unbekannt', 3: 'Bereit', 4: 'Wird ausgefuehrt' };
            const stateValue = typeof task.State === 'number' ? task.State : -1;

            const isTelemetry = TELEMETRY_TASK_KEYWORDS.some(keyword =>
                fullPath.toLowerCase().includes(keyword.toLowerCase())
            );

            return {
                name,
                path: taskPath,
                state: stateMap[stateValue] || String(task.State),
                description: task.Description || '',
                isTelemetry,
            };
        });
    } catch (err) {
        console.error('Fehler beim Lesen der geplanten Aufgaben:', err.message);
        return [];
    }
}

/**
 * Deaktiviert eine geplante Aufgabe.
 * @param {string} taskPath - Voller Pfad der Aufgabe (z.B. "\Microsoft\Windows\...")
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function disableScheduledTask(taskPath) {
    if (!taskPath || typeof taskPath !== 'string') {
        return { success: false, error: 'Kein Aufgabenpfad angegeben.' };
    }

    try {
        // Aufgabenname und Pfad trennen
        // taskPath kommt im Format "\Folder\TaskName" - wir brauchen TaskPath + TaskName separat
        const lastSlash = taskPath.lastIndexOf('\\');
        let folder, taskName;

        if (lastSlash > 0 && lastSlash < taskPath.length - 1) {
            // Format: "\Folder\TaskName" -> Pfad: "\Folder\" Name: "TaskName"
            folder = taskPath.substring(0, lastSlash + 1);
            taskName = taskPath.substring(lastSlash + 1);
        } else {
            // Gesamter Pfad ist der Name
            folder = '\\';
            taskName = taskPath.replace(/\\/g, '');
        }

        const escapedFolder = folder.replace(/'/g, "''");
        const escapedName = taskName.replace(/'/g, "''");

        const cmd = `Disable-ScheduledTask -TaskPath '${escapedFolder}' -TaskName '${escapedName}' -ErrorAction Stop | Out-Null`;

        await runPS(cmd, { timeout: 15000 });
        return { success: true };
    } catch (err) {
        const message = err.stderr || err.message || String(err);
        if (message.includes('Zugriff') || message.includes('Access')) {
            return {
                success: false,
                error: 'Administratorrechte erforderlich zum Deaktivieren dieser Aufgabe.',
            };
        }
        return { success: false, error: message };
    }
}

// ============================================================================
// Modul-Exporte
// ============================================================================

module.exports = {
    getPrivacySettings,
    applyPrivacySetting,
    applyAllPrivacy,
    getPrivacyScore,
    getScheduledTasksAudit,
    disableScheduledTask,
};

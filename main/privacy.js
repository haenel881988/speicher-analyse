'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const { runPS, runSafe } = require('./cmd-utils');

const execFileAsync = promisify(execFile);

const DEFAULT_OPTS = { encoding: 'utf8', windowsHide: true };

// ============================================================================
// Datenschutz-Einstellungen Datenbank
// ============================================================================
// tier: 'standard' = sicher, keine Nebeneffekte
// tier: 'advanced' = kann Systemverhalten beeinflussen, braucht Warnhinweis

const PRIVACY_SETTINGS = [
    // ── STANDARD-Einstellungen (sicher, nur Benutzer-Ebene) ─────────────
    {
        id: 'werbung-id',
        category: 'werbung',
        name: 'Werbe-ID',
        description: 'Ermöglicht personalisierte Werbung anhand einer eindeutigen Geräte-ID.',
        explanation: 'Windows vergibt deinem Gerät eine eindeutige Nummer, mit der Werbetreibende dich wiedererkennen können. Apps und Webseiten nutzen diese Nummer, um dir personalisierte Werbung zu zeigen.',
        impacts: [
            'Werbung in Apps wird weniger auf dich zugeschnitten',
            'Kostenlose Apps zeigen trotzdem Werbung, nur weniger passende',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
        registryKey: 'Enabled',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'cortana-consent',
        category: 'telemetrie',
        name: 'Cortana',
        description: 'Erlaubt Cortana, Sprach- und Suchdaten zu sammeln und zu verarbeiten.',
        explanation: 'Cortana hört auf deine Sprachbefehle und merkt sich deine Suchanfragen, um bessere Vorschläge zu machen. Dabei werden diese Daten an Microsoft gesendet.',
        impacts: [
            'Cortana-Sprachbefehle funktionieren nicht mehr',
            'Suchvorschläge in der Taskleiste werden weniger personalisiert',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search',
        registryKey: 'CortanaConsent',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'feedback-haeufigkeit',
        category: 'telemetrie',
        name: 'Feedback-Häufigkeit',
        description: 'Bestimmt, wie oft Windows nach Feedback fragt.',
        explanation: 'Windows fragt dich regelmäßig, ob du zufrieden bist und ob bestimmte Funktionen gut funktionieren. Die Antworten werden an Microsoft geschickt.',
        impacts: [
            'Keine Feedback-Popups mehr von Windows',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules',
        registryKey: 'NumberOfSIUFInPeriod',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'handschrift-daten',
        category: 'diagnose',
        name: 'Handschrift- und Eingabedaten',
        description: 'Sammelt Tipp- und Handschriftmuster zur Verbesserung der Spracherkennung.',
        explanation: 'Windows beobachtet, wie du tippst und schreibst, um die Rechtschreibprüfung und Wortvorschläge zu verbessern. Diese Muster werden an Microsoft gesendet.',
        impacts: [
            'Wortvorschläge beim Tippen werden weniger präzise',
            'Handschrifterkennung (Tablet/Stift) lernt nicht mehr dazu',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\InputPersonalization',
        registryKey: 'RestrictImplicitTextCollection',
        recommendedValue: 1,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'diagnose-toast',
        category: 'diagnose',
        name: 'Diagnose-Benachrichtigungen',
        description: 'Steuert die Anzeige von Diagnose-Benachrichtigungen.',
        explanation: 'Windows zeigt Benachrichtigungen über gesammelte Diagnosedaten an. Diese dienen nur der Information, senden aber selbst auch Daten.',
        impacts: [
            'Keine Diagnose-Benachrichtigungen mehr',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack',
        registryKey: 'ShowedToastAtLevel',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'app-diagnose',
        category: 'diagnose',
        name: 'App-Diagnosezugriff',
        description: 'Erlaubt Apps den Zugriff auf Diagnoseinformationen anderer Apps.',
        explanation: 'Wenn aktiviert, können installierte Apps sehen, welche anderen Apps du nutzt und wie sie sich verhalten. Das ist ein Sicherheitsrisiko.',
        impacts: [
            'Apps können keine Informationen über andere Apps mehr abfragen',
            'Einige Diagnose-Tools von Drittanbietern funktionieren eingeschränkt',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics',
        registryKey: 'Value',
        recommendedValue: 'Deny',
        valueType: 'REG_SZ',
        riskLevel: 'moderate',
        tier: 'standard',
    },
    {
        id: 'standort-zugriff',
        category: 'standort',
        name: 'Standortzugriff',
        description: 'Erlaubt Apps den Zugriff auf Ihren Standort.',
        explanation: 'Wenn aktiviert, können Apps erkennen wo du dich gerade befindest. Das wird für Navigation, Wetter und ortsbasierte Dienste genutzt.',
        impacts: [
            'Keine ortsbasierten Empfehlungen oder Navigation mehr',
            'Wetter-Apps zeigen kein lokales Wetter',
            'Find My Device funktioniert nicht mehr',
            'Zeitzone wird nicht mehr automatisch erkannt',
        ],
        registryPath: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
        registryKey: 'Value',
        recommendedValue: 'Deny',
        valueType: 'REG_SZ',
        riskLevel: 'moderate',
        tier: 'standard',
    },

    // ── ERWEITERTE Einstellungen (Systemebene, mögliche Nebeneffekte) ───
    {
        id: 'telemetrie-policy',
        category: 'telemetrie',
        name: 'Telemetrie (Gruppenrichtlinie)',
        description: 'Sendet Diagnose- und Nutzungsdaten an Microsoft. Richtlinienebene.',
        explanation: 'Windows sendet regelmäßig Informationen darüber, welche Apps du nutzt, wie lange und welche Fehler auftreten. Mit dieser Einstellung reduzierst du das auf das technisch notwendige Minimum.',
        impacts: [
            'Windows kann weniger gezielte Updates liefern',
            'Einige Kompatibilitätsprüfungen entfallen',
            'Microsoft erhält weniger Fehlerberichte von deinem System',
        ],
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
        registryKey: 'AllowTelemetry',
        recommendedValue: 1,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
        tier: 'advanced',
        warning: 'ACHTUNG: Auf Windows Pro/Home ist Level 0 (Sicherheit) nicht verfügbar und kann unerwünschte Nebeneffekte verursachen: "Von Organisation verwaltet"-Banner, blockierte App-Installationen (Sideloading), Probleme mit Windows-Updates. Empfohlen: Level 1 (Erforderlich).',
    },
    {
        id: 'telemetrie-datacollection',
        category: 'telemetrie',
        name: 'Telemetrie (Datensammlung)',
        description: 'Steuert den Umfang der an Microsoft gesendeten Diagnosedaten.',
        explanation: 'Wie die Gruppenrichtlinie oben, aber über einen anderen Registry-Pfad. Beide müssen gesetzt werden, damit die Telemetrie wirklich reduziert wird.',
        impacts: [
            'Gleiche Auswirkungen wie Telemetrie-Gruppenrichtlinie',
        ],
        registryPath: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection',
        registryKey: 'AllowTelemetry',
        recommendedValue: 1,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
        tier: 'advanced',
        warning: 'Gleiche Risiken wie Telemetrie-Gruppenrichtlinie. Auf Windows Pro/Home sollte dieser Wert nicht auf 0 gesetzt werden.',
    },
    {
        id: 'wifi-sense',
        category: 'telemetrie',
        name: 'WiFi Sense',
        description: 'Automatische Verbindung mit vorgeschlagenen WLAN-Hotspots und Freigabe von Netzwerken.',
        explanation: 'Windows verbindet sich automatisch mit WLANs, die Microsoft als sicher einstuft, und teilt dein WLAN-Passwort mit Kontakten. Das ist ein Sicherheitsrisiko.',
        impacts: [
            'Keine automatische Verbindung mit vorgeschlagenen Hotspots mehr',
            'WLAN-Passwörter werden nicht mehr mit Kontakten geteilt',
        ],
        registryPath: 'HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config',
        registryKey: 'AutoConnectAllowedOEM',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'moderate',
        tier: 'advanced',
        warning: 'Erfordert Administratorrechte. Deaktiviert automatische WLAN-Verbindungen.',
    },
    {
        id: 'aktivitaet-feed',
        category: 'aktivitaet',
        name: 'Aktivitätsverlauf',
        description: 'Erfasst Ihre Aktivitäten (geöffnete Apps, Dateien, Webseiten) und zeigt sie in der Zeitachse an.',
        explanation: 'Windows merkt sich alles was du tust: welche Programme du öffnest, welche Dateien du bearbeitest und welche Webseiten du besuchst. Diese Informationen werden in einer Zeitachse angezeigt.',
        impacts: [
            'Windows-Zeitachse (Timeline) in Alt+Tab wird leer',
            'Geräteübergreifende Aufgaben funktionieren nicht mehr',
            'Windows merkt sich nicht mehr, woran du zuletzt gearbeitet hast',
        ],
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
        registryKey: 'EnableActivityFeed',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
        tier: 'advanced',
        warning: 'Erfordert Administratorrechte. Deaktiviert die Windows-Zeitachse (Timeline) systemweit.',
    },
    {
        id: 'aktivitaet-publish',
        category: 'aktivitaet',
        name: 'Aktivitäten veröffentlichen',
        description: 'Sendet Ihren Aktivitätsverlauf an Microsoft-Server.',
        explanation: 'Dein Aktivitätsverlauf wird nicht nur lokal gespeichert, sondern auch an Microsoft-Server gesendet. So kann Microsoft nachvollziehen, was du auf deinem PC machst.',
        impacts: [
            'Aktivitäten werden nicht mehr mit Microsoft-Servern synchronisiert',
            'Auf anderen Geräten siehst du nicht mehr, woran du hier gearbeitet hast',
        ],
        registryPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
        registryKey: 'PublishUserActivities',
        recommendedValue: 0,
        valueType: 'REG_DWORD',
        riskLevel: 'high',
        tier: 'advanced',
        warning: 'Erfordert Administratorrechte. Verhindert die Synchronisation von Aktivitäten mit Microsoft-Servern.',
    },
];

// ============================================================================
// App-Permissions-Datenbank
// ============================================================================
// Zuordnung: App-Muster → benötigte Datenschutz-Berechtigungen
// patterns: Substrings die im App-Namen oder Publisher gesucht werden (case-insensitive)
// needs: Array von Privacy-Setting-IDs die diese App-Kategorie betreffen

const APP_PERMISSIONS = [
    // Navigation & Standort
    { patterns: ['google maps', 'google earth'], needs: ['standort-zugriff'], label: 'Navigation' },
    { patterns: ['uber', 'bolt', 'free now', 'freenow'], needs: ['standort-zugriff'], label: 'Fahrdienst' },
    { patterns: ['lieferando', 'just eat', 'delivery hero', 'wolt', 'doordash'], needs: ['standort-zugriff'], label: 'Lieferdienst' },
    { patterns: ['weather', 'wetter', 'accuweather', 'windy'], needs: ['standort-zugriff'], label: 'Wetter' },

    // Social Media & Dating (Standort + Werbung)
    { patterns: ['facebook', 'meta platforms'], needs: ['standort-zugriff', 'werbung-id'], label: 'Social Media' },
    { patterns: ['instagram'], needs: ['standort-zugriff', 'werbung-id'], label: 'Social Media' },
    { patterns: ['tiktok'], needs: ['werbung-id'], label: 'Social Media' },
    { patterns: ['twitter', 'x corp'], needs: ['werbung-id'], label: 'Social Media' },
    { patterns: ['snapchat'], needs: ['standort-zugriff', 'werbung-id'], label: 'Social Media' },
    { patterns: ['tinder', 'lovoo', 'bumble', 'badoo', 'grindr'], needs: ['standort-zugriff', 'werbung-id'], label: 'Dating' },

    // Kommunikation (Cortana + Diagnosedaten)
    { patterns: ['microsoft teams', 'teams'], needs: ['cortana-consent', 'app-diagnose'], label: 'Kommunikation' },
    { patterns: ['zoom'], needs: ['app-diagnose'], label: 'Kommunikation' },
    { patterns: ['discord'], needs: ['app-diagnose'], label: 'Kommunikation' },
    { patterns: ['skype'], needs: ['cortana-consent', 'app-diagnose'], label: 'Kommunikation' },
    { patterns: ['slack'], needs: ['app-diagnose'], label: 'Kommunikation' },

    // Browser (Telemetrie + Standort + Werbung)
    { patterns: ['google chrome', 'chromium'], needs: ['standort-zugriff', 'werbung-id'], label: 'Browser' },
    { patterns: ['mozilla firefox'], needs: ['standort-zugriff'], label: 'Browser' },
    { patterns: ['opera'], needs: ['standort-zugriff', 'werbung-id'], label: 'Browser' },
    { patterns: ['brave'], needs: ['standort-zugriff'], label: 'Browser' },

    // Gaming (Werbung + Telemetrie)
    { patterns: ['steam', 'valve'], needs: ['werbung-id'], label: 'Gaming' },
    { patterns: ['epic games'], needs: ['werbung-id'], label: 'Gaming' },
    { patterns: ['riot games', 'league of legends', 'valorant'], needs: ['werbung-id'], label: 'Gaming' },
    { patterns: ['ea app', 'electronic arts', 'origin'], needs: ['werbung-id', 'app-diagnose'], label: 'Gaming' },
    { patterns: ['ubisoft', 'uplay'], needs: ['werbung-id'], label: 'Gaming' },
    { patterns: ['xbox', 'game bar'], needs: ['werbung-id', 'aktivitaet-feed'], label: 'Gaming' },

    // Produktivität (Telemetrie + Aktivität)
    { patterns: ['microsoft office', 'microsoft 365', 'office 365'], needs: ['telemetrie-policy', 'aktivitaet-feed'], label: 'Office' },
    { patterns: ['visual studio', 'vs code', 'vscode'], needs: ['telemetrie-policy', 'app-diagnose'], label: 'Entwicklung' },
    { patterns: ['adobe', 'creative cloud'], needs: ['werbung-id', 'app-diagnose'], label: 'Kreativ-Software' },

    // Musik & Streaming (Werbung)
    { patterns: ['spotify'], needs: ['werbung-id'], label: 'Musik' },
    { patterns: ['amazon music', 'amazon prime'], needs: ['werbung-id'], label: 'Streaming' },
    { patterns: ['netflix'], needs: ['werbung-id'], label: 'Streaming' },
    { patterns: ['disney'], needs: ['werbung-id'], label: 'Streaming' },
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

        const lines = stdout.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            const match = trimmed.match(/^\S+\s+(REG_\w+)\s+(.*)$/);
            if (match && trimmed.startsWith(valueName)) {
                const type = match[1];
                const rawData = match[2].trim();

                if (type === 'REG_DWORD') {
                    return parseInt(rawData, 16);
                }
                return rawData;
            }
        }
        return null;
    } catch {
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
// Windows-Edition erkennen
// ============================================================================

let _cachedEdition = null;

/**
 * Erkennt die Windows-Edition (Pro, Enterprise, Home, etc.)
 * @returns {Promise<{edition: string, isEnterprise: boolean}>}
 */
async function getWindowsEdition() {
    if (_cachedEdition) return _cachedEdition;

    try {
        const { stdout } = await runPS(
            "(Get-CimInstance Win32_OperatingSystem).Caption",
            { timeout: 15000 }
        );
        const edition = (stdout || '').trim();
        const isEnterprise = /enterprise|education|server/i.test(edition);
        _cachedEdition = { edition, isEnterprise };
        return _cachedEdition;
    } catch {
        _cachedEdition = { edition: 'Unbekannt', isEnterprise: false };
        return _cachedEdition;
    }
}

// ============================================================================
// Sideloading-Prüfung
// ============================================================================

const SIDELOADING_PATH = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock';
const SIDELOADING_KEY = 'AllowAllTrustedApps';

/**
 * Prüft den Sideloading-Status des Systems.
 * @returns {Promise<{enabled: boolean, value: number|null}>}
 */
async function checkSideloading() {
    const value = await readRegistryValue(SIDELOADING_PATH, SIDELOADING_KEY);
    return {
        enabled: value === 1,
        value,
    };
}

/**
 * Repariert App-Sideloading (setzt AllowAllTrustedApps auf 1).
 * Gibt needsAdmin=true zurück wenn Admin-Rechte benötigt werden.
 * @returns {Promise<{success: boolean, needsAdmin?: boolean, error?: string}>}
 */
async function fixSideloading() {
    try {
        await writeRegistryValue(SIDELOADING_PATH, SIDELOADING_KEY, 1, 'REG_DWORD');
        return { success: true };
    } catch (err) {
        const message = err.stderr || err.message || String(err);
        if (message.includes('Zugriff') || message.includes('Access')) {
            return {
                success: false,
                needsAdmin: true,
                error: 'Administratorrechte erforderlich.',
            };
        }
        return { success: false, error: message };
    }
}

// ============================================================================
// Hauptfunktionen
// ============================================================================

/**
 * Liest alle Datenschutz-Einstellungen aus und gibt ihren aktuellen Status zurueck.
 * Enthält jetzt auch tier, warning und Windows-Edition-Info.
 * @returns {Promise<{settings: Array, edition: object, sideloading: object}>}
 */
async function getPrivacySettings() {
    const [settingsResults, edition, sideloading] = await Promise.all([
        Promise.allSettled(
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
                    explanation: setting.explanation || null,
                    impacts: setting.impacts || [],
                    registryPath: setting.registryPath,
                    registryKey: setting.registryKey,
                    registryValue: currentValue,
                    recommendedValue: setting.recommendedValue,
                    isPrivate,
                    riskLevel: setting.riskLevel,
                    tier: setting.tier,
                    warning: setting.warning || null,
                };
            })
        ),
        getWindowsEdition(),
        checkSideloading(),
    ]);

    const settings = settingsResults.map((result, idx) => {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        const setting = PRIVACY_SETTINGS[idx];
        return {
            id: setting.id,
            category: setting.category,
            name: setting.name,
            description: setting.description,
            explanation: setting.explanation || null,
            impacts: setting.impacts || [],
            registryPath: setting.registryPath,
            registryKey: setting.registryKey,
            registryValue: null,
            recommendedValue: setting.recommendedValue,
            isPrivate: false,
            riskLevel: setting.riskLevel,
            tier: setting.tier,
            warning: setting.warning || null,
        };
    });

    return { settings, edition, sideloading };
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
        if (setting.registryPath.startsWith('HKLM') && message.includes('Zugriff')) {
            return {
                success: false,
                error: `Administratorrechte erforderlich für: ${setting.name}`,
            };
        }
        return { success: false, error: message };
    }
}

/**
 * Wendet NUR Standard-Einstellungen an (keine erweiterten/gefährlichen).
 * @returns {Promise<{applied: number, failed: number, skipped: number, errors: string[]}>}
 */
async function applyAllPrivacy() {
    const results = {
        applied: 0,
        failed: 0,
        skipped: 0,
        errors: [],
    };

    // NUR Standard-Einstellungen anwenden, erweiterte überspringen
    const standardSettings = PRIVACY_SETTINGS.filter(s => s.tier === 'standard');
    const advancedCount = PRIVACY_SETTINGS.length - standardSettings.length;
    results.skipped = advancedCount;

    const outcomes = await Promise.allSettled(
        standardSettings.map(setting => applyPrivacySetting(setting.id))
    );

    for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const setting = standardSettings[i];

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
 */
function getPrivacyScore(settings) {
    if (!settings || settings.length === 0) return 0;
    const privateCount = settings.filter(s => s.isPrivate).length;
    return Math.round((privateCount / settings.length) * 100);
}

/**
 * Prueft geplante Aufgaben auf Telemetrie-Aufgaben.
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

            const stateMap = { 0: 'Deaktiviert', 1: 'In Warteschlange', 2: 'Unbekannt', 3: 'Bereit', 4: 'Wird ausgeführt' };
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
 */
async function disableScheduledTask(taskPath) {
    if (!taskPath || typeof taskPath !== 'string') {
        return { success: false, error: 'Kein Aufgabenpfad angegeben.' };
    }

    try {
        const lastSlash = taskPath.lastIndexOf('\\');
        let folder, taskName;

        if (lastSlash > 0 && lastSlash < taskPath.length - 1) {
            folder = taskPath.substring(0, lastSlash + 1);
            taskName = taskPath.substring(lastSlash + 1);
        } else {
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
// Intelligente, app-bewusste Datenschutz-Empfehlungen
// ============================================================================

/**
 * Korreliert installierte Apps mit Datenschutz-Einstellungen.
 * Gibt personalisierte Empfehlungen pro Einstellung zurück.
 * @param {Array} programs - Installierte Programme aus software-audit.js
 * @returns {Array<{settingId, recommendation, affectedApps, reason}>}
 */
function getSmartRecommendations(programs) {
    if (!programs || programs.length === 0) return [];

    // Für jede Privacy-Setting: welche installierten Apps sind betroffen?
    const settingApps = new Map(); // settingId → Set<{name, label}>

    for (const perm of APP_PERMISSIONS) {
        for (const program of programs) {
            const searchText = `${program.name || ''} ${program.publisher || ''}`.toLowerCase();
            const matched = perm.patterns.some(p => searchText.includes(p.toLowerCase()));
            if (!matched) continue;

            for (const settingId of perm.needs) {
                if (!settingApps.has(settingId)) settingApps.set(settingId, []);
                const list = settingApps.get(settingId);
                // Duplikate vermeiden (gleiche App kann über mehrere Patterns matchen)
                if (!list.some(a => a.name === program.name)) {
                    list.push({ name: program.name, label: perm.label });
                }
            }
        }
    }

    // Pro Einstellung: Empfehlung generieren
    return PRIVACY_SETTINGS.map(setting => {
        const apps = settingApps.get(setting.id) || [];
        const count = apps.length;

        let recommendation, reason, guidance;
        if (count === 0) {
            recommendation = 'safe';
            reason = 'Keine deiner installierten Apps benötigt diese Funktion.';
            guidance = 'Empfehlung: Deaktivieren für besseren Datenschutz.';
        } else if (count <= 2) {
            recommendation = 'caution';
            const names = apps.map(a => a.name).join(', ');
            reason = `${count} App${count > 1 ? 's' : ''} nutzt diese Funktion: ${names}`;
            guidance = 'Vorsicht: Diese Apps könnten eingeschränkt werden. Nur deaktivieren wenn du diese Apps nicht brauchst.';
        } else {
            recommendation = 'risky';
            const names = apps.slice(0, 3).map(a => a.name).join(', ');
            const more = count > 3 ? ` und ${count - 3} weitere` : '';
            reason = `${count} Apps benötigen diese Funktion aktiv: ${names}${more}`;
            guidance = 'Nicht empfohlen: Zu viele deiner Apps brauchen diese Funktion. Nur deaktivieren wenn du genau weisst was du tust.';
        }

        return {
            settingId: setting.id,
            recommendation, // 'safe' | 'caution' | 'risky'
            affectedApps: apps,
            reason,
            guidance,
        };
    });
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
    checkSideloading,
    fixSideloading,
    getWindowsEdition,
    getSmartRecommendations,
    PRIVACY_SETTINGS,
};

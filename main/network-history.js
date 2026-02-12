'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('./logger').createLogger('network-history');

const MAX_SNAPSHOTS = 200;

function _getHistoryPath() {
    return path.join(app.getPath('userData'), 'network-history.json');
}

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

function _saveHistory(history) {
    try {
        const filePath = _getHistoryPath();
        fs.writeFileSync(filePath, JSON.stringify(history), 'utf-8');
    } catch (err) {
        log.error('Netzwerk-Historie konnte nicht gespeichert werden:', err.message);
    }
}

/**
 * Speichert einen Netzwerk-Snapshot (kompakt: nur Metadaten pro Gruppe).
 * @param {Object} pollingData - Ergebnis von getPollingData() oder manuellem Refresh
 */
function saveSnapshot(pollingData) {
    if (!pollingData || !pollingData.summary) {
        return { success: false, error: 'Keine Daten zum Speichern' };
    }

    const snapshot = {
        timestamp: new Date().toISOString(),
        summary: {
            totalConnections: pollingData.summary.totalConnections || 0,
            establishedCount: pollingData.summary.establishedCount || 0,
            listeningCount: pollingData.summary.listeningCount || 0,
            uniqueRemoteIPs: pollingData.summary.uniqueRemoteIPs || 0,
        },
        groups: (pollingData.grouped || []).map(g => ({
            processName: g.processName,
            connectionCount: g.connectionCount,
            uniqueIPs: g.uniqueIPs || [],
            hasTrackers: !!g.hasTrackers,
            hasHighRisk: !!g.hasHighRisk,
            resolvedCompanies: g.resolvedCompanies || [],
        })),
    };

    const history = _loadHistory();
    history.push(snapshot);

    while (history.length > MAX_SNAPSHOTS) history.shift();

    _saveHistory(history);

    log.info(`Snapshot gespeichert: ${snapshot.summary.totalConnections} Verbindungen, ${snapshot.groups.length} Prozesse`);
    return { success: true, snapshotCount: history.length };
}

/**
 * Gibt die vollständige Snapshot-Historie zurück.
 */
function getHistory() {
    return _loadHistory();
}

/**
 * Löscht die gesamte Historie.
 */
function clearHistory() {
    _saveHistory([]);
    log.info('Netzwerk-Historie gelöscht');
    return { success: true };
}

/**
 * Exportiert die Historie als CSV oder JSON.
 * @param {'csv'|'json'} format
 */
function exportHistory(format = 'json') {
    const history = _loadHistory();

    if (format === 'csv') {
        const header = 'Zeitpunkt;Verbindungen;Aktiv;Lauschend;Remote-IPs;Prozesse;Tracker;Hochrisiko';
        const rows = history.map(s => {
            const trackerCount = s.groups.filter(g => g.hasTrackers).length;
            const highRiskCount = s.groups.filter(g => g.hasHighRisk).length;
            return [
                s.timestamp,
                s.summary.totalConnections,
                s.summary.establishedCount,
                s.summary.listeningCount,
                s.summary.uniqueRemoteIPs,
                s.groups.length,
                trackerCount,
                highRiskCount,
            ].join(';');
        });
        return header + '\n' + rows.join('\n');
    }

    return JSON.stringify(history, null, 2);
}

/**
 * Vergleicht zwei Snapshots und gibt die Unterschiede zurück.
 * @param {Object} current - Aktueller Snapshot
 * @param {Object} previous - Vorheriger Snapshot
 */
function diffSnapshots(current, previous) {
    if (!current || !previous) return null;

    const prevProcesses = new Set(previous.groups.map(g => g.processName));
    const currProcesses = new Set(current.groups.map(g => g.processName));

    const newProcesses = current.groups.filter(g => !prevProcesses.has(g.processName));
    const removedProcesses = previous.groups.filter(g => !currProcesses.has(g.processName));

    const prevIPs = new Set(previous.groups.flatMap(g => g.uniqueIPs));
    const currIPs = new Set(current.groups.flatMap(g => g.uniqueIPs));

    const newIPs = [...currIPs].filter(ip => !prevIPs.has(ip));
    const removedIPs = [...prevIPs].filter(ip => !currIPs.has(ip));

    return {
        newProcesses: newProcesses.map(g => g.processName),
        removedProcesses: removedProcesses.map(g => g.processName),
        newIPs,
        removedIPs,
        connectionDelta: current.summary.totalConnections - previous.summary.totalConnections,
    };
}

module.exports = { saveSnapshot, getHistory, clearHistory, exportHistory, diffSnapshots };

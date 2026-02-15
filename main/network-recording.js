'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('./logger').createLogger('network-recording');

const RECORDINGS_DIR = path.join(
    process.env.APPDATA || app.getPath('userData'),
    'speicher-analyse',
    'netzwerk-aufzeichnungen'
);

// Aktive Aufzeichnung
let _activeRecording = null;

/**
 * Stellt sicher dass das Aufzeichnungsverzeichnis existiert.
 */
function ensureDir() {
    if (!fs.existsSync(RECORDINGS_DIR)) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
}

/**
 * Startet eine neue Aufzeichnung.
 * Erstellt eine JSONL-Datei im Aufzeichnungsverzeichnis.
 */
function startRecording() {
    if (_activeRecording) {
        return { success: false, error: 'Eine Aufzeichnung läuft bereits.' };
    }

    ensureDir();

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `aufzeichnung-${timestamp}.jsonl`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    // Header-Zeile mit Metadaten
    const header = JSON.stringify({
        type: 'header',
        startedAt: now.toISOString(),
        version: 1,
    });
    fs.writeFileSync(filepath, header + '\n', 'utf-8');

    _activeRecording = {
        filename,
        filepath,
        startedAt: now,
        eventCount: 0,
        stream: fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' }),
    };

    log.info(`Aufzeichnung gestartet: ${filename}`);
    return {
        success: true,
        filename,
        startedAt: now.toISOString(),
    };
}

/**
 * Hängt Events an die laufende Aufzeichnung an.
 * @param {Array} events - Array von Connection-Diff-Events
 */
function appendEvents(events) {
    if (!_activeRecording) return { success: false, error: 'Keine aktive Aufzeichnung.' };
    if (!events || events.length === 0) return { success: true, appended: 0 };

    for (const event of events) {
        _activeRecording.stream.write(JSON.stringify(event) + '\n');
        _activeRecording.eventCount++;
    }

    return { success: true, appended: events.length, total: _activeRecording.eventCount };
}

/**
 * Stoppt die laufende Aufzeichnung.
 */
function stopRecording() {
    if (!_activeRecording) {
        return { success: false, error: 'Keine aktive Aufzeichnung.' };
    }

    const now = new Date();
    const duration = Math.round((now - _activeRecording.startedAt) / 1000);

    // Footer-Zeile mit Zusammenfassung
    const footer = JSON.stringify({
        type: 'footer',
        stoppedAt: now.toISOString(),
        durationSeconds: duration,
        eventCount: _activeRecording.eventCount,
    });
    _activeRecording.stream.write(footer + '\n');
    _activeRecording.stream.end();

    const result = {
        success: true,
        filename: _activeRecording.filename,
        durationSeconds: duration,
        eventCount: _activeRecording.eventCount,
    };

    log.info(`Aufzeichnung gestoppt: ${_activeRecording.filename} — ${_activeRecording.eventCount} Events, ${duration}s`);
    _activeRecording = null;
    return result;
}

/**
 * Gibt den Status der aktuellen Aufzeichnung zurück.
 */
function getRecordingStatus() {
    if (!_activeRecording) {
        return { active: false };
    }
    const elapsed = Math.round((Date.now() - _activeRecording.startedAt.getTime()) / 1000);
    return {
        active: true,
        filename: _activeRecording.filename,
        startedAt: _activeRecording.startedAt.toISOString(),
        eventCount: _activeRecording.eventCount,
        elapsedSeconds: elapsed,
    };
}

/**
 * Listet alle gespeicherten Aufzeichnungen auf.
 */
function listRecordings() {
    ensureDir();

    try {
        const files = fs.readdirSync(RECORDINGS_DIR)
            .filter(f => f.endsWith('.jsonl'))
            .sort()
            .reverse(); // Neueste zuerst

        return files.map(filename => {
            const filepath = path.join(RECORDINGS_DIR, filename);
            const stat = fs.statSync(filepath);

            // Schnell Header + Footer lesen für Metadaten
            let header = null, footer = null, eventCount = 0;
            try {
                const content = fs.readFileSync(filepath, 'utf-8');
                const lines = content.trim().split('\n');
                if (lines.length > 0) {
                    const first = JSON.parse(lines[0]);
                    if (first.type === 'header') header = first;
                }
                if (lines.length > 1) {
                    const last = JSON.parse(lines[lines.length - 1]);
                    if (last.type === 'footer') {
                        footer = last;
                        eventCount = last.eventCount || 0;
                    } else {
                        // Keine Footer-Zeile → Events zählen
                        eventCount = lines.filter(l => {
                            try { const p = JSON.parse(l); return p.type !== 'header'; } catch { return false; }
                        }).length;
                    }
                }
            } catch { /* ignorieren */ }

            return {
                filename,
                sizeBytes: stat.size,
                startedAt: header?.startedAt || null,
                stoppedAt: footer?.stoppedAt || null,
                durationSeconds: footer?.durationSeconds || null,
                eventCount,
                isActive: _activeRecording?.filename === filename,
            };
        });
    } catch (err) {
        log.error('Aufzeichnungen auflisten fehlgeschlagen:', err.message);
        return [];
    }
}

/**
 * Löscht eine einzelne Aufzeichnung.
 */
function deleteRecording(filename) {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return { success: false, error: 'Ungültiger Dateiname.' };
    }
    if (_activeRecording && _activeRecording.filename === filename) {
        return { success: false, error: 'Aktive Aufzeichnung kann nicht gelöscht werden.' };
    }

    const filepath = path.join(RECORDINGS_DIR, filename);
    if (!fs.existsSync(filepath)) {
        return { success: false, error: 'Datei nicht gefunden.' };
    }

    try {
        fs.unlinkSync(filepath);
        log.info(`Aufzeichnung gelöscht: ${filename}`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Gibt den Pfad zum Aufzeichnungsverzeichnis zurück.
 */
function getRecordingsDir() {
    ensureDir();
    return RECORDINGS_DIR;
}

module.exports = {
    startRecording,
    appendEvents,
    stopRecording,
    getRecordingStatus,
    listRecordings,
    deleteRecording,
    getRecordingsDir,
};

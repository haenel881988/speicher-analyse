'use strict';

const { runPS } = require('./cmd-utils');

/**
 * S.M.A.R.T. Festplattengesundheit - Windows-Modul
 *
 * Liest S.M.A.R.T.-Daten physischer Datentraeger ueber PowerShell
 * (Get-PhysicalDisk, Get-StorageReliabilityCounter, Get-Disk).
 */

// ---------------------------------------------------------------------------
//  Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Normalisiert den Medientyp auf einen einheitlichen String.
 */
function normalizeMediaType(raw, busType) {
    if (!raw) return 'Unknown';
    const upper = String(raw).toUpperCase();
    if (upper === 'SSD' || upper === '4') return 'SSD';
    if (upper === 'HDD' || upper === '3') return 'HDD';
    if (upper.includes('NVME') || upper === 'NVME') return 'NVMe';
    // Fallback: NVMe bus with unspecified media => NVMe
    if (busType && String(busType).toUpperCase() === 'NVME') return 'NVMe';
    // PowerShell may return numeric enum: 0=Unspecified, 3=HDD, 4=SSD
    if (upper === '0' || upper === 'UNSPECIFIED') return 'Unknown';
    return String(raw);
}

/**
 * Normalisiert den Gesundheitsstatus.
 */
function normalizeHealthStatus(raw) {
    if (!raw) return 'Unknown';
    const s = String(raw);
    // PowerShell returns numeric enum sometimes: 0=Healthy, 1=Warning, etc.
    if (s === '0' || /healthy/i.test(s)) return 'Healthy';
    if (s === '1' || /warning/i.test(s)) return 'Warning';
    if (s === '2' || /unhealthy/i.test(s)) return 'Unhealthy';
    return s;
}

/**
 * Sicheres Parsen einer PowerShell-JSON-Ausgabe.
 * Gibt immer ein Array zurueck.
 */
function parseJsonArray(stdout) {
    const text = (stdout || '').trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}

/**
 * Sicheres Parsen einer Zahl. Gibt null zurueck bei ungueltigem Wert.
 */
function safeNum(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
//  Bewertung
// ---------------------------------------------------------------------------

/**
 * Berechnet einen Gesundheitswert (0-100) fuer einen Datentraeger.
 *
 * Bewertungslogik:
 *   - Start bei 100
 *   - Gesundheitsstatus nicht 'Healthy': -50
 *   - Temperatur > 50 C: -20, > 60 C: -40
 *   - SSD-Verschleiss > 80 %: -30, > 90 %: -50
 *   - Lesefehler: -10 pro 100 Fehler (max -30)
 *   - Schreibfehler: -10 pro 100 Fehler (max -30)
 *   - Betriebsstunden > 35 000: -10, > 50 000: -20
 *   - Minimum: 0
 */
function calculateDiskScore(disk) {
    let score = 100;

    // Gesundheitsstatus
    if (disk.healthStatus !== 'Healthy') {
        score -= 50;
    }

    // Temperatur
    if (disk.temperature !== null && disk.temperature > 60) {
        score -= 40;
    } else if (disk.temperature !== null && disk.temperature > 50) {
        score -= 20;
    }

    // SSD-Verschleiss
    if (disk.wearLevel !== null && disk.wearLevel > 90) {
        score -= 50;
    } else if (disk.wearLevel !== null && disk.wearLevel > 80) {
        score -= 30;
    }

    // Lesefehler
    if (disk.readErrors > 0) {
        const penalty = Math.min(Math.floor(disk.readErrors / 100) * 10, 30);
        score -= penalty;
    }

    // Schreibfehler
    if (disk.writeErrors > 0) {
        const penalty = Math.min(Math.floor(disk.writeErrors / 100) * 10, 30);
        score -= penalty;
    }

    // Betriebsstunden
    if (disk.powerOnHours !== null && disk.powerOnHours > 50000) {
        score -= 20;
    } else if (disk.powerOnHours !== null && disk.powerOnHours > 35000) {
        score -= 10;
    }

    return Math.max(score, 0);
}

/**
 * Bestimmt die Risikostufe anhand des Gesundheitswerts.
 *
 * @param {number} score - Gesundheitswert 0-100
 * @returns {'safe'|'moderate'|'high'}
 */
function getRiskLevel(score) {
    if (score >= 70) return 'safe';
    if (score >= 40) return 'moderate';
    return 'high';
}

// ---------------------------------------------------------------------------
//  Daten abrufen
// ---------------------------------------------------------------------------

/**
 * Liest S.M.A.R.T.-Gesundheitsdaten aller physischen Datentraeger.
 *
 * Verwendet drei PowerShell-Abfragen:
 *   1. Get-PhysicalDisk  (Grunddaten)
 *   2. Get-StorageReliabilityCounter (Zuverlaessigkeitswerte je Disk)
 *   3. Get-Disk (Partitionsinformationen)
 *
 * @returns {Promise<Array>} Array von Datentraeger-Objekten
 */
async function getDiskHealth() {
    // --- 1) Physische Datentraeger -------------------------------------------
    let physicalDisks = [];
    try {
        const { stdout } = await runPS(
            'Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, Size, HealthStatus, OperationalStatus, BusType, SerialNumber, FirmwareRevision, Model | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        physicalDisks = parseJsonArray(stdout);
    } catch (err) {
        console.error('[smart] Fehler beim Lesen der physischen Datentraeger:', err.message || err);
        return [];
    }

    if (physicalDisks.length === 0) return [];

    // --- 2) Zuverlaessigkeitszaehler ----------------------------------------
    // Einzelabfrage je Datentraeger, da Get-StorageReliabilityCounter
    // ueber Pipeline mit Get-PhysicalDisk verknuepft werden muss.
    const reliabilityMap = new Map();
    try {
        const { stdout } = await runPS(
            'Get-PhysicalDisk | Get-StorageReliabilityCounter | Select-Object DeviceId, Temperature, ReadErrorsTotal, WriteErrorsTotal, Wear, PowerOnHours | ConvertTo-Json -Compress',
            { timeout: 20000 }
        );
        const counters = parseJsonArray(stdout);
        for (const c of counters) {
            if (c.DeviceId !== undefined && c.DeviceId !== null) {
                reliabilityMap.set(String(c.DeviceId), c);
            }
        }
    } catch (err) {
        // Nicht alle Systeme unterstuetzen StorageReliabilityCounter
        console.warn('[smart] Zuverlaessigkeitszaehler nicht verfuegbar:', err.message || err);
    }

    // --- 3) Disk-Info (Partitionen) -----------------------------------------
    const diskInfoMap = new Map();
    try {
        const { stdout } = await runPS(
            'Get-Disk | Select-Object Number, PartitionStyle, NumberOfPartitions | ConvertTo-Json -Compress',
            { timeout: 10000 }
        );
        const disks = parseJsonArray(stdout);
        for (const d of disks) {
            if (d.Number !== undefined && d.Number !== null) {
                diskInfoMap.set(String(d.Number), d);
            }
        }
    } catch (err) {
        console.warn('[smart] Disk-Info nicht verfuegbar:', err.message || err);
    }

    // --- Zusammenfuehren -----------------------------------------------------
    const results = [];

    for (const pd of physicalDisks) {
        const deviceId = String(pd.DeviceId ?? '');
        const reliability = reliabilityMap.get(deviceId) || {};
        const diskInfo = diskInfoMap.get(deviceId) || {};

        const healthStatus = normalizeHealthStatus(pd.HealthStatus);
        const mediaType = normalizeMediaType(pd.MediaType, pd.BusType);

        const temperature = safeNum(reliability.Temperature);
        const powerOnHours = safeNum(reliability.PowerOnHours);
        const readErrors = safeNum(reliability.ReadErrorsTotal) ?? 0;
        const writeErrors = safeNum(reliability.WriteErrorsTotal) ?? 0;
        const wearLevel = safeNum(reliability.Wear);

        const partitionStyleRaw = diskInfo.PartitionStyle;
        let partitionStyle = 'Unknown';
        if (partitionStyleRaw !== undefined && partitionStyleRaw !== null) {
            // PowerShell may return numeric enum: 1=MBR, 2=GPT, 0=RAW
            const psMap = { 0: 'RAW', 1: 'MBR', 2: 'GPT' };
            partitionStyle = psMap[partitionStyleRaw] || String(partitionStyleRaw);
        }

        const disk = {
            name: pd.FriendlyName || 'Unbekannter Datentraeger',
            model: pd.Model || '',
            serial: (pd.SerialNumber || '').trim(),
            firmware: pd.FirmwareRevision || '',
            mediaType,
            busType: pd.BusType ? String(pd.BusType) : 'Unknown',
            sizeBytes: safeNum(pd.Size) ?? 0,
            healthStatus,
            operationalStatus: pd.OperationalStatus ? String(pd.OperationalStatus) : 'Unknown',
            temperature,
            powerOnHours,
            readErrors,
            writeErrors,
            wearLevel,
            partitionStyle,
            partitions: safeNum(diskInfo.NumberOfPartitions) ?? 0,
            healthScore: 0,
            riskLevel: 'high',
        };

        disk.healthScore = calculateDiskScore(disk);
        disk.riskLevel = getRiskLevel(disk.healthScore);

        results.push(disk);
    }

    return results;
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = {
    getDiskHealth,
    calculateDiskScore,
    getRiskLevel,
};

'use strict';

/**
 * SNMP v2c Scanner — Fragt Geräte nach Modellname, Firmware und Standort.
 *
 * Nutzt Community String "public" (Standard bei den meisten Netzwerkgeräten).
 * Nur für Geräte die antworten — kein Sicherheitsrisiko (read-only, lokales Netz).
 */

const snmp = require('net-snmp');
const log = require('./logger').createLogger('snmp-scanner');

// Standard MIB-II OIDs
const OID_SYS_DESCR    = '1.3.6.1.2.1.1.1.0';  // Modell + Firmware (Freitext)
const OID_SYS_NAME     = '1.3.6.1.2.1.1.5.0';  // Gerätename (konfigurierbar)
const OID_SYS_LOCATION = '1.3.6.1.2.1.1.6.0';  // Standort (konfigurierbar)
const OID_SYS_OBJECTID = '1.3.6.1.2.1.1.2.0';  // Enterprise OID (Hersteller-ID)
const OID_SYS_CONTACT  = '1.3.6.1.2.1.1.4.0';  // Kontaktperson

const QUERY_OIDS = [OID_SYS_DESCR, OID_SYS_NAME, OID_SYS_LOCATION, OID_SYS_OBJECTID, OID_SYS_CONTACT];

const SNMP_TIMEOUT = 3000;  // 3s pro Gerät
const SNMP_RETRIES = 0;     // Kein Retry (schneller Scan)
const PARALLEL_LIMIT = 5;   // Max gleichzeitige SNMP-Sessions

/**
 * Fragt ein einzelnes Gerät per SNMP v2c ab.
 * @param {string} ip - IPv4-Adresse
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object|null>} SNMP-Daten oder null wenn keine Antwort
 */
function querySNMP(ip, timeout = SNMP_TIMEOUT) {
    return new Promise((resolve) => {
        const session = snmp.createSession(ip, 'public', {
            timeout: timeout,
            retries: SNMP_RETRIES,
            version: snmp.Version2c,
        });

        const timer = setTimeout(() => {
            session.close();
            resolve(null);
        }, timeout + 500);

        session.get(QUERY_OIDS, (error, varbinds) => {
            clearTimeout(timer);
            session.close();

            if (error) {
                log.debug(`SNMP ${ip}: ${error.message || error}`);
                resolve(null);
                return;
            }

            const result = {};
            for (const vb of varbinds) {
                if (snmp.isVarbindError(vb)) continue;

                const val = (Buffer.isBuffer(vb.value) ? vb.value.toString('utf8') : String(vb.value)).trim();
                if (!val) continue;

                if (vb.oid === OID_SYS_DESCR)    result.sysDescr = val;
                if (vb.oid === OID_SYS_NAME)      result.sysName = val;
                if (vb.oid === OID_SYS_LOCATION)  result.sysLocation = val;
                if (vb.oid === OID_SYS_OBJECTID)  result.sysObjectID = val;
                if (vb.oid === OID_SYS_CONTACT)   result.sysContact = val;
            }

            if (Object.keys(result).length === 0) {
                resolve(null);
                return;
            }

            // Modellname + Firmware aus sysDescr parsen
            if (result.sysDescr) {
                const parsed = _parseSysDescr(result.sysDescr);
                result.modelName = parsed.modelName;
                result.firmwareVersion = parsed.firmwareVersion;
            }

            resolve(result);
        });
    });
}

/**
 * Batch-SNMP-Abfrage für mehrere IPs mit Parallelitätslimit.
 * @param {string[]} ips - Array von IPv4-Adressen
 * @param {Function} onProgress - Callback: (current, total)
 * @returns {Promise<Map<string, Object>>} Map: IP → SNMP-Daten
 */
async function querySNMPBatch(ips, onProgress = null) {
    const results = new Map();
    if (!ips || ips.length === 0) return results;

    log.info(`SNMP-Scan: ${ips.length} Geräte`);

    let done = 0;
    const queue = [...ips];

    async function worker() {
        while (queue.length > 0) {
            const ip = queue.shift();
            if (!ip) break;
            try {
                const data = await querySNMP(ip);
                if (data) {
                    results.set(ip, data);
                    log.debug(`SNMP ${ip}: ${data.sysDescr?.substring(0, 60) || data.sysName || '(kein sysDescr)'}`);
                }
            } catch (err) {
                log.debug(`SNMP ${ip}: ${err.message}`);
            }
            done++;
            if (onProgress) onProgress(done, ips.length);
        }
    }

    const workers = Array.from({ length: Math.min(PARALLEL_LIMIT, ips.length) }, () => worker());
    await Promise.all(workers);

    log.info(`SNMP-Scan abgeschlossen: ${results.size}/${ips.length} Geräte haben geantwortet`);
    return results;
}

// ---------------------------------------------------------------------------
//  sysDescr Parser — Extrahiert Modellname und Firmware aus Freitext
// ---------------------------------------------------------------------------

// Hersteller-spezifische Patterns (spezifischer → generischer)
const SYSDESCR_PATTERNS = [
    // Zyxel: "ZyXEL VMG3625-T50B V5.50(ABPM.0)b10C0"
    [/^(Zyxel|ZyXEL)\s+(\S+)\s+(V[\d.]+(?:\([^)]+\))?)/i, (m) => ({ modelName: `${m[1]} ${m[2]}`, firmwareVersion: m[3] })],
    // Cisco: "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE"
    [/Cisco.*?,\s+(\S+)\s+Software.*?Version\s+([\d.()A-Z]+)/i, (m) => ({ modelName: `Cisco ${m[1]}`, firmwareVersion: m[2] })],
    // HP/Brother Drucker: "Brother HL-L8360CDW series;..."
    [/^(Brother|HP|Hewlett-?Packard)\s+([^;,]+)/i, (m) => ({ modelName: `${m[1]} ${m[2].trim()}`, firmwareVersion: '' })],
    // Synology: "Linux DiskStation 4.4.302+ #69057 SMP ..."
    [/Linux\s+(DiskStation|RackStation)/i, (m) => ({ modelName: `Synology ${m[1]}`, firmwareVersion: '' })],
    // QNAP: "Linux QNAP-NAS ..."
    [/Linux\s+(QNAP\S*)/i, (m) => ({ modelName: m[1], firmwareVersion: '' })],
    // AVM: "FRITZ!Box 7590 154.07.57"
    [/(FRITZ!Box\s+\S+)\s+([\d.]+)/i, (m) => ({ modelName: `AVM ${m[1]}`, firmwareVersion: m[2] })],
    // Ubiquiti: "Linux ... EdgeRouter ..."
    [/(EdgeRouter|UniFi\s+\S+|EdgeSwitch\s+\S+)/i, (m) => ({ modelName: `Ubiquiti ${m[1]}`, firmwareVersion: '' })],
    // MikroTik: "RouterOS ... RB750Gr3"
    [/RouterOS.*?(RB\S+|CCR\S+|hEX\S*|hAP\S*)/i, (m) => ({ modelName: `MikroTik ${m[1]}`, firmwareVersion: '' })],
    // Netgear: "Netgear ProSafe GS108Ev3 - V2.06.24GR"
    [/(Netgear|NETGEAR)\s+(.+?)\s*[-–]\s*V?([\d.]+\S*)/i, (m) => ({ modelName: `${m[1]} ${m[2].trim()}`, firmwareVersion: m[3] })],
    // Generisch: "Linux <hostname> <kernel>" → nur Kernel-Version
    [/^Linux\s+\S+\s+([\d.]+)/i, (m) => ({ modelName: '', firmwareVersion: `Linux ${m[1]}` })],
    // Generisch: Erster Satz als Modellname (bis zu 60 Zeichen)
    [/^(.{5,60}?)(?:\s*[-–;,]|$)/, (m) => ({ modelName: m[1].trim(), firmwareVersion: '' })],
];

/**
 * Parst sysDescr-String und extrahiert Modellname + Firmware.
 * @param {string} sysDescr - SNMP sysDescr Wert
 * @returns {{ modelName: string, firmwareVersion: string }}
 */
function _parseSysDescr(sysDescr) {
    if (!sysDescr) return { modelName: '', firmwareVersion: '' };

    for (const [pattern, extract] of SYSDESCR_PATTERNS) {
        const match = sysDescr.match(pattern);
        if (match) {
            const result = extract(match);
            // Modellname: generische Prefixe entfernen
            if (result.modelName) {
                result.modelName = result.modelName
                    .replace(/\s+series$/i, '')
                    .replace(/\s+printer$/i, '')
                    .trim();
            }
            return result;
        }
    }

    return { modelName: '', firmwareVersion: '' };
}

module.exports = { querySNMP, querySNMPBatch };

'use strict';

const http = require('http');
const https = require('https');
const dgram = require('dgram');
const log = require('./logger').createLogger('device-identify');

// Timeouts — genug Zeit für langsame Embedded-Geräte (Sonos, Hue, etc.)
const HTTP_TIMEOUT = 4000;
const SSDP_TIMEOUT = 8000;  // MX=3 + Netzwerk-Latenz → 4s war zu knapp für Sonos
const IPP_TIMEOUT = 5000;
const MAX_BODY = 32 * 1024; // 32KB max pro HTTP-Response

// ============================================================
//  Öffentliche API
// ============================================================

/**
 * Identifiziert Gerätemodelle für eine Liste von Netzwerk-Geräten.
 * Läuft HTTP Banner, UPnP/SSDP und IPP parallel.
 *
 * @param {Array} devices - [{ip, openPorts: [{port}]}]
 * @param {Function} onProgress - {current, total}
 * @returns {Promise<Map<string, {modelName, serialNumber, firmwareVersion, identifiedBy}>>}
 */
async function identifyDevices(devices, onProgress) {
    const results = new Map();
    if (!devices || devices.length === 0) return results;

    const onlineIPs = new Set(devices.map(d => d.ip));
    let completed = 0;

    // --- Phase A: UPnP/SSDP (1x Broadcast für alle Geräte) ---
    log.info(`Geräte-Identifikation: UPnP für ${onlineIPs.size} Geräte...`);
    try {
        const upnpResults = await _probeUPnP(onlineIPs);
        for (const [ip, info] of upnpResults) {
            results.set(ip, { ...info, identifiedBy: 'upnp' });
        }
        log.info(`UPnP: ${upnpResults.size} Geräte identifiziert`);
    } catch (err) {
        log.warn('UPnP-Discovery fehlgeschlagen:', err.message);
    }

    // --- Phase B: HTTP + IPP parallel ---
    const httpTargets = devices.filter(d => {
        if (results.has(d.ip) && results.get(d.ip).modelName) return false;
        const ports = (d.openPorts || []).map(p => typeof p === 'number' ? p : p.port);
        return ports.some(p => [80, 443, 1400, 8080, 8443].includes(p));
    });

    const ippTargets = devices.filter(d => {
        const ports = (d.openPorts || []).map(p => typeof p === 'number' ? p : p.port);
        return ports.includes(631) || ports.includes(9100);
    });

    const totalProbes = httpTargets.length + ippTargets.length;
    log.info(`HTTP: ${httpTargets.length} Geräte, IPP: ${ippTargets.length} Drucker`);

    const httpPromises = _parallelLimit(
        httpTargets.map(d => async () => {
            try {
                const ports = (d.openPorts || []).map(p => typeof p === 'number' ? p : p.port);
                const result = await _probeHTTP(d.ip, ports);
                if (result && result.modelName) {
                    const existing = results.get(d.ip) || {};
                    results.set(d.ip, {
                        modelName: result.modelName,
                        serialNumber: existing.serialNumber || '',
                        firmwareVersion: existing.firmwareVersion || '',
                        identifiedBy: existing.identifiedBy ? existing.identifiedBy + '+http' : 'http'
                    });
                }
            } catch (err) {
                log.debug(`HTTP ${d.ip}: ${err.message}`);
            }
            completed++;
            if (onProgress && totalProbes > 0) onProgress(completed, totalProbes);
        }),
        10
    );

    const ippPromises = _parallelLimit(
        ippTargets.map(d => async () => {
            try {
                const result = await _probeIPP(d.ip);
                if (result) {
                    const existing = results.get(d.ip) || {};
                    results.set(d.ip, {
                        modelName: result.modelName || existing.modelName || '',
                        serialNumber: result.serialNumber || existing.serialNumber || '',
                        firmwareVersion: result.firmwareVersion || existing.firmwareVersion || '',
                        identifiedBy: existing.identifiedBy ? existing.identifiedBy + '+ipp' : 'ipp'
                    });
                }
            } catch (err) {
                log.debug(`IPP ${d.ip}: ${err.message}`);
            }
            completed++;
            if (onProgress && totalProbes > 0) onProgress(completed, totalProbes);
        }),
        5
    );

    await Promise.all([httpPromises, ippPromises]);

    log.info(`Geräte-Identifikation: ${results.size}/${devices.length} identifiziert`);
    return results;
}

// ============================================================
//  HTTP Banner Grabbing
// ============================================================

async function _probeHTTP(ip, ports) {
    // Versuche Ports in sinnvoller Reihenfolge (HTTP vor HTTPS wegen Zertifikatsproblemen)
    // 1400 = Sonos Webserver (liefert Device-Info XML)
    const tryOrder = [80, 1400, 8080, 443, 8443].filter(p => ports.includes(p));
    for (const port of tryOrder) {
        try {
            const result = await _fetchBanner(ip, port);
            if (result && result.modelName) return result;
        } catch { /* nächsten Port versuchen */ }
    }
    return null;
}

function _fetchBanner(ip, port) {
    return new Promise((resolve, reject) => {
        const isHTTPS = port === 443 || port === 8443;
        const client = isHTTPS ? https : http;
        // Sonos Port 1400: Device-Description XML liefert Modellname direkt
        const path = port === 1400 ? '/xml/device_description.xml' : '/';
        const url = `${isHTTPS ? 'https' : 'http'}://${ip}:${port}${path}`;

        const req = client.get(url, {
            timeout: HTTP_TIMEOUT,
            rejectUnauthorized: false, // Selbstsignierte Zertifikate akzeptieren
            headers: { 'User-Agent': 'SpeicherAnalyse/7.2 NetworkScanner' }
        }, (res) => {
            // Redirect folgen (nur gleiche IP)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                try {
                    const redirectUrl = new URL(res.headers.location, url);
                    if (redirectUrl.hostname === ip) {
                        res.destroy();
                        const redirPort = parseInt(redirectUrl.port) || (redirectUrl.protocol === 'https:' ? 443 : 80);
                        resolve(_fetchBanner(ip, redirPort));
                        return;
                    }
                } catch { /* ignoriere ungültige URLs */ }
            }

            const serverHeader = res.headers['server'] || '';
            let body = '';
            let bodySize = 0;

            res.setEncoding('utf8');
            res.on('data', chunk => {
                bodySize += chunk.length;
                if (bodySize <= MAX_BODY) body += chunk;
                else res.destroy();
            });
            res.on('end', () => {
                // Wenn die Antwort UPnP-XML ist (z.B. Sonos Port 1400), direkt als XML parsen
                if (body.includes('<device>') && body.includes('<modelName>')) {
                    const xmlResult = _parseDeviceXML(body);
                    if (xmlResult && xmlResult.modelName) {
                        resolve({ modelName: xmlResult.modelName, serialNumber: xmlResult.serialNumber || '', firmwareVersion: xmlResult.firmwareVersion || '', source: 'http+xml' });
                        return;
                    }
                }
                const result = _extractModelFromBanner(body, serverHeader);
                resolve(result);
            });
            res.on('error', () => resolve(null));
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', (err) => reject(err));
    });
}

function _extractModelFromBanner(html, serverHeader) {
    let modelName = '';

    // 1. <title> Tag extrahieren
    const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
    if (titleMatch) {
        let title = titleMatch[1].trim();
        // HTML-Entities decodieren
        title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

        // Sonderzeichen am Anfang/Ende entfernen (z.B. "::Welcome::" → "Welcome")
        title = title.replace(/^[:\-–_.*|~#>]+\s*/, '').replace(/\s*[:\-–_.*|~#>]+$/, '').trim();

        // Generische Titel filtern — Wörter die KEIN Modellname sind
        const genericWords = /\b(welcome|home|index|login|sign\s*in|configurator|configuration|settings|setup|management|manager|interface|web.?based|web.?interface|web.?ui|dashboard|portal|admin|panel|status|startseite|loading|please\s*wait|error|not\s*found|untitled|access\s*point|firmware\s*upgrade|document)\b/i;
        const genericStart = /^(home|index|welcome|login|startseite|webinterface|status|configuration|settings|setup|sign\s*in|error|not\s*found|untitled|loading|please\s*wait)/i;
        if (genericStart.test(title) || genericWords.test(title)) {
            // NICHT als Modellname verwenden
        } else if (title.length > 2 && title.length < 80) {
            // Wrappers entfernen: "Startseite - FRITZ!Box 7590" → "FRITZ!Box 7590"
            title = title.replace(/^(startseite|home|web\s*interface|status)\s*[-–|:]\s*/i, '');
            title = title.replace(/\s*[-–|:]\s*(startseite|home|web\s*interface|status)$/i, '');
            modelName = title;
        }
    }

    // 2. Server-Header als Fallback (z.B. "HP-ChaiSOE/1.0" → HP Drucker)
    if (!modelName && serverHeader) {
        // Manche Server-Header enthalten Modellnamen
        const serverPatterns = [
            /^(Brother[\w\s-]+)/i,
            /^(Canon[\w\s-]+)/i,
            /^(Epson[\w\s-]+)/i,
            /^(FRITZ!Box[\w\s.]+)/i,
        ];
        for (const pat of serverPatterns) {
            const m = serverHeader.match(pat);
            if (m) { modelName = m[1].trim(); break; }
        }
    }

    if (!modelName) return null;
    return { modelName, source: 'http' };
}

// ============================================================
//  UPnP / SSDP Discovery
// ============================================================

async function _probeUPnP(targetIPs) {
    const results = new Map();
    const locationURLs = new Map(); // ip → location URL

    // 1. M-SEARCH Broadcast senden
    await new Promise((resolve) => {
        let socket;
        try {
            socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        } catch (err) {
            log.warn('UPnP Socket erstellen fehlgeschlagen:', err.message);
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            try { socket.close(); } catch { /* ignorieren */ }
            resolve();
        }, SSDP_TIMEOUT);

        socket.on('error', (err) => {
            log.debug('UPnP Socket-Fehler:', err.message);
            clearTimeout(timeout);
            try { socket.close(); } catch { /* ignorieren */ }
            resolve();
        });

        socket.on('message', (msg, rinfo) => {
            if (!targetIPs.has(rinfo.address)) return;
            const text = msg.toString('utf8');
            const locMatch = text.match(/LOCATION:\s*(\S+)/i);
            if (locMatch) {
                // Nur die erste Location pro IP merken
                if (!locationURLs.has(rinfo.address)) {
                    locationURLs.set(rinfo.address, locMatch[1]);
                }
            }
        });

        socket.bind(() => {
            const msearchAll = Buffer.from(
                'M-SEARCH * HTTP/1.1\r\n' +
                'HOST: 239.255.255.250:1900\r\n' +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 5\r\n' +
                'ST: ssdp:all\r\n' +
                '\r\n'
            );
            const msearchBasic = Buffer.from(
                'M-SEARCH * HTTP/1.1\r\n' +
                'HOST: 239.255.255.250:1900\r\n' +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 5\r\n' +
                'ST: urn:schemas-upnp-org:device:Basic:1\r\n' +
                '\r\n'
            );
            // 3x senden mit verschiedenen STs für maximale Erkennung (Sonos, Hue, etc.)
            socket.send(msearchAll, 0, msearchAll.length, 1900, '239.255.255.250', () => {
                setTimeout(() => {
                    socket.send(msearchBasic, 0, msearchBasic.length, 1900, '239.255.255.250', () => {});
                }, 800);
                setTimeout(() => {
                    socket.send(msearchAll, 0, msearchAll.length, 1900, '239.255.255.250', () => {});
                }, 2000);
            });
        });
    });

    // 2. Device-Description-XML für jede gefundene Location laden
    const fetchPromises = [];
    for (const [ip, url] of locationURLs) {
        fetchPromises.push(
            _fetchDeviceXML(url, ip).then(info => {
                if (info && (info.modelName || info.serialNumber)) {
                    results.set(ip, info);
                }
            }).catch(err => {
                log.debug(`UPnP XML ${ip}: ${err.message}`);
            })
        );
    }
    await Promise.allSettled(fetchPromises);

    return results;
}

function _fetchDeviceXML(url, expectedIP) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            timeout: HTTP_TIMEOUT,
            rejectUnauthorized: false
        }, (res) => {
            let body = '';
            let size = 0;
            res.setEncoding('utf8');
            res.on('data', chunk => {
                size += chunk.length;
                if (size <= MAX_BODY) body += chunk;
                else res.destroy();
            });
            res.on('end', () => {
                resolve(_parseDeviceXML(body));
            });
            res.on('error', () => resolve(null));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}

function _parseDeviceXML(xml) {
    const tag = (name) => {
        const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, 'i'));
        return m ? m[1].trim() : '';
    };

    const rawModelName = tag('modelName');
    const modelNumber = tag('modelNumber');
    const friendlyName = tag('friendlyName');
    const manufacturer = tag('manufacturer');
    const serialNumber = tag('serialNumber') || tag('UDN')?.replace(/^uuid:/i, '') || '';
    const firmwareVersion = tag('firmwareVersion') || tag('softwareVersion') || '';

    // Modellname zusammenbauen — Priorität: modelName > modelNumber > friendlyName
    // Aber: Wenn modelName generisch ist (z.B. "hue personal wireless lighting"),
    // und modelNumber spezifisch (z.B. "BSB002"), dann modelNumber bevorzugen
    let fullModel = '';
    if (rawModelName && modelNumber && !rawModelName.includes(modelNumber)) {
        // Beide vorhanden → Kombination (z.B. "Sonos One (S18)")
        fullModel = `${rawModelName} (${modelNumber})`;
    } else if (rawModelName) {
        fullModel = rawModelName;
    } else if (modelNumber) {
        fullModel = modelNumber;
    } else if (friendlyName) {
        fullModel = friendlyName;
    }

    // Hersteller dem Modellnamen voranstellen, wenn er nicht schon enthalten ist
    // Normalisierung: "Sonos, Inc." → "sonos", "Philips Lighting BV" → "philips"
    if (fullModel && manufacturer) {
        const mfgKey = manufacturer.toLowerCase().replace(/[,.\s].*/, '').trim();  // Erstes Wort, ohne Komma/Punkt
        if (mfgKey.length >= 3 && !fullModel.toLowerCase().includes(mfgKey)) {
            fullModel = `${manufacturer} ${fullModel}`;
        }
    }

    if (!fullModel && !serialNumber) return null;

    return {
        modelName: fullModel,
        serialNumber: serialNumber.length > 30 ? '' : serialNumber, // UUIDs als S/N filtern
        firmwareVersion,
        manufacturer,
    };
}

// ============================================================
//  IPP (Internet Printing Protocol)
// ============================================================

async function _probeIPP(ip) {
    // IPP Get-Printer-Attributes Request (binär)
    const printerUri = `ipp://${ip}:631/ipp/print`;
    const body = _buildIPPRequest(printerUri);

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: ip,
            port: 631,
            path: '/ipp/print',
            method: 'POST',
            timeout: IPP_TIMEOUT,
            headers: {
                'Content-Type': 'application/ipp',
                'Content-Length': body.length,
            }
        }, (res) => {
            const chunks = [];
            let size = 0;
            res.on('data', chunk => {
                size += chunk.length;
                if (size <= MAX_BODY) chunks.push(chunk);
                else res.destroy();
            });
            res.on('end', () => {
                try {
                    const data = Buffer.concat(chunks);
                    resolve(_parseIPPResponse(data));
                } catch (err) {
                    resolve(null);
                }
            });
            res.on('error', () => resolve(null));
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function _buildIPPRequest(printerUri) {
    // IPP 1.1 Get-Printer-Attributes (operation 0x000B)
    const parts = [];

    // Version (1.1) + Operation (Get-Printer-Attributes) + Request-ID (1)
    const header = Buffer.alloc(8);
    header.writeInt8(1, 0);           // version-major
    header.writeInt8(1, 1);           // version-minor
    header.writeInt16BE(0x000B, 2);   // operation-id: Get-Printer-Attributes
    header.writeInt32BE(1, 4);        // request-id
    parts.push(header);

    // Operation-attributes-tag (0x01)
    parts.push(Buffer.from([0x01]));

    // charset: utf-8
    parts.push(_ippAttribute(0x47, 'attributes-charset', 'utf-8'));
    // natural-language: en
    parts.push(_ippAttribute(0x48, 'attributes-natural-language', 'en'));
    // printer-uri
    parts.push(_ippAttribute(0x45, 'printer-uri', printerUri));

    // Requested attributes: printer-make-and-model, printer-device-id, printer-firmware-string-version
    parts.push(_ippAttribute(0x44, 'requested-attributes', 'printer-make-and-model'));
    parts.push(_ippAdditionalValue(0x44, 'printer-device-id'));
    parts.push(_ippAdditionalValue(0x44, 'printer-firmware-string-version'));
    parts.push(_ippAdditionalValue(0x44, 'printer-info'));

    // End-of-attributes (0x03)
    parts.push(Buffer.from([0x03]));

    return Buffer.concat(parts);
}

function _ippAttribute(tag, name, value) {
    const nameBuf = Buffer.from(name, 'utf8');
    const valueBuf = Buffer.from(value, 'utf8');
    const buf = Buffer.alloc(1 + 2 + nameBuf.length + 2 + valueBuf.length);
    let offset = 0;
    buf.writeInt8(tag, offset++);
    buf.writeInt16BE(nameBuf.length, offset); offset += 2;
    nameBuf.copy(buf, offset); offset += nameBuf.length;
    buf.writeInt16BE(valueBuf.length, offset); offset += 2;
    valueBuf.copy(buf, offset);
    return buf;
}

function _ippAdditionalValue(tag, value) {
    // Additional value for same attribute (name-length = 0)
    const valueBuf = Buffer.from(value, 'utf8');
    const buf = Buffer.alloc(1 + 2 + 2 + valueBuf.length);
    let offset = 0;
    buf.writeInt8(tag, offset++);
    buf.writeInt16BE(0, offset); offset += 2; // name-length = 0 (additional value)
    buf.writeInt16BE(valueBuf.length, offset); offset += 2;
    valueBuf.copy(buf, offset);
    return buf;
}

function _parseIPPResponse(data) {
    if (!data || data.length < 8) return null;

    // Status prüfen (Bytes 2-3)
    const statusCode = data.readInt16BE(2);
    if (statusCode > 0x00FF) {
        log.debug(`IPP Fehler-Status: 0x${statusCode.toString(16)}`);
        // Trotzdem versuchen zu parsen — manche Drucker senden Fehler aber Daten
    }

    // Attribute parsen (ab Byte 8)
    const attrs = {};
    let offset = 8;
    let currentName = '';

    while (offset < data.length) {
        const tag = data.readUInt8(offset++);

        // Group delimiter tags (0x00-0x0F)
        if (tag <= 0x0F) {
            if (tag === 0x03) break; // end-of-attributes
            continue;
        }

        if (offset + 2 > data.length) break;
        const nameLen = data.readInt16BE(offset); offset += 2;
        if (offset + nameLen > data.length) break;
        const name = nameLen > 0 ? data.toString('utf8', offset, offset + nameLen) : currentName;
        offset += nameLen;
        if (nameLen > 0) currentName = name;

        if (offset + 2 > data.length) break;
        const valueLen = data.readInt16BE(offset); offset += 2;
        if (offset + valueLen > data.length) break;

        // String-Attribute lesen (tags 0x40-0x4F)
        if (tag >= 0x40 && tag <= 0x4F && valueLen > 0) {
            const value = data.toString('utf8', offset, offset + valueLen);
            if (!attrs[name]) attrs[name] = value;
        }

        offset += valueLen;
    }

    // Ergebnisse extrahieren
    const makeModel = attrs['printer-make-and-model'] || attrs['printer-info'] || '';
    const deviceId = attrs['printer-device-id'] || '';
    const firmware = attrs['printer-firmware-string-version'] || '';

    // Seriennummer aus Device-ID extrahieren (Format: "SN:ABC123;")
    let serialNumber = '';
    const snMatch = deviceId.match(/\bSN:([^;]+)/i) || deviceId.match(/\bSERIAL(?:NUMBER)?:([^;]+)/i);
    if (snMatch) serialNumber = snMatch[1].trim();

    if (!makeModel && !serialNumber) return null;

    return {
        modelName: makeModel,
        serialNumber,
        firmwareVersion: firmware,
    };
}

// ============================================================
//  Hilfs-Funktionen
// ============================================================

/**
 * Führt Tasks mit begrenzter Parallelität aus.
 */
async function _parallelLimit(taskFactories, limit) {
    let index = 0;
    async function worker() {
        while (index < taskFactories.length) {
            const i = index++;
            await taskFactories[i]();
        }
    }
    const workers = Array.from(
        { length: Math.min(limit, taskFactories.length) },
        () => worker()
    );
    await Promise.all(workers);
}

module.exports = { identifyDevices };

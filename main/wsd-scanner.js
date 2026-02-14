'use strict';

/**
 * WSD (Web Services Discovery) Scanner — WS-Discovery Probe.
 *
 * Entdeckt Geraete die WS-Discovery sprechen (Windows-PCs, Drucker, Scanner).
 * Aehnlich wie SSDP/UPnP, aber fuer Windows-zentrierte Geraete.
 *
 * KEINE Firewall-Aenderungen noetig:
 *   - Probe = Outbound Multicast an 239.255.255.250:3702
 *   - ProbeMatch = Unicast-Antwort zurueck (erlaubt durch Stateful Firewall)
 *
 * Pure JS (dgram + http), keine externen Pakete.
 */

const dgram = require('dgram');
const http = require('http');
const https = require('https');
const log = require('./logger').createLogger('wsd-scanner');

const WSD_PORT = 3702;
const WSD_MULTICAST = '239.255.255.250';
const WSD_TIMEOUT = 6000; // 6s Discovery-Window
const METADATA_TIMEOUT = 4000;
const MAX_BODY = 32 * 1024;

/**
 * Erzeugt eine WS-Discovery Probe SOAP-Nachricht.
 * Sucht nach allen Geraetetypen (kein Filter).
 */
function _buildProbeMessage() {
    const messageId = `urn:uuid:${_simpleUUID()}`;
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
    xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
    xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
    xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <soap:Header>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>${messageId}</wsa:MessageID>
  </soap:Header>
  <soap:Body>
    <wsd:Probe/>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Einfache UUID-Generierung ohne externe Abhaengigkeit.
 */
function _simpleUUID() {
    // crypto.randomUUID() ist in neueren Node.js verfuegbar
    try {
        return require('crypto').randomUUID();
    } catch {
        // Fallback: Pseudo-UUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}

/**
 * Entdeckt Geraete via WS-Discovery Probe.
 * @param {Set<string>} [targetIPs] - Nur diese IPs beruecksichtigen (optional)
 * @param {number} [timeout] - Discovery-Zeitfenster in ms
 * @returns {Promise<Map<string, Object>>} Map: IP → { xAddrs[], types[], metadataVersion }
 */
async function discoverWSD(targetIPs, timeout = WSD_TIMEOUT) {
    return new Promise((resolve) => {
        const results = new Map();
        let socket;

        try {
            socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        } catch (err) {
            log.warn('WSD Socket erstellen fehlgeschlagen:', err.message);
            resolve(results);
            return;
        }

        const timer = setTimeout(() => {
            try { socket.close(); } catch { /* ignore */ }
            resolve(results);
        }, timeout);

        socket.on('error', (err) => {
            log.debug('WSD Socket-Fehler:', err.message);
            clearTimeout(timer);
            try { socket.close(); } catch { /* ignore */ }
            resolve(results);
        });

        socket.on('message', (msg, rinfo) => {
            // Optional: nur bestimmte IPs beruecksichtigen
            if (targetIPs && !targetIPs.has(rinfo.address)) return;

            try {
                const xml = msg.toString('utf8');
                const parsed = _parseProbeMatch(xml, rinfo.address);
                if (parsed) {
                    results.set(rinfo.address, parsed);
                }
            } catch (err) {
                log.debug(`WSD Parse-Fehler von ${rinfo.address}:`, err.message);
            }
        });

        socket.bind(() => {
            const probe = Buffer.from(_buildProbeMessage(), 'utf8');
            // 2x senden fuer Zuverlaessigkeit (UDP = verbindungslos)
            socket.send(probe, 0, probe.length, WSD_PORT, WSD_MULTICAST, () => {
                setTimeout(() => {
                    socket.send(probe, 0, probe.length, WSD_PORT, WSD_MULTICAST, () => {});
                }, 1000);
            });
        });
    });
}

/**
 * Parst eine WS-Discovery ProbeMatch-Antwort.
 */
function _parseProbeMatch(xml, ip) {
    // Types extrahieren (z.B. "wsdp:Device wscn:ScanDeviceType wprt:PrintDeviceType")
    const typesMatch = xml.match(/<[^:]*:Types[^>]*>([^<]+)<\//);
    const types = typesMatch ? typesMatch[1].trim().split(/\s+/) : [];

    // XAddrs extrahieren (HTTP-URLs fuer Metadaten-Abruf)
    const xAddrsMatch = xml.match(/<[^:]*:XAddrs[^>]*>([^<]+)<\//);
    const xAddrs = xAddrsMatch ? xAddrsMatch[1].trim().split(/\s+/) : [];

    // MetadataVersion
    const mvMatch = xml.match(/<[^:]*:MetadataVersion[^>]*>(\d+)<\//);
    const metadataVersion = mvMatch ? parseInt(mvMatch[1]) : 0;

    if (types.length === 0 && xAddrs.length === 0) return null;

    return { types, xAddrs, metadataVersion, ip };
}

/**
 * Laedt WSD-Metadaten von einer XAddr-URL (Device-Info).
 * @param {string} url - XAddr-URL aus ProbeMatch
 * @returns {Promise<Object|null>} { modelName, manufacturer, serialNumber, firmwareVersion }
 */
async function _fetchWSDMetadata(url) {
    const getRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
    xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
    xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
    xmlns:wsx="http://schemas.xmlsoap.org/ws/2004/09/mex">
  <soap:Header>
    <wsa:To>${url}</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2004/09/transfer/Get</wsa:Action>
    <wsa:MessageID>urn:uuid:${_simpleUUID()}</wsa:MessageID>
    <wsa:ReplyTo>
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
  </soap:Header>
  <soap:Body/>
</soap:Envelope>`;

    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const isHTTPS = parsedUrl.protocol === 'https:';
            const client = isHTTPS ? https : http;

            const req = client.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHTTPS ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                timeout: METADATA_TIMEOUT,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(getRequest),
                }
            }, (res) => {
                let body = '';
                let size = 0;
                res.setEncoding('utf8');
                res.on('data', chunk => {
                    size += chunk.length;
                    if (size <= MAX_BODY) body += chunk;
                    else res.destroy();
                });
                res.on('end', () => resolve(_parseWSDMetadata(body)));
                res.on('error', () => resolve(null));
            });

            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.on('error', () => resolve(null));
            req.write(getRequest);
            req.end();
        } catch {
            resolve(null);
        }
    });
}

/**
 * Parst WSD-Metadaten-XML (Modellname, Hersteller, etc.).
 */
function _parseWSDMetadata(xml) {
    if (!xml) return null;

    const tag = (name) => {
        // Namespace-agnostisch suchen
        const m = xml.match(new RegExp(`<[^:]*:?${name}[^>]*>([^<]*)<\\/`, 'i'));
        return m ? m[1].trim() : '';
    };

    const modelName = tag('ModelName') || tag('FriendlyName') || '';
    const manufacturer = tag('Manufacturer') || tag('ManufacturerName') || '';
    const serialNumber = tag('SerialNumber') || '';
    const firmwareVersion = tag('FirmwareVersion') || tag('PresentationUrl') || '';
    const modelNumber = tag('ModelNumber') || '';

    if (!modelName && !manufacturer && !serialNumber) return null;

    let fullModel = modelName;
    if (modelNumber && !fullModel.includes(modelNumber)) {
        fullModel = fullModel ? `${fullModel} (${modelNumber})` : modelNumber;
    }
    if (manufacturer) {
        const mfgKey = manufacturer.toLowerCase().replace(/[,.\s].*/, '').trim();
        if (mfgKey.length >= 3 && !fullModel.toLowerCase().includes(mfgKey)) {
            fullModel = `${manufacturer} ${fullModel}`;
        }
    }

    return { modelName: fullModel, manufacturer, serialNumber, firmwareVersion };
}

/**
 * WSD-Discovery mit anschliessender Metadaten-Abfrage.
 * Kompletter Scan: Probe → ProbeMatch → Metadata Get.
 * @param {Set<string>} [targetIPs] - Nur diese IPs
 * @returns {Promise<Map<string, Object>>} IP → { modelName, types, ... }
 */
async function discoverWSDFull(targetIPs) {
    const probeResults = await discoverWSD(targetIPs);

    log.info(`WSD: ${probeResults.size} Geraete via WS-Discovery gefunden`);
    if (probeResults.size === 0) return probeResults;

    // Metadaten fuer jedes Geraet laden (parallel, max 5)
    const enriched = new Map();
    const tasks = [];

    for (const [ip, probe] of probeResults) {
        // XAddrs filtern: nur HTTP(S)-URLs nehmen
        const httpAddrs = (probe.xAddrs || []).filter(u =>
            u.startsWith('http://') || u.startsWith('https://')
        );

        if (httpAddrs.length > 0) {
            tasks.push(async () => {
                for (const addr of httpAddrs) {
                    try {
                        const meta = await _fetchWSDMetadata(addr);
                        if (meta && (meta.modelName || meta.serialNumber)) {
                            enriched.set(ip, {
                                ...probe,
                                modelName: meta.modelName || '',
                                manufacturer: meta.manufacturer || '',
                                serialNumber: meta.serialNumber || '',
                                firmwareVersion: meta.firmwareVersion || '',
                            });
                            return;
                        }
                    } catch (err) {
                        log.debug(`WSD Metadata ${ip} (${addr}): ${err.message}`);
                    }
                }
                // Keine Metadaten — Probe-Daten trotzdem behalten
                enriched.set(ip, { ...probe, modelName: '', serialNumber: '' });
            });
        } else {
            enriched.set(ip, { ...probe, modelName: '', serialNumber: '' });
        }
    }

    // Parallel mit Limit
    await _parallelLimit(tasks, 5);

    const withModel = [...enriched.values()].filter(d => d.modelName).length;
    log.info(`WSD: ${withModel}/${enriched.size} Geraete mit Modellname`);

    return enriched;
}

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

module.exports = { discoverWSD, discoverWSDFull };

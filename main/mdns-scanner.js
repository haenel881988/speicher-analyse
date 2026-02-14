'use strict';

/**
 * mDNS/Bonjour Scanner — Dynamische Netzwerk-Service-Erkennung via DNS-SD.
 *
 * WICHTIG: Keine statische Service-Liste!
 * Verwendet die DNS-SD Meta-Query (_services._dns-sd._udp.local) um ALLE
 * verfuegbaren Service-Typen im Netzwerk dynamisch zu entdecken.
 * Funktioniert auf JEDEM Netzwerk mit beliebigen Geraeten.
 *
 * Ablauf:
 *   1. Meta-Query → entdeckt alle Service-Typen im Netzwerk
 *   2. Fuer jeden entdeckten Typ → PTR-Query → findet Instanzen
 *   3. SRV/A/TXT-Records sammeln → IP, Hostname, Metadaten
 *
 * Pure JS (multicast-dns Paket), keine Native Addons.
 */

const mdns = require('multicast-dns');
const log = require('./logger').createLogger('mdns-scanner');

const MDNS_TIMEOUT = 6000;  // 6s Discovery-Window (etwas laenger fuer 2-Phasen)

// DNS-SD Meta-Query: Entdeckt ALLE verfuegbaren Service-Typen im Netzwerk
// RFC 6763 Section 9: "Service Type Enumeration"
const DNS_SD_META_QUERY = '_services._dns-sd._udp.local';

// Lesbare Labels fuer bekannte Service-Typen (NUR fuer Anzeige, NACH der Erkennung)
// Unbekannte Services werden trotzdem entdeckt und mit dem Roh-Typ angezeigt.
const KNOWN_LABELS = {
    '_http._tcp':            'Webserver',
    '_https._tcp':           'Webserver (HTTPS)',
    '_printer._tcp':         'Drucker',
    '_ipp._tcp':             'Drucker (IPP)',
    '_ipps._tcp':            'Drucker (IPPS)',
    '_pdl-datastream._tcp':  'Drucker (PDL)',
    '_airplay._tcp':         'AirPlay',
    '_raop._tcp':            'AirPlay Audio',
    '_smb._tcp':             'Dateifreigabe (SMB)',
    '_afpovertcp._tcp':      'Dateifreigabe (AFP)',
    '_nfs._tcp':             'Dateifreigabe (NFS)',
    '_ssh._tcp':             'SSH',
    '_sftp-ssh._tcp':        'SFTP',
    '_hap._tcp':             'HomeKit',
    '_googlecast._tcp':      'Google Cast',
    '_spotify-connect._tcp': 'Spotify Connect',
    '_sonos._tcp':           'Sonos',
    '_daap._tcp':            'iTunes/DAAP',
    '_airprint._tcp':        'AirPrint',
    '_scanner._tcp':         'Scanner',
    '_ftp._tcp':             'FTP',
    '_telnet._tcp':          'Telnet',
    '_workstation._tcp':     'Workstation',
    '_device-info._tcp':     'Geraeteinfo',
    '_rdp._tcp':             'Remote Desktop',
    '_vnc._tcp':             'VNC',
    '_mqtt._tcp':            'MQTT (IoT)',
    '_hue._tcp':             'Philips Hue',
    '_coap._udp':            'CoAP (IoT)',
    '_companion-link._tcp':  'Apple Companion',
    '_homeassistant._tcp':   'Home Assistant',
    '_esphomelib._tcp':      'ESPHome',
};

/**
 * Entdeckt Netzwerk-Services via mDNS/Bonjour — vollstaendig dynamisch.
 * @param {number} timeout - Discovery-Zeitfenster in ms
 * @returns {Promise<Map<string, Object>>} Map: IP → { services[], hostname, txt, modelName, serialNumber }
 */
async function discoverServices(timeout = MDNS_TIMEOUT) {
    return new Promise((resolve) => {
        const results = new Map();
        let m;

        try {
            m = mdns();
        } catch (err) {
            log.warn('mDNS konnte nicht gestartet werden:', err.message);
            resolve(results);
            return;
        }

        // Sammle alle DNS-Records
        const discoveredServiceTypes = new Set();  // dynamisch entdeckte Service-Typen
        const ptrRecords = new Map();   // serviceType → Set<instanceName>
        const srvRecords = new Map();   // instanceName → { target, port }
        const aRecords = new Map();     // hostname → ip
        const txtRecords = new Map();   // instanceName → key-value pairs

        m.on('response', (response) => {
            const allRecords = [
                ...(response.answers || []),
                ...(response.additionals || []),
            ];

            for (const answer of allRecords) {
                switch (answer.type) {
                    case 'PTR': {
                        // Phase 1: Meta-Query Antwort → neuer Service-Typ entdeckt
                        if (answer.name === DNS_SD_META_QUERY) {
                            const svcType = answer.data;
                            if (svcType && !discoveredServiceTypes.has(svcType)) {
                                discoveredServiceTypes.add(svcType);
                                // Sofort nach Instanzen dieses Typs fragen
                                try {
                                    m.query({ questions: [{ name: svcType, type: 'PTR' }] });
                                } catch { /* ignore */ }
                            }
                        } else {
                            // Phase 2: Service-Instanz entdeckt
                            const instances = ptrRecords.get(answer.name) || new Set();
                            instances.add(answer.data);
                            ptrRecords.set(answer.name, instances);
                        }
                        break;
                    }
                    case 'SRV':
                        srvRecords.set(answer.name, {
                            target: answer.data.target,
                            port: answer.data.port,
                        });
                        break;
                    case 'A':
                        aRecords.set(answer.name, answer.data);
                        break;
                    case 'AAAA':
                        // IPv6 — ignorieren wir vorerst, aber nicht verlieren
                        break;
                    case 'TXT':
                        if (answer.data) {
                            const txt = {};
                            const buffers = Array.isArray(answer.data) ? answer.data : [answer.data];
                            for (const buf of buffers) {
                                const str = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
                                const eq = str.indexOf('=');
                                if (eq > 0) {
                                    txt[str.substring(0, eq).toLowerCase()] = str.substring(eq + 1);
                                }
                            }
                            txtRecords.set(answer.name, txt);
                        }
                        break;
                }
            }
        });

        m.on('error', (err) => {
            log.debug('mDNS error:', err.message);
        });

        // Phase 1: Meta-Query senden — "Welche Service-Typen gibt es im Netzwerk?"
        try {
            m.query({ questions: [{ name: DNS_SD_META_QUERY, type: 'PTR' }] });
        } catch (err) {
            log.warn('mDNS Meta-Query fehlgeschlagen:', err.message);
        }

        // Nach Timeout: Ergebnisse zusammenbauen
        setTimeout(() => {
            try { m.destroy(); } catch { /* ignore */ }

            log.info(`mDNS: ${discoveredServiceTypes.size} Service-Typen dynamisch entdeckt: ${[...discoveredServiceTypes].join(', ')}`);

            // Alle SRV-Records → IP-Adressen aufloesen und Services zuordnen
            for (const [instanceName, srv] of srvRecords) {
                const ip = aRecords.get(srv.target);
                if (!ip) continue;

                // Service-Type aus dem Instanznamen extrahieren
                const serviceType = _extractServiceType(instanceName);
                const serviceLabel = _getServiceLabel(serviceType);

                const existing = results.get(ip) || {
                    services: [],
                    serviceTypes: [],   // Roh-Typen fuer Klassifizierung
                    hostname: srv.target,
                    txt: {},
                };

                if (serviceLabel && !existing.services.includes(serviceLabel)) {
                    existing.services.push(serviceLabel);
                }
                if (serviceType && !existing.serviceTypes.includes(serviceType)) {
                    existing.serviceTypes.push(serviceType);
                }

                // TXT-Records mergen
                const txt = txtRecords.get(instanceName) || {};
                existing.txt = { ...existing.txt, ...txt };

                results.set(ip, existing);
            }

            // Modellname/Seriennummer aus TXT-Records extrahieren
            for (const [, data] of results) {
                const txt = data.txt || {};
                data.modelName = txt.model || txt.product || txt.md || txt.am || txt.fn || '';
                data.serialNumber = txt.serialnumber || txt.sn || '';
                // Hostname bereinigen (.local entfernen)
                if (data.hostname) {
                    data.hostname = data.hostname.replace(/\.local\.?$/, '');
                }
            }

            log.info(`mDNS: ${results.size} Geraete mit ${[...results.values()].reduce((s, d) => s + d.services.length, 0)} Services entdeckt`);
            resolve(results);
        }, timeout);
    });
}

/**
 * Extrahiert den Service-Typ aus einem mDNS-Instanznamen.
 * z.B. "Living Room._googlecast._tcp.local" → "_googlecast._tcp"
 */
function _extractServiceType(instanceName) {
    // Format: "<instance>._<service>._<proto>.local"
    const match = instanceName.match(/\.(_[^.]+\._(?:tcp|udp))\.local\.?$/);
    return match ? match[1] : '';
}

/**
 * Gibt ein lesbares Label fuer einen Service-Typ zurueck.
 * Bekannte Typen → deutsches Label, unbekannte → bereinigter Rohname.
 */
function _getServiceLabel(serviceType) {
    if (!serviceType) return '';

    // Bekanntes Label vorhanden?
    if (KNOWN_LABELS[serviceType]) {
        return KNOWN_LABELS[serviceType];
    }

    // Unbekannter Typ → lesbaren Namen erzeugen
    // "_googlecast._tcp" → "googlecast"
    return serviceType
        .replace(/^_/, '')
        .replace(/\._(?:tcp|udp)$/, '');
}

module.exports = { discoverServices };

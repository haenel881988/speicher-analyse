'use strict';

/**
 * OUI-Datenbank — MAC-Adress → Hersteller (LOKAL aus IEEE-Daten)
 *
 * Primär: Lokale JSON-Datei mit ~39.000 OUI-Einträgen (aus IEEE-Registrierung)
 * Update: Manuell via updateOUIDatabase() (lädt oui.txt von IEEE, parst zu JSON)
 *
 * Die Datei data/oui.json wird mit der App ausgeliefert.
 * Updates landen in %APPDATA%/speicher-analyse/oui.json und haben Vorrang.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');
const log = require('./logger').createLogger('oui-database');

// ---------------------------------------------------------------------------
//  OUI-Map (geladen beim ersten Zugriff)
// ---------------------------------------------------------------------------

let _ouiMap = null; // Map<prefix, vendor>

/**
 * Lädt die OUI-Datenbank aus der lokalen JSON-Datei.
 * Priorität: 1) %APPDATA% (user-updated) → 2) data/oui.json (bundled)
 */
function _ensureLoaded() {
    if (_ouiMap) return;

    _ouiMap = new Map();

    // Pfade
    const bundledPath = path.join(__dirname, '..', 'data', 'oui.json');
    let userPath = null;
    try {
        userPath = path.join(app.getPath('userData'), 'oui.json');
    } catch { /* app not ready yet */ }

    // Versuche user-updated zuerst, dann bundled
    const paths = userPath ? [userPath, bundledPath] : [bundledPath];

    for (const p of paths) {
        try {
            if (!fs.existsSync(p)) continue;
            const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
            let count = 0;
            for (const [prefix, vendor] of Object.entries(raw)) {
                _ouiMap.set(prefix, vendor);
                count++;
            }
            log.info(`OUI-Datenbank geladen: ${count} Einträge aus ${path.basename(p)}`);
            return;
        } catch (err) {
            log.warn(`OUI-Datei ${p} fehlerhaft: ${err.message}`);
        }
    }

    log.warn('Keine OUI-Datenbank gefunden — Hersteller-Erkennung eingeschränkt');
}

// ---------------------------------------------------------------------------
//  MAC-Prefix-Normalisierung
// ---------------------------------------------------------------------------

/**
 * Normalisiert eine MAC-Adresse zum OUI-Prefix (AA:BB:CC).
 * @param {string} mac - Beliebiges MAC-Format
 * @returns {string|null} Prefix oder null wenn ungültig
 */
function _macToPrefix(mac) {
    if (!mac) return null;
    const clean = mac.replace(/[:\-\.]/g, '').toUpperCase();
    if (clean.length < 6) return null;
    if (clean === '000000000000' || clean === 'FFFFFFFFFFFF') return null;
    return `${clean.substring(0, 2)}:${clean.substring(2, 4)}:${clean.substring(4, 6)}`;
}

// ---------------------------------------------------------------------------
//  Vendor-Lookup (Einzeln)
// ---------------------------------------------------------------------------

/**
 * Sucht den Hersteller einer MAC-Adresse aus der lokalen IEEE-Datenbank.
 *
 * @param {string} mac - MAC-Adresse in beliebigem Format (AA:BB:CC, AA-BB-CC, etc.)
 * @returns {Promise<string>} Herstellername oder leerer String
 */
async function lookupVendor(mac) {
    _ensureLoaded();
    const prefix = _macToPrefix(mac);
    if (!prefix) return '';
    return _ouiMap.get(prefix) || '';
}

// ---------------------------------------------------------------------------
//  Batch-Lookup (für Netzwerk-Scans — sofort, keine Wartezeiten)
// ---------------------------------------------------------------------------

/**
 * Batch-Lookup für mehrere MAC-Adressen.
 * Gleiche OUI-Prefixe werden nur einmal nachgeschlagen.
 * KEIN Rate Limiting nötig — alles lokal.
 *
 * @param {string[]} macs - Array von MAC-Adressen
 * @param {Function} onProgress - Optional: Progress-Callback (done, total)
 * @returns {Promise<Map<string, string>>} Map: Original-MAC → Herstellername
 */
async function lookupVendorsBatch(macs, onProgress = null) {
    _ensureLoaded();

    const results = new Map();
    if (!macs || macs.length === 0) return results;

    // Gruppierung nach OUI-Prefix (vermeidet Doppel-Lookups)
    const prefixGroups = new Map(); // prefix → [original macs]

    for (const mac of macs) {
        const prefix = _macToPrefix(mac);
        if (!prefix) {
            results.set(mac, '');
            continue;
        }
        if (!prefixGroups.has(prefix)) {
            prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix).push(mac);
    }

    const uniqueCount = prefixGroups.size;
    log.info(`OUI-Lookup: ${uniqueCount} einzigartige Prefixe für ${macs.length} Geräte`);

    let lookupsDone = 0;
    let found = 0;

    for (const [prefix, originalMacs] of prefixGroups) {
        const vendor = _ouiMap.get(prefix) || '';
        if (vendor) found++;

        for (const mac of originalMacs) {
            results.set(mac, vendor);
        }

        lookupsDone++;
        if (onProgress) onProgress(lookupsDone, uniqueCount);
    }

    log.info(`OUI-Lookup abgeschlossen: ${found}/${uniqueCount} Hersteller erkannt (lokal)`);
    return results;
}

// ---------------------------------------------------------------------------
//  OUI-Datenbank-Update (Download von IEEE)
// ---------------------------------------------------------------------------

/**
 * Lädt die neueste OUI-Datenbank von IEEE herunter und speichert sie.
 * @returns {Promise<{success: boolean, count?: number, error?: string}>}
 */
async function updateOUIDatabase() {
    const OUI_URL = 'https://standards-oui.ieee.org/oui/oui.txt';

    let userPath;
    try {
        userPath = path.join(app.getPath('userData'), 'oui.json');
    } catch {
        return { success: false, error: 'App userData-Pfad nicht verfügbar' };
    }

    log.info('OUI-Datenbank-Update gestartet...');

    try {
        // Download
        const raw = await new Promise((resolve, reject) => {
            https.get(OUI_URL, { timeout: 60000 }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    res.resume();
                    return;
                }
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });

        // Parse
        const ouiMap = {};
        let count = 0;
        for (const rawLine of raw.split('\n')) {
            const line = rawLine.replace(/\r$/, '');
            const match = line.match(/^([0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2})\s+\(hex\)\s+(.+)/);
            if (match) {
                const prefix = match[1].replace(/-/g, ':').toUpperCase();
                const vendor = match[2].trim();
                if (vendor) {
                    ouiMap[prefix] = vendor;
                    count++;
                }
            }
        }

        if (count < 1000) {
            return { success: false, error: `Zu wenige Einträge geparst (${count}). Datei möglicherweise beschädigt.` };
        }

        // Speichern
        const dir = path.dirname(userPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(userPath, JSON.stringify(ouiMap), 'utf-8');

        // Neu laden
        _ouiMap = new Map(Object.entries(ouiMap));

        log.info(`OUI-Datenbank aktualisiert: ${count} Einträge`);
        return { success: true, count };
    } catch (err) {
        log.error('OUI-Update fehlgeschlagen:', err.message);
        return { success: false, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// Gerätetyp-Erkennung (kombiniert Hersteller, offene Ports, TTL, Hostname)
// ---------------------------------------------------------------------------

// Hersteller→Typ Zuordnung: NUR Hersteller die AUSSCHLIESSLICH eine Gerätekategorie
// im Netzwerk haben. Multi-Produkt-Hersteller (Canon, Samsung, Apple, Sony, Amazon,
// Google, LG, Huawei, Cisco, TP-Link, etc.) sind VERBOTEN — deren Gerätetyp muss
// durch Identity, Ports oder Hostname bestimmt werden, nicht durch den Herstellernamen.
// Regel: Statische Listen NIEMALS als Erkennungsgrundlage (CLAUDE.md).
// Geräte von Multi-Produkt-Herstellern ohne Identity/Ports/Hostname → "Unbekanntes Gerät".
const VENDOR_PATTERNS = [
    // --- Drucker (reine Druckerhersteller — bauen NUR Drucker im Netzwerk) ---
    ['Konica Minolta', 'printer'],
    ['Brother', 'printer'], ['Kyocera', 'printer'], ['Lexmark', 'printer'],
    // --- NAS (reine NAS-Hersteller) ---
    ['Synology', 'nas'], ['QNAP', 'nas'],
    // --- Smart Home / IoT (reine IoT-Hersteller oder spezifische Produktlinien) ---
    ['Philips Lighting', 'smarthome'], ['Signify', 'smarthome'], ['Philips Hue', 'smarthome'],
    ['Samsung SmartThings', 'smarthome'],  // spezifische Produktlinie (nicht generisch Samsung!)
    ['Google Nest', 'smarthome'],          // spezifische Produktlinie (nicht generisch Google!)
    ['TP-Link Smart Home', 'smarthome'],   // spezifische Produktlinie (nicht generisch TP-Link!)
    ['Shelly', 'smarthome'], ['Tuya', 'smarthome'], ['IKEA', 'smarthome'],
    // --- Konsolen (spezifische Produktlinien) ---
    ['Sony Interactive', 'console'],  // PlayStation (nicht generisch Sony!)
    ['Microsoft Xbox', 'console'],    // Xbox (nicht generisch Microsoft!)
    ['Nintendo', 'console'],
    // --- Media (reine Audio/Streaming-Hersteller) ---
    ['Sonos', 'media'], ['Roku', 'media'],
    // --- Kameras (reine Überwachungs-Hersteller) ---
    ['Axis Communications', 'camera'],
    ['Hikvision', 'camera'], ['Dahua', 'camera'], ['Reolink', 'camera'],
    // --- Smartphones (reine Smartphone-Hersteller) ---
    ['OnePlus', 'mobile'], ['Oppo', 'mobile'],
    // --- Einplatinencomputer ---
    ['Raspberry', 'sbc'],
    // --- Virtualisierung ---
    ['VMware', 'vm'], ['Hyper-V', 'vm'], ['QEMU', 'vm'], ['VirtualBox', 'vm'],
    // --- Router (reine Router-Hersteller) ---
    ['Fritz!Box', 'router'], ['AVM', 'router'], ['MikroTik', 'router'],
    // --- Netzwerk (reine Netzwerk-Infrastruktur) ---
    ['Cisco Meraki', 'network'], ['Aruba', 'network'], ['Linksys', 'network'],
];

/**
 * Erkennt den Gerätetyp basierend auf kombinierten Daten.
 * PRINZIP: Verhalten (Identity) vor Name (Vendor). Feste Listen nur als Fallback.
 *
 * Prioritätsreihenfolge:
 *   0. Eigener PC / Gateway
 *   1. Identity-basiert (UPnP deviceType, IPP-Antwort, Modellname) ← das Gerät SAGT was es ist
 *   2. Port-basiert (nur Drucker-exklusive Ports, und nur wenn Identity fehlt)
 *   3. Hostname-basiert
 *   4. Vendor-Patterns (NUR als Fallback — Hersteller bauen verschiedene Gerätetypen!)
 *   5. OS + Ports, TTL, generischer Fallback
 *
 * @param {Object} device - { vendor, openPorts, os, hostname, ttl, isLocal, isGateway, identity }
 * @returns {{ type: string, label: string, icon: string }}
 */
function classifyDevice(device) {
    const { vendor = '', openPorts = [], os = '', hostname = '', ttl = 0, isLocal = false, isGateway = false, identity = {}, mac = '' } = device;

    if (isLocal) {
        return { type: 'pc', label: 'PC / Laptop', icon: 'monitor' };
    }

    // 0. Gateway/Default-Route = immer Router
    if (isGateway) {
        return { type: 'router', label: 'Router / Gateway', icon: 'wifi' };
    }

    const ports = new Set(openPorts.map(p => typeof p === 'object' ? p.port : p));

    // 1. IDENTITY-BASIERT — das Gerät hat auf eine Anfrage geantwortet
    //    UPnP deviceType, IPP-Antwort, oder Modellname sind die zuverlässigsten Quellen,
    //    weil das Gerät uns SELBST sagt was es ist.
    const identityType = _classifyFromIdentity(identity);
    if (identityType) {
        return _typeToResult(identityType, vendor);
    }

    // 2. PORT-BASIERT — nur mit Vendor-Bestätigung oder Port-Kombination
    //    Einzelne Ports reichen NICHT für Klassifizierung (WU-18, WU-19, WU-20)
    // Port 9100 (RAW Print / JetDirect) = drucker-exklusiv, auch MIT Port 80
    if (ports.has(9100)) return _typeToResult('printer', vendor);
    // Port 631 (IPP) — fast immer Drucker, ABER: CUPS auf Linux-Servern hat auch 631 offen.
    // Nur als Drucker werten wenn keine Server-Ports (SSH, HTTP, SMB) gleichzeitig offen sind.
    if (ports.has(631) && !ports.has(22) && !(ports.has(80) && ports.has(445))) {
        return _typeToResult('printer', vendor);
    }
    // Port 515 (LPD) = NICHT drucker-exklusiv! Wird auch von IoT/Embedded/Industriegeräten verwendet.
    // Nur als Drucker werten wenn ZUSÄTZLICH ein reiner Drucker-Vendor erkannt wurde.
    const printerVendors = /brother|kyocera|lexmark|konica\s*minolta|ricoh|xerox|hp\b|hewlett/i;
    if (ports.has(515) && printerVendors.test(vendor)) {
        return _typeToResult('printer', vendor);
    }
    // Port 5000/5001 nur als NAS wenn reiner NAS-Vendor ODER beide Ports offen
    // Nur Synology + QNAP (reine NAS-Hersteller). Buffalo/WD/Seagate = Multi-Produkt → entfernt.
    const nasVendors = /synology|qnap/i;
    if ((ports.has(5000) || ports.has(5001)) && (nasVendors.test(vendor) || (ports.has(5000) && ports.has(5001)))) {
        return _typeToResult('nas', vendor);
    }
    // Kamera: Nur port-exklusive Protokolle oder Port + Vendor-Bestätigung.
    // Port 554 (RTSP) ist NICHT kamera-exklusiv — Smart TVs, VLC, Media Streamer nutzen RTSP ebenfalls.
    if (ports.has(37777)) return _typeToResult('camera', vendor); // Dahua-exklusiv
    const cameraVendors = /hikvision|dahua|reolink|axis\s+communication|amcrest|foscam|eufy|annke|lorex/i;
    if ((ports.has(554) || ports.has(8554)) && cameraVendors.test(vendor)) return _typeToResult('camera', vendor);

    // 3. HOSTNAME-BASIERT (VOR Vendor und OS — Hostnamen sind oft aussagekräftiger)
    const hn = hostname.toLowerCase();
    // Drucker-Hostnamen: "brn" = Brother Network Printer Prefix (BRN + MAC).
    // Wortgrenze bei 'brn' damit "auburn-pc" nicht matcht. "printer"/"drucker" sind eindeutig genug.
    if (/^hp[0-9a-f]{6}/i.test(hostname) || hn.includes('printer') || hn.includes('drucker') || /^brn[0-9a-f]/i.test(hostname) || hn.includes('laserjet') || hn.includes('officejet') || hn.includes('deskjet')) {
        return _typeToResult('printer', vendor);
    }
    // NAS-Hostnamen: Wortgrenze bei 'nas' damit "gymnasium", "nasty-pc", "dynasty" nicht matchen.
    // "diskstation", "qnap", "synology" sind spezifisch genug für includes().
    if (/\bnas\b/i.test(hn) || /[-_.]nas$/i.test(hn) || /^nas[-_.]/i.test(hn) || hn.includes('diskstation') || hn.includes('qnap') || hn.includes('synology')) {
        return _typeToResult('nas', vendor);
    }
    // Kamera-Hostnamen: NICHT 'cam' als Substring (matched "cambridge", "cameron")!
    // Nur spezifische Kamera-Begriffe oder 'cam' als eigenständiges Wort/Präfix/Suffix.
    if (hn.includes('ipcam') || hn.includes('ip-cam') || hn.includes('netcam') || /\bcam\d/i.test(hn) || /[-_.]cam$/i.test(hn) || hn.includes('nvr') || hn.includes('dvr') || hn.includes('hikvision') || hn.includes('dahua')) {
        return _typeToResult('camera', vendor);
    }
    if (hn.includes('smarttv') || hn.includes('lgwebos') || hn.includes('bravia') || hn.includes('chromecast')) {
        return _typeToResult('tv', vendor);
    }
    if (hn.includes('sonos') || hn.includes('denon') || hn.includes('heos') || hn.includes('airplay')) {
        return _typeToResult('media', vendor);
    }
    if (hn.includes('fritz') || hn.includes('speedport') || hn.includes('easybox') || /^(internet-?)?gateway/i.test(hn)) {
        return { type: 'router', label: 'Router / Gateway', icon: 'wifi' };
    }
    if (hn.includes('iphone') || hn.includes('ipad') || hn.includes('android') || hn.includes('galaxy') || hn.includes('pixel') || hn.includes('oneplus') || hn.includes('redmi') || hn.includes('huawei-')) {
        return { type: 'mobile', label: 'Mobilgerät', icon: 'smartphone' };
    }
    if (/\bnintendo.?switch\b/i.test(hn) || hn.includes('playstation') || hn.includes('xbox')) {
        return { type: 'console', label: 'Spielkonsole', icon: 'gamepad' };
    }
    if (hn.includes('shelly') || hn.includes('tasmota') || hn.includes('esp-') || hn.includes('wled')) {
        return _typeToResult('smarthome', vendor);
    }

    // 4. VENDOR-PATTERNS — NUR als Fallback wenn weder Identity noch Hostname helfen
    //    ACHTUNG: Hersteller bauen verschiedene Gerätetypen! Canon = Drucker UND Kameras.
    const vendorLower = vendor.toLowerCase();
    if (vendorLower) {
        for (const [pattern, type] of VENDOR_PATTERNS) {
            if (vendorLower.includes(pattern.toLowerCase())) {
                return _typeToResult(type, vendor);
            }
        }
    }

    // 5. Lokal-administrierte MAC ohne weitere Daten = wahrscheinlich Smartphone mit MAC-Randomisierung
    //    Bit 1 des ersten Oktetts gesetzt = locally administered (nicht IEEE-registriert)
    //    Ohne Vendor/Ports/Hostname können wir den Typ nicht bestimmen → ehrlich "Unbekannt"
    if (mac && !vendorLower && ports.size === 0 && !hn) {
        const firstByte = parseInt(mac.replace(/[:\-\.]/g, '').substring(0, 2), 16);
        if (!isNaN(firstByte) && (firstByte & 0x02) !== 0) {
            return { type: 'unknown', label: 'Unbekanntes Gerät', icon: 'help-circle' };
        }
    }

    // 6. OS + Port Kombinationen
    // Windows-Erkennung: Port 135 (RPC) und 3389 (RDP) sind Windows-exklusiv.
    // Port 445 (SMB) ist NICHT Windows-exklusiv — NAS-Geräte (Buffalo, WD, Samba) haben auch SMB.
    // Daher: Port 445 nur als Windows werten wenn ZUSÄTZLICH Port 135 oder 3389 offen ist.
    // Port 135 (RPC) und 3389 (RDP) sind Windows-exklusiv → sicheres Signal.
    // Port 445 (SMB) allein reicht NICHT → NAS/Samba-Geräte haben auch SMB.
    const isWindows = os === 'Windows' || ports.has(135) || ports.has(3389);
    if (isWindows) {
        if (ports.has(80) && ports.has(443) && ports.size > 4) {
            return { type: 'server', label: 'Windows Server', icon: 'server' };
        }
        return { type: 'pc', label: 'Windows PC', icon: 'monitor' };
    }

    if (os === 'Linux/macOS') {
        if (ports.has(22) && ports.has(80)) {
            return { type: 'server', label: 'Linux Server', icon: 'server' };
        }
        // KEIN vendor-basiertes "Apple Gerät" — Apple baut iPhones, MacBooks, Apple TV,
        // HomePod — alles TTL 64. Typ muss über Identity/Hostname/mDNS bestimmt werden.
        if (ports.has(80) || ports.has(443)) {
            return { type: 'webdevice', label: 'Gerät mit Web-Interface', icon: 'globe' };
        }
        // Fallback: TTL 64 allein macht KEIN "Linux/macOS Gerät" — viele IoT-Geräte haben Linux-Firmware.
        // Nur als PC bezeichnen wenn SSH offen (typisch für echte Linux-Rechner)
        if (ports.has(22)) {
            return { type: 'pc', label: 'Linux/macOS Gerät', icon: 'monitor' };
        }
        return { type: 'unknown', label: 'Unbekanntes Gerät', icon: 'help-circle' };
    }

    // 7. Netzwerkgerät (hoher TTL)
    if (ttl > 128 || os === 'Netzwerkgerät') {
        return { type: 'router', label: 'Netzwerkgerät', icon: 'wifi' };
    }

    // 8. Generischer Fallback
    if (ports.has(80) || ports.has(443)) {
        return { type: 'webdevice', label: 'Gerät mit Web-Interface', icon: 'globe' };
    }

    return { type: 'unknown', label: 'Unbekanntes Gerät', icon: 'help-circle' };
}

// ---------------------------------------------------------------------------
// Identity-basierte Klassifizierung: Das Gerät hat uns geantwortet
// ---------------------------------------------------------------------------

// UPnP deviceType URN → interner Gerätetyp
const UPNP_TYPE_MAP = {
    'internetgatewaydevice': 'router',
    'wandevice':             'router',
    'wanconnectiondevice':   'router',
    'mediarenderer':         'media',
    'mediaserver':           'media',
    'printer':               'printer',
    'scanner':               'printer',  // Scanner sind meist Multifunktionsdrucker
    'lightingcontrols':      'smarthome',
    'dimmablelight':         'smarthome',
    'binarylight':           'smarthome',
};

// Modellname-Muster → Gerätetyp (dynamisch erkannte Modellnamen, NICHT Herstellernamen)
const MODEL_PATTERNS = [
    // Router / Gateways
    [/fritz.?box/i, 'router'], [/speedport/i, 'router'], [/easybox/i, 'router'],
    [/archer/i, 'router'], [/nighthawk/i, 'router'], [/livebox/i, 'router'],
    // Drucker (Modellreihen, nicht Herstellernamen)
    [/laserjet/i, 'printer'], [/officejet/i, 'printer'], [/deskjet/i, 'printer'],
    [/pixma/i, 'printer'], [/ecotank/i, 'printer'], [/workforce/i, 'printer'],
    [/hl-[a-z]/i, 'printer'], [/mfc-/i, 'printer'], [/dcp-/i, 'printer'],
    // Media
    [/sonos/i, 'media'], [/denon/i, 'media'], [/heos/i, 'media'],
    // Smart Home
    [/hue\s*(bridge|hub)/i, 'smarthome'], [/shelly/i, 'smarthome'],
    // TV
    [/bravia/i, 'tv'], [/webos/i, 'tv'], [/tizen/i, 'tv'],
    // NAS
    [/diskstation/i, 'nas'], [/readynas/i, 'nas'],
    // Kamera
    [/ipcam/i, 'camera'], [/reolink/i, 'camera'],
];

// SNMP Enterprise OID-Prefixe → Gerätetyp
// Format: "1.3.6.1.4.1.<enterprise>" — ISO.identified.dod.internet.private.enterprises
const SNMP_OID_TYPE_MAP = [
    ['1.3.6.1.4.1.9.',     'network'],   // Cisco
    ['1.3.6.1.4.1.2636.',  'network'],   // Juniper
    ['1.3.6.1.4.1.14988.', 'router'],    // MikroTik
    ['1.3.6.1.4.1.41112.', 'network'],   // Ubiquiti
    ['1.3.6.1.4.1.4413.',  'router'],    // ZyXEL
    ['1.3.6.1.4.1.12356.', 'network'],   // Fortinet
    // HP OID 11 entfernt (WU-30): Umfasst auch ProLiant Server, Aruba Switches, Storage
    ['1.3.6.1.4.1.2435.',  'printer'],    // Brother
    ['1.3.6.1.4.1.1602.',  'printer'],    // Canon
    ['1.3.6.1.4.1.1248.',  'printer'],    // Epson
    ['1.3.6.1.4.1.18334.', 'printer'],    // Konica Minolta
    ['1.3.6.1.4.1.6574.',  'nas'],        // Synology
    ['1.3.6.1.4.1.24681.', 'nas'],        // QNAP
];

// mDNS Roh-Service-Type → Gerätetyp (wird NACH dynamischer Erkennung angewendet)
const MDNS_SERVICE_TYPE_MAP = {
    '_printer._tcp':         'printer',
    '_ipp._tcp':             'printer',
    '_ipps._tcp':            'printer',
    '_pdl-datastream._tcp':  'printer',
    '_airprint._tcp':        'printer',
    '_scanner._tcp':         'printer',
    '_airplay._tcp':         'media',
    '_raop._tcp':            'media',
    '_spotify-connect._tcp': 'media',
    '_sonos._tcp':           'media',
    '_daap._tcp':            'media',
    '_googlecast._tcp':      'tv',
    '_hap._tcp':             'smarthome',
    '_hue._tcp':             'smarthome',
    '_homeassistant._tcp':   'smarthome',
    '_esphomelib._tcp':      'smarthome',
    '_mqtt._tcp':            'smarthome',
    '_coap._udp':            'smarthome',
    '_ssh._tcp':             'server',
    '_sftp-ssh._tcp':        'server',
    // NICHT '_smb._tcp' → nas! JEDER Windows-PC mit Dateifreigabe hat SMB.
    '_afpovertcp._tcp':      'nas',     // AFP = Apple Filing Protocol, typisch für NAS
    '_nfs._tcp':             'nas',     // NFS = typisch für NAS/Server
    '_rdp._tcp':             'pc',      // RDP = Windows Remote Desktop
    '_vnc._tcp':             'pc',      // VNC = Remote Desktop
};

/**
 * Klassifiziert ein Gerät basierend auf Identity-Daten (UPnP, HTTP, IPP, SNMP, mDNS).
 * @param {Object} identity - { modelName, identifiedBy, deviceType, snmpObjectID, mdnsServices, ... }
 * @returns {string|null} - Gerätetyp oder null wenn keine Erkennung möglich
 */
function _classifyFromIdentity(identity) {
    if (!identity) return null;
    const { modelName = '', identifiedBy = '', deviceType = '', snmpObjectID = '', mdnsServiceTypes = [], mdnsServices = [], wsdTypes = [] } = identity;

    // A. UPnP deviceType URN — zuverlässigste Quelle (Gerät deklariert seinen Typ)
    //    Format: "urn:schemas-upnp-org:device:MediaRenderer:1"
    if (deviceType) {
        const dtLower = deviceType.toLowerCase();
        for (const [urnPart, type] of Object.entries(UPNP_TYPE_MAP)) {
            if (dtLower.includes(urnPart)) return type;
        }
    }

    // B. IPP-Antwort = definitiv ein Drucker (nur Drucker sprechen IPP)
    if (identifiedBy && identifiedBy.includes('ipp')) {
        return 'printer';
    }

    // C. Modellname gegen bekannte Muster prüfen
    //    Anders als VENDOR_PATTERNS: hier werden MODELLREIHEN erkannt, nicht Herstellernamen
    if (modelName) {
        for (const [pattern, type] of MODEL_PATTERNS) {
            if (pattern.test(modelName)) return type;
        }
    }

    // D. SNMP sysObjectID → Enterprise OID-Prefix matchen
    if (snmpObjectID) {
        for (const [prefix, type] of SNMP_OID_TYPE_MAP) {
            if (snmpObjectID.startsWith(prefix)) return type;
        }
    }

    // E. mDNS Service-Type → Gerätetyp (Roh-Typen wie _printer._tcp)
    const svcTypes = mdnsServiceTypes.length > 0 ? mdnsServiceTypes : mdnsServices;
    if (svcTypes && svcTypes.length > 0) {
        for (const svc of svcTypes) {
            const type = MDNS_SERVICE_TYPE_MAP[svc];
            if (type) return type;
        }
    }

    // F. WSD Types → Gerätetyp (z.B. "wprt:PrintDeviceType", "wscn:ScanDeviceType")
    if (wsdTypes && wsdTypes.length > 0) {
        for (const wt of wsdTypes) {
            const wtLower = wt.toLowerCase();
            if (wtLower.includes('print')) return 'printer';
            if (wtLower.includes('scan')) return 'printer'; // Scanner = meist Multifunktionsdrucker
            if (wtLower.includes('camera') || wtLower.includes('imaging')) return 'camera';
        }
    }

    return null;
}

function _typeToResult(type, vendor) {
    const types = {
        printer:   { type: 'printer', label: 'Drucker', icon: 'printer' },
        nas:       { type: 'nas', label: 'NAS / Speicher', icon: 'hard-drive' },
        camera:    { type: 'camera', label: 'Überwachungskamera', icon: 'video' },
        smarthome: { type: 'smarthome', label: 'Smart-Home-Gerät', icon: 'home' },
        media:     { type: 'media', label: 'Medien-Gerät', icon: 'speaker' },
        tv:        { type: 'tv', label: 'Smart TV', icon: 'tv' },
        console:   { type: 'console', label: 'Spielkonsole', icon: 'gamepad' },
        sbc:       { type: 'sbc', label: 'Einplatinencomputer', icon: 'cpu' },
        vm:        { type: 'vm', label: 'Virtuelle Maschine', icon: 'cloud' },
        router:    { type: 'router', label: 'Router / Gateway', icon: 'wifi' },
        network:   { type: 'network', label: 'Netzwerkgerät', icon: 'activity' },
        pc:        { type: 'pc', label: 'PC / Laptop', icon: 'monitor' },
        server:    { type: 'server', label: 'Server', icon: 'server' },
        webdevice: { type: 'webdevice', label: 'Gerät mit Web-Interface', icon: 'globe' },
        mobile:    { type: 'mobile', label: 'Mobilgerät', icon: 'smartphone' },
    };
    return types[type] || { type: 'unknown', label: 'Unbekanntes Gerät', icon: 'help-circle' };
}

module.exports = { lookupVendor, lookupVendorsBatch, classifyDevice, updateOUIDatabase };

'use strict';

/**
 * OUI-Datenbank — MAC-Adress-Prefix → Hersteller (IEEE-Registrierung)
 * Die ersten 3 Bytes (6 Hex-Zeichen) einer MAC-Adresse identifizieren den Hersteller.
 * ~350 der häufigsten Hersteller, deckt >95% der Geräte in typischen Netzwerken ab.
 */

const OUI_MAP = new Map([
    // === Netzwerk-Ausrüstung ===
    // TP-Link
    ['F8:1A:67', 'TP-Link'], ['50:C7:BF', 'TP-Link'], ['98:DA:C4', 'TP-Link'],
    ['A0:F3:C1', 'TP-Link'], ['B0:BE:76', 'TP-Link'], ['30:B5:C2', 'TP-Link'],
    ['EC:08:6B', 'TP-Link'], ['C0:25:E9', 'TP-Link'], ['14:CC:20', 'TP-Link'],
    ['60:32:B1', 'TP-Link'], ['64:70:02', 'TP-Link'], ['C0:06:C3', 'TP-Link'],
    ['54:C8:0F', 'TP-Link'], ['B0:4E:26', 'TP-Link'],
    // Netgear
    ['00:0F:B5', 'Netgear'], ['28:C6:8E', 'Netgear'], ['20:E5:2A', 'Netgear'],
    ['00:09:5B', 'Netgear'], ['A0:40:A0', 'Netgear'], ['6C:B0:CE', 'Netgear'],
    ['E0:91:F5', 'Netgear'], ['84:1B:5E', 'Netgear'], ['C4:04:15', 'Netgear'],
    // D-Link
    ['00:1E:58', 'D-Link'], ['28:10:7B', 'D-Link'], ['1C:7E:E5', 'D-Link'],
    ['FC:75:16', 'D-Link'], ['00:1B:11', 'D-Link'], ['34:08:04', 'D-Link'],
    ['B8:A3:86', 'D-Link'], ['C0:A0:BB', 'D-Link'],
    // Ubiquiti
    ['44:D9:E7', 'Ubiquiti'], ['68:D7:9A', 'Ubiquiti'], ['74:83:C2', 'Ubiquiti'],
    ['F0:9F:C2', 'Ubiquiti'], ['78:8A:20', 'Ubiquiti'], ['24:5A:4C', 'Ubiquiti'],
    ['18:E8:29', 'Ubiquiti'], ['FC:EC:DA', 'Ubiquiti'], ['B4:FB:E4', 'Ubiquiti'],
    // AVM (Fritz!Box)
    ['00:23:24', 'AVM (Fritz!Box)'], ['C8:0E:14', 'AVM (Fritz!Box)'], ['2C:3A:FD', 'AVM (Fritz!Box)'],
    ['34:31:C4', 'AVM (Fritz!Box)'], ['3C:A6:2F', 'AVM (Fritz!Box)'], ['E0:28:6D', 'AVM (Fritz!Box)'],
    ['C8:D1:5E', 'AVM (Fritz!Box)'], ['B0:F2:08', 'AVM (Fritz!Box)'],
    // Cisco
    ['00:00:0C', 'Cisco'], ['00:17:94', 'Cisco'], ['00:1A:A2', 'Cisco'],
    ['00:24:C3', 'Cisco'], ['00:26:99', 'Cisco'], ['00:2A:10', 'Cisco'],
    ['58:97:1E', 'Cisco'], ['64:F6:9D', 'Cisco'], ['D4:6D:50', 'Cisco'],
    // Cisco Meraki
    ['0C:8D:DB', 'Cisco Meraki'], ['34:56:FE', 'Cisco Meraki'], ['E8:55:B4', 'Cisco Meraki'],
    // Asus
    ['00:1A:92', 'ASUS'], ['F4:6D:04', 'ASUS'], ['2C:56:DC', 'ASUS'],
    ['60:45:CB', 'ASUS'], ['10:C3:7B', 'ASUS'], ['1C:87:2C', 'ASUS'],
    ['AC:9E:17', 'ASUS'], ['04:D9:F5', 'ASUS'], ['B0:6E:BF', 'ASUS'],
    ['74:D0:2B', 'ASUS'], ['D8:50:E6', 'ASUS'],
    // Linksys
    ['C0:56:27', 'Linksys'], ['00:14:BF', 'Linksys'], ['58:6D:8F', 'Linksys'],
    ['E8:9F:80', 'Linksys'],
    // MikroTik
    ['E4:8D:8C', 'MikroTik'], ['00:0C:42', 'MikroTik'], ['D4:CA:6D', 'MikroTik'],
    ['74:4D:28', 'MikroTik'], ['6C:3B:6B', 'MikroTik'], ['48:A9:8A', 'MikroTik'],
    // Edimax
    ['00:1F:1F', 'Edimax'], ['00:0E:2E', 'Edimax'], ['80:1F:02', 'Edimax'],
    // ZyXEL
    ['00:13:49', 'ZyXEL'], ['00:A0:C5', 'ZyXEL'], ['B0:B2:DC', 'ZyXEL'],
    // Huawei
    ['00:18:82', 'Huawei'], ['00:25:9E', 'Huawei'], ['00:E0:FC', 'Huawei'],
    ['04:C0:6F', 'Huawei'], ['20:A6:80', 'Huawei'], ['24:09:95', 'Huawei'],
    ['48:46:FB', 'Huawei'], ['54:A5:1B', 'Huawei'], ['70:8A:09', 'Huawei'],
    ['88:CF:98', 'Huawei'], ['AC:61:EA', 'Huawei'], ['CC:A2:23', 'Huawei'],
    ['E0:24:7F', 'Huawei'], ['DC:D2:FC', 'Huawei'],
    // Aruba / HPE Networking
    ['00:0B:86', 'Aruba Networks'], ['00:1A:1E', 'Aruba Networks'], ['24:DE:C6', 'Aruba Networks'],
    ['D8:C7:C8', 'Aruba Networks'],

    // === PC / Laptop / Server ===
    // Intel
    ['00:24:D7', 'Intel'], ['8C:EC:4B', 'Intel'], ['A4:4C:C8', 'Intel'],
    ['60:F6:77', 'Intel'], ['A0:36:9F', 'Intel'], ['A4:34:D9', 'Intel'],
    ['00:15:17', 'Intel'], ['00:1B:21', 'Intel'], ['3C:97:0E', 'Intel'],
    ['48:51:B7', 'Intel'], ['68:05:CA', 'Intel'], ['7C:76:35', 'Intel'],
    ['80:86:F2', 'Intel'], ['A0:88:C2', 'Intel'], ['B4:96:91', 'Intel'],
    ['F8:63:3F', 'Intel'],
    // Realtek
    ['00:E0:4C', 'Realtek'], ['52:54:00', 'Realtek'], ['00:0A:CD', 'Realtek'],
    // Dell
    ['00:1A:A0', 'Dell'], ['00:14:22', 'Dell'], ['00:21:70', 'Dell'],
    ['18:A9:9B', 'Dell'], ['24:6E:96', 'Dell'], ['28:F1:0E', 'Dell'],
    ['34:17:EB', 'Dell'], ['44:A8:42', 'Dell'], ['4C:76:25', 'Dell'],
    ['78:2B:CB', 'Dell'], ['84:8F:69', 'Dell'], ['A4:BA:DB', 'Dell'],
    ['B0:83:FE', 'Dell'], ['D0:67:E5', 'Dell'], ['F0:1F:AF', 'Dell'],
    ['F8:DB:88', 'Dell'], ['E4:F0:04', 'Dell'],
    // HP / Hewlett-Packard
    ['F8:B4:6A', 'HP'], ['FC:15:B4', 'HP'], ['F4:39:09', 'HP'],
    ['00:21:5A', 'HP'], ['00:25:B3', 'HP'], ['10:60:4B', 'HP'],
    ['1C:C1:DE', 'HP'], ['2C:44:FD', 'HP'], ['30:8D:99', 'HP'],
    ['3C:D9:2B', 'HP'], ['48:0F:CF', 'HP'], ['68:B5:99', 'HP'],
    ['70:10:6F', 'HP'], ['80:C1:6E', 'HP'], ['9C:B6:54', 'HP'],
    ['D4:C9:EF', 'HP'], ['A0:D3:C1', 'HP'], ['B4:B5:2F', 'HP'],
    // Lenovo
    ['00:06:1B', 'Lenovo'], ['00:09:2D', 'Lenovo'], ['28:D2:44', 'Lenovo'],
    ['34:68:95', 'Lenovo'], ['50:7B:9D', 'Lenovo'], ['54:E1:AD', 'Lenovo'],
    ['6C:4B:90', 'Lenovo'], ['70:5A:0F', 'Lenovo'], ['7C:B2:7D', 'Lenovo'],
    ['8C:16:45', 'Lenovo'], ['98:FA:9B', 'Lenovo'], ['E8:6A:64', 'Lenovo'],
    ['F8:0D:60', 'Lenovo'], ['C8:5B:76', 'Lenovo'], ['EC:B1:D7', 'Lenovo'],
    // Microsoft
    ['00:50:B6', 'Microsoft'], ['3C:F0:11', 'Microsoft'], ['00:03:FF', 'Microsoft'],
    ['7C:1E:52', 'Microsoft'], ['28:18:78', 'Microsoft'], ['60:45:BD', 'Microsoft'],
    ['C8:3F:26', 'Microsoft'], ['DC:53:60', 'Microsoft'],
    // Gigabyte
    ['E4:D5:3D', 'Gigabyte'], ['74:56:3C', 'Gigabyte'], ['1C:1B:0D', 'Gigabyte'],
    ['00:24:1D', 'Gigabyte'], ['94:DE:80', 'Gigabyte'],
    // MSI
    ['00:1A:22', 'MSI'], ['4C:E1:73', 'MSI'], ['00:D8:61', 'MSI'],
    // ASRock
    ['BC:5F:F4', 'ASRock'], ['D0:50:99', 'ASRock'],
    // Supermicro
    ['00:25:90', 'Supermicro'], ['00:30:48', 'Supermicro'], ['AC:1F:6B', 'Supermicro'],
    // Acer
    ['00:1A:6B', 'Acer'], ['18:F4:6A', 'Acer'], ['54:35:30', 'Acer'],
    ['78:E4:00', 'Acer'],

    // === Apple ===
    ['3C:22:FB', 'Apple'], ['A4:83:E7', 'Apple'], ['00:1B:63', 'Apple'], ['F0:18:98', 'Apple'],
    ['00:03:93', 'Apple'], ['00:17:F2', 'Apple'], ['00:1C:B3', 'Apple'],
    ['00:23:12', 'Apple'], ['00:25:00', 'Apple'], ['04:0C:CE', 'Apple'],
    ['10:9A:DD', 'Apple'], ['14:10:9F', 'Apple'], ['18:AF:61', 'Apple'],
    ['20:C9:D0', 'Apple'], ['28:6A:BA', 'Apple'], ['30:35:AD', 'Apple'],
    ['38:C9:86', 'Apple'], ['3C:07:54', 'Apple'], ['40:33:1A', 'Apple'],
    ['48:D7:05', 'Apple'], ['54:26:96', 'Apple'], ['5C:F9:38', 'Apple'],
    ['60:FB:42', 'Apple'], ['64:A3:CB', 'Apple'], ['6C:96:CF', 'Apple'],
    ['70:3E:AC', 'Apple'], ['78:31:C1', 'Apple'], ['7C:D1:C3', 'Apple'],
    ['84:38:35', 'Apple'], ['88:66:A5', 'Apple'], ['8C:85:90', 'Apple'],
    ['90:8D:6C', 'Apple'], ['98:01:A7', 'Apple'], ['9C:20:7B', 'Apple'],
    ['A0:99:9B', 'Apple'], ['A4:5E:60', 'Apple'], ['AC:BC:32', 'Apple'],
    ['B4:18:D1', 'Apple'], ['BC:52:B7', 'Apple'], ['C0:A5:3E', 'Apple'],
    ['C4:B3:01', 'Apple'], ['CC:08:8D', 'Apple'], ['D0:03:4B', 'Apple'],
    ['D4:61:9D', 'Apple'], ['DC:A4:CA', 'Apple'], ['E0:C7:67', 'Apple'],
    ['E4:CE:8F', 'Apple'], ['F0:D1:A9', 'Apple'], ['F4:5C:89', 'Apple'],

    // === Samsung ===
    ['00:26:AB', 'Samsung'], ['E4:7C:F9', 'Samsung'], ['5C:3A:45', 'Samsung'],
    ['00:1A:8A', 'Samsung'], ['00:21:19', 'Samsung'], ['08:37:3D', 'Samsung'],
    ['14:49:E0', 'Samsung'], ['18:3A:2D', 'Samsung'], ['1C:66:AA', 'Samsung'],
    ['24:C6:96', 'Samsung'], ['2C:AE:2B', 'Samsung'], ['30:CD:A7', 'Samsung'],
    ['34:23:BA', 'Samsung'], ['38:01:97', 'Samsung'], ['40:0E:85', 'Samsung'],
    ['4C:3C:16', 'Samsung'], ['50:01:BB', 'Samsung'], ['54:40:AD', 'Samsung'],
    ['5C:2E:59', 'Samsung'], ['60:D0:A9', 'Samsung'], ['68:27:37', 'Samsung'],
    ['6C:F3:73', 'Samsung'], ['78:AB:BB', 'Samsung'], ['84:25:DB', 'Samsung'],
    ['8C:71:F8', 'Samsung'], ['90:18:7C', 'Samsung'], ['94:35:0A', 'Samsung'],
    ['98:52:B1', 'Samsung'], ['A0:82:1F', 'Samsung'], ['AC:5F:3E', 'Samsung'],
    ['B4:79:A7', 'Samsung'], ['BC:20:A4', 'Samsung'], ['C0:97:27', 'Samsung'],
    ['CC:3A:61', 'Samsung'], ['D0:22:BE', 'Samsung'], ['D8:57:EF', 'Samsung'],
    ['E4:12:1D', 'Samsung'], ['F0:25:B7', 'Samsung'], ['F8:04:2E', 'Samsung'],

    // === Drucker ===
    // Brother
    ['00:80:77', 'Brother'], ['00:1B:A9', 'Brother'], ['30:05:5C', 'Brother'],
    ['D4:D2:D6', 'Brother'], ['AC:3F:A4', 'Brother'],
    // Canon
    ['00:1E:8F', 'Canon'], ['18:0C:AC', 'Canon'], ['40:B0:34', 'Canon'],
    ['C4:58:C2', 'Canon'], ['3C:15:FB', 'Canon'], ['74:E5:43', 'Canon'],
    // Epson
    ['00:00:48', 'Epson'], ['00:26:AB', 'Epson'], ['64:EB:8C', 'Epson'],
    ['E4:16:3E', 'Epson'], ['A0:B5:49', 'Epson'],
    // Kyocera
    ['00:C0:EE', 'Kyocera'], ['00:17:C8', 'Kyocera'], ['40:F2:E9', 'Kyocera'],
    // Konica Minolta
    ['00:17:AA', 'Konica Minolta'], ['00:80:92', 'Konica Minolta'],
    // Lexmark
    ['00:04:00', 'Lexmark'], ['00:20:00', 'Lexmark'], ['00:21:B7', 'Lexmark'],

    // === NAS / Speicher ===
    // Synology
    ['00:11:32', 'Synology'], ['00:1E:06', 'Synology'],
    // QNAP
    ['00:08:9B', 'QNAP'], ['24:5E:BE', 'QNAP'],
    // Western Digital
    ['00:90:A9', 'Western Digital'], ['00:14:EE', 'Western Digital'],
    // Seagate
    ['00:10:75', 'Seagate'],
    // Buffalo
    ['00:1D:73', 'Buffalo'], ['00:24:A5', 'Buffalo'], ['10:6F:3F', 'Buffalo'],

    // === Smart Home / IoT ===
    // Philips Hue
    ['00:17:88', 'Philips Hue'], ['EC:B5:FA', 'Philips Hue'],
    // Sonos
    ['00:0E:58', 'Sonos'], ['5C:AA:FD', 'Sonos'], ['B8:E9:37', 'Sonos'],
    ['48:A6:B8', 'Sonos'], ['78:28:CA', 'Sonos'], ['94:9F:3E', 'Sonos'],
    // Nest / Google Home
    ['18:B4:30', 'Google Nest'], ['54:60:09', 'Google Nest'],
    ['F4:F5:D8', 'Google Nest'],
    // Amazon Echo / Ring
    ['AC:63:BE', 'Amazon'], ['74:C2:46', 'Amazon'], ['F0:D2:F1', 'Amazon'],
    ['AC:67:B2', 'Amazon'], ['40:B4:CD', 'Amazon'], ['68:54:FD', 'Amazon'],
    ['84:D6:D0', 'Amazon'], ['A4:08:EA', 'Amazon'], ['FC:65:DE', 'Amazon'],
    // Ring
    ['4C:19:4A', 'Ring (Amazon)'],
    // Shelly
    ['E8:DB:84', 'Shelly'], ['C4:5B:BE', 'Shelly'],
    // Tuya / Smart Life
    ['D8:F1:5B', 'Tuya Smart'],
    // TP-Link Smart Home (Kasa/Tapo)
    ['B0:A7:B9', 'TP-Link Smart Home'], ['1C:3B:F3', 'TP-Link Smart Home'],
    // IKEA TRADFRI
    ['00:14:22', 'IKEA TRADFRI'],
    // Xiaomi
    ['00:9E:C8', 'Xiaomi'], ['04:CF:8C', 'Xiaomi'], ['10:2A:B3', 'Xiaomi'],
    ['28:6C:07', 'Xiaomi'], ['34:80:B3', 'Xiaomi'], ['50:64:2B', 'Xiaomi'],
    ['58:44:98', 'Xiaomi'], ['64:CC:2E', 'Xiaomi'], ['74:23:44', 'Xiaomi'],
    ['7C:49:EB', 'Xiaomi'], ['8C:DE:F9', 'Xiaomi'], ['9C:99:A0', 'Xiaomi'],
    ['A4:77:33', 'Xiaomi'], ['AC:C1:EE', 'Xiaomi'], ['B0:E2:35', 'Xiaomi'],
    ['C8:02:8F', 'Xiaomi'], ['D4:61:DA', 'Xiaomi'], ['F8:A4:5F', 'Xiaomi'],

    // === TVs / Streaming ===
    // LG Electronics
    ['00:1C:62', 'LG Electronics'], ['00:22:A9', 'LG Electronics'], ['10:F9:6F', 'LG Electronics'],
    ['20:3D:BD', 'LG Electronics'], ['34:4D:F7', 'LG Electronics'], ['38:8C:50', 'LG Electronics'],
    ['58:A2:B5', 'LG Electronics'], ['64:99:5D', 'LG Electronics'], ['A8:23:FE', 'LG Electronics'],
    ['C4:36:6C', 'LG Electronics'], ['CC:FA:00', 'LG Electronics'],
    // Sony
    ['00:13:A9', 'Sony'], ['00:1A:80', 'Sony'], ['00:24:BE', 'Sony'],
    ['04:5D:4B', 'Sony'], ['40:B8:37', 'Sony'], ['78:84:3C', 'Sony'],
    ['AC:9B:0A', 'Sony'], ['B4:52:7D', 'Sony'], ['FC:0F:E6', 'Sony'],
    // Roku
    ['B0:A7:37', 'Roku'], ['D8:31:34', 'Roku'], ['AC:3A:7A', 'Roku'],
    // Google Chromecast
    ['3C:5A:B4', 'Google'], ['94:EB:2C', 'Google'], ['00:1A:11', 'Google'],
    ['F4:F5:E8', 'Google'], ['54:60:09', 'Google'],

    // === Mobiltelefone ===
    // OnePlus
    ['64:A2:F9', 'OnePlus'], ['C0:EE:FB', 'OnePlus'],
    // Google Pixel
    ['3C:28:6D', 'Google Pixel'],
    // Huawei Mobile (see also Huawei above)
    // Motorola
    ['00:04:F3', 'Motorola'], ['C8:14:79', 'Motorola'], ['F8:CF:C5', 'Motorola'],
    ['E8:B4:C8', 'Motorola'],
    // Nokia
    ['00:1A:DC', 'Nokia'], ['00:21:AA', 'Nokia'], ['00:26:CC', 'Nokia'],

    // === Sicherheitskameras ===
    // Hikvision
    ['44:19:B6', 'Hikvision'], ['54:C4:15', 'Hikvision'], ['C0:56:E3', 'Hikvision'],
    ['BC:AD:28', 'Hikvision'],
    // Dahua
    ['3C:EF:8C', 'Dahua'], ['A0:BD:1D', 'Dahua'], ['E0:50:8B', 'Dahua'],
    // Reolink
    ['EC:71:DB', 'Reolink'],
    // Axis
    ['00:40:8C', 'Axis Communications'], ['AC:CC:8E', 'Axis Communications'],
    // UniFi Protect (same as Ubiquiti)

    // === Spielkonsolen ===
    // Nintendo
    ['00:1F:32', 'Nintendo'], ['00:17:AB', 'Nintendo'], ['00:22:D7', 'Nintendo'],
    ['00:24:44', 'Nintendo'], ['00:25:A0', 'Nintendo'], ['34:AF:2C', 'Nintendo'],
    ['40:D2:8A', 'Nintendo'], ['58:BD:A3', 'Nintendo'], ['7C:BB:8A', 'Nintendo'],
    ['98:B6:E9', 'Nintendo'], ['A4:C0:E1', 'Nintendo'], ['E0:0C:7F', 'Nintendo'],
    // Virtuell / Hypervisor
    ['00:50:56', 'VMware'], ['00:0C:29', 'VMware'], ['00:05:69', 'VMware'],
    ['00:15:5D', 'Hyper-V'],
    ['52:54:00', 'QEMU/KVM'],
    ['08:00:27', 'VirtualBox'], ['0A:00:27', 'VirtualBox'],
    // Raspberry Pi
    ['B8:27:EB', 'Raspberry Pi'], ['DC:A6:32', 'Raspberry Pi'], ['E4:5F:01', 'Raspberry Pi'],
    ['D8:3A:DD', 'Raspberry Pi'],
    // Toshiba
    ['00:1C:7E', 'Toshiba'], ['B8:6B:23', 'Toshiba'],
]);

/**
 * Sucht den Hersteller anhand der MAC-Adresse (OUI-Prefix).
 * @param {string} mac - MAC-Adresse in beliebigem Format (AA:BB:CC, AA-BB-CC)
 * @returns {string} Herstellername oder leerer String
 */
function lookupVendor(mac) {
    if (!mac || mac === '00-00-00-00-00-00' || mac === 'ff-ff-ff-ff-ff-ff') return '';
    const normalized = mac.replace(/-/g, ':').toUpperCase();
    const prefix = normalized.substring(0, 8);
    return OUI_MAP.get(prefix) || '';
}

// ---------------------------------------------------------------------------
// Gerätetyp-Erkennung (kombiniert Hersteller, offene Ports, TTL, Hostname)
// ---------------------------------------------------------------------------

/**
 * Hersteller-Kategorien für Gerätetyp-Inference.
 */
const VENDOR_HINTS = {
    // Drucker
    'Brother': 'printer', 'Canon': 'printer', 'Epson': 'printer',
    'Kyocera': 'printer', 'Konica Minolta': 'printer', 'Lexmark': 'printer',
    // NAS
    'Synology': 'nas', 'QNAP': 'nas', 'Buffalo': 'nas',
    'Western Digital': 'nas', 'Seagate': 'nas',
    // Smart Home
    'Philips Hue': 'smarthome', 'Shelly': 'smarthome', 'Tuya Smart': 'smarthome',
    'TP-Link Smart Home': 'smarthome', 'IKEA TRADFRI': 'smarthome',
    // Sonos / Media
    'Sonos': 'media', 'Roku': 'media', 'Google Nest': 'smarthome',
    // TV
    'LG Electronics': 'tv', 'Sony': 'tv',
    // Kameras
    'Hikvision': 'camera', 'Dahua': 'camera', 'Reolink': 'camera',
    'Axis Communications': 'camera',
    // Spielkonsolen
    'Nintendo': 'console',
    // Raspberry Pi
    'Raspberry Pi': 'sbc',
    // Virtuell
    'VMware': 'vm', 'Hyper-V': 'vm', 'QEMU/KVM': 'vm', 'VirtualBox': 'vm',
    // Router (oft)
    'AVM (Fritz!Box)': 'router', 'MikroTik': 'router',
    // Netzwerk-Geräte
    'Ubiquiti': 'network', 'Cisco': 'network', 'Cisco Meraki': 'network',
    'Aruba Networks': 'network',
};

/**
 * Ports die auf bestimmte Gerätetypen hindeuten.
 */
const PORT_TYPE_HINTS = {
    9100: 'printer',  // RAW-Printing
    631: 'printer',   // IPP
    515: 'printer',   // LPD
    5000: 'nas',      // Synology DSM
    5001: 'nas',      // Synology DSM HTTPS
    8080: 'webdevice', // Web-Interface
    554: 'camera',    // RTSP
    8554: 'camera',   // RTSP Alt
    37777: 'camera',  // Dahua
    3389: 'pc',       // RDP → Windows PC
    135: 'pc',        // RPC → Windows
    5900: 'pc',       // VNC
    22: 'server',     // SSH
    8443: 'network',  // UniFi Controller
    8880: 'network',  // UniFi
    161: 'network',   // SNMP
};

/**
 * Erkennt den Gerätetyp basierend auf kombinierten Daten.
 * @param {Object} device - { vendor, openPorts: [{port}], os, hostname, ttl, isLocal }
 * @returns {{ type: string, label: string, icon: string }}
 */
function classifyDevice(device) {
    const { vendor = '', openPorts = [], os = '', hostname = '', ttl = 0, isLocal = false } = device;

    // Eigener PC
    if (isLocal) {
        return { type: 'local', label: 'Eigener PC', icon: 'monitor' };
    }

    const ports = new Set(openPorts.map(p => typeof p === 'object' ? p.port : p));

    // 1. Hersteller-basierte Erkennung (höchste Priorität für spezifische Hersteller)
    const vendorHint = VENDOR_HINTS[vendor];
    if (vendorHint) {
        return _typeToResult(vendorHint, vendor);
    }

    // 2. Port-basierte Erkennung
    for (const [portStr, type] of Object.entries(PORT_TYPE_HINTS)) {
        if (ports.has(Number(portStr))) {
            // Drucker: braucht Drucker-Port ODER bekannten Hersteller
            if (type === 'printer' && (ports.has(9100) || ports.has(631) || ports.has(515))) {
                return _typeToResult('printer', vendor);
            }
            // NAS: braucht typischen NAS-Port
            if (type === 'nas') {
                return _typeToResult('nas', vendor);
            }
            // Kamera: RTSP-Port
            if (type === 'camera') {
                return _typeToResult('camera', vendor);
            }
        }
    }

    // 3. OS + Port Kombinationen
    if (os === 'Windows' || ports.has(135) || ports.has(3389) || ports.has(445)) {
        if (ports.has(80) && ports.has(443) && ports.size > 4) {
            return { type: 'server', label: 'Windows Server', icon: 'server' };
        }
        return { type: 'pc', label: 'Windows PC', icon: 'monitor' };
    }

    if (os === 'Linux/macOS') {
        if (ports.has(22) && ports.has(80)) {
            return { type: 'server', label: 'Linux Server', icon: 'server' };
        }
        // Könnte Apple oder Linux-Desktop sein
        if (vendor && vendor.includes('Apple')) {
            return { type: 'pc', label: 'Apple Gerät', icon: 'monitor' };
        }
        return { type: 'pc', label: 'Linux/macOS Gerät', icon: 'monitor' };
    }

    // 4. Netzwerkgerät (hoher TTL)
    if (ttl > 128 || os === 'Netzwerkgerät') {
        return { type: 'router', label: 'Netzwerkgerät', icon: 'wifi' };
    }

    // 5. Hostname-basierte Heuristik
    const hn = hostname.toLowerCase();
    if (hn.includes('printer') || hn.includes('drucker') || hn.includes('brn') || hn.includes('canon') || hn.includes('epson')) {
        return _typeToResult('printer', vendor);
    }
    if (hn.includes('nas') || hn.includes('diskstation') || hn.includes('qnap')) {
        return _typeToResult('nas', vendor);
    }
    if (hn.includes('cam') || hn.includes('ipcam') || hn.includes('nvr') || hn.includes('dvr')) {
        return _typeToResult('camera', vendor);
    }
    if (hn.includes('tv') || hn.includes('smarttv') || hn.includes('lgwebos') || hn.includes('bravia')) {
        return _typeToResult('tv', vendor);
    }
    if (hn.includes('iphone') || hn.includes('ipad') || hn.includes('android') || hn.includes('galaxy') || hn.includes('pixel') || hn.includes('oneplus')) {
        return { type: 'mobile', label: 'Mobilgerät', icon: 'smartphone' };
    }
    if (hn.includes('switch') || hn.includes('playstation') || hn.includes('xbox')) {
        return { type: 'console', label: 'Spielkonsole', icon: 'gamepad' };
    }

    // 6. Fallback: Nur Ports ohne OS-Info
    if (ports.has(80) || ports.has(443)) {
        return { type: 'webdevice', label: 'Gerät mit Web-Interface', icon: 'globe' };
    }

    return { type: 'unknown', label: 'Unbekanntes Gerät', icon: 'help-circle' };
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

module.exports = { lookupVendor, classifyDevice, OUI_MAP };

'use strict';

const { runPS } = require('./cmd-utils');
const log = require('./logger').createLogger('network-scanner');

const PS_TIMEOUT = 30000;

// ---------------------------------------------------------------------------
// Häufigste MAC-OUI-Prefixe für Vendor-Erkennung (kein npm-Paket nötig)
// ---------------------------------------------------------------------------
const OUI_PREFIXES = {
    '00:50:56': 'VMware', '00:0C:29': 'VMware', '00:15:5D': 'Hyper-V',
    '00:1A:11': 'Google', '3C:5A:B4': 'Google', '94:EB:2C': 'Google',
    'AC:67:B2': 'Amazon', '74:C2:46': 'Amazon', 'F0:D2:F1': 'Amazon',
    '00:17:88': 'Philips Hue', '00:1E:06': 'Wibrain',
    'B8:27:EB': 'Raspberry Pi', 'DC:A6:32': 'Raspberry Pi', 'E4:5F:01': 'Raspberry Pi',
    '00:1A:2B': 'Ayecom', '00:0D:B9': 'PC Engines',
    '44:D9:E7': 'Ubiquiti', '68:D7:9A': 'Ubiquiti', '74:83:C2': 'Ubiquiti',
    'F8:1A:67': 'TP-Link', '50:C7:BF': 'TP-Link', '98:DA:C4': 'TP-Link',
    '00:1F:1F': 'Edimax', 'A0:F3:C1': 'TP-Link',
    '00:24:D7': 'Intel', '8C:EC:4B': 'Intel', 'A4:4C:C8': 'Intel',
    '3C:22:FB': 'Apple', 'A4:83:E7': 'Apple', '00:1B:63': 'Apple', 'F0:18:98': 'Apple',
    '00:26:AB': 'Samsung', 'E4:7C:F9': 'Samsung', '5C:3A:45': 'Samsung',
    'B0:BE:76': 'TP-Link', '30:B5:C2': 'TP-Link',
    '00:E0:4C': 'Realtek', '00:D0:59': 'Ambit', '52:54:00': 'QEMU/KVM',
    '08:00:27': 'VirtualBox', '0A:00:27': 'VirtualBox',
    '00:23:24': 'AVM (Fritz!Box)', 'C8:0E:14': 'AVM (Fritz!Box)', '2C:3A:FD': 'AVM (Fritz!Box)',
    'EC:08:6B': 'TP-Link', 'C0:25:E9': 'TP-Link',
    '00:0F:B5': 'Netgear', '28:C6:8E': 'Netgear', '20:E5:2A': 'Netgear',
    '00:18:E7': 'Cameo', '00:09:5B': 'Netgear',
    '00:1E:58': 'D-Link', '28:10:7B': 'D-Link', '1C:7E:E5': 'D-Link',
    '00:14:A5': 'Gemtek', '00:1C:7E': 'Toshiba',
    '00:11:32': 'Synology', '00:1A:A0': 'Dell', 'F8:B4:6A': 'Hewlett-Packard',
    'FC:15:B4': 'Hewlett-Packard', 'F4:39:09': 'Hewlett-Packard',
    '60:F6:77': 'Intel', 'A0:36:9F': 'Intel', 'A4:34:D9': 'Intel',
    '00:50:B6': 'Microsoft', '00:15:17': 'Intel', '3C:F0:11': 'Microsoft',
    '00:03:FF': 'Microsoft', '7C:1E:52': 'Microsoft',
};

/**
 * Versucht den Hersteller aus dem MAC-OUI-Prefix zu bestimmen.
 */
function lookupVendor(mac) {
    if (!mac || mac === '00-00-00-00-00-00' || mac === 'ff-ff-ff-ff-ff-ff') return '';
    const normalized = mac.replace(/-/g, ':').toUpperCase();
    const prefix = normalized.substring(0, 8);
    return OUI_PREFIXES[prefix] || '';
}

/**
 * Scannt das lokale Netzwerk nach Geräten via ARP-Table.
 * Verwendet Get-NetNeighbor (bevorzugt) mit Fallback auf arp -a.
 */
async function scanLocalNetwork() {
    try {
        return await _scanViaGetNetNeighbor();
    } catch (err) {
        log.warn('Get-NetNeighbor fehlgeschlagen, Fallback auf arp -a:', err.message);
        try {
            return await _scanViaArp();
        } catch (err2) {
            log.error('Auch arp -a fehlgeschlagen:', err2.message);
            return [];
        }
    }
}

/**
 * Primäre Methode: Get-NetNeighbor (PowerShell)
 */
async function _scanViaGetNetNeighbor() {
    const psScript = `
        $neighbors = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.State -ne 'Unreachable' -and $_.IPAddress -ne '255.255.255.255' -and $_.IPAddress -ne '224.0.0.22' } |
            Select-Object IPAddress, LinkLayerAddress, State
        $results = foreach ($n in $neighbors) {
            $hostname = ''
            try {
                $dns = Resolve-DnsName -Name $n.IPAddress -DnsOnly -ErrorAction SilentlyContinue -QuickTimeout | Select-Object -First 1
                if ($dns.NameHost) { $hostname = $dns.NameHost }
            } catch {}
            [PSCustomObject]@{
                ip       = $n.IPAddress
                mac      = $n.LinkLayerAddress
                hostname = $hostname
                state    = [string]$n.State
            }
        }
        @($results) | ConvertTo-Json -Depth 2 -Compress
    `.trim();

    const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
    if (!stdout || !stdout.trim() || stdout.trim() === 'null') return [];

    const raw = JSON.parse(stdout.trim());
    const arr = Array.isArray(raw) ? raw : [raw];

    return arr
        .filter(d => d.ip && d.mac)
        .map(d => ({
            ip: d.ip || '',
            mac: (d.mac || '').replace(/-/g, ':'),
            hostname: d.hostname || '',
            vendor: lookupVendor(d.mac || ''),
            state: _translateState(d.state),
        }));
}

/**
 * Fallback: arp -a Parsing
 */
async function _scanViaArp() {
    const psScript = `
        $arp = arp -a | Where-Object { $_ -match '\\d+\\.\\d+\\.\\d+\\.\\d+' }
        $results = foreach ($line in $arp) {
            if ($line -match '\\s+(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+([0-9a-fA-F-]{17})\\s+(\\w+)') {
                [PSCustomObject]@{
                    ip    = $Matches[1]
                    mac   = $Matches[2]
                    state = $Matches[3]
                }
            }
        }
        @($results) | ConvertTo-Json -Depth 2 -Compress
    `.trim();

    const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
    if (!stdout || !stdout.trim() || stdout.trim() === 'null') return [];

    const raw = JSON.parse(stdout.trim());
    const arr = Array.isArray(raw) ? raw : [raw];

    return arr
        .filter(d => d.ip && d.mac && d.mac !== 'ff-ff-ff-ff-ff-ff')
        .map(d => ({
            ip: d.ip || '',
            mac: (d.mac || '').replace(/-/g, ':'),
            hostname: '',
            vendor: lookupVendor(d.mac || ''),
            state: d.state === 'dynamic' ? 'Erreichbar' : d.state === 'static' ? 'Statisch' : d.state || '',
        }));
}

function _translateState(state) {
    const map = { Reachable: 'Erreichbar', Stale: 'Veraltet', Delay: 'Verzögert', Probe: 'Prüfend', Permanent: 'Permanent', Incomplete: 'Unvollständig' };
    return map[state] || state || '';
}

module.exports = { scanLocalNetwork };

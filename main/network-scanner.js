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

// ---------------------------------------------------------------------------
// OS-Erkennung via TTL
// ---------------------------------------------------------------------------
function _detectOS(ttl) {
    if (!ttl || ttl <= 0) return '';
    if (ttl <= 64) return 'Linux/macOS';
    if (ttl <= 128) return 'Windows';
    return 'Netzwerkgerät';
}

// ---------------------------------------------------------------------------
// Port-Labels
// ---------------------------------------------------------------------------
const PORT_LABELS = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
    110: 'POP3', 135: 'RPC', 139: 'NetBIOS', 143: 'IMAP', 443: 'HTTPS',
    445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP',
    5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
};

// ---------------------------------------------------------------------------
// Aktiver Netzwerk-Scan: Ping Sweep + Port Scan + OS Detection + SMB Shares
// Alles in einem einzigen PowerShell-Prozess (kein Starvation)
// ---------------------------------------------------------------------------

/**
 * Erkennt das lokale Subnetz.
 * @returns {Promise<{subnet: string, prefixLength: number, localIP: string}>}
 */
async function _detectSubnet() {
    const psScript = `
        $ip = Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'Loopback' } |
            Sort-Object -Property InterfaceMetric |
            Select-Object -First 1
        if ($ip) {
            [PSCustomObject]@{
                ip = $ip.IPAddress
                prefix = $ip.PrefixLength
            } | ConvertTo-Json -Compress
        } else {
            Write-Output 'null'
        }
    `.trim();

    const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
    if (!stdout || stdout.trim() === 'null') return null;

    const data = JSON.parse(stdout.trim());
    const parts = data.ip.split('.');
    const subnet = parts.slice(0, 3).join('.');
    return { subnet, prefixLength: data.prefix, localIP: data.ip };
}

/**
 * Aktiver Netzwerk-Scan mit Ping Sweep, Port Scan, OS-Erkennung und SMB-Shares.
 * Alles in EINEM PowerShell-Prozess um Starvation zu vermeiden.
 * @param {Function} onProgress - Callback für Fortschritt: { phase, current, total, ip }
 */
async function scanNetworkActive(onProgress) {
    // Phase 1: Subnetz erkennen
    if (onProgress) onProgress({ phase: 'init', current: 0, total: 0, message: 'Subnetz wird erkannt...' });

    const subnetInfo = await _detectSubnet();
    if (!subnetInfo) {
        throw new Error('Kein aktives Netzwerk-Interface gefunden');
    }

    log.info(`Aktiver Scan startet: ${subnetInfo.subnet}.0/${subnetInfo.prefixLength}`);
    if (onProgress) onProgress({ phase: 'ping', current: 0, total: 254, message: `Scanne ${subnetInfo.subnet}.0/24...` });

    // Phase 2: Ping Sweep (parallelisiert in PowerShell)
    const pingSweepScript = `
        $subnet = '${subnetInfo.subnet}'
        $results = [System.Collections.Concurrent.ConcurrentBag[PSCustomObject]]::new()
        $ips = 1..254
        $ips | ForEach-Object -ThrottleLimit 50 -Parallel {
            $ip = "$($using:subnet).$_"
            $ping = Test-Connection -ComputerName $ip -Count 1 -TimeoutSeconds 1 -ErrorAction SilentlyContinue
            if ($ping -and $ping.Status -eq 'Success') {
                $ttl = $ping.Reply.Options.Ttl
                $rtt = $ping.Reply.RoundtripTime
                $hostname = ''
                try {
                    $dns = [System.Net.Dns]::GetHostEntry($ip)
                    if ($dns.HostName -and $dns.HostName -ne $ip) { $hostname = $dns.HostName }
                } catch {}
                ($using:results).Add([PSCustomObject]@{ ip=$ip; ttl=$ttl; rtt=$rtt; hostname=$hostname })
            }
        }
        @($results) | Sort-Object { [version]$_.ip } | ConvertTo-Json -Compress
    `.trim();

    let onlineDevices = [];
    try {
        const { stdout } = await runPS(pingSweepScript, { timeout: 90000, maxBuffer: 5 * 1024 * 1024 });
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
            const raw = JSON.parse(stdout.trim());
            onlineDevices = Array.isArray(raw) ? raw : [raw];
        }
    } catch (err) {
        log.error('Ping Sweep fehlgeschlagen:', err.message);
        throw new Error('Ping Sweep fehlgeschlagen: ' + err.message);
    }

    log.info(`Ping Sweep: ${onlineDevices.length} Geräte online`);
    if (onProgress) onProgress({ phase: 'ports', current: 0, total: onlineDevices.length, message: `${onlineDevices.length} Geräte gefunden, scanne Ports...` });

    // Phase 3: Port Scan + MAC-Auflösung (für alle online-Geräte)
    const ipList = onlineDevices.map(d => `'${d.ip}'`).join(',');
    const portScanScript = `
        $ips = @(${ipList})
        $ports = @(22, 80, 135, 443, 445, 3389, 8080)
        $arp = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue
        $arpMap = @{}
        foreach ($a in $arp) { $arpMap[$a.IPAddress] = $a.LinkLayerAddress }
        $results = foreach ($ip in $ips) {
            $openPorts = @()
            foreach ($port in $ports) {
                try {
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    $ar = $tcp.BeginConnect($ip, $port, $null, $null)
                    $wait = $ar.AsyncWaitHandle.WaitOne(500)
                    if ($wait -and $tcp.Connected) { $openPorts += $port }
                    $tcp.Close()
                } catch {}
            }
            $mac = if ($arpMap.ContainsKey($ip)) { $arpMap[$ip] } else { '' }
            [PSCustomObject]@{ ip=$ip; ports=($openPorts -join ','); mac=$mac }
        }
        @($results) | ConvertTo-Json -Compress
    `.trim();

    let portResults = [];
    try {
        const timeout = Math.max(60000, onlineDevices.length * 5000);
        const { stdout } = await runPS(portScanScript, { timeout: Math.min(timeout, 180000), maxBuffer: 5 * 1024 * 1024 });
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
            const raw = JSON.parse(stdout.trim());
            portResults = Array.isArray(raw) ? raw : [raw];
        }
    } catch (err) {
        log.warn('Port Scan fehlgeschlagen (Ergebnisse ohne Ports):', err.message);
    }

    const portMap = new Map();
    for (const r of portResults) {
        portMap.set(r.ip, {
            ports: r.ports ? r.ports.split(',').map(Number).filter(Boolean) : [],
            mac: r.mac || '',
        });
    }

    if (onProgress) onProgress({ phase: 'shares', current: 0, total: 0, message: 'SMB-Freigaben werden geprüft...' });

    // Phase 4: SMB-Shares für Geräte mit Port 445
    const smbDevices = onlineDevices.filter(d => {
        const info = portMap.get(d.ip);
        return info && info.ports.includes(445);
    });

    let sharesMap = new Map();
    if (smbDevices.length > 0) {
        const smbIpList = smbDevices.map(d => `'${d.ip}'`).join(',');
        const smbScript = `
            $ips = @(${smbIpList})
            $results = foreach ($ip in $ips) {
                $shares = @()
                try {
                    $output = net view "\\\\$ip" 2>&1
                    foreach ($line in $output) {
                        if ($line -match '^(\\S+)\\s+(Platte|Disk|Datenträger)') {
                            $shares += $Matches[1]
                        }
                    }
                } catch {}
                [PSCustomObject]@{ ip=$ip; shares=($shares -join ',') }
            }
            @($results) | ConvertTo-Json -Compress
        `.trim();

        try {
            const { stdout } = await runPS(smbScript, { timeout: 60000 });
            if (stdout && stdout.trim() && stdout.trim() !== 'null') {
                const raw = JSON.parse(stdout.trim());
                const arr = Array.isArray(raw) ? raw : [raw];
                for (const r of arr) {
                    if (r.shares) sharesMap.set(r.ip, r.shares.split(',').filter(Boolean));
                }
            }
        } catch (err) {
            log.warn('SMB-Shares konnten nicht ermittelt werden:', err.message);
        }
    }

    // Ergebnis zusammenbauen
    const devices = onlineDevices.map(d => {
        const portInfo = portMap.get(d.ip) || { ports: [], mac: '' };
        const mac = portInfo.mac.replace(/-/g, ':');
        const openPorts = portInfo.ports.map(p => ({ port: p, label: PORT_LABELS[p] || `${p}` }));
        const shares = sharesMap.get(d.ip) || [];
        const isLocal = d.ip === subnetInfo.localIP;

        return {
            ip: d.ip,
            hostname: d.hostname || '',
            mac,
            vendor: lookupVendor(portInfo.mac || ''),
            os: _detectOS(d.ttl),
            ttl: d.ttl || 0,
            rtt: d.rtt || 0,
            online: true,
            openPorts,
            shares,
            isLocal,
            state: 'Online',
        };
    });

    if (onProgress) onProgress({ phase: 'done', current: devices.length, total: devices.length, message: `Scan abgeschlossen: ${devices.length} Geräte` });

    log.info(`Aktiver Scan abgeschlossen: ${devices.length} Geräte, ${devices.reduce((s, d) => s + d.openPorts.length, 0)} offene Ports`);

    return {
        subnet: `${subnetInfo.subnet}.0/${subnetInfo.prefixLength}`,
        localIP: subnetInfo.localIP,
        devices,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Port-Scan für ein einzelnes Gerät (mehr Ports).
 * @param {string} ip - IP-Adresse
 */
async function scanDevicePorts(ip) {
    const psScript = `
        $ip = '${ip}'
        $ports = @(21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 3306, 3389, 5432, 5900, 8080, 8443, 9090)
        $results = foreach ($port in $ports) {
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $ar = $tcp.BeginConnect($ip, $port, $null, $null)
                $wait = $ar.AsyncWaitHandle.WaitOne(500)
                if ($wait -and $tcp.Connected) {
                    [PSCustomObject]@{ port=$port; open=$true }
                }
                $tcp.Close()
            } catch {}
        }
        @($results) | ConvertTo-Json -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, { timeout: 30000 });
        if (!stdout || stdout.trim() === 'null' || !stdout.trim()) return [];
        const raw = JSON.parse(stdout.trim());
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(r => ({ port: r.port, label: PORT_LABELS[r.port] || `${r.port}` }));
    } catch (err) {
        log.error('Port-Scan fehlgeschlagen für', ip, ':', err.message);
        return [];
    }
}

/**
 * Freigegebene Ordner eines Geräts.
 * @param {string} ip - IP-Adresse
 */
async function getSMBShares(ip) {
    const psScript = `
        $shares = @()
        try {
            $output = net view "\\\\${ip}" 2>&1
            foreach ($line in $output) {
                if ($line -match '^(\\S+)\\s+(Platte|Disk|Datenträger)\\s*(.*)') {
                    $shares += [PSCustomObject]@{ name=$Matches[1]; type='Disk'; remark=$Matches[3].Trim() }
                }
            }
        } catch {}
        @($shares) | ConvertTo-Json -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, { timeout: 15000 });
        if (!stdout || stdout.trim() === 'null' || !stdout.trim()) return [];
        const raw = JSON.parse(stdout.trim());
        return Array.isArray(raw) ? raw : [raw];
    } catch (err) {
        log.error('SMB-Shares fehlgeschlagen für', ip, ':', err.message);
        return [];
    }
}

module.exports = { scanLocalNetwork, scanNetworkActive, scanDevicePorts, getSMBShares };

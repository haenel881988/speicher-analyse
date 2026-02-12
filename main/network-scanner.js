'use strict';

const { runPS } = require('./cmd-utils');
const log = require('./logger').createLogger('network-scanner');
const { lookupVendorsBatch, classifyDevice } = require('./oui-database');

const PS_TIMEOUT = 30000;

/**
 * Validiert eine IPv4-Adresse (Schutz vor Command Injection in PS-Scripts).
 */
function _isValidIPv4(ip) {
    if (typeof ip !== 'string') return false;
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
        ip.split('.').every(p => { const n = Number(p); return n >= 0 && n <= 255; });
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

    const devices = arr
        .filter(d => d.ip && d.mac)
        .map(d => ({
            ip: d.ip || '',
            mac: (d.mac || '').replace(/-/g, ':'),
            hostname: d.hostname || '',
            vendor: '',
            state: _translateState(d.state),
        }));

    // Live OUI-Lookup (IEEE-Datenbank via API)
    const macs = devices.map(d => d.mac).filter(Boolean);
    if (macs.length > 0) {
        const vendorMap = await lookupVendorsBatch(macs);
        for (const device of devices) {
            device.vendor = vendorMap.get(device.mac) || '';
        }
    }

    return devices;
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

    const devices = arr
        .filter(d => d.ip && d.mac && d.mac !== 'ff-ff-ff-ff-ff-ff')
        .map(d => ({
            ip: d.ip || '',
            mac: (d.mac || '').replace(/-/g, ':'),
            hostname: '',
            vendor: '',
            state: d.state === 'dynamic' ? 'Erreichbar' : d.state === 'static' ? 'Statisch' : d.state || '',
        }));

    // Live OUI-Lookup (IEEE-Datenbank via API)
    const macs = devices.map(d => d.mac).filter(Boolean);
    if (macs.length > 0) {
        const vendorMap = await lookupVendorsBatch(macs);
        for (const device of devices) {
            device.vendor = vendorMap.get(device.mac) || '';
        }
    }

    return devices;
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
    445: 'SMB', 515: 'LPD', 554: 'RTSP', 631: 'IPP',
    993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP',
    5000: 'Synology', 5001: 'Synology-SSL', 5432: 'PostgreSQL',
    5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 9100: 'Drucker',
};

// ---------------------------------------------------------------------------
// Aktiver Netzwerk-Scan: Ping Sweep + Port Scan + OS Detection + SMB Shares
// Alles in einem einzigen PowerShell-Prozess (kein Starvation)
// ---------------------------------------------------------------------------

/**
 * Erkennt das lokale Subnetz über die Default Route (= echtes LAN-Interface).
 * Filtert zuverlässig VPN-, Hyper-V- und virtuelle Interfaces aus.
 * @returns {Promise<{subnet: string, prefixLength: number, localIP: string}>}
 */
async function _detectSubnet() {
    const psScript = `
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Sort-Object -Property RouteMetric |
            Select-Object -First 1
        if ($route) {
            $ip = Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($ip) {
                [PSCustomObject]@{
                    ip = $ip.IPAddress
                    prefix = $ip.PrefixLength
                    iface = $ip.InterfaceAlias
                    gateway = $route.NextHop
                } | ConvertTo-Json -Compress
            } else { Write-Output 'null' }
        } else { Write-Output 'null' }
    `.trim();

    const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
    if (!stdout || stdout.trim() === 'null') return null;

    const data = JSON.parse(stdout.trim());
    const parts = data.ip.split('.');
    const subnet = parts.slice(0, 3).join('.');
    log.info(`Subnetz erkannt: ${subnet}.0/${data.prefix} (${data.iface}, Gateway: ${data.gateway})`);
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

    // Phase 2: Ping Sweep (.NET async — kompatibel mit PowerShell 5.1 UND 7)
    const pingSweepScript = `
        $subnet = '${subnetInfo.subnet}'
        $timeout = 1000
        $tasks = @{}
        1..254 | ForEach-Object {
            $ip = "$subnet.$_"
            $ping = New-Object System.Net.NetworkInformation.Ping
            $tasks[$ip] = $ping.SendPingAsync($ip, $timeout)
        }
        try { [System.Threading.Tasks.Task]::WaitAll($tasks.Values) } catch {}
        $online = @()
        foreach ($kv in $tasks.GetEnumerator()) {
            $t = $kv.Value
            if ($t.Status -eq 'RanToCompletion' -and $t.Result.Status -eq 'Success') {
                $r = $t.Result
                $hostname = ''
                try {
                    $dns = [System.Net.Dns]::GetHostEntry($kv.Key)
                    if ($dns.HostName -and $dns.HostName -ne $kv.Key) { $hostname = $dns.HostName }
                } catch {}
                $online += [PSCustomObject]@{
                    ip = $kv.Key
                    ttl = $r.Options.Ttl
                    rtt = $r.RoundtripTime
                    hostname = $hostname
                }
            }
        }
        @($online) | Sort-Object { [version]$_.ip } | ConvertTo-Json -Compress
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
        $ports = @(22, 80, 135, 443, 445, 515, 554, 631, 3389, 5000, 5001, 8080, 9100)
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

    // Live OUI-Lookup für alle gefundenen MAC-Adressen (IEEE-Datenbank via API)
    if (onProgress) onProgress({ phase: 'vendor', current: 0, total: 0, message: 'Hersteller werden identifiziert (IEEE-Datenbank)...' });

    const allMacs = onlineDevices
        .map(d => (portMap.get(d.ip) || { mac: '' }).mac)
        .filter(Boolean);
    const vendorMap = allMacs.length > 0 ? await lookupVendorsBatch(allMacs) : new Map();

    // Ergebnis zusammenbauen (mit Gerätetyp-Klassifizierung)
    const devices = onlineDevices.map(d => {
        const portInfo = portMap.get(d.ip) || { ports: [], mac: '' };
        const mac = portInfo.mac.replace(/-/g, ':');
        const openPorts = portInfo.ports.map(p => ({ port: p, label: PORT_LABELS[p] || `${p}` }));
        const shares = sharesMap.get(d.ip) || [];
        const isLocal = d.ip === subnetInfo.localIP;
        const vendor = vendorMap.get(portInfo.mac) || '';
        const os = _detectOS(d.ttl);

        // Gerätetyp-Erkennung (kombiniert Hersteller + Ports + OS + Hostname + TTL)
        const deviceType = classifyDevice({
            vendor, openPorts, os, hostname: d.hostname || '', ttl: d.ttl || 0, isLocal,
        });

        return {
            ip: d.ip,
            hostname: d.hostname || '',
            mac,
            vendor,
            os,
            ttl: d.ttl || 0,
            rtt: d.rtt || 0,
            online: true,
            openPorts,
            shares,
            isLocal,
            state: 'Online',
            deviceType: deviceType.type,
            deviceLabel: deviceType.label,
            deviceIcon: deviceType.icon,
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
    if (!_isValidIPv4(ip)) throw new Error('Ungültige IP-Adresse');
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
    if (!_isValidIPv4(ip)) throw new Error('Ungültige IP-Adresse');
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
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        if (!stdout || stdout.trim() === 'null' || !stdout.trim()) return [];
        const raw = JSON.parse(stdout.trim());
        return Array.isArray(raw) ? raw : [raw];
    } catch (err) {
        log.error('SMB-Shares fehlgeschlagen für', ip, ':', err.message);
        return [];
    }
}

module.exports = { scanLocalNetwork, scanNetworkActive, scanDevicePorts, getSMBShares };

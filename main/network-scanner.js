'use strict';

const { runPS } = require('./cmd-utils');
const log = require('./logger').createLogger('network-scanner');
const { lookupVendorsBatch, classifyDevice } = require('./oui-database');
const { identifyDevices } = require('./device-identify');
const { querySNMPBatch } = require('./snmp-scanner');

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
            Where-Object { $_.State -ne 'Unreachable' -and $_.IPAddress -ne '255.255.255.255' -and $_.IPAddress -notlike '224.*' -and $_.IPAddress -notlike '239.*' -and $_.IPAddress -notlike '169.254.*' } |
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
    445: 'SMB', 515: 'LPD', 554: 'RTSP', 631: 'IPP', 1400: 'Sonos',
    993: 'IMAPS', 995: 'POP3S', 3074: 'Xbox Live', 3306: 'MySQL', 3389: 'RDP',
    5000: 'HTTP', 5001: 'HTTPS', 5432: 'PostgreSQL',
    5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 8554: 'RTSP-Alt',
    9100: 'Drucker', 37777: 'Dahua',
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
    return { subnet, prefixLength: data.prefix, localIP: data.ip, gateway: data.gateway || '' };
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
    // DNS-Auflösung ebenfalls parallel (GetHostEntryAsync) statt sequenziell
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
        $onlineIPs = [System.Collections.Generic.List[hashtable]]::new()
        foreach ($kv in $tasks.GetEnumerator()) {
            $t = $kv.Value
            if ($t.Status -eq 'RanToCompletion' -and $t.Result.Status -eq 'Success') {
                $r = $t.Result
                $onlineIPs.Add(@{ ip=$kv.Key; ttl=$r.Options.Ttl; rtt=$r.RoundtripTime })
            }
        }
        $dnsTasks = @{}
        foreach ($d in $onlineIPs) {
            $dnsTasks[$d.ip] = [System.Net.Dns]::GetHostEntryAsync($d.ip)
        }
        try { [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]@($dnsTasks.Values), 10000) } catch {}
        $online = foreach ($d in $onlineIPs) {
            $hostname = ''
            $dt = $dnsTasks[$d.ip]
            if ($dt.Status -eq 'RanToCompletion') {
                try {
                    if ($dt.Result.HostName -and $dt.Result.HostName -ne $d.ip) { $hostname = $dt.Result.HostName }
                } catch {}
            }
            [PSCustomObject]@{ ip=$d.ip; ttl=$d.ttl; rtt=$d.rtt; hostname=$hostname }
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

    // Phase 2.5: ARP-Tabelle SEPARAT lesen (schnell, 15s)
    // MUSS getrennt vom Port-Scan laufen — wenn Port-Scan timeouted, gehen sonst alle MACs verloren!
    if (onProgress) onProgress({ phase: 'arp', current: 0, total: 0, message: 'MAC-Adressen werden aufgelöst...' });

    const macMap = new Map(); // IP → MAC (Dash-Format, z.B. "AA-BB-CC-DD-EE-FF")
    try {
        const arpScript = `
            $arp = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.LinkLayerAddress -and $_.LinkLayerAddress -ne '00-00-00-00-00-00' -and $_.LinkLayerAddress -ne 'FF-FF-FF-FF-FF-FF' }
            $results = foreach ($a in $arp) {
                [PSCustomObject]@{ ip=$a.IPAddress; mac=$a.LinkLayerAddress }
            }
            @($results) | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(arpScript, { timeout: 15000 });
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
            const raw = JSON.parse(stdout.trim());
            const arr = Array.isArray(raw) ? raw : [raw];
            for (const r of arr) {
                if (r.ip && r.mac) macMap.set(r.ip, r.mac);
            }
        }
        log.info(`ARP-Tabelle: ${macMap.size} MAC-Adressen aufgelöst`);
    } catch (err) {
        log.warn('ARP-Tabelle konnte nicht gelesen werden:', err.message);
    }

    // Phase 2.6: ARP-Geräte die NICHT im Ping Sweep sind → als zusätzliche Geräte hinzufügen (WU-1)
    // Das findet Smartphones, IoT-Geräte und andere die ICMP blockieren
    const pingIPs = new Set(onlineDevices.map(d => d.ip));
    let arpOnlyCount = 0;
    for (const [ip, mac] of macMap.entries()) {
        if (pingIPs.has(ip)) continue;  // Bereits via Ping gefunden
        if (ip === subnetInfo.localIP) continue;  // Eigener PC (wird separat behandelt)
        if (ip === subnetInfo.gateway) continue;  // Gateway (bereits via Ping)
        if (!ip.startsWith(subnetInfo.subnet + '.')) continue;  // Nur gleiches Subnetz
        // Multicast/Broadcast/Link-Local filtern (WU-6)
        const firstOctet = parseInt(ip.split('.')[0], 10);
        const lastOctet = parseInt(ip.split('.')[3], 10);
        if (lastOctet === 255 || lastOctet === 0) continue;
        if (firstOctet >= 224) continue;  // Multicast 224.0.0.0/4
        if (firstOctet === 169 && parseInt(ip.split('.')[1], 10) === 254) continue;  // Link-Local

        onlineDevices.push({ ip, ttl: 0, rtt: -1, hostname: '' });
        arpOnlyCount++;
    }
    if (arpOnlyCount > 0) {
        log.info(`ARP-Discovery: ${arpOnlyCount} zusätzliche Geräte (nicht via Ping erreichbar)`);
    }

    // Phase 3: Port Scan (NUR Ports, keine ARP-Daten mehr — die haben wir bereits)
    if (onProgress) onProgress({ phase: 'ports', current: 0, total: onlineDevices.length, message: `${onlineDevices.length} Geräte gefunden, scanne Ports...` });

    const ipList = onlineDevices.map(d => `'${d.ip}'`).join(',');
    // PARALLEL Port-Scan: Alle TCP-Connects gleichzeitig starten, dann warten.
    // Vorher: foreach IP → foreach Port (sequenziell) = N×18×500ms = sehr langsam.
    // Jetzt: Alle ConnectAsync gleichzeitig, WaitAll mit globalem Timeout.
    const portScanScript = `
        $ips = @(${ipList})
        $ports = @(22, 80, 135, 443, 445, 515, 554, 631, 1400, 3074, 3389, 5000, 5001, 5900, 8080, 8554, 9100, 37777)
        $timeoutMs = 3000
        $connections = [System.Collections.Generic.List[object]]::new()
        foreach ($ip in $ips) {
            foreach ($port in $ports) {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $connections.Add(@{ ip=$ip; port=$port; tcp=$tcp; task=$tcp.ConnectAsync($ip, $port) })
            }
        }
        $allTasks = [System.Threading.Tasks.Task[]]@($connections | ForEach-Object { $_.task })
        try { [System.Threading.Tasks.Task]::WaitAll($allTasks, $timeoutMs) } catch {}
        $openMap = @{}
        foreach ($c in $connections) {
            if ($c.task.Status -eq 'RanToCompletion' -and $c.tcp.Connected) {
                if (-not $openMap[$c.ip]) { $openMap[$c.ip] = [System.Collections.Generic.List[int]]::new() }
                $openMap[$c.ip].Add($c.port)
            }
            try { $c.tcp.Close() } catch {}
            try { $c.tcp.Dispose() } catch {}
        }
        $results = foreach ($ip in $ips) {
            [PSCustomObject]@{ ip=$ip; ports=if($openMap[$ip]){($openMap[$ip] -join ',')}else{''} }
        }
        @($results) | ConvertTo-Json -Compress
    `.trim();

    const portMap = new Map(); // IP → number[] (offene Ports)
    try {
        // Parallel: Alle Connects gleichzeitig, 3s LAN-Timeout + PS-Overhead
        const timeout = Math.min(Math.max(30000, onlineDevices.length * 500 + 20000), 90000);
        log.info(`Port Scan (parallel): ${onlineDevices.length} Geräte × 18 Ports, Timeout: ${Math.round(timeout / 1000)}s`);
        const { stdout } = await runPS(portScanScript, { timeout, maxBuffer: 5 * 1024 * 1024 });
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
            const raw = JSON.parse(stdout.trim());
            const portResults = Array.isArray(raw) ? raw : [raw];
            for (const r of portResults) {
                portMap.set(r.ip, r.ports ? r.ports.split(',').map(Number).filter(Boolean) : []);
            }
        }
    } catch (err) {
        log.warn('Port Scan fehlgeschlagen (Ergebnisse ohne Ports):', err.message);
    }

    if (onProgress) onProgress({ phase: 'shares', current: 0, total: 0, message: 'SMB-Freigaben werden geprüft...' });

    // Phase 4: SMB-Shares für Geräte mit Port 445
    const smbDevices = onlineDevices.filter(d => {
        const ports = portMap.get(d.ip);
        return ports && ports.includes(445);
    });

    let sharesMap = new Map();
    if (smbDevices.length > 0) {
        const smbIpList = smbDevices.map(d => `'${d.ip}'`).join(',');
        const smbScript = `
            $ips = @(${smbIpList})
            $maxConcurrent = 5
            $pool = [RunspaceFactory]::CreateRunspacePool(1, $maxConcurrent)
            $pool.Open()
            $scriptBlock = {
                param($ip)
                $shares = @()
                try {
                    $output = net view "\\\\$ip" 2>&1
                    foreach ($line in $output) {
                        if ($line -match '^(\\S+)\\s+(Platte|Disk|Datentr)') {
                            $shares += $Matches[1]
                        }
                    }
                } catch {}
                [PSCustomObject]@{ ip=$ip; shares=($shares -join ',') }
            }
            $jobs = foreach ($ip in $ips) {
                $ps = [PowerShell]::Create().AddScript($scriptBlock).AddArgument($ip)
                $ps.RunspacePool = $pool
                @{ ps=$ps; handle=$ps.BeginInvoke() }
            }
            $results = foreach ($j in $jobs) {
                try { $j.ps.EndInvoke($j.handle) } catch {}
                try { $j.ps.Dispose() } catch {}
            }
            $pool.Close()
            $pool.Dispose()
            @($results) | ConvertTo-Json -Compress
        `.trim();

        try {
            // Parallel: max 5 gleichzeitig, 10s pro net-view + PS-Overhead
            const smbTimeout = Math.min(Math.max(30000, smbDevices.length * 3000 + 15000), 60000);
            log.info(`SMB Shares (parallel, max 5): ${smbDevices.length} Geräte, Timeout: ${Math.round(smbTimeout / 1000)}s`);
            const { stdout } = await runPS(smbScript, { timeout: smbTimeout });
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

    // Phase 5+5.5+5.6: SNMP + Vendor-Lookup + Gerätemodell parallel (unabhängige Datenquellen)
    if (onProgress) onProgress({ phase: 'identify', current: 0, total: 0, message: 'SNMP + Hersteller + Gerätemodelle parallel...' });

    const snmpTargets = onlineDevices
        .filter(d => d.ip !== subnetInfo.localIP)
        .map(d => d.ip);

    const allMacs = onlineDevices
        .map(d => macMap.get(d.ip) || '')
        .filter(Boolean);

    const preliminaryDevices = onlineDevices.map(d => ({
        ip: d.ip,
        openPorts: (portMap.get(d.ip) || []).map(p => ({ port: p })),
    }));

    const [snmpMap, vendorMap, identityMap] = await Promise.all([
        // SNMP: braucht nur IP-Adressen
        querySNMPBatch(snmpTargets, (current, total) => {
            if (onProgress) onProgress({ phase: 'snmp', current, total, message: `SNMP ${current}/${total} abgefragt...` });
        }).catch(err => { log.warn('SNMP-Scan fehlgeschlagen:', err.message); return new Map(); }),

        // Vendor: braucht nur MAC-Adressen
        allMacs.length > 0
            ? lookupVendorsBatch(allMacs, (current, total) => {
                if (onProgress) onProgress({ phase: 'vendor', current, total, message: `Hersteller ${current}/${total} identifiziert...` });
            }).catch(err => { log.warn('Vendor-Lookup fehlgeschlagen:', err.message); return new Map(); })
            : Promise.resolve(new Map()),

        // Gerätemodell: braucht IP + Ports
        identifyDevices(preliminaryDevices, (current, total) => {
            if (onProgress) onProgress({ phase: 'identify', current, total, message: `Gerätemodelle ${current}/${total} geprüft...` });
        }).catch(err => { log.warn('Geräte-Identifikation fehlgeschlagen:', err.message); return new Map(); }),
    ]);

    // Phase 5.6: Lokaler PC — WMI (Hersteller + Modell dynamisch auslesen)
    let localPCInfo = null;
    try {
        if (onProgress) onProgress({ phase: 'identify', current: 0, total: 0, message: 'Lokaler PC wird identifiziert...' });
        const wmiScript = `
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Virtual*' -and $_.InterfaceDescription -notlike '*Hyper-V*' } | Select-Object -First 1
[PSCustomObject]@{ Manufacturer = $cs.Manufacturer; Model = $cs.Model; MAC = if($adapter) { $adapter.MacAddress } else { '' } } | ConvertTo-Json -Compress
        `.trim();
        const { stdout } = await runPS(wmiScript, { timeout: 10000 });
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
            localPCInfo = JSON.parse(stdout.trim());
        }
    } catch (err) {
        log.warn('WMI-Abfrage für lokalen PC fehlgeschlagen:', err.message);
    }

    // Ergebnis zusammenbauen (mit Gerätetyp-Klassifizierung + Modell-Identifikation)
    const devices = onlineDevices.map(d => {
        const isLocal = d.ip === subnetInfo.localIP;
        let macDash = macMap.get(d.ip) || '';
        // Lokaler PC: MAC via WMI ergänzen wenn ARP sie nicht hat (WU-31)
        if (!macDash && isLocal && localPCInfo && localPCInfo.MAC) {
            macDash = localPCInfo.MAC;
        }
        const mac = macDash.replace(/-/g, ':');
        const ports = portMap.get(d.ip) || [];
        const openPorts = ports.map(p => ({ port: p, label: PORT_LABELS[p] || `${p}` }));
        const shares = sharesMap.get(d.ip) || [];
        const isGateway = d.ip === subnetInfo.gateway;
        const vendor = vendorMap.get(macDash) || '';
        const os = _detectOS(d.ttl);
        const identity = identityMap.get(d.ip) || {};
        const snmpData = snmpMap.get(d.ip) || {};

        // SNMP-Daten in Identity mergen (Identity hat Vorrang, SNMP ergänzt fehlende Felder)
        if (snmpData.modelName && !identity.modelName) {
            identity.modelName = snmpData.modelName;
        }
        if (snmpData.firmwareVersion && !identity.firmwareVersion) {
            identity.firmwareVersion = snmpData.firmwareVersion;
        }
        if (snmpData.sysObjectID) {
            identity.snmpObjectID = snmpData.sysObjectID;
        }
        if (snmpData.sysDescr) {
            identity.snmpSysDescr = snmpData.sysDescr;
            identity.identifiedBy = identity.identifiedBy
                ? identity.identifiedBy + '+snmp'
                : 'snmp';
        }

        // mDNS-Daten sind bereits in identity (aus device-identify.js), aber Hostname ergänzen
        if (identity.mdnsHostname && !d.hostname) {
            d.hostname = identity.mdnsHostname;
        }

        // WMI-Daten für lokalen PC einfügen (dynamisch aus Hardware)
        if (isLocal && localPCInfo) {
            if (!identity.modelName && localPCInfo.Model) {
                identity.modelName = localPCInfo.Model;
                identity.identifiedBy = (identity.identifiedBy ? identity.identifiedBy + '+wmi' : 'wmi');
            }
        }

        // Hostname-basierte Modellerkennung (Gerät benennt sich selbst via DNS/mDNS) (WU-15)
        if (!identity.modelName && d.hostname) {
            const hn = (d.hostname || '').replace(/\.local\.?$/, '').replace(/\.galaxus\.box$/, '');
            const _setHostnameModel = (name) => {
                identity.modelName = name;
                identity.identifiedBy = (identity.identifiedBy ? identity.identifiedBy + '+hostname' : 'hostname');
            };
            if (/^xbox/i.test(hn)) {
                _setHostnameModel('Xbox Konsole');
            } else if (/^playstation|^ps[45]/i.test(hn)) {
                _setHostnameModel('PlayStation Konsole');
            } else if (/^(iphone|ipad|macbook|imac)/i.test(hn)) {
                _setHostnameModel(hn.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            } else if (/galaxy[- ]?[sa]\d/i.test(hn) || /^android[- ]/i.test(hn)) {
                _setHostnameModel(hn.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            } else if (/^echo[- ]/i.test(hn) || /^fire[- ]tv/i.test(hn)) {
                _setHostnameModel(hn.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            }
        }

        // Deterministische Identifizierung: Nur Fakten, keine Vermutungen
        // Kein synthetischer Fallback mehr — wenn kein Protokoll ein Modell liefert, bleibt es leer ("—")
        // SNMP sysName bleibt in snmpData.sysName (wird separat im Frontend als Tooltip angezeigt)
        const isConfirmed = !!(identity.modelName && identity.identifiedBy && identity.identifiedBy !== 'hostname');

        // Vendor-Enrichment: Lokaler PC bekommt WMI-Hersteller wenn MAC-Vendor fehlt
        const finalVendor = vendor || (isLocal && localPCInfo && localPCInfo.Manufacturer ? localPCInfo.Manufacturer : '');

        // Gerätetyp-Erkennung: Identity (Verhalten) VOR Hersteller (Name)
        const deviceType = classifyDevice({
            vendor: finalVendor, openPorts, os, hostname: d.hostname || '', ttl: d.ttl || 0, isLocal, isGateway,
            identity, mac, // UPnP/HTTP/IPP/SNMP Ergebnisse — das Gerät sagt was es IST
        });

        return {
            ip: d.ip,
            hostname: d.hostname || '',
            mac,
            vendor: finalVendor,
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
            modelName: identity.modelName || '',
            serialNumber: identity.serialNumber || '',
            firmwareVersion: identity.firmwareVersion || '',
            sshBanner: identity.sshBanner || '',
            snmpSysName: snmpData.sysName || '',
            snmpLocation: snmpData.sysLocation || '',
            snmpSysDescr: snmpData.sysDescr || '',
            mdnsServices: identity.mdnsServices || [],
            mdnsServiceTypes: identity.mdnsServiceTypes || [],
            wsdTypes: identity.wsdTypes || [],
            identifiedBy: identity.identifiedBy || '',
            isConfirmed,
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

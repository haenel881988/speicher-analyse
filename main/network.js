'use strict';

const path = require('path');
const http = require('http');
const { runPS, runSafe, isSafeShellArg } = require('./cmd-utils');
const log = require('./logger').createLogger('network');

const PS_TIMEOUT = 30000;
const PS_OPTS = { timeout: PS_TIMEOUT, maxBuffer: 10 * 1024 * 1024 };

// ---------------------------------------------------------------------------
// 1) getConnections – Aktive TCP-Verbindungen mit Prozess-Informationen
// ---------------------------------------------------------------------------
async function getConnections() {
    // Ein einziger PowerShell-Aufruf: Verbindungen abfragen, dann alle
    // beteiligten Prozesse in einem Rutsch laden und zusammenführen.
    const psScript = `
        $conns = Get-NetTCPConnection | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        $procs = @{}
        foreach ($p in (Get-Process -Id $pids -ErrorAction SilentlyContinue)) {
            $procs[$p.Id] = @{ Name = $p.ProcessName; Path = $p.Path }
        }
        $result = foreach ($c in $conns) {
            $pi = $procs[[int]$c.OwningProcess]
            [PSCustomObject]@{
                localAddress   = $c.LocalAddress
                localPort      = $c.LocalPort
                remoteAddress  = $c.RemoteAddress
                remotePort     = $c.RemotePort
                state          = [string]$c.State
                owningProcess  = $c.OwningProcess
                processName    = if ($pi) { $pi.Name } else { '' }
                processPath    = if ($pi -and $pi.Path) { $pi.Path } else { '' }
            }
        }
        $result | ConvertTo-Json -Depth 3 -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        if (!stdout || !stdout.trim()) return [];
        const raw = JSON.parse(stdout.trim());
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(c => ({
            localAddress:  c.localAddress  || '',
            localPort:     Number(c.localPort)  || 0,
            remoteAddress: c.remoteAddress || '',
            remotePort:    Number(c.remotePort) || 0,
            state:         c.state         || '',
            owningProcess: Number(c.owningProcess) || 0,
            processName:   c.processName   || '',
            processPath:   c.processPath   || '',
        }));
    } catch (err) {
        log.error('Netzwerkverbindungen konnten nicht abgerufen werden:', err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// 2) getBandwidth – Netzwerkadapter-Statistiken
// ---------------------------------------------------------------------------
async function getBandwidth() {
    const psScript = `
        $adapters = Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed
        $stats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes, ReceivedUnicastPackets, SentUnicastPackets
        $statsMap = @{}
        foreach ($s in $stats) { $statsMap[$s.Name] = $s }
        $result = foreach ($a in $adapters) {
            $s = $statsMap[$a.Name]
            [PSCustomObject]@{
                name            = $a.Name
                description     = $a.InterfaceDescription
                status          = [string]$a.Status
                linkSpeed       = $a.LinkSpeed
                receivedBytes   = if ($s) { $s.ReceivedBytes }   else { 0 }
                sentBytes       = if ($s) { $s.SentBytes }       else { 0 }
                receivedPackets = if ($s) { $s.ReceivedUnicastPackets } else { 0 }
                sentPackets     = if ($s) { $s.SentUnicastPackets }     else { 0 }
            }
        }
        $result | ConvertTo-Json -Depth 3 -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        const raw = JSON.parse(stdout.trim());
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(a => ({
            name:            a.name            || '',
            description:     a.description     || '',
            status:          a.status          || '',
            linkSpeed:       a.linkSpeed       || '',
            receivedBytes:   Number(a.receivedBytes)   || 0,
            sentBytes:       Number(a.sentBytes)       || 0,
            receivedPackets: Number(a.receivedPackets) || 0,
            sentPackets:     Number(a.sentPackets)     || 0,
        }));
    } catch (err) {
        log.error('Netzwerkadapter-Statistiken konnten nicht abgerufen werden:', err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// 3) getFirewallRules – Windows-Firewall-Regeln (ein-/ausgehend)
// ---------------------------------------------------------------------------
async function getFirewallRules(direction = 'Inbound') {
    const dir = direction === 'Outbound' ? 'Outbound' : 'Inbound';

    const psScript = `
        $rules = Get-NetFirewallRule -Direction ${dir} -ErrorAction SilentlyContinue | Select-Object -First 200 Name, DisplayName, Direction, Action, Enabled, Profile
        $appFilters = @{}
        foreach ($r in $rules) {
            try {
                $af = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
                if ($af -and $af.Program -and $af.Program -ne 'Any') {
                    $appFilters[$r.Name] = $af.Program
                }
            } catch {}
        }
        $result = foreach ($r in $rules) {
            [PSCustomObject]@{
                name        = $r.Name
                displayName = $r.DisplayName
                direction   = [string]$r.Direction
                action      = [string]$r.Action
                enabled     = [bool]($r.Enabled -eq 'True' -or $r.Enabled -eq $true -or $r.Enabled -eq 1)
                profile     = [string]$r.Profile
                program     = if ($appFilters.ContainsKey($r.Name)) { $appFilters[$r.Name] } else { '' }
            }
        }
        $result | ConvertTo-Json -Depth 3 -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        if (!stdout || !stdout.trim()) return [];
        const raw = JSON.parse(stdout.trim());
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(r => ({
            name:        r.name        || '',
            displayName: r.displayName || '',
            direction:   r.direction   || dir,
            action:      r.action      || '',
            enabled:     !!r.enabled,
            profile:     r.profile     || '',
            program:     r.program     || '',
        }));
    } catch (err) {
        log.error('Firewall-Regeln konnten nicht abgerufen werden:', err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// 4) blockProcess – Prozess per Firewall-Regel blockieren
// ---------------------------------------------------------------------------
async function blockProcess(processName, processPath) {
    if (!processName || !processPath) {
        return { success: false, error: 'Prozessname und Pfad werden benötigt.' };
    }
    if (!isSafeShellArg(processName)) {
        return { success: false, error: 'Ungültiger Prozessname.' };
    }
    if (!path.isAbsolute(processPath) || /[;&|`$(){}[\]<>!\n\r]/.test(processPath)) {
        return { success: false, error: 'Ungültiger Programm-Pfad.' };
    }

    const ruleName = `SpeicherAnalyse_Block_${processName}`;
    const safePath = processPath.replace(/'/g, "''");

    const psScript = `
        New-NetFirewallRule -DisplayName '${ruleName}' -Name '${ruleName}' -Direction Outbound -Action Block -Program '${safePath}' -Enabled True -ErrorAction Stop | Out-Null;
        Write-Output 'OK'
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        if (stdout.trim().includes('OK')) {
            return { success: true };
        }
        return { success: false, error: 'Unerwartete Antwort von PowerShell.' };
    } catch (err) {
        const msg = err.stderr || err.message || String(err);
        return { success: false, error: `Firewall-Regel konnte nicht erstellt werden: ${msg}` };
    }
}

// ---------------------------------------------------------------------------
// 5) unblockProcess – Firewall-Regel nach Name entfernen
// ---------------------------------------------------------------------------
async function unblockProcess(ruleName) {
    if (!ruleName) {
        return { success: false, error: 'Regelname wird benötigt.' };
    }
    if (!isSafeShellArg(ruleName)) {
        return { success: false, error: 'Ungültiger Regelname.' };
    }
    if (!ruleName.startsWith('SpeicherAnalyse_Block_')) {
        return { success: false, error: 'Nur eigene Regeln können entfernt werden.' };
    }

    const safeName = ruleName.replace(/'/g, "''");

    const psScript = `
        Remove-NetFirewallRule -Name '${safeName}' -ErrorAction Stop | Out-Null;
        Write-Output 'OK'
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        if (stdout.trim().includes('OK')) {
            return { success: true };
        }
        return { success: false, error: 'Unerwartete Antwort von PowerShell.' };
    } catch (err) {
        const msg = err.stderr || err.message || String(err);
        return { success: false, error: `Firewall-Regel konnte nicht entfernt werden: ${msg}` };
    }
}

// ---------------------------------------------------------------------------
// 6) getNetworkSummary – Schnellübersicht über Netzwerkverbindungen
// ---------------------------------------------------------------------------
async function getNetworkSummary() {
    const psScript = `
        $conns = Get-NetTCPConnection | Select-Object State, RemoteAddress, OwningProcess
        $total = $conns.Count
        $established = ($conns | Where-Object { $_.State -eq 'Established' }).Count
        $listening = ($conns | Where-Object { $_.State -eq 'Listen' }).Count
        $uniqueIPs = ($conns | Where-Object { $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '::1' -and $_.RemoteAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty RemoteAddress -Unique).Count
        $pidCounts = $conns | Group-Object OwningProcess | Sort-Object Count -Descending | Select-Object -First 10
        $procs = @{}
        foreach ($p in (Get-Process -Id ($pidCounts | Select-Object -ExpandProperty Name) -ErrorAction SilentlyContinue)) {
            $procs[$p.Id] = $p.ProcessName
        }
        $topProcesses = foreach ($g in $pidCounts) {
            $pid = [int]$g.Name
            [PSCustomObject]@{
                name = if ($procs.ContainsKey($pid)) { $procs[$pid] } else { "PID $pid" }
                connectionCount = $g.Count
            }
        }
        [PSCustomObject]@{
            totalConnections = $total
            establishedCount = $established
            listeningCount   = $listening
            uniqueRemoteIPs  = $uniqueIPs
            topProcesses     = @($topProcesses)
        } | ConvertTo-Json -Depth 3 -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
        if (!stdout || !stdout.trim()) return { totalConnections: 0, establishedCount: 0, listeningCount: 0, uniqueRemoteIPs: 0, topProcesses: [] };
        const data = JSON.parse(stdout.trim());
        const topProcesses = Array.isArray(data.topProcesses)
            ? data.topProcesses.map(p => ({
                name: p.name || '',
                connectionCount: Number(p.connectionCount) || 0,
            }))
            : [];

        return {
            totalConnections: Number(data.totalConnections) || 0,
            establishedCount: Number(data.establishedCount) || 0,
            listeningCount:   Number(data.listeningCount)   || 0,
            uniqueRemoteIPs:  Number(data.uniqueRemoteIPs)  || 0,
            topProcesses,
        };
    } catch (err) {
        log.error('Netzwerk-Zusammenfassung konnte nicht abgerufen werden:', err.message);
        return {
            totalConnections: 0,
            establishedCount: 0,
            listeningCount: 0,
            uniqueRemoteIPs: 0,
            topProcesses: [],
        };
    }
}

// ---------------------------------------------------------------------------
// 7) getGroupedConnections – Verbindungen nach Prozess gruppiert
// ---------------------------------------------------------------------------
async function getGroupedConnections() {
    const connections = await getConnections();

    // Nach Prozess gruppieren
    const groups = new Map();
    for (const conn of connections) {
        const key = conn.processName || 'System';
        if (!groups.has(key)) {
            groups.set(key, {
                processName: key,
                processPath: conn.processPath || '',
                connections: [],
                uniqueRemoteIPs: new Set(),
                states: {},
            });
        }
        const group = groups.get(key);
        group.connections.push(conn);
        if (conn.remoteAddress && !isPrivateIP(conn.remoteAddress)) {
            group.uniqueRemoteIPs.add(conn.remoteAddress);
        }
        group.states[conn.state] = (group.states[conn.state] || 0) + 1;
    }

    // Alle öffentlichen IPs über alle Gruppen sammeln und auf einmal auflösen
    const allPublicIPs = new Set();
    for (const group of groups.values()) {
        for (const ip of group.uniqueRemoteIPs) allPublicIPs.add(ip);
    }
    const resolvedMap = await lookupIPs([...allPublicIPs]);

    // Prozess-Status prüfen (läuft der Prozess noch?)
    const processRunning = await checkProcessesRunning([...groups.keys()]);

    // In serialisierbares Array umwandeln — mit eingebetteten Firmendaten
    const result = [];
    for (const [name, group] of groups) {
        // Firmen pro Gruppe ermitteln
        const companies = new Set();
        let hasTrackers = false;
        let hasHighRisk = false;
        for (const ip of group.uniqueRemoteIPs) {
            const info = resolvedMap[ip];
            if (info) {
                if (info.org && info.org !== 'Unbekannt') companies.add(info.org);
                if (info.isTracker) hasTrackers = true;
                if (info.isHighRisk) hasHighRisk = true;
            }
        }

        // Resolved-Info in jede Verbindung einbetten
        const enrichedConnections = group.connections.map(c => ({
            ...c,
            resolved: isPrivateIP(c.remoteAddress)
                ? { org: 'Lokal', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false, isLocal: true }
                : { ...(resolvedMap[c.remoteAddress] || { org: 'Unbekannt', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false }), isLocal: false },
        }));

        result.push({
            processName: group.processName,
            processPath: group.processPath,
            connectionCount: group.connections.length,
            uniqueIPCount: group.uniqueRemoteIPs.size,
            uniqueIPs: [...group.uniqueRemoteIPs],
            states: group.states,
            isRunning: processRunning.get(name) ?? true,
            connections: enrichedConnections,
            resolvedCompanies: [...companies],
            hasTrackers,
            hasHighRisk,
        });
    }

    // Nach Verbindungsanzahl absteigend sortieren
    result.sort((a, b) => b.connectionCount - a.connectionCount);
    return result;
}

/**
 * Prüft welche Prozesse tatsächlich laufen.
 */
async function checkProcessesRunning(processNames) {
    const result = new Map();
    try {
        const names = processNames.filter(n => n && n !== 'System' && n !== '');
        if (names.length === 0) return result;

        const psScript = `
            Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique | ConvertTo-Json -Compress
        `.trim();

        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT });
        if (!stdout || !stdout.trim()) return result;
        const runningNames = JSON.parse(stdout.trim());
        const runningSet = new Set(Array.isArray(runningNames) ? runningNames : [runningNames]);

        for (const name of processNames) {
            result.set(name, name === 'System' || name === '' || runningSet.has(name));
        }
    } catch {
        // Bei Fehler: alle als laufend annehmen
        for (const name of processNames) result.set(name, true);
    }
    return result;
}

// ---------------------------------------------------------------------------
// 8) IP-Auflösung – WHOIS/IP-Ownership via ip-api.com Batch-API
// ---------------------------------------------------------------------------
const _ipCache = new Map();
const MAX_IP_CACHE = 2000;

function _cacheIP(ip, data) {
    if (_ipCache.size >= MAX_IP_CACHE) {
        const oldest = _ipCache.keys().next().value;
        _ipCache.delete(oldest);
    }
    _cacheIP(ip, data);
}

/**
 * Prüft ob eine IP-Adresse privat/lokal ist (nicht an API senden).
 */
function isPrivateIP(ip) {
    if (!ip) return true;
    return (
        ip === '0.0.0.0' ||
        ip === '::' ||
        ip === '::1' ||
        ip === '127.0.0.1' ||
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
        ip.startsWith('fe80:') ||
        ip.startsWith('fd') ||
        ip.startsWith('fc')
    );
}

/**
 * Minimaler HTTP-POST-Client für ip-api.com Batch-Anfragen.
 */
function httpPost(url, body, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 429) {
                    reject(new Error('Rate limit erreicht (429)'));
                } else if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.write(body);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Hochrisiko-Länder (konfigurierbar)
// ---------------------------------------------------------------------------
const HIGH_RISK_COUNTRIES = new Set(['RU', 'CN', 'KP', 'IR']);

const COMPANY_PATTERNS = [
    { patterns: ['microsoft', 'msedge', '.ms.', 'azure', 'office365', 'outlook', 'onedrive', 'live.com', 'msn.com', 'windows.com', 'bing.com'], company: 'Microsoft' },
    { patterns: ['google', 'goog', 'youtube', 'gstatic', 'googleapis', '1e100.net'], company: 'Google' },
    { patterns: ['facebook', 'fbcdn', 'fb.com', 'meta.com', 'instagram', 'whatsapp'], company: 'Meta (Facebook)' },
    { patterns: ['amazon', 'aws', 'cloudfront', 'a2z'], company: 'Amazon/AWS' },
    { patterns: ['apple', 'icloud'], company: 'Apple' },
    { patterns: ['akamai', 'akam'], company: 'Akamai (CDN)' },
    { patterns: ['cloudflare', 'cf-'], company: 'Cloudflare (CDN)' },
    { patterns: ['spotify'], company: 'Spotify' },
    { patterns: ['steam', 'valve', 'steampowered'], company: 'Valve (Steam)' },
    { patterns: ['discord', 'discordapp'], company: 'Discord' },
    { patterns: ['tiktok', 'bytedance', 'musical.ly'], company: 'ByteDance (TikTok)' },
    { patterns: ['twitter', 'twimg', 'x.com'], company: 'X (Twitter)' },
    { patterns: ['netflix'], company: 'Netflix' },
    { patterns: ['adobe'], company: 'Adobe' },
    // Tracker / Werbenetzwerke
    { patterns: ['doubleclick', 'googlesyndication', 'googleadservices', 'googleads'], company: 'Google Werbung', isTracker: true },
    { patterns: ['scorecardresearch', 'quantserve', 'analytics'], company: 'Tracking/Analyse', isTracker: true },
    { patterns: ['adnxs', 'appnexus'], company: 'Xandr Werbung', isTracker: true },
    { patterns: ['criteo'], company: 'Criteo Werbung', isTracker: true },
    { patterns: ['taboola', 'outbrain'], company: 'Content-Werbung', isTracker: true },
];

/**
 * Matcht DNS-Hostname gegen COMPANY_PATTERNS (Fallback für DNS-Auflösung).
 */
function identifyCompany(hostname) {
    const lower = (hostname || '').toLowerCase();
    for (const entry of COMPANY_PATTERNS) {
        if (entry.patterns.some(p => lower.includes(p))) {
            return { name: entry.company, isTracker: entry.isTracker || false };
        }
    }
    if (hostname) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return { name: parts.slice(-2).join('.'), isTracker: false };
        }
    }
    return { name: 'Unbekannt', isTracker: false };
}

/**
 * Matcht ip-api.com Antwort (org/isp/asname) gegen COMPANY_PATTERNS.
 * Liefert bessere Namen als die rohen API-Daten (z.B. "MICROSOFT-CORP" → "Microsoft").
 */
function identifyCompanyFromAPI(apiEntry) {
    const searchFields = [
        apiEntry.org, apiEntry.isp, apiEntry.asname, apiEntry.as,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const entry of COMPANY_PATTERNS) {
        if (entry.patterns.some(p => searchFields.includes(p))) {
            return { name: entry.company, isTracker: entry.isTracker || false };
        }
    }
    return { name: '', isTracker: false };
}

/**
 * IP-Adressen per ip-api.com Batch-API auflösen (Organisation, ISP, Land).
 * Cached Ergebnisse in _ipCache für die gesamte Session.
 * Fallback: DNS Reverse Lookup bei API-Ausfall.
 */
async function lookupIPs(ipAddresses) {
    if (!Array.isArray(ipAddresses) || ipAddresses.length === 0) return {};

    const results = {};
    const uncached = [];

    for (const ip of ipAddresses) {
        if (_ipCache.has(ip)) {
            results[ip] = _ipCache.get(ip);
        } else if (!isPrivateIP(ip)) {
            uncached.push(ip);
        }
    }

    if (uncached.length === 0) return results;

    // Deduplizieren und auf 100 begrenzen (ip-api.com Batch-Limit)
    const batch = [...new Set(uncached)].slice(0, 100);
    const requestBody = JSON.stringify(
        batch.map(ip => ({
            query: ip,
            fields: 'status,query,org,isp,as,asname,country,countryCode',
        }))
    );

    try {
        const apiResponse = await httpPost('http://ip-api.com/batch', requestBody, 10000);
        const data = JSON.parse(apiResponse);

        for (const entry of data) {
            if (!entry || !entry.query) continue;
            const ip = entry.query;

            // COMPANY_PATTERNS als Override für bekannte Firmen/Tracker
            const override = identifyCompanyFromAPI(entry);

            const countryCode = entry.countryCode || '';
            const resolved = {
                org: override.name || entry.org || entry.isp || 'Unbekannt',
                isp: entry.isp || '',
                country: entry.country || '',
                countryCode,
                as: entry.as || '',
                isTracker: override.isTracker || false,
                isHighRisk: HIGH_RISK_COUNTRIES.has(countryCode),
            };
            _cacheIP(ip, resolved);
            results[ip] = resolved;
        }

        // IPs ohne API-Antwort als unbekannt cachen
        for (const ip of batch) {
            if (!results[ip]) {
                const fallback = { org: 'Unbekannt', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false };
                _cacheIP(ip, fallback);
                results[ip] = fallback;
            }
        }
    } catch (err) {
        log.error('ip-api.com Batch-Abfrage fehlgeschlagen:', err.message, '→ Fallback auf DNS');
        await _fallbackDNSResolve(batch, results);
    }

    return results;
}

/**
 * DNS Reverse Lookup als Fallback wenn ip-api.com nicht erreichbar ist.
 */
async function _fallbackDNSResolve(ipList, results) {
    const batch = ipList.slice(0, 20);
    const ipListStr = batch.map(ip => `'${ip.replace(/'/g, "''")}'`).join(',');
    const psScript = `
        $ips = @(${ipListStr})
        $results = foreach ($ip in $ips) {
            try {
                $dns = Resolve-DnsName -Name $ip -DnsOnly -Type PTR -ErrorAction SilentlyContinue | Select-Object -First 1
                [PSCustomObject]@{ ip = $ip; hostname = if ($dns) { $dns.NameHost } else { '' } }
            } catch {
                [PSCustomObject]@{ ip = $ip; hostname = '' }
            }
        }
        $results | ConvertTo-Json -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, { timeout: 20000 });
        const raw = JSON.parse(stdout.trim());
        const arr = Array.isArray(raw) ? raw : [raw];
        for (const entry of arr) {
            const hostname = entry.hostname || '';
            const company = identifyCompany(hostname);
            const resolved = {
                org: company.name,
                isp: '',
                country: '',
                countryCode: '',
                as: '',
                isTracker: company.isTracker,
                isHighRisk: false,
            };
            _cacheIP(entry.ip, resolved);
            results[entry.ip] = resolved;
        }
    } catch {
        for (const ip of batch) {
            if (!results[ip]) {
                const fallback = { org: 'Unbekannt', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false };
                _cacheIP(ip, fallback);
                results[ip] = fallback;
            }
        }
    }
}

/**
 * Rückwärtskompatible Wrapper-Funktion — delegiert an lookupIPs().
 */
async function resolveIPs(ipAddresses) {
    const results = await lookupIPs(ipAddresses);
    const transformed = {};
    for (const [ip, info] of Object.entries(results)) {
        transformed[ip] = {
            hostname: '',
            company: info.org,
            isTracker: info.isTracker,
        };
    }
    return transformed;
}

// ---------------------------------------------------------------------------
// 9) getPollingData – Kombinierter Endpoint für Echtzeit-Polling
//    Sammelt Summary + Grouped Connections + Bandwidth in EINEM Aufruf.
//    IP-Auflösung nutzt NUR den Cache (keine API-Calls → schnell).
// ---------------------------------------------------------------------------
async function getPollingData() {
    // Ein einziger PowerShell-Call für Connections + Summary + Bandwidth
    const psScript = `
        $conns = Get-NetTCPConnection | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        $procs = @{}
        foreach ($p in (Get-Process -Id $pids -ErrorAction SilentlyContinue)) {
            $procs[$p.Id] = @{ Name = $p.ProcessName; Path = $p.Path }
        }
        $connections = @(foreach ($c in $conns) {
            $pi = $procs[[int]$c.OwningProcess]
            [PSCustomObject]@{
                la = $c.LocalAddress
                lp = $c.LocalPort
                ra = $c.RemoteAddress
                rp = $c.RemotePort
                st = [string]$c.State
                op = $c.OwningProcess
                pn = if ($pi) { $pi.Name } else { '' }
                pp = if ($pi -and $pi.Path) { $pi.Path } else { '' }
            }
        })
        $total = $conns.Count
        $established = ($conns | Where-Object { $_.State -eq 'Established' }).Count
        $listening = ($conns | Where-Object { $_.State -eq 'Listen' }).Count
        $uniqueIPs = ($conns | Where-Object { $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '::1' -and $_.RemoteAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty RemoteAddress -Unique).Count
        $pidCounts = $conns | Group-Object OwningProcess | Sort-Object Count -Descending | Select-Object -First 10
        $topProcesses = @(foreach ($g in $pidCounts) {
            $pid = [int]$g.Name
            [PSCustomObject]@{ name = if ($procs.ContainsKey($pid)) { $procs[$pid].Name } else { "PID $pid" }; cc = $g.Count }
        })
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name, InterfaceDescription, Status, LinkSpeed
        $stats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes, ReceivedUnicastPackets, SentUnicastPackets
        $statsMap = @{}; foreach ($s in $stats) { $statsMap[$s.Name] = $s }
        $bw = @(foreach ($a in $adapters) {
            $s = $statsMap[$a.Name]
            [PSCustomObject]@{ n=$a.Name; d=$a.InterfaceDescription; s=[string]$a.Status; ls=$a.LinkSpeed; rb=if($s){$s.ReceivedBytes}else{0}; sb=if($s){$s.SentBytes}else{0}; rp=if($s){$s.ReceivedUnicastPackets}else{0}; sp=if($s){$s.SentUnicastPackets}else{0} }
        })
        [PSCustomObject]@{
            connections = $connections
            summary = [PSCustomObject]@{ tc=$total; ec=$established; lc=$listening; ui=$uniqueIPs; tp=$topProcesses }
            bandwidth = $bw
        } | ConvertTo-Json -Depth 4 -Compress
    `.trim();

    try {
        const { stdout } = await runPS(psScript, { timeout: PS_TIMEOUT, maxBuffer: 10 * 1024 * 1024 });
        const data = JSON.parse(stdout.trim());

        // Connections parsen
        const rawConns = Array.isArray(data.connections) ? data.connections : (data.connections ? [data.connections] : []);
        const connections = rawConns.map(c => ({
            localAddress: c.la || '', localPort: Number(c.lp) || 0,
            remoteAddress: c.ra || '', remotePort: Number(c.rp) || 0,
            state: c.st || '', owningProcess: Number(c.op) || 0,
            processName: c.pn || '', processPath: c.pp || '',
        }));

        // Summary parsen
        const s = data.summary || {};
        const topProc = Array.isArray(s.tp) ? s.tp.map(p => ({ name: p.name || '', connectionCount: Number(p.cc) || 0 })) : [];
        const summary = {
            totalConnections: Number(s.tc) || 0, establishedCount: Number(s.ec) || 0,
            listeningCount: Number(s.lc) || 0, uniqueRemoteIPs: Number(s.ui) || 0, topProcesses: topProc,
        };

        // Bandwidth parsen
        const rawBw = Array.isArray(data.bandwidth) ? data.bandwidth : (data.bandwidth ? [data.bandwidth] : []);
        const bandwidth = rawBw.map(b => ({
            name: b.n || '', description: b.d || '', status: b.s || '', linkSpeed: b.ls || '',
            receivedBytes: Number(b.rb) || 0, sentBytes: Number(b.sb) || 0,
            receivedPackets: Number(b.rp) || 0, sentPackets: Number(b.sp) || 0,
        }));

        // Gruppierung (wie getGroupedConnections, aber NUR mit Cache-Daten)
        const groups = new Map();
        for (const conn of connections) {
            const key = conn.processName || 'System';
            if (!groups.has(key)) {
                groups.set(key, { processName: key, processPath: conn.processPath || '', connections: [], uniqueRemoteIPs: new Set(), states: {} });
            }
            const group = groups.get(key);
            group.connections.push(conn);
            if (conn.remoteAddress && !isPrivateIP(conn.remoteAddress)) group.uniqueRemoteIPs.add(conn.remoteAddress);
            group.states[conn.state] = (group.states[conn.state] || 0) + 1;
        }

        // IP-Auflösung NUR aus Cache (keine API-Calls → sofort)
        const grouped = [];
        for (const [name, group] of groups) {
            const companies = new Set();
            let hasTrackers = false, hasHighRisk = false;
            for (const ip of group.uniqueRemoteIPs) {
                const info = _ipCache.get(ip);
                if (info) {
                    if (info.org && info.org !== 'Unbekannt') companies.add(info.org);
                    if (info.isTracker) hasTrackers = true;
                    if (info.isHighRisk) hasHighRisk = true;
                }
            }
            const enrichedConnections = group.connections.map(c => ({
                ...c,
                resolved: isPrivateIP(c.remoteAddress)
                    ? { org: 'Lokal', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false, isLocal: true }
                    : { ...(_ipCache.get(c.remoteAddress) || { org: 'Unbekannt', isp: '', country: '', countryCode: '', as: '', isTracker: false, isHighRisk: false }), isLocal: false },
            }));
            grouped.push({
                processName: name, processPath: group.processPath,
                connectionCount: group.connections.length, uniqueIPCount: group.uniqueRemoteIPs.size,
                uniqueIPs: [...group.uniqueRemoteIPs], states: group.states,
                isRunning: true, // Beim Polling überspringen wir den Process-Check (zu langsam)
                connections: enrichedConnections, resolvedCompanies: [...companies], hasTrackers, hasHighRisk,
            });
        }
        grouped.sort((a, b) => b.connectionCount - a.connectionCount);

        return { summary, grouped, bandwidth };
    } catch (err) {
        log.error('Polling-Daten konnten nicht abgerufen werden:', err.message);
        throw err;
    }
}

module.exports = {
    getConnections,
    getBandwidth,
    getFirewallRules,
    blockProcess,
    unblockProcess,
    getNetworkSummary,
    getGroupedConnections,
    getPollingData,
    resolveIPs,
    lookupIPs,
};

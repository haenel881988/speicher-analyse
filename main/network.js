'use strict';

const { runPS, runSafe, isSafeShellArg } = require('./cmd-utils');

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
    `.replace(/\n/g, ' ');

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
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
        console.error('Netzwerkverbindungen konnten nicht abgerufen werden:', err.message);
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
    `.replace(/\n/g, ' ');

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
        console.error('Netzwerkadapter-Statistiken konnten nicht abgerufen werden:', err.message);
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
    `.replace(/\n/g, ' ');

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
        console.error('Firewall-Regeln konnten nicht abgerufen werden:', err.message);
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

    const ruleName = `SpeicherAnalyse_Block_${processName}`;
    // Pfad in einfache Anführungszeichen einbetten und innere ' escapen
    const safePath = processPath.replace(/'/g, "''");

    const psScript = `
        New-NetFirewallRule -DisplayName '${ruleName}' -Name '${ruleName}' -Direction Outbound -Action Block -Program '${safePath}' -Enabled True -ErrorAction Stop | Out-Null;
        Write-Output 'OK'
    `.replace(/\n/g, ' ');

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

    const safeName = ruleName.replace(/'/g, "''");

    const psScript = `
        Remove-NetFirewallRule -Name '${safeName}' -ErrorAction Stop | Out-Null;
        Write-Output 'OK'
    `.replace(/\n/g, ' ');

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
    `.replace(/\n/g, ' ');

    try {
        const { stdout } = await runPS(psScript, PS_OPTS);
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
        console.error('Netzwerk-Zusammenfassung konnte nicht abgerufen werden:', err.message);
        return {
            totalConnections: 0,
            establishedCount: 0,
            listeningCount: 0,
            uniqueRemoteIPs: 0,
            topProcesses: [],
        };
    }
}

module.exports = {
    getConnections,
    getBandwidth,
    getFirewallRules,
    blockProcess,
    unblockProcess,
    getNetworkSummary,
};

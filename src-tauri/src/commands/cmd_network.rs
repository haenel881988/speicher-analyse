use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use super::{get_data_dir, validate_ip};

struct BwPrev {
    received_bytes: i64,
    sent_bytes: i64,
    timestamp_ms: i64,
}

fn bw_prev_store() -> &'static Mutex<HashMap<String, BwPrev>> {
    static S: OnceLock<Mutex<HashMap<String, BwPrev>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

fn bw_history_store() -> &'static Mutex<HashMap<String, Vec<Value>>> {
    static S: OnceLock<Mutex<HashMap<String, Vec<Value>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prev_connections_store() -> &'static Mutex<Vec<Value>> {
    static S: OnceLock<Mutex<Vec<Value>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(Vec::new()))
}

const MAX_BW_HISTORY: usize = 60;

use std::sync::LazyLock;
/// Cache for IP → company name resolution (populated by resolve_ips, used by get_polling_data)
static IP_RESOLVE_CACHE: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn is_private_ip(ip: &str) -> bool {
    if ip.is_empty() || ip == "0.0.0.0" || ip == "::" || ip == "::1" { return true; }
    if ip.starts_with("127.") || ip.starts_with("10.") || ip.starts_with("192.168.") || ip.starts_with("169.254.") { return true; }
    if ip.starts_with("fe80:") { return true; }
    if ip.starts_with("172.") {
        if let Some(second) = ip.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()) {
            if (16..=31).contains(&second) { return true; }
        }
    }
    false
}

// === Network Monitor ===

#[tauri::command]
pub async fn get_connections() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' } | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess, @{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_bandwidth() -> Result<Value, String> {
    let raw = crate::ps::run_ps_json_array(
        r#"$adapters = Get-NetAdapter -EA SilentlyContinue | Select-Object Name, InterfaceDescription, Status, LinkSpeed
$stats = Get-NetAdapterStatistics -EA SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes, ReceivedUnicastPackets, SentUnicastPackets
$sm = @{}; foreach ($s in $stats) { $sm[$s.Name] = $s }
@(foreach ($a in $adapters) {
    $s = $sm[$a.Name]
    [PSCustomObject]@{
        name=$a.Name; description=$a.InterfaceDescription; status=[string]$a.Status; linkSpeed=$a.LinkSpeed
        receivedBytes=if($s){$s.ReceivedBytes}else{0}; sentBytes=if($s){$s.SentBytes}else{0}
        receivedPackets=if($s){$s.ReceivedUnicastPackets}else{0}; sentPackets=if($s){$s.SentUnicastPackets}else{0}
    }
}) | ConvertTo-Json -Compress"#
    ).await?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    let arr = raw.as_array().cloned().unwrap_or_default();
    let mut prev_store = bw_prev_store().lock().unwrap_or_else(|e| e.into_inner());
    let mut hist_store = bw_history_store().lock().unwrap_or_else(|e| e.into_inner());

    let bandwidth: Vec<Value> = arr.iter().map(|b| {
        let name = b["name"].as_str().unwrap_or("").to_string();
        let store_key = format!("bw_{}", name); // Prefix to avoid collision with get_polling_data
        let rb = b["receivedBytes"].as_i64().unwrap_or(0);
        let sb = b["sentBytes"].as_i64().unwrap_or(0);

        let (rx_ps, tx_ps) = if let Some(prev) = prev_store.get(&store_key) {
            let elapsed = (now_ms - prev.timestamp_ms) as f64 / 1000.0;
            if elapsed > 0.5 {
                (((rb - prev.received_bytes).max(0) as f64 / elapsed), ((sb - prev.sent_bytes).max(0) as f64 / elapsed))
            } else { (0.0, 0.0) }
        } else { (0.0, 0.0) };

        prev_store.insert(store_key, BwPrev { received_bytes: rb, sent_bytes: sb, timestamp_ms: now_ms });

        // History for sparklines
        if rx_ps > 0.0 || tx_ps > 0.0 || hist_store.contains_key(&name) {
            let hist = hist_store.entry(name.clone()).or_default();
            hist.push(json!({"ts": now_ms, "rx": rx_ps, "tx": tx_ps}));
            if hist.len() > MAX_BW_HISTORY { hist.remove(0); }
        }

        json!({
            "name": &name, "description": b["description"], "status": b["status"], "linkSpeed": b["linkSpeed"],
            "receivedBytes": rb, "sentBytes": sb,
            "receivedPackets": b["receivedPackets"], "sentPackets": b["sentPackets"],
            "rxPerSec": rx_ps, "txPerSec": tx_ps
        })
    }).collect();

    Ok(json!(bandwidth))
}

#[tauri::command]
pub async fn get_network_summary() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$tcp = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' }).Count
$udp = @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue).Count
$listening = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }).Count
[PSCustomObject]@{ established=$tcp; listening=$listening; udpEndpoints=$udp; totalConnections=($tcp+$listening) } | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_grouped_connections() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' } | Group-Object OwningProcess | ForEach-Object {
    $proc = Get-Process -Id $_.Name -ErrorAction SilentlyContinue
    [PSCustomObject]@{ processId=[int]$_.Name; processName=$proc.ProcessName; connectionCount=$_.Count; connections=$_.Group | Select-Object RemoteAddress, RemotePort }
} | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn resolve_ips(ip_addresses: Vec<String>) -> Result<Value, String> {
    if ip_addresses.is_empty() {
        return Ok(json!({}));
    }

    // Filter out local/private IPs, validate format — only resolve valid public IPs
    let public_ips: Vec<&str> = ip_addresses.iter()
        .map(|s| s.as_str())
        .filter(|ip| validate_ip(ip).is_ok() && !is_private_ip(ip))
        .take(100)
        .collect();

    if public_ips.is_empty() {
        return Ok(json!({}));
    }

    // Build PS script for parallel reverse DNS
    let ip_list = public_ips.iter()
        .map(|ip| format!("'{}'", ip.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");

    let script = format!(
        r#"$ips = @({})
$tasks = @()
foreach ($ip in $ips) {{
    $tasks += @{{ip=$ip; task=[System.Net.Dns]::GetHostEntryAsync($ip)}}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 3000) }} catch {{}}
$result = @{{}}
foreach ($t in $tasks) {{
    if ($t.task.IsCompleted -and -not $t.task.IsFaulted) {{
        $result[$t.ip] = $t.task.Result.HostName
    }}
}}
$result | ConvertTo-Json -Compress"#,
        ip_list
    );

    let dns_data = crate::ps::run_ps_json(&script).await?;

    // Map IP → { hostname, company, isTracker }
    let mut result_map = serde_json::Map::new();
    if let Some(obj) = dns_data.as_object() {
        for (ip, hostname_val) in obj {
            if let Some(hostname) = hostname_val.as_str() {
                let company = crate::oui::hostname_to_company(hostname)
                    .unwrap_or("")
                    .to_string();
                let is_tracker = crate::oui::is_tracker(hostname);
                result_map.insert(ip.clone(), json!({
                    "hostname": hostname,
                    "company": company,
                    "isTracker": is_tracker
                }));
            }
        }
    }

    // Store in cache for use by get_polling_data (including empty to avoid re-resolving)
    {
        let mut cache = IP_RESOLVE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        for (ip, info) in &result_map {
            if let Some(company) = info["company"].as_str() {
                cache.insert(ip.clone(), company.to_string());
            }
        }
    }

    Ok(Value::Object(result_map))
}

/// Background IP resolution helper (non-blocking, stores results in cache)
async fn resolve_ips_background(ips: &[String]) -> Result<Value, String> {
    if ips.is_empty() {
        return Ok(json!({}));
    }
    let ip_list = ips.iter()
        .map(|ip| format!("'{}'", ip.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");

    let script = format!(
        r#"$ips = @({})
$tasks = @()
foreach ($ip in $ips) {{
    $tasks += @{{ip=$ip; task=[System.Net.Dns]::GetHostEntryAsync($ip)}}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 3000) }} catch {{}}
$result = @{{}}
foreach ($t in $tasks) {{
    if ($t.task.IsCompleted -and -not $t.task.IsFaulted) {{
        $result[$t.ip] = $t.task.Result.HostName
    }}
}}
$result | ConvertTo-Json -Compress"#,
        ip_list
    );

    let dns_data = crate::ps::run_ps_json(&script).await?;

    let mut result_map = serde_json::Map::new();
    if let Some(obj) = dns_data.as_object() {
        for (ip, hostname_val) in obj {
            if let Some(hostname) = hostname_val.as_str() {
                let company = crate::oui::hostname_to_company(hostname)
                    .unwrap_or("")
                    .to_string();
                let is_tracker = crate::oui::is_tracker(hostname);
                result_map.insert(ip.clone(), json!({
                    "hostname": hostname,
                    "company": company,
                    "isTracker": is_tracker
                }));
            }
        }
    }

    Ok(Value::Object(result_map))
}

/// Combined polling endpoint: returns summary + grouped + bandwidth in one call.
/// Matches the format expected by the frontend (NetworkView refresh).
#[tauri::command]
pub async fn get_polling_data() -> Result<Value, String> {
    // Single PS call for TCP + UDP + Bandwidth
    let raw = crate::ps::run_ps_json(
        r#"$conns = @(Get-NetTCPConnection -EA SilentlyContinue | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess)
$pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
$procs = @{}
foreach ($p in (Get-Process -Id $pids -EA SilentlyContinue)) { $procs[$p.Id] = @{ n=$p.ProcessName; p=$p.Path } }
$tcp = @(foreach ($c in $conns) {
    $pi = $procs[[int]$c.OwningProcess]
    [PSCustomObject]@{la=$c.LocalAddress;lp=$c.LocalPort;ra=$c.RemoteAddress;rp=$c.RemotePort;st=[string]$c.State;op=$c.OwningProcess;pn=if($pi){$pi.n}else{''};pp=if($pi -and $pi.p){$pi.p}else{''}}
})
$udpEp = @(Get-NetUDPEndpoint -EA SilentlyContinue)
$udpArr = @(foreach ($u in $udpEp) {
    $pi = $procs[[int]$u.OwningProcess]
    if (-not $pi) { try { $p2=Get-Process -Id $u.OwningProcess -EA Stop; $procs[$p2.Id]=@{n=$p2.ProcessName;p=$p2.Path}; $pi=$procs[$p2.Id] } catch {} }
    [PSCustomObject]@{la=$u.LocalAddress;lp=$u.LocalPort;op=$u.OwningProcess;pn=if($pi){$pi.n}else{''}}
})
$adapters = Get-NetAdapter -EA SilentlyContinue | Select-Object Name, InterfaceDescription, Status, LinkSpeed
$stats = Get-NetAdapterStatistics -EA SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes, ReceivedUnicastPackets, SentUnicastPackets
$sm = @{}; foreach ($s in $stats) { $sm[$s.Name] = $s }
$bw = @(foreach ($a in $adapters) { $s=$sm[$a.Name]; [PSCustomObject]@{n=$a.Name;d=$a.InterfaceDescription;s=[string]$a.Status;ls=$a.LinkSpeed;rb=if($s){$s.ReceivedBytes}else{0};sb=if($s){$s.SentBytes}else{0};rp=if($s){$s.ReceivedUnicastPackets}else{0};sp=if($s){$s.SentUnicastPackets}else{0}} })
$total=$conns.Count; $est=($conns|Where-Object{$_.State -eq 'Established'}).Count; $lis=($conns|Where-Object{$_.State -eq 'Listen'}).Count
$uips=@($conns|Where-Object{$_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '::1' -and $_.RemoteAddress -ne '127.0.0.1'}|Select-Object -ExpandProperty RemoteAddress -Unique).Count
[PSCustomObject]@{tcp=$tcp;udp=$udpArr;bw=$bw;tc=$total;ec=$est;lc=$lis;ui=$uips} | ConvertTo-Json -Depth 3 -Compress"#
    ).await?;

    let now_ms = chrono::Utc::now().timestamp_millis();

    // Parse TCP connections
    let tcp_arr = match raw.get("tcp") {
        Some(Value::Array(arr)) => arr.clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    // Parse UDP
    let udp_arr = match raw.get("udp") {
        Some(Value::Array(arr)) => arr.clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    // Read IP resolve cache for per-connection company resolution
    let ip_cache = IP_RESOLVE_CACHE.lock().unwrap_or_else(|e| e.into_inner()).clone();

    // Build all connections (TCP + UDP)
    let mut all_conns: Vec<Value> = tcp_arr.iter().map(|c| {
        let ra = c["ra"].as_str().unwrap_or("").to_string();
        let resolved = if is_private_ip(&ra) || ra.is_empty() {
            json!({"isLocal": true, "org": "Lokal", "isp": "", "isTracker": false, "isHighRisk": false, "countryCode": "", "country": ""})
        } else {
            // Look up company from cache for this specific IP
            let company = ip_cache.get(&ra).cloned().unwrap_or_default();
            json!({"isLocal": false, "org": company, "isp": "", "isTracker": false, "isHighRisk": false, "countryCode": "", "country": ""})
        };
        json!({
            "localAddress": c["la"], "localPort": c["lp"],
            "remoteAddress": c["ra"], "remotePort": c["rp"],
            "state": c["st"], "owningProcess": c["op"],
            "processName": c["pn"], "processPath": c["pp"],
            "protocol": "TCP", "resolved": resolved
        })
    }).collect();

    for u in &udp_arr {
        all_conns.push(json!({
            "localAddress": u["la"], "localPort": u["lp"],
            "remoteAddress": "", "remotePort": 0,
            "state": "UDP", "owningProcess": u["op"],
            "processName": u["pn"], "processPath": "",
            "protocol": "UDP",
            "resolved": {"isLocal": true, "org": "", "isp": "", "isTracker": false, "isHighRisk": false, "countryCode": "", "country": ""}
        }));
    }

    // Group connections by process
    let mut groups: HashMap<String, Vec<&Value>> = HashMap::new();
    for conn in &all_conns {
        let pn = conn["processName"].as_str().unwrap_or("System").to_string();
        let key = if pn.is_empty() { "System".to_string() } else { pn };
        groups.entry(key).or_default().push(conn);
    }

    // Collect all unique public IPs for background resolution
    let mut all_public_ips: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut grouped: Vec<Value> = groups.iter().map(|(name, conns)| {
        let mut unique_ips: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut states: HashMap<String, usize> = HashMap::new();
        let pp = conns.first().and_then(|c| c["processPath"].as_str()).unwrap_or("").to_string();

        for c in conns {
            if let Some(ra) = c["remoteAddress"].as_str() {
                if !is_private_ip(ra) && !ra.is_empty() {
                    unique_ips.insert(ra.to_string());
                    all_public_ips.insert(ra.to_string());
                }
            }
            let st = c["state"].as_str().unwrap_or("Unknown");
            *states.entry(st.to_string()).or_insert(0) += 1;
        }

        // Resolve companies from cache
        let mut companies: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut has_trackers = false;
        for ip in &unique_ips {
            if let Some(company) = ip_cache.get(ip) {
                if !company.is_empty() {
                    companies.insert(company.clone());
                }
            }
        }
        // Check connections for tracker flags
        for c in conns {
            if let Some(resolved) = c.get("resolved") {
                if resolved["isTracker"].as_bool().unwrap_or(false) {
                    has_trackers = true;
                }
            }
        }

        let companies_vec: Vec<String> = companies.into_iter().collect();

        json!({
            "processName": name,
            "processPath": pp,
            "connections": conns,
            "connectionCount": conns.len(),
            "uniqueRemoteIPs": unique_ips.len(),
            "uniqueIPCount": unique_ips.len(),
            "uniqueIPs": unique_ips.into_iter().collect::<Vec<_>>(),
            "states": states,
            "resolvedCompanies": companies_vec,
            "hasTrackers": has_trackers,
            "hasHighRisk": false,
            "isRunning": true
        })
    }).collect();
    grouped.sort_by(|a, b| b["connectionCount"].as_u64().unwrap_or(0).cmp(&a["connectionCount"].as_u64().unwrap_or(0)));

    // Trigger background IP resolution for uncached IPs (runs async, results available on next poll)
    let uncached_ips: Vec<String> = all_public_ips.iter()
        .filter(|ip| !ip_cache.contains_key(*ip))
        .take(50)
        .cloned()
        .collect();
    if !uncached_ips.is_empty() {
        tokio::spawn(async move {
            if let Ok(result) = resolve_ips_background(&uncached_ips).await {
                let mut cache = IP_RESOLVE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(obj) = result.as_object() {
                    for (ip, info) in obj {
                        if let Some(company) = info["company"].as_str() {
                            // Store company (even empty string to avoid re-resolving)
                            cache.insert(ip.clone(), company.to_string());
                        }
                    }
                }
            }
        });
    }

    // Top processes for summary
    let top_processes: Vec<Value> = grouped.iter().take(10).map(|g| {
        json!({"name": g["processName"], "connectionCount": g["connectionCount"]})
    }).collect();

    // Summary
    let summary = json!({
        "totalConnections": raw["tc"].as_i64().unwrap_or(0),
        "establishedCount": raw["ec"].as_i64().unwrap_or(0),
        "listeningCount": raw["lc"].as_i64().unwrap_or(0),
        "uniqueRemoteIPs": raw["ui"].as_i64().unwrap_or(0),
        "udpCount": udp_arr.len(),
        "topProcesses": top_processes
    });

    // Bandwidth with delta calculation
    let bw_raw = match raw.get("bw") {
        Some(Value::Array(arr)) => arr.clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    let mut prev_store = bw_prev_store().lock().unwrap_or_else(|e| e.into_inner());
    let mut hist_store = bw_history_store().lock().unwrap_or_else(|e| e.into_inner());

    let bandwidth: Vec<Value> = bw_raw.iter().map(|b| {
        let name = b["n"].as_str().unwrap_or("").to_string();
        let store_key = format!("poll_{}", name); // Prefix to avoid collision with get_bandwidth
        let rb = b["rb"].as_i64().unwrap_or(0);
        let sb = b["sb"].as_i64().unwrap_or(0);

        let (rx_ps, tx_ps) = if let Some(prev) = prev_store.get(&store_key) {
            let elapsed = (now_ms - prev.timestamp_ms) as f64 / 1000.0;
            if elapsed > 0.5 {
                (((rb - prev.received_bytes).max(0) as f64 / elapsed), ((sb - prev.sent_bytes).max(0) as f64 / elapsed))
            } else { (0.0, 0.0) }
        } else { (0.0, 0.0) };

        prev_store.insert(store_key, BwPrev { received_bytes: rb, sent_bytes: sb, timestamp_ms: now_ms });

        if rx_ps > 0.0 || tx_ps > 0.0 || hist_store.contains_key(&name) {
            let hist = hist_store.entry(name.clone()).or_default();
            hist.push(json!({"ts": now_ms, "rx": rx_ps, "tx": tx_ps}));
            if hist.len() > MAX_BW_HISTORY { hist.remove(0); }
        }

        json!({
            "name": &name, "description": b["d"], "status": b["s"], "linkSpeed": b["ls"],
            "receivedBytes": rb, "sentBytes": sb,
            "receivedPackets": b["rp"], "sentPackets": b["sp"],
            "rxPerSec": rx_ps, "txPerSec": tx_ps
        })
    }).collect();

    // Store connections for diff tracking
    {
        let mut prev = prev_connections_store().lock().unwrap_or_else(|e| e.into_inner());
        *prev = all_conns.clone();
    }

    Ok(json!({
        "summary": summary,
        "grouped": grouped,
        "bandwidth": bandwidth
    }))
}

#[tauri::command]
pub async fn get_connection_diff() -> Result<Value, String> {
    // Get current connections
    let current_raw = crate::ps::run_ps_json_array(
        r#"Get-NetTCPConnection -EA SilentlyContinue | Where-Object { $_.State -eq 'Established' } | ForEach-Object {
$pn = (Get-Process -Id $_.OwningProcess -EA SilentlyContinue).ProcessName
[PSCustomObject]@{la=$_.LocalAddress;lp=$_.LocalPort;ra=$_.RemoteAddress;rp=$_.RemotePort;pn=$pn;op=$_.OwningProcess}
} | ConvertTo-Json -Compress"#
    ).await?;

    let current: Vec<String> = current_raw.as_array().unwrap_or(&vec![]).iter().map(|c| {
        format!("{}:{}->{}:{}", c["la"].as_str().unwrap_or(""), c["lp"], c["ra"].as_str().unwrap_or(""), c["rp"])
    }).collect();

    let prev_store = prev_connections_store().lock().unwrap_or_else(|e| e.into_inner());
    let prev_keys: Vec<String> = prev_store.iter().map(|c| {
        format!("{}:{}->{}:{}", c["localAddress"].as_str().unwrap_or(""), c["localPort"], c["remoteAddress"].as_str().unwrap_or(""), c["remotePort"])
    }).collect();

    let empty_arr = vec![];
    let current_arr = current_raw.as_array().unwrap_or(&empty_arr);

    // Use HashSets for O(1) lookup instead of O(n*m)
    let current_set: std::collections::HashSet<&str> = current.iter().map(|s| s.as_str()).collect();
    let prev_set: std::collections::HashSet<&str> = prev_keys.iter().map(|s| s.as_str()).collect();

    let added: Vec<&Value> = current_arr.iter().enumerate()
        .filter(|(i, _)| !prev_set.contains(current[*i].as_str()))
        .map(|(_, v)| v)
        .collect();

    // Detect removed connections (were in prev, not in current)
    let removed: Vec<&Value> = prev_store.iter().enumerate()
        .filter(|(i, _)| !current_set.contains(prev_keys[*i].as_str()))
        .map(|(_, v)| v)
        .collect();

    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut events: Vec<Value> = Vec::new();
    for a in &added {
        events.push(json!({
            "type": "new",
            "processName": a["pn"],
            "remoteAddress": a["ra"],
            "remotePort": a["rp"],
            "timestamp": now_ms
        }));
    }
    for r in &removed {
        events.push(json!({
            "type": "closed",
            "processName": r["processName"],
            "remoteAddress": r["remoteAddress"],
            "remotePort": r["remotePort"],
            "timestamp": now_ms
        }));
    }

    Ok(json!({ "events": events, "added": added, "removed": removed }))
}

#[tauri::command]
pub async fn get_bandwidth_history() -> Result<Value, String> {
    let store = bw_history_store().lock().unwrap_or_else(|e| e.into_inner());
    let mut result = json!({});
    for (name, history) in store.iter() {
        result[name] = json!(history);
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_wifi_info() -> Result<Value, String> {
    let raw = crate::ps::run_ps_json(
        r#"$output = netsh wlan show interfaces 2>$null
if ($LASTEXITCODE -ne 0 -or !$output) { '{"connected":false}'; return }
$info = @{}
$output | ForEach-Object { if ($_ -match '^\s+(.+?)\s+:\s+(.+)$') { $info[$Matches[1].Trim()] = $Matches[2].Trim() } }
function g($keys) { foreach($k in $keys) { if($info[$k]) { return $info[$k] } }; return $null }
$sig = g @('Signal')
$sigPct = 0; if($sig -match '(\d+)') { $sigPct = [int]$Matches[1] }
[PSCustomObject]@{
    connected=$true; ssid=g @('SSID')
    signalPercent=$sigPct; signal=$sig
    channel=g @('Kanal','Channel')
    radioType=g @('Funktyp','Radio type')
    band=g @('Band')
    auth=g @('Authentifizierung','Authentication')
    cipher=g @('Verschlüsselung','Cipher')
    rxRate=g @('Empfangsrate (MBit/s)','Receive rate (Mbps)')
    txRate=g @('Senderate (MBit/s)','Transmit rate (Mbps)')
    bssid=g @('BSSID')
} | ConvertTo-Json -Compress"#
    ).await?;
    Ok(raw)
}

#[tauri::command]
pub async fn get_dns_cache() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object { $_.Type -in @(1,28) } | Select-Object @{N='domain';E={$_.Entry}}, @{N='ip';E={$_.Data}}, @{N='ttl';E={$_.TimeToLive}}, @{N='type';E={if($_.Type -eq 1){'A'}elseif($_.Type -eq 28){'AAAA'}else{$_.Type}}} -First 200 | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn clear_dns_cache() -> Result<Value, String> {
    crate::ps::run_ps("Clear-DnsClientCache").await?;
    Ok(json!({ "success": true }))
}

// === Network Recording State ===
static NETWORK_RECORDING: std::sync::LazyLock<Mutex<Option<NetworkRecordingState>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

struct NetworkRecordingState {
    started_at: i64,
    event_count: u32,
    filename: String,
}

fn get_recordings_dir() -> std::path::PathBuf {
    let dir = get_data_dir().join("netzwerk-aufzeichnungen");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn get_snapshots_dir() -> std::path::PathBuf {
    let dir = get_data_dir().join("netzwerk-snapshots");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
pub async fn start_network_recording() -> Result<Value, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let filename = format!("recording_{}.jsonl", chrono::Local::now().format("%Y-%m-%d_%H-%M-%S"));
    let filepath = get_recordings_dir().join(&filename);

    // Write header line (async)
    let header = json!({ "type": "header", "startedAt": now, "version": 1 });
    tokio::fs::write(&filepath, format!("{}\n", header)).await.map_err(|e| e.to_string())?;

    let mut rec = NETWORK_RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    *rec = Some(NetworkRecordingState {
        started_at: now,
        event_count: 0,
        filename: filename.clone(),
    });

    tracing::debug!(filename = %filename, "Netzwerk-Aufzeichnung gestartet");
    Ok(json!({ "success": true, "filename": filename, "startedAt": now }))
}

#[tauri::command]
pub async fn stop_network_recording() -> Result<Value, String> {
    // Extract state from mutex quickly, then do I/O outside the lock
    let state_opt = {
        let mut rec = NETWORK_RECORDING.lock().unwrap_or_else(|e| e.into_inner());
        rec.take()
    };
    if let Some(state) = state_opt {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let duration = now - state.started_at;

        // Write footer line (async, outside mutex)
        let filepath = get_recordings_dir().join(&state.filename);
        let footer = json!({ "type": "footer", "stoppedAt": now, "duration": duration, "totalEvents": state.event_count });
        if let Ok(mut f) = tokio::fs::OpenOptions::new().append(true).open(&filepath).await {
            use tokio::io::AsyncWriteExt;
            let _ = f.write_all(format!("{}\n", footer).as_bytes()).await;
        }

        tracing::debug!(filename = %state.filename, events = state.event_count, "Netzwerk-Aufzeichnung gestoppt");
        Ok(json!({ "success": true, "filename": state.filename, "duration": duration, "eventCount": state.event_count }))
    } else {
        Ok(json!({ "success": false, "error": "Keine aktive Aufzeichnung" }))
    }
}

#[tauri::command]
pub async fn get_network_recording_status() -> Result<Value, String> {
    let rec = NETWORK_RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(state) = rec.as_ref() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        Ok(json!({
            "active": true,
            "startedAt": state.started_at,
            "duration": now - state.started_at,
            "eventCount": state.event_count,
            "filename": state.filename
        }))
    } else {
        Ok(json!({ "active": false, "startedAt": 0, "duration": 0, "eventCount": 0 }))
    }
}

#[tauri::command]
pub async fn append_network_recording_events(events: Value) -> Result<Value, String> {
    // Extract filename and validate under lock, then do I/O outside
    let (filepath, arr_len) = {
        let rec = NETWORK_RECORDING.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(state) = rec.as_ref() {
            if let Some(arr) = events.as_array() {
                (Some(get_recordings_dir().join(&state.filename)), arr.len())
            } else {
                return Ok(json!({ "success": false, "error": "events muss ein Array sein" }));
            }
        } else {
            return Ok(json!({ "success": false, "error": "Keine aktive Aufzeichnung" }));
        }
    };

    if let Some(fp) = filepath {
        if let Some(arr) = events.as_array() {
            if let Ok(mut f) = tokio::fs::OpenOptions::new().append(true).open(&fp).await {
                use tokio::io::AsyncWriteExt;
                for event in arr {
                    let _ = f.write_all(format!("{}\n", event).as_bytes()).await;
                }
            }
            // Update event count under lock
            let total = {
                let mut rec = NETWORK_RECORDING.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(state) = rec.as_mut() {
                    state.event_count += arr_len as u32;
                    state.event_count
                } else { 0 }
            };
            Ok(json!({ "success": true, "appended": arr_len, "totalEvents": total }))
        } else {
            Ok(json!({ "success": false, "error": "events muss ein Array sein" }))
        }
    } else {
        Ok(json!({ "success": false, "error": "Keine aktive Aufzeichnung" }))
    }
}

#[tauri::command]
pub async fn list_network_recordings() -> Result<Value, String> {
    let dir = get_recordings_dir();
    // Run blocking I/O in spawn_blocking
    let recordings = tokio::task::spawn_blocking(move || {
        use std::io::{BufRead, BufReader, Seek, SeekFrom};
        let mut recordings = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let meta = std::fs::metadata(&path).ok();
                    let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                    let modified = meta.and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0);

                    let mut started_at = 0i64;
                    let mut duration = 0i64;
                    let mut event_count = 0u32;

                    // Read only first and last line (not entire file)
                    if let Ok(file) = std::fs::File::open(&path) {
                        let mut reader = BufReader::new(file);
                        let mut first_line = String::new();
                        if reader.read_line(&mut first_line).is_ok() {
                            if let Ok(header) = serde_json::from_str::<Value>(first_line.trim()) {
                                started_at = header["startedAt"].as_i64().unwrap_or(0);
                            }
                        }
                        // Read last line by seeking from end
                        if file_size > 2 {
                            if let Ok(file2) = std::fs::File::open(&path) {
                                let mut reader2 = BufReader::new(file2);
                                // Seek backwards to find last newline
                                let mut pos = file_size as i64 - 2;
                                let mut last_line = String::new();
                                while pos > 0 {
                                    if reader2.seek(SeekFrom::Start(pos as u64)).is_ok() {
                                        let mut byte = [0u8; 1];
                                        if std::io::Read::read(&mut reader2, &mut byte).is_ok() && byte[0] == b'\n' {
                                            last_line.clear();
                                            let _ = reader2.read_line(&mut last_line);
                                            break;
                                        }
                                    }
                                    pos -= 1;
                                }
                                if !last_line.is_empty() {
                                    if let Ok(footer) = serde_json::from_str::<Value>(last_line.trim()) {
                                        if footer["type"].as_str() == Some("footer") {
                                            duration = footer["duration"].as_i64().unwrap_or(0);
                                            event_count = footer["totalEvents"].as_u64().unwrap_or(0) as u32;
                                        }
                                    }
                                }
                            }
                        }
                        // Fallback: count lines if no footer (file still being recorded)
                        if event_count == 0 && file_size > 0 {
                            if let Ok(file3) = std::fs::File::open(&path) {
                                // Count non-header/footer lines
                                event_count = BufReader::new(file3).lines().flatten()
                                    .filter(|l| !l.contains("\"type\":\"header\"") && !l.contains("\"type\":\"footer\"") && !l.trim().is_empty())
                                    .count() as u32;
                            }
                        }
                    }

                    recordings.push(json!({
                        "filename": filename,
                        "startedAt": started_at,
                        "duration": duration,
                        "eventCount": event_count,
                        "fileSize": file_size,
                        "modified": modified
                    }));
                }
            }
        }
        recordings.sort_by(|a, b| b["modified"].as_i64().cmp(&a["modified"].as_i64()));
        recordings
    }).await.map_err(|e| e.to_string())?;

    Ok(json!(recordings))
}

#[tauri::command]
pub async fn delete_network_recording(filename: String) -> Result<Value, String> {
    // Security: prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Ungültiger Dateiname".to_string());
    }
    let path = get_recordings_dir().join(&filename);
    if tokio::fs::metadata(&path).await.is_ok() {
        tokio::fs::remove_file(&path).await.map_err(|e| format!("Löschen fehlgeschlagen: {}", e))?;
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": "Datei nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn open_network_recordings_dir() -> Result<Value, String> {
    let dir = get_recordings_dir();
    let _ = std::process::Command::new("explorer.exe")
        .arg(dir.to_string_lossy().to_string())
        .spawn();
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn save_network_snapshot(data: Value) -> Result<Value, String> {
    let filename = format!("snapshot_{}.json", chrono::Local::now().format("%Y-%m-%d_%H-%M-%S"));
    let filepath = get_snapshots_dir().join(&filename);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let snapshot = json!({
        "timestamp": now,
        "data": data
    });
    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    std::fs::write(&filepath, content).map_err(|e| format!("Snapshot speichern fehlgeschlagen: {}", e))?;
    tracing::debug!(filename = %filename, "Netzwerk-Snapshot gespeichert");
    Ok(json!({ "success": true, "filename": filename, "timestamp": now }))
}

#[tauri::command]
pub async fn get_network_history() -> Result<Value, String> {
    let dir = get_snapshots_dir();
    let mut snapshots = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(snap) = serde_json::from_str::<Value>(&content) {
                        let ts = snap["timestamp"].as_i64().unwrap_or(0);
                        snapshots.push(json!({
                            "filename": filename,
                            "timestamp": ts,
                            "data": snap.get("data").cloned().unwrap_or(json!({}))
                        }));
                    }
                }
            }
        }
    }
    snapshots.sort_by(|a, b| b["timestamp"].as_i64().cmp(&a["timestamp"].as_i64()));
    Ok(json!(snapshots))
}

#[tauri::command]
pub async fn clear_network_history() -> Result<Value, String> {
    let dir = get_snapshots_dir();
    let mut deleted = 0u32;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().extension().map(|e| e == "json").unwrap_or(false) {
                let _ = std::fs::remove_file(entry.path());
                deleted += 1;
            }
        }
    }
    Ok(json!({ "success": true, "deleted": deleted }))
}

#[tauri::command]
pub async fn export_network_history(format: Option<String>) -> Result<Value, String> {
    let fmt = format.unwrap_or_else(|| "json".to_string());
    let dir = get_snapshots_dir();
    let mut all_snapshots = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(snap) = serde_json::from_str::<Value>(&content) {
                        all_snapshots.push(snap);
                    }
                }
            }
        }
    }

    let export_filename = format!("netzwerk-verlauf_{}.{}", chrono::Local::now().format("%Y-%m-%d"), fmt);
    let export_path = get_data_dir().join(&export_filename);

    match fmt.as_str() {
        "csv" => {
            let mut csv = String::from("Zeitpunkt;Verbindungen_Gesamt;Verbindungen_Aktiv;Verbindungen_Horchend;UDP_Endpunkte;Prozesse\n");
            for snap in &all_snapshots {
                let ts = snap["timestamp"].as_i64().unwrap_or(0);
                let empty = json!({});
                let data = snap.get("data").unwrap_or(&empty);
                let summary = data.get("summary").unwrap_or(&empty);
                let total = summary["totalConnections"].as_u64().unwrap_or(0);
                let established = summary["establishedCount"].as_u64().unwrap_or(0);
                let listening = summary["listeningCount"].as_u64().unwrap_or(0);
                let udp = summary["udpCount"].as_u64().unwrap_or(0);
                let processes = data.get("grouped").and_then(|g| g.as_array()).map(|a| a.len()).unwrap_or(0);
                csv.push_str(&format!("{};{};{};{};{};{}\n", ts, total, established, listening, udp, processes));
            }
            std::fs::write(&export_path, csv).map_err(|e| e.to_string())?;
        }
        _ => {
            let content = serde_json::to_string_pretty(&all_snapshots).map_err(|e| e.to_string())?;
            std::fs::write(&export_path, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(json!({ "success": true, "path": export_path.to_string_lossy().to_string(), "count": all_snapshots.len() }))
}


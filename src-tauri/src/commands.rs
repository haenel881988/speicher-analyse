use serde_json::{json, Value};
use tauri::Emitter;
use std::path::Path;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

// === JSON File Persistence ===

fn get_data_dir() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = std::path::PathBuf::from(appdata).join("speicher-analyse");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json_file(filename: &str) -> Value {
    let path = get_data_dir().join(filename);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(json!({})),
        Err(_) => json!({}),
    }
}

fn write_json_file(filename: &str, data: &Value) -> Result<(), String> {
    let path = get_data_dir().join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("Datei schreiben fehlgeschlagen: {}", e))
}

// === Validation Helpers ===

fn validate_ip(ip: &str) -> Result<(), String> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return Err(format!("Ungültige IP-Adresse: {}", ip));
    }
    for part in &parts {
        match part.parse::<u8>() {
            Ok(_) => {}
            Err(_) => return Err(format!("Ungültige IP-Adresse: {}", ip)),
        }
    }
    Ok(())
}

fn validate_path(p: &str) -> Result<(), String> {
    let p_lower = p.to_lowercase().replace('/', "\\");
    let blocked = [
        "\\windows\\system32", "\\windows\\syswow64",
        "\\program files\\", "\\program files (x86)\\",
        "\\programdata\\", "\\$recycle.bin",
        "\\system volume information",
    ];
    for b in &blocked {
        if p_lower.contains(b) {
            return Err(format!("Zugriff auf Systempfad verweigert: {}", p));
        }
    }
    // Block drive root (e.g. "C:\") — too dangerous for delete/write
    if p_lower.len() <= 3 {
        return Err(format!("Zugriff auf Laufwerkswurzel verweigert: {}", p));
    }
    Ok(())
}

// === Network State (bandwidth delta, history, prev connections) ===

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
static LAST_NETWORK_SCAN: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));
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

// === Drive & Scan ===

#[tauri::command]
pub async fn get_drives() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        "Get-CimInstance Win32_LogicalDisk | Where-Object {$_.Size -gt 0} | ForEach-Object { $total = [long]$_.Size; $free = [long]$_.FreeSpace; $used = $total - $free; $pct = [math]::Round(($used / $total) * 1000) / 10; [PSCustomObject]@{ device = $_.DeviceID + '\\'; mountpoint = $_.DeviceID + '\\'; fstype = $_.FileSystem; total = $total; used = $used; free = $free; percent = $pct } } | ConvertTo-Json -Compress"
    ).await
}

#[tauri::command]
pub async fn start_scan(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    tracing::info!(path = %path, "Scan gestartet");

    // Validate path exists before starting scan
    if !Path::new(&path).exists() {
        let _ = app.emit("scan-error", json!({
            "error": format!("Pfad existiert nicht: {}", path),
            "path": &path
        }));
        return Err(format!("Pfad existiert nicht: {}", path));
    }

    let scan_id = format!("scan_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let sid = scan_id.clone();
    let scan_id_ret = scan_id.clone();

    // Use spawn_blocking for walkdir (blocking I/O)
    tokio::task::spawn_blocking(move || {
        tracing::debug!(scan_id = %sid, "Scan-Thread gestartet");
        let start = std::time::Instant::now();
        let mut files: Vec<crate::scan::FileEntry> = Vec::new();
        let mut dirs_scanned: u64 = 0;
        let mut files_found: u64 = 0;
        let mut total_size: u64 = 0;
        let mut errors_count: u64 = 0;
        let mut last_progress = std::time::Instant::now();
        let mut current_path = String::new();

        for entry in walkdir::WalkDir::new(&path)
            .follow_links(false)
            .into_iter()
        {
            match entry {
                Ok(e) => {
                    current_path = e.path().to_string_lossy().to_string();
                    if e.file_type().is_dir() {
                        dirs_scanned += 1;
                    } else {
                        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                        total_size += size;
                        files_found += 1;

                        let name = e.file_name().to_string_lossy().to_string();
                        let ext = std::path::Path::new(&name)
                            .extension()
                            .map(|x| format!(".{}", x.to_string_lossy().to_lowercase()))
                            .unwrap_or_default();
                        let modified_ms = e.metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .map(|t: std::time::SystemTime| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
                            .unwrap_or(0);

                        files.push(crate::scan::FileEntry {
                            path: current_path.clone(),
                            name,
                            size,
                            modified_ms,
                            extension: ext,
                        });
                    }

                    // Emit progress every 300ms
                    if last_progress.elapsed() > std::time::Duration::from_millis(300) {
                        let _ = app.emit("scan-progress", json!({
                            "scan_id": &sid,
                            "status": "scanning",
                            "current_path": &current_path,
                            "dirs_scanned": dirs_scanned,
                            "files_found": files_found,
                            "total_size": total_size,
                            "errors_count": errors_count,
                            "elapsed_seconds": (start.elapsed().as_secs_f64() * 10.0).round() / 10.0
                        }));
                        last_progress = std::time::Instant::now();
                    }
                }
                Err(_) => {
                    errors_count += 1;
                }
            }
        }

        let elapsed = start.elapsed().as_secs_f64();
        tracing::info!(files = files_found, dirs = dirs_scanned, errors = errors_count, elapsed_s = format!("{:.1}", elapsed), "Scan abgeschlossen");

        // Store scan data for queries
        crate::scan::save(crate::scan::ScanData {
            scan_id: sid.clone(),
            root_path: path.clone(),
            files,
            dirs_scanned,
            total_size,
            elapsed_seconds: elapsed,
        });
        tracing::debug!(scan_id = %sid, "Scan-Daten im Store gespeichert");

        // Persist to disk for session restore
        let data_dir = get_data_dir();
        match crate::scan::save_to_disk(&data_dir) {
            Ok(_) => tracing::debug!(scan_id = %sid, "Scan-Daten auf Disk persistiert"),
            Err(e) => tracing::warn!(scan_id = %sid, error = %e, "Scan-Daten konnten nicht persistiert werden"),
        }

        // Save scan metadata in session.json for frontend restore
        let mut session = read_json_file("session.json");
        if let Some(obj) = session.as_object_mut() {
            obj.insert("sessions".to_string(), json!([{
                "scan_id": &sid,
                "current_path": &path,
                "dirs_scanned": dirs_scanned,
                "files_found": files_found,
                "total_size": total_size,
                "elapsed_seconds": (elapsed * 10.0).round() / 10.0
            }]));
        }
        let _ = write_json_file("session.json", &session);

        // Emit completion
        let emit_result = app.emit("scan-complete", json!({
            "scan_id": &sid,
            "status": "complete",
            "current_path": &path,
            "dirs_scanned": dirs_scanned,
            "files_found": files_found,
            "total_size": total_size,
            "errors_count": errors_count,
            "elapsed_seconds": (elapsed * 10.0).round() / 10.0
        }));
        tracing::debug!(scan_id = %sid, emit_ok = emit_result.is_ok(), "scan-complete Event gesendet");
    });

    tracing::debug!(scan_id = %scan_id_ret, "Scan-ID zurückgegeben");
    Ok(json!({ "scan_id": scan_id_ret }))
}

// === Tree Data ===

#[tauri::command]
pub async fn get_tree_node(scan_id: String, path: String, depth: Option<u32>) -> Result<Value, String> {
    Ok(crate::scan::tree_node(&scan_id, &path, depth.unwrap_or(1)))
}

#[tauri::command]
pub async fn get_treemap_data(scan_id: String, path: String, depth: Option<u32>) -> Result<Value, String> {
    Ok(crate::scan::tree_node(&scan_id, &path, depth.unwrap_or(1)))
}

// === File Data (from scan state) ===

#[tauri::command]
pub async fn get_top_files(scan_id: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(crate::scan::top_files(&scan_id, limit.unwrap_or(100) as usize))
}

#[tauri::command]
pub async fn get_file_types(scan_id: String) -> Result<Value, String> {
    Ok(crate::scan::file_types(&scan_id))
}

#[tauri::command]
pub async fn search(scan_id: String, query: String, min_size: Option<u64>) -> Result<Value, String> {
    Ok(crate::scan::search_files(&scan_id, &query, min_size.unwrap_or(0)))
}

#[tauri::command]
pub async fn get_files_by_extension(scan_id: String, ext: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(crate::scan::files_by_extension(&scan_id, &ext, limit.unwrap_or(500) as usize))
}

#[tauri::command]
pub async fn get_files_by_category(scan_id: String, category: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(crate::scan::files_by_category(&scan_id, &category, limit.unwrap_or(500) as usize))
}

// === Export ===

#[tauri::command]
pub async fn export_csv(scan_id: String) -> Result<Value, String> {
    let csv = crate::scan::export_csv(&scan_id);
    if csv.is_empty() {
        return Err("Keine Scan-Daten vorhanden".to_string());
    }
    Ok(json!({ "success": true, "content": csv }))
}

#[tauri::command]
pub async fn show_save_dialog(app: tauri::AppHandle, _options: Option<Value>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().save_file(move |path| {
        let _ = tx.send(path);
    });
    let path = tokio::task::spawn_blocking(move || {
        rx.recv().unwrap_or(None)
    }).await.unwrap_or(None);
    match path {
        Some(p) => Ok(json!({ "path": p.to_string() })),
        None => Ok(json!({ "canceled": true })),
    }
}

// === File Management ===

#[tauri::command]
pub async fn delete_to_trash(paths: Vec<String>) -> Result<Value, String> {
    tracing::info!(count = paths.len(), "Papierkorb-Löschung angefordert");
    let ps_paths = paths.iter().map(|p| format!("'{}'", p.replace("'", "''"))).collect::<Vec<_>>().join(",");
    let script = format!(
        r#"Add-Type -AssemblyName Microsoft.VisualBasic
@({}) | ForEach-Object {{ [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_, 'OnlyErrorDialogs', 'SendToRecycleBin') }}
'ok'"#, ps_paths
    );
    crate::ps::run_ps(&script).await.map(|_| json!({ "success": true }))
}

#[tauri::command]
pub async fn delete_permanent(paths: Vec<String>) -> Result<Value, String> {
    tracing::warn!(count = paths.len(), "Permanente Löschung angefordert");
    for p in &paths {
        validate_path(p)?;
        let path = Path::new(p);
        if path.is_dir() {
            tokio::fs::remove_dir_all(path).await.map_err(|e| e.to_string())?;
        } else {
            tokio::fs::remove_file(path).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn create_folder(parent_path: String, name: String) -> Result<Value, String> {
    validate_path(&parent_path)?;
    let full = Path::new(&parent_path).join(&name);
    tokio::fs::create_dir_all(&full).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "path": full.to_string_lossy() }))
}

#[tauri::command]
pub async fn file_rename(old_path: String, new_name: String) -> Result<Value, String> {
    validate_path(&old_path)?;
    let src = Path::new(&old_path);
    let dest = src.parent().unwrap_or(Path::new(".")).join(&new_name);
    tokio::fs::rename(&src, &dest).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "newPath": dest.to_string_lossy() }))
}

#[tauri::command]
pub async fn file_move(source_paths: Vec<String>, dest_dir: String) -> Result<Value, String> {
    for src in &source_paths {
        validate_path(src)?;
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        tokio::fs::rename(src, &dest).await.map_err(|e| e.to_string())?;
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn file_copy(source_paths: Vec<String>, dest_dir: String) -> Result<Value, String> {
    for src in &source_paths {
        validate_path(src)?;
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        tokio::fs::copy(src, &dest).await.map_err(|e| e.to_string())?;
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn file_properties(file_path: String) -> Result<Value, String> {
    let script = format!(
        r#"$item = Get-Item -LiteralPath '{}'
[PSCustomObject]@{{
    name = $item.Name; path = $item.FullName; size = [long]$item.Length
    created = $item.CreationTime.ToString('o'); modified = $item.LastWriteTime.ToString('o')
    accessed = $item.LastAccessTime.ToString('o'); isDir = $item.PSIsContainer
    readOnly = $item.IsReadOnly; hidden = ($item.Attributes -band [IO.FileAttributes]::Hidden) -ne 0
    extension = $item.Extension
}} | ConvertTo-Json -Compress"#,
        file_path.replace("'", "''")
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn open_file(file_path: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Start-Process '{}'", file_path.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn show_in_explorer(file_path: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("explorer.exe /select,'{}'", file_path.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

// === Context Menu ===

#[tauri::command]
pub async fn show_context_menu(app: tauri::AppHandle, menu_type: String, context: Option<Value>) -> Result<Value, String> {
    // Context menus are handled by the frontend in Tauri v2 (native menus require window handle)
    // We emit an event so the frontend can show a custom context menu
    let _ = app.emit("context-menu-request", json!({
        "menuType": menu_type,
        "context": context
    }));
    Ok(json!({ "success": true }))
}

// === Dialog ===

#[tauri::command]
pub async fn show_confirm_dialog(app: tauri::AppHandle, options: Value) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let title = options.get("title").and_then(|v| v.as_str()).unwrap_or("Bestätigung").to_string();
    let message = options.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let buttons = options.get("buttons").and_then(|v| v.as_array()).cloned();

    let (tx, rx) = std::sync::mpsc::channel();

    let builder = app.dialog().message(message).title(title);

    // Note: tauri-plugin-dialog v2 doesn't support custom button labels
    // Dialog shows standard OK/Cancel buttons
    let _ = buttons; // silence unused warning

    builder.show(move |answer| {
        let _ = tx.send(answer);
    });

    // Wait for user response without blocking async executor
    let answer = tokio::task::spawn_blocking(move || {
        rx.recv().unwrap_or(false)
    }).await.unwrap_or(false);

    Ok(json!({ "response": if answer { 1 } else { 0 } }))
}

// === Old Files ===

#[tauri::command]
pub async fn get_old_files(scan_id: String, threshold_days: Option<u32>, min_size: Option<u64>) -> Result<Value, String> {
    Ok(crate::scan::old_files(&scan_id, threshold_days.unwrap_or(180), min_size.unwrap_or(1_048_576)))
}

// === Duplicate Finder ===

static DUPLICATE_CANCEL: std::sync::LazyLock<std::sync::atomic::AtomicBool> =
    std::sync::LazyLock::new(|| std::sync::atomic::AtomicBool::new(false));

#[tauri::command]
pub async fn start_duplicate_scan(app: tauri::AppHandle, scan_id: String, options: Option<Value>) -> Result<Value, String> {
    tracing::debug!(scan_id = %scan_id, "Starte Duplikat-Scan");
    DUPLICATE_CANCEL.store(false, std::sync::atomic::Ordering::Relaxed);

    let min_size = options.as_ref()
        .and_then(|o| o.get("minSize"))
        .and_then(|v| v.as_u64())
        .unwrap_or(1024); // 1KB minimum

    let sid = scan_id.clone();
    let app2 = app.clone();

    // Run duplicate detection in background
    tokio::task::spawn_blocking(move || {
        use std::collections::HashMap;

        // Phase 1: Group files by size from scan data
        let size_groups: Option<HashMap<u64, Vec<(String, String)>>> = crate::scan::with_scan(&sid, |data| {
            let mut groups: HashMap<u64, Vec<(String, String)>> = HashMap::new();
            for f in &data.files {
                if f.size >= min_size {
                    groups.entry(f.size).or_default().push((f.path.clone(), f.name.clone()));
                }
            }
            groups
        });

        let size_groups = match size_groups {
            Some(g) => g,
            None => {
                let _ = app2.emit("duplicate-error", json!({ "scanId": sid, "error": "Scan-Daten nicht gefunden" }));
                return;
            }
        };

        // Filter to only groups with 2+ files of same size
        let candidate_groups: Vec<(u64, Vec<(String, String)>)> = size_groups.into_iter()
            .filter(|(_, files)| files.len() >= 2)
            .collect();

        let total_candidates: usize = candidate_groups.iter().map(|(_, f)| f.len()).sum();
        let _ = app2.emit("duplicate-progress", json!({
            "scanId": sid,
            "phase": "hashing",
            "totalCandidates": total_candidates,
            "processed": 0
        }));

        // Phase 2: Hash files within same-size groups to find true duplicates
        let mut result_groups = Vec::new();
        let mut processed = 0u64;

        for (size, files) in &candidate_groups {
            if DUPLICATE_CANCEL.load(std::sync::atomic::Ordering::Relaxed) {
                let _ = app2.emit("duplicate-complete", json!({ "scanId": sid, "groups": result_groups, "cancelled": true }));
                return;
            }

            let mut hash_groups: HashMap<String, Vec<&(String, String)>> = HashMap::new();
            for file_info in files {
                // Compute partial hash (first 8KB + last 8KB) for speed
                let hash = match compute_partial_hash(&file_info.0) {
                    Some(h) => h,
                    None => { processed += 1; continue; }
                };
                hash_groups.entry(hash).or_default().push(file_info);
                processed += 1;
            }

            // Emit progress periodically
            if processed % 100 == 0 {
                let _ = app2.emit("duplicate-progress", json!({
                    "scanId": sid, "phase": "hashing",
                    "totalCandidates": total_candidates, "processed": processed
                }));
            }

            for (hash, dup_files) in hash_groups {
                if dup_files.len() >= 2 {
                    let files_json: Vec<Value> = dup_files.iter().map(|(path, name)| {
                        json!({ "path": path, "name": name, "size": size })
                    }).collect();
                    result_groups.push(json!({
                        "hash": hash,
                        "size": size,
                        "count": dup_files.len(),
                        "saveable": size * (dup_files.len() as u64 - 1),
                        "files": files_json
                    }));
                }
            }
        }

        // Sort by saveable space descending
        result_groups.sort_by(|a, b| {
            b["saveable"].as_u64().unwrap_or(0).cmp(&a["saveable"].as_u64().unwrap_or(0))
        });

        let _ = app2.emit("duplicate-complete", json!({
            "scanId": sid,
            "groups": result_groups
        }));
    });

    Ok(json!({ "started": true }))
}

fn compute_partial_hash(path: &str) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    let size = meta.len();

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::Hasher;

    // Hash first 8KB
    let mut buf = [0u8; 8192];
    let n = file.read(&mut buf).ok()?;
    hasher.write(&buf[..n]);

    // Hash last 8KB if file is large enough
    if size > 16384 {
        use std::io::Seek;
        file.seek(std::io::SeekFrom::End(-8192)).ok()?;
        let n = file.read(&mut buf).ok()?;
        hasher.write(&buf[..n]);
    }

    // Include file size in hash to reduce collisions
    hasher.write_u64(size);

    Some(format!("{:016x}", hasher.finish()))
}

#[tauri::command]
pub async fn cancel_duplicate_scan(_scan_id: String) -> Result<Value, String> {
    DUPLICATE_CANCEL.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(json!({ "cancelled": true }))
}

#[tauri::command]
pub async fn get_size_duplicates(scan_id: String, min_size: Option<u64>) -> Result<Value, String> {
    let ms = min_size.unwrap_or(1024);
    let result = crate::scan::with_scan(&scan_id, |data| {
        let mut groups: HashMap<u64, Vec<(&str, &str)>> = HashMap::new();
        for f in &data.files {
            if f.size >= ms {
                groups.entry(f.size).or_default().push((&f.path, &f.name));
            }
        }

        let mut dup_groups = Vec::new();
        let mut total_duplicates = 0u64;
        let mut total_saveable = 0u64;
        let mut total_files = 0u64;

        for (size, files) in &groups {
            if files.len() >= 2 {
                let saveable = size * (files.len() as u64 - 1);
                let files_json: Vec<Value> = files.iter().map(|(p, n)| json!({"path": p, "name": n, "size": size})).collect();
                total_duplicates += files.len() as u64;
                total_saveable += saveable;
                total_files += files.len() as u64;
                dup_groups.push(json!({
                    "size": size,
                    "count": files.len(),
                    "saveable": saveable,
                    "files": files_json
                }));
            }
        }
        dup_groups.sort_by(|a, b| b["saveable"].as_u64().unwrap_or(0).cmp(&a["saveable"].as_u64().unwrap_or(0)));

        json!({
            "totalGroups": dup_groups.len(),
            "totalDuplicates": total_duplicates,
            "totalSaveable": total_saveable,
            "totalFiles": total_files,
            "groups": dup_groups
        })
    });

    Ok(result.unwrap_or(json!({ "totalGroups": 0, "totalDuplicates": 0, "totalSaveable": 0, "totalFiles": 0, "groups": [] })))
}

// === Memory ===

#[tauri::command]
pub async fn release_scan_bulk_data(scan_id: String) -> Result<Value, String> {
    // Actually clear the scan data from memory
    let mut s = crate::scan::store_mut();
    let removed = s.remove(&scan_id).is_some();
    Ok(json!({ "released": removed }))
}

// === Cleanup ===

#[tauri::command]
pub async fn scan_cleanup_categories(_scan_id: String) -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$cats = @()
$temp = [System.IO.Path]::GetTempPath()
$tempFiles = @(Get-ChildItem -Path $temp -Recurse -Force -File -ErrorAction SilentlyContinue)
$tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum
$cats += [PSCustomObject]@{ id='temp'; name='Temporäre Dateien'; icon='trash'; description='Temporäre Dateien die nicht mehr benötigt werden'; totalSize=[long]$tempSize; fileCount=$tempFiles.Count; requiresAdmin=$false; paths=@([PSCustomObject]@{path=$temp;size=[long]$tempSize}) }
$winTemp = "$env:SystemRoot\Temp"
if (Test-Path $winTemp) {
    $wtFiles = @(Get-ChildItem -Path $winTemp -Recurse -Force -File -ErrorAction SilentlyContinue)
    $wtSize = ($wtFiles | Measure-Object -Property Length -Sum).Sum
    $cats += [PSCustomObject]@{ id='wintemp'; name='Windows Temp'; icon='windows'; description='Temporäre Windows-Systemdateien'; totalSize=[long]$wtSize; fileCount=$wtFiles.Count; requiresAdmin=$true; paths=@([PSCustomObject]@{path=$winTemp;size=[long]$wtSize}) }
}
$thumbs = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
if (Test-Path $thumbs) {
    $thFiles = @(Get-ChildItem -Path $thumbs -Filter 'thumbcache_*' -Force -File -ErrorAction SilentlyContinue)
    $thSize = ($thFiles | Measure-Object -Property Length -Sum).Sum
    $cats += [PSCustomObject]@{ id='thumbnails'; name='Miniaturansichten'; icon='image'; description='Zwischengespeicherte Vorschaubilder'; totalSize=[long]$thSize; fileCount=$thFiles.Count; requiresAdmin=$false; paths=@([PSCustomObject]@{path=$thumbs;size=[long]$thSize}) }
}
$cats | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn clean_category(_category_id: String, paths: Vec<String>) -> Result<Value, String> {
    tracing::info!(category = %_category_id, count = paths.len(), "Bereinigung Kategorie");
    let mut deleted_count: u64 = 0;
    let mut errors: Vec<Value> = Vec::new();
    for p in &paths {
        if let Err(e) = validate_path(p) {
            errors.push(json!({"path": p, "error": e}));
            continue;
        }
        let path = Path::new(p);
        let result = if path.is_dir() {
            // Count files before deleting
            let count = walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).count() as u64;
            match tokio::fs::remove_dir_all(path).await {
                Ok(_) => { deleted_count += count; Ok(()) }
                Err(e) => Err(e)
            }
        } else {
            match tokio::fs::remove_file(path).await {
                Ok(_) => { deleted_count += 1; Ok(()) }
                Err(e) => Err(e)
            }
        };
        if let Err(e) = result {
            errors.push(json!({"path": p, "error": e.to_string()}));
        }
    }
    Ok(json!({ "success": true, "deletedCount": deleted_count, "errors": errors }))
}

// === Preview / Editor ===

#[tauri::command]
pub async fn read_file_preview(file_path: String, max_lines: Option<u32>) -> Result<Value, String> {
    let content = tokio::fs::read_to_string(&file_path).await.map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().take(max_lines.unwrap_or(100) as usize).collect();
    Ok(json!({ "content": lines.join("\n"), "totalLines": content.lines().count(), "truncated": content.lines().count() > max_lines.unwrap_or(100) as usize }))
}

#[tauri::command]
pub async fn read_file_content(file_path: String) -> Result<Value, String> {
    let content = tokio::fs::read_to_string(&file_path).await.map_err(|e| e.to_string())?;
    Ok(json!({ "content": content }))
}

#[tauri::command]
pub async fn write_file_content(file_path: String, content: String) -> Result<Value, String> {
    validate_path(&file_path)?;
    tokio::fs::write(&file_path, &content).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn read_file_binary(file_path: String) -> Result<Value, String> {
    let bytes = tokio::fs::read(&file_path).await.map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(json!({ "data": b64, "size": bytes.len() }))
}

// === Registry ===

#[tauri::command]
pub async fn scan_registry() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$categories = @()
# Verwaiste Deinstallationseinträge
$orphaned = @()
$paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($p in $paths) {
    Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $installPath = $_.InstallLocation
        if ($installPath -and !(Test-Path $installPath)) {
            $orphaned += [PSCustomObject]@{ name=$_.DisplayName; key=$_.PSPath; reason="Installationsverzeichnis nicht gefunden: $installPath" }
        }
    }
}
$categories += [PSCustomObject]@{ id='orphaned_uninstall'; name='Verwaiste Deinstallationseinträge'; icon='uninstall'; description='Programme deren Installationsverzeichnis nicht mehr existiert'; entries=$orphaned }
# Verwaiste COM/ActiveX
$comOrph = @()
Get-ChildItem 'HKLM:\SOFTWARE\Classes\CLSID' -ErrorAction SilentlyContinue | Select-Object -First 200 | ForEach-Object {
    $server = Get-ItemProperty "$($_.PSPath)\InprocServer32" -ErrorAction SilentlyContinue
    if ($server -and $server.'(default)' -and !(Test-Path $server.'(default)')) {
        $comOrph += [PSCustomObject]@{ name=$_.PSChildName; key=$_.PSPath; reason="DLL nicht gefunden: $($server.'(default)')" }
    }
}
$categories += [PSCustomObject]@{ id='orphaned_com'; name='Verwaiste COM-Einträge'; icon='component'; description='COM-Objekte deren DLL-Dateien fehlen'; entries=$comOrph }
$categories | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn export_registry_backup(entries: Value) -> Result<Value, String> {
    let backup_dir = get_data_dir().join("registry-backups");
    let _ = std::fs::create_dir_all(&backup_dir);
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_file = backup_dir.join(format!("registry_backup_{}.json", timestamp));
    let content = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&backup_file, content)
        .map_err(|e| format!("Backup schreiben fehlgeschlagen: {}", e))?;
    Ok(json!({ "success": true, "path": backup_file.to_string_lossy().to_string() }))
}

#[tauri::command]
pub async fn clean_registry(entries: Value) -> Result<Value, String> {
    tracing::warn!(entries_count = entries.as_array().map_or(0, |a| a.len()), "Registry-Bereinigung gestartet");
    // First create a backup
    let backup_dir = get_data_dir().join("registry-backups");
    let _ = std::fs::create_dir_all(&backup_dir);
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_file = backup_dir.join(format!("pre_clean_{}.json", timestamp));
    let content = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    let _ = std::fs::write(&backup_file, &content);

    let mut cleaned = 0u64;
    let mut errors = Vec::new();
    if let Some(categories) = entries.as_array() {
        for cat in categories {
            if let Some(cat_entries) = cat.get("entries").and_then(|e| e.as_array()) {
                for entry in cat_entries {
                    if let Some(key) = entry.get("key").and_then(|k| k.as_str()) {
                        let safe_key = key.replace("'", "''");
                        let script = format!("Remove-Item -Path '{}' -Force -ErrorAction Stop", safe_key);
                        match crate::ps::run_ps(&script).await {
                            Ok(_) => cleaned += 1,
                            Err(e) => errors.push(format!("{}: {}", key, e)),
                        }
                    }
                }
            }
        }
    }
    Ok(json!({ "success": true, "cleaned": cleaned, "errors": errors, "backupPath": backup_file.to_string_lossy().to_string() }))
}

#[tauri::command]
pub async fn restore_registry_backup() -> Result<Value, String> {
    // List available backups and let the user select
    let backup_dir = get_data_dir().join("registry-backups");
    let mut backups = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let meta = std::fs::metadata(&path).ok();
                let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = meta.and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                // Try to read backup to count entries
                let entry_count = std::fs::read_to_string(&path).ok()
                    .and_then(|c| serde_json::from_str::<Value>(&c).ok())
                    .and_then(|v| v.get("entries").and_then(|e| e.as_array().map(|a| a.len())))
                    .unwrap_or(0);

                backups.push(json!({
                    "filename": filename,
                    "path": path.to_string_lossy().to_string(),
                    "fileSize": file_size,
                    "modified": modified,
                    "entryCount": entry_count
                }));
            }
        }
    }
    backups.sort_by(|a, b| b["modified"].as_i64().cmp(&a["modified"].as_i64()));
    Ok(json!({ "backups": backups }))
}

// === Autostart ===

#[tauri::command]
pub async fn get_autostart_entries() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$entries = @()
# Registry Run keys
$regPaths = @(
    @{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';s='registry';l='HKCU\Run'},
    @{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';s='registry';l='HKLM\Run'},
    @{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce';s='registry';l='HKCU\RunOnce'},
    @{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce';s='registry';l='HKLM\RunOnce'}
)
foreach ($rp in $regPaths) {
    $props = Get-ItemProperty $rp.p -ErrorAction SilentlyContinue
    if ($props) {
        $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
            $cmd = "$($_.Value)"
            $exe = ($cmd -replace '"','') -split '\s' | Select-Object -First 1
            $exists = if ($exe) { Test-Path $exe -EA SilentlyContinue } else { $false }
            $entries += [PSCustomObject]@{ name=$_.Name; command=$cmd; source=$rp.s; locationLabel=$rp.l; enabled=$true; exists=$exists }
        }
    }
}
# Startup folder
$startupPath = [Environment]::GetFolderPath('Startup')
if (Test-Path $startupPath) {
    Get-ChildItem $startupPath -File -ErrorAction SilentlyContinue | ForEach-Object {
        $entries += [PSCustomObject]@{ name=$_.BaseName; command=$_.FullName; source='folder'; locationLabel='Autostart-Ordner'; enabled=$true; exists=$true }
    }
}
$entries | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn toggle_autostart(entry: Value, enabled: bool) -> Result<Value, String> {
    let source = entry.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let command = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let location_label = entry.get("locationLabel").and_then(|v| v.as_str()).unwrap_or("");

    match source {
        "registry" => {
            // Determine registry path from locationLabel
            let reg_path = if location_label.contains("HKCU\\Run") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKLM\\Run") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKCU\\RunOnce") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else {
                return Err("Unbekannter Registry-Pfad".to_string());
            };
            let safe_name = name.replace("'", "''");
            let safe_cmd = command.replace("'", "''");
            if enabled {
                // Re-enable: set value back
                let script = format!("Set-ItemProperty -Path '{}' -Name '{}' -Value '{}'", reg_path, safe_name, safe_cmd);
                crate::ps::run_ps(&script).await?;
            } else {
                // Disable: remove value (moves to a disabled subkey is complex, just remove for now)
                let script = format!("Remove-ItemProperty -Path '{}' -Name '{}' -Force -ErrorAction SilentlyContinue", reg_path, safe_name);
                crate::ps::run_ps(&script).await?;
            }
            Ok(json!({ "success": true }))
        }
        "folder" => {
            // Startup folder: rename file to add/remove .disabled extension
            let safe_cmd = command.replace("'", "''");
            if enabled {
                let script = format!("if (Test-Path '{}.disabled') {{ Rename-Item '{}.disabled' -NewName (Split-Path '{}' -Leaf) }}", safe_cmd, safe_cmd, safe_cmd);
                crate::ps::run_ps(&script).await?;
            } else {
                let script = format!("if (Test-Path '{}') {{ Rename-Item '{}' -NewName ((Split-Path '{}' -Leaf) + '.disabled') }}", safe_cmd, safe_cmd, safe_cmd);
                crate::ps::run_ps(&script).await?;
            }
            Ok(json!({ "success": true }))
        }
        _ => Err(format!("Unbekannte Autostart-Quelle: {}", source)),
    }
}

#[tauri::command]
pub async fn delete_autostart(entry: Value) -> Result<Value, String> {
    let source = entry.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let command = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let location_label = entry.get("locationLabel").and_then(|v| v.as_str()).unwrap_or("");

    match source {
        "registry" => {
            let reg_path = if location_label.contains("HKCU\\Run") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKLM\\Run") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKCU\\RunOnce") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else {
                return Err("Unbekannter Registry-Pfad".to_string());
            };
            let safe_name = name.replace("'", "''");
            let script = format!("Remove-ItemProperty -Path '{}' -Name '{}' -Force", reg_path, safe_name);
            crate::ps::run_ps(&script).await?;
            Ok(json!({ "success": true }))
        }
        "folder" => {
            let safe_cmd = command.replace("'", "''");
            let script = format!("Remove-Item -LiteralPath '{}' -Force", safe_cmd);
            crate::ps::run_ps(&script).await?;
            Ok(json!({ "success": true }))
        }
        _ => Err(format!("Unbekannte Autostart-Quelle: {}", source)),
    }
}

// === Services ===

#[tauri::command]
pub async fn get_services() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-Service | ForEach-Object {
$st = switch([int]$_.Status){1{'Stopped'}2{'StartPending'}3{'StopPending'}4{'Running'}5{'ContinuePending'}6{'PausePending'}7{'Paused'}default{'Unknown'}}
$stt = switch([int]$_.StartType){0{'Boot'}1{'System'}2{'Automatic'}3{'Manual'}4{'Disabled'}default{'Unknown'}}
[PSCustomObject]@{name=$_.Name;displayName=$_.DisplayName;status=$st;startType=$stt}
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn control_service(name: String, action: String) -> Result<Value, String> {
    tracing::info!(service = %name, action = %action, "Service-Steuerung");
    let safe_name = name.replace("'", "''");
    let cmd = match action.as_str() {
        "start" => format!("Start-Service '{}'", safe_name),
        "stop" => format!("Stop-Service '{}' -Force", safe_name),
        "restart" => format!("Restart-Service '{}' -Force", safe_name),
        _ => return Err(format!("Unknown action: {}", action)),
    };
    crate::ps::run_ps(&cmd).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn set_service_start_type(name: String, start_type: String) -> Result<Value, String> {
    tracing::info!(service = %name, start_type = %start_type, "Service-Starttyp ändern");
    // Frontend sends 'auto'|'demand'|'disabled', PowerShell needs 'Automatic'|'Manual'|'Disabled'
    let ps_type = match start_type.as_str() {
        "auto" => "Automatic",
        "demand" => "Manual",
        "disabled" => "Disabled",
        _ => return Err(format!("Ungültiger Start-Typ: '{}'. Erlaubt: auto, demand, disabled", start_type)),
    };
    let safe_name = name.replace("'", "''");
    crate::ps::run_ps(&format!("Set-Service '{}' -StartupType '{}'", safe_name, ps_type)).await?;
    Ok(json!({ "success": true }))
}

// === Optimizer ===

#[tauri::command]
pub async fn get_optimizations() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$opts = @()
$vfx = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' -ErrorAction SilentlyContinue).VisualFXSetting
$opts += [PSCustomObject]@{ id='visual_effects'; title='Visuelle Effekte optimieren'; name='Visuelle Effekte optimieren'; description='Deaktiviert Animationen und Transparenz für bessere Performance'; applied=($vfx -eq 2); category='performance'; impact='medium'; savingsBytes=0; requiresAdmin=$false; reversible=$true }
$prefetchSize = 0; try { $prefetchSize = [long](Get-ChildItem "$env:SystemRoot\Prefetch" -Force -File -EA Stop | Measure-Object -Property Length -Sum).Sum } catch {}
$opts += [PSCustomObject]@{ id='prefetch'; title='Prefetch bereinigen'; name='Prefetch bereinigen'; description='Löscht alte Prefetch-Daten um Speicherplatz freizugeben'; applied=$false; category='cleanup'; impact='low'; savingsBytes=$prefetchSize; requiresAdmin=$true; reversible=$false }
$tpEnabled = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize' -EA SilentlyContinue).EnableTransparency
$opts += [PSCustomObject]@{ id='transparency'; title='Transparenz deaktivieren'; name='Transparenz deaktivieren'; description='Deaktiviert Transparenzeffekte für bessere Performance'; applied=($tpEnabled -eq 0); category='performance'; impact='low'; savingsBytes=0; requiresAdmin=$false; reversible=$true }
$opts | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn apply_optimization(id: String) -> Result<Value, String> {
    tracing::info!(optimization = %id, "Optimierung anwenden");
    let script = match id.as_str() {
        "visual_effects" => {
            r#"Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' -Name 'VisualFXSetting' -Value 2 -Type DWord -Force
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'UserPreferencesMask' -Value ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) -Type Binary -Force"#.to_string()
        }
        "prefetch" => {
            r#"Remove-Item "$env:SystemRoot\Prefetch\*" -Force -Recurse -ErrorAction SilentlyContinue"#.to_string()
        }
        "transparency" => {
            r#"Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'EnableTransparency' -Value 0 -Type DWord -Force"#.to_string()
        }
        _ => return Err(format!("Unbekannte Optimierung: {}", id)),
    };
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if e.contains("Zugriff") || e.contains("Access") || e.contains("Administrator") {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

// === Bloatware ===

#[tauri::command]
pub async fn scan_bloatware() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$known = @{
'Microsoft.BingWeather'='unnötig';'Microsoft.GetHelp'='unnötig';'Microsoft.Getstarted'='unnötig';
'Microsoft.MicrosoftOfficeHub'='unnötig';'Microsoft.MicrosoftSolitaireCollection'='unnötig';
'Microsoft.People'='unnötig';'Microsoft.SkypeApp'='unnötig';'Microsoft.WindowsFeedbackHub'='unnötig';
'Microsoft.Xbox.TCUI'='unnötig';'Microsoft.XboxApp'='unnötig';'Microsoft.XboxGameOverlay'='unnötig';
'Microsoft.ZuneMusic'='unnötig';'Microsoft.ZuneVideo'='unnötig';'Microsoft.MixedReality.Portal'='unnötig';
'king.com.CandyCrushSaga'='fragwürdig';'king.com.CandyCrushSodaSaga'='fragwürdig';
'SpotifyAB.SpotifyMusic'='fragwürdig';'Facebook.Facebook'='fragwürdig'
}
Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -ne 'System' } | ForEach-Object {
    $cat = if($known[$_.Name]){$known[$_.Name]}else{'sonstiges'}
    $size = 0; if($_.InstallLocation -and (Test-Path $_.InstallLocation)) { try { $size = [long](Get-ChildItem $_.InstallLocation -Recurse -Force -File -EA Stop | Measure-Object Length -Sum).Sum } catch {} }
    [PSCustomObject]@{ programName=$_.Name; packageFullName=$_.PackageFullName; publisher=$_.Publisher; description=''; category=$cat; estimatedSize=$size; installDate='' }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn uninstall_bloatware(entry: Value) -> Result<Value, String> {
    tracing::warn!(package = ?entry.get("packageFullName"), "Bloatware deinstallieren");
    if let Some(pkg) = entry.get("packageFullName").and_then(|v| v.as_str()) {
        let safe_pkg = pkg.replace("'", "''");
        crate::ps::run_ps(&format!("Remove-AppxPackage '{}'", safe_pkg)).await?;
    }
    Ok(json!({ "success": true }))
}

// === Updates ===

#[tauri::command]
pub async fn check_windows_updates() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $results = $searcher.Search('IsInstalled=0')
    @($results.Updates | ForEach-Object { [PSCustomObject]@{ Title=$_.Title; KBArticleIDs=($_.KBArticleIDs -join ','); Size=[long]$_.MaxDownloadSize; Severity="$($_.MsrcSeverity)"; IsMandatory=$_.IsMandatory } }) | ConvertTo-Json -Compress
} catch { ConvertTo-Json @() -Compress }"#
    ).await
}

#[tauri::command]
pub async fn get_update_history() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$count = $searcher.GetTotalHistoryCount()
@($searcher.QueryHistory(0, [Math]::Min($count, 50)) | ForEach-Object {
    $st = switch([int]$_.ResultCode){0{'NotStarted'}1{'InProgress'}2{'Succeeded'}3{'SucceededWithErrors'}4{'Failed'}5{'Aborted'}default{'Unknown'}}
    [PSCustomObject]@{ Date=$_.Date.ToString('o'); Title=$_.Title; ResultCode=[int]$_.ResultCode; Status=$st }
}) | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn check_software_updates() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"try {
    $output = winget upgrade --accept-source-agreements 2>$null
    $lines = $output -split "`n" | Where-Object { $_ -match '\S' }
    $headerIdx = -1
    for ($i=0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^Name\s+') { $headerIdx = $i; break } }
    if ($headerIdx -lt 0) { ConvertTo-Json @() -Compress; return }
    $sepIdx = $headerIdx + 1
    $dataLines = $lines[($sepIdx+1)..($lines.Count-2)]
    $results = @()
    foreach ($line in $dataLines) {
        if ($line -match '^(\S.+?)\s{2,}(\S+)\s+(\S+)\s+(\S+)\s*(.*)$') {
            $results += [PSCustomObject]@{ name=$Matches[1].Trim(); id=$Matches[2]; currentVersion=$Matches[3]; availableVersion=$Matches[4]; source=$Matches[5].Trim() }
        }
    }
    $results | ConvertTo-Json -Compress
} catch { ConvertTo-Json @() -Compress }"#
    ).await
}

#[tauri::command]
pub async fn update_software(package_id: String) -> Result<Value, String> {
    let safe_id = package_id.replace("'", "''");
    crate::ps::run_ps(&format!("winget upgrade '{}' --accept-package-agreements --accept-source-agreements", safe_id)).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_driver_info() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$now = Get-Date
Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Select-Object -First 50 | ForEach-Object {
    $dd = $_.DriverDate
    $ageY = if($dd) { [math]::Round(($now - $dd).TotalDays / 365.25, 1) } else { $null }
    $isOld = if($ageY) { $ageY -gt 3 } else { $false }
    [PSCustomObject]@{ name=$_.DeviceName; manufacturer=$_.Manufacturer; version=$_.DriverVersion; date=if($dd){$dd.ToString('o')}else{''}; ageYears=$ageY; isOld=$isOld; supportUrl='' }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cs = Get-CimInstance Win32_ComputerSystem
[PSCustomObject]@{ Manufacturer=$cs.Manufacturer; Model=$cs.Model; SerialNumber=(Get-CimInstance Win32_BIOS).SerialNumber } | ConvertTo-Json -Compress"#
    ).await
}

// === Hybrid Search ===

#[tauri::command]
pub async fn search_name_index(scan_id: String, query: String, _options: Option<Value>) -> Result<Value, String> {
    let results = crate::scan::search_files(&scan_id, &query, 0);
    Ok(json!({ "results": results, "total": results.as_array().map(|a| a.len()).unwrap_or(0) }))
}

#[tauri::command]
pub async fn get_name_index_info(scan_id: String) -> Result<Value, String> {
    let count = crate::scan::with_scan(&scan_id, |d| d.files.len()).unwrap_or(0);
    Ok(json!({ "indexed": count }))
}

static DEEP_SEARCH_PID: LazyLock<std::sync::atomic::AtomicU32> = LazyLock::new(|| std::sync::atomic::AtomicU32::new(0));

#[tauri::command]
pub async fn deep_search_start(app: tauri::AppHandle, root_path: String, query: String, _use_regex: Option<bool>) -> Result<Value, String> {
    // Reset cancel state
    DEEP_SEARCH_PID.store(0, std::sync::atomic::Ordering::Relaxed);

    let app2 = app.clone();
    tokio::spawn(async move {
        let safe_query = query.replace("'", "''");
        let safe_path = root_path.replace("'", "''");
        let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
        let script = format!(
            r#"{utf8}$q = '{q}'; $count = 0; $dirs = 0
Get-ChildItem -Path '{p}' -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {{
    if ($_.PSIsContainer) {{ $dirs++ }}
    if ($_.Name -like "*$q*") {{
        $count++
        $dirPath = Split-Path $_.FullName -Parent
        $mq = 1.0
        if ($_.Name -eq $q) {{ $mq = 2.0 }}
        [PSCustomObject]@{{ path=$_.FullName; name=$_.Name; dirPath=$dirPath; isDir=$_.PSIsContainer; size=[long]$_.Length; modified=$_.LastWriteTime.ToString('o'); matchQuality=$mq }}
    }}
}} | Select-Object -First 500 | ConvertTo-Json -Compress"#,
            utf8 = utf8_prefix, q = safe_query, p = safe_path
        );

        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }

        match cmd.spawn() {
            Ok(child) => {
                // Store PID for cancellation
                if let Some(pid) = child.id() {
                    DEEP_SEARCH_PID.store(pid, std::sync::atomic::Ordering::Relaxed);
                }
                match tokio::time::timeout(std::time::Duration::from_secs(60), child.wait_with_output()).await {
                    Ok(Ok(output)) if output.status.success() => {
                        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if stdout.is_empty() {
                            let _ = app2.emit("deep-search-complete", json!({ "resultCount": 0, "dirsScanned": 0 }));
                        } else {
                            match serde_json::from_str::<Value>(&stdout) {
                                Ok(data) => {
                                    let results = if data.is_array() { data.as_array().unwrap().clone() } else { vec![data] };
                                    for r in &results {
                                        let _ = app2.emit("deep-search-result", r.clone());
                                    }
                                    let _ = app2.emit("deep-search-complete", json!({ "resultCount": results.len(), "dirsScanned": 0 }));
                                }
                                Err(e) => { let _ = app2.emit("deep-search-error", json!({ "error": format!("JSON-Parse-Fehler: {}", e) })); }
                            }
                        }
                    }
                    Ok(Ok(_)) => {
                        let _ = app2.emit("deep-search-error", json!({ "error": "PowerShell-Suche fehlgeschlagen" }));
                    }
                    Ok(Err(e)) => {
                        let _ = app2.emit("deep-search-error", json!({ "error": e.to_string() }));
                    }
                    Err(_) => {
                        let _ = app2.emit("deep-search-error", json!({ "error": "Suche abgebrochen (Timeout 60s)" }));
                    }
                }
            }
            Err(e) => {
                let _ = app2.emit("deep-search-error", json!({ "error": format!("PowerShell konnte nicht gestartet werden: {}", e) }));
            }
        }
        DEEP_SEARCH_PID.store(0, std::sync::atomic::Ordering::Relaxed);
    });
    Ok(json!({ "started": true }))
}

#[tauri::command]
pub async fn deep_search_cancel() -> Result<Value, String> {
    let pid = DEEP_SEARCH_PID.load(std::sync::atomic::Ordering::Relaxed);
    if pid > 0 {
        // Kill the PowerShell process tree
        let mut kill_cmd = std::process::Command::new("taskkill");
        kill_cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; kill_cmd.creation_flags(0x08000000); }
        let _ = kill_cmd.spawn();
        DEEP_SEARCH_PID.store(0, std::sync::atomic::Ordering::Relaxed);
        tracing::debug!(pid = pid, "Deep-Search abgebrochen (PID gekillt)");
        Ok(json!({ "cancelled": true }))
    } else {
        Ok(json!({ "cancelled": false, "message": "Keine aktive Suche" }))
    }
}

// === Explorer ===

#[tauri::command]
pub async fn list_directory(dir_path: String, max_entries: Option<u32>) -> Result<Value, String> {
    let limit = max_entries.unwrap_or(5000);
    let escaped = dir_path.replace("'", "''");
    let script = format!(
        r#"$allItems = @(Get-ChildItem -LiteralPath '{}' -Force -ErrorAction SilentlyContinue)
$totalCount = $allItems.Count
$items = $allItems | Select-Object -First {}
$entries = @($items | ForEach-Object {{
    [PSCustomObject]@{{ name=$_.Name; path=$_.FullName; size=[long]$_.Length; modified=[long]([DateTimeOffset]$_.LastWriteTime).ToUnixTimeMilliseconds(); created=[long]([DateTimeOffset]$_.CreationTime).ToUnixTimeMilliseconds(); isDirectory=$_.PSIsContainer; extension=$_.Extension.ToLower(); readonly=$_.IsReadOnly; hidden=($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0 }}
}})
[PSCustomObject]@{{ path='{}'; parentPath=Split-Path '{}' -Parent; entries=$entries; totalEntries=$totalCount; truncated=($totalCount -gt {}) }} | ConvertTo-Json -Depth 3 -Compress"#,
        escaped, limit, escaped, escaped, limit
    );
    let result = crate::ps::run_ps_json(&script).await?;
    if let Some(entries) = result.get("entries") {
        if !entries.is_array() && !entries.is_null() {
            let mut obj = result.clone();
            obj.as_object_mut().unwrap().insert("entries".to_string(), json!([entries.clone()]));
            return Ok(obj);
        } else if entries.is_null() {
            let mut obj = result.clone();
            obj.as_object_mut().unwrap().insert("entries".to_string(), json!([]));
            return Ok(obj);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_known_folders() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$folders = @()
$folders += [PSCustomObject]@{ name='Desktop'; path=[Environment]::GetFolderPath('Desktop'); icon='desktop' }
$folders += [PSCustomObject]@{ name='Dokumente'; path=[Environment]::GetFolderPath('MyDocuments'); icon='documents' }
$folders += [PSCustomObject]@{ name='Downloads'; path=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; icon='downloads' }
$folders += [PSCustomObject]@{ name='Bilder'; path=[Environment]::GetFolderPath('MyPictures'); icon='images' }
$folders += [PSCustomObject]@{ name='Musik'; path=[Environment]::GetFolderPath('MyMusic'); icon='music' }
$folders += [PSCustomObject]@{ name='Videos'; path=[Environment]::GetFolderPath('MyVideos'); icon='video' }
$folders | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn calculate_folder_size(dir_path: String) -> Result<Value, String> {
    let script = format!(
        r#"$items = @(Get-ChildItem -LiteralPath '{}' -Recurse -Force -ErrorAction SilentlyContinue)
$files = @($items | Where-Object {{ -not $_.PSIsContainer }})
$dirs = @($items | Where-Object {{ $_.PSIsContainer }})
$size = ($files | Measure-Object -Property Length -Sum).Sum
[PSCustomObject]@{{ path='{}'; totalSize=[long]$size; fileCount=$files.Count; dirCount=$dirs.Count }} | ConvertTo-Json -Compress"#,
        dir_path.replace("'", "''"), dir_path.replace("'", "''")
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn find_empty_folders(dir_path: String, max_depth: Option<u32>) -> Result<Value, String> {
    let depth = max_depth.unwrap_or(10);
    let script = format!(
        r#"$empty = @(Get-ChildItem -LiteralPath '{}' -Recurse -Directory -Depth {} -Force -ErrorAction SilentlyContinue | Where-Object {{ (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0 }} | ForEach-Object {{ [PSCustomObject]@{{ path=$_.FullName }} }})
[PSCustomObject]@{{ emptyFolders=$empty; count=$empty.Count }} | ConvertTo-Json -Depth 2 -Compress"#,
        dir_path.replace("'", "''"), depth
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn copy_to_clipboard(text: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Set-Clipboard '{}'", text.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn open_in_terminal(dir_path: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Start-Process wt -ArgumentList '-d', '{}'", dir_path.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn open_with_dialog(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    crate::ps::run_ps(&format!("Start-Process rundll32.exe -ArgumentList 'shell32.dll,OpenAs_RunDLL \"{}\"'", safe_path)).await?;
    Ok(json!({ "success": true }))
}

// === Admin ===

#[tauri::command]
pub async fn is_admin() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ).await?;
    Ok(json!(result.trim().to_lowercase() == "true"))
}

#[tauri::command]
pub async fn restart_as_admin() -> Result<Value, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Exe-Pfad konnte nicht ermittelt werden: {}", e))?;
    let exe_path = exe.to_string_lossy().replace("'", "''");

    // Save current session before elevation
    let mut session = read_json_file("session.json");
    if let Some(obj) = session.as_object_mut() {
        obj.insert("pendingElevation".to_string(), json!(true));
    }
    let _ = write_json_file("session.json", &session);

    tracing::info!("Starte Anwendung als Administrator: {}", exe_path);

    // Use PowerShell Start-Process with -Verb RunAs for UAC elevation
    let script = format!(
        "Start-Process -FilePath '{}' -Verb RunAs",
        exe_path
    );
    match crate::ps::run_ps(&script).await {
        Ok(_) => {
            // Exit the current (non-admin) instance
            Ok(json!({ "success": true, "message": "Neustart als Administrator wird durchgeführt" }))
        }
        Err(e) => {
            // UAC was cancelled or elevation failed
            if let Some(obj) = session.as_object_mut() {
                obj.remove("pendingElevation");
                let _ = write_json_file("session.json", &session);
            }
            Ok(json!({ "success": false, "error": format!("Elevation fehlgeschlagen: {}", e) }))
        }
    }
}

#[tauri::command]
pub async fn get_restored_session() -> Result<Value, String> {
    let session = read_json_file("session.json");
    if session.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return Ok(json!(null));
    }

    // Try to restore scan data from disk into memory
    let data_dir = get_data_dir();
    let sessions = if let Some(saved_sessions) = session.get("sessions") {
        // Load actual file data into memory store if not already loaded
        if let Some(arr) = saved_sessions.as_array() {
            if let Some(first) = arr.first() {
                let scan_id = first["scan_id"].as_str().unwrap_or("");
                if !scan_id.is_empty() && !crate::scan::has_scan(scan_id) {
                    match crate::scan::load_from_disk(&data_dir) {
                        Ok(_) => tracing::info!("Scan-Daten von Disk wiederhergestellt"),
                        Err(e) => tracing::warn!(error = %e, "Scan-Daten konnten nicht von Disk geladen werden"),
                    }
                }
            }
        }
        saved_sessions.clone()
    } else {
        // Fallback: check if scan-meta.json exists (old sessions without sessions array)
        if let Some(meta) = crate::scan::read_scan_meta(&data_dir) {
            let scan_id = meta["scan_id"].as_str().unwrap_or("");
            if !scan_id.is_empty() && !crate::scan::has_scan(scan_id) {
                let _ = crate::scan::load_from_disk(&data_dir);
            }
            json!([{
                "scan_id": meta["scan_id"],
                "current_path": meta["root_path"],
                "dirs_scanned": meta["dirs_scanned"],
                "files_found": meta["files_count"],
                "total_size": meta["total_size"],
                "elapsed_seconds": meta["elapsed_seconds"]
            }])
        } else {
            json!([])
        }
    };

    let ui = session.get("uiState").cloned().unwrap_or(json!(null));

    Ok(json!({
        "sessions": sessions,
        "ui": ui
    }))
}

// === System ===

#[tauri::command]
pub async fn get_system_capabilities() -> Result<Value, String> {
    let result = crate::ps::run_ps_json(
        r#"$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$bat = $null -ne (Get-CimInstance Win32_Battery -EA SilentlyContinue)
$wg = $null -ne (Get-Command winget -EA SilentlyContinue)
[PSCustomObject]@{ isAdmin=$admin; hasBattery=$bat; wingetAvailable=$wg; platform='win32' } | ConvertTo-Json -Compress"#
    ).await;
    match result {
        Ok(v) => Ok(v),
        Err(_) => Ok(json!({ "isAdmin": false, "hasBattery": false, "wingetAvailable": false, "platform": "win32" })),
    }
}

#[tauri::command]
pub async fn get_battery_status() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($bat) { [PSCustomObject]@{ hasBattery=$true; percent=$bat.EstimatedChargeRemaining; charging=($bat.BatteryStatus -eq 2); onBattery=($bat.BatteryStatus -ne 2) } | ConvertTo-Json -Compress }
else { '{"hasBattery":false,"onBattery":false}' }"#
    ).await
}

// === Platform ===

#[tauri::command]
pub async fn get_platform() -> Result<String, String> {
    Ok("win32".to_string())
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<Value, String> {
    // Only allow http/https URLs
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Nur HTTP/HTTPS-URLs erlaubt, nicht: {}", &url[..url.len().min(50)]));
    }
    crate::ps::run_ps(&format!("Start-Process '{}'", url.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

// === File Tags ===

#[tauri::command]
pub async fn get_tag_colors() -> Result<Value, String> {
    Ok(json!(["#e74c3c","#e67e22","#f1c40f","#2ecc71","#3498db","#9b59b6","#1abc9c","#95a5a6"]))
}

#[tauri::command]
pub async fn set_file_tag(file_path: String, color: String, note: Option<String>) -> Result<Value, String> {
    let mut tags = read_json_file("file-tags.json");
    if let Some(obj) = tags.as_object_mut() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        obj.insert(file_path, json!({ "color": color, "note": note.unwrap_or_default(), "createdAt": now }));
    }
    write_json_file("file-tags.json", &tags)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn remove_file_tag(file_path: String) -> Result<Value, String> {
    let mut tags = read_json_file("file-tags.json");
    if let Some(obj) = tags.as_object_mut() {
        obj.remove(&file_path);
    }
    write_json_file("file-tags.json", &tags)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_file_tag(file_path: String) -> Result<Value, String> {
    let tags = read_json_file("file-tags.json");
    Ok(tags.get(&file_path).cloned().unwrap_or(json!(null)))
}

#[tauri::command]
pub async fn get_tags_for_directory(dir_path: String) -> Result<Value, String> {
    let tags = read_json_file("file-tags.json");
    let prefix = if dir_path.ends_with('\\') || dir_path.ends_with('/') {
        dir_path.clone()
    } else {
        format!("{}\\", dir_path)
    };
    let mut result = serde_json::Map::new();
    if let Some(obj) = tags.as_object() {
        for (path, tag) in obj {
            if path.starts_with(&prefix) {
                result.insert(path.clone(), tag.clone());
            }
        }
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Value, String> {
    let tags = read_json_file("file-tags.json");
    let mut result = Vec::new();
    if let Some(obj) = tags.as_object() {
        for (path, tag) in obj {
            let mut entry = tag.clone();
            if let Some(e) = entry.as_object_mut() {
                e.insert("path".to_string(), json!(path));
            }
            result.push(entry);
        }
    }
    Ok(json!(result))
}

// === Shell Integration ===

#[tauri::command]
pub async fn register_shell_context_menu() -> Result<Value, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Exe-Pfad nicht ermittelbar: {}", e))?
        .to_string_lossy().to_string().replace("'", "''");
    let script = format!(
        r#"New-Item -Path 'HKCU:\SOFTWARE\Classes\Directory\shell\SpeicherAnalyse' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\SOFTWARE\Classes\Directory\shell\SpeicherAnalyse' -Name '(Default)' -Value 'Mit Speicher Analyse scannen' -Force; Set-ItemProperty -Path 'HKCU:\SOFTWARE\Classes\Directory\shell\SpeicherAnalyse' -Name 'Icon' -Value '"{}"' -Force; New-Item -Path 'HKCU:\SOFTWARE\Classes\Directory\shell\SpeicherAnalyse\command' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\SOFTWARE\Classes\Directory\shell\SpeicherAnalyse\command' -Name '(Default)' -Value '"{}" --scan "%V"' -Force"#,
        exe_path, exe_path
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn unregister_shell_context_menu() -> Result<Value, String> {
    crate::ps::run_ps(
        "Remove-Item -Path 'HKCU:\\SOFTWARE\\Classes\\Directory\\shell\\SpeicherAnalyse' -Recurse -Force -ErrorAction SilentlyContinue"
    ).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn is_shell_context_menu_registered() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        "Test-Path 'HKCU:\\SOFTWARE\\Classes\\Directory\\shell\\SpeicherAnalyse'"
    ).await;
    match result {
        Ok(output) => Ok(json!(output.trim().to_lowercase() == "true")),
        Err(_) => Ok(json!(false)),
    }
}

// === Global Hotkey ===

#[tauri::command]
pub async fn set_global_hotkey(_accelerator: String) -> Result<Value, String> {
    // Requires tauri-plugin-global-shortcut — keep as stub until plugin is added
    Ok(json!({ "stub": true, "message": "Globaler Hotkey benötigt das tauri-plugin-global-shortcut Plugin" }))
}

#[tauri::command]
pub async fn get_global_hotkey() -> Result<Value, String> {
    let prefs = read_json_file("preferences.json");
    let hotkey = prefs.get("globalHotkey")
        .and_then(|v| v.as_str())
        .unwrap_or("Ctrl+Shift+S");
    Ok(json!(hotkey))
}

// === Terminal (stubs — needs native PTY) ===

#[tauri::command]
pub async fn terminal_get_shells() -> Result<Value, String> {
    // Dynamically detect available shells
    let mut shells = Vec::new();

    // PowerShell Core (pwsh)
    if which_exists("pwsh.exe") {
        shells.push(json!({ "id": "pwsh", "label": "PowerShell 7", "available": true }));
    }
    // Windows PowerShell
    shells.push(json!({ "id": "powershell", "label": "Windows PowerShell", "available": true }));
    // CMD
    shells.push(json!({ "id": "cmd", "label": "Eingabeaufforderung", "available": true }));
    // Git Bash
    let git_bash = r"C:\Program Files\Git\bin\bash.exe";
    if Path::new(git_bash).exists() {
        shells.push(json!({ "id": "git-bash", "label": "Git Bash", "available": true }));
    }
    // WSL
    if which_exists("wsl.exe") {
        shells.push(json!({ "id": "wsl", "label": "WSL", "available": true }));
    }

    Ok(json!(shells))
}

fn which_exists(name: &str) -> bool {
    std::process::Command::new("where")
        .arg(name)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// Terminal sessions: piped stdin/stdout processes
static TERMINAL_SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, TerminalSession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

struct TerminalSession {
    child: std::process::Child,
    stdin: Option<std::process::ChildStdin>,
}

#[tauri::command]
pub async fn terminal_create(app: tauri::AppHandle, cwd: Option<String>, shell_type: Option<String>, _cols: Option<u32>, _rows: Option<u32>) -> Result<Value, String> {
    let shell = shell_type.unwrap_or_else(|| "powershell".to_string());
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()));

    let shell_path = match shell.as_str() {
        "pwsh" => "pwsh.exe".to_string(),
        "cmd" => "cmd.exe".to_string(),
        "git-bash" => r"C:\Program Files\Git\bin\bash.exe".to_string(),
        "wsl" => "wsl.exe".to_string(),
        _ => "powershell.exe".to_string(),
    };

    let mut cmd = std::process::Command::new(&shell_path);
    cmd.current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let id = format!("term-{}", child.id());
            let stdin = child.stdin.take();
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Background thread: read stdout and emit terminal-data events
            if let Some(stdout) = stdout {
                let id_out = id.clone();
                let app_out = app.clone();
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut reader = std::io::BufReader::new(stdout);
                    let mut buf = [0u8; 4096];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = app_out.emit("terminal-data", json!({ "id": &id_out, "data": data }));
                            }
                            Err(_) => break,
                        }
                    }
                    // stdout closed → process likely exited, get exit code
                    let code = {
                        let mut sessions = TERMINAL_SESSIONS.lock().unwrap();
                        sessions.get_mut(&id_out)
                            .and_then(|s| s.child.try_wait().ok().flatten())
                            .and_then(|s| s.code())
                            .unwrap_or(-1)
                    };
                    let _ = app_out.emit("terminal-exit", json!({ "id": &id_out, "code": code }));
                });
            }

            // Background thread: read stderr and emit as terminal-data
            if let Some(stderr) = stderr {
                let id_err = id.clone();
                let app_err = app.clone();
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut reader = std::io::BufReader::new(stderr);
                    let mut buf = [0u8; 4096];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = app_err.emit("terminal-data", json!({ "id": &id_err, "data": data }));
                            }
                            Err(_) => break,
                        }
                    }
                });
            }

            let mut sessions = TERMINAL_SESSIONS.lock().unwrap();
            sessions.insert(id.clone(), TerminalSession { child, stdin });
            tracing::debug!(id = %id, shell = %shell_path, "Terminal erstellt");
            Ok(json!({ "id": id, "shell": shell_path, "cwd": dir }))
        }
        Err(e) => Ok(json!({ "id": null, "error": format!("Terminal konnte nicht erstellt werden: {}", e) }))
    }
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<Value, String> {
    let mut sessions = TERMINAL_SESSIONS.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        if let Some(ref mut stdin) = session.stdin {
            use std::io::Write;
            match stdin.write_all(data.as_bytes()) {
                Ok(_) => { let _ = stdin.flush(); Ok(json!({ "success": true })) }
                Err(e) => Ok(json!({ "success": false, "error": e.to_string() }))
            }
        } else {
            Ok(json!({ "success": false, "error": "stdin nicht verfügbar" }))
        }
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_resize(_id: String, _cols: u32, _rows: u32) -> Result<Value, String> {
    // Piped terminals don't support resize — would need ConPTY/portable-pty for true PTY
    Ok(json!({ "stub": true, "message": "Terminal-Resize benötigt ConPTY/portable-pty (Piped I/O unterstützt kein Resize)" }))
}

#[tauri::command]
pub async fn terminal_destroy(id: String) -> Result<Value, String> {
    let mut sessions = TERMINAL_SESSIONS.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
        tracing::debug!(id = %id, "Terminal beendet");
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_open_external(cwd: Option<String>, _command: Option<String>) -> Result<Value, String> {
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_default());
    crate::ps::run_ps(&format!("Start-Process wt -ArgumentList '-d', '{}'", dir.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

// === Privacy Dashboard ===

#[tauri::command]
pub async fn get_privacy_settings() -> Result<Value, String> {
    let reg_data = crate::ps::run_ps_json(
        r#"$regs = @(
@{id='werbung-id';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo';k='Enabled'},
@{id='cortana-consent';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Search';k='CortanaConsent'},
@{id='feedback-haeufigkeit';p='HKCU:\SOFTWARE\Microsoft\Siuf\Rules';k='NumberOfSIUFInPeriod'},
@{id='handschrift-daten';p='HKCU:\SOFTWARE\Microsoft\InputPersonalization';k='RestrictImplicitTextCollection'},
@{id='diagnose-toast';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Diagnostics\DiagTrack';k='ShowedToastAtLevel'},
@{id='app-diagnose';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\appDiagnostics';k='Value'},
@{id='standort-zugriff';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location';k='Value'},
@{id='telemetrie-policy';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection';k='AllowTelemetry'},
@{id='telemetrie-datacollection';p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection';k='AllowTelemetry'},
@{id='wifi-sense';p='HKLM:\SOFTWARE\Microsoft\WcmSvc\wifinetworkmanager\config';k='AutoConnectAllowedOEM'},
@{id='aktivitaet-feed';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\System';k='EnableActivityFeed'},
@{id='aktivitaet-publish';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\System';k='PublishUserActivities'}
)
$vals=@{}
foreach($r in $regs){try{$v=(Get-ItemProperty $r.p -Name $r.k -EA Stop)."$($r.k)";$vals[$r.id]=$v}catch{$vals[$r.id]=$null}}
$ed=(Get-CimInstance Win32_OperatingSystem).Caption
$isE=$ed -match 'Enterprise|Education'
$sl=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowAllTrustedApps -EA SilentlyContinue).AllowAllTrustedApps
[PSCustomObject]@{registryValues=$vals;edition=[PSCustomObject]@{edition=$ed;isEnterprise=[bool]$isE};sideloading=[PSCustomObject]@{enabled=($sl -eq 1);value=$sl}} | ConvertTo-Json -Depth 2 -Compress"#
    ).await?;

    let reg_vals = &reg_data["registryValues"];
    let edition = reg_data["edition"].clone();
    let sideloading = reg_data["sideloading"].clone();
    let settings = build_privacy_settings(reg_vals);
    Ok(json!({ "settings": settings, "edition": edition, "sideloading": sideloading }))
}

// Privacy settings database: (id, registry_path, registry_key, recommended_value, default_value, tier)
// tier: "standard" = safe HKCU, "advanced" = HKLM or risky
fn privacy_setting_lookup(id: &str) -> Option<(&'static str, &'static str, i32, i32, &'static str)> {
    match id {
        "werbung-id" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo", "Enabled", 0, 1, "standard")),
        "cortana-consent" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search", "CortanaConsent", 0, 1, "standard")),
        "feedback-haeufigkeit" => Some(("HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules", "NumberOfSIUFInPeriod", 0, 1, "standard")),
        "handschrift-daten" => Some(("HKCU\\SOFTWARE\\Microsoft\\InputPersonalization", "RestrictImplicitTextCollection", 1, 0, "standard")),
        "diagnose-toast" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack", "ShowedToastAtLevel", 1, 0, "standard")),
        "app-diagnose" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics", "Value", 0, 1, "standard")),
        "standort-zugriff" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location", "Value", 0, 1, "standard")),
        "telemetrie-policy" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", 0, 3, "advanced")),
        "telemetrie-datacollection" => Some(("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection", "AllowTelemetry", 0, 3, "advanced")),
        "wifi-sense" => Some(("HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config", "AutoConnectAllowedOEM", 0, 1, "advanced")),
        "aktivitaet-feed" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableActivityFeed", 0, 1, "advanced")),
        "aktivitaet-publish" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "PublishUserActivities", 0, 1, "advanced")),
        _ => None,
    }
}

#[tauri::command]
pub async fn apply_privacy_setting(id: String) -> Result<Value, String> {
    tracing::info!(setting = %id, "Privacy-Einstellung anwenden");
    let (reg_path, reg_key, recommended, _, _) = privacy_setting_lookup(&id)
        .ok_or_else(|| format!("Einstellung '{}' nicht gefunden", id))?;
    let script = format!(
        "reg add '{}' /v '{}' /t REG_DWORD /d {} /f",
        reg_path, reg_key, recommended
    );
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if reg_path.starts_with("HKLM") && (e.contains("Zugriff") || e.contains("Access")) {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn apply_all_privacy() -> Result<Value, String> {
    tracing::info!("Alle Privacy-Einstellungen anwenden");
    let ids = ["werbung-id","cortana-consent","feedback-haeufigkeit","handschrift-daten",
               "diagnose-toast","app-diagnose","standort-zugriff"];
    let mut applied = 0u32;
    let mut failed = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for id in &ids {
        if let Some((reg_path, reg_key, recommended, _, _)) = privacy_setting_lookup(id) {
            let script = format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, recommended);
            match crate::ps::run_ps(&script).await {
                Ok(_) => applied += 1,
                Err(e) => { failed += 1; errors.push(format!("{}: {}", id, e)); }
            }
        }
    }
    let skipped = 5u32; // 5 advanced (HKLM) settings skipped
    Ok(json!({ "applied": applied, "failed": failed, "skipped": skipped, "errors": errors }))
}

#[tauri::command]
pub async fn reset_privacy_setting(id: String) -> Result<Value, String> {
    let (reg_path, reg_key, _, default_val, _) = privacy_setting_lookup(&id)
        .ok_or_else(|| format!("Einstellung '{}' nicht gefunden", id))?;
    let script = format!(
        "reg add '{}' /v '{}' /t REG_DWORD /d {} /f",
        reg_path, reg_key, default_val
    );
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if reg_path.starts_with("HKLM") && (e.contains("Zugriff") || e.contains("Access")) {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn reset_all_privacy() -> Result<Value, String> {
    let ids = ["werbung-id","cortana-consent","feedback-haeufigkeit","handschrift-daten",
               "diagnose-toast","app-diagnose","standort-zugriff"];
    let mut reset = 0u32;
    let mut failed = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for id in &ids {
        if let Some((reg_path, reg_key, _, default_val, _)) = privacy_setting_lookup(id) {
            let script = format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, default_val);
            match crate::ps::run_ps(&script).await {
                Ok(_) => reset += 1,
                Err(e) => { failed += 1; errors.push(format!("{}: {}", id, e)); }
            }
        }
    }
    let skipped = 5u32;
    Ok(json!({ "reset": reset, "failed": failed, "skipped": skipped, "errors": errors }))
}

#[tauri::command]
pub async fn get_scheduled_tasks_audit() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$telemetryKeywords = @('telemetry','diagnostic','ceip','feedback','customer experience','usage','tracking','consolidated','sqm','devicecensus','compatibility')
Get-ScheduledTask | Where-Object { $_.State -eq 'Ready' -or $_.State -eq 'Disabled' } | Select-Object -First 100 | ForEach-Object {
    $desc = "$($_.Description)"
    $n = $_.TaskName.ToLower()
    $p = $_.TaskPath.ToLower()
    $isTel = $false
    foreach ($kw in $telemetryKeywords) { if ($n -match $kw -or $p -match $kw -or $desc -match $kw) { $isTel = $true; break } }
    $st = if($_.State -eq 'Disabled'){'Deaktiviert'}elseif($_.State -eq 'Ready'){'Bereit'}else{[string]$_.State}
    [PSCustomObject]@{ name=$_.TaskName; path=$_.TaskPath; state=$st; description=$desc; isTelemetry=$isTel }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn disable_scheduled_task(task_path: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Disable-ScheduledTask -TaskPath '{}' -TaskName '*'", task_path.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn check_sideloading() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$val = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense; [PSCustomObject]@{ enabled = ($val -eq 1) } | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn fix_sideloading() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        r#"Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -Type DWord -Force"#
    ).await;
    match result {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if e.contains("Zugriff") || e.contains("Access") || e.contains("denied") {
                Ok(json!({ "success": false, "needsElevation": true, "error": "Administrator-Rechte erforderlich" }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn fix_sideloading_with_elevation() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        r#"Start-Process powershell.exe -ArgumentList '-Command', 'Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -Value 1 -Type DWord -Force' -Verb RunAs -Wait"#
    ).await;
    match result {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[tauri::command]
pub async fn get_privacy_recommendations() -> Result<Value, String> {
    let script = r#"
$recommendations = @()
$programs = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue |
    Where-Object { $_.DisplayName } | Select-Object DisplayName, Publisher, InstallLocation)

# Check for known telemetry-heavy programs
$telemetryApps = @{
    'Google Chrome' = 'Sendet Nutzungsdaten an Google. Einstellungen > Datenschutz > Nutzungsstatistiken deaktivieren.'
    'Microsoft Edge' = 'Sendet Diagnosedaten an Microsoft. Einstellungen > Datenschutz > Diagnosedaten deaktivieren.'
    'Cortana' = 'Sammelt Sprach- und Suchdaten. In den Windows-Einstellungen deaktivieren.'
    'OneDrive' = 'Synchronisiert Dateien in die Cloud. Nur bei Bedarf aktivieren.'
    'CCleaner' = 'Seit Avast-Uebernahme mit Telemetrie. Alternativen in Betracht ziehen.'
    'Avast' = 'Verkauft Nutzungsdaten ueber Tochter Jumpshot. Alternativen in Betracht ziehen.'
    'AVG' = 'Gehoert zu Avast, gleiche Datenschutzbedenken.'
}

foreach ($prog in $programs) {
    foreach ($key in $telemetryApps.Keys) {
        if ($prog.DisplayName -like "*$key*") {
            $recommendations += [PSCustomObject]@{
                program = $prog.DisplayName
                publisher = $prog.Publisher
                recommendation = $telemetryApps[$key]
                severity = 'medium'
            }
            break
        }
    }
}

[PSCustomObject]@{
    recommendations = $recommendations
    programCount = $programs.Count
} | ConvertTo-Json -Depth 3 -Compress"#;

    crate::ps::run_ps_json(script).await
}

// === System Profile ===

#[tauri::command]
pub async fn get_system_profile() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController)
$biosI = Get-CimInstance Win32_BIOS
$mb = Get-CimInstance Win32_BaseBoard
$rams = @(Get-CimInstance Win32_PhysicalMemory)
$disksP = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
$nics = @(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object {$_.IPEnabled})
function fD($d){if($d){$d.ToString('dd.MM.yyyy HH:mm')}else{''}}
$ramT=[long]$cs.TotalPhysicalMemory
$ramF=[long]$os.FreePhysicalMemory*1024
$ramU=$ramT-$ramF
$upStr=''
if($os.LastBootUpTime){$sp=(Get-Date)-$os.LastBootUpTime;$upStr="$([int]$sp.TotalDays) Tage, $($sp.Hours) Std., $($sp.Minutes) Min."}
$r=[PSCustomObject]@{
computer=[PSCustomObject]@{name=$cs.Name;manufacturer=$cs.Manufacturer;model=$cs.Model;systemType=$cs.SystemType;domain=$cs.Domain;user="$($cs.UserName)"}
os=[PSCustomObject]@{name=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture;installDate=fD $os.InstallDate;lastBoot=fD $os.LastBootUpTime;windowsDir=$os.WindowsDirectory;uptime=$upStr;productKeyPartial=$null}
cpu=[PSCustomObject]@{name=$cpu.Name;manufacturer=$cpu.Manufacturer;cores=[int]$cpu.NumberOfCores;threads=[int]$cpu.NumberOfLogicalProcessors;maxClockMHz=[int]$cpu.MaxClockSpeed;currentClockMHz=[int]$cpu.CurrentClockSpeed;l2CacheKB=[int]$cpu.L2CacheSize;l3CacheKB=[int]$cpu.L3CacheSize}
gpu=@($gpus|ForEach-Object{[PSCustomObject]@{name=$_.Name;manufacturer=$_.AdapterCompatibility;driverVersion=$_.DriverVersion;vramBytes=[long]$_.AdapterRAM;resolution="$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)";refreshRate=[int]$_.CurrentRefreshRate}})
ram=[PSCustomObject]@{totalBytes=$ramT;totalFormatted="$([math]::Round($ramT/1GB,1)) GB";usedBytes=$ramU;freeBytes=$ramF;sticks=@($rams|ForEach-Object{[PSCustomObject]@{manufacturer=$_.Manufacturer;capacityBytes=[long]$_.Capacity;capacityFormatted="$([math]::Round($_.Capacity/1GB,1)) GB";speedMHz=[int]$_.Speed;bank=$_.BankLabel}})}
disks=@($disksP|ForEach-Object{[PSCustomObject]@{model=$_.FriendlyName;sizeBytes=[long]$_.Size;sizeFormatted="$([math]::Round($_.Size/1GB,1)) GB";mediaType=switch([int]$_.MediaType){3{'HDD'}4{'SSD'}default{'Unknown'}};interface="$($_.BusType)";serial="$($_.SerialNumber)".Trim();partitions=0}})
network=@($nics|ForEach-Object{[PSCustomObject]@{description=$_.Description;mac=$_.MACAddress;ip=@($_.IPAddress);subnet=@($_.IPSubnet);gateway=@($_.DefaultIPGateway);dhcp=$_.DHCPEnabled;dns=@($_.DNSServerSearchOrder)}})
bios=[PSCustomObject]@{serialNumber=$biosI.SerialNumber;manufacturer=$biosI.Manufacturer;version=$biosI.SMBIOSBIOSVersion;releaseDate=fD $biosI.ReleaseDate}
motherboard=[PSCustomObject]@{manufacturer=$mb.Manufacturer;product=$mb.Product;serialNumber=$mb.SerialNumber;version=$mb.Version}
links=@()
}
$r | ConvertTo-Json -Depth 4 -Compress"#
    ).await
}

// === S.M.A.R.T. ===

#[tauri::command]
pub async fn get_disk_health() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-PhysicalDisk | ForEach-Object {
$rel = $_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
$dk = Get-Disk -Number $_.DeviceId -ErrorAction SilentlyContinue
$temp = if($rel){$rel.Temperature}else{$null}
$wear = if($rel){$rel.Wear}else{$null}
$re = if($rel){[long]$rel.ReadErrorsTotal}else{0}
$we = if($rel){[long]$rel.WriteErrorsTotal}else{0}
$poh = if($rel){[long]$rel.PowerOnHours}else{$null}
$mt = switch([int]$_.MediaType){3{'HDD'}4{'SSD'}5{'SCM'}default{if($_.BusType -eq 17){'NVMe'}else{'Unknown'}}}
$bt = switch([int]$_.BusType){1{'SCSI'}2{'ATAPI'}3{'ATA'}5{'1394'}6{'SSA'}7{'Fibre'}8{'USB'}9{'RAID'}11{'SATA'}17{'NVMe'}default{"$($_.BusType)"}}
$score=100
if("$($_.HealthStatus)" -ne 'Healthy'){$score-=30}
if($re -gt 0){$score-=15}
if($we -gt 0){$score-=15}
if($temp -and $temp -gt 50){$score-=10}
if($wear -and $wear -gt 80){$score-=20}
if($poh -and $poh -gt 35000){$score-=10}
if($score -lt 0){$score=0}
$risk = if($score -ge 70){'safe'}elseif($score -ge 40){'moderate'}else{'high'}
[PSCustomObject]@{name=$_.FriendlyName;model=$_.Model;serial="$($_.SerialNumber)".Trim();firmware=$_.FirmwareVersion;mediaType=$mt;busType=$bt;sizeBytes=[long]$_.Size;healthStatus="$($_.HealthStatus)";operationalStatus="$($_.OperationalStatus)";temperature=$temp;powerOnHours=$poh;readErrors=$re;writeErrors=$we;wearLevel=$wear;partitionStyle=if($dk){"$($dk.PartitionStyle)"}else{'Unknown'};partitions=if($dk){[int]$dk.NumberOfPartitions}else{0};healthScore=$score;riskLevel=$risk}
} | ConvertTo-Json -Compress"#
    ).await
}

// === Software Audit ===

#[tauri::command]
pub async fn audit_software() -> Result<Value, String> {
    let programs = crate::ps::run_ps_json_array(
        r#"$programs = @()
$regPaths = @(
@{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hklm'},
@{p='HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hklm-wow64'},
@{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hkcu'}
)
foreach ($rp in $regPaths) {
    Get-ItemProperty $rp.p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $loc = "$($_.InstallLocation)"
        $hasDir = if($loc -and (Test-Path $loc -EA SilentlyContinue)){$true}else{$false}
        $isOrph = if($loc -and -not $hasDir){$true}else{$false}
        $programs += [PSCustomObject]@{name=$_.DisplayName;version="$($_.DisplayVersion)";publisher="$($_.Publisher)";installDate="$($_.InstallDate)";installLocation=$loc;uninstallString="$($_.UninstallString)";estimatedSize=[long]$_.EstimatedSize;registryPath="$($_.PSPath)";source=$rp.s;hasInstallDir=$hasDir;isOrphaned=$isOrph;category='sonstiges'}
    }
}
$programs | Sort-Object name | ConvertTo-Json -Depth 2 -Compress"#
    ).await?;

    let arr = programs.as_array().cloned().unwrap_or_default();
    let total = arr.len();
    let orphaned = arr.iter().filter(|p| p["isOrphaned"].as_bool().unwrap_or(false)).count();
    let total_size_kb: i64 = arr.iter().map(|p| p["estimatedSize"].as_i64().unwrap_or(0)).sum();

    let categories = json!({
        "system": {"id":"system","label":"System","color":"#6c757d"},
        "treiber": {"id":"treiber","label":"Treiber","color":"#17a2b8"},
        "produktivitaet": {"id":"produktivitaet","label":"Produktivität","color":"#28a745"},
        "entwicklung": {"id":"entwicklung","label":"Entwicklung","color":"#6f42c1"},
        "browser": {"id":"browser","label":"Browser","color":"#fd7e14"},
        "kommunikation": {"id":"kommunikation","label":"Kommunikation","color":"#e83e8c"},
        "multimedia": {"id":"multimedia","label":"Multimedia","color":"#20c997"},
        "spiele": {"id":"spiele","label":"Spiele","color":"#dc3545"},
        "sicherheit": {"id":"sicherheit","label":"Sicherheit","color":"#ffc107"},
        "sonstiges": {"id":"sonstiges","label":"Sonstiges","color":"#adb5bd"}
    });

    Ok(json!({
        "programs": programs,
        "orphanedCount": orphaned,
        "totalSizeKB": total_size_kb,
        "totalPrograms": total,
        "categoryStats": { "sonstiges": total },
        "categories": categories
    }))
}

#[tauri::command]
pub async fn correlate_software(program: Value) -> Result<Value, String> {
    let install_location = program.get("installLocation").and_then(|v| v.as_str()).unwrap_or("");
    let display_name = program.get("displayName").and_then(|v| v.as_str()).unwrap_or("");
    let publisher = program.get("publisher").and_then(|v| v.as_str()).unwrap_or("");

    if install_location.is_empty() && display_name.is_empty() {
        return Ok(json!({ "files": [], "registry": [], "services": [] }));
    }

    let install_escaped = install_location.replace("'", "''");
    let name_escaped = display_name.replace("'", "''");
    let publisher_escaped = publisher.replace("'", "''");

    let script = format!(r#"
$result = @{{ files=@(); registry=@(); services=@() }}

# Files in install directory
$installLoc = '{install_loc}'
if ($installLoc -and (Test-Path $installLoc -EA SilentlyContinue)) {{
    $files = @(Get-ChildItem -Path $installLoc -Recurse -File -EA SilentlyContinue | Select-Object -First 50)
    foreach ($f in $files) {{
        $result.files += [PSCustomObject]@{{ path=$f.FullName; name=$f.Name; size=$f.Length; extension=$f.Extension }}
    }}
}}

# Related registry keys
$displayName = '{name}'
if ($displayName) {{
    $regPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($rp in $regPaths) {{
        Get-ChildItem $rp -EA SilentlyContinue | ForEach-Object {{
            $props = Get-ItemProperty $_.PSPath -EA SilentlyContinue
            if ($props.DisplayName -like "*$displayName*") {{
                $result.registry += [PSCustomObject]@{{ path=$_.PSPath; displayName=$props.DisplayName; version=$props.DisplayVersion }}
            }}
        }}
    }}
}}

# Related services
$pub = '{publisher}'
if ($displayName -or $pub) {{
    Get-CimInstance Win32_Service -EA SilentlyContinue | ForEach-Object {{
        $svc = $_
        if (($displayName -and ($svc.DisplayName -like "*$displayName*" -or $svc.PathName -like "*$displayName*")) -or
            ($pub -and $svc.DisplayName -like "*$pub*")) {{
            $result.services += [PSCustomObject]@{{ name=$svc.Name; displayName=$svc.DisplayName; status=$svc.State; startType=$svc.StartMode; path=$svc.PathName }}
        }}
    }}
}}

[PSCustomObject]$result | ConvertTo-Json -Depth 3 -Compress"#,
        install_loc = install_escaped,
        name = name_escaped,
        publisher = publisher_escaped
    );

    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn check_audit_updates() -> Result<Value, String> {
    // Check if winget is available, then query for updates
    let script = r#"
$updates = @()
try {
    $wingetPath = Get-Command winget -EA Stop | Select-Object -ExpandProperty Source
    $output = & $wingetPath upgrade --accept-source-agreements 2>$null
    $started = $false
    foreach ($line in $output) {
        if ($line -match '^-+$') { $started = $true; continue }
        if ($started -and $line -match '\S') {
            $parts = $line -split '\s{2,}'
            if ($parts.Count -ge 4) {
                $updates += [PSCustomObject]@{
                    name = $parts[0].Trim()
                    id = $parts[1].Trim()
                    currentVersion = $parts[2].Trim()
                    availableVersion = $parts[3].Trim()
                }
            }
        }
    }
} catch { }
$updates | ConvertTo-Json -Compress"#;

    crate::ps::run_ps_json_array(script).await
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
    let mut prev_store = bw_prev_store().lock().unwrap();
    let mut hist_store = bw_history_store().lock().unwrap();

    let bandwidth: Vec<Value> = arr.iter().map(|b| {
        let name = b["name"].as_str().unwrap_or("").to_string();
        let rb = b["receivedBytes"].as_i64().unwrap_or(0);
        let sb = b["sentBytes"].as_i64().unwrap_or(0);

        let (rx_ps, tx_ps) = if let Some(prev) = prev_store.get(&name) {
            let elapsed = (now_ms - prev.timestamp_ms) as f64 / 1000.0;
            if elapsed > 0.5 {
                (((rb - prev.received_bytes).max(0) as f64 / elapsed), ((sb - prev.sent_bytes).max(0) as f64 / elapsed))
            } else { (0.0, 0.0) }
        } else { (0.0, 0.0) };

        prev_store.insert(name.clone(), BwPrev { received_bytes: rb, sent_bytes: sb, timestamp_ms: now_ms });

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
pub async fn get_firewall_rules(direction: Option<String>) -> Result<Value, String> {
    let dir = direction.unwrap_or_else(|| "Inbound".to_string());
    let safe_dir = match dir.as_str() {
        "Inbound" => "Inbound",
        "Outbound" => "Outbound",
        _ => return Err("Ungültige Richtung: nur 'Inbound' oder 'Outbound' erlaubt".to_string()),
    };
    let script = format!(
        r#"Get-NetFirewallRule -Direction '{}' -Enabled True -ErrorAction SilentlyContinue | Select-Object DisplayName, Direction, Action, Profile -First 100 | ConvertTo-Json -Compress"#,
        safe_dir
    );
    crate::ps::run_ps_json_array(&script).await
}

#[tauri::command]
pub async fn block_process(name: String, path: Option<String>) -> Result<Value, String> {
    tracing::warn!(process = %name, "Firewall-Block erstellen");
    let prog = path.unwrap_or_else(|| name.clone());
    let safe_name = name.replace("'", "''");
    let safe_prog = prog.replace("'", "''");
    let script = format!(
        r#"New-NetFirewallRule -DisplayName 'Block {}' -Direction Outbound -Program '{}' -Action Block"#,
        safe_name, safe_prog
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn unblock_process(rule_name: String) -> Result<Value, String> {
    tracing::info!(rule = %rule_name, "Firewall-Block entfernen");
    let safe_name = rule_name.replace("'", "''");
    crate::ps::run_ps(&format!("Remove-NetFirewallRule -DisplayName '{}'", safe_name)).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_network_summary() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$tcp = (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' }).Count
$udp = (Get-NetUDPEndpoint -ErrorAction SilentlyContinue).Count
$listening = (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }).Count
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

    // Filter out local/private IPs — only resolve public IPs
    let public_ips: Vec<&str> = ip_addresses.iter()
        .map(|s| s.as_str())
        .filter(|ip| !is_private_ip(ip))
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
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 10000) }} catch {{}}
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

    // Store in cache for use by get_polling_data
    {
        let mut cache = IP_RESOLVE_CACHE.lock().unwrap();
        for (ip, info) in &result_map {
            if let Some(company) = info["company"].as_str() {
                if !company.is_empty() {
                    cache.insert(ip.clone(), company.to_string());
                }
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
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 8000) }} catch {{}}
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
/// Matches the format expected by the frontend (network.js refresh()).
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
        Some(v) if v.is_array() => v.as_array().unwrap().clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    // Parse UDP
    let udp_arr = match raw.get("udp") {
        Some(v) if v.is_array() => v.as_array().unwrap().clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    // Read IP resolve cache for per-connection company resolution
    let ip_cache = IP_RESOLVE_CACHE.lock().unwrap().clone();

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
                let mut cache = IP_RESOLVE_CACHE.lock().unwrap();
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
        Some(v) if v.is_array() => v.as_array().unwrap().clone(),
        Some(v) if !v.is_null() => vec![v.clone()],
        _ => vec![],
    };

    let mut prev_store = bw_prev_store().lock().unwrap();
    let mut hist_store = bw_history_store().lock().unwrap();

    let bandwidth: Vec<Value> = bw_raw.iter().map(|b| {
        let name = b["n"].as_str().unwrap_or("").to_string();
        let rb = b["rb"].as_i64().unwrap_or(0);
        let sb = b["sb"].as_i64().unwrap_or(0);

        let (rx_ps, tx_ps) = if let Some(prev) = prev_store.get(&name) {
            let elapsed = (now_ms - prev.timestamp_ms) as f64 / 1000.0;
            if elapsed > 0.5 {
                (((rb - prev.received_bytes).max(0) as f64 / elapsed), ((sb - prev.sent_bytes).max(0) as f64 / elapsed))
            } else { (0.0, 0.0) }
        } else { (0.0, 0.0) };

        prev_store.insert(name.clone(), BwPrev { received_bytes: rb, sent_bytes: sb, timestamp_ms: now_ms });

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
        let mut prev = prev_connections_store().lock().unwrap();
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

    let prev_store = prev_connections_store().lock().unwrap();
    let prev_keys: Vec<String> = prev_store.iter().map(|c| {
        format!("{}:{}->{}:{}", c["localAddress"].as_str().unwrap_or(""), c["localPort"], c["remoteAddress"].as_str().unwrap_or(""), c["remotePort"])
    }).collect();

    let empty_arr = vec![];
    let current_arr = current_raw.as_array().unwrap_or(&empty_arr);
    let added: Vec<&Value> = current_arr.iter().enumerate()
        .filter(|(i, _)| !prev_keys.contains(&current[*i]))
        .map(|(_, v)| v)
        .collect();

    let mut events: Vec<Value> = Vec::new();
    for a in &added {
        events.push(json!({
            "type": "new",
            "processName": a["pn"],
            "remoteAddress": a["ra"],
            "remotePort": a["rp"],
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
    }

    Ok(json!({ "events": events, "added": added, "removed": [] }))
}

#[tauri::command]
pub async fn get_bandwidth_history() -> Result<Value, String> {
    let store = bw_history_store().lock().unwrap();
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

    // Write header line
    let header = json!({ "type": "header", "startedAt": now, "version": 1 });
    std::fs::write(&filepath, format!("{}\n", header)).map_err(|e| e.to_string())?;

    let mut rec = NETWORK_RECORDING.lock().unwrap();
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
    let mut rec = NETWORK_RECORDING.lock().unwrap();
    if let Some(state) = rec.take() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let duration = now - state.started_at;

        // Write footer line
        let filepath = get_recordings_dir().join(&state.filename);
        let footer = json!({ "type": "footer", "stoppedAt": now, "duration": duration, "totalEvents": state.event_count });
        if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&filepath) {
            use std::io::Write;
            let _ = writeln!(f, "{}", footer);
        }

        tracing::debug!(filename = %state.filename, events = state.event_count, "Netzwerk-Aufzeichnung gestoppt");
        Ok(json!({ "success": true, "filename": state.filename, "duration": duration, "eventCount": state.event_count }))
    } else {
        Ok(json!({ "success": false, "error": "Keine aktive Aufzeichnung" }))
    }
}

#[tauri::command]
pub async fn get_network_recording_status() -> Result<Value, String> {
    let rec = NETWORK_RECORDING.lock().unwrap();
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
    let mut rec = NETWORK_RECORDING.lock().unwrap();
    if let Some(state) = rec.as_mut() {
        let filepath = get_recordings_dir().join(&state.filename);
        if let Some(arr) = events.as_array() {
            if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&filepath) {
                use std::io::Write;
                for event in arr {
                    let _ = writeln!(f, "{}", event);
                    state.event_count += 1;
                }
            }
            Ok(json!({ "success": true, "appended": arr.len(), "totalEvents": state.event_count }))
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

                // Read first and last line for metadata
                let content = std::fs::read_to_string(&path).unwrap_or_default();
                let lines: Vec<&str> = content.lines().collect();
                let mut started_at = 0i64;
                let mut duration = 0i64;
                let mut event_count = 0u32;
                if let Some(first) = lines.first() {
                    if let Ok(header) = serde_json::from_str::<Value>(first) {
                        started_at = header["startedAt"].as_i64().unwrap_or(0);
                    }
                }
                if let Some(last) = lines.last() {
                    if let Ok(footer) = serde_json::from_str::<Value>(last) {
                        if footer["type"].as_str() == Some("footer") {
                            duration = footer["duration"].as_i64().unwrap_or(0);
                            event_count = footer["totalEvents"].as_u64().unwrap_or(0) as u32;
                        }
                    }
                }
                // Count event lines (non-header, non-footer)
                if event_count == 0 {
                    event_count = lines.iter().filter(|l| {
                        if let Ok(v) = serde_json::from_str::<Value>(l) {
                            v["type"].as_str() != Some("header") && v["type"].as_str() != Some("footer")
                        } else { false }
                    }).count() as u32;
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
    Ok(json!(recordings))
}

#[tauri::command]
pub async fn delete_network_recording(filename: String) -> Result<Value, String> {
    // Security: prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Ungültiger Dateiname".to_string());
    }
    let path = get_recordings_dir().join(&filename);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Löschen fehlgeschlagen: {}", e))?;
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
            let mut csv = String::from("Zeitpunkt;Verbindungen;Bandbreite_Empfangen;Bandbreite_Gesendet\n");
            for snap in &all_snapshots {
                let ts = snap["timestamp"].as_i64().unwrap_or(0);
                let empty = json!({});
                let data = snap.get("data").unwrap_or(&empty);
                let conns = data["connections"].as_u64().unwrap_or(0);
                let rx = data["bandwidthRx"].as_u64().unwrap_or(0);
                let tx = data["bandwidthTx"].as_u64().unwrap_or(0);
                csv.push_str(&format!("{};{};{};{}\n", ts, conns, rx, tx));
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

/// Detect OS from TTL, SSDP SERVER header, SSH banner, and port profile.
/// TTL heuristic: 64 = Linux/macOS, 128 = Windows, 255 = Network Equipment
fn detect_os(ttl: i64, ssdp_server: &str, ssh_banner: &str, open_ports: &[u16]) -> String {
    // 1. SSDP SERVER header is most reliable (e.g. "Windows/10.0 UPnP/2.0 ..." or "Linux/3.x ...")
    let server_lower = ssdp_server.to_lowercase();
    if server_lower.contains("windows") {
        if let Some(start) = server_lower.find("windows/") {
            let ver = &ssdp_server[start..];
            let end = ver.find(' ').unwrap_or(ver.len());
            return ver[..end].replace('/', " ").to_string();
        }
        return "Windows".to_string();
    }
    if server_lower.contains("linux") {
        return "Linux".to_string();
    }

    // 2. SSH banner (e.g. "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1")
    let ssh_lower = ssh_banner.to_lowercase();
    if ssh_lower.contains("ubuntu") { return "Linux (Ubuntu)".to_string(); }
    if ssh_lower.contains("debian") { return "Linux (Debian)".to_string(); }
    if ssh_lower.contains("raspbian") || ssh_lower.contains("raspberry") {
        return "Linux (Raspberry Pi)".to_string();
    }
    if ssh_lower.contains("openssh") && !ssh_lower.contains("windows") {
        return "Linux/Unix".to_string();
    }
    if ssh_lower.contains("dropbear") { return "Linux (Embedded)".to_string(); }

    // 3. TTL-based heuristic
    if ttl > 0 {
        if ttl <= 64 {
            // iOS devices have port 62078
            if open_ports.contains(&62078) { return "iOS".to_string(); }
            return "Linux/macOS".to_string();
        }
        if ttl <= 128 {
            return "Windows".to_string();
        }
        if ttl <= 255 {
            return "Netzwerkgerät".to_string();
        }
    }

    String::new()
}

/// Quick passive scan: ARP table + parallel ping, parallel DNS (5s limit) + OUI vendor
#[tauri::command]
pub async fn scan_local_network() -> Result<Value, String> {
    let raw_val = crate::ps::run_ps_json_array(
        r#"$gateway = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Select-Object -First 1).NextHop
if (-not $gateway) { '[]'; return }
$subnet = $gateway -replace '\.\d+$', ''
$arp = @{}
arp -a | ForEach-Object { if ($_ -match '(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]+)\s+') { $arp[$Matches[1]] = $Matches[2].Replace('-',':') } }
$tasks = @()
1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $ping = New-Object System.Net.NetworkInformation.Ping
    $tasks += @{ip=$ip; task=$ping.SendPingAsync($ip, 1000)}
}
try { [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object { $_.task }), 5000) } catch {}
$alive = @()
foreach ($t in $tasks) {
    if ($t.task.IsCompleted -and -not $t.task.IsFaulted -and $t.task.Result.Status -eq 'Success') {
        $alive += $t
    }
}
$dnsTasks = @()
foreach ($t in $alive) {
    $dnsTasks += @{ip=$t.ip; task=[System.Net.Dns]::GetHostEntryAsync($t.ip)}
}
try { [void][System.Threading.Tasks.Task]::WaitAll(@($dnsTasks | ForEach-Object { $_.task }), 5000) } catch {}
$dnsMap = @{}
foreach ($dt in $dnsTasks) {
    if ($dt.task.IsCompleted -and -not $dt.task.IsFaulted) {
        $dnsMap[$dt.ip] = $dt.task.Result.HostName
    }
}
$results = @()
foreach ($t in $alive) {
    $ip = $t.ip
    $results += [PSCustomObject]@{ ip=$ip; mac=$arp[$ip]; hostname=$dnsMap[$ip]; online=$true; rtt=[int]$t.task.Result.RoundtripTime }
}
$results | ConvertTo-Json -Compress"#
    ).await?;

    let raw_devices = raw_val.as_array().cloned().unwrap_or_default();

    // Enrich with OUI vendor lookup
    let enriched: Vec<Value> = raw_devices.iter().map(|d| {
        let mac = d["mac"].as_str().unwrap_or("");
        let vendor = if mac.is_empty() {
            String::new()
        } else {
            crate::oui::lookup(mac).unwrap_or_default()
        };
        let hostname = d["hostname"].as_str().unwrap_or("");
        // Basic ARP state classification
        let state = if d["online"].as_bool().unwrap_or(false) { "Erreichbar" } else { "Veraltet" };
        json!({
            "ip": d["ip"],
            "mac": mac,
            "hostname": hostname,
            "vendor": vendor,
            "state": state,
            "online": d["online"],
            "rtt": d["rtt"]
        })
    }).collect();

    Ok(json!(enriched))
}

/// Active network scan: ping sweep + ARP + parallel DNS + port scan + OUI vendor + classification
#[tauri::command]
pub async fn scan_network_active(app: tauri::AppHandle) -> Result<Value, String> {
    tracing::info!("Aktiver Netzwerk-Scan gestartet");
    // Get local IP + subnet + gateway
    let info = crate::ps::run_ps_json(
        r#"$adapter = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $adapter) { '{}' | Write-Output; return }
$localIP = ($adapter.IPv4Address | Select-Object -First 1).IPAddress
$gateway = ($adapter.IPv4DefaultGateway | Select-Object -First 1).NextHop
$subnet = $gateway -replace '\.\d+$', ''
[PSCustomObject]@{ localIP=$localIP; subnet=$subnet; gateway=$gateway } | ConvertTo-Json -Compress"#
    ).await?;

    let subnet = info.get("subnet").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let local_ip = info.get("localIP").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let gateway_ip = info.get("gateway").and_then(|v| v.as_str()).unwrap_or("").to_string();

    if subnet.is_empty() {
        return Ok(json!({ "devices": [], "subnet": "", "localIP": "" }));
    }

    // Phase 1: Ping Sweep + ARP + DNS
    let _ = app.emit("network-scan-progress", json!({
        "phase": "ping", "message": "Ping-Sweep läuft...", "percent": 10
    }));

    let phase1_script = format!(
        r#"$subnet = '{subnet}'
$arp = @{{}}
arp -a | ForEach-Object {{ if ($_ -match '(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]+)\s+') {{ $arp[$Matches[1]] = $Matches[2].Replace('-',':') }} }}
$tasks = @()
1..254 | ForEach-Object {{
    $ip = "$subnet.$_"
    $ping = New-Object System.Net.NetworkInformation.Ping
    $tasks += @{{ip=$ip; task=$ping.SendPingAsync($ip, 1500)}}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 10000) }} catch {{}}
$alive = @()
foreach ($t in $tasks) {{
    if ($t.task.IsCompleted -and -not $t.task.IsFaulted -and $t.task.Result.Status -eq 'Success') {{
        $alive += $t
    }}
}}
$dnsTasks = @()
foreach ($t in $alive) {{
    $dnsTasks += @{{ip=$t.ip; task=[System.Net.Dns]::GetHostEntryAsync($t.ip)}}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($dnsTasks | ForEach-Object {{ $_.task }}), 8000) }} catch {{}}
$dnsMap = @{{}}
foreach ($dt in $dnsTasks) {{
    if ($dt.task.IsCompleted -and -not $dt.task.IsFaulted) {{
        $dnsMap[$dt.ip] = $dt.task.Result.HostName
    }}
}}
$results = @()
foreach ($t in $alive) {{
    $ip = $t.ip
    $results += [PSCustomObject]@{{
        ip=$ip
        mac=$arp[$ip]
        hostname=$dnsMap[$ip]
        rtt=[int]$t.task.Result.RoundtripTime
        ttl=[int]$t.task.Result.Options.Ttl
    }}
}}
$results | ConvertTo-Json -Compress"#,
        subnet = subnet.replace('\'', "''"),
    );

    let phase1_val = crate::ps::run_ps_json_array(&phase1_script).await?;
    let phase1_raw = phase1_val.as_array().cloned().unwrap_or_default();
    let alive_count = phase1_raw.len();
    tracing::info!("Netzwerk-Scan Phase 1: {} Geräte gefunden", alive_count);

    // Phase 2: Parallel port scan for all alive devices
    let _ = app.emit("network-scan-progress", json!({
        "phase": "ports", "message": format!("{} Geräte gefunden, scanne Ports...", alive_count), "percent": 40
    }));

    // Build IP list for port scan
    let alive_ips: Vec<String> = phase1_raw.iter()
        .filter_map(|d| d["ip"].as_str().map(|s| s.to_string()))
        .collect();

    let port_map: std::collections::HashMap<String, Vec<Value>> = if !alive_ips.is_empty() {
        // Build PS script for parallel port scan of all devices
        let ip_list = alive_ips.iter()
            .map(|ip| format!("'{}'", ip.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");

        let port_script = format!(
            r#"$ips = @({ip_list})
$portDefs = @(21,22,80,139,443,445,631,3389,5900,8080,9100)
$portLabels = @{{21='FTP';22='SSH';80='HTTP';139='NetBIOS';443='HTTPS';445='SMB';631='IPP';3389='RDP';5900='VNC';8080='HTTP-Proxy';9100='RAW-Print'}}
$tasks = @()
foreach ($ip in $ips) {{
    foreach ($port in $portDefs) {{
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tasks += @{{ip=$ip; port=$port; task=$tcp.ConnectAsync($ip, $port); client=$tcp}}
    }}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 12000) }} catch {{}}
$portMap = @{{}}
foreach ($pt in $tasks) {{
    $ok = $pt.task.IsCompleted -and -not $pt.task.IsFaulted -and $pt.client.Connected
    if ($ok) {{
        if (-not $portMap[$pt.ip]) {{ $portMap[$pt.ip] = @() }}
        $portMap[$pt.ip] += [PSCustomObject]@{{port=$pt.port; label=$portLabels[$pt.port]}}
    }}
    try {{ $pt.client.Close() }} catch {{}}
}}
$result = @{{}}
foreach ($ip in $portMap.Keys) {{
    $result[$ip] = @($portMap[$ip])
}}
$result | ConvertTo-Json -Depth 3 -Compress"#,
            ip_list = ip_list
        );

        match crate::ps::run_ps_json(&port_script).await {
            Ok(port_data) => {
                let mut pm: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
                if let Some(obj) = port_data.as_object() {
                    for (ip, ports) in obj {
                        let port_list = match ports {
                            v if v.is_array() => v.as_array().unwrap().clone(),
                            v if !v.is_null() => vec![v.clone()],
                            _ => vec![],
                        };
                        pm.insert(ip.clone(), port_list);
                    }
                }
                pm
            }
            Err(e) => {
                tracing::warn!("Port-Scan fehlgeschlagen: {}", e);
                std::collections::HashMap::new()
            }
        }
    } else {
        std::collections::HashMap::new()
    };

    // Phase 3: UPnP/SSDP discovery for model names + SERVER header for OS
    let _ = app.emit("network-scan-progress", json!({
        "phase": "identify", "message": "Gerätemodelle werden erkannt (UPnP/SSDP)...", "percent": 55
    }));

    let ssdp_map: std::collections::HashMap<String, Value> = {
        let ssdp_script = r#"$udp = New-Object System.Net.Sockets.UdpClient
$udp.Client.ReceiveTimeout = 3000
$udp.Client.SendTimeout = 1000
$msg = "M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 3`r`nST: upnp:rootdevice`r`n`r`n"
$bytes = [Text.Encoding]::UTF8.GetBytes($msg)
$ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse('239.255.255.250'), 1900)
try {
    $udp.Send($bytes, $bytes.Length, $ep) | Out-Null
    Start-Sleep -Milliseconds 500
    $udp.Send($bytes, $bytes.Length, $ep) | Out-Null
} catch { $udp.Close(); '{}'; return }
$locations = @{}
$servers = @{}
$deadline = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $deadline) {
    try {
        $remEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        $resp = [Text.Encoding]::UTF8.GetString($udp.Receive([ref]$remEP))
        $ip = $remEP.Address.ToString()
        if ($resp -match 'LOCATION:\s*(http\S+)') {
            if (-not $locations[$ip]) { $locations[$ip] = $Matches[1] }
        }
        if ($resp -match 'SERVER:\s*(.+)') {
            if (-not $servers[$ip]) { $servers[$ip] = $Matches[1].Trim() }
        }
    } catch { break }
}
$udp.Close()
$result = @{}
foreach ($ip in $locations.Keys) {
    try {
        $xml = [xml](Invoke-WebRequest -Uri $locations[$ip] -TimeoutSec 3 -UseBasicParsing).Content
        $ns = @{d='urn:schemas-upnp-org:device-1-0'}
        $dev = $xml | Select-Xml '//d:device' -Namespace $ns | Select-Object -First 1
        if ($dev) {
            $result[$ip] = [PSCustomObject]@{
                modelName = [string]$dev.Node.modelName
                modelNumber = [string]$dev.Node.modelNumber
                manufacturer = [string]$dev.Node.manufacturer
                friendlyName = [string]$dev.Node.friendlyName
                serialNumber = [string]$dev.Node.serialNumber
                modelDescription = [string]$dev.Node.modelDescription
                server = [string]$servers[$ip]
            }
        }
    } catch {}
}
foreach ($ip in $servers.Keys) {
    if (-not $result[$ip]) { $result[$ip] = [PSCustomObject]@{ server=[string]$servers[$ip] } }
}
$result | ConvertTo-Json -Depth 2 -Compress"#;

        match crate::ps::run_ps_json(ssdp_script).await {
            Ok(ssdp_data) => {
                let mut sm: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
                if let Some(obj) = ssdp_data.as_object() {
                    for (ip, info) in obj {
                        sm.insert(ip.clone(), info.clone());
                    }
                }
                tracing::info!("SSDP-Erkennung: {} Geräte mit Modell-Info", sm.len());
                sm
            }
            Err(e) => {
                tracing::warn!("SSDP-Erkennung fehlgeschlagen: {}", e);
                std::collections::HashMap::new()
            }
        }
    };

    // Phase 3b: SSH banner grabbing + HTTP Server header for devices with those ports open
    let _ = app.emit("network-scan-progress", json!({
        "phase": "identify", "message": "SSH/HTTP-Banner werden geprüft...", "percent": 65
    }));

    let banner_map: std::collections::HashMap<String, Value> = {
        // Collect IPs with SSH (22) or HTTP (80/443) ports open
        let mut ssh_ips: Vec<String> = Vec::new();
        let mut http_ips: Vec<String> = Vec::new();
        for (ip, ports) in &port_map {
            let port_nums: Vec<u16> = ports.iter()
                .filter_map(|p| p["port"].as_u64().map(|n| n as u16))
                .collect();
            if port_nums.contains(&22) { ssh_ips.push(ip.clone()); }
            if port_nums.contains(&80) || port_nums.contains(&443) { http_ips.push(ip.clone()); }
        }

        let mut bm: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

        // SSH banner grab (parallel, 3s timeout)
        if !ssh_ips.is_empty() {
            let ssh_ips_str = ssh_ips.iter()
                .map(|ip| format!("'{}'", ip.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            let ssh_script = format!(r#"$ips = @({ips})
$tasks = @()
foreach ($ip in $ips) {{
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tasks += @{{ ip=$ip; tcp=$tcp; task=$tcp.ConnectAsync($ip, 22) }}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 3000) }} catch {{}}
$result = @{{}}
foreach ($t in $tasks) {{
    try {{
        if ($t.task.IsCompleted -and -not $t.task.IsFaulted -and $t.tcp.Connected) {{
            $stream = $t.tcp.GetStream()
            $stream.ReadTimeout = 2000
            $buf = New-Object byte[] 512
            $n = $stream.Read($buf, 0, 512)
            if ($n -gt 0) {{ $result[$t.ip] = [Text.Encoding]::UTF8.GetString($buf, 0, $n).Trim() }}
        }}
    }} catch {{}}
    try {{ $t.tcp.Close() }} catch {{}}
}}
$result | ConvertTo-Json -Compress"#, ips = ssh_ips_str);

            match crate::ps::run_ps_json(&ssh_script).await {
                Ok(data) => {
                    if let Some(obj) = data.as_object() {
                        for (ip, banner) in obj {
                            bm.entry(ip.clone()).or_insert_with(|| json!({}));
                            if let Some(entry) = bm.get_mut(ip) {
                                entry["sshBanner"] = banner.clone();
                            }
                        }
                    }
                }
                Err(e) => tracing::warn!("SSH-Banner-Grab fehlgeschlagen: {}", e),
            }
        }

        // HTTP Server header (parallel, 3s timeout)
        if !http_ips.is_empty() {
            let http_ips_str = http_ips.iter()
                .map(|ip| format!("'{}'", ip.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            let http_script = format!(r#"$ips = @({ips})
$result = @{{}}
foreach ($ip in $ips) {{
    try {{
        $resp = Invoke-WebRequest -Uri "http://$ip/" -Method HEAD -TimeoutSec 3 -UseBasicParsing -EA Stop
        $server = $resp.Headers['Server']
        if ($server) {{ $result[$ip] = [string]$server }}
    }} catch {{}}
}}
$result | ConvertTo-Json -Compress"#, ips = http_ips_str);

            match crate::ps::run_ps_json(&http_script).await {
                Ok(data) => {
                    if let Some(obj) = data.as_object() {
                        for (ip, server) in obj {
                            bm.entry(ip.clone()).or_insert_with(|| json!({}));
                            if let Some(entry) = bm.get_mut(ip) {
                                entry["httpServer"] = server.clone();
                            }
                        }
                    }
                }
                Err(e) => tracing::warn!("HTTP-Header-Grab fehlgeschlagen: {}", e),
            }
        }

        bm
    };

    // Phase 4: Enrich devices with OUI vendor + SSDP model + classification
    let _ = app.emit("network-scan-progress", json!({
        "phase": "classify", "message": "Geräte werden klassifiziert...", "percent": 85
    }));

    let mut enriched_devices: Vec<Value> = Vec::with_capacity(phase1_raw.len());
    for raw_device in &phase1_raw {
        let ip = raw_device["ip"].as_str().unwrap_or("").to_string();
        let mac = raw_device["mac"].as_str().unwrap_or("").to_string();
        let hostname = raw_device["hostname"].as_str().unwrap_or("").to_string();
        let rtt = raw_device["rtt"].as_i64().unwrap_or(0);

        // OUI vendor lookup
        let vendor = if mac.is_empty() {
            String::new()
        } else {
            crate::oui::lookup(&mac).unwrap_or_default()
        };

        // SSDP model info (extended)
        let ssdp_info = ssdp_map.get(&ip);
        let model_name = ssdp_info
            .and_then(|i| i["modelName"].as_str())
            .unwrap_or("")
            .to_string();
        let model_number = ssdp_info
            .and_then(|i| i["modelNumber"].as_str())
            .unwrap_or("")
            .to_string();
        let ssdp_manufacturer = ssdp_info
            .and_then(|i| i["manufacturer"].as_str())
            .unwrap_or("")
            .to_string();
        let friendly_name = ssdp_info
            .and_then(|i| i["friendlyName"].as_str())
            .unwrap_or("")
            .to_string();
        let ssdp_serial = ssdp_info
            .and_then(|i| i["serialNumber"].as_str())
            .unwrap_or("")
            .to_string();
        let ssdp_description = ssdp_info
            .and_then(|i| i["modelDescription"].as_str())
            .unwrap_or("")
            .to_string();
        let ssdp_server = ssdp_info
            .and_then(|i| i["server"].as_str())
            .unwrap_or("")
            .to_string();

        // Banner/header info
        let banner_info = banner_map.get(&ip);
        let ssh_banner = banner_info
            .and_then(|i| i["sshBanner"].as_str())
            .unwrap_or("")
            .to_string();
        let http_server = banner_info
            .and_then(|i| i["httpServer"].as_str())
            .unwrap_or("")
            .to_string();

        // Use SSDP manufacturer if OUI vendor is empty
        let effective_vendor = if vendor.is_empty() && !ssdp_manufacturer.is_empty() {
            ssdp_manufacturer.clone()
        } else {
            vendor.clone()
        };

        // Get open ports for this device
        let open_ports = port_map.get(&ip).cloned().unwrap_or_default();
        let open_port_numbers: Vec<u16> = open_ports.iter()
            .filter_map(|p| p["port"].as_u64().map(|n| n as u16))
            .collect();

        // Classify device
        let is_local = ip == local_ip;
        let is_gateway = ip == gateway_ip;
        let (device_type, device_label, device_icon) =
            crate::oui::classify_device(&effective_vendor, &hostname, &open_port_numbers, is_local, is_gateway);

        // OS detection: TTL heuristic + SSDP SERVER header + SSH banner
        let ttl = raw_device["ttl"].as_i64().unwrap_or(0);
        let os = detect_os(ttl, &ssdp_server, &ssh_banner, &open_port_numbers);

        // Firmware version from SSDP modelNumber or modelDescription
        let firmware_version = if !model_number.is_empty() {
            model_number.clone()
        } else if !ssdp_description.is_empty() && ssdp_description.len() < 60 {
            ssdp_description.clone()
        } else {
            String::new()
        };

        // Build identification method string
        let mut id_methods = Vec::new();
        if !vendor.is_empty() { id_methods.push("OUI"); }
        if !open_port_numbers.is_empty() { id_methods.push("Ports"); }
        if !model_name.is_empty() { id_methods.push("UPnP"); }
        if !ssh_banner.is_empty() { id_methods.push("SSH"); }
        if !http_server.is_empty() { id_methods.push("HTTP"); }
        if id_methods.is_empty() {
            if !hostname.is_empty() { id_methods.push("DNS"); }
            else { id_methods.push("Ping"); }
        }

        enriched_devices.push(json!({
            "ip": ip,
            "mac": mac,
            "hostname": hostname,
            "online": true,
            "rtt": rtt,
            "vendor": effective_vendor,
            "deviceType": device_type,
            "deviceLabel": device_label,
            "deviceIcon": device_icon,
            "openPorts": open_ports,
            "isLocal": is_local,
            "os": os,
            "modelName": model_name,
            "friendlyName": friendly_name,
            "manufacturer": ssdp_manufacturer,
            "firmwareVersion": firmware_version,
            "serialNumber": ssdp_serial,
            "sshBanner": ssh_banner,
            "httpServer": http_server,
            "identifiedBy": id_methods.join(" + ")
        }));
    }

    let _ = app.emit("network-scan-progress", json!({
        "phase": "done", "message": "Fertig", "percent": 100
    }));

    tracing::info!("Netzwerk-Scan abgeschlossen: {} Geräte, davon {} mit Modell-Info",
        enriched_devices.len(), ssdp_map.len());

    let result = json!({
        "devices": enriched_devices,
        "subnet": subnet,
        "localIP": local_ip,
        "scannedAt": chrono::Utc::now().timestamp_millis()
    });

    // Persist to memory + disk
    *LAST_NETWORK_SCAN.lock().unwrap() = Some(result.clone());
    let _ = write_json_file("last-network-scan.json", &result);

    Ok(result)
}

/// Return cached last network scan result
#[tauri::command]
pub async fn get_last_network_scan() -> Result<Value, String> {
    // First check memory cache
    {
        let guard = LAST_NETWORK_SCAN.lock().unwrap();
        if let Some(ref data) = *guard {
            return Ok(data.clone());
        }
    }
    // If memory empty, try loading from disk (survives app restart)
    let persisted = read_json_file("last-network-scan.json");
    if persisted.get("devices").is_some() {
        // Restore to memory cache
        *LAST_NETWORK_SCAN.lock().unwrap() = Some(persisted.clone());
        return Ok(persisted);
    }
    Ok(json!(null))
}

#[tauri::command]
pub async fn scan_device_ports(ip: String) -> Result<Value, String> {
    validate_ip(&ip)?;
    let script = format!(
        r#"$portLabels = @{{21='FTP';22='SSH';23='Telnet';25='SMTP';53='DNS';80='HTTP';139='NetBIOS';443='HTTPS';445='SMB';3389='RDP';5900='VNC';8080='HTTP-Proxy'}}
$ports = @(21,22,23,25,53,80,139,443,445,3389,5900,8080)
$tasks = @()
foreach ($port in $ports) {{
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tasks += @{{port=$port; task=$tcp.ConnectAsync('{}', $port); client=$tcp}}
}}
try {{ [void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object {{ $_.task }}), 3000) }} catch {{}}
$results = @()
foreach ($t in $tasks) {{
    $open = $t.task.IsCompleted -and -not $t.task.IsFaulted -and $t.client.Connected
    $results += [PSCustomObject]@{{ port=$t.port; open=$open; label=$portLabels[$t.port] }}
    try {{ $t.client.Close() }} catch {{}}
}}
$results | ConvertTo-Json -Compress"#, ip
    );
    crate::ps::run_ps_json_array(&script).await
}

#[tauri::command]
pub async fn get_smb_shares(ip: String) -> Result<Value, String> {
    validate_ip(&ip)?;
    let script = format!(
        r#"@(Get-SmbConnection -ServerName '{}' -ErrorAction SilentlyContinue | ForEach-Object {{ [PSCustomObject]@{{ name=$_.ShareName; path="\\$($_.ServerName)\$($_.ShareName)" }} }}) | ConvertTo-Json -Compress"#, ip
    );
    crate::ps::run_ps_json_array(&script).await
}

#[tauri::command]
pub async fn update_oui_database() -> Result<Value, String> {
    // Use PowerShell to download the IEEE OUI database
    let oui_path = get_data_dir().join("oui.txt");
    let oui_path_escaped = oui_path.to_string_lossy().replace("'", "''");

    let script = format!(r#"
try {{
    $url = 'https://standards-oui.ieee.org/oui/oui.txt'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile '{path}' -UseBasicParsing -TimeoutSec 30
    $lines = (Get-Content '{path}' | Measure-Object).Count
    [PSCustomObject]@{{ success=$true; path='{path}'; lines=$lines }} | ConvertTo-Json -Compress
}} catch {{
    [PSCustomObject]@{{ success=$false; error=$_.Exception.Message }} | ConvertTo-Json -Compress
}}"#, path = oui_path_escaped);

    let result = crate::ps::run_ps_json(&script).await?;

    // Immediately reload into memory after successful download
    if result["success"].as_bool().unwrap_or(false) {
        let data_dir = get_data_dir();
        let count = crate::oui::load_dynamic_oui(&data_dir);
        tracing::info!("OUI-Datenbank nach Download geladen: {} Einträge", count);
    }

    Ok(result)
}

// === System Info ===

#[tauri::command]
pub async fn get_system_info() -> Result<Value, String> {
    get_system_profile().await
}

// === Security Audit ===

#[tauri::command]
pub async fn run_security_audit() -> Result<Value, String> {
    tracing::debug!("Starte Sicherheitscheck");
    let result = crate::ps::run_ps_json_array(
        r#"$checks = @()

# 1. Firewall
$fw = (Get-NetFirewallProfile -EA SilentlyContinue | Where-Object { $_.Enabled }).Count
$checks += [PSCustomObject]@{ id='firewall'; name='Firewall'; status=if($fw -ge 3){'ok'}elseif($fw -ge 1){'warning'}else{'critical'}; detail="$fw/3 Profile aktiv" }

# 2. UAC
$uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -EA SilentlyContinue).EnableLUA
$checks += [PSCustomObject]@{ id='uac'; name='UAC (Benutzerkontensteuerung)'; status=if($uac -eq 1){'ok'}else{'critical'}; detail=if($uac -eq 1){'Aktiviert'}else{'Deaktiviert'} }

# 3. Antivirus
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -EA SilentlyContinue
$checks += [PSCustomObject]@{ id='antivirus'; name='Antivirus'; status=if($av){'ok'}else{'critical'}; detail=if($av){$av[0].displayName}else{'Nicht gefunden'} }

# 4. Windows Defender Echtzeitschutz
$defPref = Get-MpPreference -EA SilentlyContinue
$rtDisabled = $defPref.DisableRealtimeMonitoring
$checks += [PSCustomObject]@{ id='defender-realtime'; name='Echtzeitschutz'; status=if($rtDisabled -eq $false){'ok'}else{'critical'}; detail=if($rtDisabled -eq $false){'Aktiviert'}else{'Deaktiviert'} }

# 5. Defender Definitionen Alter
try {
    $defStatus = Get-MpComputerStatus -EA Stop
    $daysOld = ((Get-Date) - $defStatus.AntivirusSignatureLastUpdated).Days
    $checks += [PSCustomObject]@{ id='defender-definitions'; name='Virendefinitionen'; status=if($daysOld -le 2){'ok'}elseif($daysOld -le 7){'warning'}else{'critical'}; detail="Letztes Update vor $daysOld Tagen" }
} catch {
    $checks += [PSCustomObject]@{ id='defender-definitions'; name='Virendefinitionen'; status='warning'; detail='Status konnte nicht abgefragt werden' }
}

# 6. Windows Update — ausstehende Updates
try {
    $updateSession = New-Object -ComObject Microsoft.Update.Session -EA Stop
    $searcher = $updateSession.CreateUpdateSearcher()
    $pending = $searcher.Search("IsInstalled=0 and Type='Software'").Updates.Count
    $checks += [PSCustomObject]@{ id='windows-updates'; name='Windows-Updates'; status=if($pending -eq 0){'ok'}elseif($pending -le 3){'warning'}else{'critical'}; detail=if($pending -eq 0){'Alle Updates installiert'}else{"$pending Updates ausstehend"} }
} catch {
    $checks += [PSCustomObject]@{ id='windows-updates'; name='Windows-Updates'; status='warning'; detail='Konnte nicht geprüft werden' }
}

# 7. BitLocker / Verschlüsselung
try {
    $bl = Get-BitLockerVolume -MountPoint 'C:' -EA Stop
    $checks += [PSCustomObject]@{ id='bitlocker'; name='Laufwerksverschlüsselung'; status=if($bl.ProtectionStatus -eq 'On'){'ok'}else{'warning'}; detail=if($bl.ProtectionStatus -eq 'On'){'BitLocker aktiviert'}else{'BitLocker deaktiviert'} }
} catch {
    $checks += [PSCustomObject]@{ id='bitlocker'; name='Laufwerksverschlüsselung'; status='warning'; detail='BitLocker nicht verfügbar' }
}

# 8. SMBv1 (veraltet, Sicherheitsrisiko)
try {
    $smb1 = (Get-SmbServerConfiguration -EA Stop).EnableSMB1Protocol
    $checks += [PSCustomObject]@{ id='smb1'; name='SMBv1-Protokoll'; status=if($smb1 -eq $false){'ok'}else{'critical'}; detail=if($smb1 -eq $false){'Deaktiviert (sicher)'}else{'Aktiviert (Sicherheitsrisiko!)'} }
} catch {
    $checks += [PSCustomObject]@{ id='smb1'; name='SMBv1-Protokoll'; status='ok'; detail='Nicht verfügbar (sicher)' }
}

# 9. Remotedesktop
$rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -EA SilentlyContinue).fDenyTSConnections
$checks += [PSCustomObject]@{ id='rdp'; name='Remotedesktop'; status=if($rdp -eq 1){'ok'}else{'warning'}; detail=if($rdp -eq 1){'Deaktiviert'}else{'Aktiviert — nur aktivieren wenn benötigt'} }

# 10. Passwort — Ablauf
try {
    $maxPwAge = (net accounts 2>$null | Select-String 'Maximum password age').ToString() -replace '.*:\s*',''
    $checks += [PSCustomObject]@{ id='password-policy'; name='Passwort-Richtlinie'; status=if($maxPwAge -match 'Unlimited|Unbegrenzt'){'warning'}else{'ok'}; detail="Max. Passwort-Alter: $maxPwAge" }
} catch {
    $checks += [PSCustomObject]@{ id='password-policy'; name='Passwort-Richtlinie'; status='warning'; detail='Konnte nicht geprüft werden' }
}

# 11. Secure Boot
try {
    $sb = Confirm-SecureBootUEFI -EA Stop
    $checks += [PSCustomObject]@{ id='secure-boot'; name='Secure Boot'; status=if($sb){'ok'}else{'warning'}; detail=if($sb){'Aktiviert'}else{'Deaktiviert'} }
} catch {
    $checks += [PSCustomObject]@{ id='secure-boot'; name='Secure Boot'; status='warning'; detail='Nicht verfügbar (Legacy BIOS)' }
}

# 12. Autostart-Einträge (zu viele = Risiko)
$asCount = @(Get-CimInstance Win32_StartupCommand -EA SilentlyContinue).Count
$checks += [PSCustomObject]@{ id='autostart'; name='Autostart-Programme'; status=if($asCount -le 5){'ok'}elseif($asCount -le 15){'warning'}else{'critical'}; detail="$asCount Programme im Autostart" }

$checks | ConvertTo-Json -Compress"#
    ).await?;

    // Persist the audit result to history
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let mut history = read_json_file("audit-history.json");
    let entries = history.as_object_mut()
        .and_then(|o| o.get_mut("entries"))
        .and_then(|e| e.as_array_mut());

    let entry = json!({
        "timestamp": now,
        "checks": result,
    });

    if let Some(arr) = entries {
        arr.insert(0, entry);
        // Keep max 20 entries
        arr.truncate(20);
    } else {
        history = json!({ "entries": [entry] });
    }
    write_json_file("audit-history.json", &history)?;
    tracing::debug!("Sicherheitscheck abgeschlossen, Ergebnis gespeichert");

    Ok(result)
}

#[tauri::command]
pub async fn get_audit_history() -> Result<Value, String> {
    let history = read_json_file("audit-history.json");
    Ok(history.get("entries").cloned().unwrap_or(json!([])))
}

// === System Score ===

#[tauri::command]
pub async fn get_system_score(results: Option<Value>) -> Result<Value, String> {
    // Compute real scores from passed-in results, or return defaults with stub flag
    let r = results.unwrap_or(json!({}));

    // Privacy score: based on how many settings are "private"
    let privacy_score = if let Some(settings) = r.get("privacy").and_then(|p| p.get("settings")).and_then(|s| s.as_array()) {
        let total = settings.len() as f64;
        let protected = settings.iter().filter(|s| s["isPrivate"].as_bool().unwrap_or(false)).count() as f64;
        if total > 0.0 { (protected / total * 100.0).round() as u32 } else { 50 }
    } else { 50 };

    // Disk score: based on health scores from SMART data
    let disk_score = if let Some(disks) = r.get("diskHealth").and_then(|d| d.as_array()) {
        if disks.is_empty() { 50 } else {
            let sum: u32 = disks.iter().map(|d| d["healthScore"].as_u64().unwrap_or(50) as u32).sum();
            sum / disks.len() as u32
        }
    } else { 50 };

    // Registry score: based on orphaned entries found
    let registry_score = if let Some(cats) = r.get("registry").and_then(|r| r.as_array()) {
        let total_entries: usize = cats.iter().map(|c| c["entries"].as_array().map(|a| a.len()).unwrap_or(0)).sum();
        if total_entries == 0 { 100 } else if total_entries < 10 { 85 } else if total_entries < 50 { 65 } else { 40 }
    } else { 50 };

    // Optimizer score: based on how many optimizations are applied
    let optimizer_score = if let Some(opts) = r.get("optimizations").and_then(|o| o.as_array()) {
        let total = opts.len() as f64;
        let applied = opts.iter().filter(|o| o["applied"].as_bool().unwrap_or(false)).count() as f64;
        if total > 0.0 { (applied / total * 100.0).round() as u32 } else { 50 }
    } else { 50 };

    // Updates score: fewer pending = better
    let updates_score = if let Some(updates) = r.get("updates").and_then(|u| u.as_array()) {
        if updates.is_empty() { 100 } else if updates.len() < 3 { 80 } else if updates.len() < 10 { 60 } else { 40 }
    } else { 50 };

    // Software score: fewer orphaned entries = better
    let software_score = if let Some(orphaned) = r.get("orphanedCount").and_then(|o| o.as_u64()) {
        if orphaned == 0 { 100 } else if orphaned < 5 { 80 } else if orphaned < 15 { 60 } else { 40 }
    } else { 50 };

    let has_real_data = r.as_object().map(|o| !o.is_empty()).unwrap_or(false);

    // Weighted average
    let categories = vec![
        json!({"name": "Datenschutz", "weight": 25, "score": privacy_score, "description": "Windows-Datenschutzeinstellungen"}),
        json!({"name": "Festplatten", "weight": 20, "score": disk_score, "description": "Festplatten-Gesundheit und Speicherplatz"}),
        json!({"name": "Registry", "weight": 15, "score": registry_score, "description": "Registry-Sauberkeit"}),
        json!({"name": "Optimierung", "weight": 15, "score": optimizer_score, "description": "Systemoptimierungen"}),
        json!({"name": "Updates", "weight": 15, "score": updates_score, "description": "Windows- und Software-Updates"}),
        json!({"name": "Software", "weight": 10, "score": software_score, "description": "Software-Inventar und Bloatware"}),
    ];

    let total_score: f64 = categories.iter().map(|c| {
        c["score"].as_f64().unwrap_or(0.0) * c["weight"].as_f64().unwrap_or(0.0) / 100.0
    }).sum();
    let score = total_score.round() as u32;

    let grade = match score {
        90..=100 => "A",
        80..=89 => "B",
        70..=79 => "C",
        60..=69 => "D",
        _ => "F",
    };

    let risk_level = match score {
        80..=100 => "low",
        60..=79 => "moderate",
        _ => "high",
    };

    let mut result = json!({
        "score": score,
        "grade": grade,
        "riskLevel": risk_level,
        "categories": categories
    });
    if !has_real_data {
        result["stub"] = json!(true);
        result["message"] = json!("Keine Analysedaten übergeben — Score basiert auf Standardwerten");
    }
    Ok(result)
}

// === Preferences ===

fn preferences_defaults() -> Value {
    json!({
        "theme": "dark",
        "language": "de",
        "networkDetailLevel": "normal",
        "sessionRestore": true,
        "sessionSaveOnClose": true,
        "sessionSaveAfterScan": true,
        "energyMode": "auto",
        "batteryThreshold": 20,
        "disableBackgroundOnBattery": true,
        "minimizeToTray": true,
        "startMinimized": false,
        "showScanNotification": true,
        "showSizeColors": true,
        "smartLayout": true,
        "terminalShell": "powershell"
    })
}

#[tauri::command]
pub async fn get_preferences() -> Result<Value, String> {
    let defaults = preferences_defaults();
    let saved = read_json_file("preferences.json");
    // Merge: saved values override defaults
    if let (Some(def_obj), Some(saved_obj)) = (defaults.as_object(), saved.as_object()) {
        let mut merged = def_obj.clone();
        for (k, v) in saved_obj {
            merged.insert(k.clone(), v.clone());
        }
        Ok(Value::Object(merged))
    } else {
        Ok(defaults)
    }
}

#[tauri::command]
pub async fn set_preference(key: String, value: Value) -> Result<Value, String> {
    let mut prefs = read_json_file("preferences.json");
    if let Some(obj) = prefs.as_object_mut() {
        obj.insert(key, value);
    }
    write_json_file("preferences.json", &prefs)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn set_preferences_multiple(entries: Value) -> Result<Value, String> {
    let mut prefs = read_json_file("preferences.json");
    if let (Some(obj), Some(entries_obj)) = (prefs.as_object_mut(), entries.as_object()) {
        for (k, v) in entries_obj {
            obj.insert(k.clone(), v.clone());
        }
    }
    write_json_file("preferences.json", &prefs)?;
    Ok(json!({ "success": true }))
}

// === Session ===

#[tauri::command]
pub async fn get_session_info() -> Result<Value, String> {
    let path = get_data_dir().join("session.json");
    if path.exists() {
        let meta = std::fs::metadata(&path).ok();
        let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let saved_at = meta.and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let session = read_json_file("session.json");
        let scan_count = session.get("scanCount").and_then(|v| v.as_u64()).unwrap_or(0);
        Ok(json!({ "exists": true, "savedAt": saved_at, "fileSize": file_size, "scanCount": scan_count }))
    } else {
        Ok(json!({ "exists": false, "savedAt": 0, "fileSize": 0, "scanCount": 0 }))
    }
}

#[tauri::command]
pub async fn save_session_now(ui_state: Option<Value>) -> Result<Value, String> {
    let mut session = read_json_file("session.json");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    if let Some(obj) = session.as_object_mut() {
        obj.insert("savedAt".to_string(), json!(now));
        if let Some(state) = ui_state {
            obj.insert("uiState".to_string(), state);
        }
        let count = obj.get("scanCount").and_then(|v| v.as_u64()).unwrap_or(0);
        obj.insert("scanCount".to_string(), json!(count + 1));
    }
    write_json_file("session.json", &session)?;
    Ok(json!({ "success": true, "savedAt": now }))
}

#[tauri::command]
pub async fn update_ui_state(ui_state: Option<Value>) -> Result<Value, String> {
    let mut session = read_json_file("session.json");
    if let Some(obj) = session.as_object_mut() {
        if let Some(state) = ui_state {
            obj.insert("uiState".to_string(), state);
        }
    }
    write_json_file("session.json", &session)?;
    Ok(json!({ "success": true }))
}

// === Folder Sizes ===

#[tauri::command]
pub async fn get_folder_sizes_bulk(scan_id: String, folder_paths: Vec<String>, parent_path: Option<String>) -> Result<Value, String> {
    tracing::debug!(scan_id = %scan_id, folder_count = folder_paths.len(), parent = ?parent_path, "get_folder_sizes_bulk aufgerufen");
    let flat = crate::scan::folder_sizes_bulk(&scan_id, &folder_paths);
    tracing::debug!(result_keys = ?flat.as_object().map(|o| o.len()), "folder_sizes_bulk Ergebnis");
    // Transform flat {path: size} into {folders: {path: {size}}, parent: {size}}
    let mut folders = serde_json::Map::new();
    if let Some(obj) = flat.as_object() {
        for (path, size) in obj {
            folders.insert(path.clone(), json!({"size": size}));
        }
    }
    let parent_size = parent_path
        .map(|pp| crate::scan::folder_sizes_bulk(&scan_id, &[pp]))
        .and_then(|v| v.as_object()?.values().next()?.as_u64())
        .unwrap_or(0);
    Ok(json!({
        "folders": folders,
        "parent": { "size": parent_size }
    }))
}

// === Screenshot ===

#[tauri::command]
pub async fn capture_screenshot(_app: tauri::AppHandle) -> Result<Value, String> {
    // Use PowerShell with System.Drawing to capture the screen
    let screenshots_dir = get_data_dir().join("screenshots");
    let _ = std::fs::create_dir_all(&screenshots_dir);
    let filename = format!("screenshot_{}.png", chrono::Local::now().format("%Y-%m-%d_%H-%M-%S"));
    let filepath = screenshots_dir.join(&filename);
    let filepath_escaped = filepath.to_string_lossy().replace("'", "''");

    let script = format!(r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('{path}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[PSCustomObject]@{{ success=$true; path='{path}'; width=$screen.Width; height=$screen.Height }} | ConvertTo-Json -Compress"#,
        path = filepath_escaped
    );

    match crate::ps::run_ps_json(&script).await {
        Ok(result) => Ok(result),
        Err(e) => Ok(json!({ "success": false, "error": format!("Screenshot fehlgeschlagen: {}", e) }))
    }
}

// === Frontend Logging ===

#[tauri::command]
pub async fn log_frontend(level: String, message: String, context: Option<String>) -> Result<Value, String> {
    let ctx = context.as_deref().unwrap_or("");
    match level.as_str() {
        "error" => tracing::error!(source = "frontend", context = %ctx, "{}", message),
        "warn" => tracing::warn!(source = "frontend", context = %ctx, "{}", message),
        "info" => tracing::info!(source = "frontend", context = %ctx, "{}", message),
        "debug" => tracing::debug!(source = "frontend", context = %ctx, "{}", message),
        _ => tracing::debug!(source = "frontend", context = %ctx, level = %level, "{}", message),
    }
    Ok(json!({ "success": true }))
}

// === Privacy Settings Database ===

fn build_privacy_settings(reg_vals: &Value) -> Value {
    let defs = vec![
        json!({"id":"werbung-id","category":"werbung","name":"Werbe-ID","description":"Ermöglicht personalisierte Werbung anhand einer eindeutigen Geräte-ID.","explanation":"Windows vergibt deinem Gerät eine eindeutige Nummer, mit der Werbetreibende dich wiedererkennen können.","riskExplanation":"Werbetreibende nutzen diese ID, um ein Profil über dich aufzubauen.","impacts":["Werbung in Apps wird weniger auf dich zugeschnitten"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo","registryKey":"Enabled","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"cortana-consent","category":"telemetrie","name":"Cortana","description":"Erlaubt Cortana, Sprach- und Suchdaten zu sammeln und zu verarbeiten.","explanation":"Cortana hört auf deine Sprachbefehle und merkt sich deine Suchanfragen.","riskExplanation":"Alles was du sagst oder suchst, wird an Microsoft-Server übertragen.","impacts":["Cortana-Sprachbefehle funktionieren nicht mehr","Suchvorschläge werden weniger personalisiert"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search","registryKey":"CortanaConsent","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"feedback-haeufigkeit","category":"telemetrie","name":"Feedback-Häufigkeit","description":"Bestimmt, wie oft Windows nach Feedback fragt.","explanation":"Windows fragt dich regelmäßig, ob du zufrieden bist.","riskExplanation":"Jede Feedback-Antwort enthält Informationen über dein System.","impacts":["Keine Feedback-Popups mehr von Windows"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules","registryKey":"NumberOfSIUFInPeriod","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"handschrift-daten","category":"diagnose","name":"Handschrift- und Eingabedaten","description":"Sammelt Tipp- und Handschriftmuster zur Verbesserung der Spracherkennung.","explanation":"Windows beobachtet, wie du tippst und schreibst.","riskExplanation":"Dein Tippverhalten ist wie ein Fingerabdruck.","impacts":["Wortvorschläge beim Tippen werden weniger präzise","Handschrifterkennung lernt nicht mehr dazu"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\InputPersonalization","registryKey":"RestrictImplicitTextCollection","recommendedValue":1,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"diagnose-toast","category":"diagnose","name":"Diagnose-Benachrichtigungen","description":"Steuert die Anzeige von Diagnose-Benachrichtigungen.","explanation":"Windows zeigt Benachrichtigungen über gesammelte Diagnosedaten an.","riskExplanation":"Die Benachrichtigungen selbst senden Telemetriedaten zurück.","impacts":["Keine Diagnose-Benachrichtigungen mehr"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack","registryKey":"ShowedToastAtLevel","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"app-diagnose","category":"diagnose","name":"App-Diagnosezugriff","description":"Erlaubt Apps den Zugriff auf Diagnoseinformationen anderer Apps.","explanation":"Installierte Apps können sehen, welche anderen Apps du nutzt.","riskExplanation":"Apps können sehen, welche Programme du nutzt, wie lange und wie oft.","impacts":["Apps können keine Informationen über andere Apps mehr abfragen"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics","registryKey":"Value","recommendedValue":"Deny","riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"standort-zugriff","category":"standort","name":"Standortzugriff","description":"Erlaubt Apps den Zugriff auf Ihren Standort.","explanation":"Apps können erkennen wo du dich gerade befindest.","riskExplanation":"Dein genauer Standort verrät wo du wohnst und arbeitest.","impacts":["Keine ortsbasierten Empfehlungen","Wetter-Apps zeigen kein lokales Wetter","Find My Device funktioniert nicht mehr"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location","registryKey":"Value","recommendedValue":"Deny","riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"telemetrie-policy","category":"telemetrie","name":"Telemetrie (Gruppenrichtlinie)","description":"Sendet Diagnose- und Nutzungsdaten an Microsoft. Richtlinienebene.","explanation":"Windows sendet regelmäßig Informationen über deine Nutzung.","riskExplanation":"Microsoft sammelt umfangreiche Daten über deine Nutzung.","impacts":["Windows kann weniger gezielte Updates liefern","Einige Kompatibilitätsprüfungen entfallen"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection","registryKey":"AllowTelemetry","recommendedValue":1,"riskLevel":"high","tier":"advanced","warning":"Auf Windows Pro/Home ist Level 0 nicht verfügbar. Empfohlen: Level 1."}),
        json!({"id":"telemetrie-datacollection","category":"telemetrie","name":"Telemetrie (Datensammlung)","description":"Steuert den Umfang der an Microsoft gesendeten Diagnosedaten.","explanation":"Wie die Gruppenrichtlinie, aber über einen anderen Registry-Pfad.","riskExplanation":"Ohne diese Einstellung sendet Windows auf Level 3 alles.","impacts":["Gleiche Auswirkungen wie Telemetrie-Gruppenrichtlinie"],"registryPath":"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection","registryKey":"AllowTelemetry","recommendedValue":1,"riskLevel":"high","tier":"advanced","warning":"Gleiche Risiken wie Telemetrie-Gruppenrichtlinie."}),
        json!({"id":"wifi-sense","category":"telemetrie","name":"WiFi Sense","description":"Automatische Verbindung mit vorgeschlagenen WLAN-Hotspots.","explanation":"Windows verbindet sich automatisch mit WLANs und teilt Passwörter.","riskExplanation":"Dein WLAN-Passwort wird an Microsoft-Server gesendet.","impacts":["Keine automatische Verbindung mit vorgeschlagenen Hotspots","WLAN-Passwörter werden nicht mehr geteilt"],"registryPath":"HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config","registryKey":"AutoConnectAllowedOEM","recommendedValue":0,"riskLevel":"moderate","tier":"advanced","warning":"Erfordert Administratorrechte."}),
        json!({"id":"aktivitaet-feed","category":"aktivitaet","name":"Aktivitätsverlauf","description":"Erfasst Ihre Aktivitäten (geöffnete Apps, Dateien, Webseiten).","explanation":"Windows merkt sich alles was du tust.","riskExplanation":"Windows protokolliert lückenlos jede geöffnete Datei und Webseite.","impacts":["Windows-Zeitachse wird leer","Geräteübergreifende Aufgaben funktionieren nicht mehr"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System","registryKey":"EnableActivityFeed","recommendedValue":0,"riskLevel":"high","tier":"advanced","warning":"Erfordert Administratorrechte. Deaktiviert die Windows-Zeitachse systemweit."}),
        json!({"id":"aktivitaet-publish","category":"aktivitaet","name":"Aktivitäten veröffentlichen","description":"Sendet Ihren Aktivitätsverlauf an Microsoft-Server.","explanation":"Dein Aktivitätsverlauf wird an Microsoft-Server gesendet.","riskExplanation":"Deine komplette PC-Aktivität wird an Microsoft übertragen.","impacts":["Aktivitäten werden nicht mehr synchronisiert"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System","registryKey":"PublishUserActivities","recommendedValue":0,"riskLevel":"high","tier":"advanced","warning":"Erfordert Administratorrechte."}),
    ];

    let mut settings = Vec::new();
    for def in &defs {
        let id = def["id"].as_str().unwrap_or("");
        let reg_value = &reg_vals[id];
        let recommended = &def["recommendedValue"];

        let is_private = if reg_value.is_null() {
            false
        } else {
            reg_value.to_string().trim_matches('"') == recommended.to_string().trim_matches('"')
        };

        let mut setting = def.clone();
        if let Some(obj) = setting.as_object_mut() {
            obj.insert("registryValue".to_string(), reg_value.clone());
            obj.insert("isPrivate".to_string(), json!(is_private));
        }
        settings.push(setting);
    }

    json!(settings)
}

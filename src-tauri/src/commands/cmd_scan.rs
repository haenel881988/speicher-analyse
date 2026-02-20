use serde_json::{json, Value};
use std::path::Path;
use std::collections::HashMap;
use tauri::Emitter;
use super::{get_data_dir, read_json_file, write_json_file};

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
        let mut current_path;

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

        // Auto-save scan snapshot for history (Issue #7)
        if let Some(snapshot) = crate::scan_history::create_snapshot(&sid) {
            match crate::scan_history::save_snapshot(&data_dir, snapshot) {
                Ok(_) => tracing::debug!(scan_id = %sid, "Scan-Snapshot für Verlauf gespeichert"),
                Err(e) => tracing::debug!(scan_id = %sid, error = %e, "Scan-Snapshot nicht gespeichert (evtl. zu früh nach letztem)"),
            }
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
pub async fn show_save_dialog(app: tauri::AppHandle, options: Option<Value>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let is_directory = options.as_ref()
        .and_then(|o| o.get("directory"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let title = options.as_ref()
        .and_then(|o| o.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let default_path = options.as_ref()
        .and_then(|o| o.get("defaultPath"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let filters: Vec<(String, Vec<String>)> = options.as_ref()
        .and_then(|o| o.get("filters"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|f| {
            let name = f.get("name")?.as_str()?.to_string();
            let exts: Vec<String> = f.get("extensions")?
                .as_array()?
                .iter()
                .filter_map(|e| e.as_str().map(|s| s.to_string()))
                .collect();
            Some((name, exts))
        }).collect())
        .unwrap_or_default();

    if is_directory {
        // Ordner-Auswahl-Dialog
        let (tx, rx) = std::sync::mpsc::channel();
        let mut builder = app.dialog().file();
        if !title.is_empty() {
            builder = builder.set_title(&title);
        }
        builder.pick_folder(move |path| {
            let _ = tx.send(path);
        });
        let path = tokio::task::spawn_blocking(move || {
            rx.recv().unwrap_or(None)
        }).await.unwrap_or(None);
        match path {
            Some(p) => Ok(json!({ "path": p.to_string() })),
            None => Ok(json!({ "canceled": true })),
        }
    } else {
        // Datei-Speichern-Dialog
        let (tx, rx) = std::sync::mpsc::channel();
        let mut builder = app.dialog().file();
        if !title.is_empty() {
            builder = builder.set_title(&title);
        }
        if !default_path.is_empty() {
            builder = builder.set_file_name(&default_path);
        }
        for (name, exts) in &filters {
            let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter(name, &ext_refs);
        }
        builder.save_file(move |path| {
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

static DEEP_SEARCH_PID: std::sync::LazyLock<std::sync::atomic::AtomicU32> = std::sync::LazyLock::new(|| std::sync::atomic::AtomicU32::new(0));

#[tauri::command]
pub async fn deep_search_start(app: tauri::AppHandle, root_path: String, query: String, use_regex: Option<bool>) -> Result<Value, String> {
    // Reset cancel state
    DEEP_SEARCH_PID.store(0, std::sync::atomic::Ordering::Relaxed);

    let app2 = app.clone();
    let is_regex = use_regex.unwrap_or(false);
    tokio::spawn(async move {
        let safe_query = query.replace("'", "''");
        let safe_path = root_path.replace("'", "''");
        let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
        let match_op = if is_regex { "-match" } else { "-like" };
        let match_pattern = if is_regex {
            format!("$q")  // Regex: use pattern directly
        } else {
            format!("\"*$q*\"")  // Wildcard: wrap in *...*
        };
        let exact_check = if is_regex {
            "$mq = if ($_.Name -match \"^$q$\") { 2.0 } else { 1.0 }".to_string()
        } else {
            "$mq = 1.0; if ($_.Name -eq $q) { $mq = 2.0 }".to_string()
        };
        let script = format!(
            r#"{utf8}$q = '{q}'; $count = 0; $dirs = 0
Get-ChildItem -Path '{p}' -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {{
    if ($_.PSIsContainer) {{ $dirs++ }}
    if ($_.Name {match_op} {match_pattern}) {{
        $count++
        $dirPath = Split-Path $_.FullName -Parent
        {exact_check}
        [PSCustomObject]@{{ path=$_.FullName; name=$_.Name; dirPath=$dirPath; isDir=$_.PSIsContainer; size=[long]$_.Length; modified=$_.LastWriteTime.ToString('o'); matchQuality=$mq }}
    }}
}} | Select-Object -First 500 | ConvertTo-Json -Compress"#,
            utf8 = utf8_prefix, q = safe_query, p = safe_path,
            match_op = match_op, match_pattern = match_pattern, exact_check = exact_check
        );

        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

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
                                    let results = if let Some(arr) = data.as_array() { arr.clone() } else { vec![data] };
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

// === Scan History (Issue #7) ===

#[tauri::command]
pub async fn save_scan_snapshot(scan_id: String) -> Result<Value, String> {
    let snapshot = crate::scan_history::create_snapshot(&scan_id)
        .ok_or("Keine Scan-Daten für Snapshot vorhanden")?;

    let data_dir = get_data_dir();
    crate::scan_history::save_snapshot(&data_dir, snapshot.clone())?;

    tracing::info!(snapshot_id = %snapshot.id, total_size = snapshot.total_size, "Scan-Snapshot gespeichert");
    Ok(serde_json::to_value(&snapshot).unwrap_or(json!({"success": true})))
}

#[tauri::command]
pub async fn get_scan_history() -> Result<Value, String> {
    let data_dir = get_data_dir();
    let history = crate::scan_history::load_history(&data_dir);
    Ok(serde_json::to_value(&history).unwrap_or(json!([])))
}

#[tauri::command]
pub async fn compare_scans(older_id: String, newer_id: String) -> Result<Value, String> {
    let data_dir = get_data_dir();
    let history = crate::scan_history::load_history(&data_dir);

    let older = history.iter().find(|s| s.id == older_id)
        .ok_or("Älterer Snapshot nicht gefunden")?;
    let newer = history.iter().find(|s| s.id == newer_id)
        .ok_or("Neuerer Snapshot nicht gefunden")?;

    let delta = crate::scan_history::compare_snapshots(older, newer);
    Ok(serde_json::to_value(&delta).unwrap_or(json!({})))
}

#[tauri::command]
pub async fn get_storage_trend(root_path: String) -> Result<Value, String> {
    let data_dir = get_data_dir();
    let history = crate::scan_history::load_history(&data_dir);
    Ok(crate::scan_history::compute_trend(&history, &root_path))
}

#[tauri::command]
pub async fn quick_change_check() -> Result<Value, String> {
    let data_dir = get_data_dir();
    Ok(crate::scan_history::quick_change_check(&data_dir))
}

#[tauri::command]
pub async fn delete_scan_snapshot(snapshot_id: String) -> Result<Value, String> {
    let data_dir = get_data_dir();
    let mut history = crate::scan_history::load_history(&data_dir);
    let before_len = history.len();
    history.retain(|s| s.id != snapshot_id);
    if history.len() == before_len {
        return Err("Snapshot nicht gefunden".to_string());
    }
    let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
    std::fs::write(data_dir.join("scan-history.json"), json)
        .map_err(|e| format!("scan-history.json schreiben: {}", e))?;
    Ok(json!({"deleted": true}))
}

#[tauri::command]
pub async fn clear_scan_history() -> Result<Value, String> {
    let data_dir = get_data_dir();
    let path = data_dir.join("scan-history.json");
    if path.exists() {
        std::fs::write(&path, "[]").map_err(|e| e.to_string())?;
    }
    Ok(json!({"cleared": true}))
}


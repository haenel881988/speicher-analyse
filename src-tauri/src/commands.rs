use serde_json::{json, Value};
use tauri::Emitter;
use std::path::Path;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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
    let blocked = ["\\windows\\system32", "\\windows\\syswow64"];
    for b in &blocked {
        if p_lower.contains(b) {
            return Err(format!("Zugriff auf Systempfad verweigert: {}", p));
        }
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
    eprintln!("[start_scan] Called with path: {}", path);
    let scan_id = format!("scan_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let sid = scan_id.clone();
    let scan_id_ret = scan_id.clone();

    // Use spawn_blocking for walkdir (blocking I/O)
    tokio::task::spawn_blocking(move || {
        eprintln!("[start_scan] Blocking thread started for scan_id={}", sid);
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
        eprintln!("[start_scan] Walk completed: {} files, {} dirs, {} errors, {:.1}s", files_found, dirs_scanned, errors_count, elapsed);

        // Store scan data for queries
        crate::scan::save(crate::scan::ScanData {
            scan_id: sid.clone(),
            root_path: path.clone(),
            files,
            dirs_scanned,
            total_size,
            elapsed_seconds: elapsed,
        });
        eprintln!("[start_scan] Scan data saved to store");

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
        eprintln!("[start_scan] scan-complete event emitted: {:?}", emit_result);
    });

    eprintln!("[start_scan] Returning scan_id: {}", scan_id_ret);
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
pub async fn export_csv(_scan_id: String) -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "Not implemented in Tauri yet" }))
}

#[tauri::command]
pub async fn show_save_dialog(_options: Option<Value>) -> Result<Value, String> {
    Ok(json!(null))
}

// === File Management ===

#[tauri::command]
pub async fn delete_to_trash(paths: Vec<String>) -> Result<Value, String> {
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
    let full = Path::new(&parent_path).join(&name);
    tokio::fs::create_dir_all(&full).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "path": full.to_string_lossy() }))
}

#[tauri::command]
pub async fn file_rename(old_path: String, new_name: String) -> Result<Value, String> {
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
pub async fn show_context_menu(_menu_type: String, _context: Option<Value>) -> Result<Value, String> {
    Ok(json!(null))
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

#[tauri::command]
pub async fn start_duplicate_scan(app: tauri::AppHandle, scan_id: String, _options: Option<Value>) -> Result<Value, String> {
    let _ = app.emit("duplicate-complete", json!({ "scanId": scan_id, "groups": [] }));
    Ok(json!({ "started": true }))
}

#[tauri::command]
pub async fn cancel_duplicate_scan(_scan_id: String) -> Result<Value, String> {
    Ok(json!({ "cancelled": true }))
}

#[tauri::command]
pub async fn get_size_duplicates(_scan_id: String, _min_size: Option<u64>) -> Result<Value, String> {
    Ok(json!({ "totalGroups": 0, "totalDuplicates": 0, "totalSaveable": 0, "totalFiles": 0, "groups": [] }))
}

// === Memory ===

#[tauri::command]
pub async fn release_scan_bulk_data(_scan_id: String) -> Result<Value, String> {
    Ok(json!({ "released": true }))
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
pub async fn export_registry_backup(_entries: Value) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Registry-Backup exportieren ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn clean_registry(_entries: Value) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Registry bereinigen ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn restore_registry_backup() -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "No backup found" }))
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
pub async fn toggle_autostart(_entry: Value, _enabled: bool) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Autostart-Eintrag umschalten ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn delete_autostart(_entry: Value) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Autostart-Eintrag löschen ist noch nicht implementiert" }))
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
    // Frontend sends 'auto'|'demand'|'disabled', PowerShell needs 'Automatic'|'Manual'|'Disabled'
    let ps_type = match start_type.as_str() {
        "auto" => "Automatic",
        "demand" => "Manual",
        "disabled" => "Disabled",
        other => other, // pass through if already correct format
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
    Ok(json!({ "stub": true, "message": "Optimierung anwenden ist noch nicht implementiert", "id": id }))
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

#[tauri::command]
pub async fn deep_search_start(app: tauri::AppHandle, root_path: String, query: String, _use_regex: Option<bool>) -> Result<Value, String> {
    let app2 = app.clone();
    tokio::spawn(async move {
        let script = format!(
            r#"$q = '{}'; $count = 0; $dirs = 0
Get-ChildItem -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {{
    if ($_.PSIsContainer) {{ $dirs++ }}
    if ($_.Name -like "*$q*") {{
        $count++
        $dirPath = Split-Path $_.FullName -Parent
        $mq = 1.0
        if ($_.Name -eq $q) {{ $mq = 2.0 }}
        [PSCustomObject]@{{ path=$_.FullName; name=$_.Name; dirPath=$dirPath; isDir=$_.PSIsContainer; size=[long]$_.Length; modified=$_.LastWriteTime.ToString('o'); matchQuality=$mq }}
    }}
}} | Select-Object -First 500 | ConvertTo-Json -Compress"#,
            query.replace("'", "''"), root_path.replace("'", "''")
        );
        match crate::ps::run_ps_json(&script).await {
            Ok(data) => {
                let results = if data.is_array() { data.as_array().unwrap().clone() } else if data.is_null() { vec![] } else { vec![data] };
                // Emit individual results for streaming
                for r in &results {
                    let _ = app2.emit("deep-search-result", r.clone());
                }
                let _ = app2.emit("deep-search-complete", json!({ "resultCount": results.len(), "dirsScanned": 0 }));
            }
            Err(e) => { let _ = app2.emit("deep-search-error", json!({ "error": e })); }
        }
    });
    Ok(json!({ "started": true }))
}

#[tauri::command]
pub async fn deep_search_cancel() -> Result<Value, String> {
    Ok(json!({ "cancelled": true }))
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
    Ok(json!({ "success": false, "error": "Admin elevation not yet implemented in Tauri" }))
}

#[tauri::command]
pub async fn get_restored_session() -> Result<Value, String> {
    Ok(json!(null))
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
    crate::ps::run_ps(&format!("Start-Process '{}'", url.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

// === File Tags ===

#[tauri::command]
pub async fn get_tag_colors() -> Result<Value, String> {
    Ok(json!(["#e74c3c","#e67e22","#f1c40f","#2ecc71","#3498db","#9b59b6","#1abc9c","#95a5a6"]))
}

#[tauri::command]
pub async fn set_file_tag(_file_path: String, _color: String, _note: Option<String>) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Datei-Tag setzen ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn remove_file_tag(_file_path: String) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Datei-Tag entfernen ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn get_file_tag(_file_path: String) -> Result<Value, String> {
    Ok(json!(null))
}

#[tauri::command]
pub async fn get_tags_for_directory(_dir_path: String) -> Result<Value, String> {
    Ok(json!({}))
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Value, String> {
    Ok(json!([]))
}

// === Shell Integration ===

#[tauri::command]
pub async fn register_shell_context_menu() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Shell-Kontextmenü registrieren ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn unregister_shell_context_menu() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Shell-Kontextmenü entfernen ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn is_shell_context_menu_registered() -> Result<Value, String> {
    Ok(json!(false))
}

// === Global Hotkey ===

#[tauri::command]
pub async fn set_global_hotkey(_accelerator: String) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Globaler Hotkey setzen ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn get_global_hotkey() -> Result<Value, String> {
    Ok(json!("Ctrl+Shift+S"))
}

// === Terminal (stubs — needs native PTY) ===

#[tauri::command]
pub async fn terminal_get_shells() -> Result<Value, String> {
    Ok(json!([{ "id": "powershell", "name": "PowerShell", "path": "powershell.exe" }]))
}

#[tauri::command]
pub async fn terminal_create(_cwd: Option<String>, _shell_type: Option<String>, _cols: Option<u32>, _rows: Option<u32>) -> Result<Value, String> {
    Ok(json!({ "id": "stub-terminal", "error": "Terminal not yet available in Tauri" }))
}

#[tauri::command]
pub async fn terminal_write(_id: String, _data: String) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

#[tauri::command]
pub async fn terminal_resize(_id: String, _cols: u32, _rows: u32) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

#[tauri::command]
pub async fn terminal_destroy(_id: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
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

#[tauri::command]
pub async fn apply_privacy_setting(id: String) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Datenschutz-Einstellung anwenden ist noch nicht implementiert", "id": id }))
}

#[tauri::command]
pub async fn apply_all_privacy() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Alle Datenschutz-Einstellungen anwenden ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn reset_privacy_setting(id: String) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Datenschutz-Einstellung zurücksetzen ist noch nicht implementiert", "id": id }))
}

#[tauri::command]
pub async fn reset_all_privacy() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Alle Datenschutz-Einstellungen zurücksetzen ist noch nicht implementiert" }))
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
    Ok(json!({ "enabled": false }))
}

#[tauri::command]
pub async fn fix_sideloading() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Sideloading-Fix ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn fix_sideloading_with_elevation() -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Sideloading-Fix mit Elevation ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn get_privacy_recommendations() -> Result<Value, String> {
    Ok(json!({ "recommendations": [], "programCount": 0 }))
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
pub async fn correlate_software(_program: Value) -> Result<Value, String> {
    Ok(json!({ "files": [], "registry": [], "services": [] }))
}

#[tauri::command]
pub async fn check_audit_updates() -> Result<Value, String> {
    Ok(json!([]))
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
pub async fn resolve_ips(_ip_addresses: Vec<String>) -> Result<Value, String> {
    Ok(json!({}))
}

/// Combined polling endpoint: returns summary + grouped + bandwidth in one call.
/// Matches the format expected by the frontend (network.js refresh()).
#[tauri::command]
pub async fn get_polling_data() -> Result<Value, String> {
    // Single PS call for TCP + UDP + Bandwidth (same approach as Electron backend)
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

    // Build all connections (TCP + UDP)
    let mut all_conns: Vec<Value> = tcp_arr.iter().map(|c| {
        let ra = c["ra"].as_str().unwrap_or("").to_string();
        let resolved = if is_private_ip(&ra) || ra.is_empty() {
            json!({"isLocal": true, "org": "Lokal", "isp": "", "isTracker": false, "isHighRisk": false, "countryCode": "", "country": ""})
        } else {
            json!({"isLocal": false, "org": "", "isp": "", "isTracker": false, "isHighRisk": false, "countryCode": "", "country": ""})
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

    let mut grouped: Vec<Value> = groups.iter().map(|(name, conns)| {
        let mut unique_ips: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut states: HashMap<String, usize> = HashMap::new();
        let pp = conns.first().and_then(|c| c["processPath"].as_str()).unwrap_or("").to_string();

        for c in conns {
            if let Some(ra) = c["remoteAddress"].as_str() {
                if !is_private_ip(ra) && !ra.is_empty() {
                    unique_ips.insert(ra.to_string());
                }
            }
            let st = c["state"].as_str().unwrap_or("Unknown");
            *states.entry(st.to_string()).or_insert(0) += 1;
        }

        json!({
            "processName": name,
            "processPath": pp,
            "connections": conns,
            "connectionCount": conns.len(),
            "uniqueRemoteIPs": unique_ips.len(),
            "uniqueIPCount": unique_ips.len(),
            "states": states,
            "resolvedCompanies": [],
            "hasTrackers": false,
            "hasHighRisk": false,
            "isRunning": true
        })
    }).collect();
    grouped.sort_by(|a, b| b["connectionCount"].as_u64().unwrap_or(0).cmp(&a["connectionCount"].as_u64().unwrap_or(0)));

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

#[tauri::command]
pub async fn start_network_recording() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn stop_network_recording() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_network_recording_status() -> Result<Value, String> {
    Ok(json!({ "active": false, "startedAt": 0, "duration": 0, "eventCount": 0 }))
}

#[tauri::command]
pub async fn append_network_recording_events(_events: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn list_network_recordings() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn delete_network_recording(_filename: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn open_network_recordings_dir() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn save_network_snapshot(_data: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_network_history() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn clear_network_history() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn export_network_history(_format: Option<String>) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

/// Parallel network scan using async pings + ARP table for MAC addresses
#[tauri::command]
pub async fn scan_local_network() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
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
[void][System.Threading.Tasks.Task]::WaitAll(@($tasks | ForEach-Object { $_.task }))
$results = @()
foreach ($t in $tasks) {
    if ($t.task.Result.Status -eq 'Success') {
        $ip = $t.ip
        $mac = $arp[$ip]
        $hostname = ''
        try { $hostname = [System.Net.Dns]::GetHostEntry($ip).HostName } catch {}
        $results += [PSCustomObject]@{ ip=$ip; mac=$mac; hostname=$hostname; online=$true; responseTime=$t.task.Result.RoundtripTime; vendor=''; deviceType='unknown' }
    }
}
$results | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn scan_network_active() -> Result<Value, String> {
    // Same parallel approach as scan_local_network
    scan_local_network().await
}

#[tauri::command]
pub async fn get_last_network_scan() -> Result<Value, String> {
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
    $open = $t.task.IsCompleted -and -not $t.task.IsFaulted
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
    Ok(json!({ "stub": true, "message": "OUI-Datenbank aktualisieren ist noch nicht implementiert" }))
}

// === System Info ===

#[tauri::command]
pub async fn get_system_info() -> Result<Value, String> {
    get_system_profile().await
}

// === Security Audit ===

#[tauri::command]
pub async fn run_security_audit() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$checks = @()
$fw = (Get-NetFirewallProfile -ErrorAction SilentlyContinue | Where-Object { $_.Enabled }).Count
$checks += [PSCustomObject]@{ id='firewall'; name='Firewall'; status=if($fw -ge 3){'ok'}else{'warning'}; detail="$fw/3 Profile aktiv" }
$uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue).EnableLUA
$checks += [PSCustomObject]@{ id='uac'; name='UAC'; status=if($uac -eq 1){'ok'}else{'critical'}; detail=if($uac -eq 1){'Aktiviert'}else{'Deaktiviert'} }
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
$checks += [PSCustomObject]@{ id='antivirus'; name='Antivirus'; status=if($av){'ok'}else{'critical'}; detail=if($av){$av[0].displayName}else{'Nicht gefunden'} }
$checks | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_audit_history() -> Result<Value, String> {
    Ok(json!([]))
}

// === System Score ===

#[tauri::command]
pub async fn get_system_score(_results: Option<Value>) -> Result<Value, String> {
    Ok(json!({
        "score": 75,
        "grade": "C",
        "riskLevel": "moderate",
        "categories": [
            {"name": "Datenschutz", "weight": 25, "score": 70, "description": "Windows-Datenschutzeinstellungen"},
            {"name": "Festplatten", "weight": 20, "score": 80, "description": "Festplatten-Gesundheit und Speicherplatz"},
            {"name": "Registry", "weight": 15, "score": 75, "description": "Registry-Sauberkeit"},
            {"name": "Optimierung", "weight": 15, "score": 70, "description": "Systemoptimierungen"},
            {"name": "Updates", "weight": 15, "score": 80, "description": "Windows- und Software-Updates"},
            {"name": "Software", "weight": 10, "score": 75, "description": "Software-Inventar und Bloatware"}
        ]
    }))
}

// === Preferences ===

#[tauri::command]
pub async fn get_preferences() -> Result<Value, String> {
    Ok(json!({
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
    }))
}

#[tauri::command]
pub async fn set_preference(_key: String, _value: Value) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Einstellungen speichern ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn set_preferences_multiple(_entries: Value) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Einstellungen speichern ist noch nicht implementiert" }))
}

// === Session ===

#[tauri::command]
pub async fn get_session_info() -> Result<Value, String> {
    Ok(json!({ "exists": false, "savedAt": 0, "fileSize": 0, "scanCount": 0 }))
}

#[tauri::command]
pub async fn save_session_now(_ui_state: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Sitzung speichern ist noch nicht implementiert" }))
}

#[tauri::command]
pub async fn update_ui_state(_ui_state: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "UI-Zustand speichern ist noch nicht implementiert" }))
}

// === Folder Sizes ===

#[tauri::command]
pub async fn get_folder_sizes_bulk(scan_id: String, folder_paths: Vec<String>, _parent_path: Option<String>) -> Result<Value, String> {
    Ok(crate::scan::folder_sizes_bulk(&scan_id, &folder_paths))
}

// === Screenshot ===

#[tauri::command]
pub async fn capture_screenshot() -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "Screenshots not available in Tauri" }))
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

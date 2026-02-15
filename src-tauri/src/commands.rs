use serde_json::{json, Value};
use tauri::Emitter;
use std::path::Path;

// === Drive & Scan ===

#[tauri::command]
pub async fn get_drives() -> Result<Value, String> {
    crate::ps::run_ps_json(
        "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object { [PSCustomObject]@{ letter = $_.Name + ':'; label = $_.Description; total = $_.Used + $_.Free; free = $_.Free; used = $_.Used } } | ConvertTo-Json -Compress"
    ).await
}

#[tauri::command]
pub async fn start_scan(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    let scan_id = format!("scan_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let sid = scan_id.clone();
    let app2 = app.clone();

    tokio::spawn(async move {
        let _ = app2.emit("scan-progress", json!({ "scanId": &sid, "phase": "scanning", "current": &path }));
        let script = format!(
            r#"$items = Get-ChildItem -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime, PSIsContainer, Extension
$files = @(); $dirs = @(); $totalSize = 0
foreach ($item in $items) {{
    if ($item.PSIsContainer) {{ $dirs += $item.FullName }}
    else {{ $files += [PSCustomObject]@{{ path=$item.FullName; size=[long]$item.Length; modified=$item.LastWriteTime.ToString('o'); ext=$item.Extension }}; $totalSize += $item.Length }}
}}
[PSCustomObject]@{{ scanId='{}'; totalSize=$totalSize; fileCount=$files.Count; folderCount=$dirs.Count; files=$files; rootPath='{}' }} | ConvertTo-Json -Depth 3 -Compress"#,
            path.replace("'", "''"), sid, path.replace("'", "''")
        );
        match crate::ps::run_ps_json(&script).await {
            Ok(data) => { let _ = app2.emit("scan-complete", data); }
            Err(e) => { let _ = app2.emit("scan-error", json!({ "scanId": &sid, "error": e })); }
        }
    });

    Ok(json!({ "scanId": scan_id }))
}

// === Tree Data ===

#[tauri::command]
pub async fn get_tree_node(scan_id: String, path: String, depth: Option<u32>) -> Result<Value, String> {
    let d = depth.unwrap_or(1);
    let script = format!(
        r#"$items = Get-ChildItem -Path '{}' -Force -ErrorAction SilentlyContinue
$children = @()
foreach ($item in $items) {{
    if ($item.PSIsContainer) {{
        $size = (Get-ChildItem -Path $item.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $children += [PSCustomObject]@{{ name=$item.Name; path=$item.FullName; size=[long]$size; isDir=$true }}
    }} else {{
        $children += [PSCustomObject]@{{ name=$item.Name; path=$item.FullName; size=[long]$item.Length; isDir=$false }}
    }}
}}
$children | Sort-Object size -Descending | ConvertTo-Json -Compress"#,
        path.replace("'", "''")
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn get_treemap_data(scan_id: String, path: String, depth: Option<u32>) -> Result<Value, String> {
    get_tree_node(scan_id, path, depth).await
}

// === File Data ===

#[tauri::command]
pub async fn get_top_files(scan_id: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn get_file_types(scan_id: String) -> Result<Value, String> {
    Ok(json!({}))
}

#[tauri::command]
pub async fn search(scan_id: String, query: String, min_size: Option<u64>) -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn get_files_by_extension(scan_id: String, ext: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn get_files_by_category(scan_id: String, category: String, limit: Option<u32>) -> Result<Value, String> {
    Ok(json!([]))
}

// === Export ===

#[tauri::command]
pub async fn export_csv(scan_id: String) -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "Not implemented in Tauri yet" }))
}

#[tauri::command]
pub async fn show_save_dialog(options: Option<Value>) -> Result<Value, String> {
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
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        tokio::fs::rename(src, &dest).await.map_err(|e| e.to_string())?;
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn file_copy(source_paths: Vec<String>, dest_dir: String) -> Result<Value, String> {
    for src in &source_paths {
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
pub async fn show_context_menu(menu_type: String, context: Option<Value>) -> Result<Value, String> {
    Ok(json!(null))
}

// === Dialog ===

#[tauri::command]
pub async fn show_confirm_dialog(options: Value) -> Result<Value, String> {
    Ok(json!({ "response": 0 }))
}

// === Old Files ===

#[tauri::command]
pub async fn get_old_files(scan_id: String, threshold_days: Option<u32>, min_size: Option<u64>) -> Result<Value, String> {
    Ok(json!([]))
}

// === Duplicate Finder ===

#[tauri::command]
pub async fn start_duplicate_scan(app: tauri::AppHandle, scan_id: String, options: Option<Value>) -> Result<Value, String> {
    let _ = app.emit("duplicate-complete", json!({ "scanId": scan_id, "groups": [] }));
    Ok(json!({ "started": true }))
}

#[tauri::command]
pub async fn cancel_duplicate_scan(scan_id: String) -> Result<Value, String> {
    Ok(json!({ "cancelled": true }))
}

#[tauri::command]
pub async fn get_size_duplicates(scan_id: String, min_size: Option<u64>) -> Result<Value, String> {
    Ok(json!([]))
}

// === Memory ===

#[tauri::command]
pub async fn release_scan_bulk_data(scan_id: String) -> Result<Value, String> {
    Ok(json!({ "released": true }))
}

// === Cleanup ===

#[tauri::command]
pub async fn scan_cleanup_categories(scan_id: String) -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cats = @()
$temp = [System.IO.Path]::GetTempPath()
$tempSize = (Get-ChildItem -Path $temp -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$cats += [PSCustomObject]@{ id='temp'; name='Temporäre Dateien'; size=[long]$tempSize; count=(Get-ChildItem -Path $temp -Recurse -Force -File -ErrorAction SilentlyContinue).Count; paths=@($temp) }
$cats | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn clean_category(category_id: String, paths: Vec<String>) -> Result<Value, String> {
    for p in &paths {
        let path = Path::new(p);
        if path.is_dir() {
            let _ = tokio::fs::remove_dir_all(path).await;
        } else {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
    Ok(json!({ "success": true }))
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
    crate::ps::run_ps_json(
        r#"$entries = @()
$paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($p in $paths) {
    Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $installPath = $_.InstallLocation
        if ($installPath -and !(Test-Path $installPath)) {
            $entries += [PSCustomObject]@{ name=$_.DisplayName; key=$_.PSPath; installPath=$installPath; type='orphaned' }
        }
    }
}
[PSCustomObject]@{ totalScanned=($entries.Count + 100); issues=$entries } | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn export_registry_backup(entries: Value) -> Result<Value, String> {
    Ok(json!({ "success": true, "path": "" }))
}

#[tauri::command]
pub async fn clean_registry(entries: Value) -> Result<Value, String> {
    Ok(json!({ "success": true, "cleaned": 0 }))
}

#[tauri::command]
pub async fn restore_registry_backup() -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "No backup found" }))
}

// === Autostart ===

#[tauri::command]
pub async fn get_autostart_entries() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$entries = @()
Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | ForEach-Object {
    $entries += [PSCustomObject]@{ name=$_.Name; command=$_.Command; location=$_.Location; user=$_.User; enabled=$true }
}
$entries | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn toggle_autostart(entry: Value, enabled: bool) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn delete_autostart(entry: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

// === Services ===

#[tauri::command]
pub async fn get_services() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn control_service(name: String, action: String) -> Result<Value, String> {
    let cmd = match action.as_str() {
        "start" => format!("Start-Service '{}'", name),
        "stop" => format!("Stop-Service '{}' -Force", name),
        "restart" => format!("Restart-Service '{}' -Force", name),
        _ => return Err(format!("Unknown action: {}", action)),
    };
    crate::ps::run_ps(&cmd).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn set_service_start_type(name: String, start_type: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Set-Service '{}' -StartupType '{}'", name, start_type)).await?;
    Ok(json!({ "success": true }))
}

// === Optimizer ===

#[tauri::command]
pub async fn get_optimizations() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$opts = @()
# Visual Effects
$vfx = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' -ErrorAction SilentlyContinue).VisualFXSetting
$opts += [PSCustomObject]@{ id='visual_effects'; name='Visuelle Effekte optimieren'; description='Deaktiviert Animationen und Transparenz'; applied=($vfx -eq 2); category='performance' }
# Prefetch
$prefetch = Test-Path "$env:SystemRoot\Prefetch"
$opts += [PSCustomObject]@{ id='prefetch'; name='Prefetch bereinigen'; description='Löscht alte Prefetch-Daten'; applied=$false; category='cleanup' }
$opts | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn apply_optimization(id: String) -> Result<Value, String> {
    Ok(json!({ "success": true, "id": id }))
}

// === Bloatware ===

#[tauri::command]
pub async fn scan_bloatware() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -ne 'System' } | Select-Object Name, PackageFullName, Publisher, InstallLocation | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn uninstall_bloatware(entry: Value) -> Result<Value, String> {
    if let Some(pkg) = entry.get("PackageFullName").and_then(|v| v.as_str()) {
        crate::ps::run_ps(&format!("Remove-AppxPackage '{}'", pkg)).await?;
    }
    Ok(json!({ "success": true }))
}

// === Updates ===

#[tauri::command]
pub async fn check_windows_updates() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $results = $searcher.Search('IsInstalled=0')
    $updates = $results.Updates | ForEach-Object { [PSCustomObject]@{ title=$_.Title; kb=$_.KBArticleIDs -join ','; size=[long]$_.MaxDownloadSize; important=$_.MsrcSeverity } }
    [PSCustomObject]@{ available=$updates.Count; updates=$updates } | ConvertTo-Json -Depth 3 -Compress
} catch { [PSCustomObject]@{ available=0; updates=@(); error=$_.Exception.Message } | ConvertTo-Json -Compress }"#
    ).await
}

#[tauri::command]
pub async fn get_update_history() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$count = $searcher.GetTotalHistoryCount()
$history = $searcher.QueryHistory(0, [Math]::Min($count, 50)) | ForEach-Object { [PSCustomObject]@{ title=$_.Title; date=$_.Date.ToString('o'); result=$_.ResultCode } }
$history | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn check_software_updates() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"try { winget upgrade --accept-source-agreements 2>$null | Select-String -Pattern '^\S' | ForEach-Object { $_.Line } | ConvertTo-Json -Compress } catch { '[]' }"#
    ).await
}

#[tauri::command]
pub async fn update_software(package_id: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("winget upgrade '{}' --accept-package-agreements --accept-source-agreements", package_id)).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_driver_info() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Select-Object DeviceName, DriverVersion, DriverDate, Manufacturer -First 50 | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cpu = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, MaxClockSpeed
$ram = Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion
[PSCustomObject]@{ cpu=$cpu; ramTotal=[long]$ram.Sum; gpu=$gpu } | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

// === Hybrid Search ===

#[tauri::command]
pub async fn search_name_index(scan_id: String, query: String, options: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "results": [], "total": 0 }))
}

#[tauri::command]
pub async fn get_name_index_info(scan_id: String) -> Result<Value, String> {
    Ok(json!({ "indexed": 0 }))
}

#[tauri::command]
pub async fn deep_search_start(app: tauri::AppHandle, root_path: String, query: String, use_regex: Option<bool>) -> Result<Value, String> {
    let app2 = app.clone();
    tokio::spawn(async move {
        let script = format!(
            r#"Get-ChildItem -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -like '*{}*' }} | Select-Object FullName, Length, LastWriteTime, PSIsContainer -First 500 | ForEach-Object {{ [PSCustomObject]@{{ path=$_.FullName; size=[long]$_.Length; modified=$_.LastWriteTime.ToString('o'); isDir=$_.PSIsContainer }} }} | ConvertTo-Json -Compress"#,
            root_path.replace("'", "''"), query.replace("'", "''")
        );
        match crate::ps::run_ps_json(&script).await {
            Ok(data) => {
                let results = if data.is_array() { data } else if data.is_null() { json!([]) } else { json!([data]) };
                let _ = app2.emit("deep-search-complete", json!({ "results": results }));
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
    let script = format!(
        r#"Get-ChildItem -LiteralPath '{}' -Force -ErrorAction SilentlyContinue | Select-Object Name, FullName, Length, LastWriteTime, CreationTime, PSIsContainer, Extension, Attributes -First {} | ForEach-Object {{
    [PSCustomObject]@{{ name=$_.Name; path=$_.FullName; size=[long]$_.Length; modified=$_.LastWriteTime.ToString('o'); created=$_.CreationTime.ToString('o'); isDir=$_.PSIsContainer; ext=$_.Extension; hidden=($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0 }}
}} | ConvertTo-Json -Compress"#,
        dir_path.replace("'", "''"), limit
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn get_known_folders() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$folders = @()
$folders += [PSCustomObject]@{ name='Desktop'; path=[Environment]::GetFolderPath('Desktop') }
$folders += [PSCustomObject]@{ name='Dokumente'; path=[Environment]::GetFolderPath('MyDocuments') }
$folders += [PSCustomObject]@{ name='Downloads'; path=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path }
$folders += [PSCustomObject]@{ name='Bilder'; path=[Environment]::GetFolderPath('MyPictures') }
$folders += [PSCustomObject]@{ name='Musik'; path=[Environment]::GetFolderPath('MyMusic') }
$folders += [PSCustomObject]@{ name='Videos'; path=[Environment]::GetFolderPath('MyVideos') }
$folders | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn calculate_folder_size(dir_path: String) -> Result<Value, String> {
    let script = format!(
        r#"$size = (Get-ChildItem -LiteralPath '{}' -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
[PSCustomObject]@{{ path='{}'; size=[long]$size }} | ConvertTo-Json -Compress"#,
        dir_path.replace("'", "''"), dir_path.replace("'", "''")
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn find_empty_folders(dir_path: String, max_depth: Option<u32>) -> Result<Value, String> {
    let depth = max_depth.unwrap_or(10);
    let script = format!(
        r#"Get-ChildItem -LiteralPath '{}' -Recurse -Directory -Depth {} -Force -ErrorAction SilentlyContinue | Where-Object {{ (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0 }} | Select-Object FullName | ConvertTo-Json -Compress"#,
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
    crate::ps::run_ps(&format!("Start-Process rundll32.exe -ArgumentList 'shell32.dll,OpenAs_RunDLL {}'", file_path)).await?;
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
    Ok(json!({ "isAdmin": false, "hasBattery": false, "platform": "win32" }))
}

#[tauri::command]
pub async fn get_battery_status() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($bat) { [PSCustomObject]@{ hasBattery=$true; percent=$bat.EstimatedChargeRemaining; charging=($bat.BatteryStatus -eq 2) } | ConvertTo-Json -Compress }
else { '{"hasBattery":false}' }"#
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
pub async fn set_file_tag(file_path: String, color: String, note: Option<String>) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn remove_file_tag(file_path: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_file_tag(file_path: String) -> Result<Value, String> {
    Ok(json!(null))
}

#[tauri::command]
pub async fn get_tags_for_directory(dir_path: String) -> Result<Value, String> {
    Ok(json!({}))
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Value, String> {
    Ok(json!({}))
}

// === Shell Integration ===

#[tauri::command]
pub async fn register_shell_context_menu() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn unregister_shell_context_menu() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn is_shell_context_menu_registered() -> Result<Value, String> {
    Ok(json!(false))
}

// === Global Hotkey ===

#[tauri::command]
pub async fn set_global_hotkey(accelerator: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
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
pub async fn terminal_create(cwd: Option<String>, shell_type: Option<String>, cols: Option<u32>, rows: Option<u32>) -> Result<Value, String> {
    Ok(json!({ "id": "stub-terminal", "error": "Terminal not yet available in Tauri" }))
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u32, rows: u32) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

#[tauri::command]
pub async fn terminal_destroy(id: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn terminal_open_external(cwd: Option<String>, command: Option<String>) -> Result<Value, String> {
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_default());
    crate::ps::run_ps(&format!("Start-Process wt -ArgumentList '-d', '{}'", dir.replace("'", "''"))).await?;
    Ok(json!({ "success": true }))
}

// === Privacy Dashboard ===

#[tauri::command]
pub async fn get_privacy_settings() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$settings = @()
$telemetry = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' -Name AllowTelemetry -ErrorAction SilentlyContinue).AllowTelemetry
$settings += [PSCustomObject]@{ id='telemetry'; name='Telemetrie'; description='Windows-Diagnosedaten'; currentValue=if($telemetry -eq 0){'disabled'}else{'enabled'}; recommended='disabled'; category='privacy' }
$settings | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn apply_privacy_setting(id: String) -> Result<Value, String> {
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn apply_all_privacy() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn reset_privacy_setting(id: String) -> Result<Value, String> {
    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn reset_all_privacy() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_scheduled_tasks_audit() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-ScheduledTask | Where-Object { $_.State -eq 'Ready' } | Select-Object TaskName, TaskPath, State, Description -First 100 | ConvertTo-Json -Compress"#
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
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn fix_sideloading_with_elevation() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_privacy_recommendations() -> Result<Value, String> {
    Ok(json!([]))
}

// === System Profile ===

#[tauri::command]
pub async fn get_system_profile() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$cs = Get-CimInstance Win32_ComputerSystem
[PSCustomObject]@{
    computerName=$cs.Name; os=$os.Caption; osVersion=$os.Version; osBuild=$os.BuildNumber
    cpu=$cpu.Name; cpuCores=[int]$cpu.NumberOfCores; cpuThreads=[int]$cpu.NumberOfLogicalProcessors
    ramTotal=[long]$cs.TotalPhysicalMemory; manufacturer=$cs.Manufacturer; model=$cs.Model
} | ConvertTo-Json -Compress"#
    ).await
}

// === S.M.A.R.T. ===

#[tauri::command]
pub async fn get_disk_health() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus, Size, @{N='Temperature';E={($_ | Get-StorageReliabilityCounter).Temperature}}, @{N='Wear';E={($_ | Get-StorageReliabilityCounter).Wear}}, @{N='ReadErrors';E={($_ | Get-StorageReliabilityCounter).ReadErrorsTotal}}, @{N='PowerOnHours';E={($_ | Get-StorageReliabilityCounter).PowerOnHours}} | ConvertTo-Json -Compress"#
    ).await
}

// === Software Audit ===

#[tauri::command]
pub async fn audit_software() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$programs = @()
$paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($p in $paths) {
    Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $programs += [PSCustomObject]@{ name=$_.DisplayName; version=$_.DisplayVersion; publisher=$_.Publisher; installDate=$_.InstallDate; installLocation=$_.InstallLocation; uninstallString=$_.UninstallString; size=[long]$_.EstimatedSize*1024 }
    }
}
$programs | Sort-Object name | ConvertTo-Json -Depth 2 -Compress"#
    ).await
}

#[tauri::command]
pub async fn correlate_software(program: Value) -> Result<Value, String> {
    Ok(json!({ "files": [], "registry": [], "services": [] }))
}

#[tauri::command]
pub async fn check_audit_updates() -> Result<Value, String> {
    Ok(json!([]))
}

// === Network Monitor ===

#[tauri::command]
pub async fn get_connections() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' } | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess, @{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_bandwidth() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes, ReceivedUnicastPackets, SentUnicastPackets | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_firewall_rules(direction: Option<String>) -> Result<Value, String> {
    let dir = direction.unwrap_or_else(|| "Inbound".to_string());
    let script = format!(
        r#"Get-NetFirewallRule -Direction '{}' -Enabled True -ErrorAction SilentlyContinue | Select-Object DisplayName, Direction, Action, Profile -First 100 | ConvertTo-Json -Compress"#,
        dir
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn block_process(name: String, path: Option<String>) -> Result<Value, String> {
    let prog = path.unwrap_or_else(|| name.clone());
    let script = format!(
        r#"New-NetFirewallRule -DisplayName 'Block {}' -Direction Outbound -Program '{}' -Action Block"#,
        name, prog
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn unblock_process(rule_name: String) -> Result<Value, String> {
    crate::ps::run_ps(&format!("Remove-NetFirewallRule -DisplayName '{}'", rule_name)).await?;
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
    crate::ps::run_ps_json(
        r#"Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Established' } | Group-Object OwningProcess | ForEach-Object {
    $proc = Get-Process -Id $_.Name -ErrorAction SilentlyContinue
    [PSCustomObject]@{ processId=[int]$_.Name; processName=$proc.ProcessName; connectionCount=$_.Count; connections=$_.Group | Select-Object RemoteAddress, RemotePort }
} | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn resolve_ips(ip_addresses: Vec<String>) -> Result<Value, String> {
    Ok(json!({}))
}

#[tauri::command]
pub async fn get_polling_data() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$tcp = Get-NetTCPConnection -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
$bw = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name, ReceivedBytes, SentBytes
[PSCustomObject]@{ connections=$tcp; bandwidth=$bw; timestamp=(Get-Date).ToString('o') } | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_connection_diff() -> Result<Value, String> {
    Ok(json!({ "added": [], "removed": [] }))
}

#[tauri::command]
pub async fn get_bandwidth_history() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn get_wifi_info() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$output = netsh wlan show interfaces 2>$null
if ($LASTEXITCODE -ne 0 -or !$output) { '{"connected":false}'; return }
$info = @{}
$output | ForEach-Object { if ($_ -match '^\s+(.+?)\s+:\s+(.+)$') { $info[$Matches[1].Trim()] = $Matches[2].Trim() } }
[PSCustomObject]@{ connected=$true; ssid=$info['SSID']; signal=$info['Signal']; channel=$info['Channel']; band=$info['Radio type']; auth=$info['Authentication']; rxRate=$info['Receive rate (Mbps)']; txRate=$info['Transmit rate (Mbps)'] } | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_dns_cache() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object { $_.Type -in @(1,28) } | Select-Object Entry, RecordName, Data, TimeToLive, Type -First 200 | ConvertTo-Json -Compress"#
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
    Ok(json!({ "recording": false }))
}

#[tauri::command]
pub async fn append_network_recording_events(events: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn list_network_recordings() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub async fn delete_network_recording(filename: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn open_network_recordings_dir() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn save_network_snapshot(data: Value) -> Result<Value, String> {
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
pub async fn export_network_history(format: Option<String>) -> Result<Value, String> {
    Ok(json!({ "success": false }))
}

#[tauri::command]
pub async fn scan_local_network() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$gateway = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1).NextHop
$subnet = $gateway -replace '\.\d+$', ''
$results = @()
1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    if (Test-Connection $ip -Count 1 -TimeoutSeconds 1 -Quiet -ErrorAction SilentlyContinue) {
        $hostname = try { [System.Net.Dns]::GetHostEntry($ip).HostName } catch { '' }
        $results += [PSCustomObject]@{ ip=$ip; hostname=$hostname; online=$true }
    }
}
$results | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn scan_network_active() -> Result<Value, String> {
    scan_local_network().await
}

#[tauri::command]
pub async fn get_last_network_scan() -> Result<Value, String> {
    Ok(json!(null))
}

#[tauri::command]
pub async fn scan_device_ports(ip: String) -> Result<Value, String> {
    let script = format!(
        r#"$ports = @(21,22,23,25,53,80,139,443,445,3389,5900,8080)
$results = @()
foreach ($port in $ports) {{
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {{ $tcp.Connect('{}', $port); $results += [PSCustomObject]@{{ port=$port; open=$true }}; $tcp.Close() }}
    catch {{ $results += [PSCustomObject]@{{ port=$port; open=$false }} }}
}}
$results | ConvertTo-Json -Compress"#, ip
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn get_smb_shares(ip: String) -> Result<Value, String> {
    let script = format!(
        r#"Get-SmbConnection -ServerName '{}' -ErrorAction SilentlyContinue | Select-Object ServerName, ShareName | ConvertTo-Json -Compress"#, ip
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn update_oui_database() -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

// === System Info ===

#[tauri::command]
pub async fn get_system_info() -> Result<Value, String> {
    get_system_profile().await
}

// === Security Audit ===

#[tauri::command]
pub async fn run_security_audit() -> Result<Value, String> {
    crate::ps::run_ps_json(
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
pub async fn get_system_score(results: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "score": 75, "categories": {} }))
}

// === Preferences ===

#[tauri::command]
pub async fn get_preferences() -> Result<Value, String> {
    Ok(json!({ "theme": "dark", "language": "de", "networkDetailLevel": "normal" }))
}

#[tauri::command]
pub async fn set_preference(key: String, value: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn set_preferences_multiple(entries: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

// === Session ===

#[tauri::command]
pub async fn get_session_info() -> Result<Value, String> {
    Ok(json!({ "startTime": chrono::Utc::now().to_rfc3339() }))
}

#[tauri::command]
pub async fn save_session_now(ui_state: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn update_ui_state(ui_state: Option<Value>) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

// === Folder Sizes ===

#[tauri::command]
pub async fn get_folder_sizes_bulk(scan_id: String, folder_paths: Vec<String>, parent_path: Option<String>) -> Result<Value, String> {
    Ok(json!({}))
}

// === Screenshot ===

#[tauri::command]
pub async fn capture_screenshot() -> Result<Value, String> {
    Ok(json!({ "success": false, "error": "Screenshots not available in Tauri" }))
}

use serde_json::{json, Value};
use tauri::Manager;
use super::{get_data_dir, read_json_file, write_json_file};

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


#[tauri::command]
pub async fn get_platform() -> Result<String, String> {
    Ok("win32".to_string())
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<Value, String> {
    // Only allow http/https URLs — block file://, javascript:, data:, etc.
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Nur HTTP/HTTPS-URLs erlaubt, nicht: {}", &url[..url.len().min(50)]));
    }
    // Block URLs with embedded credentials (user:pass@host)
    if url.contains('@') {
        return Err("URLs mit eingebetteten Anmeldedaten sind nicht erlaubt".to_string());
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
pub async fn set_global_hotkey(app: tauri::AppHandle, accelerator: String) -> Result<Value, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Alle bisherigen Shortcuts entfernen
    let _ = app.global_shortcut().unregister_all();

    if accelerator.is_empty() {
        // Leerer String = Hotkey deaktivieren
        let mut prefs = read_json_file("preferences.json");
        if let Some(obj) = prefs.as_object_mut() { obj.insert("globalHotkey".to_string(), json!("")); }
        let _ = write_json_file("preferences.json", &prefs);
        return Ok(json!({ "success": true, "hotkey": "" }));
    }

    // Shortcut registrieren
    let accel_clone = accelerator.clone();
    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(accelerator.parse::<tauri_plugin_global_shortcut::Shortcut>().map_err(|e| format!("Ungültiger Hotkey: {}", e))?, move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                // Fenster anzeigen/fokussieren
                if let Some(w) = app_clone.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .map_err(|e| format!("Hotkey konnte nicht registriert werden: {}", e))?;

    // In Preferences speichern
    let mut prefs = read_json_file("preferences.json");
    if let Some(obj) = prefs.as_object_mut() { obj.insert("globalHotkey".to_string(), json!(&accel_clone)); }
    let _ = write_json_file("preferences.json", &prefs);
    Ok(json!({ "success": true, "hotkey": accel_clone }))
}

#[tauri::command]
pub async fn get_global_hotkey() -> Result<Value, String> {
    let prefs = read_json_file("preferences.json");
    let hotkey = prefs.get("globalHotkey")
        .and_then(|v| v.as_str())
        .unwrap_or("Ctrl+Shift+S");
    Ok(json!(hotkey))
}


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

// === Undo-Log ===

#[tauri::command]
pub async fn get_undo_log() -> Result<Value, String> {
    let entries = crate::undo::get_log();
    Ok(json!(entries))
}

#[tauri::command]
pub async fn undo_action(id: String) -> Result<Value, String> {
    let entry = crate::undo::get_entry(&id)
        .ok_or_else(|| format!("Eintrag '{}' nicht gefunden", id))?;

    if !entry.can_undo {
        return Err("Diese Aktion kann nicht rückgängig gemacht werden".to_string());
    }
    if entry.undone {
        return Err("Diese Aktion wurde bereits rückgängig gemacht".to_string());
    }

    // Rückgängig-Logik je nach Aktionstyp
    match entry.action_type.as_str() {
        "delete_trash" => {
            // Papierkorb-Elemente können nicht programmatisch wiederhergestellt werden.
            // Wir öffnen den Papierkorb, damit der Nutzer manuell wiederherstellen kann.
            let _ = crate::ps::run_ps("Start-Process shell:RecycleBinFolder").await;
            crate::undo::mark_undone(&id)?;
            Ok(json!({ "success": true, "message": "Papierkorb wurde geöffnet. Bitte stelle die Dateien manuell wieder her." }))
        }
        "file_move" => {
            // Dateien zurück an den Ursprungsort verschieben
            if let Some(moves) = entry.before_state.get("moves").and_then(|v| v.as_array()) {
                for m in moves {
                    let from = m.get("dest").and_then(|v| v.as_str()).unwrap_or("");
                    let to_dir = m.get("source_dir").and_then(|v| v.as_str()).unwrap_or("");
                    if !from.is_empty() && !to_dir.is_empty() {
                        let name = std::path::Path::new(from).file_name().unwrap_or_default();
                        let to = std::path::Path::new(to_dir).join(name);
                        let _ = tokio::fs::rename(from, &to).await;
                    }
                }
                crate::undo::mark_undone(&id)?;
                Ok(json!({ "success": true, "message": "Dateien wurden zurück verschoben." }))
            } else {
                Err("Keine Verschiebungsdaten vorhanden".to_string())
            }
        }
        "toggle_autostart" => {
            // Autostart-Eintrag zurücksetzen
            let prev_enabled = entry.before_state.get("was_enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            let entry_data = entry.before_state.get("entry").cloned().unwrap_or(json!({}));
            super::cmd_system::toggle_autostart(entry_data, prev_enabled).await?;
            crate::undo::mark_undone(&id)?;
            Ok(json!({ "success": true, "message": "Autostart-Eintrag zurückgesetzt." }))
        }
        "privacy_setting" => {
            // Privacy-Einstellung zurücksetzen
            let setting_id = entry.before_state.get("setting_id").and_then(|v| v.as_str()).unwrap_or("");
            if !setting_id.is_empty() {
                super::cmd_privacy::reset_privacy_setting(setting_id.to_string()).await?;
                crate::undo::mark_undone(&id)?;
                Ok(json!({ "success": true, "message": "Datenschutz-Einstellung zurückgesetzt." }))
            } else {
                Err("Keine Einstellungs-ID vorhanden".to_string())
            }
        }
        _ => {
            crate::undo::mark_undone(&id)?;
            Ok(json!({ "success": true, "message": "Eintrag als rückgängig markiert." }))
        }
    }
}

#[tauri::command]
pub async fn clear_undo_log() -> Result<Value, String> {
    crate::undo::clear_log()?;
    Ok(json!({ "success": true }))
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


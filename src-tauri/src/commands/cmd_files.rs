use serde_json::{json, Value};
use std::path::Path;
use tauri::Emitter;
use super::validate_path;

// === File Management ===

#[tauri::command]
pub async fn delete_to_trash(paths: Vec<String>) -> Result<Value, String> {
    tracing::info!(count = paths.len(), "Papierkorb-Löschung angefordert");
    for p in &paths {
        validate_path(p)?;
    }
    // Undo-Log: Pfade protokollieren (umkehrbar via Papierkorb)
    let file_names: Vec<&str> = paths.iter().filter_map(|p| Path::new(p).file_name().and_then(|n| n.to_str())).collect();
    let desc = if file_names.len() == 1 {
        format!("\"{}\" in den Papierkorb verschoben", file_names[0])
    } else {
        format!("{} Elemente in den Papierkorb verschoben", file_names.len())
    };
    crate::undo::log_action("delete_trash", &desc, json!({ "paths": paths }), true);

    let ps_paths = paths.iter().map(|p| format!("'{}'", p.replace("'", "''"))).collect::<Vec<_>>().join(",");
    let script = format!(
        r#"Add-Type -AssemblyName Microsoft.VisualBasic
@({}) | ForEach-Object {{
    if (Test-Path -LiteralPath $_ -PathType Container) {{
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($_, 'OnlyErrorDialogs', 'SendToRecycleBin')
    }} else {{
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_, 'OnlyErrorDialogs', 'SendToRecycleBin')
    }}
}}
'ok'"#, ps_paths
    );
    crate::ps::run_ps(&script).await.map(|_| json!({ "success": true }))
}

#[tauri::command]
pub async fn delete_permanent(paths: Vec<String>) -> Result<Value, String> {
    tracing::warn!(count = paths.len(), "Permanente Löschung angefordert");
    for p in &paths {
        validate_path(p)?;
    }

    // Undo-Log: Pfade + Größen protokollieren (NICHT umkehrbar!)
    let mut sizes: Vec<Value> = Vec::new();
    for p in &paths {
        let size = tokio::fs::metadata(p).await.map(|m| m.len()).unwrap_or(0);
        sizes.push(json!({ "path": p, "size": size }));
    }
    let file_names: Vec<&str> = paths.iter().filter_map(|p| Path::new(p).file_name().and_then(|n| n.to_str())).collect();
    let desc = if file_names.len() == 1 {
        format!("\"{}\" endgültig gelöscht", file_names[0])
    } else {
        format!("{} Elemente endgültig gelöscht", file_names.len())
    };
    crate::undo::log_action("delete_permanent", &desc, json!({ "files": sizes }), false);

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
    validate_path(&parent_path)?;
    let full = Path::new(&parent_path).join(&name);
    tokio::fs::create_dir_all(&full).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "path": full.to_string_lossy() }))
}

#[tauri::command]
pub async fn file_rename(old_path: String, new_name: String) -> Result<Value, String> {
    validate_path(&old_path)?;
    let src = Path::new(&old_path);
    let old_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
    let dest = src.parent().unwrap_or(Path::new(".")).join(&new_name);
    let desc = format!("\"{}\" umbenannt zu \"{}\"", old_name, new_name);
    crate::undo::log_action("file_rename", &desc, json!({
        "old_path": old_path,
        "new_path": dest.to_string_lossy(),
        "old_name": old_name,
        "new_name": new_name
    }), true);
    tokio::fs::rename(&src, &dest).await.map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "newPath": dest.to_string_lossy() }))
}

#[tauri::command]
pub async fn file_move(source_paths: Vec<String>, dest_dir: String) -> Result<Value, String> {
    // Undo-Log: Quell- und Zielpfade protokollieren (umkehrbar)
    let mut moves: Vec<Value> = Vec::new();
    for src in &source_paths {
        validate_path(src)?;
        let source_dir = Path::new(src).parent().and_then(|p| p.to_str()).unwrap_or("").to_string();
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        moves.push(json!({ "source": src, "source_dir": source_dir, "dest": dest.to_string_lossy() }));
    }
    let file_names: Vec<&str> = source_paths.iter().filter_map(|p| Path::new(p).file_name().and_then(|n| n.to_str())).collect();
    let desc = if file_names.len() == 1 {
        format!("\"{}\" verschoben nach {}", file_names[0], dest_dir.split(&['\\', '/'][..]).last().unwrap_or(&dest_dir))
    } else {
        format!("{} Elemente verschoben nach {}", file_names.len(), dest_dir.split(&['\\', '/'][..]).last().unwrap_or(&dest_dir))
    };
    crate::undo::log_action("file_move", &desc, json!({ "moves": moves }), true);

    for src in &source_paths {
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        // Try rename first (fast, same-volume). Fall back to copy+delete for cross-volume moves.
        match tokio::fs::rename(src, &dest).await {
            Ok(_) => {},
            Err(_) => {
                let src_path = Path::new(src);
                if src_path.is_dir() {
                    // Recursive directory copy + delete
                    for entry in walkdir::WalkDir::new(src_path).into_iter().filter_map(|e| e.ok()) {
                        let rel = entry.path().strip_prefix(src_path).unwrap_or(entry.path());
                        let target = dest.join(rel);
                        if entry.file_type().is_dir() {
                            tokio::fs::create_dir_all(&target).await.map_err(|e| e.to_string())?;
                        } else {
                            if let Some(parent) = target.parent() {
                                tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                            }
                            tokio::fs::copy(entry.path(), &target).await.map_err(|e| e.to_string())?;
                        }
                    }
                    tokio::fs::remove_dir_all(src_path).await.map_err(|e| e.to_string())?;
                } else {
                    tokio::fs::copy(src, &dest).await.map_err(|e| e.to_string())?;
                    tokio::fs::remove_file(src).await.map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn file_copy(source_paths: Vec<String>, dest_dir: String) -> Result<Value, String> {
    for src in &source_paths {
        validate_path(src)?;
        let name = Path::new(src).file_name().unwrap_or_default();
        let dest = Path::new(&dest_dir).join(name);
        let src_path = Path::new(src);
        if src_path.is_dir() {
            // Rekursive Ordner-Kopie via walkdir
            for entry in walkdir::WalkDir::new(src_path).into_iter().filter_map(|e| e.ok()) {
                let rel = entry.path().strip_prefix(src_path).unwrap_or(entry.path());
                let target = dest.join(rel);
                if entry.file_type().is_dir() {
                    tokio::fs::create_dir_all(&target).await.map_err(|e| e.to_string())?;
                } else {
                    if let Some(parent) = target.parent() {
                        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                    }
                    tokio::fs::copy(entry.path(), &target).await.map_err(|e| e.to_string())?;
                }
            }
        } else {
            tokio::fs::copy(src, &dest).await.map_err(|e| e.to_string())?;
        }
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

// === Extended Properties (4-Tab Dialog) ===

#[tauri::command]
pub async fn file_properties_general(file_path: String) -> Result<Value, String> {
    use std::os::windows::fs::MetadataExt;

    let path = std::path::Path::new(&file_path);
    let meta = tokio::fs::metadata(&file_path).await
        .map_err(|e| format!("Metadaten-Fehler: {}", e))?;

    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.clone());
    let parent_path = path.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = path.extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let is_dir = meta.is_dir();
    let size = if is_dir { 0u64 } else { meta.len() };

    // sizeOnDisk: cluster-aligned (4096 = Standard-NTFS-Allokationseinheit)
    let size_on_disk = if is_dir || size == 0 { 0u64 } else {
        ((size + 4095) / 4096) * 4096
    };

    // Windows FILETIME → ISO 8601 via chrono
    let to_iso = |ft: u64| -> String {
        if ft == 0 { return String::new(); }
        let secs = (ft / 10_000_000) as i64 - 11_644_473_600;
        let nanos = ((ft % 10_000_000) * 100) as u32;
        chrono::DateTime::from_timestamp(secs, nanos)
            .map(|dt| dt.with_timezone(&chrono::Local).to_rfc3339())
            .unwrap_or_default()
    };
    let created = to_iso(meta.creation_time());
    let modified = to_iso(meta.last_write_time());
    let accessed = to_iso(meta.last_access_time());

    // Windows-Dateiattribute
    let fa = meta.file_attributes();
    let read_only = (fa & 0x1) != 0;   // FILE_ATTRIBUTE_READONLY
    let hidden    = (fa & 0x2) != 0;   // FILE_ATTRIBUTE_HIDDEN
    let system    = (fa & 0x4) != 0;   // FILE_ATTRIBUTE_SYSTEM
    let archive   = (fa & 0x20) != 0;  // FILE_ATTRIBUTE_ARCHIVE

    // Dateityp + "Öffnen mit" via cmd.exe (~50ms statt ~300ms PowerShell)
    let mut type_desc = String::new();
    let mut open_with = String::new();

    if !is_dir && !extension.is_empty()
        && extension.chars().all(|c| c.is_alphanumeric() || c == '.')
    {
        if let Ok(out) = tokio::process::Command::new("cmd")
            .args(["/c", &format!("assoc {}", &extension)])
            .creation_flags(0x08000000)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output().await
        {
            let s = String::from_utf8_lossy(&out.stdout);
            if let Some(eq) = s.find('=') {
                let prog_id = s[eq + 1..].trim();
                if !prog_id.is_empty() {
                    type_desc = prog_id.to_string();
                    // prog_id gegen cmd-Injection validieren
                    if !prog_id.chars().any(|c| "&|;<>^%()!`\"'".contains(c)) {
                        if let Ok(ft) = tokio::process::Command::new("cmd")
                            .args(["/c", &format!("ftype {}", prog_id)])
                            .creation_flags(0x08000000)
                            .stdin(std::process::Stdio::null())
                            .stdout(std::process::Stdio::piped())
                            .stderr(std::process::Stdio::piped())
                            .output().await
                        {
                            let fs = String::from_utf8_lossy(&ft.stdout);
                            if let Some(fe) = fs.find('=') {
                                open_with = fs[fe + 1..].trim().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    if type_desc.is_empty() {
        type_desc = if is_dir {
            "Dateiordner".to_string()
        } else if extension.is_empty() {
            "Datei".to_string()
        } else {
            format!("{}-Datei", extension.trim_start_matches('.').to_uppercase())
        };
    }

    Ok(json!({
        "name": name,
        "path": file_path,
        "parentPath": parent_path,
        "extension": extension,
        "isDir": is_dir,
        "size": size,
        "sizeOnDisk": size_on_disk,
        "sizeBytes": size,
        "fileCount": -1,
        "dirCount": -1,
        "created": created,
        "modified": modified,
        "accessed": accessed,
        "typeDescription": type_desc,
        "openWith": open_with,
        "readOnly": read_only,
        "hidden": hidden,
        "system": system,
        "archive": archive
    }))
}

#[tauri::command]
pub async fn file_properties_security(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    let script = format!(
        r#"
try {{
    $acl = Get-Acl -LiteralPath '{0}'
    $owner = $acl.Owner

    $entries = @($acl.Access | ForEach-Object {{
        [PSCustomObject]@{{
            identity = $_.IdentityReference.Value
            type = $_.AccessControlType.ToString()
            rights = $_.FileSystemRights.ToString()
            inherited = $_.IsInherited
        }}
    }})

    [PSCustomObject]@{{
        owner = $owner
        entries = $entries
    }} | ConvertTo-Json -Depth 3 -Compress
}} catch {{
    [PSCustomObject]@{{
        owner = 'Unbekannt'
        entries = @()
        error = $_.Exception.Message
    }} | ConvertTo-Json -Depth 3 -Compress
}}
"#,
        safe_path
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn file_properties_details(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    let script = format!(
        r#"
$item = Get-Item -LiteralPath '{0}' -Force
$ext = $item.Extension.ToLower()
$props = [ordered]@{{}}

$props['Dateiname'] = $item.Name
$props['Dateityp'] = if ($item.Extension) {{ $item.Extension }} else {{ 'Ordner' }}
$props['Ordnerpfad'] = if ($item.PSIsContainer) {{ $item.Parent.FullName }} else {{ $item.DirectoryName }}

# Shell.Application für erweiterte Metadaten (Bilder, Audio, Video, Dokumente)
try {{
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.Namespace($item.DirectoryName)
    if ($folder) {{
        $shellFile = $folder.ParseName($item.Name)
        if ($shellFile) {{
            $indices = @(
                @(2, 'Elementtyp'),
                @(20, 'Autoren'),
                @(21, 'Titel'),
                @(14, 'Kommentar'),
                @(24, 'Copyright'),
                @(27, 'Bitrate'),
                @(28, 'Geschützt'),
                @(176, 'Bewertung'),
                @(186, 'Abmessungen'),
                @(175, 'Aufnahmedatum'),
                @(30, 'Interpret'),
                @(31, 'Albumtitel'),
                @(32, 'Jahr'),
                @(33, 'Titelnummer'),
                @(34, 'Genre'),
                @(26, 'Dauer')
            )
            foreach ($entry in $indices) {{
                try {{
                    $val = $folder.GetDetailsOf($shellFile, $entry[0])
                    if ($val -and $val.Trim()) {{
                        $props[$entry[1]] = $val.Trim()
                    }}
                }} catch {{}}
            }}
        }}
    }}
}} catch {{}}

# EXE/DLL: VersionInfo
if ($ext -in '.exe','.dll','.sys','.ocx','.msi') {{
    try {{
        $vi = $item.VersionInfo
        if ($vi) {{
            if ($vi.ProductName) {{ $props['Produktname'] = $vi.ProductName }}
            if ($vi.FileVersion) {{ $props['Dateiversion'] = $vi.FileVersion }}
            if ($vi.ProductVersion) {{ $props['Produktversion'] = $vi.ProductVersion }}
            if ($vi.CompanyName) {{ $props['Firma'] = $vi.CompanyName }}
            if ($vi.FileDescription) {{ $props['Beschreibung'] = $vi.FileDescription }}
            if ($vi.LegalCopyright) {{ $props['Copyright'] = $vi.LegalCopyright }}
            if ($vi.OriginalFilename) {{ $props['Originaldateiname'] = $vi.OriginalFilename }}
        }}
    }} catch {{}}
}}

$result = @($props.GetEnumerator() | ForEach-Object {{
    [PSCustomObject]@{{ key = $_.Key; value = $_.Value }}
}})

if ($result.Count -eq 0) {{
    '[]'
}} else {{
    $result | ConvertTo-Json -Depth 2 -Compress
}}
"#,
        safe_path
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn file_properties_versions(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    let script = format!(
        r#"
try {{
    $shadows = @(Get-WmiObject Win32_ShadowCopy -ErrorAction SilentlyContinue | Sort-Object InstallDate -Descending)
    if ($shadows.Count -eq 0) {{
        [PSCustomObject]@{{ versions = @(); message = 'Keine Schattenkopien vorhanden. Der Systemschutz ist möglicherweise deaktiviert.' }} | ConvertTo-Json -Compress
        return
    }}

    $filePath = '{0}'
    $drive = (Split-Path $filePath -Qualifier)
    $relativePath = $filePath.Substring($drive.Length)

    $versions = @()
    foreach ($shadow in $shadows) {{
        $shadowPath = $shadow.DeviceObject + $relativePath
        if (Test-Path -LiteralPath $shadowPath -ErrorAction SilentlyContinue) {{
            $shadowItem = Get-Item -LiteralPath $shadowPath -Force -ErrorAction SilentlyContinue
            $dateObj = [Management.ManagementDateTimeConverter]::ToDateTime($shadow.InstallDate)
            $versions += [PSCustomObject]@{{
                dateFormatted = $dateObj.ToString('dd.MM.yyyy HH:mm')
                type = if ($shadow.ClientAccessible) {{ 'Wiederherstellungspunkt' }} else {{ 'Sicherungspunkt' }}
                size = if ($shadowItem) {{ [long]$shadowItem.Length }} else {{ -1 }}
            }}
        }}
    }}

    [PSCustomObject]@{{ versions = $versions; message = '' }} | ConvertTo-Json -Depth 3 -Compress
}} catch {{
    [PSCustomObject]@{{ versions = @(); message = "Fehler: $($_.Exception.Message)" }} | ConvertTo-Json -Compress
}}
"#,
        safe_path
    );
    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn file_properties_hash(file_path: String, algorithm: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    // Whitelist: nur bekannte Hash-Algorithmen
    let safe_algo = match algorithm.to_uppercase().as_str() {
        "MD5" => "MD5",
        "SHA1" => "SHA1",
        "SHA256" => "SHA256",
        "SHA384" => "SHA384",
        "SHA512" => "SHA512",
        _ => return Err(format!("Unbekannter Algorithmus: {}", algorithm)),
    };
    let script = format!(
        r#"(Get-FileHash -LiteralPath '{}' -Algorithm {}).Hash"#,
        safe_path, safe_algo
    );
    // Hashing large files can take >30s — 120s timeout
    let hash = crate::ps::run_ps_with_timeout(&script, 120).await?;
    Ok(json!({ "algorithm": safe_algo, "hash": hash.trim() }))
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

// === Run as Admin ===

#[tauri::command]
pub async fn run_as_admin(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    // Validate: only allow executable files
    let ext = std::path::Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "exe" && ext != "msi" && ext != "bat" && ext != "cmd" && ext != "ps1" {
        return Err(format!("Nur ausführbare Dateien können als Administrator gestartet werden (erhalten: .{})", ext));
    }
    if !std::path::Path::new(&file_path).exists() {
        return Err("Datei existiert nicht".to_string());
    }
    let script = format!("Start-Process -FilePath '{}' -Verb RunAs", safe_path);
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => Ok(json!({ "success": false, "error": format!("Elevation fehlgeschlagen: {}", e) })),
    }
}

// === Archive Extraction ===

#[tauri::command]
pub async fn extract_archive(archive_path: String, dest_dir: Option<String>) -> Result<Value, String> {
    let safe_archive = archive_path.replace("'", "''");

    // Validate archive exists
    if !std::path::Path::new(&archive_path).exists() {
        return Err("Archiv-Datei existiert nicht".to_string());
    }

    let ext = std::path::Path::new(&archive_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Determine destination: subfolder next to archive if not specified
    let destination = if let Some(d) = dest_dir {
        d.replace("'", "''")
    } else {
        let stem = std::path::Path::new(&archive_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("extracted");
        let parent = std::path::Path::new(&archive_path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(".");
        format!("{}\\{}", parent, stem).replace("'", "''")
    };

    let script = match ext.as_str() {
        "zip" => format!(
            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force; Write-Output 'OK'",
            safe_archive, destination
        ),
        _ => return Err(format!(
            "Archivformat '.{}' wird derzeit nicht unterstützt. Nur .zip wird nativ unterstützt.",
            ext
        )),
    };

    match crate::ps::run_ps(&script).await {
        Ok(output) => {
            if output.trim().contains("OK") || output.trim().is_empty() {
                Ok(json!({ "success": true, "destination": destination.replace("''", "'") }))
            } else {
                Ok(json!({ "success": false, "error": output.trim() }))
            }
        }
        Err(e) => Err(format!("Entpacken fehlgeschlagen: {}", e)),
    }
}

// === Archive Creation ===

#[tauri::command]
pub async fn create_archive(source_paths: Vec<String>, dest_path: Option<String>) -> Result<Value, String> {
    if source_paths.is_empty() {
        return Err("Keine Dateien zum Komprimieren ausgewählt".to_string());
    }

    // Validate all source paths exist
    for p in &source_paths {
        if !std::path::Path::new(p).exists() {
            return Err(format!("Datei/Ordner existiert nicht: {}", p));
        }
    }

    // Determine destination: name.zip next to first source file, or custom dest_path
    let destination = if let Some(d) = dest_path {
        d
    } else if source_paths.len() == 1 {
        // Single file/folder: use its name + .zip
        let source = std::path::Path::new(&source_paths[0]);
        let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("archiv");
        let parent = source.parent().and_then(|p| p.to_str()).unwrap_or(".");
        format!("{}\\{}.zip", parent, stem)
    } else {
        // Multiple files: use parent folder name + .zip
        let first = std::path::Path::new(&source_paths[0]);
        let parent = first.parent().and_then(|p| p.to_str()).unwrap_or(".");
        let parent_name = std::path::Path::new(parent)
            .file_name().and_then(|n| n.to_str()).unwrap_or("archiv");
        format!("{}\\{}.zip", parent, parent_name)
    };

    let safe_dest = destination.replace("'", "''");

    // Build PowerShell path list
    let safe_sources: Vec<String> = source_paths.iter()
        .map(|p| format!("'{}'", p.replace("'", "''")))
        .collect();
    let source_list = safe_sources.join(",");

    let script = format!(
        "Compress-Archive -LiteralPath @({}) -DestinationPath '{}' -Force; Write-Output 'OK'",
        source_list, safe_dest
    );

    match crate::ps::run_ps_with_timeout(&script, 120).await {
        Ok(output) => {
            if output.trim().contains("OK") || output.trim().is_empty() {
                let file_size = std::fs::metadata(&destination).map(|m| m.len()).unwrap_or(0);
                Ok(json!({
                    "success": true,
                    "destination": destination,
                    "size": file_size
                }))
            } else {
                Ok(json!({ "success": false, "error": output.trim() }))
            }
        }
        Err(e) => Err(format!("ZIP-Erstellung fehlgeschlagen: {}", e)),
    }
}

// === Context Menu ===

#[tauri::command]
pub async fn show_context_menu(app: tauri::AppHandle, menu_type: String, context: Option<Value>) -> Result<Value, String> {
    // Context menus are handled by the frontend in Tauri v2 (native menus require window handle)
    // We emit an event so the frontend can show a custom context menu
    let _ = app.emit("context-menu-action", json!({
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


// === Preview / Editor ===

#[tauri::command]
pub async fn read_file_preview(file_path: String, max_lines: Option<u32>) -> Result<Value, String> {
    if validate_path(&file_path).is_err() {
        tracing::warn!(path = %file_path, "Lese-Zugriff auf Systempfad");
    }
    let content = tokio::fs::read_to_string(&file_path).await.map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().take(max_lines.unwrap_or(100) as usize).collect();
    Ok(json!({ "content": lines.join("\n"), "totalLines": content.lines().count(), "truncated": content.lines().count() > max_lines.unwrap_or(100) as usize }))
}

#[tauri::command]
pub async fn read_file_content(file_path: String) -> Result<Value, String> {
    if validate_path(&file_path).is_err() {
        tracing::warn!(path = %file_path, "Lese-Zugriff auf Systempfad");
    }
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
    if validate_path(&file_path).is_err() {
        tracing::warn!(path = %file_path, "Binär-Lese-Zugriff auf Systempfad");
    }
    let bytes = tokio::fs::read(&file_path).await.map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(json!({ "data": b64, "size": bytes.len() }))
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
$folders += [PSCustomObject]@{ name='Bilder'; path=[Environment]::GetFolderPath('MyPictures'); icon='pictures' }
$folders += [PSCustomObject]@{ name='Musik'; path=[Environment]::GetFolderPath('MyMusic'); icon='music' }
$folders += [PSCustomObject]@{ name='Videos'; path=[Environment]::GetFolderPath('MyVideos'); icon='videos' }
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
    let safe_path = dir_path.replace("'", "''");
    // Try Windows Terminal first, fall back to cmd.exe
    let script = format!(
        r#"$wt = Get-Command wt -ErrorAction SilentlyContinue
if ($wt) {{ Start-Process wt -ArgumentList '-d', '"{}"' }} else {{ Start-Process cmd.exe -ArgumentList '/K', 'cd /d "{}"' }}"#,
        safe_path, safe_path
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn open_with_dialog(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''").replace('"', "`\"");
    crate::ps::run_ps(&format!("Start-Process rundll32.exe -ArgumentList 'shell32.dll,OpenAs_RunDLL \"{}\"'", safe_path)).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn edit_in_editor(file_path: String) -> Result<Value, String> {
    let safe_path = file_path.replace("'", "''");
    // Try VS Code first, fall back to Notepad
    let script = format!(
        r#"$codePath = Get-Command code -ErrorAction SilentlyContinue
if ($codePath) {{ Start-Process code -ArgumentList '"{}"' }} else {{ Start-Process notepad.exe -ArgumentList '"{}"' }}"#,
        safe_path, safe_path
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}


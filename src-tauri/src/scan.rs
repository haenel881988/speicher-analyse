use std::sync::{Mutex, OnceLock};
use std::collections::HashMap;
use serde_json::{json, Value};

pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: i64,
    pub extension: String,
}

#[allow(dead_code)]
pub struct ScanData {
    pub scan_id: String,
    pub root_path: String,
    pub files: Vec<FileEntry>,
    pub dirs_scanned: u64,
    pub total_size: u64,
    pub elapsed_seconds: f64,
}

fn store() -> &'static Mutex<HashMap<String, ScanData>> {
    static STORE: OnceLock<Mutex<HashMap<String, ScanData>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn save(data: ScanData) {
    let mut s = store().lock().unwrap();
    s.clear();
    s.insert(data.scan_id.clone(), data);
}

pub fn with_scan<F, R>(scan_id: &str, f: F) -> Option<R>
where
    F: FnOnce(&ScanData) -> R,
{
    let s = store().lock().unwrap();
    s.get(scan_id).map(f)
}

/// File category from extension
pub fn file_category(ext: &str) -> &'static str {
    match ext {
        ".doc" | ".docx" | ".pdf" | ".txt" | ".xlsx" | ".xls" | ".pptx" | ".ppt"
        | ".odt" | ".ods" | ".odp" | ".rtf" | ".csv" | ".md" | ".epub" => "documents",
        ".jpg" | ".jpeg" | ".png" | ".gif" | ".bmp" | ".svg" | ".webp" | ".ico"
        | ".tiff" | ".tif" | ".heic" | ".avif" | ".raw" | ".psd" => "images",
        ".mp3" | ".wav" | ".flac" | ".aac" | ".ogg" | ".wma" | ".m4a" | ".opus" => "audio",
        ".mp4" | ".avi" | ".mkv" | ".mov" | ".wmv" | ".flv" | ".webm" | ".m4v"
        | ".mpg" | ".mpeg" | ".3gp" => "video",
        ".zip" | ".rar" | ".7z" | ".tar" | ".gz" | ".bz2" | ".xz" | ".zst"
        | ".cab" | ".iso" => "archives",
        ".js" | ".ts" | ".jsx" | ".tsx" | ".py" | ".rs" | ".java" | ".c" | ".cpp"
        | ".h" | ".hpp" | ".cs" | ".go" | ".rb" | ".php" | ".swift" | ".kt"
        | ".html" | ".css" | ".scss" | ".less" | ".json" | ".xml" | ".yaml" | ".yml"
        | ".toml" | ".sql" | ".sh" | ".bat" | ".ps1" | ".r" | ".lua" | ".vue"
        | ".svelte" => "code",
        ".exe" | ".msi" | ".dll" | ".sys" | ".drv" | ".ocx" | ".com" | ".scr" => "executables",
        ".log" | ".tmp" | ".bak" | ".old" | ".cache" | ".dmp" | ".etl" => "system",
        _ => "other",
    }
}

/// Get top files by size — returns [{path, name, size, modified, extension}]
pub fn top_files(scan_id: &str, limit: usize) -> Value {
    with_scan(scan_id, |data| {
        let mut indices: Vec<usize> = (0..data.files.len()).collect();
        indices.sort_by(|&a, &b| data.files[b].size.cmp(&data.files[a].size));
        let files: Vec<Value> = indices.iter().take(limit).map(|&i| {
            let f = &data.files[i];
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "extension": f.extension})
        }).collect();
        json!(files)
    }).unwrap_or(json!([]))
}

/// Get file type statistics — returns flat array [{extension, category, count, total_size}]
/// Frontend (charts.js) iterates this directly and groups by category
pub fn file_types(scan_id: &str) -> Value {
    with_scan(scan_id, |data| {
        let mut exts: HashMap<&str, (u64, u64)> = HashMap::new();
        for f in &data.files {
            let ext = if f.extension.is_empty() { "(keine)" } else { &f.extension };
            let e = exts.entry(ext).or_insert((0, 0));
            e.0 += 1;
            e.1 += f.size;
        }
        let mut ext_list: Vec<Value> = exts.iter().map(|(ext, (count, size))| {
            json!({"extension": ext, "category": file_category(ext), "count": count, "total_size": size})
        }).collect();
        ext_list.sort_by(|a, b| b["total_size"].as_u64().unwrap_or(0).cmp(&a["total_size"].as_u64().unwrap_or(0)));
        json!(ext_list)
    }).unwrap_or(json!([]))
}

/// Search files by name — returns [{name, dirPath, path, isDir, matchQuality}]
pub fn search_files(scan_id: &str, query: &str, min_size: u64) -> Value {
    let query_lower = query.to_lowercase();
    with_scan(scan_id, |data| {
        let results: Vec<Value> = data.files.iter()
            .filter(|f| f.name.to_lowercase().contains(&query_lower) && f.size >= min_size)
            .take(500)
            .map(|f| {
                let dir_path = f.path.rfind('\\').map(|i| &f.path[..i]).unwrap_or("");
                json!({
                    "name": f.name, "dirPath": dir_path, "path": f.path,
                    "isDir": false, "matchQuality": 1.0,
                    "size": f.size, "modified": f.modified_ms, "extension": f.extension
                })
            })
            .collect();
        json!(results)
    }).unwrap_or(json!([]))
}

/// Get files by extension
pub fn files_by_extension(scan_id: &str, ext: &str, limit: usize) -> Value {
    let ext_lower = if ext.starts_with('.') { ext.to_lowercase() } else { format!(".{}", ext.to_lowercase()) };
    with_scan(scan_id, |data| {
        let mut files: Vec<&FileEntry> = data.files.iter()
            .filter(|f| f.extension == ext_lower)
            .collect();
        files.sort_by(|a, b| b.size.cmp(&a.size));
        let results: Vec<Value> = files.iter().take(limit).map(|f| {
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "extension": f.extension})
        }).collect();
        json!(results)
    }).unwrap_or(json!([]))
}

/// Get files by category
pub fn files_by_category(scan_id: &str, category: &str, limit: usize) -> Value {
    with_scan(scan_id, |data| {
        let mut files: Vec<&FileEntry> = data.files.iter()
            .filter(|f| file_category(&f.extension) == category)
            .collect();
        files.sort_by(|a, b| b.size.cmp(&a.size));
        let results: Vec<Value> = files.iter().take(limit).map(|f| {
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "extension": f.extension})
        }).collect();
        json!(results)
    }).unwrap_or(json!([]))
}

/// Get old files — returns {totalCount, totalSize, files: [{path, name, size, modified, ageDays, extension}]}
pub fn old_files(scan_id: &str, threshold_days: u32, min_size: u64) -> Value {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let threshold_ms = threshold_days as i64 * 86_400_000;
    with_scan(scan_id, |data| {
        let mut files: Vec<&FileEntry> = data.files.iter()
            .filter(|f| f.modified_ms > 0 && (now_ms - f.modified_ms) > threshold_ms && f.size >= min_size)
            .collect();
        files.sort_by(|a, b| b.size.cmp(&a.size));
        let total_size: u64 = files.iter().map(|f| f.size).sum();
        let total_count = files.len();
        let results: Vec<Value> = files.iter().take(500).map(|f| {
            let age_days = ((now_ms - f.modified_ms) as f64 / 86_400_000.0).round() as i64;
            json!({
                "path": f.path, "name": f.name, "size": f.size,
                "modified": f.modified_ms, "extension": f.extension,
                "ageDays": age_days, "context": "", "contextIcon": ""
            })
        }).collect();
        json!({"totalCount": total_count, "totalSize": total_size, "files": results})
    }).unwrap_or(json!({"totalCount": 0, "totalSize": 0, "files": []}))
}

/// Get folder sizes bulk — returns {"C:\\path": size, ...} (flat map)
pub fn folder_sizes_bulk(scan_id: &str, folder_paths: &[String]) -> Value {
    with_scan(scan_id, |data| {
        let mut result: HashMap<String, u64> = HashMap::new();
        for folder in folder_paths {
            let folder_prefix = if folder.ends_with('\\') || folder.ends_with('/') {
                folder.clone()
            } else {
                format!("{}\\", folder)
            };
            let size: u64 = data.files.iter()
                .filter(|f| f.path.starts_with(&folder_prefix))
                .map(|f| f.size)
                .sum();
            result.insert(folder.clone(), size);
        }
        json!(result)
    }).unwrap_or(json!({}))
}

/// Export scan data as CSV (semicolon-separated, German format)
pub fn export_csv(scan_id: &str) -> String {
    with_scan(scan_id, |data| {
        let mut lines = Vec::with_capacity(data.files.len() + 1);
        lines.push("Pfad;Name;Größe (Bytes);Extension;Kategorie".to_string());
        let mut sorted: Vec<&FileEntry> = data.files.iter().collect();
        sorted.sort_by(|a, b| b.size.cmp(&a.size));
        for f in sorted {
            let cat = file_category(&f.extension);
            lines.push(format!(
                "\"{}\";\"{}\";\"{}\";\"{}\";\"{}\";",
                f.path.replace('"', "\"\""),
                f.name.replace('"', "\"\""),
                f.size,
                f.extension,
                cat
            ));
        }
        lines.join("\n")
    }).unwrap_or_default()
}

/// Build tree node from scan data — returns {path, name, size, dir_count, file_count, children: [...]}
pub fn tree_node(scan_id: &str, path: &str, _depth: u32) -> Value {
    with_scan(scan_id, |data| {
        let path_norm = path.replace('/', "\\");
        let path_prefix = if path_norm.ends_with('\\') { path_norm.clone() } else { format!("{}\\", path_norm) };

        // Collect direct children (one level)
        let mut subdirs: HashMap<String, (u64, u64, u64)> = HashMap::new(); // (size, file_count, dir_count)
        let mut own_files: Vec<&FileEntry> = Vec::new();

        for f in &data.files {
            if !f.path.starts_with(&path_prefix) { continue; }
            let relative = &f.path[path_prefix.len()..];
            if let Some(sep) = relative.find('\\') {
                // File is in a subdirectory
                let subdir_name = &relative[..sep];
                let subdir_path = format!("{}{}", path_prefix, subdir_name);
                let entry = subdirs.entry(subdir_path).or_insert((0, 0, 0));
                entry.0 += f.size;
                entry.1 += 1;
            } else {
                // File is directly in this directory
                own_files.push(f);
            }
        }

        // Count unique direct subdirectories within each subdirectory
        let mut subdir_children: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
        for f in &data.files {
            if !f.path.starts_with(&path_prefix) { continue; }
            let relative = &f.path[path_prefix.len()..];
            if let Some(sep) = relative.find('\\') {
                let subdir_name = &relative[..sep];
                let subdir_path = format!("{}{}", path_prefix, subdir_name);
                let rest = &relative[sep+1..];
                if let Some(sep2) = rest.find('\\') {
                    let child_subdir = rest[..sep2].to_string();
                    subdir_children.entry(subdir_path).or_default().insert(child_subdir);
                }
            }
        }

        let own_size: u64 = own_files.iter().map(|f| f.size).sum();
        let total_size: u64 = own_size + subdirs.values().map(|v| v.0).sum::<u64>();

        let mut children: Vec<Value> = subdirs.iter().map(|(subdir_path, (size, file_count, _))| {
            let name = subdir_path.rsplit('\\').next().unwrap_or(subdir_path);
            let dir_count = subdir_children.get(subdir_path).map(|s| s.len()).unwrap_or(0);
            json!({
                "path": subdir_path,
                "name": name,
                "size": size,
                "isDir": true,
                "dir_count": dir_count,
                "file_count": file_count
            })
        }).collect();

        // Sort children by size descending
        children.sort_by(|a, b| b["size"].as_u64().unwrap_or(0).cmp(&a["size"].as_u64().unwrap_or(0)));

        json!({
            "path": path,
            "name": path.rsplit('\\').next().unwrap_or(path),
            "size": total_size,
            "own_size": own_size,
            "dir_count": subdirs.len(),
            "file_count": own_files.len(),
            "is_own_files": false,
            "children": children
        })
    }).unwrap_or(json!({"path": path, "name": "", "size": 0, "dir_count": 0, "file_count": 0, "children": []}))
}

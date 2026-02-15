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
    // Only keep the latest scan to save memory
    s.clear();
    s.insert(data.scan_id.clone(), data);
}

/// Run a query function against stored scan data
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

/// Get top files by size
pub fn top_files(scan_id: &str, limit: usize) -> Value {
    with_scan(scan_id, |data| {
        let mut indices: Vec<usize> = (0..data.files.len()).collect();
        indices.sort_by(|&a, &b| data.files[b].size.cmp(&data.files[a].size));
        let files: Vec<Value> = indices.iter().take(limit).map(|&i| {
            let f = &data.files[i];
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "ext": f.extension})
        }).collect();
        json!(files)
    }).unwrap_or(json!([]))
}

/// Get file type statistics
pub fn file_types(scan_id: &str) -> Value {
    with_scan(scan_id, |data| {
        let mut cats: HashMap<&str, (u64, u64, Vec<usize>)> = HashMap::new(); // (count, size, top_indices)
        for (i, f) in data.files.iter().enumerate() {
            let cat = file_category(&f.extension);
            let entry = cats.entry(cat).or_insert((0, 0, Vec::new()));
            entry.0 += 1;
            entry.1 += f.size;
            if entry.2.len() < 5 {
                entry.2.push(i);
            } else {
                // Replace smallest in top 5
                if let Some(min_idx) = entry.2.iter().position(|&idx| data.files[idx].size < f.size) {
                    entry.2[min_idx] = i;
                }
            }
        }
        // Also collect by extension
        let mut exts: HashMap<&str, (u64, u64)> = HashMap::new();
        for f in &data.files {
            let ext = if f.extension.is_empty() { "(keine)" } else { &f.extension };
            let e = exts.entry(ext).or_insert((0, 0));
            e.0 += 1;
            e.1 += f.size;
        }
        let mut ext_list: Vec<Value> = exts.iter().map(|(ext, (count, size))| {
            json!({"extension": ext, "count": count, "size": size, "category": file_category(ext)})
        }).collect();
        ext_list.sort_by(|a, b| b["size"].as_u64().unwrap_or(0).cmp(&a["size"].as_u64().unwrap_or(0)));

        let mut cat_list: Vec<Value> = cats.iter().map(|(cat, (count, size, _))| {
            json!({"category": cat, "count": count, "size": size})
        }).collect();
        cat_list.sort_by(|a, b| b["size"].as_u64().unwrap_or(0).cmp(&a["size"].as_u64().unwrap_or(0)));

        json!({"categories": cat_list, "extensions": ext_list})
    }).unwrap_or(json!({"categories": [], "extensions": []}))
}

/// Search files by name
pub fn search_files(scan_id: &str, query: &str, min_size: u64) -> Value {
    let query_lower = query.to_lowercase();
    with_scan(scan_id, |data| {
        let results: Vec<Value> = data.files.iter()
            .filter(|f| f.name.to_lowercase().contains(&query_lower) && f.size >= min_size)
            .take(500)
            .map(|f| json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "ext": f.extension}))
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
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "ext": f.extension})
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
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "ext": f.extension})
        }).collect();
        json!(results)
    }).unwrap_or(json!([]))
}

/// Get old files (not modified in threshold_days)
pub fn old_files(scan_id: &str, threshold_days: u32, min_size: u64) -> Value {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let threshold_ms = threshold_days as i64 * 86_400_000;
    with_scan(scan_id, |data| {
        let mut files: Vec<&FileEntry> = data.files.iter()
            .filter(|f| f.modified_ms > 0 && (now_ms - f.modified_ms) > threshold_ms && f.size >= min_size)
            .collect();
        files.sort_by(|a, b| b.size.cmp(&a.size));
        let results: Vec<Value> = files.iter().take(500).map(|f| {
            json!({"path": f.path, "name": f.name, "size": f.size, "modified": f.modified_ms, "ext": f.extension})
        }).collect();
        json!(results)
    }).unwrap_or(json!([]))
}

/// Get folder sizes bulk
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

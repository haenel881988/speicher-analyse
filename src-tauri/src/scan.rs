use std::sync::{Mutex, OnceLock};
use std::collections::HashMap;
use serde_json::{json, Value};

#[derive(serde::Serialize, serde::Deserialize)]
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
    build_dir_index(&data.files);
    let mut s = store().lock().unwrap();
    s.clear();
    s.insert(data.scan_id.clone(), data);
}

/// Mutable access to store — for releasing scan data from memory
pub fn store_mut() -> std::sync::MutexGuard<'static, HashMap<String, ScanData>> {
    store().lock().unwrap()
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

/// Get folder sizes bulk — O(1) per folder via directory index
pub fn folder_sizes_bulk(_scan_id: &str, folder_paths: &[String]) -> Value {
    let idx = dir_index().lock().unwrap();
    let mut result: HashMap<String, u64> = HashMap::new();
    for folder in folder_paths {
        let key = normalize_dir_key(folder);
        let size = idx.get(&key).map(|e| e.total_size).unwrap_or(0);
        result.insert(folder.clone(), size);
    }
    json!(result)
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
            lines.push(format!("\"{}\";\"{}\";\"{}\";\"{}\";\"{}\"",
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

/// Build tree node from pre-built directory index — O(1) lookup instead of O(N) file scan
pub fn tree_node(_scan_id: &str, path: &str, _depth: u32) -> Value {
    let key = normalize_dir_key(path);
    let idx = dir_index().lock().unwrap();

    match idx.get(&key) {
        Some(entry) => {
            let mut children: Vec<Value> = entry.children.iter().filter_map(|child_path| {
                let child = idx.get(child_path)?;
                let name = child_path.rsplit('\\').next().unwrap_or(child_path);
                Some(json!({
                    "path": child_path,
                    "name": name,
                    "size": child.total_size,
                    "isDir": true,
                    "dir_count": child.children.len(),
                    "file_count": child.total_file_count
                }))
            }).collect();

            children.sort_unstable_by(|a, b| {
                b["size"].as_u64().unwrap_or(0).cmp(&a["size"].as_u64().unwrap_or(0))
            });

            json!({
                "path": path,
                "name": path.rsplit('\\').next().unwrap_or(path),
                "size": entry.total_size,
                "own_size": entry.own_size,
                "dir_count": entry.children.len(),
                "file_count": entry.total_file_count,
                "is_own_files": false,
                "children": children
            })
        }
        None => json!({"path": path, "name": "", "size": 0, "dir_count": 0, "file_count": 0, "children": []})
    }
}

/// Check if a scan_id exists in memory
pub fn has_scan(scan_id: &str) -> bool {
    let s = store().lock().unwrap();
    s.contains_key(scan_id)
}

/// Persist current scan data to disk (bincode for fast load, metadata as JSON)
pub fn save_to_disk(data_dir: &std::path::Path) -> Result<Value, String> {
    let s = store().lock().unwrap();
    let (_, data) = s.iter().next().ok_or("Keine Scan-Daten vorhanden")?;

    let meta = json!({
        "scan_id": data.scan_id,
        "root_path": data.root_path,
        "dirs_scanned": data.dirs_scanned,
        "total_size": data.total_size,
        "elapsed_seconds": data.elapsed_seconds,
        "files_count": data.files.len(),
        "saved_at": chrono::Utc::now().timestamp_millis(),
    });

    // Write metadata (small file, human-readable JSON)
    let meta_path = data_dir.join("scan-meta.json");
    let meta_str = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, &meta_str).map_err(|e| format!("scan-meta.json schreiben: {}", e))?;

    // Write file entries as bincode (5-10x faster to load than JSON)
    let data_path = data_dir.join("scan-data.bin");
    let file = std::fs::File::create(&data_path).map_err(|e| format!("scan-data.bin erstellen: {}", e))?;
    let writer = std::io::BufWriter::with_capacity(512 * 1024, file);
    bincode::serialize_into(writer, &data.files).map_err(|e| format!("scan-data.bin schreiben: {}", e))?;

    // Remove old JSON format if it exists (migration cleanup)
    let _ = std::fs::remove_file(data_dir.join("scan-data.json"));

    tracing::info!(
        scan_id = %data.scan_id,
        files = data.files.len(),
        "Scan-Daten auf Disk persistiert (bincode)"
    );

    Ok(meta)
}

/// Load scan data from disk into memory store (bincode preferred, JSON fallback)
pub fn load_from_disk(data_dir: &std::path::Path) -> Result<Value, String> {
    let start = std::time::Instant::now();
    let meta_path = data_dir.join("scan-meta.json");

    if !meta_path.exists() {
        return Err("Keine gespeicherten Scan-Daten".to_string());
    }

    let meta_str = std::fs::read_to_string(&meta_path)
        .map_err(|e| format!("scan-meta.json lesen: {}", e))?;
    let meta: Value = serde_json::from_str(&meta_str)
        .map_err(|e| format!("scan-meta.json parsen: {}", e))?;

    // Try bincode first (fast), then JSON fallback (backward compatibility)
    let bin_path = data_dir.join("scan-data.bin");
    let json_path = data_dir.join("scan-data.json");

    let files: Vec<FileEntry> = if bin_path.exists() {
        let file = std::fs::File::open(&bin_path)
            .map_err(|e| format!("scan-data.bin öffnen: {}", e))?;
        let reader = std::io::BufReader::with_capacity(512 * 1024, file);
        bincode::deserialize_from(reader)
            .map_err(|e| format!("scan-data.bin parsen: {}", e))?
    } else if json_path.exists() {
        let file = std::fs::File::open(&json_path)
            .map_err(|e| format!("scan-data.json öffnen: {}", e))?;
        let reader = std::io::BufReader::with_capacity(256 * 1024, file);
        let loaded: Vec<FileEntry> = serde_json::from_reader(reader)
            .map_err(|e| format!("scan-data.json parsen: {}", e))?;

        // Auto-migrate: save as bincode for faster future loads
        if let Ok(out_file) = std::fs::File::create(&bin_path) {
            let writer = std::io::BufWriter::with_capacity(512 * 1024, out_file);
            if bincode::serialize_into(writer, &loaded).is_ok() {
                let _ = std::fs::remove_file(&json_path);
                tracing::info!("Scan-Daten automatisch von JSON zu bincode migriert");
            }
        }

        loaded
    } else {
        return Err("Keine Scan-Datendatei gefunden".to_string());
    };

    let load_ms = start.elapsed().as_millis();
    let scan_id = meta["scan_id"].as_str().unwrap_or("restored").to_string();
    let root_path = meta["root_path"].as_str().unwrap_or("").to_string();

    // save() also builds the directory index
    save(ScanData {
        scan_id: scan_id.clone(),
        root_path,
        files,
        dirs_scanned: meta["dirs_scanned"].as_u64().unwrap_or(0),
        total_size: meta["total_size"].as_u64().unwrap_or(0),
        elapsed_seconds: meta["elapsed_seconds"].as_f64().unwrap_or(0.0),
    });

    let total_ms = start.elapsed().as_millis();
    tracing::info!(
        scan_id = %scan_id,
        files_count = meta["files_count"].as_u64().unwrap_or(0),
        load_ms = load_ms,
        index_ms = total_ms - load_ms,
        total_ms = total_ms,
        "Scan-Daten von Disk geladen + Index erstellt"
    );

    Ok(meta)
}

/// Get scan metadata without loading full data (fast check)
pub fn read_scan_meta(data_dir: &std::path::Path) -> Option<Value> {
    let meta_path = data_dir.join("scan-meta.json");
    let meta_str = std::fs::read_to_string(&meta_path).ok()?;
    serde_json::from_str(&meta_str).ok()
}

// ============================================================
// Directory Index — O(1) tree queries instead of O(N) file scans
// ============================================================

struct DirIndexEntry {
    total_size: u64,
    own_size: u64,
    own_file_count: usize,
    total_file_count: usize,
    children: Vec<String>, // direct subdirectory paths
}

fn dir_index() -> &'static Mutex<HashMap<String, DirIndexEntry>> {
    static INDEX: OnceLock<Mutex<HashMap<String, DirIndexEntry>>> = OnceLock::new();
    INDEX.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_dir_key(path: &str) -> String {
    let p = path.replace('/', "\\");
    let trimmed = p.trim_end_matches('\\');
    // Windows is case-insensitive — normalize to lowercase for consistent lookups
    if trimmed.is_empty() { p.to_lowercase() } else { trimmed.to_lowercase() }
}

/// Build directory index from flat file list. Single pass O(N) to accumulate sizes,
/// then bottom-up pass to compute totals. Called automatically by save().
fn build_dir_index(files: &[FileEntry]) {
    use std::collections::HashSet;
    let start = std::time::Instant::now();

    let estimated_dirs = files.len() / 5;
    let mut own_sizes: HashMap<String, u64> = HashMap::with_capacity(estimated_dirs);
    let mut own_counts: HashMap<String, usize> = HashMap::with_capacity(estimated_dirs);
    let mut child_sets: HashMap<String, HashSet<String>> = HashMap::with_capacity(estimated_dirs);

    // Phase 1: Accumulate own_size per directory + register parent→child
    // All keys are lowercased for case-insensitive lookups (Windows filesystem)
    for file in files {
        let parent = match file.path.rfind('\\') {
            Some(pos) => file.path[..pos].to_lowercase(),
            None => continue,
        };

        *own_sizes.entry(parent.clone()).or_default() += file.size;
        *own_counts.entry(parent.clone()).or_default() += 1;

        // Walk up to register parent→child relationships (early exit on duplicate)
        let mut child_path = parent;
        loop {
            match child_path.rfind('\\') {
                Some(pos) if pos >= 2 => {
                    let parent_path = child_path[..pos].to_string();
                    let set = child_sets.entry(parent_path.clone()).or_default();
                    if !set.insert(child_path.clone()) {
                        break; // Already registered — all ancestors are too
                    }
                    own_sizes.entry(parent_path.clone()).or_default();
                    own_counts.entry(parent_path.clone()).or_default();
                    child_path = parent_path;
                }
                _ => break,
            }
        }
    }

    // Phase 2: Build DirIndexEntry map
    let all_dirs: HashSet<&String> = own_sizes.keys().chain(child_sets.keys()).collect();
    let mut entries: HashMap<String, DirIndexEntry> = HashMap::with_capacity(all_dirs.len());

    for dir in &all_dirs {
        let children: Vec<String> = child_sets.get(*dir)
            .map(|s| { let mut v: Vec<String> = s.iter().cloned().collect(); v.sort_unstable(); v })
            .unwrap_or_default();
        entries.insert((*dir).clone(), DirIndexEntry {
            total_size: 0,
            own_size: *own_sizes.get(*dir).unwrap_or(&0),
            own_file_count: *own_counts.get(*dir).unwrap_or(&0),
            total_file_count: 0,
            children,
        });
    }

    // Phase 3: Bottom-up — compute total_size and total_file_count (deepest dirs first)
    let mut sorted_paths: Vec<String> = entries.keys().cloned().collect();
    sorted_paths.sort_unstable_by(|a, b| {
        b.matches('\\').count().cmp(&a.matches('\\').count())
    });

    let mut totals: HashMap<String, (u64, usize)> = HashMap::with_capacity(sorted_paths.len());
    for path in &sorted_paths {
        let entry = &entries[path];
        let mut ts = entry.own_size;
        let mut tfc = entry.own_file_count;
        for child in &entry.children {
            if let Some(&(cs, cf)) = totals.get(child) {
                ts += cs;
                tfc += cf;
            }
        }
        totals.insert(path.clone(), (ts, tfc));
    }

    for (path, (ts, tfc)) in &totals {
        if let Some(entry) = entries.get_mut(path) {
            entry.total_size = *ts;
            entry.total_file_count = *tfc;
        }
    }

    let count = entries.len();
    let elapsed = start.elapsed();
    let mut idx = dir_index().lock().unwrap();
    *idx = entries;

    tracing::debug!(
        directories = count,
        elapsed_ms = elapsed.as_millis(),
        "Verzeichnis-Index erstellt"
    );
}

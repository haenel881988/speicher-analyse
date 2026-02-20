use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

/// A lightweight snapshot of a scan (no full file list — just metrics)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScanSnapshot {
    pub id: String,
    pub timestamp_ms: i64,
    pub root_path: String,
    pub total_size: u64,
    pub total_files: u64,
    pub dirs_scanned: u64,
    /// Bytes per category: { "documents": 1234, "images": 5678, ... }
    pub category_sizes: HashMap<String, u64>,
    /// Bytes per category file count
    pub category_counts: HashMap<String, u64>,
    /// Top-level folder sizes (direct children of root): { "C:\\Users": 12345, ... }
    pub folder_sizes: HashMap<String, u64>,
}

/// Delta between two snapshots
#[derive(Serialize, Deserialize, Debug)]
pub struct ScanDelta {
    pub older_id: String,
    pub newer_id: String,
    pub older_timestamp_ms: i64,
    pub newer_timestamp_ms: i64,
    pub days_between: f64,
    pub size_change: i64,
    pub files_change: i64,
    /// Per-category size changes
    pub category_changes: HashMap<String, i64>,
    /// Per-folder size changes (only folders present in either snapshot)
    pub folder_changes: Vec<FolderChange>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FolderChange {
    pub path: String,
    pub old_size: u64,
    pub new_size: u64,
    pub change: i64,
}

const MAX_SNAPSHOTS: usize = 50;
const HISTORY_FILE: &str = "scan-history.json";

fn history_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(HISTORY_FILE)
}

/// Load all snapshots from disk
pub fn load_history(data_dir: &Path) -> Vec<ScanSnapshot> {
    let path = history_path(data_dir);
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Save history to disk
fn save_history(data_dir: &Path, history: &[ScanSnapshot]) -> Result<(), String> {
    let path = history_path(data_dir);
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("scan-history.json schreiben: {}", e))
}

/// Create a snapshot from the current in-memory scan data
pub fn create_snapshot(scan_id: &str) -> Option<ScanSnapshot> {
    crate::scan::with_scan(scan_id, |data| {
        let mut category_sizes: HashMap<String, u64> = HashMap::new();
        let mut category_counts: HashMap<String, u64> = HashMap::new();
        let mut folder_sizes: HashMap<String, u64> = HashMap::new();

        for f in &data.files {
            let cat = crate::scan::file_category(&f.extension).to_string();
            *category_sizes.entry(cat.clone()).or_default() += f.size;
            *category_counts.entry(cat).or_default() += 1;

            // Top-level folder: first directory segment after root
            let rel = if f.path.len() > data.root_path.len() {
                &f.path[data.root_path.len()..]
            } else {
                continue;
            };
            let rel = rel.trim_start_matches('\\');
            if let Some(sep) = rel.find('\\') {
                let top_folder = format!("{}\\{}", data.root_path.trim_end_matches('\\'), &rel[..sep]);
                *folder_sizes.entry(top_folder).or_default() += f.size;
            }
        }

        let now = chrono::Utc::now().timestamp_millis();
        let snapshot_id = format!("snap_{}", now);

        ScanSnapshot {
            id: snapshot_id,
            timestamp_ms: now,
            root_path: data.root_path.clone(),
            total_size: data.total_size,
            total_files: data.files.len() as u64,
            dirs_scanned: data.dirs_scanned,
            category_sizes,
            category_counts,
            folder_sizes,
        }
    })
}

/// Save a snapshot to the history file
pub fn save_snapshot(data_dir: &Path, snapshot: ScanSnapshot) -> Result<(), String> {
    let mut history = load_history(data_dir);

    // Prevent duplicate: don't save if last snapshot is less than 5 minutes old
    if let Some(last) = history.last() {
        if (snapshot.timestamp_ms - last.timestamp_ms).abs() < 300_000 {
            return Err("Letzter Snapshot ist weniger als 5 Minuten alt".to_string());
        }
    }

    history.push(snapshot);

    // Trim to max
    if history.len() > MAX_SNAPSHOTS {
        let excess = history.len() - MAX_SNAPSHOTS;
        history.drain(..excess);
    }

    save_history(data_dir, &history)
}

/// Compare two snapshots to produce a delta
pub fn compare_snapshots(older: &ScanSnapshot, newer: &ScanSnapshot) -> ScanDelta {
    let days_between = (newer.timestamp_ms - older.timestamp_ms) as f64 / 86_400_000.0;

    // Category changes
    let mut all_cats: std::collections::HashSet<&String> = std::collections::HashSet::new();
    all_cats.extend(older.category_sizes.keys());
    all_cats.extend(newer.category_sizes.keys());
    let mut category_changes: HashMap<String, i64> = HashMap::new();
    for cat in all_cats {
        let old_val = *older.category_sizes.get(cat).unwrap_or(&0) as i64;
        let new_val = *newer.category_sizes.get(cat).unwrap_or(&0) as i64;
        if new_val - old_val != 0 {
            category_changes.insert(cat.clone(), new_val - old_val);
        }
    }

    // Folder changes
    let mut all_folders: std::collections::HashSet<&String> = std::collections::HashSet::new();
    all_folders.extend(older.folder_sizes.keys());
    all_folders.extend(newer.folder_sizes.keys());
    let mut folder_changes: Vec<FolderChange> = Vec::new();
    for folder in all_folders {
        let old_size = *older.folder_sizes.get(folder).unwrap_or(&0);
        let new_size = *newer.folder_sizes.get(folder).unwrap_or(&0);
        let change = new_size as i64 - old_size as i64;
        if change != 0 {
            folder_changes.push(FolderChange {
                path: folder.clone(),
                old_size,
                new_size,
                change,
            });
        }
    }
    folder_changes.sort_by(|a, b| b.change.abs().cmp(&a.change.abs()));

    ScanDelta {
        older_id: older.id.clone(),
        newer_id: newer.id.clone(),
        older_timestamp_ms: older.timestamp_ms,
        newer_timestamp_ms: newer.timestamp_ms,
        days_between,
        size_change: newer.total_size as i64 - older.total_size as i64,
        files_change: newer.total_files as i64 - older.total_files as i64,
        category_changes,
        folder_changes,
    }
}

/// Compute a storage trend from history: growth rate per day, prediction
pub fn compute_trend(history: &[ScanSnapshot], root_path: &str) -> Value {
    let relevant: Vec<&ScanSnapshot> = history.iter()
        .filter(|s| s.root_path.eq_ignore_ascii_case(root_path))
        .collect();

    if relevant.len() < 2 {
        return json!({
            "hasEnoughData": false,
            "message": "Mindestens 2 Scans nötig für Trend-Analyse"
        });
    }

    let first = relevant.first().unwrap();
    let last = relevant.last().unwrap();
    let days = (last.timestamp_ms - first.timestamp_ms) as f64 / 86_400_000.0;
    if days < 0.01 {
        return json!({
            "hasEnoughData": false,
            "message": "Scans zu nah beieinander für Trend-Analyse"
        });
    }

    let size_change = last.total_size as i64 - first.total_size as i64;
    let growth_per_day = size_change as f64 / days;
    let growth_per_week = growth_per_day * 7.0;
    let growth_per_month = growth_per_day * 30.0;

    // Predict days until disk full (only if growing)
    let days_until_full: Option<f64> = if growth_per_day > 0.0 {
        // We'd need free space info — for now estimate from total
        // The frontend can enhance this with actual free space
        None
    } else {
        None
    };

    // Build data points for chart
    let data_points: Vec<Value> = relevant.iter().map(|s| {
        json!({
            "timestamp_ms": s.timestamp_ms,
            "total_size": s.total_size,
            "total_files": s.total_files
        })
    }).collect();

    json!({
        "hasEnoughData": true,
        "dataPoints": data_points,
        "snapshotCount": relevant.len(),
        "periodDays": (days * 10.0).round() / 10.0,
        "sizeChange": size_change,
        "growthPerDay": growth_per_day.round() as i64,
        "growthPerWeek": growth_per_week.round() as i64,
        "growthPerMonth": growth_per_month.round() as i64,
        "daysUntilFull": days_until_full
    })
}

/// Quick change detection: compare scan-meta.json timestamp with filesystem
/// Returns changes detected without a full scan
pub fn quick_change_check(data_dir: &Path) -> Value {
    // Load last scan metadata
    let meta = match crate::scan::read_scan_meta(data_dir) {
        Some(m) => m,
        None => return json!({ "hasBaseline": false, "message": "Kein vorheriger Scan vorhanden" }),
    };

    let root_path = meta["root_path"].as_str().unwrap_or("");
    let saved_at = meta["saved_at"].as_i64().unwrap_or(0);
    let old_total_size = meta["total_size"].as_u64().unwrap_or(0);
    let old_files_count = meta["files_count"].as_u64().unwrap_or(0);

    if root_path.is_empty() {
        return json!({ "hasBaseline": false, "message": "Kein Root-Pfad im letzten Scan" });
    }

    // Quick filesystem check: just count entries in top-level directories
    let root = Path::new(root_path);
    if !root.exists() {
        return json!({
            "hasBaseline": true,
            "changeDetected": true,
            "reason": "Scan-Verzeichnis existiert nicht mehr",
            "rootPath": root_path,
            "lastScanMs": saved_at
        });
    }

    // Sample check: read directory modification times of top-level folders
    let mut modified_folders: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(root) {
        let baseline_time = std::time::UNIX_EPOCH + std::time::Duration::from_millis(saved_at as u64);
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if modified > baseline_time {
                        modified_folders.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let change_detected = !modified_folders.is_empty();
    json!({
        "hasBaseline": true,
        "changeDetected": change_detected,
        "modifiedFolders": modified_folders.len(),
        "modifiedFolderPaths": &modified_folders[..modified_folders.len().min(10)],
        "rootPath": root_path,
        "lastScanMs": saved_at,
        "lastTotalSize": old_total_size,
        "lastFilesCount": old_files_count
    })
}

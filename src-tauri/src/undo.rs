use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

static UNDO_LOG: Mutex<Option<UndoLog>> = Mutex::new(None);

const MAX_ENTRIES: usize = 100;
const FILENAME: &str = "undo-log.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UndoEntry {
    pub id: String,
    pub timestamp_ms: i64,
    pub action_type: String,       // "delete_trash", "delete_permanent", "file_move", "toggle_autostart", "delete_autostart", "privacy_setting"
    pub description: String,       // Menschenlesbare Beschreibung (Deutsch)
    pub before_state: Value,       // Vorheriger Zustand (für Undo)
    pub can_undo: bool,            // true = umkehrbar, false = nur Protokoll
    pub undone: bool,              // true = wurde rückgängig gemacht
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct UndoLog {
    version: u32,
    entries: Vec<UndoEntry>,
}

impl UndoLog {
    fn new() -> Self {
        Self { version: 1, entries: Vec::new() }
    }
}

fn get_data_dir() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = std::path::PathBuf::from(appdata).join("speicher-analyse");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn load_log() -> UndoLog {
    let path = get_data_dir().join(FILENAME);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| UndoLog::new()),
        Err(_) => UndoLog::new(),
    }
}

fn save_log(log: &UndoLog) -> Result<(), String> {
    let path = get_data_dir().join(FILENAME);
    let content = serde_json::to_string_pretty(log).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("Undo-Log schreiben fehlgeschlagen: {}", e))
}

fn with_log<F, R>(f: F) -> R
where
    F: FnOnce(&mut UndoLog) -> R,
{
    let mut guard = UNDO_LOG.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(load_log());
    }
    f(guard.as_mut().unwrap())
}

/// Loggt eine Aktion im Undo-Log. Wird von destruktiven Commands aufgerufen.
pub fn log_action(
    action_type: &str,
    description: &str,
    before_state: Value,
    can_undo: bool,
) {
    with_log(|log| {
        let id = format!("undo-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis());
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        log.entries.insert(0, UndoEntry {
            id,
            timestamp_ms,
            action_type: action_type.to_string(),
            description: description.to_string(),
            before_state,
            can_undo,
            undone: false,
        });

        // Max-Einträge einhalten
        if log.entries.len() > MAX_ENTRIES {
            log.entries.truncate(MAX_ENTRIES);
        }

        if let Err(e) = save_log(log) {
            tracing::warn!(error = %e, "Undo-Log konnte nicht gespeichert werden");
        }
    });
}

/// Gibt alle Log-Einträge zurück (neueste zuerst).
pub fn get_log() -> Vec<UndoEntry> {
    with_log(|log| log.entries.clone())
}

/// Markiert einen Eintrag als rückgängig gemacht. Die eigentliche Rückgängig-Aktion
/// wird vom Command ausgeführt (z.B. Papierkorb wiederherstellen).
pub fn mark_undone(id: &str) -> Result<(), String> {
    with_log(|log| {
        let entry = log.entries.iter_mut().find(|e| e.id == id)
            .ok_or_else(|| format!("Eintrag '{}' nicht gefunden", id))?;
        if !entry.can_undo {
            return Err("Diese Aktion kann nicht rückgängig gemacht werden".to_string());
        }
        if entry.undone {
            return Err("Diese Aktion wurde bereits rückgängig gemacht".to_string());
        }
        entry.undone = true;
        save_log(log)?;
        Ok(())
    })
}

/// Gibt einen Eintrag anhand seiner ID zurück (für Undo-Logik).
pub fn get_entry(id: &str) -> Option<UndoEntry> {
    with_log(|log| log.entries.iter().find(|e| e.id == id).cloned())
}

/// Leert das gesamte Undo-Log.
pub fn clear_log() -> Result<(), String> {
    with_log(|log| {
        log.entries.clear();
        save_log(log)
    })
}

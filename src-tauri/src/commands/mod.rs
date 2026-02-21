// =============================================================================
// Security-Architektur — Speicher Analyse
// =============================================================================
//
// Tauri v2 Custom Commands brauchen keine Capabilities — sie werden über die
// `.invoke_handler()` Registrierung in lib.rs automatisch verfügbar gemacht.
// Die Sicherheit liegt daher KOMPLETT auf Command-Ebene:
//
// 1. Pfad-Validierung: `validate_path()` — blockt Systempfade (Windows, Program Files,
//    ProgramData, $Recycle.Bin, EFI, Recovery). Nutzt `canonicalize()` um Symlinks aufzulösen.
//    Laufwerkswurzeln (C:\) sind ebenfalls blockiert.
//
// 2. IP-Validierung: `validate_ip()` — prüft IPv4-Format per Parsing.
//
// 3. PowerShell-Escaping: Jeder String-Parameter wird mit `.replace("'", "''")`
//    escaped bevor er in `format!()` eingesetzt wird. Enum-Parameter (z.B. direction)
//    werden per `match` auf eine Whitelist geprüft.
//
// 4. Read-Logging: Lesezugriffe auf Systempfade werden per `tracing::warn` geloggt
//    (Audit-Trail), aber nicht blockiert (wäre zu restriktiv für Explorer-App).
//
// 5. Capabilities (`src-tauri/capabilities/default.json`): Nur 5 Plugins konfiguriert
//    (shell, dialog, clipboard, global-shortcut, tray). Custom Commands werden nicht
//    über Capabilities geschützt — das ist Tauri v2 By-Design für invoke-Commands.
//
// =============================================================================

// --- Submodule ---
mod cmd_scan;
mod cmd_files;
mod cmd_network;
mod cmd_privacy;
mod cmd_system;
mod cmd_terminal;
mod cmd_misc;
mod cmd_pdf;

// --- Re-export all commands for lib.rs ---
pub use cmd_scan::*;
pub use cmd_files::*;
pub use cmd_network::*;
pub use cmd_privacy::*;
pub use cmd_system::*;
pub use cmd_terminal::*;
pub use cmd_misc::*;
pub use cmd_pdf::*;

// === Shared imports (used by submodules via super::) ===

use serde_json::{json, Value};

// === JSON File Persistence ===

pub(crate) fn get_data_dir() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = std::path::PathBuf::from(appdata).join("speicher-analyse");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub(crate) fn read_json_file(filename: &str) -> Value {
    let path = get_data_dir().join(filename);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(json!({})),
        Err(_) => json!({}),
    }
}

pub(crate) fn write_json_file(filename: &str, data: &Value) -> Result<(), String> {
    let path = get_data_dir().join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("Datei schreiben fehlgeschlagen: {}", e))
}

// === Validation Helpers ===

pub(crate) fn validate_ip(ip: &str) -> Result<(), String> {
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

/// Validiert Pfade für DESTRUKTIVE Operationen (Löschen, Verschieben, Umbenennen).
/// Blockiert Systemverzeichnisse und Laufwerkswurzeln.
/// NICHT für Lese-Operationen verwenden — Lesen darf auch in Systempfaden möglich sein
/// (z.B. Properties, Preview, Scan).
pub(crate) fn validate_path(p: &str) -> Result<(), String> {
    // Canonicalize to resolve symlinks/junctions that could bypass the blocklist
    let canonical = std::fs::canonicalize(p)
        .unwrap_or_else(|_| std::path::PathBuf::from(p));
    let p_lower = canonical.to_string_lossy().to_lowercase().replace('/', "\\");

    // Block drive root (e.g. "C:\") — too dangerous for delete/write
    if p_lower.len() <= 3 {
        return Err(format!("Zugriff auf Laufwerkswurzel verweigert: {}", p));
    }

    let blocked = [
        "\\windows\\",
        "\\program files\\", "\\program files (x86)\\",
        "\\program files", "\\program files (x86)",
        "\\programdata\\", "\\programdata",
        "\\$recycle.bin",
        "\\system volume information",
        "\\recovery", "\\efi",
    ];
    for b in &blocked {
        if p_lower.contains(b) {
            return Err(format!("Zugriff auf Systempfad verweigert: {}", p));
        }
    }
    // Also block if the path IS exactly "Program Files" etc. (without trailing content)
    let path_end = p_lower.rsplit('\\').next().unwrap_or("");
    let blocked_dirs = ["windows", "program files", "program files (x86)", "programdata", "recovery", "efi"];
    if blocked_dirs.contains(&path_end) {
        return Err(format!("Zugriff auf Systempfad verweigert: {}", p));
    }
    Ok(())
}

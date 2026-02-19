use serde_json::{json, Value};
use std::path::Path;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};

// === Terminal (ConPTY via portable-pty) ===

#[tauri::command]
pub async fn terminal_get_shells() -> Result<Value, String> {
    // Dynamically detect available shells
    let mut shells = Vec::new();

    // PowerShell Core (pwsh)
    if which_exists("pwsh.exe") {
        shells.push(json!({ "id": "pwsh", "label": "PowerShell 7", "available": true }));
    }
    // Windows PowerShell
    shells.push(json!({ "id": "powershell", "label": "Windows PowerShell", "available": true }));
    // CMD
    shells.push(json!({ "id": "cmd", "label": "Eingabeaufforderung", "available": true }));
    // Git Bash — try `where git` to find install path dynamically, fallback to common locations
    let git_bash_path = find_git_bash();
    if !git_bash_path.is_empty() {
        shells.push(json!({ "id": "git-bash", "label": "Git Bash", "available": true }));
    }
    // WSL
    if which_exists("wsl.exe") {
        shells.push(json!({ "id": "wsl", "label": "WSL", "available": true }));
    }

    Ok(json!(shells))
}

fn find_git_bash() -> String {
    // Try to find Git's bash.exe dynamically
    if let Ok(output) = std::process::Command::new("where")
        .arg("git")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
    {
        if output.status.success() {
            // `where git` returns e.g. "C:\Program Files\Git\cmd\git.exe"
            // bash.exe is at ../bin/bash.exe relative to cmd/
            if let Some(line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                let git_path = Path::new(line.trim());
                if let Some(parent) = git_path.parent().and_then(|p| p.parent()) {
                    let bash = parent.join("bin").join("bash.exe");
                    if bash.exists() {
                        return bash.to_string_lossy().to_string();
                    }
                }
            }
        }
    }
    // Fallback to common locations
    for path in &[r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files (x86)\Git\bin\bash.exe"] {
        if Path::new(path).exists() {
            return path.to_string();
        }
    }
    String::new()
}

fn which_exists(name: &str) -> bool {
    std::process::Command::new("where")
        .arg(name)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// Terminal sessions: real PTY via ConPTY (portable-pty)
static TERMINAL_SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, TerminalSession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

struct TerminalSession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn std::io::Write + Send>,
}

#[tauri::command]
pub async fn terminal_create(app: tauri::AppHandle, cwd: Option<String>, shell_type: Option<String>, cols: Option<u32>, rows: Option<u32>) -> Result<Value, String> {
    let shell = shell_type.unwrap_or_else(|| "powershell".to_string());
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()));

    let shell_path = match shell.as_str() {
        "pwsh" => "pwsh.exe".to_string(),
        "cmd" => "cmd.exe".to_string(),
        "git-bash" => { let p = find_git_bash(); if p.is_empty() { return Err("Git Bash nicht gefunden".to_string()); } p },
        "wsl" => "wsl.exe".to_string(),
        _ => "powershell.exe".to_string(),
    };

    let pty_size = PtySize {
        rows: rows.unwrap_or(24) as u16,
        cols: cols.unwrap_or(80) as u16,
        pixel_width: 0,
        pixel_height: 0,
    };

    // Open PTY pair (ConPTY on Windows)
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(pty_size)
        .map_err(|e| format!("PTY öffnen fehlgeschlagen: {}", e))?;

    // Build command
    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.cwd(&dir);

    // Spawn the shell in the PTY slave
    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Shell starten fehlgeschlagen: {}", e))?;

    // Drop slave — required for proper EOF detection when child exits
    drop(pair.slave);

    let id = format!("term-{}", std::process::id() ^ (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u32));

    // Get reader/writer from master
    let reader = pair.master.try_clone_reader()
        .map_err(|e| format!("PTY Reader fehlgeschlagen: {}", e))?;
    let writer = pair.master.take_writer()
        .map_err(|e| format!("PTY Writer fehlgeschlagen: {}", e))?;

    // Background thread: read PTY output and emit terminal-data events
    let id_clone = id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("terminal-data", json!({ "id": &id_clone, "data": data }));
                }
                Err(_) => break,
            }
        }
        // PTY closed → process exited
        let code = {
            let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(session) = sessions.get_mut(&id_clone) {
                session.child.try_wait()
                    .ok()
                    .flatten()
                    .map(|s| s.exit_code() as i32)
                    .unwrap_or(-1)
            } else {
                -1
            }
        };
        let _ = app_clone.emit("terminal-exit", json!({ "id": &id_clone, "code": code }));
    });

    let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    sessions.insert(id.clone(), TerminalSession { master: pair.master, child, writer });
    tracing::debug!(id = %id, shell = %shell_path, cols = pty_size.cols, rows = pty_size.rows, "PTY-Terminal erstellt");
    Ok(json!({ "id": id, "shell": shell_path, "cwd": dir }))
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<Value, String> {
    let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = sessions.get_mut(&id) {
        use std::io::Write;
        match session.writer.write_all(data.as_bytes()) {
            Ok(_) => { let _ = session.writer.flush(); Ok(json!({ "success": true })) }
            Err(e) => Ok(json!({ "success": false, "error": e.to_string() }))
        }
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u32, rows: u32) -> Result<Value, String> {
    let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = sessions.get_mut(&id) {
        session.master.resize(PtySize {
            rows: rows as u16,
            cols: cols as u16,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| format!("Resize fehlgeschlagen: {}", e))?;
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_destroy(id: String) -> Result<Value, String> {
    let session_opt = {
        let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
        sessions.remove(&id)
    };
    if let Some(mut session) = session_opt {
        // kill + wait can block briefly, run outside mutex
        tokio::task::spawn_blocking(move || {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }).await.map_err(|e| e.to_string())?;
        tracing::debug!(id = %id, "PTY-Terminal beendet");
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_open_external(cwd: Option<String>) -> Result<Value, String> {
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_default());
    let dir_escaped = dir.replace("'", "''");
    // Try Windows Terminal first, fall back to cmd.exe
    let script = format!(
        r#"try {{ Start-Process wt -ArgumentList '-d', '{}' -EA Stop }} catch {{ Start-Process cmd -ArgumentList '/k', 'cd /d {}' }}"#,
        dir_escaped, dir_escaped
    );
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

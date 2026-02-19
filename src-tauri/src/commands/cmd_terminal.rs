use serde_json::{json, Value};
use std::path::Path;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;

// === Terminal (stubs — needs native PTY) ===

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

// Terminal sessions: piped stdin/stdout processes
static TERMINAL_SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, TerminalSession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

struct TerminalSession {
    child: std::process::Child,
    stdin: Option<std::process::ChildStdin>,
}

#[tauri::command]
pub async fn terminal_create(app: tauri::AppHandle, cwd: Option<String>, shell_type: Option<String>, _cols: Option<u32>, _rows: Option<u32>) -> Result<Value, String> {
    let shell = shell_type.unwrap_or_else(|| "powershell".to_string());
    let dir = cwd.unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()));

    let shell_path = match shell.as_str() {
        "pwsh" => "pwsh.exe".to_string(),
        "cmd" => "cmd.exe".to_string(),
        "git-bash" => { let p = find_git_bash(); if p.is_empty() { return Err("Git Bash nicht gefunden".to_string()); } p },
        "wsl" => "wsl.exe".to_string(),
        _ => "powershell.exe".to_string(),
    };

    let mut cmd = std::process::Command::new(&shell_path);
    cmd.current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let id = format!("term-{}", child.id());
            let mut stdin = child.stdin.take();
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Background thread: read stdout and emit terminal-data events
            if let Some(stdout) = stdout {
                let id_out = id.clone();
                let app_out = app.clone();
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut reader = std::io::BufReader::new(stdout);
                    let mut buf = [0u8; 4096];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = app_out.emit("terminal-data", json!({ "id": &id_out, "data": data }));
                            }
                            Err(_) => break,
                        }
                    }
                    // stdout closed → process likely exited, get exit code
                    let code = {
                        let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
                        sessions.get_mut(&id_out)
                            .and_then(|s| s.child.try_wait().ok().flatten())
                            .and_then(|s| s.code())
                            .unwrap_or(-1)
                    };
                    let _ = app_out.emit("terminal-exit", json!({ "id": &id_out, "code": code }));
                });
            }

            // Background thread: read stderr and emit as terminal-data
            if let Some(stderr) = stderr {
                let id_err = id.clone();
                let app_err = app.clone();
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut reader = std::io::BufReader::new(stderr);
                    let mut buf = [0u8; 4096];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = app_err.emit("terminal-data", json!({ "id": &id_err, "data": data }));
                            }
                            Err(_) => break,
                        }
                    }
                });
            }

            // Send UTF-8 encoding init commands immediately after spawn
            if let Some(ref mut stdin_ref) = stdin {
                use std::io::Write;
                let init_cmd = match shell.as_str() {
                    "cmd" => "chcp 65001 >nul\r\n".to_string(),
                    "wsl" | "git-bash" => String::new(), // Already UTF-8
                    _ => {
                        // PowerShell (both powershell.exe and pwsh.exe)
                        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; cls\r\n".to_string()
                    }
                };
                if !init_cmd.is_empty() {
                    let _ = stdin_ref.write_all(init_cmd.as_bytes());
                    let _ = stdin_ref.flush();
                }
            }

            let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
            sessions.insert(id.clone(), TerminalSession { child, stdin });
            tracing::debug!(id = %id, shell = %shell_path, "Terminal erstellt");
            Ok(json!({ "id": id, "shell": shell_path, "cwd": dir }))
        }
        Err(e) => Err(format!("Terminal konnte nicht erstellt werden: {}", e))
    }
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<Value, String> {
    let mut sessions = TERMINAL_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = sessions.get_mut(&id) {
        if let Some(ref mut stdin) = session.stdin {
            use std::io::Write;
            match stdin.write_all(data.as_bytes()) {
                Ok(_) => { let _ = stdin.flush(); Ok(json!({ "success": true })) }
                Err(e) => Ok(json!({ "success": false, "error": e.to_string() }))
            }
        } else {
            Ok(json!({ "success": false, "error": "stdin nicht verfügbar" }))
        }
    } else {
        Ok(json!({ "success": false, "error": "Terminal nicht gefunden" }))
    }
}

#[tauri::command]
pub async fn terminal_resize(_id: String, _cols: u32, _rows: u32) -> Result<Value, String> {
    // Piped terminals don't support resize — would need ConPTY/portable-pty for true PTY
    Ok(json!({ "stub": true, "message": "Terminal-Resize benötigt ConPTY/portable-pty (Piped I/O unterstützt kein Resize)" }))
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
        tracing::debug!(id = %id, "Terminal beendet");
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


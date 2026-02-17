use std::process::Stdio;
use tokio::process::Command;
#[cfg(windows)]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Truncate a script for logging (first ~120 chars, UTF-8 safe)
fn script_preview(script: &str) -> String {
    let trimmed = script.trim();
    if trimmed.len() <= 120 {
        trimmed.to_string()
    } else {
        // Find a valid char boundary at or before byte 120
        let end = (0..=120).rev().find(|&i| trimmed.is_char_boundary(i)).unwrap_or(0);
        format!("{}...", &trimmed[..end])
    }
}

/// Safely truncate a UTF-8 string to at most `max_bytes` bytes at a char boundary
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes { return s; }
    let end = (0..=max_bytes).rev().find(|&i| s.is_char_boundary(i)).unwrap_or(0);
    &s[..end]
}

/// Run a PowerShell script and return stdout as String.
/// Uses UTF-8 output encoding, 30s timeout equivalent.
/// CREATE_NO_WINDOW prevents visible PowerShell console windows.
pub async fn run_ps(script: &str) -> Result<String, String> {
    let preview = script_preview(script);
    tracing::debug!(script = %preview, "PowerShell starte");

    let start = std::time::Instant::now();
    let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
    let full_script = format!("{}{}", utf8_prefix, script);

    let mut cmd = Command::new("powershell.exe");
    cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-Command", &full_script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        cmd.output()
    )
        .await
        .map_err(|_| {
            let elapsed = start.elapsed();
            tracing::error!(script = %preview, elapsed_ms = elapsed.as_millis(), "PowerShell TIMEOUT nach 30s");
            "PowerShell-Timeout nach 30 Sekunden".to_string()
        })?
        .map_err(|e| {
            tracing::error!(script = %preview, error = %e, "PowerShell Start fehlgeschlagen");
            format!("PowerShell start failed: {}", e)
        })?;

    let elapsed = start.elapsed();

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        tracing::debug!(
            script = %preview,
            elapsed_ms = elapsed.as_millis(),
            output_len = stdout.len(),
            "PowerShell OK"
        );
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        tracing::warn!(
            script = %preview,
            elapsed_ms = elapsed.as_millis(),
            stderr = %stderr.trim(),
            "PowerShell Fehler"
        );
        Err(format!("PowerShell error: {} {}", stderr.trim(), stdout.trim()))
    }
}

/// Run PowerShell and parse output as JSON Value
pub async fn run_ps_json(script: &str) -> Result<serde_json::Value, String> {
    let output = run_ps(script).await?;
    if output.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&output).map_err(|e| {
        let preview = safe_truncate(&output, 200);
        tracing::warn!(error = %e, output_start = %preview, "JSON-Parse fehlgeschlagen");
        format!("JSON parse error: {} — output: {}", e, preview)
    })
}

/// Run PowerShell, parse as JSON, and ensure result is always an array.
/// PowerShell's ConvertTo-Json returns a single object (not array) when there's only one item.
pub async fn run_ps_json_array(script: &str) -> Result<serde_json::Value, String> {
    let result = run_ps_json(script).await?;
    if result.is_array() {
        Ok(result)
    } else if result.is_null() {
        Ok(serde_json::json!([]))
    } else {
        Ok(serde_json::json!([result]))
    }
}

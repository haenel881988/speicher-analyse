use std::process::Stdio;
use tokio::process::Command;

/// Run a PowerShell script and return stdout as String.
/// Uses UTF-8 output encoding, 30s timeout equivalent.
pub async fn run_ps(script: &str) -> Result<String, String> {
    let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
    let full_script = format!("{}{}", utf8_prefix, script);

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-Command", &full_script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("PowerShell start failed: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("PowerShell error: {} {}", stderr.trim(), stdout.trim()))
    }
}

/// Run PowerShell and parse output as JSON Value
pub async fn run_ps_json(script: &str) -> Result<serde_json::Value, String> {
    let output = run_ps(script).await?;
    if output.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&output).map_err(|e| format!("JSON parse error: {} — output: {}", e, &output[..output.len().min(200)]))
}

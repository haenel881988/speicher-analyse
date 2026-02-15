use std::process::Stdio;
use tokio::process::Command;
#[cfg(windows)]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Run a PowerShell script and return stdout as String.
/// Uses UTF-8 output encoding, 30s timeout equivalent.
/// CREATE_NO_WINDOW prevents visible PowerShell console windows.
pub async fn run_ps(script: &str) -> Result<String, String> {
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

    let output = cmd.output()
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

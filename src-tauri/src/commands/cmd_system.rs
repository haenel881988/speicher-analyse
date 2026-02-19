use serde_json::{json, Value};
use std::path::Path;
use super::{read_json_file, write_json_file, validate_path};

// === Cleanup ===

#[tauri::command]
pub async fn scan_cleanup_categories(_scan_id: String) -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$cats = @()
$temp = [System.IO.Path]::GetTempPath()
$tempFiles = @(Get-ChildItem -Path $temp -Recurse -Force -File -ErrorAction SilentlyContinue)
$tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum
$cats += [PSCustomObject]@{ id='temp'; name='Temporäre Dateien'; icon='trash'; description='Temporäre Dateien die nicht mehr benötigt werden'; totalSize=[long]$tempSize; fileCount=$tempFiles.Count; requiresAdmin=$false; paths=@([PSCustomObject]@{path=$temp;size=[long]$tempSize}) }
$winTemp = "$env:SystemRoot\Temp"
if (Test-Path $winTemp) {
    $wtFiles = @(Get-ChildItem -Path $winTemp -Recurse -Force -File -ErrorAction SilentlyContinue)
    $wtSize = ($wtFiles | Measure-Object -Property Length -Sum).Sum
    $cats += [PSCustomObject]@{ id='wintemp'; name='Windows Temp'; icon='windows'; description='Temporäre Windows-Systemdateien'; totalSize=[long]$wtSize; fileCount=$wtFiles.Count; requiresAdmin=$true; paths=@([PSCustomObject]@{path=$winTemp;size=[long]$wtSize}) }
}
$thumbs = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
if (Test-Path $thumbs) {
    $thFiles = @(Get-ChildItem -Path $thumbs -Filter 'thumbcache_*' -Force -File -ErrorAction SilentlyContinue)
    $thSize = ($thFiles | Measure-Object -Property Length -Sum).Sum
    $cats += [PSCustomObject]@{ id='thumbnails'; name='Miniaturansichten'; icon='image'; description='Zwischengespeicherte Vorschaubilder'; totalSize=[long]$thSize; fileCount=$thFiles.Count; requiresAdmin=$false; paths=@([PSCustomObject]@{path=$thumbs;size=[long]$thSize}) }
}
$cats | ConvertTo-Json -Depth 3 -Compress"#
    ).await
}

#[tauri::command]
pub async fn clean_category(_category_id: String, paths: Vec<String>) -> Result<Value, String> {
    tracing::info!(category = %_category_id, count = paths.len(), "Bereinigung Kategorie");
    let mut deleted_count: u64 = 0;
    let mut errors: Vec<Value> = Vec::new();
    for p in &paths {
        if let Err(e) = validate_path(p) {
            errors.push(json!({"path": p, "error": e}));
            continue;
        }
        let path = Path::new(p);
        let result = if path.is_dir() {
            // Count files before deleting
            let count = walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).count() as u64;
            match tokio::fs::remove_dir_all(path).await {
                Ok(_) => { deleted_count += count; Ok(()) }
                Err(e) => Err(e)
            }
        } else {
            match tokio::fs::remove_file(path).await {
                Ok(_) => { deleted_count += 1; Ok(()) }
                Err(e) => Err(e)
            }
        };
        if let Err(e) = result {
            errors.push(json!({"path": p, "error": e.to_string()}));
        }
    }
    Ok(json!({ "success": true, "deletedCount": deleted_count, "errors": errors }))
}

// === Autostart ===

#[tauri::command]
pub async fn get_autostart_entries() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$entries = @()
# Registry Run keys
$regPaths = @(
    @{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';s='registry';l='HKCU\Run'},
    @{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';s='registry';l='HKLM\Run'},
    @{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce';s='registry';l='HKCU\RunOnce'},
    @{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce';s='registry';l='HKLM\RunOnce'}
)
foreach ($rp in $regPaths) {
    $props = Get-ItemProperty $rp.p -ErrorAction SilentlyContinue
    if ($props) {
        $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
            $cmd = "$($_.Value)"
            $exe = ($cmd -replace '"','') -split '\s' | Select-Object -First 1
            $exists = if ($exe) { Test-Path $exe -EA SilentlyContinue } else { $false }
            $entries += [PSCustomObject]@{ name=$_.Name; command=$cmd; source=$rp.s; locationLabel=$rp.l; enabled=$true; exists=$exists }
        }
    }
}
# Startup folder
$startupPath = [Environment]::GetFolderPath('Startup')
if (Test-Path $startupPath) {
    Get-ChildItem $startupPath -File -ErrorAction SilentlyContinue | ForEach-Object {
        $entries += [PSCustomObject]@{ name=$_.BaseName; command=$_.FullName; source='folder'; locationLabel='Autostart-Ordner'; enabled=$true; exists=$true }
    }
}
$entries | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn toggle_autostart(entry: Value, enabled: bool) -> Result<Value, String> {
    let source = entry.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let command = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let location_label = entry.get("locationLabel").and_then(|v| v.as_str()).unwrap_or("");

    match source {
        "registry" => {
            // Determine registry path from locationLabel (specific matches FIRST!)
            let reg_path = if location_label.contains("HKCU\\RunOnce") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else if location_label.contains("HKLM\\RunOnce") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else if location_label.contains("HKCU\\Run") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKLM\\Run") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else {
                return Err("Unbekannter Registry-Pfad".to_string());
            };
            let safe_name = name.replace("'", "''");
            let safe_cmd = command.replace("'", "''");
            if enabled {
                // Re-enable: set value back
                let script = format!("Set-ItemProperty -Path '{}' -Name '{}' -Value '{}'", reg_path, safe_name, safe_cmd);
                crate::ps::run_ps(&script).await?;
            } else {
                // Disable: remove value (moves to a disabled subkey is complex, just remove for now)
                let script = format!("Remove-ItemProperty -Path '{}' -Name '{}' -Force -ErrorAction SilentlyContinue", reg_path, safe_name);
                crate::ps::run_ps(&script).await?;
            }
            Ok(json!({ "success": true }))
        }
        "folder" => {
            // Startup folder: rename file to add/remove .disabled extension
            let safe_cmd = command.replace("'", "''");
            if enabled {
                let script = format!("if (Test-Path '{}.disabled') {{ Rename-Item '{}.disabled' -NewName (Split-Path '{}' -Leaf) }}", safe_cmd, safe_cmd, safe_cmd);
                crate::ps::run_ps(&script).await?;
            } else {
                let script = format!("if (Test-Path '{}') {{ Rename-Item '{}' -NewName ((Split-Path '{}' -Leaf) + '.disabled') }}", safe_cmd, safe_cmd, safe_cmd);
                crate::ps::run_ps(&script).await?;
            }
            Ok(json!({ "success": true }))
        }
        _ => Err(format!("Unbekannte Autostart-Quelle: {}", source)),
    }
}

#[tauri::command]
pub async fn delete_autostart(entry: Value) -> Result<Value, String> {
    let source = entry.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let command = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let location_label = entry.get("locationLabel").and_then(|v| v.as_str()).unwrap_or("");

    match source {
        "registry" => {
            // Specific matches FIRST (RunOnce before Run)
            let reg_path = if location_label.contains("HKCU\\RunOnce") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else if location_label.contains("HKLM\\RunOnce") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            } else if location_label.contains("HKCU\\Run") {
                "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else if location_label.contains("HKLM\\Run") {
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
            } else {
                return Err("Unbekannter Registry-Pfad".to_string());
            };
            let safe_name = name.replace("'", "''");
            let script = format!("Remove-ItemProperty -Path '{}' -Name '{}' -Force", reg_path, safe_name);
            crate::ps::run_ps(&script).await?;
            Ok(json!({ "success": true }))
        }
        "folder" => {
            let safe_cmd = command.replace("'", "''");
            let script = format!("Remove-Item -LiteralPath '{}' -Force", safe_cmd);
            crate::ps::run_ps(&script).await?;
            Ok(json!({ "success": true }))
        }
        _ => Err(format!("Unbekannte Autostart-Quelle: {}", source)),
    }
}

// === Services ===

#[tauri::command]
pub async fn get_services() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-Service | ForEach-Object {
$st = switch([int]$_.Status){1{'Stopped'}2{'StartPending'}3{'StopPending'}4{'Running'}5{'ContinuePending'}6{'PausePending'}7{'Paused'}default{'Unknown'}}
$stt = switch([int]$_.StartType){0{'Boot'}1{'System'}2{'Automatic'}3{'Manual'}4{'Disabled'}default{'Unknown'}}
[PSCustomObject]@{name=$_.Name;displayName=$_.DisplayName;status=$st;startType=$stt}
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn control_service(name: String, action: String) -> Result<Value, String> {
    tracing::info!(service = %name, action = %action, "Service-Steuerung");
    let safe_name = name.replace("'", "''");
    let cmd = match action.as_str() {
        "start" => format!("Start-Service '{}'", safe_name),
        "stop" => format!("Stop-Service '{}' -Force", safe_name),
        "restart" => format!("Restart-Service '{}' -Force", safe_name),
        _ => return Err(format!("Unknown action: {}", action)),
    };
    crate::ps::run_ps(&cmd).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn set_service_start_type(name: String, start_type: String) -> Result<Value, String> {
    tracing::info!(service = %name, start_type = %start_type, "Service-Starttyp ändern");
    // Frontend sends 'auto'|'demand'|'disabled', PowerShell needs 'Automatic'|'Manual'|'Disabled'
    let ps_type = match start_type.as_str() {
        "auto" => "Automatic",
        "demand" => "Manual",
        "disabled" => "Disabled",
        _ => return Err(format!("Ungültiger Start-Typ: '{}'. Erlaubt: auto, demand, disabled", start_type)),
    };
    let safe_name = name.replace("'", "''");
    crate::ps::run_ps(&format!("Set-Service '{}' -StartupType '{}'", safe_name, ps_type)).await?;
    Ok(json!({ "success": true }))
}

// === Optimizer ===

#[tauri::command]
pub async fn get_optimizations() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$opts = @()
$vfx = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' -ErrorAction SilentlyContinue).VisualFXSetting
$opts += [PSCustomObject]@{ id='visual_effects'; title='Visuelle Effekte optimieren'; name='Visuelle Effekte optimieren'; description='Deaktiviert Animationen und Transparenz für bessere Performance'; applied=($vfx -eq 2); category='performance'; impact='medium'; savingsBytes=0; requiresAdmin=$false; reversible=$true }
$prefetchSize = 0; try { $prefetchSize = [long](Get-ChildItem "$env:SystemRoot\Prefetch" -Force -File -EA Stop | Measure-Object -Property Length -Sum).Sum } catch {}
$opts += [PSCustomObject]@{ id='prefetch'; title='Prefetch bereinigen'; name='Prefetch bereinigen'; description='Löscht alte Prefetch-Daten um Speicherplatz freizugeben'; applied=$false; category='cleanup'; impact='low'; savingsBytes=$prefetchSize; requiresAdmin=$true; reversible=$false }
$tpEnabled = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize' -EA SilentlyContinue).EnableTransparency
$opts += [PSCustomObject]@{ id='transparency'; title='Transparenz deaktivieren'; name='Transparenz deaktivieren'; description='Deaktiviert Transparenzeffekte für bessere Performance'; applied=($tpEnabled -eq 0); category='performance'; impact='low'; savingsBytes=0; requiresAdmin=$false; reversible=$true }
$opts | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn apply_optimization(id: String) -> Result<Value, String> {
    tracing::info!(optimization = %id, "Optimierung anwenden");
    let script = match id.as_str() {
        "visual_effects" => {
            r#"Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' -Name 'VisualFXSetting' -Value 2 -Type DWord -Force
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'UserPreferencesMask' -Value ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) -Type Binary -Force"#.to_string()
        }
        "prefetch" => {
            r#"Remove-Item "$env:SystemRoot\Prefetch\*" -Force -Recurse -ErrorAction SilentlyContinue"#.to_string()
        }
        "transparency" => {
            r#"Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'EnableTransparency' -Value 0 -Type DWord -Force"#.to_string()
        }
        _ => return Err(format!("Unbekannte Optimierung: {}", id)),
    };
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if e.contains("Zugriff") || e.contains("Access") || e.contains("Administrator") {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

// === Bloatware ===

#[tauri::command]
pub async fn scan_bloatware() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$known = @{
'Microsoft.BingWeather'='unnötig';'Microsoft.GetHelp'='unnötig';'Microsoft.Getstarted'='unnötig';
'Microsoft.MicrosoftOfficeHub'='unnötig';'Microsoft.MicrosoftSolitaireCollection'='unnötig';
'Microsoft.People'='unnötig';'Microsoft.SkypeApp'='unnötig';'Microsoft.WindowsFeedbackHub'='unnötig';
'Microsoft.Xbox.TCUI'='unnötig';'Microsoft.XboxApp'='unnötig';'Microsoft.XboxGameOverlay'='unnötig';
'Microsoft.ZuneMusic'='unnötig';'Microsoft.ZuneVideo'='unnötig';'Microsoft.MixedReality.Portal'='unnötig';
'king.com.CandyCrushSaga'='fragwürdig';'king.com.CandyCrushSodaSaga'='fragwürdig';
'SpotifyAB.SpotifyMusic'='fragwürdig';'Facebook.Facebook'='fragwürdig'
}
Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -ne 'System' } | ForEach-Object {
    $cat = if($known[$_.Name]){$known[$_.Name]}else{'sonstiges'}
    $size = 0; if($_.InstallLocation -and (Test-Path $_.InstallLocation)) { try { $size = [long](Get-ChildItem $_.InstallLocation -Recurse -Force -File -EA Stop | Measure-Object Length -Sum).Sum } catch {} }
    [PSCustomObject]@{ programName=$_.Name; packageFullName=$_.PackageFullName; publisher=$_.Publisher; description=''; category=$cat; estimatedSize=$size; installDate='' }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn uninstall_bloatware(entry: Value) -> Result<Value, String> {
    tracing::warn!(package = ?entry.get("packageFullName"), "Bloatware deinstallieren");
    if let Some(pkg) = entry.get("packageFullName").and_then(|v| v.as_str()) {
        if pkg.is_empty() {
            return Err("packageFullName ist leer".to_string());
        }
        let safe_pkg = pkg.replace("'", "''");
        crate::ps::run_ps(&format!("Remove-AppxPackage '{}'", safe_pkg)).await?;
        Ok(json!({ "success": true }))
    } else {
        Err("packageFullName fehlt im Eintrag".to_string())
    }
}

// === Updates ===

#[tauri::command]
pub async fn check_windows_updates() -> Result<Value, String> {
    // COM object can be very slow — 120s timeout
    crate::ps::run_ps_json_array_timeout(
        r#"try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $results = $searcher.Search('IsInstalled=0')
    @($results.Updates | ForEach-Object { [PSCustomObject]@{ Title=$_.Title; KBArticleIDs=($_.KBArticleIDs -join ','); Size=[long]$_.MaxDownloadSize; Severity="$($_.MsrcSeverity)"; IsMandatory=$_.IsMandatory } }) | ConvertTo-Json -Compress
} catch { ConvertTo-Json @() -Compress }"#, 120
    ).await
}

#[tauri::command]
pub async fn get_update_history() -> Result<Value, String> {
    // COM object can be slow — 120s timeout
    crate::ps::run_ps_json_array_timeout(
        r#"try {
$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$count = $searcher.GetTotalHistoryCount()
@($searcher.QueryHistory(0, [Math]::Min($count, 50)) | ForEach-Object {
    $st = switch([int]$_.ResultCode){0{'NotStarted'}1{'InProgress'}2{'Succeeded'}3{'SucceededWithErrors'}4{'Failed'}5{'Aborted'}default{'Unknown'}}
    [PSCustomObject]@{ Date=$_.Date.ToString('o'); Title=$_.Title; ResultCode=[int]$_.ResultCode; Status=$st }
}) | ConvertTo-Json -Compress
} catch { ConvertTo-Json @() -Compress }"#, 120
    ).await
}

#[tauri::command]
pub async fn check_software_updates() -> Result<Value, String> {
    // winget can be slow on first run — 120s timeout
    crate::ps::run_ps_json_array_timeout(
        r#"try {
    $output = winget upgrade --accept-source-agreements 2>$null
    $lines = $output -split "`n" | Where-Object { $_ -match '\S' }
    $headerIdx = -1
    for ($i=0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^Name\s+') { $headerIdx = $i; break } }
    if ($headerIdx -lt 0) { ConvertTo-Json @() -Compress; return }
    $sepIdx = $headerIdx + 1
    $dataLines = $lines[($sepIdx+1)..($lines.Count-2)]
    $results = @()
    foreach ($line in $dataLines) {
        if ($line -match '^(\S.+?)\s{2,}(\S+)\s+(\S+)\s+(\S+)\s*(.*)$') {
            $results += [PSCustomObject]@{ name=$Matches[1].Trim(); id=$Matches[2]; currentVersion=$Matches[3]; availableVersion=$Matches[4]; source=$Matches[5].Trim() }
        }
    }
    $results | ConvertTo-Json -Compress
} catch { ConvertTo-Json @() -Compress }"#, 120
    ).await
}

#[tauri::command]
pub async fn update_software(package_id: String) -> Result<Value, String> {
    let safe_id = package_id.replace("'", "''");
    // winget upgrade can take minutes — 300s timeout
    crate::ps::run_ps_with_timeout(&format!("winget upgrade '{}' --accept-package-agreements --accept-source-agreements", safe_id), 300).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn get_driver_info() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$now = Get-Date
Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Select-Object -First 50 | ForEach-Object {
    $dd = $_.DriverDate
    $ageY = if($dd) { [math]::Round(($now - $dd).TotalDays / 365.25, 1) } else { $null }
    $isOld = if($ageY) { $ageY -gt 3 } else { $false }
    [PSCustomObject]@{ name=$_.DeviceName; manufacturer=$_.Manufacturer; version=$_.DriverVersion; date=if($dd){$dd.ToString('o')}else{''}; ageYears=$ageY; isOld=$isOld; supportUrl='' }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cs = Get-CimInstance Win32_ComputerSystem
[PSCustomObject]@{ Manufacturer=$cs.Manufacturer; Model=$cs.Model; SerialNumber=(Get-CimInstance Win32_BIOS).SerialNumber } | ConvertTo-Json -Compress"#
    ).await
}


// === System ===

#[tauri::command]
pub async fn get_system_capabilities() -> Result<Value, String> {
    let result = crate::ps::run_ps_json(
        r#"$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$bat = $null -ne (Get-CimInstance Win32_Battery -EA SilentlyContinue)
$wg = $null -ne (Get-Command winget -EA SilentlyContinue)
[PSCustomObject]@{ isAdmin=$admin; hasBattery=$bat; wingetAvailable=$wg; platform='win32' } | ConvertTo-Json -Compress"#
    ).await;
    match result {
        Ok(v) => Ok(v),
        Err(_) => Ok(json!({ "isAdmin": false, "hasBattery": false, "wingetAvailable": false, "platform": "win32" })),
    }
}

#[tauri::command]
pub async fn get_battery_status() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($bat) { [PSCustomObject]@{ hasBattery=$true; percent=$bat.EstimatedChargeRemaining; charging=($bat.BatteryStatus -eq 2); onBattery=($bat.BatteryStatus -ne 2) } | ConvertTo-Json -Compress }
else { '{"hasBattery":false,"onBattery":false}' }"#
    ).await
}

// === Platform ===

// === System Profile ===

#[tauri::command]
pub async fn get_system_profile() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController)
$biosI = Get-CimInstance Win32_BIOS
$mb = Get-CimInstance Win32_BaseBoard
$rams = @(Get-CimInstance Win32_PhysicalMemory)
$disksP = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
$nics = @(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object {$_.IPEnabled})
function fD($d){if($d){$d.ToString('dd.MM.yyyy HH:mm')}else{''}}
$ramT=[long]$cs.TotalPhysicalMemory
$ramF=[long]$os.FreePhysicalMemory*1024
$ramU=$ramT-$ramF
$upStr=''
if($os.LastBootUpTime){$sp=(Get-Date)-$os.LastBootUpTime;$upStr="$([int]$sp.TotalDays) Tage, $($sp.Hours) Std., $($sp.Minutes) Min."}
$r=[PSCustomObject]@{
computer=[PSCustomObject]@{name=$cs.Name;manufacturer=$cs.Manufacturer;model=$cs.Model;systemType=$cs.SystemType;domain=$cs.Domain;user="$($cs.UserName)"}
os=[PSCustomObject]@{name=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture;installDate=fD $os.InstallDate;lastBoot=fD $os.LastBootUpTime;windowsDir=$os.WindowsDirectory;uptime=$upStr;productKeyPartial=$(try{$pk=(Get-CimInstance SoftwareLicensingProduct -EA Stop|Where-Object{$_.PartialProductKey -and $_.LicenseStatus -eq 1}|Select-Object -First 1).PartialProductKey;$pk}catch{$null})}
cpu=[PSCustomObject]@{name=$cpu.Name;manufacturer=$cpu.Manufacturer;cores=[int]$cpu.NumberOfCores;threads=[int]$cpu.NumberOfLogicalProcessors;maxClockMHz=[int]$cpu.MaxClockSpeed;currentClockMHz=[int]$cpu.CurrentClockSpeed;l2CacheKB=[int]$cpu.L2CacheSize;l3CacheKB=[int]$cpu.L3CacheSize}
gpu=@($gpus|ForEach-Object{[PSCustomObject]@{name=$_.Name;manufacturer=$_.AdapterCompatibility;driverVersion=$_.DriverVersion;vramBytes=[long]$_.AdapterRAM;resolution="$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)";refreshRate=[int]$_.CurrentRefreshRate}})
ram=[PSCustomObject]@{totalBytes=$ramT;totalFormatted="$([math]::Round($ramT/1GB,1)) GB";usedBytes=$ramU;freeBytes=$ramF;sticks=@($rams|ForEach-Object{[PSCustomObject]@{manufacturer=$_.Manufacturer;capacityBytes=[long]$_.Capacity;capacityFormatted="$([math]::Round($_.Capacity/1GB,1)) GB";speedMHz=[int]$_.Speed;bank=$_.BankLabel}})}
disks=@($disksP|ForEach-Object{$dk=Get-Disk -Number $_.DeviceId -EA SilentlyContinue;[PSCustomObject]@{model=$_.FriendlyName;sizeBytes=[long]$_.Size;sizeFormatted="$([math]::Round($_.Size/1GB,1)) GB";mediaType=switch([int]$_.MediaType){3{'HDD'}4{'SSD'}default{'Unknown'}};interface="$($_.BusType)";serial="$($_.SerialNumber)".Trim();partitions=if($dk){[int]$dk.NumberOfPartitions}else{0}}})
network=@($nics|ForEach-Object{[PSCustomObject]@{description=$_.Description;mac=$_.MACAddress;ip=@($_.IPAddress);subnet=@($_.IPSubnet);gateway=@($_.DefaultIPGateway);dhcp=$_.DHCPEnabled;dns=@($_.DNSServerSearchOrder)}})
bios=[PSCustomObject]@{serialNumber=$biosI.SerialNumber;manufacturer=$biosI.Manufacturer;version=$biosI.SMBIOSBIOSVersion;releaseDate=fD $biosI.ReleaseDate}
motherboard=[PSCustomObject]@{manufacturer=$mb.Manufacturer;product=$mb.Product;serialNumber=$mb.SerialNumber;version=$mb.Version}
links=@()
}
# Dynamic manufacturer links
$mfr = "$($cs.Manufacturer)".ToLower()
$gpuMfr = ($gpus | ForEach-Object { "$($_.AdapterCompatibility)".ToLower() }) -join ','
$cpuMfr = "$($cpu.Manufacturer)".ToLower()
if($mfr -like '*lenovo*'){$r.links += [PSCustomObject]@{label='Lenovo Support';url='https://support.lenovo.com/'}}
if($mfr -like '*dell*'){$r.links += [PSCustomObject]@{label='Dell Support';url='https://www.dell.com/support/home/'}}
if($mfr -like '*hp*' -or $mfr -like '*hewlett*'){$r.links += [PSCustomObject]@{label='HP Support';url='https://support.hp.com/'}}
if($mfr -like '*asus*'){$r.links += [PSCustomObject]@{label='ASUS Support';url='https://www.asus.com/support/'}}
if($mfr -like '*acer*'){$r.links += [PSCustomObject]@{label='Acer Support';url='https://www.acer.com/support/'}}
if($mfr -like '*msi*' -or $mfr -like '*micro-star*'){$r.links += [PSCustomObject]@{label='MSI Support';url='https://www.msi.com/support'}}
if($mfr -like '*samsung*'){$r.links += [PSCustomObject]@{label='Samsung Support';url='https://www.samsung.com/support/'}}
if($mfr -like '*microsoft*'){$r.links += [PSCustomObject]@{label='Microsoft Support';url='https://support.microsoft.com/'}}
if($cpuMfr -like '*intel*'){$r.links += [PSCustomObject]@{label='Intel Treiber-Assistent';url='https://www.intel.com/content/www/us/en/support/detect.html'}}
if($cpuMfr -like '*amd*'){$r.links += [PSCustomObject]@{label='AMD Treiber';url='https://www.amd.com/en/support'}}
if($gpuMfr -like '*nvidia*'){$r.links += [PSCustomObject]@{label='NVIDIA Treiber';url='https://www.nvidia.com/Download/index.aspx'}}
if($gpuMfr -like '*amd*' -or $gpuMfr -like '*ati*'){$r.links += [PSCustomObject]@{label='AMD Grafik-Treiber';url='https://www.amd.com/en/support'}}
$r | ConvertTo-Json -Depth 4 -Compress"#
    ).await
}

// === S.M.A.R.T. ===

#[tauri::command]
pub async fn get_disk_health() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"Get-PhysicalDisk | ForEach-Object {
$rel = $_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
$dk = Get-Disk -Number $_.DeviceId -ErrorAction SilentlyContinue
$temp = if($rel){$rel.Temperature}else{$null}
$wear = if($rel){$rel.Wear}else{$null}
$re = if($rel){[long]$rel.ReadErrorsTotal}else{0}
$we = if($rel){[long]$rel.WriteErrorsTotal}else{0}
$poh = if($rel){[long]$rel.PowerOnHours}else{$null}
$mt = switch([int]$_.MediaType){3{'HDD'}4{'SSD'}5{'SCM'}default{if($_.BusType -eq 17){'NVMe'}else{'Unknown'}}}
$bt = switch([int]$_.BusType){1{'SCSI'}2{'ATAPI'}3{'ATA'}5{'1394'}6{'SSA'}7{'Fibre'}8{'USB'}9{'RAID'}11{'SATA'}17{'NVMe'}default{"$($_.BusType)"}}
$score=100
if("$($_.HealthStatus)" -ne 'Healthy'){$score-=30}
if($re -gt 0){$score-=15}
if($we -gt 0){$score-=15}
if($temp -and $temp -gt 50){$score-=10}
if($wear -and $wear -gt 80){$score-=20}
if($poh -and $poh -gt 35000){$score-=10}
if($score -lt 0){$score=0}
$risk = if($score -ge 70){'safe'}elseif($score -ge 40){'moderate'}else{'high'}
[PSCustomObject]@{name=$_.FriendlyName;model=$_.Model;serial="$($_.SerialNumber)".Trim();firmware=$_.FirmwareVersion;mediaType=$mt;busType=$bt;sizeBytes=[long]$_.Size;healthStatus="$($_.HealthStatus)";operationalStatus="$($_.OperationalStatus)";temperature=$temp;powerOnHours=$poh;readErrors=$re;writeErrors=$we;wearLevel=$wear;partitionStyle=if($dk){"$($dk.PartitionStyle)"}else{'Unknown'};partitions=if($dk){[int]$dk.NumberOfPartitions}else{0};healthScore=$score;riskLevel=$risk}
} | ConvertTo-Json -Compress"#
    ).await
}


// === Software Audit ===

#[tauri::command]
pub async fn audit_software() -> Result<Value, String> {
    // Full registry scan + Test-Path per program — 120s timeout
    let programs = crate::ps::run_ps_json_array_timeout(
        r#"$programs = @()
$regPaths = @(
@{p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hklm'},
@{p='HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hklm-wow64'},
@{p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';s='hkcu'}
)
foreach ($rp in $regPaths) {
    Get-ItemProperty $rp.p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $loc = "$($_.InstallLocation)"
        $hasDir = if($loc -and (Test-Path $loc -EA SilentlyContinue)){$true}else{$false}
        $isOrph = if($loc -and -not $hasDir){$true}else{$false}
        $programs += [PSCustomObject]@{name=$_.DisplayName;version="$($_.DisplayVersion)";publisher="$($_.Publisher)";installDate="$($_.InstallDate)";installLocation=$loc;uninstallString="$($_.UninstallString)";estimatedSize=[long]$_.EstimatedSize;registryPath="$($_.PSPath)";source=$rp.s;hasInstallDir=$hasDir;isOrphaned=$isOrph;category='sonstiges'}
    }
}
$programs | Sort-Object name | ConvertTo-Json -Depth 2 -Compress"#, 120
    ).await?;

    let arr = programs.as_array().cloned().unwrap_or_default();
    let total = arr.len();
    let orphaned = arr.iter().filter(|p| p["isOrphaned"].as_bool().unwrap_or(false)).count();
    let total_size_kb: i64 = arr.iter().map(|p| p["estimatedSize"].as_i64().unwrap_or(0)).sum();

    let categories = json!({
        "system": {"id":"system","label":"System","color":"#6c757d"},
        "treiber": {"id":"treiber","label":"Treiber","color":"#17a2b8"},
        "produktivitaet": {"id":"produktivitaet","label":"Produktivität","color":"#28a745"},
        "entwicklung": {"id":"entwicklung","label":"Entwicklung","color":"#6f42c1"},
        "browser": {"id":"browser","label":"Browser","color":"#fd7e14"},
        "kommunikation": {"id":"kommunikation","label":"Kommunikation","color":"#e83e8c"},
        "multimedia": {"id":"multimedia","label":"Multimedia","color":"#20c997"},
        "spiele": {"id":"spiele","label":"Spiele","color":"#dc3545"},
        "sicherheit": {"id":"sicherheit","label":"Sicherheit","color":"#ffc107"},
        "sonstiges": {"id":"sonstiges","label":"Sonstiges","color":"#adb5bd"}
    });

    Ok(json!({
        "programs": programs,
        "orphanedCount": orphaned,
        "totalSizeKB": total_size_kb,
        "totalPrograms": total,
        "categoryStats": { "sonstiges": total },
        "categories": categories
    }))
}

#[tauri::command]
pub async fn correlate_software(program: Value) -> Result<Value, String> {
    let install_location = program.get("installLocation").and_then(|v| v.as_str()).unwrap_or("");
    let display_name = program.get("displayName")
        .or_else(|| program.get("name"))
        .and_then(|v| v.as_str()).unwrap_or("");
    let publisher = program.get("publisher").and_then(|v| v.as_str()).unwrap_or("");

    if install_location.is_empty() && display_name.is_empty() {
        return Ok(json!({ "files": [], "registry": [], "services": [] }));
    }

    let install_escaped = install_location.replace("'", "''");
    let name_escaped = display_name.replace("'", "''");
    let publisher_escaped = publisher.replace("'", "''");

    let script = format!(r#"
$result = @{{ files=@(); registry=@(); services=@() }}

# Files in install directory
$installLoc = '{install_loc}'
if ($installLoc -and (Test-Path $installLoc -EA SilentlyContinue)) {{
    $files = @(Get-ChildItem -Path $installLoc -Recurse -File -EA SilentlyContinue | Select-Object -First 50)
    foreach ($f in $files) {{
        $result.files += [PSCustomObject]@{{ path=$f.FullName; name=$f.Name; size=$f.Length; extension=$f.Extension }}
    }}
}}

# Related registry keys
$displayName = '{name}'
if ($displayName) {{
    $regPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($rp in $regPaths) {{
        Get-ChildItem $rp -EA SilentlyContinue | ForEach-Object {{
            $props = Get-ItemProperty $_.PSPath -EA SilentlyContinue
            if ($props.DisplayName -like "*$displayName*") {{
                $result.registry += [PSCustomObject]@{{ path=$_.PSPath; displayName=$props.DisplayName; version=$props.DisplayVersion }}
            }}
        }}
    }}
}}

# Related services
$pub = '{publisher}'
if ($displayName -or $pub) {{
    Get-CimInstance Win32_Service -EA SilentlyContinue | ForEach-Object {{
        $svc = $_
        if (($displayName -and ($svc.DisplayName -like "*$displayName*" -or $svc.PathName -like "*$displayName*")) -or
            ($pub -and $svc.DisplayName -like "*$pub*")) {{
            $result.services += [PSCustomObject]@{{ name=$svc.Name; displayName=$svc.DisplayName; status=$svc.State; startType=$svc.StartMode; path=$svc.PathName }}
        }}
    }}
}}

[PSCustomObject]$result | ConvertTo-Json -Depth 3 -Compress"#,
        install_loc = install_escaped,
        name = name_escaped,
        publisher = publisher_escaped
    );

    crate::ps::run_ps_json(&script).await
}

#[tauri::command]
pub async fn check_audit_updates() -> Result<Value, String> {
    // Check if winget is available, then query for updates
    let script = r#"
$updates = @()
try {
    $wingetPath = Get-Command winget -EA Stop | Select-Object -ExpandProperty Source
    $output = & $wingetPath upgrade --accept-source-agreements 2>$null
    $started = $false
    foreach ($line in $output) {
        if ($line -match '^-+$') { $started = $true; continue }
        if ($started -and $line -match '\S') {
            $parts = $line -split '\s{2,}'
            if ($parts.Count -ge 4) {
                $updates += [PSCustomObject]@{
                    name = $parts[0].Trim()
                    id = $parts[1].Trim()
                    currentVersion = $parts[2].Trim()
                    availableVersion = $parts[3].Trim()
                }
            }
        }
    }
} catch { }
$updates | ConvertTo-Json -Compress"#;

    crate::ps::run_ps_json_array(script).await
}


// === System Info ===

#[tauri::command]
pub async fn get_system_info() -> Result<Value, String> {
    get_system_profile().await
}

// === Security Audit ===

#[tauri::command]
pub async fn run_security_audit() -> Result<Value, String> {
    tracing::debug!("Starte Sicherheitscheck (parallelisiert)");

    // Group A: Fast checks — registry reads, net commands, Secure Boot (~1-2s)
    let group_a = crate::ps::run_ps_json_array(
        r#"$checks = @()

# 1. Firewall
$fw = (Get-NetFirewallProfile -EA SilentlyContinue | Where-Object { $_.Enabled }).Count
$checks += [PSCustomObject]@{ id='firewall'; name='Firewall'; status=if($fw -ge 3){'ok'}elseif($fw -ge 1){'warning'}else{'critical'}; detail="$fw/3 Profile aktiv" }

# 2. UAC
$uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -EA SilentlyContinue).EnableLUA
$checks += [PSCustomObject]@{ id='uac'; name='UAC (Benutzerkontensteuerung)'; status=if($uac -eq 1){'ok'}else{'critical'}; detail=if($uac -eq 1){'Aktiviert'}else{'Deaktiviert'} }

# 9. Remotedesktop
$rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -EA SilentlyContinue).fDenyTSConnections
$checks += [PSCustomObject]@{ id='rdp'; name='Remotedesktop'; status=if($rdp -eq 1){'ok'}else{'warning'}; detail=if($rdp -eq 1){'Deaktiviert'}else{'Aktiviert — nur aktivieren wenn benötigt'} }

# 10. Passwort — Ablauf
try {
    $maxPwAge = (net accounts 2>$null | Select-String 'Maximum password age').ToString() -replace '.*:\s*',''
    $checks += [PSCustomObject]@{ id='password-policy'; name='Passwort-Richtlinie'; status=if($maxPwAge -match 'Unlimited|Unbegrenzt'){'warning'}else{'ok'}; detail="Max. Passwort-Alter: $maxPwAge" }
} catch {
    $checks += [PSCustomObject]@{ id='password-policy'; name='Passwort-Richtlinie'; status='warning'; detail='Konnte nicht geprüft werden' }
}

# 11. Secure Boot
try {
    $sb = Confirm-SecureBootUEFI -EA Stop
    $checks += [PSCustomObject]@{ id='secure-boot'; name='Secure Boot'; status=if($sb){'ok'}else{'warning'}; detail=if($sb){'Aktiviert'}else{'Deaktiviert'} }
} catch {
    $checks += [PSCustomObject]@{ id='secure-boot'; name='Secure Boot'; status='warning'; detail='Nicht verfügbar (Legacy BIOS)' }
}

$checks | ConvertTo-Json -Compress"#
    );

    // Group B: CIM/WMI + Defender checks (~3-5s)
    let group_b = crate::ps::run_ps_json_array(
        r#"$checks = @()

# 3. Antivirus
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -EA SilentlyContinue
$checks += [PSCustomObject]@{ id='antivirus'; name='Antivirus'; status=if($av){'ok'}else{'critical'}; detail=if($av){$av[0].displayName}else{'Nicht gefunden'} }

# 4. Windows Defender Echtzeitschutz
$defPref = Get-MpPreference -EA SilentlyContinue
$rtDisabled = $defPref.DisableRealtimeMonitoring
$checks += [PSCustomObject]@{ id='defender-realtime'; name='Echtzeitschutz'; status=if($rtDisabled -eq $false){'ok'}else{'critical'}; detail=if($rtDisabled -eq $false){'Aktiviert'}else{'Deaktiviert'} }

# 5. Defender Definitionen Alter
try {
    $defStatus = Get-MpComputerStatus -EA Stop
    $daysOld = ((Get-Date) - $defStatus.AntivirusSignatureLastUpdated).Days
    $checks += [PSCustomObject]@{ id='defender-definitions'; name='Virendefinitionen'; status=if($daysOld -le 2){'ok'}elseif($daysOld -le 7){'warning'}else{'critical'}; detail="Letztes Update vor $daysOld Tagen" }
} catch {
    $checks += [PSCustomObject]@{ id='defender-definitions'; name='Virendefinitionen'; status='warning'; detail='Status konnte nicht abgefragt werden' }
}

# 7. BitLocker / Verschlüsselung
try {
    $bl = Get-BitLockerVolume -MountPoint 'C:' -EA Stop
    $checks += [PSCustomObject]@{ id='bitlocker'; name='Laufwerksverschlüsselung'; status=if($bl.ProtectionStatus -eq 'On'){'ok'}else{'warning'}; detail=if($bl.ProtectionStatus -eq 'On'){'BitLocker aktiviert'}else{'BitLocker deaktiviert'} }
} catch {
    $checks += [PSCustomObject]@{ id='bitlocker'; name='Laufwerksverschlüsselung'; status='warning'; detail='BitLocker nicht verfügbar' }
}

# 8. SMBv1 (veraltet, Sicherheitsrisiko)
try {
    $smb1 = (Get-SmbServerConfiguration -EA Stop).EnableSMB1Protocol
    $checks += [PSCustomObject]@{ id='smb1'; name='SMBv1-Protokoll'; status=if($smb1 -eq $false){'ok'}else{'critical'}; detail=if($smb1 -eq $false){'Deaktiviert (sicher)'}else{'Aktiviert (Sicherheitsrisiko!)'} }
} catch {
    $checks += [PSCustomObject]@{ id='smb1'; name='SMBv1-Protokoll'; status='ok'; detail='Nicht verfügbar (sicher)' }
}

# 12. Autostart-Einträge (zu viele = Risiko)
$asCount = @(Get-CimInstance Win32_StartupCommand -EA SilentlyContinue).Count
$checks += [PSCustomObject]@{ id='autostart'; name='Autostart-Programme'; status=if($asCount -le 5){'ok'}elseif($asCount -le 15){'warning'}else{'critical'}; detail="$asCount Programme im Autostart" }

$checks | ConvertTo-Json -Compress"#
    );

    // Group C: Windows Update — slowest check, COM object (~5-10s)
    let group_c = crate::ps::run_ps_json_array(
        r#"$checks = @()

# 6. Windows Update — ausstehende Updates
try {
    $updateSession = New-Object -ComObject Microsoft.Update.Session -EA Stop
    $searcher = $updateSession.CreateUpdateSearcher()
    $pending = $searcher.Search("IsInstalled=0 and Type='Software'").Updates.Count
    $checks += [PSCustomObject]@{ id='windows-updates'; name='Windows-Updates'; status=if($pending -eq 0){'ok'}elseif($pending -le 3){'warning'}else{'critical'}; detail=if($pending -eq 0){'Alle Updates installiert'}else{"$pending Updates ausstehend"} }
} catch {
    $checks += [PSCustomObject]@{ id='windows-updates'; name='Windows-Updates'; status='warning'; detail='Konnte nicht geprüft werden' }
}

$checks | ConvertTo-Json -Compress"#
    );

    // Run all 3 groups concurrently
    let (res_a, res_b, res_c) = tokio::join!(group_a, group_b, group_c);

    // Merge results — collect all successful checks, log failures
    let mut all_checks: Vec<Value> = Vec::with_capacity(12);
    let groups: [(&str, Result<Value, String>); 3] = [("A", res_a), ("B", res_b), ("C", res_c)];
    for (name, res) in groups {
        match res {
            Ok(val) => {
                if let Some(arr) = val.as_array() {
                    all_checks.extend(arr.iter().cloned());
                }
            }
            Err(e) => {
                tracing::warn!(group = name, error = %e, "Sicherheitscheck-Gruppe fehlgeschlagen");
            }
        }
    }

    let result = Value::Array(all_checks);

    // Persist the audit result to history
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let mut history = read_json_file("audit-history.json");
    let entries = history.as_object_mut()
        .and_then(|o| o.get_mut("entries"))
        .and_then(|e| e.as_array_mut());

    let entry = json!({
        "timestamp": now,
        "checks": result,
    });

    if let Some(arr) = entries {
        arr.insert(0, entry);
        // Keep max 20 entries
        arr.truncate(20);
    } else {
        history = json!({ "entries": [entry] });
    }
    write_json_file("audit-history.json", &history)?;
    tracing::debug!("Sicherheitscheck abgeschlossen, Ergebnis gespeichert");

    Ok(result)
}

#[tauri::command]
pub async fn get_audit_history() -> Result<Value, String> {
    let history = read_json_file("audit-history.json");
    Ok(history.get("entries").cloned().unwrap_or(json!([])))
}

// === System Score ===

#[tauri::command]
pub async fn get_system_score(results: Option<Value>) -> Result<Value, String> {
    // Compute real scores from passed-in results, or return defaults with stub flag
    let r = results.unwrap_or(json!({}));

    // Privacy score: based on how many settings are "private"
    let privacy_score = if let Some(settings) = r.get("privacy").and_then(|p| p.get("settings")).and_then(|s| s.as_array()) {
        let total = settings.len() as f64;
        let protected = settings.iter().filter(|s| s["isPrivate"].as_bool().unwrap_or(false)).count() as f64;
        if total > 0.0 { (protected / total * 100.0).round() as u32 } else { 50 }
    } else { 50 };

    // Disk score: based on health scores from SMART data
    let disk_score = if let Some(disks) = r.get("diskHealth").and_then(|d| d.as_array()) {
        if disks.is_empty() { 50 } else {
            let sum: u32 = disks.iter().map(|d| d["healthScore"].as_u64().unwrap_or(50) as u32).sum();
            sum / disks.len() as u32
        }
    } else { 50 };

    // Registry score: based on orphaned entries found
    let registry_score = if let Some(cats) = r.get("registry").and_then(|r| r.as_array()) {
        let total_entries: usize = cats.iter().map(|c| c["entries"].as_array().map(|a| a.len()).unwrap_or(0)).sum();
        if total_entries == 0 { 100 } else if total_entries < 10 { 85 } else if total_entries < 50 { 65 } else { 40 }
    } else { 50 };

    // Optimizer score: based on how many optimizations are applied
    let optimizer_score = if let Some(opts) = r.get("optimizations").and_then(|o| o.as_array()) {
        let total = opts.len() as f64;
        let applied = opts.iter().filter(|o| o["applied"].as_bool().unwrap_or(false)).count() as f64;
        if total > 0.0 { (applied / total * 100.0).round() as u32 } else { 50 }
    } else { 50 };

    // Updates score: fewer pending = better
    let updates_score = if let Some(updates) = r.get("updates").and_then(|u| u.as_array()) {
        if updates.is_empty() { 100 } else if updates.len() < 3 { 80 } else if updates.len() < 10 { 60 } else { 40 }
    } else { 50 };

    // Software score: fewer orphaned entries = better
    let software_score = if let Some(orphaned) = r.get("orphanedCount").and_then(|o| o.as_u64()) {
        if orphaned == 0 { 100 } else if orphaned < 5 { 80 } else if orphaned < 15 { 60 } else { 40 }
    } else { 50 };

    let has_real_data = r.as_object().map(|o| !o.is_empty()).unwrap_or(false);

    // Weighted average
    let categories = vec![
        json!({"name": "Datenschutz", "weight": 25, "score": privacy_score, "description": "Windows-Datenschutzeinstellungen"}),
        json!({"name": "Festplatten", "weight": 20, "score": disk_score, "description": "Festplatten-Gesundheit und Speicherplatz"}),
        json!({"name": "Registry", "weight": 15, "score": registry_score, "description": "Registry-Sauberkeit"}),
        json!({"name": "Optimierung", "weight": 15, "score": optimizer_score, "description": "Systemoptimierungen"}),
        json!({"name": "Updates", "weight": 15, "score": updates_score, "description": "Windows- und Software-Updates"}),
        json!({"name": "Software", "weight": 10, "score": software_score, "description": "Software-Inventar und Bloatware"}),
    ];

    let total_score: f64 = categories.iter().map(|c| {
        c["score"].as_f64().unwrap_or(0.0) * c["weight"].as_f64().unwrap_or(0.0) / 100.0
    }).sum();
    let score = total_score.round() as u32;

    let grade = match score {
        90..=100 => "A",
        80..=89 => "B",
        70..=79 => "C",
        60..=69 => "D",
        _ => "F",
    };

    let risk_level = match score {
        80..=100 => "low",
        60..=79 => "moderate",
        _ => "high",
    };

    let mut result = json!({
        "score": score,
        "grade": grade,
        "riskLevel": risk_level,
        "categories": categories
    });
    if !has_real_data {
        result["stub"] = json!(true);
        result["message"] = json!("Keine Analysedaten übergeben — Score basiert auf Standardwerten");
    }
    Ok(result)
}



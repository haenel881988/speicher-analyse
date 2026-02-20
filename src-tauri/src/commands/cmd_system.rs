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

    // Undo-Log: vorherigen Status protokollieren
    let desc = format!("Autostart \"{}\" {}", name, if enabled { "aktiviert" } else { "deaktiviert" });
    crate::undo::log_action("toggle_autostart", &desc, json!({ "entry": entry.clone(), "was_enabled": !enabled }), true);
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

    // Undo-Log: Autostart-Daten protokollieren (teilweise umkehrbar)
    let desc = format!("Autostart-Eintrag \"{}\" gelöscht", name);
    crate::undo::log_action("delete_autostart", &desc, json!({ "entry": entry.clone() }), false);
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

    // Updates score: fewer pending = better
    let updates_score = if let Some(updates) = r.get("updates").and_then(|u| u.as_array()) {
        if updates.is_empty() { 100 } else if updates.len() < 3 { 80 } else if updates.len() < 10 { 60 } else { 40 }
    } else { 50 };

    // Software score: fewer orphaned entries = better
    let software_score = if let Some(orphaned) = r.get("orphanedCount").and_then(|o| o.as_u64()) {
        if orphaned == 0 { 100 } else if orphaned < 5 { 80 } else if orphaned < 15 { 60 } else { 40 }
    } else { 50 };

    let has_real_data = r.as_object().map(|o| !o.is_empty()).unwrap_or(false);

    // Weighted average (5 categories, total = 100%)
    let categories = vec![
        json!({"name": "Datenschutz", "weight": 25, "score": privacy_score, "description": "Windows-Datenschutzeinstellungen"}),
        json!({"name": "Festplatten", "weight": 25, "score": disk_score, "description": "Festplatten-Gesundheit und Speicherplatz"}),
        json!({"name": "Registry", "weight": 15, "score": registry_score, "description": "Registry-Sauberkeit"}),
        json!({"name": "Updates", "weight": 20, "score": updates_score, "description": "Windows- und Software-Updates"}),
        json!({"name": "Software", "weight": 15, "score": software_score, "description": "Software-Inventar"}),
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


// === Apps-Kontrollzentrum ===

#[tauri::command]
pub async fn get_apps_overview() -> Result<Value, String> {
    // Erweiterte Programmliste: Registry + Store-Apps + LastUsed
    let script = r#"
$programs = @()
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
        $programs += [PSCustomObject]@{
            name=$_.DisplayName; version="$($_.DisplayVersion)"; publisher="$($_.Publisher)"
            installDate="$($_.InstallDate)"; installLocation=$loc
            uninstallString="$($_.UninstallString)"; estimatedSize=[long]$_.EstimatedSize
            source=$rp.s; hasInstallDir=$hasDir; isOrphaned=$isOrph; appType='desktop'
        }
    }
}
# Store-Apps (nur mit Namen)
try {
    Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.Name -notmatch '^Microsoft\.(NET|VCLibs|UI\.|Windows\.)' } | ForEach-Object {
        $programs += [PSCustomObject]@{
            name=$_.Name.Split('.')[-1]; version=$_.Version; publisher=$_.Publisher
            installDate=''; installLocation=$_.InstallLocation
            uninstallString=''; estimatedSize=0
            source='store'; hasInstallDir=$true; isOrphaned=$false; appType='store'
        }
    }
} catch {}
$programs | Sort-Object name | ConvertTo-Json -Depth 2 -Compress"#;
    let programs = crate::ps::run_ps_json_array_timeout(script, 120).await?;
    let arr = programs.as_array().cloned().unwrap_or_default();
    let total = arr.len();
    let orphaned = arr.iter().filter(|p| p["isOrphaned"].as_bool().unwrap_or(false)).count();
    let store_count = arr.iter().filter(|p| p["appType"].as_str() == Some("store")).count();
    let desktop_count = total - store_count;
    Ok(json!({
        "programs": programs,
        "totalPrograms": total,
        "desktopCount": desktop_count,
        "storeCount": store_count,
        "orphanedCount": orphaned
    }))
}

#[tauri::command]
pub async fn uninstall_software(uninstall_string: String, name: String) -> Result<Value, String> {
    if uninstall_string.is_empty() {
        return Err("Kein Deinstallationsbefehl vorhanden".to_string());
    }

    // Undo-Log
    let desc = format!("\"{}\" deinstalliert", name);
    crate::undo::log_action("uninstall_software", &desc, json!({ "name": name, "uninstallString": uninstall_string }), false);

    let safe_str = uninstall_string.replace("'", "''");
    let script = format!("Start-Process -FilePath cmd.exe -ArgumentList '/c','{}' -Wait", safe_str);
    crate::ps::run_ps_with_timeout(&script, 300).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn check_uninstall_leftovers(name: String, install_location: Option<String>) -> Result<Value, String> {
    let safe_name = name.replace("'", "''");
    let check_loc = install_location.as_deref().unwrap_or("").replace("'", "''");
    let script = format!(r#"
$leftovers = @()
# Check install directory still exists
if ('{check_loc}' -ne '' -and (Test-Path '{check_loc}' -EA SilentlyContinue)) {{
    $size = (Get-ChildItem '{check_loc}' -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $leftovers += [PSCustomObject]@{{ type='directory'; path='{check_loc}'; size=[long]$size }}
}}
# Check AppData folders
$appDataPaths = @(
    "$env:APPDATA\{safe_name}",
    "$env:LOCALAPPDATA\{safe_name}",
    "$env:PROGRAMDATA\{safe_name}"
)
foreach ($p in $appDataPaths) {{
    if (Test-Path $p -EA SilentlyContinue) {{
        $size = (Get-ChildItem $p -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $leftovers += [PSCustomObject]@{{ type='appdata'; path=$p; size=[long]$size }}
    }}
}}
# Check Start Menu
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$shortcuts = @(Get-ChildItem $startMenu -Filter "*{safe_name}*" -Recurse -EA SilentlyContinue)
foreach ($s in $shortcuts) {{
    $leftovers += [PSCustomObject]@{{ type='shortcut'; path=$s.FullName; size=[long]$s.Length }}
}}
if ($leftovers.Count -eq 0) {{ '[]' }}
else {{ $leftovers | ConvertTo-Json -Depth 2 -Compress }}"#,
        check_loc = check_loc, safe_name = safe_name
    );
    crate::ps::run_ps_json_array_timeout(&script, 30).await
}

#[tauri::command]
pub async fn get_unused_apps(threshold_days: Option<u32>) -> Result<Value, String> {
    let days = threshold_days.unwrap_or(180);
    let script = format!(r#"
$threshold = (Get-Date).AddDays(-{days})
$programs = @()
$regPaths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($rp in $regPaths) {{
    Get-ItemProperty $rp -ErrorAction SilentlyContinue | Where-Object {{ $_.DisplayName -and $_.InstallLocation }} | ForEach-Object {{
        $loc = "$($_.InstallLocation)"
        if ($loc -and (Test-Path $loc -EA SilentlyContinue)) {{
            $exes = @(Get-ChildItem $loc -Filter '*.exe' -EA SilentlyContinue | Select-Object -First 3)
            $lastUsed = $null
            foreach ($exe in $exes) {{
                if ($exe.LastAccessTime -gt $lastUsed) {{ $lastUsed = $exe.LastAccessTime }}
            }}
            if ($lastUsed -and $lastUsed -lt $threshold) {{
                $size = [long]$_.EstimatedSize
                $programs += [PSCustomObject]@{{
                    name=$_.DisplayName; version="$($_.DisplayVersion)"; publisher="$($_.Publisher)"
                    lastUsed=$lastUsed.ToString('o'); daysSinceUse=[int]((Get-Date) - $lastUsed).TotalDays
                    estimatedSize=$size; installLocation=$loc
                }}
            }}
        }}
    }}
}}
if ($programs.Count -eq 0) {{ '[]' }}
else {{ $programs | Sort-Object daysSinceUse -Descending | ConvertTo-Json -Depth 2 -Compress }}"#,
        days = days
    );
    crate::ps::run_ps_json_array_timeout(&script, 60).await
}

#[tauri::command]
pub async fn analyze_app_cache() -> Result<Value, String> {
    let script = r#"
$caches = @()
# Bekannte Cache-Verzeichnisse analysieren
$cachePaths = @(
    @{name='Windows Temp'; path=$env:TEMP},
    @{name='Windows Temp (System)'; path='C:\Windows\Temp'},
    @{name='Prefetch'; path='C:\Windows\Prefetch'},
    @{name='Thumbnails'; path="$env:LOCALAPPDATA\Microsoft\Windows\Explorer"},
    @{name='Font Cache'; path="$env:LOCALAPPDATA\FontCache"},
    @{name='Windows Update Cache'; path='C:\Windows\SoftwareDistribution\Download'}
)
foreach ($cp in $cachePaths) {
    if (Test-Path $cp.path -EA SilentlyContinue) {
        try {
            $items = @(Get-ChildItem $cp.path -Recurse -Force -EA SilentlyContinue)
            $size = ($items | Measure-Object -Property Length -Sum -EA SilentlyContinue).Sum
            $fileCount = ($items | Where-Object { -not $_.PSIsContainer }).Count
            $caches += [PSCustomObject]@{
                name=$cp.name; path=$cp.path; size=[long]$size; fileCount=$fileCount; canClean=$true
            }
        } catch {}
    }
}
# Browser-Caches
$browserPaths = @(
    @{name='Chrome Cache'; path="$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"},
    @{name='Edge Cache'; path="$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"},
    @{name='Firefox Cache'; path="$env:LOCALAPPDATA\Mozilla\Firefox\Profiles"}
)
foreach ($bp in $browserPaths) {
    if (Test-Path $bp.path -EA SilentlyContinue) {
        try {
            $size = (Get-ChildItem $bp.path -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum -EA SilentlyContinue).Sum
            $caches += [PSCustomObject]@{
                name=$bp.name; path=$bp.path; size=[long]$size; fileCount=0; canClean=$true
            }
        } catch {}
    }
}
$totalSize = ($caches | Measure-Object -Property size -Sum).Sum
[PSCustomObject]@{ caches=$caches; totalSize=[long]$totalSize } | ConvertTo-Json -Depth 3 -Compress"#;
    crate::ps::run_ps_json_timeout(script, 60).await
}

#[tauri::command]
pub async fn clean_app_cache(paths: Vec<String>) -> Result<Value, String> {
    let mut cleaned = 0u64;
    let mut errors: Vec<String> = Vec::new();
    for p in &paths {
        // Nur bekannte/sichere Pfade erlauben
        let p_lower = p.to_lowercase();
        let is_safe = p_lower.contains("\\temp")
            || p_lower.contains("\\cache")
            || p_lower.contains("\\prefetch")
            || p_lower.contains("\\fontcache")
            || p_lower.contains("\\explorer")
            || p_lower.contains("\\softwaredistribution\\download");
        if !is_safe {
            errors.push(format!("Pfad nicht als Cache erkannt: {}", p));
            continue;
        }
        let safe_path = p.replace("'", "''");
        match crate::ps::run_ps(&format!(
            "Get-ChildItem '{}' -Recurse -Force -EA SilentlyContinue | Remove-Item -Force -Recurse -EA SilentlyContinue; 'ok'",
            safe_path
        )).await {
            Ok(_) => cleaned += 1,
            Err(e) => errors.push(format!("{}: {}", p, e)),
        }
    }
    Ok(json!({ "success": true, "cleaned": cleaned, "errors": errors }))
}

#[tauri::command]
pub async fn export_program_list(format: String, programs: Value) -> Result<Value, String> {
    let arr = programs.as_array().ok_or("Ungültige Programmliste")?;

    let content = match format.as_str() {
        "json" => serde_json::to_string_pretty(arr).map_err(|e| e.to_string())?,
        "csv" => {
            let mut csv = String::from("Name;Version;Herausgeber;Installationsdatum;Größe (KB)\n");
            for p in arr {
                csv.push_str(&format!("{};{};{};{};{}\n",
                    p["name"].as_str().unwrap_or(""),
                    p["version"].as_str().unwrap_or(""),
                    p["publisher"].as_str().unwrap_or(""),
                    p["installDate"].as_str().unwrap_or(""),
                    p["estimatedSize"].as_i64().unwrap_or(0),
                ));
            }
            csv
        }
        "winget" => {
            let mut script = String::from("# Winget-Installationsskript\n# Generiert von Speicher Analyse\n\n");
            for p in arr {
                let name = p["name"].as_str().unwrap_or("");
                if !name.is_empty() {
                    script.push_str(&format!("# winget install --name '{}'\n", name));
                }
            }
            script
        }
        _ => return Err(format!("Unbekanntes Format: {}", format)),
    };

    let ext = match format.as_str() { "json" => "json", "csv" => "csv", _ => "ps1" };
    let default_name = format!("programmliste.{}", ext);

    Ok(json!({ "content": content, "defaultName": default_name, "format": format }))
}


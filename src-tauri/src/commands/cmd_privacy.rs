use serde_json::{json, Value};

// === Privacy Dashboard ===

#[tauri::command]
pub async fn get_privacy_settings() -> Result<Value, String> {
    let reg_data = crate::ps::run_ps_json(
        r#"$regs = @(
@{id='werbung-id';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo';k='Enabled'},
@{id='cortana-consent';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Search';k='CortanaConsent'},
@{id='feedback-haeufigkeit';p='HKCU:\SOFTWARE\Microsoft\Siuf\Rules';k='NumberOfSIUFInPeriod'},
@{id='handschrift-daten';p='HKCU:\SOFTWARE\Microsoft\InputPersonalization';k='RestrictImplicitTextCollection'},
@{id='diagnose-toast';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Diagnostics\DiagTrack';k='ShowedToastAtLevel'},
@{id='app-diagnose';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\appDiagnostics';k='Value'},
@{id='standort-zugriff';p='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location';k='Value'},
@{id='telemetrie-policy';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection';k='AllowTelemetry'},
@{id='telemetrie-datacollection';p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection';k='AllowTelemetry'},
@{id='wifi-sense';p='HKLM:\SOFTWARE\Microsoft\WcmSvc\wifinetworkmanager\config';k='AutoConnectAllowedOEM'},
@{id='aktivitaet-feed';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\System';k='EnableActivityFeed'},
@{id='aktivitaet-publish';p='HKLM:\SOFTWARE\Policies\Microsoft\Windows\System';k='PublishUserActivities'}
)
$vals=@{}
foreach($r in $regs){try{$v=(Get-ItemProperty $r.p -Name $r.k -EA Stop)."$($r.k)";$vals[$r.id]=$v}catch{$vals[$r.id]=$null}}
$ed=(Get-CimInstance Win32_OperatingSystem).Caption
$isE=$ed -match 'Enterprise|Education'
$sl=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowAllTrustedApps -EA SilentlyContinue).AllowAllTrustedApps
[PSCustomObject]@{registryValues=$vals;edition=[PSCustomObject]@{edition=$ed;isEnterprise=[bool]$isE};sideloading=[PSCustomObject]@{enabled=($sl -eq 1);value=$sl}} | ConvertTo-Json -Depth 2 -Compress"#
    ).await?;

    let reg_vals = &reg_data["registryValues"];
    let edition = reg_data["edition"].clone();
    let sideloading = reg_data["sideloading"].clone();
    let settings = build_privacy_settings(reg_vals);
    Ok(json!({ "settings": settings, "edition": edition, "sideloading": sideloading }))
}

// Privacy settings database: (id, registry_path, registry_key, recommended_value, default_value, tier)
// tier: "standard" = safe HKCU, "advanced" = HKLM or risky
fn is_consent_store_setting(id: &str) -> bool {
    matches!(id, "app-diagnose" | "standort-zugriff")
}

fn privacy_setting_lookup(id: &str) -> Option<(&'static str, &'static str, i32, i32, &'static str)> {
    match id {
        "werbung-id" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo", "Enabled", 0, 1, "standard")),
        "cortana-consent" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search", "CortanaConsent", 0, 1, "standard")),
        "feedback-haeufigkeit" => Some(("HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules", "NumberOfSIUFInPeriod", 0, 1, "standard")),
        "handschrift-daten" => Some(("HKCU\\SOFTWARE\\Microsoft\\InputPersonalization", "RestrictImplicitTextCollection", 1, 0, "standard")),
        "diagnose-toast" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack", "ShowedToastAtLevel", 1, 0, "standard")),
        "app-diagnose" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics", "Value", 0, 1, "standard")),
        "standort-zugriff" => Some(("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location", "Value", 0, 1, "standard")),
        "telemetrie-policy" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", 0, 3, "advanced")),
        "telemetrie-datacollection" => Some(("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection", "AllowTelemetry", 0, 3, "advanced")),
        "wifi-sense" => Some(("HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config", "AutoConnectAllowedOEM", 0, 1, "advanced")),
        "aktivitaet-feed" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableActivityFeed", 0, 1, "advanced")),
        "aktivitaet-publish" => Some(("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "PublishUserActivities", 0, 1, "advanced")),
        _ => None,
    }
}

#[tauri::command]
pub async fn apply_privacy_setting(id: String) -> Result<Value, String> {
    tracing::info!(setting = %id, "Privacy-Einstellung anwenden");
    let (reg_path, reg_key, recommended, _, _) = privacy_setting_lookup(&id)
        .ok_or_else(|| format!("Einstellung '{}' nicht gefunden", id))?;
    // ConsentStore settings use REG_SZ "Deny"/"Allow", not REG_DWORD
    let script = if is_consent_store_setting(&id) {
        let val = if recommended == 0 { "Deny" } else { "Allow" };
        format!("reg add '{}' /v '{}' /t REG_SZ /d {} /f", reg_path, reg_key, val)
    } else {
        format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, recommended)
    };
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if reg_path.starts_with("HKLM") && (e.contains("Zugriff") || e.contains("Access")) {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn apply_all_privacy() -> Result<Value, String> {
    tracing::info!("Alle Privacy-Einstellungen anwenden");
    let ids = ["werbung-id","cortana-consent","feedback-haeufigkeit","handschrift-daten",
               "diagnose-toast","app-diagnose","standort-zugriff"];
    let mut applied = 0u32;
    let mut failed = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for id in &ids {
        if let Some((reg_path, reg_key, recommended, _, _)) = privacy_setting_lookup(id) {
            let script = if is_consent_store_setting(id) {
                let val = if recommended == 0 { "Deny" } else { "Allow" };
                format!("reg add '{}' /v '{}' /t REG_SZ /d {} /f", reg_path, reg_key, val)
            } else {
                format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, recommended)
            };
            match crate::ps::run_ps(&script).await {
                Ok(_) => applied += 1,
                Err(e) => { failed += 1; errors.push(format!("{}: {}", id, e)); }
            }
        }
    }
    let skipped = 5u32; // 5 advanced (HKLM) settings skipped
    Ok(json!({ "applied": applied, "failed": failed, "skipped": skipped, "errors": errors }))
}

#[tauri::command]
pub async fn reset_privacy_setting(id: String) -> Result<Value, String> {
    let (reg_path, reg_key, _, default_val, _) = privacy_setting_lookup(&id)
        .ok_or_else(|| format!("Einstellung '{}' nicht gefunden", id))?;
    let script = if is_consent_store_setting(&id) {
        let val = if default_val == 0 { "Deny" } else { "Allow" };
        format!("reg add '{}' /v '{}' /t REG_SZ /d {} /f", reg_path, reg_key, val)
    } else {
        format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, default_val)
    };
    match crate::ps::run_ps(&script).await {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if reg_path.starts_with("HKLM") && (e.contains("Zugriff") || e.contains("Access")) {
                Ok(json!({ "success": false, "error": "Administratorrechte erforderlich", "requiresAdmin": true }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn reset_all_privacy() -> Result<Value, String> {
    let ids = ["werbung-id","cortana-consent","feedback-haeufigkeit","handschrift-daten",
               "diagnose-toast","app-diagnose","standort-zugriff"];
    let mut reset = 0u32;
    let mut failed = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for id in &ids {
        if let Some((reg_path, reg_key, _, default_val, _)) = privacy_setting_lookup(id) {
            let script = if is_consent_store_setting(id) {
                let val = if default_val == 0 { "Deny" } else { "Allow" };
                format!("reg add '{}' /v '{}' /t REG_SZ /d {} /f", reg_path, reg_key, val)
            } else {
                format!("reg add '{}' /v '{}' /t REG_DWORD /d {} /f", reg_path, reg_key, default_val)
            };
            match crate::ps::run_ps(&script).await {
                Ok(_) => reset += 1,
                Err(e) => { failed += 1; errors.push(format!("{}: {}", id, e)); }
            }
        }
    }
    let skipped = 5u32;
    Ok(json!({ "reset": reset, "failed": failed, "skipped": skipped, "errors": errors }))
}

#[tauri::command]
pub async fn get_scheduled_tasks_audit() -> Result<Value, String> {
    crate::ps::run_ps_json_array(
        r#"$telemetryKeywords = @('telemetry','diagnostic','ceip','feedback','customer experience','usage','tracking','consolidated','sqm','devicecensus','compatibility')
Get-ScheduledTask | Where-Object { $_.State -eq 'Ready' -or $_.State -eq 'Disabled' } | Select-Object -First 100 | ForEach-Object {
    $desc = "$($_.Description)"
    $n = $_.TaskName.ToLower()
    $p = $_.TaskPath.ToLower()
    $isTel = $false
    foreach ($kw in $telemetryKeywords) { if ($n -match $kw -or $p -match $kw -or $desc -match $kw) { $isTel = $true; break } }
    $st = if($_.State -eq 'Disabled'){'Deaktiviert'}elseif($_.State -eq 'Ready'){'Bereit'}else{[string]$_.State}
    [PSCustomObject]@{ name=$_.TaskName; path=$_.TaskPath; state=$st; description=$desc; isTelemetry=$isTel }
} | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn disable_scheduled_task(task_path: String, task_name: Option<String>) -> Result<Value, String> {
    let safe_path = task_path.replace("'", "''");
    let script = if let Some(name) = task_name {
        let safe_name = name.replace("'", "''");
        format!("Disable-ScheduledTask -TaskPath '{}' -TaskName '{}'", safe_path, safe_name)
    } else {
        // Only disable a specific task, never wildcard — require task_name
        return Err("task_name ist erforderlich (Wildcard deaktiviert ist nicht erlaubt)".to_string());
    };
    crate::ps::run_ps(&script).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn check_sideloading() -> Result<Value, String> {
    crate::ps::run_ps_json(
        r#"$val = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense; [PSCustomObject]@{ enabled = ($val -eq 1) } | ConvertTo-Json -Compress"#
    ).await
}

#[tauri::command]
pub async fn fix_sideloading() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        r#"Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -Type DWord -Force"#
    ).await;
    match result {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => {
            if e.contains("Zugriff") || e.contains("Access") || e.contains("denied") {
                Ok(json!({ "success": false, "needsElevation": true, "error": "Administrator-Rechte erforderlich" }))
            } else {
                Ok(json!({ "success": false, "error": e }))
            }
        }
    }
}

#[tauri::command]
pub async fn fix_sideloading_with_elevation() -> Result<Value, String> {
    let result = crate::ps::run_ps(
        r#"Start-Process powershell.exe -ArgumentList '-Command', 'Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -Value 1 -Type DWord -Force' -Verb RunAs -Wait"#
    ).await;
    match result {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[tauri::command]
pub async fn get_privacy_recommendations() -> Result<Value, String> {
    let script = r#"
$recommendations = @()
$programs = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue |
    Where-Object { $_.DisplayName } | Select-Object DisplayName, Publisher, InstallLocation)

# Check for known telemetry-heavy programs
$telemetryApps = @{
    'Google Chrome' = 'Sendet Nutzungsdaten an Google. Einstellungen > Datenschutz > Nutzungsstatistiken deaktivieren.'
    'Microsoft Edge' = 'Sendet Diagnosedaten an Microsoft. Einstellungen > Datenschutz > Diagnosedaten deaktivieren.'
    'Cortana' = 'Sammelt Sprach- und Suchdaten. In den Windows-Einstellungen deaktivieren.'
    'OneDrive' = 'Synchronisiert Dateien in die Cloud. Nur bei Bedarf aktivieren.'
    'CCleaner' = 'Seit Avast-Übernahme mit Telemetrie. Alternativen in Betracht ziehen.'
    'Avast' = 'Verkauft Nutzungsdaten über Tochter Jumpshot. Alternativen in Betracht ziehen.'
    'AVG' = 'Gehört zu Avast, gleiche Datenschutzbedenken.'
}

foreach ($prog in $programs) {
    foreach ($key in $telemetryApps.Keys) {
        if ($prog.DisplayName -like "*$key*") {
            $recommendations += [PSCustomObject]@{
                program = $prog.DisplayName
                publisher = $prog.Publisher
                recommendation = $telemetryApps[$key]
                severity = 'medium'
            }
            break
        }
    }
}

[PSCustomObject]@{
    recommendations = $recommendations
    programCount = $programs.Count
} | ConvertTo-Json -Depth 3 -Compress"#;

    crate::ps::run_ps_json(script).await
}


// === Privacy Settings Database ===

fn build_privacy_settings(reg_vals: &Value) -> Value {
    let defs = vec![
        json!({"id":"werbung-id","category":"werbung","name":"Werbe-ID","description":"Ermöglicht personalisierte Werbung anhand einer eindeutigen Geräte-ID.","explanation":"Windows vergibt deinem Gerät eine eindeutige Nummer, mit der Werbetreibende dich wiedererkennen können.","riskExplanation":"Werbetreibende nutzen diese ID, um ein Profil über dich aufzubauen.","impacts":["Werbung in Apps wird weniger auf dich zugeschnitten"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo","registryKey":"Enabled","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"cortana-consent","category":"telemetrie","name":"Cortana","description":"Erlaubt Cortana, Sprach- und Suchdaten zu sammeln und zu verarbeiten.","explanation":"Cortana hört auf deine Sprachbefehle und merkt sich deine Suchanfragen.","riskExplanation":"Alles was du sagst oder suchst, wird an Microsoft-Server übertragen.","impacts":["Cortana-Sprachbefehle funktionieren nicht mehr","Suchvorschläge werden weniger personalisiert"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search","registryKey":"CortanaConsent","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"feedback-haeufigkeit","category":"telemetrie","name":"Feedback-Häufigkeit","description":"Bestimmt, wie oft Windows nach Feedback fragt.","explanation":"Windows fragt dich regelmäßig, ob du zufrieden bist.","riskExplanation":"Jede Feedback-Antwort enthält Informationen über dein System.","impacts":["Keine Feedback-Popups mehr von Windows"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Siuf\\Rules","registryKey":"NumberOfSIUFInPeriod","recommendedValue":0,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"handschrift-daten","category":"diagnose","name":"Handschrift- und Eingabedaten","description":"Sammelt Tipp- und Handschriftmuster zur Verbesserung der Spracherkennung.","explanation":"Windows beobachtet, wie du tippst und schreibst.","riskExplanation":"Dein Tippverhalten ist wie ein Fingerabdruck.","impacts":["Wortvorschläge beim Tippen werden weniger präzise","Handschrifterkennung lernt nicht mehr dazu"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\InputPersonalization","registryKey":"RestrictImplicitTextCollection","recommendedValue":1,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"diagnose-toast","category":"diagnose","name":"Diagnose-Benachrichtigungen","description":"Steuert die Anzeige von Diagnose-Benachrichtigungen.","explanation":"Windows zeigt Benachrichtigungen über gesammelte Diagnosedaten an.","riskExplanation":"Die Benachrichtigungen selbst senden Telemetriedaten zurück.","impacts":["Keine Diagnose-Benachrichtigungen mehr"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Diagnostics\\DiagTrack","registryKey":"ShowedToastAtLevel","recommendedValue":1,"riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"app-diagnose","category":"diagnose","name":"App-Diagnosezugriff","description":"Erlaubt Apps den Zugriff auf Diagnoseinformationen anderer Apps.","explanation":"Installierte Apps können sehen, welche anderen Apps du nutzt.","riskExplanation":"Apps können sehen, welche Programme du nutzt, wie lange und wie oft.","impacts":["Apps können keine Informationen über andere Apps mehr abfragen"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics","registryKey":"Value","recommendedValue":"Deny","riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"standort-zugriff","category":"standort","name":"Standortzugriff","description":"Erlaubt Apps den Zugriff auf Ihren Standort.","explanation":"Apps können erkennen wo du dich gerade befindest.","riskExplanation":"Dein genauer Standort verrät wo du wohnst und arbeitest.","impacts":["Keine ortsbasierten Empfehlungen","Wetter-Apps zeigen kein lokales Wetter","Find My Device funktioniert nicht mehr"],"registryPath":"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location","registryKey":"Value","recommendedValue":"Deny","riskLevel":"moderate","tier":"standard","warning":null}),
        json!({"id":"telemetrie-policy","category":"telemetrie","name":"Telemetrie (Gruppenrichtlinie)","description":"Sendet Diagnose- und Nutzungsdaten an Microsoft. Richtlinienebene.","explanation":"Windows sendet regelmäßig Informationen über deine Nutzung.","riskExplanation":"Microsoft sammelt umfangreiche Daten über deine Nutzung.","impacts":["Windows kann weniger gezielte Updates liefern","Einige Kompatibilitätsprüfungen entfallen"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection","registryKey":"AllowTelemetry","recommendedValue":1,"riskLevel":"high","tier":"advanced","warning":"Auf Windows Pro/Home ist Level 0 nicht verfügbar. Empfohlen: Level 1."}),
        json!({"id":"telemetrie-datacollection","category":"telemetrie","name":"Telemetrie (Datensammlung)","description":"Steuert den Umfang der an Microsoft gesendeten Diagnosedaten.","explanation":"Wie die Gruppenrichtlinie, aber über einen anderen Registry-Pfad.","riskExplanation":"Ohne diese Einstellung sendet Windows auf Level 3 alles.","impacts":["Gleiche Auswirkungen wie Telemetrie-Gruppenrichtlinie"],"registryPath":"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection","registryKey":"AllowTelemetry","recommendedValue":1,"riskLevel":"high","tier":"advanced","warning":"Gleiche Risiken wie Telemetrie-Gruppenrichtlinie."}),
        json!({"id":"wifi-sense","category":"telemetrie","name":"WiFi Sense","description":"Automatische Verbindung mit vorgeschlagenen WLAN-Hotspots.","explanation":"Windows verbindet sich automatisch mit WLANs und teilt Passwörter.","riskExplanation":"Dein WLAN-Passwort wird an Microsoft-Server gesendet.","impacts":["Keine automatische Verbindung mit vorgeschlagenen Hotspots","WLAN-Passwörter werden nicht mehr geteilt"],"registryPath":"HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config","registryKey":"AutoConnectAllowedOEM","recommendedValue":0,"riskLevel":"moderate","tier":"advanced","warning":"Erfordert Administratorrechte."}),
        json!({"id":"aktivitaet-feed","category":"aktivitaet","name":"Aktivitätsverlauf","description":"Erfasst Ihre Aktivitäten (geöffnete Apps, Dateien, Webseiten).","explanation":"Windows merkt sich alles was du tust.","riskExplanation":"Windows protokolliert lückenlos jede geöffnete Datei und Webseite.","impacts":["Windows-Zeitachse wird leer","Geräteübergreifende Aufgaben funktionieren nicht mehr"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System","registryKey":"EnableActivityFeed","recommendedValue":0,"riskLevel":"high","tier":"advanced","warning":"Erfordert Administratorrechte. Deaktiviert die Windows-Zeitachse systemweit."}),
        json!({"id":"aktivitaet-publish","category":"aktivitaet","name":"Aktivitäten veröffentlichen","description":"Sendet Ihren Aktivitätsverlauf an Microsoft-Server.","explanation":"Dein Aktivitätsverlauf wird an Microsoft-Server gesendet.","riskExplanation":"Deine komplette PC-Aktivität wird an Microsoft übertragen.","impacts":["Aktivitäten werden nicht mehr synchronisiert"],"registryPath":"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System","registryKey":"PublishUserActivities","recommendedValue":0,"riskLevel":"high","tier":"advanced","warning":"Erfordert Administratorrechte."}),
    ];

    let mut settings = Vec::new();
    for def in &defs {
        let id = def["id"].as_str().unwrap_or("");
        let reg_value = &reg_vals[id];
        let recommended = &def["recommendedValue"];

        let is_private = if reg_value.is_null() {
            false
        } else {
            reg_value.to_string().trim_matches('"') == recommended.to_string().trim_matches('"')
        };

        let mut setting = def.clone();
        if let Some(obj) = setting.as_object_mut() {
            obj.insert("registryValue".to_string(), reg_value.clone());
            obj.insert("isPrivate".to_string(), json!(is_private));
        }
        settings.push(setting);
    }

    json!(settings)
}

//! MAC OUI (Organizationally Unique Identifier) Lookup
//!
//! Maps first 3 octets of MAC address to manufacturer name.
//! Used ONLY for display labels AFTER dynamic device discovery.
//! Static table (~200 entries) + dynamic IEEE OUI database (~30,000+ entries).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// Dynamic OUI database loaded from downloaded oui.txt file
static DYNAMIC_OUI: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn dynamic_oui() -> &'static Mutex<HashMap<String, String>> {
    DYNAMIC_OUI.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Load the IEEE OUI database from the downloaded oui.txt file.
/// Format: "XX-XX-XX   (hex)\t\tVendor Name"
/// Returns the number of entries loaded.
pub fn load_dynamic_oui(data_dir: &std::path::Path) -> usize {
    let oui_path = data_dir.join("oui.txt");
    if !oui_path.exists() {
        return 0;
    }

    let content = match std::fs::read_to_string(&oui_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("OUI-Datei konnte nicht gelesen werden: {}", e);
            return 0;
        }
    };

    let mut map = HashMap::with_capacity(32000);
    for line in content.lines() {
        // Match lines like: "00-00-00   (hex)\t\tXEROX CORPORATION"
        if let Some(pos) = line.find("(hex)") {
            let prefix_part = line[..pos].trim();
            let vendor_part = line[pos + 5..].trim();
            if !vendor_part.is_empty() {
                // Convert "AA-BB-CC" to "AABBCC"
                let key: String = prefix_part
                    .chars()
                    .filter(|c| c.is_ascii_hexdigit())
                    .collect::<String>()
                    .to_uppercase();
                if key.len() == 6 {
                    map.insert(key, vendor_part.to_string());
                }
            }
        }
    }

    let count = map.len();
    if count > 0 {
        *dynamic_oui().lock().unwrap() = map;
        tracing::info!("Dynamische OUI-Datenbank geladen: {} Einträge", count);
    }
    count
}

fn oui_table() -> &'static HashMap<&'static str, &'static str> {
    static TABLE: OnceLock<HashMap<&str, &str>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut m = HashMap::with_capacity(220);

        // === Networking Equipment ===

        // AVM / Fritz!Box
        for p in ["3C4A92","303A64","E0286D","2C3AFD","C80E14","7430D7"] { m.insert(p, "AVM (Fritz!Box)"); }
        // TP-Link
        for p in ["50C7BF","60A4B7","B09575","1062EB","E8DE27","A0F3C1","5091E3","D8072B","EC172F","C006C3"] { m.insert(p, "TP-Link"); }
        // Netgear
        for p in ["20E52A","2CB05D","A42B8C","C43DC7","B07FB9","E091F5","9CD36D","6CB0CE"] { m.insert(p, "Netgear"); }
        // D-Link
        for p in ["1CBDB9","28107B","340804","84C9B2","CCB255","FCF528","F07D68"] { m.insert(p, "D-Link"); }
        // Ubiquiti
        for p in ["0418D6","245A4C","7483C2","802AA8","B4FBE4","F09FC2","687251"] { m.insert(p, "Ubiquiti"); }
        // Linksys
        for p in ["C0C1C0","684898","98FC11","E4F4C6","20AA4B"] { m.insert(p, "Linksys"); }
        // Cisco
        for p in ["001E7A","00265A","0040A6","88F031","F09E63","0025B4","000C85","70106F"] { m.insert(p, "Cisco"); }
        // MikroTik
        for p in ["2CC81B","488F5A","6C3B6B","D4CA6D","E48D8C","4C5E0C"] { m.insert(p, "MikroTik"); }
        // Aruba / HPE Networking
        for p in ["000B86","9C8CD8","D8C7C8","002272","00243E"] { m.insert(p, "Aruba/HPE"); }
        // Huawei
        for p in ["001E10","00259E","107B44","2008ED","34CDBE","80FB06","00E0FC","48435A","C8D15E","4C8BEF"] { m.insert(p, "Huawei"); }
        // ZTE
        for p in ["000E5C","74A063","883FD3","001E73"] { m.insert(p, "ZTE"); }
        // Zyxel
        for p in ["001349","D0542D","BC3400","BC9680","40B034"] { m.insert(p, "Zyxel"); }
        // Juniper
        for p in ["000585","002688","88E0F3","F4CC55"] { m.insert(p, "Juniper"); }

        // === PCs / Laptops ===

        // Dell
        for p in ["0018A4","001B11","D4BE25","F4CE46","14FEB5","246511","F8DB88","184F32","1866DA"] { m.insert(p, "Dell"); }
        // HP / Hewlett-Packard
        for p in ["0001E6","0017A4","001A4B","3C52A1","9CB654","2C41A1","EC8EB5","308D99","1CC1DE"] { m.insert(p, "HP"); }
        // Lenovo
        for p in ["001F16","28D24C","54E1AD","70F1A1","8C164D","E8F408","7085C2","2C8DB1","3448ED"] { m.insert(p, "Lenovo"); }
        // Intel
        for p in ["001517","001CC0","3C6AA7","689423","8C47BE","7CCC6C","000E0C","B4969B"] { m.insert(p, "Intel"); }
        // ASUS (Computer)
        for p in ["000C6E","2C56DC","50465D","1C872C","049226","2CFDA1","382C4A","74D02B"] { m.insert(p, "ASUS"); }
        // Microsoft (Surface, Xbox)
        for p in ["28185C","3C3786","5CBA37","7C1E52","9C3D40","6045BD","D83BBF"] { m.insert(p, "Microsoft"); }
        // Acer
        for p in ["B870F4","60F677","204E7F","9C5C8E"] { m.insert(p, "Acer"); }
        // Gigabyte
        for p in ["E06995","1C1BB5","94DE80","740980"] { m.insert(p, "Gigabyte"); }

        // === Consumer Electronics ===

        // Apple
        for p in [
            "0025BC","0026BB","3C15C2","403304","5855CA","6C709F","70DEE2","78A3E4",
            "7CC3A1","9027E4","A860B6","BC6C21","D02598","DC56E7","F0B479","0CD746",
            "109ADD","14109F","18AF8F","20A2E4","24A074","28E02C","2C200B","30F7C5",
            "3C2EF9","44D884","4C57CA","549F13","5CF938","60D9C7","685B35","6CC26B",
            "7014A6","74E2F5","7CD1C3","80E650","84788B","886B6E","8C8590","903C92",
            "98F0AB","9C207B","A04EA7","A45E60","A4C361","A8FAD8","ACFDEC","B065BD",
            "B8C111","C0B658","C82A14","CC29F5","D4619D","D8CF9C","E0ACCB","E4CE8F",
            "F02475","F40F24","F8E94E","FC253F"
        ] { m.insert(p, "Apple"); }

        // Samsung
        for p in ["002119","00265D","083AB8","6C2F2C","8C7115","A0CBFD","CC07AB","F80CF3","D09866","BC851F","E4121D","78ABBB","9463D1","50B7C3","AC5F3E"] { m.insert(p, "Samsung"); }
        // Sony
        for p in ["000476","001315","0024BE","0C5101","78843C","F80113","A44E31","B899B0"] { m.insert(p, "Sony"); }
        // LG Electronics
        for p in ["0019A1","001E75","0022A9","2CEE26","88C9D0","A8E544","58A2B5","00AA70"] { m.insert(p, "LG"); }
        // Xiaomi
        for p in ["04CF8C","28E31F","50EC50","64CC2E","78D2C4","7C1DD9","0C1DAF","34CE00","ACF7F3","9C9D7E"] { m.insert(p, "Xiaomi"); }
        // OnePlus / OPPO / Realme
        for p in ["C0EE40","940858","9CA584","A4DA22","4455B1"] { m.insert(p, "OnePlus/OPPO"); }
        // Nintendo
        for p in ["002709","0022D7","0024F3","002659","58BDA3","E84ECE","D8F8FE","34AF2C"] { m.insert(p, "Nintendo"); }

        // === Printers ===

        // Brother
        for p in ["001BA9","0019B9","30055C","78E7D1","C80178","0026AB","4016FA"] { m.insert(p, "Brother"); }
        // Canon
        for p in ["002067","00222D","182DB3","4C49E3","C4366C","68AB1E","3018CB"] { m.insert(p, "Canon"); }
        // Epson
        for p in ["002261","0048F8","64006A","B499BA","A4B1E8","002040","20BFDB"] { m.insert(p, "Epson"); }
        // Lexmark
        for p in ["0021B7","00204C","008043"] { m.insert(p, "Lexmark"); }

        // === Smart Home / IoT ===

        // Google (Nest, Chromecast, Home)
        for p in ["3C5AB4","D857EF","F4F5D8","54606E","F88FCA","A47733","48D6D5","30FD38"] { m.insert(p, "Google"); }
        // Amazon (Echo, Ring, Fire TV, Kindle)
        for p in ["34D270","40B4CD","4C6641","68ABE5","F0272D","0C47C9","44650D","A002DC","B47C9C","6837E9","74750C"] { m.insert(p, "Amazon"); }
        // Sonos
        for p in ["5CADCF","00098D","B8E937","48A6B8","347E5C","949A09"] { m.insert(p, "Sonos"); }
        // Philips / Signify (Hue)
        for p in ["001788","0009B0","0017FA","ECB5FA","0026EC"] { m.insert(p, "Philips/Signify"); }
        // Espressif (ESP32, ESP8266)
        for p in ["240AC4","246F28","840D8E","AC67B2","306105","B4E62D","CC50E3","30AEA4","A020A6"] { m.insert(p, "Espressif"); }
        // Raspberry Pi Foundation
        for p in ["B827EB","D83ADD","DCA632","E45F01","2CCF67"] { m.insert(p, "Raspberry Pi"); }
        // Shelly / Allterco
        for p in ["3494E4","EC6260","E868E7","84CCA8"] { m.insert(p, "Shelly"); }

        // === NAS / Storage ===

        // Synology
        for p in ["001132"] { m.insert(p, "Synology"); }
        // QNAP
        for p in ["245EBE","001EAC"] { m.insert(p, "QNAP"); }
        // Western Digital
        for p in ["0026B7","0090A9"] { m.insert(p, "Western Digital"); }

        // === Virtualization ===

        // VMware
        for p in ["000C29","005056","000569"] { m.insert(p, "VMware"); }
        // Microsoft Hyper-V
        for p in ["0050F2","00155D"] { m.insert(p, "Microsoft Hyper-V"); }

        // === Misc ===

        // Roku
        for p in ["B083FE","CC6DA0","D05349","B0A737"] { m.insert(p, "Roku"); }
        // Ring (Amazon)
        for p in ["B0A25B","18B430","502B73"] { m.insert(p, "Ring"); }
        // Bose
        for p in ["0C6C6C","044BED","602291","082665"] { m.insert(p, "Bose"); }
        // Dyson
        for p in ["288024","700D31"] { m.insert(p, "Dyson"); }
        // Logitech
        for p in ["0004F3","00C52C","008027","B0FC36","04F13E"] { m.insert(p, "Logitech"); }
        // Realtek (common in integrated NICs)
        for p in ["001F1F","00E04C","525400","8CEBC6","70B5E8"] { m.insert(p, "Realtek"); }
        // Qualcomm / Atheros
        for p in ["001CDF","002379","049F06","286ED4"] { m.insert(p, "Qualcomm"); }
        // Broadcom
        for p in ["0010C6","001018","001217"] { m.insert(p, "Broadcom"); }
        // MediaTek
        for p in ["000CE7","C4E90A","3C7C3F","78024B"] { m.insert(p, "MediaTek"); }
        // NVIDIA
        for p in ["00044B","48B02D"] { m.insert(p, "NVIDIA"); }
        // Honeywell
        for p in ["001AE2","D42C3D"] { m.insert(p, "Honeywell"); }
        // Hikvision
        for p in ["C0563A","28573C","44479A","BC3263","F41C95"] { m.insert(p, "Hikvision"); }
        // Dahua
        for p in ["3C9194","D4C8B0","E0D55E","A0BD1D"] { m.insert(p, "Dahua"); }
        // TP-Link Tapo / Kasa
        for p in ["F0A731","5C628B","545AA6"] { m.insert(p, "TP-Link (Smart Home)"); }
        // Tesla
        for p in ["4C7C5F","0C3E9F"] { m.insert(p, "Tesla"); }
        // Tuya / SmartLife
        for p in ["D8F15B","7CF666","10D561"] { m.insert(p, "Tuya"); }

        m
    })
}

/// Look up the vendor/manufacturer from a MAC address.
/// MAC can be in any format: "AA:BB:CC:DD:EE:FF", "AA-BB-CC-DD-EE-FF", "AABBCCDDEEFF"
/// Checks dynamic IEEE database first (if loaded), falls back to static table.
pub fn lookup(mac: &str) -> Option<String> {
    let hex: String = mac
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(6)
        .collect::<String>()
        .to_uppercase();

    if hex.len() < 6 {
        return None;
    }

    // Check dynamic database first (full IEEE OUI, ~30,000+ entries)
    if let Ok(db) = dynamic_oui().lock() {
        if let Some(vendor) = db.get(&hex) {
            return Some(vendor.clone());
        }
    }

    // Fall back to static curated table (~200 entries)
    oui_table().get(hex.as_str()).map(|s| s.to_string())
}

/// Classify device based on open ports, hostname, vendor, SSDP data, and role flags.
/// Returns (deviceType, deviceLabel, deviceIcon).
/// Labels include vendor name when known (e.g. "Brother Drucker" instead of "Drucker").
///
/// Classification priority:
/// 1. Known roles (local PC, gateway)
/// 2. SSDP/UPnP data (most reliable — device tells us what it IS)
/// 3. Port-based heuristics (strong signals like IPP/JetDirect)
/// 4. Hostname patterns
/// 5. Vendor name (weakest signal — NEVER alone for multi-product vendors)
pub fn classify_device(
    vendor: &str,
    hostname: &str,
    open_ports: &[u16],
    is_local: bool,
    is_gateway: bool,
    ssdp_friendly_name: &str,
    ssdp_model_name: &str,
    ssdp_model_description: &str,
) -> (String, String, String) {
    // Known roles
    if is_local {
        return (s("pc"), s("Eigener PC"), s("monitor"));
    }
    if is_gateway {
        let label = if vendor.is_empty() {
            s("Router/Gateway")
        } else {
            format!("{} Router/Gateway", vendor)
        };
        return (s("router"), label, s("wifi"));
    }

    // === Priority 1: SSDP/UPnP data (device self-identification) ===
    let ssdp_combined = format!("{} {} {}",
        ssdp_friendly_name.to_lowercase(),
        ssdp_model_name.to_lowercase(),
        ssdp_model_description.to_lowercase());
    let ssdp_trimmed = ssdp_combined.trim();

    if !ssdp_trimmed.is_empty() {
        // Printer keywords in SSDP
        if ssdp_trimmed.contains("printer") || ssdp_trimmed.contains("drucker")
            || ssdp_trimmed.contains("mfp") || ssdp_trimmed.contains("laserjet")
            || ssdp_trimmed.contains("inkjet") || ssdp_trimmed.contains("deskjet")
            || ssdp_trimmed.contains("officejet") || ssdp_trimmed.contains("pixma")
        {
            return (s("printer"), vl(vendor, "Drucker"), s("printer"));
        }
        // Router/Gateway in SSDP
        if ssdp_trimmed.contains("router") || ssdp_trimmed.contains("internet gateway")
            || ssdp_trimmed.contains("wlan") || ssdp_trimmed.contains("dsl")
        {
            return (s("router"), vl(vendor, "Router"), s("wifi"));
        }
        // NAS keywords
        if ssdp_trimmed.contains("nas") || ssdp_trimmed.contains("network storage")
            || ssdp_trimmed.contains("diskstation") || ssdp_trimmed.contains("readynas")
        {
            return (s("nas"), vl(vendor, "NAS-Speicher"), s("hard-drive"));
        }
        // Media renderer / TV
        if ssdp_trimmed.contains("mediarenderer") || ssdp_trimmed.contains("media renderer")
            || ssdp_trimmed.contains("television") || ssdp_trimmed.contains("smart tv")
            || ssdp_trimmed.contains("smarttv")
        {
            return (s("tv"), vl(vendor, "Smart-TV/Streaming"), s("tv"));
        }
        // Camera
        if ssdp_trimmed.contains("camera") || ssdp_trimmed.contains("kamera")
            || ssdp_trimmed.contains("ipcam") || ssdp_trimmed.contains("webcam")
        {
            return (s("camera"), vl(vendor, "IP-Kamera"), s("camera"));
        }
        // Speaker
        if ssdp_trimmed.contains("speaker") || ssdp_trimmed.contains("lautsprecher")
            || ssdp_trimmed.contains("sonos") || ssdp_trimmed.contains("soundbar")
        {
            return (s("speaker"), vl(vendor, "Lautsprecher"), s("speaker"));
        }
    }

    // === Priority 2: Port-based heuristics ===
    let has_http = open_ports.contains(&80) || open_ports.contains(&443);
    let has_smb = open_ports.contains(&445) || open_ports.contains(&139);
    let has_rdp = open_ports.contains(&3389);
    let has_ssh = open_ports.contains(&22);
    let has_ipp = open_ports.contains(&631);
    let has_jetdirect = open_ports.contains(&9100);
    let has_dns = open_ports.contains(&53);

    let h = hostname.to_lowercase();
    let v = vendor.to_lowercase();

    // Printer detection (strong signal: IPP or JetDirect port)
    if has_ipp || has_jetdirect {
        return (s("printer"), vl(vendor, "Drucker"), s("printer"));
    }

    // === Priority 3: Hostname patterns ===
    // Printer by hostname pattern
    if h.contains("printer") || h.contains("brn") || h.contains("brw")
        || h.contains("epson") || h.contains("lexmark")
    {
        return (s("printer"), vl(vendor, "Drucker"), s("printer"));
    }

    // Smart speaker / voice assistant by hostname
    if h.contains("echo") || h.contains("alexa") || h.contains("google-home") || h.contains("homepod") {
        return (s("speaker"), vl(vendor, "Smart-Speaker"), s("speaker"));
    }

    // Smart TV / Streaming by hostname
    if h == "tv" || h.contains("-tv") || h.contains("tv-") || h.starts_with("tv.")
        || h.contains("smart-tv") || h.contains("smarttv")
        || h.contains("fire-tv") || h.contains("firetv") || h.contains("chromecast")
        || h.contains("roku") || h.contains("appletv") || h.contains("apple-tv")
    {
        return (s("tv"), vl(vendor, "Smart-TV/Streaming"), s("tv"));
    }
    // Smart TV by vendor
    if v.contains("sonos") {
        return (s("speaker"), s("Sonos-Lautsprecher"), s("speaker"));
    }
    if v.contains("roku") {
        return (s("tv"), s("Roku Streaming-Gerät"), s("tv"));
    }

    // Mobile phone/tablet by hostname
    if h.contains("iphone") || h.contains("ipad") || h.contains("android")
        || h.contains("galaxy") || h.contains("pixel") || h.contains("oneplus")
        || h.contains("huawei") || h.contains("xiaomi") || h.contains("redmi")
        || h.contains("oppo") || h.contains("realme")
    {
        return (s("mobile"), vl(vendor, "Smartphone/Tablet"), s("smartphone"));
    }

    // Game console by vendor
    if v.contains("nintendo") {
        return (s("gaming"), s("Nintendo Konsole"), s("gamepad-2"));
    }

    // Windows PC/Server (SMB + RDP)
    if has_smb && has_rdp {
        return (s("pc"), vl(vendor, "Windows-PC"), s("monitor"));
    }

    // NAS/Server (SMB + HTTP, no RDP) — check vendor for known NAS brands
    if has_smb && has_http && !has_rdp {
        if v.contains("synology") || v.contains("qnap") || v.contains("western digital")
            || v.contains("asustor") || h.contains("nas") || h.contains("diskstation")
        {
            return (s("nas"), vl(vendor, "NAS-Speicher"), s("hard-drive"));
        }
        return (s("server"), vl(vendor, "Server/NAS"), s("server"));
    }

    // DNS Server (could be a Pi-hole, router, etc.)
    if has_dns && !has_http {
        return (s("server"), vl(vendor, "DNS-Server"), s("server"));
    }

    // Linux device (SSH, possibly HTTP, no Windows indicators)
    if has_ssh && !has_rdp && !has_smb {
        if v.contains("raspberry") || h.contains("raspberry") || h.contains("raspberrypi") {
            return (s("iot"), s("Raspberry Pi"), s("cpu"));
        }
        return (s("linux"), vl(vendor, "Linux-Gerät"), s("terminal"));
    }

    // IoT / Smart Home by vendor
    if v.contains("espressif") || v.contains("shelly") || v.contains("tuya")
        || v.contains("tp-link (smart") || v.contains("philips") || v.contains("signify")
    {
        return (s("iot"), vl(vendor, "Smart-Home-Gerät"), s("cpu"));
    }

    // Hikvision / Dahua = IP camera
    if v.contains("hikvision") || v.contains("dahua") {
        return (s("camera"), vl(vendor, "IP-Kamera"), s("camera"));
    }

    // Generic HTTP device without other identifiers
    if has_http && !has_smb && !has_rdp && !has_ssh {
        return (s("iot"), vl(vendor, "Netzwerkgerät"), s("cpu"));
    }

    // Windows machine with just SMB
    if has_smb && !has_rdp {
        return (s("pc"), vl(vendor, "Netzwerk-PC"), s("monitor"));
    }

    // Unknown — still try to use vendor if we have one
    if !vendor.is_empty() {
        return (s("unknown"), format!("{} (Gerät)", vendor), s("help-circle"));
    }

    (s("unknown"), s("Unbekanntes Gerät"), s("help-circle"))
}

/// Helper: &str → String
fn s(val: &str) -> String { val.to_string() }

/// Helper: vendor-prefixed label (e.g. "Brother Drucker")
fn vl(vendor: &str, label: &str) -> String {
    if vendor.is_empty() {
        label.to_string()
    } else {
        format!("{} {}", vendor, label)
    }
}

/// Map a reverse DNS hostname to a company name.
/// Used for IP→company resolution in the connections view.
/// This is a display-only mapping AFTER dynamic DNS resolution.
pub fn hostname_to_company(hostname: &str) -> Option<&'static str> {
    let h = hostname.to_lowercase();

    // Cloud providers
    if h.contains(".amazonaws.com") || h.contains(".aws.") || h.contains(".amazon.com") {
        return Some("Amazon AWS");
    }
    if h.contains(".google.com") || h.contains(".1e100.net") || h.contains(".googleapis.com")
        || h.contains(".gstatic.com") || h.contains(".googlevideo.com")
        || h.contains(".gvt1.com") || h.contains(".gvt2.com")
    {
        return Some("Google");
    }
    if h.contains(".microsoft.com") || h.contains(".msedge.net") || h.contains(".azure.")
        || h.contains(".office365.") || h.contains(".office.com") || h.contains(".live.com")
        || h.contains(".outlook.com") || h.contains(".bing.com") || h.contains(".windows.com")
        || h.contains(".windowsupdate.com") || h.contains(".msn.com") || h.contains(".skype.com")
        || h.contains(".onedrive.com") || h.contains(".sharepoint.com") || h.contains(".trafficmanager.net")
    {
        return Some("Microsoft");
    }
    if h.contains(".apple.com") || h.contains(".icloud.com") || h.contains(".cdn-apple.com")
        || h.contains(".mzstatic.com")
    {
        return Some("Apple");
    }
    if h.contains(".facebook.com") || h.contains(".fbcdn.net") || h.contains(".meta.com")
        || h.contains(".instagram.com") || h.contains(".whatsapp.")
    {
        return Some("Meta");
    }
    if h.contains(".cloudflare.com") || h.contains(".cloudflare-dns.com")
        || h.contains(".cloudflareclient.com") || h.contains(".cf-")
    {
        return Some("Cloudflare");
    }
    if h.contains(".akamai.") || h.contains(".akamaiedge.") || h.contains(".akamaized.")
        || h.contains(".akadns.net") || h.contains(".akam.net")
    {
        return Some("Akamai");
    }
    if h.contains(".fastly.net") || h.contains(".fastly.com") {
        return Some("Fastly");
    }

    // CDN / Infrastructure
    if h.contains(".edgecastcdn.") || h.contains(".verizondigitalmedia.") {
        return Some("Verizon Digital Media");
    }
    if h.contains(".limelight.") || h.contains(".llnwd.") {
        return Some("Limelight");
    }
    if h.contains(".edgekey.net") || h.contains(".edgesuite.net") {
        return Some("Akamai");
    }

    // ISPs / Telecoms (DE)
    if h.contains(".telekom.de") || h.contains(".t-online.de") || h.contains(".dtag.de")
        || h.contains(".telekom.") || h.contains("t-ipconnect.de")
    {
        return Some("Deutsche Telekom");
    }
    if h.contains(".vodafone.") || h.contains(".unity-media.") || h.contains(".unitymedia.")
        || h.contains(".kabeldeutschland.")
    {
        return Some("Vodafone");
    }
    if h.contains(".o2online.de") || h.contains(".telefonica.") {
        return Some("O2/Telefónica");
    }
    if h.contains("1und1.de") || h.contains("1and1.") {
        return Some("1&1");
    }

    // Hosting
    if h.contains(".hetzner.") {
        return Some("Hetzner");
    }
    if h.contains(".ovh.") || h.contains(".ovhcloud.") {
        return Some("OVH");
    }
    if h.contains(".digitalocean.com") {
        return Some("DigitalOcean");
    }
    if h.contains(".linode.com") {
        return Some("Linode/Akamai");
    }

    // Services
    if h.contains(".steam") || h.contains(".valve.net") || h.contains("steampowered.com") {
        return Some("Valve/Steam");
    }
    if h.contains(".discord.") || h.contains(".discordapp.") || h.contains(".discord.media") {
        return Some("Discord");
    }
    if h.contains(".spotify.") || h.contains(".scdn.") || h.contains(".spotifycdn.") {
        return Some("Spotify");
    }
    if h.contains(".netflix.") || h.contains(".nflx") {
        return Some("Netflix");
    }
    if h.contains(".twitch.tv") || h.contains(".twitchcdn.") || h.contains(".jtvnw.net") {
        return Some("Twitch");
    }
    if h.contains(".youtube.com") || h.contains(".ytimg.com") || h.contains(".yt.be") {
        return Some("YouTube");
    }
    if h.contains(".github.") || h.contains(".githubusercontent.") || h.contains(".githubassets.") {
        return Some("GitHub");
    }
    if h.contains(".slack.") || h.contains(".slack-edge.com") {
        return Some("Slack");
    }
    if h.contains(".zoom.us") || h.contains(".zoom.") {
        return Some("Zoom");
    }
    if h.contains(".adobe.") || h.contains(".adobecc.") || h.contains(".typekit.") {
        return Some("Adobe");
    }
    if h.contains(".dropbox.") || h.contains(".dropboxapi.") {
        return Some("Dropbox");
    }
    if h.contains(".openai.com") || h.contains(".oaiusercontent.") {
        return Some("OpenAI");
    }
    if h.contains(".anthropic.com") {
        return Some("Anthropic");
    }
    if h.contains(".twitter.com") || h.contains(".x.com") || h.contains(".twimg.com") {
        return Some("X/Twitter");
    }
    if h.contains(".linkedin.com") || h.contains(".licdn.com") {
        return Some("LinkedIn");
    }
    if h.contains(".reddit.com") || h.contains(".redditmedia.") || h.contains(".redd.it") {
        return Some("Reddit");
    }
    if h.contains(".tiktok.com") || h.contains(".tiktokcdn.") || h.contains(".musical.ly") {
        return Some("TikTok");
    }
    if h.contains(".snapchat.com") || h.contains(".snap.") || h.contains(".sc-cdn.net") {
        return Some("Snapchat");
    }
    if h.contains(".pinterest.com") {
        return Some("Pinterest");
    }

    // Security / DNS
    if h.contains(".sentry.io") || h.contains(".sentry-cdn.") {
        return Some("Sentry");
    }
    if h.contains(".cloudfront.net") {
        return Some("Amazon CloudFront");
    }
    if h.contains(".azureedge.net") || h.contains(".azurewebsites.net") {
        return Some("Microsoft Azure");
    }

    // Tracking / Ads (marked as tracker info)
    if h.contains(".doubleclick.net") || h.contains(".googlesyndication.")
        || h.contains(".googleadservices.") || h.contains(".googletagmanager.")
        || h.contains(".google-analytics.")
    {
        return Some("Google Ads/Analytics");
    }
    if h.contains(".scorecardresearch.") || h.contains(".quantserve.") {
        return Some("ComScore");
    }
    if h.contains(".demdex.net") || h.contains(".omtrdc.net") {
        return Some("Adobe Analytics");
    }
    if h.contains(".criteo.") || h.contains(".criteo.net") {
        return Some("Criteo");
    }
    if h.contains(".outbrain.") || h.contains(".taboola.") {
        return Some("Ad-Netzwerk");
    }

    None
}

/// Check if a reverse DNS hostname indicates a tracker/ad service
pub fn is_tracker(hostname: &str) -> bool {
    let h = hostname.to_lowercase();
    h.contains(".doubleclick.") || h.contains("googlesyndication.")
        || h.contains("googleadservices.") || h.contains("google-analytics.")
        || h.contains(".scorecardresearch.") || h.contains(".quantserve.")
        || h.contains(".demdex.net") || h.contains(".omtrdc.net")
        || h.contains(".criteo.") || h.contains(".outbrain.")
        || h.contains(".taboola.") || h.contains(".moatads.")
        || h.contains(".adsrvr.") || h.contains(".adnxs.")
        || h.contains(".rubiconproject.") || h.contains(".pubmatic.")
        || h.contains(".openx.") || h.contains(".bidswitch.")
        || h.contains(".casalemedia.") || h.contains(".bluekai.")
        || h.contains("pixel.facebook.") || h.contains("graph.facebook.")
        || h.contains(".google-analytics.") || h.contains(".googleanalytics.")
}

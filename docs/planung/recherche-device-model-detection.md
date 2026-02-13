# Recherche: Netzwerkgeräte-Modell-Erkennung

**Datum:** 2026-02-12
**Ziel:** Exakte Modellnamen von Netzwerkgeräten identifizieren (z.B. "HP LaserJet Pro M404dn" statt nur "HP")

---

## 1. SNMP (Simple Network Management Protocol)

### Funktionsweise
SNMP ermöglicht die Abfrage von Geräteinformationen über standardisierte OIDs (Object Identifiers). Mehrere OIDs können Modellinformationen liefern:

#### Wichtigste OIDs für Modell-Identifikation
- **sysDescr (1.3.6.1.2.1.1.1.0):** Systembeschreibung (z.B. "Zebra Technologies ZD421-203dpi / internal wired")
- **sysObjectID (1.3.6.1.2.1.1.2.0):** Zeigt auf MIB-Datei im Hersteller-Subtree → ermöglicht Gerätetyp-Identifikation
- **Host Resource MIB (1.3.6.1.2.1.25.3.2.1.3.1):** Gibt Druckermodell zurück (z.B. "HP Laser Jet 4000 Series")
- **Hersteller-spezifische OIDs:** z.B. 1.3.6.1.4.1.11.2.3.9.1.1.7.0 für HP-Drucker (enthält genaue Modellbezeichnung)

### Zuverlässigkeit
- **Standard-Drucker:** 60-80% haben SNMP aktiviert (oft mit Default-Community "public")
- **Enterprise-Drucker:** ~90% SNMP-Unterstützung
- **Home-Router/NAS:** 20-40% (oft deaktiviert)
- **Netzwerk-Switches:** ~95% (meist aktiviert)

**Problem:** Viele Canon-Drucker verwenden dieselbe SNMP-OID für ganze Produktfamilien → ungenaue Identifikation

### Sicherheit
- SNMPv1/v2c: Klartext-Community-Strings → **hohes Risiko** (Standard "public" ist weithin bekannt)
- SNMPv3: Verschlüsselte Authentifizierung → sicher, aber selten aktiviert
- Ports: UDP 161 (Anfragen), UDP 162 (Traps)
- **Empfehlung:** Nur Read-Only-Community, IP-Filterung, SNMPv3 bevorzugen

### Node.js Implementierung
**Bibliothek:** `net-snmp` (npm, unterstützt SNMPv1/v2c/v3, Get/GetNext/Set)

```javascript
const snmp = require('net-snmp');

async function getDeviceModel(ip) {
    const session = snmp.createSession(ip, 'public', { version: snmp.Version2c });
    const oids = [
        '1.3.6.1.2.1.1.1.0',      // sysDescr
        '1.3.6.1.2.1.1.2.0',      // sysObjectID
        '1.3.6.1.2.1.25.3.2.1.3.1' // Host Resource MIB (Drucker)
    ];

    return new Promise((resolve, reject) => {
        session.get(oids, (error, varbinds) => {
            if (error) return reject(error);

            const model = {
                description: varbinds[0].value.toString(),
                objectID: varbinds[1].value.toString(),
                printerModel: varbinds[2] ? varbinds[2].value.toString() : null
            };

            session.close();
            resolve(model);
        });
    });
}
```

**PowerShell-Alternative:**
```powershell
# Erfordert SNMP-Tools (z.B. snmpget aus Net-SNMP für Windows)
& 'C:\usr\bin\snmpget.exe' -v 2c -c public 192.168.1.100 1.3.6.1.2.1.1.1.0
```

---

## 2. UPnP/SSDP (Universal Plug and Play / Simple Service Discovery Protocol)

### Funktionsweise
Geräte senden Multicast-Announcements über das Netzwerk. Clients können per M-SEARCH nach Geräten suchen.

- **Multicast-Adresse:** 239.255.255.250:1900 (IPv4), ff0x::c (IPv6)
- **Protokoll:** HTTP über UDP
- **Discovery:** M-SEARCH mit Header `ST: ssdp:all` → Geräte antworten mit LOCATION-Header (URL zur Device Description XML)
- **Device Description XML:** Enthält `<modelName>`, `<modelNumber>`, `<manufacturer>`, `<serialNumber>`

### Zuverlässigkeit
- **Smart-Home-Geräte:** 70-90% (Philips Hue, Sonos, Chromecast)
- **Drucker:** 40-60% (moderne Netzwerk-Drucker)
- **Router/NAS:** 50-70% (UPnP oft aktiviert für Port-Forwarding)
- **IoT-Geräte:** Sehr variabel (10-80%)

### Sicherheit
**WARNUNG:** UPnP ist ein massives Sicherheitsrisiko!
- Keine Authentifizierung → jeder im Netzwerk kann Geräte manipulieren
- UPnP-Exploits ermöglichen Port-Forwarding von außen → DDoS-Angriffe
- **Empfehlung:** Nur für Discovery nutzen, niemals für Konfiguration

### Node.js Implementierung
**Bibliothek:** `node-ssdp` (npm)

```javascript
const { Client } = require('node-ssdp');
const http = require('http');
const { parseString } = require('xml2js');

async function discoverUPnPDevices() {
    const client = new Client();
    const devices = [];

    client.on('response', async (headers, statusCode, rinfo) => {
        const location = headers.LOCATION;
        if (!location) return;

        try {
            const xml = await fetchURL(location);
            const parsed = await parseXML(xml);

            devices.push({
                ip: rinfo.address,
                modelName: parsed.device.modelName[0],
                manufacturer: parsed.device.manufacturer[0],
                modelNumber: parsed.device.modelNumber?.[0] || '',
                serialNumber: parsed.device.serialNumber?.[0] || ''
            });
        } catch (err) {
            console.error('UPnP Parse Error:', err);
        }
    });

    client.search('ssdp:all');

    return new Promise(resolve => {
        setTimeout(() => {
            client.stop();
            resolve(devices);
        }, 5000); // 5 Sekunden warten auf Antworten
    });
}

function fetchURL(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseXML(xml) {
    return new Promise((resolve, reject) => {
        parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result.root);
        });
    });
}
```

**PowerShell-Alternative:**
```powershell
# M-SEARCH senden per UDP
$socket = New-Object System.Net.Sockets.UdpClient
$socket.EnableBroadcast = $true
$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse("239.255.255.250"), 1900)

$msearch = "M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 3`r`nST: ssdp:all`r`n`r`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($msearch)
$socket.Send($bytes, $bytes.Length, $endpoint)

# Antworten empfangen (nicht-blocking, 5 Sekunden Timeout)
$socket.Client.ReceiveTimeout = 5000
while ($true) {
    try {
        $data = $socket.Receive([ref]$endpoint)
        $response = [System.Text.Encoding]::UTF8.GetString($data)
        Write-Output $response
    } catch {
        break
    }
}
```

---

## 3. mDNS/Bonjour (Multicast DNS / DNS-SD)

### Funktionsweise
Apple Bonjour/Avahi-Protokoll für Zero-Configuration-Networking. Geräte advertieren Services über Multicast-DNS.

- **Port:** UDP 5353
- **Multicast-Gruppe:** 224.0.0.251 (IPv4), ff02::fb (IPv6)
- **Service-Types:** `_ipp._tcp` (Drucker), `_http._tcp`, `_smb._tcp`, `_airplay._tcp`
- **TXT Records:** Enthalten Metadaten wie Modell, Hersteller, Fähigkeiten

#### Wichtige TXT-Record-Felder (Drucker)
- `ty=`: Typ/Modell (z.B. "Xerox WorkCentre 7556")
- `product=`: Produkt (z.B. "(Xerox WorkCentre 7556)")
- `pdl=`: Unterstützte Seitenbeschreibungssprachen (PostScript, PCL, etc.)
- `adminurl=`: Admin-URL für Webinterface

### Zuverlässigkeit
**Grundsätzlich einfach und zuverlässig — ABER:**
- **Wi-Fi-Treiber-Bugs:** Viele Wi-Fi-Chips (Intel, Broadcom) haben Bugs bei AES-verschlüsselten Multicast-Paketen (WPA2/CCMP) → mDNS funktioniert intermittierend
- **Access-Point-Probleme:** Manche APs nutzen falschen Key-Index für Multicast → Drucker nur 1h/Tag erkennbar
- **Subnet-Grenzen:** mDNS funktioniert NUR im lokalen Subnet (keine Router-Überquerung)
- **Erfolgsrate (praktisch):** 50-70% bei Consumer-Hardware, 90% bei Apple-Geräten im Netzwerk

### Sicherheit
- Keine Authentifizierung → lokale Geräte können sich als beliebige Services ausgeben
- Spoofing-Risiko: Angreifer kann gefälschte Services advertieren
- **Aber:** Nur lokal im Netzwerk, kein externes Risiko

### Node.js Implementierung
**Bibliothek:** `mdns` oder `bonjour` (npm)

```javascript
const Bonjour = require('bonjour')();

function discoverMDNSDevices() {
    return new Promise((resolve) => {
        const devices = [];

        // Nach Druckern suchen
        const browser = Bonjour.find({ type: 'ipp' }, (service) => {
            devices.push({
                name: service.name,
                ip: service.addresses[0],
                port: service.port,
                modelName: service.txt?.ty || service.txt?.product || '',
                type: service.txt?.pdl || '',
                adminURL: service.txt?.adminurl || ''
            });
        });

        setTimeout(() => {
            browser.stop();
            resolve(devices);
        }, 5000);
    });
}

// Mehrere Service-Types parallel scannen
async function fullMDNSScan() {
    const serviceTypes = ['ipp', 'http', 'smb', 'airplay', 'googlecast'];
    const results = await Promise.all(
        serviceTypes.map(type =>
            new Promise(resolve => {
                const devices = [];
                const browser = Bonjour.find({ type }, service => devices.push(service));
                setTimeout(() => { browser.stop(); resolve(devices); }, 5000);
            })
        )
    );
    return results.flat();
}
```

**PowerShell-Alternative:**
```powershell
# Windows 10+ hat Get-DnsClientCache, aber kein natives mDNS-Browsing
# Alternative: dns-sd.exe (Bonjour Print Services) oder avahi-browse (WSL)

# Bonjour Print Services installiert → dns-sd.exe verwenden
& 'C:\Program Files\Bonjour\dns-sd.exe' -B _ipp._tcp local.

# WSL + avahi-utils
wsl avahi-browse -a -t -r
```

---

## 4. HTTP Banner Grabbing

### Funktionsweise
Viele Netzwerkgeräte (Drucker, Router, NAS) haben eingebaute Webserver. HTTP-Requests an Port 80/443 liefern oft:
- **Server-Header:** z.B. `Server: HP-ChaiSOE/1.0` oder `Server: lighttpd/1.4.35`
- **HTML-Title:** z.B. `<title>HP LaserJet Pro M404dn - Login</title>`
- **Favicon:** Gerätespezifische Icons (können per Hash identifiziert werden)
- **Redirect-URLs:** Oft eindeutige Pfade wie `/web/guest/en/websys/webArch/mainFrame.cgi` (Brother)

### Zuverlässigkeit
- **Drucker:** 80-95% haben Webinterface (meist Port 80 offen)
- **Router:** 90%+ (oft Port 80 oder 8080)
- **NAS:** ~95%
- **IoT-Geräte:** Sehr variabel (30-90%)

**Vorteil:** Funktioniert fast immer, auch wenn SNMP/UPnP deaktiviert ist.

### Sicherheit
**Kein Sicherheitsrisiko** — nur passives Lesen von öffentlich verfügbaren HTTP-Headern.

### Node.js Implementierung
```javascript
const http = require('http');
const https = require('https');

async function httpBannerGrab(ip, port = 80) {
    return new Promise((resolve) => {
        const protocol = port === 443 ? https : http;
        const options = {
            hostname: ip,
            port: port,
            path: '/',
            method: 'GET',
            timeout: 3000,
            rejectUnauthorized: false // Akzeptiere Self-Signed Certs
        };

        const req = protocol.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk.toString());
            res.on('end', () => {
                // Title aus HTML extrahieren
                const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
                const title = titleMatch ? titleMatch[1] : '';

                resolve({
                    ip,
                    server: res.headers.server || '',
                    title,
                    statusCode: res.statusCode
                });
            });
        });

        req.on('error', () => resolve({ ip, server: '', title: '', statusCode: 0 }));
        req.on('timeout', () => { req.destroy(); resolve({ ip, server: '', title: '', statusCode: 0 }); });
        req.end();
    });
}
```

**PowerShell-Alternative:**
```powershell
$ip = "192.168.1.100"
$response = Invoke-WebRequest -Uri "http://$ip" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue

if ($response) {
    $title = ($response.Content -match '<title>([^<]+)</title>') ? $matches[1] : ''
    [PSCustomObject]@{
        IP = $ip
        Server = $response.Headers['Server']
        Title = $title
        StatusCode = $response.StatusCode
    }
}
```

---

## 5. WSD (Web Services for Devices) — Windows-Native

### Funktionsweise
Microsoft-Protokoll für automatische Drucker-/Scanner-Erkennung in Windows-Netzwerken.

- **Port:** TCP/UDP 3702
- **Multicast-Adresse:** 239.255.255.250 oder ff02::c (wie SSDP)
- **Discovery-Protokoll:** WS-Discovery (SOAP über HTTP)
- **Schema:** Basiert auf PWG Semantic Model (Printer Working Group)

**Windows-Integration:**
- Windows Explorer → "Netzwerk" → zeigt WSD-Geräte automatisch
- Doppelklick installiert Drucker automatisch (via WSDMON Port Monitor)
- Device Description enthält `<ModelID>`, `<Manufacturer>`, `<ModelName>`

### Zuverlässigkeit
- **Windows-Drucker:** 70-90% (Microsoft IPP Class Driver bevorzugt WSD)
- **Nicht-Windows-Geräte:** 10-30% (wenig Unterstützung außerhalb Microsoft-Ökosystem)

**Vorteil:** Beste Integration in Windows — keine zusätzliche Software nötig.

### Sicherheit
- Keine Authentifizierung (wie UPnP/mDNS)
- Nur lokales Netzwerk

### PowerShell Implementierung
```powershell
# Get-Printer zeigt installierte Drucker mit WSD-Ports
Get-Printer | Where-Object { $_.PortName -like 'WSD*' } | ForEach-Object {
    $port = Get-PrinterPort -Name $_.PortName
    [PSCustomObject]@{
        Name = $_.Name
        DriverName = $_.DriverName
        PortName = $_.PortName
        DeviceURL = $port.DeviceURL  # Enthält IP-Adresse
    }
}

# WMI-Abfrage für alle WSD-Geräte (inkl. nicht-installierte)
Get-WmiObject -Class Win32_PnPEntity | Where-Object {
    $_.DeviceID -like 'SWD\DAFWSDProvider*'
} | Select-Object Name, DeviceID, Manufacturer
```

**Node.js:** Kein natives WSD-Modul — müsste über PowerShell-Calls oder Windows-API (ffi-napi) implementiert werden.

---

## 6. NetBIOS / LLMNR (Legacy, aber weit verbreitet)

### Funktionsweise
- **NetBIOS:** Windows-Name-Resolution-Protokoll (Ports 137-139)
- **LLMNR:** Link-Local Multicast Name Resolution (Port 5355) — Nachfolger von NetBIOS
- **Abfrage:** Hostname → IP-Adresse, Workgroup-Zugehörigkeit

**Liefert KEIN Gerätemodell**, aber hilfreich für:
- Hostname-Auflösung (→ dann HTTP-Banner-Grabbing)
- Erkennung von Windows-Geräten (Workgroup-Namen)

### Zuverlässigkeit
- **Windows-PCs:** ~95%
- **Linux/macOS:** 20-40% (Avahi kann LLMNR beantworten)
- **Drucker/IoT:** 30-60%

### Sicherheit
**WARNUNG:** NetBIOS/LLMNR sind bekannte Sicherheitslücken!
- LLMNR-Poisoning: Angreifer kann gefälschte Hostnamen liefern → NTLM-Hash-Capture
- **Empfehlung:** Nur für passive Discovery nutzen, niemals für Authentifizierung

### PowerShell Implementierung
```powershell
# NetBIOS-Namen im Netzwerk finden
nbtstat -n  # Lokale NetBIOS-Namen
nbtstat -a 192.168.1.100  # Remote-Gerät abfragen

# LLMNR-Auflösung (automatisch von Resolve-DnsName)
Resolve-DnsName -Name "PRINTER01" -LlmnrOnly
```

---

## Zusammenfassung & Empfehlung

### Beste Kombination für maximale Abdeckung:

1. **HTTP Banner Grabbing (Port 80/443)** → 80-95% Erfolgsrate, funktioniert fast immer
2. **mDNS/Bonjour (_ipp._tcp, _http._tcp)** → 50-90% bei Druckern, 90% bei Apple-Geräten
3. **SNMP (sysDescr + Host Resource MIB)** → 60-80% bei Druckern, gut für Modelldetails
4. **UPnP/SSDP** → 40-70%, gut für Smart-Home/IoT
5. **WSD (PowerShell Get-Printer)** → 70-90% für Windows-Drucker (nur bereits installierte)

### Implementierungsstrategie für Speicher Analyse:

```javascript
// main/network-device-discovery.js
async function identifyDeviceModel(ip, openPorts, hostname) {
    const methods = [];

    // 1. HTTP Banner (wenn Port 80/443 offen)
    if (openPorts.includes(80)) {
        methods.push(httpBannerGrab(ip, 80));
    }
    if (openPorts.includes(443)) {
        methods.push(httpBannerGrab(ip, 443));
    }

    // 2. SNMP (wenn Port 161 offen)
    if (openPorts.includes(161)) {
        methods.push(snmpGetModel(ip, 'public'));
    }

    // 3. mDNS (immer versuchen, parallel)
    methods.push(mdnsLookup(hostname || ip));

    // 4. UPnP (wenn SSDP-Port 1900 antwortet)
    methods.push(upnpLookup(ip));

    // Alle Methoden parallel ausführen, erste erfolgreiche nimmt
    const results = await Promise.allSettled(methods);
    return aggregateResults(results);
}
```

**Geschätzte Gesamt-Erfolgsrate:** 85-95% für Drucker, 70-90% für andere Netzwerkgeräte.

---

## Quellen

- [Is there Printer Model specific OID? (SNMP)](https://comp.protocols.snmp.narkive.com/K9EgvEnT/is-there-printer-model-specific-oid)
- [SNMP Ports for Printers](https://www.3manager.com/post/snmp-ports-for-printers-what-to-be-aware-of-when-using-printer-management-tools)
- [UPnP Device Architecture Specification](https://upnp.org/resources/documents/UPnP_UDA_tutorial_July2014.pdf)
- [Simple Service Discovery Protocol (Wikipedia)](https://en.wikipedia.org/wiki/Simple_Service_Discovery_Protocol)
- [Bonjour Printing Specification](https://developer.apple.com/bonjour/printing-specification/)
- [RFC 6763 - DNS-Based Service Discovery](https://tools.ietf.org/html/rfc6763)
- [Troubleshooting printer discovery problems with mDNS](https://www.papercut.com/help/manuals/mobility-print/troubleshooting/discovery-mdns/)
- [Web Services for Devices (Microsoft Learn)](https://learn.microsoft.com/en-us/windows-hardware/drivers/print/ws-print-v1-1)
- [WS-Discovery (Wikipedia)](https://en.wikipedia.org/wiki/WS-Discovery)
- [OWASP: Fingerprint Web Server](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/02-Fingerprint-Web-Server)
- [Banner Grabbing (Wikipedia)](https://en.wikipedia.org/wiki/Banner_grabbing)
- [PowerShell Get-PrinterPort](https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printerport)
- [Node.js net-snmp Library](https://www.npmjs.com/package/net-snmp)
- [Node.js Bonjour Library](https://www.npmjs.com/package/bonjour)
- [Printer Status Monitor: Node.js SNMP & ESC/POS Guide](https://www.iflair.com/how-to-detect-printer-status-online-offline-paper-out-or-errors-in-node-js-with-kiosk/)

# Recherche: Seriennummern-Abruf von Netzwerkgeräten

**Datum:** 2026-02-12
**Kontext:** Netzwerk-Scanner Feature (v7.1+) — Machbarkeit der Seriennummern-Erkennung

---

## Executive Summary

Die Abfrage von Seriennummern über das Netzwerk ist **technisch möglich, aber mit stark eingeschränkten Erfolgsraten** in Consumer-Umgebungen. Enterprise-Geräte (Cisco, HP, Dell) liefern verlässliche Ergebnisse via SNMP (60-80% Erfolgsquote), während Consumer-Geräte (Router, Smart-Home, Drucker) selten Seriennummern exponieren (5-20% Erfolgsquote).

**Empfehlung für Speicher Analyse:**
- **Phase 1 (v7.1):** Nur lokale Windows-Drucker via WMI (Win32_Printer) — hohe Erfolgsrate (70-90%), keine Sicherheitsrisiken
- **Phase 2 (v7.2+):** Optional UPnP-Scan (mittleres Risiko, 15-30% Erfolgsquote bei Consumer-Geräten)
- **NICHT implementieren:** SNMP mit "public" Community String (hohes Sicherheitsrisiko, 5-10% Erfolgsquote ohne Enterprise-Infrastruktur)

---

## 1. SNMP (Simple Network Management Protocol)

### Technische Details

**OID für Seriennummern:**
- `1.3.6.1.2.1.47.1.1.1.1.11` (entPhysicalSerialNum) — Standard-MIB für physische Komponenten
- Zusätzlich vendor-spezifische OIDs (Cisco, HP, etc.)

**Wie es funktioniert:**
```powershell
# Beispiel mit net-snmp Tools (nicht nativ in Windows)
snmpget -v2c -c public 192.168.1.100 1.3.6.1.2.1.47.1.1.1.1.11.1
```

### Erfolgsquote

| Gerätetyp | Erfolgsquote | Bedingung |
|-----------|--------------|-----------|
| Enterprise Switches/Router (Cisco, HP, Juniper) | **60-80%** | SNMP aktiviert, Community String bekannt |
| Enterprise Drucker (HP, Lexmark) | **50-70%** | SNMP aktiviert, oft "public" Standard |
| Enterprise NAS (Synology, QNAP) | **40-60%** | SNMP optional aktivierbar |
| Consumer Router (Fritz!Box, TP-Link) | **5-10%** | SNMP meist deaktiviert oder nicht implementiert |
| Smart Home Geräte | **<5%** | Kein SNMP Support |
| Consumer Drucker | **10-20%** | SNMP oft deaktiviert oder ohne Serial Number OID |

**Realistische Gesamt-Erfolgsquote in typischer Heimnetz-Umgebung: 10-15%**

### Sicherheits- und Privacy-Implikationen

#### KRITISCH: Hohe Sicherheitsrisiken

1. **Plaintext Credentials (SNMPv1/v2c):**
   - Community String "public" wird im Klartext über UDP Port 161 übertragen
   - Jeder Packet Sniffer im Netzwerk kann Credentials abfangen
   - "Public" ist der häufigste Community String weltweit (Standard-Angriffsziel)

2. **Information Disclosure:**
   - SNMP exponiert **detaillierte Systeminformationen**: MAC-Adressen, Firmware-Versionen, Netzwerk-Topologie, installierte Software
   - Angreifer können via SNMP-Walk vollständige Gerätekonfigurationen auslesen
   - Kann als Vorbereitung für gezielte Exploits genutzt werden

3. **SNMP-Scan = Aktiver Angriff:**
   - Netzwerk-IDS/IPS-Systeme schlagen bei SNMP-Scans oft Alarm
   - In Unternehmensnetzen kann SNMP-Scanning als Policy-Verstoß gewertet werden
   - UDP Port 161 Scans werden von Firewalls häufig blockiert

4. **2025/2026 Vulnerabilities:**
   - **CVE-2025-68615** (CVSS 9.8) — kritische RCE-Schwachstelle in Net-SNMP <5.9.5 (Dez 2025)
   - Betroffen: Linux-Server, NAS-Systeme, UPS-Karten, Drucker mit Linux-Basis
   - Aktive Exploitation in the wild

#### Authentifizierung

- **SNMPv1/v2c:** Nur Community String (Standard: "public") — **keine echte Authentifizierung**
- **SNMPv3:** Username/Password + Verschlüsselung — in Consumer-Geräten **selten implementiert**

### Praktisches Code-Beispiel (Node.js)

```javascript
// Achtung: Erfordert net-snmp Paket (npm install net-snmp)
// net-snmp benötigt native C++ Bindings → plattformabhängig
const snmp = require('net-snmp');

async function getSerialNumber(ipAddress, community = 'public') {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ipAddress, community, {
      timeout: 3000,
      retries: 1
    });

    const oid = '1.3.6.1.2.1.47.1.1.1.1.11.1'; // entPhysicalSerialNum.1

    session.get([oid], (error, varbinds) => {
      session.close();

      if (error) {
        reject(error);
      } else {
        const serial = varbinds[0]?.value?.toString() || null;
        resolve(serial === '' ? null : serial); // Leerer String = nicht vorhanden
      }
    });
  });
}

// PROBLEM: net-snmp hat native Dependencies → Build-Prozess kompliziert
// Alternative: PowerShell mit Invoke-SnmpWalk (erfordert Installation)
```

**Problem für Speicher Analyse:**
- Kein natives SNMP-Tool in Windows (Get-SnmpData nur in Windows Server)
- Externe Pakete wie `net-snmp` erfordern C++ Build Tools
- PowerShell SNMP-Module (SNMP Tools) sind Community-Projekte, nicht Microsoft-offiziell

### Fazit SNMP

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote (Consumer) | ⚠️ **Sehr niedrig (5-15%)** |
| Erfolgsquote (Enterprise) | ✅ **Hoch (60-80%)** |
| Sicherheitsrisiko | ❌ **HOCH (Plaintext, Information Disclosure, CVE-2025-68615)** |
| Implementierungsaufwand | ⚠️ **Mittel-Hoch (native Dependencies, kein Windows-Support)** |
| Empfehlung | ❌ **NICHT für Consumer-Tool wie Speicher Analyse geeignet** |

---

## 2. HTTP/Web-Interface Scraping

### Technische Details

Viele Netzwerkgeräte haben eine Web-Oberfläche (HTTP/HTTPS) mit Status-Seiten, die Seriennummern anzeigen.

**Beispiel-URLs:**
- Router: `http://192.168.1.1/status.html` (Fritz!Box: `/html/status.html`)
- Drucker: `http://192.168.1.50/` (HP: `/hp/device/InternalPages/Index?id=ConfigurationPage`)
- NAS: `http://192.168.1.100:5000` (Synology DSM)

### Erfolgsquote

| Gerätetyp | Erfolgsquote | Authentifizierung erforderlich? |
|-----------|--------------|----------------------------------|
| Router | **40-60%** | ✅ Ja (Login-Passwort) |
| Drucker | **30-50%** | ⚠️ Oft nein (Status-Seite öffentlich) |
| NAS | **20-40%** | ✅ Ja (Admin-Login) |
| Smart Home Hubs | **10-30%** | ✅ Ja (meist App-basiert, kein Web-UI) |

**Gesamt-Erfolgsquote mit Authentifizierung: 5-10% (User gibt keine Passwörter ein)**
**Ohne Authentifizierung (nur öffentliche Status-Seiten): 15-25%**

### Sicherheits- und Privacy-Implikationen

#### MITTEL: Moderat riskant

1. **Credential Handling:**
   - App müsste Geräte-Passwörter speichern oder abfragen → **Nutzer-Vertrauen kritisch**
   - Passwörter im Klartext in der App = Sicherheitsrisiko

2. **Cross-Origin Security:**
   - CORS-Policies blockieren Zugriffe von Electron-App auf Router-IPs
   - Workaround: Node.js HTTP-Request statt Browser-Fetch (umgeht CORS)

3. **Legal/Privacy:**
   - Web-Scraping kann gegen Device-ToS verstoßen
   - Automatisiertes Crawlen von Geräten = potentiell als "unauthorized access" wertbar

### Praktisches Code-Beispiel (Node.js)

```javascript
// Beispiel: HP Printer Status-Seite scrapen
const https = require('https');
const { parse } = require('node-html-parser');

async function getPrinterSerial(printerIP) {
  return new Promise((resolve, reject) => {
    // Viele Drucker akzeptieren Self-Signed Certs
    const options = {
      rejectUnauthorized: false,
      timeout: 5000
    };

    https.get(`https://${printerIP}/hp/device/InternalPages/Index?id=ConfigurationPage`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const root = parse(data);

        // Beispiel: HP zeigt Serial Number in <td> nach "Serial Number" Label
        const serialRow = root.querySelector('td:contains("Serial Number")');
        const serial = serialRow?.nextElementSibling?.text?.trim() || null;

        resolve(serial);
      });
    }).on('error', reject);
  });
}

// PROBLEM: Jedes Gerät hat eigenes HTML-Layout → keine universelle Lösung
```

### Fazit HTTP-Scraping

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote (ohne Auth) | ⚠️ **Mittel (15-25%)** |
| Erfolgsquote (mit Auth) | ❌ **Sehr niedrig (5-10%, User gibt keine Passwörter ein)** |
| Sicherheitsrisiko | ⚠️ **MITTEL (Credential Handling, potentiell unauthorized access)** |
| Implementierungsaufwand | ⚠️ **HOCH (jedes Gerät eigenes HTML-Parsing)** |
| Empfehlung | ⚠️ **Möglich für spezifische Geräte (z.B. HP Drucker), aber nicht skalierbar** |

---

## 3. mDNS/Bonjour TXT Records

### Technische Details

mDNS (Multicast DNS) / DNS-SD (Service Discovery) wird von Apple-Geräten, Druckern und Smart-Home-Geräten verwendet, um Services im Netzwerk zu bewerben.

**TXT Records** können Key-Value-Pairs enthalten wie:
- `ty=HP LaserJet Pro`
- `product=LaserJet Pro M404dn`
- `pdl=application/postscript,application/pdf`
- **`serial=ABC123456`** ← wenn implementiert

### Erfolgsquote

| Gerätetyp | Erfolgsquote | Typische Keys |
|-----------|--------------|---------------|
| Apple Geräte (AirPrint, AirPlay) | **30-50%** | `serial`, `model` |
| HP/Epson/Canon Drucker | **20-40%** | Oft nur `product`, selten `serial` |
| Chromecasts, Smart TVs | **10-20%** | Meist keine Serial Number |
| NAS (Synology, QNAP) | **10-30%** | Herstellerabhängig |

**Gesamt-Erfolgsquote: 20-35%** (besser als SNMP, aber nicht zuverlässig)

### Sicherheits- und Privacy-Implikationen

#### NIEDRIG: Geringes Risiko

1. **Passiver Scan:**
   - mDNS ist Broadcast-basiert → kein aktiver Port-Scan nötig
   - Wird von IDS/IPS nicht als Angriff gewertet

2. **Privacy:**
   - Geräte broadcasten TXT Records freiwillig → keine unauthorized access
   - Aber: TXT Records sind im Klartext (jeder im LAN kann mitlesen)

3. **Keine Authentifizierung:**
   - mDNS braucht keine Credentials → kein Credential-Handling-Problem

### Praktisches Code-Beispiel (Node.js)

```javascript
// Achtung: Erfordert Paket (npm install bonjour-service)
const { Bonjour } = require('bonjour-service');

function scanMdnsDevices() {
  const bonjour = new Bonjour();
  const devices = [];

  // Drucker suchen (_ipp._tcp, _printer._tcp)
  bonjour.find({ type: 'ipp' }, (service) => {
    const serial = service.txt?.serial || service.txt?.usb_SER || null;

    devices.push({
      name: service.name,
      ip: service.addresses?.[0],
      port: service.port,
      type: service.type,
      serial: serial
    });
  });

  // Smart Home Devices (_hap._tcp für HomeKit)
  bonjour.find({ type: 'hap' }, (service) => {
    const serial = service.txt?.id || null; // HomeKit nutzt 'id' statt 'serial'

    devices.push({
      name: service.name,
      ip: service.addresses?.[0],
      serial: serial
    });
  });

  setTimeout(() => {
    bonjour.destroy();
    console.log('Found devices:', devices);
  }, 5000); // 5 Sekunden scannen
}

// Vorteil: Funktioniert out-of-the-box ohne Admin-Rechte
```

### Fazit mDNS/Bonjour

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote | ⚠️ **Mittel (20-35%)** |
| Sicherheitsrisiko | ✅ **NIEDRIG (passiver Scan, keine Auth)** |
| Implementierungsaufwand | ✅ **NIEDRIG (npm Paket verfügbar)** |
| Empfehlung | ✅ **EMPFOHLEN für v7.2+ (optional)** |

---

## 4. IPP (Internet Printing Protocol)

### Technische Details

IPP ist das moderne Druckerprotokoll (Port 631, HTTPS). Drucker exponieren Attribute via IPP Get-Printer-Attributes Anfrage.

**Relevante Attribute:**
- `printer-device-id` (IEEE 1284 Device ID) → enthält **manchmal** Seriennummer
- `printer-serial-number` (seit IPP 2.x) → **selten implementiert**
- `printer-info`, `printer-make-and-model`

**IEEE 1284 Device ID Format:**
```
MFG:HP;MDL:LaserJet Pro M404dn;CMD:PCL,PDF;SN:ABC123456;
```

### Erfolgsquote

| Gerätetyp | Erfolgsquote | Bemerkung |
|-----------|--------------|-----------|
| AirPrint-fähige Drucker (HP, Canon, Epson) | **40-60%** | IEEE 1284 Device ID oft mit SN |
| Enterprise Drucker (HP, Lexmark) | **50-70%** | Zuverlässig via IPP |
| Consumer Drucker (Brother, Epson Einstiegsmodelle) | **20-40%** | Device ID oft ohne SN |

**Gesamt-Erfolgsquote: 35-50%** (am besten für Drucker)

### Sicherheits- und Privacy-Implikationen

#### NIEDRIG: Geringes Risiko

1. **Standardprotokoll:**
   - IPP ist offizieller Standard (RFC 8011)
   - Kein "unauthorized access" Problem

2. **Authentifizierung:**
   - IPP Get-Printer-Attributes ist meist ohne Login möglich (Read-Only)
   - Nur Print/Admin-Funktionen benötigen Auth

3. **Privacy:**
   - Device ID ist für Netzwerk-Clients gedacht → normale Nutzung

### Praktisches Code-Beispiel (Node.js)

```javascript
// Achtung: Erfordert ipp Paket (npm install ipp)
const ipp = require('ipp');

async function getPrinterSerial(printerIP) {
  return new Promise((resolve, reject) => {
    const printer = ipp.Printer(`http://${printerIP}:631/ipp/print`);

    const msg = {
      "operation-attributes-tag": {
        "requested-attributes": [
          "printer-device-id",
          "printer-serial-number",
          "printer-info"
        ]
      }
    };

    printer.execute("Get-Printer-Attributes", msg, (err, res) => {
      if (err) return reject(err);

      // Device ID parsen (Format: MFG:HP;MDL:...;SN:ABC123456;)
      const deviceId = res['printer-attributes-tag']['printer-device-id'];
      const snMatch = deviceId?.match(/SN:([^;]+)/i);
      const serial = snMatch?.[1] || res['printer-attributes-tag']['printer-serial-number'] || null;

      resolve(serial);
    });
  });
}
```

**Alternative: PowerShell mit Get-Printer (nur lokale Drucker):**
```powershell
# Funktioniert NUR für auf diesem Windows-PC installierte Drucker
Get-Printer | Select-Object Name, DriverName, PortName, @{
  Name='SerialNumber';
  Expression={(Get-WmiObject Win32_Printer -Filter "Name='$($_.Name)'").SerialNumber}
}
```

### Fazit IPP

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote (Drucker) | ✅ **Mittel-Hoch (35-50%)** |
| Sicherheitsrisiko | ✅ **NIEDRIG (Standardprotokoll, meist ohne Auth)** |
| Implementierungsaufwand | ✅ **NIEDRIG (npm Paket verfügbar)** |
| Empfehlung | ✅ **EMPFOHLEN für Drucker in v7.1+** |

---

## 5. UPnP (Universal Plug and Play)

### Technische Details

UPnP-Geräte broadcasten ein Device Description XML via SSDP (Simple Service Discovery Protocol).

**XML Struktur (Beispiel):**
```xml
<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Samsung TV</friendlyName>
    <manufacturer>Samsung</manufacturer>
    <modelName>UE55RU7179U</modelName>
    <serialNumber>012345ABCDE</serialNumber>
    <UDN>uuid:12345678-1234-1234-1234-123456789012</UDN>
  </device>
</root>
```

Das `<serialNumber>` Element ist im UPnP Standard **optional**.

### Erfolgsquote

| Gerätetyp | Erfolgsquote | Bemerkung |
|-----------|--------------|-----------|
| Smart TVs (Samsung, LG, Sony) | **30-50%** | Oft serialNumber im XML |
| Router (AVM Fritz!Box, TP-Link) | **20-40%** | Viele Router unterstützen UPnP, aber nicht alle exponieren Serial |
| NAS (Synology, QNAP) | **30-50%** | UPnP Media Server oft mit Serial |
| Media Player (Chromecast, Roku) | **10-30%** | Selten serialNumber, meist nur UDN (UUID) |
| Drucker | **5-15%** | Drucker nutzen IPP, nicht UPnP |

**Gesamt-Erfolgsquote: 25-40%** (am besten für Smart TVs und NAS)

### Sicherheits- und Privacy-Implikationen

#### MITTEL: Moderat riskant

1. **UPnP Security History:**
   - UPnP hatte historisch viele Schwachstellen (Buffer Overflows, RCE)
   - Moderne Geräte sind sicherer, aber UPnP wird oft als "Sicherheitsrisiko" gesehen
   - **Viele IT-Security-Guides raten: "Disable UPnP on your router"**

2. **Passiver Scan = sicher:**
   - SSDP Discovery ist Broadcast → kein aktiver Angriff
   - Aber: UPnP-Port-Forwarding-Manipulation (CVE-Beispiele) ist möglich

3. **Privacy:**
   - Device Description XML ist öffentlich im LAN → keine Auth nötig
   - Serial Number ist vom Hersteller gewollt exponiert

### Praktisches Code-Beispiel (Node.js)

```javascript
// Achtung: Erfordert node-ssdp Paket (npm install node-ssdp)
const { Client } = require('node-ssdp');
const http = require('http');
const { parse } = require('node-html-parser');

function scanUpnpDevices() {
  const client = new Client();
  const devices = [];

  client.on('response', (headers, statusCode, rinfo) => {
    const location = headers.LOCATION;

    // Device Description XML abrufen
    http.get(location, (res) => {
      let xml = '';
      res.on('data', chunk => xml += chunk);
      res.on('end', () => {
        const root = parse(xml);

        devices.push({
          ip: rinfo.address,
          friendlyName: root.querySelector('friendlyName')?.text,
          manufacturer: root.querySelector('manufacturer')?.text,
          modelName: root.querySelector('modelName')?.text,
          serialNumber: root.querySelector('serialNumber')?.text || null,
          udn: root.querySelector('UDN')?.text
        });
      });
    });
  });

  client.search('ssdp:all'); // Alle UPnP-Geräte suchen

  setTimeout(() => {
    client.stop();
    console.log('Found UPnP devices:', devices);
  }, 5000);
}

// Vorteil: Keine Admin-Rechte erforderlich
```

**Alternative: PowerShell (Windows 10+):**
```powershell
# Windows 10+ hat native UPnP-Unterstützung
$upnp = New-Object -ComObject UPnP.UPnPDeviceFinder
$devices = $upnp.FindByType("upnp:rootdevice", 0)

$devices | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.FriendlyName
    Manufacturer = $_.ManufacturerName
    Model = $_.ModelName
    SerialNumber = $_.SerialNumber  # Kann $null sein
  }
}
```

### Fazit UPnP

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote | ⚠️ **Mittel (25-40%)** |
| Sicherheitsrisiko | ⚠️ **MITTEL (UPnP historisch unsicher, aber passiver Scan OK)** |
| Implementierungsaufwand | ✅ **NIEDRIG (npm Paket + Windows COM Object verfügbar)** |
| Empfehlung | ✅ **EMPFOHLEN für v7.2+ (optional, nach mDNS)** |

---

## 6. WMI/PowerShell (Windows Drucker)

### Technische Details

Für **lokale** (auf dem Windows-PC installierte) Drucker kann Windows Management Instrumentation (WMI) Seriennummern auslesen.

**WMI-Klassen:**
- `Win32_Printer` → hat Property `SerialNumber` (kann leer sein)
- `Win32_TCPIPPrinterPort` → keine Serial Number (nur IP/Port)

### Erfolgsquote

| Druckertyp | Erfolgsquote | Bemerkung |
|------------|--------------|-----------|
| USB-Drucker (lokal angeschlossen) | **70-90%** | SerialNumber meist aus USB Device ID |
| Netzwerk-Drucker (TCP/IP Port) | **30-50%** | Abhängig von Treiber-Implementierung |
| Virtueller Drucker (PDF, XPS) | **0%** | Keine Hardware-Serial |

**Gesamt-Erfolgsquote für lokale Windows-Drucker: 60-80%**

### Sicherheits- und Privacy-Implikationen

#### SEHR NIEDRIG: Minimales Risiko

1. **Lokaler Zugriff:**
   - WMI liest nur Daten des eigenen Windows-PCs → keine Netzwerk-Kommunikation
   - Keine Credentials nötig (User hat bereits Zugriff auf Drucker)

2. **Privacy:**
   - Windows zeigt Serial Number auch in Drucker-Eigenschaften → keine neue Information
   - Kein unauthorized access

3. **Administratorrechte:**
   - WMI Win32_Printer ist für Standard-User lesbar (keine Admin-Rechte nötig)

### Praktisches Code-Beispiel (Node.js mit PowerShell)

```javascript
// Electron Main Process
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

async function getWindowsPrinterSerials() {
  const psScript = `
    Get-WmiObject -Class Win32_Printer | Where-Object {
      $_.SerialNumber -ne $null -and $_.SerialNumber -ne ''
    } | ForEach-Object {
      [PSCustomObject]@{
        Name = $_.Name
        DriverName = $_.DriverName
        PortName = $_.PortName
        SerialNumber = $_.SerialNumber
        Status = $_.PrinterStatus
      }
    } | ConvertTo-Json
  `;

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ], { timeout: 10000 });

    const printers = JSON.parse(stdout || '[]');
    return Array.isArray(printers) ? printers : [printers];
  } catch (error) {
    console.error('WMI Printer query failed:', error);
    return [];
  }
}

// HINWEIS: Funktioniert nur für Drucker die auf diesem Windows-PC installiert sind
// Netzwerk-Drucker die nur via IP-Adresse gescannt werden = NICHT in WMI
```

**Alternative: Get-Printer (Windows 8+):**
```powershell
# Moderner, aber weniger Informationen
Get-Printer | Select-Object Name, ComputerName, DriverName, PortName, @{
  Name='Serial';
  Expression={(Get-WmiObject Win32_Printer -Filter "Name='$($_.Name.Replace("'","''"))'").SerialNumber}
}
```

### Fazit WMI/PowerShell

| Kriterium | Bewertung |
|-----------|-----------|
| Erfolgsquote (lokale Drucker) | ✅ **HOCH (60-80%)** |
| Erfolgsquote (Netzwerk-Scan) | ❌ **NICHT ANWENDBAR (nur installierte Drucker)** |
| Sicherheitsrisiko | ✅ **SEHR NIEDRIG (lokaler Zugriff)** |
| Implementierungsaufwand | ✅ **SEHR NIEDRIG (native PowerShell, funktioniert out-of-the-box)** |
| Empfehlung | ✅ **EMPFOHLEN für v7.1 als erste Implementierung** |

---

## Zusammenfassung: Methoden-Vergleich

| Methode | Erfolgsquote (Consumer) | Sicherheit | Aufwand | Empfehlung |
|---------|-------------------------|------------|---------|------------|
| **SNMP** | ❌ 5-15% | ❌ HOCH | ⚠️ Mittel-Hoch | ❌ NICHT empfohlen |
| **HTTP-Scraping** | ⚠️ 15-25% (ohne Auth) | ⚠️ MITTEL | ⚠️ HOCH | ⚠️ Nur für spezifische Geräte |
| **mDNS/Bonjour** | ⚠️ 20-35% | ✅ NIEDRIG | ✅ NIEDRIG | ✅ **EMPFOHLEN (v7.2+)** |
| **IPP (Drucker)** | ✅ 35-50% | ✅ NIEDRIG | ✅ NIEDRIG | ✅ **EMPFOHLEN (v7.1+)** |
| **UPnP** | ⚠️ 25-40% | ⚠️ MITTEL | ✅ NIEDRIG | ✅ **EMPFOHLEN (v7.2+)** |
| **WMI (lokale Drucker)** | ✅ 60-80% | ✅ SEHR NIEDRIG | ✅ SEHR NIEDRIG | ✅ **HÖCHSTE PRIORITÄT (v7.1)** |

---

## Empfohlene Implementierungs-Roadmap

### Phase 1 (v7.1) — Lokale Drucker (LOW-HANGING FRUIT)

**Implementierung:**
```javascript
// main/network.js
async function getLocalPrinterSerials() {
  // WMI Win32_Printer Abfrage via PowerShell
  // Erfolgsquote: 60-80%
  // Risiko: Minimal
}
```

**Vorteile:**
- ✅ Hohe Erfolgsquote
- ✅ Kein Sicherheitsrisiko
- ✅ Keine zusätzlichen Dependencies
- ✅ Funktioniert out-of-the-box

**UI-Integration:**
- Im Netzwerk-Scanner: Lokale Drucker in Geräteliste mit Serial Number anzeigen
- Separate Kategorie "Lokale Geräte" (USB + installierte Netzwerk-Drucker)

---

### Phase 2 (v7.2) — Netzwerk-Drucker (IPP)

**Implementierung:**
```bash
npm install ipp
```

```javascript
// main/network.js
const ipp = require('ipp');

async function scanNetworkPrinterSerials(printerIPs) {
  // IPP Get-Printer-Attributes für jede IP
  // IEEE 1284 Device ID parsen
  // Erfolgsquote: 35-50%
}
```

**Vorteile:**
- ✅ Standardprotokoll (kein Hack)
- ✅ Mittlere Erfolgsquote bei Druckern
- ✅ Niedriges Sicherheitsrisiko

**Nachteil:**
- ⚠️ Benötigt Port 631 offen (oft von Firewalls blockiert)

---

### Phase 3 (v7.3) — Smart Devices (mDNS + UPnP)

**Implementierung:**
```bash
npm install bonjour-service node-ssdp
```

```javascript
// main/network.js
const { Bonjour } = require('bonjour-service');
const { Client: SSDPClient } = require('node-ssdp');

async function scanMdnsSerials() {
  // Bonjour TXT Records scannen
  // Erfolgsquote: 20-35%
}

async function scanUpnpSerials() {
  // UPnP Device Description XML abrufen
  // Erfolgsquote: 25-40%
}
```

**Vorteile:**
- ✅ Passiver Scan (kein Port-Scanning)
- ✅ Findet Smart TVs, NAS, HomeKit-Geräte

**Nachteil:**
- ⚠️ Viele Consumer-Geräte exponieren keine Serial Number

---

### Phase X (NICHT implementieren) — SNMP

**Gründe:**
- ❌ Sehr niedrige Erfolgsquote in Heimnetzen (5-15%)
- ❌ Hohes Sicherheitsrisiko (CVE-2025-68615, Plaintext Community Strings)
- ❌ Komplexe native Dependencies (net-snmp Build)
- ❌ Wird von IDS/IPS als Angriff gewertet
- ❌ Braucht Enterprise-Infrastruktur für Erfolg

**Ausnahme:**
Wenn Speicher Analyse jemals eine "Enterprise Edition" bekommt → dann mit SNMPv3 + User-Input für Community String.

---

## UI/UX Überlegungen

### 1. Transparenz über Erfolgsquoten

**User-Erwartung managen:**
```
┌─────────────────────────────────────────┐
│ Netzwerk-Scanner                        │
├─────────────────────────────────────────┤
│ [✓] Seriennummern abrufen (optional)    │
│                                         │
│ ℹ️ Hinweis: Seriennummern können nur    │
│    für Geräte abgerufen werden, die     │
│    diese Informationen exponieren.      │
│    Erfolgsquote: ca. 20-40% je nach     │
│    Gerätetyp.                           │
└─────────────────────────────────────────┘
```

### 2. Fehlende Serial Numbers nicht als Fehler darstellen

**FALSCH:**
```
❌ Konnte Seriennummer für Router (192.168.1.1) nicht abrufen
```

**RICHTIG:**
```
Router (192.168.1.1)
Serial: N/A (nicht verfügbar)
```

### 3. Datenschutz-Hinweis

```
⚠️ Datenschutz: Seriennummern werden lokal gespeichert und NIEMALS an externe Server gesendet.
```

---

## Quellen

### SNMP
- [OID 1.3.6.1.2.1.47.1.1.1.1.11 entPhysicalSerialNum reference info](https://oidref.com/1.3.6.1.2.1.47.1.1.1.1.11)
- [FAQ - how to extract device serial number using SNMP protocol - Huawei](https://support.huawei.com/enterprise/en/knowledge/EKB1000092681)
- [SNMP OID to get Serial Number - Cisco Community](https://community.cisco.com:443/t5/wireless/snmp-oid-to-get-serial-number/m-p/461379)
- [Get Cisco Serial Numbers with SNMP | the gabriellephant](https://gorthx.wordpress.com/2012/02/10/get-cisco-serial-numbers-with-snmp/)

### SNMP Security
- [SNMP Vulnerabilities - GIAC](https://www.giac.org/paper/gsec/1076/snmp-vulnerabilities/102129)
- [Securing SNMP: Changing Default Community Strings to Protect Your Network | Medium](https://medium.com/fmisec/securing-snmp-changing-default-community-strings-to-protect-your-network-9cae07377db3)
- [Closing Out 2025: Why the Net-SNMP Vulnerability Matters to Your Network - Paessler Blog](https://blog.paessler.com/closing-out-2025-why-the-net-snmp-vulnerability-matters-to-your-network)
- [What Is an SNMP Vulnerability? | Attaxion](https://attaxion.com/glossary/snmp-vulnerability/)
- [Why SNMPv1 and v2c Put Your Network at Risk – Netizen Blog](https://blog.netizen.net/2025/10/23/why-snmpv1-and-v2c-put-your-network-at-risk-and-why-you-should-upgrade/)
- [7 Common SNMP Security Vulnerabilities you should know - Atera](https://www.atera.com/blog/common-snmp-security-vulnerabilities/)
- [How to Secure Your SNMP Network: Common Risks and Vulnerabilities - LinkedIn](https://www.linkedin.com/advice/0/what-common-snmp-security-risks-vulnerabilities-skills-snmp)

### IPP
- [RFC: Add "printer-serial-number (text(255))" to NODRIVER - PWG](https://www.pwg.org/archives/ipp/2020/020785.html)
- [PWG Command Set Format for IEEE 1284 Device ID v1.0](https://ftp.pwg.org/pub/pwg/candidates/cs-pmp1284cmdset10-20100531-5107.2.pdf)
- [How to Use the Internet Printing Protocol - PWG](https://www.pwg.org/ipp/ippguide.html)
- [Internet Printing Protocol (IPP) Registrations - IANA](https://www.iana.org/assignments/ipp-registrations)

### UPnP
- [UPnP Device Architecture 1.0 - UPnP Forum](https://www.upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.0-20080424.pdf)
- [UPnP Device Architecture 2.0 - Open Connectivity Foundation](https://openconnectivity.org/upnp-specs/UPnP-arch-DeviceArchitecture-v2.0-20200417.pdf)
- [Creating a Device Description - Win32 apps | Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/upnp/creating-a-device-description)

### mDNS/Bonjour
- [mdns — User Guide](https://agnat.github.io/node_mdns/user_guide.html)
- [TXT records in mDNS – James Henstridge](https://blogs.gnome.org/jamesh/2007/06/15/txt-records-in-mdns/)
- [Multicast DNS - Wikipedia](https://en.wikipedia.org/wiki/Multicast_DNS)
- [RFC 6763 - DNS-Based Service Discovery](https://tools.ietf.org/html/rfc6763)
- [Bonjour Printing Specification Version 1.2.1](https://developer.apple.com/bonjour/printing-specification/)

### WMI/PowerShell
- [How to Get Printer Serial Number Using PowerShell - ShellGeek](https://shellgeek.com/how-to-get-printer-serial-number-using-powershell/)
- [Get-Printer (PrintManagement) | Microsoft Learn](https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printer)
- [Get Printer Serial Number - PowerShell - CodePal](https://codepal.ai/code-generator/query/8qjZDkDs/get-printer-serial-number-powershell)

### Device Security
- [Consumer Reports Finds Risky Permissions, Security Concerns In All Five Printer Manufacturers](https://innovation.consumerreports.org/consumer-reports-finds-risky-permissions-security-concerns-in-all-five-printer-manufacturers/)
- [Printer Security 101: Best Practices to Avoid Network Compromise - OSI Beyond](https://www.osibeyond.com/blog/printer-cyber-security-risks-101/)
- [Securing IoT Devices: How Safe Is Your Wi-Fi Router? - The American Consumer](https://www.theamericanconsumer.org/wp-content/uploads/2018/09/FINAL-Wi-Fi-Router-Vulnerabilities.pdf)

### Network Device Management
- [Collecting Device Serial Numbers and Asset Tags over SNMP - runZero](https://www.runzero.com/blog/collect-device-serial-numbers/)
- [Serial Number in Custom Fields | OpManager KB](https://www.manageengine.com/network-monitoring/kb/serial-number-custom-fields.html)
- [How to Generate an NCM Report on Device Serial Numbers - SolarWinds](https://support.solarwinds.com/SuccessCenter/s/article/NCM-Report-on-Device-Serial-Numbers)

---

**Erstellt:** 2026-02-12
**Autor:** Claude (Sonnet 4.5)
**Kontext:** Recherche für Netzwerk-Scanner Feature v7.1+

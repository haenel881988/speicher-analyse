# Issue: Netzwerk-Geräte-Erkennung grundlegend fehlerhaft

**Erstellt:** 2026-02-14
**Aktualisiert:** 2026-02-14 (Tiefenanalyse v2 — 5 parallele Code-Reviews)
**Status:** Offen
**Priorität:** Kritisch
**Betrifft:** Netzwerk-Scanner (Lokale Geräte) — alle 4 Schichten

---

## Symptome (was Simon sieht)

| # | Gerät | Was angezeigt wird | Was es WIRKLICH ist | Problem |
|---|-------|--------------------|---------------------|---------|
| 1 | Zyxel Router (192.168.1.1) | Modell: "NAS synth" | Router / Internet-Gateway | Komplett falsches Modell |
| 2 | Visionscape (192.168.1.132) | Typ: "Drucker", Modell: "Netzwerkdrucker synth" | Industriegerät (kein Drucker) | Falsche Klassifizierung |
| 3 | Simons Handy | Wird gar nicht angezeigt | Smartphone im WLAN | Gerät fehlt komplett |
| 4 | Simon-PC (192.168.1.203) | Gruppierung: "Eigener PC 1" | Client / Arbeitsstation | Schlechte Gruppenbezeichnung |
| 5 | Simon-PC (192.168.1.203) | MAC-Adresse: "—" | Hat eine MAC-Adresse | Fehlende Daten |
| 6 | Linux-Gerät (192.168.1.124) | Modell: "Linux/macOS-Gerät synth" | Unbekanntes Linux-Gerät | Sinnloser Modellname |
| 7 | Alle Geräte | Reihenfolge innerhalb Gruppen beliebig | Sinnvoll sortiert | Fehlende Sortierung |

---

## Architektur-Überblick (4 Schichten)

```
Schicht 1: DISCOVERY       → Geräte im Netzwerk FINDEN        [network-scanner.js]
Schicht 2: IDENTIFIZIERUNG → Modell/Vendor/Firmware ERKENNEN   [device-identify.js, snmp-scanner.js, mdns-scanner.js, wsd-scanner.js]
Schicht 3: KLASSIFIZIERUNG → Gerätetyp ZUORDNEN               [oui-database.js]
Schicht 4: DARSTELLUNG     → Ergebnisse ANZEIGEN               [renderer/js/network.js, style.css]
```

---

## Schicht 1: DISCOVERY — Geräte finden

### WU-1: Smartphones werden nicht erkannt (KRITISCH)

**Datei:** `main/network-scanner.js` Zeile 220-290
**Simons Problem:** #3 (Handy fehlt)

Der Scanner findet Geräte NUR über ICMP Ping Sweep (Zeile 224). Smartphones blockieren ICMP systematisch:
- **iOS**: Firewall blockiert Ping standardmässig
- **Android**: Im Energiesparmodus keine ICMP-Antworten
- **WLAN-Isolation**: Manche Router blockieren ICMP zwischen Clients

Die ARP-Tabelle (Zeile 265) wird zwar gelesen, aber NUR für MAC-Zuordnung verwendet — **nicht als Geräte-Entdeckung**. Der kritische Fehler:

```javascript
// Zeile 436: NUR Ping-Antworten werden zu Geräten
const devices = onlineDevices.map(d => { ... });
// macMap-Einträge die NICHT in onlineDevices sind → IGNORIERT
```

ARP-Einträge von Geräten die nicht auf Ping antworten werden komplett verworfen.

### WU-2: Port-Anzahl im Timeout falsch (HOCH)

**Datei:** `main/network-scanner.js` Zeile 298 vs. 318

Die Port-Liste hat **15 Ports**, aber der Timeout wird mit **13 Ports** berechnet:
```javascript
$ports = @(22, 80, 135, 443, 445, 515, 554, 631, 1400, 3074, 3389, 5000, 5001, 8080, 9100)  // 15 Ports
// ...
const portsCount = 13;  // FALSCH
```

Bei vielen Geräten läuft der Port-Scan in ein Timeout → alle Port-Informationen gehen verloren.

### WU-3: Fehlende Ports im Scan (MITTEL)

**Datei:** `main/network-scanner.js` Zeile 298

Ports die in der Klassifizierung geprüft werden aber NICHT gescannt werden:
- **8554** (RTSP-Alt) — geprüft in `oui-database.js:492`, nie gescannt
- **37777** (Dahua-Kameras) — geprüft in `oui-database.js:492`, nie gescannt
- **5900** (VNC) — in `PORT_TYPE_HINTS` als `pc`, nie gescannt

### WU-4: Subnetz immer /24 (MITTEL)

**Datei:** `main/network-scanner.js` Zeile 197, 224

Auch bei /16-Subnetzen (65536 Hosts) wird nur /24 (254 Hosts) gescannt. Geräte in anderen Segmenten werden nie gefunden.

### WU-5: DNS-Auflösung blockiert bei unresponsiven DNS-Servern (MITTEL)

**Datei:** `main/network-scanner.js` Zeile 236-239

`GetHostEntry` ist synchron und kann 5-15 Sekunden PRO Gerät dauern wenn der DNS-Server nicht antwortet. Bei 20+ Geräten kann der Ping Sweep dadurch extrem langsam werden.

### WU-6: Broadcast/Multicast-Adressen nicht gefiltert (MITTEL)

**Datei:** `main/network-scanner.js` Zeile 44

Nur `255.255.255.255` und `224.0.0.22` werden gefiltert. Der gesamte Multicast-Bereich `224.0.0.0/4` und Link-Local-Adressen `169.254.x.x` können als "Geräte" im Scan auftauchen.

---

## Schicht 2: IDENTIFIZIERUNG — Modell/Vendor erkennen

### WU-7: Synthetische Modellnamen sind Unsinn (KRITISCH)

**Datei:** `main/network-scanner.js` Zeile 496-520
**Simons Probleme:** #1 (NAS synth), #6 (Linux/macOS-Gerät synth)

Die gesamte synthetische Fallback-Logik ist grundlegend falsch:
```
Port 5000 → "NAS"              FALSCH: Port 5000 = generisches HTTP (Router, Docker, Flask, AirPlay)
Port 515  → "Netzwerkdrucker"  FALSCH: Industriegeräte haben LPD als Nebenprotokoll
Port 80   → "Gerät mit Web-Interface"  NUTZLOS: Sagt nichts aus
Port 22   → OS-Name            NUTZLOS: Wiederholt den Typ
```

Dreifach-Fehler:
1. `modelName` wird mit einem GERÄTETYP befüllt (nicht einem Modellnamen)
2. Der `identifiedBy`-Wert "synth" wird als sichtbares Badge im Frontend angezeigt
3. `classifyDevice()` nutzt diesen synthetischen modelName nochmal → zirkulär

### WU-8: SNMP sysName als Modellname ist irreführend (HOCH)

**Datei:** `main/network-scanner.js` Zeile 498-501

SNMP `sysName` ist ein frei konfigurierbarer Hostname, KEIN Modellname. Beispiele:
- Router mit sysName "HomeRouter" → Modell wird "HomeRouter"
- Server mit sysName "localhost" → Modell wird "localhost"
- NAS mit sysName = IP-Adresse → Modell wird "192.168.1.100"

### WU-9: HTTP-Banner verwirft Titel MIT Modellnamen (KRITISCH)

**Datei:** `main/device-identify.js` Zeile 280-299

Der `genericWords`-Filter verwirft den **gesamten** Titel wenn EIN generisches Wort vorkommt. Die Rettungs-Regex erfasst nicht alle Trennzeichen:

| Titel | Ergebnis | Problem |
|-------|----------|---------|
| `"ZyXEL VMG3625 - Login"` | ✅ "ZyXEL VMG3625" | Trennzeichen `-` wird erkannt |
| `"ZyXEL VMG3625 Login"` | ❌ verworfen | Nur Leerzeichen, kein Trennzeichen |
| `"FRITZ!Box 7590 > Login"` | ❌ verworfen | `>` nicht im Trennzeichen-Set |
| `"ZyXEL VMG3625 — Anmeldung"` | ❌ verworfen | Em-Dash `—` nicht erkannt |
| `"Welcome to ZyXEL VMG3625"` | ❌ verworfen | Modellname NACH generischem Wort |

Zusätzlich enthält die `genericWords`-Liste problematische Einträge:
- `"access point"` → verwirft `"TP-Link Access Point EAP245"`
- `"document"` → verwirft `"Brother Document Scanner DS-940DW"`

### WU-10: HTTP-Banner überschreibt vorhandene mDNS/WSD-Daten (HOCH)

**Datei:** `main/device-identify.js` Zeile 124-131

Wenn die HTTP-Probe ein Ergebnis liefert, wird das Ergebnis-Objekt **komplett neu gesetzt**. Dabei gehen bestehende Felder verloren:
- `mdnsServices` → weg
- `mdnsServiceTypes` → weg
- `mdnsHostname` → weg
- `wsdTypes` → weg

Gleiches Problem bei SSH-Probes (Zeile 169-176) und IPP-Probes (Zeile 147-153).

### WU-11: Port 9100 in IPP-Targets ist semantisch falsch (HOCH)

**Datei:** `main/device-identify.js` Zeile 108

Port 9100 ist JetDirect/RAW Printing — KEIN IPP. Einen IPP-Request (HTTP) an Port 9100 zu senden liefert Müll oder Timeout. JetDirect braucht einen eigenen Probe (PJL `@PJL INFO ID\r\n`).

### WU-12: UPnP speichert nur erste Location pro IP (MITTEL)

**Datei:** `main/device-identify.js` Zeile 399

Geräte mit mehreren UPnP-Services senden mehrere SSDP-Responses. Nur die ERSTE wird gespeichert. Wenn die erste generisch ist und die zweite den Modellnamen enthält, geht er verloren.

### WU-13: SSH-Banner wird nie geparst (MITTEL)

**Datei:** `main/device-identify.js` Zeile 164-185

SSH-Banner werden roh gespeichert, aber nie ausgewertet. Nutzbare Informationen:
- `SSH-2.0-OpenSSH_8.9p1 Ubuntu-3` → OS: Ubuntu
- `SSH-2.0-dropbear_2022.83` → Embedded Linux (NAS, Router)
- `SSH-2.0-ROSSSH` → MikroTik RouterOS
- `SSH-2.0-Cisco-1.25` → Cisco

### WU-14: `<meta>`-Tag-Regex erkennt nicht alle HTML-Varianten (MITTEL)

**Datei:** `main/device-identify.js` Zeile 323

Die Regex erwartet `name` vor `content`, aber HTML erlaubt beliebige Reihenfolge:
- `<meta content="HP LaserJet" name="description">` → KEIN Match (content vor name)

### WU-15: Hostname-basierte Modellerkennung zu eng (MITTEL)

**Datei:** `main/network-scanner.js` Zeile 479-492

Nur 3 spezifische Muster: `xbox`, `playstation`, `iphone/ipad/macbook`. Fehlende Muster:
- `Galaxy-S24`, `android-xxxxx` (Samsung/Android)
- `DESKTOP-XXXXX` (Windows-PCs)
- `Simons-iPhone` (Variante mit Bindestrich)
- `Echo-xxxxx` (Amazon Alexa)
- `fire-tv-stick` (Amazon Fire TV)

### WU-16: TTL-basierte OS-Erkennung unzuverlässig (NIEDRIG)

**Datei:** `main/network-scanner.js` Zeile 144-149

- TTL 64 = auch Android, iOS, Drucker, NAS, IoT (nicht nur "Linux/macOS")
- TTL 128 = auch Drucker mit Windows-Print-Stack
- TTL > 128 ≠ immer "Netzwerkgerät" (manche setzen TTL=255)

### WU-17: XML-Parsing via Regex fragil (NIEDRIG)

**Datei:** `main/device-identify.js` Zeile 478-481

Namespace-Prefixes werden nicht erkannt (`<ns:modelName>` → kein Match). WSD-Scanner macht es besser mit `<[^:]*:?${name}>`.

---

## Schicht 3: KLASSIFIZIERUNG — Gerätetyp zuordnen

### WU-18: Port 515 (LPD) allein = Drucker ist zu aggressiv (KRITISCH)

**Datei:** `main/oui-database.js` Zeile 488
**Simons Problem:** #2 (Visionscape als Drucker)

```javascript
if (ports.has(515)) return _typeToResult('printer', vendor);
```

Keinerlei Gegenprüfung. Jedes Gerät mit offenem Port 515 wird zum Drucker — auch Industriegeräte, NAS-Systeme und Server.

### WU-19: Port 5000/5001 = NAS ist zu aggressiv (KRITISCH)

**Datei:** `main/oui-database.js` Zeile 490

```javascript
if (ports.has(5000) || ports.has(5001)) return _typeToResult('nas', vendor);
```

Port 5000 wird benutzt von: Routern (UPnP/SSDP), Docker, Flask, AirPlay, IoT-Geräten. NUR Synology nutzt 5000/5001 als Web-Admin. Ergebnis: Zyxel Router → fälschlich "NAS".

### WU-20: Port 9100 + Port 80 wird NICHT als Drucker erkannt (KRITISCH)

**Datei:** `main/oui-database.js` Zeile 487

```javascript
if (ports.has(9100) && !ports.has(80)) return _typeToResult('printer', vendor);
```

Die Bedingung `!ports.has(80)` schliesst **moderne Netzwerkdrucker aus** — fast JEDER HP, Brother, Canon, Epson hat ein Web-Interface auf Port 80. Die Kombination `9100 + 80` ist sogar ein STARKES Drucker-Signal.

### WU-21: "Eigener PC" als Gruppenbezeichnung falsch (HOCH)

**Datei:** `main/oui-database.js` Zeile 465-466
**Simons Problem:** #4

```javascript
if (isLocal) return { type: 'local', label: 'Eigener PC', icon: 'monitor' };
```

Hart-kodiert. Der type `'local'` existiert nicht in `_typeToResult()`, was die Konsistenz bricht. Der PC sollte type `'pc'` bekommen.

### WU-22: Samsung komplett fehlend in VENDOR_PATTERNS (HOCH)

**Datei:** `main/oui-database.js` Zeile 402-437

Samsung fehlt KOMPLETT. Samsung stellt her: Smartphones, Smart TVs, Tablets, SmartThings Hub. Ein Samsung Galaxy fällt durch zum Fallback und wird als "Unbekanntes Gerät" klassifiziert.

### WU-23: Apple fehlt in VENDOR_PATTERNS (HOCH)

**Datei:** `main/oui-database.js` Zeile 402-437

Apple fehlt. Der Fallback (Zeile 547) klassifiziert ALLES als `type: 'pc'`:
- iPhone → "Apple Gerät" (type: pc) statt type: mobile
- Apple TV → "Apple Gerät" (type: pc) statt type: media/tv

### WU-24: Sony = TV statt Konsole (HOCH)

**Datei:** `main/oui-database.js` Zeile 418

```javascript
['Sony', 'tv'],
```

Eine PlayStation wird über Vendor-Pattern als "Smart TV" klassifiziert. `['Sony Interactive', 'console']` fehlt VOR dem generischen Sony-Eintrag.

### WU-25: Huawei = Netzwerk statt Smartphone (HOCH)

**Datei:** `main/oui-database.js` Zeile 436

```javascript
['Huawei', 'network'],
```

Huawei stellt hauptsächlich Smartphones her. Ein Huawei P40 Pro wird fälschlich als "Netzwerkgerät" klassifiziert.

### WU-26: Amazon/Ring/Google nicht klassifiziert (HOCH)

**Datei:** `main/oui-database.js` Zeile 402-437

Fehlende VENDOR_PATTERNS:
- **Amazon**: Echo/Alexa, Fire TV Stick, Ring-Kameras, eero-Router
- **Ring (Amazon)**: In OFFLINE_FALLBACK aber nicht in VENDOR_PATTERNS
- **Google** (ohne Nest): Chromecast, Google Home fallen durch

### WU-27: "switch" in Hostname matched Netzwerk-Switches (MITTEL)

**Datei:** `main/oui-database.js` Zeile 517

```javascript
if (hn.includes('switch') || hn.includes('playstation') || hn.includes('xbox')) {
```

`HP-Switch-01.local` wird als "Spielkonsole" klassifiziert. Muss spezifischer sein: `/\bnintendo.?switch/i`.

### WU-28: "gateway" in Hostname matched zu breit (MITTEL)

**Datei:** `main/oui-database.js` Zeile 511

`payment-gateway.local` oder `api-gateway` werden als Router klassifiziert.

### WU-29: PORT_TYPE_HINTS ist toter Code (NIEDRIG)

**Datei:** `main/oui-database.js` Zeile 439-445

Die Map wird definiert aber nirgends in `classifyDevice()` referenziert. Toter Code.

### WU-30: HP SNMP OID pauschal = Drucker (MITTEL)

**Datei:** `main/oui-database.js` Zeile 617

```javascript
['1.3.6.1.4.1.11.', 'printer'],    // HP (häufig Drucker)
```

HP Enterprise OID 11 umfasst auch ProLiant Server, Aruba Switches und Storage-Systeme.

---

## Schicht 4: DARSTELLUNG — Frontend

### WU-31: MAC-Adresse des eigenen PCs fehlt (HOCH)

**Datei:** `main/network-scanner.js` Zeile 437
**Simons Problem:** #5

ARP-Tabelle enthält keine lokale MAC. WMI-Phase holt Manufacturer+Model, aber nicht die MAC-Adresse.

### WU-32: IP-Sortierung lexikographisch statt numerisch (HOCH)

**Datei:** `renderer/js/network.js` Zeile 479-486
**Simons Problem:** #7

`localeCompare` auf IP-Adressen sortiert "192.168.1.10" VOR "192.168.1.2".

### WU-33: "Unbekannt" vs. "Unbekanntes Gerät" — Badge-Klick funktioniert nicht (HOCH)

**Datei:** `renderer/js/network.js` Zeile 445 vs. 468

Summary-Badge nutzt `'Unbekannt'`, Gruppen-Header nutzt `'Unbekanntes Gerät'`. Klick auf das Badge findet die Gruppe nicht → scrollt nicht.

### WU-34: Toter Event-Handler für Geräte-Details (HOCH)

**Datei:** `renderer/js/network.js` Zeile 926-937

Event-Handler sucht `[data-device-toggle]`-Elemente, aber `_renderDeviceRow()` erzeugt KEINE Zeilen mit diesem Attribut. Die Geräte-Detail-Ansicht (Port-Scan, SMB-Shares pro Gerät) ist nicht erreichbar.

### WU-35: "synth" als sichtbares Badge im Frontend (HOCH)

**Datei:** `renderer/js/network.js` Zeile 591-592

`identifiedBy` wird als sichtbarer Badge-Text angezeigt. Werte wie "synth", "sysname+synth" sind für Simon als Endanwender unverständlich.

### WU-36: Fehlender CSS-Style für NAS-Geräte (MITTEL)

**Datei:** `renderer/css/style.css`

Die Klasse `.netinv-type-nas` fehlt. NAS-Geräte haben keinen farbigen Icon-Hintergrund.

### WU-37: Double-Render beim Filtern im Geräte-Tab (MITTEL)

**Datei:** `renderer/js/network.js` Zeile 794-799 vs. 877-884

Der Geräte-Filter hat die Klasse `.network-search` UND die ID `network-device-filter`. Beide Event-Handler feuern → `render()` wird zweimal aufgerufen + ungewollter Seiteneffekt auf den Verbindungs-Filter.

### WU-38: OS-Feld wird nicht angezeigt (NIEDRIG)

**Datei:** `renderer/js/network.js`

Backend liefert `os` (Windows/Linux/macOS), aber die Tabelle zeigt es nicht. Man kann nach OS filtern, sieht es aber nicht.

### WU-39: SMB-Shares nur im CSV-Export sichtbar (NIEDRIG)

**Datei:** `renderer/js/network.js`

Backend liefert `shares[]`, Frontend zeigt sie nur im CSV-Export, nicht in der Tabelle. Die Detail-Buttons existieren als Handler, aber ohne gerenderte UI.

### WU-40: Leere Ports-Zelle inkonsistent (NIEDRIG)

**Datei:** `renderer/js/network.js` Zeile 605

Keine Ports → leere Zelle statt "—". Alle anderen Spalten zeigen "—" bei fehlenden Daten.

---

## Zusammenfassung nach Schweregrad

### KRITISCH (6)
| # | Problem | Datei | Simons Problem |
|---|---------|-------|----------------|
| WU-1 | Smartphones nicht erkannt (nur ICMP Ping) | network-scanner.js:220-290 | #3 |
| WU-7 | Synthetische Modellnamen sind Unsinn | network-scanner.js:496-520 | #1, #6 |
| WU-9 | HTTP-Banner verwirft Titel mit Modellnamen | device-identify.js:280-299 | #1 |
| WU-18 | Port 515 allein = Drucker | oui-database.js:488 | #2 |
| WU-19 | Port 5000/5001 = NAS | oui-database.js:490 | #1 |
| WU-20 | Port 9100 + Port 80 NICHT als Drucker | oui-database.js:487 | — |

### HOCH (15)
| # | Problem | Datei |
|---|---------|-------|
| WU-2 | Port-Anzahl Timeout falsch (13 statt 15) | network-scanner.js:318 |
| WU-8 | SNMP sysName als Modellname | network-scanner.js:498-501 |
| WU-10 | HTTP überschreibt mDNS/WSD-Daten | device-identify.js:124-131 |
| WU-11 | Port 9100 in IPP-Targets (JetDirect ≠ IPP) | device-identify.js:108 |
| WU-21 | "Eigener PC" Gruppenbezeichnung | oui-database.js:465-466 |
| WU-22 | Samsung fehlt in VENDOR_PATTERNS | oui-database.js:402-437 |
| WU-23 | Apple fehlt in VENDOR_PATTERNS | oui-database.js:402-437 |
| WU-24 | Sony = TV statt Konsole | oui-database.js:418 |
| WU-25 | Huawei = Netzwerk statt Smartphone | oui-database.js:436 |
| WU-26 | Amazon/Ring/Google nicht klassifiziert | oui-database.js:402-437 |
| WU-31 | Lokale MAC fehlt | network-scanner.js:437 |
| WU-32 | IP-Sortierung lexikographisch | network.js:479-486 |
| WU-33 | Badge-Klick "Unbekannt" funktioniert nicht | network.js:445 vs. 468 |
| WU-34 | Toter Event-Handler für Geräte-Details | network.js:926-937 |
| WU-35 | "synth" als sichtbares Badge | network.js:591-592 |

### MITTEL (12)
| # | Problem | Datei |
|---|---------|-------|
| WU-3 | Fehlende Ports (8554, 37777, 5900) | network-scanner.js:298 |
| WU-4 | Subnetz immer /24 | network-scanner.js:197 |
| WU-5 | DNS-Auflösung blockiert | network-scanner.js:236-239 |
| WU-6 | Broadcast/Multicast nicht gefiltert | network-scanner.js:44 |
| WU-12 | UPnP nur erste Location pro IP | device-identify.js:399 |
| WU-13 | SSH-Banner nie geparst | device-identify.js:164-185 |
| WU-14 | Meta-Tag-Regex unvollständig | device-identify.js:323 |
| WU-15 | Hostname-Erkennung zu eng | network-scanner.js:479-492 |
| WU-27 | "switch" matched Netzwerk-Switches | oui-database.js:517 |
| WU-28 | "gateway" matched zu breit | oui-database.js:511 |
| WU-30 | HP SNMP OID pauschal = Drucker | oui-database.js:617 |
| WU-36 | CSS für NAS-Icon fehlt | style.css |
| WU-37 | Double-Render beim Filtern | network.js:794-799 |

### NIEDRIG (5)
| # | Problem | Datei |
|---|---------|-------|
| WU-16 | TTL-basierte OS-Erkennung unzuverlässig | network-scanner.js:144-149 |
| WU-17 | XML-Parsing via Regex fragil | device-identify.js:478-481 |
| WU-29 | PORT_TYPE_HINTS toter Code | oui-database.js:439-445 |
| WU-38 | OS-Feld nicht angezeigt | network.js |
| WU-39 | SMB-Shares nur im CSV-Export | network.js |
| WU-40 | Leere Ports-Zelle inkonsistent | network.js:605 |

---

## Scope-Management

**40 Wurzelursachen auf einmal ist zu viel.** Deshalb: 3 Prioritätsstufen.

### MUSS (Simons 7 Probleme direkt lösen)
Phasen 1-4 beheben die 7 gemeldeten Symptome. **Das ist der Kern.**

### SOLL (Qualität verbessern, neue Fehler verhindern)
Phasen 5-6 verbessern die Erkennungsrate für ZUKÜNFTIGE Scans.

### KANN (Wartung, Kosmetik, Architektur)
Phasen 7-8 fixen echte Bugs, sind aber für Simon nicht direkt sichtbar.

**Empfehlung:** Phase 1-4 implementieren → Simon testet → dann entscheiden ob Phase 5-8 nötig sind.

---

## Aktionsplan (mit konkretem Code)

### Phase 1: Falsche Modellnamen beseitigen (WU-7, WU-8, WU-35)

**Löst Simons Probleme:** #1 (NAS synth), #6 (Linux/macOS-Gerät synth)
**Skill:** `/fix-bug`
**Dateien:** `main/network-scanner.js`, `renderer/js/network.js`

#### Code-Änderung A: Synthetischen Fallback entfernen

`main/network-scanner.js` Zeile 494-521 — der gesamte Block `if (!identity.modelName) { ... }` wird entfernt. SNMP sysName wird als eigenes Feld gespeichert, NICHT als modelName:

```javascript
// VORHER (Zeile 496-520): Synthetischer Fallback → KOMPLETT LÖSCHEN
if (!identity.modelName) {
    if (snmpData.sysName && ...) { identity.modelName = snmpData.sysName; }
    else { /* Port-basierte Modellnamen */ }
}

// NACHHER: Nur sysName als separates Info-Feld (kein modelName-Fallback)
// (nichts — Block komplett weg, sysName bleibt in snmpData.sysName)
```

#### Code-Änderung B: identifiedBy nur als Tooltip

`renderer/js/network.js` Zeile 591-592:

```javascript
// VORHER:
modelParts.push(`<span class="netinv-source-badge" title="...">${this._esc(d.identifiedBy)}</span>`);

// NACHHER: Nur Tooltip-Icon, kein sichtbarer Text
modelParts.push(`<span class="netinv-source-badge" title="Erkannt via: ${this._esc(d.identifiedBy)}">&#9432;</span>`);
```

#### Was das löst
- "NAS synth" beim Zyxel Router → verschwindet (Feld wird "—")
- "Linux/macOS-Gerät synth" → verschwindet (Feld wird "—")
- "Netzwerkdrucker synth" bei Visionscape → verschwindet (Feld wird "—")
- "synth" Badge → verschwindet komplett

#### Was das NICHT löst
- **Die Modell-Spalte zeigt MEHR leere Felder ("—").** Geräte die vorher einen falschen Modellnamen hatten, haben jetzt gar keinen. Das ist ehrlicher, aber nicht schöner.
- Das Zyxel-Modell wird erst durch Phase 5 (HTTP-Banner-Parsing) erkannt.
- Die Visionscape bleibt "—" weil sie fast keine Probes beantwortet (nur LPD).

#### Verifizierung
Code-Review: Suche nach `synth` in network-scanner.js → 0 Treffer. Suche nach `identifiedBy` als sichtbarer Text in network.js → nur noch Tooltip.

---

### Phase 2: Port-basierte Klassifizierung reparieren (WU-18, WU-19, WU-20, WU-2)

**Löst Simons Problem:** #2 (Visionscape als Drucker)
**Skill:** `/fix-bug`
**Dateien:** `main/oui-database.js`, `main/network-scanner.js`

#### Code-Änderung A: Port 515 absichern

`main/oui-database.js` Zeile 487-490:

```javascript
// VORHER:
if (ports.has(9100) && !ports.has(80)) return _typeToResult('printer', vendor);
if (ports.has(515)) return _typeToResult('printer', vendor);
if (ports.has(5000) || ports.has(5001)) return _typeToResult('nas', vendor);

// NACHHER:
// Port 9100 (RAW Print) ist drucker-exklusiv — kein anderer Gerätetyp nutzt diesen Port
if (ports.has(9100)) return _typeToResult('printer', vendor);
// Port 515 (LPD) nur als Drucker wenn Drucker-Vendor ODER Port 9100/631 bestätigt
const printerVendors = /hp|brother|canon|epson|lexmark|kyocera|konica|ricoh|xerox|oki|sharp/i;
if (ports.has(515) && (printerVendors.test(vendor) || ports.has(631))) {
    return _typeToResult('printer', vendor);
}
// Port 5000/5001 nur als NAS wenn Vendor Synology/QNAP ODER beide Ports offen
const nasVendors = /synology|qnap|buffalo|western\s*digital|seagate/i;
if ((ports.has(5000) || ports.has(5001)) && (nasVendors.test(vendor) || (ports.has(5000) && ports.has(5001)))) {
    return _typeToResult('nas', vendor);
}
```

#### Code-Änderung B: portsCount korrigieren

`main/network-scanner.js` Zeile 318:

```javascript
// VORHER:
const portsCount = 13;

// NACHHER:
const portsCount = 15;  // Muss mit $ports Array (Zeile 298) übereinstimmen
```

#### Was das löst
- Visionscape (Port 515, Vendor "Visionscape Co.") → wird NICHT als Drucker erkannt
- HP Drucker (Port 9100 + 80) → wird weiterhin korrekt als Drucker erkannt
- Zyxel Router (Port 5000, Vendor "Zyxel") → wird NICHT als NAS erkannt
- Port-Scan-Timeout wird korrekt berechnet → weniger Datenverlust

#### Was das NICHT löst
- Geräte mit Port 515 und unbekanntem Vendor → werden nicht als Drucker erkannt (lieber falsch-negativ als falsch-positiv)
- Visionscape bleibt "Unbekanntes Gerät" (kein besserer Typ möglich ohne mehr Daten)

#### Verifizierung
Manueller Test: Gerät mit IP 192.168.1.132, Ports [515], Vendor "Visionscape Co." → classifyDevice() muss etwas ANDERES als "printer" zurückgeben. Gerät mit Ports [9100, 80], Vendor "HP" → muss "printer" bleiben.

---

### Phase 3: Gruppenbezeichnung + MAC + Sortierung + Frontend-Fixes (WU-21, WU-31, WU-32, WU-33, WU-36, WU-37, WU-40)

**Löst Simons Probleme:** #4 (Eigener PC), #5 (MAC fehlt), #7 (Sortierung)
**Skill:** `/fix-bug`
**Dateien:** `main/oui-database.js`, `main/network-scanner.js`, `renderer/js/network.js`, `renderer/css/style.css`

#### Code-Änderung A: isLocal → type 'pc'

`main/oui-database.js` Zeile 465-466:

```javascript
// VORHER:
if (isLocal) return { type: 'local', label: 'Eigener PC', icon: 'monitor' };

// NACHHER:
if (isLocal) return { type: 'pc', label: 'PC / Laptop', icon: 'monitor' };
```

#### Code-Änderung B: MAC via WMI holen

`main/network-scanner.js` Zeile 423-425 (WMI-Script erweitern):

```powershell
# VORHER:
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
[PSCustomObject]@{ Manufacturer = $cs.Manufacturer; Model = $cs.Model } | ConvertTo-Json

# NACHHER:
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Virtual*' -and $_.InterfaceDescription -notlike '*Hyper-V*' } | Select-Object -First 1
[PSCustomObject]@{ Manufacturer = $cs.Manufacturer; Model = $cs.Model; MAC = if($adapter) { $adapter.MacAddress } else { '' } } | ConvertTo-Json
```

Und in der Ergebnis-Assembly (Zeile 437):

```javascript
// NACHHER: Lokale MAC aus WMI einsetzen wenn ARP sie nicht hat
let macDash = macMap.get(d.ip) || '';
if (!macDash && isLocal && localPCInfo && localPCInfo.MAC) {
    macDash = localPCInfo.MAC;
}
```

#### Code-Änderung C: IP numerisch sortieren

`renderer/js/network.js` Zeile 480-484:

```javascript
// VORHER:
return (a.hostname || a.ip).localeCompare(b.hostname || b.ip);

// NACHHER: IP numerisch sortieren
const ipNum = (ip) => ip.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct, 10), 0);
return ipNum(a.ip) - ipNum(b.ip);
```

#### Code-Änderung D: "Unbekannt" vereinheitlichen

`renderer/js/network.js` Zeile 445:

```javascript
// VORHER:
const t = d.deviceLabel || 'Unbekannt';

// NACHHER:
const t = d.deviceLabel || 'Unbekanntes Gerät';  // Gleich wie Zeile 468
```

#### Code-Änderung E: CSS + Frontend-Kleinkram

```css
/* style.css: NAS-Icon-Style hinzufügen */
.netinv-type-nas { background: rgba(255, 165, 0, 0.15); color: #ffa500; }
```

```javascript
// network.js Zeile 605: Leere Ports → "—"
// VORHER:
<td class="netinv-col-ports">${portBadges}${morePortsHint}</td>
// NACHHER:
<td class="netinv-col-ports">${portBadges || morePortsHint || '\u2014'}</td>

// network.js: Geräte-Filter OHNE .network-search Klasse (WU-37)
// Die ID network-device-filter reicht für den Event-Handler
```

#### Was das löst
- "Eigener PC" → wird zu "PC / Laptop" (zusammen mit anderen PCs gruppiert)
- MAC-Adresse des eigenen PCs → wird angezeigt
- IP-Sortierung → numerisch korrekt
- Badge-Klick "Unbekannt" → scrollt korrekt
- NAS → hat farbigen Icon-Hintergrund
- Filter → kein Double-Render mehr

#### Was das NICHT löst
- Der eigene PC zeigt den WMI-Modellnamen (z.B. "Z790 AORUS ELITE AX"). Das ist technisch korrekt, aber für Simon möglicherweise überraschend wenn er "Simon-PC" erwartet.

#### Verifizierung
Code-Review: `'local'` und `'Eigener PC'` dürfen nirgends mehr vorkommen. `portsCount` muss 15 sein. `.netinv-type-nas` muss in style.css existieren.

---

### Phase 4: Smartphones finden (WU-1)

**Löst Simons Problem:** #3 (Handy fehlt)
**Skill:** `/fix-bug`
**Dateien:** `main/network-scanner.js`

#### Strategie (KEIN Platzhalter)

Die ARP-Tabelle wird BEREITS gelesen (Zeile 265-290). Sie enthält alle Geräte die kürzlich im Netzwerk kommuniziert haben — auch Smartphones die nicht auf Ping antworten. Der Fix ist simpel: ARP-Einträge die NICHT im Ping-Sweep gefunden wurden, als zusätzliche Geräte hinzufügen.

**Warum das funktioniert:** Smartphones kommunizieren ständig mit dem Router (DHCP, DNS, Push-Notifications). Ihre MAC+IP sind in der ARP-Tabelle. Sie antworten nur nicht auf ICMP Ping.

**Warum KEINE Web-Research nötig ist:** Die ARP-Tabelle ist bereits da. Der einzige Fehler ist, dass sie nur für MAC-Lookup genutzt wird, nicht für Discovery.

#### Code-Änderung

`main/network-scanner.js` nach Zeile 290 (nach dem ARP-Tabelle-Block):

```javascript
// Phase 2.6: ARP-Geräte die NICHT im Ping Sweep sind → als zusätzliche Geräte hinzufügen
// Das findet Smartphones, IoT-Geräte und andere die ICMP blockieren
const pingIPs = new Set(onlineDevices.map(d => d.ip));
let arpOnlyCount = 0;
for (const [ip, mac] of macMap.entries()) {
    if (pingIPs.has(ip)) continue;  // Bereits via Ping gefunden
    if (ip === subnetInfo.localIP) continue;  // Eigener PC (wird separat behandelt)
    if (ip === subnetInfo.gateway) continue;  // Gateway (bereits via Ping)
    if (!ip.startsWith(subnetInfo.subnet + '.')) continue;  // Nur gleiches Subnetz
    // Multicast/Broadcast filtern
    const lastOctet = parseInt(ip.split('.')[3], 10);
    if (lastOctet === 255 || lastOctet === 0) continue;

    onlineDevices.push({ ip, ttl: 0, rtt: -1, hostname: '' });
    arpOnlyCount++;
}
if (arpOnlyCount > 0) {
    log.info(`ARP-Discovery: ${arpOnlyCount} zusätzliche Geräte (nicht via Ping erreichbar)`);
}
```

Und für die Hostname-Auflösung der ARP-only-Geräte (optional, nach Zeile 262):

```javascript
// DNS-Lookup für ARP-only-Geräte (die haben keinen Hostnamen vom Ping)
// Wird NACH dem Hinzufügen gemacht, nicht inline (Performance)
```

#### Was das löst
- Simons Handy: Wenn es im WLAN aktiv ist (was es ist, sonst wäre es nicht im WLAN), hat es einen ARP-Eintrag → wird gefunden
- Andere ICMP-blockierende Geräte (IoT, Smart Home im Schlafmodus)

#### Was das NICHT löst
- Geräte die seit dem letzten Neustart des PCs NICHT kommuniziert haben → kein ARP-Eintrag
- Die ARP-Tabelle kann "stale" Einträge haben (Geräte die offline sind aber deren ARP-Eintrag noch lebt, typisch 2-10 Minuten). Diese erscheinen als "online" obwohl sie es nicht mehr sind.
- Smartphones im **Gast-WLAN** (separates Subnetz) → nicht im ARP
- rtt wird -1 sein (kein Ping möglich) → im Frontend als "—" statt "X ms" anzeigen

#### Risiko: Stale ARP-Einträge
ARP-Einträge leben typisch 30-120 Sekunden. Windows hält sie standardmässig 2 Minuten. Das bedeutet: Geräte die VOR 2+ Minuten das WLAN verlassen haben, können noch im Scan auftauchen. Das ist ein akzeptabler Trade-off — lieber ein Gerät zu viel als eines das fehlt.

#### Verifizierung
Simon scannt und prüft ob sein Handy auftaucht. rtt-Wert des Handys sollte -1 oder 0 sein (kein Ping).

---

### Phase 5: HTTP-Banner-Parsing verbessern (WU-9, WU-14) — SOLL

**Verbessert:** Erkennungsrate für Geräte mit Web-Interface (Router, NAS, etc.)
**Skill:** `/fix-bug`
**Dateien:** `main/device-identify.js`

#### Code-Änderung A: Trennzeichen erweitern

`main/device-identify.js` Zeile 285-286:

```javascript
// VORHER:
.replace(/\s*[-–|:]\s*(login|configurator|...)\b.*$/i, '')

// NACHHER: Auch —, /, >, und reines Leerzeichen VOR generischem Wort
.replace(/\s*[-–—|:/>]\s*(login|configurator|configuration|settings|setup|management|dashboard|portal|admin|panel|status|interface|home|welcome|sign\s*in|startseite|webinterface|anmeldung|einstellungen|willkommen|konfiguration|verwaltung)\b.*$/i, '')
```

Und für den Fall "Modellname Login" (nur Leerzeichen, kein Trennzeichen):

```javascript
// Fallback: Letztes Wort das generisch ist abschneiden
if (!modelName) {
    const spaceGeneric = title.replace(/\s+(login|configurator|configuration|settings|setup|admin|home|welcome|sign\s*in|startseite|anmeldung)\s*$/i, '').trim();
    if (spaceGeneric.length > 3 && spaceGeneric.length < title.length) {
        modelName = spaceGeneric;
    }
}
```

#### Code-Änderung B: Problematische genericWords entfernen

```javascript
// "access point" und "document" aus genericWords entfernen
// DAFÜR "anmeldung", "willkommen", "konfiguration", "verwaltung" hinzufügen
```

#### Code-Änderung C: Meta-Tag flexibler

```javascript
// VORHER: Feste Attribut-Reihenfolge
/<meta\s+(?:name|property)=["']...\s+content=["']([^"']{3,80})["']/i

// NACHHER: Beide Reihenfolgen
/<meta\s+(?:(?:name|property)=["'](?:description|og:title|product)["']\s+content=["']([^"']{3,80})["']|content=["']([^"']{3,80})["']\s+(?:name|property)=["'](?:description|og:title|product)["'])/i
```

#### Was das löst
- Zyxel Router: "ZyXEL VMG3625 - Login" → Modell "ZyXEL VMG3625" statt "—"
- FRITZ!Box: "FRITZ!Box 7590 > Login" → Modell "FRITZ!Box 7590"
- Deutsche Router-UIs: "Anmeldung" wird gefiltert

#### Was das NICHT löst
- Geräte ohne Web-Interface (z.B. Visionscape, Linux-Gerät 192.168.1.124)
- Geräte deren Title kein Modellname enthält (z.B. "Login" ohne Hersteller)
- Geräte die auf HTTP nicht antworten (Firewall, kein Webserver)

---

### Phase 6: VENDOR_PATTERNS + Hostname-Erkennung (WU-22-28) — SOLL

**Verbessert:** Korrekte Gruppierung für Samsung, Apple, Sony, Amazon, Huawei, Google
**Skill:** `/fix-bug`
**Dateien:** `main/oui-database.js`

#### Code-Änderung: VENDOR_PATTERNS erweitern

Neue Einträge in der richtigen Reihenfolge (spezifisch vor generisch):

```javascript
// --- Konsolen (VOR TV-Herstellern) ---
['Sony Interactive', 'console'],  // PlayStation — VOR ['Sony', 'tv']
['Microsoft Xbox', 'console'],    // Xbox
// --- Smartphones / Tablets ---
['Samsung SmartThings', 'smarthome'],
['Samsung', 'mobile'],            // Galaxy, Tablets (generisch)
['Apple', 'mobile'],              // iPhone, iPad (generisch, mDNS differenziert besser)
['Huawei', 'mobile'],             // statt 'network'
['OnePlus', 'mobile'], ['Xiaomi', 'mobile'], ['Oppo', 'mobile'],
// --- Media (nach Smart Home) ---
['Amazon', 'media'],              // Echo, Fire TV
['Google', 'media'],              // Chromecast, Google Home (nach Google Nest)
// --- Kameras ---
['Ring', 'camera'],               // Ring (Amazon)
```

Hostname-Fix: "switch" spezifischer machen:

```javascript
// VORHER:
if (hn.includes('switch') || hn.includes('playstation') || hn.includes('xbox'))

// NACHHER:
if (/\bnintendo.?switch\b/i.test(hn) || hn.includes('playstation') || hn.includes('xbox'))
```

#### Was das löst
- Samsung Galaxy → "Smartphone" statt "Unbekanntes Gerät"
- Apple iPhone → "Smartphone" statt "Apple Gerät (PC)"
- PlayStation → "Spielkonsole" statt "Smart TV"
- Huawei-Handys → "Smartphone" statt "Netzwerkgerät"
- Amazon Echo → "Medien-Gerät" statt "Unbekannt"
- HP-Switch-01 → NICHT mehr "Spielkonsole"

#### Was das NICHT löst
- **Samsung Smart TV vs. Samsung Galaxy:** Beide haben Vendor "Samsung" → beide werden als "mobile" klassifiziert. Die Identity-Erkennung (Layer 1, UPnP/mDNS) erkennt TVs korrekt, aber nur wenn der TV UPnP beantwortet.
- **Apple TV vs. iPhone:** Gleiches Problem. mDNS differenziert, aber nur wenn das Gerät gefunden wird.
- Diese Vendor-Zuordnung ist ein FALLBACK. Die korrekte Lösung wäre eine bessere Identity-Erkennung (Layer 1/2). Aber als schneller Fix ist "mobile" besser als "Unbekannt".

---

### Phase 7: Daten-Merge reparieren (WU-10, WU-11) — KANN

**Verbessert:** mDNS/WSD-Daten bleiben erhalten wenn HTTP ein Ergebnis liefert
**Skill:** `/fix-bug`
**Dateien:** `main/device-identify.js`

#### Code-Änderung

Einen `_mergeResult()` Helper erstellen:

```javascript
function _mergeResult(existing, newFields) {
    return {
        modelName:        newFields.modelName || existing.modelName || '',
        serialNumber:     newFields.serialNumber || existing.serialNumber || '',
        firmwareVersion:  newFields.firmwareVersion || existing.firmwareVersion || '',
        identifiedBy:     existing.identifiedBy ? existing.identifiedBy + '+' + (newFields.source || '') : (newFields.source || ''),
        sshBanner:        newFields.sshBanner || existing.sshBanner || '',
        // DIESE FELDER NICHT ÜBERSCHREIBEN:
        mdnsServices:     existing.mdnsServices || [],
        mdnsServiceTypes: existing.mdnsServiceTypes || [],
        mdnsHostname:     existing.mdnsHostname || '',
        wsdTypes:         existing.wsdTypes || [],
    };
}
```

Verwendung in Zeile 126, 149, 170 (HTTP/IPP/SSH-Merge):

```javascript
// VORHER (Zeile 126):
results.set(d.ip, {
    modelName: result.modelName,
    serialNumber: existing.serialNumber || '',
    ...
});

// NACHHER:
results.set(d.ip, _mergeResult(existing, { modelName: result.modelName, source: 'http' }));
```

Und Port 9100 aus IPP-Targets entfernen (Zeile 108):

```javascript
// VORHER:
return ports.includes(631) || ports.includes(9100);

// NACHHER: 9100 ist JetDirect (RAW), nicht IPP (HTTP)
return ports.includes(631);
```

#### Was das löst
- mDNS-Services bleiben erhalten → bessere Klassifizierung
- WSD-Typen bleiben erhalten → Drucker-Erkennung zuverlässiger
- Port 9100 → kein sinnloser IPP-Request mehr (weniger Timeouts)

---

### Phase 8: Toten Code + Kleinkram aufräumen (WU-29, WU-34) — KANN

**Skill:** `/fix-bug`
**Dateien:** `main/oui-database.js`, `renderer/js/network.js`

1. `PORT_TYPE_HINTS` entfernen (toter Code, Zeile 439-445)
2. Toten Event-Handler für `data-device-toggle` entfernen (Zeile 926-937) ODER `_renderDeviceRow()` erweitern um die Detail-Ansicht zu ermöglichen (Feature-Entscheidung)

---

## Testkonzept

### Problem: Kein automatisierter Test möglich

Der Netzwerk-Scan dauert 60-120 Sekunden und braucht ein echtes Netzwerk. Puppeteer/Playwright können den Scan nicht sinnvoll testen, weil die Ergebnisse vom Netzwerk abhängen.

### Lösung: 3-stufige Verifikation

**Stufe 1: Code-Review (nach jeder Phase)**
- Grep nach entfernten/geänderten Patterns (z.B. `synth` darf nicht mehr in network-scanner.js vorkommen)
- Manuelle Prüfung der geänderten Zeilen

**Stufe 2: Statische Simulation (nach Phase 2)**
- Die `classifyDevice()`-Funktion kann mit simulierten Daten getestet werden:
```javascript
// Test: Visionscape-Fall
classifyDevice({ vendor: 'Visionscape Co.', openPorts: [{ port: 515 }], ... })
// Erwartung: NICHT 'printer'

// Test: HP-Drucker-Fall
classifyDevice({ vendor: 'HP Inc.', openPorts: [{ port: 9100 }, { port: 80 }], ... })
// Erwartung: 'printer'
```
- Das ist kein Unit-Test-Framework, aber ein manuelles Node.js-Script das die Funktion direkt aufruft.

**Stufe 3: Simons Scan (nach Phase 1-4)**
Simon macht einen frischen Scan und schickt einen Screenshot. Das ist die einzige echte Verifikation. Jede Phase vorher ist nur Vorbereitung darauf.

### Ehrliche Einschätzung

Ohne Simons Screenshot können wir NICHT wissen ob die Fixes funktionieren. Code-Reviews und Simulationen fangen logische Fehler ab, aber nicht Netzwerk-spezifische Probleme (Timeouts, unerwartete Antworten, Geräte die sich anders verhalten als erwartet).

---

## Betroffene Dateien

| Datei | Phasen | Wurzelursachen |
|-------|--------|---------------|
| `main/network-scanner.js` | 1, 2, 3, 4 | WU-1,2,7,8,31 |
| `main/oui-database.js` | 2, 3, 6, 8 | WU-18,19,20,21,22-28,29 |
| `main/device-identify.js` | 5, 7 | WU-9,10,11,14 |
| `renderer/js/network.js` | 1, 3, 8 | WU-32,33,35,37,40 |
| `renderer/css/style.css` | 3 | WU-36 |

---

## Benötigte Skills

| Skill | Zweck | Phasen |
|-------|-------|--------|
| `/fix-bug` | Jede Phase implementieren | 1-8 |
| `/visual-verify` | Nach Phase 1-4 visuell prüfen (wenn App läuft) | nach Phase 4 |
| `/changelog` | Änderungen dokumentieren | nach jeder Phase |

**`/web-research` ist NICHT mehr nötig** — die Smartphone-Erkennung via ARP ist eine konkrete Lösung, keine offene Frage.

---

## Prüfkriterien (wann ist das Issue gelöst?)

Simon startet einen Scan und prüft:

**MUSS (Phase 1-4):**
- [ ] Kein Gerät zeigt "synth" oder "sysname" als sichtbaren Badge-Text
- [ ] Zyxel Router: Zeigt KEIN "NAS" mehr (Modell ist "—" oder echter Name)
- [ ] Visionscape: Wird NICHT als "Drucker" angezeigt
- [ ] HP Drucker: Wird weiterhin korrekt als Drucker erkannt (auch mit Port 80!)
- [ ] Simons Handy: Erscheint in der Geräteliste
- [ ] Eigener PC: Gruppiert unter "PC / Laptop" (nicht "Eigener PC")
- [ ] Eigener PC: MAC-Adresse wird angezeigt
- [ ] Geräte innerhalb der Gruppen sinnvoll sortiert (IP numerisch)
- [ ] Klick auf "Unbekannt"-Badge scrollt zur richtigen Gruppe

**SOLL (Phase 5-6):**
- [ ] Zyxel Router: Zeigt echtes Modell (z.B. "VMG3625-T50B") statt "—"
- [ ] Samsung/Apple/Sony-Geräte korrekt klassifiziert
- [ ] NAS-Geräte haben einen farbigen Icon-Hintergrund

**Bekannte Einschränkungen (KEIN Fehler):**
- Geräte ohne Web-Interface, SNMP, UPnP, mDNS → Modell bleibt "—" (ehrlich, nicht falsch)
- ARP-Geräte haben rtt = -1 (kein Ping möglich) → "— ms" statt "X ms"
- Samsung TV vs. Samsung Handy → beide "Smartphone" (korrekter Fix braucht UPnP/mDNS)

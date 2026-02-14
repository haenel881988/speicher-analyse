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

## Aktionsplan (priorisiert)

### Phase 1: Synthetische Modellnamen abschaffen (WU-7, WU-8, WU-35)

**Skill:** `/fix-bug`
**Aufwand:** Klein
**Dateien:** `main/network-scanner.js`

1. Synthetischen Fallback-Code (Zeile 494-521) **komplett entfernen**
2. SNMP sysName NICHT als modelName verwenden — nur als Tooltip/Info-Feld
3. Wenn kein Modellname erkannt → Feld **leer lassen** (Frontend zeigt "—")
4. `identifiedBy`-Badge im Frontend nur als Tooltip, nicht als sichtbarer Text

### Phase 2: Port-basierte Klassifizierung reparieren (WU-18, WU-19, WU-20, WU-2)

**Skill:** `/fix-bug`
**Aufwand:** Klein
**Dateien:** `main/oui-database.js`, `main/network-scanner.js`

1. **Port 515 allein ≠ Drucker.** Nur in Kombination: 515 + Drucker-Vendor ODER 515 + 9100 ODER 515 + 631
2. **Port 5000/5001 allein ≠ NAS.** Nur wenn Vendor = Synology/QNAP ODER beide Ports offen
3. **Port 9100: `!ports.has(80)` entfernen.** 9100 ist drucker-exklusiv, auch mit Port 80
4. **portsCount korrigieren:** 13 → 15

### Phase 3: VENDOR_PATTERNS vervollständigen (WU-22 bis WU-26)

**Skill:** `/fix-bug`
**Aufwand:** Mittel
**Dateien:** `main/oui-database.js`

Fehlende Einträge in VENDOR_PATTERNS:
```
['Samsung SmartThings', 'smarthome'],
['Samsung', 'mobile'],
['Apple', 'mobile'],          // Fallback, spezifischer via mDNS/Hostname
['Sony Interactive', 'console'],  // VOR ['Sony', 'tv']
['Amazon', 'media'],          // Echo, Fire TV
['Ring', 'camera'],
['Google', 'media'],          // Chromecast, Google Home (nach Google Nest)
['Huawei', 'mobile'],         // statt 'network'
```

Zusätzlich Hostname-Erkennung "switch" → `/\bnintendo.?switch/i` und "gateway" einschränken.

### Phase 4: Smartphone-Erkennung (WU-1)

**Skill:** `/web-research` → `/fix-bug`
**Aufwand:** Gross
**Dateien:** `main/network-scanner.js`

ARP-Tabellen-Einträge als eigenständige Geräte-Quelle nutzen:
1. Nach dem Ping Sweep: ARP-Tabelle lesen
2. Jede ARP-IP die NICHT in `onlineDevices` ist → als neues Gerät hinzufügen
3. Vorher: `/web-research` für beste Discovery-Methode (ARP-Scan vs. TCP SYN vs. mDNS)

### Phase 5: HTTP-Banner-Parsing verbessern (WU-9, WU-14)

**Skill:** `/fix-bug`
**Aufwand:** Mittel
**Dateien:** `main/device-identify.js`

1. `beforeGeneric`-Regex: Trennzeichen erweitern um `—`, `/`, `>`, reines Leerzeichen
2. Deutsche generische Wörter hinzufügen: `anmeldung`, `einstellungen`, `willkommen`, `konfiguration`
3. `<meta>`-Tag-Regex: Attribut-Reihenfolge flexibel machen
4. "access point" und "document" aus genericWords entfernen (enthalten oft Modellnamen)
5. SSH-Banner parsen für OS/Hersteller-Erkennung

### Phase 6: Gruppenbezeichnung + MAC + Sortierung (WU-21, WU-31, WU-32, WU-33)

**Skill:** `/fix-bug`
**Aufwand:** Klein
**Dateien:** `main/oui-database.js`, `main/network-scanner.js`, `renderer/js/network.js`

1. `isLocal`: type `'pc'` statt `'local'`, label `'PC / Laptop'`
2. WMI-Phase: MAC-Adresse via `Get-NetAdapter` holen
3. IP-Sortierung: numerisch (Oktette als Zahlen vergleichen)
4. "Unbekannt" vs. "Unbekanntes Gerät": vereinheitlichen

### Phase 7: Daten-Merge reparieren (WU-10)

**Skill:** `/fix-bug`
**Aufwand:** Klein
**Dateien:** `main/device-identify.js`

`_mergeResult(existing, newData)` Helper erstellen der ALLE bestehenden Felder erhält und nur neue/bessere übernimmt. Verwendung in HTTP-Merge (Zeile 126), IPP-Merge (Zeile 149), SSH-Merge (Zeile 170).

### Phase 8: Frontend-Bugs fixen (WU-34, WU-36, WU-37, WU-40)

**Skill:** `/fix-bug`
**Aufwand:** Klein
**Dateien:** `renderer/js/network.js`, `renderer/css/style.css`

1. Toten Event-Handler entfernen oder `data-device-toggle` Attribut in `_renderDeviceRow()` hinzufügen
2. CSS `.netinv-type-nas` hinzufügen
3. Double-Render: Geräte-Filter-Input NICHT mit Klasse `.network-search` versehen
4. Leere Ports-Zelle: "—" anzeigen statt leer

---

## Betroffene Dateien

| Datei | Wurzelursachen | Schwerpunkt |
|-------|---------------|-------------|
| `main/network-scanner.js` | WU-1,2,3,4,5,6,7,8,15,31 | Discovery + Synthese + WMI |
| `main/device-identify.js` | WU-9,10,11,12,13,14,17 | Identification Probes |
| `main/oui-database.js` | WU-18,19,20,21,22-28,29,30 | Klassifizierung |
| `renderer/js/network.js` | WU-32,33,34,35,37,38,39,40 | Darstellung |
| `renderer/css/style.css` | WU-36 | NAS-Icon Style |

---

## Benötigte Skills

| Skill | Zweck | Phasen |
|-------|-------|--------|
| `/fix-bug` | Jede Wurzelursache einzeln beheben | 1-3, 5-8 |
| `/web-research` | Smartphone-Erkennung recherchieren | 4 |
| `/visual-verify` | Nach jedem Fix visuell prüfen | alle |
| `/changelog` | Änderungen dokumentieren | alle |

---

## Prüfkriterien (wann ist das Issue gelöst?)

Simon startet einen Scan und prüft:

- [ ] Zyxel Router: Zeigt KEIN "NAS" mehr, sondern echtes Modell oder leeres Feld
- [ ] Visionscape: Wird NICHT als "Drucker" angezeigt (nur der HP ist ein Drucker)
- [ ] HP Drucker: Wird weiterhin korrekt als Drucker erkannt (auch mit Port 80!)
- [ ] Simons Handy: Erscheint in der Geräteliste
- [ ] Eigener PC: Gruppiert unter "PC / Laptop" (nicht "Eigener PC")
- [ ] Eigener PC: MAC-Adresse wird angezeigt
- [ ] Kein Gerät zeigt "synth" als Erkennungsquelle
- [ ] Geräte innerhalb der Gruppen sinnvoll sortiert (IP numerisch)
- [ ] Klick auf "Unbekannt"-Badge scrollt zur richtigen Gruppe
- [ ] Sonos, Samsung, Apple-Geräte korrekt klassifiziert
- [ ] NAS-Geräte haben einen farbigen Icon-Hintergrund

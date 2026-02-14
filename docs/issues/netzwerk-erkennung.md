# Issue: Netzwerk-Geräte-Erkennung grundlegend fehlerhaft

**Erstellt:** 2026-02-14
**Status:** Offen
**Priorität:** Hoch
**Betrifft:** Netzwerk-Scanner (Lokale Geräte)

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

## Tiefenanalyse: Wurzelursachen

### WU-1: Synthetische Modellnamen sind Unsinn

**Datei:** `main/network-scanner.js` Zeile 504-514
**Schwere:** Kritisch

Der synthetische Fallback rät einen Modellnamen anhand offener Ports. Die Zuordnung ist falsch:

```
Port 5000 → "NAS"         FALSCH: Port 5000 ist generisches HTTP (Router, Webserver, Apps)
Port 515  → "Netzwerkdrucker" FALSCH: Nicht jedes Gerät mit LPD ist ein Drucker
Port 80   → "Gerät mit Web-Interface"  NUTZLOS: Sagt dem User nichts
```

**Konkretes Beispiel:** Zyxel Router hat Ports [80, 443, 5000]. Die `else if`-Kette prüft Port 5000 VOR Port 80 → Modell wird "NAS" statt irgendetwas Sinnvolles.

**Wurzelursache:** Port-Nummern allein sagen NICHTS über das Gerätemodell aus. Ein synthetischer Modellname basierend auf Ports ist grundsätzlich falsch konzipiert.

### WU-2: Port 515 (LPD) = Drucker ist zu aggressiv

**Datei:** `main/oui-database.js` Zeile 487-488
**Schwere:** Hoch

```javascript
if (ports.has(515)) return _typeToResult('printer', vendor);
```

Simon hat genau 1 Drucker (HP OfficeJet). Das Visionscape-Gerät hat Port 515 offen, ist aber KEIN Drucker. Industriegeräte, NAS-Systeme und andere Geräte können LPD als Nebenprotokoll haben.

**Wurzelursache:** Port 515 allein reicht nicht als Drucker-Beweis. Es fehlt eine Gegenprüfung (Vendor, andere Ports, Identity-Daten).

### WU-3: Smartphones werden nicht erkannt

**Datei:** `main/network-scanner.js` Zeile 220-290
**Schwere:** Kritisch

Der Scanner findet Geräte über:
1. **ICMP Ping Sweep** (Zeile 224) — Smartphones antworten oft NICHT auf Ping (iOS-Datenschutz, Android-Energiesparmodus, Firewall)
2. **ARP-Tabelle lesen** (Zeile 265) — Nur Geräte die kürzlich kommuniziert haben

**Was fehlt:**
- **ARP-Scan** (aktiv): Sendet ARP-Requests an alle IPs — Geräte MÜSSEN antworten (Layer 2, kann nicht blockiert werden)
- **DHCP-Leases**: Der Router weiss welche Geräte IPs haben
- **mDNS-Discovery**: iPhones advertisen sich per Bonjour (_apple-mobdev._tcp)

**Wurzelursache:** ICMP Ping ist die unzuverlässigste Methode zur Geräte-Entdeckung. Smartphones blockieren Ping systematisch.

### WU-4: Gruppenbezeichnung "Eigener PC" ist falsch

**Datei:** `main/oui-database.js` Zeile 465-466
**Schwere:** Mittel

```javascript
if (isLocal) return { type: 'local', label: 'Eigener PC', icon: 'monitor' };
```

"Eigener PC" ist keine sinnvolle Gruppierung. In einem Netzwerk mit mehreren PCs/Laptops sollten alle Clients zusammen gruppiert werden (z.B. unter "PC / Laptop" oder "Arbeitsstation").

**Vorschlag:** Der lokale PC sollte denselben Typ wie andere PCs bekommen ("PC / Laptop"), mit einem "Du"-Badge zur Markierung (existiert bereits im Frontend).

### WU-5: MAC-Adresse des eigenen PCs fehlt

**Datei:** `main/network-scanner.js` Zeile 437
**Schwere:** Mittel

```javascript
const macDash = macMap.get(d.ip) || '';  // ARP-Tabelle hat KEINE lokale MAC
```

Die ARP-Tabelle (`Get-NetNeighbor`) enthält nur ANDERE Geräte. Die eigene MAC-Adresse muss separat geholt werden:

```powershell
(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Virtual*' }).MacAddress
```

**Wurzelursache:** WMI-Phase holt Hersteller+Modell, aber vergisst die MAC-Adresse.

### WU-6: Synthetischer Modellname wiederholt den Gerätetyp

**Datei:** `main/network-scanner.js` Zeile 504-514
**Schwere:** Mittel

"Linux/macOS-Gerät synth" als Modellname ist sinnlos — der Gerätetyp steht bereits in der Typ-Spalte. Das Modellfeld sollte entweder leer bleiben oder echte Informationen zeigen (Hostname, SNMP sysName, etc.).

**Wurzelursache:** Der synthetische Fallback erzeugt Pseudo-Modellnamen die keine echten Informationen enthalten.

### WU-7: Sortierung innerhalb Gruppen fehlt

**Datei:** `renderer/js/network.js` Zeile 478-486
**Schwere:** Niedrig

Der Code sortiert innerhalb der Gruppen nach Vendor, dann nach Hostname. Aber:
- Geräte ohne Vendor kommen ans Ende statt logisch einsortiert
- IP-Adressen werden als Text sortiert (192.168.1.9 kommt nach 192.168.1.8, aber VOR 192.168.1.10 wäre es falsch — tatsächlich funktioniert localeCompare hier, aber nur zufällig)

---

## Aktionsplan

### Phase 1: Synthetischen Modellnamen abschaffen (WU-1, WU-6)

**Skill:** `/fix-bug`

Der synthetische Fallback-Code in `network-scanner.js` Zeile 494-521 muss komplett entfernt werden. Stattdessen:
- Wenn kein Modellname erkannt → Feld **leer lassen** (Frontend zeigt dann "—")
- SNMP sysName weiterhin als Ersatz verwenden (das hat das Gerät selbst geliefert)
- Keine Port-basierten Modellnamen mehr

### Phase 2: Port-515-Klassifizierung absichern (WU-2)

**Skill:** `/fix-bug`

Port 515 allein darf NICHT "Drucker" ergeben. Nur in Kombination:
- Port 515 + Vendor enthält Drucker-Hersteller (HP, Brother, Canon, Epson, Lexmark, Kyocera) → Drucker
- Port 515 + Port 9100 (RAW Print) → Drucker
- Port 515 + IPP-Antwort positiv → Drucker
- Port 515 allein + unbekannter Vendor → NICHT Drucker

### Phase 3: Smartphone-Erkennung (WU-3)

**Skill:** `/new-feature` oder `/web-research` + `/fix-bug`

Optionen (zu recherchieren):
1. **ARP-Scan**: PowerShell `arp -a` nach dem Ping Sweep enthält alle kürzlich aktiven Geräte
2. **Erweiterter Ping**: TCP SYN auf Port 80/443 statt ICMP — Smartphones antworten auf HTTP
3. **mDNS**: iPhones advertisen sich per Bonjour — `_apple-mobdev._tcp`, `_companion-link._tcp`
4. **DHCP-Leases vom Router**: Über UPnP oder SNMP vom Gateway abrufbar (modellabhängig)

### Phase 4: Gruppenbezeichnung korrigieren (WU-4)

**Skill:** `/fix-bug`

- `isLocal` soll denselben Typ liefern wie andere PCs → `{ type: 'pc', label: 'PC / Laptop', icon: 'monitor' }`
- Das "Du"-Badge im Frontend markiert den eigenen PC bereits visuell
- Alternativ: Gruppierung umbenennen in "Clients" statt "Eigener PC"

### Phase 5: Lokale MAC-Adresse holen (WU-5)

**Skill:** `/fix-bug`

In der WMI-Phase (`network-scanner.js` Zeile 419-433) zusätzlich abfragen:

```powershell
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Virtual*' -and $_.InterfaceDescription -notlike '*Hyper-V*' } | Select-Object -First 1
$adapter.MacAddress
```

### Phase 6: Sortierung verbessern (WU-7)

**Skill:** `/fix-bug`

Innerhalb jeder Gruppe sortieren nach:
1. Vendor (alphabetisch)
2. Modellname (alphabetisch)
3. IP-Adresse (numerisch, nicht als Text)

---

## Benötigte Skills

| Skill | Zweck | Status |
|-------|-------|--------|
| `/deep-analyze` | Wurzelursachen identifizieren | Erledigt |
| `/fix-bug` | Jede Wurzelursache einzeln beheben | Bereit |
| `/visual-verify` | Nach jedem Fix visuell prüfen | Bereit |
| `/web-research` | Smartphone-Erkennung recherchieren (ARP vs. TCP SYN vs. mDNS) | Bereit |
| `/changelog` | Änderungen dokumentieren | Bereit |

---

## Betroffene Dateien

| Datei | Zeilen | Problem |
|-------|--------|---------|
| `main/network-scanner.js` | 494-521 | Synthetischer Modellname (WU-1, WU-6) |
| `main/network-scanner.js` | 419-433 | WMI holt keine MAC (WU-5) |
| `main/network-scanner.js` | 220-290 | Ping Sweep findet keine Smartphones (WU-3) |
| `main/oui-database.js` | 465-466 | "Eigener PC" Label (WU-4) |
| `main/oui-database.js` | 487-488 | Port 515 = Drucker zu aggressiv (WU-2) |
| `renderer/js/network.js` | 478-486 | Sortierung innerhalb Gruppen (WU-7) |

---

## Prüfkriterien (wann ist das Issue gelöst?)

Simon startet einen Scan und prüft:

- [ ] Zyxel Router: Zeigt KEIN "NAS" mehr, sondern echtes Modell oder leeres Feld
- [ ] Visionscape: Wird NICHT als "Drucker" angezeigt (nur der HP ist ein Drucker)
- [ ] Simons Handy: Erscheint in der Geräteliste
- [ ] Eigener PC: Gruppiert unter "PC / Laptop" (nicht "Eigener PC")
- [ ] Eigener PC: MAC-Adresse wird angezeigt
- [ ] Kein Gerät zeigt "synth" als Erkennungsquelle
- [ ] Geräte innerhalb der Gruppen sinnvoll sortiert

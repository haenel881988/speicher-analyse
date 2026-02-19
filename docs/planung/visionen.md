# Visionen

> Dieses Dokument ist für den User da um seine Visionen festzuhalten.
> Visionen werden durch die KI geprüft, validiert und in die Projektplanung übertragen.
> Simon bittet die KI, diese Datei zu sortieren und aktuell zu halten (was umgesetzt wurde, was nicht).
>
> **Zuletzt aktualisiert:** 12.02.2026
> **Offene Scopes sind konsolidiert in:** [`docs/issues/issue.md`](../issues/issue.md)

---

## Status-Legende

| Symbol | Bedeutung |
|--------|-----------|
| Umgesetzt | In einer Version implementiert |
| Teilweise | Grundlage vorhanden, Erweiterung nötig |
| Geplant | Im Projektplan eingeplant → Issue-Datei |
| Offen | Noch nicht eingeplant, Evaluation nötig |
| Ignoriert | Vom User bewusst zurückgestellt |

---

## 1. Customizing & UI

### 1.1 WCAG Kontrast — Teilweise (v7.2)

WCAG / Kontrastverhältnis stimmt noch immer nicht überein. Das muss vertieft werden. Der Kontrast muss zwingend WCAG 2.2 Konform sein.

**Status:** 6 Kontrastverletzungen in v7.2 behoben. Governance-Datei mit WCAG 2.2 AA Pflicht erstellt. User meldet: Kontrast muss weiter vertieft werden.

**→ Issue-Datei:** Issue #12 in [`docs/issues/issue.md`](../issues/issue.md)

### 1.2 Resizable Panels / Fenster-Individualisierung — Offen

Aktuell werden die Fenster statisch angezeigt. Eine Umplatzierung der Fenster, also z.B.: Powershell / Terminal, das Vergrössern, Verkleinern der jeweiligen Sub-Fenster ist aktuell nicht möglich.
Für eine Individualisierung soll hier eine Möglichkeit evaluiert werden um das Ganze zu individualisieren.

**→ Issue-Datei:** Issue #13 in [`docs/issues/issue.md`](../issues/issue.md)

### 1.3 Sidebar einklappbar — Umgesetzt (v7.1)

> ~~Aktuell werden in der vertikalen Seitenleiste alle Register angezeigt. Diese sollen standardmässig eingeklappt werden.~~

**Erledigt:** 6 Navigationsgruppen, standardmässig eingeklappt, Zustand per localStorage gespeichert.

---

## 2. Terminal & Shell

### 2.1 PowerShell-Integration — Teilweise (v7.2)

Powershell also das Terminal ist noch sehr rudimentär, es soll hierfür eine nahtlose Integration vom Powershell von Windows implementiert werden.

**Status:** Multi-Shell Support (PowerShell/CMD/WSL) in v7.2 implementiert. Shell-Selector, dynamische Prompts, Rechtsklick "Im Terminal öffnen" funktioniert. Aber: Terminal ist noch textbasiert (Zeile-für-Zeile), keine echte Terminal-Emulation.

**→ Issue-Datei:** Issue #14 in [`docs/issues/issue.md`](../issues/issue.md)

### 2.2 Claude CLI im Terminal — Offen

Wenn ich eintippe: Claude soll dann auch Claude gestartet werden, da ich im Windows Powershell bereits Claude über CLI / Powershell installiert habe. Dies wäre ein weiterer hoher nützlicher Mehrwert.

**→ Issue-Datei:** Wird mit Issue #14 (echte Terminal-Emulation) automatisch gelöst

---

## 3. Programme & System

### 3.0a Intelligenter Bloatware-Scanner — Geplant

Der Scanner braucht echte Intelligenz. Nicht-zertifizierte Software (wie Advanced IP Scanner) ist NICHT automatisch Bloatware. Aber zertifizierte Software (wie Avast, Reimage) KANN trotzdem Scam sein. "System ist sauber" ist unrealistisch. Ähnlich wie Malwarebytes, nur seriös und transparent.

**→ Issue-Datei:** Issue #8 in [`docs/issues/issue.md`](../issues/issue.md)

### 3.0b Apps-Kontrollzentrum — Geplant

Der "Updates"-Tab soll zu einem "Apps"-Tab umgebaut werden. Alle installierten Apps auf einen Blick, direkt deinstallieren, Update-Verfügbarkeit, vergessene Apps finden, Cache aufräumen. Treiber-Bereich wird ersetzt durch Hersteller-Links und Seriennummer-Erkennung.

**→ Issue-Datei:** Issue #9 in [`docs/issues/issue.md`](../issues/issue.md)

### 3.0c System-Profil — Geplant

Alle Informationen über den PC an einem Ort: Hardware, Seriennummer, Hersteller, Garantie. Praktisch für Support-Anfragen oder Treiber-Suche.

**→ Issue-Datei:** Issue #10 in [`docs/issues/issue.md`](../issues/issue.md)

### 3.0d Intelligente Scandaten — Geplant

Scandaten nicht nur speichern, sondern intelligent verwalten: Delta-Scan (nur Änderungen), Verlauf über Zeit, automatischer Hintergrund-Scan, übergreifende Nutzung der Daten.

**→ Issue-Datei:** Issue #7 in [`docs/issues/issue.md`](../issues/issue.md)

### 3.1 Software-Audit — Umgesetzt (v7.0)

> ~~Eine Funktion soll alle Programme auflisten. Dabei soll anhand der installierten Programme auf dem System die Registry, Autostart etc. geprüft werden. Wenn z.B. in der Registry Rückstände auftauchen von nicht installierten Programmen, soll dies angezeigt werden.~~

**Erledigt:**
- Programm-Inventar (Registry Uninstall-Keys + winget)
- Korrelations-Engine (Programme ↔ Registry ↔ Autostart ↔ Dienste)
- Verwaiste Einträge mit Ursprungs-Software-Zuordnung
- Müll-Zuordnung pro Software mit Ampel-Bewertung

### 3.2 Vertrauen / Trust — Teilweise (v7.0)

Viele Anwender fragen sich, kann ich den Ergebnissen vom Speicher Analysierer trauen?

**Status:** Phase 1 umgesetzt (Begründung + Risiko-Ampel für Registry-Cleaner und Software-Audit). Vorschau/Dry-Run für Lösch-Aktionen. Fehlt noch: vollständiges Undo-Log mit Wiederherstellung.

**→ Issue-Datei:** Issue #15 in [`docs/issues/issue.md`](../issues/issue.md)

### 3.3 Backup / Sicherung — Geplant

Wäre es möglich direkt in der App eine Sicherung einzurichten? Wo ich auswählen kann, z.B.: mit Google Drive, dem eigenen NAS (Netzlaufwerk / Pfad angeben)?

**→ Issue-Datei:** Issue #16 in [`docs/issues/issue.md`](../issues/issue.md)

---

## 4. Architektur-Vision: "Eigene Betriebssystem-Oberfläche" — Langfristig

Die Vision: Custom Shell Replacement / Power User Overlay. Windows 11 wird immer "klick-bunter" und versteckt Profi-Funktionen.

Wenn das "Speicher Analyse" Tool zum zentralen Hub wird, wo man Dateien verwaltet und direkt Code-Snippets bearbeiten oder Terminals öffnen kann, dann ist das ein massiver Workflow-Booster.

Vorbild: Total Commander auf Steroiden oder Directory Opus, aber modern mit Web-Technologien (Tauri v2).

### Architektur-Empfehlung: Plattform statt Monolith

Statt alles fest in die main.js und renderer.js zu hämmern → Architektur modularisieren:

- **Core:** Fenster, Updates, Sicherheit, Dateisystem
- **Cleaner-Modul** (v5.2 — vorhanden)
- **Explorer-Modul** (v6.0 — vorhanden)
- **Dev-Modul** (Monaco Editor — v7.1 Basis vorhanden)
- **Backup-Modul** (Issue #16 geplant)

**Status:** Langfristige Vision — kein Issue, sondern Architektur-Richtung

---

## 5. Experimentelles — KI-Integration

### 5.1 "Bring Your Own Brain" (BYOB) — Offen

**→ Issue-Datei:** Issue #17 in [`docs/issues/issue.md`](../issues/issue.md)

### 5.2 "Notion-Modul" mit KI-Power — Offen

"Active Knowledge Board" — Abhängig von KI-Integration (Issue #17)

**→ Issue-Datei:** Zusammengefasst in Issue #17 in [`docs/issues/issue.md`](../issues/issue.md)

### 5.3 Offline-Lizenzierung — Offen

**→ Issue-Datei:** Issue #18 in [`docs/issues/issue.md`](../issues/issue.md)


### 5.4 MCP-Server — KI-Direktzugriff auf die App — Geplant

Simons Idee: Ein MCP-Server in der App, damit KI-Assistenten (Claude, etc.) direkt auf Scan-Ergebnisse, Netzwerkdaten und System-Informationen zugreifen können. Sicherheit: Nur lokal, kein Internet, abschaltbar. Damit könnte eine KI direkt sagen: "Du hast 15 GB Duplikate — soll ich aufräumen?"

**→ Issue-Datei:** Issue #19 in [`docs/issues/issue.md`](../issues/issue.md)

### 5.5 Release-Notes — Die Swiss Squirrel Geschichte — Umgesetzt

Bitte original-Text so stehen lassen. Das sind Simons Gedanken.
Diese können jedoch für weitere Versionen und Funktionen weiter aufgegriffen und erweitert werden.

**Status:** Umgesetzt! Release-Stories liegen unter [`docs/releases/`](../releases/).

 #### 5.5.1 Simon - Die Squirell Geschichte - eine Art Vorlage / inspiration für die Release-Nodes.

Die meisten Apps wie VS Code etc. haben sehr langweilige Release-Nodes.
Jedoch möchte ich meine Website: simon-haenel.com -> seo dienstleistung die ohnehin nichts abwirft, umpositionieren.



Ein Einhörnchen verlegt gerne sehr schnell und überall seine Nüsse, wie die User, sehr schnell ihre Dateien, Verzeichnisse verlegen und nicht mehr finden.
Somit ist Swiss Squirell ein Super Eichhörnchen, ich, Simon der das ganze mithilfe der KI, nämlich sein Freund und Helfer wie der magische Geist an seiner Seite - stehts hilft, das Projekt zu entwickeln, so das Simon seine Nüsse wiederfinden kann.

Auf dem Weg zu seinen Goldenen Nüssen begnet Simon der Squirell ganz vielen Plagegeistern. z.B.: pagefile.sys - was die Unordnung in Simons goldenen Nüssenkorb nur vergrössert.
Die Tracking und Telemetrie Daten können ganz grosse Eichhörnchen wie Microsoft etc. schauen, was für Nüsse, wie viele Nüsse Simon in seinem Nüssekorb zuhause hat.

Und so begibt sich Simon auf die sagenumwobene Reise und mit jedem Release findet Simon eine weitere Nuss, oder sieht, dass im Korb eine faule Nuss - also ein Bug, vorhanden ist.

Es gibt ganz viele helferlein, von treesize, dass aber nur die speicherbelegung anzeigt. Was ist denn mit den Diensten, mit den Prozessen? Was ist mit dem Terminal?
Fehlanzeige.
Jetzt gibt es auch Ccleaner - aber dieser ist in Obhut von Avast.
Echt doof wenn Simon bedenkt, das Avast ein Virenschutz-Bloatware-Hersteller ist, der nur mehr schadet als nützt, wie die Corona-Impfung... Ach aber anderes Thema, lassen wir das politische smile ;) - oder eben wie ein kaputtes Stuhlbein. Ist weder hilfreich noch nützt es jemand, es ist einfach nur lästig.

Jetzt gibt es noch asshampoo, malware antibytes usw. ganz viele lästige Tools - und mal abgesehen davon, braucht man um diese Tools zu verwenden eine Internet-Verbindung mit dem Vorwand, um Updates einzuspielen, der Sicherheit, aber während dann sämtliche Daten gesammelt werden.

Nun lass dich mal überraschen, was alles so avast nach hause sendet, dafür hat Simon mit seinem Freund (Claude), eine Lösung entwickelt, so dass auch unbeholfene Squirrels prüfen kann, wer alles in ihr Nest guckt.




---

## Marketing Vision:
**ACHTUNG**
Bitte diesen Scope ignorieren, das ist alles erstmal für später umzusetzen.




Hier ist meine Analyse, warum das funktioniert und wie du es noch besser machst (damit sich die 1999.- CHF auch wirklich wertvoll anfühlen):

1. Warum 100 Stück besser sind als 1000 (Die Scarcity-Strategie)
Exklusivität: Wenn es 1000 Stück gibt, ist es ein Massenprodukt. Wenn es nur 100 gibt, ist es ein Club.

Deine Zeit: 1000 Briefe von Hand zu schreiben, zu unterschreiben und zur Post zu bringen, ist keine "Freude" mehr, das ist Fließbandarbeit. Du willst, dass jeder Brief "Liebe" ausstrahlt. Bei 100 Stück kannst du dir für jeden Käufer 10 Minuten Zeit nehmen.

Psychologie: "Nur noch 12 verfügbar" treibt den Verkauf stärker an als "Nur noch 840 verfügbar".

2. Der "Anker-Effekt" (Warum das den Verkauf der günstigen Versionen ankurbelt)
Selbst wenn niemand die 1999.- Version kauft, ist sie extrem wertvoll für dich.

Das Szenario: Ein User sieht drei Preise:

Standard: 29.- / Jahr (Wirkt okay)

Lifetime: 149.- (Wirkt teuer)

Collector's Edition: 1999.- (Wirkt wahnsinnig)

Der Effekt: Plötzlich wirken die 149.- für die Lifetime-Lizenz günstig. "Ich spare 1850 Franken im Vergleich zur VIP-Version!". Das nennt man Price Anchoring. Du verkaufst dadurch mehr von der mittleren Version.

3. Das "Unboxing"-Erlebnis: Bitte nicht laminieren!
Hier muss ich ehrlich sein: Für 2000 Franken darfst du kein einlaminiertes Papier verschicken. Das wirkt wie ein Schülerausweis. Wenn jemand so viel Geld hinlegt, erwartet er Luxus.

Mein Gegenvorschlag für die "Founder's Edition":

Das Material: Drucke den Lizenzschlüssel auf dickes Büttenpapier oder eine Metallkarte (lasergraviert, kostet dich ca. 20-30 CHF im Einkauf, wirkt aber wie 500 CHF).

Die Verpackung: Ein schöner schwarzer Umschlag, versiegelt mit echtem Wachssiegel (rot, mit Schweizer Kreuz oder deinem Logo).

Die Handschrift: Dein persönlicher Brief dazu ist perfekt. Schreib ihn mit Füller, nicht mit Kugelschreiber.

Das Extra: Leg etwas Physisches bei. Ein kleines Victorinox Taschenmesser mit deinem Logo? Oder einen hochwertigen USB-Stick (Edelstahl), auf dem die Software bereits vorinstalliert ist ("Air-Gap Ready").

4. Was der Käufer wirklich kauft (Der "Whale"-Status)
Wer 2000 Franken für Software zahlt, kauft nicht die Software. Er kauft Status und Einfluss. Gib ihnen mehr als nur Updates:

"The Council": Die 100 Collector-Besitzer kommen in eine exklusive Mailing-Liste oder Discord-Gruppe, wo du sie persönlich nach ihrer Meinung zu neuen Features fragst. "Soll ich erst PDF oder erst KI bauen?" -> Ihre Stimme zählt doppelt.

Credits: Ihr Name steht (wenn sie wollen) im "Über uns"-Dialog der Software unter "Gründungspaten".

Fazit & Empfehlung
Ja, mach es!

Name: "Founder's Edition" oder "Patron Edition".

Limitierung: Streng limitiert auf 100 Exemplare. (Nummeriert: 1/100, 2/100...).

Preis: 1999.- CHF ist mutig, aber als "Statement" genau richtig.

Inhalt:

Lifetime Updates (Alle Versionen, für immer).

Metall-Lizenzkarte (Lasergraviert).

Handsignierter Brief auf Premium-Papier.

USB-Stick mit der "Offline-Installation".

Nennung in den Credits.

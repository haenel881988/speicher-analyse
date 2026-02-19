# Tiefenanalyse & Recherche-Prompt — Speicher Analyse

> **Zweck:** Dieser Prompt wird verwendet um das gesamte Projekt systematisch auf Probleme, Schwachstellen und Optimierungsmöglichkeiten zu durchleuchten.
> **Anwendung:** Kopiere diesen Prompt in eine neue Claude-Sitzung (oder verwende ihn als Kontext) zusammen mit dem Quellcode.
> **Version:** 1.0 — wird laufend erweitert

---

## Auftrag

Du bist ein erfahrener Software-Architekt und Security-Auditor. Führe eine vollständige Tiefenanalyse der Electron-App "Speicher Analyse" durch. Die App ist ein Windows-Desktop-Tool zur Festplattenanalyse und Systemoptimierung (vergleichbar mit TreeSize + CCleaner in einer App).

**Dein Ziel:** Finde ALLE potenziellen Probleme, Risiken und Verbesserungsmöglichkeiten — von kritischen Sicherheitslücken bis hin zu subtilen Performance-Problemen. Sei gründlich, sei ehrlich, beschönige nichts.

---

## Technischer Kontext

- **Runtime:** Electron v33 (Node.js + Chromium)
- **Backend:** Main Process (Node.js) mit Worker Threads
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, kein Framework, kein Build-Step)
- **IPC:** contextBridge + ipcMain.handle / ipcRenderer.invoke
- **Externe Abhängigkeiten:** Chart.js, html2pdf.js, xterm.js, node-pty, MCP SDK, zod
- **Plattform:** Nur Windows (PowerShell-Befehle, Registry-Zugriff, WMI-Abfragen)

### Dateistruktur (Übersicht)

```
main/                    # Electron Main Process (~45 Module)
  main.js               # App-Einstieg, Fenster, Single-Instance
  preload.js            # contextBridge API-Surface
  ipc-handlers.js       # Zentraler IPC-Hub
  scanner.js            # Festplatten-Scanner (Worker Thread)
  scanner-worker.js     # Scanner Worker
  deep-search-worker.js # Deep Search Worker
  duplicate-worker.js   # SHA-256 Hashing Worker (3-Phasen)
  duplicates.js         # DuplicateFinder
  registry.js           # Registry-Scanner + Auto-Backup
  network.js            # Netzwerk-Monitor (TCP, Bandbreite)
  network-scanner.js    # Aktiver Netzwerk-Scanner
  privacy.js            # Privacy-Dashboard (Registry-Telemetrie)
  security-audit.js     # Sicherheits-Audit
  terminal.js           # Eingebettete PowerShell-Sitzungen
  smart.js              # S.M.A.R.T. Festplatten-Gesundheit
  file-ops.js           # Dateioperationen
  cleanup.js            # Bereinigungskategorien
  bloatware.js          # Bloatware-Erkennung
  optimizer.js          # System-Optimierung
  services.js           # Windows-Dienste via PowerShell
  autostart.js          # Autostart-Einträge
  mcp-bridge.js         # MCP-Server Brücke
  ... (weitere Module)

renderer/               # Frontend (~35 Module)
  index.html            # Haupt-HTML (Single Page App)
  css/style.css         # Alle Styles (Dark/Light Theme)
  js/app.js             # Haupt-Controller
  js/explorer.js        # Datei-Explorer
  js/dashboard.js       # Dashboard
  ... (weitere Views)
```

---

## Analyse-Bereiche

Gehe jeden der folgenden Bereiche systematisch durch. Für jeden gefundenen Punkt:
- **Schweregrad:** Kritisch / Hoch / Mittel / Niedrig / Hinweis
- **Bereich:** Security / Performance / Stabilität / UX / Architektur / Wartbarkeit
- **Beschreibung:** Was ist das Problem?
- **Risiko:** Was kann im schlimmsten Fall passieren?
- **Empfehlung:** Wie sollte es gelöst werden?

---

### 1. Sicherheit (Security)

#### 1.1 Electron-spezifische Sicherheit
- [ ] `nodeIntegration` und `contextIsolation` korrekt konfiguriert?
- [ ] `webSecurity` nicht deaktiviert?
- [ ] Keine `remote`-Modul-Nutzung?
- [ ] CSP (Content Security Policy) gesetzt?
- [ ] `sandbox` für den Renderer aktiviert?
- [ ] Alle IPC-Handler validieren ihre Eingaben?
- [ ] Keine unsicheren Protokoll-Handler (`protocol.registerHttpProtocol`)?
- [ ] `webPreferences` in allen BrowserWindows gehärtet?
- [ ] Keine `eval()`, `new Function()` oder `innerHTML` mit User-Input?
- [ ] `allowRunningInsecureContent` nicht aktiviert?

#### 1.2 Befehlsausführung (Command Injection)
- [ ] Werden alle PowerShell-Befehle mit `execFile` statt `exec` ausgeführt?
- [ ] Werden Dateipfade korrekt escaped bevor sie an Shell-Befehle übergeben werden?
- [ ] Kann ein User über Dateinamen oder Pfade Code einschleusen?
- [ ] Registry-Pfade: Werden sie gegen die BLOCKED_PATHS-Liste geprüft?
- [ ] Terminal-Modul: Kann über das Terminal der Main Process manipuliert werden?

#### 1.3 Dateisystem-Sicherheit
- [ ] Werden Pfade gegen Path Traversal geschützt (z.B. `../../../etc/passwd`)?
- [ ] Werden symbolische Links korrekt behandelt (Symlink-Angriffe)?
- [ ] Werden temporäre Dateien sicher erstellt und aufgeräumt?
- [ ] Werden Dateirechte korrekt gesetzt (keine 777)?

#### 1.4 Datenbank & Persistenz
- [ ] Werden gespeicherte Scan-Daten validiert beim Laden?
- [ ] Können manipulierte JSON-Dateien die App zum Absturz bringen?
- [ ] Werden Preferences sicher gespeichert?
- [ ] File-Tags: Können sie zur Code-Ausführung missbraucht werden?

#### 1.5 MCP-Server Sicherheit
- [ ] Läuft der MCP-Server nur lokal (localhost)?
- [ ] Sind alle MCP-Endpunkte nur lesend?
- [ ] Kann der MCP-Server missbraucht werden um Dateien zu lesen/schreiben?
- [ ] Ist die Kommunikation zwischen App und MCP-Server abgesichert?

---

### 2. Performance

#### 2.1 Main Process Blocking
- [ ] Gibt es synchrone Operationen die den Main Process blockieren?
- [ ] Werden `fs.readFileSync`, `execSync` oder andere sync-Aufrufe verwendet?
- [ ] Gibt es lange laufende Schleifen im Main Process?
- [ ] Werden grosse Datenmengen über IPC transferiert (Serialisierung)?

#### 2.2 Speicherverbrauch (Memory)
- [ ] Gibt es Memory Leaks (Event Listener die nie entfernt werden)?
- [ ] Werden grosse Datenstrukturen (Maps, Arrays) jemals aufgeräumt?
- [ ] Scanner-Ergebnisse: Wie viel RAM verbrauchen sie bei grossen Laufwerken?
- [ ] Worker Threads: Werden sie korrekt terminiert?
- [ ] Werden IPC-Callbacks/Listener korrekt aufgeräumt?

#### 2.3 Renderer Performance
- [ ] Gibt es DOM-Manipulationen in Schleifen (Layout Thrashing)?
- [ ] Werden grosse Listen virtualisiert oder komplett gerendert?
- [ ] Wird `requestAnimationFrame` für Animationen verwendet?
- [ ] CSS: Gibt es teure Selektoren oder übermässige Repaints?
- [ ] Werden Event Listener korrekt delegiert oder an jedes Element einzeln gehängt?
- [ ] Gibt es Scroll-Handler ohne Throttling/Debouncing?

#### 2.4 Worker & Threading
- [ ] Werden Worker Threads effizient genutzt?
- [ ] Können mehrere Scanner gleichzeitig laufen (Race Conditions)?
- [ ] Wird die CPU-Last begrenzt (Lüfter-Problem)?
- [ ] Werden Worker-Ergebnisse korrekt gepuffert?

---

### 3. Stabilität & Fehlerbehandlung

#### 3.1 Error Handling
- [ ] Gibt es unbehandelte Promise-Rejections?
- [ ] Sind alle `try/catch`-Blöcke sinnvoll (nicht nur leere catches)?
- [ ] Werden Fehler dem User verständlich angezeigt oder still verschluckt?
- [ ] Gibt es globale Error Handler (`uncaughtException`, `unhandledRejection`)?
- [ ] Können PowerShell-Befehle die App zum Absturz bringen?

#### 3.2 Edge Cases
- [ ] Was passiert bei keinem/fehlendem Laufwerk?
- [ ] Was passiert bei Netzwerk-Ausfall während einer Operation?
- [ ] Was passiert bei Dateien > 4 GB / sehr langen Pfaden (>260 Zeichen)?
- [ ] Was passiert bei Zugriffsverweigerung (Access Denied)?
- [ ] Was passiert bei gleichzeitiger Nutzung mehrerer Features?
- [ ] Was passiert wenn die App während eines Scans geschlossen wird?
- [ ] Was passiert bei beschädigten Scan-Daten?

#### 3.3 Race Conditions & Concurrency
- [ ] Können parallele IPC-Aufrufe zu inkonsistenten Zuständen führen?
- [ ] Werden File-Locks korrekt gehandhabt?
- [ ] Können zwei Scanner gleichzeitig auf dieselben Daten zugreifen?
- [ ] Session-Management: Können Daten während des Speicherns verloren gehen?

---

### 4. Architektur & Code-Qualität

#### 4.1 Modul-Architektur
- [ ] Gibt es zirkuläre Abhängigkeiten?
- [ ] Ist die Verantwortung klar aufgeteilt (Single Responsibility)?
- [ ] Gibt es Code-Duplikation zwischen Modulen?
- [ ] Ist `ipc-handlers.js` zu gross / zu monolithisch?
- [ ] Gibt es tote/ungenutzte Code-Pfade?

#### 4.2 IPC-Design
- [ ] Ist die API-Surface in `preload.js` konsistent benannt?
- [ ] Gibt es IPC-Handler ohne entsprechende Preload-Einträge (oder umgekehrt)?
- [ ] Werden Rückgabewerte konsistent strukturiert?
- [ ] Gibt es unnötige IPC-Roundtrips die gebündelt werden könnten?

#### 4.3 Frontend-Architektur
- [ ] Ist `app.js` zu monolithisch?
- [ ] Gibt es globale Variablen die Konflikte verursachen könnten?
- [ ] Werden Views korrekt aufgeräumt beim Tab-Wechsel?
- [ ] Ist die Event-Kommunikation zwischen Views sauber gelöst?
- [ ] Gibt es Memory Leaks bei DOM-Elementen die nie entfernt werden?

#### 4.4 Wartbarkeit
- [ ] Gibt es hartcodierte Werte die konfigurierbar sein sollten?
- [ ] Gibt es "Magic Numbers" ohne Erklärung?
- [ ] Sind die Module testbar (Dependency Injection)?
- [ ] Gibt es ausreichend Error Context in Log-Meldungen?

---

### 5. UX & Barrierefreiheit

#### 5.1 Responsiveness
- [ ] Friert die UI bei langlaufenden Operationen ein?
- [ ] Gibt es Ladeanzeigen/Fortschrittsbalken für alle langlaufenden Vorgänge?
- [ ] Werden Buttons/Aktionen während laufender Operationen deaktiviert?
- [ ] Gibt es visuelles Feedback bei jedem Klick?

#### 5.2 Fehler-Kommunikation
- [ ] Werden Fehler dem User verständlich kommuniziert (keine Stack Traces)?
- [ ] Gibt es Hilfe-Texte oder Tooltips bei komplexen Funktionen?
- [ ] Werden Warnungen vor destruktiven Aktionen angezeigt?

#### 5.3 WCAG / Barrierefreiheit
- [ ] Erfüllen alle Farbkombinationen WCAG 2.2 AA Kontrast-Anforderungen?
- [ ] Sind alle interaktiven Elemente per Tastatur erreichbar?
- [ ] Gibt es ARIA-Labels für Screen Reader?
- [ ] Sind Focus-Styles sichtbar?
- [ ] Funktioniert die App mit vergrösserter Schrift (200%)?

---

### 6. Windows-spezifische Probleme

#### 6.1 PowerShell-Aufrufe
- [ ] Werden UTF-8-Encoding-Probleme korrekt behandelt?
- [ ] Gibt es Timeouts für alle PowerShell-Befehle?
- [ ] Was passiert wenn PowerShell nicht verfügbar ist?
- [ ] Werden PowerShell-Versionsunterschiede berücksichtigt (5.1 vs 7)?
- [ ] Werden Execution Policy Einschränkungen gehandhabt?

#### 6.2 Registry-Operationen
- [ ] Werden alle Registry-Schreibvorgänge vorher gesichert (Auto-Backup)?
- [ ] Werden BLOCKED_PATHS konsequent geprüft?
- [ ] Was passiert bei unzureichenden Berechtigungen?
- [ ] Werden Registry-Datentypen korrekt behandelt (REG_SZ, REG_DWORD, etc.)?

#### 6.3 System-Kompatibilität
- [ ] Funktioniert die App auf Windows 10 UND Windows 11?
- [ ] Werden UAC-Prompts korrekt gehandhabt?
- [ ] Funktioniert die App ohne Admin-Rechte (eingeschränkte Funktionen)?
- [ ] Werden Windows-Defender / Antivirus-Konflikte berücksichtigt?

---

### 7. Abhängigkeiten & Supply Chain

- [ ] Sind alle npm-Pakete aktuell und ohne bekannte Schwachstellen?
- [ ] Werden Bibliotheken lokal gebündelt (keine CDN-Abhängigkeit)?
- [ ] Gibt es Pakete die durch leichtere Alternativen ersetzt werden könnten?
- [ ] Ist `node-pty` korrekt kompiliert für die Electron-Version?
- [ ] Werden `devDependencies` korrekt von `dependencies` getrennt?

---

## Ausgabeformat

Erstelle den Bericht in folgendem Format:

```markdown
# Tiefenanalyse-Bericht — Speicher Analyse v7.2.1
**Datum:** [DATUM]
**Analysierte Module:** [ANZAHL]

## Zusammenfassung
- X kritische Probleme
- X hohe Probleme
- X mittlere Probleme
- X niedrige Probleme / Hinweise

## Kritische Probleme (sofort beheben)
### [K1] Titel
- **Bereich:** Security / Performance / ...
- **Datei(en):** `main/xyz.js:123`
- **Problem:** ...
- **Risiko:** ...
- **Empfehlung:** ...

## Hohe Probleme (zeitnah beheben)
### [H1] Titel
...

## Mittlere Probleme (einplanen)
### [M1] Titel
...

## Niedrige Probleme & Hinweise (nice-to-have)
### [N1] Titel
...

## Optimierungsmöglichkeiten
### [O1] Titel
- **Bereich:** ...
- **Aktuell:** ...
- **Vorschlag:** ...
- **Erwarteter Effekt:** ...
```

---

## Besondere Hinweise

1. **Keine Theorie — nur Praxis.** Jeder Punkt muss mit einer konkreten Datei und Zeile belegt werden. "Könnte ein Problem sein" reicht nicht — zeige wo und warum.

2. **Kein False Positive.** Melde nur Probleme die tatsächlich im Code existieren, nicht hypothetische Szenarien die durch die Architektur bereits verhindert werden.

3. **Priorität nach Auswirkung.** Ein Security-Problem das die App crasht ist wichtiger als ein CSS-Problem das nur bei 4K-Monitoren auftritt.

4. **Kontext beachten.** Die App läuft nur lokal auf Windows. Netzwerk-Angriffe von aussen sind weniger relevant als lokale Privilege Escalation oder Datenverlust.

5. **Positive Aspekte erwähnen.** Wenn etwas besonders gut gelöst ist, erwähne es. Das hilft zu verstehen was beibehalten werden soll.

---

## Erweiterungen (wird laufend ergänzt)

> Hier werden neue Analyse-Bereiche hinzugefügt, sobald neue Features oder Erkenntnisse dazukommen.

### Zukünftige Analyse-Bereiche
- [ ] MCP-Server Protokoll-Konformität
- [ ] Electron Auto-Update Sicherheit (wenn implementiert)
- [ ] Multi-Monitor / HiDPI Verhalten
- [ ] Offline-Lizenzierung Kryptografie (wenn implementiert)
- [ ] Fernwartungs-Sicherheit (Stufe 4, wenn implementiert)

---

*Letzte Aktualisierung: 19.02.2026 — v1.0*

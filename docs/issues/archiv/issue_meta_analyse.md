# Meta-Analyse: Warum sind 103+ Probleme im Code? (16.02.2026)

> **Frage:** Die App hat 103+ Probleme (Security, Performance, Memory Leaks, 50+ Stubs).
> Wie sind diese entstanden? Welche Steuerungsdokumente, Skills und Prozesse haben versagt?
> Was muss sich ändern, damit das nicht wieder passiert?

---

## Zusammenfassung

| Wurzelursache | Betroffene Probleme | Schwere |
|---------------|---------------------|---------|
| **W1: Skills sind für Electron geschrieben, App ist Tauri** | ALLE 103+ Probleme | Kritisch |
| **W2: Keine Security-Regeln für Rust/PowerShell** | 10 Command Injections, 5 Path Traversals | Kritisch |
| **W3: Skill-Templates erzeugen unsicheren Code** | 16+ XSS-Stellen | Kritisch |
| **W4: Kein Stub-Management** | 50+ Fake-Funktionen | Hoch |
| **W5: Audit-Skill ist zu oberflächlich** | Probleme wurden nicht erkannt | Hoch |
| **W6: governance.md ist Electron-spezifisch** | Regeln greifen nicht für Tauri | Mittel |
| **W7: Kein zentrales Escape-Utility vorgeschrieben** | 4x escapeHtml dupliziert, 16+ XSS | Mittel |
| **W8: Keine ARIA/Accessibility in Templates** | 0 ARIA-Attribute in 34 JS-Dateien | Mittel |
| **W9: Keine Memory-Leak-Prävention** | 12+ Leaks (Timer, Listener) | Mittel |

---

## W1: Skills sind für Electron geschrieben — App ist Tauri v2 (KRITISCH)

### Das Problem

Die App wurde im Februar 2026 von Electron auf Tauri v2 migriert. Aber **9 von 13 Skills** geben noch Electron-Anweisungen. Claude folgt diesen Skills und generiert Code nach Electron-Mustern — der im Tauri-Kontext falsch, unsicher oder wirkungslos ist.

### Beweis: Welcher Skill referenziert was

| Skill | Referenziert (FALSCH für Tauri) | Sollte referenzieren |
|-------|-------------------------------|---------------------|
| `/add-ipc` | `main/ipc-handlers.js`, `main/preload.js`, `contextBridge`, `ipcMain.handle` | `src-tauri/src/commands.rs`, `renderer/js/tauri-bridge.js`, `lib.rs` |
| `/new-feature` | `main/preload.js`, `main/ipc-handlers.js`, `require()`, `module.exports` | `commands.rs`, `tauri-bridge.js`, `#[tauri::command]` |
| `/add-sidebar-tab` | `main/preload.js`, `main/ipc-handlers.js` | `commands.rs`, `tauri-bridge.js` |
| `/deep-analyze` | `Main→IPC→Preload→Renderer` Datenfluss | `Frontend→tauri-bridge→invoke→commands.rs→ps.rs` |
| `/fix-bug` | `main/preload.js`, `main/ipc-handlers.js` | `commands.rs`, `tauri-bridge.js` |
| `/powershell-cmd` | `main/cmd-utils.js`, `runPS()`, `require()` | `src-tauri/src/ps.rs`, `run_ps()`, `run_ps_json()` |
| `/audit-code` | `nodeIntegration`, `contextIsolation`, `GPU Cache`, `preload.js` | `withGlobalTauri`, `capabilities`, `CSP in tauri.conf.json` |
| `/changelog` | `package.json` Version | `Cargo.toml` + `tauri.conf.json` Version |
| `/git-release` | `package.json` Version | `Cargo.toml` + `tauri.conf.json` Version |

### Konsequenz

- Claude bekommt von den Skills **falsche Architektur-Anweisungen**
- Neue Features werden nach Electron-Muster erstellt (das in Tauri nicht existiert)
- Sicherheitsregeln aus den Skills (z.B. `contextIsolation: true`) sind für Tauri irrelevant
- Die echten Tauri-Sicherheitsmechanismen (Capabilities, CSP in tauri.conf.json) werden von keinem Skill erwähnt

### Lösung

Alle 9 Skills müssen auf Tauri v2 aktualisiert werden. Der `/add-ipc` Skill muss zu `/add-tauri-command` werden:
- Statt `main/ipc-handlers.js` → `src-tauri/src/commands.rs`
- Statt `main/preload.js` → `renderer/js/tauri-bridge.js`
- Statt `contextBridge` → `#[tauri::command]` + `invoke()`
- Statt `require()` → `use crate::...`

---

## W2: Keine Security-Regeln für Rust/PowerShell-Interpolation (KRITISCH)

### Das Problem

Die `governance.md` sagt korrekt:

> **Command Injection:** Immer `execFile` mit Array-Args, nie String-Interpolation in Shell-Befehle

Aber diese Regel ist **Node.js-spezifisch** (`execFile` ist eine Node.js-Funktion). Für Rust/Tauri gibt es **keine entsprechende Regel**. Das Ergebnis: 10 Command-Injection-Stellen in `commands.rs`, wo `format!()` mit User-Parametern direkt in PowerShell-Strings eingesetzt wird.

### Beweis

`governance.md:50-51`:
```
Command Injection: Immer execFile mit Array-Args, nie String-Interpolation in Shell-Befehle
```

`CLAUDE.md` (Technische Regeln):
```
PowerShell: Immer crate::ps::run_ps() / run_ps_json()
```

**Was fehlt:** Keine Regel sagt "Parameter MÜSSEN vor dem Einsetzen in format!() escaped werden" oder "Verwende `.replace("'", "''")`". Die CLAUDE.md schreibt vor, `run_ps()` zu verwenden — aber schweigt darüber, dass die Parameter escaped werden müssen.

### Konsequenz

Claude generiert Code wie:
```rust
crate::ps::run_ps(&format!("Start-Service '{}'", name)).await?;
```
...ohne Escaping, weil keine Regel das vorschreibt.

### Fehlende Regeln (müssen ergänzt werden)

1. **Rust-PowerShell-Escaping:** Jeder Parameter, der in `format!()` für PowerShell eingesetzt wird, MUSS mit `.replace("'", "''")` escaped werden
2. **IP-Validierung:** IP-Adressen müssen mit Regex validiert werden, bevor sie in PowerShell verwendet werden
3. **Path-Validierung:** Dateipfade vom Frontend müssen gegen eine Whitelist oder den Scan-Root geprüft werden
4. **Whitelist-Validierung:** Enum-artige Parameter (direction: "Inbound"/"Outbound") müssen per Whitelist geprüft werden

---

## W3: Skill-Templates erzeugen unsicheren Code (KRITISCH)

### Das Problem

Die Skills `/new-feature` und `/add-sidebar-tab` enthalten Code-Templates, die **XSS-anfällig** sind. Jedes Feature, das mit diesen Skills erstellt wird, erbt die Schwachstelle.

### Beweis

`/new-feature` SKILL.md, Abschnitt "Renderer-View":
```javascript
renderError(msg) {
    if (!this.el) return;
    this.el.innerHTML = `<div class="error-message">${msg}</div>`;
}
```

`/add-sidebar-tab` SKILL.md, Abschnitt "View-Klasse":
```javascript
container.innerHTML = `<div class="error-message">Fehler: ${err.message}</div>`;
```

**Beide Templates setzen unescapte Strings in innerHTML.** Wenn `msg` oder `err.message` HTML-Sonderzeichen enthält (z.B. ein Dateipfad mit `<` oder eine PowerShell-Fehlermeldung mit `>`), wird HTML injiziert.

### Konsequenz

Jedes Feature, das mit `/new-feature` oder `/add-sidebar-tab` erstellt wurde, hat ein XSS-Problem. Im Audit gefunden: **16+ innerHTML-Stellen mit unescaptem Input** — alle folgen exakt dem Template-Muster aus den Skills.

### Lösung

1. **Templates in Skills fixen:** Statt `innerHTML` mit `${msg}` → `textContent` verwenden oder zentrale `escapeHtml()` importieren
2. **Zentrale Escape-Funktion vorschreiben:** Jeder Skill muss `import { escapeHtml } from './utils.js'` verwenden
3. **Security-Checkliste in jeden Skill einbauen:** "Prüfe: Wird innerHTML mit User-/Backend-Daten verwendet?"

---

## W4: Kein Stub-Management-Prozess (HOCH)

### Das Problem

Die App hat **50+ Stub-Funktionen** in `commands.rs`, die statische Fake-Daten zurückgeben, aber dem Frontend (und damit dem User) "Erfolg" melden. Es gibt keinen Prozess, der:
- Stubs als solche kennzeichnet
- Den User warnt, dass eine Funktion nicht implementiert ist
- Stubs in einer Liste trackt
- Die Fertigstellung priorisiert

### Beweis

Beispiele aus `commands.rs`:
```rust
// apply_privacy_setting — User denkt Telemetrie wird deaktiviert
pub async fn apply_privacy_setting(_id: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))  // TUT NICHTS
}

// set_preference — User denkt Einstellungen werden gespeichert
pub async fn set_preference(_key: String, _value: Value) -> Result<Value, String> {
    Ok(json!({ "success": true }))  // TUT NICHTS
}
```

### Wie die Stubs entstanden sind

Bei der Electron→Tauri-Migration wurden alle 147 API-Methoden als Stubs in `commands.rs` angelegt, um die Bridge funktionsfähig zu halten. Das war eine korrekte Migrationsstrategie. Aber:
- Es gibt kein Tracking-Dokument, das sagt welche Stubs noch fehlen
- `anforderungen.md` listet alle 147 Methoden mit "Status" Feld — aber der Status wurde nie aktualisiert
- Kein Skill prüft, ob eine Funktion ein Stub ist
- Der `/audit-code` Skill sucht nicht explizit nach Stubs

### Lösung

1. **anforderungen.md aktualisieren:** Jede Methode mit Implementierungs-Status (Stub/Implementiert/Teilweise)
2. **Stubs müssen Warnung returnen:** Statt `{ success: true }` → `{ stub: true, message: "Nicht implementiert" }`
3. **Frontend muss Stub-Antworten erkennen:** Toast mit "Diese Funktion ist noch nicht verfügbar"
4. **Priorisierung:** Kritische Stubs (Privacy, Preferences, Session) zuerst implementieren

---

## W5: Audit-Skill ist zu oberflächlich bei "all" (HOCH)

### Das Problem

Der `/audit-code` Skill definiert für den `all`-Modus:

> **Vollständiges Audit (`/audit-code all`):**
> 1. Scanne alle `main/*.js` und `renderer/js/*.js` Dateien
> 2. **Fokussiere auf die häufigsten Problemkategorien:**
>    - Grep nach `execSync`, `readFileSync` (Performance)
>    - Grep nach `innerHTML` ohne Escaping (Security)
>    - Grep nach `execFile('powershell` ohne runPS (Konvention)
>    - Grep nach `animation:` in CSS (Performance)
> 3. Erstelle den Gesamtbericht

**Problem 1:** "Fokussiere auf die häufigsten" → Claude greped nur nach 4 Patterns statt alle Dateien zu lesen
**Problem 2:** Die Pfade sind falsch (`main/*.js` existiert nicht in Tauri)
**Problem 3:** Das grep-Pattern `execFile('powershell` ist Electron-spezifisch

### Konsequenz

Beim ersten Audit-Versuch hat Claude exakt die Skill-Anweisung befolgt und nur 4 grep-Patterns ausgeführt. Ergebnis: 28 Probleme gefunden. Erst nach Simons Feedback ("ALLE Kategorien, nicht nur die häufigsten!") und dem Ignorieren der Skill-Anweisung wurden alle Dateien gelesen und 103+ Probleme gefunden.

### Lösung

Der `/audit-code all` Ablauf muss geändert werden:
1. **ALLE Dateien vollständig lesen** (nicht nur greppen)
2. **ALLE 5 Kategorien auf JEDE Datei anwenden**
3. Dateipfade auf Tauri aktualisieren (`src-tauri/src/` statt `main/`)
4. "Fokussiere auf die häufigsten" Formulierung entfernen

---

## W6: governance.md ist Electron-spezifisch (MITTEL)

### Das Problem

Die `governance.md` enthält technische Regeln, die nur für Electron gelten:

| Zeile | Regel | Problem |
|-------|-------|---------|
| 50 | `execFile` mit Array-Args | Gilt für Node.js, nicht für Rust |
| 51 | `BLOCKED_PATHS` aus `registry.js` | `registry.js` existiert nicht mehr als Backend-Modul |
| 52 | `path.resolve()` für Pfade | Node.js-Funktion, in Rust: `std::path::Path` |
| 70 | Kommunikation über `contextBridge` | Tauri verwendet `invoke()` |
| 71 | `main/preload.js` API-Surface | Existiert nicht in Tauri |
| 72 | `main/ipc-handlers.js` Handler | In Tauri: `commands.rs` |
| 74 | `app.requestSingleInstanceLock()` | Tauri: `tauri-plugin-single-instance` |
| 75 | `--disable-gpu-shader-disk-cache` | Electron-spezifisch |
| 77 | Kein `await` in nicht-async Callbacks | Gilt für alle JS, ist korrekt |

### Lösung

governance.md komplett für Tauri v2 umschreiben. Neue Regeln:
- Tauri Capabilities konfigurieren
- CSP in `tauri.conf.json` setzen (nicht `null`)
- `withGlobalTauri: false` setzen
- `tauri-plugin-single-instance` verwenden
- Parameter in `format!()` immer escapen

---

## W7: Kein zentrales Escape-Utility vorgeschrieben (MITTEL)

### Das Problem

Es gibt mindestens **4 verschiedene Escape-Implementierungen** im Frontend:

| Variante | Dateien | Methode |
|----------|---------|---------|
| `_esc()` als Klassenmethode | privacy.js, network.js, smart.js, software-audit.js, system-profil.js, security-audit.js, settings.js | `String.replace()` Chain |
| `esc()` ohne Null-Check | services.js, autostart.js | `String.replace()` ohne Guard |
| `escapeHtml()` Standalone | bloatware.js, optimizer.js, updates.js | DOM-Trick `textContent→innerHTML` |
| `escapeAttr()` (unvollständig) | updates.js | Escaped nur `"` und `'`, nicht `<`, `>`, `&` |

### Warum das passiert ist

- **Kein Skill schreibt eine zentrale Escape-Funktion vor**
- `utils.js` existiert, aber enthält kein `escapeHtml()`
- Jeder Entwickler (Claude) hat bei jedem Feature seine eigene Variante erstellt
- `/new-feature` und `/add-sidebar-tab` Templates erwähnen `escapeHtml` nicht

### Lösung

1. `escapeHtml()` und `escapeAttr()` in `utils.js` exportieren
2. Alle Skills müssen den Import vorschreiben: `import { escapeHtml } from './utils.js'`
3. Alle bestehenden Duplikate durch den zentralen Import ersetzen

---

## W8: Keine ARIA/Accessibility in Templates (MITTEL)

### Das Problem

**Keine einzige der 34 JavaScript-Dateien** setzt systematisch ARIA-Attribute. Das liegt daran, dass:
- Kein Skill ARIA-Attribute in seinen Templates hat
- governance.md nur "Keyboard-Navigation" und "Tooltips" erwähnt, aber keine ARIA-Spezifika
- `/new-feature` und `/add-sidebar-tab` Templates enthalten kein `role`, kein `aria-label`, kein `aria-expanded`

### Fehlende ARIA-Attribute (Auswahl)

- Tree-View: `role="tree"`, `role="treeitem"`, `aria-expanded`
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`
- Toasts: `role="alert"`, `aria-live="polite"`
- Icon-Buttons: `aria-label`
- Toggle-Switches: `role="switch"`, `aria-checked`
- Score-Ringe: `role="progressbar"`, `aria-valuenow`

### Lösung

1. ARIA-Attribute in alle Skill-Templates einbauen
2. governance.md um ARIA-Regeln erweitern
3. `/audit-code` um ARIA-Prüfung ergänzen

---

## W9: Keine Memory-Leak-Prävention (MITTEL)

### Das Problem

12+ Memory Leaks im Code (Timer, Event-Listener, DOM-Elemente). Skills wie `/new-feature` definieren ein `destroy()` Lifecycle, aber:
- Kein Skill erklärt **wann** `destroy()` aufgerufen werden muss
- Kein Skill erklärt, dass `setInterval` eine ID zurückgibt, die gestoppt werden muss
- Kein Skill warnt vor Event-Listener-Akkumulation bei wiederholtem Aufruf
- `app.js` ruft `deactivate()` nicht konsistent auf allen Views auf

### Betroffene Muster

| Muster | Betroffene Dateien | Problem |
|--------|-------------------|---------|
| `setInterval` ohne `clearInterval` | network.js, app.js | Timer läuft ewig |
| Event-Listener bei jedem Scan neu registriert | duplicates.js | Listener akkumulieren |
| `ResizeObserver` ohne `disconnect()` | treemap.js | Observer läuft ewig |
| Debounce-Timer ohne `cancel()` | search.js | Timer überlebt disable() |
| DOM-Elemente nie entfernt | batch-rename.js | Overlays bleiben im DOM |

### Lösung

1. `/new-feature` Skill um Cleanup-Regeln erweitern:
   - Jeder `setInterval` → ID speichern, in `destroy()` clearen
   - Event-Listener nur einmal registrieren (Flag-Pattern)
   - `ResizeObserver.disconnect()` in `destroy()`
2. CLAUDE.md: Regel "Jeder Timer und Listener muss aufgeräumt werden"
3. `/audit-code`: Memory-Leak-Pattern-Erkennung hinzufügen

---

## Abhängigkeitskette: Ein Problem führt zum nächsten

```
W1 (Skills für Electron)
  ├── W2 (Keine Rust-Security-Regeln) → 10 Command Injections
  ├── W3 (Unsichere Templates) → 16+ XSS
  ├── W5 (Audit greift zu kurz) → Probleme werden nicht erkannt
  └── W6 (governance.md veraltet) → Regeln greifen nicht

W4 (Kein Stub-Management)
  └── 50+ Fake-Funktionen → User wird getäuscht

W7 (Kein zentrales Escape)
  └── 4 verschiedene Implementierungen → Inkonsistenz + XSS

W8 (Keine ARIA in Templates) + W9 (Keine Leak-Prävention)
  └── Strukturelle Qualitätsprobleme die sich bei jedem Feature wiederholen
```

**Die Kernursache ist W1:** Weil die Skills nicht aktualisiert wurden, sind ALLE nachfolgenden Schutzmechanismen wirkungslos. Die Skills sind das Fundament der Codequalität — wenn sie falsch sind, ist alles falsch.

---

## Aktionsplan: Wie verhindern wir das in Zukunft?

### Phase 1: Skills reparieren (SOFORT)

| # | Aktion | Betrifft | Priorität |
|---|--------|----------|-----------|
| A1 | `/add-ipc` → `/add-tauri-command` umschreiben | Neuer Skill | Kritisch |
| A2 | `/new-feature` auf Tauri + Security-Template | SKILL.md | Kritisch |
| A3 | `/add-sidebar-tab` auf Tauri + Security-Template | SKILL.md | Kritisch |
| A4 | `/deep-analyze` Datenfluss auf Tauri | SKILL.md | Kritisch |
| A5 | `/fix-bug` Dateipfade auf Tauri | SKILL.md | Kritisch |
| A6 | `/powershell-cmd` auf Rust/ps.rs | SKILL.md | Kritisch |
| A7 | `/audit-code` "all" = ALLE Dateien lesen | SKILL.md | Hoch |
| A8 | `/changelog` + `/git-release` Version aus Cargo.toml | SKILL.md | Mittel |

### Phase 2: Regeln ergänzen (SOFORT)

| # | Aktion | Datei | Priorität |
|---|--------|-------|-----------|
| B1 | Rust-PowerShell-Escaping-Regel in CLAUDE.md | CLAUDE.md | Kritisch |
| B2 | Path-Validierungs-Regel in CLAUDE.md | CLAUDE.md | Kritisch |
| B3 | governance.md komplett für Tauri umschreiben | governance.md | Hoch |
| B4 | Zentrale `escapeHtml()` in utils.js vorschreiben | CLAUDE.md + Skills | Hoch |
| B5 | ARIA-Mindestanforderungen definieren | governance.md | Mittel |
| B6 | Memory-Leak-Prävention als Regel | CLAUDE.md | Mittel |

### Phase 3: Prozesse einführen (BALD)

| # | Aktion | Beschreibung | Priorität |
|---|--------|-------------|-----------|
| C1 | Stub-Tracking in anforderungen.md | Status pro Methode: Stub/Implementiert | Hoch |
| C2 | Stubs müssen Frontend warnen | `{ stub: true }` statt `{ success: true }` | Hoch |
| C3 | Security-Checkliste in /new-feature | Escaping, Validation, CSP als Pflichtprüfung | Hoch |
| C4 | Migrations-Checkliste erstellen | Bei Framework-Wechsel: Skills + Docs + Governance prüfen | Mittel |

### Phase 4: Prävention (LANGFRISTIG)

| # | Aktion | Beschreibung |
|---|--------|-------------|
| D1 | Automatischer Security-Scan | Grep-basierter Pre-Commit-Check für `format!(...user_input...)` ohne Escaping |
| D2 | Template-Validation | Skills-Templates automatisch auf innerHTML + unescaped Variables prüfen |
| D3 | Regelmäßige Audits | `/audit-code all` vierteljährlich, mit voller Datei-Lesung |

---

## Tiefenanalyse: Exakte Kausalketten (Anweisung → Code-Problem)

Für jede Wurzelursache wird hier der vollständige Pfad nachgezeichnet:
Welche Zeile in welchem Dokument hat welche konkrete Code-Stelle erzeugt?

---

### T1: Von der Skill-Anweisung zur Command Injection (W1 + W2)

**Kausalkette:**

```
1. /powershell-cmd SKILL.md sagt:
   "IMMER runPS() verwenden" (aus main/cmd-utils.js)
   → Regel ist Node.js-spezifisch, in Tauri existiert kein cmd-utils.js

2. CLAUDE.md sagt:
   "PowerShell: Immer crate::ps::run_ps() / run_ps_json()"
   → Korrekte Tauri-Anweisung, ABER: Kein Wort über Escaping der Parameter

3. Keine Regel sagt:
   "Vor format!() müssen User-Parameter mit .replace(\"'\", \"''\") escaped werden"
   → Diese Lücke existiert in CLAUDE.md, governance.md UND allen Skills

4. Claude generiert:
   commands.rs:556 → format!("Start-Service '{}'", name)         ← INJECTION
   commands.rs:574 → format!("Set-Service '{}' ...", name)       ← INJECTION
   commands.rs:624 → format!("Remove-AppxPackage '{}'", pkg)     ← INJECTION
   commands.rs:680 → format!("winget upgrade '{}'", package_id)  ← INJECTION
   commands.rs:840 → format!("Start-Process rundll32.exe ...", file_path) ← INJECTION
   commands.rs:1293 → format!("New-NetFirewallRule ... '{}'", name, prog) ← INJECTION
   commands.rs:1303 → format!("Remove-NetFirewallRule ... '{}'", rule_name) ← INJECTION
   commands.rs:1703 → format!("...ConnectAsync('{}', ...)", ip)  ← INJECTION
   commands.rs:1720 → format!("Get-SmbConnection -ServerName '{}'", ip) ← INJECTION
   commands.rs:1284 → format!("Get-NetFirewallRule -Direction '{}'", dir) ← INJECTION

5. Gleichzeitig existiert korrektes Escaping an ANDEREN Stellen:
   commands.rs:282 → file_path.replace("'", "''")  ← KORREKT (file_properties)
   commands.rs:289 → file_path.replace("'", "''")  ← KORREKT (open_file)
   commands.rs:1069 → task_path.replace("'", "''") ← KORREKT (disable_scheduled_task)

   → Das beweist: Claude KANN escapen, tut es aber nur wenn es zufällig
     daran denkt — weil KEINE systematische Regel es vorschreibt.
```

**Fazit:** 10 Injections entstanden, weil der Escaping-Schritt weder in CLAUDE.md, noch in governance.md, noch in /powershell-cmd vorgeschrieben ist. Es hängt vom Zufall ab, ob Claude escaped oder nicht.

---

### T2: Vom Skill-Template zur XSS-Schwachstelle (W3 + W7)

**Kausalkette:**

```
1. /new-feature SKILL.md definiert dieses Template:
   renderError(msg) {
       this.el.innerHTML = `<div class="error-message">${msg}</div>`;
   }
   → Unescapted Variable in innerHTML = XSS

2. /add-sidebar-tab SKILL.md definiert:
   container.innerHTML = `<div class="error-message">Fehler: ${err.message}</div>`;
   → Gleiche Schwachstelle

3. Claude erstellt neue Views und kopiert das Pattern aus dem Skill:

   services.js:48    → innerHTML = '...Fehler: ' + e.message + '...'        ← KOPIERT
   autostart.js:48   → innerHTML = '...Fehler: ' + e.message + '...'        ← KOPIERT
   bloatware.js:65   → innerHTML = `...Fehler: ${err.message}...`            ← KOPIERT
   optimizer.js:65   → innerHTML = `...Fehler: ${err.message}...`            ← KOPIERT
   cleanup.js:45     → innerHTML = `...Fehler: ${e.message}...`              ← KOPIERT
   registry.js:54    → innerHTML = '...Fehler: ' + e.message + '...'         ← KOPIERT
   charts.js:139     → innerHTML = `...Fehler: ${e.message}...`              ← KOPIERT
   file-manager.js:148 → innerHTML = `...${props.error}...`                  ← KOPIERT
   file-manager.js:167 → innerHTML = `...Fehler: ${e.message}...`            ← KOPIERT
   system-score.js:53 → innerHTML mit ${cat.name}, ${cat.description}        ← KOPIERT

4. Manche Views haben TROTZDEM _esc() — aber nur für MANCHE Felder:
   cleanup.js: cat.paths[].path → this.esc() ✓, aber cat.name → NICHT ✓
   registry.js: entry.name → this.esc() ✓, aber cat.icon → NICHT ✓
   autostart.js: entry.name → this.esc() ✓, aber entry.locationLabel → NICHT ✓

   → Inkonsistenz: Claude escaped wo es "offensichtlich" ist (Dateinamen),
     vergisst es aber bei "Backend-Daten" (cat.name, cat.icon)

5. Parallel dazu: 4 verschiedene Escape-Implementierungen (W7)
   Weil kein Skill eine zentrale Funktion vorschreibt, erfindet Claude
   bei jedem Feature eine neue Variante:
   - privacy.js: _esc() mit String.replace + Null-Check
   - services.js: esc() OHNE Null-Check → crasht bei null
   - bloatware.js: escapeHtml() mit DOM-Trick
   - updates.js: escapeAttr() escaped nur " und ' → unvollständig
```

**Fazit:** Das XSS-Pattern pflanzt sich von den Skill-Templates in jede neue View fort. Kein Skill sagt "Verwende eine zentrale Escape-Funktion", also kopiert Claude das unsichere Pattern oder erfindet eigene Varianten.

---

### T3: Vom Skill-Template zu XSS in showToast (Zentrale Funktion) (W3 + W7)

**Kausalkette:**

```
1. tree.js definiert die zentrale showToast():
   tree.js:409 → toast.innerHTML = `<span class="toast-icon">...</span>
                                     <span class="toast-text">${message}</span>`
   → message wird unescaped in innerHTML gesetzt

2. showToast wird aus VIELEN Dateien mit Backend-Daten aufgerufen:
   app.js:799      → showToast('Fehler beim Aktualisieren: ' + err.message)
   file-manager.js:58 → showToast('Fehler: ' + e.message)
   file-manager.js:116 → showToast('Fehler: ' + e.message)
   cleanup.js       → showToast('Fehler: ' + err.message)
   registry.js      → showToast('Fehler: ' + err.message)

3. Aber ZUSÄTZLICH existieren 3 eigenständige Toast-Implementierungen:
   export.js:62-71  → eigene showToast() mit GLEICHER innerHTML-Schwachstelle
   bloatware.js:190 → eigene Toast-Logik mit innerHTML
   optimizer.js:186 → eigene showToastMsg() mit innerHTML
   charts.js:292    → eigene _showToast() direkt in document.body

4. Warum 4 verschiedene Toast-Versionen?
   → Kein Skill schreibt vor "Verwende die exportierte showToast aus tree.js"
   → /new-feature Template hat keinen Toast-Import
   → Jedes Feature erfindet seine eigene Toast-Funktion
```

**Fazit:** Eine einzige XSS-anfällige Zentral-Funktion (showToast) plus 3 Kopien davon — alle unsicher, weil keine Regel den sicheren Weg vorschreibt.

---

### T4: Von der fehlenden Path-Validierung zu Datenverlust (W2 + W6)

**Kausalkette:**

```
1. governance.md:52 sagt:
   "Dateipfade: Pfade mit path.resolve() auflösen, Sonderzeichen escapen"
   → Node.js-Funktion, in Rust nicht anwendbar

2. CLAUDE.md sagt NICHTS über Pfadvalidierung.
   Keine Regel wie: "Pfade vom Frontend müssen innerhalb des Scan-Root liegen"

3. tauri-bridge.js leitet Pfade ungefiltert weiter:
   deleteToTrash: makeInvoke('delete_to_trash', 'paths')       ← Frontend → Backend
   deletePermanent: makeInvoke('delete_permanent', 'paths')     ← Frontend → Backend
   writeFileContent: makeInvoke('write_file_content', 'file_path', 'content')

4. commands.rs akzeptiert Pfade ohne jede Prüfung:
   commands.rs:224 → delete_permanent(paths: Vec<String>)
                     for p in &paths { tokio::fs::remove_dir_all(path) }
                     → KEINERLEI Validierung. Beliebiger Pfad löschbar.

   commands.rs:436 → write_file_content(file_path: String, content: String)
                     tokio::fs::write(&file_path, &content)
                     → KEINERLEI Validierung. Beliebige Datei überschreibbar.

   commands.rs:395 → clean_category(_category_id: String, paths: Vec<String>)
                     → Pfade werden NICHT gegen die Kategorie validiert.
                       Frontend kann beliebige Pfade zum Löschen senden.

5. GLEICHZEITIG: Explorer Delete in Keyboard-Handler:
   explorer.js:1105 → Shift+Delete: deletePermanent(paths) OHNE Bestätigungsdialog
   explorer.js:1111 → Delete: deleteToTrash(paths) OHNE Bestätigungsdialog

   → Im Kontrast zu file-manager.js, das IMMER einen Dialog zeigt.
   → Kein Skill oder Regel schreibt vor: "Destruktive Operationen brauchen Dialog"
```

**Fazit:** Die governance.md-Regel für Pfadvalidierung ist Electron-spezifisch und wurde nicht für Tauri übersetzt. CLAUDE.md hat keine Pfad-Regel. Das Ergebnis: 5 Backend-Funktionen akzeptieren beliebige Pfade + 2 Frontend-Stellen löschen ohne Bestätigung.

---

### T5: Vom Migrationsprozess zu 50+ Stubs (W4)

**Kausalkette:**

```
1. Electron→Tauri-Migration (Februar 2026):
   - tauri-bridge.js mappt alle 147 window.api.*-Methoden auf invoke()
   - Für jede Methode muss ein #[tauri::command] in commands.rs existieren
   - Ohne den Command würde die App beim Aufruf crashen

2. Migrationsstrategie (KORREKT):
   - Alle 147 Commands als Stubs anlegen: Ok(json!({ "success": true }))
   - Dann schrittweise implementieren

3. Was NICHT passiert ist:
   - anforderungen.md wurde nicht mit Stub/Implementiert-Status aktualisiert
   - Kein Tracking welche Stubs noch offen sind
   - Kein Skill prüft ob eine Funktion ein Stub ist
   - Stubs geben { success: true } zurück → Frontend zeigt "Erfolg" an

4. Die kritischsten Stubs:
   apply_privacy_setting → User denkt Telemetrie wird deaktiviert → TUT NICHTS
   apply_all_privacy → "Ein-Klick Datenschutz" → TUT NICHTS
   set_preference → Einstellungen speichern → TUT NICHTS → gehen bei Neustart verloren
   save_session_now → Sitzung speichern → TUT NICHTS → Scandaten gehen verloren
   export_csv → CSV-Export → gibt "Not implemented" zurück
   clean_registry → Registry bereinigen → TUT NICHTS
   toggle_autostart → Autostart-Eintrag umschalten → TUT NICHTS

5. Das Frontend hat KEIN Stub-Erkennungsmuster:
   - Kein View prüft ob die Antwort { stub: true } enthält
   - Kein View zeigt "Diese Funktion ist noch nicht verfügbar"
   - Alle Views zeigen Erfolg an, egal was das Backend tut

6. Warum kein Skill das fängt:
   - /audit-code prüft auf "Stubs" → aber nur als Nebenbemerkung, nicht als Kategorie
   - /new-feature erstellt NEUE Features, prüft nicht BESTEHENDE
   - /fix-bug sucht Bugs, keine Stubs (Stubs sind kein Bug, sondern fehlendes Feature)
```

**Fazit:** Die Stubs sind ein direktes Ergebnis der Migration. Ohne Tracking-Prozess und ohne Frontend-Erkennung bleibt jeder Stub stumm — der User wird getäuscht.

---

### T6: Vom fehlenden Lifecycle-Management zu Memory Leaks (W9)

**Kausalkette:**

```
1. /new-feature SKILL.md definiert einen Lifecycle:
   init() → loadData() → render() → destroy()
   → ABER: destroy() ist ein leerer Platzhalter:
     destroy() { this.data = null; }
   → Kein Wort über Timer, Listener, Observer

2. /add-sidebar-tab hat KEINEN destroy() Lifecycle:
   → Nur init() und render(), keine Aufräum-Phase

3. app.js hat ein activate/deactivate-Muster:
   → ABER: Nur network.js implementiert deactivate() vollständig
   → Alle anderen Views haben KEIN deactivate()
   → app.js ruft deactivate() nur für network auf

4. Konkrete Leaks die daraus entstanden:

   a) network.js: 3 verschiedene setInterval (Zeilen 176, 1136, 1197)
      - pollInterval (5s), _feedPollInterval (3s), _recordingTimer (1s)
      - deactivate() räumt auf — ABER: Wenn NetworkView-Instanz
        ohne deactivate() zerstört wird → Timer laufen ewig
      - _isRefreshing wird für ZWEI verschiedene Operationen geteilt
        → User-Refresh wird blockiert wenn Auto-Poll läuft

   b) duplicates.js: Event-Listener bei JEDEM Scan neu registriert (Zeile 65-88)
      - onDuplicateProgress, onDuplicateComplete, onDuplicateError
      - Kein Flag-Pattern wie terminal-panel.js es korrekt macht
      - Nach 10 Scans: 10 Listener pro Event → Memory Leak + Mehrfach-Ausführung

   c) treemap.js: ResizeObserver ohne disconnect() (Zeile 14-17)
      - Jede Größenänderung triggert ein vollständiges Re-Render
      - Kein Debounce → schnelles Resize = 50+ API-Aufrufe
      - ResizeObserver wird nie disconnected

   d) app.js: setInterval für Battery-Check (Zeile 233)
      - batteryInterval wird EINMAL berechnet, Intervall läuft endlos
      - Intervall-ID wird nicht gespeichert → kann nie gestoppt werden

   e) batch-rename.js: DOM-Element wird nie entfernt (Zeile 11)
      - document.body.appendChild(this.el) im Konstruktor
      - Keine destroy()-Methode → Overlay bleibt permanent im DOM

5. Warum kein Skill das verhindert:
   → /new-feature Template zeigt destroy() als leere Methode
   → Keine Regel sagt "Jeder setInterval braucht clearInterval in destroy()"
   → Keine Regel sagt "Event-Listener dürfen nur EINMAL registriert werden"
   → /audit-code hat keine Memory-Leak-Kategorie
```

**Fazit:** Das Skill-Template definiert einen Lifecycle, aber der destroy()-Platzhalter enthält keine konkrete Aufräum-Logik. Ohne Regeln für Timer/Listener/Observer-Cleanup wiederholt sich das Pattern bei jedem Feature.

---

### T7: Vom deaktivierten CSP zum offenen XSS-Tor (W1 + W6)

**Kausalkette:**

```
1. index.html definiert eine CSP im Meta-Tag:
   <meta http-equiv="Content-Security-Policy"
     content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...">
   → Erlaubt unsafe-inline und unsafe-eval (für Polyfill + Monaco)

2. ABER: tauri.conf.json überschreibt das:
   "security": { "csp": null }
   → Deaktiviert die CSP KOMPLETT auf Tauri-Ebene

3. Gleichzeitig: withGlobalTauri: true
   → window.__TAURI__ ist im Frontend global verfügbar
   → Jeder eingeschleuste Code kann invoke() direkt aufrufen

4. Warum das passiert ist:
   → /audit-code prüft Electron-Security: "nodeIntegration: false, contextIsolation: true"
   → KEIN Skill prüft Tauri-Security: CSP in tauri.conf.json, withGlobalTauri, Capabilities
   → governance.md erwähnt CSP nicht (nur Electron-Patterns)
   → CLAUDE.md erwähnt CSP nicht

5. Das Zusammenspiel:
   CSP deaktiviert (tauri.conf.json:27)
   + withGlobalTauri (tauri.conf.json:25)
   + 16+ innerHTML-XSS-Stellen (W3)
   + Kein Capabilities-System konfiguriert
   = Eingeschleuster Code hat VOLLEN Zugriff auf ALLE Tauri-APIs
     einschließlich Dateisystem-Operationen, PowerShell-Ausführung,
     Registry-Zugriff
```

**Fazit:** Drei Sicherheitsebenen sind gleichzeitig deaktiviert (CSP, Capabilities, Global-Tauri), und die XSS-Stellen aus W3 sind der Angriffsvektor. Kein Skill oder Dokument prüft die Tauri-spezifische Sicherheitskonfiguration.

---

### T8: Vom fehlenden Timeout zum App-Freeze (W1 + W2)

**Kausalkette:**

```
1. /powershell-cmd SKILL.md sagt:
   "Minimum 30 Sekunden — PowerShell Cold Start dauert 5-10+ Sekunden"
   "runPS() hat standardmäßig 30s Timeout"
   → Bezieht sich auf main/cmd-utils.js (Node.js), NICHT auf ps.rs (Rust)

2. CLAUDE.md sagt:
   "PowerShell: Immer crate::ps::run_ps()"
   → Korrekt, aber KEIN Wort über Timeouts

3. ps.rs implementiert run_ps() OHNE Timeout:
   ps.rs:31 → let output = cmd.output().await.map_err(...)?;
   → Kein tokio::time::timeout() wrapper
   → Ein hängender PowerShell-Prozess blockiert den Command-Handler EWIG

4. ps.rs:12 hat sogar einen Kommentar:
   "30s timeout equivalent"
   → Aber der Timeout ist NICHT implementiert. Nur ein Kommentar.

5. Kritische Stellen die ewig hängen können:
   - scan_local_network() → Netzwerk-Scan mit vielen Geräten
   - check_windows_updates() → COM-Objekt kann hängen
   - deep_search_start() → Rekursive Dateisuche auf großen Laufwerken
   - get_system_profile() → Umfangreiches PS-Script

6. deep_search_cancel() ist ebenfalls ein Stub:
   commands.rs:753 → Ok(json!({ "cancelled": true }))
   → Tut NICHTS — der PowerShell-Prozess läuft weiter
   → Der User drückt "Abbrechen", aber die Suche läuft im Hintergrund weiter
```

**Fazit:** Der /powershell-cmd Skill definiert einen 30s-Timeout — aber für das FALSCHE System (Node.js statt Rust). Die Rust-Implementierung hat keinen Timeout, und kein Dokument fordert einen.

---

### T9: Vom audit-code Skill zum verpassten Audit (W5)

**Kausalkette:**

```
1. Simon fragt: "/audit-code all"

2. Claude liest den Skill und findet:
   "Vollständiges Audit: Fokussiere auf die häufigsten Problemkategorien"
   → 4 grep-Patterns (execSync, innerHTML, execFile('powershell, animation:)

3. Claude führt 4 greps aus. Ergebnis: 28 Probleme.
   → Verpasst: Command Injection in Rust format!() (grep sucht nach Node.js-Pattern)
   → Verpasst: Path Traversal (kein grep-Pattern dafür)
   → Verpasst: Stubs (kein grep-Pattern dafür)
   → Verpasst: Memory Leaks (kein grep-Pattern dafür)
   → Verpasst: CSP-Deaktivierung (kein grep-Pattern dafür)
   → Verpasst: Race Conditions (kein grep-Pattern dafür)
   → Verpasst: ARIA-Fehlen (kein grep-Pattern dafür)
   → Verpasst: Mutex-Poisoning (kein grep-Pattern dafür)
   → Verpasst: confirm() statt showConfirmDialog() (kein grep-Pattern dafür)

4. Simon korrigiert: "ALLE Kategorien, nicht nur die häufigsten!"

5. Erst OHNE den Skill (4 parallele Agents, ALLE Dateien lesen):
   → 103+ Probleme gefunden

6. Die Skill-Anweisung war das HINDERNIS:
   → "Fokussiere auf die häufigsten" = Einladung zum Oberflächlich-Sein
   → Die Dateipfade sind falsch (main/*.js statt src-tauri/src/)
   → Die grep-Patterns sind Electron-spezifisch
```

**Fazit:** Der audit-code Skill hat das Audit beim ersten Versuch aktiv sabotiert, weil er "Fokussiere auf die häufigsten" sagt und falsche Dateipfade + Electron-Patterns vorgibt.

---

### T10: Gesamtbild — Wie eine Schwachstelle zur nächsten führt

```
┌─────────────────────────────────────────────────────────────────┐
│               WURZEL: Electron→Tauri Migration                  │
│           Code migriert ✓  —  Dokumente NICHT migriert ✗       │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ 9 Skills    │  │ governance  │  │ CLAUDE.md   │
    │ veraltet    │  │ veraltet    │  │ lückenhaft  │
    │ (Electron)  │  │ (Node.js)   │  │ (kein       │
    │             │  │             │  │  Escaping)  │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
     ┌─────┴────┐    ┌─────┴────┐     ┌─────┴────┐
     ▼          ▼    ▼          ▼     ▼          ▼
 ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐
 │XSS     ││Toast   ││Memory  ││Keine   ││Keine   ││Audit   │
 │in      ││4x      ││Leaks   ││Pfad-   ││PS-     ││zu      │
 │Error-  ││dupli-  ││(kein   ││Vali-   ││Escape  ││ober-   │
 │Handler ││ziert   ││destroy)││dierung ││Regel   ││fläch-  │
 │(16x)   ││        ││(12x)   ││(5x)    ││(10x)   ││lich    │
 └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ CSP null    │  │ withGlobal  │  │ Keine       │
    │ in tauri.   │  │ Tauri: true │  │ Capabilities│
    │ conf.json   │  │             │  │             │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           └────────────────┴────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │  XSS + deaktivierte CSP  │
              │  + globales __TAURI__    │
              │  = Voller Systemzugriff  │
              │  für eingeschleusten     │
              │  Code                    │
              └──────────────────────────┘

Parallel und unabhängig:

    ┌──────────────────────────┐
    │ Migration: 147 Stubs     │
    │ Kein Tracking            │
    │ Kein Frontend-Warning    │
    │ Stubs geben "success"    │
    └───────────┬──────────────┘
                ▼
    ┌──────────────────────────┐
    │ 50+ Funktionen die       │
    │ NICHTS tun aber "Erfolg" │
    │ melden:                  │
    │ - Privacy = Fake         │
    │ - Preferences = Fake     │
    │ - Session = Fake         │
    │ - Registry-Clean = Fake  │
    │ - Export = Fake           │
    └──────────────────────────┘
```

---

## Lehre für die Zukunft

> **Bei jeder Framework-Migration müssen ALLE Steuerungsdokumente mitmigriert werden:**
> - CLAUDE.md
> - governance.md
> - Alle Skills in `.claude/skills/`
> - anforderungen.md (API-Referenz)
>
> **Code-Migration ohne Dokumenten-Migration = systematische Qualitätserosion.**
>
> Die Electron→Tauri-Migration hat den Code korrekt migriert (147 API-Methoden als Bridge, Rust-Backend).
> Aber die Skills, die Governance und die Regeln wurden nicht mitgenommen.
> Das Ergebnis: Claude folgt veralteten Electron-Anweisungen und erzeugt unsicheren Tauri-Code.

---

## Umsetzungsstatus (16.02.2026)

### Phase 1: Skills repariert — ABGESCHLOSSEN

| # | Aktion | Status | Details |
|---|--------|--------|---------|
| A1 | `/add-ipc` → `/add-tauri-command` | **Erledigt** | Neuer Skill erstellt, alter Ordner gelöscht. Referenziert `commands.rs`, `lib.rs`, `tauri-bridge.js`. Security-Checkliste eingebaut. |
| A2 | `/new-feature` auf Tauri + Security | **Erledigt** | Komplett umgeschrieben. Template verwendet `escapeHtml()`, `textContent` für Fehler, `destroy()` mit Timer/Listener/Observer-Cleanup. Security-Checkliste eingebaut. |
| A3 | `/add-sidebar-tab` auf Tauri + Security | **Erledigt** | Komplett umgeschrieben. Gleiche Security-Patterns wie A2. Verweis auf `/add-tauri-command` für Backend. |
| A4 | `/deep-analyze` Datenfluss auf Tauri | **Erledigt** | Datenfluss-Trace: Frontend→Bridge→commands.rs→ps.rs. Tauri-spezifische Phasen (CSP, Capabilities, withGlobalTauri). |
| A5 | `/fix-bug` Dateipfade auf Tauri | **Erledigt** | Alle Pfade korrigiert. Security-Regeln (Escaping, Pfad-Validierung) eingebaut. |
| A6 | `/powershell-cmd` auf Rust/ps.rs | **Erledigt** | Komplett umgeschrieben für `crate::ps::run_ps()`. Parameter-Escaping als PFLICHT. `tokio::time::timeout()` Template. Security-Checkliste. |
| A7 | `/audit-code` "all" = ALLE Dateien lesen | **Erledigt** | 6 Kategorien (Security, Performance, WCAG, Tauri, Konventionen, Stubs). "ALLE Dateien lesen" statt "Fokussiere auf häufigste". VERBOTEN-Block für Oberflächlichkeit. |
| A8 | `/changelog` + `/git-release` Cargo.toml | **Erledigt** | Version aus `src-tauri/Cargo.toml` + `tauri.conf.json` + `index.html`. Nicht mehr `package.json`. |

### Phase 2: Regeln ergänzt — ABGESCHLOSSEN

| # | Aktion | Status | Details |
|---|--------|--------|---------|
| B1 | Rust-PowerShell-Escaping in CLAUDE.md | **Erledigt** | Neuer Abschnitt "Security-Regeln" mit 4 Unterkategorien (Escaping, Pfad-Validierung, XSS, Tauri-Config). |
| B2 | Path-Validierung in CLAUDE.md | **Erledigt** | Pfad-Validierungs-Regeln + Bestätigungsdialog-Pflicht. |
| B3 | governance.md für Tauri umgeschrieben | **Erledigt** | Komplett neu: 10 Abschnitte statt 8. Neue: Security (KRITISCH), Memory-Leak-Prävention, Stub-Management. Alle Electron-Referenzen entfernt. |
| B4 | escapeHtml() vorschreiben | **Erledigt** | In CLAUDE.md + governance.md + allen Skill-Templates. Zentrale Funktion aus `utils.js` als Pflicht. |
| B5 | ARIA-Mindestanforderungen | **Erledigt** | In governance.md: 6 ARIA-Patterns für Tree, Tabs, Toasts, Buttons, Switches, Progressbars. |
| B6 | Memory-Leak-Prävention | **Erledigt** | In CLAUDE.md + governance.md: Timer, Listener, Observer, DOM-Cleanup in destroy(). |

### Phase 3: Prozesse eingeführt — ABGESCHLOSSEN

| # | Aktion | Status | Details |
|---|--------|--------|---------|
| C1 | Stub-Tracking in anforderungen.md | **Erledigt** | Section 12 komplett überarbeitet: 83 implementierte, 21 HOCH-Stubs, 28 MITTEL-Stubs, 7 NIEDRIG-Stubs, 9 Teilweise. Jede Funktion mit Zeilennummer. |
| C2 | Stubs mit Frontend-Warnung | **Erledigt** | `isStub()` + `showStubWarning()` in `renderer/js/utils.js`. Governance Section 11 mit Backend/Frontend-Konvention. Stub-Antwort: `{stub:true, message:"..."}` |
| C3 | Security-Checkliste in Skills | **Erledigt** | (in Phase 1 mit eingebaut) |
| C4 | Migrations-Checkliste erstellen | **Erledigt** | `docs/planung/migrations-checkliste.md` — 3-Phasen-Checkliste (Vor/Während/Nach Migration) + Lessons-Learned-Tabelle |

### Phase 4: Prävention — ABGESCHLOSSEN

| # | Aktion | Status | Details |
|---|--------|--------|---------|
| D1 | Security-Scan Skill | **Erledigt** | `/security-scan` Skill erstellt (5 Prüfkategorien: CMD-INJ, XSS, PATH-TRAV, CFG, VALID). In CLAUDE.md Skill-Tabelle eingetragen. |
| D2 | Template-Validation | **Erledigt** | Bereits durch A2/A3 abgedeckt — alle Skill-Templates enthalten Security-Checklisten + sichere Code-Patterns |
| D3 | Regelmäßige Audits | **Erledigt** | Audit-Schedule in CLAUDE.md (Prinzip 4c) + governance.md (Section 10). Definiert wann welcher Audit ausgeführt werden muss. |

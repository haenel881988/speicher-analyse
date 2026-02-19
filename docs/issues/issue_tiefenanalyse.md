# Tiefenanalyse — Speicher Analyse v7.2.1

> **Erstellt:** 19.02.2026
> **Methode:** Systematische Codebase-Recherche nach Recherche-Prompt v2.2
> **Umfang:** 14 Analysebereiche, alle Kern-Dateien manuell geprüft

---

## Zusammenfassung

| Schweregrad | Anzahl |
|-------------|--------|
| 🔴 Kritisch | 3 |
| 🟠 Hoch | 7 |
| 🟡 Mittel | 6 |
| 🔵 Niedrig | 4 |
| ℹ️ Hinweis | 3 |
| **Gesamt** | **23** |

---

## 🔴 Kritisch

### K-1: Strategisch "entfernte" Features noch vollständig im Code

**Bereich:** 14 (Dead Code) + 1 (Migration)
**Dateien:**
- `src-tauri/src/commands.rs` — `scan_local_network` (Z.3540), `scan_network_active` (Z.3609), `scan_device_ports` (Z.4115), `get_smb_shares` (Z.4138), `get_firewall_rules` (Z.2614), `block_process` (Z.2629), `unblock_process` (Z.2643), `scan_registry` (Z.896), `clean_registry` (Z.937), `export_registry_backup` (Z.925), `restore_registry_backup` (Z.969)
- `src-tauri/src/lib.rs` — Alle oben genannten Commands sind in Z.249-252 (Registry) und Z.341-343 (Firewall) und Z.364-368 (Netzwerk-Scanner) registriert
- `renderer/js/tauri-bridge.js` — Bridge-Einträge für alle "entfernten" Features existieren
- `renderer/js/registry.js` — Komplette Registry-View mit UI noch vorhanden
- `renderer/index.html` — Sidebar-Tab für Registry noch vorhanden
- `src-tauri/src/oui.rs` — Komplette OUI-Datenbank (nur für Netzwerk-Scanner relevant)

**Risiko:** Die strategische Entscheidung in `issue.md` (18.02.2026) definiert klar, dass Netzwerk-Scanner, Firewall-Verwaltung und Registry Cleaner entfernt werden sollen. Der Code ist aber noch vollständig vorhanden und aktiv. AV-Software kann die Funktionen erkennen und die App blockieren.

**Empfehlung:** Vollständige Entfernung aller betroffenen Commands, Bridge-Einträge, Views und `oui.rs`. Registrierung in `lib.rs` entfernen.

---

### K-2: Path Traversal — Lese-Commands ohne Pfadvalidierung

**Bereich:** 2 (Security)
**Datei:** `src-tauri/src/commands.rs`
- `read_file_preview` (Z.866) — Liest beliebige Dateien ohne `validate_path()`
- `read_file_content` (Z.873) — Liest beliebige Dateien ohne `validate_path()`
- `read_file_binary` (Z.886) — Liest beliebige Dateien (inkl. Base64-Encoding) ohne `validate_path()`

**Risiko:** Ein Angreifer (z.B. über XSS oder manipulierte IPC-Aufrufe) kann beliebige Dateien lesen — inklusive `C:\Windows\System32\config\SAM`, SSH-Keys, Browser-Passwörter, etc. Im Gegensatz dazu hat `write_file_content` (Z.879) korrekt `validate_path()`.

**Empfehlung:** `validate_path()` vor jeder Lese-Operation aufrufen. Alternativ: Explizite Allowlist der erlaubten Pfade (z.B. nur innerhalb des Scan-Roots oder des vom User geöffneten Verzeichnisses).

---

### K-3: delete_to_trash ohne Pfadvalidierung

**Bereich:** 2 (Security)
**Datei:** `src-tauri/src/commands.rs`, Z.359
**Code:**
```rust
pub async fn delete_to_trash(paths: Vec<String>) -> Result<Value, String> {
    // KEIN validate_path() Aufruf!
    let ps_paths = paths.iter().map(|p| format!("'{}'", p.replace("'", "''"))).collect::<Vec<_>>().join(",");
```

**Risiko:** Es können beliebige Dateien und Verzeichnisse in den Papierkorb verschoben werden — inklusive Systemdateien, Programmdateien, etc. Zwar wird PowerShell's `SendToRecycleBin` verwendet (nicht permanente Löschung), aber der Papierkorb kann anschließend geleert werden.

**Empfehlung:** `validate_path()` für jeden Pfad in der Liste aufrufen, bevor der PowerShell-Befehl ausgeführt wird.

---

## 🟠 Hoch

### H-1: Migration-Artefakt — electron-builder.yml existiert noch

**Bereich:** 1 (Migration)
**Datei:** `electron-builder.yml` (Projekt-Root)

**Risiko:** Verwirrung bei Build-Tools, falsche Signale an CI/CD-Systeme, irreführend für neue Entwickler. Enthält Electron-spezifische Konfiguration (appId, NSIS-Settings) die mit Tauri nichts zu tun hat.

**Empfehlung:** Datei löschen.

---

### H-2: 18 View-Klassen ohne destroy() — Memory-Leak-Risiko

**Bereich:** 3 (Performance) + 4 (Stabilität)
**Betroffene Dateien (kein `destroy()`):**

| View | Datei |
|------|-------|
| DashboardView | `renderer/js/dashboard.js` |
| AutostartView | `renderer/js/autostart.js` |
| CleanupView | `renderer/js/cleanup.js` |
| DuplicatesView | `renderer/js/duplicates.js` |
| ExplorerView | `renderer/js/explorer.js` |
| ExplorerDualPanel | `renderer/js/explorer-dual-panel.js` |
| OldFilesView | `renderer/js/old-files.js` |
| OptimizerView | `renderer/js/optimizer.js` |
| EditorPanel | `renderer/js/preview.js` |
| RegistryView | `renderer/js/registry.js` |
| SearchPanel | `renderer/js/search.js` |
| SecurityAuditView | `renderer/js/security-audit.js` |
| ServicesView | `renderer/js/services.js` |
| SettingsView | `renderer/js/settings.js` |
| SystemProfilView | `renderer/js/system-profil.js` |
| TreeView | `renderer/js/tree.js` |
| UpdatesView | `renderer/js/updates.js` |
| BloatwareView | `renderer/js/bloatware.js` |

**Views MIT destroy() (7):** NetworkView, PrivacyView, SmartView, SoftwareAuditView, TreemapView, SystemScoreView, TerminalPanel

**Risiko:** Bei jedem Tab-Wechsel werden Event-Listener, Intervals, ResizeObserver und DOM-Referenzen nicht aufgeräumt. Bei längerer Nutzung steigt der Speicherverbrauch kontinuierlich an.

**Empfehlung:** Jede View braucht eine `destroy()`-Methode. `app.js` muss `destroy()` aufrufen bevor eine neue View aktiviert wird (laut CLAUDE.md bereits als Regel definiert).

---

### H-3: app.js — Battery-Interval wird nie gestoppt

**Bereich:** 3 (Performance)
**Datei:** `renderer/js/app.js`, Z.262

```javascript
state.batteryIntervalId = setInterval(updateBatteryUI, batteryInterval);
```

Es gibt **keinen einzigen** `clearInterval`-Aufruf in der gesamten `app.js`. Das Interval läuft die gesamte Lebensdauer der App.

**Risiko:** Geringes Leak, aber Verstoß gegen die Memory-Leak-Prävention-Policy in CLAUDE.md. Wenn die App lange läuft und `updateBatteryUI` interne State-Objekte akkumuliert, wächst der Speicher.

**Empfehlung:** `clearInterval(state.batteryIntervalId)` in eine Cleanup-Funktion einbauen.

---

### H-4: CSP erlaubt unsafe-inline und unsafe-eval

**Bereich:** 2 (Security)
**Datei:** `src-tauri/tauri.conf.json`, Z.26

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

**Risiko:** `unsafe-inline` erlaubt Inline-Scripts (XSS-Vektor). `unsafe-eval` erlaubt `eval()`, `Function()`, `setTimeout(string)` — klassische XSS-Exploitation. In einer Tauri-App mit IPC-Zugriff auf PowerShell-Ausführung ist dies besonders gefährlich.

**Empfehlung:** Inline-Styles auf `style-src` beschränken (bereits korrekt). `unsafe-eval` entfernen — prüfen ob es tatsächlich benötigt wird (Monaco Editor könnte es brauchen). `unsafe-inline` in `script-src` durch Nonce oder Hash ersetzen, falls technisch möglich.

---

### H-5: terminal_resize ist ein Stub

**Bereich:** 14 (Dead Code) + 4 (Stabilität)
**Datei:** `src-tauri/src/commands.rs`, Z.2040-2042

```rust
pub async fn terminal_resize(_id: String, _cols: u32, _rows: u32) -> Result<Value, String> {
    Ok(json!({ "stub": true, "message": "Terminal-Resize benötigt ConPTY/portable-pty" }))
}
```

**Risiko:** Frontend ruft `terminal_resize` auf und erhält `{"stub": true}` zurück. Der User sieht ein Terminal das sich bei Fenster-Resize nicht anpasst. Die Funktion täuscht Funktionalität vor.

**Empfehlung:** Entweder ConPTY/portable-pty implementieren oder das Frontend informieren dass Resize nicht verfügbar ist (kein stiller Stub).

---

### H-6: ~35 unwrap() auf Mutex-Locks — Panic bei Poisoned Mutex

**Bereich:** 4 (Stabilität)
**Datei:** `src-tauri/src/commands.rs`

Beispiele (Auszug):
- Z.1964: `TERMINAL_SESSIONS.lock().unwrap()`
- Z.2012: `TERMINAL_SESSIONS.lock().unwrap()`
- Z.2577: `bw_prev_store().lock().unwrap()`
- Z.2732: `IP_RESOLVE_CACHE.lock().unwrap()`
- Z.3169: `NETWORK_RECORDING.lock().unwrap()`
- Z.4088: `LAST_NETWORK_SCAN.lock().unwrap()`

**Risiko:** Wenn ein Thread panicked während er einen Mutex hält, wird der Mutex "poisoned". Alle nachfolgenden `lock().unwrap()` Aufrufe werden dann ebenfalls paniken → Kaskaden-Crash der gesamten App.

**Empfehlung:** `lock().unwrap_or_else(|e| e.into_inner())` für unkritische Caches, oder `.map_err()` mit Fehlermeldung an das Frontend für kritische Locks. Alternativ: `parking_lot::Mutex` verwenden (panicked nicht bei Poisoning).

---

### H-7: `nul`-Datei im Projekt-Root

**Bereich:** 1 (Migration)
**Datei:** `nul` (498 Bytes, Projekt-Root)

Windows-Artefakt von einem fehlerhaften Redirect (vermutlich `> NUL` in einem Bash-Kontext). Enthält Ping-Output.

**Empfehlung:** Datei löschen.

---

## 🟡 Mittel

### M-1: `#[allow(dead_code)]` auf ScanData-Struct

**Bereich:** 14 (Dead Code)
**Datei:** `src-tauri/src/scan.rs`, Z.14

```rust
#[allow(dead_code)]
pub struct ScanData {
```

**Risiko:** Verdeckt Compiler-Warnungen über tatsächlich ungenutzten Code. Wenn Felder von ScanData wirklich nicht mehr benutzt werden, bleiben sie unentdeckt.

**Empfehlung:** `#[allow(dead_code)]` entfernen und prüfen welche Felder tatsächlich ungenutzt sind. Ungenutzte Felder entfernen oder mit `_` prefixen.

---

### M-2: validate_path blockiert nur bekannte Systempfade

**Bereich:** 2 (Security)
**Datei:** `src-tauri/src/commands.rs`, Z.46-61

Die `validate_path()`-Funktion hat eine Blocklist von 7 Systempfaden. Das ist ein Negativlist-Ansatz (alles erlaubt außer Blocklist).

**Risiko:** Umgehung durch:
- Nicht gelistete sensitive Pfade (z.B. `C:\Users\<name>\AppData\Local\Google\Chrome\User Data\`)
- Junction Points / Symbolic Links die in blockierte Verzeichnisse zeigen
- Relative Pfade mit `..` (wenn `p_lower` nicht kanonisiert wird)

**Empfehlung:** Zusätzlich zur Blocklist eine Positivlist (Allowlist) für destruktive Operationen verwenden. Pfade vor Vergleich kanonisieren (`std::fs::canonicalize`).

---

### M-3: commands.rs ist monolithisch (4628 Zeilen)

**Bereich:** 5 (Architektur)
**Datei:** `src-tauri/src/commands.rs`

Alle ~150 Commands in einer einzigen Datei. Kategorien sind nur durch Kommentare getrennt.

**Risiko:** Schwer wartbar, hohe Merge-Konflikt-Wahrscheinlichkeit bei paralleler Entwicklung, unübersichtlich.

**Empfehlung:** Aufteilen in Module nach Funktionsbereich (z.B. `commands/file_management.rs`, `commands/network.rs`, `commands/terminal.rs`, etc.). Re-Export über `mod commands;` in `lib.rs`.

---

### M-4: Docs referenzieren noch Electron

**Bereich:** 1 (Migration)
**Betroffene Dateien:**
- `docs/issues/issue_code_audit.md` — Electron-spezifische Referenzen
- `docs/planung/visionen.md` — Electron-Referenzen
- `docs/issues/issue_meta_analyse.md` — Electron-Referenzen

**Risiko:** Irreführend, veraltet. Kann zu falschen Entscheidungen führen wenn diese Dokumente als Referenz verwendet werden.

**Empfehlung:** Dokumente aktualisieren oder als veraltet markieren.

---

### M-5: preview.js verwendet require() (AMD-Loader)

**Bereich:** 1 (Migration)
**Datei:** `renderer/js/preview.js`, Z.71

```javascript
require(['vs/editor/editor.main'], function(monaco) { ... })
```

Dies ist KEIN Node.js-require, sondern der AMD-Loader für Monaco Editor. Trotzdem ungewöhnlich in einer ES-Module-Codebase.

**Risiko:** Gering — funktioniert korrekt. Aber inkonsistent mit dem ES-Modules-Pattern das sonst durchgehend verwendet wird.

**Empfehlung:** Prüfen ob Monaco Editor als ES-Module geladen werden kann. Falls nicht, als bekannte Ausnahme dokumentieren.

---

### M-6: 184 innerHTML-Verwendungen in 30 JS-Dateien

**Bereich:** 2 (Security)
**Verbreitung:** Nahezu alle View-Dateien unter `renderer/js/`

Die meisten Stellen scheinen `escapeHtml()` oder `this.esc()` für dynamische Inhalte zu verwenden. Eine vollständige manuelle Prüfung jeder einzelnen Stelle steht aus.

**Risiko:** Auch bei überwiegend korrektem Escaping: Eine einzige vergessene Stelle reicht für XSS. In Kombination mit `unsafe-inline`/`unsafe-eval` in der CSP wäre ein XSS sofort ausnutzbar (inkl. PowerShell-Ausführung über IPC).

**Empfehlung:** Systematisches Audit aller 184 Stellen. Jede Stelle die dynamische Daten ohne Escaping in innerHTML einsetzt, ist ein potenzieller XSS-Vektor. Langfristig: Migration auf `textContent`/`createElement` wo möglich.

---

## 🔵 Niedrig

### N-1: get_system_score setzt bedingt stub-Flag

**Bereich:** 14 (Dead Code)
**Datei:** `src-tauri/src/commands.rs`, Z.4401

```rust
result["stub"] = json!(true);
```

Wird gesetzt wenn keine echten Daten vorliegen. Das Frontend muss diesen Fall korrekt behandeln.

**Empfehlung:** Prüfen ob das Frontend den stub-Fall anzeigt oder ignoriert.

---

### N-2: Capabilities-Datei hat minimale Permissions

**Bereich:** 2 (Security)
**Datei:** `src-tauri/capabilities/default.json`

Nur `core:default`, `shell:allow-open`, `dialog:default`, `clipboard-manager:allow-write-text`, `global-shortcut:default` sind freigeschaltet.

**Bewertung:** Gut! Die Capabilities sind minimal gehalten. Allerdings erlaubt `core:default` alle IPC-Aufrufe — die eigentliche Zugriffskontrolle liegt also auf Command-Ebene (was aktuell über `validate_path()` passiert, siehe K-2/K-3/M-2).

---

### N-3: Cargo.toml Release-Profil ist gut konfiguriert

**Bereich:** 8 (Dependencies) + 12 (Build)
**Datei:** `src-tauri/Cargo.toml`

`strip = true`, `lto = true`, `codegen-units = 1`, `opt-level = "s"` — optimale Einstellungen für kleine Binaries.

**Bewertung:** Korrekt konfiguriert, keine Aktion nötig.

---

### N-4: `as_array().unwrap()` auf JSON-Werte

**Bereich:** 4 (Stabilität)
**Datei:** `src-tauri/src/commands.rs`

Beispiele:
- Z.1403: `data.as_array().unwrap().clone()` — wird nur nach `data.is_array()` Check aufgerufen (sicher)
- Z.2825: `v.as_array().unwrap().clone()` — wird nur nach `v.is_array()` Guard aufgerufen (sicher)

**Bewertung:** Technisch sicher wegen vorheriger Typ-Prüfung, aber `unwrap()` nach Pattern-Match ist stilistisch fragwürdig. Kein akutes Risiko.

---

## ℹ️ Hinweise

### I-1: IPC-Bridge ist konsistent und vollständig

**Datei:** `renderer/js/tauri-bridge.js` (327 Zeilen)
- Verwendet `makeInvoke()` und `makeListener()` Helper konsistent
- CamelCase→snake_case Übersetzung funktioniert korrekt
- Alle ~150 Commands haben Bridge-Einträge
- Event-Listener für scan-progress, duplicate-progress, terminal-output, deep-search-*, network-scan-* etc.

**Bewertung:** Saubere, konsistente Implementation. Lediglich die Bridge-Einträge für "entfernte" Features müssen mit-entfernt werden (→ K-1).

---

### I-2: PowerShell-Execution ist robust implementiert

**Datei:** `src-tauri/src/ps.rs` (117 Zeilen)
- UTF-8 Prefix (`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`)
- 30s Timeout via `tokio::time::timeout`
- `CREATE_NO_WINDOW` verhindert sichtbare PowerShell-Fenster
- Safe truncation für Logging (`script_preview`, `safe_truncate`)
- `run_ps_json_array()` normalisiert Single-Object zu Array (PowerShell-Quirk)

**Bewertung:** Gut implementiert, keine Aktion nötig.

---

### I-3: Scan-Engine nutzt effiziente Datenstrukturen

**Datei:** `src-tauri/src/scan.rs` (491 Zeilen)
- Bincode-Serialisierung für Persistenz (mit JSON-Fallback)
- `build_dir_index()` erstellt HashMap für O(1) Directory-Lookup
- `release_scan_bulk_data()` gibt große Datenstrukturen explizit frei

**Bewertung:** Performance-technisch solide. Nur `#[allow(dead_code)]` sollte geprüft werden (→ M-1).

---

## Priorisierte Maßnahmen-Liste

| Prio | Finding | Aufwand | Risikoreduktion |
|------|---------|---------|-----------------|
| 1 | **K-1** Entfernung Network-Scanner/Firewall/Registry | Hoch | AV-Blockierung verhindern |
| 2 | **K-2** validate_path() für Lese-Commands | Niedrig | Path Traversal schließen |
| 3 | **K-3** validate_path() für delete_to_trash | Niedrig | Unbeabsichtigtes Löschen verhindern |
| 4 | **H-4** CSP unsafe-eval/unsafe-inline prüfen | Mittel | XSS-Ausnutzung erschweren |
| 5 | **H-2** destroy() für alle Views | Hoch | Memory-Leaks verhindern |
| 6 | **H-6** unwrap() auf Mutex-Locks ersetzen | Mittel | Kaskaden-Crashes verhindern |
| 7 | **H-1/H-7** Artefakte löschen | Niedrig | Projekt sauber halten |
| 8 | **H-5** terminal_resize Stub beheben | Mittel | Echte Terminal-Funktion |
| 9 | **M-6** innerHTML-Audit | Hoch | XSS-Vektoren finden |
| 10 | **M-2** validate_path Allowlist | Mittel | Umgehung erschweren |
| 11 | **M-3** commands.rs aufteilen | Hoch | Wartbarkeit verbessern |
| 12 | **M-4** Docs aktualisieren | Niedrig | Irreführung vermeiden |

---

> **Nächster Schritt:** K-1 (Entfernung der strategisch abgelehnten Features) hat höchste Priorität, da es die AV-Kompatibilität direkt betrifft und in `issue.md` bereits als "Geplant" markiert ist.

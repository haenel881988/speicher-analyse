---
name: add-tauri-command
description: Fügt einen neuen Tauri-Command hinzu mit Einträgen in commands.rs, lib.rs und tauri-bridge.js. Stellt konsistente Benennung, Parameter-Escaping und Fehlerbehandlung sicher. Nutze diesen Skill wenn eine neue Backend-Funktion vom Frontend aus aufgerufen werden soll. Aufruf mit /add-tauri-command [command-name] [beschreibung].
---

# Tauri-Command hinzufügen

Du fügst einen neuen Tauri-Command zur Speicher Analyse App hinzu.

## Argumente

- `$ARGUMENTS[0]` = Command-Name in snake_case (z.B. `get_disk_health`)
- `$ARGUMENTS[1]` = Beschreibung (optional)

## Voranalyse

1. Lies `src-tauri/src/commands.rs` um bestehende Commands und Patterns zu verstehen
2. Lies `src-tauri/src/lib.rs` um die Command-Registrierung im `generate_handler![]` zu sehen
3. Lies `renderer/js/tauri-bridge.js` um die Bridge-Konventionen (`makeInvoke`) zu verstehen
4. Prüfe ob ein ähnlicher Command bereits existiert

## 3 Dateien ändern

### 1. `src-tauri/src/commands.rs` — Command-Funktion

```rust
#[tauri::command]
pub async fn command_name(param: String) -> Result<serde_json::Value, String> {
    // SECURITY: Parameter für PowerShell escapen
    let safe_param = param.replace("'", "''");

    let script = format!("Get-Something '{}'", safe_param);
    let output = crate::ps::run_ps(&script).await?;

    let json: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("JSON-Parse-Fehler: {}", e))?;
    Ok(json)
}
```

**Security-Regeln (PFLICHT bei JEDEM Command):**
- **PowerShell-Escaping:** Alle String-Parameter die in `format!()` für PowerShell verwendet werden MÜSSEN mit `.replace("'", "''")` escaped werden
- **Pfad-Validierung:** Pfade vom Frontend validieren (existiert der Pfad? liegt er innerhalb erlaubter Verzeichnisse?)
- **Enum-Whitelist:** Parameter mit festen Werten (z.B. direction: "Inbound"/"Outbound") per `match` auf erlaubte Werte prüfen
- **IP-Validierung:** IP-Adressen mit Regex validieren bevor sie in PowerShell verwendet werden

**Konventionen:**
- `snake_case` für Funktionsnamen
- `#[tauri::command]` Attribut
- `Result<serde_json::Value, String>` Rückgabetyp
- Async für I/O-Operationen
- PowerShell über `crate::ps::run_ps()` oder `crate::ps::run_ps_json()`

### 2. `src-tauri/src/lib.rs` — Command registrieren

Füge den Command in den `generate_handler![]` Macro-Aufruf ein:

```rust
.invoke_handler(tauri::generate_handler![
    // ... bestehende Commands ...
    commands::command_name,  // NEU
])
```

### 3. `renderer/js/tauri-bridge.js` — Frontend-Mapping

Füge die Methode mit `makeInvoke()` hinzu:

```javascript
commandName: makeInvoke('command_name', 'param'),
```

**Benennungs-Konvention:**
- Rust-Command: `snake_case` (z.B. `get_disk_health`)
- Bridge-Methode: `camelCase` (z.B. `getDiskHealth`)
- Frontend-Aufruf: `window.api.getDiskHealth()`

## Frontend-Aufruf (optional)

```javascript
// In renderer/js/<modul>.js
try {
    const result = await window.api.commandName(arg);
    if (result?.error) throw new Error(result.error);
    // result verarbeiten...
} catch (err) {
    console.error('[Modul]', err);
    // SECURITY: Fehler mit textContent anzeigen, NICHT innerHTML
    errorEl.textContent = 'Fehler: ' + err.message;
}
```

## Security-Checkliste (PFLICHT vor Commit)

- [ ] Alle String-Parameter für PowerShell mit `.replace("'", "''")` escaped?
- [ ] Pfade vom Frontend validiert (nicht beliebige Pfade akzeptieren)?
- [ ] Enum-Parameter per Whitelist/match geprüft?
- [ ] IP-Adressen per Regex validiert?
- [ ] Keine `format!()` mit unescaptem User-Input?
- [ ] Frontend zeigt Fehler mit `textContent`, nicht `innerHTML`?

## Häufige Fehler vermeiden

- Command in `commands.rs` definiert aber NICHT in `lib.rs` registriert → Frontend bekommt "unknown command"
- `camelCase` in Rust verwendet → muss `snake_case` sein
- Bridge-Methode mit falschem invoke-Namen → stille Fehler
- Parameter in `format!()` ohne Escaping → Command Injection
- Serialisierbare Daten: Tauri IPC kann nur JSON-serialisierbare Typen übertragen

## Ausgabe

Nach dem Hinzufügen, gib eine Zusammenfassung:
- Rust-Command: `commands::command_name`
- Bridge-Methode: `window.api.commandName()`
- Parameter: Typen und Escaping-Status
- Registrierung: In `lib.rs` eingetragen

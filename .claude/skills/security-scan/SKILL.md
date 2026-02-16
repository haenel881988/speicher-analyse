---
name: security-scan
description: Schneller Security-Scan der Speicher Analyse Tauri-App. Prüft Command Injection, XSS, Path Traversal und Tauri-Sicherheitskonfiguration. Nutze diesen Skill als Quick-Check vor Commits oder bei Sicherheitsbedenken. Aufruf mit /security-scan [datei-oder-modul oder "all"].
---

# Security-Scan

Du führst einen fokussierten Security-Scan der Speicher Analyse Tauri-App durch.
Dieser Scan ist schneller als `/audit-code` und konzentriert sich ausschließlich auf Sicherheitsprobleme.

## Argument

`$ARGUMENTS` = Dateipfad, Modulname ODER `all` für vollständigen Scan

## Prüfkategorien

### 1. Command Injection (KRITISCH)

**Rust-Backend (`src-tauri/src/commands.rs`):**

Suche nach `format!()` Aufrufen die User-Parameter enthalten OHNE vorheriges Escaping:

```
SICHER:    let safe = param.replace("'", "''"); let script = format!("... '{}'", safe);
UNSICHER:  let script = format!("... '{}'", param);  // param kommt vom Frontend!
```

**Prüfschritte:**
1. Grep nach `format!(` in commands.rs
2. Für jedes Match: Wird der Parameter VOR dem format!() mit `.replace("'", "''")` escaped?
3. Ausnahme: Hardcoded Strings ohne User-Parameter sind OK

### 2. XSS (KRITISCH)

**Frontend (`renderer/js/*.js`):**

Suche nach unsicherer DOM-Manipulation:

```
UNSICHER:  element.innerHTML = `...${variable}...`     // XSS wenn variable User-Input enthält
SICHER:    element.innerHTML = `...${escapeHtml(variable)}...`
SICHER:    element.textContent = variable
```

**Prüfschritte:**
1. Grep nach `innerHTML` in allen JS-Dateien
2. Für jedes Match: Werden alle `${...}` Ausdrücke mit `escapeHtml()` gewrappt?
3. Ausnahme: Statische Strings ohne Variablen sind OK
4. **Zusätzlich:** Gibt es eigene escapeHtml-Varianten statt dem Import aus `utils.js`?

### 3. Path Traversal (HOCH)

**Rust-Backend:**

Suche nach Dateioperationen die Pfade vom Frontend ohne Validierung verwenden:

```
UNSICHER:  tokio::fs::remove_dir_all(Path::new(&user_path))  // user_path unkontrolliert
SICHER:    Pfad validieren (existiert? innerhalb erlaubter Verzeichnisse?)
```

**Prüfschritte:**
1. Grep nach `tokio::fs::`, `std::fs::`, `Path::new(` in commands.rs
2. Für jedes Match: Kommt der Pfad aus einem Frontend-Parameter?
3. Wird der Pfad validiert bevor die Operation ausgeführt wird?

### 4. Tauri-Konfiguration (HOCH)

**Datei: `src-tauri/tauri.conf.json`:**

1. `security.csp` ist NICHT `null` oder leer
2. `withGlobalTauri` ist `false`
3. Capabilities sind minimal konfiguriert

**Datei: `src-tauri/src/lib.rs`:**

4. `tauri-plugin-single-instance` ist registriert
5. Alle Commands in `generate_handler![]` sind auch in commands.rs definiert (keine toten Einträge)

### 5. Parameter-Validierung (MITTEL)

**Rust-Backend:**

Suche nach Commands die User-Parameter ohne jede Validierung verwenden:

- IP-Adressen: Werden sie per Regex validiert?
- Enum-Werte: Werden sie per `match` auf Whitelist geprüft?
- Pfade: Werden sie auf Existenz geprüft?
- Strings: Werden sie für PowerShell escaped?

## Scan-Ablauf

### Einzelne Datei (`/security-scan src-tauri/src/commands.rs`)

1. Lies die angegebene Datei vollständig
2. Prüfe alle 5 Kategorien
3. Erstelle den Security-Bericht

### Ganzes Modul (`/security-scan privacy`)

1. Lies `src-tauri/src/commands.rs` — suche nach dem Modul-Bereich
2. Lies `renderer/js/<modul>.js`
3. Prüfe Kategorien 1-3, 5
4. Erstelle den Security-Bericht

### Vollständiger Scan (`/security-scan all`)

1. **Rust-Backend:** Lies `src-tauri/src/commands.rs` vollständig
2. **Konfiguration:** Lies `src-tauri/tauri.conf.json`
3. **App-Setup:** Lies `src-tauri/src/lib.rs`
4. **Frontend JS:** Grep alle `renderer/js/*.js` nach innerHTML, eval, document.write
5. **Prüfe ALLE 5 Kategorien**
6. Erstelle den Gesamtbericht

## Ausgabeformat

```markdown
## Security-Scan: [Datei/Modul/Gesamt]

### Zusammenfassung
- Geprüfte Dateien: X
- Kritische Funde: X
- Hohe Funde: X
- Mittlere Funde: X

### Kritisch (sofort beheben)
| # | Typ | Datei:Zeile | Code-Ausschnitt | Empfehlung |
|---|-----|-------------|-----------------|------------|
| 1 | CMD-INJ | commands.rs:42 | `format!("...'{}'", name)` | `.replace("'", "''")` |

### Hoch (vor nächstem Release beheben)
| # | Typ | Datei:Zeile | Problem | Empfehlung |
|---|-----|-------------|---------|------------|

### Mittel (bei Gelegenheit beheben)
| # | Typ | Datei:Zeile | Problem | Empfehlung |
|---|-----|-------------|---------|------------|

### Sicher
- Was korrekt umgesetzt ist
```

## Typ-Kürzel

| Kürzel | Bedeutung | Beispiel |
|--------|-----------|----------|
| CMD-INJ | Command Injection (PowerShell) | `format!()` ohne Escaping |
| XSS | Cross-Site Scripting | `innerHTML` ohne `escapeHtml()` |
| PATH-TRAV | Path Traversal | Unkontrollierter Pfad an Dateioperation |
| CFG | Konfigurationsproblem | CSP nicht gesetzt |
| VALID | Fehlende Validierung | IP-Adresse nicht geprüft |

## Wichtig

- **Keine automatischen Fixes** — nur berichten, User entscheidet
- **Immer Datei:Zeile angeben** für jeden Fund
- **Code-Ausschnitt zeigen** damit das Problem sofort verständlich ist
- **False Positives vermeiden:** Kontext prüfen (z.B. format!() mit Hardcoded Strings ist OK)
- **Verwandter Skill:** `/audit-code` für vollständiges Audit (Security + Performance + WCAG + Konventionen)

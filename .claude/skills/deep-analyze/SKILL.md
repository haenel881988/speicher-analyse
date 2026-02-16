---
name: deep-analyze
description: Tiefenanalyse eines Problems gemäß der OBERSTEN DIREKTIVE. Verfolgt den vollständigen Datenfluss Frontend→tauri-bridge→invoke→commands.rs→ps.rs und identifiziert die Wurzelursache. Aufruf mit /deep-analyze [problem-beschreibung oder datei-pfad].
---

# Tiefenanalyse (OBERSTE DIREKTIVE)

Du führst eine akribische Tiefenanalyse durch. **Das Problem liegt IMMER im Quellcode.**

## Argument

`$ARGUMENTS` = Problembeschreibung ODER Dateipfad zum Analysieren

## Verbotene Aussagen

Du darfst NIEMALS sagen:
- "Bitte F5 drücken" / "Bitte die App neu starten"
- "Bei mir funktioniert es" / "Der Code sieht korrekt aus"
- "Das sollte jetzt funktionieren" (ohne Beweis)
- Jede Form von "der User muss etwas tun damit es funktioniert"

## Analyse-Protokoll

### Phase 1: Kontext sammeln

1. **Issue-Tracker prüfen:** Lies `docs/issues/issue.md` — gibt es verwandte Issues?
2. **Betroffene Dateien identifizieren:** Welche Module sind involviert?
3. **Letzte Änderungen prüfen:** `git log --oneline -20` und `git diff` für relevante Dateien

### Phase 2: Vollständiger Datenfluss-Trace (Tauri v2)

Verfolge den Datenfluss **Schritt für Schritt** durch alle Schichten:

```
1. Frontend (renderer/js/*.js)
   → Welche Funktion löst das Problem aus?
   → Welche window.api.*() Methode wird aufgerufen?
   → Was wird als Argument übergeben?

2. Bridge (renderer/js/tauri-bridge.js)
   → Ist die Methode korrekt gemappt (makeInvoke)?
   → Stimmt der Command-Name (snake_case)?
   → Werden Parameter korrekt weitergeleitet?

3. Tauri-Command (src-tauri/src/commands.rs)
   → Ist der #[tauri::command] korrekt definiert?
   → Sind Parameter-Typen korrekt?
   → Werden Parameter escaped (PowerShell-Injection)?
   → Werden Pfade validiert?
   → Ist der Command in lib.rs registriert?

4. PowerShell-Ausführung (src-tauri/src/ps.rs)
   → Wird run_ps() / run_ps_json() verwendet?
   → Hat der Aufruf einen Timeout?
   → Ist das PowerShell-Script korrekt (Syntax, UTF-8)?

5. Rückweg: ps.rs → commands.rs → Bridge → Frontend
   → Wird das Ergebnis korrekt als JSON zurückgegeben?
   → Kommt es im Frontend an?
   → Wird es korrekt dargestellt (escapeHtml)?
```

### Phase 3: State-Management-Analyse

1. **_loaded Flags:** Werden sie bei Fehler korrekt zurückgesetzt?
2. **Timer/Intervalle:** Laufen setInterval-Timer weiter wenn sie nicht sollten?
3. **Event-Listener:** Werden sie bei jedem Aufruf neu registriert (Akkumulation)?
4. **DOM-State:** Stimmt der DOM-Zustand mit dem Daten-State überein?

### Phase 4: Security-Analyse (bei sicherheitsrelevanten Problemen)

1. **Command Injection:** Wird User-Input in `format!()` für PowerShell ohne `.replace("'", "''")` eingesetzt?
2. **XSS:** Wird `innerHTML` mit unescapten Variablen verwendet?
3. **Path Traversal:** Werden Pfade vom Frontend ohne Validierung an Dateioperationen weitergegeben?
4. **CSP:** Ist die Content Security Policy in `tauri.conf.json` konfiguriert (nicht `null`)?

### Phase 5: Plattform-Analyse (falls relevant)

1. **Windows-spezifisch:** Registry, PowerShell, Dateipfade (Backslashes)
2. **Tauri-spezifisch:** CSP in tauri.conf.json, Capabilities, withGlobalTauri
3. **WebView-spezifisch:** WebView2-Einschränkungen, JavaScript-Interop

### Phase 6: CSS & UI-Analyse (falls visuelles Problem)

1. **CSS-Variablen:** Stimmen die Werte in `renderer/css/style.css`?
2. **Theme-Konflikte:** Dark/Light Theme korrekt implementiert?
3. **WCAG-Kontrast:** Text-auf-Hintergrund mindestens 4.5:1?
4. **Akzentfarben:** `--accent` nur für Borders/Backgrounds, nie für Content-Text?
5. **display:none + Animationen:** Verbrauchen versteckte Animationen Ressourcen?

### Phase 7: PowerShell-Analyse (falls PS involviert)

1. Wird `crate::ps::run_ps()` verwendet?
2. Werden Parameter VOR dem `format!()` escaped?
3. Gibt es einen Timeout (tokio::time::timeout)?
4. Multi-Line: Werden Newlines beibehalten?
5. Werden PS-Prozesse sequenziell aufgerufen? (nie parallel)

## Ausgabeformat

```markdown
## Tiefenanalyse: [Problem-Titel]

### Symptom
Was der User sieht/erlebt

### Datenfluss-Trace
Schritt-für-Schritt Pfad durch den Code mit Datei:Zeile Referenzen

### Wurzelursache
Die ECHTE Ursache im Code (mit Datei:Zeile)

### Betroffene Dateien
- datei.rs:123 - Beschreibung
- datei.js:456 - Beschreibung

### Vorgeschlagener Fix
Konkreter Code-Vorschlag

### Verwandte Risiken
Was könnte durch den Fix brechen?
```

## Wichtige Hinweise

- **Visuelles Ergebnis ist die Wahrheit.** Nicht der Code, nicht die Theorie.
- **Einmal melden reicht.** Der User darf das gleiche Problem nie zweimal melden müssen.
- **Keine Zwischenlösungen.** Der Code muss sich selbst korrigieren.
- **Beweislast liegt bei der KI.** Nicht beim User.
- **Verwandte Skills:** Nach der Analyse kann `/fix-bug` für die Umsetzung verwendet werden.

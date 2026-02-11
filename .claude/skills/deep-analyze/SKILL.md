---
name: deep-analyze
description: Tiefenanalyse eines Problems gemäß der OBERSTEN DIREKTIVE. Verfolgt den vollständigen Datenfluss Main→IPC→Preload→Renderer und identifiziert die Wurzelursache.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
argument-hint: [problem-beschreibung oder datei-pfad]
context: fork
agent: general-purpose
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

1. **Issue-Tracker prüfen:** Lies `docs/issues/issue.md` - gibt es verwandte Issues?
2. **Betroffene Dateien identifizieren:** Welche Module sind involviert?
3. **Letzte Änderungen prüfen:** `git log --oneline -20` und `git diff` für relevante Dateien

### Phase 2: Vollständiger Datenfluss-Trace

Verfolge den Datenfluss **Schritt für Schritt** durch alle Schichten:

```
1. Renderer (renderer/js/*.js)
   → Welche Funktion löst das Problem aus?
   → Welche window.api.*() Methode wird aufgerufen?
   → Was wird als Argument übergeben?

2. Preload (main/preload.js)
   → Ist die Methode korrekt exponiert?
   → Stimmt der IPC-Kanal-Name?

3. IPC-Handler (main/ipc-handlers.js)
   → Wird der Handler korrekt registriert?
   → Werden die Argumente korrekt weitergeleitet?
   → Gibt es Error-Handling?

4. Backend-Modul (main/*.js)
   → Was passiert in der aufgerufenen Funktion?
   → Gibt es Race Conditions?
   → Werden Daten korrekt zurückgegeben?

5. Rückweg: Backend → IPC → Renderer
   → Wird das Ergebnis korrekt serialisiert?
   → Kommt es im Frontend an?
   → Wird es korrekt dargestellt?
```

### Phase 3: Worker-Thread-Analyse (falls relevant)

Falls Worker Threads beteiligt sind:
1. Wie werden Daten zum Worker gesendet? (`workerData` vs. `postMessage`)
2. Wie werden Ergebnisse zurückgesendet?
3. Gibt es Kontextisolation-Probleme? (Worker hat KEINEN Zugriff auf Main-Kontext)
4. Wird der Worker korrekt terminiert?

### Phase 4: State-Management-Analyse

1. **Session-Restore:** Beeinflusst Session-Wiederherstellung das Verhalten?
2. **Preferences:** Gibt es relevante Einstellungen die den Zustand beeinflussen?
3. **Map/Cache:** Werden Daten korrekt in Maps gespeichert und abgerufen?
4. **DOM-State:** Stimmt der DOM-Zustand mit dem Daten-State überein?

### Phase 5: Plattform-Analyse (falls relevant)

1. **Windows-spezifisch:** Registry, PowerShell, Dateipfade (Backslashes)
2. **Electron-spezifisch:** `file://` Protokoll, CSP, contextIsolation
3. **Chromium-spezifisch:** Module Workers, Blob URLs, GPU Cache

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
- datei.js:123 - Beschreibung
- datei2.js:456 - Beschreibung

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

# Vertiefte Semantische Analyse

Führe eine vollständige semantische Tiefenanalyse der angegebenen Datei(en) durch, inklusive aller Abhängigkeiten. Iteriere solange, bis kein weiterer Befund mehr auftritt.

## Pflicht-Scope




### 1. Datei(en) vollständig lesen
- Zieldatei(en) KOMPLETT lesen (keine Auszüge, keine Zusammenfassungen)
- Alle importierten Module lesen (tauri-api.ts, AppContext.tsx, utils/, hooks/)
- Backend-Commands lesen (src-tauri/src/commands/cmd_*.rs), soweit vom Frontend aufgerufen
- Jede Zeile verstehen, nicht nur nach Keywords scannen

### 2. React-Hooks prüfen
- **useCallback**: Jedes Dependency-Array auf Vollständigkeit prüfen. Stabile Referenzen (State-Setter, Context-Callbacks mit `[]`-Deps) dürfen fehlen — alle anderen MÜSSEN enthalten sein
- **useMemo**: Dependencies korrekt? Teure Berechnungen ohne Memo identifizieren
- **useEffect**: Cleanup-Funktion vorhanden für Timer, Listener, Observer, Subscriptions? Dependencies korrekt?
- **useRef**: Wird `.current` korrekt synchronisiert? Stale-Closure-Gefahr bei Refs in async Callbacks?
- **useState**: Funktionale Updates (`prev => ...`) wo nötig? Race-Conditions bei schnellen State-Änderungen?

### 3. Async & Race Conditions
- Async Funktionen: Was passiert wenn zwei schnell hintereinander aufgerufen werden?
- Generation-Counter / Abort-Pattern vorhanden wo nötig?
- Stale Closures: Greifen async Callbacks auf veraltete State-Werte zu?
- Unmount-Schutz: Setzen async Callbacks State auf unmounteten Komponenten?

### 4. API-Matching (Frontend ↔ Backend)
- Jeder `api.*()` Aufruf: Stimmen Parameter-Namen und -Typen mit der Backend-Signatur überein?
- Rückgabe-Handling: Wird die Backend-Response korrekt ausgelesen (korrektes Property-Name)?
- Fehlerbehandlung: Werden Backend-Fehler (`Err(...)`) im Frontend gefangen und dem User angezeigt?

### 5. State-Konsistenz
- Kann der State in einen inkonsistenten Zustand geraten? (z.B. Tab-Daten und aktiver Tab divergieren)
- Werden zusammenhängende State-Werte atomar aktualisiert?
- Werden State-Resets bei Navigation/Tab-Wechsel korrekt durchgeführt?

### 6. Memory Leaks
- Timer (`setInterval`, `setTimeout`): Cleanup bei Unmount?
- Event-Listener (`document.addEventListener`): Cleanup bei Unmount oder Dependency-Wechsel?
- Tauri-Event-Listener: `unlisten()` bei Unmount?
- DOM-Referenzen: Werden temporäre DOM-Elemente (Drag-Badge etc.) aufgeräumt?

### 7. Security
- XSS: Wird `dangerouslySetInnerHTML` verwendet? Wenn ja, mit Escaping?
- Backend-Injection: Werden alle String-Parameter in PowerShell-Commands mit `.replace("'", "''")` escaped?
- Path Traversal: Werden Dateipfade validiert (`validate_path`)?
- Enum-Whitelist: Werden Backend-Parameter mit Whitelist geprüft statt direkt eingesetzt?

### 8. UX & Edge Cases
- Leere Listen: Was zeigt die UI wenn keine Daten vorhanden sind?
- Fehlerfall: Was passiert bei Netzwerkfehler, Backend-Timeout, fehlenden Berechtigungen?
- Grenzwerte: Sehr lange Dateinamen, Unicode-Zeichen, leere Strings, null-Werte?
- Tastaturnavigation: Funktionieren alle Shortcuts korrekt an den Rändern (erste/letzte Zeile)?

### 9. Backend-Muster (Undo-Log, Validierung)
- Undo-Log: Wird NACH erfolgreicher Operation geloggt (nicht vorher)?
- Validierung: Werden alle Pfade vor destruktiven Operationen geprüft?
- Blocking in Async: Wird `walkdir` oder anderer synchroner IO in `spawn_blocking` gewrappt?

## Ausgabeformat

Ergebnisse nach Schweregrad sortiert:

```
### Kritische Bugs (Datenverlust, Crash, Security)
### Moderate Bugs (Fehlfunktion, inkonsistenter State)
### Minor Issues (Performance, Code-Qualität, Robustheit)
### Kein Bug (explizit als korrekt bestätigt)
```

Für jeden Befund:
- **Datei:Zeile** — was ist das Problem
- **Ursache** — warum passiert es
- **Auswirkung** — was sieht der User / was geht kaputt
- **Fix-Vorschlag** — konkreter Lösungsansatz (1-2 Sätze)

## Regeln

- KEINE Agents für die Analyse — alles manuell mit Read, Grep, Glob
- Dateien VOLLSTÄNDIG lesen, nicht nur scannen
- ALLE Treffer bei Grep prüfen, nicht nur den ersten
- Keine Annahmen — nur dokumentierte Fakten
- Wenn unsicher: ehrlich sagen, nicht raten
- Iterieren bis keine neuen Befunde mehr auftauchen

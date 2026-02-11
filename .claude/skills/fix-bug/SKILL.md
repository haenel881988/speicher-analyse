---
name: fix-bug
description: Strukturierter Bug-Fix-Workflow für die Speicher Analyse App. Liest offene Issues, führt Tiefenanalyse durch, implementiert den Fix, aktualisiert das Änderungsprotokoll und schließt den Kreislauf. Nutze diesen Skill wenn ein Bug gemeldet wird oder ein Issue behoben werden soll. Aufruf mit /fix-bug [bug-beschreibung oder issue-referenz].
---

# Bug-Fix-Workflow

Du behebst einen Bug in der Speicher Analyse Electron-App. **Das Problem liegt IMMER im Quellcode.**

## Argument

`$ARGUMENTS` = Bug-Beschreibung ODER Verweis auf ein Issue in `docs/issues/issue.md`

## Phase 1: Issue & Kontext erfassen

1. **Issue-Tracker prüfen:** Lies `docs/issues/issue.md` - gibt es ein passendes offenes Issue?
2. **Git-Historie prüfen:** `git log --oneline -10` und `git diff` für Kontext
3. **Betroffene Module identifizieren:** Welche Dateien sind involviert?

## Phase 2: Tiefenanalyse (OBERSTE DIREKTIVE)

Verfolge den vollständigen Datenfluss durch alle Schichten:

```
Renderer (renderer/js/*.js)
  → window.api.*() Aufruf
    → Preload (main/preload.js) - API korrekt exponiert?
      → IPC-Handler (main/ipc-handlers.js) - Handler registriert?
        → Backend-Modul (main/*.js) - Logik korrekt?
          → Rückweg: Serialisierung → IPC → Renderer → DOM
```

**Prüfe zusätzlich:**
- CSS-Regeln die das Problem verursachen könnten (`renderer/css/style.css`)
- Event-Handler und DOM-State im Frontend
- Worker-Thread-Kommunikation (falls relevant)
- PowerShell-Timeouts und UTF-8-Encoding (falls PS involviert)

## Phase 3: Fix implementieren

1. **Minimaler Fix:** Nur die Wurzelursache beheben, kein Refactoring
2. **Konventionen einhalten:**
   - Async/Await (kein execSync)
   - Error-Handling mit try/catch
   - Deutsche UI-Texte mit korrekten Umlauten
   - PowerShell via `runPS()` aus cmd-utils.js (30s Timeout)
3. **Keine Zwischenlösungen:** Der Fix muss ohne User-Aktion wirken (kein "Bitte F5 drücken")

## Phase 4: Verifizierung

1. **Datenfluss nochmal durchgehen:** Stimmt der Pfad jetzt?
2. **Seiteneffekte prüfen:** Könnte der Fix andere Features beeinträchtigen?
3. **Edge Cases bedenken:** Leere Daten, Fehler, Timeouts

## Phase 5: Dokumentation

1. **Git Commit:** `git add . && git commit -m "fix:v<version> - <Beschreibung>" && git push`
2. **Änderungsprotokoll:** Neuen Eintrag in `docs/protokoll/aenderungsprotokoll.md`
3. **Issue aktualisieren:** Status in `docs/issues/issue.md` auf "In Prüfung" setzen (NICHT auf erledigt - nur Simon darf das)

## Ausgabeformat

```markdown
## Bug-Fix: [Titel]

### Symptom
Was der User sieht/erlebt

### Wurzelursache
Die ECHTE Ursache im Code (mit Datei:Zeile)

### Fix
Was geändert wurde (mit Datei:Zeile)

### Geänderte Dateien
- datei.js:123 - Beschreibung der Änderung

### Risiko-Bewertung
Welche anderen Features könnten betroffen sein
```

## Verbotene Aussagen

- "Bitte F5 drücken" / "Bitte die App neu starten"
- "Bei mir funktioniert es" / "Der Code sieht korrekt aus"
- "Das sollte jetzt funktionieren" (ohne Beweis)

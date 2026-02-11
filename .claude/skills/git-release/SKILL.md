---
name: git-release
description: Erstellt ein vollständiges Release mit Versionsbump in package.json, Änderungsprotokoll-Update, Git-Tag und Push. Nutze diesen Skill wenn eine neue Version veröffentlicht werden soll. Aufruf mit /git-release [version oder major|minor|patch] [release-beschreibung].
---

# Release erstellen

Du erstellst ein vollständiges Release für die Speicher Analyse App.

## Argumente

- `$ARGUMENTS[0]` = Neue Version (z.B. `7.3.0`, `7.2.4`) ODER Bump-Typ: `major`, `minor`, `patch`
- `$ARGUMENTS[1]` = Release-Beschreibung (optional, wird aus Änderungsprotokoll abgeleitet falls leer)

## Ablauf

### 1. Aktuelle Version ermitteln

Lies `package.json` → `version` Feld.

**Versionierung (SemVer):**
- `major` = Breaking Changes (z.B. 7.0.0 → 8.0.0)
- `minor` = Neue Features (z.B. 7.2.0 → 7.3.0)
- `patch` = Bug-Fixes (z.B. 7.2.3 → 7.2.4)

Falls ein Bump-Typ statt expliziter Version angegeben wurde, berechne die nächste Version.

### 2. Prüfungen

1. **Git-Status sauber?** `git status` - keine uncommitteten Änderungen
2. **Auf main Branch?** `git branch --show-current` - muss `main` sein
3. **Remote aktuell?** `git fetch && git status` - kein Behind/Ahead

Falls Prüfungen fehlschlagen → dem User mitteilen und abbrechen.

### 3. Version bumpen

In `package.json` das `version` Feld aktualisieren:

```json
"version": "<neue-version>"
```

### 4. Änderungsprotokoll prüfen

Lies `docs/protokoll/aenderungsprotokoll.md`:
- Sammle alle Einträge seit der letzten Version
- Diese bilden die Release-Notes

Falls keine Einträge vorhanden → User warnen.

### 5. Git Commit + Tag + Push

```bash
git add package.json
git commit -m "release:v<neue-version> - <Release-Beschreibung>"
git tag -a v<neue-version> -m "<Release-Beschreibung>"
git push && git push --tags
```

**Tag-Format:** `v<version>` (z.B. `v7.3.0`)

### 6. Zusammenfassung

```markdown
## Release v<version>

### Version
- Vorherige: v<alte-version>
- Neue: v<neue-version>
- Typ: <major|minor|patch>

### Änderungen seit letztem Release
- <Eintrag 1 aus Änderungsprotokoll>
- <Eintrag 2>
- ...

### Git
- Commit: <hash>
- Tag: v<neue-version>
- Push: Erfolgreich
```

## Wichtige Hinweise

- **Niemals** `--force` verwenden
- **Immer** prüfen dass der Working Tree sauber ist
- **Tag-Nachricht** sollte die wichtigsten Änderungen zusammenfassen
- Falls der User keine Version angibt, schlage basierend auf den Änderungen einen Bump-Typ vor

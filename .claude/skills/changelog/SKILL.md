---
name: changelog
description: Fügt einen neuen Eintrag zum Änderungsprotokoll hinzu und archiviert automatisch bei >30 Einträgen. Nutze diesen Skill nach jeder Code-Änderung.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Glob
argument-hint: [typ] [beschreibung]
---

# Änderungsprotokoll aktualisieren

Du aktualisierst das Änderungsprotokoll des Projekts.

## Argumente

- `$ARGUMENTS[0]` = Typ: `fix`, `feature`, `improve`, `refactor`, `docs`
- `$ARGUMENTS[1]` = Beschreibung der Änderung (auf Deutsch, mit Umlauten)

Falls keine Argumente angegeben wurden, analysiere die letzten Git-Änderungen (`git diff HEAD~1` und `git log -1`) und leite Typ und Beschreibung selbst ab.

## Ablauf

### 1. Aktuelle Daten lesen

- Lies `docs/protokoll/aenderungsprotokoll.md`
- Lies `package.json` für die aktuelle Version
- Zähle die bestehenden Einträge in der Tabelle

### 2. Archivierung prüfen (max. 30 Einträge)

Falls die Tabelle bereits **30 Einträge** hat:
1. Erstelle eine Archivdatei: `docs/protokoll/archiv/aenderungsprotokoll_<version-range>.md`
2. Verschiebe die ältesten 15 Einträge dorthin (gleiche Tabellenstruktur)
3. Aktualisiere den Archiv-Link in der Hauptdatei
4. Aktualisiere die Nummerierung der verbleibenden Einträge

### 3. Neuen Eintrag hinzufügen

Füge einen neuen Eintrag **oben** in die Tabelle ein (nach dem Header):

```
| <nächsteNr> | <YYYY-MM-DD> | <version aus package.json> | <typ> | **<Kurztitel>** - <Detailbeschreibung> |
```

**Format-Regeln:**
- Datum: ISO-Format `YYYY-MM-DD` (heutiges Datum)
- Version: Aus `package.json` → `version` Feld (z.B. `v7.2.1`)
- Typ: Exakt wie angegeben (`fix`, `feature`, `improve`, `refactor`, `docs`)
- Beschreibung: **Fett-Kurztitel** gefolgt von Bindestrich und Details
- Sprache: Deutsch mit korrekten Umlauten (ä, ö, ü, ß)
- Keine Emojis

**Nummerierung:**
- Der neue Eintrag bekommt die nächste fortlaufende Nummer
- Bestehende Einträge behalten ihre Nummern

### 4. Bestätigung

Gib eine kurze Zusammenfassung aus:
- Welcher Eintrag hinzugefügt wurde
- Aktuelle Anzahl Einträge (von max. 30)
- Ob archiviert wurde

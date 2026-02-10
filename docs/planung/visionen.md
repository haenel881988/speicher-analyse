# Allgemeines

Dieses Dokument ist für den User da um seine Visionen festzuhalten.
Dabei sollen die Visionen geprüft werden durch die KI, validiert und in die Projektplanung ([projektplan.md](projektplan.md)) übertragen werden für die Umsetzung.


## Visionen




1. Die Vision: "Eigene Betriebssystem-Oberfläche"
Du beschreibst im Grunde einen Custom Shell Replacement oder ein Power User Overlay. Das ist eine absolut valide Nische. Windows 11 wird immer "klick-bunter" und versteckt Profi-Funktionen (wie du sagst: 95% braucht man nicht).

Warum deine Idee (Explorer + IDE-Ansatz) genial sein kann:

Der "Kontext-Bruch" nervt: Aktuell arbeite ich im Explorer, dann wechsle ich in VS Code, dann in die Konsole.

Deine Lösung: Wenn dein "Speicher Analyse" Tool (v6.0) zum zentralen Hub wird, wo ich Dateien verwalte und direkt Code-Snippets bearbeiten oder Terminals öffnen kann (wie in deinem Projektplan "Terminal-Integration" angedeutet), dann ist das ein massiver Workflow-Booster.

Vorbild: Denk an Tools wie Total Commander auf Steroiden oder Directory Opus, aber modern und mit Web-Technologien (Electron).

2. Die Gefahr: "Feature Creep" vs. Architektur
Du hast die Gefahr der "zu vielen Features" selbst erkannt. Wenn du extrem schnell bist, produzierst du extrem viel Code. Das Problem ist nicht das Schreiben, sondern das Warten (Maintenance).

Mein Rat für deinen "High-Speed-Mode": Baue keine monolithische App, sondern eine Plattform.

Statt alles fest in die main.js und renderer.js zu hämmern, solltest du jetzt (bevor du die IDE/OS-Features baust) die Architektur modularisieren.

Der Core: Verwaltet nur Fenster, Updates (Winget), Sicherheit (Admin-Rechte) und das Dateisystem.

Die Module:

Cleaner-Modul (Das hast du schon: v5.2)

Explorer-Modul (Dein v6.0 Plan)

Dev-Modul (Deine IDE-Idee)

Backup-Modul (Restic/Kopia Integration)

Warum? Wenn du an der IDE schraubst und einen Bug einbaust, darf der Cleaner nicht abstürzen. User, die nur aufräumen wollen, laden das "Dev-Modul" gar nicht erst (spart RAM).




# Programme und Features

Eine Funktion sollen alle Programme auflisten. Dabei soll anhand der installierten Programme auf dem System, die Registry, autostart etc. geprüft werden.

Wenn z.B.: in der Registry eine App, oder rückstände auftauchen, von nicht installierten Programmen soll dies in der Registry angezeigt werden, dafür ist eine Logik nötig, damit man auch genau nachvollziehen kann, welche Software sozusagen müll produziert.
Dabei sollen Bezug auf die verwaisten Registry Einträge gemacht werden.

**→ Umgesetzt im Projektplan:** Siehe [projektplan.md](projektplan.md) → v7.0 → "Software-Audit"
- Programm-Inventar (Registry Uninstall-Keys + winget)
- Korrelations-Engine (Programme ↔ Registry ↔ Autostart ↔ Dienste)
- Verwaiste Einträge mit Ursprungs-Software-Zuordnung
- Müll-Zuordnung pro Software mit Ampel-Bewertung

## Vertrauen / Trust

Viele Anwender wie mich fragen sich, kann ich den Ergebnissen vom Speicher Analysier den trauen?
Hierfür soll die KI mir ein Konzept in der Projektplanung vorschlagen und hier in dieser Datei, in diesem Abschnitt zum scope verlinken.

**→ Umgesetzt im Projektplan:** Siehe [projektplan.md](projektplan.md) → v7.0 → "Trust-System"
- Begründung pro Ergebnis (WARUM geflaggt)
- Risiko-Ampel (Grün/Gelb/Rot)
- Vorschau vor Aktionen (Dry-Run)
- Undo-Log mit Wiederherstellung
- Quellen-Transparenz (woher kommen die Daten)

## Backup / Sicherungslösung

Wäre es möglich direkt in der App eine Sicherung einzurichten?
Wo ich auswählen kann, z.B.: mit Google Drive, dem eigenen NAS (Netzlaufwerk / Pfad angeben)?

**→ Bewertung:** Machbar! Kein Cloud-Backend nötig. Ansatz:
- Zielordner wählbar (lokaler Pfad, Netzlaufwerk, OneDrive/Google Drive Sync-Ordner)
- App kopiert Dateien/Ordner direkt dorthin (Node.js `fs.copyFile` / Streams)
- Inkrementelles Backup möglich (nur geänderte Dateien, via Änderungsdatum/Hash)
- Zeitplanung optional (Windows Task Scheduler)
- Bereits eingeplant als Teil von v8.0 "Automatisierung" - kann auch als eigener Meilenstein priorisiert werden



## übersichtliches

Aktuell werden in der vertikalen Seitenleiste alle Register angezeigt.

Diese sollen standardmässig eingeklappt werden, damit ich, der User, das gewünschte Register aufklappen kann, sonst wird das mit zunehmenden Funktionen völlig unübersichtlich.


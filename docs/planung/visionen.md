# Visionen

> Dieses Dokument ist für den User da um seine Visionen festzuhalten.
> Visionen werden durch die KI geprüft, validiert und in die Projektplanung ([projektplan.md](projektplan.md)) übertragen.
> Simon bittet die KI, diese Datei zu sortieren und aktuell zu halten (was umgesetzt wurde, was nicht).

---

## Status-Legende

| Symbol | Bedeutung |
|--------|-----------|
| Umgesetzt | In einer Version implementiert |
| Teilweise | Grundlage vorhanden, Erweiterung nötig |
| Geplant | Im Projektplan eingeplant |
| Offen | Noch nicht eingeplant, Evaluation nötig |
| Ignoriert | Vom User bewusst zurückgestellt |

---

## 1. Customizing & UI

### 1.1 WCAG Kontrast — Teilweise (v7.2)

WCAG / Kontrastverhältnis stimmt noch immer nicht überein. Das muss vertieft werden. Der Kontrast muss zwingend WCAG 2.2 Konform sein.

**Status:** 6 Kontrastverletzungen in v7.2 behoben. Governance-Datei mit WCAG 2.2 AA Pflicht erstellt. User meldet: Kontrast muss weiter vertieft werden.

**→ Projektplan:** v7.3 — Umfassender WCAG-Audit aller Views

### 1.2 Resizable Panels / Fenster-Individualisierung — Offen

Aktuell werden die Fenster statisch angezeigt. Eine Umplatzierung der Fenster, also z.B.: Powershell / Terminal, das Vergrössern, Verkleinern der jeweiligen Sub-Fenster ist aktuell nicht möglich.
Für eine Individualisierung soll hier eine Möglichkeit evaluiert werden um das Ganze zu individualisieren.

**→ Projektplan:** v8.0+ — Resizable Panels (Drag-Resize für Terminal, Dual-Panel, Explorer-Bereiche)

### 1.3 Sidebar einklappbar — Umgesetzt (v7.1)

> ~~Aktuell werden in der vertikalen Seitenleiste alle Register angezeigt. Diese sollen standardmässig eingeklappt werden.~~

**Erledigt:** 6 Navigationsgruppen, standardmässig eingeklappt, Zustand per localStorage gespeichert.

---

## 2. Terminal & Shell

### 2.1 PowerShell-Integration — Teilweise (v7.2)

Powershell also das Terminal ist noch sehr rudimentär, es soll hierfür eine nahtlose Integration vom Powershell von Windows implementiert werden.

**Status:** Multi-Shell Support (PowerShell/CMD/WSL) in v7.2 implementiert. Shell-Selector, dynamische Prompts, Rechtsklick "Im Terminal öffnen" funktioniert. Aber: Terminal ist noch textbasiert (Zeile-für-Zeile), keine echte Terminal-Emulation.

**→ Projektplan:** v8.0+ — xterm.js + node-pty für echte Terminal-Emulation (Farben, Cursor, Interaktivität)

### 2.2 Claude CLI im Terminal — Offen

Wenn ich eintippe: Claude soll dann auch Claude gestartet werden, da ich im Windows Powershell bereits Claude über CLI / Powershell installiert habe. Dies wäre ein weiterer hoher nützlicher Mehrwert.

**→ Projektplan:** Hängt von 2.1 ab (xterm.js). Mit echtem Terminal-Emulator wird Claude CLI automatisch funktionieren, da der eingebettete Terminal dann eine echte Shell-Sitzung ist.

---

## 3. Programme & System

### 3.1 Software-Audit — Umgesetzt (v7.0)

> ~~Eine Funktion soll alle Programme auflisten. Dabei soll anhand der installierten Programme auf dem System die Registry, Autostart etc. geprüft werden. Wenn z.B. in der Registry Rückstände auftauchen von nicht installierten Programmen, soll dies angezeigt werden.~~

**Erledigt:**
- Programm-Inventar (Registry Uninstall-Keys + winget)
- Korrelations-Engine (Programme ↔ Registry ↔ Autostart ↔ Dienste)
- Verwaiste Einträge mit Ursprungs-Software-Zuordnung
- Müll-Zuordnung pro Software mit Ampel-Bewertung

### 3.2 Vertrauen / Trust — Teilweise (v7.0)

Viele Anwender fragen sich, kann ich den Ergebnissen vom Speicher Analysierer trauen?

**Status:** Phase 1 umgesetzt (Begründung + Risiko-Ampel für Registry-Cleaner und Software-Audit). Vorschau/Dry-Run für Lösch-Aktionen. Fehlt noch: vollständiges Undo-Log mit Wiederherstellung.

**→ Projektplan:** v8.0 — Undo-Log (Phase 3 des Trust-Systems)

### 3.3 Backup / Sicherung — Geplant (v8.0)

Wäre es möglich direkt in der App eine Sicherung einzurichten? Wo ich auswählen kann, z.B.: mit Google Drive, dem eigenen NAS (Netzlaufwerk / Pfad angeben)?

**Bewertung:** Machbar! Kein Cloud-Backend nötig.
- Zielordner wählbar (lokaler Pfad, Netzlaufwerk, OneDrive/Google Drive Sync-Ordner)
- Inkrementelles Backup (nur geänderte Dateien)
- Zeitplanung optional (Windows Task Scheduler)

**→ Projektplan:** v8.0 — Backup-Modul

---

## 4. Architektur-Vision: "Eigene Betriebssystem-Oberfläche" — Langfristig

Die Vision: Custom Shell Replacement / Power User Overlay. Windows 11 wird immer "klick-bunter" und versteckt Profi-Funktionen.

Wenn das "Speicher Analyse" Tool zum zentralen Hub wird, wo man Dateien verwaltet und direkt Code-Snippets bearbeiten oder Terminals öffnen kann, dann ist das ein massiver Workflow-Booster.

Vorbild: Total Commander auf Steroiden oder Directory Opus, aber modern mit Web-Technologien (Electron).

### Architektur-Empfehlung: Plattform statt Monolith

Statt alles fest in die main.js und renderer.js zu hämmern → Architektur modularisieren:

- **Core:** Fenster, Updates, Sicherheit, Dateisystem
- **Cleaner-Modul** (v5.2 — vorhanden)
- **Explorer-Modul** (v6.0 — vorhanden)
- **Dev-Modul** (Monaco Editor — v7.1 Basis vorhanden)
- **Backup-Modul** (v8.0 geplant)

**→ Projektplan:** v1.5.0 — Plugin-System (modulare Architektur)

---

## 5. Experimentelles — KI-Integration

### 5.1 "Bring Your Own Brain" (BYOB) — Offen

Statt eine eigene KI einzubauen, nur die Schnittstellen bauen:

**A. Cloud-Option (Für Bequeme):**
- User meldet sich via CLI/Powershell an (Claude, Gemini, etc.)
- 0 Euro Serverkosten, User zahlt eigene API-Nutzung
- API-Key lokal in Electron `safeStorage` verschlüsselt
- Direkte Verbindung PC → API (kein Proxy)

**B. Local-Option (Für Profis):**
- Integration mit Ollama (localhost:11434)
- App prüft beim Start ob Ollama läuft
- Falls ja: Dropdown mit installierten Modellen (Llama 3, Mistral, etc.)
- Falls nein: Button "Lokale KI einrichten" → Terminal-Modul
- 100% offline fähige KI

**→ Projektplan:** v9.0+ — KI-Integration (BYOB)

### 5.2 "Notion-Modul" mit KI-Power — Offen

"Active Knowledge Board" — Neben jedem Textblock ein KI-Assistent:
- "Fasse diesen PDF-Anhang zusammen" (via PDF-Modul + Llama 3)
- "Erkläre diesen Registry-Key" (via Registry-Analyse)
- "Schreibe diese Notiz professioneller"

**→ Projektplan:** v9.0+ — Abhängig von 5.1 (BYOB)

### 5.3 Offline-Lizenzierung — Offen

Asymmetrische Kryptographie (Ed25519):
- Server hat Private Key → generiert Lizenz-Datei
- App hat Public Key → prüft Signatur offline
- App muss niemals "nach Hause telefonieren"
- Lifetime-Lizenz funktioniert auch wenn Server offline

**→ Projektplan:** v1.0.0 — Lizenzierung (Teil des stabilen Releases)

---

## 6. Marketing Vision — Ignoriert (für später)

> **ACHTUNG:** Bitte diesen Scope ignorieren, das ist alles erstmal für später umzusetzen.

Enthält: Collector's Edition (1999 CHF), Scarcity-Strategie, Unboxing-Erlebnis, Founder's Edition.
Wird erst relevant wenn v1.0.0 (stabiler Release) erreicht ist.

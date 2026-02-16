# Migrations-Checkliste

> Pflicht-Checkliste für Framework-/Architektur-Migrationen (z.B. Electron → Tauri).
> Lesson Learned: Bei der Electron→Tauri-Migration (Feb 2026) wurden Skills, Governance
> und CLAUDE.md NICHT mitmigriert → 103+ systematische Fehler in der Codebasis.

---

## Phase 1: VOR der Migration

- [ ] **Bestandsaufnahme erstellen:**
  - Alle Skills in `.claude/skills/` auflisten
  - Alle referenzierten Dateipfade in Skills notieren
  - Governance-Regeln in `docs/planung/governance.md` prüfen
  - CLAUDE.md-Regeln prüfen (Techstack, Architektur, Konventionen)
  - `docs/issues/anforderungen.md` Section 12 (Implementierungs-Status) prüfen

- [ ] **Abhängigkeiten identifizieren:**
  - Welche Skills referenzieren Framework-spezifische Dateien? (z.B. preload.js, ipc-handlers.js)
  - Welche Governance-Regeln sind Framework-spezifisch? (z.B. Electron Security Headers)
  - Welche CLAUDE.md-Regeln müssen sich ändern?

- [ ] **Migrations-Issue erstellen** in `docs/issues/issue.md`

---

## Phase 2: WÄHREND der Migration

- [ ] **Code migrieren** (Backend + Frontend)
- [ ] **Für jede migrierte Datei prüfen:**
  - Referenziert ein Skill diese Datei? → Skill-Pfad aktualisieren
  - Ändert sich das IPC-Muster? → Bridge-Skill, Feature-Skill, Bug-Skill aktualisieren
  - Ändert sich das Build-System? → Release-Skill aktualisieren
  - Ändert sich die Security-Architektur? → Audit-Skill, Governance aktualisieren

---

## Phase 3: NACH der Migration

### Skills aktualisieren (`.claude/skills/`)

- [ ] **Jeden Skill öffnen und prüfen:**
  - Dateipfade stimmen? (z.B. `src-tauri/src/commands.rs` statt `main/ipc-handlers.js`)
  - Code-Templates stimmen? (z.B. `#[tauri::command]` statt `ipcMain.handle`)
  - Security-Checklisten aktuell? (z.B. Tauri CSP statt Electron Security Headers)
  - Toolchain-Referenzen aktuell? (z.B. `cargo tauri dev` statt `npx electron .`)

- [ ] **Nicht mehr passende Skills löschen** (z.B. `/add-ipc` → `/add-tauri-command`)
- [ ] **Fehlende Skills erstellen** für neue Architektur-Patterns

### Steuerungsdokumente aktualisieren

- [ ] **CLAUDE.md:**
  - Tech Stack aktualisieren
  - Architektur-Beschreibung aktualisieren
  - Starten-Befehle aktualisieren
  - Skill-Tabelle aktualisieren
  - Security-Regeln an neues Framework anpassen

- [ ] **governance.md:**
  - Alle Framework-spezifischen Regeln aktualisieren
  - Neue Security-Patterns dokumentieren (z.B. Tauri Capabilities statt Electron contextIsolation)
  - Build/Version-Pfade aktualisieren

- [ ] **anforderungen.md:**
  - Section 12: Implementierungs-Status komplett neu prüfen
  - Stub-Liste aktualisieren (was ist implementiert, was nicht?)
  - Backend-Funktions-Referenzen aktualisieren

- [ ] **Auto-Memory** (`~/.claude/projects/.../memory/MEMORY.md`):
  - Key Files aktualisieren
  - Tech Stack aktualisieren
  - Lessons Learned ergänzen

### Verifikation

- [ ] **`/audit-code all` ausführen** — vollständiges Audit nach Migration
- [ ] **Jede MUSS-Anforderung in anforderungen.md prüfen**
- [ ] **Alle Stubs identifizieren und in Section 12 dokumentieren**
- [ ] **Änderungsprotokoll aktualisieren** mit Migrations-Zusammenfassung

---

## Typische Fehler bei Migrationen (Lessons Learned)

| Fehler | Konsequenz | Vermeidung |
|--------|------------|------------|
| Skills nicht mitmigriert | KI erzeugt Code für altes Framework | Phase 3: Skills prüfen |
| Governance nicht aktualisiert | Security-Regeln passen nicht zur neuen Architektur | Phase 3: Governance prüfen |
| CLAUDE.md nicht aktualisiert | KI hat falsches mentales Modell | Phase 3: CLAUDE.md prüfen |
| Stubs nicht dokumentiert | User denkt Features funktionieren | Phase 3: anforderungen.md |
| Alte Dateien nicht gelöscht | Verwirrung durch tote Code-Referenzen | Phase 2: Aufräumen |
| Skills referenzieren gelöschte Dateien | Skill-Ausführung schlägt fehl | Phase 3: Pfade prüfen |

---

*Erstellt: 2026-02-16 | Anlass: Electron→Tauri v2 Migration*

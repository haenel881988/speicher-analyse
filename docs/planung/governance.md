# Governance - Qualitätsstandards (Tauri v2)

> Verbindliche Qualitätsanforderungen für die Speicher Analyse App. Jede Änderung muss diese Standards einhalten.
> Aktualisiert für Tauri v2 (Rust-Backend + System-WebView) am 16.02.2026.

---

## 1. Security (KRITISCH)

### Command Injection (Rust/PowerShell)
- **Alle** User-Parameter die in `format!()` für PowerShell eingesetzt werden → `.replace("'", "''")` PFLICHT
- **IP-Adressen** per Regex validieren: `^(\d{1,3}\.){3}\d{1,3}$` + Wertebereich prüfen
- **Enum-Parameter** (z.B. "Inbound"/"Outbound") per `match` auf Whitelist prüfen
- **Dateipfade** vom Frontend validieren: Existenz + innerhalb erlaubter Verzeichnisse
- Kein `format!()` mit unvalidiertem User-Input — keine Ausnahme

### XSS-Prävention
- **VERBOTEN:** `innerHTML` mit unescapten Variablen → `innerHTML = \`...\${variable}...\``
- **Fehlermeldungen:** Immer mit `textContent` oder `createElement`, nie mit `innerHTML`
- **Dynamische Inhalte:** `escapeHtml()` aus `renderer/js/utils.js` importieren und verwenden
- **Zentrale Escape-Funktion:** Eine einzige `escapeHtml()` in `utils.js` — keine eigenen Varianten pro View
- **showToast():** Die zentrale Toast-Funktion muss XSS-sicher sein — keine Duplikate erstellen

### Tauri-Sicherheitskonfiguration
- **CSP:** `tauri.conf.json` → `security.csp` MUSS konfiguriert sein (NICHT `null`)
- **withGlobalTauri:** MUSS `false` sein
- **Capabilities:** Minimal-Prinzip — nur benötigte APIs freigeben
- **Single Instance:** `tauri-plugin-single-instance` verwenden

### Destruktive Operationen
- **Löschen/Überschreiben:** Pfad-Validierung im Backend + Bestätigungsdialog im Frontend
- **Bestätigungsdialog:** `window.api.showConfirmDialog()` statt `confirm()` verwenden
- **Keine stillschweigenden Löschungen:** Jede Dateiänderung braucht User-Bestätigung

---

## 2. Kontrast & Barrierefreiheit

### WCAG 2.2 AA (Pflicht)
- **Normaler Text** (< 18px / < 14px bold): Kontrastverhältnis **mindestens 4.5:1**
- **Großer Text** (≥ 18px / ≥ 14px bold): Kontrastverhältnis **mindestens 3:1**
- **UI-Komponenten** (Buttons, Icons, Rahmen): Kontrastverhältnis **mindestens 3:1**
- Gilt für **beide Themes** (Dark + Light)

### Prüfverfahren
- **Visuelle Prüfung via `/visual-verify`** bei jeder CSS-Änderung an Farben oder Hintergründen (PFLICHT)
- **Keine rein theoretische Prüfung** — gerenderte Werte via `getComputedStyle` zählen, nicht CSS-Variablen
- Formel: `(L1 + 0.05) / (L2 + 0.05)` wobei L = relative Luminanz
- Bei Grenzfällen (4.5:1 - 5.0:1): Dokumentation der berechneten Werte im Commit

### Farbvariablen-Regeln
- Jede neue CSS-Variable **muss** in beiden Themes definiert werden
- `--accent` (#6c5ce7) NUR für Borders/Backgrounds — NIEMALS für Text
- `--accent-text` (#c4b5fd) für Labels — NIEMALS für Inhaltstext
- `--text-primary` für Inhaltstext (Dateinamen, Beschreibungen)
- `rgba()`-Farben auf transparentem Hintergrund: Effektive Farbe berechnen

### ARIA-Attribute (Mindestanforderungen)
- Tree-Views: `role="tree"`, `role="treeitem"`, `aria-expanded`
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`
- Toasts/Alerts: `role="alert"`, `aria-live="polite"`
- Icon-Buttons ohne Text: `aria-label`
- Toggle-Switches: `role="switch"`, `aria-checked`
- Score-Ringe: `role="progressbar"`, `aria-valuenow`

---

## 3. Sprache & Lokalisierung

- Alle user-sichtbaren Texte auf **Deutsch**
- Korrekte Umlaute: **ä, ö, ü, ß** (nicht ae, oe, ue, ss)
- Fehlermeldungen auf Deutsch
- Technische Log-Ausgaben (console.log/error) dürfen Englisch sein

---

## 4. Performance

- **Kein blockierender Code** im Rust-Backend — `tokio::fs::*` statt `std::fs::*`, `spawn_blocking` für CPU-intensive Ops
- **Kein `animation: infinite`** in CSS (GPU-/CPU-Last auch bei `display: none`)
- **Chart.js**: Immer `animation: false` setzen
- **PowerShell-Timeout:** Jeder `run_ps()` Aufruf MUSS mit `tokio::time::timeout()` gewrappt werden (30s Standard)
- **Keine parallelen PowerShell-Prozesse** — sequenziell aufrufen (hungern sich gegenseitig aus)
- **Lazy Loading** für schwere Libraries (Monaco, pdf.js)

---

## 5. Memory-Leak-Prävention

- **Jeder `setInterval`** → Interval-ID speichern, in `destroy()` mit `clearInterval()` stoppen
- **Event-Listener** nur EINMAL registrieren (Flag-Pattern). Bei wiederholtem Aufruf prüfen
- **`ResizeObserver`** → in `destroy()` mit `.disconnect()` beenden
- **DOM-Elemente** (Overlays, Modals) → in `destroy()` entfernen
- **Jede View** MUSS eine `destroy()`-Funktion haben
- **`app.js`** MUSS `destroy()` auf der alten View aufrufen bevor eine neue aktiviert wird

---

## 6. Versionierung

- **Konsistente Version** an allen 3 Stellen:
  - `src-tauri/Cargo.toml` → `[package] version` (Hauptquelle)
  - `src-tauri/tauri.conf.json` → `version`
  - `renderer/index.html` → `.toolbar-version` (falls vorhanden)
- **Semantische Versionierung**: MAJOR.MINOR.PATCH
- Bei Feature-Release: Alle drei Stellen gleichzeitig aktualisieren

---

## 7. Architektur (Tauri v2)

- **IPC-Muster**: Alle Frontend-Backend-Kommunikation über Tauri `invoke()`
  - `src-tauri/src/commands.rs` → `#[tauri::command]` Funktionen
  - `src-tauri/src/lib.rs` → Command-Registrierung in `generate_handler![]`
  - `renderer/js/tauri-bridge.js` → Bridge-Mapping mit `makeInvoke()`
  - Frontend ruft `window.api.methodName()` auf
- **PowerShell:** Über `crate::ps::run_ps()` / `run_ps_json()` — nie direkt `std::process::Command`
- **Parameter-Escaping:** VOR `format!()` — `.replace("'", "''")`
- **ES Modules**: Frontend nutzt `import/export`, kein Build-Step
- **Kein `await` in nicht-async Callbacks** → `.then()` verwenden

---

## 8. Dokumentation

- **Jede Änderung** im Änderungsprotokoll dokumentieren (`docs/protokoll/aenderungsprotokoll.md`)
- **docs/-Struktur**: Von Claude verwaltet, keine losen Dateien
- **Lessons Learned**: Schwierige Bugs im Änderungsprotokoll als "Lessons Learned" festhalten
- **CLAUDE.md**: Bei Architektur-Änderungen aktualisieren
- **Skills**: Bei Framework-Migrationen ALLE Skills mitmigrieren (Lesson aus Electron→Tauri)

---

## 9. UI/UX

- **Keyboard-Navigation**: Alle Funktionen per Tastatur erreichbar
- **Tooltips**: Für Icon-Buttons ohne Text-Label
- **Konsistente Benennung**: Deutsche Menübeschriftungen, keine Mischung
- **Keine `:hover`-Effekte** für Layout-Änderungen (nur für visuelle Hervorhebung)
- **Toast-Nachrichten**: Für Bestätigungen und Fehler, nicht für Routine-Aktionen
- **Bestätigungsdialoge**: Für alle destruktiven Operationen (Löschen, Überschreiben)

---

## 10. Audit-Schedule

| Anlass | Aktion |
|--------|--------|
| 5+ Dateien geändert oder neues Feature | `/security-scan all` |
| Vor jedem Release | `/audit-code all` |
| Nach Framework-Migration | `/audit-code all` + Migrations-Checkliste |
| Neuer PowerShell-Command | Security-Checkliste aus `/powershell-cmd` |
| CSS-Farbänderungen | `/wcag-check` |
| Stub implementiert | `anforderungen.md` Section 12 aktualisieren |

---

## 11. Stub-Management

### Konvention: Backend-Stubs

Jeder Stub in `commands.rs` MUSS sich durch seine Antwort als Stub kennzeichnen:

```rust
// RICHTIG: Stub kennzeichnet sich selbst
Ok(json!({ "stub": true, "message": "Datenschutz-Einstellung anwenden ist noch nicht implementiert" }))

// FALSCH: Stub täuscht Erfolg vor
Ok(json!({ "success": true }))
```

### Konvention: Frontend-Erkennung

Jeder Frontend-Aufruf eines potentiellen Stubs MUSS die Antwort prüfen:

```javascript
import { isStub } from './utils.js';

const result = await window.api.applyPrivacySetting(id);
if (isStub(result, 'Datenschutz-Einstellung anwenden')) return;
// ... echte Verarbeitung nur wenn kein Stub
```

### Regeln

- **Stubs MÜSSEN als solche erkennbar sein**: `{ stub: true }` statt `{ success: true }`
- **Frontend MUSS Stub-Antworten erkennen** via `isStub()` aus `renderer/js/utils.js`
- **Kritische Stubs** (Privacy, Preferences, Session) haben höchste Implementierungs-Priorität
- **anforderungen.md** Section 12 führt den Status jeder Methode (Stub/Implementiert/Teilweise)
- **Kein Stub als "Fertig" markieren** — nur Simon darf Features als erledigt markieren
- **escapeHtml()**: Zentral in `utils.js` — KEINE eigenen Varianten pro View

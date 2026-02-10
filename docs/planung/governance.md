# Governance - Qualitätsstandards

> Verbindliche Qualitätsanforderungen für die Speicher Analyse App. Jede Änderung muss diese Standards einhalten.

---

## 1. Kontrast & Barrierefreiheit

### WCAG 2.2 AA (Pflicht)
- **Normaler Text** (< 18px / < 14px bold): Kontrastverhältnis **mindestens 4.5:1**
- **Großer Text** (≥ 18px / ≥ 14px bold): Kontrastverhältnis **mindestens 3:1**
- **UI-Komponenten** (Buttons, Icons, Rahmen): Kontrastverhältnis **mindestens 3:1**
- Gilt für **beide Themes** (Dark + Light)

### Prüfverfahren
- **Manuelle Prüfung durch KI** bei jeder CSS-Änderung an Farben oder Hintergründen
- **Keine automatisierten Skripte** - die KI berechnet die Kontrastverhältnisse selbst
- Formel: `(L1 + 0.05) / (L2 + 0.05)` wobei L = relative Luminanz
- Bei Grenzfällen (4.5:1 - 5.0:1): Dokumentation der berechneten Werte im Commit

### Farbvariablen-Regeln
- Jede neue CSS-Variable **muss** in beiden Themes definiert werden
- Akzentfarben für Text (`--accent-text`) müssen höheren Kontrast haben als dekorative Akzente (`--accent`)
- `rgba()`-Farben auf transparentem Hintergrund: Effektive Farbe berechnen, nicht die Transparenz ignorieren

---

## 2. Sprache & Lokalisierung

- Alle user-sichtbaren Texte auf **Deutsch**
- Korrekte Umlaute: **ä, ö, ü, ß** (nicht ae, oe, ue, ss)
- Fehlermeldungen auf Deutsch
- Technische Log-Ausgaben (console.log) dürfen Englisch sein

---

## 3. Performance

- **Kein `execSync`** im Main-Process (friert die UI ein)
- **Kein `animation: infinite`** in CSS (GPU-/CPU-Last auch bei `display: none`)
- **Chart.js**: Immer `animation: false` setzen
- **Worker Threads** für aufwändige Operationen (Scanner, Hashing, Deep Search)
- **Lazy Loading** für schwere Libraries (Monaco, pdf.js)

---

## 4. Sicherheit

- **OWASP Top 10** beachten
- **Command Injection**: Immer `execFile` mit Array-Args, nie String-Interpolation in Shell-Befehle
- **Registry**: `BLOCKED_PATHS` in `registry.js` respektieren
- **Dateipfade**: Pfade mit `path.resolve()` auflösen, Sonderzeichen escapen
- **IPC**: Alle Handler mit Input-Validierung

---

## 5. Versionierung

- **Konsistente Version** in allen Stellen:
  - `package.json` → `version`
  - `renderer/index.html` → `.toolbar-version`
  - `renderer/js/settings.js` → `.settings-version`
- **Semantische Versionierung**: MAJOR.MINOR.PATCH
- Bei Feature-Release: Alle drei Stellen gleichzeitig aktualisieren

---

## 6. Architektur

- **IPC-Muster**: Alle Frontend-Backend-Kommunikation über `contextBridge`
  - `main/preload.js` → API-Surface
  - `main/ipc-handlers.js` → Handler-Registrierung
  - Frontend ruft `window.api.methodName()` auf
- **Single-Instance**: `app.requestSingleInstanceLock()` ist Pflicht (GPU-Cache-Konflikte)
- **GPU-Cache**: `--disable-gpu-shader-disk-cache` aktiv halten
- **ES Modules**: Frontend nutzt `import/export`, kein Build-Step
- **Kein `await` in nicht-async Callbacks** → `.then()` verwenden

---

## 7. Dokumentation

- **Jede Änderung** im Änderungsprotokoll dokumentieren (`docs/protokoll/aenderungsprotokoll.md`)
- **docs/-Struktur**: Von Claude verwaltet, keine losen Dateien
- **Lessons Learned**: Schwierige Bugs im Änderungsprotokoll als "Lessons Learned" festhalten
- **CLAUDE.md**: Bei Architektur-Änderungen aktualisieren

---

## 8. UI/UX

- **Keyboard-Navigation**: Alle Funktionen per Tastatur erreichbar
- **Tooltips**: Für Icon-Buttons ohne Text-Label
- **Konsistente Benennung**: Deutsche Menübeschriftungen, keine Mischung
- **Keine `:hover`-Effekte** für Layout-Änderungen (nur für visuelle Hervorhebung)
- **Toast-Nachrichten**: Für Bestätigungen und Fehler, nicht für Routine-Aktionen

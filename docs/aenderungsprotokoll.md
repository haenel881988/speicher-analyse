# Änderungsprotokoll

> **Regel:** Maximal 30 Einträge. Bei Überschreitung die ältesten in `docs/aenderungsprotokoll_archiv.md` verschieben.

---

| # | Datum | Version | Typ | Beschreibung |
|---|-------|---------|-----|-------------|
| 1 | 2026-02-10 | v7.0 | fix | **Eingefrorene UI behoben** - Single-Instance-Lock (`app.requestSingleInstanceLock()`) verhindert mehrere Electron-Instanzen. Ursache: Minimize-to-Tray + erneuter Start = zweite Instanz, GPU-Cache gesperrt ("Zugriff verweigert"), Renderer zeigt nur statisches Bild. Zusätzlich `--disable-gpu-shader-disk-cache` gesetzt. |
| 2 | 2026-02-10 | v7.0 | fix | **Debug-Code entfernt** - DevTools, Click-Test-Button, Console-Forwarding und Debug-Logging aus main.js, index.html, app.js entfernt. |
| 3 | 2026-02-10 | v7.0 | improve | **Omnibar-Suche: Ergebnisse gruppiert** - Ordner werden vor Dateien angezeigt, mit visuellen Gruppenheadern. Innerhalb jeder Gruppe: Qualität absteigend, dann alphabetisch. |
| 4 | 2026-02-10 | v7.0 | improve | **Omnibar-Suche: Relevanz-Algorithmus** - Neuer `scoreMatch()`-Algorithmus ersetzt naive Prefix-Suche. Positionsbasiertes Scoring (Name startet mit > Wortgrenze > irgendwo). Min. Prefix-Länge von 40% auf 60% erhöht. Mid-Word-Matches nur bei ≥80% Übereinstimmung. Eliminiert irrelevante Treffer wie "api-kosten" bei Suche nach "steuern". |

---

## Lessons Learned

### #1: GPU-Cache-Sperre durch Minimize-to-Tray (2026-02-10)

**Problem:** App erschien "eingefroren" - Fenster sichtbar aber nichts anklickbar. GPU-Cache-Fehler in der Konsole:
```
[ERROR:cache_util_win.cc(20)] Unable to move the cache: Zugriff verweigert (0x5)
[ERROR:gpu_disk_cache.cc(713)] Gpu Cache Creation failed: -2
```

**Ursache:** Minimize-to-Tray versteckt das Fenster beim X-Klick, Prozess läuft weiter. Bei erneutem `npm start` startet eine zweite Electron-Instanz. Diese kann den GPU-Shader-Cache nicht öffnen (von Instanz 1 gesperrt). GPU-Prozess schlägt fehl → Renderer zeigt nur ein statisches Bild → UI "eingefroren".

**Schwierigkeit bei der Diagnose:**
- `executeJavaScript` funktionierte (DOM war responsiv)
- Click-Handlers waren korrekt registriert
- CSS zeigte keine Blockaden
- `init()` lief ohne Fehler durch
- → Das Problem war NICHT im Code sondern im GPU-Rendering-Prozess

**Lösung:**
1. `app.requestSingleInstanceLock()` - verhindert mehrere Instanzen
2. `second-instance`-Handler zeigt bestehendes Fenster
3. `--disable-gpu-shader-disk-cache` - kein GPU-Cache auf Festplatte

**Lehre:**
- Bei Electron-Apps mit Tray: **IMMER** Single-Instance-Lock verwenden!
- GPU-Cache-Fehler sind NICHT harmlos wenn sie "Zugriff verweigert" sagen
- Wenn diagnostischer Code zeigt "alles OK" aber UI trotzdem eingefroren → GPU-Prozess-Ebene prüfen
- `disableHardwareAcceleration()` löst das Problem NICHT (hilft nur bei GPU-Treiber-Problemen)

---

### #2: `await` in nicht-async Callbacks (2026-02-09)

**Problem:** `await` innerhalb eines nicht-async `switch/case`-Callbacks verursacht einen SyntaxError der das gesamte ES-Modul am Laden hindert. Kein Fehler sichtbar, Modul lädt einfach nicht.

**Lösung:** `.then()` statt `await` in nicht-async Callbacks verwenden.

**Lehre:** CRITICAL - Immer prüfen ob der umgebende Callback `async` ist bevor `await` verwendet wird.

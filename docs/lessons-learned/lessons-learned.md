# Lessons Learned

> **PFLICHT:** JEDER Fehler wird hier dokumentiert, egal wie klein. Fehler dürfen NIEMALS ein zweites Mal auftreten.
> **Verwaltung:** Die KI verwaltet diese Datei, ihre Inhalte und Unterverzeichnisse eigenständig — keine Obergrenze.
> **Struktur:** Hierarchisch nach Kategorie, chronologisch innerhalb. Originale Nummern (#) bleiben erhalten.

---

## Allgemein

<br>

#### #2 — Session-Save im before-quit muss synchron sein
`2026-02-10`

Electrons `before-quit` wartet NICHT auf async Operationen.

**Lösung:** `zlib.gzipSync()` + `fs.writeFileSync()`.

**Lehre:** Electron Lifecycle-Events sind synchron — für Cleanup immer synchrone APIs verwenden.

---

#### #4 — Node.js Buffer.buffer enthält Pool-Daten
`2026-02-10`

`buffer.buffer` ist der unterliegende ArrayBuffer des GESAMTEN Pools. `new Uint8Array(buffer.buffer)` enthält Müll-Daten.

**Lösung:** `.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)`.

---

#### #5 — Electron Admin-Elevation: Single-Instance Lock Race Condition
`2026-02-11`

`app.quit()` ist ASYNC, `requestSingleInstanceLock()` Race Condition.

**Lösung:** `releaseSingleInstanceLock()` VOR Spawn + `app.exit(0)` statt `app.quit()` + `execFileAsync` statt `execAsync`.

---

#### #7 — Bei User-Fehlermeldung ganzheitlich prüfen
`2026-02-16`

NIEMALS nur den gemeldeten Fall fixen. IMMER prüfen ob weitere Funktionen betroffen sind.

**Lehre:** Der User darf NIEMALS zweimal auf dasselbe Problem hinweisen.

---

#### #17 — Log-Dateien ohne Rotation
`2026-02-17`

26 Log-Dateien in `docs/logs/`, kein automatisches Aufräumen.

**Lösung:** Beim App-Start älteste Logs über Maximum (20) löschen.

---

#### #18 — Bug-Drift durch oberflächliche Analyse
`2026-02-17`

Fixes eingeführt die neue Bugs erzeugen (z.B. `detect_os()` zeigt "Windows" in Modell-Spalte).

**Lehre:** JEDE Änderung muss den vollständigen Datenfluss Frontend → Backend → Frontend prüfen. NIE nur eine Seite ändern.

---

#### #24 — Autostart: Substring-Match trifft RunOnce
`2026-02-17`

`locationLabel.contains("HKCU\\Run")` matcht auch `"HKCU\RunOnce"`. Spezifischere Patterns MÜSSEN zuerst geprüft werden.

**Lösung:** RunOnce-Check VOR Run-Check in if/else-Kette.

---

#### #30 — Umlaute in PowerShell-Strings
`2026-02-17`

`get_privacy_recommendations` nutzte ae/oe/ue statt ä/ö/ü.

**Lehre:** Rust-Quellcode ist UTF-8, PowerShell-Strings in `r#"..."#` können echte Umlaute enthalten.

---

#### #33 — correlate_software: Falscher Feldname
`2026-02-17`

Backend erwartete `displayName`, aber `audit_software` liefert `name`.

**Lösung:** Fallback `.get("displayName").or_else(|| .get("name"))`.

**Lehre:** Bei Funktionen die Daten von anderen Funktionen erhalten, IMMER die Feldnamen beider Seiten prüfen.

---

#### #35 — get_system_profile: partitions=0
`2026-02-17`

Disk-Partitionsanzahl war hart auf 0 kodiert.

**Lösung:** `Get-Disk` pro PhysicalDisk abfragen für `NumberOfPartitions`.

---

#### #42 — uninstall_bloatware: False Success
`2026-02-17`

`Ok(success: true)` auch wenn `packageFullName` fehlte (nichts deinstalliert).

**Lösung:** Fehler zurückgeben wenn Pflichtfeld fehlt.

**Lehre:** Destruktive Operationen MÜSSEN bei fehlendem Input `Err()` zurückgeben, nie stillschweigend "Erfolg" melden.

---

#### #45 — get_update_history: Kein try/catch
`2026-02-17`

COM-Objekt-Aufruf ohne Fehlerbehandlung.

**Lösung:** try/catch mit Fallback auf leeres Array (konsistent mit `check_windows_updates`).

---

#### #46 — deep_search_start: use_regex ignoriert
`2026-02-17`

Parameter `_use_regex` mit Underscore-Prefix → nie verwendet.

**Lösung:** Implementiert als `-match` (Regex) vs. `-like` (Wildcard) Umschaltung in PowerShell-Script.

---

#### #48 — terminal_create: Spawn-Fehler = Ok statt Err
`2026-02-17`

Bei fehlgeschlagenem Prozess-Start wurde `Ok({"id": null})` statt `Err()` zurückgegeben. Frontend musste `id == null` prüfen statt normaler Fehlerbehandlung.

**Lösung:** `Err()` zurückgeben.

---

#### #49 — ps.rs: UTF-8 Panic bei Byte-Slicing
`2026-02-17`

`&trimmed[..120]` und `&output[..200]` sind Byte-Indizes. Bei Multi-Byte UTF-8 (Umlaute = 2 Bytes) kann der Index mitten in einem Zeichen landen → `panic!("byte index is not a char boundary")`.

**Lösung:** `is_char_boundary()` Loop findet sicheren Schneidepunkt.

**Lehre:** NIEMALS `&str[..n]` mit hartem Byte-Index — immer Char-Boundary prüfen.

---

#### #52 — scan.rs: normalize_dir_key ohne Case-Normalisierung
`2026-02-17`

Windows-Dateisystem ist case-insensitive. `C:\Users` und `c:\users` sind derselbe Pfad. Ohne Lowercase-Normalisierung schlägt der Verzeichnis-Index-Lookup fehl.

**Lösung:** `.to_lowercase()` in `normalize_dir_key()` und `build_dir_index()`.

---

#### #53 — scan.rs: file_count inkonsistent
`2026-02-17`

Root-Knoten gab `own_file_count` zurück, Kinder gaben `total_file_count` — je nach Ebene unterschiedliche Semantik.

**Lösung:** Einheitlich `total_file_count` für alle Knoten.

---

#### #61 — Backend-Event ohne Frontend-Listener
`2026-02-17`

`lib.rs` emittierte `"menu-action"` für den "Über"-Menüeintrag, aber die Bridge hatte keinen Listener und `app.js` keinen Handler. Klick ging ins Leere.

**Lösung:** `onMenuAction` in Bridge + Handler in `app.js`.

**Lehre:** Bei jedem `app.emit()` im Backend prüfen ob ein Listener in der Bridge existiert.

---

#### #65 — Frontend-Backend Feldnamen-Mismatch bei 3 Funktionen
`2026-02-18`

**Betroffen:**
1. `file_properties` gibt `isDir` zurück, Frontend prüft `props.isDirectory` → Ordner werden IMMER als "Datei" angezeigt
2. `file_properties` gibt `readOnly` (camelCase) zurück, Frontend prüft `props.readonly` (lowercase) → Schreibschutz zeigt IMMER "Nein"
3. `calculate_folder_size` gibt `totalSize`/`fileCount`/`dirCount` zurück, Frontend liest `result.size`/`result.files`/`result.dirs`

**Ursache:** Feldnamen aus PowerShell (`ConvertTo-Json`) werden 1:1 durchgereicht, Frontend wurde mit anderen Namen geschrieben. Kein Schema-Vertrag zwischen Backend und Frontend.

**Lehre:** Bei JEDEM neuen API-Aufruf: Rückgabestruktur in `commands.rs` lesen und mit Frontend-Zugriff vergleichen. Erweitert Lesson #33.

---

#### #66 — Backend gibt Objekt zurück, Frontend erwartet Array
`2026-02-18`

**Betroffen:** `delete_to_trash`, `delete_permanent`, `file_copy`, `file_move` geben alle `json!({ "success": true })` zurück (einzelnes Objekt). Frontend ruft `results.filter(r => !r.success)` darauf auf → **TypeError: results.filter is not a function**. Papierkorb-Löschen, permanentes Löschen, Kopieren und Einfügen crashen ALLE.

**Ursache:** Electron-Version gab ein Array mit Einzelergebnis pro Datei zurück, Tauri-Version gibt zusammengefasstes Objekt zurück. Frontend wurde nicht angepasst.

**Lehre:** Bei Migration JEDE Return-Shape prüfen. `.filter()` auf einem Nicht-Array ist ein sofortiger Crash.

---

#### #67 — delete_to_trash: DeleteFile() funktioniert nicht für Ordner
`2026-02-18`

`[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile()` ist die VB.NET-Methode NUR für Dateien. Für Ordner gibt es `DeleteDirectory()`.

**Lösung:** Pfad prüfen — `Test-Path -PathType Container` → `DeleteDirectory()`, sonst `DeleteFile()`.

**Lehre:** .NET Framework hat getrennte APIs für Dateien und Verzeichnisse. IMMER Dokumentation prüfen.

---

#### #68 — file_copy: tokio::fs::copy() kopiert keine Ordner
`2026-02-18`

`tokio::fs::copy()` kopiert nur einzelne Dateien. Für Verzeichnisse gibt es kein `tokio::fs::copy_dir()`. `file_move` nutzt `tokio::fs::rename()` — funktioniert für Ordner, aber nur auf demselben Laufwerk.

**Lösung:** Für Ordner-Kopie: `walkdir` rekursiv. Für Cross-Volume-Move: Copy + Delete.

**Lehre:** Dateisystem-Operationen die auf Dateien funktionieren, funktionieren NICHT automatisch auf Verzeichnisse.

---

#### #71 — GPU-Cache-Locking in Electron
`2026-02-18` · *Memory-Migration, Electron-Ära*

Electron + Tray = IMMER `app.requestSingleInstanceLock()` verwenden. GPU-Cache "Zugriff verweigert" = NICHT harmlos — eine andere Instanz hat den Cache gelockt → eingefrorene UI. `disableHardwareAcceleration()` fixt das NICHT. `--disable-gpu-shader-disk-cache` verhindert GPU-Cache-File-Locking komplett.

**Lehre:** Single-Instance-Lock ist in Desktop-Apps mit Tray PFLICHT.

---

#### #72 — `await` in non-async Callbacks = SyntaxError
`2026-02-18` · *Memory-Migration*

`await` innerhalb von non-async Callbacks erzeugt einen SyntaxError der das gesamte ES-Modul am Laden hindert.

**Lösung:** `.then()` für async Operationen in non-async Callbacks verwenden.

**Lehre:** ES-Module laden nicht bei SyntaxErrors — das Modul existiert einfach nicht, kein offensichtlicher Runtime-Error.

---

#### #73 — Electron-Initialisierungsmuster
`2026-02-18` · *Memory-Migration, Electron-Ära*

1. Tray/Hotkey/Tags-Initialisierung MUSS in try-catch gewrappt werden
2. Electron `preload.js` erfordert `contextBridge` (funktioniert nicht mit plain Node)
3. `execSync` in Electron-Main friert die UI ein — IMMER async `execFile`
4. `nativeImage.createFromDataURL` für Tray-Icons (createFromBuffer unzuverlässig)

**Lehre:** Desktop-App-Initialisierung muss fehlertolerant sein — ein Fehler in einem Subsystem darf nicht die ganze App killen.

---

#### #82 — `exec()` geht durch cmd.exe → fragile Quoting
`2026-02-18` · *Memory-Migration*

`exec()` / `child_process.exec()` leitet Befehle durch `cmd.exe`, verschachtelte Quotes brechen regelmässig.

**Lösung:** IMMER `execFile()` / `execFileAsync()` verwenden, die direkt den Prozess starten.

**Lehre:** Gilt für Node.js (Electron) und Rust (`std::process::Command` mit `arg()` statt Shell-Strings).

---

<br>

## Netzwerk

<br>

#### #12 — ARP-Table Race Condition
`2026-02-17`

ARP-Tabelle wird VOR dem Ping-Sweep gelesen. Neue Geräte nach dem Ping haben keinen ARP-Eintrag.

**Lösung:** ARP-Table NACH dem Ping-Sweep nochmals lesen.

---

#### #13 — SSDP liefert 0 Modelle
`2026-02-17`

Log zeigt "0 mit Modell-Info" bei jedem Scan. Ursache: Mögliches Firewall-Blocking von SSDP-Multicast (Port 1900) oder Geräte unterstützen kein UPnP.

**Lösung:** `friendlyName` anzeigen + Vendor in `deviceLabel` einbauen.

---

#### #14 — OUI-Datenbank wird nie heruntergeladen
`2026-02-17`

`updateOUIDatabase()` existiert im Backend aber wird NIRGENDS im Frontend aufgerufen. Nur 200 statische OUI-Einträge statt 30.000+.

**Lösung:** Automatischer Download beim ersten Netzwerk-Scan wenn keine `oui.txt` vorhanden.

---

#### #15 — Firmen werden nicht angezeigt
`2026-02-17`

`getPollingData()` wird nur EINMAL aufgerufen. `resolve_ips_background()` läuft async und braucht 8-10s, aber danach wird `getPollingData()` nie wieder aufgerufen.

**Lösung:** Periodisch `getPollingData()` aufrufen oder zweiten Refresh nach 10s einplanen.

---

#### #16 — classify_device() gibt nur generische Labels
`2026-02-17`

"Drucker" statt "Brother Drucker". Vendor-Info ist bekannt aber wird nicht in `deviceLabel` eingebaut.

**Lösung:** Vendor in Label integrieren wenn möglich.

---

#### #20 — MAC-Adressen: Passiver Scan ohne Fallback
`2026-02-17`

Im passiven Scan fehlt der `|| '—'` Fallback für leere MAC-Adressen. Ergebnis: Leere Tabellenzellen.

---

#### #25 — detect_os: Byte-Index auf lowercase String
`2026-02-17`

`ssdp_server[start..]` nutzte Index von `server_lower` → potentieller Panic bei Non-ASCII.

**Lösung:** Konsistent `server_lower` verwenden.

---

#### #27 — get_smb_shares: Falscher PowerShell-Command
`2026-02-17`

`Get-SmbConnection` zeigt nur aktive Verbindungen, nicht alle Shares auf einem Server.

**Lösung:** Fallback auf `net view \\server` wenn keine Verbindungen gefunden.

---

#### #31 — OUI-Download nie vom Frontend getriggert
`2026-02-17`

`updateOUIDatabase()` in `tauri-bridge.js` vorhanden aber nie aufgerufen.

**Lösung:** Automatischer Download bei erstem Active-Scan.

**Lehre:** Bridge-Methoden MÜSSEN im Frontend verwendet werden.

---

#### #34 — get_connection_diff: removed immer leer
`2026-02-17`

Entfernte Verbindungen wurden nie erkannt, `removed: []` war hardcoded.

**Lösung:** Prev-Connections mit Current vergleichen, fehlende als "closed" Events melden.

---

#### #37 — get_network_summary: .Count auf null
`2026-02-17`

PowerShell `(pipeline).Count` gibt `$null` zurück wenn Pipeline leer ist.

**Lösung:** `@(pipeline).Count` erzwingt Array-Kontext, gibt immer 0 statt null.

---

#### #39 — resolve_ips: Inkonsistentes Caching
`2026-02-17`

`resolve_ips` cached nur nicht-leere Companies, `resolve_ips_background` cached auch leere. Folge: IPs ohne Company werden bei jedem Aufruf neu aufgelöst.

**Lösung:** Beide cachen konsistent (inkl. leere Strings).

---

#### #40 — get_bandwidth + get_polling_data: Race Condition
`2026-02-17`

Beide Funktionen nutzen denselben `bw_prev_store` mit demselben Adapter-Namen als Key. Bei gleichzeitigem Aufruf überschreiben sie gegenseitig die Prev-Werte → falsche Raten.

**Lösung:** Prefix `bw_` bzw. `poll_` pro Quelle.

---

#### #50 — OUI: Fehlerhafte Prefixes in statischer Tabelle
`2026-02-17`

Juniper `"0005850"` (7 Zeichen), Synology `"0011320"` (7 Zeichen), QNAP `"24:5E:BE"` (mit Doppelpunkten) — alle matchen nie, weil `lookup()` nur 6-stellige Hex-Strings vergleicht.

**Lösung:** Korrigiert auf korrekte 6-stellige Prefixes.

**Lehre:** OUI-Prefixes sind IMMER genau 6 Hex-Zeichen, keine Sonderzeichen.

---

#### #51 — classify_device: `h.contains("tv")` zu breit
`2026-02-17`

Hostname `"entwickler-pc"` enthält "tv" (en**tv**ickler) → fälschlich als Smart-TV klassifiziert.

**Lösung:** Spezifischere Patterns (`-tv`, `tv-`, `smart-tv` etc.).

**Lehre:** Substring-Matching auf kurze Tokens (2-3 Zeichen) erzeugt False Positives.

---

#### #54 — is_tracker: `.analytics.` und `.facebook.com/tr` zu breit
`2026-02-17`

`.analytics.` matcht auf interne Services, `.facebook.com/tr` ist ein URL-Pfad der nie in Hostnamen vorkommt.

**Lösung:** Spezifischere Patterns (`google-analytics.`, `pixel.facebook.`).

---

#### #56 — export_network_history: CSV-Felder existierten nicht
`2026-02-17`

CSV-Export griff auf `data["connections"]`, `data["bandwidthRx"]`, `data["bandwidthTx"]` zu, aber die Snapshot-Struktur ist `{ summary: { totalConnections, ... }, grouped: [...] }`. Alle CSV-Spalten waren Nullen.

**Lösung:** CSV liest jetzt `data.summary.totalConnections`, `establishedCount`, `listeningCount`, `udpCount` und Prozessanzahl aus `grouped`.

**Lehre:** Bei Export-Funktionen immer die tatsächliche Datenstruktur prüfen, nicht raten.

---

#### #83 — Netzwerk-Scan: Port-Scan MUSS parallel sein
`2026-02-18` · *Memory-Migration*

Port-Scan MUSS voll parallel sein (`ConnectAsync` + `WaitAll`), nie sequentiell pro IP. SMB-Shares MÜSSEN `RunspacePool` für Parallelismus nutzen.

**Lehre:** Sequentielles PowerShell = eingefrorene UI. Netzwerk-Operationen immer parallelisieren.

---

<br>

## UI

<br>

#### #3 — Chromium file:// blockiert Module Workers
`2026-02-10`

pdf.js Worker (.mjs) → Module Worker → Chromium blockiert von file:// URLs.

**Lösung:** Worker per Blob-URL laden, `export{}` entfernen.

**Lehre:** In Electron/Tauri niemals Module Workers verwenden.

---

#### #19 — SVG-Icons ohne CSS = unsichtbar
`2026-02-17`

SVG-Icons im Explorer hinzugefügt aber CSS für Grösse/Farbe fehlte.

**Lehre:** Frontend-Änderungen IMMER als Gesamtpaket (HTML + JS + CSS) testen.

---

#### #28 — Views ohne destroy() = Memory Leak
`2026-02-17`

NetworkView, PrivacyView, SmartView, SoftwareAuditView, SystemScoreView hatten keine `destroy()` Methode. Intervalle und Chart-Instanzen werden nie aufgeräumt.

**Lösung:** `destroy()` in allen Views implementieren.

**Lehre:** JEDE View braucht `destroy()`.

---

#### #29 — preview.js escapeHtml ohne Quote-Escaping
`2026-02-17`

Lokale `escapeHtml()` hatte kein `"` → `&quot;` Escaping. Potential für XSS bei Dateinamen mit Anführungszeichen.

**Lösung:** `&quot;` Escaping ergänzt.

---

#### #57 — tabLoaded premature set = Retry blockiert
`2026-02-17`

`tabLoaded.xxx = true` VOR `await view.init()` gesetzt. Wenn der API-Call fehlschlug, blieb `tabLoaded[tab] === true` → Tab konnte nie neu geladen werden.

**Lösung:** Flag erst NACH erfolgreichem `await` setzen.

**Lehre:** Boolean-Flags die "wurde geladen" signalisieren MÜSSEN NACH dem Ladevorgang gesetzt werden, nicht davor.

---

#### #59 — 10 Dateien mit lokaler _esc() Duplikaten
`2026-02-17`

Jede View hatte eine eigene `_esc(text)` Kopie statt die zentrale `escapeHtml()` aus `utils.js` zu importieren.

**Lösung:** Systematische Bereinigung aller 10 Dateien.

**Lehre:** Utility-Funktionen IMMER importieren, nie kopieren. Code-Duplikation ist ein Bug.

---

#### #60 — confirm() in Tauri/WebView2
`2026-02-17`

Nativ-Browser `confirm()` blockiert den Thread und zeigt einen primitiven Systemdialog statt des Tauri-Dialogs.

**Lösung:** `window.api.showConfirmDialog()` verwenden.

**Lehre:** In Tauri-Apps IMMER die Tauri-Dialog-API verwenden, nicht Browser-Dialoge.

---

#### #63 — ES-Module Cascade Failure durch fehlende defensive Programmierung
`2026-02-17`

**Entstehung:** Bei der Electron→Tauri-Migration wurde `NetworkView` mit einem Constructor geschrieben, der direkt auf `window.api.onNetworkScanProgress` und `window.api.getPreferences` zugreift — ohne optional chaining (`?.`).

**Symptom:** Durch Lesson #62 (withGlobalTauri=false) war `window.api` undefined. Der TypeError auf Module-Level killte das GESAMTE Modul — und alle davon abhängigen Module. `app.js` importiert `network.js` → `init()` lief nie → Sidebar, Tabs, Footer — alles tot.

**Diagnose:** Error-Logger fing `TypeError: Cannot read properties of undefined (reading 'onNetworkScanProgress')` ab. Stack-Trace: Module-Level → Constructor → `window.api.onNetworkScanProgress`.

**Lösung:** Alle `window.api.*`-Zugriffe in Constructors/Module-Level auf `window.api?.` umgestellt.

**Lehre:** In ES-Modulen ist defensive Programmierung auf Top-Level ABSOLUTE PFLICHT. Ein einziger TypeError = gesamte Modul-Kette tot.

---

#### #64 — showConfirmDialog Rückgabewert ≠ Boolean
`2026-02-17`

**Entstehung:** `confirm()` wurde durch `window.api.showConfirmDialog()` ersetzt. Der neue Code nutzte `if (!confirmDel) return;` — in der Annahme, der Dialog gibt Boolean zurück. Tatsächlich gibt er `{ response: 0/1 }` zurück.

**Symptom:** Lösch-Bestätigung wurde NIE blockiert. `!{response: 0}` → Objekt ist truthy → `!truthy` = false → `if (false) return;` → nie blockiert.

**Lösung:** `if (!confirmDel) return;` → `if (!confirmDel?.response) return;`.

**Lehre:** Bei API-Migrationen MUSS der Rückgabewert der neuen API geprüft werden. Immer `commands.rs` gegenchecken.

---

#### #69 — extract-to: Falscher Dialog + fehlerhafte Return-Behandlung
`2026-02-18`

**3 Bugs:**
1. `showSaveDialog` ist ein Datei-Speichern-Dialog, kein Ordner-Auswahl-Dialog
2. Backend ignoriert `_options`-Parameter (Underscore-Prefix) — `{ directory: true }` wird nie ausgewertet
3. `if (dest)` ist IMMER truthy weil `showSaveDialog` immer ein Objekt zurückgibt

**Lösung:** `show_save_dialog` um Ordner-Modus erweitern. Return-Behandlung auf `dest.canceled !== true && dest.path` umstellen.

**Lehre:** Underscore-Prefix (`_options`) in Rust = "ignoriert" — wenn der Parameter gebraucht wird, MUSS der Underscore entfernt werden.

---

#### #70 — Context-Menu: Zombie-Event-Listener bei Rechtsklick
`2026-02-18`

`showContextMenu()` registriert `mousedown`- und `keydown`-Handler. Wenn `closeContextMenu()` extern aufgerufen wird, werden DOM-Elemente entfernt — aber die Handler bleiben registriert. Bei schnellen Rechtsklick-Sequenzen akkumulieren sich Handler.

**Lösung:** `closeContextMenu()` entfernt aktive Handler selbst. Handler-Referenzen in Modul-Variablen speichern.

**Lehre:** Cleanup-Logik darf nie ausschliesslich im Handler selbst liegen — die zentrale Cleanup-Funktion muss ALLE Listener abräumen.

---

#### #74 — CSS `:hover` nie für Layout-Änderungen verwenden
`2026-02-18` · *Memory-Migration*

CSS `:hover` auf Sidebar-Elementen löst Layout-Verschiebungen aus (Elemente "springen" beim Überfahren).

**Lehre:** Hover-Effekte nur für visuelle Hervorhebung (Farbe, Schatten), niemals für Grössen-/Positionsänderungen.

---

#### #76 — Omnibar: Exakte Substring-Suche versagt bei Tippfehlern
`2026-02-18` · *Memory-Migration*

Exakte Substring-Suche findet nichts bei Tippfehlern.

**Lösung:** Progressive Prefix-Verkürzung — schrittweise das letzte Zeichen entfernen und erneut suchen.

**Lehre:** Suchfunktionen sollten fehlertolerant sein.

---

#### #78 — WCAG Kontrast-Regeln
`2026-02-18` · *Memory-Migration*

1. `--text-muted`/`--text-secondary` müssen gegen TATSÄCHLICHE Hintergrundfarben berechnet werden
2. Dark Theme: `#5a5e72` auf `#222639` = 2.3:1 → FAIL. Mindestens `#8890a8` für 4.5:1
3. Lila/Violett auf Navy = schlechte WAHRGENOMMENE Lesbarkeit trotz ausreichendem mathematischem Kontrast
4. `--accent` (#6c5ce7) NUR für Rahmen/Hintergründe. `--accent-text` (#c4b5fd) für Labels. `--text-primary` für Inhaltstext

**Lehre:** WCAG erfordert Prüfung gegen alle tatsächlichen Hintergrund-Kombinationen.

---

#### #80 — UI-Änderungen müssen sichtbar sein
`2026-02-18` · *Memory-Migration*

UI-Änderungen die nur per Tastenkombination erreichbar sind, werden nie entdeckt.

**Lehre:** Discoverability > Shortcuts. Neue Funktionen MÜSSEN sichtbare Buttons/Tabs/Menüeinträge haben.

---

#### #81 — Smart Reload Pattern (F5)
`2026-02-18` · *Memory-Migration, Electron-Ära*

F5 muss "Smart Reload" ausführen: sessionStorage-State speichern + `location.reload()`. NIEMALS `role:'reload'` direkt verwenden.

**Lehre:** Ein reiner Daten-Refresh OHNE Seitenreload lädt CSS/JS-Änderungen NICHT — State-Persistenz UND Asset-Neuladung kombinieren.

---

#### #84 — Electron Tray-Fenster: Win32 ShowWindow für Wiederherstellung
`2026-02-18` · *Memory-Migration, Electron-Ära*

`Target.activateTarget` (CDP) reicht NICHT um minimiertes Fenster wiederherzustellen.

**Lösung:** PowerShell + Win32 `ShowWindow(hWnd, 9)` + `SetForegroundWindow(hWnd)`.

**Lehre:** Browser-DevTools-APIs haben keine Kontrolle über Window-Manager-State.

---

<br>

## Terminal

<br>

#### #1 — node-pty + Electron: Native Module Builds
`2026-02-10`

node-pty@1.1.0 brauchte winpty (GetCommitHash.bat Fehler). node-pty@1.2.0-beta.11 (ConPTY-only) scheiterte an Spectre-Mitigation.

**Lösung:** `scripts/rebuild-pty.js` patcht `binding.gyp` automatisch vor electron-rebuild.

**Lehre:** Native Electron-Module können plattformspezifische Build-Probleme haben.

---

#### #9 — Terminal Piped I/O: Kein PTY = kein interaktives Terminal
`2026-02-17`

`std::process::Command` mit `Stdio::piped()` ist KEIN PTY. Backspace, Umlaute, Pfeiltasten, Tab-Completion funktionieren NICHT.

**Lösung:** `portable-pty` Crate für ConPTY. Quick-Fix: UTF-8 Encoding per stdin + Input-Buffer im Frontend.

---

#### #10 — Windows PowerShell Encoding: cp437/cp850 statt UTF-8
`2026-02-17`

Terminal startet PowerShell ohne UTF-8-Encoding-Initialisierung. `from_utf8_lossy()` liest cp850-Bytes → Umlaute kaputt.

**Lösung:** `[Console]::OutputEncoding = [Text.Encoding]::UTF8` per stdin nach Spawn senden. CMD: `chcp 65001`.

---

#### #11 — Set-Location sichtbar im Terminal
`2026-02-17`

`changeCwd()` sendet rohen `Set-Location`-Befehl an stdin. In Non-PTY-Modus kein sauberer Prompt.

**Lösung:** Terminal bei cwd-Wechsel neu starten statt Set-Location senden.

---

#### #32 — terminal_open_external ohne Fallback
`2026-02-17`

Nur Windows Terminal (`wt`) unterstützt. Wenn nicht installiert → Fehler.

**Lösung:** Fallback auf `cmd.exe /k cd /d`.

---

#### #47 — Git Bash: Hardcoded Pfad
`2026-02-17`

`C:\Program Files\Git\bin\bash.exe` fester Pfad.

**Lösung:** `find_git_bash()` sucht dynamisch via `where git` und leitet den bash.exe-Pfad ab.

---

#### #77 — PowerShell Kaltstart: 5-10+ Sekunden
`2026-02-18` · *Memory-Migration*

PowerShell-Erststart dauert 5-10+ Sekunden. Timeouts unter 15s führen zu sporadischen Fehlschlägen. Mehrere parallele PS-Prozesse hungern sich gegenseitig aus.

**Lösung:** Mindestens 15-30s Timeout. Parallele PS-Prozesse wenn möglich sequentiell ausführen.

**Lehre:** PowerShell ist langsam — Timeouts und Parallelität entsprechend planen.

---

#### #79 — PowerShell Multi-Line: .replace(/\\n/g) zerstört Statements
`2026-02-18` · *Memory-Migration*

NIEMALS `.replace(/\n/g, ' ')` auf PowerShell-Scripts anwenden — das zerstört Statement-Grenzen (if/else-Blöcke, Pipelines).

**Lösung:** `.trim()` und mit Zeilenumbrüchen übergeben. IMMER `run_ps()` verwenden (30s Timeout + UTF-8 Prefix).

**Lehre:** PowerShell-Statements sind zeilenorientiert — Zeilenumbrüche sind syntaktisch relevant.

---

<br>

## Security

<br>

#### #21 — withGlobalTauri: true = Sicherheitslücke
`2026-02-17`

`tauri.conf.json` hatte `withGlobalTauri: true`. Erlaubt eingeschleustem JS-Code direkten Zugriff auf `window.__TAURI__` IPC.

**Lösung:** Auf `false` setzen, Zugriff nur über `tauri-bridge.js`.

> **Hinweis:** Wurde durch Lesson #62 revidiert — `withGlobalTauri` MUSS `true` sein, Zugriffskontrolle über Capabilities.

---

#### #22 — Context-Menu Event-Name Mismatch
`2026-02-17`

Backend emittiert `context-menu-request`, Bridge hört auf `context-menu-action`. Kontextmenü funktioniert nie.

**Lösung:** Event-Namen synchronisieren.

**Lehre:** Bei IPC-Events IMMER beide Seiten prüfen.

---

#### #23 — Privacy-Settings: REG_DWORD statt REG_SZ
`2026-02-17`

`ConsentStore` speichert "Allow"/"Deny" als REG_SZ-String. Code schrieb REG_DWORD 0/1 → Einstellung bleibt unverändert.

**Lösung:** REG_SZ mit korrekten String-Werten.

---

#### #26 — resolve_ips: Keine IP-Validierung
`2026-02-17`

IPs vom Frontend wurden unvalidiert in PowerShell-Befehle eingesetzt → Command-Injection-Risiko.

**Lösung:** `validate_ip()` vor Verwendung aufrufen.

---

#### #41 — disable_scheduled_task: Wildcard `-TaskName '*'`
`2026-02-17`

Deaktiviert ALLE Tasks in einem Pfad statt nur einen einzelnen. Könnte kritische System-Tasks abschalten.

**Lösung:** `task_name` obligatorisch, Wildcard verboten. Frontend sendet `path` und `name` getrennt.

---

#### #43 — open_with_dialog: Double-Quote nicht escaped
`2026-02-17`

Dateinamen mit `"` in PowerShell-Argument → Shell-Injection möglich.

**Lösung:** `"` → `` `" `` (PowerShell-Escape).

**Lehre:** Einfache UND doppelte Anführungszeichen escapen.

---

#### #58 — preview.js: Lokale escapeHtml() ohne Quote-Escaping
`2026-02-17`

Lokale `escapeHtml()` escaped nur `&<>"` aber NICHT `'`. In Attribut-Kontexten XSS möglich.

**Lösung:** Importierte Funktion aus `utils.js` verwenden.

**Lehre:** EINE zentrale Escape-Funktion, keine lokalen Varianten.

---

#### #62 — withGlobalTauri=false killt gesamtes Frontend
`2026-02-17`

**Entstehung:** Während des Tiefenaudits wurde `withGlobalTauri` auf `false` gesetzt. Annahme: "sicherer". Falsch — der vollständige Datenfluss wurde nicht geprüft.

**Symptom:** Die GESAMTE App war tot — kein Sidebar-Toggle, keine Tabs, keine Daten. NULL Frontend-API-Aufrufe im Dev-Log.

**Diagnose:**
1. Dev-Log-Vergleich: Arbeitende Session zeigte PowerShell-Calls, kaputte Session nichts
2. Error-Logger fing `TypeError` in `network.js:68` ab
3. Rückverfolgung: `window.api` = undefined → Bridge-IIFE prüft `if (!window.__TAURI__)` → mit `false` existiert `__TAURI__` nicht → Bridge bricht ab

**Lösung:** `withGlobalTauri` zurück auf `true`. Zugriffskontrolle über Capability-System, nicht durch Verstecken von `__TAURI__`.

**Lehre:** Security-Fixes MÜSSEN den vollständigen Datenfluss prüfen. Eine "sichere" Einstellung die die App zerstört ist kein Security-Fix — es ist ein kritischer Bug.

---

<br>

## Performance

<br>

#### #36 — Blockierende I/O in async Funktionen
`2026-02-17`

`std::fs::write`, `std::fs::OpenOptions`, `std::fs::read_dir` in async `#[tauri::command]` blockieren den Tokio-Runtime-Thread.

**Lösung:** `tokio::fs` + `tokio::task::spawn_blocking`.

**Lehre:** In async Commands IMMER `tokio::fs` statt `std::fs` verwenden.

---

#### #38 — list_network_recordings: Gesamte Datei gelesen
`2026-02-17`

`read_to_string` lud komplette Aufzeichnungsdateien in RAM nur für Header/Footer.

**Lösung:** `BufReader` liest nur erste und letzte Zeile.

---

#### #44 — terminal_destroy: child.wait() blockiert Tokio
`2026-02-17`

`std::sync::Mutex::lock()` + `child.kill()` + `child.wait()` blockieren den async Runtime-Thread.

**Lösung:** Mutex sofort droppen, kill+wait in `spawn_blocking`.

---

#### #75 — CSS/Chart.js Animationen = CPU/GPU-Last
`2026-02-18` · *Memory-Migration*

CSS `animation: infinite` verbraucht GPU/CPU selbst bei `display:none`. Chart.js Standard-Animationen erzeugen unnötige CPU-Last.

**Lösung:** CSS-Animationen nur wenn sichtbar. Chart.js: IMMER `animation: false`.

**Lehre:** Animationen in Desktop-Apps sparsam einsetzen.

---

<br>

## Migration

<br>

#### #6 — Migration = JEDE Funktion prüfen
`2026-02-16`

31 Funktionen als Stubs belassen nach Electron → Tauri v2 Migration.

**Lehre:** Per Grep nach `stub: true`, `json!([])`, `json!(null)` suchen. Migration ist NICHT fertig wenn die App startet — erst wenn JEDE Funktion echte Daten liefert.

---

#### #8 — Base64-Dekodierung für Tauri-IPC
`2026-02-17`

Tauri serialisiert Binärdaten als Base64-JSON-Strings. Electron konnte ArrayBuffers direkt übergeben. `new Uint8Array(base64String)` ergibt leeres Array.

**Lösung:** `atob()` + charCode-Schleife.

**Lehre:** Jeder Datentyp-Transfer zwischen Rust ↔ JS muss einzeln verifiziert werden.

---

<br>

## Privacy

<br>

#### #55 — diagnose-toast: recommendedValue Widerspruch
`2026-02-17`

`build_privacy_settings` definierte `recommendedValue: 0`, aber `privacy_setting_lookup` hatte `recommended: 1`. Nach Anwenden schrieb `apply_privacy_setting` den Wert `1`, aber die Anzeige prüfte gegen `0` → UI zeigte dauerhaft "nicht privat".

**Lösung:** `recommendedValue` auf `1` geändert.

**Lehre:** Wenn dieselbe Einstellung an zwei Stellen definiert wird, MÜSSEN die Werte übereinstimmen.

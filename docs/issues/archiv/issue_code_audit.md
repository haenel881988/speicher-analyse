# Code-Audit: Vollständige Problemanalyse (16.02.2026)

> **Geprüft:** 5 Rust-Dateien, 34 JavaScript-Dateien, 1 CSS, 1 HTML, 2 Config-Dateien
> **Methode:** Jede Datei vollständig gelesen, alle Kategorien systematisch geprüft
> **Ergänzt durch:** Erkenntnisse aus `issue_research.md` (Tiefenanalyse vom 14.02.2026)

## Zusammenfassung

| Schwere | Anzahl | Beschreibung |
|---------|--------|-------------|
| **Kritisch** | 25 | Sicherheitslücken, Datenverlust-Risiken |
| **Mittel** | 38 | Funktionale Fehler, Performance, fehlende Features |
| **Hinweis** | 40+ | Code-Qualität, Duplikation, Konsistenz |
| **Gesamt** | **103+** | |

---

## 1. Security — Command Injection (Kritisch)

PowerShell-Befehle werden mit User-Parametern zusammengebaut. An vielen Stellen fehlt das Escaping (`replace("'", "''")`), wodurch beliebiger PowerShell-Code eingeschleust werden kann.

| # | Datei:Zeile | Funktion | Fehlender Schutz |
|---|-------------|----------|-----------------|
| S1 | `commands.rs:556-558` | `control_service()` | `name` ohne Escaping in `Start-Service`/`Stop-Service`/`Restart-Service` |
| S2 | `commands.rs:574` | `set_service_start_type()` | `name` und `ps_type` ohne Escaping |
| S3 | `commands.rs:624` | `uninstall_bloatware()` | `packageFullName` ohne Escaping in `Remove-AppxPackage` |
| S4 | `commands.rs:680` | `update_software()` | `package_id` ohne Escaping in `winget upgrade` |
| S5 | `commands.rs:840` | `open_with_dialog()` | `file_path` **komplett** ohne Escaping in `Start-Process rundll32.exe` |
| S6 | `commands.rs:1293-1295` | `block_process()` | `name` und `prog` ohne Escaping in `New-NetFirewallRule` |
| S7 | `commands.rs:1303` | `unblock_process()` | `rule_name` ohne Escaping in `Remove-NetFirewallRule` |
| S8 | `commands.rs:1703` | `scan_device_ports()` | `ip` ohne Escaping/Validierung — direkt in PowerShell-Format-String |
| S9 | `commands.rs:1720` | `get_smb_shares()` | `ip` ohne Escaping in `Get-SmbConnection` |
| S10 | `commands.rs:1284` | `get_firewall_rules()` | `direction` ohne Whitelist-Validierung |

**Empfehlung:** `.replace("'", "''")` an allen fehlenden Stellen ergänzen. Für `ip`-Parameter zusätzlich Regex-Validierung (`^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`).

---

## 2. Security — Path Traversal (Kritisch)

Dateipfade vom Frontend werden ohne jede Validierung an Dateisystem-Operationen weitergegeben. Ein manipulierter Pfad kann beliebige Dateien lesen, schreiben oder löschen.

| # | Datei:Zeile | Funktion | Risiko |
|---|-------------|----------|--------|
| S11 | `commands.rs:224-233` | `delete_permanent()` | Löscht beliebige Dateien/Ordner ohne Pfadprüfung |
| S12 | `commands.rs:436-438` | `write_file_content()` | Überschreibt beliebige Dateien im System |
| S13 | `commands.rs:395-418` | `clean_category()` | Pfade vom Frontend werden ohne Validierung gelöscht |
| S14 | `commands.rs:252-268` | `file_move()`/`file_copy()` | Zielverzeichnis nicht validiert |
| S15 | `commands.rs:423-446` | `read_file_content()`/`read_file_binary()` | Beliebige Dateien lesbar (inkl. Passwort-Dateien etc.) |

**Empfehlung:** Pfad-Validierung einführen — mindestens prüfen, dass der Pfad innerhalb des Benutzer-Profils oder der gescannten Laufwerke liegt.

---

## 3. Security — XSS im Frontend (Kritisch/Mittel)

`innerHTML` wird an zahlreichen Stellen mit unescaptem User-Input (Dateinamen, Fehlermeldungen, Backend-Daten) beschrieben. In einer Tauri-App mit deaktivierter CSP ist das besonders gefährlich.

### Kritische XSS-Stellen

| # | Datei:Zeile | Kontext | Problem |
|---|-------------|---------|---------|
| S16 | `tree.js:409` | `showToast()` | `message` per `innerHTML` — wird von vielen Stellen mit Pfaden/Fehlern aufgerufen |
| S17 | `preview.js:391` | DOCX-Vorschau | `mammoth.convertToHtml()` Output direkt als `innerHTML` — JavaScript in Word-Dokumenten wird ausgeführt! |
| S18 | `preview.js:270` | PDF-Fallback | `onclick`-Attribut mit fragilem String-Escaping — manipulierter Dateiname ermöglicht JS-Injection |
| S19 | `file-manager.js:148` | Eigenschaften-Dialog | `props.error` unescaped in `innerHTML` |

### Weitere XSS-Stellen (Mittel)

| # | Datei:Zeile | Kontext |
|---|-------------|---------|
| S20 | `app.js:453-455` | `drive.mountpoint`/`drive.device` in `renderDrives()` |
| S21 | `treemap.js:206` | `item.path` im Tooltip |
| S22 | `charts.js:139,153` | `e.message` in Fehleranzeigen |
| S23 | `services.js:48` | `e.message` in Fehleranzeige |
| S24 | `autostart.js:48,71` | `e.message` + `entry.locationLabel` |
| S25 | `bloatware.js:65,191` | `err.message` + Toast |
| S26 | `optimizer.js:65,183-188` | `err.message` + `showToastMsg()` |
| S27 | `system-score.js:53,61-62` | `cat.name`/`cat.description` |
| S28 | `export.js:68` | `message` in eigenem Toast |
| S29 | `cleanup.js:45,65-87` | `e.message` + `cat.icon`/`name`/`description` |
| S30 | `registry.js:54,75-97` | `e.message` + `cat.icon`/`name`/`description` |
| S31 | `file-manager.js:167` | `e.message` im catch-Block |

**Empfehlung:** Zentrales `escapeHtml()` in `utils.js` definieren und an allen `innerHTML`-Stellen verwenden. Für `showToast()` auf `textContent` umstellen.

---

## 4. Security — Tauri-Konfiguration (Kritisch)

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| S32 | `tauri.conf.json:26` | **CSP komplett deaktiviert** (`"csp": null`) — kein Schutz gegen XSS |
| S33 | `tauri.conf.json:25` | `withGlobalTauri: true` exponiert `__TAURI__` global — XSS kann alle Tauri-APIs aufrufen |
| S34 | `index.html:6` | CSP im HTML erlaubt `'unsafe-inline'` und `'unsafe-eval'` |
| S35 | Kein `capabilities/` Verzeichnis | Keine Tauri-Permissions/Capabilities konfiguriert |

**Empfehlung:** CSP aktivieren: `"default-src 'self'; script-src 'self'"`. `withGlobalTauri` auf `false` setzen und `__TAURI__` nur über Bridge nutzen.

---

## 5. Security — Weitere

| # | Datei:Zeile | Problem | Schwere |
|---|-------------|---------|---------|
| S36 | `commands.rs:897-899` | `open_external()` — `Start-Process` akzeptiert auch lokale Executables. Ein `file:///...cmd.exe` wäre ausführbar | Mittel |
| S37 | `commands.rs:1069` | `disable_scheduled_task()` — Wildcard `*` deaktiviert ALLE Tasks im Pfad statt eines einzelnen | Mittel |
| S38 | `tauri-bridge.js:19-29` | Keine Frontend-Validierung vor `invoke()` — leere Strings, null etc. gehen direkt ans Backend | Mittel |

---

## 6. Performance (Mittel)

### 6.1 PowerShell Timeout fehlt

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| P1 | `ps.rs` (gesamt) | `run_ps()` hat **keinen Timeout**. Ein hängender PowerShell-Prozess blockiert den Command-Handler für immer |
| P2 | `commands.rs:722-749` | `deep_search_start()` — Kein Timeout, gesamtes Ergebnis im Speicher |
| P3 | `commands.rs:753-755` | `deep_search_cancel()` — Tut nichts, PowerShell-Prozess läuft weiter |

**Empfehlung:** `tokio::time::timeout(Duration::from_secs(30), cmd.output())` in `run_ps()` einbauen.

### 6.2 Blocking Operations

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| P4 | `commands.rs:402` | `clean_category()` — `walkdir::WalkDir` blockiert async-Thread (kein `spawn_blocking`) |

### 6.3 Frontend DOM-Performance

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| P5 | `explorer.js:769-774` | Bis 5.000 Zeilen werden bei jeder Sortierung komplett per `innerHTML` neu gerendert |
| P6 | `explorer.js:786-865` | Individuelle Event-Handler pro Zeile statt Event Delegation auf `<tbody>` |
| P7 | `explorer-tabs.js:152-229` | Tab-Bar komplett neu gerendert bei jeder Navigation |
| P8 | `network.js:204` | Gesamtes DOM bei jedem 5-Sekunden-Bandwidth-Tick neu geschrieben |
| P9 | `software-audit.js:216-219` | Kein Debouncing beim Such-Input — jeder Tastendruck rendert die gesamte Tabelle |
| P10 | `treemap.js:14-17` | ResizeObserver nie disconnected, kein Debounce auf Resize |

### 6.4 CSS-Animationen

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| P11 | `style.css:1096,1128,1216,4540,4650,4732,4736` | 7x `animation: infinite` — laufen auch wenn Elemente nicht sichtbar sind |

### 6.5 Scan-Engine Performance

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| P12 | `scan.rs:213-231` | `tree_node()` — Zweite Iteration über alle Dateien macht nichts (toter Code) |
| P13 | `scan.rs:190-262` | `tree_node()` — O(n) pro Aufruf bei großem Scan, kein Index |

---

## 7. Memory Leaks / Unbounded Growth (Mittel)

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| M1 | `duplicates.js:65-88` | **Event-Listener akkumulieren** bei jedem Duplikat-Scan — nach N Scans reagieren N Listener gleichzeitig |
| M2 | `network.js:176,1136,1147` | 3 `setInterval`-Timer werden nur bei `deactivate()` gestoppt, nicht bei Tab-Wechsel |
| M3 | `network.js:66-78` | `onNetworkScanProgress` Listener wird nie entfernt |
| M4 | `explorer.js:59,178` | `historyBack`/`historyForward` wachsen unbegrenzt |
| M5 | `explorer-dual-panel.js:42-51` | Verstecktes Panel — Event-Listener laufen im Hintergrund weiter |
| M6 | `search.js:12` | Debounce-Timer wird bei `disable()` nicht abgebrochen |
| M7 | `batch-rename.js:11` | Modal-Overlay wird in DOM eingefügt und nie entfernt |
| M8 | `preview.js:252` | `URL.createObjectURL()` wird nie via `revokeObjectURL()` freigegeben |
| M9 | `terminal-panel.js:284-285` | Document-Level `mousemove`/`mouseup` Listener können bei Destroy hängenbleiben |
| M10 | `commands.rs:20-23` | `bw_prev_store`/`bw_history_store` — Keys werden bei Adapter-Wechsel nie bereinigt |
| M11 | `commands.rs:364-366` | `release_scan_bulk_data()` — Gibt "released" zurück aber löscht nichts |
| M12 | `commands.rs:1499-1500` | Alle Verbindungen geklont statt nur Keys gespeichert |

---

## 8. Funktionale Korrektheit — Stub-Funktionen (Mittel)

Über 50 Backend-Funktionen geben `{ "success": true }` zurück ohne etwas zu tun. Der User denkt die Aktion wurde ausgeführt, aber nichts passiert.

### 8.1 Datenverlust durch fehlende Persistenz

| # | Funktion | Auswirkung |
|---|----------|-----------|
| F1 | `set_preference()` / `get_preferences()` | **Einstellungen werden nie gespeichert** — nach Neustart immer Defaults |
| F2 | `save_session_now()` / `get_session_info()` / `update_ui_state()` | **Session-Wiederherstellung unmöglich** — Scan-Daten gehen bei Neustart verloren |
| F3 | `set_file_tag()` / `remove_file_tag()` / `get_file_tag()` etc. | **Datei-Tags existieren nicht** — werden nirgends gespeichert |

### 8.2 Aktionen die nichts bewirken

| # | Funktion | Was der User erwartet | Was passiert |
|---|----------|----------------------|-------------|
| F4 | `apply_privacy_setting()` | Datenschutz wird aktiviert | Nichts |
| F5 | `apply_all_privacy()` | Alle Datenschutz-Einstellungen werden gesetzt | Nichts |
| F6 | `reset_privacy_setting()` / `reset_all_privacy()` | Einstellung wird zurückgesetzt | Nichts |
| F7 | `apply_optimization()` | Optimierung wird angewendet | Nichts |
| F8 | `toggle_autostart()` / `delete_autostart()` | Autostart-Eintrag wird geändert/gelöscht | Nichts |
| F9 | `clean_registry()` | Registry wird bereinigt | Nichts |
| F10 | `export_registry_backup()` / `restore_registry_backup()` | Registry-Backup wird erstellt/wiederhergestellt | Nichts |
| F11 | `register_shell_context_menu()` / `unregister_shell_context_menu()` | Kontextmenü wird registriert | Nichts |
| F12 | `set_global_hotkey()` | Hotkey wird gesetzt | Nichts |
| F13 | Alle Network-Recording-Funktionen | Netzwerk-Aufzeichnung | Nichts |
| F14 | `restart_as_admin()` | App startet als Admin neu | Nichts (Fehlermeldung) |
| F15 | `capture_screenshot()` | Screenshot wird erstellt | Nichts |

### 8.3 Statische/Falsche Daten

| # | Funktion | Problem |
|---|----------|---------|
| F16 | `get_system_score()` | Gibt **immer** Score 75, Note "C" zurück — unabhängig vom Systemzustand |
| F17 | `start_duplicate_scan()` | Emittiert sofort "complete" mit leeren Gruppen — **keine echte Duplikat-Erkennung** |
| F18 | `export_csv()` | Gibt "Not implemented in Tauri yet" zurück |
| F19 | Terminal-Funktionen | `terminal_create()` gibt "not available" zurück, `terminal_write()`/`terminal_resize()` tun nichts |

---

## 9. Funktionale Korrektheit — Bugs (Mittel/Kritisch)

| # | Datei:Zeile | Problem | Schwere |
|---|-------------|---------|---------|
| B1 | `explorer.js:1109` | **Shift+Delete löscht Dateien unwiderruflich ohne Bestätigungsdialog!** | Kritisch |
| B2 | `explorer.js:1111` | Normaler Delete ruft `deleteToTrash` ohne Bestätigungsdialog auf (file-manager.js fragt hingegen) | Mittel |
| B3 | `app.js:652-727` | `tabLoaded`-Flags werden VOR async-Abschluss gesetzt — bei Fehler kann Tab nie erneut geladen werden | Mittel |
| B4 | `app.js:598-637` | `autoLoadTab()` async ohne `await` — schneller Tab-Wechsel startet parallele Operationen | Mittel |
| B5 | `tauri-bridge.js:32-43` | Event-Listener Race Condition — zwischen Aufruf und Registrierung können Events verloren gehen | Mittel |
| B6 | `network.js:122,193` | `_isRefreshing` geteilt zwischen User-Refresh und Auto-Poll — User-Klick wird ignoriert | Mittel |
| B7 | `system-score.js:12-15` | `_loaded = true` sofort gesetzt ohne Daten zu laden — kein Retry möglich | Mittel |
| B8 | `settings.js:21-28` | `Promise.all` mit 6 API-Calls, nur 2 mit `.catch()` — wenn einer fehlt, Seite kaputt | Mittel |
| B9 | `utils.js:14` | `formatNumber(null)` → TypeError (alle anderen Format-Funktionen haben null-Guard) | Mittel |
| B10 | `style.css` | `var(--border-color)` wird ~10x referenziert, existiert aber nicht (richtig: `--border`) — fehlende Borders | Mittel |
| B11 | `updates.js:408-411` | `escapeAttr()` escaped nicht `&`, `<`, `>` — nur `"` und `'` | Mittel |

---

## 10. Robustheit — Rust (Mittel)

| # | Datei:Zeile | Problem |
|---|-------------|---------|
| R1 | `scan.rs:29,38` + `commands.rs:1245,1246,1466,1467,1499,1524,1552` | **9+ `Mutex::lock().unwrap()`** — Poisoned Mutex nach Panic crasht die gesamte App kaskadiert |
| R2 | `commands.rs:56` | `SystemTime::now().duration_since(UNIX_EPOCH).unwrap()` — theoretisch failbar |
| R3 | `commands.rs:777,781` | `as_object_mut().unwrap()` in `list_directory()` — kann paniken |

**Empfehlung:** `.lock().unwrap_or_else(|e| e.into_inner())` und `.unwrap_or_default()` verwenden.

---

## 11. Code-Qualität (Hinweis)

| # | Problem | Betroffene Dateien |
|---|---------|-------------------|
| Q1 | **`commands.rs` ist ein 1881-Zeilen-Monolith** — alle 100+ Commands in einer Datei | `commands.rs` |
| Q2 | **Bandwidth-Berechnung doppelt implementiert** (Copy-Paste) | `commands.rs:1228-1278` / `1459-1495` |
| Q3 | **`escapeHtml()` 4+ verschiedene Implementierungen** in 7+ Dateien statt zentral in `utils.js` | tree.js, charts.js, bloatware.js, optimizer.js, updates.js, services.js, autostart.js |
| Q4 | **4 verschiedene Toast-Implementierungen** | tree.js, charts.js, export.js, bloatware.js/optimizer.js |
| Q5 | **`parseSize()` 3x identisch dupliziert** | duplicates.js, old-files.js, utils.js |
| Q6 | **Kein `_loaded`-Flag** in mehreren Views — inkonsistentes Pattern | services.js, autostart.js, bloatware.js, updates.js |
| Q7 | **`window.confirm()` statt Tauri-Dialog** an 5 Stellen | network.js, optimizer.js, bloatware.js |
| Q8 | **Version hardcoded** im Frontend (`v7.2.1`) | settings.js:290 |
| Q9 | **Terminal-Theme hardcoded** statt CSS-Variablen | terminal-panel.js:208-252 |
| Q10 | **Admin-Badge hardcoded** `#e74c3c` statt `var(--danger)` | style.css:1203 |
| Q11 | **6+ leere catch-Blöcke** verschlucken Fehler still | app.js:210,232,268,323,538 |
| Q12 | **Toter Code:** zweiter Delete-Handler in app.js, zweite Iteration in scan.rs | app.js:1095-1102, scan.rs:216-230 |
| Q13 | **SVG-Strings inline** bei jedem Render-Aufruf neu erstellt | old-files.js:249-261 |
| Q14 | **Token-Ersetzung dupliziert** in Preview und Apply | batch-rename.js:136-171 / 196-239 |

---

## 12. Tauri Best Practices (Mittel)

| # | Problem | Empfehlung |
|---|---------|-----------|
| T1 | **Kein Single-Instance-Plugin** — App kann mehrfach gestartet werden | `tauri-plugin-single-instance` hinzufügen |
| T2 | **Tray-Icon konfiguriert aber kein Event-Handler** implementiert | Tray-Events in `lib.rs` implementieren oder Tray-Konfiguration entfernen |
| T3 | **Kein Capabilities-Verzeichnis** — keine Tauri-Permissions konfiguriert | `src-tauri/capabilities/` erstellen |
| T4 | **F5-Reload per `location.reload()`** — verliert alle Scan-Daten | Smart-Reload-Pattern verwenden (sessionStorage) |

---

## 13. WCAG / Barrierefreiheit (Mittel/Hinweis)

| # | Problem | Betroffene Dateien |
|---|---------|-------------------|
| W1 | **Keine ARIA-Attribute** in allen 34 JS-Dateien — kein `role`, `aria-label`, `aria-expanded`, `aria-selected` | Alle Views |
| W2 | **Sidebar-Buttons:** `title` aber kein `aria-label` — im schmalen Zustand sind Labels unsichtbar | index.html:87-218 |
| W3 | **Schwarzer Text auf roten Badges:** Kontrast ~3.9:1, unter WCAG-AA-Minimum 4.5:1 | style.css:967,1203,2240 |
| W4 | **Links mit `href="#"`** und JavaScript-Handling — verwirrend für Screenreader | system-profil.js:272,309 |

---

## 14. Erkenntnisse aus Tiefenanalyse (issue_research.md)

Die folgenden Probleme wurden in der Tiefenanalyse vom 14.02.2026 (noch in der Electron-Ära) identifiziert und sind nach der Tauri-Migration **noch relevanter** geworden, da viele Features als Stubs migriert wurden:

### 14.1 Session-Persistenz (Priorität: Hoch)

Die gesamte Session-Verwaltung ist aktuell ein Stub. Scan-Daten, UI-Zustand und Einstellungen werden bei Neustart nicht wiederhergestellt. Im Electron-Backend war dies teilweise implementiert — im Tauri-Backend fehlt es komplett.

### 14.2 Netzwerk-Geräte-Erkennung (Priorität: Hoch)

Die Netzwerk-Erkennung hat fundamentale Probleme (über 20 Schwachstellen in der Tiefenanalyse identifiziert):
- **Discovery:** Nur ICMP Ping — Smartphones und viele IoT-Geräte werden nicht gefunden
- **Klassifizierung:** Hersteller wird 1:1 einem Gerätetyp zugeordnet (falsch bei Multi-Produkt-Herstellern)
- **Reihenfolge:** Synthetische Erkennung vor echten Geräteantworten (UPnP, SNMP, HTTP)
- **Statische Listen statt dynamische Erkennung** — funktioniert nur im Netzwerk des Entwicklers

### 14.3 Statische Listen als generelles Muster (Priorität: Hoch)

Nicht nur die Netzwerk-Erkennung, auch andere Module verlassen sich auf statische Listen:
- **Bloatware-Scanner:** ~44 hardcodierte Programmnamen
- **Software-Kategorisierung:** 150+ hardcodierte Namensmuster
- **Optimizer:** Nur deutsche/englische Windows-Bezeichnungen
- **Bereinigung:** Feste Ordnerpfade für Temp-Dateien
- **Dateitypen:** Feste Extension→Kategorie-Zuordnung

### 14.4 Terminal-Integration (Priorität: Mittel)

Terminal ist komplett Stub im Tauri-Backend. Für echte Terminal-Emulation wäre node-pty/xterm.js nötig — in Tauri/Rust muss dies über native PTY-Bindings (z.B. `portable-pty` Crate) gelöst werden.

### 14.5 Undo-Log / Vertrauenswürdigkeit (Priorität: Mittel)

Phase 1 (Begründungen/Ampeln) und Phase 2 (Dry-Run) waren in Electron teilweise implementiert. Phase 3 (vollständiges Undo-Log mit Wiederherstellung) fehlt komplett. Aktuell gibt es keinen Schutz vor ungewollten Löschungen (besonders kritisch in Kombination mit B1 — Shift+Delete ohne Dialog).

### 14.6 Fehlende UI-Features (Priorität: Niedrig)

- ZIP-Extraktion im Kontextmenü
- Datei-spezifische Icons (statt Standard-Icon für alle)
- "Als Administrator ausführen" im Kontextmenü
- Dateivorschau für Bilder
- PDF-Vollansicht in eigenem Tab

---

## Prioritäten-Empfehlung

### Sofort (Sicherheit + Datenverlust verhindern)

1. **S1-S10:** Command-Injection-Lücken fixen (jeweils 1 Zeile `.replace("'", "''")`)
2. **S32-S35:** CSP aktivieren in `tauri.conf.json`
3. **B1:** Bestätigungsdialog vor Shift+Delete im Explorer
4. **S11-S15:** Pfad-Validierung für destruktive Operationen

### Dringend (Robustheit)

5. **P1:** PowerShell-Timeout in `run_ps()` einbauen
6. **T1:** Single-Instance-Plugin hinzufügen
7. **S16-S31:** XSS-Stellen fixen (zentrales `escapeHtml()` + alle `innerHTML` absichern)
8. **R1-R3:** `unwrap()` durch sichere Alternativen ersetzen

### Wichtig (Funktionalität)

9. **F1-F3:** Preferences und Session-Persistenz implementieren (Daten in JSON-Datei im App-Verzeichnis)
10. **F4-F15:** Stub-Funktionen entweder implementieren oder im UI als "nicht verfügbar" markieren
11. **B3-B4:** tabLoaded-Flags und async-Handling fixen
12. **B10:** CSS-Variable `--border-color` → `--border` korrigieren

### Mittelfristig (Qualität + Performance)

13. **Q1:** `commands.rs` in Module aufteilen
14. **Q3-Q5:** Code-Duplikation beseitigen (escapeHtml, parseSize, Toast)
15. **P5-P8:** DOM-Performance (Virtual Scrolling, Event Delegation)
16. **M1-M12:** Memory Leaks fixen

### Langfristig (Features + WCAG)

17. **W1-W4:** ARIA-Attribute systematisch ergänzen
18. **14.2-14.3:** Netzwerk-Erkennung und statische Listen refactoren
19. **14.4:** Terminal-Integration mit echtem PTY
20. **14.5:** Undo-Log implementieren

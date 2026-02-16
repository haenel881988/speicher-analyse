# Anforderungen: Speicher Analyse (Tauri v2)

> Was die App alles MUSS tun. Referenz-Dokument zur Verifikation.
> Status: MUSS = kritisch, SOLL = wichtig, KANN = nice-to-have

---

## 1. Grundfunktionen

### 1.1 App-Start
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 1.1.1 | App startet und zeigt Hauptfenster | MUSS | `lib.rs: run()` |
| 1.1.2 | Menüleiste sichtbar (Datei, Bearbeiten, Ansicht, Terminal, Hilfe) | MUSS | `lib.rs: setup()` |
| 1.1.3 | Sidebar mit allen Gruppen sichtbar | MUSS | Frontend (index.html) |
| 1.1.4 | Laufwerks-Dropdown zeigt alle Laufwerke | MUSS | `getDrives()` |
| 1.1.5 | Systemfähigkeiten werden korrekt erkannt (Admin, Batterie, WinGet) | MUSS | `getSystemCapabilities()` |
| 1.1.6 | Dark/Light Theme wechselbar | SOLL | Frontend (localStorage) |
| 1.1.7 | Sidebar ein-/ausklappbar | SOLL | Frontend (localStorage) |

### 1.2 Laufwerk-Scan
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 1.2.1 | Scan startet auf Knopfdruck (Laufwerk wählen + Scan-Button) | MUSS | `startScan(path)` |
| 1.2.2 | Fortschrittsanzeige während des Scans (Ordner, Dateien, Größe, Zeit) | MUSS | Event `scan-progress` |
| 1.2.3 | Scan-Ergebnis wird angezeigt nach Abschluss | MUSS | Event `scan-complete` |
| 1.2.4 | Scan-Fehler werden angezeigt | MUSS | Event `scan-error` |
| 1.2.5 | Scan-Daten bleiben im Speicher für alle Views | MUSS | `scan.rs: save()` |
| 1.2.6 | Batterie-Warnung vor Scan (wenn auf Akku) | SOLL | `getBatteryStatus()` + `showConfirmDialog()` |

### 1.3 Bestätigungsdialoge
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 1.3.1 | Bestätigungsdialoge erscheinen als echte System-Dialoge | MUSS | `showConfirmDialog(options)` |
| 1.3.2 | User kann OK oder Abbrechen wählen | MUSS | Rückgabe `{response: 0|1}` |

---

## 2. Analyse-Views (benötigen Scan-Daten)

### 2.1 Ordnerstruktur (Tree View)
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.1.1 | Ordner-Baum zeigt Verzeichnisse mit Größen | MUSS | `getTreeNode(scanId, path, depth)` |
| 2.1.2 | Navigation durch Klick auf Ordner | MUSS | Frontend |
| 2.1.3 | Breadcrumb-Navigation | SOLL | Frontend |

### 2.2 Treemap
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.2.1 | Visuelle Treemap zeigt Speicherverteilung | MUSS | `getTreemapData(scanId, path, depth)` |
| 2.2.2 | Navigation durch Klick auf Bereiche | MUSS | Frontend |
| 2.2.3 | Tooltip bei Hover | SOLL | Frontend |

### 2.3 Dateitypen-Analyse
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.3.1 | Donut-Chart zeigt Dateitypen nach Größe | MUSS | `getFileTypes(scanId)` |
| 2.3.2 | Tabelle mit allen Dateitypen (Erweiterung, Anzahl, Größe) | MUSS | `getFileTypes(scanId)` |
| 2.3.3 | Klick auf Dateityp zeigt einzelne Dateien | SOLL | `getFilesByExtension(scanId, ext)` |
| 2.3.4 | Kategorie-Gruppierung (Bilder, Videos, Dokumente, etc.) | SOLL | `getFilesByCategory(scanId, category)` |

### 2.4 Größte Dateien
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.4.1 | Liste der X größten Dateien | MUSS | `getTopFiles(scanId, limit)` |
| 2.4.2 | Filterung nach Dateityp | SOLL | Frontend |

### 2.5 Alte Dateien
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.5.1 | Liste alter Dateien (> X Tage) mit Alter und Größe | MUSS | `getOldFiles(scanId, thresholdDays, minSize)` |
| 2.5.2 | Schwellenwert einstellbar | SOLL | Frontend |

### 2.6 Dashboard
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 2.6.1 | Zusammenfassung aller Scan-Daten auf einer Seite | SOLL | Kombination mehrerer APIs |
| 2.6.2 | Quick-Links zu anderen Views | SOLL | Frontend |

---

## 3. Bereinigung

### 3.1 Duplikat-Finder
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 3.1.1 | Duplikat-Scan starten | MUSS | `startDuplicateScan(scanId, options)` |
| 3.1.2 | Fortschritt anzeigen | SOLL | Event `duplicate-progress` |
| 3.1.3 | Ergebnisse als Gruppen anzeigen | MUSS | Event `duplicate-complete` / `getSizeDuplicates()` |
| 3.1.4 | Ausgewählte Duplikate löschen können | MUSS | `deleteToTrash(paths)` |

### 3.2 System-Bereinigung (Cleanup)
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 3.2.1 | Temporäre Dateien erkennen (User-Temp, Windows-Temp, Thumbnails) | MUSS | `scanCleanupCategories(scanId)` |
| 3.2.2 | Kategorie-weise Bereinigung | MUSS | `cleanCategory(categoryId, paths)` |
| 3.2.3 | Anzeige der freigegebenen Größe | SOLL | Rückgabe `{deletedCount, errors}` |

### 3.3 Registry-Bereinigung
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 3.3.1 | Verwaiste Registry-Einträge finden | MUSS | `scanRegistry()` |
| 3.3.2 | Registry-Backup vor Bereinigung | MUSS | `exportRegistryBackup(entries)` |
| 3.3.3 | Ausgewählte Einträge bereinigen | MUSS | `cleanRegistry(entries)` |
| 3.3.4 | Backup wiederherstellen | SOLL | `restoreRegistryBackup()` |

---

## 4. System-Management

### 4.1 Autostart-Manager
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 4.1.1 | Alle Autostart-Einträge anzeigen (Registry + Startup-Ordner) | MUSS | `getAutoStartEntries()` |
| 4.1.2 | Autostart aktivieren/deaktivieren | MUSS | `toggleAutoStart(entry, enabled)` |
| 4.1.3 | Autostart-Eintrag löschen | SOLL | `deleteAutoStart(entry)` |

### 4.2 Dienste-Manager
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 4.2.1 | Alle Windows-Dienste mit Status anzeigen | MUSS | `getServices()` |
| 4.2.2 | Dienst starten/stoppen/neustarten | MUSS | `controlService(name, action)` |
| 4.2.3 | Starttyp ändern (Automatisch/Manuell/Deaktiviert) | SOLL | `setServiceStartType(name, startType)` |

### 4.3 System-Optimierer
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 4.3.1 | Optimierungsmöglichkeiten anzeigen | MUSS | `getOptimizations()` |
| 4.3.2 | Optimierung anwenden | MUSS | `applyOptimization(id)` |

### 4.4 Bloatware-Scanner
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 4.4.1 | Vorinstallierte/unnötige Apps erkennen | MUSS | `scanBloatware()` |
| 4.4.2 | App deinstallieren | MUSS | `uninstallBloatware(entry)` |

### 4.5 Update-Manager
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 4.5.1 | Windows-Updates prüfen | MUSS | `checkWindowsUpdates()` |
| 4.5.2 | Update-Verlauf anzeigen | SOLL | `getUpdateHistory()` |
| 4.5.3 | Software-Updates via WinGet prüfen | SOLL | `checkSoftwareUpdates()` |
| 4.5.4 | Software aktualisieren | SOLL | `updateSoftware(packageId)` |
| 4.5.5 | Treiber-Informationen anzeigen | SOLL | `getDriverInfo()` |
| 4.5.6 | Hardware-Informationen anzeigen | SOLL | `getHardwareInfo()` |

---

## 5. Sicherheit

### 5.1 Datenschutz-Dashboard
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 5.1.1 | 12 Windows-Telemetrie-Einstellungen anzeigen | MUSS | `getPrivacySettings()` |
| 5.1.2 | Einzelne Einstellung ändern | MUSS | `applyPrivacySetting(id)` |
| 5.1.3 | Alle Einstellungen auf einmal anwenden | SOLL | `applyAllPrivacy()` |
| 5.1.4 | Einzelne Einstellung zurücksetzen | SOLL | `resetPrivacySetting(id)` |
| 5.1.5 | Alle zurücksetzen | SOLL | `resetAllPrivacy()` |
| 5.1.6 | Geplante Aufgaben auditieren (Telemetrie-Tasks) | SOLL | `getScheduledTasksAudit()` |
| 5.1.7 | Task deaktivieren | SOLL | `disableScheduledTask(taskPath)` |
| 5.1.8 | Sideloading-Status prüfen | KANN | `checkSideloading()` |
| 5.1.9 | Datenschutz-Empfehlungen | KANN | `getPrivacyRecommendations()` |

### 5.2 Sicherheits-Audit
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 5.2.1 | Sicherheitscheck durchführen (Firewall, UAC, Antivirus) | MUSS | `runSecurityAudit()` |
| 5.2.2 | Audit-Verlauf | KANN | `getAuditHistory()` |

### 5.3 Netzwerk-Monitor
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 5.3.1 | Aktive TCP/UDP-Verbindungen pro Prozess anzeigen | MUSS | `getPollingData()` |
| 5.3.2 | Bandbreiten-Statistiken pro Adapter | MUSS | `getBandwidth()` |
| 5.3.3 | Netzwerk-Zusammenfassung (Metriken) | MUSS | `getNetworkSummary()` |
| 5.3.4 | Verbindungs-Gruppierung nach Prozess | MUSS | `getGroupedConnections()` |
| 5.3.5 | Prozess per Firewall blockieren | SOLL | `blockProcess(name, path)` |
| 5.3.6 | Firewall-Regel entfernen | SOLL | `unblockProcess(ruleName)` |
| 5.3.7 | WiFi-Informationen (SSID, Signal, Kanal) | SOLL | `getWiFiInfo()` |
| 5.3.8 | DNS-Cache anzeigen | SOLL | `getDnsCache()` |
| 5.3.9 | DNS-Cache leeren | SOLL | `clearDnsCache()` |
| 5.3.10 | Lokales Netzwerk scannen (Geräte finden) | SOLL | `scanLocalNetwork()` |
| 5.3.11 | Port-Scan für Gerät | SOLL | `scanDevicePorts(ip)` |
| 5.3.12 | SMB-Shares anzeigen | KANN | `getSMBShares(ip)` |
| 5.3.13 | Bandbreiten-Verlauf (Sparklines) | KANN | `getBandwidthHistory()` |
| 5.3.14 | Verbindungs-Diff (neue/entfernte) | KANN | `getConnectionDiff()` |
| 5.3.15 | Aufzeichnung starten/stoppen | KANN | `startNetworkRecording()` / `stopNetworkRecording()` |
| 5.3.16 | Snapshots speichern/laden | KANN | `saveNetworkSnapshot()` / `getNetworkHistory()` |
| 5.3.17 | IP-Adressen auflösen (Organisation/ISP) | KANN | `resolveIPs(ipAddresses)` |

---

## 6. Extras

### 6.1 Datei-Explorer
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.1.1 | Verzeichnis-Inhalt anzeigen (Name, Größe, Datum) | MUSS | `listDirectory(dirPath, maxEntries)` |
| 6.1.2 | Navigation durch Ordner | MUSS | Frontend |
| 6.1.3 | Schnellzugriff (Desktop, Dokumente, Downloads, etc.) | MUSS | `getKnownFolders()` |
| 6.1.4 | Datei öffnen | MUSS | `openFile(filePath)` |
| 6.1.5 | Im Explorer anzeigen | MUSS | `showInExplorer(filePath)` |
| 6.1.6 | Dateien umbenennen | MUSS | `rename(oldPath, newName)` |
| 6.1.7 | Dateien löschen (Papierkorb) | MUSS | `deleteToTrash(paths)` |
| 6.1.8 | Dateien verschieben/kopieren | SOLL | `move(sourcePaths, destDir)` / `copy(sourcePaths, destDir)` |
| 6.1.9 | Neuen Ordner erstellen | SOLL | `createFolder(parentPath, name)` |
| 6.1.10 | Ordner-Größe berechnen | SOLL | `calculateFolderSize(dirPath)` |
| 6.1.11 | Leere Ordner finden | SOLL | `findEmptyFolders(dirPath, maxDepth)` |
| 6.1.12 | Dual-Panel-Ansicht | KANN | Frontend |
| 6.1.13 | Tabs | KANN | Frontend |
| 6.1.14 | Datei-Eigenschaften | SOLL | `getProperties(filePath)` |

### 6.2 Suche
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.2.1 | Schnellsuche im Scan-Index (Name) | MUSS | `searchNameIndex(scanId, query, options)` |
| 6.2.2 | Tiefensuche im Dateisystem | SOLL | `deepSearchStart(rootPath, query, useRegex)` |
| 6.2.3 | Suchergebnisse als Stream | SOLL | Event `deep-search-result` |
| 6.2.4 | Suche abbrechen | SOLL | `deepSearchCancel()` |

### 6.3 Datei-Vorschau / Editor
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.3.1 | Textdatei-Vorschau | MUSS | `readFilePreview(filePath, maxLines)` |
| 6.3.2 | Datei-Inhalt lesen (für Editor) | SOLL | `readFileContent(filePath)` |
| 6.3.3 | Datei-Inhalt speichern | SOLL | `writeFileContent(filePath, content)` |
| 6.3.4 | Binärdatei lesen (Bilder, PDF) | SOLL | `readFileBinary(filePath)` |

### 6.4 Datei-Tags (Farbmarkierungen)
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.4.1 | Farbpalette anzeigen | SOLL | `getTagColors()` |
| 6.4.2 | Tag setzen/entfernen | SOLL | `setFileTag()` / `removeFileTag()` |
| 6.4.3 | Tags für Verzeichnis abrufen | SOLL | `getTagsForDirectory(dirPath)` |

### 6.5 Terminal
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.5.1 | Eingebettetes Terminal (PowerShell) | KANN | `terminalCreate()` / `terminalWrite()` |
| 6.5.2 | Externes Terminal öffnen | SOLL | `terminalOpenExternal(cwd)` |

### 6.6 Export
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 6.6.1 | CSV-Export der Scan-Daten | SOLL | `exportCSV(scanId)` |
| 6.6.2 | PDF-Report | KANN | Frontend (html2pdf.js) |

---

## 7. System-Informationen

### 7.1 System-Profil
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 7.1.1 | Umfassende System-Informationen (CPU, RAM, GPU, Disks, Netzwerk) | MUSS | `getSystemProfile()` |

### 7.2 S.M.A.R.T. Festplatten-Gesundheit
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 7.2.1 | Festplatten-Health anzeigen (Temperatur, Fehler, Verschleiß) | MUSS | `getDiskHealth()` |
| 7.2.2 | Gesundheits-Score pro Disk | SOLL | Berechnung im Backend |

### 7.3 Software-Audit
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 7.3.1 | Installierte Programme inventarisieren | MUSS | `auditSoftware()` |
| 7.3.2 | Verwaiste Einträge erkennen | SOLL | Feld `isOrphaned` |
| 7.3.3 | Software-Korrelation (zugehörige Dateien/Registry) | KANN | `correlateSoftware(program)` |

### 7.4 System-Score
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 7.4.1 | Gesamt-Score 0-100 mit Note (A-F) | MUSS | `getSystemScore(results)` |
| 7.4.2 | Kategorien-Aufschlüsselung | SOLL | Array `categories` |

---

## 8. Einstellungen & Session

### 8.1 Einstellungen
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 8.1.1 | Einstellungen laden | MUSS | `getPreferences()` |
| 8.1.2 | Einzelne Einstellung speichern | MUSS | `setPreference(key, value)` |
| 8.1.3 | Mehrere Einstellungen gleichzeitig | SOLL | `setPreferencesMultiple(entries)` |

### 8.2 Session-Management
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 8.2.1 | Session-Info abrufen (existiert? wann gespeichert?) | SOLL | `getSessionInfo()` |
| 8.2.2 | Session manuell speichern | SOLL | `saveSessionNow(uiState)` |
| 8.2.3 | Session nach App-Neustart wiederherstellen | SOLL | `getRestoredSession()` |
| 8.2.4 | UI-State aktualisieren (für Auto-Save) | SOLL | `updateUiState(uiState)` |

---

## 9. Plattform & Admin

### 9.1 Admin-Funktionen
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 9.1.1 | Admin-Status prüfen | MUSS | `isAdmin()` |
| 9.1.2 | Als Admin neu starten | SOLL | `restartAsAdmin()` |
| 9.1.3 | Plattform erkennen | MUSS | `getPlatform()` |
| 9.1.4 | Externe URLs öffnen | MUSS | `openExternal(url)` |

### 9.2 Shell-Integration
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 9.2.1 | Windows-Kontextmenü registrieren | KANN | `registerShellContextMenu()` |
| 9.2.2 | Kontextmenü-Status prüfen | KANN | `isShellContextMenuRegistered()` |

### 9.3 Globaler Hotkey
| # | Anforderung | Status | Backend-Funktion |
|---|-------------|--------|------------------|
| 9.3.1 | Hotkey setzen/abrufen | KANN | `setGlobalHotkey()` / `getGlobalHotkey()` |

---

## 10. Menüleiste

| # | Anforderung | Status | Implementierung |
|---|-------------|--------|-----------------|
| 10.1 | Datei: Fenster schließen, Beenden | MUSS | Native Tauri-Menü |
| 10.2 | Bearbeiten: Rückgängig, Wiederholen, Ausschneiden, Kopieren, Einfügen, Alles auswählen | MUSS | Native Tauri-Menü |
| 10.3 | Ansicht: Neu laden (F5), Entwicklertools (F12) | MUSS | Native Tauri-Menü |
| 10.4 | Terminal: Ein-/Ausblenden, Neues Terminal | SOLL | Native Tauri-Menü + Event |
| 10.5 | Hilfe: Über | SOLL | Native Tauri-Menü |

---

## 11. Events (Backend → Frontend)

| Event | Zweck | Status |
|-------|-------|--------|
| `scan-progress` | Scan-Fortschritt (Ordner, Dateien, Größe, Zeit) | MUSS |
| `scan-complete` | Scan abgeschlossen (finale Zahlen) | MUSS |
| `scan-error` | Scan-Fehler | MUSS |
| `duplicate-progress` | Duplikat-Scan Fortschritt | SOLL |
| `duplicate-complete` | Duplikat-Scan Ergebnis | MUSS |
| `duplicate-error` | Duplikat-Scan Fehler | SOLL |
| `deep-search-result` | Einzelnes Suchergebnis (Stream) | SOLL |
| `deep-search-progress` | Suchfortschritt | SOLL |
| `deep-search-complete` | Suche abgeschlossen | SOLL |
| `deep-search-error` | Such-Fehler | SOLL |
| `file-op-progress` | Dateioperations-Fortschritt (Kopieren etc.) | KANN |
| `context-menu-action` | Kontextmenü-Aktion ausgewählt | KANN |
| `toggle-terminal` | Terminal ein-/ausblenden (Menü-Aktion) | SOLL |
| `new-terminal` | Neues Terminal (Menü-Aktion) | SOLL |
| `terminal-data` | Terminal-Ausgabe (PTY → Frontend) | KANN |
| `terminal-exit` | Terminal-Session beendet | KANN |
| `tray-action` | Tray-Menü Aktion (Quick-Scan, etc.) | KANN |
| `open-folder` | Ordner öffnen (Shell-Integration) | KANN |
| `open-embedded-terminal` | Terminal für Ordner öffnen | KANN |
| `network-scan-progress` | Netzwerk-Scan Fortschritt | KANN |

---

## 12. Implementierungs-Status (Tauri v2)

### Vollständig implementiert (echte Funktionalität)
- Laufwerk-Erkennung (`getDrives`)
- Laufwerk-Scan (`startScan` + Events)
- Scan-Datenabfragen (Tree, Treemap, TopFiles, FileTypes, Search, OldFiles, FolderSizes)
- Datei-Management (Löschen, Umbenennen, Verschieben, Kopieren)
- Explorer (Verzeichnis-Inhalt, Schnellzugriff, Ordner-Größe)
- Datei-Vorschau und -Editor
- Registry-Scan (Verwaiste Einträge finden)
- Autostart-Einträge (Registry + Startup-Ordner)
- Dienste-Liste und -Steuerung
- Optimierungen (Visuelle Effekte, Prefetch, Transparenz)
- Bloatware-Scanner und -Deinstallation
- Windows/Software-Updates
- Treiber/Hardware-Info
- Datenschutz-Dashboard (12 Einstellungen lesen + Statusanzeige)
- S.M.A.R.T. Festplatten-Gesundheit
- Software-Audit (Programm-Inventar)
- Netzwerk-Monitor (TCP/UDP, Bandbreite, Firewall, WiFi, DNS)
- System-Profil (CPU, RAM, GPU, Disks, Netzwerk)
- Sicherheits-Audit (Firewall, UAC, Antivirus)
- Menüleiste (Datei, Bearbeiten, Ansicht, Terminal, Hilfe)
- Bestätigungsdialoge (echte System-Dialoge)
- Systemfähigkeiten-Erkennung

### Stub/Platzhalter (gibt OK zurück, tut aber nichts)
- Datenschutz-Einstellungen ANWENDEN/ZURÜCKSETZEN
- Registry bereinigen / Backup wiederherstellen
- Autostart aktivieren/deaktivieren/löschen
- Optimierungen tatsächlich anwenden
- Session speichern/wiederherstellen
- Einstellungen persistieren
- Datei-Tags (speichern in %APPDATA%)
- Netzwerk-Aufzeichnungen
- Shell-Integration (Windows-Kontextmenü)
- Globaler Hotkey
- Admin-Elevation
- Terminal (echtes PTY)
- CSV-Export
- Screenshot

---

*Letzte Aktualisierung: 2026-02-15*
*Erstellt als Referenz zur Verifikation aller App-Funktionen*

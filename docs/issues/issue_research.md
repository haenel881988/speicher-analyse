Fehler- und Risikoanalyse des Repository-Codes "Speicher Analyse"
Aktuelle Bugs und fehlerhafte Implementierungen

Sicherheitslücken (kritisch): Im Code finden sich mehrere gravierende Sicherheitsprobleme. Command-Injection ist möglich, da an vielen Stellen PowerShell-Befehle mit ungeprüften Benutzerparametern zusammengesetzt werden. Oft fehlt das korrekte Escaping von ' zu '', wodurch ein Angreifer beliebigen PowerShell-Code einschleusen könnte. Ähnlich kritisch ist Path Traversal: Datei- und Verzeichnispfade aus dem Frontend werden ohne Validierung direkt an File-Operationen übergeben. Dadurch können manipulierte Pfade potenziell beliebige Dateien auf dem System löschen, überschreiben oder auslesen. Weiterhin bestehen XSS-Schwachstellen im Frontend: Zahlreiche Stellen nutzen innerHTML mit ungefiltertem User-Input (Dateinamen, Fehlermeldungen, etc.). In Kombination mit einer deaktivierten Content-Security-Policy (CSP) im Tauri-Setup ist dies gefährlich, da eingeschleuster Script-Code direkt ausgeführt werden könnte. Zudem ist die Tauri-Sicherheitskonfiguration aktuell unsicher: In tauri.conf.json ist CSP komplett deaktiviert und withGlobalTauri auf true gesetzt, was bedeutet, dass sämtliche Tauri-APIs global verfügbar und durch XSS angreifbar sind. Es fehlen auch Tauri-Permissions (kein capabilities-Verzeichnis) zur Einschränkung der Zugriffe. Diese Sicherheitsbugs stellen akute Risiken dar (bis hin zu Datenverlust oder Systemkompromittierung) und haben höchste Priorität.

Funktionale Fehler und unvollständige Implementierungen: Mehrere Programmfunktionen verhalten sich nicht wie erwartet oder sind nur teilweise umgesetzt. Ein Beispiel ist der Datei-Explorer: Die Entfernen-Funktion bestätigt Löschungen nicht konsequent. Insbesondere löscht Shift+Entf Dateien dauerhaft ohne Bestätigungsdialog – ein kritischer Usability-Bug, da versehentliches Löschen unwiderruflich ist. Andere Funktionen haben fehlerhafte Logik, z.B. Flags wie tabLoaded werden zu früh gesetzt, so dass bei Ladefehlern ein Tab nie erneut lädt. Der asynchrone Aufruf autoLoadTab() wird nicht awaited, was bei schnellem Tabwechsel zu Parallel-Operationen führt. Solche Rennbedingungen und fehlende Fehlerbehandlung führen zu instabilen Abläufen. Darüber hinaus existieren über 50 Stub-Funktionen, die { "success": true } zurückgeben, ohne tatsächlich etwas zu tun. Beispielsweise speichern set_preference()/get_preferences() keine Einstellungen (beim Neustart gehen alle Einstellungen verloren) und Funktionen wie apply_privacy_setting() oder toggle_autostart() haben keinerlei Wirkung. Der Nutzer erhält also Erfolgsmeldungen, obwohl keine Aktion erfolgt ist. Dies kann zu Datenverlust (nicht gespeicherte Nutzerpräferenzen) und falschem Sicherheitsgefühl führen. Zudem liefern manche Funktionen Platzhalter-Daten: get_system_score() gibt immer denselben Score zurück (statisch 75, Note "C"), unabhängig vom echten Systemzustand. Solche fehlerhaften oder unvollständigen Implementierungen können die Nützlichkeit der Anwendung stark beeinträchtigen und das Vertrauen der Nutzer untergraben.

Performance- und Speicherprobleme: Im aktuellen Stand gibt es einige Engpässe, die die Leistung und Stabilität beeinträchtigen. Fehlende Timeouts: Der zentrale Aufruf run_ps() besitzt keinen Timeout, sodass ein hängenbleibender PowerShell-Prozess den gesamten Befehlshandler dauerhaft blockieren kann. Auch lange laufende Scans (z.B. deep_search_start) werden ohne Zeitlimit ausgeführt und können Unmengen an Daten im Speicher halten. Blocking Operations: Einige rechenintensive Vorgänge laufen nicht asynchron genug – z.B. blockiert ein großer Verzeichnisdurchlauf (WalkDir) den Async-Thread, da kein spawn_blocking genutzt wurde. Ineffiziente DOM-Updates: Im Frontend werden z.T. sehr große DOM-Abschnitte häufig komplett neu gerendert. Etwa rendert der Dateiexplorer bei jeder Sortierung bis zu 5.000 Zeilen neu via innerHTML, anstatt nur geänderte Elemente zu aktualisieren. Ebenso erzeugen einige Module für jede Zeile individuelle Event-Handler statt Event-Delegation zu nutzen. Dies kann das UI spürbar verlangsamen. Speicherlecks: Es wurden mehrere Stellen identifiziert, an denen Ressourcen nicht freigegeben werden. Beispielsweise sammeln sich Event-Listener an (z.B. werden bei jedem Duplikat-Scan neue Listener registriert, ohne die alten zu entfernen, was bei N Scans zu N-facher Reaktion führt). Mehrere setInterval-Timer werden nie gecleared, sofern der Nutzer Tabs wechselt statt explizit die entsprechende Deaktivierungsfunktion zu triggern. Auch im Rust-Backend gibt es ungebremstes Wachstum: Globale HashMaps (für Netzwerk-Monitoring) werden nie bereinigt, und einige Funktionen (z.B. release_scan_bulk_data()) suggerieren Freigabe, löschen aber tatsächlich nichts. Diese Performance- und Speicherprobleme sind momentan mittelprioritär, da sie nicht sofort zum Absturz führen, aber bei längerer Nutzung oder größeren Datenmengen zu erheblichen Verzögerungen, hoher CPU-/Speicherauslastung oder sogar App-Freezes führen können.

Ursachen der Probleme (Architektur, Abstraktion, Tests)

Viele der obigen Probleme lassen sich auf tieferliegende architektonische und organisatorische Schwächen zurückführen. Ein zentrales Problem ist die fehlende Modularisierung: Die gesamte Backend-Logik ist in wenigen großen Dateien konzentriert. Insbesondere ist src-tauri/src/commands.rs mit rund 1881 Zeilen ein monolithischer Block, der über 100 Befehle enthält. Diese „Gottesklasse“-Struktur erschwert die Wartung enorm – Änderungen an einer Stelle können ungewollte Seiteneffekte anderswo haben, und das Verständnis der Codebasis wird für Entwickler schwierig. Durch diese mangelnde Aufteilung fehlt es an klaren Abstraktionen und Verantwortlichkeiten. Viele Funktionen sind doppelt oder mehrfach implementiert statt zentral bereitgestellt. Beispielsweise wurde die Bandbreiten-Berechnung für den Netzwerk-Monitor zweimal fast identisch implementiert (Copy-Paste). Ebenso existieren mehrfach redundante Hilfsfunktionen: Das Escapen von HTML wird in mindestens 4 verschiedenen Varianten in diversen Dateien umgesetzt, anstatt einmal in utils.js definiert und überall genutzt zu werden. Solche Duplikationen erhöhen das Fehlerrisiko (Inkonsistenzen, vergessene Updates) und deuten auf fehlende Abstraktion hin.

Ein weiterer Grund für viele Probleme ist die historische Architektur-Entscheidung und der Technologiewechsel. Das Projekt wurde ursprünglich unter Electron entwickelt und jüngst auf Tauri (Rust + WebView) migriert. Infolge dieser Migration blieben etliche Features unvollständig. Funktionen, die früher im Electron-Node-Backend implementiert waren, wurden im neuen Rust-Backend teils nur als Platzhalter angelegt (Stichwort Stub-Funktionen). Beispielsweise war die Terminal-Integration unter Electron mittels node-pty gegeben; im Rust-Backend fehlt eine Entsprechung vollständig, sodass alle Terminalfunktionen momentan ins Leere laufen. Diese technische Schulden aus der Migration führen dazu, dass die App zwar neue Technologie nutzt, aber nicht alle früheren Fähigkeiten nahtlos übernommen hat. Ebenso werden im aktuellen Code viele statische Listen als Ersatz für echte Logik genutzt – etwa Hardcodierte Softwarelisten für den Bloatware-Scanner oder fix codierte Hersteller-Mappings für die Netzwerkerkennung. Diese vereinfachten Ansätze mögen als Übergangslösung gedacht sein, zeugen aber von fehlender konzeptioneller Tiefe und können leicht falsch liegen oder übersehen neue Fälle (z.B. unbekannte Programme, unterschiedliche Netzwerkgeräte).

Mangelnde Testabdeckung verstärkt diese Probleme. Im Repository finden sich keine automatisierten Unit- oder Integrationstests. Fehler wie das fehlende Escaping oder die fehlenden Bestätigungsdialoge wurden offenbar nicht durch Tests abgefangen, sondern kamen erst durch manuelle Nutzung oder Code-Durchsicht ans Licht. Gerade sicherheitsrelevante Funktionen und Datenpersistenz sollten durch Tests abgesichert sein. Die Projektdokumentation betont zwar manuelles Testen (sogar mit Puppeteer-Skripten für UI-Tests), aber eine automatisierte Test-Suite fehlt. Das Fehlen von Tests ermöglicht es, dass Regressions oder neue Bugs unbemerkt bleiben, besonders bei umfangreichen Refactorings wie der Tauri-Migration.

Schließlich tragen auch Inkonsistente Konventionen und fehlende Dokumentation im Code zu Fehlerquellen bei. Es gibt z.B. kein einheitliches Pattern für das Laden von Views (einige Module haben _loaded Flags, andere nicht, was zu Uneinheitlichkeiten führt). Viele Fehler werden stillschweigend im Catch-Block geschluckt (leere catch-Blöcke), was die Fehlersuche erschwert – Entwickler bemerken Probleme erst spät, weil keine Logs oder Hinweise ausgegeben werden. Zusammengefasst resultieren die aktuellen Bugs aus einer Kombination von unzureichender Struktur (Monolith statt Module, Duplikate statt Abstraktion), technischen Altlasten (unfertige Migration) und fehlendem automatisiertem Qualitätsnetz (Tests).

Risiken für zukünftige Features oder Erweiterungen

Die genannten strukturellen Probleme bedeuten, dass zukünftige Erweiterungen auf unsicherem Fundament aufsetzen würden. Aktuell ist der Code schwer testbar und wenig flexibel – eng gekoppelte Komponenten machen es schwierig, einzelne Module auszutauschen oder neu zu verwenden. Z.B. müsste man für neue System-Commands immer wieder commands.rs anfassen, was das Risiko von Seiteneffekten erhöht. Ohne Modularität könnte das Hinzufügen neuer Features (etwa die geplanten Module wie Backup-System oder KI-Integration) die Codebasis weiter aufblähen und die Wartbarkeit exponentiell verschlechtern.

Ein großes Risiko besteht darin, dass bestehende Sicherheitslücken oder Schwachstellen künftige Funktionen kompromittieren. Wird z.B. eine neue Funktion hinzugefügt, die ebenfalls PowerShell-Befehle ausführt, und wird die momentane Praxis (fehlendes Escaping) beibehalten, entsteht sofort eine neue Sicherheitslücke. Tight Coupling an unsichere Defaults – etwa die aktuell globale Verfügbarkeit der Tauri-API – bedeutet, dass jeder neue UI-Code im schlimmsten Fall Zugriff auf System-APIs hätte, was die Angriffsfläche für XSS bei jedem weiteren Feature erhöht.

Außerdem sind Leistung und Speicherverbrauch potenzielle Engpässe für neue Features. Ohne Optimierungen (Virtualisierung von Listen, Debouncing von Suchfeldern etc.) skalieren neue datenintensive Features schlecht. Beispielsweise würde ein geplantes „Apps-Kontrollzentrum“ (Issue #9 in der Roadmap) vermutlich zahlreiche Programme auflisten und filtern – mit der jetzigen Rendering-Strategie (komplettes Neurendern großer DOM-Teile) könnte dies zu Performance-Problemen führen. Ebenso könnte eine Deep Packet Inspection (geplante Netzwerk-Paketaufzeichnung, Issue #11) durch fehlende Timeout- und Threading-Konzepte das System auslasten oder die App instabil machen, falls parallele PowerShell-Prozesse nicht beherrscht werden (derzeit hungern parallele PS-Prozesse einander aus, da keine Koordination implementiert ist).

Die zahlreichen Stub-Funktionen stellen ebenfalls ein Risiko dar: Einerseits täuschen sie dem Nutzer Funktionen vor, die gar nicht existieren – das kann zu Vertrauensverlust führen. Andererseits bedeuten sie für Entwickler technische Schulden: Jede dieser halbfertigen Funktionen muss vor einer Erweiterung entweder korrekt implementiert oder entfernt werden. Solange diese Baustellen bestehen, ist es riskant, darauf weitere Features aufzusetzen, da unklar ist, wie viel Fundament noch fehlt oder fehlerhaft ist. Beispielsweise macht es wenig Sinn, ein neues Privacy-Feature hinzuzufügen, solange apply_privacy_setting() und Co. gar nichts tun – erst muss die Basisfunktionalität stimmen.

Zusätzlich besteht ein Wartungsrisiko: Ohne Refactoring wird das Projekt immer personengebundener. Neue Entwickler oder Mitwirkende werden Mühe haben, sich in den unstrukturierten Code einzuarbeiten. Fehlende Dokumentation im Code und die Diskrepanz zwischen Dokumentation und tatsächlichem Code (siehe nächster Abschnitt) könnten für Fehlentwicklungen sorgen, wenn zukünftige Arbeiten nicht genau verstehen, wie etwas gedacht vs. implementiert ist.

Zusammengefasst gefährdet der momentane Zustand die Zukunftstauglichkeit des Projekts. Fehlt eine grundlegende Stabilisierung (Sicherheits-Fixes, Refactoring, Tests), könnten neue Features die Probleme multiplizieren und die Qualität insgesamt sinken. Auch könnte die Skalierbarkeit leiden – was bei einem wachsenden Userkreis oder größer werdenden Datensätzen zu unerwarteten Fehlern und Performanceeinbußen führt. Daher sollten vor größeren Erweiterungen erst die Basisprobleme behoben werden (siehe Empfehlungen), um eine solide, erweiterbare Plattform zu schaffen.

Schwächen in Dokumentation und Konzeption

Die Dokumentation rund um das Projekt ist umfangreich, weist aber in einigen Punkten Unstimmigkeiten und Lücken auf. Auffällig ist, dass Teile der Dokumentation veraltet sind: Das README und ältere Planungstexte beziehen sich noch auf Electron als Runtime, obwohl der Code bereits (teilweise) auf Tauri umgestellt wurde. Diese veralteten Konzepte in der Doku können neue Entwickler oder Nutzer in die Irre führen. Beispielsweise werden im README Installationsschritte für Node/Electron angegeben, während das aktuelle Setup eigentlich Rust/Tauri erfordert – solche Abweichungen sollten dringend korrigiert werden, um Klarheit zu schaffen.

Positiv ist, dass Prozessdokumente (Issue-Tracker in docs/issues/, Projektpläne, Changelog) sehr ausführlich und benutzerorientiert geschrieben sind. Allerdings gibt es Unklarheiten in den Anleitungen an einigen Stellen. So wird in den KI-gestützten "Skill"-Dokumenten (Ordner .claude/skills/) zwar detailliert beschrieben, wie Releases oder Tests durchzuführen sind, doch diese beziehen sich teils noch auf den alten Stand (z.B. Versionierung über Cargo.toml und package.json). Solche Inkonsistenzen könnten dazu führen, dass ein Contributor nach falschen Dateien sucht oder Schritte doppelt ausführt. Ebenso wäre es hilfreich, in der Nutzerdokumentation (z.B. einer Hilfeseite) darauf hinzuweisen, welche Funktionen aktuell noch nicht funktionsfähig sind (wegen Stub) – dies fehlt bislang. Nutzer erfahren nur implizit durch Nicht-Wirken einer Aktion, dass ein Feature unimplementiert ist.

Konzeptionelle Schwächen zeigen sich außerdem in der Benennung und Sichtbarkeit von Risiken: Einige gefährliche Aktionen (wie das erwähnte dauerhafte Löschen per Shift+Entf) sind nicht durch UI-Konzept abgesichert (fehlendes Undo-Log, keine Warnung). Hier fehlt ein durchdachtes UX-Konzept, das Nutzer vor Datenverlust schützt (z.B. Papierkorb-Konzept oder Undo-Funktion bei Löschungen). Die Planung („Vertrauens-System/Undo-Log“) erkennt dieses Defizit zwar, wurde aber noch nicht umgesetzt.

Zudem könnte die Code-Lesbarkeit verbessert werden, was ebenfalls eine Form von Dokumentation ist. Kommentare im Code sind relativ spärlich, obwohl einige komplizierte Workarounds oder wichtige Konstanten (z.B. fest eingebaute Pfade oder Registry-Schlüssel) eine Erklärung verdient hätten. Auch Style-Inkonsistenzen (mal Deutsch, mal Englisch in Bezeichnern oder Meldungen) erschweren das Lesen. Insgesamt ist die formale Dokumentation (Markdown-Dateien) auf einem guten Weg, muss aber kontinuierlich nachgeführt werden, damit sie mit dem Code synchron bleibt. Und die informelle Dokumentation (Code-Kommentare, saubere Benennung, Fehler-Logs) sollte verbessert werden, um Konzept und Implementation für alle Beteiligten verständlich zu machen.

Konkrete Verbesserungsvorschläge

Auf Basis der Analyse lassen sich folgende Maßnahmen ableiten, um Fehler und Risiken strukturell und nachhaltig zu beheben:

Sicherheits-Fixes sofort umsetzen: Command Injection verhindern, indem in allen PowerShell-Aufrufen vor dem format!-Einsetzen der Parameter ein Escape angewendet wird (.replace("'", "''") an jeder Stelle). Außerdem für Parameter wie IP-Adressen Regex-Validierung einführen (Format und Wertebereich prüfen). Path Traversal vorbeugen, indem Pfade aus dem Frontend nur nach strikter Validierung akzeptiert werden (z.B. prüfen, dass sie innerhalb zulässiger Verzeichnisse liegen, keine Systempfade enthalten). Alle Lösch-/Überschreib-Operationen sollten einen Bestätigungsdialog erfordern – hierfür die vorhandenen Windows-Dialog-APIs (oder Tauri-Dialoge) nutzen statt window.confirm(). CSP in der Tauri-Konfiguration wieder aktivieren (default-src 'self'; script-src 'self' in tauri.conf.json) und withGlobalTauri auf false stellen, sodass Frontend-Code nur über die definierte Brücke auf Tauri-APIs zugreifen kann. Kurz: alle in der Analyse aufgeführten Sicherheitslücken S1–S15 und S32–S35 umgehend patchen.

Datenverlust und fehlerhafte Funktionen korrigieren: Die vielen Stub-Funktionen entweder implementieren oder im UI als “nicht verfügbar” markieren, bis sie umgesetzt sind. Insbesondere müssen Einstellungen und Sessions persistent gespeichert werden (z.B. als JSON-Datei in einem App-Datenverzeichnis), damit Nutzerkonfigurationen und Scan-Ergebnisse einen Neustart überstehen. Features wie Datei-Tags, Privacy-Einstellungen, Autostart-Änderungen etc. sollten funktionieren oder aus der Oberfläche entfernt werden, um keine falschen Erwartungen zu wecken. Einen Undo-Mechanismus für destruktive Aktionen einplanen (mindestens ein Papierkorb für Löschvorgänge, besser noch ein vollwertiges Undo-Log für Änderungen an Systemeinstellungen) – dies schützt vor irreversiblen Fehlern und erhöht das Vertrauen der Anwender.

Robustheit und Performance verbessern: Im Rust-Backend alle blocking Calls mit Zeitlimits und Threads absichern. Konkret einen Timeout von z.B. 30 Sekunden für run_ps() einführen (via tokio::time::timeout), damit kein Prozess unendlich hängt. Auch parallele PowerShell-Aufrufe vermeiden – nötigenfalls eine Queue einführen, um sie sequenziell abzuarbeiten. Im UI sollten große DOM-Updates optimiert werden: Einsatz von Virtual Scrolling für Listen, Debounce bei Suchfeldern (z.B. im Software-Audit) und Event Delegation anstelle vieler Einzellisten-Listener. Alle dauerhaft laufenden Timer und Observer müssen in den entsprechenden destroy()-Methoden aufgeräumt werden (z.B. clearInterval, disconnect() für ResizeObserver). Speicherleck-Stellen (wie akkumulierte Listener) sind zu schließen, indem man pro View ein Flag setzt, damit Initialisierungen nur einmal erfolgen und beim Verlassen rückgängig gemacht werden. Ebenso sollten im Rust-Teil globale Stores (z.B. bw_prev_store) regelmäßige Bereinigung erfahren oder begrenzt wachsen. Diese Maßnahmen stellen sicher, dass die App auch unter Dauerlast stabil bleibt.

Code-Qualität und Architektur refactoren: Den großen commands.rs in logisch getrennte Module aufspalten (z.B. nach Themen: FileOps, Registry, Network, System etc.), um die Übersicht zu verbessern. Duplizierten Code konsolidieren – eine Utility-Library für allgemeine Helfer (Escaping, Formatierungen wie parseSize(), Toast/Notification-Funktion etc.) zentral bereitstellen und in allen Modulen verwenden. Dadurch sinkt die Wahrscheinlichkeit, an einer Stelle einen Fix zu vergessen. Coding-Conventions vereinheitlichen (z.B. überall _loaded-Flags verwenden oder ein gemeinsames Pattern definieren, sodass jeder Tab weiß, wann Daten geladen sind). Fehlerbehandlung verbessern: Keine leeren catch-Blöcke mehr – stattdessen Fehler zumindest loggen oder dem UI melden. Rust-unwrap()-Aufrufe durch sichere Alternativen ersetzen (unwrap_or_else(...) oder Fehlerhandling mit sinnvollen Fehlermeldungen), um Panics zu vermeiden. Zudem sollten für kritische Bereiche automatisierte Tests geschrieben werden: z.B. ein Unit-Test für das Escaping, Integrationstests für Pfad-Operationen (schreibt delete_permanent() tatsächlich nur erlaubte Pfade?). Eine testbare Architektur (mit kleineren, isolierbaren Komponenten) erleichtert dies enorm.

Dokumentation aktualisieren und erweitern: Alle offiziellen Dokumente (README, Installationshinweise, Architektur-Übersichten) auf den neuesten Stand bringen – insbesondere den Wechsel zu Tauri/Rust klar kommunizieren, damit Entwickler die richtigen Werkzeuge verwenden. Die Diskrepanz der Versionierung (Changelog spricht von v8.0-Features, Code deklariert noch 7.2.1) auflösen, indem nach Abschluss der Fixes ein konsistenter Versionssprung durchgeführt und in allen relevanten Dateien aktualisiert wird. In der Nutzerdoku oder UI kenntlich machen, welche Funktionen noch experimentell oder inaktiv sind, um Frust zu vermeiden. Die vorhandenen Governance- und Qualitätsrichtlinien (siehe docs/planung/governance.md) konsequent einhalten und bei Änderungen stets prüfen, ob sie weiter gültig sind – so bleibt die Dokumentation lebendig. Schließlich sollte man in Code-Kommentaren wichtige Entscheidungen oder Warnungen notieren (z.B. Hinweis, dass bestimmte Listen nur temporär hardcoded sind, oder TODO-Kommentare an Stellen, die noch verbessert werden müssen). Dies hilft künftigen Beitragsleistenden, den Kontext zu verstehen.

Durch diese gezielten Maßnahmen – zunächst kritische Sicherheits- und Datenverlustprobleme angehen, dann den Code strukturell aufräumen und absichern – wird die Bestandssicherheit deutlich erhöht. Gleichzeitig schafft man eine solide Grundlage für kommende Erweiterungen: ein Code, der modular, testbar und gut dokumentiert ist, lässt sich wesentlich nachhaltiger ausbauen. Wichtig ist, die Verbesserungen nicht als einmalige Aktion zu sehen, sondern als laufenden Prozess der Qualitätssteigerung. Mit jedem behobenen Altlast-Thema (Security, Performance, Architektur) steigt die Zukunftstauglichkeit der Anwendung deutlich an. So kann Speicher Analyse vom aktuellen fortgeschrittenen Prototypen zu einer stabilen, sicheren und leicht erweiterbaren Anwendung reifen.



Tiefenrecherche zum Quellcode von Speicher‑Analyse
Einleitung und Zielsetzung

Diese Untersuchung analysiert den gesamten Quellcode, die Anwendungslogik, Dokumentationen und Entwicklungsvorgaben der Windows‑Anwendung Speicher‑Analyse. Ziel ist, alle relevanten Probleme (Sicherheitslücken, Design‑ oder Architekturfehler, veraltete Anweisungen, unvollständig implementierte Funktionen, Wartungs‑ und Performanceschwachstellen) zu identifizieren, ihre Ursachen zu verstehen und konkrete Maßnahmen für eine nachhaltige Verbesserung abzuleiten. Grundlage sind das aktuelle GitHub‑Repository haenel881988/speicher-analyse (Stand 16. Februar 2026) und die vorhandenen Skills‑ und Dokumentationsdateien.

Architekturüberblick

Laut README ist Speich­er‑Analyse ein moderner Windows‑System‑ und Festplattenanalysator. Das Frontend nutzt Tauri (vormals Electron) mit einer Kombination aus vanilla HTML/CSS/JavaScript und Chart.js; für Terminalintegration wird node‑pty + xterm.js verwendet. Das Backend besteht aus Rust‑Modulen (Tauri Commands) und PowerShell‑Skripten. Die Hauptfunktionen umfassen Verzeichnis‑Scans mit Baum‑/Treemap‑Darstellung, Dateiexplorer mit Tabs, Duplicate‑Finder, Old‑Files‑Detection, Systemoptimierung (Cleanup, Registry‑Cleaner, Autostart‑Manager, Bloatware‑Erkennung), Sicherheits‑/Privatsphäre‑Tools (Privacy‑Dashboard, Netzwerk‑Monitor, Gerätetracker), Hardware‑Info und diverse Extras wie Terminal und Tags. Die neueste Version ist 7.2.1 (Stand README).

Analyse des Quellcodes
1. Veraltete Skills und fehlende Migration

In der Dokumentation (docs/issues/issue_meta_analyse.md) wird detailliert erklärt, dass neun vorhandene Skills weiterhin Electron‑Spezifika nutzen und nicht an die Tauri‑Migration angepasst wurden. Dazu gehören z. B. Befehle wie app.command.invoke, ipcRenderer oder clipboard.readText, die im Tauri‑Kontext nicht existieren. Gleichzeitig fehlen in den Skills Anweisungen für wichtige Tauri‑Themen wie CSP‑Header, Speicherbereinigung oder Fensterkonfiguration. Als Folge orientieren sich Entwickler an veralteten APIs oder erhalten widersprüchliche Handlungsanweisungen. Dies führte zu unsicheren Implementierungen, z. B. dem direkten Zugriff auf window.__TAURI__ (globalTauri) statt der isolierten API (siehe CSP‑Problem unten).

Ursache: Die Skills wurden nach der Migration von Electron zu Tauri nicht aktualisiert. Zudem existiert keine zentrale Prozessbeschreibung, wann Skills angepasst, überprüft und versioniert werden müssen.

Empfehlung: Alle Skills müssen auf Tauri angepasst werden. Eine Skill‑Governance mit Versionsnummern und Change‑Logs sollte eingeführt werden. Prüfungen sollten bei jedem Release sicherstellen, dass Skills mit der aktuellen Codebasis übereinstimmen. Fehlende Skills (z. B. Tauri‑Sicherheitsrichtlinie, Modul zum Speichermanagement) sollten neu erstellt werden.

2. Unsichere Ausführung von PowerShell‑ und Shell‑Befehlen

Die Rust‑Funktionen run_ps, run_ps_json und run_ps_json_array führen PowerShell‑Skripte aus. In commands.rs werden diese häufig mit unescaped Parametern aufgerufen, etwa beim Löschen von Dateien, beim Starten des Terminal‑Emulators oder beim Ausführen von Registry‑Befehlen. Das Dokument issue_meta_analyse.md zeigt mehrere Beispiele, bei denen Parameter mittels format!() direkt in PowerShell‑Skripte eingebettet werden. Dadurch können Angreifer über Dateinamen, Pfade oder Benutzereingaben beliebigen Code injizieren (Command‑Injection). Obwohl manche Funktionen versuchen, ' durch '' zu ersetzen, ist die Umsetzung inkonsistent.

Ursache: Fehlende zentrale Escape‑Funktion und unklare Vorgaben. In mehreren Frontend‑Dateien werden unterschiedliche Escaping‑Varianten implementiert. Die Entwickler verlassen sich auf unsichere Patterns, da in den Skills keine saubere Richtlinie zur Befehlsausführung existiert.

Empfehlung:

Zentrale Escape‑Funktion: Im Backend sollte eine Funktion implementiert werden, die PowerShell‑Argumente zuverlässig quoted. Diese Funktion ist zwingend in allen Befehlsaufrufen zu verwenden.

Whitelist‑Ansatz: Validieren Sie Eingaben wie Dateipfade, Prozessnamen, IP‑Adressen gegen Whitelists oder Regex.

Runspaces verwenden: PowerShell‑Runspaces erlauben das Übergeben strukturierter Parameter ohne String‑Interpolation.

Timeouts setzen: run_ps verwendet aktuell kein hartes Timeout (die 30s‑Timeout fehlt im Code); hier sollten für lange Operationen Timeouts konfiguriert werden.

3. Unzureichende Pfadvalidierung und Kontrollmechanismen

Viele dateibasierte Funktionen (Löschen, Verschieben, Kopieren, Umbenennen) nutzen validate_path, das jedoch nur auf windows/system32 und syswow64 prüft. Andere sensible Verzeichnisse (z. B. Program Files, Benutzerprofil oder Registry‑Hives) werden nicht geschützt. Einige Funktionen wie file_rename oder file_copy prüfen den Zielpfad gar nicht. Zudem werden destruktive Aktionen ohne Rückfrage ausgeführt (keine Dialoge/Undo). Das erhöht das Risiko unbeabsichtigter Systembeschädigungen.

Ursache: Fehlende ganzheitliche Sicherheitsstrategie und unvollständige Übernahme aus Electron. validate_path ist nur ein Relikt aus früherer Version.

Empfehlung:

Pfadvalidierung erweitern: Systemverzeichnisse, geschützte Benutzerverzeichnisse und Laufwerkswurzeln müssen blockiert werden. Alle Parameter (Quelle und Ziel) sollten validiert werden.

Benutzerbestätigung einfordern: Vor dem Löschen oder Verschieben von Dateien muss ein Dialog erscheinen. Zudem sollten Undo‑Funktionen implementiert werden.

Logging: Alle riskanten Aktionen loggen und auditieren.

4. Fehlender Input‑Escape und XSS‑Risiken

Das Frontend generiert u. a. Kontextmenüs und Dateilisten per innerHTML. Laut Dokumentation existieren mehrere Escape‑Implementierungen; eine einheitliche, solide Lösung fehlt. Durch unsachgemäßes Encodieren können Benutzer mit speziell formatierten Dateinamen oder Registry‑Werten Skripte einschleusen und im WebView ausführen (XSS). Weiterhin erlaubt die open-external Funktion im Renderer das Öffnen externer URLs ohne ausreichende Prüfung.

Ursache: Veraltete bzw. fehlende Skills zu HTML‑Escaping und Tauri‑CSP.

Empfehlung:

Eine zentrale Escaping‑Funktion auf Frontend‑Seite (z. B. escapeHTML()) erstellen und überall anwenden.

Keine Strings via innerHTML einsetzen, sondern DOM‑APIs verwenden.

CSP (Content‑Security‑Policy) aktivieren und withGlobalTauri im Tauri‑Config deaktivieren, um window.__TAURI__ abzuschalten.

Eingaben aus Dateien, Registry, Netzwerken etc. konsequent escapen.

5. Memory‑Leaks und Performanceprobleme

Mehrere Teile des Codes benutzen Intervals, Event‑Listener oder fs.watch() ohne ordnungsgemäße Bereinigung. Das Meta‑Analyse‑Dokument listet verschiedene Beispiele: NIC‑Monitoring, Battery‑Status, Explorer‑Tabs u. v. m. vergisst das Entfernen von Listenern bei Tab‑Wechsel oder beim Schließen. Ebenfalls werden große Dateien und Scan‑Daten in einem globalen OnceLock<Mutex<HashMap>> gespeichert. Das blockiert andere Threads und kann beim Speichern neuer Scans zum Überschreiben bestehender Daten führen. Im Network‑Monitor werden Bandbreiten‑Verläufe in HashMaps abgelegt, die unendlich wachsen.

Ursache: Keine klaren Vorgaben zur Speicherverwaltung, fehlende Weak‑Referenzen und keine Limitierung für Historien.

Empfehlung:

Resource‑Cleanup: Alle Listener und Timeouts beim Verlassen einer Ansicht entfernen. Die Skills sollten hierfür Checklisten enthalten.

Begrenzte Historien: Für Bandbreitenverläufe und Logs Begrenzungen definieren; Alte Einträge entfernen.

Thread‑safe Speicher: scan.rs sollte pro Scan eine eigene Instanz (z. B. Arc<Mutex<..>>) verwenden statt globaler HashMap, um Parallelität zu ermöglichen.

Profiling: Regelmäßig Speichernutzung messen und Leaks beseitigen.

6. CSP‑Konfiguration und withGlobalTauri

Die Tauri‑Konfiguration (tauri.conf.json) setzt security.csp auf null und aktiviert allowlist.withGlobalTauri. Dadurch wird kein Content‑Security‑Policy‑Header gesetzt und window.__TAURI__ steht überall zur Verfügung. Diese Einstellung öffnet Angriffsmöglichkeiten: durch XSS kann der Angreifer direkt Tauri‑APIs aufrufen (Dateizugriff, Ausführen von Befehlen). Ein angemessener CSP schützt vor Einbettung fremder Skripte, und das Deaktivieren von withGlobalTauri erzwingt die Nutzung von isolierten Tauri‑APIs via @tauri-apps/api.

Ursache: Wahrscheinlich aus Bequemlichkeit beim Prototyping aktiviert und dann nie mehr angepasst. Fehlende Erwähnung in Skills.

Empfehlung:

CSP definieren: Mindestens default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; etc. Im WebView sollte das Laden externer Ressourcen verboten sein.

withGlobalTauri deaktivieren: Dadurch ist window.__TAURI__ nicht mehr global verfügbar. Nur die sichere API aus @tauri-apps/api sollte genutzt werden.

7. Verwendung statischer Listen und heuristischer Erkennung

Mehrere Features, insbesondere Bloatware‑Erkennung, Netzwerkgeräterkennung und Software‑Audit, basieren auf hartkodierten Listen (z. B. bekannte bloatware‑Pakete oder Gerätekategorien). In den Dokumenten wird hervorgehoben, dass statische Listen unvollständig sind und die Erkennung neuer Programme verhindern. Für Netzwerkgeräte wurden IP‑Geräte anhand der MAC‑OUI statisch klassifiziert (z. B. Apple, Samsung). Die Meta‑Analyse warnt vor dieser Herangehensweise und fordert dynamische Heuristiken.

Ursache: Mangelnde Skalierbarkeit und fehlende maschinelle Lernansätze.

Empfehlung:

Dynamische Scans einsetzen: z. B. Hash‑Abgleich mit VirusTotal, heuristische Analyse von Autostart‑Einträgen, zentrale Update‑Listen.

Netzwerkgeräte anhand ihrer Dienste (mDNS, UPnP, NetBIOS) und nicht ausschließlich anhand von OUIs klassifizieren.

Bloatware‑Liste regelmäßig von vertrauenswürdigen Quellen aktualisieren; Benutzerfeedback einbeziehen.

8. Unvollständig implementierte oder stubhafte Funktionen

In commands.rs existieren diverse Stub‑Funktionen, die nur success: true zurückgeben, aber keine Aktion ausführen. Dazu gehören Duplicate‑Finder, Netzwerkaufnahme (Start/Stop), Export‑Funktionen und andere. Auch das System‑Score‑Modul liefert einen hartkodierten Score (34,67). Bei Audit‑Funktionen (z. B. Sicherheit und Bloatware) wird lediglich die Oberfläche erstellt, ohne konkrete Implementierung.

Ursache: Es handelt sich um geplante Features, die wegen Zeitmangel noch nicht implementiert wurden oder auf externe Bibliotheken warten. Fehlende Skills für die Entwicklung von stufenweisen Stub‑Implementierungen.

Empfehlung:

Stubs entfernen oder klar als „in Arbeit“ markieren, um falsche Sicherheit zu vermeiden.

Agile Vorgehensweise: Funktionen schrittweise implementieren und testen, statt ganze Featureblöcke als Stub einzubauen.

Automatisierte Tests schreiben, die Stubs erkennen und fehlschlagen, solange sie nicht implementiert sind.

9. Unklare Update‑ und Versionierungsstrategie

Das Audit‑Dokument kritisiert, dass es keine konsistente Strategie für Skills‑Updates und Versionsverwaltung gibt. Die Skills und Dokumente werden sporadisch aktualisiert, ohne dass das Entwicklerteam darüber informiert wird. Dies führt zu „Anachronismen“ und Unsicherheiten. Auch im Code ist keine Versionierung der Commands oder API‑Endpunkte zu finden.

Empfehlung:

Einführung eines Versionierungs‑Schemas (SemVer) für Skills und Dokumentationen.

CI/CD‑Pipelines sollten Skills‑Versionen überprüfen und Blocker auslösen, wenn veraltete Skills verwendet werden.

Ein „Audit‑Tool“ im Repository sollte regelmäßig die Konsistenz zwischen Skills, Dokumenten und Code prüfen.

10. Weitere Probleme

Concurrency‑Probleme: Das globale scans‑Map kann beim Starten eines neuen Scans Daten überschreiben und blockiert andere Anfragen. Parallel laufende Deep‑Search‑Worker werden nicht sauber terminiert.

Fehlende Fehlerbehandlung: Viele Funktionen geben bei Fehlern nur Ok(()) zurück oder loggen das Problem, ohne Feedback an die UI.

Fehlende Zugriffsbeschränkungen: Tauri‑Command‑Handler validiert nicht, welcher Benutzer die Aktion ausführt. Eine Rechteverwaltung (Standard/Administrator) fehlt teilweise.

WCAG‑Konformität: Die Dokumente erwähnen Kontrastprobleme und fehlende Tastatursteuerung.

Sicherheit der Update‑Funktion: Software‑Updates werden über unsignierte Quellen (z. B. Github‑Releases) geladen; es existiert keine Signaturprüfung.

Zusammenfassung der Hauptursachen

Unvollständige Migration von Electron zu Tauri: Viele alte Patterns blieben bestehen (IPC‑Kommunikation, globale API, unsichere Browser‑Settings).

Fehlende klare Entwicklungsrichtlinien: Skills und Dokumente wurden nicht gepflegt. Sicherheit, Pfadprüfung, Logging und Speicherverwaltung sind unzureichend geregelt.

Übermäßiger Einsatz von PowerShell: Die App verlagert fast alle systemnahen Funktionen in PowerShell‑Skripte, was zwar mächtig ist, aber ohne professionelle Escaping‑Strategien gefährlich wird.

Überladener Funktionsumfang: Das Projekt versucht, viele heterogene Funktionen zu vereinen (Scan, Cleanup, Netzwerk, Terminal, Security). Dies erhöht die Komplexität und verwässert den Fokus, sodass einzelne Module halbherzig umgesetzt werden.

Handlungsempfehlungen und Ausblick

Modernisierung der Skills und Dokumentation

Skill‑Redesign: Jede Funktion sollte eine eigene Skill‑Beschreibung haben (Zweck, API, Sicherheitsaspekte). Alte Electron‑Fragmente sind vollständig zu entfernen.

Querverlinkung: Skills müssen an den entsprechenden Stellen in Code kommentiert und in Dokumente eingebettet werden, um Awareness zu schaffen.

Regelmäßige Audits: Ein dediziertes Team sollte Skills und Code in festen Intervallen prüfen.

Hardening des Backends

Verwendung von sicheren APIs: Wo möglich, native Rust‑Bibliotheken anstelle von PowerShell verwenden (z. B. walkdir für Dateizugriff, sysinfo für Systeminformationen).

Parameter‑Escaping: Eine Utility‑Funktion für sichere Shell‑Parameter ist zwingend.

Fehlerbehandlung: Kommandos dürfen nicht stumm fehlschlagen; Rust‑side Logging und strukturierte Fehler an die UI sind erforderlich.

Robuste Pfad‑ und Berechtigungsverwaltung

Zusätzliches Whitelisting: Nur benutzerdefinierte, im Explorer geöffnete Verzeichnisse sollten für Operationen freigegeben werden.

Berechtigungskonzept: Klare Abgrenzung von Standard‑ vs. Administratorrechten. Aktionen mit Systemeingriff benötigen Admin‑Freigabe.

Verbesserung der Frontend‑Sicherheit

CSP aktivieren und withGlobalTauri deaktivieren.

Sanitizing: Zentralisiertes HTML‑Escaping und Verbot von innerHTML.

Dialoge und Undo: Jede destruktive Aktion bedingt eine Benutzerbestätigung und bietet eine Rückgängig‑Funktion.

Skalierbare Architektur und Modultrennung

Modularisierung: Das Projekt sollte in separate Module aufgeteilt werden (z. B. scan, cleanup, network, privacy). Jedes Modul sollte ein klar definiertes API haben.

Stubs abschaffen: Funktionen sollten implementiert oder entfernt werden.

Testabdeckung: Unit‑ und Integrationstests für jedes Modul. Stubs führen zu Testfehlern, um Implementierung zu erzwingen.

Dynamische Erkennungsmechanismen

Heuristik statt statischer Listen: Bloatware‑Erkennung und Software‑Audit sollten machine‑learning‑gestützte Modelle oder regelmäßig aktualisierte Online‑Dienste nutzen.

Netzwerkgeräte anhand Protokollen identifizieren (UPnP, mDNS, NetBIOS).

Tooling und Prozessverbesserungen

Automatisiertes Audit‑Tool: Ein Skript prüft, ob neue Funktionen den Sicherheitsrichtlinien entsprechen (Escaping, Pfadvalidierung, CSP, Speicherbereinigung).

CI/CD‑Pipelines: Bei jedem Commit werden Linter, Sicherheits‑Scanner (Clippy, Cargo‑Audit) und Tests ausgeführt.

Code‑Reviews: Mehrstufiger Reviewprozess mit Fokus auf Sicherheit und Performance.

Fazit

Die Speicher‑Analyse‑App ist funktionsreich, leidet jedoch unter technischen Schulden, unzureichenden Sicherheitsmaßnahmen und fehlender Konsistenz zwischen Dokumentation, Skills und Code. Die Migration von Electron zu Tauri wurde nie vollständig abgeschlossen und veraltete Anweisungen werden weiterverwendet. Insbesondere die unsichere Ausführung von PowerShell‑Befehlen, unzureichende Pfad‑Validierung und fehlende CSP‑Einstellungen stellen erhebliche Risiken dar. Gleichzeitig existieren viele unvollständige Features und Stubs, die das Vertrauen in die Software untergraben.

Mit den empfohlenen Maßnahmen – Modernisierung der Skills, strenge Sicherheitsrichtlinien, modulare Architektur und dynamische Erkennungsmechanismen – kann die Anwendung jedoch zu einer robusten, sicheren und skalierbaren Systemanalyse‑Suite weiterentwickelt werden. Eine klare Governance für Updates und regelmäßige Audits sind dabei unerlässlich, um zukünftige Probleme frühzeitig zu erkennen und zu vermeiden.
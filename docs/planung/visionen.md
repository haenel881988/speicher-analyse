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



## Experimentelles

1. Die "Bring Your Own Brain" (BYOB) Strategie
Statt eine eigene KI "einzubauen" (was Serverkosten verursacht und Datenschutzfragen aufwirft), baust du nur die Schnittstellen.

A. Die Cloud-Option (Für Bequeme):

Feature: Der User meldet sich via cli / powershell einfach an, und z.B.: gemini oder claude cli fragt den rest.

Vorteil: Du hast 0 Euro Serverkosten. Der User zahlt seine API- / Usage Nutzung selbst.

Datenschutz: Der API-Key wird lokal im Electron safeStorage (verschlüsselt) gespeichert. Die App sendet den Prompt direkt vom PC an die API (kein Proxy über deinen Server).

B. Die Local-Option (Für "Paranoide" & Profis):

Integration: Du setzt auf Ollama (der aktuelle Standard für lokale LLMs).

Workflow:

Deine App prüft beim Start: "Läuft ein Server auf localhost:11434?"

Falls ja: Zeige im Dropdown automatisch die installierten Modelle (z.B. Llama 3, Mistral).

Falls nein: Biete einen Button "Lokale KI einrichten" -> Öffnet dein Terminal-Modul und zeigt den Befehl zur Installation (winget install ollama).

Der Clou: Damit hast du eine 100% offline fähige KI, die Dokumente zusammenfassen, Mails schreiben oder Code erklären kann, ohne dass ein einziges Byte den PC verlässt.

2. Das "Notion-Modul" mit KI-Power
Du baust nicht nur ein Notiz-Tool, du baust ein "Active Knowledge Board".

Der "KI-Assistent" Button: Neben jedem Textblock (wie in Notion) ist ein kleines Icon.

Funktionen:

"Fasse diesen PDF-Anhang zusammen" (Liest den Text aus deinem PDF-Modul, sendet ihn an Llama 3 lokal).

"Erkläre diesen Registry-Key" (Nimmt den Key aus deiner Registry-Analyse).

"Schreibe diese Notiz professioneller".

3. Das "Offline-Lizenzierungs-System" (Der Trust-Anchor)
Das ist technisch absolut machbar und für deine Zielgruppe ("Schweizer Datenschutz") entscheidend.

Das Konzept: Asymmetrische Kryptographie (RSA/ECC)

Der Server (Dein Shop):

Hat den Private Key (Geheim!).

Wenn User kauft: Generiert eine Lizenz-Datei (lizenz.key).

Inhalt: {"email": "user@mail.com", "type": "LIFETIME", "features": ["AI", "PDF", "CLEAN"], "signature": "X9F3..."}.

Diese Datei wird per Mail versendet.

Der Client (Deine App):

Hat den Public Key (im Code fest verbaut).

Der User zieht die lizenz.key per Drag & Drop in die App.

Die App prüft offline mathematisch: "Wurde diese Signatur mit Simons Private Key erstellt?"

Ergebnis: Ja -> App wird freigeschaltet. Nein -> Fehler.

Vorteil:

Die App muss niemals "nach Hause telefonieren", um die Lizenz zu prüfen.

Selbst wenn deine Server in 10 Jahren offline gehen, funktioniert die gekaufte Software weiter. Das ist wahres "Lifetime".

4. Zusammenfassung der User Journey (Story)
Stell dir vor, wie du das verkaufst:

"Andere Tools zwingen dich in die Cloud. Wir geben dir das Schwert in die Hand.

Lade es herunter.

Kappe das Internet. (Ja, wirklich!)

Installiere deine Lizenz. (Funktioniert offline).

Nutze KI. (Verbinde deine lokale Llama-Instanz).

Bearbeite sensible PDFs.

Alles bleibt auf deinem Rechner. Dein PC. Deine Regeln. Schweizer Code."

Technischer Rat zur Umsetzung (High-Speed)
Da du Claude Code nutzt, hier die Prompts/Begriffe für die Umsetzung:

Für die Lizenz: "Implementiere ein License-Verification Modul in Node.js mit crypto library. Nutze ed25519 für die Signatur-Prüfung. Lese Public Key aus einer Datei."

Für die KI: "Erstelle einen Service AiProvider, der abstrakt ist. Implementiere OllamaProvider (Fetch auf localhost:11434/api/generate) und OpenAiProvider. Biete Streaming-Responses für das Chat-Fenster."




## Marketing Vision:


Hier ist meine Analyse, warum das funktioniert und wie du es noch besser machst (damit sich die 1999.- CHF auch wirklich wertvoll anfühlen):

1. Warum 100 Stück besser sind als 1000 (Die Scarcity-Strategie)
Exklusivität: Wenn es 1000 Stück gibt, ist es ein Massenprodukt. Wenn es nur 100 gibt, ist es ein Club.

Deine Zeit: 1000 Briefe von Hand zu schreiben, zu unterschreiben und zur Post zu bringen, ist keine "Freude" mehr, das ist Fließbandarbeit. Du willst, dass jeder Brief "Liebe" ausstrahlt. Bei 100 Stück kannst du dir für jeden Käufer 10 Minuten Zeit nehmen.

Psychologie: "Nur noch 12 verfügbar" treibt den Verkauf stärker an als "Nur noch 840 verfügbar".

2. Der "Anker-Effekt" (Warum das den Verkauf der günstigen Versionen ankurbelt)
Selbst wenn niemand die 1999.- Version kauft, ist sie extrem wertvoll für dich.

Das Szenario: Ein User sieht drei Preise:

Standard: 29.- / Jahr (Wirkt okay)

Lifetime: 149.- (Wirkt teuer)

Collector's Edition: 1999.- (Wirkt wahnsinnig)

Der Effekt: Plötzlich wirken die 149.- für die Lifetime-Lizenz günstig. "Ich spare 1850 Franken im Vergleich zur VIP-Version!". Das nennt man Price Anchoring. Du verkaufst dadurch mehr von der mittleren Version.

3. Das "Unboxing"-Erlebnis: Bitte nicht laminieren!
Hier muss ich ehrlich sein: Für 2000 Franken darfst du kein einlaminiertes Papier verschicken. Das wirkt wie ein Schülerausweis. Wenn jemand so viel Geld hinlegt, erwartet er Luxus.

Mein Gegenvorschlag für die "Founder's Edition":

Das Material: Drucke den Lizenzschlüssel auf dickes Büttenpapier oder eine Metallkarte (lasergraviert, kostet dich ca. 20-30 CHF im Einkauf, wirkt aber wie 500 CHF).

Die Verpackung: Ein schöner schwarzer Umschlag, versiegelt mit echtem Wachssiegel (rot, mit Schweizer Kreuz oder deinem Logo).

Die Handschrift: Dein persönlicher Brief dazu ist perfekt. Schreib ihn mit Füller, nicht mit Kugelschreiber.

Das Extra: Leg etwas Physisches bei. Ein kleines Victorinox Taschenmesser mit deinem Logo? Oder einen hochwertigen USB-Stick (Edelstahl), auf dem die Software bereits vorinstalliert ist ("Air-Gap Ready").

4. Was der Käufer wirklich kauft (Der "Whale"-Status)
Wer 2000 Franken für Software zahlt, kauft nicht die Software. Er kauft Status und Einfluss. Gib ihnen mehr als nur Updates:

"The Council": Die 100 Collector-Besitzer kommen in eine exklusive Mailing-Liste oder Discord-Gruppe, wo du sie persönlich nach ihrer Meinung zu neuen Features fragst. "Soll ich erst PDF oder erst KI bauen?" -> Ihre Stimme zählt doppelt.

Credits: Ihr Name steht (wenn sie wollen) im "Über uns"-Dialog der Software unter "Gründungspaten".

Fazit & Empfehlung
Ja, mach es!

Name: "Founder's Edition" oder "Patron Edition".

Limitierung: Streng limitiert auf 100 Exemplare. (Nummeriert: 1/100, 2/100...).

Preis: 1999.- CHF ist mutig, aber als "Statement" genau richtig.

Inhalt:

Lifetime Updates (Alle Versionen, für immer).

Metall-Lizenzkarte (Lasergraviert).

Handsignierter Brief auf Premium-Papier.

USB-Stick mit der "Offline-Installation".

Nennung in den Credits.

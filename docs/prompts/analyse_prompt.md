# Tiefenanalyse

Führe eine vollständige semantische Tiefenanalyse der angegebenen Datei(en) durch, inklusive aller Abhängigkeiten. Iteriere solange, bis kein weiterer Befund mehr auftritt.

## Was du prüfen sollst

### 1. Funktioniert es wirklich?

Nicht "kompiliert es" — funktioniert es **aus Sicht eines normalen Benutzers**?

- Klicke ich auf einen Button und es passiert nichts? Bug.
- Zeigt die Oberfläche falsche, leere oder veraltete Daten? Bug.
- Muss ich etwas zwei Mal machen damit es reagiert? Bug.
- Friert die App ein oder reagiert verzögert? Bug.
- Verschwindet eine Eingabe oder Einstellung nach dem Neustart? Bug.
- Kann ich eine Aktion nicht rückgängig machen obwohl es logisch wäre? Bug.

### 2. Ist es logisch und benutzbar?

Denke wie ein Mensch der die App zum ersten Mal öffnet.

- Ist die Bedienung so wie man es von Windows-Programmen kennt?
- Kann man ein Textfeld aufziehen (Rechteck ziehen) oder muss man an einen Punkt klicken?
- Gibt es Rückmeldung wenn etwas läuft, fertig ist oder fehlschlägt?
- Kann ich mit Escape abbrechen, mit Entf löschen, mit Strg+Z rückgängig machen?
- Sieht man ungespeicherte Änderungen (Sternchen, Warnung)?
- Ist die Oberfläche aufgeräumt oder überladen?

### 3. Geht etwas kaputt?

- Kann man Daten verlieren (Datei überschrieben, Annotation weg, Einstellung gelöscht)?
- Stürzt die App ab bei unerwarteten Eingaben (leere Datei, Sonderzeichen, sehr große Datei)?
- Gibt es Sicherheitslücken (kann ein Dateiname Befehle ausführen, kann man auf fremde Dateien zugreifen)?
- Wird Speicher verschwendet der nie freigegeben wird?

### 4. Passt Frontend und Backend zusammen?

- Schickt die Oberfläche die richtigen Daten ans Backend?
- Kommt die Antwort vom Backend korrekt an und wird richtig angezeigt?
- Was passiert wenn das Backend einen Fehler meldet — sieht der Benutzer eine verständliche Meldung?

## So gehst du vor

1. **Alle beteiligten Dateien vollständig lesen** — keine Auszüge, kein Überfliegen
2. **Jeden Ablauf durchdenken**: Was passiert wenn ich X klicke? Was wenn ich Y zweimal schnell klicke? Was wenn Y leer ist?
3. **Probleme nach Schwere sortieren**: Erst was kaputtgeht, dann was nervt, dann was schöner sein könnte
4. **Wiederholen** bis nichts Neues mehr auftaucht

## Ausgabe

Für jeden Befund:

- **Was geht schief** — in einem Satz, verständlich
- **Warum** — die technische Ursache (kurz)
- **Was sieht der Benutzer** — das konkrete Problem aus Benutzersicht
- **Lösung** — wie man es repariert (1-2 Sätze)

Sortierung:
1. **Kritisch** — Datenverlust, Absturz, Sicherheitslücke
2. **Wichtig** — Funktion kaputt oder unlogisch
3. **Kleinigkeit** — Schönheitsfehler, Verbesserungsvorschlag

# Speicher Analyse

**Dein System. Dein Durchblick. Deine Kontrolle.**

Speicher Analyse ist ein Desktop-Tool für Windows, das dir zeigt, was auf deinem PC wirklich passiert. Festplatte voll? Wir zeigen dir warum. Langsames System? Wir finden die Ursache. Wer telefoniert nach Hause? Wir decken es auf.

Kein Abo. Keine Cloud. Alles bleibt auf deinem Rechner.

---

## Was kann die App?

### Speicher & Dateien
- **Festplatten-Scan** mit Verzeichnisbaum, Treemap und interaktiven Diagrammen
- **Datei-Explorer** mit Tabs, Dual-Panel (wie Total Commander) und intelligenter Suche
- **Duplikat-Finder** erkennt doppelte Dateien und zeigt wie viel Platz sie verschwenden
- **Alte Dateien** aufspüren die seit Monaten unberührt herumliegen

### System-Optimierung
- **Bereinigung** von Temp-Dateien, Caches, Logs und anderem Ballast
- **Autostart-Manager** zeigt was heimlich mit Windows startet
- **Bloatware-Erkennung** findet vorinstallierte Software die nur Platz frisst

### Sicherheit & Datenschutz
- **Privacy Dashboard** zeigt welche Windows-Einstellungen deine Daten teilen
- **Netzwerk-Monitor** deckt auf, welche Programme ins Internet verbinden — und zu wem
- **Sicherheits-Check** prüft Firewall, Updates, Benutzerkonten und mehr

### System-Info
- **S.M.A.R.T.** überwacht die Gesundheit deiner Festplatten
- **System-Score** bewertet deinen PC auf einer Skala von 0 bis 100
- **Software-Audit** listet alle Programme und findet Rückstände

### Extras
- **Eingebettetes Terminal** (PowerShell, CMD, WSL)
- **Datei-Tags** mit Farbmarkierungen
- **System Tray** mit Schnellzugriff und globalem Hotkey
- **Dark & Light Theme**

---

## Installation

```bash
git clone https://github.com/haenel881988/speicher-analyse.git
cd speicher-analyse
cargo tauri dev    # Entwicklung (Hot-Reload)
cargo tauri build  # Release-Build (MSI/NSIS-Installer)
```

Voraussetzungen:
- [Rust](https://rustup.rs/) (inkl. Cargo)
- [WebView2](https://developer.microsoft.com/de-de/microsoft-edge/webview2/) (auf Windows 10/11 vorinstalliert)
- Windows 10/11

---

## Die Geschichte dahinter

> *Ein Eichhörnchen verlegt gerne seine Nüsse — genauso wie wir unsere Dateien.*
>
> Swiss Squirrel ist die Geschichte von Simon, einem Eichhörnchen, das mit Hilfe seines magischen Freundes (einer KI) durch den digitalen Wald navigiert. Auf der Suche nach seinen goldenen Nüssen begegnet er Plagegeistern wie `pagefile.sys`, neugierigen Riesen-Eichhörnchen die in sein Nest gucken, und faulen Nüssen die den Korb verstopfen.
>
> Jedes Release ist ein neues Kapitel dieser Reise.

**Aktuelle Version:** v7.2.1 — [Release Notes lesen](docs/releases/v7.2-der-wachturm.md)

---

## Release Notes

| Version | Kapitel | Highlights |
|---------|---------|------------|
| **v7.2** | [Der Wachturm](docs/releases/v7.2-der-wachturm.md) | Netzwerk-Monitor, Privacy Dashboard, Sicherheits-Check |
| **v7.0** | [Die erste Nuss](docs/releases/v7.0-die-erste-nuss.md) | Explorer, Terminal, Duplikat-Finder, System-Score |

Alle technischen Details: [Änderungsprotokoll](docs/protokoll/aenderungsprotokoll.md)

---

## Tech Stack

- **Runtime:** Tauri v2 (Rust-Backend + System-WebView)
- **Backend:** Rust (Commands, PowerShell-Aufrufe, Scan-Engine)
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules) — kein React, kein Build-Step
- **Charts:** Chart.js v4
- **PDF:** html2pdf.js
- **System-Zugriff:** PowerShell via Rust (tokio::process)

---

## Lizenz

Dieses Projekt ist derzeit in aktiver Entwicklung. Lizenzmodell folgt.

---

*Gebaut in der Schweiz, mit einer KI an der Seite.*

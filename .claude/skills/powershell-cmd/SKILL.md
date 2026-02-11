---
name: powershell-cmd
description: Fügt einen neuen PowerShell-Befehl korrekt in die Speicher Analyse App ein. Verwendet runPS() mit korrektem Timeout, UTF-8-Encoding und Fehlerbehandlung. Nutze diesen Skill wenn ein neuer Windows-Systembefehl via PowerShell integriert werden soll. Aufruf mit /powershell-cmd [befehl-name] [modul-name].
---

# PowerShell-Befehl einbinden

Du bindest einen neuen PowerShell-Befehl in die Speicher Analyse App ein, unter Beachtung aller kritischen Lektionen.

## Argumente

- `$ARGUMENTS[0]` = Befehl-Name (camelCase, z.B. `getBatteryStatus`)
- `$ARGUMENTS[1]` = Ziel-Modul (z.B. `smart` → `main/smart.js`)

## Voranalyse

**Pflicht - lies diese Dateien zuerst:**

1. `main/cmd-utils.js` - Die `runPS()` Funktion verstehen (UTF-8 Prefix, Timeout)
2. Das Ziel-Modul `main/<modul>.js` - Bestehende Pattern als Referenz
3. `main/ipc-handlers.js` - Falls ein neuer IPC-Handler nötig ist

## KRITISCHE REGELN (aus Lessons Learned)

### 1. IMMER `runPS()` verwenden

```javascript
const { runPS } = require('./cmd-utils');

// RICHTIG:
const result = await runPS(`Get-PhysicalDisk | Select-Object ...`);

// FALSCH - NIEMALS so:
const { execFile } = require('child_process');
execFile('powershell.exe', ['-Command', script]); // Kein UTF-8, kein Timeout!
```

### 2. Timeout beachten

- **Minimum 30 Sekunden** - PowerShell Cold Start dauert 5-10+ Sekunden
- `runPS()` hat standardmäßig 30s Timeout
- Für schwere Befehle (Windows Update, DISM): Eigenes höheres Timeout übergeben

### 3. KEINE parallelen PowerShell-Prozesse

```javascript
// RICHTIG: Sequenziell
const result1 = await runPS(script1);
const result2 = await runPS(script2);

// FALSCH: Parallel (können sich gegenseitig aushungern!)
const [r1, r2] = await Promise.all([runPS(s1), runPS(s2)]);
```

### 4. Multi-Line Scripts korrekt übergeben

```javascript
// RICHTIG: Newlines beibehalten, nur trim()
const script = `
    $items = Get-ItemProperty HKLM:\\SOFTWARE\\...
    $items | ForEach-Object {
        [PSCustomObject]@{
            Name = $_.DisplayName
            Version = $_.DisplayVersion
        }
    } | ConvertTo-Json
`.trim();

// FALSCH: Newlines ersetzen (zerstört Statement-Grenzen!)
const script = multiLineScript.replace(/\n/g, ' ');
```

### 5. JSON-Output für strukturierte Daten

```javascript
// PowerShell-Script sollte JSON ausgeben:
const script = `
    $data = Get-Process | Select-Object Name, Id, WorkingSet64
    $data | ConvertTo-Json -Depth 3
`.trim();

const result = await runPS(script);
const parsed = JSON.parse(result);
```

### 6. Fehlerbehandlung

```javascript
async function getSystemInfo() {
    try {
        const result = await runPS(script);
        if (!result || result.trim() === '') {
            return { error: 'Keine Daten empfangen' };
        }
        return JSON.parse(result);
    } catch (err) {
        console.error('[SystemInfo] PowerShell-Fehler:', err.message);
        return { error: err.message };
    }
}
```

## Template für neuen Befehl

```javascript
// In main/<modul>.js

const { runPS } = require('./cmd-utils');

async function befehlName(param1, param2) {
    const script = `
        # PowerShell-Logik hier
        $result = <Befehl>
        $result | ConvertTo-Json -Depth 3
    `.trim();

    try {
        const raw = await runPS(script);
        if (!raw || raw.trim() === '') return [];

        const data = JSON.parse(raw);
        // Array sicherstellen (einzelnes Objekt → Array wrappen)
        return Array.isArray(data) ? data : [data];
    } catch (err) {
        console.error('[<Modul>] <befehlName> Fehler:', err.message);
        return { error: err.message };
    }
}

module.exports = { befehlName };
```

## Häufige Fallstricke

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Timeout nach 5s | PowerShell Cold Start | `runPS()` nutzen (30s Standard) |
| Kryptische Zeichen | Kein UTF-8 | `runPS()` hat UTF-8 Prefix eingebaut |
| Leere Ausgabe | Single Object statt Array | `ConvertTo-Json` + Array-Check |
| Parse-Fehler | PowerShell Warnings in stdout | `-ErrorAction SilentlyContinue` oder stderr filtern |
| Hängt endlos | Parallele PS-Prozesse | Sequenziell aufrufen |
| Script bricht ab | Newlines durch Spaces ersetzt | `.trim()` statt `.replace(/\n/g, ' ')` |

## Ausgabe

Nach dem Einbinden, gib eine Zusammenfassung:
- Funktion: Name und Signatur
- PowerShell-Befehl: Was ausgeführt wird
- Rückgabetyp: Array/Object/String
- Timeout: Standard (30s) oder angepasst
- IPC-Handler nötig? Falls ja, verweise auf `/add-ipc`

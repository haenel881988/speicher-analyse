---
name: add-ipc
description: Fügt einen neuen IPC-Handler hinzu mit passenden Einträgen in ipc-handlers.js, preload.js und optionalem Frontend-Aufruf. Stellt konsistente Benennung, Fehlerbehandlung und Daten-Serialisierung sicher. Nutze diesen Skill wenn eine neue Backend-Funktion vom Frontend aus aufgerufen werden soll. Aufruf mit /add-ipc [handler-name] [modul-name].
---

# IPC-Handler hinzufügen

Du fügst einen neuen IPC-Handler zum Electron-Projekt hinzu.

## Argumente

- `$ARGUMENTS[0]` = Handler-Name im IPC-Kanal-Format (kebab-case, z.B. `get-disk-health`)
- `$ARGUMENTS[1]` = Backend-Modul das die Logik enthält (z.B. `smart` → `main/smart.js`)

## Voranalyse

1. Lies `main/ipc-handlers.js` um das aktuelle Pattern und die Modul-Gruppierung zu verstehen
2. Lies `main/preload.js` um die API-Surface-Konventionen zu sehen
3. Prüfe ob ein ähnlicher Handler bereits existiert: `grep -n "<handler-name>" main/ipc-handlers.js`
4. Prüfe ob das Backend-Modul bereits importiert wird: `grep -n "<modul>" main/ipc-handlers.js`

## 3 Dateien ändern

### 1. `main/ipc-handlers.js` - Handler registrieren

Füge den Handler in die passende Sektion ein (gruppiert nach Modul):

```javascript
// In der registerAll() Funktion, gruppiert beim passenden Modul
ipcMain.handle('<handler-name>', async (event, ...args) => {
    try {
        const result = await moduleName.methodName(...args);
        return result;
    } catch (err) {
        console.error('[<handler-name>]', err.message);
        return { error: err.message };
    }
});
```

**Platzierungs-Regeln:**
- Suche den Kommentar-Block des Moduls (z.B. `// === Scanner ===`)
- Füge den neuen Handler dort ein
- Falls kein Block existiert, erstelle einen neuen mit `// === <ModulName> ===`

### 2. `main/preload.js` - API exponieren

Füge die Methode in das `contextBridge.exposeInMainWorld('api', { ... })` Objekt ein:

```javascript
// camelCase, passend zum Handler
handlerNameAction: (...args) => ipcRenderer.invoke('<handler-name>', ...args),
```

**Benennungs-Konvention:**
- IPC-Kanal: `kebab-case` (z.B. `get-disk-health`)
- API-Methode: `camelCase` (z.B. `getDiskHealth`)
- Umwandlung: Bindestriche entfernen, nächsten Buchstaben groß

### 3. Frontend-Aufruf (optional)

Falls gewünscht, zeige wie der Handler im Renderer aufgerufen wird:

```javascript
// In renderer/js/<modul>.js
const result = await window.api.handlerNameAction(arg1, arg2);
if (result?.error) {
    console.error('Fehler:', result.error);
    return;
}
// result verarbeiten...
```

### 4. Modul-Import in `main/ipc-handlers.js` (falls noch nicht vorhanden)

Prüfe ob das Modul bereits importiert wird. Falls nicht, füge den Import oben hinzu:

```javascript
const moduleName = require('./<modul>');
```

Falls das Modul ein `register(win)` Pattern hat, muss es auch in der `registerAll()` Funktion initialisiert werden:

```javascript
moduleName.register(mainWindow);
```

## Konventionen

- **Async/Await:** Alle Handler sind async
- **Error-Handling:** Immer try/catch mit `{ error: msg }` Rückgabe
- **Logging:** `console.error('[<handler-name>]', err.message)` bei Fehlern
- **Keine Sync-Operationen:** Kein `execSync`, `readFileSync` etc. in Handlern
- **Serialisierbare Daten:** IPC kann nur JSON-serialisierbare Daten übertragen (keine Maps, Sets, Functions)
  - Maps → `Array.from(map.entries())` oder `Object.fromEntries(map)`
  - Sets → `Array.from(set)`
  - Buffer → `buffer.buffer.slice(byteOffset, byteOffset + byteLength)`
  - Date → `.toISOString()` oder `.getTime()`
- **PowerShell:** Falls der Handler PS aufruft → immer `runPS()` aus cmd-utils.js verwenden

## Häufige Fehler vermeiden

- Vergessen den Handler zu `require()` → IPC-Kanal existiert, aber Funktion undefiniert
- camelCase/kebab-case Mismatch zwischen Preload und IPC-Kanal
- `event` Parameter vergessen in der Handler-Signatur (`async (event, ...args)`)
- Maps/Sets direkt zurückgeben → Frontend bekommt leeres Objekt

## Ausgabe

Nach dem Hinzufügen, gib eine Zusammenfassung:
- IPC-Kanal: `<handler-name>`
- API-Methode: `window.api.<methodName>()`
- Backend-Modul: `main/<modul>.js`
- Signatur: Parameter und Rückgabetyp
- Import: Bereits vorhanden / Neu hinzugefügt

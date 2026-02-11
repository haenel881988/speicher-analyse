---
name: add-ipc
description: Fügt einen neuen IPC-Handler hinzu mit passenden Einträgen in ipc-handlers.js, preload.js und optionalem Frontend-Aufruf. Stellt konsistente Benennung und Fehlerbehandlung sicher.
disable-model-invocation: true
user-invocable: true
allowed-tools: Read, Edit, Grep, Glob
argument-hint: [handler-name] [modul-name]
---

# IPC-Handler hinzufügen

Du fügst einen neuen IPC-Handler zum Electron-Projekt hinzu, konsistent mit den 112 bestehenden Handlern.

## Argumente

- `$ARGUMENTS[0]` = Handler-Name im IPC-Kanal-Format (kebab-case, z.B. `get-disk-health`)
- `$ARGUMENTS[1]` = Backend-Modul das die Logik enthält (z.B. `smart` → `main/smart.js`)

## Voranalyse

1. Lies `main/ipc-handlers.js` um das aktuelle Pattern zu verstehen
2. Lies `main/preload.js` um die API-Surface-Konventionen zu sehen
3. Prüfe ob ein ähnlicher Handler bereits existiert (Duplikat vermeiden)

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

## Konventionen

- **Async/Await:** Alle Handler sind async
- **Error-Handling:** Immer try/catch mit `{ error: msg }` Rückgabe
- **Logging:** `console.error('[<handler-name>]', err.message)` bei Fehlern
- **Keine Sync-Operationen:** Kein `execSync`, `readFileSync` etc. in Handlern
- **Serialisierbare Daten:** IPC kann nur JSON-serialisierbare Daten übertragen (keine Maps, Sets, Functions)
  - Maps → `Array.from(map.entries())`
  - Sets → `Array.from(set)`
  - Buffer → `buffer.buffer.slice(byteOffset, byteOffset + byteLength)`

## Ausgabe

Nach dem Hinzufügen, gib eine Zusammenfassung:
- IPC-Kanal: `<handler-name>`
- API-Methode: `window.api.<methodName>()`
- Backend-Modul: `main/<modul>.js`
- Signatur: Parameter und Rückgabetyp

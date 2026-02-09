'use strict';

const { execFile } = require('child_process');
const path = require('path');
const { app } = require('electron');

/**
 * Register "Open with Speicher Analyse" in Windows Explorer context menu.
 * Creates a registry entry under HKCU\Software\Classes\Directory\shell.
 * Requires NO admin rights (HKCU only).
 */
function registerContextMenu() {
    return new Promise((resolve, reject) => {
        const exePath = process.execPath;
        const appDir = path.dirname(exePath);
        // In dev: electron.exe with app path; in production: the packaged exe
        const cmdLine = app.isPackaged
            ? `"${exePath}" "%V"`
            : `"${exePath}" "${path.join(appDir, '..', '..')}" --open-folder="%V"`;

        const regScript = `
            $keyPath = 'HKCU:\\Software\\Classes\\Directory\\shell\\SpeicherAnalyse'
            $cmdPath = "$keyPath\\command"
            New-Item -Path $keyPath -Force | Out-Null
            Set-ItemProperty -Path $keyPath -Name '(Default)' -Value 'Mit Speicher Analyse \u00F6ffnen'
            Set-ItemProperty -Path $keyPath -Name 'Icon' -Value '"${exePath.replace(/\\/g, '\\\\')}"'
            New-Item -Path $cmdPath -Force | Out-Null
            Set-ItemProperty -Path $cmdPath -Name '(Default)' -Value '${cmdLine.replace(/'/g, "''")}'
            Write-Output 'OK'
        `;

        execFile('powershell.exe', ['-NoProfile', '-Command', regScript], { timeout: 10000 }, (err, stdout) => {
            if (err) return reject(new Error(`Registry-Eintrag fehlgeschlagen: ${err.message}`));
            resolve({ success: true, message: 'Kontextmen\u00FC-Eintrag erstellt' });
        });
    });
}

/**
 * Remove the context menu entry
 */
function unregisterContextMenu() {
    return new Promise((resolve, reject) => {
        const regScript = `
            $keyPath = 'HKCU:\\Software\\Classes\\Directory\\shell\\SpeicherAnalyse'
            if (Test-Path $keyPath) {
                Remove-Item -Path $keyPath -Recurse -Force
                Write-Output 'Removed'
            } else {
                Write-Output 'NotFound'
            }
        `;

        execFile('powershell.exe', ['-NoProfile', '-Command', regScript], { timeout: 10000 }, (err, stdout) => {
            if (err) return reject(new Error(`Entfernen fehlgeschlagen: ${err.message}`));
            resolve({ success: true });
        });
    });
}

/**
 * Check if context menu entry exists
 */
function isContextMenuRegistered() {
    return new Promise((resolve) => {
        const regScript = `
            $keyPath = 'HKCU:\\Software\\Classes\\Directory\\shell\\SpeicherAnalyse'
            if (Test-Path $keyPath) { Write-Output 'true' } else { Write-Output 'false' }
        `;

        execFile('powershell.exe', ['-NoProfile', '-Command', regScript], { timeout: 5000 }, (err, stdout) => {
            if (err) return resolve(false);
            resolve(stdout.trim() === 'true');
        });
    });
}

module.exports = { registerContextMenu, unregisterContextMenu, isContextMenuRegistered };

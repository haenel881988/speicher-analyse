'use strict';

const path = require('path');
const { app } = require('electron');
const { runPS } = require('./cmd-utils');

/**
 * Register "Open with Speicher Analyse" in Windows Explorer context menu.
 * Creates a registry entry under HKCU\Software\Classes\Directory\shell.
 * Requires NO admin rights (HKCU only).
 */
async function registerContextMenu() {
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
    `.trim();

    try {
        const { stdout } = await runPS(regScript, { timeout: 30000 });
        if (stdout.trim().includes('OK')) {
            return { success: true, message: 'Kontextmen\u00FC-Eintrag erstellt' };
        }
        throw new Error('Unerwartete PowerShell-Antwort');
    } catch (err) {
        throw new Error(`Registry-Eintrag fehlgeschlagen: ${err.message}`);
    }
}

/**
 * Remove the context menu entry
 */
async function unregisterContextMenu() {
    const regScript = `
        $keyPath = 'HKCU:\\Software\\Classes\\Directory\\shell\\SpeicherAnalyse'
        if (Test-Path $keyPath) {
            Remove-Item -Path $keyPath -Recurse -Force
            Write-Output 'Removed'
        } else {
            Write-Output 'NotFound'
        }
    `.trim();

    try {
        await runPS(regScript, { timeout: 30000 });
        return { success: true };
    } catch (err) {
        throw new Error(`Entfernen fehlgeschlagen: ${err.message}`);
    }
}

/**
 * Check if context menu entry exists
 */
async function isContextMenuRegistered() {
    const regScript = `
        $keyPath = 'HKCU:\\Software\\Classes\\Directory\\shell\\SpeicherAnalyse'
        if (Test-Path $keyPath) { Write-Output 'true' } else { Write-Output 'false' }
    `.trim();

    try {
        const { stdout } = await runPS(regScript, { timeout: 30000 });
        return stdout.trim() === 'true';
    } catch {
        return false;
    }
}

module.exports = { registerContextMenu, unregisterContextMenu, isContextMenuRegistered };

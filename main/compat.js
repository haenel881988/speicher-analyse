'use strict';

const { execFileAsync, runPS } = require('./cmd-utils');

let cachedCapabilities = null;

/**
 * Check system capabilities for feature availability.
 * Results are cached after first call.
 */
async function checkCapabilities() {
    if (cachedCapabilities) return cachedCapabilities;

    const [winget, build, admin] = await Promise.all([
        checkWinget(),
        getWindowsBuild(),
        checkAdmin(),
    ]);

    cachedCapabilities = {
        wingetAvailable: winget,
        windowsBuild: build,
        isAdmin: admin,
    };

    return cachedCapabilities;
}

async function checkWinget() {
    try {
        await execFileAsync('where.exe', ['winget'], { timeout: 5000, windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

async function getWindowsBuild() {
    try {
        const { stdout } = await runPS('[Environment]::OSVersion.Version.Build', { timeout: 5000 });
        return parseInt(stdout.trim(), 10) || 0;
    } catch {
        return 0;
    }
}

async function checkAdmin() {
    try {
        await execFileAsync('net', ['session'], { timeout: 5000, windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

module.exports = { checkCapabilities };

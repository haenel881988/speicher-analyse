'use strict';

const { execFile, exec } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const PS_UTF8 = '[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; ';

const DEFAULT_OPTS = { encoding: 'utf8', windowsHide: true };

/**
 * Run a native Windows command with UTF-8 codepage (chcp 65001).
 * WARNING: Uses shell - only use when execFileAsync is not possible.
 * Prefer runSafe() for commands where arguments come from user input.
 */
function runCmd(command, options = {}) {
    return execAsync(`chcp 65001 >nul && ${command}`, {
        ...DEFAULT_OPTS, ...options,
    });
}

/**
 * Run a command safely using execFile (no shell interpolation).
 * Arguments are passed as array - immune to command injection.
 * Adds chcp 65001 via shell wrapper only for the codepage, but args are safe.
 */
function runSafe(exe, args = [], options = {}) {
    return execFileAsync(exe, args, {
        ...DEFAULT_OPTS, ...options,
    });
}

/**
 * Run a PowerShell command with UTF-8 output encoding.
 */
function runPS(command, options = {}) {
    return execFileAsync('powershell', [
        '-NoProfile', '-Command',
        PS_UTF8 + command,
    ], {
        ...DEFAULT_OPTS, timeout: 30000, maxBuffer: 5 * 1024 * 1024,
        ...options,
    });
}

/**
 * Validate a string is safe for use in shell commands.
 * Rejects strings containing shell metacharacters.
 */
function isSafeShellArg(str) {
    if (typeof str !== 'string') return false;
    // Reject common shell injection chars
    return !/[;&|`$(){}[\]<>!\n\r]/.test(str);
}

/**
 * Sanitize a value for use in a shell command (escaping double quotes).
 * Use only when runSafe() is not feasible.
 */
function escapeShellArg(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/"/g, '\\"');
}

module.exports = {
    runCmd,
    runSafe,
    runPS,
    PS_UTF8,
    isSafeShellArg,
    escapeShellArg,
    execFileAsync,
    execAsync,
    DEFAULT_OPTS,
};

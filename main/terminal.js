'use strict';

const { spawn, execFile } = require('child_process');

/**
 * Terminal manager - spawns shell processes for embedded terminal.
 * Supports PowerShell, CMD, and WSL (if installed).
 * Uses child_process.spawn (no node-pty dependency).
 */

const sessions = new Map(); // sessionId → { process, cwd, shellType }
let nextId = 1;

const SHELL_CONFIGS = {
    powershell: {
        cmd: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
        prompt: 'PS>',
        cdCommand: (dir) => `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`,
    },
    cmd: {
        cmd: 'cmd.exe',
        args: ['/Q', '/K'],
        prompt: '>',
        cdCommand: (dir) => `cd /d "${dir}"`,
    },
    wsl: {
        cmd: 'wsl.exe',
        args: ['-e', 'bash', '--login'],
        prompt: '$',
        cdCommand: (dir) => {
            // Convert Windows path to WSL path: C:\Users → /mnt/c/Users
            const wslPath = dir.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
            return `cd "${wslPath}"`;
        },
    },
};

function createSession(cwd, shellType = 'powershell') {
    const config = SHELL_CONFIGS[shellType];
    if (!config) {
        throw new Error(`Unbekannter Shell-Typ: ${shellType}`);
    }

    const id = `term-${nextId++}`;
    const ps = spawn(config.cmd, config.args, {
        cwd: shellType === 'wsl' ? undefined : cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, TERM: 'dumb' },
    });

    sessions.set(id, { process: ps, cwd, shellType });

    // For WSL, navigate to the Windows cwd after launch
    if (shellType === 'wsl' && cwd) {
        const cdCmd = config.cdCommand(cwd);
        ps.stdin.write(cdCmd + '\n');
    }

    return { id, process: ps };
}

function writeToSession(id, data) {
    const session = sessions.get(id);
    if (!session || !session.process.stdin.writable) return false;
    session.process.stdin.write(data);
    return true;
}

function destroySession(id) {
    const session = sessions.get(id);
    if (!session) return;
    try {
        session.process.stdin.end();
        session.process.kill();
    } catch { /* ignore */ }
    sessions.delete(id);
}

function destroyAllSessions() {
    for (const [id] of sessions) {
        destroySession(id);
    }
}

function getSession(id) {
    return sessions.get(id) || null;
}

/**
 * Detect available shells on the system.
 * PowerShell and CMD are always available on Windows.
 * WSL is checked by running `wsl --list --quiet`.
 */
async function getAvailableShells() {
    const shells = [
        { id: 'powershell', label: 'PowerShell', available: true },
        { id: 'cmd', label: 'CMD', available: true },
    ];

    // Check WSL availability
    try {
        await new Promise((resolve, reject) => {
            execFile('wsl.exe', ['--list', '--quiet'], { timeout: 3000 }, (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout.trim());
            });
        });
        shells.push({ id: 'wsl', label: 'WSL (Ubuntu/Bash)', available: true });
    } catch {
        shells.push({ id: 'wsl', label: 'WSL (nicht installiert)', available: false });
    }

    return shells;
}

/**
 * Get the cd command for a specific shell type.
 */
function getCdCommand(shellType, dir) {
    const config = SHELL_CONFIGS[shellType];
    return config ? config.cdCommand(dir) : null;
}

/**
 * Get the prompt string for a specific shell type.
 */
function getPrompt(shellType) {
    const config = SHELL_CONFIGS[shellType];
    return config ? config.prompt : '>';
}

module.exports = {
    createSession, writeToSession, destroySession, destroyAllSessions,
    getSession, getAvailableShells, getCdCommand, getPrompt, SHELL_CONFIGS,
};

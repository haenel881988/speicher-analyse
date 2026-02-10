'use strict';

const pty = require('node-pty');
const { execFile } = require('child_process');

/**
 * Terminal manager - spawns PTY shell processes for embedded terminal.
 * Supports PowerShell, CMD, and WSL (if installed).
 * Uses node-pty (ConPTY on Windows 10+) for full TTY support.
 */

const sessions = new Map(); // sessionId → { pty, cwd, shellType }
let nextId = 1;

const SHELL_CONFIGS = {
    powershell: {
        cmd: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile'],
        cdCommand: (dir) => `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`,
    },
    cmd: {
        cmd: 'cmd.exe',
        args: [],
        cdCommand: (dir) => `cd /d "${dir}"`,
    },
    wsl: {
        cmd: 'wsl.exe',
        args: ['-e', 'bash', '--login'],
        cdCommand: (dir) => {
            const wslPath = dir.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
            return `cd "${wslPath}"`;
        },
    },
};

function createSession(cwd, shellType = 'powershell', cols = 80, rows = 24) {
    const config = SHELL_CONFIGS[shellType];
    if (!config) {
        throw new Error(`Unbekannter Shell-Typ: ${shellType}`);
    }

    const id = `term-${nextId++}`;
    const ptyProcess = pty.spawn(config.cmd, config.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: shellType === 'wsl' ? undefined : cwd,
        env: { ...process.env },
    });

    sessions.set(id, { pty: ptyProcess, cwd, shellType });

    // WSL: navigate to Windows cwd after launch
    if (shellType === 'wsl' && cwd) {
        ptyProcess.write(config.cdCommand(cwd) + '\r');
    }

    return { id, pty: ptyProcess };
}

function writeToSession(id, data) {
    const session = sessions.get(id);
    if (!session) return false;
    session.pty.write(data);
    return true;
}

function resizeSession(id, cols, rows) {
    const session = sessions.get(id);
    if (!session) return;
    try {
        session.pty.resize(cols, rows);
    } catch { /* ignore resize errors */ }
}

function destroySession(id) {
    const session = sessions.get(id);
    if (!session) return;
    try {
        session.pty.kill();
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
 */
async function getAvailableShells() {
    const shells = [
        { id: 'powershell', label: 'PowerShell', available: true },
        { id: 'cmd', label: 'CMD', available: true },
    ];

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

module.exports = {
    createSession, writeToSession, resizeSession, destroySession, destroyAllSessions,
    getSession, getAvailableShells, SHELL_CONFIGS,
};

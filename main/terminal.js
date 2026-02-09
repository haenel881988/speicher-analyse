'use strict';

const { spawn } = require('child_process');

/**
 * Terminal manager - spawns PowerShell processes for embedded terminal.
 * Uses child_process.spawn (no node-pty dependency).
 * Each terminal session gets its own PowerShell process.
 */

const sessions = new Map(); // sessionId → { process, cwd }
let nextId = 1;

function createSession(cwd) {
    const id = `term-${nextId++}`;
    const ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, TERM: 'dumb' },
    });

    sessions.set(id, { process: ps, cwd });

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

module.exports = { createSession, writeToSession, destroySession, destroyAllSessions, getSession };

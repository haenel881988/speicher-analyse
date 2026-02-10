#!/usr/bin/env node
'use strict';

/**
 * Patches node-pty's binding.gyp to remove Spectre mitigation requirement,
 * then runs electron-rebuild for node-pty.
 *
 * Required because node-pty 1.2.x demands Spectre-mitigated MSVC libraries
 * which are not always installed with Visual Studio Build Tools.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bindingGyp = path.join(__dirname, '..', 'node_modules', 'node-pty', 'binding.gyp');

if (!fs.existsSync(bindingGyp)) {
    console.log('[rebuild-pty] node-pty nicht gefunden, überspringe.');
    process.exit(0);
}

// Patch: Remove SpectreMitigation requirement
let content = fs.readFileSync(bindingGyp, 'utf8');
if (content.includes("'SpectreMitigation': 'Spectre'")) {
    content = content.replace("'SpectreMitigation': 'Spectre'", '');
    fs.writeFileSync(bindingGyp, content, 'utf8');
    console.log('[rebuild-pty] Spectre-Mitigation aus binding.gyp entfernt.');
}

// Run electron-rebuild
console.log('[rebuild-pty] Starte electron-rebuild für node-pty...');
try {
    execSync('npx @electron/rebuild -f -w node-pty', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
    });
    console.log('[rebuild-pty] Erfolgreich kompiliert.');
} catch (err) {
    console.error('[rebuild-pty] Kompilierung fehlgeschlagen:', err.message);
    process.exit(1);
}

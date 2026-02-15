#!/usr/bin/env node
'use strict';
/**
 * Build-Script: Lädt die IEEE OUI-Datenbank herunter und konvertiert sie zu JSON.
 * Quelle: https://standards-oui.ieee.org/oui/oui.txt
 * Ziel: data/oui.json
 *
 * Nutzung: node tools/build-oui-database.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUI_URL = 'https://standards-oui.ieee.org/oui/oui.txt';
const OUT_PATH = path.join(__dirname, '..', 'data', 'oui.json');

function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { timeout: 60000 }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function main() {
    console.log(`Downloading IEEE OUI database from ${OUI_URL}...`);
    const raw = await download(OUI_URL);
    console.log(`Downloaded ${(raw.length / 1024 / 1024).toFixed(1)} MB`);

    // Parse: Zeilen im Format "AA-BB-CC   (hex)\t\tVendor Name"
    const ouiMap = {};
    let count = 0;

    for (const rawLine of raw.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        const match = line.match(/^([0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2})\s+\(hex\)\s+(.+)/);
        if (match) {
            const prefix = match[1].replace(/-/g, ':').toUpperCase();
            const vendor = match[2].trim();
            if (vendor) {
                ouiMap[prefix] = vendor;
                count++;
            }
        }
    }

    console.log(`Parsed ${count} OUI entries`);

    // JSON schreiben (kompakt, ohne Whitespace)
    const json = JSON.stringify(ouiMap);
    fs.writeFileSync(OUT_PATH, json, 'utf-8');
    const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
    console.log(`Written to ${OUT_PATH} (${sizeMB} MB)`);
}

main().catch(err => {
    console.error('Fehler:', err.message);
    process.exit(1);
});

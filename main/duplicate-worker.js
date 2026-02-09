const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const crypto = require('crypto');

const { files, options = {} } = workerData;
const minFileSize = options.minSize || 1024;
const maxFileSize = options.maxSize || 2147483648;

// Phase 1: Group by size
const sizeGroups = new Map();
for (const f of files) {
    if (f.size === 0 || f.size < minFileSize || f.size > maxFileSize) continue;
    const key = f.size;
    if (!sizeGroups.has(key)) sizeGroups.set(key, []);
    sizeGroups.get(key).push(f);
}

// Filter to only groups with 2+ files
const candidates = [];
for (const [size, group] of sizeGroups) {
    if (group.length >= 2) {
        candidates.push({ size, files: group });
    }
}

const totalToHash = candidates.reduce((sum, g) => sum + g.files.length, 0);
let filesHashed = 0;
let lastProgressTime = 0;
const startTime = Date.now();

function sendProgress(phase, currentFile) {
    const now = Date.now();
    if (now - lastProgressTime >= 300) {
        lastProgressTime = now;
        const elapsed = (now - startTime) / 1000;
        const pct = totalToHash > 0 ? filesHashed / totalToHash : 0;
        const eta = pct > 0.05 ? Math.round(elapsed / pct - elapsed) : 0;
        parentPort.postMessage({
            type: 'progress',
            phase,
            filesHashed,
            totalToHash,
            currentFile,
            eta,
        });
    }
}

function hashFile(filePath, partialOnly = false) {
    try {
        const hash = crypto.createHash('sha256');
        const fd = fs.openSync(filePath, 'r');
        const bufSize = partialOnly ? 65536 : 131072; // 64KB for partial, 128KB chunks for full
        const buf = Buffer.alloc(bufSize);
        let bytesRead;

        if (partialOnly) {
            bytesRead = fs.readSync(fd, buf, 0, bufSize, 0);
            if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead));
        } else {
            while ((bytesRead = fs.readSync(fd, buf, 0, bufSize, null)) > 0) {
                hash.update(buf.subarray(0, bytesRead));
            }
        }

        fs.closeSync(fd);
        return hash.digest('hex');
    } catch {
        return null;
    }
}

// Phase 2: Partial hash (first 64KB)
const partialGroups = new Map();
for (const candidate of candidates) {
    const hashMap = new Map();
    for (const f of candidate.files) {
        const h = hashFile(f.path, true);
        filesHashed++;
        sendProgress('partial-hash', f.name);
        if (h === null) continue;
        const key = `${candidate.size}:${h}`;
        if (!hashMap.has(key)) hashMap.set(key, []);
        hashMap.get(key).push(f);
    }

    for (const [key, group] of hashMap) {
        if (group.length >= 2) {
            partialGroups.set(key, { size: candidate.size, files: group });
        }
    }
}

// Phase 3: Full hash only where partial hashes match
filesHashed = 0;
const totalFullHash = [...partialGroups.values()].reduce((sum, g) => sum + g.files.length, 0);
const finalGroups = [];

for (const [, candidate] of partialGroups) {
    const hashMap = new Map();
    for (const f of candidate.files) {
        const h = hashFile(f.path, false);
        filesHashed++;
        sendProgress('full-hash', f.name);
        if (h === null) continue;
        if (!hashMap.has(h)) hashMap.set(h, []);
        hashMap.get(h).push(f);
    }

    for (const [hash, group] of hashMap) {
        if (group.length >= 2) {
            finalGroups.push({
                hash,
                size: candidate.size,
                files: group.map(f => ({
                    path: f.path,
                    name: f.name,
                    ext: f.ext,
                    mtime: f.mtime,
                })),
            });
        }
    }
}

// Sort groups by total wasted space (descending)
finalGroups.sort((a, b) => (b.size * (b.files.length - 1)) - (a.size * (a.files.length - 1)));

parentPort.postMessage({
    type: 'complete',
    groups: finalGroups,
});

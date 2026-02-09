const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const crypto = require('crypto');

const { files } = workerData;

// Files are already pre-filtered by size+ext on main thread (system paths excluded)
// Re-group by size for hashing phases
const sizeGroups = new Map();
for (const f of files) {
    if (!sizeGroups.has(f.size)) sizeGroups.set(f.size, []);
    sizeGroups.get(f.size).push(f);
}

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
    if (now - lastProgressTime >= 250) {
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

// Reusable buffers (avoid re-allocation per file)
const PARTIAL_SIZE = 8192;   // 8KB partial hash (was 64KB - sufficient for differentiation)
const FULL_BUF_SIZE = 262144; // 256KB chunks for full hash (was 128KB - faster I/O)
const partialBuf = Buffer.alloc(PARTIAL_SIZE);
const fullBuf = Buffer.alloc(FULL_BUF_SIZE);

function hashFile(filePath, partialOnly) {
    try {
        const hash = crypto.createHash('sha256');
        const fd = fs.openSync(filePath, 'r');

        if (partialOnly) {
            const bytesRead = fs.readSync(fd, partialBuf, 0, PARTIAL_SIZE, 0);
            if (bytesRead > 0) hash.update(partialBuf.subarray(0, bytesRead));
        } else {
            let bytesRead;
            while ((bytesRead = fs.readSync(fd, fullBuf, 0, FULL_BUF_SIZE, null)) > 0) {
                hash.update(fullBuf.subarray(0, bytesRead));
            }
        }

        fs.closeSync(fd);
        return hash.digest('hex');
    } catch {
        return null;
    }
}

// Phase 1: Partial hash (first 8KB) - fast pre-filter
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

// Phase 2: Full hash only where partial hashes match
filesHashed = 0;
const finalGroups = [];

for (const [, candidate] of partialGroups) {
    // For small files (<= partial size), partial hash IS the full hash
    if (candidate.size <= PARTIAL_SIZE) {
        finalGroups.push({
            hash: 'small-file',
            size: candidate.size,
            files: candidate.files.map(f => ({
                path: f.path, name: f.name, ext: f.ext, mtime: f.mtime,
            })),
        });
        filesHashed += candidate.files.length;
        continue;
    }

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
                    path: f.path, name: f.name, ext: f.ext, mtime: f.mtime,
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

'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { rootPath, query, useRegex, maxResults = 500 } = workerData;

let resultCount = 0;
let dirsScanned = 0;

// Skip known noisy/system directories for speed
const SKIP_DIRS = new Set([
    '$recycle.bin', 'system volume information', '$windows.~bt',
    '$windows.~ws', 'recovery', 'config.msi',
    'node_modules', '.git', '.svn', '.hg', '__pycache__',
    '.venv', 'venv', '.vs', '.idea', '.gradle', '.m2',
    '.cargo', 'target', 'bower_components', '.tox',
    'windows', 'boot',
]);

// Build matcher with progressive prefix fallback for typo tolerance
// "steuren" → tries "steuren", "steure", "steur", "steu" → matches "Steuererklärung"
let matcher;
if (useRegex) {
    try {
        const regex = new RegExp(query, 'i');
        matcher = (name) => regex.test(name) ? 1.0 : 0;
    } catch {
        const queryLower = query.toLowerCase();
        matcher = (name) => name.toLowerCase().includes(queryLower) ? 1.0 : 0;
    }
} else {
    const queryLower = query.toLowerCase();
    const minLen = Math.max(3, Math.ceil(queryLower.length * 0.4));
    // Pre-compute all prefix variants (longest first)
    const prefixes = [];
    for (let len = queryLower.length; len >= minLen; len--) {
        prefixes.push(queryLower.substring(0, len));
    }

    matcher = (name) => {
        const nameLower = name.toLowerCase();
        for (let i = 0; i < prefixes.length; i++) {
            if (nameLower.includes(prefixes[i])) {
                // Quality: 1.0 for full match, decreasing for shorter prefixes
                return prefixes[i].length / queryLower.length;
            }
        }
        return 0;
    };
}

function searchRecursive(dirPath, depth) {
    if (resultCount >= maxResults) return;
    if (depth > 20) return;

    let dir;
    try {
        dir = fs.opendirSync(dirPath);
    } catch {
        return;
    }

    try {
        let entry;
        while ((entry = dir.readSync()) !== null) {
            if (resultCount >= maxResults) break;

            try {
                const fullPath = path.join(dirPath, entry.name);
                const isDir = entry.isDirectory();

                const quality = matcher(entry.name);
                if (quality > 0) {
                    resultCount++;
                    parentPort.postMessage({
                        type: 'result',
                        data: {
                            name: entry.name,
                            path: fullPath,
                            dirPath,
                            size: 0,
                            isDir,
                            matchQuality: quality,
                        },
                    });
                }

                if (isDir && !entry.isSymbolicLink()) {
                    const nameLower = entry.name.toLowerCase();
                    if (SKIP_DIRS.has(nameLower)) continue;
                    if (nameLower.startsWith('$')) continue;

                    dirsScanned++;
                    if (dirsScanned % 50 === 0) {
                        parentPort.postMessage({
                            type: 'progress',
                            currentPath: fullPath,
                            dirsScanned,
                            resultCount,
                        });
                    }
                    searchRecursive(fullPath, depth + 1);
                }
            } catch { /* skip inaccessible entries */ }
        }
    } finally {
        dir.closeSync();
    }
}

try {
    searchRecursive(rootPath, 0);
    parentPort.postMessage({
        type: 'complete',
        dirsScanned,
        resultCount,
    });
} catch (err) {
    parentPort.postMessage({
        type: 'error',
        error: err.message,
    });
}

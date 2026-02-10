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

// ===== Relevance-based scoring =====
// Scoring priorities:
//   1.0  = exact name match (ignoring extension)
//   0.95 = name starts with full query
//   0.9  = full query at word boundary (_-. )
//   0.8  = full query contained anywhere
//   0.7x = prefix starts name (x = prefix/query ratio)
//   0.5x = prefix at word boundary
//   0.25x = prefix mid-word (only if prefix >= 80% of query)
//   0    = no match
const WORD_BOUNDARY = new Set(['_', '-', '.', ' ']);

function scoreMatch(nameLower, queryLower) {
    // Exact name match (ignoring extension)
    const dotIdx = nameLower.lastIndexOf('.');
    const base = dotIdx > 0 ? nameLower.substring(0, dotIdx) : nameLower;
    if (base === queryLower) return 1.0;

    // Full query: name starts with it
    if (nameLower.startsWith(queryLower)) return 0.95;

    // Full query: contained in name
    const fullIdx = nameLower.indexOf(queryLower);
    if (fullIdx > 0) {
        return WORD_BOUNDARY.has(nameLower[fullIdx - 1]) ? 0.9 : 0.8;
    }

    // Progressive prefix matching (min 60% of query, at least 3 chars)
    const minLen = Math.max(3, Math.ceil(queryLower.length * 0.6));
    for (let len = queryLower.length - 1; len >= minLen; len--) {
        const prefix = queryLower.substring(0, len);
        const idx = nameLower.indexOf(prefix);
        if (idx < 0) continue;

        const ratio = len / queryLower.length;

        // Starts with prefix
        if (idx === 0) return 0.7 * ratio;

        // At word boundary
        if (WORD_BOUNDARY.has(nameLower[idx - 1])) return 0.5 * ratio;

        // Mid-word: only if prefix is very close to full query
        if (ratio >= 0.8) return 0.25 * ratio;
    }

    return 0;
}

// Build matcher
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
    matcher = (name) => scoreMatch(name.toLowerCase(), queryLower);
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

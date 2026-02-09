const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { rootPath, scanId } = workerData;

// State
let dirsScanned = 0;
let filesFound = 0;
let totalSize = 0;
let errorsCount = 0;
let currentPath = '';

const tree = new Map();
const topFiles = []; // min-heap: [{size, path, name, ext, mtime}]
const extensionStats = new Map();
const dirFiles = new Map();

// Progress reporting interval
let lastProgressTime = 0;

function sendProgress() {
    const now = Date.now();
    if (now - lastProgressTime >= 200) {
        lastProgressTime = now;
        parentPort.postMessage({
            type: 'progress',
            currentPath,
            dirsScanned,
            filesFound,
            totalSize,
            errorsCount,
        });
    }
}

function scanRecursive(dirPath) {
    let total = 0;
    let ownSize = 0;
    let fileCount = 0;
    let dirCount = 0;
    const childrenPaths = [];
    const filesInDir = [];

    let dir;
    try {
        dir = fs.opendirSync(dirPath);
    } catch {
        errorsCount++;
        return 0;
    }

    try {
        let entry;
        while ((entry = dir.readSync()) !== null) {
            try {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isFile()) {
                    let stat;
                    try {
                        stat = fs.statSync(fullPath);
                    } catch {
                        errorsCount++;
                        continue;
                    }

                    const size = stat.size;
                    ownSize += size;
                    total += size;
                    fileCount++;
                    filesFound++;
                    totalSize += size;

                    const ext = path.extname(entry.name).toLowerCase();

                    // Extension stats
                    let extStat = extensionStats.get(ext);
                    if (!extStat) {
                        extStat = { count: 0, totalSize: 0 };
                        extensionStats.set(ext, extStat);
                    }
                    extStat.count++;
                    extStat.totalSize += size;

                    // Top 100 files (min-heap) - keep full path (only 100 items)
                    const fileInfoFull = { size, path: fullPath, name: entry.name, ext, mtime: stat.mtimeMs / 1000 };
                    if (topFiles.length < 100) {
                        heapPush(topFiles, fileInfoFull);
                    } else if (size > topFiles[0].size) {
                        heapReplace(topFiles, fileInfoFull);
                    }

                    // Store file for search/duplicates/old-files (no path - reconstruct from Map key + name)
                    filesInDir.push({ size, name: entry.name, ext, mtime: stat.mtimeMs / 1000 });

                } else if (entry.isDirectory()) {
                    // Skip symlinks, junctions
                    if (entry.isSymbolicLink()) continue;

                    dirCount++;
                    dirsScanned++;
                    currentPath = path.join(dirPath, entry.name);
                    sendProgress();

                    const childSize = scanRecursive(path.join(dirPath, entry.name));
                    total += childSize;
                    childrenPaths.push({ path: path.join(dirPath, entry.name), size: childSize });
                }
            } catch {
                errorsCount++;
            }
        }
    } finally {
        dir.closeSync();
    }

    // Sort children by size descending
    childrenPaths.sort((a, b) => b.size - a.size);

    // Store in tree
    tree.set(dirPath, {
        name: path.basename(dirPath) || dirPath,
        path: dirPath,
        size: total,
        ownSize,
        fileCount,
        dirCount,
        childrenPaths: childrenPaths.map(c => c.path),
    });

    if (filesInDir.length > 0) {
        dirFiles.set(dirPath, filesInDir);
    }

    return total;
}

// Min-heap operations (by size, ascending)
function heapPush(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (heap[parent].size <= heap[i].size) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
    }
}

function heapReplace(heap, item) {
    heap[0] = item;
    let i = 0;
    const n = heap.length;
    while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < n && heap[left].size < heap[smallest].size) smallest = left;
        if (right < n && heap[right].size < heap[smallest].size) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
    }
}

// Run the scan
try {
    scanRecursive(rootPath);

    // Send final result
    parentPort.postMessage({
        type: 'complete',
        tree: [...tree.entries()],
        topFiles,
        extensionStats: [...extensionStats.entries()],
        dirFiles: [...dirFiles.entries()],
        dirsScanned,
        filesFound,
        totalSize,
        errorsCount,
    });
} catch (err) {
    parentPort.postMessage({
        type: 'error',
        error: err.message,
    });
}

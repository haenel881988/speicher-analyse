const fs = require('fs');
const zlib = require('zlib');

function saveScan(scanner, filePath) {
    const data = {
        version: 1,
        app: 'speicher-analyse',
        timestamp: new Date().toISOString(),
        rootPath: scanner.rootPath,
        totalSize: scanner.totalSize,
        dirsScanned: scanner.dirsScanned,
        filesFound: scanner.filesFound,
        tree: [...scanner.tree.entries()],
        extensionStats: [...scanner.extensionStats.entries()],
    };

    const json = JSON.stringify(data);
    const compressed = zlib.gzipSync(json);
    fs.writeFileSync(filePath, compressed);
    return { success: true, size: compressed.length };
}

function loadScan(filePath) {
    const compressed = fs.readFileSync(filePath);
    const json = zlib.gunzipSync(compressed).toString('utf8');
    const data = JSON.parse(json);
    return data;
}

function compareScans(oldScan, newScan) {
    const oldTree = new Map(oldScan.tree);
    const newTree = new Map(newScan.tree);

    const allPaths = new Set([...oldTree.keys(), ...newTree.keys()]);
    const directories = [];

    let totalOldSize = oldScan.totalSize;
    let totalNewSize = newScan.totalSize;
    let grewCount = 0, shrunkCount = 0, newCount = 0, deletedCount = 0;

    for (const p of allPaths) {
        const oldData = oldTree.get(p);
        const newData = newTree.get(p);

        if (oldData && newData) {
            const delta = newData.size - oldData.size;
            if (delta !== 0) {
                directories.push({
                    path: p,
                    name: newData.name,
                    oldSize: oldData.size,
                    newSize: newData.size,
                    delta,
                    pctChange: oldData.size > 0 ? ((delta / oldData.size) * 100) : 100,
                    status: delta > 0 ? 'grew' : 'shrunk',
                });
                if (delta > 0) grewCount++;
                else shrunkCount++;
            }
        } else if (newData && !oldData) {
            directories.push({
                path: p,
                name: newData.name,
                oldSize: 0,
                newSize: newData.size,
                delta: newData.size,
                pctChange: 100,
                status: 'new',
            });
            newCount++;
        } else if (oldData && !newData) {
            directories.push({
                path: p,
                name: oldData.name,
                oldSize: oldData.size,
                newSize: 0,
                delta: -oldData.size,
                pctChange: -100,
                status: 'deleted',
            });
            deletedCount++;
        }
    }

    // Sort by absolute delta descending
    directories.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
        summary: {
            oldTimestamp: oldScan.timestamp,
            newTimestamp: newScan.timestamp,
            oldRootPath: oldScan.rootPath,
            newRootPath: newScan.rootPath,
            totalOldSize,
            totalNewSize,
            totalDelta: totalNewSize - totalOldSize,
            grewCount,
            shrunkCount,
            newCount,
            deletedCount,
        },
        directories: directories.slice(0, 500),
        topGrowers: directories.filter(d => d.status === 'grew').slice(0, 20),
    };
}

module.exports = { saveScan, loadScan, compareScans };

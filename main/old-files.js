function getOldFiles(scanner, thresholdDays = 365, minSize = 0, maxResults = 500) {
    const cutoff = Date.now() / 1000 - (thresholdDays * 86400);
    const results = [];

    for (const [dirPath, files] of scanner.dirFiles) {
        for (const f of files) {
            if (f.mtime < cutoff && f.size >= minSize) {
                results.push({
                    path: f.path,
                    name: f.name,
                    size: f.size,
                    extension: f.ext,
                    mtime: f.mtime,
                    ageDays: Math.floor((Date.now() / 1000 - f.mtime) / 86400),
                });
            }
        }
    }

    results.sort((a, b) => b.size - a.size);
    return {
        files: results.slice(0, maxResults),
        totalCount: results.length,
        totalSize: results.reduce((sum, f) => sum + f.size, 0),
    };
}

module.exports = { getOldFiles };

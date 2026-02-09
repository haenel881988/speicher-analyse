const fs = require('fs');
const path = require('path');
const os = require('os');

const CATEGORIES = [
    {
        id: 'windows-temp',
        name: 'Windows Temp',
        description: 'Temporäre Dateien des Systems und Benutzers',
        icon: '\uD83D\uDDD1',
        getPaths: () => [process.env.TEMP, 'C:\\Windows\\Temp'].filter(Boolean),
    },
    {
        id: 'browser-chrome',
        name: 'Chrome Cache',
        description: 'Google Chrome Browser-Cache',
        icon: '\uD83C\uDF10',
        getPaths: () => {
            const base = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
            return findSubDirs(base, 'Cache');
        },
    },
    {
        id: 'browser-edge',
        name: 'Edge Cache',
        description: 'Microsoft Edge Browser-Cache',
        icon: '\uD83C\uDF10',
        getPaths: () => {
            const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
            return findSubDirs(base, 'Cache');
        },
    },
    {
        id: 'browser-firefox',
        name: 'Firefox Cache',
        description: 'Mozilla Firefox Browser-Cache',
        icon: '\uD83C\uDF10',
        getPaths: () => {
            const profilesDir = path.join(process.env.LOCALAPPDATA || '', 'Mozilla', 'Firefox', 'Profiles');
            return findSubDirs(profilesDir, 'cache2');
        },
    },
    {
        id: 'windows-update',
        name: 'Windows Update Cache',
        description: 'Heruntergeladene Windows-Updates (Admin nötig)',
        icon: '\uD83D\uDD04',
        requiresAdmin: true,
        getPaths: () => ['C:\\Windows\\SoftwareDistribution\\Download'],
    },
    {
        id: 'thumbnails',
        name: 'Thumbnail Cache',
        description: 'Windows Explorer Miniaturansichten-Cache',
        icon: '\uD83D\uDDBC',
        getPaths: () => {
            const explorerDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Explorer');
            return [explorerDir];
        },
        fileFilter: (name) => name.startsWith('thumbcache_') || name === 'iconcache_',
    },
    {
        id: 'prefetch',
        name: 'Prefetch',
        description: 'Windows Prefetch-Dateien (Admin nötig)',
        icon: '\u26A1',
        requiresAdmin: true,
        getPaths: () => ['C:\\Windows\\Prefetch'],
    },
    {
        id: 'crash-dumps',
        name: 'Crash Dumps',
        description: 'Absturzberichte und Speicherabbilder',
        icon: '\uD83D\uDCA5',
        getPaths: () => [
            path.join(process.env.LOCALAPPDATA || '', 'CrashDumps'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'WER'),
        ],
    },
    {
        id: 'log-files',
        name: 'Log-Dateien',
        description: 'Protokolldateien im Temp-Verzeichnis',
        icon: '\uD83D\uDCDD',
        getPaths: () => [process.env.TEMP].filter(Boolean),
        fileFilter: (name) => name.toLowerCase().endsWith('.log'),
    },
];

function findSubDirs(baseDir, subDirName) {
    const results = [];
    try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const candidate = path.join(baseDir, entry.name, subDirName);
                try {
                    fs.accessSync(candidate);
                    results.push(candidate);
                } catch { /* doesn't exist */ }
            }
        }
    } catch { /* base dir doesn't exist */ }
    return results;
}

async function calculateDirSize(dirPath, fileFilter) {
    let totalSize = 0;
    let fileCount = 0;
    const fileList = [];

    async function walk(dir) {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                try {
                    if (entry.isFile()) {
                        if (fileFilter && !fileFilter(entry.name)) continue;
                        const stat = await fs.promises.stat(fullPath);
                        totalSize += stat.size;
                        fileCount++;
                        if (fileList.length < 50) {
                            fileList.push({ path: fullPath, name: entry.name, size: stat.size });
                        }
                    } else if (entry.isDirectory()) {
                        await walk(fullPath);
                    }
                } catch { /* permission errors */ }
            }
        } catch { /* permission errors */ }
    }

    await walk(dirPath);
    return { totalSize, fileCount, files: fileList };
}

async function scanCategories(scanner) {
    const results = [];

    for (const cat of CATEGORIES) {
        const result = {
            id: cat.id,
            name: cat.name,
            description: cat.description,
            icon: cat.icon,
            requiresAdmin: cat.requiresAdmin || false,
            totalSize: 0,
            fileCount: 0,
            paths: [],
        };

        if (cat.special === 'from-scan' && scanner) {
            // Search scan data for matching directories
            for (const [dirPath, data] of scanner.tree) {
                const dirName = path.basename(dirPath);
                if (dirName === cat.dirPattern) {
                    if (cat.minSize && data.size < cat.minSize) continue;
                    result.totalSize += data.size;
                    result.fileCount += data.fileCount;
                    result.paths.push({ path: dirPath, size: data.size });
                }
            }
        } else {
            const dirs = cat.getPaths();
            for (const dir of dirs) {
                try {
                    fs.accessSync(dir);
                    const info = await calculateDirSize(dir, cat.fileFilter);
                    result.totalSize += info.totalSize;
                    result.fileCount += info.fileCount;
                    result.paths.push({ path: dir, size: info.totalSize });
                } catch { /* dir not accessible */ }
            }
        }

        if (result.totalSize > 0 || result.paths.length > 0) {
            results.push(result);
        }
    }

    results.sort((a, b) => b.totalSize - a.totalSize);
    return results;
}

async function cleanCategory(categoryId, specificPaths) {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return { success: false, error: 'Kategorie nicht gefunden' };

    const pathsToClean = specificPaths || (cat.special === 'from-scan' ? [] : cat.getPaths());
    let deletedSize = 0;
    let deletedCount = 0;
    let errors = [];

    for (const dir of pathsToClean) {
        try {
            if (cat.special === 'from-scan') {
                // Delete entire directory
                await fs.promises.rm(dir, { recursive: true, force: true });
                deletedCount++;
            } else {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (cat.fileFilter && !cat.fileFilter(entry.name)) continue;
                    const fullPath = path.join(dir, entry.name);
                    try {
                        const stat = await fs.promises.stat(fullPath);
                        if (entry.isDirectory()) {
                            await fs.promises.rm(fullPath, { recursive: true, force: true });
                        } else {
                            await fs.promises.unlink(fullPath);
                        }
                        deletedSize += stat.size;
                        deletedCount++;
                    } catch (err) {
                        errors.push({ path: fullPath, error: err.message });
                    }
                }
            }
        } catch (err) {
            errors.push({ path: dir, error: err.message });
        }
    }

    return { success: true, deletedSize, deletedCount, errors };
}

module.exports = { scanCategories, cleanCategory, CATEGORIES };

const path = require('path');
const { isInsideExcludedDir, isSystemPath } = require('./exclusions');

const CONTEXT_RULES = [
    { pattern: /[/\\]AppData[/\\]Local[/\\]Google[/\\]Chrome[/\\]/i, label: 'Browser-Cache (Chrome)', icon: 'globe' },
    { pattern: /[/\\]AppData[/\\]Local[/\\]Microsoft[/\\]Edge[/\\]/i, label: 'Browser-Cache (Edge)', icon: 'globe' },
    { pattern: /[/\\]AppData[/\\]Local[/\\]Mozilla[/\\]Firefox[/\\]/i, label: 'Browser-Cache (Firefox)', icon: 'globe' },
    { pattern: /[/\\]AppData[/\\]Local[/\\]BraveSoftware[/\\]/i, label: 'Browser-Cache (Brave)', icon: 'globe' },
    { pattern: /[/\\](Temp|tmp)[/\\]/i, label: 'Temp-Dateien', icon: 'trash' },
    { pattern: /[/\\]Windows[/\\]Temp[/\\]/i, label: 'System-Temp', icon: 'trash' },
    { pattern: /[/\\]AppData[/\\]Local[/\\]Temp[/\\]/i, label: 'Benutzer-Temp', icon: 'trash' },
    { pattern: /[/\\]Logs?[/\\]/i, label: 'Log-Dateien', icon: 'file-text' },
    { pattern: /\.log$/i, label: 'Log-Dateien', icon: 'file-text' },
    { pattern: /[/\\]Downloads[/\\]/i, label: 'Downloads', icon: 'download' },
    { pattern: /[/\\]Desktop[/\\]/i, label: 'Desktop', icon: 'monitor' },
    { pattern: /[/\\]Documents[/\\]|[/\\]Dokumente[/\\]/i, label: 'Dokumente', icon: 'file' },
    { pattern: /[/\\]AppData[/\\]Local[/\\]/i, label: 'App-Daten (Lokal)', icon: 'package' },
    { pattern: /[/\\]AppData[/\\]Roaming[/\\]/i, label: 'App-Daten (Roaming)', icon: 'package' },
    { pattern: /[/\\]Cache[/\\]/i, label: 'Cache', icon: 'database' },
    { pattern: /\.(msi|exe)$/i, label: 'Installer', icon: 'download-cloud' },
    { pattern: /[/\\]ProgramData[/\\]/i, label: 'Programmdaten', icon: 'package' },
    { pattern: /[/\\]Program Files[/\\]/i, label: 'Programme', icon: 'package' },
    { pattern: /[/\\]Windows[/\\]/i, label: 'System', icon: 'shield' },
];

function categorizeFileContext(filePath) {
    for (const rule of CONTEXT_RULES) {
        if (rule.pattern.test(filePath)) {
            return { label: rule.label, icon: rule.icon };
        }
    }
    return { label: 'Sonstige', icon: 'file' };
}

function getOldFiles(scanner, thresholdDays = 365, minSize = 0, maxResults = 500) {
    if (!scanner.dirFiles) return { files: [], totalCount: 0, totalSize: 0 };
    const cutoff = Date.now() / 1000 - (thresholdDays * 86400);
    const results = [];

    for (const [dirPath, files] of scanner.dirFiles) {
        if (isInsideExcludedDir(dirPath)) continue;

        for (const f of files) {
            if (f.mtime < cutoff && f.size >= minSize) {
                const fullPath = path.join(dirPath, f.name);
                if (isSystemPath(fullPath)) continue;

                const context = categorizeFileContext(fullPath);
                results.push({
                    path: fullPath,
                    name: f.name,
                    size: f.size,
                    extension: f.ext,
                    mtime: f.mtime,
                    ageDays: Math.floor((Date.now() / 1000 - f.mtime) / 86400),
                    context: context.label,
                    contextIcon: context.icon,
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

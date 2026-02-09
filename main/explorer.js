'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

/**
 * List directory contents with stat info for each entry.
 * Caps at maxEntries to prevent UI freeze on huge directories.
 */
async function listDirectory(dirPath, maxEntries = 5000) {
    try {
        const normalized = path.resolve(dirPath);
        const dirents = await fs.promises.readdir(normalized, { withFileTypes: true });
        const truncated = dirents.length > maxEntries;
        const toProcess = dirents.slice(0, maxEntries);

        const statPromises = toProcess.map(async (dirent) => {
            const fullPath = path.join(normalized, dirent.name);
            try {
                const stat = await fs.promises.stat(fullPath);
                const ext = dirent.isDirectory() ? '' : path.extname(dirent.name).toLowerCase();
                return {
                    name: dirent.name,
                    path: fullPath,
                    isDirectory: dirent.isDirectory(),
                    size: dirent.isDirectory() ? 0 : stat.size,
                    modified: stat.mtimeMs,
                    created: stat.birthtimeMs,
                    extension: ext,
                    readonly: !(stat.mode & 0o200),
                    hidden: dirent.name.startsWith('.'),
                };
            } catch (err) {
                return {
                    name: dirent.name,
                    path: fullPath,
                    isDirectory: dirent.isDirectory(),
                    size: 0,
                    modified: 0,
                    created: 0,
                    extension: '',
                    readonly: true,
                    hidden: false,
                    error: err.code,
                };
            }
        });

        const entries = await Promise.all(statPromises);

        return {
            path: normalized,
            parentPath: path.dirname(normalized),
            entries,
            totalEntries: dirents.length,
            truncated,
        };
    } catch (err) {
        return {
            path: dirPath,
            parentPath: path.dirname(dirPath),
            entries: [],
            totalEntries: 0,
            truncated: false,
            error: friendlyDirError(err, dirPath),
        };
    }
}

function friendlyDirError(err, dirPath) {
    const name = path.basename(dirPath) || dirPath;
    if (err.code === 'EACCES' || err.code === 'EPERM') {
        return `Zugriff verweigert auf "${name}". Administratorrechte erforderlich.`;
    }
    if (err.code === 'ENOENT') {
        return `Pfad "${dirPath}" existiert nicht.`;
    }
    if (err.code === 'ENOTDIR') {
        return `"${dirPath}" ist kein Ordner.`;
    }
    return `Fehler beim Lesen von "${name}": ${err.message}`;
}

// ===== Windows Registry Shell Folders =====

const SHELL_FOLDER_MAP = [
    { name: 'Desktop', regValue: 'Desktop', fallback: 'Desktop', icon: 'desktop' },
    { name: 'Dokumente', regValue: 'Personal', fallback: 'Documents', icon: 'documents' },
    { name: 'Downloads', regValue: '{374DE290-123F-4565-9164-39C4925E467B}', fallback: 'Downloads', icon: 'downloads' },
    { name: 'Bilder', regValue: 'My Pictures', fallback: 'Pictures', icon: 'pictures' },
    { name: 'Musik', regValue: 'My Music', fallback: 'Music', icon: 'music' },
    { name: 'Videos', regValue: 'My Video', fallback: 'Videos', icon: 'videos' },
];

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders';

/**
 * Read a single Shell Folder path from Windows Registry.
 * Expands environment variables like %USERPROFILE%.
 */
function queryRegValue(valueName) {
    return new Promise((resolve) => {
        execFile('reg', ['query', REG_KEY, '/v', valueName], { timeout: 3000 }, (err, stdout) => {
            if (err) { resolve(null); return; }
            // Parse output: lines like "    Desktop    REG_EXPAND_SZ    C:\Users\user\Desktop"
            const lines = stdout.split('\n');
            for (const line of lines) {
                const match = line.match(/REG_(?:EXPAND_)?SZ\s+(.+)/i);
                if (match) {
                    let val = match[1].trim();
                    // Expand environment variables
                    val = val.replace(/%([^%]+)%/g, (_, envVar) => process.env[envVar] || `%${envVar}%`);
                    resolve(val);
                    return;
                }
            }
            resolve(null);
        });
    });
}

/**
 * Get Windows known folders using real Registry Shell Folder paths.
 * Falls back to hardcoded paths if Registry query fails.
 */
async function getKnownFolders() {
    const home = os.homedir();

    // Query all registry values in parallel
    const results = await Promise.all(SHELL_FOLDER_MAP.map(async (entry) => {
        let folderPath = null;

        // Try Registry first
        const regPath = await queryRegValue(entry.regValue);
        if (regPath) {
            try {
                await fs.promises.access(regPath);
                folderPath = regPath;
            } catch { /* path from registry doesn't exist, try fallback */ }
        }

        // Fallback to homedir-based path
        if (!folderPath) {
            const fallbackPath = path.join(home, entry.fallback);
            try {
                await fs.promises.access(fallbackPath);
                folderPath = fallbackPath;
            } catch { /* doesn't exist either */ }
        }

        if (folderPath) {
            return { name: entry.name, path: folderPath, icon: entry.icon };
        }
        return null;
    }));

    return results.filter(Boolean);
}

// ===== Folder Size Calculator =====

/**
 * Calculate total size of a directory recursively.
 */
async function calculateFolderSize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    let dirCount = 0;

    async function walk(dir) {
        try {
            const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
            const promises = dirents.map(async (dirent) => {
                const fullPath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    dirCount++;
                    await walk(fullPath);
                } else {
                    try {
                        const stat = await fs.promises.stat(fullPath);
                        totalSize += stat.size;
                        fileCount++;
                    } catch { /* skip inaccessible files */ }
                }
            });
            await Promise.all(promises);
        } catch { /* skip inaccessible dirs */ }
    }

    await walk(dirPath);
    return { totalSize, fileCount, dirCount };
}

// ===== Empty Folder Finder =====

/**
 * Find empty folders recursively up to maxDepth.
 */
async function findEmptyFolders(dirPath, maxDepth = 3) {
    const emptyFolders = [];

    async function walk(dir, depth) {
        if (depth > maxDepth) return false; // return whether dir is empty

        try {
            const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
            if (dirents.length === 0) {
                emptyFolders.push({ path: dir, name: path.basename(dir) });
                return true;
            }

            // Check children - a folder is "empty" if it only contains empty subfolders
            let hasFiles = false;
            let hasNonEmptySubdir = false;

            for (const dirent of dirents) {
                if (!dirent.isDirectory()) {
                    hasFiles = true;
                    break;
                }
                const childPath = path.join(dir, dirent.name);
                const childEmpty = await walk(childPath, depth + 1);
                if (!childEmpty) hasNonEmptySubdir = true;
            }

            if (!hasFiles && !hasNonEmptySubdir) {
                emptyFolders.push({ path: dir, name: path.basename(dir) });
                return true;
            }
            return false;
        } catch {
            return false; // inaccessible = not empty
        }
    }

    // Walk children of the root dir (don't include root itself)
    try {
        const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const promises = dirents
            .filter(d => d.isDirectory())
            .map(d => walk(path.join(dirPath, d.name), 1));
        await Promise.all(promises);
    } catch { /* ignore */ }

    return { emptyFolders, count: emptyFolders.length };
}

module.exports = { listDirectory, getKnownFolders, calculateFolderSize, findEmptyFolders };

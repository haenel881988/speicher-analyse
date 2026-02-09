const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

function friendlyError(err, filePath) {
    const name = path.basename(filePath);
    if (err.code === 'EACCES' || err.code === 'EPERM') {
        return `Zugriff verweigert: "${name}". Möglicherweise sind Administratorrechte erforderlich.`;
    }
    if (err.code === 'EBUSY') {
        return `"${name}" wird von einem anderen Programm verwendet.`;
    }
    if (err.code === 'ENOENT') {
        return `"${name}" wurde nicht gefunden (bereits gelöscht?).`;
    }
    if (err.code === 'ENOTEMPTY') {
        return `Ordner "${name}" ist nicht leer.`;
    }
    if (err.message && err.message.includes('not allowed')) {
        return `"${name}" kann nicht in den Papierkorb verschoben werden.`;
    }
    return `Fehler bei "${name}": ${err.message}`;
}

async function retryOnBusy(fn, retries = 3, delayMs = 500) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (err.code === 'EBUSY' && i < retries - 1) {
                await new Promise(r => setTimeout(r, delayMs * (i + 1)));
                continue;
            }
            throw err;
        }
    }
}

async function trashItems(paths) {
    const results = [];
    for (const p of paths) {
        try {
            await retryOnBusy(() => shell.trashItem(p));
            results.push({ path: p, success: true });
        } catch (err) {
            results.push({ path: p, success: false, error: friendlyError(err, p) });
        }
    }
    return results;
}

async function deleteItems(paths) {
    const results = [];
    for (const p of paths) {
        try {
            const stat = await fs.promises.stat(p);
            if (stat.isDirectory()) {
                await retryOnBusy(() => fs.promises.rm(p, { recursive: true, force: true }));
            } else {
                await retryOnBusy(() => fs.promises.unlink(p));
            }
            results.push({ path: p, success: true });
        } catch (err) {
            results.push({ path: p, success: false, error: friendlyError(err, p) });
        }
    }
    return results;
}

async function createFolder(parentPath, name) {
    const fullPath = path.join(parentPath, name);
    try {
        await fs.promises.mkdir(fullPath);
        return { path: fullPath, success: true };
    } catch (err) {
        return { path: fullPath, success: false, error: err.message };
    }
}

async function rename(oldPath, newName) {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    try {
        await fs.promises.rename(oldPath, newPath);
        return { oldPath, newPath, success: true };
    } catch (err) {
        return { oldPath, newPath, success: false, error: err.message };
    }
}

async function moveItems(sourcePaths, destDir, mainWindow) {
    const results = [];
    for (const src of sourcePaths) {
        const destPath = path.join(destDir, path.basename(src));
        try {
            await fs.promises.rename(src, destPath);
            results.push({ source: src, dest: destPath, success: true });
        } catch (err) {
            if (err.code === 'EXDEV') {
                // Cross-device move: copy then delete
                try {
                    await copyWithProgress(src, destPath, mainWindow);
                    await fs.promises.rm(src, { recursive: true, force: true });
                    results.push({ source: src, dest: destPath, success: true });
                } catch (copyErr) {
                    results.push({ source: src, dest: destPath, success: false, error: copyErr.message });
                }
            } else {
                results.push({ source: src, dest: destPath, success: false, error: err.message });
            }
        }
    }
    return results;
}

async function copyItems(sourcePaths, destDir, mainWindow) {
    const results = [];
    for (const src of sourcePaths) {
        const destPath = path.join(destDir, path.basename(src));
        try {
            await copyWithProgress(src, destPath, mainWindow);
            results.push({ source: src, dest: destPath, success: true });
        } catch (err) {
            results.push({ source: src, dest: destPath, success: false, error: err.message });
        }
    }
    return results;
}

async function copyWithProgress(src, dest, mainWindow) {
    const stat = await fs.promises.stat(src);

    if (stat.isDirectory()) {
        await fs.promises.cp(src, dest, { recursive: true });
    } else if (stat.size > 100 * 1024 * 1024) {
        // Large file: stream with progress
        await new Promise((resolve, reject) => {
            let copied = 0;
            const readStream = fs.createReadStream(src);
            const writeStream = fs.createWriteStream(dest);

            readStream.on('data', (chunk) => {
                copied += chunk.length;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file-op-progress', {
                        operation: 'copy',
                        source: src,
                        progress: copied / stat.size,
                        copied,
                        total: stat.size,
                    });
                }
            });

            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            readStream.pipe(writeStream);
        });
    } else {
        await fs.promises.copyFile(src, dest);
    }
}

async function getProperties(filePath) {
    try {
        const stat = await fs.promises.stat(filePath);
        const result = {
            path: filePath,
            name: path.basename(filePath),
            isDirectory: stat.isDirectory(),
            size: stat.size,
            created: stat.birthtime.toISOString(),
            modified: stat.mtime.toISOString(),
            accessed: stat.atime.toISOString(),
            readonly: !(stat.mode & 0o200),
        };

        if (stat.isDirectory()) {
            result.totalSize = await calculateDirSize(filePath);
        }

        return result;
    } catch (err) {
        return { path: filePath, error: err.message };
    }
}

async function calculateDirSize(dirPath) {
    let total = 0;
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            try {
                if (entry.isFile()) {
                    const s = await fs.promises.stat(full);
                    total += s.size;
                } else if (entry.isDirectory()) {
                    total += await calculateDirSize(full);
                }
            } catch { /* permission errors */ }
        }
    } catch { /* permission errors */ }
    return total;
}

module.exports = {
    trashItems,
    deleteItems,
    createFolder,
    rename,
    moveItems,
    copyItems,
    getProperties,
};

const { ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { DiskScanner } = require('./scanner');
const { listDrives } = require('./drives');
const fileOps = require('./file-ops');
const { showContextMenu } = require('./menu');
const { generateCSV } = require('./export');
const { getOldFiles } = require('./old-files');
const { DuplicateFinder } = require('./duplicates');
const { scanCategories, cleanCategory } = require('./cleanup');
const { saveScan, loadScan, compareScans } = require('./scan-compare');
const { readFilePreview } = require('./preview');
const registry = require('./registry');
const autostart = require('./autostart');
const services = require('./services');
const bloatware = require('./bloatware');
const optimizer = require('./optimizer');
const updates = require('./updates');

// In-memory scan storage
const scans = new Map();
const duplicateFinders = new Map();

function register(mainWindow) {
    // === Drives ===
    ipcMain.handle('get-drives', async () => {
        return listDrives();
    });

    // === Scan ===
    ipcMain.handle('start-scan', async (_event, scanPath) => {
        // Clean up previous scans to free memory
        for (const [oldId, oldScanner] of scans) {
            if (oldScanner.worker) oldScanner.worker.terminate();
            scans.delete(oldId);
        }
        for (const [oldId, finder] of duplicateFinders) {
            finder.cancel();
            duplicateFinders.delete(oldId);
        }

        const scanId = crypto.randomUUID();
        const scanner = new DiskScanner(scanPath, scanId);
        scans.set(scanId, scanner);

        scanner.start(
            // onProgress
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-progress', progress);
                }
            },
            // onComplete
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-complete', progress);
                }
            },
            // onError
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-error', progress);
                }
            }
        );

        return { scan_id: scanId };
    });

    // === Tree Data ===
    ipcMain.handle('get-tree-node', async (_event, scanId, nodePath, depth) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };
        const node = scanner.getTreeNode(nodePath, depth || 1);
        if (!node) return { error: 'Pfad nicht gefunden' };
        return node;
    });

    ipcMain.handle('get-treemap-data', async (_event, scanId, nodePath, depth) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };
        const node = scanner.getTreeNode(nodePath, depth || 2);
        if (!node) return { error: 'Pfad nicht gefunden' };
        return node;
    });

    // === File Data ===
    ipcMain.handle('get-top-files', async (_event, scanId, limit) => {
        const scanner = scans.get(scanId);
        if (!scanner) return [];
        return scanner.getTopFiles(limit || 100);
    });

    ipcMain.handle('get-file-types', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (!scanner) return [];
        return scanner.getFileTypeStats();
    });

    ipcMain.handle('search', async (_event, scanId, query, minSize) => {
        const scanner = scans.get(scanId);
        if (!scanner) return [];
        return scanner.search(query, minSize || 0);
    });

    ipcMain.handle('get-files-by-extension', async (_event, scanId, ext, limit) => {
        const scanner = scans.get(scanId);
        if (!scanner) return [];
        return scanner.getFilesByExtension(ext, limit || 500);
    });

    ipcMain.handle('get-files-by-category', async (_event, scanId, category, limit) => {
        const scanner = scans.get(scanId);
        if (!scanner) return [];
        return scanner.getFilesByCategory(category, limit || 500);
    });

    // === Export ===
    ipcMain.handle('export-csv', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'CSV exportieren',
            defaultPath: `speicher-analyse-${scanId.slice(0, 8)}.csv`,
            filters: [{ name: 'CSV-Dateien', extensions: ['csv'] }],
        });

        if (result.canceled) return { canceled: true };

        const csvContent = generateCSV(scanner);
        await fs.promises.writeFile(result.filePath, '\ufeff' + csvContent, 'utf8'); // BOM for Excel
        return { success: true, path: result.filePath };
    });

    // === File Management ===
    ipcMain.handle('file-delete-trash', async (_event, paths) => {
        return fileOps.trashItems(paths);
    });

    ipcMain.handle('file-delete-permanent', async (_event, paths) => {
        return fileOps.deleteItems(paths);
    });

    ipcMain.handle('file-create-folder', async (_event, parentPath, name) => {
        return fileOps.createFolder(parentPath, name);
    });

    ipcMain.handle('file-rename', async (_event, oldPath, newName) => {
        return fileOps.rename(oldPath, newName);
    });

    ipcMain.handle('file-move', async (_event, sourcePaths, destDir) => {
        return fileOps.moveItems(sourcePaths, destDir, mainWindow);
    });

    ipcMain.handle('file-copy', async (_event, sourcePaths, destDir) => {
        return fileOps.copyItems(sourcePaths, destDir, mainWindow);
    });

    ipcMain.handle('file-properties', async (_event, filePath) => {
        return fileOps.getProperties(filePath);
    });

    ipcMain.handle('file-open', async (_event, filePath) => {
        const result = await shell.openPath(filePath);
        return { success: !result, error: result || undefined };
    });

    ipcMain.handle('file-show-in-explorer', async (_event, filePath) => {
        shell.showItemInFolder(filePath);
        return { success: true };
    });

    // === Context Menu ===
    ipcMain.handle('show-context-menu', async (_event, menuType, context) => {
        showContextMenu(menuType, context, mainWindow);
    });

    // === Dialogs ===
    ipcMain.handle('show-save-dialog', async (_event, options) => {
        return dialog.showSaveDialog(mainWindow, options);
    });

    ipcMain.handle('show-confirm-dialog', async (_event, options) => {
        return dialog.showMessageBox(mainWindow, options);
    });

    // === Old Files ===
    ipcMain.handle('get-old-files', async (_event, scanId, thresholdDays, minSize) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { files: [], totalCount: 0, totalSize: 0 };
        return getOldFiles(scanner, thresholdDays, minSize);
    });

    // === Duplicate Finder ===
    ipcMain.handle('start-duplicate-scan', async (_event, scanId, options) => {
        const scanner = scans.get(scanId);
        if (!scanner) throw new Error('Scan nicht gefunden');

        // Cancel any existing finder for this scan
        const existing = duplicateFinders.get(scanId);
        if (existing) existing.cancel();

        const finder = new DuplicateFinder(scanner, scanId);
        duplicateFinders.set(scanId, finder);

        finder.start(
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('duplicate-progress', progress);
                }
            },
            (results) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('duplicate-complete', results);
                }
                duplicateFinders.delete(scanId);
            },
            (error) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('duplicate-error', { error });
                }
                duplicateFinders.delete(scanId);
            },
            options
        );

        return { started: true };
    });

    ipcMain.handle('cancel-duplicate-scan', async (_event, scanId) => {
        const finder = duplicateFinders.get(scanId);
        if (finder) finder.cancel();
        return { success: true };
    });

    // === Release bulk data (free memory after post-scan analysis) ===
    ipcMain.handle('release-scan-bulk-data', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (scanner) scanner.releaseBulkData();
        return { success: true };
    });

    // === Size Duplicates (pre-scan for dashboard) ===
    ipcMain.handle('get-size-duplicates', async (_event, scanId, minSize) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { totalGroups: 0, totalFiles: 0, totalSaveable: 0 };
        return scanner.getSizeDuplicates(minSize || 1024);
    });

    // === Cleanup ===
    ipcMain.handle('scan-cleanup-categories', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        return scanCategories(scanner);
    });

    ipcMain.handle('clean-category', async (_event, categoryId, paths) => {
        return cleanCategory(categoryId, paths);
    });

    // === Scan Compare ===
    ipcMain.handle('save-scan', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Scan speichern',
            defaultPath: `scan-${new Date().toISOString().slice(0, 10)}.scan.gz`,
            filters: [{ name: 'Scan-Dateien', extensions: ['scan.gz'] }],
        });

        if (result.canceled) return { canceled: true };

        const saveResult = saveScan(scanner, result.filePath);
        return { ...saveResult, path: result.filePath };
    });

    ipcMain.handle('compare-scan', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { error: 'Scan nicht gefunden' };

        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Früheren Scan laden',
            filters: [{ name: 'Scan-Dateien', extensions: ['scan.gz'] }],
            properties: ['openFile'],
        });

        if (result.canceled) return { canceled: true };

        try {
            const oldScan = loadScan(result.filePaths[0]);
            // Build a comparable scan object from current scanner
            const newScan = {
                timestamp: new Date().toISOString(),
                rootPath: scanner.rootPath,
                totalSize: scanner.totalSize,
                tree: [...scanner.tree.entries()],
            };
            return compareScans(oldScan, newScan);
        } catch (err) {
            return { error: err.message };
        }
    });

    // === Preview ===
    ipcMain.handle('read-file-preview', async (_event, filePath, maxLines) => {
        return readFilePreview(filePath, maxLines);
    });

    // === Registry ===
    ipcMain.handle('scan-registry', async () => {
        return registry.scanAll();
    });

    ipcMain.handle('export-registry-backup', async (_event, entries) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Registry-Sicherung speichern',
            defaultPath: `registry-backup-${new Date().toISOString().slice(0, 10)}.reg`,
            filters: [{ name: 'Registry-Dateien', extensions: ['reg'] }],
        });

        if (result.canceled) return { canceled: true };

        const backupContent = await registry.generateBackup(entries);
        await fs.promises.writeFile(result.filePath, backupContent, 'utf16le');
        return { success: true, path: result.filePath };
    });

    ipcMain.handle('clean-registry', async (_event, entries) => {
        // Auto-backup before any deletion
        const backupPath = await registry.autoBackup(entries);
        const results = await registry.deleteEntries(entries);
        return { results, backupPath };
    });

    ipcMain.handle('restore-registry-backup', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Registry-Sicherung wiederherstellen',
            filters: [{ name: 'Registry-Dateien', extensions: ['reg'] }],
            properties: ['openFile'],
        });

        if (result.canceled) return { canceled: true };
        return registry.restoreBackup(result.filePaths[0]);
    });

    // === Autostart ===
    ipcMain.handle('get-autostart-entries', async () => {
        return autostart.getAutoStartEntries();
    });

    ipcMain.handle('toggle-autostart', async (_event, entry, enabled) => {
        return autostart.toggleAutoStart(entry, enabled);
    });

    ipcMain.handle('delete-autostart', async (_event, entry) => {
        return autostart.deleteAutoStart(entry);
    });

    // === Services ===
    ipcMain.handle('get-services', async () => {
        return services.getServices();
    });

    ipcMain.handle('control-service', async (_event, name, action) => {
        return services.controlService(name, action);
    });

    ipcMain.handle('set-service-start-type', async (_event, name, startType) => {
        return services.setStartType(name, startType);
    });

    // === Bloatware ===
    ipcMain.handle('scan-bloatware', async () => {
        return bloatware.scanBloatware();
    });

    ipcMain.handle('uninstall-bloatware', async (_event, entry) => {
        return bloatware.uninstallProgram(entry);
    });

    // === Optimizer ===
    ipcMain.handle('get-optimizations', async () => {
        return optimizer.getOptimizationRecommendations();
    });

    ipcMain.handle('apply-optimization', async (_event, id) => {
        return optimizer.applyOptimization(id);
    });

    // === Updates ===
    ipcMain.handle('check-windows-updates', async () => {
        return updates.checkWindowsUpdates();
    });

    ipcMain.handle('get-update-history', async () => {
        return updates.getUpdateHistory();
    });

    ipcMain.handle('check-software-updates', async () => {
        return updates.checkSoftwareUpdates();
    });

    ipcMain.handle('update-software', async (_event, packageId) => {
        return updates.updateSoftware(packageId);
    });

    ipcMain.handle('get-driver-info', async () => {
        return updates.getDriverInfo();
    });

    ipcMain.handle('get-hardware-info', async () => {
        return updates.getHardwareInfo();
    });

    // === Platform ===
    ipcMain.handle('get-platform', async () => {
        return process.platform;
    });

    ipcMain.handle('open-external', async (_event, url) => {
        const { shell } = require('electron');
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            await shell.openExternal(url);
        }
    });
}

module.exports = { register };

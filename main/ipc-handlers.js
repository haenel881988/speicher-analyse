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
const explorer = require('./explorer');
const admin = require('./admin');
const session = require('./session');
const { PreferencesStore } = require('./preferences');

const { Worker } = require('worker_threads');
const log = require('./logger').createLogger('ipc');

// In-memory scan storage
const scans = new Map();
const duplicateFinders = new Map();
const deepSearchWorkers = new Map();

// Singleton PreferencesStore (shared across module)
const preferences = new PreferencesStore();

// Last known UI state (pushed from renderer for session persistence)
let lastKnownUiState = {};

function register(mainWindow) {
    // Init preferences (needs app.getPath which requires app ready)
    preferences.init();

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
                // Auto-save session after scan completion
                if (preferences.get('sessionSaveAfterScan')) {
                    log.info('Auto-Save nach Scan wird durchgeführt...');
                    session.saveSession(scans, lastKnownUiState).then(saved => {
                        log.info(`Auto-Save ${saved ? 'erfolgreich' : 'fehlgeschlagen (keine Daten)'}`);
                    }).catch(err =>
                        log.error('Auto-Save FEHLER:', err.message)
                    );
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

    // === Bulk Folder Sizes (for Explorer enrichment from scan data) ===
    // Sucht automatisch in allen verfügbaren Scans wenn der angegebene Scan
    // die Daten nicht hat (z.B. anderes Laufwerk gescannt).
    ipcMain.handle('get-folder-sizes-bulk', async (_event, scanId, folderPaths, parentPath) => {
        // Hilfsfunktion: Knoten im Tree suchen (mit Drive-Letter-Normalisierung)
        const findNode = (tree, fp) => {
            let node = tree.get(fp);
            if (!node && fp.length >= 2 && fp[1] === ':') {
                const alt = (fp[0] === fp[0].toUpperCase()
                    ? fp[0].toLowerCase() : fp[0].toUpperCase()) + fp.slice(1);
                node = tree.get(alt);
            }
            return node;
        };

        // Primären Scanner versuchen
        let scanner = scans.get(scanId);
        if (scanner && scanner.isComplete) {
            // Prüfen ob dieser Scanner Daten für den Pfad hat
            const testPath = parentPath || (folderPaths.length > 0 ? folderPaths[0] : null);
            if (testPath && !findNode(scanner.tree, testPath)) {
                // Dieser Scanner hat keine Daten für diesen Pfad → anderen suchen
                scanner = null;
            }
        } else {
            scanner = null;
        }

        // Fallback: Passenden Scanner in allen verfügbaren Scans suchen
        if (!scanner) {
            const testPath = parentPath || (folderPaths.length > 0 ? folderPaths[0] : null);
            if (testPath) {
                for (const [, s] of scans) {
                    if (s.isComplete && findNode(s.tree, testPath)) {
                        scanner = s;
                        break;
                    }
                }
            }
        }

        if (!scanner) return null;

        const result = { folders: {}, parent: null };

        for (const fp of folderPaths) {
            const node = findNode(scanner.tree, fp);
            if (node) {
                result.folders[fp] = {
                    size: node.size,
                    ownSize: node.ownSize,
                    fileCount: node.fileCount,
                    dirCount: node.dirCount,
                };
            }
        }

        if (parentPath) {
            const parentNode = findNode(scanner.tree, parentPath);
            if (parentNode) result.parent = { size: parentNode.size };
        }

        return result;
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

    // === Editor ===
    ipcMain.handle('read-file-content', async (_event, filePath) => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            return { content, error: null };
        } catch (err) {
            return { content: null, error: err.message };
        }
    });

    ipcMain.handle('write-file-content', async (_event, filePath, content) => {
        try {
            await fs.promises.writeFile(filePath, content, 'utf8');
            return { success: true, error: null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // === Binary File Read (for DOCX/XLSX/PDF) ===
    ipcMain.handle('read-file-binary', async (_event, filePath) => {
        try {
            const buffer = await fs.promises.readFile(filePath);
            // Node.js Buffer uses memory pooling — buffer.buffer may contain OTHER buffers' data.
            // Slice to get a clean ArrayBuffer of exactly the file's size.
            const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err.message };
        }
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

    // === Explorer ===
    ipcMain.handle('explorer-list-directory', async (_event, dirPath, maxEntries) => {
        return explorer.listDirectory(dirPath, maxEntries);
    });

    ipcMain.handle('explorer-get-known-folders', async () => {
        return explorer.getKnownFolders();
    });

    ipcMain.handle('explorer-calculate-folder-size', async (_event, dirPath) => {
        return explorer.calculateFolderSize(dirPath);
    });

    ipcMain.handle('explorer-find-empty-folders', async (_event, dirPath, maxDepth) => {
        return explorer.findEmptyFolders(dirPath, maxDepth);
    });

    // === Hybrid Search (Ebene 2 + 3) ===
    ipcMain.handle('search-name-index', async (_event, scanId, query, options) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { results: [], info: { available: false } };
        return {
            results: scanner.searchByName(query, options),
            info: scanner.getNameIndexInfo(),
        };
    });

    ipcMain.handle('get-name-index-info', async (_event, scanId) => {
        const scanner = scans.get(scanId);
        if (!scanner) return { available: false, fileCount: 0 };
        return scanner.getNameIndexInfo();
    });

    ipcMain.handle('deep-search-start', async (_event, rootSearchPath, query, useRegex) => {
        // Cancel any existing deep search
        const existing = deepSearchWorkers.get('active');
        if (existing) {
            try { existing.terminate(); } catch {}
            deepSearchWorkers.delete('active');
        }

        const worker = new Worker(path.join(__dirname, 'deep-search-worker.js'), {
            workerData: { rootPath: rootSearchPath, query, useRegex, maxResults: 1000 },
        });
        deepSearchWorkers.set('active', worker);

        worker.on('message', (msg) => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (msg.type === 'result') {
                mainWindow.webContents.send('deep-search-result', msg.data);
            } else if (msg.type === 'progress') {
                mainWindow.webContents.send('deep-search-progress', msg);
            } else if (msg.type === 'complete') {
                mainWindow.webContents.send('deep-search-complete', msg);
                deepSearchWorkers.delete('active');
            } else if (msg.type === 'error') {
                mainWindow.webContents.send('deep-search-error', msg);
                deepSearchWorkers.delete('active');
            }
        });

        worker.on('error', (err) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('deep-search-error', { error: err.message });
            }
            deepSearchWorkers.delete('active');
        });

        return { started: true };
    });

    ipcMain.handle('deep-search-cancel', async () => {
        const worker = deepSearchWorkers.get('active');
        if (worker) {
            try { worker.terminate(); } catch {}
            deepSearchWorkers.delete('active');
        }
        return { success: true };
    });

    // === Clipboard (path copy) ===
    ipcMain.handle('copy-to-clipboard', async (_event, text) => {
        const { clipboard } = require('electron');
        clipboard.writeText(text);
        return { success: true };
    });

    // === Open in Terminal ===
    // Sends event to renderer to open embedded terminal at the given path
    ipcMain.handle('open-in-terminal', async (_event, dirPath) => {
        const resolved = path.resolve(dirPath);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('open-embedded-terminal', { path: resolved });
        }
        return { success: true };
    });

    // === Open External Terminal with command ===
    // Opens a real PowerShell/CMD window and runs a command (for PTY-required programs like claude, ssh, etc.)
    ipcMain.handle('terminal-open-external', async (_event, cwd, command) => {
        const { spawn: spawnProc } = require('child_process');
        const resolved = path.resolve(cwd);
        try {
            // Windows Terminal (wt.exe) if available, otherwise PowerShell directly
            const child = spawnProc('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit', '-Command',
                `Set-Location -LiteralPath '${resolved.replace(/'/g, "''")}'; ${command}`
            ], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
            });
            child.unref();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // === Open With dialog ===
    ipcMain.handle('open-with-dialog', async (_event, filePath) => {
        const { execFile: spawnExec } = require('child_process');
        const resolved = path.resolve(filePath);
        // Use execFile with array args to prevent injection; unref to not block app quit
        const child = spawnExec('rundll32', ['shell32.dll,OpenAs_RunDLL', resolved], {
            windowsHide: false, detached: true, stdio: 'ignore',
        });
        child.unref();
        return { success: true };
    });

    // === System Capabilities ===
    ipcMain.handle('get-system-capabilities', async () => {
        const compat = require('./compat');
        return compat.checkCapabilities();
    });

    // === Battery ===
    ipcMain.handle('get-battery-status', async () => {
        const battery = require('./battery');
        return battery.getBatteryStatus();
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

    // === Admin Elevation ===
    ipcMain.handle('is-admin', async () => {
        return admin.isAdmin();
    });

    ipcMain.handle('restart-as-admin', async () => {
        try {
            await admin.restartAsAdmin(scans);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // === Restore Elevated Session + Persistent Session (pull-based) ===
    // Priority: Elevation session > Persistent session
    let restoredSessions = null;
    let restoredUiState = null;
    let pendingActionResult = null; // Ergebnis einer Auto-Aktion nach Admin-Neustart
    const sessionLoadPromise = (async () => {
        // 0. Check + execute pending actions (from admin elevation restart)
        const pendingAction = await admin.loadAndClearPendingAction();
        if (pendingAction) {
            log.info(`Pending-Action gefunden: ${pendingAction}`);
            if (pendingAction === 'fix-sideloading') {
                const privacy = require('./privacy');
                const result = await privacy.fixSideloading();
                pendingActionResult = { action: pendingAction, ...result };
                log.info(`Sideloading-Fix: ${result.success ? 'ERFOLGREICH' : 'FEHLGESCHLAGEN: ' + result.error}`);
            }
        }

        // 1. Check for elevation session (priority - one-time, gets deleted)
        const elevatedSessions = await admin.loadElevatedSession();
        if (elevatedSessions && elevatedSessions.length > 0) {
            for (const s of elevatedSessions) {
                const scanner = admin.reconstructScanner(s);
                scans.set(s.scanId, scanner);
            }
            restoredSessions = elevatedSessions.map(s => ({
                scan_id: s.scanId,
                status: 'complete',
                current_path: s.rootPath,
                dirs_scanned: s.dirsScanned,
                files_found: s.filesFound,
                total_size: s.totalSize,
                errors_count: s.errorsCount,
                elapsed_seconds: 0,
            }));
            return;
        }

        // 2. Check for persistent session (only if sessionRestore enabled)
        if (!preferences.get('sessionRestore')) {
            log.info('sessionRestore ist deaktiviert → überspringe');
            return;
        }

        log.info('Lade gespeicherte Session...');
        const persistentSession = await session.loadSession();
        if (persistentSession && persistentSession.scans.length > 0) {
            log.info(`${persistentSession.scans.length} Scan(s) gefunden, rekonstruiere...`);
            for (const s of persistentSession.scans) {
                const scanner = session.reconstructScanner(s);
                scans.set(s.scanId, scanner);
                log.info(`Scan rekonstruiert: ${s.rootPath} — ${s.filesFound} Dateien, ${s.dirsScanned} Ordner, tree=${scanner.tree.size}, dirFiles=${scanner.dirFiles ? scanner.dirFiles.size : 'null'}, nameIndex=${scanner.nameIndex.size}`);
            }
            restoredSessions = persistentSession.scans.map(s => ({
                scan_id: s.scanId,
                status: 'complete',
                current_path: s.rootPath,
                dirs_scanned: s.dirsScanned,
                files_found: s.filesFound,
                total_size: s.totalSize,
                errors_count: s.errorsCount,
                elapsed_seconds: 0,
            }));
            restoredUiState = persistentSession.ui || null;
        } else {
            log.info('Keine gespeicherte Session gefunden oder Session-Datei leer');
        }
    })().catch(err => log.error('Restore FEHLGESCHLAGEN:', err));

    // Renderer calls this to check for restored session data
    // Awaits the loading promise to guarantee data is ready (no race condition)
    ipcMain.handle('get-restored-session', async () => {
        await sessionLoadPromise;
        const data = restoredSessions;
        const ui = restoredUiState;
        const action = pendingActionResult;
        restoredSessions = null; // one-time read
        restoredUiState = null;
        pendingActionResult = null;
        const result = data ? { sessions: data, ui } : null;
        // Attach pending action result if available
        if (action && result) {
            result.pendingAction = action;
        } else if (action) {
            return { sessions: null, ui: null, pendingAction: action };
        }
        return result;
    });

    // === File Tags ===
    const { app } = require('electron');

    ipcMain.handle('get-tag-colors', async () => {
        const { TAG_COLORS } = require('./file-tags');
        return TAG_COLORS;
    });

    ipcMain.handle('set-file-tag', async (_event, filePath, color, note) => {
        if (!app._tagStore) return { success: false, error: 'Tags nicht initialisiert' };
        return app._tagStore.setTag(filePath, color, note || '');
    });

    ipcMain.handle('remove-file-tag', async (_event, filePath) => {
        if (!app._tagStore) return { success: false, error: 'Tags nicht initialisiert' };
        return app._tagStore.removeTag(filePath);
    });

    ipcMain.handle('get-file-tag', async (_event, filePath) => {
        if (!app._tagStore) return null;
        return app._tagStore.getTag(filePath);
    });

    ipcMain.handle('get-tags-for-directory', async (_event, dirPath) => {
        if (!app._tagStore) return {};
        return app._tagStore.getTagsInDirectory(dirPath);
    });

    ipcMain.handle('get-all-tags', async () => {
        if (!app._tagStore) return [];
        return app._tagStore.getAllTags();
    });

    // === Shell Integration (Context Menu) ===
    ipcMain.handle('register-shell-context-menu', async () => {
        const { registerContextMenu } = require('./shell-integration');
        return registerContextMenu();
    });

    ipcMain.handle('unregister-shell-context-menu', async () => {
        const { unregisterContextMenu } = require('./shell-integration');
        return unregisterContextMenu();
    });

    ipcMain.handle('is-shell-context-menu-registered', async () => {
        const { isContextMenuRegistered } = require('./shell-integration');
        return isContextMenuRegistered();
    });

    // === Terminal ===
    const terminal = require('./terminal');

    ipcMain.handle('terminal-get-shells', async () => {
        return terminal.getAvailableShells();
    });

    ipcMain.handle('terminal-create', async (_event, cwd, shellType, cols, rows) => {
        const { id, pty: ptyProcess } = terminal.createSession(cwd, shellType || 'powershell', cols || 80, rows || 24);

        ptyProcess.onData((data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-data', { id, data });
            }
        });
        ptyProcess.onExit(({ exitCode }) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-exit', { id, code: exitCode });
            }
        });

        return { id };
    });

    ipcMain.handle('terminal-write', async (_event, id, data) => {
        return terminal.writeToSession(id, data);
    });

    ipcMain.handle('terminal-resize', async (_event, id, cols, rows) => {
        terminal.resizeSession(id, cols, rows);
        return { success: true };
    });

    ipcMain.handle('terminal-destroy', async (_event, id) => {
        terminal.destroySession(id);
        return { success: true };
    });

    // === Privacy Dashboard ===
    ipcMain.handle('get-privacy-settings', async () => {
        const privacy = require('./privacy');
        return privacy.getPrivacySettings();
    });

    ipcMain.handle('apply-privacy-setting', async (_event, id) => {
        const privacy = require('./privacy');
        return privacy.applyPrivacySetting(id);
    });

    ipcMain.handle('apply-all-privacy', async () => {
        const privacy = require('./privacy');
        return privacy.applyAllPrivacy();
    });

    ipcMain.handle('reset-privacy-setting', async (_event, id) => {
        const privacy = require('./privacy');
        return privacy.resetPrivacySetting(id);
    });

    ipcMain.handle('reset-all-privacy', async () => {
        const privacy = require('./privacy');
        return privacy.resetAllPrivacy();
    });

    ipcMain.handle('get-scheduled-tasks-audit', async () => {
        const privacy = require('./privacy');
        return privacy.getScheduledTasksAudit();
    });

    ipcMain.handle('disable-scheduled-task', async (_event, taskPath) => {
        const privacy = require('./privacy');
        return privacy.disableScheduledTask(taskPath);
    });

    ipcMain.handle('check-sideloading', async () => {
        const privacy = require('./privacy');
        return privacy.checkSideloading();
    });

    ipcMain.handle('fix-sideloading', async () => {
        const privacy = require('./privacy');
        return privacy.fixSideloading();
    });

    ipcMain.handle('fix-sideloading-with-elevation', async () => {
        // Erst prüfen ob wir bereits Admin sind
        if (await admin.isAdmin()) {
            const privacy = require('./privacy');
            return privacy.fixSideloading();
        }
        // Nicht Admin → Neustart mit Admin-Rechten + Pending-Action
        try {
            await admin.restartAsAdmin(scans, 'fix-sideloading');
            return { success: true, restarting: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-privacy-recommendations', async () => {
        try {
            const privacy = require('./privacy');
            const audit = require('./software-audit');
            // Erst installierte Programme ermitteln, dann Korrelation berechnen
            const auditResult = await audit.auditAll();
            if (auditResult?.error) return { error: auditResult.error };
            // auditAll() gibt {programs: Array, orphanedCount, totalPrograms, totalSizeKB} zurück
            const programList = auditResult.programs || [];
            const recommendations = privacy.getSmartRecommendations(programList);
            return { recommendations, programCount: programList.length };
        } catch (err) {
            log.error('Recommendations-Fehler:', err.message);
            return { error: err.message };
        }
    });

    // === S.M.A.R.T. Disk Health ===
    ipcMain.handle('get-disk-health', async () => {
        const smart = require('./smart');
        return smart.getDiskHealth();
    });

    // === Software Audit ===
    ipcMain.handle('audit-software', async () => {
        const audit = require('./software-audit');
        return audit.auditAll();
    });

    ipcMain.handle('correlate-software', async (_event, program) => {
        const audit = require('./software-audit');
        return audit.correlateProgram(program);
    });

    ipcMain.handle('check-audit-updates', async () => {
        const audit = require('./software-audit');
        const auditResult = await audit.auditAll();
        if (!auditResult?.programs) return { available: false, error: 'Keine Programmdaten' };
        return audit.checkUpdatesForPrograms(auditResult.programs);
    });

    // === Network Monitor ===
    ipcMain.handle('get-connections', async () => {
        const network = require('./network');
        return network.getConnections();
    });

    ipcMain.handle('get-bandwidth', async () => {
        const network = require('./network');
        return network.getBandwidth();
    });

    ipcMain.handle('get-firewall-rules', async (_event, direction) => {
        const network = require('./network');
        return network.getFirewallRules(direction);
    });

    ipcMain.handle('block-process', async (_event, processName, processPath) => {
        const network = require('./network');
        return network.blockProcess(processName, processPath);
    });

    ipcMain.handle('unblock-process', async (_event, ruleName) => {
        const network = require('./network');
        return network.unblockProcess(ruleName);
    });

    ipcMain.handle('get-network-summary', async () => {
        const network = require('./network');
        return network.getNetworkSummary();
    });

    ipcMain.handle('get-grouped-connections', async () => {
        const network = require('./network');
        return network.getGroupedConnections();
    });

    ipcMain.handle('resolve-ips', async (_event, ipAddresses) => {
        const network = require('./network');
        return network.resolveIPs(ipAddresses);
    });

    // === System Info ===
    ipcMain.handle('get-system-info', async () => {
        const os = require('os');
        return {
            computerName: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
        };
    });

    // === Security Audit ===
    ipcMain.handle('run-security-audit', async () => {
        const { runSecurityAudit } = require('./security-audit');
        return runSecurityAudit();
    });

    ipcMain.handle('get-audit-history', async () => {
        const { getAuditHistory } = require('./security-audit');
        return getAuditHistory();
    });

    // === Network Scanner (Geräte-Erkennung) ===
    ipcMain.handle('scan-local-network', async () => {
        const { scanLocalNetwork } = require('./network-scanner');
        return scanLocalNetwork();
    });

    // === System Score ===
    ipcMain.handle('get-system-score', async (_event, results) => {
        const { calculateSystemScore } = require('./system-score');
        return calculateSystemScore(results);
    });

    // === Global Hotkey ===
    ipcMain.handle('set-global-hotkey', async (_event, accelerator) => {
        const { registerGlobalHotkey } = require('./global-hotkey');
        return registerGlobalHotkey(mainWindow, accelerator);
    });

    ipcMain.handle('get-global-hotkey', async () => {
        const { getRegisteredHotkey } = require('./global-hotkey');
        return getRegisteredHotkey();
    });

    // === Preferences ===
    ipcMain.handle('get-preferences', async () => {
        return preferences.getAll();
    });

    ipcMain.handle('set-preference', async (_event, key, value) => {
        return preferences.set(key, value);
    });

    ipcMain.handle('set-preferences-multiple', async (_event, entries) => {
        return preferences.setMultiple(entries);
    });

    // === Session Management ===
    ipcMain.handle('get-session-info', async () => {
        return session.getSessionInfo();
    });

    ipcMain.handle('save-session-now', async (_event, uiState) => {
        try {
            const saved = await session.saveSession(scans, uiState || lastKnownUiState);
            return { success: saved };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // === UI State (pushed from renderer for session persistence) ===
    ipcMain.handle('update-ui-state', async (_event, uiState) => {
        lastKnownUiState = uiState || {};
        return { success: true };
    });

    // Cleanup on app quit: save session, then terminate workers and release memory
    app.on('before-quit', () => {
        // 1. Flush preferences (synchron, sicherstellt dass alles gespeichert ist)
        preferences.flush();

        // 2. Session speichern (synchron via gzipSync, da before-quit nicht async wartet)
        log.info(`before-quit: sessionSaveOnClose=${preferences.get('sessionSaveOnClose')}, scans.size=${scans.size}`);
        if (preferences.get('sessionSaveOnClose') && scans.size > 0) {
            try {
                const zlib = require('zlib');
                const fss = require('fs');
                const pathm = require('path');
                const SESSION_DIR = pathm.join(process.env.APPDATA || process.env.HOME || '.', 'speicher-analyse');
                const SESSION_FILE = pathm.join(SESSION_DIR, 'session.json.gz');

                const sessions = [];
                for (const [scanId, scanner] of scans) {
                    if (!scanner.isComplete) continue;
                    sessions.push({
                        scanId,
                        rootPath: scanner.rootPath,
                        totalSize: scanner.totalSize,
                        dirsScanned: scanner.dirsScanned,
                        filesFound: scanner.filesFound,
                        errorsCount: scanner.errorsCount,
                        tree: [...scanner.tree.entries()],
                        topFiles: scanner.topFiles,
                        extensionStats: [...scanner.extensionStats.entries()],
                        dirFiles: scanner.dirFiles ? [...scanner.dirFiles.entries()] : null,
                    });
                }

                if (sessions.length > 0) {
                    if (!fss.existsSync(SESSION_DIR)) fss.mkdirSync(SESSION_DIR, { recursive: true });
                    const payload = { version: 1, savedAt: new Date().toISOString(), ui: lastKnownUiState, scans: sessions };
                    const json = JSON.stringify(payload);
                    const compressed = zlib.gzipSync(json);
                    fss.writeFileSync(SESSION_FILE, compressed);
                    // Verify file was written
                    const fileSize = fss.statSync(SESSION_FILE).size;
                    for (const s of sessions) {
                        log.info(`Session gesichert: ${s.rootPath} — ${s.dirsScanned} Ordner, ${s.filesFound} Dateien, tree=${s.tree.length}, dirFiles=${s.dirFiles ? s.dirFiles.length + ' Ordner' : 'WARNUNG:null'} → ${(fileSize / 1024).toFixed(0)} KB komprimiert`);
                        if (!s.dirFiles) log.warn('dirFiles ist null — Duplikate, Suche und Dateityp-Details werden nach Neustart nicht funktionieren!');
                    }
                } else {
                    log.info('before-quit: Keine abgeschlossenen Scans zum Speichern');
                }
            } catch (err) {
                log.error('Session-Save beim Beenden fehlgeschlagen:', err.message);
            }
        }

        // 3. Workers terminieren + Speicher freigeben
        for (const [id, scanner] of scans) {
            if (scanner.worker) {
                try { scanner.worker.terminate(); } catch {}
            }
        }
        scans.clear();
        for (const [id, finder] of duplicateFinders) {
            try { finder.cancel(); } catch {}
        }
        duplicateFinders.clear();
        terminal.destroyAllSessions();
        for (const [, worker] of deepSearchWorkers) {
            try { worker.terminate(); } catch {}
        }
        deepSearchWorkers.clear();
    });
}

module.exports = { register, preferences };

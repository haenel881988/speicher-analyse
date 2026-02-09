const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // === Drive & Scan ===
    getDrives: () => ipcRenderer.invoke('get-drives'),
    startScan: (path) => ipcRenderer.invoke('start-scan', path),
    onScanProgress: (callback) => {
        ipcRenderer.removeAllListeners('scan-progress');
        ipcRenderer.on('scan-progress', (_e, data) => callback(data));
    },
    onScanComplete: (callback) => {
        ipcRenderer.removeAllListeners('scan-complete');
        ipcRenderer.on('scan-complete', (_e, data) => callback(data));
    },
    onScanError: (callback) => {
        ipcRenderer.removeAllListeners('scan-error');
        ipcRenderer.on('scan-error', (_e, data) => callback(data));
    },

    // === Tree Data ===
    getTreeNode: (scanId, path, depth) => ipcRenderer.invoke('get-tree-node', scanId, path, depth),
    getTreemapData: (scanId, path, depth) => ipcRenderer.invoke('get-treemap-data', scanId, path, depth),

    // === File Data ===
    getTopFiles: (scanId, limit) => ipcRenderer.invoke('get-top-files', scanId, limit),
    getFileTypes: (scanId) => ipcRenderer.invoke('get-file-types', scanId),
    search: (scanId, query, minSize) => ipcRenderer.invoke('search', scanId, query, minSize),
    getFilesByExtension: (scanId, ext, limit) => ipcRenderer.invoke('get-files-by-extension', scanId, ext, limit),
    getFilesByCategory: (scanId, category, limit) => ipcRenderer.invoke('get-files-by-category', scanId, category, limit),

    // === Export ===
    exportCSV: (scanId) => ipcRenderer.invoke('export-csv', scanId),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

    // === File Management ===
    deleteToTrash: (paths) => ipcRenderer.invoke('file-delete-trash', paths),
    deletePermanent: (paths) => ipcRenderer.invoke('file-delete-permanent', paths),
    createFolder: (parentPath, name) => ipcRenderer.invoke('file-create-folder', parentPath, name),
    rename: (oldPath, newName) => ipcRenderer.invoke('file-rename', oldPath, newName),
    move: (sourcePaths, destDir) => ipcRenderer.invoke('file-move', sourcePaths, destDir),
    copy: (sourcePaths, destDir) => ipcRenderer.invoke('file-copy', sourcePaths, destDir),
    getProperties: (filePath) => ipcRenderer.invoke('file-properties', filePath),
    openFile: (filePath) => ipcRenderer.invoke('file-open', filePath),
    showInExplorer: (filePath) => ipcRenderer.invoke('file-show-in-explorer', filePath),

    // === Context Menu ===
    showContextMenu: (menuType, context) => ipcRenderer.invoke('show-context-menu', menuType, context),
    onContextMenuAction: (callback) => {
        ipcRenderer.removeAllListeners('context-menu-action');
        ipcRenderer.on('context-menu-action', (_e, action) => callback(action));
    },

    // === File Op Progress ===
    onFileOpProgress: (callback) => {
        ipcRenderer.removeAllListeners('file-op-progress');
        ipcRenderer.on('file-op-progress', (_e, data) => callback(data));
    },

    // === Dialog ===
    showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),

    // === Old Files ===
    getOldFiles: (scanId, thresholdDays, minSize) => ipcRenderer.invoke('get-old-files', scanId, thresholdDays, minSize),

    // === Duplicate Finder ===
    startDuplicateScan: (scanId, options) => ipcRenderer.invoke('start-duplicate-scan', scanId, options),
    cancelDuplicateScan: (scanId) => ipcRenderer.invoke('cancel-duplicate-scan', scanId),
    onDuplicateProgress: (callback) => {
        ipcRenderer.removeAllListeners('duplicate-progress');
        ipcRenderer.on('duplicate-progress', (_e, data) => callback(data));
    },
    onDuplicateComplete: (callback) => {
        ipcRenderer.removeAllListeners('duplicate-complete');
        ipcRenderer.on('duplicate-complete', (_e, data) => callback(data));
    },

    // === Size Duplicates (pre-scan) ===
    getSizeDuplicates: (scanId, minSize) => ipcRenderer.invoke('get-size-duplicates', scanId, minSize),

    // === Memory management ===
    releaseScanBulkData: (scanId) => ipcRenderer.invoke('release-scan-bulk-data', scanId),

    // === Cleanup ===
    scanCleanupCategories: (scanId) => ipcRenderer.invoke('scan-cleanup-categories', scanId),
    cleanCategory: (categoryId, paths) => ipcRenderer.invoke('clean-category', categoryId, paths),

    // === Scan Compare ===
    saveScan: (scanId) => ipcRenderer.invoke('save-scan', scanId),
    compareScan: (scanId) => ipcRenderer.invoke('compare-scan', scanId),

    // === Preview ===
    readFilePreview: (filePath, maxLines) => ipcRenderer.invoke('read-file-preview', filePath, maxLines),

    // === Registry ===
    scanRegistry: () => ipcRenderer.invoke('scan-registry'),
    exportRegistryBackup: (entries) => ipcRenderer.invoke('export-registry-backup', entries),
    cleanRegistry: (entries) => ipcRenderer.invoke('clean-registry', entries),
    restoreRegistryBackup: () => ipcRenderer.invoke('restore-registry-backup'),

    // === Autostart ===
    getAutoStartEntries: () => ipcRenderer.invoke('get-autostart-entries'),
    toggleAutoStart: (entry, enabled) => ipcRenderer.invoke('toggle-autostart', entry, enabled),
    deleteAutoStart: (entry) => ipcRenderer.invoke('delete-autostart', entry),

    // === Services ===
    getServices: () => ipcRenderer.invoke('get-services'),
    controlService: (name, action) => ipcRenderer.invoke('control-service', name, action),
    setServiceStartType: (name, startType) => ipcRenderer.invoke('set-service-start-type', name, startType),

    // === Optimizer ===
    getOptimizations: () => ipcRenderer.invoke('get-optimizations'),
    applyOptimization: (id) => ipcRenderer.invoke('apply-optimization', id),

    // === Bloatware ===
    scanBloatware: () => ipcRenderer.invoke('scan-bloatware'),
    uninstallBloatware: (entry) => ipcRenderer.invoke('uninstall-bloatware', entry),

    // === Updates ===
    checkWindowsUpdates: () => ipcRenderer.invoke('check-windows-updates'),
    getUpdateHistory: () => ipcRenderer.invoke('get-update-history'),
    checkSoftwareUpdates: () => ipcRenderer.invoke('check-software-updates'),
    updateSoftware: (packageId) => ipcRenderer.invoke('update-software', packageId),
    getDriverInfo: () => ipcRenderer.invoke('get-driver-info'),
    getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),

    // === Explorer ===
    listDirectory: (dirPath, maxEntries) => ipcRenderer.invoke('explorer-list-directory', dirPath, maxEntries),
    getKnownFolders: () => ipcRenderer.invoke('explorer-get-known-folders'),
    calculateFolderSize: (dirPath) => ipcRenderer.invoke('explorer-calculate-folder-size', dirPath),
    findEmptyFolders: (dirPath, maxDepth) => ipcRenderer.invoke('explorer-find-empty-folders', dirPath, maxDepth),
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
    openInTerminal: (dirPath) => ipcRenderer.invoke('open-in-terminal', dirPath),
    openWithDialog: (filePath) => ipcRenderer.invoke('open-with-dialog', filePath),

    // === Admin ===
    isAdmin: () => ipcRenderer.invoke('is-admin'),
    restartAsAdmin: () => ipcRenderer.invoke('restart-as-admin'),
    getRestoredSession: () => ipcRenderer.invoke('get-restored-session'),

    // === Platform ===
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});

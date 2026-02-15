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
    onDuplicateError: (callback) => {
        ipcRenderer.removeAllListeners('duplicate-error');
        ipcRenderer.on('duplicate-error', (_e, data) => callback(data));
    },

    // === Size Duplicates (pre-scan) ===
    getSizeDuplicates: (scanId, minSize) => ipcRenderer.invoke('get-size-duplicates', scanId, minSize),

    // === Memory management ===
    releaseScanBulkData: (scanId) => ipcRenderer.invoke('release-scan-bulk-data', scanId),

    // === Cleanup ===
    scanCleanupCategories: (scanId) => ipcRenderer.invoke('scan-cleanup-categories', scanId),
    cleanCategory: (categoryId, paths) => ipcRenderer.invoke('clean-category', categoryId, paths),

    // === Preview ===
    readFilePreview: (filePath, maxLines) => ipcRenderer.invoke('read-file-preview', filePath, maxLines),

    // === Editor ===
    readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),
    writeFileContent: (filePath, content) => ipcRenderer.invoke('write-file-content', filePath, content),
    readFileBinary: (filePath) => ipcRenderer.invoke('read-file-binary', filePath),

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

    // === Hybrid Search ===
    searchNameIndex: (scanId, query, options) => ipcRenderer.invoke('search-name-index', scanId, query, options),
    getNameIndexInfo: (scanId) => ipcRenderer.invoke('get-name-index-info', scanId),
    deepSearchStart: (rootPath, query, useRegex) => ipcRenderer.invoke('deep-search-start', rootPath, query, useRegex),
    deepSearchCancel: () => ipcRenderer.invoke('deep-search-cancel'),
    onDeepSearchResult: (callback) => {
        ipcRenderer.removeAllListeners('deep-search-result');
        ipcRenderer.on('deep-search-result', (_e, data) => callback(data));
    },
    onDeepSearchProgress: (callback) => {
        ipcRenderer.removeAllListeners('deep-search-progress');
        ipcRenderer.on('deep-search-progress', (_e, data) => callback(data));
    },
    onDeepSearchComplete: (callback) => {
        ipcRenderer.removeAllListeners('deep-search-complete');
        ipcRenderer.on('deep-search-complete', (_e, data) => callback(data));
    },
    onDeepSearchError: (callback) => {
        ipcRenderer.removeAllListeners('deep-search-error');
        ipcRenderer.on('deep-search-error', (_e, data) => callback(data));
    },

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

    // === System ===
    getSystemCapabilities: () => ipcRenderer.invoke('get-system-capabilities'),
    getBatteryStatus: () => ipcRenderer.invoke('get-battery-status'),

    // === Platform ===
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // === File Tags ===
    getTagColors: () => ipcRenderer.invoke('get-tag-colors'),
    setFileTag: (filePath, color, note) => ipcRenderer.invoke('set-file-tag', filePath, color, note),
    removeFileTag: (filePath) => ipcRenderer.invoke('remove-file-tag', filePath),
    getFileTag: (filePath) => ipcRenderer.invoke('get-file-tag', filePath),
    getTagsForDirectory: (dirPath) => ipcRenderer.invoke('get-tags-for-directory', dirPath),
    getAllTags: () => ipcRenderer.invoke('get-all-tags'),

    // === Shell Integration ===
    registerShellContextMenu: () => ipcRenderer.invoke('register-shell-context-menu'),
    unregisterShellContextMenu: () => ipcRenderer.invoke('unregister-shell-context-menu'),
    isShellContextMenuRegistered: () => ipcRenderer.invoke('is-shell-context-menu-registered'),

    // === Global Hotkey ===
    setGlobalHotkey: (accelerator) => ipcRenderer.invoke('set-global-hotkey', accelerator),
    getGlobalHotkey: () => ipcRenderer.invoke('get-global-hotkey'),

    // === Terminal ===
    terminalGetShells: () => ipcRenderer.invoke('terminal-get-shells'),
    terminalCreate: (cwd, shellType, cols, rows) => ipcRenderer.invoke('terminal-create', cwd, shellType, cols, rows),
    terminalWrite: (id, data) => ipcRenderer.invoke('terminal-write', id, data),
    terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal-resize', id, cols, rows),
    terminalDestroy: (id) => ipcRenderer.invoke('terminal-destroy', id),
    terminalOpenExternal: (cwd, command) => ipcRenderer.invoke('terminal-open-external', cwd, command),
    onTerminalData: (callback) => {
        ipcRenderer.removeAllListeners('terminal-data');
        ipcRenderer.on('terminal-data', (_e, data) => callback(data));
    },
    onTerminalExit: (callback) => {
        ipcRenderer.removeAllListeners('terminal-exit');
        ipcRenderer.on('terminal-exit', (_e, data) => callback(data));
    },
    onOpenEmbeddedTerminal: (callback) => {
        ipcRenderer.removeAllListeners('open-embedded-terminal');
        ipcRenderer.on('open-embedded-terminal', (_e, data) => callback(data));
    },

    // === Privacy Dashboard ===
    getPrivacySettings: () => ipcRenderer.invoke('get-privacy-settings'),
    applyPrivacySetting: (id) => ipcRenderer.invoke('apply-privacy-setting', id),
    applyAllPrivacy: () => ipcRenderer.invoke('apply-all-privacy'),
    resetPrivacySetting: (id) => ipcRenderer.invoke('reset-privacy-setting', id),
    resetAllPrivacy: () => ipcRenderer.invoke('reset-all-privacy'),
    getScheduledTasksAudit: () => ipcRenderer.invoke('get-scheduled-tasks-audit'),
    disableScheduledTask: (taskPath) => ipcRenderer.invoke('disable-scheduled-task', taskPath),
    checkSideloading: () => ipcRenderer.invoke('check-sideloading'),
    fixSideloading: () => ipcRenderer.invoke('fix-sideloading'),
    fixSideloadingWithElevation: () => ipcRenderer.invoke('fix-sideloading-with-elevation'),
    getPrivacyRecommendations: () => ipcRenderer.invoke('get-privacy-recommendations'),

    // === System-Profil ===
    getSystemProfile: () => ipcRenderer.invoke('get-system-profile'),

    // === S.M.A.R.T. Disk Health ===
    getDiskHealth: () => ipcRenderer.invoke('get-disk-health'),

    // === Software Audit ===
    auditSoftware: () => ipcRenderer.invoke('audit-software'),
    correlateSoftware: (program) => ipcRenderer.invoke('correlate-software', program),
    checkAuditUpdates: () => ipcRenderer.invoke('check-audit-updates'),

    // === Network Monitor ===
    getConnections: () => ipcRenderer.invoke('get-connections'),
    getBandwidth: () => ipcRenderer.invoke('get-bandwidth'),
    getFirewallRules: (direction) => ipcRenderer.invoke('get-firewall-rules', direction),
    blockProcess: (name, path) => ipcRenderer.invoke('block-process', name, path),
    unblockProcess: (ruleName) => ipcRenderer.invoke('unblock-process', ruleName),
    getNetworkSummary: () => ipcRenderer.invoke('get-network-summary'),
    getGroupedConnections: () => ipcRenderer.invoke('get-grouped-connections'),
    resolveIPs: (ipAddresses) => ipcRenderer.invoke('resolve-ips', ipAddresses),
    getPollingData: () => ipcRenderer.invoke('get-polling-data'),
    getConnectionDiff: () => ipcRenderer.invoke('get-connection-diff'),
    isNpcapInstalled: () => ipcRenderer.invoke('is-npcap-installed'),
    startNetworkRecording: () => ipcRenderer.invoke('start-network-recording'),
    stopNetworkRecording: () => ipcRenderer.invoke('stop-network-recording'),
    getNetworkRecordingStatus: () => ipcRenderer.invoke('get-network-recording-status'),
    appendNetworkRecordingEvents: (events) => ipcRenderer.invoke('append-network-recording-events', events),
    listNetworkRecordings: () => ipcRenderer.invoke('list-network-recordings'),
    deleteNetworkRecording: (filename) => ipcRenderer.invoke('delete-network-recording', filename),
    openNetworkRecordingsDir: () => ipcRenderer.invoke('open-network-recordings-dir'),
    saveNetworkSnapshot: (data) => ipcRenderer.invoke('save-network-snapshot', data),
    getNetworkHistory: () => ipcRenderer.invoke('get-network-history'),
    clearNetworkHistory: () => ipcRenderer.invoke('clear-network-history'),
    exportNetworkHistory: (format) => ipcRenderer.invoke('export-network-history', format),
    scanLocalNetwork: () => ipcRenderer.invoke('scan-local-network'),
    scanNetworkActive: () => ipcRenderer.invoke('scan-network-active'),
    getLastNetworkScan: () => ipcRenderer.invoke('get-last-network-scan'),
    scanDevicePorts: (ip) => ipcRenderer.invoke('scan-device-ports', ip),
    getSMBShares: (ip) => ipcRenderer.invoke('get-smb-shares', ip),
    onNetworkScanProgress: (callback) => {
        ipcRenderer.removeAllListeners('network-scan-progress');
        ipcRenderer.on('network-scan-progress', (_event, data) => callback(data));
    },

    // === System Info ===
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

    // === Security Audit ===
    runSecurityAudit: () => ipcRenderer.invoke('run-security-audit'),
    getAuditHistory: () => ipcRenderer.invoke('get-audit-history'),

    // === System Score ===
    getSystemScore: (results) => ipcRenderer.invoke('get-system-score', results),

    // === Preferences ===
    getPreferences: () => ipcRenderer.invoke('get-preferences'),
    setPreference: (key, value) => ipcRenderer.invoke('set-preference', key, value),
    setPreferencesMultiple: (entries) => ipcRenderer.invoke('set-preferences-multiple', entries),

    // === Session ===
    getSessionInfo: () => ipcRenderer.invoke('get-session-info'),
    saveSessionNow: (uiState) => ipcRenderer.invoke('save-session-now', uiState),
    updateUiState: (uiState) => ipcRenderer.invoke('update-ui-state', uiState),

    // === Folder Sizes (Explorer enrichment from scan data) ===
    getFolderSizesBulk: (scanId, folderPaths, parentPath) => ipcRenderer.invoke('get-folder-sizes-bulk', scanId, folderPaths, parentPath),

    // === Terminal Menu Actions (from menu bar) ===
    onToggleTerminal: (callback) => {
        ipcRenderer.removeAllListeners('toggle-terminal');
        ipcRenderer.on('toggle-terminal', () => callback());
    },
    onNewTerminal: (callback) => {
        ipcRenderer.removeAllListeners('new-terminal');
        ipcRenderer.on('new-terminal', () => callback());
    },

    // === Tray Actions (received from main) ===
    onTrayAction: (callback) => {
        ipcRenderer.removeAllListeners('tray-action');
        ipcRenderer.on('tray-action', (_e, action) => callback(action));
    },
    onOpenFolder: (callback) => {
        ipcRenderer.removeAllListeners('open-folder');
        ipcRenderer.on('open-folder', (_e, folderPath) => callback(folderPath));
    },

    // === Screenshot (für Puppeteer/WCAG-Tests) ===
    captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
});

/**
 * Tauri Bridge — Maps window.api.* to Tauri invoke() calls.
 * Loaded BEFORE app.js via <script> tag in index.html.
 */
(function() {
    // Detect if we're running in Tauri
    if (!window.__TAURI__ || window.api) return;

    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;

    // snake_case → camelCase (Tauri v2 expects camelCase for Rust snake_case params)
    function toCamel(s) {
        return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    }

    // Helper: create invoke wrapper with named parameters
    function makeInvoke(cmd, ...paramNames) {
        return function (...args) {
            const params = {};
            paramNames.forEach((name, i) => {
                if (i < args.length && args[i] !== undefined) {
                    params[toCamel(name)] = args[i];
                }
            });
            return invoke(cmd, params);
        };
    }

    // Helper: create event listener wrapper
    // Stores unlisten promises to prevent race conditions with rapid re-registration
    if (!makeListener._unlisteners) makeListener._unlisteners = {};
    if (!makeListener._pendingListens) makeListener._pendingListens = {};
    function makeListener(eventName) {
        return function (callback) {
            // Unlisten previous listener if any (sync stored)
            if (makeListener._unlisteners[eventName]) {
                makeListener._unlisteners[eventName]();
                delete makeListener._unlisteners[eventName];
            }
            // Also wait for any pending listen() to resolve and unlisten it
            const pending = makeListener._pendingListens[eventName];
            if (pending) {
                pending.then(unlisten => { if (unlisten) unlisten(); });
            }
            const listenPromise = listen(eventName, (event) => callback(event.payload));
            makeListener._pendingListens[eventName] = listenPromise;
            listenPromise.then(unlisten => {
                // Only store if this is still the current listener for this event
                if (makeListener._pendingListens[eventName] === listenPromise) {
                    makeListener._unlisteners[eventName] = unlisten;
                } else {
                    // A newer listener was registered — unlisten this one
                    unlisten();
                }
            });
        };
    }

    window.api = {
        // === Drive & Scan ===
        getDrives: makeInvoke('get_drives'),
        startScan: makeInvoke('start_scan', 'path'),
        onScanProgress: makeListener('scan-progress'),
        onScanComplete: makeListener('scan-complete'),
        onScanError: makeListener('scan-error'),

        // === Tree Data ===
        getTreeNode: makeInvoke('get_tree_node', 'scan_id', 'path', 'depth'),
        getTreemapData: makeInvoke('get_treemap_data', 'scan_id', 'path', 'depth'),

        // === File Data ===
        getTopFiles: makeInvoke('get_top_files', 'scan_id', 'limit'),
        getFileTypes: makeInvoke('get_file_types', 'scan_id'),
        search: makeInvoke('search', 'scan_id', 'query', 'min_size'),
        getFilesByExtension: makeInvoke('get_files_by_extension', 'scan_id', 'ext', 'limit'),
        getFilesByCategory: makeInvoke('get_files_by_category', 'scan_id', 'category', 'limit'),

        // === Export ===
        exportCSV: makeInvoke('export_csv', 'scan_id'),
        showSaveDialog: makeInvoke('show_save_dialog', 'options'),

        // === File Management ===
        deleteToTrash: makeInvoke('delete_to_trash', 'paths'),
        deletePermanent: makeInvoke('delete_permanent', 'paths'),
        createFolder: makeInvoke('create_folder', 'parent_path', 'name'),
        rename: makeInvoke('file_rename', 'old_path', 'new_name'),
        move: makeInvoke('file_move', 'source_paths', 'dest_dir'),
        copy: makeInvoke('file_copy', 'source_paths', 'dest_dir'),
        getProperties: makeInvoke('file_properties', 'file_path'),
        getPropertiesGeneral: makeInvoke('file_properties_general', 'file_path'),
        getPropertiesSecurity: makeInvoke('file_properties_security', 'file_path'),
        getPropertiesDetails: makeInvoke('file_properties_details', 'file_path'),
        getPropertiesVersions: makeInvoke('file_properties_versions', 'file_path'),
        getPropertiesHash: makeInvoke('file_properties_hash', 'file_path', 'algorithm'),
        openFile: makeInvoke('open_file', 'file_path'),
        showInExplorer: makeInvoke('show_in_explorer', 'file_path'),
        runAsAdmin: makeInvoke('run_as_admin', 'file_path'),
        extractArchive: makeInvoke('extract_archive', 'archive_path', 'dest_dir'),
        createArchive: makeInvoke('create_archive', 'source_paths', 'dest_path'),

        // === Context Menu ===
        showContextMenu: makeInvoke('show_context_menu', 'menu_type', 'context'),
        onContextMenuAction: makeListener('context-menu-action'),

        // === Dialog ===
        showConfirmDialog: makeInvoke('show_confirm_dialog', 'options'),

        // === Old Files ===
        getOldFiles: makeInvoke('get_old_files', 'scan_id', 'threshold_days', 'min_size'),

        // === Duplicate Finder ===
        startDuplicateScan: makeInvoke('start_duplicate_scan', 'scan_id', 'options'),
        cancelDuplicateScan: makeInvoke('cancel_duplicate_scan', 'scan_id'),
        onDuplicateProgress: makeListener('duplicate-progress'),
        onDuplicateComplete: makeListener('duplicate-complete'),
        onDuplicateError: makeListener('duplicate-error'),

        // === Size Duplicates ===
        getSizeDuplicates: makeInvoke('get_size_duplicates', 'scan_id', 'min_size'),

        // === Memory ===
        releaseScanBulkData: makeInvoke('release_scan_bulk_data', 'scan_id'),

        // === Cleanup ===
        scanCleanupCategories: makeInvoke('scan_cleanup_categories', 'scan_id'),
        cleanCategory: makeInvoke('clean_category', 'category_id', 'paths'),

        // === Preview ===
        readFilePreview: makeInvoke('read_file_preview', 'file_path', 'max_lines'),

        // === Editor ===
        readFileContent: makeInvoke('read_file_content', 'file_path'),
        writeFileContent: makeInvoke('write_file_content', 'file_path', 'content'),
        readFileBinary: makeInvoke('read_file_binary', 'file_path'),

        // === Autostart ===
        getAutoStartEntries: makeInvoke('get_autostart_entries'),
        toggleAutoStart: makeInvoke('toggle_autostart', 'entry', 'enabled'),
        deleteAutoStart: makeInvoke('delete_autostart', 'entry'),

        // === Services ===
        getServices: makeInvoke('get_services'),
        controlService: makeInvoke('control_service', 'name', 'action'),
        setServiceStartType: makeInvoke('set_service_start_type', 'name', 'start_type'),

        // === Optimizer ===
        getOptimizations: makeInvoke('get_optimizations'),
        applyOptimization: makeInvoke('apply_optimization', 'id'),

        // === Updates ===
        checkWindowsUpdates: makeInvoke('check_windows_updates'),
        getUpdateHistory: makeInvoke('get_update_history'),
        checkSoftwareUpdates: makeInvoke('check_software_updates'),
        updateSoftware: makeInvoke('update_software', 'package_id'),
        getDriverInfo: makeInvoke('get_driver_info'),
        getHardwareInfo: makeInvoke('get_hardware_info'),

        // === Hybrid Search ===
        searchNameIndex: makeInvoke('search_name_index', 'scan_id', 'query', 'options'),
        getNameIndexInfo: makeInvoke('get_name_index_info', 'scan_id'),
        deepSearchStart: makeInvoke('deep_search_start', 'root_path', 'query', 'use_regex'),
        deepSearchCancel: makeInvoke('deep_search_cancel'),
        onDeepSearchResult: makeListener('deep-search-result'),
        onDeepSearchComplete: makeListener('deep-search-complete'),
        onDeepSearchError: makeListener('deep-search-error'),

        // === Explorer ===
        listDirectory: makeInvoke('list_directory', 'dir_path', 'max_entries'),
        getKnownFolders: makeInvoke('get_known_folders'),
        calculateFolderSize: makeInvoke('calculate_folder_size', 'dir_path'),
        findEmptyFolders: makeInvoke('find_empty_folders', 'dir_path', 'max_depth'),
        copyToClipboard: makeInvoke('copy_to_clipboard', 'text'),
        openInTerminal: makeInvoke('open_in_terminal', 'dir_path'),
        openWithDialog: makeInvoke('open_with_dialog', 'file_path'),

        // === Admin ===
        isAdmin: makeInvoke('is_admin'),
        restartAsAdmin: makeInvoke('restart_as_admin'),
        getRestoredSession: makeInvoke('get_restored_session'),

        // === System ===
        getSystemCapabilities: makeInvoke('get_system_capabilities'),
        getBatteryStatus: makeInvoke('get_battery_status'),

        // === Platform ===
        getPlatform: makeInvoke('get_platform'),
        openExternal: makeInvoke('open_external', 'url'),

        // === File Tags ===
        getTagColors: makeInvoke('get_tag_colors'),
        setFileTag: makeInvoke('set_file_tag', 'file_path', 'color', 'note'),
        removeFileTag: makeInvoke('remove_file_tag', 'file_path'),
        getFileTag: makeInvoke('get_file_tag', 'file_path'),
        getTagsForDirectory: makeInvoke('get_tags_for_directory', 'dir_path'),
        getAllTags: makeInvoke('get_all_tags'),

        // === Shell Integration ===
        registerShellContextMenu: makeInvoke('register_shell_context_menu'),
        unregisterShellContextMenu: makeInvoke('unregister_shell_context_menu'),
        isShellContextMenuRegistered: makeInvoke('is_shell_context_menu_registered'),

        // === Global Hotkey ===
        setGlobalHotkey: makeInvoke('set_global_hotkey', 'accelerator'),
        getGlobalHotkey: makeInvoke('get_global_hotkey'),

        // === Terminal ===
        terminalGetShells: makeInvoke('terminal_get_shells'),
        terminalCreate: makeInvoke('terminal_create', 'cwd', 'shell_type', 'cols', 'rows'),
        terminalWrite: makeInvoke('terminal_write', 'id', 'data'),
        terminalResize: makeInvoke('terminal_resize', 'id', 'cols', 'rows'),
        terminalDestroy: makeInvoke('terminal_destroy', 'id'),
        terminalOpenExternal: makeInvoke('terminal_open_external', 'cwd'),
        onTerminalData: makeListener('terminal-data'),
        onTerminalExit: makeListener('terminal-exit'),
        onOpenEmbeddedTerminal: makeListener('open-embedded-terminal'),

        // === Privacy Dashboard ===
        getPrivacySettings: makeInvoke('get_privacy_settings'),
        applyPrivacySetting: makeInvoke('apply_privacy_setting', 'id'),
        applyAllPrivacy: makeInvoke('apply_all_privacy'),
        resetPrivacySetting: makeInvoke('reset_privacy_setting', 'id'),
        resetAllPrivacy: makeInvoke('reset_all_privacy'),
        getScheduledTasksAudit: makeInvoke('get_scheduled_tasks_audit'),
        disableScheduledTask: makeInvoke('disable_scheduled_task', 'task_path', 'task_name'),
        checkSideloading: makeInvoke('check_sideloading'),
        fixSideloading: makeInvoke('fix_sideloading'),
        fixSideloadingWithElevation: makeInvoke('fix_sideloading_with_elevation'),
        getPrivacyRecommendations: makeInvoke('get_privacy_recommendations'),

        // === System-Profil ===
        getSystemProfile: makeInvoke('get_system_profile'),

        // === S.M.A.R.T. ===
        getDiskHealth: makeInvoke('get_disk_health'),

        // === Software Audit ===
        auditSoftware: makeInvoke('audit_software'),
        correlateSoftware: makeInvoke('correlate_software', 'program'),
        checkAuditUpdates: makeInvoke('check_audit_updates'),

        // === Network Monitor ===
        getConnections: makeInvoke('get_connections'),
        getBandwidth: makeInvoke('get_bandwidth'),
        getNetworkSummary: makeInvoke('get_network_summary'),
        getGroupedConnections: makeInvoke('get_grouped_connections'),
        resolveIPs: makeInvoke('resolve_ips', 'ip_addresses'),
        getPollingData: makeInvoke('get_polling_data'),
        getConnectionDiff: makeInvoke('get_connection_diff'),
        getBandwidthHistory: makeInvoke('get_bandwidth_history'),
        getWiFiInfo: makeInvoke('get_wifi_info'),
        getDnsCache: makeInvoke('get_dns_cache'),
        clearDnsCache: makeInvoke('clear_dns_cache'),
        startNetworkRecording: makeInvoke('start_network_recording'),
        stopNetworkRecording: makeInvoke('stop_network_recording'),
        getNetworkRecordingStatus: makeInvoke('get_network_recording_status'),
        appendNetworkRecordingEvents: makeInvoke('append_network_recording_events', 'events'),
        listNetworkRecordings: makeInvoke('list_network_recordings'),
        deleteNetworkRecording: makeInvoke('delete_network_recording', 'filename'),
        openNetworkRecordingsDir: makeInvoke('open_network_recordings_dir'),
        saveNetworkSnapshot: makeInvoke('save_network_snapshot', 'data'),
        getNetworkHistory: makeInvoke('get_network_history'),
        clearNetworkHistory: makeInvoke('clear_network_history'),
        exportNetworkHistory: makeInvoke('export_network_history', 'format'),
        // === System Info ===
        getSystemInfo: makeInvoke('get_system_info'),

        // === Security Audit ===
        runSecurityAudit: makeInvoke('run_security_audit'),
        getAuditHistory: makeInvoke('get_audit_history'),

        // === System Score ===
        getSystemScore: makeInvoke('get_system_score', 'results'),

        // === Preferences ===
        getPreferences: makeInvoke('get_preferences'),
        setPreference: makeInvoke('set_preference', 'key', 'value'),
        setPreferencesMultiple: makeInvoke('set_preferences_multiple', 'entries'),

        // === Session ===
        getSessionInfo: makeInvoke('get_session_info'),
        saveSessionNow: makeInvoke('save_session_now', 'ui_state'),
        updateUiState: makeInvoke('update_ui_state', 'ui_state'),

        // === Folder Sizes ===
        getFolderSizesBulk: makeInvoke('get_folder_sizes_bulk', 'scan_id', 'folder_paths', 'parent_path'),

        // === Terminal Menu Actions ===
        onToggleTerminal: makeListener('toggle-terminal'),
        onNewTerminal: makeListener('new-terminal'),

        // === Menu Actions ===
        onMenuAction: makeListener('menu-action'),

        // === Screenshot ===
        captureScreenshot: makeInvoke('capture_screenshot'),

        // === Frontend Logging ===
        logFrontend: (level, message, context) => invoke('log_frontend', { level, message, context }),
    };

    console.log('[Tauri Bridge] window.api mapped — 150 methods + 18 event listeners');
})();

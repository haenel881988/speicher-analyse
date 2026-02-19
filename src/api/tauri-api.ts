/**
 * Tauri API Bridge — Typisierte ES-Module Version.
 * Ersetzt die alte IIFE-Bridge (renderer/js/tauri-bridge.js).
 * Alle 150 Methoden + 16 Event-Listener.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// === Drive & Scan ===
export const getDrives = () => invoke<any[]>('get_drives');
export const startScan = (path: string) => invoke<{ scan_id: string }>('start_scan', { path });

// === Tree Data ===
export const getTreeNode = (scanId: string, path: string, depth?: number) =>
  invoke<any>('get_tree_node', { scanId, path, depth });
export const getTreemapData = (scanId: string, path: string, depth?: number) =>
  invoke<any>('get_treemap_data', { scanId, path, depth });

// === File Data ===
export const getTopFiles = (scanId: string, limit: number) =>
  invoke<any[]>('get_top_files', { scanId, limit });
export const getFileTypes = (scanId: string) =>
  invoke<any[]>('get_file_types', { scanId });
export const search = (scanId: string, query: string, minSize?: number) =>
  invoke<any[]>('search', { scanId, query, minSize });
export const getFilesByExtension = (scanId: string, ext: string, limit?: number) =>
  invoke<any[]>('get_files_by_extension', { scanId, ext, limit });
export const getFilesByCategory = (scanId: string, category: string, limit?: number) =>
  invoke<any[]>('get_files_by_category', { scanId, category, limit });

// === Export ===
export const exportCSV = (scanId: string) => invoke<string>('export_csv', { scanId });
export const showSaveDialog = (options: any) => invoke<any>('show_save_dialog', { options });

// === File Management ===
export const deleteToTrash = (paths: string[]) => invoke<any>('delete_to_trash', { paths });
export const deletePermanent = (paths: string[]) => invoke<any>('delete_permanent', { paths });
export const createFolder = (parentPath: string, name: string) =>
  invoke<any>('create_folder', { parentPath, name });
export const fileRename = (oldPath: string, newName: string) =>
  invoke<any>('file_rename', { oldPath, newName });
export const fileMove = (sourcePaths: string[], destDir: string) =>
  invoke<any>('file_move', { sourcePaths, destDir });
export const fileCopy = (sourcePaths: string[], destDir: string) =>
  invoke<any>('file_copy', { sourcePaths, destDir });
export const fileProperties = (filePath: string) =>
  invoke<any>('file_properties', { filePath });
export const filePropertiesGeneral = (filePath: string) =>
  invoke<any>('file_properties_general', { filePath });
export const filePropertiesSecurity = (filePath: string) =>
  invoke<any>('file_properties_security', { filePath });
export const filePropertiesDetails = (filePath: string) =>
  invoke<any>('file_properties_details', { filePath });
export const filePropertiesVersions = (filePath: string) =>
  invoke<any>('file_properties_versions', { filePath });
export const filePropertiesHash = (filePath: string, algorithm: string) =>
  invoke<any>('file_properties_hash', { filePath, algorithm });
export const openFile = (filePath: string) => invoke<void>('open_file', { filePath });
export const showInExplorer = (filePath: string) => invoke<void>('show_in_explorer', { filePath });
export const runAsAdmin = (filePath: string) => invoke<any>('run_as_admin', { filePath });
export const extractArchive = (archivePath: string, destDir?: string) =>
  invoke<any>('extract_archive', { archivePath, destDir });
export const createArchive = (sourcePaths: string[], destPath?: string) =>
  invoke<any>('create_archive', { sourcePaths, destPath });

// Convenience aliases
export const rename = fileRename;
export const copy = fileCopy;
export const move = fileMove;
export const openInExplorer = showInExplorer;

// === Context Menu ===
export const showContextMenu = (menuType: string, context: any) =>
  invoke<void>('show_context_menu', { menuType, context });

// === Dialog ===
export const showConfirmDialog = (options: any) =>
  invoke<any>('show_confirm_dialog', { options });

// === Old Files ===
export const getOldFiles = (scanId: string, thresholdDays: number, minSize: number) =>
  invoke<any>('get_old_files', { scanId, thresholdDays, minSize });

// === Duplicate Finder ===
export const startDuplicateScan = (scanId: string, options?: any) =>
  invoke<any>('start_duplicate_scan', { scanId, options });
export const cancelDuplicateScan = (scanId: string) =>
  invoke<void>('cancel_duplicate_scan', { scanId });

// === Size Duplicates ===
export const getSizeDuplicates = (scanId: string, minSize: number) =>
  invoke<any>('get_size_duplicates', { scanId, minSize });

// === Memory ===
export const releaseScanBulkData = (scanId: string) =>
  invoke<void>('release_scan_bulk_data', { scanId });

// === Cleanup ===
export const scanCleanupCategories = (scanId: string) =>
  invoke<any>('scan_cleanup_categories', { scanId });
export const cleanCategory = (categoryId: string, paths: string[]) =>
  invoke<any>('clean_category', { categoryId, paths });

// === Preview ===
export const readFilePreview = (filePath: string, maxLines?: number) =>
  invoke<any>('read_file_preview', { filePath, maxLines });

// === Editor ===
export const readFileContent = (filePath: string) =>
  invoke<string>('read_file_content', { filePath });
export const writeFileContent = (filePath: string, content: string) =>
  invoke<void>('write_file_content', { filePath, content });
export const readFileBinary = (filePath: string) =>
  invoke<number[]>('read_file_binary', { filePath });

// === Autostart ===
export const getAutoStartEntries = () => invoke<any[]>('get_autostart_entries');
export const toggleAutoStart = (entry: any, enabled: boolean) =>
  invoke<any>('toggle_autostart', { entry, enabled });
export const deleteAutoStart = (entry: any) => invoke<any>('delete_autostart', { entry });

// === Services ===
export const getServices = () => invoke<any[]>('get_services');
export const controlService = (name: string, action: string) =>
  invoke<any>('control_service', { name, action });
export const setServiceStartType = (name: string, startType: string) =>
  invoke<any>('set_service_start_type', { name, startType });

// === Optimizer ===
export const getOptimizations = () => invoke<any>('get_optimizations');
export const applyOptimization = (id: string) => invoke<any>('apply_optimization', { id });

// === Updates ===
export const checkWindowsUpdates = () => invoke<any>('check_windows_updates');
export const getUpdateHistory = () => invoke<any[]>('get_update_history');
export const checkSoftwareUpdates = () => invoke<any[]>('check_software_updates');
export const updateSoftware = (packageId: string) => invoke<any>('update_software', { packageId });
export const getDriverInfo = () => invoke<any[]>('get_driver_info');
export const getHardwareInfo = () => invoke<any[]>('get_hardware_info');

// === Hybrid Search ===
export const searchNameIndex = (scanId: string, query: string, options?: any) =>
  invoke<any>('search_name_index', { scanId, query, options });
export const getNameIndexInfo = (scanId: string) =>
  invoke<any>('get_name_index_info', { scanId });
export const deepSearchStart = (rootPath: string, query: string, useRegex?: boolean) =>
  invoke<void>('deep_search_start', { rootPath, query, useRegex });
export const deepSearchCancel = () => invoke<void>('deep_search_cancel');

// === Explorer ===
export const listDirectory = (dirPath: string, maxEntries?: number) =>
  invoke<any>('list_directory', { dirPath, maxEntries });
export const getKnownFolders = () => invoke<any>('get_known_folders');
export const calculateFolderSize = (dirPath: string) =>
  invoke<any>('calculate_folder_size', { dirPath });
export const findEmptyFolders = (dirPath: string, maxDepth?: number) =>
  invoke<any[]>('find_empty_folders', { dirPath, maxDepth });
export const copyToClipboard = (text: string) => invoke<void>('copy_to_clipboard', { text });
export const openInTerminal = (dirPath: string) => invoke<void>('open_in_terminal', { dirPath });
export const openWithDialog = (filePath: string) => invoke<void>('open_with_dialog', { filePath });

// === Admin ===
export const isAdmin = () => invoke<boolean>('is_admin');
export const restartAsAdmin = () => invoke<void>('restart_as_admin');
export const getRestoredSession = () => invoke<any>('get_restored_session');

// === System ===
export const getSystemCapabilities = () => invoke<any>('get_system_capabilities');
export const getBatteryStatus = () => invoke<any>('get_battery_status');

// === Platform ===
export const getPlatform = () => invoke<string>('get_platform');
export const openExternal = (url: string) => invoke<void>('open_external', { url });

// === File Tags ===
export const getTagColors = () => invoke<any[]>('get_tag_colors');
export const setFileTag = (filePath: string, color: string, note: string) =>
  invoke<void>('set_file_tag', { filePath, color, note });
export const removeFileTag = (filePath: string) => invoke<void>('remove_file_tag', { filePath });
export const getFileTag = (filePath: string) => invoke<any>('get_file_tag', { filePath });
export const getTagsForDirectory = (dirPath: string) =>
  invoke<any>('get_tags_for_directory', { dirPath });
export const getAllTags = () => invoke<any[]>('get_all_tags');

// === Shell Integration ===
export const registerShellContextMenu = () => invoke<any>('register_shell_context_menu');
export const unregisterShellContextMenu = () => invoke<any>('unregister_shell_context_menu');
export const isShellContextMenuRegistered = () => invoke<boolean>('is_shell_context_menu_registered');

// === Global Hotkey ===
export const setGlobalHotkey = (accelerator: string) =>
  invoke<any>('set_global_hotkey', { accelerator });
export const getGlobalHotkey = () => invoke<string>('get_global_hotkey');

// === Terminal ===
export const terminalGetShells = () => invoke<any[]>('terminal_get_shells');
export const terminalCreate = (cwd: string, shellType: string, cols: number, rows: number) =>
  invoke<any>('terminal_create', { cwd, shellType, cols, rows });
export const terminalWrite = (id: string, data: string) =>
  invoke<void>('terminal_write', { id, data });
export const terminalResize = (id: string, cols: number, rows: number) =>
  invoke<void>('terminal_resize', { id, cols, rows });
export const terminalDestroy = (id: string) => invoke<void>('terminal_destroy', { id });
export const terminalOpenExternal = (cwd: string) =>
  invoke<void>('terminal_open_external', { cwd });

// === Privacy Dashboard ===
export const getPrivacySettings = () => invoke<any>('get_privacy_settings');
export const applyPrivacySetting = (id: string) => invoke<any>('apply_privacy_setting', { id });
export const applyAllPrivacy = () => invoke<any>('apply_all_privacy');
export const resetPrivacySetting = (id: string) => invoke<any>('reset_privacy_setting', { id });
export const resetAllPrivacy = () => invoke<any>('reset_all_privacy');
export const getScheduledTasksAudit = () => invoke<any[]>('get_scheduled_tasks_audit');
export const disableScheduledTask = (taskPath: string, taskName: string) =>
  invoke<any>('disable_scheduled_task', { taskPath, taskName });
export const checkSideloading = () => invoke<any>('check_sideloading');
export const fixSideloading = () => invoke<any>('fix_sideloading');
export const fixSideloadingWithElevation = () => invoke<any>('fix_sideloading_with_elevation');
export const getPrivacyRecommendations = () => invoke<any>('get_privacy_recommendations');

// === System-Profil ===
export const getSystemProfile = () => invoke<any>('get_system_profile');

// === S.M.A.R.T. ===
export const getDiskHealth = () => invoke<any[]>('get_disk_health');

// === Software Audit ===
export const auditSoftware = () => invoke<any>('audit_software');
export const correlateSoftware = (program: any) => invoke<any>('correlate_software', { program });
export const checkAuditUpdates = () => invoke<any>('check_audit_updates');

// === Network Monitor ===
export const getConnections = () => invoke<any[]>('get_connections');
export const getBandwidth = () => invoke<any[]>('get_bandwidth');
export const getNetworkSummary = () => invoke<any>('get_network_summary');
export const getGroupedConnections = () => invoke<any[]>('get_grouped_connections');
export const resolveIPs = (ipAddresses: string[]) =>
  invoke<any>('resolve_ips', { ipAddresses });
export const getPollingData = () => invoke<any>('get_polling_data');
export const getConnectionDiff = () => invoke<any>('get_connection_diff');
export const getBandwidthHistory = () => invoke<any>('get_bandwidth_history');
export const getWiFiInfo = () => invoke<any>('get_wifi_info');
export const getDnsCache = () => invoke<any[]>('get_dns_cache');
export const clearDnsCache = () => invoke<any>('clear_dns_cache');
export const startNetworkRecording = () => invoke<any>('start_network_recording');
export const stopNetworkRecording = () => invoke<any>('stop_network_recording');
export const getNetworkRecordingStatus = () => invoke<any>('get_network_recording_status');
export const appendNetworkRecordingEvents = (events: any[]) =>
  invoke<any>('append_network_recording_events', { events });
export const listNetworkRecordings = () => invoke<any[]>('list_network_recordings');
export const deleteNetworkRecording = (filename: string) =>
  invoke<any>('delete_network_recording', { filename });
export const openNetworkRecordingsDir = () => invoke<void>('open_network_recordings_dir');
export const saveNetworkSnapshot = (data: any) => invoke<any>('save_network_snapshot', { data });
export const getNetworkHistory = () => invoke<any[]>('get_network_history');
export const clearNetworkHistory = () => invoke<any>('clear_network_history');
export const exportNetworkHistory = (format: string) =>
  invoke<any>('export_network_history', { format });

// === System Info ===
export const getSystemInfo = () => invoke<any>('get_system_info');

// === Security Audit ===
export const runSecurityAudit = () => invoke<any>('run_security_audit');
export const getAuditHistory = () => invoke<any[]>('get_audit_history');
export const generateSecurityReport = (data: any) => invoke<any>('generate_security_report', { data });

// === System Score ===
export const getSystemScore = (results: any) => invoke<any>('get_system_score', { results });

// === Preferences ===
export const getPreferences = () => invoke<any>('get_preferences');
export const setPreference = (key: string, value: any) =>
  invoke<void>('set_preference', { key, value });
export const setPreferencesMultiple = (entries: any) =>
  invoke<void>('set_preferences_multiple', { entries });

// === Session ===
export const getSessionInfo = () => invoke<any>('get_session_info');
export const saveSessionNow = (uiState: any) => invoke<any>('save_session_now', { uiState });
export const updateUiState = (uiState: any) => invoke<void>('update_ui_state', { uiState });

// === Folder Sizes ===
export const getFolderSizesBulk = (scanId: string, folderPaths: string[], parentPath: string) =>
  invoke<any>('get_folder_sizes_bulk', { scanId, folderPaths, parentPath });

// === Screenshot ===
export const captureScreenshot = () => invoke<any>('capture_screenshot');

// === PDF Editor ===
export const pdfGetInfo = (filePath: string) => invoke<any>('pdf_get_info', { filePath });
export const pdfGetAnnotations = (filePath: string, pageNum: number) =>
  invoke<any[]>('pdf_get_annotations', { filePath, pageNum });
export const pdfSaveAnnotations = (filePath: string, outputPath: string, annotations: any[]) =>
  invoke<any>('pdf_save_annotations', { filePath, outputPath, annotations });
export const pdfOcrPage = (imageBase64: string, language?: string) =>
  invoke<any>('pdf_ocr_page', { imageBase64, language });
export const pdfAddTextLayer = (filePath: string, outputPath: string, ocrResults: any[]) =>
  invoke<any>('pdf_add_text_layer', { filePath, outputPath, ocrResults });
export const pdfRotatePage = (filePath: string, outputPath: string, pageNum: number, rotation: number) =>
  invoke<any>('pdf_rotate_page', { filePath, outputPath, pageNum, rotation });
export const pdfDeletePages = (filePath: string, outputPath: string, pageNums: number[]) =>
  invoke<any>('pdf_delete_pages', { filePath, outputPath, pageNums });
export const pdfMerge = (filePaths: string[], outputPath: string) =>
  invoke<any>('pdf_merge', { filePaths, outputPath });
export const openPdfWindow = (filePath: string) =>
  invoke<any>('open_pdf_window', { filePath });

// === Frontend Logging ===
export const logFrontend = (level: string, message: string, context?: string) =>
  invoke<void>('log_frontend', { level, message, context });

// === Event Listeners ===
export type TauriEventCallback<T = any> = (payload: T) => void;

export function onScanProgress(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('scan-progress', (e) => cb(e.payload));
}
export function onScanComplete(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('scan-complete', (e) => cb(e.payload));
}
export function onScanError(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('scan-error', (e) => cb(e.payload));
}
export function onContextMenuAction(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('context-menu-action', (e) => cb(e.payload));
}
export function onDuplicateProgress(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('duplicate-progress', (e) => cb(e.payload));
}
export function onDuplicateComplete(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('duplicate-complete', (e) => cb(e.payload));
}
export function onDuplicateError(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('duplicate-error', (e) => cb(e.payload));
}
export function onDeepSearchResult(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('deep-search-result', (e) => cb(e.payload));
}
export function onDeepSearchComplete(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('deep-search-complete', (e) => cb(e.payload));
}
export function onDeepSearchError(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('deep-search-error', (e) => cb(e.payload));
}
export function onTerminalData(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('terminal-data', (e) => cb(e.payload));
}
export function onTerminalExit(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('terminal-exit', (e) => cb(e.payload));
}
export function onOpenEmbeddedTerminal(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('open-embedded-terminal', (e) => cb(e.payload));
}
export function onToggleTerminal(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('toggle-terminal', (e) => cb(e.payload));
}
export function onNewTerminal(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('new-terminal', (e) => cb(e.payload));
}
export function onMenuAction(cb: TauriEventCallback): Promise<UnlistenFn> {
  return listen('menu-action', (e) => cb(e.payload));
}

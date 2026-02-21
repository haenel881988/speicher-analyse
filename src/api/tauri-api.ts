/**
 * Tauri API Bridge — Typisierte ES-Module Version.
 * Ersetzt die alte IIFE-Bridge (renderer/js/tauri-bridge.js).
 * Alle 150 Methoden + 16 Event-Listener.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getVersion as tauriGetVersion } from '@tauri-apps/api/app';

// === Shared Types ===
export interface DriveInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  modified_ms: number;
  extension: string;
  [key: string]: any;
}

export interface TreeNode {
  name: string;
  path: string;
  size: number;
  children?: TreeNode[];
  file_count?: number;
  dir_count?: number;
  error?: string;
  [key: string]: any;
}

export interface SystemCapabilities {
  isAdmin: boolean;
  hasBattery: boolean;
  wingetAvailable: boolean;
  platform: string;
}

export interface BatteryStatus {
  hasBattery: boolean;
  onBattery: boolean;
  percent?: number;
  charging?: boolean;
}

export interface ConfirmDialogResult {
  response: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  extension: string;
  [key: string]: any;
}

export interface OperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

// === Drive & Scan ===
export const getDrives = () => invoke<DriveInfo[]>('get_drives');
export const startScan = (path: string) => invoke<{ scan_id: string }>('start_scan', { path });
export const cancelScan = () => invoke<{ cancelled: boolean }>('cancel_scan');

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
export const deleteToTrash = (paths: string[]) => invoke<OperationResult>('delete_to_trash', { paths });
export const deletePermanent = (paths: string[]) => invoke<OperationResult>('delete_permanent', { paths });
export const createFolder = (parentPath: string, name: string) =>
  invoke<OperationResult>('create_folder', { parentPath, name });
export const fileRename = (oldPath: string, newName: string) =>
  invoke<OperationResult>('file_rename', { oldPath, newName });
export const fileMove = (sourcePaths: string[], destDir: string) =>
  invoke<OperationResult>('file_move', { sourcePaths, destDir });
export const fileCopy = (sourcePaths: string[], destDir: string) =>
  invoke<OperationResult>('file_copy', { sourcePaths, destDir });
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
  invoke<ConfirmDialogResult>('show_confirm_dialog', { options });

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
  invoke<{ data: string; size: number }>('read_file_binary', { filePath });

// === Autostart ===
export const getAutoStartEntries = () => invoke<any[]>('get_autostart_entries');
export const toggleAutoStart = (entry: any, enabled: boolean) =>
  invoke<any>('toggle_autostart', { entry, enabled });
export const deleteAutoStart = (entry: any) => invoke<any>('delete_autostart', { entry });

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
export const editInEditor = (filePath: string) => invoke<void>('edit_in_editor', { filePath });

// === Admin ===
export const isAdmin = () => invoke<boolean>('is_admin');
export const restartAsAdmin = () => invoke<void>('restart_as_admin');
export const getRestoredSession = () => invoke<any>('get_restored_session');

// === System ===
export const getSystemCapabilities = () => invoke<SystemCapabilities>('get_system_capabilities');
export const getBatteryStatus = () => invoke<BatteryStatus>('get_battery_status');

// === Platform ===
export const getPlatform = () => invoke<string>('get_platform');
export const openExternal = (url: string) => invoke<void>('open_external', { url });
export const getAppVersion = () => tauriGetVersion();

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

// === Apps-Kontrollzentrum ===
export const getAppsOverview = () => invoke<any>('get_apps_overview');
export const uninstallSoftware = (uninstallString: string, name: string) =>
  invoke<any>('uninstall_software', { uninstallString, name });
export const checkUninstallLeftovers = (name: string, installLocation?: string) =>
  invoke<any[]>('check_uninstall_leftovers', { name, installLocation });
export const getUnusedApps = (thresholdDays?: number) =>
  invoke<any[]>('get_unused_apps', { thresholdDays });
export const analyzeAppCache = () => invoke<any>('analyze_app_cache');
export const cleanAppCache = (paths: string[]) =>
  invoke<any>('clean_app_cache', { paths });
export const exportProgramList = (format: string, programs: any[]) =>
  invoke<any>('export_program_list', { format, programs });

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
export const pdfSaveAnnotations = (filePath: string, outputPath: string, annotations: any[], clearPages?: number[]) =>
  invoke<any>('pdf_save_annotations', { filePath, outputPath, annotations, clearPages });
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
export const pdfExtractPages = (filePath: string, outputPath: string, pages: number[]) =>
  invoke<any>('pdf_extract_pages', { filePath, outputPath, pages });
export const pdfInsertBlankPage = (filePath: string, outputPath: string, afterPage: number, width?: number, height?: number) =>
  invoke<any>('pdf_insert_blank_page', { filePath, outputPath, afterPage, width: width || 0, height: height || 0 });
export const pdfGetBookmarks = (filePath: string) =>
  invoke<any[]>('pdf_get_bookmarks', { filePath });
export const pdfAddImage = (filePath: string, outputPath: string, pageNum: number, imageBase64: string, rect: { x1: number; y1: number; x2: number; y2: number }) =>
  invoke<any>('pdf_add_image', { filePath, outputPath, pageNum, imageBase64, rect });
export const pdfReorderPages = (filePath: string, outputPath: string, order: number[]) =>
  invoke<any>('pdf_reorder_pages', { filePath, outputPath, order });
export const openPdfWindow = (filePath: string) =>
  invoke<any>('open_pdf_window', { filePath });

// === Undo-Log ===
export const getUndoLog = () => invoke<any[]>('get_undo_log');
export const undoAction = (id: string) => invoke<any>('undo_action', { id });
export const clearUndoLog = () => invoke<any>('clear_undo_log');

// === Scan History (Delta-Scan) ===
export const saveScanSnapshot = (scanId: string) => invoke<any>('save_scan_snapshot', { scanId });
export const getScanHistory = () => invoke<any[]>('get_scan_history');
export const compareScans = (olderId: string, newerId: string) => invoke<any>('compare_scans', { olderId, newerId });
export const getStorageTrend = (rootPath: string) => invoke<any>('get_storage_trend', { rootPath });
export const quickChangeCheck = () => invoke<any>('quick_change_check');
export const deleteScanSnapshot = (snapshotId: string) => invoke<any>('delete_scan_snapshot', { snapshotId });
export const clearScanHistory = () => invoke<any>('clear_scan_history');

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

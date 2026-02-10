import { formatBytes, formatNumber, formatDuration, getCategoryClass } from './utils.js';
import { startScan, fetchDrives, setupScanListeners } from './scanner.js';
import { TreeView, showToast } from './tree.js';
import { TreemapView } from './treemap.js';
import { FileTypeChart } from './charts.js';
import { exportCSV, exportPDF } from './export.js';
import {
    clipboardCut, clipboardCopy, clipboardPaste,
    deleteToTrash, deletePermanent, createNewFolder, showProperties,
} from './file-manager.js';
import { OldFilesView } from './old-files.js';
import { DuplicatesView } from './duplicates.js';
import { CleanupView } from './cleanup.js';
import { ScanCompareView } from './scan-compare.js';
import { EditorPanel } from './preview.js';
import { RegistryView } from './registry.js';
import { DashboardView } from './dashboard.js';
import { AutostartView } from './autostart.js';
import { ServicesView } from './services.js';
import { BloatwareView } from './bloatware.js';
import { OptimizerView } from './optimizer.js';
import { UpdatesView } from './updates.js';
import { ExplorerDualPanel } from './explorer-dual-panel.js';
import { BatchRenameModal } from './batch-rename.js';
import { SettingsView } from './settings.js';
import { PrivacyView } from './privacy.js';
import { SmartView } from './smart.js';
import { SoftwareAuditView } from './software-audit.js';
import { NetworkView } from './network.js';
import { SystemScoreView } from './system-score.js';
import { TerminalPanel } from './terminal-panel.js';

// ===== State =====
const state = {
    drives: [],
    currentScanId: null,
    currentPath: null,
    activeTab: 'tree',
    scanning: false,
    capabilities: null,
    batteryInfo: null,
};

// Track which tabs have been auto-loaded this session
const tabLoaded = {
    autostart: false,
    services: false,
    bloatware: false,
    updates: false,
    duplicates: false,
    optimizer: false,
    settings: false,
    privacy: false,
    smart: false,
    'software-audit': false,
    network: false,
    'system-score': false,
};

// ===== DOM =====
const els = {
    toolbarDriveSelect: document.getElementById('toolbar-drive-select'),
    toolbarScanBtn: document.getElementById('toolbar-scan-btn'),
    tabContent: document.getElementById('tab-content'),
    scanProgress: document.getElementById('scan-progress'),
    progressStats: document.getElementById('progress-stats'),
    progressBar: document.getElementById('progress-bar'),
    progressPath: document.getElementById('progress-path'),
    welcomeState: document.getElementById('welcome-state'),
    treeContent: document.getElementById('tree-content'),
    treeContainer: document.getElementById('tree-container'),
    treeBreadcrumb: document.getElementById('tree-breadcrumb'),
    treemapContainer: document.getElementById('treemap-container'),
    treemapBreadcrumb: document.getElementById('treemap-breadcrumb'),
    treemapTooltip: document.getElementById('treemap-tooltip'),
    donutChart: document.getElementById('donut-chart'),
    typeTableBody: document.getElementById('type-table-body'),
    typeTable: document.getElementById('type-table'),
    topFilesBody: document.getElementById('top-files-body'),
    themeToggle: document.getElementById('theme-toggle'),
    iconMoon: document.getElementById('icon-moon'),
    iconSun: document.getElementById('icon-sun'),
    exportCsvBtn: document.getElementById('toolbar-export-csv'),
    exportPdfBtn: document.getElementById('toolbar-export-pdf'),
    propertiesModal: document.getElementById('properties-modal'),
    propertiesClose: document.getElementById('properties-close'),
    previewToggle: document.getElementById('preview-toggle'),
    previewContent: document.getElementById('preview-content'),
    previewTitle: document.getElementById('preview-title'),
    previewClose: document.getElementById('preview-close'),
};

// ===== Components =====
const treeView = new TreeView(els.treeContainer, els.treeBreadcrumb);
const treemapView = new TreemapView(els.treemapContainer, els.treemapBreadcrumb, els.treemapTooltip);
const fileTypeChart = new FileTypeChart(els.donutChart, els.typeTableBody);
const editorPanel = new EditorPanel(els.previewContent, els.previewTitle, els.previewClose);

// Tool views
const oldFilesView = new OldFilesView(document.getElementById('view-old-files'));
const duplicatesView = new DuplicatesView(document.getElementById('view-duplicates'));
const cleanupView = new CleanupView(document.getElementById('view-cleanup'));
const scanCompareView = new ScanCompareView(document.getElementById('view-compare'));
const registryView = new RegistryView(document.getElementById('view-registry'));
const dashboardView = new DashboardView(document.getElementById('view-dashboard'));
const autostartView = new AutostartView(document.getElementById('view-autostart'));
const servicesView = new ServicesView(document.getElementById('view-services'));
const bloatwareView = new BloatwareView(document.getElementById('view-bloatware'));
const optimizerView = new OptimizerView(document.getElementById('view-optimizer'));
const updatesView = new UpdatesView(document.getElementById('view-updates'));
const dualPanel = new ExplorerDualPanel(document.getElementById('view-explorer'), {
    onContextMenu: handleContextMenu,
    getScanId: () => state.currentScanId,
});
const batchRenameModal = new BatchRenameModal();
const settingsView = new SettingsView(document.getElementById('view-settings'));
const privacyView = new PrivacyView(document.getElementById('view-privacy'));
const smartView = new SmartView(document.getElementById('view-smart'));
const softwareAuditView = new SoftwareAuditView(document.getElementById('view-software-audit'));
const networkView = new NetworkView(document.getElementById('view-network'));
const systemScoreView = new SystemScoreView(document.getElementById('view-system-score'));

// Global Terminal Panel (VS Code style, accessible from any tab via Ctrl+`)
const globalTerminal = new TerminalPanel(document.getElementById('terminal-global'));

// Refresh explorer after batch rename
document.addEventListener('batch-rename-complete', () => {
    dualPanel.getActiveExplorer()?.refresh();
});

// Wire toast events from EditorPanel
document.addEventListener('show-toast', (e) => {
    showToast(e.detail.message, e.detail.type);
});

// Wire embedded terminal events from main process (opens global terminal)
window.api.onOpenEmbeddedTerminal(({ path }) => {
    globalTerminal.show(path);
});

// Wire toggle-global-terminal event (from explorer-dual-panel delegation)
document.addEventListener('toggle-global-terminal', (e) => {
    const cwd = e.detail?.cwd || dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.toggle(cwd);
});

// Wire menu bar "Terminal" actions from main process
window.api.onToggleTerminal?.(() => {
    const cwd = dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.toggle(cwd);
});
window.api.onNewTerminal?.(() => {
    const cwd = dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.destroy().then(() => globalTerminal.show(cwd));
});

// Auto-sync terminal CWD when navigating in Explorer
document.addEventListener('explorer-navigate', (e) => {
    if (e.detail?.path) globalTerminal.changeCwd(e.detail.path);
});

// Wire open-in-preview events from explorer (PDF, DOCX, etc.)
document.addEventListener('open-in-preview', (e) => {
    const filePath = e.detail.path;
    if (filePath) {
        editorPanel.show(filePath);
    }
});

// Wire context menu callbacks
treeView.onContextMenu = handleContextMenu;
treemapView.onContextMenu = handleContextMenu;
fileTypeChart.onContextMenu = handleContextMenu;

// ===== Init =====
async function init() {
    loadTheme();
    setupSidebar();
    setupToolbar();
    setupExport();
    setupThemeToggle();

    // Listen for theme changes from Settings page
    document.addEventListener('settings-theme-change', (e) => {
        if (e.detail?.theme) toggleTheme(e.detail.theme);
    });

    setupPropertiesModal();
    setupContextMenuActions();
    setupKeyboardShortcuts();
    setupPreviewToggle();
    setupPreviewResize();
    setupSmartLayout();
    setupTopFilesFilters();
    await registryView.init();
    await autostartView.init();
    await servicesView.init();
    await bloatwareView.init();
    await optimizerView.init();
    await updatesView.init();
    await dualPanel.init();
    dashboardView.onNavigate = (tab) => switchToTab(tab);
    await loadDrives();

    // Check system capabilities
    try {
        state.capabilities = await window.api.getSystemCapabilities();
        if (!state.capabilities.wingetAvailable) {
            showToast('WinGet nicht verfügbar - Software-Updates deaktiviert', 'info');
        }
    } catch { /* ignore */ }

    // Show admin badge if running with elevated privileges
    const isAdmin = state.capabilities?.isAdmin;
    if (isAdmin) {
        const badge = document.getElementById('admin-badge');
        if (badge) badge.style.display = '';
    }

    // Start battery monitoring (interval depends on energy mode)
    await updateBatteryUI();
    let batteryInterval = 30000; // default
    try {
        const prefs = await window.api.getPreferences();
        if (prefs.energyMode === 'powersave') batteryInterval = 120000;
        else if (prefs.energyMode === 'auto' && state.batteryInfo?.onBattery) batteryInterval = 60000;

        // One-time theme migration: localStorage → preferences
        const lsTheme = localStorage.getItem('speicher-analyse-theme');
        if (lsTheme && lsTheme !== prefs.theme) {
            window.api.setPreference('theme', lsTheme).catch(() => {});
        }
    } catch { /* use default interval */ }
    setInterval(updateBatteryUI, batteryInterval);

    // Smart Reload: State wiederherstellen nach F5 (page reload mit State-Preservation)
    const reloadStateJson = sessionStorage.getItem('speicher-analyse-reload-state');
    if (reloadStateJson) {
        sessionStorage.removeItem('speicher-analyse-reload-state');
        try {
            const saved = JSON.parse(reloadStateJson);
            if (Date.now() - saved.timestamp < 30000 && saved.currentScanId && saved.currentPath) {
                state.currentScanId = saved.currentScanId;
                state.currentPath = saved.currentPath;
                state.lastScanProgress = saved.lastScanProgress;

                const driveLetter = saved.currentPath.substring(0, 3).toUpperCase();
                const opt = [...els.toolbarDriveSelect.options].find(o => o.value.toUpperCase().startsWith(driveLetter));
                if (opt) els.toolbarDriveSelect.value = opt.value;

                if (saved.lastScanProgress) {
                    els.progressStats.textContent =
                        `${formatNumber(saved.lastScanProgress.dirs_scanned)} Ordner \u00B7 ${formatNumber(saved.lastScanProgress.files_found)} Dateien \u00B7 ${formatBytes(saved.lastScanProgress.total_size)}`;
                    els.progressBar.style.width = '100%';
                    els.scanProgress.classList.add('active');
                }

                setStatus('Daten werden geladen...', true);
                // skipPostAnalysis=true: Smart Reload soll keine neuen Scans starten
                await loadAllViews(true);
                if (saved.activeTab) switchToTab(saved.activeTab);

                // Refresh Explorer so it picks up scan data (folder sizes)
                try {
                    const activeExplorer = dualPanel.getActiveExplorer();
                    if (activeExplorer && activeExplorer.currentPath) {
                        activeExplorer.refresh();
                    }
                } catch { /* explorer might not be ready yet */ }

                setStatus('Bereit');
                showToast('App aktualisiert', 'success');

                if (saved.lastScanProgress) {
                    setTimeout(() => els.scanProgress.classList.remove('active'), 3000);
                }
            }
        } catch (err) {
            console.error('Smart reload restore error:', err);
        }
    } else {
        // Check for restored session data (admin elevation OR persistent session)
        try {
            const restored = await window.api.getRestoredSession();
            if (restored && restored.sessions && restored.sessions.length > 0) {
                const progress = restored.sessions[0];
                state.currentScanId = progress.scan_id;
                state.currentPath = progress.current_path;
                state.lastScanProgress = progress;

                // Select drive in dropdown WITHOUT starting a new scan
                const driveLetter = progress.current_path.substring(0, 3).toUpperCase();
                const opt = [...els.toolbarDriveSelect.options].find(o => o.value.toUpperCase().startsWith(driveLetter));
                if (opt) els.toolbarDriveSelect.value = opt.value;

                // Show restored scan info
                els.progressStats.textContent =
                    `Wiederhergestellt: ${formatNumber(progress.dirs_scanned)} Ordner \u00B7 ${formatNumber(progress.files_found)} Dateien \u00B7 ${formatBytes(progress.total_size)}`;
                els.progressBar.style.width = '100%';
                els.scanProgress.classList.add('active');

                setStatus('Session wiederhergestellt', true);
                // skipPostAnalysis=true: Keine 5 Hintergrund-Scans, kein switchToTab('dashboard')
                await loadAllViews(true);

                // Restore UI state (activeTab) if available from persistent session
                if (restored.ui && restored.ui.activeTab) {
                    switchToTab(restored.ui.activeTab);
                }

                // Navigate Explorer to restored path AND refresh for folder sizes
                try {
                    const activeExplorer = dualPanel.getActiveExplorer();
                    if (activeExplorer) {
                        const restorePath = restored.ui?.activePath || progress.current_path;
                        if (restorePath) {
                            await activeExplorer.navigateTo(restorePath);
                        } else if (activeExplorer.currentPath) {
                            activeExplorer.refresh();
                        }
                    }
                } catch { /* explorer might not be ready yet */ }

                setStatus('Bereit');
                showToast('Scan-Daten wurden wiederhergestellt');
                setTimeout(() => els.scanProgress.classList.remove('active'), 3000);
            }
        } catch (err) {
            console.error('Session restore check failed:', err);
        }
    }

    // Listen for tray actions
    window.api.onTrayAction((action) => {
        switch (action) {
            case 'quick-scan': {
                const selectedPath = els.toolbarDriveSelect.value;
                if (selectedPath && !state.scanning) {
                    startScan(selectedPath, state, els, loadAllViews, setStatus);
                }
                break;
            }
            case 'check-duplicates':
                switchToTab('duplicates');
                break;
        }
    });

    // Listen for open-folder from shell integration
    window.api.onOpenFolder((folderPath) => {
        switchToTab('explorer');
        dualPanel.getActiveExplorer()?.navigateTo(folderPath);
    });
}

// ===== Sidebar =====
function setupSidebar() {
    document.querySelectorAll('.sidebar-nav-btn[data-tab]').forEach(btn => {
        btn.onclick = () => switchToTab(btn.dataset.tab);
    });

    // Sidebar toggle (click only, no hover)
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn && sidebar) {
        if (localStorage.getItem('sidebar-expanded') === 'true') {
            sidebar.classList.add('expanded');
        }
        toggleBtn.onclick = () => {
            sidebar.classList.toggle('expanded');
            localStorage.setItem('sidebar-expanded', sidebar.classList.contains('expanded'));
        };
    }

    // Collapsible sidebar groups
    document.querySelectorAll('.sidebar-nav-group').forEach(group => {
        const groupId = group.dataset.group;
        const label = group.querySelector('.sidebar-nav-label');
        const key = 'sidebar-group-' + groupId;

        // Restore saved state (default: collapsed from HTML)
        const saved = localStorage.getItem(key);
        if (saved === 'expanded') {
            group.classList.remove('collapsed');
        }

        // Toggle on label click
        if (label) {
            label.onclick = () => {
                group.classList.toggle('collapsed');
                localStorage.setItem(key, group.classList.contains('collapsed') ? 'collapsed' : 'expanded');
            };
        }
    });
}

// ===== Toolbar =====
function setupToolbar() {
    // Scan button
    els.toolbarScanBtn.onclick = () => {
        if (state.scanning) return;
        const selectedPath = els.toolbarDriveSelect.value;
        if (!selectedPath) {
            showToast('Bitte zuerst ein Laufwerk auswählen', 'info');
            return;
        }
        selectDriveByPath(selectedPath);
    };

    // Drive dropdown change
    els.toolbarDriveSelect.onchange = () => {
        // Don't auto-scan on change, just select
    };
}

// ===== Drives =====
async function loadDrives() {
    try {
        state.drives = await fetchDrives();
        renderDrives();
    } catch (e) {
        els.toolbarDriveSelect.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

function renderDrives() {
    const defaultOption = '<option value="">Laufwerk...</option>';
    const options = state.drives.map(drive => {
        const label = `${drive.mountpoint.replace('\\', '')} ${formatBytes(drive.free)} frei (${drive.fstype})`;
        return `<option value="${drive.mountpoint}" title="${drive.device} - ${formatBytes(drive.used)} / ${formatBytes(drive.total)}">${label}</option>`;
    }).join('');
    els.toolbarDriveSelect.innerHTML = defaultOption + options;

    // Pre-select C: drive if available
    const cDrive = state.drives.find(d => d.mountpoint.toUpperCase().startsWith('C'));
    if (cDrive) {
        els.toolbarDriveSelect.value = cDrive.mountpoint;
    }
}

async function selectDriveByPath(drivePath) {
    // Battery warning before heavy scan operation
    if (state.batteryInfo?.onBattery && state.batteryInfo.percentage !== null && state.batteryInfo.percentage < 50) {
        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Batteriebetrieb',
            message: `Akku bei ${state.batteryInfo.percentage}%. Scans verbrauchen viel Energie.\n\nTrotzdem fortfahren?`,
            buttons: ['Abbrechen', 'Fortfahren'],
            defaultId: 0,
        });
        if (result.response !== 1) return;
    }

    state.scanning = true;
    lowBatteryWarningShown = false;
    state.currentPath = drivePath;
    Object.keys(tabLoaded).forEach(k => tabLoaded[k] = false);
    els.toolbarScanBtn.disabled = true;
    els.toolbarDriveSelect.disabled = true;

    try {
        const { scan_id } = await startScan(drivePath);
        state.currentScanId = scan_id;

        els.scanProgress.classList.add('active');
        els.progressBar.classList.add('animating');
        els.welcomeState.style.display = 'none';
        els.treeContent.style.display = 'none';
        setStatus('Laufwerk wird gescannt...', true);

        setupScanListeners(
            (progress) => updateProgress(progress),
            (progress) => onScanComplete(progress),
            (error) => onScanError(error),
        );
    } catch (e) {
        console.error('Scan start error:', e);
        state.scanning = false;
        els.toolbarScanBtn.disabled = false;
        els.toolbarDriveSelect.disabled = false;
    }
}

function updateProgress(progress) {
    els.progressStats.textContent =
        `${formatNumber(progress.dirs_scanned)} Ordner \u00B7 ${formatNumber(progress.files_found)} Dateien \u00B7 ${formatBytes(progress.total_size)} \u00B7 ${formatDuration(progress.elapsed_seconds)}`;
    els.progressPath.textContent = progress.current_path;
    els.progressBar.style.width = '100%';
}

async function onScanComplete(progress) {
    state.scanning = false;
    els.toolbarScanBtn.disabled = false;
    els.toolbarDriveSelect.disabled = false;

    els.progressStats.textContent =
        `Fertig! ${formatNumber(progress.dirs_scanned)} Ordner \u00B7 ${formatNumber(progress.files_found)} Dateien \u00B7 ${formatBytes(progress.total_size)} \u00B7 ${formatDuration(progress.elapsed_seconds)}` +
        (progress.errors_count > 0 ? ` \u00B7 ${progress.errors_count} Fehler` : '');
    els.progressBar.style.width = '100%';
    els.progressBar.classList.remove('animating');

    state.lastScanProgress = progress;
    pushUiState(); // Ensure UI state is saved before auto-session-save
    setStatus('Daten werden geladen...', true);
    await loadAllViews();

    // Refresh Explorer so it picks up scan data (folder sizes + proportions)
    try {
        const activeExplorer = dualPanel.getActiveExplorer();
        if (activeExplorer && activeExplorer.currentPath) {
            activeExplorer.refresh();
        }
    } catch { /* ignore */ }

    setStatus('Bereit');

    setTimeout(() => els.scanProgress.classList.remove('active'), 3000);
}

function onScanError(error) {
    state.scanning = false;
    els.toolbarScanBtn.disabled = false;
    els.toolbarDriveSelect.disabled = false;
    els.progressStats.textContent = 'Fehler: ' + (error.current_path || 'Unbekannt');
    els.progressBar.style.width = '0%';
    els.progressBar.classList.remove('animating');
    setStatus('Scan-Fehler');
}

// ===== Load Views =====
// skipPostAnalysis: true bei Session-Restore (vermeidet CPU-Spike + Tab-Wechsel)
async function loadAllViews(skipPostAnalysis = false) {
    els.treeContent.style.display = 'block';
    els.welcomeState.style.display = 'none';
    treeView.init(state.currentScanId, state.currentPath);
    treemapView.init(state.currentScanId, state.currentPath);
    await fileTypeChart.init(state.currentScanId);
    fileTypeChart.setupTableSort(els.typeTable);
    fileTypeChart.setupDetailPanel();
    await loadTopFiles();

    // Init tool views with current scan
    oldFilesView.init(state.currentScanId);
    duplicatesView.init(state.currentScanId);
    cleanupView.init(state.currentScanId);
    scanCompareView.init(state.currentScanId);

    // Init dashboard
    dashboardView.init(state.currentScanId, state.lastScanProgress || {});

    // Post-scan analysis: nur bei frischem Scan, NICHT bei Session-Restore
    // (vermeidet CPU-Spike beim Start + ungewollten Tab-Wechsel zu Dashboard)
    if (!skipPostAnalysis) {
        runPostScanAnalysis();
    }
}

async function runPostScanAnalysis() {
    setStatus('Analyse wird durchgeführt...', true);
    const [cleanup, oldFiles, registry, optimizer, sizeDuplicates] = await Promise.allSettled([
        cleanupView.autoScan(),
        oldFilesView.autoSearch(),
        registryView.autoScan(),
        optimizerView.autoScan(),
        window.api.getSizeDuplicates(state.currentScanId, 1024),
    ]);
    dashboardView.updateResults({ cleanup, oldFiles, registry, optimizer, sizeDuplicates });
    setStatus('Bereit');
    switchToTab('dashboard');

    // Release bulk file data to free ~200-400 MB RAM
    await window.api.releaseScanBulkData(state.currentScanId);
}

function switchToTab(tabName) {
    state.activeTab = tabName;

    // Update sidebar nav button highlights
    document.querySelectorAll('.sidebar-nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.sidebar-nav-btn[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Auto-expand parent group of active tab
    const parentGroup = navBtn?.closest('.sidebar-nav-group');
    if (parentGroup && parentGroup.classList.contains('collapsed')) {
        parentGroup.classList.remove('collapsed');
        localStorage.setItem('sidebar-group-' + parentGroup.dataset.group, 'expanded');
    }

    // Switch content view
    els.tabContent.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + tabName);
    if (view) view.classList.add('active');

    if (tabName === 'treemap' && state.currentScanId) {
        setTimeout(() => treemapView.render(treemapView.rootPath), 50);
    }

    // Auto-load data when tab is clicked
    autoLoadTab(tabName);

    // Push UI state to main process for session persistence
    pushUiState();
}

function pushUiState() {
    window.api.updateUiState({
        activeTab: state.activeTab,
        activePath: state.currentPath,
        driveSelection: els.toolbarDriveSelect?.value || null,
    }).catch(() => {});
}

async function autoLoadTab(tabName) {
    if (tabLoaded[tabName]) return;

    switch (tabName) {
        case 'autostart':
            tabLoaded.autostart = true;
            setStatus('Autostart wird geladen...', true);
            await autostartView.scan();
            setStatus('Bereit');
            break;
        case 'services':
            tabLoaded.services = true;
            setStatus('Dienste werden geladen...', true);
            await servicesView.load();
            setStatus('Bereit');
            break;
        case 'bloatware':
            tabLoaded.bloatware = true;
            setStatus('Bloatware wird gesucht...', true);
            await bloatwareView.scan();
            setStatus('Bereit');
            break;
        case 'updates':
            tabLoaded.updates = true;
            setStatus('Updates werden geprüft...', true);
            await updatesView.checkAll();
            setStatus('Bereit');
            break;
        case 'duplicates':
            // Duplikat-Scan bleibt manuell (braucht dirFiles, die nach Analyse freigegeben werden)
            break;
        case 'optimizer':
            if (!optimizerView._cache) {
                tabLoaded.optimizer = true;
                setStatus('System wird analysiert...', true);
                await optimizerView.scan();
                setStatus('Bereit');
            }
            break;
        case 'settings':
            tabLoaded.settings = true;
            await settingsView.load();
            break;
        case 'privacy':
            tabLoaded.privacy = true;
            setStatus('Datenschutz wird analysiert...', true);
            await privacyView.init();
            setStatus('Bereit');
            break;
        case 'smart':
            tabLoaded.smart = true;
            setStatus('Festplatten werden geprüft...', true);
            await smartView.init();
            setStatus('Bereit');
            break;
        case 'software-audit':
            tabLoaded['software-audit'] = true;
            setStatus('Software wird analysiert...', true);
            await softwareAuditView.init();
            setStatus('Bereit');
            break;
        case 'network':
            setStatus('Netzwerk wird analysiert...', true);
            await networkView.init();
            tabLoaded.network = true;
            setStatus('Bereit');
            break;
        case 'system-score':
            tabLoaded['system-score'] = true;
            setStatus('System-Score wird berechnet...', true);
            await calculateAndShowSystemScore();
            setStatus('Bereit');
            break;
    }
}

function saveStateAndReload() {
    const saveData = {
        currentScanId: state.currentScanId,
        currentPath: state.currentPath,
        activeTab: state.activeTab,
        lastScanProgress: state.lastScanProgress,
        timestamp: Date.now(),
    };
    sessionStorage.setItem('speicher-analyse-reload-state', JSON.stringify(saveData));
    location.reload();
}

async function refreshCurrentView() {
    const tab = state.activeTab;
    setStatus('Wird aktualisiert...', true);
    showToast('Daten werden aktualisiert...', 'info');

    try {
        // Lade-Flag zurücksetzen damit autoLoadTab neu laden kann
        if (tabLoaded[tab] !== undefined) {
            tabLoaded[tab] = false;
        }

        switch (tab) {
            case 'explorer':
                dualPanel.getActiveExplorer()?.refresh();
                break;
            case 'tree':
            case 'treemap':
                if (state.currentScanId) {
                    treeView.invalidateCache(state.currentPath);
                    treeView.loadRoot();
                    treemapView.render(treemapView.rootPath);
                }
                break;
            case 'types':
                if (state.currentScanId) await fileTypeChart.init(state.currentScanId);
                break;
            case 'top100':
                if (state.currentScanId) await loadTopFiles();
                break;
            case 'network':
                networkView._loaded = false;
                await networkView.init();
                break;
            case 'privacy':
                privacyView._loaded = false;
                await privacyView.init();
                break;
            case 'smart':
                smartView._loaded = false;
                await smartView.init();
                break;
            case 'software-audit':
                softwareAuditView._loaded = false;
                await softwareAuditView.init();
                break;
            case 'system-score':
                await calculateAndShowSystemScore();
                break;
            default:
                // Für alle anderen Tabs: autoLoadTab aufrufen
                await autoLoadTab(tab);
                break;
        }
        showToast('Daten aktualisiert', 'success');
    } catch (err) {
        console.error('Refresh error:', err);
        showToast('Fehler beim Aktualisieren: ' + err.message, 'error');
    }
    setStatus('Bereit');
}

async function loadTopFiles() {
    const limitEl = document.getElementById('top-files-limit');
    const categoryEl = document.getElementById('top-files-category');
    const limit = parseInt(limitEl?.value || '100', 10);
    const categoryFilter = categoryEl?.value || '';

    try {
        const files = await window.api.getTopFiles(state.currentScanId, limit);
        const filtered = categoryFilter
            ? files.filter(f => getCategoryForExt(f.extension) === categoryFilter)
            : files;
        renderTopFiles(filtered);

        const summaryEl = document.getElementById('top-files-summary');
        if (summaryEl) {
            summaryEl.textContent = `${filtered.length} Dateien${categoryFilter ? ' (' + categoryFilter + ')' : ''} \u00B7 ${formatBytes(filtered.reduce((s, f) => s + f.size, 0))}`;
        }
    } catch (e) { console.error('Error loading top files:', e); }
}

function setupTopFilesFilters() {
    const limitEl = document.getElementById('top-files-limit');
    const categoryEl = document.getElementById('top-files-category');
    if (limitEl) limitEl.onchange = () => { if (state.currentScanId) loadTopFiles(); };
    if (categoryEl) categoryEl.onchange = () => { if (state.currentScanId) loadTopFiles(); };
}

function formatAge(mtime) {
    if (!mtime) return '-';
    const days = Math.floor((Date.now() / 1000 - mtime) / 86400);
    if (days < 1) return 'Heute';
    if (days < 30) return days + ' T';
    if (days < 365) return Math.floor(days / 30) + ' M';
    return Math.floor(days / 365) + ' J';
}

function renderTopFiles(files) {
    els.topFilesBody.innerHTML = files.map((file, i) => {
        const dirPath = file.path.substring(0, Math.max(file.path.lastIndexOf('\\'), file.path.lastIndexOf('/')));
        const catClass = getCategoryClass(getCategoryForExt(file.extension));
        const age = formatAge(file.modified);
        return `
            <tr data-path="${escapeAttr(file.path)}" data-name="${escapeAttr(file.name)}">
                <td class="rank-col">${i + 1}</td>
                <td class="name-col" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</td>
                <td class="path-col" title="${escapeHtml(dirPath)}">${escapeHtml(dirPath)}</td>
                <td class="type-col"><span class="category-badge ${catClass}">${file.extension || '-'}</span></td>
                <td class="age-col">${age}</td>
                <td class="size-col">${formatBytes(file.size)}</td>
            </tr>
        `;
    }).join('');

    els.topFilesBody.querySelectorAll('tr').forEach(row => {
        row.style.cursor = 'context-menu';
        row.oncontextmenu = (e) => {
            e.preventDefault();
            handleContextMenu('file', { path: row.dataset.path, name: row.dataset.name });
        };
        row.ondblclick = () => {
            window.api.openFile(row.dataset.path);
        };
        row.onclick = () => {
            if (editorPanel.isVisible()) {
                editorPanel.show(row.dataset.path);
            }
        };
    });
}

function getCategoryForExt(ext) {
    const map = {
        'Video': ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
        'Audio': ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
        'Bild': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.psd', '.raw'],
        'Dokument': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
        'Archiv': ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'],
        'Code': ['.py', '.js', '.ts', '.html', '.css', '.java', '.cpp', '.c', '.rs', '.go'],
        'Datenbank': ['.db', '.sqlite', '.sql'],
        'Programm': ['.exe', '.msi', '.dll', '.sys'],
    };
    for (const [cat, exts] of Object.entries(map)) {
        if (exts.includes(ext)) return cat;
    }
    return 'Sonstige';
}

// ===== Context Menu =====
function handleContextMenu(type, context) {
    window.api.showContextMenu(type, context);
}

function setupContextMenuActions() {
    window.api.onContextMenuAction((action) => {
        const path = action.path;
        const paths = action.selectedPaths || (path ? [path] : []);
        const refresh = () => {
            if (state.activeTab === 'explorer') {
                dualPanel.getActiveExplorer()?.refresh();
            } else if (state.currentScanId) {
                treeView.invalidateCache(state.currentPath);
                treeView.loadRoot();
            }
        };

        switch (action.action) {
            case 'show-in-explorer':
                window.api.showInExplorer(path);
                break;
            case 'open-file':
                window.api.openFile(path);
                break;
            case 'create-folder':
                createNewFolder(path || (state.activeTab === 'explorer' ? (dualPanel.getActiveExplorer()?.currentPath || state.currentPath) : state.currentPath), refresh);
                break;
            case 'rename':
                if (state.activeTab === 'explorer' && path) {
                    dualPanel.getActiveExplorer()?.startInlineRename(path);
                } else if (path) {
                    treeView.startInlineRename(path);
                }
                break;
            case 'cut':
                if (paths.length > 0) clipboardCut(paths);
                break;
            case 'copy':
                if (paths.length > 0) clipboardCopy(paths);
                break;
            case 'paste':
                clipboardPaste(path || treeView.getSelectedPath() || state.currentPath, refresh);
                break;
            case 'delete-trash':
                if (paths.length > 0) deleteToTrash(paths, refresh);
                break;
            case 'delete-permanent':
                if (paths.length > 0) deletePermanent(paths, refresh);
                break;
            case 'properties':
                if (path) showProperties(path);
                break;
            case 'refresh':
                refresh();
                break;
            case 'refresh-data':
                refreshCurrentView();
                break;
            case 'smart-reload':
                saveStateAndReload();
                break;
            case 'toggle-theme':
                toggleTheme();
                break;
            case 'export-csv':
                if (state.currentScanId) exportCSV(state.currentScanId);
                break;
            case 'export-pdf':
                exportPDF();
                break;
            case 'new-scan':
                break;
            case 'copy-path':
                if (path) window.api.copyToClipboard(path);
                break;
            case 'open-in-terminal':
                if (path) {
                    switchToTab('explorer');
                    dualPanel.openTerminal(path);
                }
                break;
            case 'open-with':
                if (path) window.api.openWithDialog(path);
                break;
            case 'calculate-folder-size':
                if (path) {
                    window.api.calculateFolderSize(path).then(result => {
                        showToast(`${formatBytes(result.totalSize)} (${formatNumber(result.fileCount)} Dateien, ${formatNumber(result.dirCount)} Ordner)`, 'info');
                    });
                }
                break;
            case 'sort-by':
                if (state.activeTab === 'explorer' && action.sortCol) {
                    dualPanel.getActiveExplorer()?.setSortColumn(action.sortCol);
                }
                break;
            case 'copy-to-other-panel': {
                const target = dualPanel.getTargetExplorer();
                if (target && paths.length > 0) {
                    window.api.copy(paths, target.currentPath).then(refresh);
                }
                break;
            }
            case 'move-to-other-panel': {
                const target = dualPanel.getTargetExplorer();
                if (target && paths.length > 0) {
                    window.api.move(paths, target.currentPath).then(refresh);
                }
                break;
            }
            case 'batch-rename': {
                const explorer = dualPanel.getActiveExplorer();
                if (explorer) {
                    const selected = [...explorer.selectedPaths];
                    const files = explorer.entries
                        .filter(e => selected.includes(e.path) && !e.isDirectory)
                        .map(e => ({ path: e.path, name: e.name }));
                    if (files.length >= 2) batchRenameModal.open(files);
                }
                break;
            }

            case 'set-tag': {
                if (path && action.tagColor) {
                    window.api.setFileTag(path, action.tagColor, '').then(() => {
                        dualPanel.getActiveExplorer()?.refresh();
                    });
                }
                break;
            }

            case 'remove-tag': {
                if (path) {
                    window.api.removeFileTag(path).then(() => {
                        dualPanel.getActiveExplorer()?.refresh();
                    });
                }
                break;
            }
        }
    });
}

// ===== Keyboard Shortcuts =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Global Ctrl+` → Toggle Terminal (works from ANY tab, even in input fields)
        if (e.ctrlKey && e.key === '`') {
            e.preventDefault();
            e.stopPropagation();
            const cwd = dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
            globalTerminal.toggle(cwd);
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Global Ctrl+F → switch to Explorer + activate search
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if (state.activeTab !== 'explorer') {
                switchToTab('explorer');
            }
            const explorer = dualPanel.getActiveExplorer();
            if (explorer) explorer.activateOmnibar();
            return;
        }

        // Batch-Rename works in explorer tab too (Ctrl+Shift+F2)
        if (e.key === 'F2' && e.ctrlKey && e.shiftKey && state.activeTab === 'explorer') {
            e.preventDefault();
            const explorer = dualPanel.getActiveExplorer();
            if (explorer && explorer.selectedPaths.size >= 2) {
                const selected = [...explorer.selectedPaths];
                const files = explorer.entries
                    .filter(entry => selected.includes(entry.path) && !entry.isDirectory)
                    .map(entry => ({ path: entry.path, name: entry.name }));
                if (files.length >= 2) batchRenameModal.open(files);
            }
            return;
        }

        // Explorer tab handles its own keyboard shortcuts
        if (state.activeTab === 'explorer') return;

        const selectedPaths = treeView.getSelectedPaths ? treeView.getSelectedPaths() : [];
        const selected = selectedPaths.length > 0 ? selectedPaths[0] : treeView.getSelectedPath();
        const refresh = () => {
            if (state.currentScanId) {
                treeView.invalidateCache(state.currentPath);
                treeView.loadRoot();
            }
        };

        if (e.key === 'a' && e.ctrlKey) {
            e.preventDefault();
            if (treeView.selectAll) treeView.selectAll();
        } else if (e.key === 'p' && e.ctrlKey) {
            e.preventDefault();
            editorPanel.toggle();
        } else if (e.key === 'F2' && selected) {
            e.preventDefault();
            treeView.startInlineRename(selected);
        } else if (e.key === 'Delete' && selectedPaths.length > 0) {
            e.preventDefault();
            if (e.shiftKey) deletePermanent(selectedPaths, refresh);
            else deleteToTrash(selectedPaths, refresh);
        } else if (e.key === 'Delete' && selected) {
            e.preventDefault();
            if (e.shiftKey) deletePermanent([selected], refresh);
            else deleteToTrash([selected], refresh);
        } else if (e.key === 'c' && e.ctrlKey && selectedPaths.length > 0) {
            e.preventDefault();
            clipboardCopy(selectedPaths);
        } else if (e.key === 'x' && e.ctrlKey && selectedPaths.length > 0) {
            e.preventDefault();
            clipboardCut(selectedPaths);
        } else if (e.key === 'v' && e.ctrlKey) {
            e.preventDefault();
            clipboardPaste(selected || state.currentPath, refresh);
        }
    });
}

// ===== Theme =====
function loadTheme() {
    const saved = localStorage.getItem('speicher-analyse-theme');
    if (saved) document.documentElement.dataset.theme = saved;
    updateThemeIcons();
}

function setupThemeToggle() {
    els.themeToggle.onclick = toggleTheme;
}

function toggleTheme(forceTheme) {
    const current = document.documentElement.dataset.theme;
    const next = forceTheme || (current === 'dark' ? 'light' : 'dark');
    document.documentElement.dataset.theme = next;
    localStorage.setItem('speicher-analyse-theme', next);
    updateThemeIcons();
    fileTypeChart.updateTheme();
    editorPanel.setTheme(next);
    globalTerminal.updateTheme();
    // Persist to preferences (async, fire-and-forget)
    window.api.setPreference('theme', next).catch(() => {});
}

function updateThemeIcons() {
    const isDark = document.documentElement.dataset.theme !== 'light';
    els.iconMoon.style.display = isDark ? 'block' : 'none';
    els.iconSun.style.display = isDark ? 'none' : 'block';
}

// ===== Export =====
function setupExport() {
    els.exportCsvBtn.onclick = () => {
        if (state.currentScanId) exportCSV(state.currentScanId);
        else showToast('Bitte zuerst einen Scan durchführen', 'info');
    };
    els.exportPdfBtn.onclick = () => {
        if (state.currentScanId) exportPDF();
        else showToast('Bitte zuerst einen Scan durchführen', 'info');
    };
}

// ===== Preview Toggle =====
function setupPreviewToggle() {
    els.previewToggle.onclick = () => editorPanel.toggle();
}

// ===== Preview Panel Resize (Drag) =====
function setupPreviewResize() {
    const handle = document.getElementById('preview-resize-handle');
    const panel = document.getElementById('preview-panel');
    if (!handle || !panel) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
        // Ziehen nach links = Panel wird breiter (startX - e.clientX > 0)
        const delta = startX - e.clientX;
        const newWidth = Math.max(250, Math.min(window.innerWidth * 0.7, startWidth + delta));
        panel.style.width = newWidth + 'px';
    };

    const onMouseUp = () => {
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ===== Smart Layout (intelligente Fensteranordnung) =====
function setupSmartLayout() {
    const previewPanel = document.getElementById('preview-panel');
    const terminalGlobal = document.getElementById('terminal-global');
    let smartLayoutEnabled = true;

    // Preference laden
    window.api.getPreferences().then(prefs => {
        smartLayoutEnabled = prefs.smartLayout !== false;
        if (smartLayoutEnabled) applySmartLayout();
    }).catch(() => {});

    // Auf Einstellungs-Änderungen reagieren
    document.addEventListener('settings-pref-change', (e) => {
        if (e.detail?.key === 'smartLayout') {
            smartLayoutEnabled = e.detail.value;
            if (smartLayoutEnabled) applySmartLayout();
        }
    });

    const applySmartLayout = () => {
        if (!smartLayoutEnabled) return;
        const w = window.innerWidth;

        // Preview Panel Breite anpassen (nur wenn sichtbar)
        if (previewPanel && previewPanel.style.display !== 'none') {
            if (w < 1000) {
                previewPanel.style.width = '280px';
            } else if (w < 1400) {
                previewPanel.style.width = '320px';
            } else {
                previewPanel.style.width = '400px';
            }
        }

        // Terminal max-height anpassen
        const termPanel = terminalGlobal?.querySelector('.terminal-panel');
        if (termPanel) {
            if (w < 1000) {
                termPanel.style.maxHeight = '30vh';
            } else if (w < 1400) {
                termPanel.style.maxHeight = '35vh';
            } else {
                termPanel.style.maxHeight = '40vh';
            }
        }
    };

    window.addEventListener('resize', () => {
        if (smartLayoutEnabled) applySmartLayout();
    });
}

// ===== Properties Modal =====
function setupPropertiesModal() {
    els.propertiesClose.onclick = () => { els.propertiesModal.style.display = 'none'; };
    els.propertiesModal.onclick = (e) => {
        if (e.target === els.propertiesModal) els.propertiesModal.style.display = 'none';
    };
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.propertiesModal.style.display !== 'none') {
            els.propertiesModal.style.display = 'none';
        }
    });
}

// ===== Status Bar =====
function setStatus(text, loading = false) {
    const statusText = document.getElementById('status-text');
    const statusSpinner = document.getElementById('status-spinner');
    if (statusText) statusText.textContent = text;
    if (statusSpinner) statusSpinner.style.display = loading ? 'inline-block' : 'none';
}

// ===== Battery Monitoring =====
let lowBatteryWarningShown = false;

async function updateBatteryUI() {
    try {
        const backendStatus = await window.api.getBatteryStatus();
        let percentage = null;
        let isCharging = false;

        // Get detailed info from Web Battery API (Chromium)
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            percentage = Math.round(battery.level * 100);
            isCharging = battery.charging;
        }

        state.batteryInfo = {
            onBattery: backendStatus.onBattery,
            percentage,
            isCharging,
        };

        const badge = document.getElementById('battery-badge');
        const textEl = document.getElementById('battery-text');
        if (!badge) return;

        if (state.batteryInfo.onBattery && !isCharging) {
            badge.style.display = 'inline-flex';
            textEl.textContent = percentage !== null ? percentage + '%' : 'Akku';
            badge.classList.toggle('critical', percentage !== null && percentage < 20);

            // One-time low-battery warning during scan
            if (state.scanning && percentage !== null && percentage < 20 && !lowBatteryWarningShown) {
                lowBatteryWarningShown = true;
                showToast('Niedriger Akkustand: ' + percentage + '% - Netzteil anschliessen empfohlen', 'warning');
            }
        } else {
            badge.style.display = 'none';
        }
    } catch {
        // Battery API not available (e.g. desktop PC) - hide badge
        const badge = document.getElementById('battery-badge');
        if (badge) badge.style.display = 'none';
    }
}

// ===== System Score =====
async function calculateAndShowSystemScore() {
    try {
        const results = {};
        // Collect scores from already-loaded modules
        if (privacyView._loaded) results.privacy = { score: privacyView.getScore() };
        if (smartView._loaded) results.disks = smartView.getDisks();
        if (softwareAuditView._loaded) results.audit = softwareAuditView.getAuditData();
        // Run fresh if not loaded yet
        if (!results.privacy) {
            try {
                const settings = await window.api.getPrivacySettings();
                const priv = settings.filter(s => s.isPrivate).length;
                results.privacy = { score: settings.length > 0 ? Math.round((priv / settings.length) * 100) : 50 };
            } catch { results.privacy = { score: 50 }; }
        }
        if (!results.disks) {
            try { results.disks = await window.api.getDiskHealth(); } catch { results.disks = []; }
        }
        if (!results.audit) {
            try {
                const a = await window.api.auditSoftware();
                results.audit = { orphanedCount: a.orphanedCount || 0, totalPrograms: a.totalPrograms || 0 };
            } catch { results.audit = { orphanedCount: 0, totalPrograms: 0 }; }
        }
        const scoreData = await window.api.getSystemScore(results);
        systemScoreView.update(scoreData);
    } catch (err) {
        console.error('System score error:', err);
    }
}

// ===== Helpers =====
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ===== Start =====
init().catch(e => console.error('[app.js] init() error:', e));

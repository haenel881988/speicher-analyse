import { formatBytes, formatNumber, formatDuration, getCategoryClass, escapeHtml, escapeAttr } from './utils.js';
import { startScan, fetchDrives, setupScanListeners } from './scanner.js';
import { TreeView, showToast } from './tree.js';
import { TreemapView } from './treemap.js';
import { FileTypeChart } from './charts.js';
import { exportCSV, exportPDF } from './export.js';
import {
    clipboardCut, clipboardCopy, clipboardPaste,
    deleteToTrash, deletePermanent, createNewFolder, showProperties,
    getClipboard,
} from './file-manager.js';
import { OldFilesView } from './old-files.js';
import { DuplicatesView } from './duplicates.js';
import { CleanupView } from './cleanup.js';
import { EditorPanel } from './preview.js';
import { DashboardView } from './dashboard.js';
import { AutostartView } from './autostart.js';
import { ServicesView } from './services.js';
import { OptimizerView } from './optimizer.js';
import { UpdatesView } from './updates.js';
import { ExplorerDualPanel } from './explorer-dual-panel.js';
import { BatchRenameModal } from './batch-rename.js';
import { SettingsView } from './settings.js';
import { PrivacyView } from './privacy.js';
import { SmartView } from './smart.js';
import { SoftwareAuditView } from './software-audit.js';
import { NetworkView } from './network.js';
import { SecurityAuditView } from './security-audit.js';
import { SystemProfilView } from './system-profil.js';
import { HealthCheckView } from './health-check.js';
import { TerminalPanel } from './terminal-panel.js';
import { PdfEditorView } from './pdf-editor.js';
import { showContextMenu, closeContextMenu } from './context-menu.js';

// ===== Global Error Handlers (Dev-Logging) =====
window.addEventListener('error', (event) => {
    if (window.api?.logFrontend) {
        window.api.logFrontend('error', event.message || 'Unknown error',
            `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`);
    }
});
window.addEventListener('unhandledrejection', (event) => {
    if (window.api?.logFrontend) {
        const msg = event.reason?.message || event.reason?.toString() || 'Unhandled Promise rejection';
        const stack = event.reason?.stack?.split('\n')[1]?.trim() || '';
        window.api.logFrontend('error', msg, stack);
    }
});

// ===== State =====
const state = {
    drives: [],
    currentScanId: null,
    currentPath: null,
    activeTab: 'tree',
    scanning: false,
    capabilities: null,
    batteryInfo: null,
    batteryIntervalId: null,
};

// Track which tabs have been auto-loaded this session
const tabLoaded = {
    autostart: false,
    services: false,
    updates: false,
    duplicates: false,
    optimizer: false,
    settings: false,
    privacy: false,
    smart: false,
    'software-audit': false,
    network: false,
    'system-profil': false,
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
const dashboardView = new DashboardView(document.getElementById('view-dashboard'));
const autostartView = new AutostartView(document.getElementById('view-autostart'));
const servicesView = new ServicesView(document.getElementById('view-services'));
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
const securityAuditView = new SecurityAuditView(document.getElementById('view-security-audit'));
const systemProfilView = new SystemProfilView(document.getElementById('view-system-profil'));
const healthCheckView = new HealthCheckView(document.getElementById('view-health-check'));
const pdfEditorView = new PdfEditorView(document.getElementById('view-pdf-editor'));
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

// PDF-Editor: Öffnen via Event (von Preview, Kontextmenü, Doppelklick)
document.addEventListener('open-pdf-editor', async (e) => {
    const filePath = e.detail?.filePath;
    if (!filePath) return;
    switchTab('pdf-editor');
    await pdfEditorView.open(filePath);
});

// PDF-Editor: Zurück-Button → zum Explorer
document.addEventListener('pdf-editor-close', () => {
    switchTab('explorer');
});

// Wire embedded terminal events from main process (opens global terminal)
window.api?.onOpenEmbeddedTerminal(({ path }) => {
    globalTerminal.show(path);
});

// Wire toggle-global-terminal event (from explorer-dual-panel delegation)
document.addEventListener('toggle-global-terminal', (e) => {
    const cwd = e.detail?.cwd || dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.toggle(cwd);
});

// Wire menu bar "Terminal" actions from main process
window.api?.onToggleTerminal?.(() => {
    const cwd = dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.toggle(cwd);
});
window.api?.onNewTerminal?.(() => {
    const cwd = dualPanel.getActiveExplorer()?.currentPath || 'C:\\';
    globalTerminal.destroy().then(() => globalTerminal.show(cwd));
});

// Wire menu bar "Über" action
window.api?.onMenuAction?.((data) => {
    if (data.action === 'about') {
        window.api.showConfirmDialog({
            title: 'Über Speicher Analyse',
            message: 'Speicher Analyse v7.2.1\nDisk Space Analyzer & System Optimizer\n\nTauri v2 + Rust Backend',
            okLabel: 'OK'
        });
    }
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
    setupSidebarResize();
    setupPreviewResize();
    setupSmartLayout();
    setupTopFilesFilters();
    await autostartView.init();
    await servicesView.init();
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
    state.batteryIntervalId = setInterval(updateBatteryUI, batteryInterval);

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
            console.log('[Session] Prüfe auf gespeicherte Session...');
            const restored = await window.api.getRestoredSession();
            if (restored && restored.sessions && restored.sessions.length > 0) {
                const progress = restored.sessions[0];
                console.log(`[Session] Session gefunden: ${progress.files_found} Dateien, ${progress.dirs_scanned} Ordner`);
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
                // Views laden (ohne Post-Analyse zunächst)
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
                showToast(`Scan von ${progress.current_path} wiederhergestellt — ${formatNumber(progress.dirs_scanned)} Ordner, ${formatNumber(progress.files_found)} Dateien`);
                setTimeout(() => els.scanProgress.classList.remove('active'), 3000);

                // Dashboard-Analyse im Hintergrund starten (ohne Tab-Wechsel)
                runPostScanAnalysis(false).catch(err =>
                    console.error('[Session] Post-Analyse nach Restore fehlgeschlagen:', err)
                );
            } else {
                console.log('[Session] Keine Session-Daten vorhanden (Datei fehlt oder leer)');
            }

            // Pending-Action-Ergebnis nach Admin-Neustart anzeigen
            if (restored && restored.pendingAction) {
                const pa = restored.pendingAction;
                if (pa.action === 'fix-sideloading') {
                    if (pa.success) {
                        showToast('App-Sideloading wurde erfolgreich repariert!', 'success');
                    } else {
                        showToast('Sideloading-Reparatur fehlgeschlagen: ' + (pa.error || 'Unbekannter Fehler'), 'error');
                    }
                }
            }
        } catch (err) {
            console.error('[Session] Restore FEHLER:', err);
        }
    }

    // Cross-view navigation (z.B. Privacy → Netzwerk)
    document.addEventListener('navigate-to-tab', (e) => {
        if (e.detail?.tab) switchToTab(e.detail.tab);
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
        // Reuse drives from Explorer if already loaded (avoid duplicate Win32_LogicalDisk query)
        const explorer = dualPanel?.getActiveExplorer?.();
        if (explorer?.drives?.length > 0) {
            state.drives = explorer.drives;
        } else {
            state.drives = await fetchDrives();
        }
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
        // WICHTIG: Listener ZUERST registrieren, DANN Scan starten
        // Sonst Race-Condition: Events kommen an bevor Listener bereit sind
        setupScanListeners(
            (progress) => updateProgress(progress),
            (progress) => onScanComplete(progress),
            (error) => onScanError(error),
        );

        const { scan_id } = await startScan(drivePath);
        state.currentScanId = scan_id;

        els.scanProgress.classList.add('active');
        els.progressBar.classList.add('animating');
        els.welcomeState.style.display = 'none';
        els.treeContent.style.display = 'none';
        setStatus('Laufwerk wird gescannt...', true);
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

    // Tree + Treemap sofort starten (nicht-blockierend, zeigt Verzeichnisse sofort)
    treeView.init(state.currentScanId, state.currentPath);
    treemapView.init(state.currentScanId, state.currentPath);

    // Charts + Top-Dateien + Tool-Views parallel laden (blockiert Tree nicht)
    await Promise.allSettled([
        fileTypeChart.init(state.currentScanId).then(() => {
            fileTypeChart.setupTableSort(els.typeTable);
            fileTypeChart.setupDetailPanel();
        }),
        loadTopFiles(),
    ]);

    // Init tool views with current scan (schnell, nur IDs setzen)
    oldFilesView.init(state.currentScanId);
    duplicatesView.init(state.currentScanId);
    cleanupView.init(state.currentScanId);
    // Init dashboard
    dashboardView.init(state.currentScanId, state.lastScanProgress || {});

    // Post-scan analysis: nur bei frischem Scan, NICHT bei Session-Restore
    // (vermeidet CPU-Spike beim Start + ungewollten Tab-Wechsel zu Dashboard)
    if (!skipPostAnalysis) {
        runPostScanAnalysis();
    }
}

async function runPostScanAnalysis(switchToDashboard = true) {
    setStatus('Analyse wird durchgeführt...', true);
    const [cleanup, oldFiles, optimizer, sizeDuplicates] = await Promise.allSettled([
        cleanupView.autoScan(),
        oldFilesView.autoSearch(),
        optimizerView.autoScan(),
        window.api.getSizeDuplicates(state.currentScanId, 1024),
    ]);
    dashboardView.updateResults({ cleanup, oldFiles, optimizer, sizeDuplicates });
    setStatus('Bereit');
    if (switchToDashboard) {
        switchToTab('dashboard');
    }
    // dirFiles bleibt im Speicher für Duplikate, Suche, Session-Persistenz
}

function switchToTab(tabName) {
    // Auto-Live: Netzwerk-Polling stoppen wenn der Tab verlassen wird
    if (state.activeTab === 'network' && tabName !== 'network') {
        networkView.deactivate();
    }

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

    // Auto-Live: Netzwerk-Polling starten wenn der Tab betreten wird (bereits geladen)
    if (tabName === 'network' && tabLoaded.network) {
        networkView.activate();
    }

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

    try {
        switch (tabName) {
            case 'autostart':
                setStatus('Autostart wird geladen...', true);
                await autostartView.scan();
                tabLoaded.autostart = true;
                setStatus('Bereit');
                break;
            case 'services':
                setStatus('Dienste werden geladen...', true);
                await servicesView.load();
                tabLoaded.services = true;
                setStatus('Bereit');
                break;
            case 'updates':
                setStatus('Updates werden geprüft...', true);
                await updatesView.checkAll();
                tabLoaded.updates = true;
                setStatus('Bereit');
                break;
            case 'duplicates':
                // Duplikat-Scan bleibt manuell (braucht dirFiles, die nach Analyse freigegeben werden)
                break;
            case 'optimizer':
                if (!optimizerView._cache) {
                    setStatus('System wird analysiert...', true);
                    await optimizerView.scan();
                    tabLoaded.optimizer = true;
                    setStatus('Bereit');
                }
                break;
            case 'settings':
                await settingsView.load();
                tabLoaded.settings = true;
                break;
            case 'privacy':
                setStatus('Datenschutz wird analysiert...', true);
                await privacyView.init();
                tabLoaded.privacy = true;
                setStatus('Bereit');
                break;
            case 'smart':
                setStatus('Festplatten werden geprüft...', true);
                await smartView.init();
                tabLoaded.smart = true;
                setStatus('Bereit');
                break;
            case 'software-audit':
                setStatus('Software wird analysiert...', true);
                await softwareAuditView.init();
                tabLoaded['software-audit'] = true;
                setStatus('Bereit');
                break;
            case 'security-audit':
                setStatus('Sicherheits-Check wird geladen...', true);
                await securityAuditView.init();
                tabLoaded['security-audit'] = true;
                setStatus('Bereit');
                break;
            case 'network':
                setStatus('Netzwerk wird analysiert...', true);
                await networkView.init();
                tabLoaded.network = true;
                setStatus('Bereit');
                networkView.activate(); // Auto-Live: Polling starten nach erstem Laden
                break;
            case 'system-profil':
                setStatus('System-Profil wird geladen...', true);
                await systemProfilView.init();
                tabLoaded['system-profil'] = true;
                setStatus('Bereit');
                break;
            case 'health-check':
                setStatus('PC-Diagnose wird geladen...', true);
                await healthCheckView.init();
                tabLoaded['health-check'] = true;
                setStatus('Bereit');
                break;
            case 'pdf-editor':
                // PDF-Editor wird separat über open() gesteuert
                break;
        }
    } catch (e) {
        console.error(`Tab '${tabName}' laden fehlgeschlagen:`, e);
        setStatus('Bereit');
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
            case 'security-audit':
                securityAuditView._loaded = false;
                await securityAuditView.init();
                break;
            case 'health-check':
                healthCheckView._loaded = false;
                healthCheckView._results = null;
                await healthCheckView.init();
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
                <td class="type-col"><span class="category-badge ${catClass}">${escapeHtml(file.extension || '-')}</span></td>
                <td class="age-col">${age}</td>
                <td class="size-col">${formatBytes(file.size)}</td>
            </tr>
        `;
    }).join('');

    els.topFilesBody.querySelectorAll('tr').forEach(row => {
        row.style.cursor = 'context-menu';
        row.oncontextmenu = (e) => {
            e.preventDefault();
            handleContextMenu('file', { path: row.dataset.path, name: row.dataset.name }, e);
        };
        row.ondblclick = () => {
            const p = row.dataset.path;
            if (p && p.toLowerCase().endsWith('.pdf')) {
                document.dispatchEvent(new CustomEvent('open-pdf-editor', { detail: { filePath: p } }));
            } else {
                window.api.openFile(p);
            }
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
function handleContextMenu(type, context, event) {
    if (!event) return;
    const clipboardHasItems = getClipboard().paths.length > 0;
    showContextMenu(event.clientX, event.clientY, type, context, (actionObj) => {
        executeContextAction(actionObj);
    }, { clipboardHasItems });
}

function executeContextAction(action) {
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
            case 'edit-pdf':
                document.dispatchEvent(new CustomEvent('open-pdf-editor', { detail: { filePath: path } }));
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
            case 'run-as-admin':
                if (path) {
                    window.api.runAsAdmin(path).then(result => {
                        if (!result.success) {
                            showToast(result.error || 'Fehler beim Starten als Administrator', 'error');
                        }
                    }).catch(e => showToast(e.message || String(e), 'error'));
                }
                break;
            case 'extract-here':
                if (path) {
                    showToast('Entpacke...', 'info');
                    window.api.extractArchive(path).then(result => {
                        if (result.success) {
                            showToast(`Entpackt nach ${result.destination}`, 'success');
                            refresh();
                        } else {
                            showToast(result.error || 'Fehler beim Entpacken', 'error');
                        }
                    }).catch(e => showToast(e.message || String(e), 'error'));
                }
                break;
            case 'extract-to':
                if (path) {
                    window.api.showSaveDialog({ directory: true, title: 'Zielordner wählen' }).then(dest => {
                        if (dest && !dest.canceled && dest.path) {
                            showToast('Entpacke...', 'info');
                            window.api.extractArchive(path, dest.path).then(result => {
                                if (result.success) {
                                    showToast(`Entpackt nach ${result.destination}`, 'success');
                                    refresh();
                                } else {
                                    showToast(result.error || 'Fehler beim Entpacken', 'error');
                                }
                            }).catch(e => showToast(e.message || String(e), 'error'));
                        }
                    }).catch(e => showToast(e.message || String(e), 'error'));
                }
                break;
            case 'compress-zip':
                if (paths.length > 0 || path) {
                    const sourcePaths = paths.length > 0 ? paths : [path];
                    showToast('Komprimiere...', 'info');
                    window.api.createArchive(sourcePaths).then(result => {
                        if (result.success) {
                            const sizeStr = formatBytes(result.size);
                            showToast(`ZIP erstellt: ${result.destination} (${sizeStr})`, 'success');
                            refresh();
                        } else {
                            showToast(result.error || 'Fehler beim Komprimieren', 'error');
                        }
                    }).catch(e => showToast(e.message || String(e), 'error'));
                }
                break;
            case 'calculate-folder-size':
                if (path) {
                    window.api.calculateFolderSize(path).then(result => {
                        showToast(`${formatBytes(result.totalSize)} (${formatNumber(result.fileCount)} Dateien, ${formatNumber(result.dirCount)} Ordner)`, 'info');
                    }).catch(e => showToast(e.message || String(e), 'error'));
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
}

function setupContextMenuActions() {
    // Legacy event listener for backward compatibility (Rust-emitted events)
    window.api?.onContextMenuAction?.((action) => {
        executeContextAction(action);
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

// ===== Sidebar Resize (Drag) =====
function setupSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const sidebar = document.getElementById('sidebar');
    if (!handle || !sidebar) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
        const delta = e.clientX - startX;
        const newWidth = Math.max(140, Math.min(400, startWidth + delta));
        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = newWidth + 'px';
    };

    const onMouseUp = () => {
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Persist width
        if (sidebar.style.width) {
            localStorage.setItem('speicher-analyse-sidebar-width', sidebar.style.width);
        }
    };

    handle.addEventListener('mousedown', (e) => {
        if (!sidebar.classList.contains('expanded')) return;
        e.preventDefault();
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        // Signal to SmartLayout: user has manually resized
        document.dispatchEvent(new CustomEvent('sidebar-manual-resize'));
    });

    // Restore saved width
    const savedWidth = localStorage.getItem('speicher-analyse-sidebar-width');
    if (savedWidth && sidebar.classList.contains('expanded')) {
        sidebar.style.width = savedWidth;
        sidebar.style.minWidth = savedWidth;
    }

    // Reset custom width when sidebar is collapsed
    const observer = new MutationObserver(() => {
        if (!sidebar.classList.contains('expanded')) {
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
        } else {
            // Restore saved width when re-expanded
            const w = localStorage.getItem('speicher-analyse-sidebar-width');
            if (w) {
                sidebar.style.width = w;
                sidebar.style.minWidth = w;
            }
        }
    });
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
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
        // Persist width
        if (panel.style.width) {
            localStorage.setItem('speicher-analyse-preview-width', panel.style.width);
        }
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
        // Signal to SmartLayout: user has manually resized preview
        document.dispatchEvent(new CustomEvent('preview-manual-resize'));
    });

    // Restore saved width
    const savedWidth = localStorage.getItem('speicher-analyse-preview-width');
    if (savedWidth) {
        panel.style.width = savedWidth;
    }
}

// ===== Smart Layout (intelligente Fensteranordnung) =====
function setupSmartLayout() {
    const sidebar = document.getElementById('sidebar');
    const appEl = document.getElementById('app');
    const previewPanel = document.getElementById('preview-panel');
    const terminalGlobal = document.getElementById('terminal-global');
    let smartLayoutEnabled = true;
    let userToggledSidebar = false;
    let userResizedPreview = localStorage.getItem('speicher-analyse-preview-width') !== null;

    // Manuelle Sidebar-Toggles erkennen → Smart Layout greift dann nicht in Sidebar ein
    const sidebarToggle = sidebar?.querySelector('.sidebar-toggle-btn');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => { userToggledSidebar = true; });
    }
    document.addEventListener('sidebar-manual-resize', () => { userToggledSidebar = true; });
    document.addEventListener('preview-manual-resize', () => { userResizedPreview = true; });

    // Preference laden
    window.api.getPreferences().then(prefs => {
        smartLayoutEnabled = prefs.smartLayout !== false;
        if (smartLayoutEnabled) applySmartLayout();
    }).catch(() => {});

    // Auf Einstellungs-Änderungen reagieren
    document.addEventListener('settings-pref-change', (e) => {
        if (e.detail?.key === 'smartLayout') {
            smartLayoutEnabled = e.detail.value;
            if (smartLayoutEnabled) {
                userToggledSidebar = false;
                userResizedPreview = false;
                localStorage.removeItem('speicher-analyse-preview-width');
                applySmartLayout();
            } else {
                appEl?.classList.remove('smart-layout-narrow', 'smart-layout-wide');
            }
        }
    });

    const applySmartLayout = () => {
        if (!smartLayoutEnabled) return;
        const w = window.innerWidth;

        // 1. CSS-Klassen auf #app für responsive Grid/Padding
        appEl?.classList.toggle('smart-layout-narrow', w < 1000);
        appEl?.classList.toggle('smart-layout-wide', w >= 1400);

        // 2. Sidebar auto-collapse/expand (nur wenn User nicht manuell umgeschaltet hat)
        if (sidebar && !userToggledSidebar) {
            if (w < 1000) {
                sidebar.classList.remove('expanded');
            } else if (w >= 1400) {
                sidebar.classList.add('expanded');
            }
        }

        // 3. Preview Panel Breite anpassen (nur wenn sichtbar und nicht manuell skaliert)
        if (previewPanel && previewPanel.style.display !== 'none' && !userResizedPreview) {
            if (w < 1000) previewPanel.style.width = '280px';
            else if (w < 1400) previewPanel.style.width = '320px';
            else previewPanel.style.width = '400px';
        }

        // 4. Terminal max-height anpassen (nur wenn vorhanden)
        const termPanel = terminalGlobal?.querySelector('.terminal-panel');
        if (termPanel) {
            if (w < 1000) termPanel.style.maxHeight = '30vh';
            else if (w < 1400) termPanel.style.maxHeight = '35vh';
            else termPanel.style.maxHeight = '40vh';
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

        // Desktop-PC without battery: stop polling permanently (L-1/M-5)
        if (backendStatus.hasBattery === false) {
            if (state.batteryIntervalId) {
                clearInterval(state.batteryIntervalId);
                state.batteryIntervalId = null;
            }
            state.batteryInfo = { onBattery: false, percentage: null, isCharging: false };
            const badge = document.getElementById('battery-badge');
            if (badge) badge.style.display = 'none';
            return;
        }

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
                showToast('Niedriger Akkustand: ' + percentage + '% - Netzteil anschließen empfohlen', 'warning');
            }
        } else {
            badge.style.display = 'none';
        }
    } catch {
        // Battery API not available - stop polling and hide badge
        if (state.batteryIntervalId) {
            clearInterval(state.batteryIntervalId);
            state.batteryIntervalId = null;
        }
        const badge = document.getElementById('battery-badge');
        if (badge) badge.style.display = 'none';
    }
}

// ===== Helpers =====
// escapeHtml + escapeAttr importiert aus utils.js

// ===== Start =====
init().catch(e => console.error('[app.js] init() error:', e));

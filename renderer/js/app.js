import { formatBytes, formatNumber, formatDuration, getCategoryClass } from './utils.js';
import { startScan, fetchDrives, setupScanListeners } from './scanner.js';
import { TreeView, showToast } from './tree.js';
import { TreemapView } from './treemap.js';
import { FileTypeChart } from './charts.js';
import { SearchPanel } from './search.js';
import { exportCSV, exportPDF } from './export.js';
import {
    clipboardCut, clipboardCopy, clipboardPaste,
    deleteToTrash, deletePermanent, createNewFolder, showProperties,
} from './file-manager.js';
import { OldFilesView } from './old-files.js';
import { DuplicatesView } from './duplicates.js';
import { CleanupView } from './cleanup.js';
import { ScanCompareView } from './scan-compare.js';
import { PreviewPanel } from './preview.js';
import { RegistryView } from './registry.js';
import { DashboardView } from './dashboard.js';
import { AutostartView } from './autostart.js';
import { ServicesView } from './services.js';
import { BloatwareView } from './bloatware.js';
import { OptimizerView } from './optimizer.js';
import { UpdatesView } from './updates.js';

// ===== State =====
const state = {
    drives: [],
    currentScanId: null,
    currentPath: null,
    activeTab: 'tree',
    scanning: false,
};

// Track which tabs have been auto-loaded this session
const tabLoaded = {
    autostart: false,
    services: false,
    bloatware: false,
    updates: false,
    duplicates: false,
    optimizer: false,
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
    searchInput: document.getElementById('search-input'),
    searchMinSize: document.getElementById('search-min-size'),
    searchResults: document.getElementById('search-results'),
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
const searchPanel = new SearchPanel(els.searchInput, els.searchMinSize, els.searchResults, handleSearchNavigate);
const previewPanel = new PreviewPanel(els.previewContent, els.previewTitle, els.previewClose);

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

// Wire context menu callbacks
treeView.onContextMenu = handleContextMenu;
treemapView.onContextMenu = handleContextMenu;
searchPanel.onContextMenu = handleContextMenu;
fileTypeChart.onContextMenu = handleContextMenu;

// ===== Init =====
async function init() {
    loadTheme();
    setupSidebar();
    setupToolbar();
    setupExport();
    setupThemeToggle();
    setupPropertiesModal();
    setupContextMenuActions();
    setupKeyboardShortcuts();
    setupPreviewToggle();
    setupTopFilesFilters();
    await registryView.init();
    await autostartView.init();
    await servicesView.init();
    await bloatwareView.init();
    await optimizerView.init();
    await updatesView.init();
    dashboardView.onNavigate = (tab) => switchToTab(tab);
    await loadDrives();

    // Auto-scan C: drive on startup
    const cDrive = state.drives.find(d => d.mountpoint.toUpperCase().startsWith('C'));
    if (cDrive) {
        selectDriveByPath(cDrive.mountpoint);
    }
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
    state.scanning = true;
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
    searchPanel.enable(state.currentScanId);
    setStatus('Daten werden geladen...', true);
    await loadAllViews();
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
async function loadAllViews() {
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

    // Init dashboard and run post-scan analysis
    dashboardView.init(state.currentScanId, state.lastScanProgress || {});
    runPostScanAnalysis();
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

    // Switch content view
    els.tabContent.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + tabName);
    if (view) view.classList.add('active');

    if (tabName === 'treemap' && state.currentScanId) {
        setTimeout(() => treemapView.render(treemapView.rootPath), 50);
    }

    // Auto-load data when tab is clicked
    autoLoadTab(tabName);
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
    }
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
            if (previewPanel.isVisible()) {
                previewPanel.show(row.dataset.path);
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
            if (state.currentScanId) {
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
                createNewFolder(path || state.currentPath, refresh);
                break;
            case 'rename':
                if (path) treeView.startInlineRename(path);
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
        }
    });
}

// ===== Keyboard Shortcuts =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

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
            previewPanel.toggle();
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

function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('speicher-analyse-theme', next);
    updateThemeIcons();
    fileTypeChart.updateTheme();
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
    els.previewToggle.onclick = () => previewPanel.toggle();
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

// ===== Search Navigate =====
function handleSearchNavigate(path, isDir) {
    if (isDir) {
        switchToTab('tree');
        treeView.rootPath = path;
        treeView.loadRoot();
    } else if (previewPanel.isVisible()) {
        previewPanel.show(path);
    }
}

// ===== Status Bar =====
function setStatus(text, loading = false) {
    const statusText = document.getElementById('status-text');
    const statusSpinner = document.getElementById('status-spinner');
    if (statusText) statusText.textContent = text;
    if (statusSpinner) statusSpinner.style.display = loading ? 'inline-block' : 'none';
}

// ===== Helpers =====
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ===== Start =====
init();

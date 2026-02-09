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

// ===== State =====
const state = {
    drives: [],
    currentScanId: null,
    currentPath: null,
    activeTab: 'tree',
    activeRibbon: 'start',
    scanning: false,
};

// ===== DOM =====
const els = {
    ribbonDrives: document.getElementById('ribbon-drives'),
    ribbonScanBtn: document.getElementById('ribbon-scan-btn'),
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
    exportCsvBtn: document.getElementById('ribbon-export-csv'),
    exportPdfBtn: document.getElementById('ribbon-export-pdf'),
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

// Wire context menu callbacks
treeView.onContextMenu = handleContextMenu;
treemapView.onContextMenu = handleContextMenu;
searchPanel.onContextMenu = handleContextMenu;

// ===== Init =====
async function init() {
    loadTheme();
    setupRibbon();
    setupExport();
    setupThemeToggle();
    setupPropertiesModal();
    setupContextMenuActions();
    setupKeyboardShortcuts();
    setupPreviewToggle();
    setupScanButton();
    await registryView.init();
    await autostartView.init();
    await servicesView.init();
    await bloatwareView.init();
    dashboardView.onNavigate = (tab) => switchToTab(tab);
    await loadDrives();
}

// ===== Ribbon =====
function setupRibbon() {
    // Ribbon tab switching
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.onclick = () => {
            const ribbon = tab.dataset.ribbon;
            if (ribbon === state.activeRibbon) return;
            state.activeRibbon = ribbon;
            document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.remove('active'));
            const panel = document.querySelector(`.ribbon-panel[data-ribbon-panel="${ribbon}"]`);
            if (panel) panel.classList.add('active');
        };
    });

    // Ribbon content-tab buttons (data-tab attribute)
    document.querySelectorAll('.ribbon-btn[data-tab]').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            switchToTab(tab);
        };
    });
}

function setupScanButton() {
    els.ribbonScanBtn.onclick = () => {
        if (state.scanning) return;
        // Default: scan C: or the first available drive
        const defaultDrive = state.drives.find(d => d.mountpoint.toUpperCase().startsWith('C')) || state.drives[0];
        if (!defaultDrive) {
            showToast('Kein Laufwerk gefunden', 'error');
            return;
        }
        const driveEl = els.ribbonDrives.querySelector(`.ribbon-drive[data-path="${defaultDrive.mountpoint}"]`);
        if (driveEl) {
            selectDrive(driveEl, defaultDrive.mountpoint);
        }
    };
}

// ===== Drives (Ribbon) =====
async function loadDrives() {
    try {
        state.drives = await fetchDrives();
        renderDrives();
    } catch (e) {
        els.ribbonDrives.innerHTML = '<span style="color:var(--danger);font-size:11px">Fehler</span>';
    }
}

function renderDrives() {
    els.ribbonDrives.innerHTML = state.drives.map(drive => {
        const isCritical = drive.percent > 90;
        return `
            <div class="ribbon-drive" data-path="${drive.mountpoint}" title="${drive.device} - ${formatBytes(drive.used)} / ${formatBytes(drive.total)} (${drive.fstype})">
                <div class="ribbon-drive-icon">${getDriveIcon(drive)}</div>
                <div class="ribbon-drive-label">${drive.mountpoint.replace('\\', '')}</div>
                <div class="ribbon-drive-bar">
                    <div class="ribbon-drive-bar-fill ${isCritical ? 'critical' : ''}" style="width:${drive.percent}%"></div>
                </div>
            </div>
        `;
    }).join('');

    els.ribbonDrives.querySelectorAll('.ribbon-drive').forEach(card => {
        card.onclick = () => {
            if (state.scanning) return;
            selectDrive(card, card.dataset.path);
        };
    });
}

function getDriveIcon(drive) {
    const d = drive.device.toUpperCase();
    if (d.includes('C:')) return '\uD83D\uDCBB';
    if (drive.fstype === 'CDFS' || drive.fstype === 'UDF') return '\uD83D\uDCBF';
    return '\uD83D\uDCBE';
}

async function selectDrive(cardEl, path) {
    els.ribbonDrives.querySelectorAll('.ribbon-drive').forEach(c => c.classList.remove('active', 'scanning'));
    cardEl.classList.add('active', 'scanning');

    state.scanning = true;
    state.currentPath = path;
    els.ribbonScanBtn.disabled = true;

    try {
        const { scan_id } = await startScan(path);
        state.currentScanId = scan_id;

        els.scanProgress.classList.add('active');
        els.welcomeState.style.display = 'none';
        els.treeContent.style.display = 'none';

        setupScanListeners(
            (progress) => updateProgress(progress),
            (progress) => onScanComplete(progress, cardEl),
            (error) => onScanError(error, cardEl),
        );
    } catch (e) {
        console.error('Scan start error:', e);
        cardEl.classList.remove('scanning');
        state.scanning = false;
        els.ribbonScanBtn.disabled = false;
    }
}

function updateProgress(progress) {
    els.progressStats.textContent =
        `${formatNumber(progress.dirs_scanned)} Ordner \u00B7 ${formatNumber(progress.files_found)} Dateien \u00B7 ${formatBytes(progress.total_size)} \u00B7 ${formatDuration(progress.elapsed_seconds)}`;
    els.progressPath.textContent = progress.current_path;
    els.progressBar.style.width = '100%';
}

async function onScanComplete(progress, cardEl) {
    state.scanning = false;
    cardEl.classList.remove('scanning');
    els.ribbonScanBtn.disabled = false;

    els.progressStats.textContent =
        `Fertig! ${formatNumber(progress.dirs_scanned)} Ordner \u00B7 ${formatNumber(progress.files_found)} Dateien \u00B7 ${formatBytes(progress.total_size)} \u00B7 ${formatDuration(progress.elapsed_seconds)}` +
        (progress.errors_count > 0 ? ` \u00B7 ${progress.errors_count} Fehler` : '');
    els.progressBar.style.width = '100%';
    els.progressBar.style.animation = 'none';

    state.lastScanProgress = progress;
    searchPanel.enable(state.currentScanId);
    await loadAllViews();

    setTimeout(() => els.scanProgress.classList.remove('active'), 3000);
}

function onScanError(error, cardEl) {
    state.scanning = false;
    cardEl.classList.remove('scanning');
    els.ribbonScanBtn.disabled = false;
    els.progressStats.textContent = 'Fehler: ' + (error.current_path || 'Unbekannt');
    els.progressBar.style.width = '0%';
    els.progressBar.style.animation = 'none';
}

// ===== Load Views =====
async function loadAllViews() {
    els.treeContent.style.display = 'block';
    els.welcomeState.style.display = 'none';
    treeView.init(state.currentScanId, state.currentPath);
    treemapView.init(state.currentScanId, state.currentPath);
    await fileTypeChart.init(state.currentScanId);
    fileTypeChart.setupTableSort(els.typeTable);
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
    const [cleanup, oldFiles, registry] = await Promise.allSettled([
        cleanupView.autoScan(),
        oldFilesView.autoSearch(),
        registryView.autoScan(),
    ]);
    dashboardView.updateResults({ cleanup, oldFiles, registry });
    switchToTab('dashboard');
}

function switchToTab(tabName) {
    state.activeTab = tabName;

    // Update ribbon button highlights
    document.querySelectorAll('.ribbon-btn[data-tab]').forEach(b => b.classList.remove('active'));
    const ribbonBtn = document.querySelector(`.ribbon-btn[data-tab="${tabName}"]`);
    if (ribbonBtn) ribbonBtn.classList.add('active');

    // Switch content view
    els.tabContent.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + tabName);
    if (view) view.classList.add('active');

    // Auto-switch ribbon panel to match the tab
    const ribbonMap = {
        'dashboard': 'start', 'compare': 'start',
        'tree': 'analyse', 'treemap': 'analyse', 'types': 'analyse', 'top100': 'analyse', 'duplicates': 'analyse',
        'cleanup': 'bereinigung', 'old-files': 'bereinigung', 'registry': 'bereinigung', 'bloatware': 'bereinigung',
        'autostart': 'system', 'services': 'system',
    };
    const targetRibbon = ribbonMap[tabName];
    if (targetRibbon && targetRibbon !== state.activeRibbon) {
        state.activeRibbon = targetRibbon;
        document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.ribbon-tab[data-ribbon="${targetRibbon}"]`);
        if (tab) tab.classList.add('active');
        document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.remove('active'));
        const panel = document.querySelector(`.ribbon-panel[data-ribbon-panel="${targetRibbon}"]`);
        if (panel) panel.classList.add('active');
    }

    if (tabName === 'treemap' && state.currentScanId) {
        setTimeout(() => treemapView.render(treemapView.rootPath), 50);
    }
}

async function loadTopFiles() {
    try {
        const files = await window.api.getTopFiles(state.currentScanId, 100);
        renderTopFiles(files);
    } catch (e) { console.error('Error loading top files:', e); }
}

function renderTopFiles(files) {
    els.topFilesBody.innerHTML = files.map((file, i) => {
        const dirPath = file.path.substring(0, Math.max(file.path.lastIndexOf('\\'), file.path.lastIndexOf('/')));
        const catClass = getCategoryClass(getCategoryForExt(file.extension));
        return `
            <tr data-path="${escapeAttr(file.path)}" data-name="${escapeAttr(file.name)}">
                <td class="rank-col">${i + 1}</td>
                <td class="name-col" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</td>
                <td class="path-col" title="${escapeHtml(dirPath)}">${escapeHtml(dirPath)}</td>
                <td class="type-col"><span class="category-badge ${catClass}">${file.extension || '-'}</span></td>
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

// ===== Helpers =====
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ===== Start =====
init();

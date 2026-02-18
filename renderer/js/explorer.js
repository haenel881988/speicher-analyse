import { formatBytes, escapeHtml } from './utils.js';

// Quick Access SVG icons
const QA_ICONS = {
    desktop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    documents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    downloads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    pictures: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    videos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
};

// SVG file type icons (16x16, stroke-based, inherits color from CSS)
const FILE_TYPE_ICONS = {
    // Documents
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" text-anchor="middle" font-size="6" fill="currentColor" stroke="none" font-weight="bold">PDF</text></svg>',
    document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    spreadsheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="12" y1="11" x2="12" y2="19"/></svg>',
    // Images
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    // Audio
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    // Video
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    // Archives
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>',
    // Code
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>',
    // Executables
    exe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10 8 16 12 10 16"/></svg>',
    // System / Config
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    // Database
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    // Font
    font: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    // Generic file
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    // Folder
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    folderOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 01-2-2V5a2 2 0 012-2h4l2 3h9a2 2 0 012 2v1M5 19h14a2 2 0 002-2l1-7H7.5"/></svg>',
};

const EXT_TO_ICON = {
    // Documents
    '.pdf': 'pdf', '.doc': 'document', '.docx': 'document', '.odt': 'document', '.rtf': 'document',
    '.txt': 'document', '.md': 'document', '.epub': 'document',
    // Spreadsheets
    '.xls': 'spreadsheet', '.xlsx': 'spreadsheet', '.ods': 'spreadsheet', '.csv': 'spreadsheet',
    // Presentations
    '.ppt': 'document', '.pptx': 'document', '.odp': 'document',
    // Images
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.bmp': 'image',
    '.svg': 'image', '.webp': 'image', '.ico': 'image', '.tiff': 'image', '.tif': 'image',
    '.heic': 'image', '.avif': 'image', '.raw': 'image', '.psd': 'image',
    // Audio
    '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio', '.ogg': 'audio',
    '.wma': 'audio', '.m4a': 'audio', '.opus': 'audio',
    // Video
    '.mp4': 'video', '.avi': 'video', '.mkv': 'video', '.mov': 'video', '.wmv': 'video',
    '.flv': 'video', '.webm': 'video', '.m4v': 'video', '.mpg': 'video', '.mpeg': 'video',
    // Archives
    '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
    '.bz2': 'archive', '.xz': 'archive', '.zst': 'archive', '.cab': 'archive', '.iso': 'archive',
    // Code
    '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code', '.py': 'code', '.rs': 'code',
    '.java': 'code', '.c': 'code', '.cpp': 'code', '.h': 'code', '.hpp': 'code', '.cs': 'code',
    '.go': 'code', '.rb': 'code', '.php': 'code', '.swift': 'code', '.kt': 'code',
    '.html': 'code', '.css': 'code', '.scss': 'code', '.less': 'code',
    '.json': 'code', '.xml': 'code', '.yaml': 'code', '.yml': 'code', '.toml': 'code',
    '.sql': 'code', '.sh': 'code', '.bat': 'code', '.ps1': 'code', '.vue': 'code', '.svelte': 'code',
    // Executables
    '.exe': 'exe', '.msi': 'exe', '.dll': 'system', '.sys': 'system', '.drv': 'system',
    // Database
    '.db': 'database', '.sqlite': 'database', '.mdb': 'database', '.accdb': 'database',
    // Fonts
    '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
    // System
    '.ini': 'system', '.cfg': 'system', '.conf': 'system', '.reg': 'system',
    '.log': 'system', '.tmp': 'system', '.bak': 'system', '.old': 'system',
    '.cache': 'system', '.dmp': 'system', '.etl': 'system',
};

function getFileIcon(extension, isDirectory) {
    if (isDirectory) {
        return FILE_TYPE_ICONS.folder.replace('<svg ', '<svg class="icon-folder" ');
    }
    const iconKey = EXT_TO_ICON[(extension || '').toLowerCase()] || 'file';
    const svg = FILE_TYPE_ICONS[iconKey] || FILE_TYPE_ICONS.file;
    return svg.replace('<svg ', `<svg class="icon-${iconKey}" `);
}

const TAG_COLORS = {
    red:    { label: 'Rot',    hex: '#e94560' },
    orange: { label: 'Orange', hex: '#ff8c42' },
    yellow: { label: 'Gelb',   hex: '#ffc107' },
    green:  { label: 'Gr\u00FCn',   hex: '#4ecca3' },
    blue:   { label: 'Blau',   hex: '#00b4d8' },
    purple: { label: 'Lila',   hex: '#6c5ce7' },
    gray:   { label: 'Grau',   hex: '#8b8fa3' },
};

const TEMP_EXTENSIONS = new Set(['.tmp', '.temp', '.bak', '.old', '.log', '.cache', '.dmp']);
const TEMP_NAMES = new Set(['thumbs.db', 'desktop.ini', '.ds_store', 'ntuser.dat.log1', 'ntuser.dat.log2']);

function isTempFile(name, ext) {
    const lower = name.toLowerCase();
    if (TEMP_NAMES.has(lower)) return true;
    if (TEMP_EXTENSIONS.has(ext)) return true;
    if (lower.startsWith('~$') || lower.startsWith('~')) return true;
    return false;
}

function getSizeClass(size) {
    if (size >= 1073741824) return 'explorer-size-xl';   // > 1 GB
    if (size >= 104857600) return 'explorer-size-lg';    // > 100 MB
    if (size >= 10485760) return 'explorer-size-md';     // > 10 MB
    return '';
}

const COLUMNS = [
    { id: 'icon', label: '', width: 36, sortable: false, align: 'center' },
    { id: 'name', label: 'Name', width: 300, sortable: true, align: 'left' },
    { id: 'size', label: 'Gr\u00F6\u00DFe', width: 100, sortable: true, align: 'right' },
    { id: 'type', label: 'Typ', width: 120, sortable: true, align: 'left' },
    { id: 'modified', label: 'Ge\u00E4ndert', width: 160, sortable: true, align: 'left' },
];

export class ExplorerView {
    constructor(container, options = {}) {
        this.container = container;
        this.instanceId = options.instanceId || 'default';
        this.showQuickAccess = options.showQuickAccess !== false;
        this.currentPath = '';
        this.historyBack = [];
        this.historyForward = [];
        this.entries = [];
        this.filteredEntries = null;
        this.knownFolders = [];
        this.drives = [];
        this.sortCol = 'name';
        this.sortAsc = true;
        this.selectedPaths = new Set();
        this.lastClickedPath = null;
        this.columnWidths = this.loadColumnWidths();
        this.addressMode = 'breadcrumb';
        this.emptyFolderPaths = new Set();
        this.els = {};
        this.dirTags = {};
        this.onContextMenu = null;
        this._keydownHandler = (e) => this.handleKeydown(e);
        this._onNavigate = options.onNavigate || null;
        this.getScanId = options.getScanId || (() => null);
        // Omnibar state
        this._omnibarSearching = false;
        this._debounceTimer = null;
        this._deepSearchRunning = false;
        // Scan-based folder sizes
        this._folderSizes = null;
        this._parentFolderSize = 0;
        this._showSizeColors = false;
    }

    async init() {
        this.render();
        await this.loadKnownFolders();
        await this.loadDrives();
        this.renderQuickAccess();
        const defaultPath = this.knownFolders.length > 0
            ? this.knownFolders[0].path
            : 'C:\\';
        await this.navigateTo(defaultPath, false);
    }

    render() {
        const qaHtml = this.showQuickAccess
            ? '<div class="explorer-quick-access"></div>'
            : '';

        this.container.innerHTML = `
            <div class="explorer-layout">
                ${qaHtml}
                <div class="explorer-main">
                    <div class="explorer-toolbar">
                        <button class="explorer-nav-btn explorer-btn-back" title="Zur\u00FCck (Alt+Links)" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button class="explorer-nav-btn explorer-btn-forward" title="Vor (Alt+Rechts)" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        <button class="explorer-nav-btn explorer-btn-up" title="\u00DCbergeordneter Ordner (Alt+Hoch)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                        <button class="explorer-nav-btn explorer-btn-refresh" title="Aktualisieren (F5)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        </button>
                        <button class="explorer-nav-btn explorer-btn-empty-folders" title="Leere Ordner finden">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                        </button>
                        <div class="explorer-address-bar"></div>
                    </div>
                    <div class="explorer-omni-dropdown" style="display:none"></div>
                    <div class="explorer-file-list"></div>
                    <div class="explorer-status"></div>
                </div>
            </div>
        `;

        this.els = {
            qa: this.container.querySelector('.explorer-quick-access'),
            backBtn: this.container.querySelector('.explorer-btn-back'),
            forwardBtn: this.container.querySelector('.explorer-btn-forward'),
            upBtn: this.container.querySelector('.explorer-btn-up'),
            refreshBtn: this.container.querySelector('.explorer-btn-refresh'),
            emptyFoldersBtn: this.container.querySelector('.explorer-btn-empty-folders'),
            addressBar: this.container.querySelector('.explorer-address-bar'),
            fileList: this.container.querySelector('.explorer-file-list'),
            status: this.container.querySelector('.explorer-status'),
            omniDropdown: this.container.querySelector('.explorer-omni-dropdown'),
        };

        this.els.backBtn.onclick = () => this.goBack();
        this.els.forwardBtn.onclick = () => this.goForward();
        this.els.upBtn.onclick = () => this.goUp();
        this.els.refreshBtn.onclick = () => this.refresh();
        this.els.emptyFoldersBtn.onclick = () => this.findEmptyFolders();

        this.container.tabIndex = 0;
        this.container.addEventListener('keydown', this._keydownHandler);

        // Click-outside dismisses omnibar search dropdown
        this._clickOutsideHandler = (e) => {
            if (!this._omnibarSearching) return;
            const isInsideDropdown = this.els.omniDropdown?.contains(e.target);
            const isInsideAddress = this.els.addressBar?.contains(e.target);
            if (!isInsideDropdown && !isInsideAddress) {
                this._omnibarSearching = false;
                this.filteredEntries = null;
                this._hideOmniDropdown();
                this._cancelDeepSearch();
                this.addressMode = 'breadcrumb';
                this.renderAddressBreadcrumb();
                this.renderFileList();
                this.renderStatus({ entries: this.entries });
            }
        };
        document.addEventListener('click', this._clickOutsideHandler);
    }

    // ===== Navigation =====

    async navigateTo(dirPath, addToHistory = true) {
        if (addToHistory && this.currentPath) {
            this.historyBack.push(this.currentPath);
            this.historyForward = [];
        }

        this.currentPath = dirPath;
        this.selectedPaths.clear();
        this.lastClickedPath = null;
        this.emptyFolderPaths.clear();
        this.filteredEntries = null;
        this.updateNavButtons();
        this.renderAddressBar();
        this.updateQuickAccessHighlight();
        if (this._onNavigate) this._onNavigate(dirPath);
        document.dispatchEvent(new CustomEvent('explorer-navigate', { detail: { path: dirPath } }));

        this.els.fileList.innerHTML = '<div class="explorer-loading"><div class="loading-spinner"></div></div>';

        const result = await window.api.listDirectory(dirPath);

        if (result.error) {
            this.els.fileList.innerHTML = `<div class="explorer-error">${this.esc(result.error)}</div>`;
            this.els.status.innerHTML = '';
            return;
        }

        this.entries = result.entries;
        // Load file tags for this directory
        try {
            this.dirTags = await window.api.getTagsForDirectory(dirPath);
        } catch { this.dirTags = {}; }

        // Enrich folder sizes from scan data (if scan available)
        this._folderSizes = null;
        this._parentFolderSize = 0;
        this._hasScanData = false;
        const scanId = this.getScanId();
        if (scanId) {
            const folderPaths = this.entries.filter(e => e.isDirectory).map(e => e.path);
            if (folderPaths.length > 0) {
                try {
                    const data = await window.api.getFolderSizesBulk(scanId, folderPaths, this.currentPath);
                    if (data && data.folders) {
                        this._folderSizes = data.folders;
                        this._parentFolderSize = data.parent?.size || 0;
                        // Prüfe ob tatsächlich Größen vorhanden sind
                        const hasAnySize = Object.keys(data.folders).length > 0;
                        this._hasScanData = hasAnySize;
                        for (const entry of this.entries) {
                            if (entry.isDirectory && data.folders[entry.path]) {
                                entry.size = data.folders[entry.path].size;
                            }
                        }
                    }
                } catch (err) { console.warn('Ordnergrößen konnten nicht geladen werden:', err); }
            }
        }

        // Size-color preference laden
        try {
            const prefs = await window.api.getPreferences();
            this._showSizeColors = !!prefs.showSizeColors;
        } catch { this._showSizeColors = false; }

        this.renderFileList();
        this.renderStatus(result);
    }

    goBack() {
        if (this.historyBack.length === 0) return;
        this.historyForward.push(this.currentPath);
        const prev = this.historyBack.pop();
        this.navigateTo(prev, false);
    }

    goForward() {
        if (this.historyForward.length === 0) return;
        this.historyBack.push(this.currentPath);
        const next = this.historyForward.pop();
        this.navigateTo(next, false);
    }

    goUp() {
        const parent = this.getParentPath(this.currentPath);
        if (parent && parent !== this.currentPath) {
            this.navigateTo(parent);
        }
    }

    refresh() {
        if (this.currentPath) this.navigateTo(this.currentPath, false);
    }

    getParentPath(p) {
        if (/^[A-Z]:\\$/i.test(p)) return null;
        const parent = p.substring(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
        if (/^[A-Z]:$/i.test(parent)) return parent + '\\';
        return parent || null;
    }

    updateNavButtons() {
        this.els.backBtn.disabled = this.historyBack.length === 0;
        this.els.forwardBtn.disabled = this.historyForward.length === 0;
        const parent = this.getParentPath(this.currentPath);
        this.els.upBtn.disabled = !parent || parent === this.currentPath;
    }

    // ===== Address Bar =====

    renderAddressBar() {
        if (this.addressMode === 'input') {
            this.renderAddressInput();
        } else {
            this.renderAddressBreadcrumb();
        }
    }

    renderAddressBreadcrumb() {
        const bar = this.els.addressBar;
        const segments = this.currentPath.split('\\').filter(Boolean);

        let html = '<div class="explorer-breadcrumb-bar">';
        let buildPath = '';

        segments.forEach((seg, i) => {
            if (i === 0) {
                buildPath = seg + '\\';
            } else {
                buildPath += seg + '\\';
            }
            if (i > 0) html += '<span class="explorer-bc-sep">\u203A</span>';
            if (i === segments.length - 1) {
                html += `<span class="explorer-bc-current">${this.esc(seg)}</span>`;
            } else {
                html += `<span class="explorer-bc-segment" data-path="${this.escAttr(buildPath)}">${this.esc(seg)}</span>`;
            }
        });

        html += '<span class="explorer-bc-search" title="Suchen (Ctrl+F)">\uD83D\uDD0D</span>';
        html += '</div>';
        bar.innerHTML = html;

        bar.querySelectorAll('.explorer-bc-segment').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                this.navigateTo(el.dataset.path);
            };
        });

        // Search icon click → omnibar search mode
        const searchIcon = bar.querySelector('.explorer-bc-search');
        if (searchIcon) {
            searchIcon.onclick = (e) => {
                e.stopPropagation();
                this.addressMode = 'input';
                this.renderAddressInput(true);
            };
        }

        const bcBar = bar.querySelector('.explorer-breadcrumb-bar');
        if (bcBar) {
            bcBar.onclick = (e) => {
                // Click on background, current segment, or separator → edit mode
                if (e.target.classList.contains('explorer-bc-segment')) return; // navigate handled above
                this.addressMode = 'input';
                this.renderAddressInput();
            };
        }
    }

    renderAddressInput(startInSearchMode = false) {
        const bar = this.els.addressBar;
        const initValue = startInSearchMode ? '' : this.currentPath;
        bar.innerHTML = `<input type="text" class="explorer-address-input"
                           value="${this.escAttr(initValue)}"
                           placeholder="Pfad oder Suche eingeben..."
                           spellcheck="false">`;

        const input = bar.querySelector('.explorer-address-input');
        input.focus();
        if (!startInSearchMode) input.select();
        this._omnibarSearching = false;

        input.addEventListener('input', () => {
            const val = input.value.trim();
            const isSearch = val.length > 0 && !this._isPathLike(val);

            if (isSearch && !this._omnibarSearching) {
                this._omnibarSearching = true;
                input.classList.add('omnibar-search-mode');
            } else if (!isSearch && this._omnibarSearching) {
                this._omnibarSearching = false;
                input.classList.remove('omnibar-search-mode');
                this.filteredEntries = null;
                this.renderFileList();
                this._hideOmniDropdown();
            }

            if (isSearch) {
                clearTimeout(this._debounceTimer);
                this._cancelDeepSearch();
                this._debounceTimer = setTimeout(() => this._omnibarSearch(val), 400);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (!val) return;

                if (this._omnibarSearching) {
                    // Enter in search mode → trigger deep search if no index results yet
                    clearTimeout(this._debounceTimer);
                    this._omnibarSearch(val);
                } else {
                    // Enter in path mode → navigate
                    this.addressMode = 'breadcrumb';
                    this._hideOmniDropdown();
                    this.navigateTo(val);
                }
            }
            if (e.key === 'Escape') {
                this._omnibarSearching = false;
                this.filteredEntries = null;
                this._hideOmniDropdown();
                this._cancelDeepSearch();
                this.addressMode = 'breadcrumb';
                this.renderAddressBreadcrumb();
                this.renderFileList();
                this.renderStatus({ entries: this.entries });
            }
            e.stopPropagation();
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.addressMode === 'input' && !this._omnibarSearching) {
                    this.addressMode = 'breadcrumb';
                    this.renderAddressBreadcrumb();
                }
            }, 200);
        });
    }

    activateOmnibar() {
        this.addressMode = 'input';
        this.renderAddressInput(true);
    }

    _isPathLike(str) {
        if (!str) return false;
        // Drive letter paths: C:\, D:/, etc.
        if (/^[A-Za-z]:[\\\/]/.test(str)) return true;
        // UNC paths: \\server\share
        if (str.startsWith('\\\\')) return true;
        // Relative but with backslash
        if (str.includes(':\\')) return true;
        return false;
    }

    async _omnibarSearch(query) {
        // Level 1: Filter current directory entries (always)
        this.applyFilter(query);

        // Show dropdown with live results
        this.els.omniDropdown.innerHTML = `
            <div class="omni-dropdown-header">
                <span class="omni-dropdown-info">\uD83D\uDD0D Suche nach "${this.esc(query)}"...</span>
                <button class="omni-dropdown-btn omni-btn-stop" style="display:none">Stopp</button>
            </div>
            <div class="omni-dropdown-results">
                <div class="omni-loading">Durchsuche Laufwerk...</div>
            </div>`;
        this.els.omniDropdown.style.display = '';

        this.els.status.innerHTML = `<span style="color:var(--accent)">\uD83D\uDD0D "${this.esc(query)}"</span><span style="color:var(--text-muted)">Escape = beenden</span>`;

        // If scan index available → use it first (instant results)
        const scanId = this.getScanId();
        if (scanId) {
            try {
                const { results } = await window.api.searchNameIndex(scanId, query, { maxResults: 100 });
                if (!this._omnibarSearching) return; // user cancelled
                if (results.length > 0) {
                    this._renderOmniResults(results, `${results.length} Treffer (Index)`);
                    return; // Index results are sufficient
                }
            } catch { /* fall through to deep search */ }
        }

        // No index or no index results → auto-start deep search
        if (this._omnibarSearching) {
            this._startDeepSearch(query);
        }
    }

    _renderOmniResults(results, countText) {
        const resultsEl = this.els.omniDropdown?.querySelector('.omni-dropdown-results');
        if (!resultsEl) return;

        // Sort: quality descending, then alphabetical
        const sortFn = (a, b) => {
            const qa = a.matchQuality || 1, qb = b.matchQuality || 1;
            if (qa !== qb) return qb - qa;
            return a.name.localeCompare(b.name, 'de');
        };

        // Split into folders and files
        const folders = results.filter(r => r.isDir).sort(sortFn);
        const files = results.filter(r => !r.isDir).sort(sortFn);

        let html = `<div class="omni-results-count">${countText}</div>`;

        // Render a group (folders or files) with header + fuzzy separator
        const renderGroup = (items, header) => {
            if (items.length === 0) return;
            html += `<div class="omni-results-group-header">${header} (${items.length})</div>`;
            let showedFuzzy = false;
            for (const r of items) {
                const quality = r.matchQuality || 1;
                const isFuzzy = quality < 1.0;
                if (isFuzzy && !showedFuzzy) {
                    html += '<div class="omni-results-separator">\u00C4hnliche Treffer</div>';
                    showedFuzzy = true;
                }
                const dirShort = this._shortenPath(r.dirPath);
                const icon = getFileIcon(r.isDir ? null : (r.name?.substring(r.name.lastIndexOf('.')) || ''), r.isDir);
                const fuzzyClass = isFuzzy ? ' omni-result-fuzzy' : '';
                html += `<div class="omni-result-item${fuzzyClass}" data-path="${this.escAttr(r.fullPath || r.path)}" data-dir="${this.escAttr(r.dirPath)}">
                    <span class="omni-result-icon">${icon}</span>
                    <span class="omni-result-name">${this.esc(r.name)}</span>
                    <span class="omni-result-dir" title="${this.escAttr(r.dirPath)}">${this.esc(dirShort)}</span>
                </div>`;
            }
        };

        renderGroup(folders, '\uD83D\uDCC1 Ordner');
        renderGroup(files, '\uD83D\uDCC4 Dateien');

        resultsEl.innerHTML = html;
        this._wireOmniResults(resultsEl);

        const infoEl = this.els.omniDropdown.querySelector('.omni-dropdown-info');
        if (infoEl) infoEl.textContent = `\uD83D\uDD0D ${countText}`;

        this.els.status.innerHTML = `<span style="color:var(--accent)">\uD83D\uDD0D ${countText}</span><span style="color:var(--text-muted)">Escape = beenden</span>`;
    }

    _startDeepSearch(query) {
        this._cancelDeepSearch();
        this._deepSearchRunning = true;

        const resultsEl = this.els.omniDropdown?.querySelector('.omni-dropdown-results');
        if (!resultsEl) return;

        const stopBtn = this.els.omniDropdown.querySelector('.omni-btn-stop');
        if (stopBtn) {
            stopBtn.style.display = '';
            stopBtn.onclick = () => {
                this._cancelDeepSearch();
                stopBtn.style.display = 'none';
            };
        }

        const collected = [];
        let hasFuzzySeparator = false;
        resultsEl.innerHTML = '<div class="omni-results-count">Durchsuche Laufwerk...</div>';
        this._wireOmniResults(resultsEl);

        window.api.onDeepSearchResult((data) => {
            if (!this._deepSearchRunning) return;
            collected.push(data);
            if (collected.length <= 200) {
                const dirShort = this._shortenPath(data.dirPath);
                const icon = getFileIcon(data.isDir ? null : (data.name?.substring(data.name.lastIndexOf('.')) || ''), data.isDir);
                const quality = data.matchQuality || 1;
                const isFuzzy = quality < 1.0;
                const fuzzyClass = isFuzzy ? ' omni-result-fuzzy' : '';
                let insertHtml = '';

                // Add "Ähnliche Treffer" separator before first fuzzy result
                if (isFuzzy && !hasFuzzySeparator) {
                    hasFuzzySeparator = true;
                    insertHtml += '<div class="omni-results-separator">\u00C4hnliche Treffer</div>';
                }

                insertHtml += `<div class="omni-result-item${fuzzyClass}" data-path="${this.escAttr(data.path)}" data-dir="${this.escAttr(data.dirPath)}">
                    <span class="omni-result-icon">${icon}</span>
                    <span class="omni-result-name">${this.esc(data.name)}</span>
                    <span class="omni-result-dir" title="${this.escAttr(data.dirPath)}">${this.esc(dirShort)}</span>
                </div>`;
                const countEl = resultsEl.querySelector('.omni-results-count');
                if (countEl) {
                    countEl.textContent = `${collected.length} Treffer`;
                    countEl.insertAdjacentHTML('afterend', insertHtml);
                }
            }
            this.els.status.innerHTML = `<span style="color:var(--accent)">\uD83D\uDD0D ${collected.length} Treffer</span><span style="color:var(--text-muted)">Escape = beenden</span>`;
        });

        window.api.onDeepSearchProgress((data) => {
            if (!this._deepSearchRunning) return;
            const countEl = resultsEl.querySelector('.omni-results-count');
            if (countEl) countEl.textContent = `${data.resultCount} Treffer (${data.dirsScanned} Ordner)`;
        });

        window.api.onDeepSearchComplete((data) => {
            this._deepSearchRunning = false;
            if (stopBtn) stopBtn.style.display = 'none';

            // Re-render grouped and sorted (folders first, then files)
            this._renderOmniResults(collected.slice(0, 200),
                `${data.resultCount} Treffer in ${data.dirsScanned} Ordnern`);
        });

        window.api.onDeepSearchError(() => {
            this._deepSearchRunning = false;
            if (stopBtn) stopBtn.style.display = 'none';
        });

        // Always search from drive root (e.g. C:\)
        const rootPath = this.currentPath.match(/^[A-Za-z]:\\/)?.[0] || this.currentPath;
        window.api.deepSearchStart(rootPath, query, false);
    }

    _cancelDeepSearch() {
        if (this._deepSearchRunning) {
            window.api.deepSearchCancel();
            this._deepSearchRunning = false;
        }
    }

    _wireOmniResults(container) {
        container.addEventListener('click', (e) => {
            const item = e.target.closest('.omni-result-item');
            if (!item) return;
            const dirPath = item.dataset.dir;
            if (dirPath) {
                this._omnibarSearching = false;
                this._hideOmniDropdown();
                this.addressMode = 'breadcrumb';
                this.filteredEntries = null;
                this.navigateTo(dirPath);
            }
        });
    }

    _hideOmniDropdown() {
        if (this.els.omniDropdown) {
            this.els.omniDropdown.style.display = 'none';
            this.els.omniDropdown.innerHTML = '';
        }
    }

    _shortenPath(p) {
        if (!p) return '';
        if (p.length <= 45) return p;
        const parts = p.split('\\');
        if (parts.length <= 3) return p;
        return parts[0] + '\\..\\' + parts.slice(-2).join('\\');
    }

    // ===== Quick Access =====

    async loadKnownFolders() {
        try { this.knownFolders = await window.api.getKnownFolders(); }
        catch { this.knownFolders = []; }
    }

    async loadDrives() {
        try { this.drives = await window.api.getDrives(); }
        catch { this.drives = []; }
    }

    renderQuickAccess() {
        if (!this.els.qa) return;
        let html = '<div class="explorer-qa-section">';
        html += '<div class="explorer-qa-title">Bibliothek</div>';
        for (const folder of this.knownFolders) {
            const icon = QA_ICONS[folder.icon] || QA_ICONS.documents;
            html += `<div class="explorer-qa-item" data-path="${this.escAttr(folder.path)}" title="${this.escAttr(folder.path)}">
                ${icon}<span>${this.esc(folder.name)}</span>
            </div>`;
        }
        html += '</div>';

        html += '<div class="explorer-qa-section">';
        html += '<div class="explorer-qa-title">Laufwerke</div>';
        for (const drive of this.drives) {
            const label = drive.mountpoint.replace('\\', '');
            const freeStr = drive.free ? ` - ${formatBytes(drive.free)} frei` : '';
            html += `<div class="explorer-qa-item" data-path="${this.escAttr(drive.mountpoint)}" title="${this.escAttr(drive.device || drive.mountpoint)}${freeStr}">
                ${QA_ICONS.drive}<span>${this.esc(label)}</span>
            </div>`;
        }
        html += '</div>';

        this.els.qa.innerHTML = html;

        this.els.qa.querySelectorAll('.explorer-qa-item').forEach(el => {
            el.onclick = () => this.navigateTo(el.dataset.path);
            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.onContextMenu) {
                    this.onContextMenu('directory', {
                        path: el.dataset.path,
                        name: el.querySelector('span')?.textContent || '',
                    }, e);
                }
            };
        });
    }

    updateQuickAccessHighlight() {
        if (!this.els.qa) return;
        this.els.qa.querySelectorAll('.explorer-qa-item').forEach(el => {
            const p = el.dataset.path;
            const isActive = this.currentPath === p || this.currentPath.startsWith(p + '\\');
            el.classList.toggle('active', isActive);
        });
    }

    // ===== File List =====

    renderFileList() {
        const sorted = this.getSortedEntries();

        let headerHtml = '<tr>';
        for (const col of COLUMNS) {
            const width = this.columnWidths[col.id] || col.width;
            const sortIcon = col.sortable ? this.sortIcon(col.id) : '';
            const sortClass = this.sortCol === col.id ? ' sort-active' : '';
            const sortAttr = col.sortable ? ` data-sort="${col.id}"` : '';
            headerHtml += `<th style="width:${width}px; text-align:${col.align}; position:relative"${sortAttr} class="${sortClass}">
                ${col.label}${sortIcon}
                ${col.sortable ? `<span class="explorer-col-resize" data-col="${col.id}"></span>` : ''}
            </th>`;
        }
        headerHtml += '</tr>';

        let bodyHtml = '';
        for (const entry of sorted) {
            const icon = getFileIcon(entry.extension, entry.isDirectory);
            const nameClass = entry.isDirectory ? 'explorer-col-name dir-name' : 'explorer-col-name';
            const typeStr = entry.isDirectory ? 'Ordner' : (entry.extension || '-');
            const dateStr = entry.modified ? this.formatDateTime(entry.modified) : '-';

            // Size string + optional proportion bar for folders with scan data
            let sizeStr = '';
            let sizeBarHtml = '';
            if (entry.isDirectory && entry.size > 0 && this._folderSizes) {
                sizeStr = formatBytes(entry.size);
                const pct = this._parentFolderSize > 0
                    ? (entry.size / this._parentFolderSize * 100) : 0;
                const barWidth = Math.max(pct, 0.5);
                sizeBarHtml = `<div class="explorer-size-bar"><div class="size-bar"><div class="size-bar-fill" style="width:${barWidth}%"></div></div></div>`;
            } else if (!entry.isDirectory) {
                sizeStr = formatBytes(entry.size);
            }

            // Size color coding (folders + files when size > 0) — nur wenn in Einstellungen aktiviert
            const sizeClass = (this._showSizeColors && entry.size > 0) ? getSizeClass(entry.size) : '';
            // Temp file detection
            const isTemp = !entry.isDirectory && isTempFile(entry.name, entry.extension);
            // Empty folder detection
            const isEmpty = entry.isDirectory && this.emptyFolderPaths.has(entry.path);
            const rowClasses = [sizeClass, isTemp ? 'explorer-temp-file' : '', isEmpty ? 'explorer-empty-folder' : ''].filter(Boolean).join(' ');
            const tempBadge = isTemp ? '<span class="explorer-temp-badge">Temp</span>' : '';
            const emptyBadge = isEmpty ? '<span class="explorer-empty-badge">Leer</span>' : '';
            // File tag color dot
            const tag = this.dirTags[entry.path];
            const tagDot = tag ? `<span class="explorer-tag-dot" style="background:${TAG_COLORS[tag.color]?.hex || '#888'}" title="${this.esc(tag.note || tag.color)}"></span>` : '';

            bodyHtml += `<tr data-path="${this.escAttr(entry.path)}" data-is-dir="${entry.isDirectory}"
                            data-name="${this.escAttr(entry.name)}" draggable="true" class="${rowClasses}">
                <td class="explorer-col-icon">${icon}</td>
                <td class="${nameClass}" title="${this.escAttr(entry.path)}">${tagDot}${this.esc(entry.name)}${tempBadge}${emptyBadge}</td>
                <td class="explorer-col-size">${sizeStr}${sizeBarHtml}</td>
                <td class="explorer-col-type">${this.esc(typeStr)}</td>
                <td class="explorer-col-date">${dateStr}</td>
            </tr>`;
        }

        if (sorted.length === 0) {
            const msg = this.filteredEntries !== null
                ? 'Keine Treffer f\u00FCr den Suchbegriff'
                : 'Dieser Ordner ist leer';
            bodyHtml = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">${msg}</td></tr>`;
        }

        this.els.fileList.innerHTML = `
            <table class="explorer-table">
                <thead>${headerHtml}</thead>
                <tbody>${bodyHtml}</tbody>
            </table>
        `;

        this.wireFileListEvents();
        this.wireColumnSort();
        this.wireColumnResize();
    }

    wireFileListEvents() {
        const tbody = this.els.fileList.querySelector('tbody');
        if (!tbody) return;

        tbody.querySelectorAll('tr[data-path]').forEach(row => {
            row.onclick = (e) => {
                e.stopPropagation();
                this.selectRow(row.dataset.path, e);
            };

            row.ondblclick = () => {
                if (row.dataset.isDir === 'true') {
                    this.navigateTo(row.dataset.path);
                } else {
                    // Previewbare Dateien in der App öffnen (PDF, DOCX, XLSX, Bilder, Code)
                    const ext = (row.dataset.name || '').includes('.')
                        ? '.' + (row.dataset.name || '').split('.').pop().toLowerCase()
                        : '';
                    const PREVIEW_EXTS = new Set([
                        '.pdf', '.docx', '.xlsx', '.xls',
                        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
                        '.txt', '.md', '.json', '.js', '.ts', '.py', '.html', '.css',
                        '.xml', '.yaml', '.yml', '.csv', '.ini', '.cfg', '.log',
                        '.bat', '.cmd', '.ps1', '.sh', '.sql', '.java', '.c', '.cpp',
                        '.cs', '.rs', '.go', '.rb', '.php', '.lua',
                    ]);
                    if (PREVIEW_EXTS.has(ext)) {
                        document.dispatchEvent(new CustomEvent('open-in-preview', {
                            detail: { path: row.dataset.path }
                        }));
                    } else {
                        window.api.openFile(row.dataset.path);
                    }
                }
            };

            row.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.selectedPaths.has(row.dataset.path)) {
                    this.selectRow(row.dataset.path);
                }
                if (this.onContextMenu) {
                    this.onContextMenu(row.dataset.isDir === 'true' ? 'directory' : 'file', {
                        path: row.dataset.path,
                        name: row.dataset.name,
                        selectedPaths: [...this.selectedPaths],
                    }, e);
                }
            };

            // Drag & Drop
            row.ondragstart = (e) => {
                const paths = this.selectedPaths.has(row.dataset.path)
                    ? [...this.selectedPaths]
                    : [row.dataset.path];
                e.dataTransfer.setData('text/plain', JSON.stringify(paths));
                e.dataTransfer.effectAllowed = 'copyMove';
            };

            if (row.dataset.isDir === 'true') {
                row.ondragover = (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                    row.classList.add('drag-over');
                };
                row.ondragleave = () => row.classList.remove('drag-over');
                row.ondrop = async (e) => {
                    e.preventDefault();
                    row.classList.remove('drag-over');
                    let sourcePaths;
                    try { sourcePaths = JSON.parse(e.dataTransfer.getData('text/plain')); }
                    catch { return; }
                    sourcePaths = sourcePaths.filter(p => p !== row.dataset.path);
                    if (!sourcePaths.length) return;

                    if (e.ctrlKey) {
                        await window.api.copy(sourcePaths, row.dataset.path);
                    } else {
                        await window.api.move(sourcePaths, row.dataset.path);
                    }
                    this.refresh();
                };
            }
        });

        // Background context menu
        this.els.fileList.oncontextmenu = (e) => {
            if (!e.target.closest('tr[data-path]')) {
                e.preventDefault();
                if (this.onContextMenu) {
                    this.onContextMenu('tree-background', { path: this.currentPath }, e);
                }
            }
        };

        // Drop on background
        this.els.fileList.ondragover = (e) => {
            if (!e.target.closest('tr[data-path]')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
            }
        };
        this.els.fileList.ondrop = async (e) => {
            if (e.target.closest('tr[data-path]')) return;
            e.preventDefault();
            let sourcePaths;
            try { sourcePaths = JSON.parse(e.dataTransfer.getData('text/plain')); }
            catch { return; }
            if (!sourcePaths.length) return;
            if (e.ctrlKey) {
                await window.api.copy(sourcePaths, this.currentPath);
            } else {
                await window.api.move(sourcePaths, this.currentPath);
            }
            this.refresh();
        };
    }

    // ===== Selection =====

    selectRow(path, event) {
        if (event && (event.ctrlKey || event.metaKey)) {
            if (this.selectedPaths.has(path)) this.selectedPaths.delete(path);
            else this.selectedPaths.add(path);
            this.lastClickedPath = path;
        } else if (event && event.shiftKey && this.lastClickedPath) {
            const rows = [...this.els.fileList.querySelectorAll('tr[data-path]')];
            const startIdx = rows.findIndex(r => r.dataset.path === this.lastClickedPath);
            const endIdx = rows.findIndex(r => r.dataset.path === path);
            if (startIdx >= 0 && endIdx >= 0) {
                const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                this.selectedPaths.clear();
                for (let i = lo; i <= hi; i++) this.selectedPaths.add(rows[i].dataset.path);
            }
        } else {
            this.selectedPaths.clear();
            this.selectedPaths.add(path);
            this.lastClickedPath = path;
        }
        this.updateSelectionVisual();
        this.updateStatusSelection();
    }

    updateSelectionVisual() {
        this.els.fileList.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
        for (const p of this.selectedPaths) {
            const row = this.els.fileList.querySelector(`tr[data-path="${CSS.escape(p)}"]`);
            if (row) row.classList.add('selected');
        }
    }

    selectAll() {
        this.selectedPaths.clear();
        this.els.fileList.querySelectorAll('tr[data-path]').forEach(r => {
            this.selectedPaths.add(r.dataset.path);
        });
        this.updateSelectionVisual();
        this.updateStatusSelection();
    }

    getSelectedPaths() { return [...this.selectedPaths]; }

    updateStatusSelection() {
        if (this.selectedPaths.size > 0) {
            const selected = this.entries.filter(e => this.selectedPaths.has(e.path));
            const totalSize = selected.filter(e => !e.isDirectory).reduce((s, e) => s + e.size, 0);
            this.els.status.innerHTML = `<span class="explorer-status-count">${this.selectedPaths.size} ausgew\u00E4hlt</span><span>${formatBytes(totalSize)}</span>`;
        } else {
            // Re-render full status
            const dirs = this.entries.filter(e => e.isDirectory).length;
            const files = this.entries.filter(e => !e.isDirectory).length;
            const totalSize = this.entries.filter(e => !e.isDirectory).reduce((s, e) => s + e.size, 0);
            this.els.status.innerHTML = `<span class="explorer-status-count">${dirs} Ordner, ${files} Dateien</span><span>${formatBytes(totalSize)}</span>`;
        }
    }

    // ===== Sorting =====

    setSortColumn(col) {
        if (this.sortCol === col) this.sortAsc = !this.sortAsc;
        else { this.sortCol = col; this.sortAsc = (col === 'name'); }
        this.renderFileList();
    }

    wireColumnSort() {
        this.els.fileList.querySelectorAll('th[data-sort]').forEach(th => {
            th.onclick = (e) => {
                if (e.target.classList.contains('explorer-col-resize')) return;
                const col = th.dataset.sort;
                if (this.sortCol === col) this.sortAsc = !this.sortAsc;
                else { this.sortCol = col; this.sortAsc = (col === 'name'); }
                this.renderFileList();
            };
        });
    }

    getSortedEntries() {
        const entries = [...(this.filteredEntries || this.entries)];
        entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            let va, vb;
            switch (this.sortCol) {
                case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
                case 'size': va = a.size; vb = b.size; break;
                case 'type': va = (a.extension || '').toLowerCase(); vb = (b.extension || '').toLowerCase(); break;
                case 'modified': va = a.modified || 0; vb = b.modified || 0; break;
                default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
            }

            if (va < vb) return this.sortAsc ? -1 : 1;
            if (va > vb) return this.sortAsc ? 1 : -1;
            return 0;
        });
        return entries;
    }

    sortIcon(col) {
        if (this.sortCol !== col) return '';
        return this.sortAsc ? ' \u25B2' : ' \u25BC';
    }

    // ===== Column Resize =====

    wireColumnResize() {
        this.els.fileList.querySelectorAll('.explorer-col-resize').forEach(handle => {
            handle.onmousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const colId = handle.dataset.col;
                const th = handle.parentElement;
                const startX = e.clientX;
                const startWidth = th.offsetWidth;
                handle.classList.add('dragging');

                const onMouseMove = (moveE) => {
                    const newWidth = Math.max(50, startWidth + (moveE.clientX - startX));
                    th.style.width = newWidth + 'px';
                    this.columnWidths[colId] = newWidth;
                };

                const onMouseUp = () => {
                    handle.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    this.saveColumnWidths();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        });
    }

    loadColumnWidths() {
        try {
            const saved = localStorage.getItem(`explorer-col-widths-${this.instanceId}`);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    }

    saveColumnWidths() {
        localStorage.setItem(`explorer-col-widths-${this.instanceId}`, JSON.stringify(this.columnWidths));
    }

    // ===== Status Bar =====

    renderStatus(result) {
        const dirs = result.entries.filter(e => e.isDirectory).length;
        const files = result.entries.filter(e => !e.isDirectory).length;
        const filesTotalSize = result.entries.filter(e => !e.isDirectory).reduce((s, e) => s + e.size, 0);

        let html = `<span class="explorer-status-count">${dirs} Ordner, ${files} Dateien</span>`;

        if (this._parentFolderSize > 0) {
            html += `<span title="Gesamtgröße (inkl. Unterordner)">${formatBytes(this._parentFolderSize)}</span>`;
            html += `<span class="explorer-status-scan-hint">Scan</span>`;
        } else {
            html += `<span>${formatBytes(filesTotalSize)}</span>`;
            // Hinweis: Kein Scan für dieses Laufwerk
            const scanId = this.getScanId();
            if (dirs > 0 && !this._hasScanData) {
                html += scanId
                    ? `<span class="explorer-status-no-scan" title="Dieses Laufwerk wurde nicht gescannt">Ordnergrössen: anderes Laufwerk gescannt</span>`
                    : `<span class="explorer-status-no-scan" title="Bitte zuerst einen Scan durchführen">Ordnergrössen: Scan erforderlich</span>`;
            }
        }

        if (result.truncated) {
            html += `<span style="color:var(--warning)">Ansicht begrenzt auf 5.000 Einträge (${result.totalEntries} insgesamt)</span>`;
        }

        this.els.status.innerHTML = html;
    }

    // ===== Keyboard =====

    handleKeydown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this.goBack(); }
        else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); this.goForward(); }
        else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); this.goUp(); }
        else if (e.key === 'F5') { e.preventDefault(); this.refresh(); }
        else if (e.key === 'Backspace') { e.preventDefault(); this.goUp(); }
        else if (e.key === 'Enter' && this.selectedPaths.size > 0) {
            e.preventDefault();
            const path = [...this.selectedPaths][0];
            const row = this.els.fileList.querySelector(`tr[data-path="${CSS.escape(path)}"]`);
            if (row && row.dataset.isDir === 'true') this.navigateTo(path);
            else if (row) window.api.openFile(path);
        }
        else if (e.key === 'F2' && this.selectedPaths.size === 1) {
            e.preventDefault();
            this.startInlineRename([...this.selectedPaths][0]);
        }
        else if (e.key === 'a' && e.ctrlKey) { e.preventDefault(); this.selectAll(); }
        else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            this.addressMode = 'input';
            this.renderAddressInput();
        }
        else if (e.key === 'Delete' && this.selectedPaths.size > 0) {
            e.preventDefault();
            const paths = [...this.selectedPaths];
            const isPermanent = e.shiftKey;
            const msg = isPermanent
                ? `${paths.length} Element(e) endgültig löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`
                : `${paths.length} Element(e) in den Papierkorb verschieben?`;
            window.api.showConfirmDialog({
                type: isPermanent ? 'warning' : 'question',
                title: isPermanent ? 'Endgültig löschen' : 'In Papierkorb verschieben',
                message: msg,
                buttons: ['Abbrechen', 'Löschen'],
                defaultId: 0,
            }).then(result => {
                if (result.response !== 1) return;
                const op = isPermanent
                    ? window.api.deletePermanent(paths)
                    : window.api.deleteToTrash(paths);
                op.then(() => this.refresh());
            });
        }
        else if (e.key === 'f' && e.ctrlKey) {
            e.preventDefault();
            this.activateOmnibar();
        }
        // Type-to-search: single printable character → activate omnibar with that character
        else if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
            e.preventDefault();
            this.addressMode = 'input';
            this.renderAddressInput(true);
            // Inject the typed character into the omnibar input
            const addrInput = this.els.addressBar.querySelector('.explorer-address-input');
            if (addrInput) {
                addrInput.value = e.key;
                addrInput.dispatchEvent(new Event('input'));
            }
        }
    }

    // ===== Inline Rename =====

    startInlineRename(filePath) {
        const row = this.els.fileList.querySelector(`tr[data-path="${CSS.escape(filePath)}"]`);
        if (!row) return;
        const nameCell = row.querySelector('.explorer-col-name');
        const currentName = nameCell.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'explorer-inline-rename';
        input.value = currentName;
        nameCell.textContent = '';
        nameCell.appendChild(input);
        input.focus();

        const dotIdx = currentName.lastIndexOf('.');
        if (dotIdx > 0 && row.dataset.isDir !== 'true') {
            input.setSelectionRange(0, dotIdx);
        } else {
            input.select();
        }

        let committed = false;
        const commit = async () => {
            if (committed) return;
            committed = true;
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                try {
                    const result = await window.api.rename(filePath, newName);
                    if (result.success) {
                        this.refresh();
                    } else {
                        nameCell.textContent = currentName;
                    }
                } catch {
                    nameCell.textContent = currentName;
                }
            } else {
                nameCell.textContent = currentName;
            }
        };

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            if (ev.key === 'Escape') { committed = true; nameCell.textContent = currentName; }
            ev.stopPropagation();
        });
        input.addEventListener('blur', commit);
    }

    // ===== Empty Folder Finder =====

    async findEmptyFolders() {
        this.els.emptyFoldersBtn.disabled = true;
        this.els.emptyFoldersBtn.title = 'Suche leere Ordner...';

        try {
            const result = await window.api.findEmptyFolders(this.currentPath, 3);
            this.emptyFolderPaths = new Set(result.emptyFolders.map(f => f.path));

            if (result.count === 0) {
                this.els.status.innerHTML = '<span style="color:var(--success)">Keine leeren Ordner gefunden</span>';
            } else {
                this.els.status.innerHTML = `<span style="color:var(--warning)">${result.count} leere Ordner gefunden</span>`;
            }

            // Re-render to show badges
            this.renderFileList();
        } catch {
            this.els.status.innerHTML = '<span style="color:var(--danger)">Fehler beim Suchen</span>';
        }

        this.els.emptyFoldersBtn.disabled = false;
        this.els.emptyFoldersBtn.title = 'Leere Ordner finden';
    }

    // ===== Helpers =====

    formatDateTime(ms) {
        if (!ms) return '-';
        return new Date(ms).toLocaleString('de-DE', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    }

    esc(text) {
        return escapeHtml(text);
    }

    escAttr(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== Multi-Instance Support =====

    dispose() {
        this._cancelDeepSearch();
        this.container.removeEventListener('keydown', this._keydownHandler);
        if (this._clickOutsideHandler) document.removeEventListener('click', this._clickOutsideHandler);
        this.container.innerHTML = '';
        this.entries = [];
        this.filteredEntries = null;
        this.selectedPaths.clear();
        this.emptyFolderPaths.clear();
        this.els = {};
    }

    getState() {
        const fileList = this.els.fileList;
        return {
            currentPath: this.currentPath,
            sortCol: this.sortCol,
            sortAsc: this.sortAsc,
            scrollTop: fileList ? fileList.scrollTop : 0,
            historyBack: [...this.historyBack],
            historyForward: [...this.historyForward],
        };
    }

    restoreState(state) {
        if (!state) return;
        this.sortCol = state.sortCol || 'name';
        this.sortAsc = state.sortAsc !== undefined ? state.sortAsc : true;
        this.historyBack = state.historyBack || [];
        this.historyForward = state.historyForward || [];
        if (state.scrollTop && this.els.fileList) {
            requestAnimationFrame(() => {
                this.els.fileList.scrollTop = state.scrollTop;
            });
        }
    }

    applyFilter(query) {
        if (!query || !query.trim()) {
            this.filteredEntries = null;
            this.renderFileList();
            return;
        }

        const q = query.trim();
        let matcher;
        if (q.startsWith('/') && q.endsWith('/') && q.length > 2) {
            try { matcher = new RegExp(q.slice(1, -1), 'i'); }
            catch { matcher = null; }
        }

        this.filteredEntries = this.entries.filter(e => {
            if (matcher) return matcher.test(e.name);
            return e.name.toLowerCase().includes(q.toLowerCase());
        });
        this.renderFileList();
    }
}

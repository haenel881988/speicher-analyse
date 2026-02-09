import { formatBytes } from './utils.js';

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

const FOLDER_ICON = '\uD83D\uDCC1';
const FILE_ICON = '\uD83D\uDCC4';

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
    constructor(container) {
        this.container = container;
        this.currentPath = '';
        this.historyBack = [];
        this.historyForward = [];
        this.entries = [];
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
        this.onContextMenu = null;
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
        this.container.innerHTML = `
            <div class="explorer-layout">
                <div class="explorer-quick-access" id="explorer-qa"></div>
                <div class="explorer-main">
                    <div class="explorer-toolbar">
                        <button class="explorer-nav-btn" id="explorer-back" title="Zur\u00FCck (Alt+Links)" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button class="explorer-nav-btn" id="explorer-forward" title="Vor (Alt+Rechts)" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        <button class="explorer-nav-btn" id="explorer-up" title="\u00DCbergeordneter Ordner (Alt+Hoch)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                        <button class="explorer-nav-btn" id="explorer-refresh" title="Aktualisieren (F5)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        </button>
                        <button class="explorer-nav-btn" id="explorer-empty-folders" title="Leere Ordner finden">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                        </button>
                        <div class="explorer-address-bar" id="explorer-address-bar"></div>
                    </div>
                    <div class="explorer-file-list" id="explorer-file-list"></div>
                    <div class="explorer-status" id="explorer-status"></div>
                </div>
            </div>
        `;

        this.els = {
            qa: this.container.querySelector('#explorer-qa'),
            backBtn: this.container.querySelector('#explorer-back'),
            forwardBtn: this.container.querySelector('#explorer-forward'),
            upBtn: this.container.querySelector('#explorer-up'),
            refreshBtn: this.container.querySelector('#explorer-refresh'),
            emptyFoldersBtn: this.container.querySelector('#explorer-empty-folders'),
            addressBar: this.container.querySelector('#explorer-address-bar'),
            fileList: this.container.querySelector('#explorer-file-list'),
            status: this.container.querySelector('#explorer-status'),
        };

        this.els.backBtn.onclick = () => this.goBack();
        this.els.forwardBtn.onclick = () => this.goForward();
        this.els.upBtn.onclick = () => this.goUp();
        this.els.refreshBtn.onclick = () => this.refresh();
        this.els.emptyFoldersBtn.onclick = () => this.findEmptyFolders();

        this.container.tabIndex = 0;
        this.container.addEventListener('keydown', (e) => this.handleKeydown(e));
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
        this.updateNavButtons();
        this.renderAddressBar();
        this.updateQuickAccessHighlight();

        this.els.fileList.innerHTML = '<div class="explorer-loading"><div class="loading-spinner"></div></div>';

        const result = await window.api.listDirectory(dirPath);

        if (result.error) {
            this.els.fileList.innerHTML = `<div class="explorer-error">${this.esc(result.error)}</div>`;
            this.els.status.innerHTML = '';
            return;
        }

        this.entries = result.entries;
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

        let html = '<div class="explorer-breadcrumb-bar" id="explorer-bc-bar">';
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

        html += '</div>';
        bar.innerHTML = html;

        bar.querySelectorAll('.explorer-bc-segment').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                this.navigateTo(el.dataset.path);
            };
        });

        const bcBar = bar.querySelector('#explorer-bc-bar');
        if (bcBar) {
            bcBar.onclick = (e) => {
                if (e.target === bcBar || e.target.classList.contains('explorer-bc-current')) {
                    this.addressMode = 'input';
                    this.renderAddressInput();
                }
            };
        }
    }

    renderAddressInput() {
        const bar = this.els.addressBar;
        bar.innerHTML = `<input type="text" class="explorer-address-input" id="explorer-addr-input"
                           value="${this.escAttr(this.currentPath)}" spellcheck="false">`;

        const input = bar.querySelector('#explorer-addr-input');
        input.focus();
        input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const newPath = input.value.trim();
                if (newPath) {
                    this.addressMode = 'breadcrumb';
                    this.navigateTo(newPath);
                }
            }
            if (e.key === 'Escape') {
                this.addressMode = 'breadcrumb';
                this.renderAddressBreadcrumb();
            }
            e.stopPropagation();
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.addressMode === 'input') {
                    this.addressMode = 'breadcrumb';
                    this.renderAddressBreadcrumb();
                }
            }, 150);
        });
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
                    });
                }
            };
        });
    }

    updateQuickAccessHighlight() {
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
            const icon = entry.isDirectory ? FOLDER_ICON : FILE_ICON;
            const nameClass = entry.isDirectory ? 'explorer-col-name dir-name' : 'explorer-col-name';
            const sizeStr = entry.isDirectory ? '' : formatBytes(entry.size);
            const typeStr = entry.isDirectory ? 'Ordner' : (entry.extension || '-');
            const dateStr = entry.modified ? this.formatDateTime(entry.modified) : '-';

            // Size color coding (files only)
            const sizeClass = !entry.isDirectory ? getSizeClass(entry.size) : '';
            // Temp file detection
            const isTemp = !entry.isDirectory && isTempFile(entry.name, entry.extension);
            // Empty folder detection
            const isEmpty = entry.isDirectory && this.emptyFolderPaths.has(entry.path);
            const rowClasses = [sizeClass, isTemp ? 'explorer-temp-file' : '', isEmpty ? 'explorer-empty-folder' : ''].filter(Boolean).join(' ');
            const tempBadge = isTemp ? '<span class="explorer-temp-badge">Temp</span>' : '';
            const emptyBadge = isEmpty ? '<span class="explorer-empty-badge">Leer</span>' : '';

            bodyHtml += `<tr data-path="${this.escAttr(entry.path)}" data-is-dir="${entry.isDirectory}"
                            data-name="${this.escAttr(entry.name)}" draggable="true" class="${rowClasses}">
                <td class="explorer-col-icon">${icon}</td>
                <td class="${nameClass}" title="${this.escAttr(entry.path)}">${this.esc(entry.name)}${tempBadge}${emptyBadge}</td>
                <td class="explorer-col-size">${sizeStr}</td>
                <td class="explorer-col-type">${this.esc(typeStr)}</td>
                <td class="explorer-col-date">${dateStr}</td>
            </tr>`;
        }

        if (sorted.length === 0) {
            bodyHtml = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">Dieser Ordner ist leer</td></tr>';
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
                    window.api.openFile(row.dataset.path);
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
                    });
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
                    this.onContextMenu('tree-background', { path: this.currentPath });
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
        const entries = [...this.entries];
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
            const saved = localStorage.getItem('explorer-col-widths');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    }

    saveColumnWidths() {
        localStorage.setItem('explorer-col-widths', JSON.stringify(this.columnWidths));
    }

    // ===== Status Bar =====

    renderStatus(result) {
        const dirs = result.entries.filter(e => e.isDirectory).length;
        const files = result.entries.filter(e => !e.isDirectory).length;
        const totalSize = result.entries.filter(e => !e.isDirectory).reduce((s, e) => s + e.size, 0);

        let html = `<span class="explorer-status-count">${dirs} Ordner, ${files} Dateien</span>`;
        html += `<span>${formatBytes(totalSize)}</span>`;

        if (result.truncated) {
            html += `<span style="color:var(--warning)">Ansicht begrenzt auf 5.000 Eintr\u00E4ge (${result.totalEntries} insgesamt)</span>`;
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
            if (e.shiftKey) {
                window.api.deletePermanent(paths).then(() => this.refresh());
            } else {
                window.api.deleteToTrash(paths).then(() => this.refresh());
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
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    escAttr(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}

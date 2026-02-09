import { formatBytes, formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class OldFilesView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.data = null;
        this.selectedFiles = new Set();
        this.onPreview = null;
        this.sortCol = 'size';
        this.sortAsc = false;
    }

    init(scanId) {
        this.scanId = scanId;
        this.selectedFiles.clear();
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <div class="tool-filters">
                    <label>Älter als:
                        <select id="old-files-threshold">
                            <option value="30">30 Tage</option>
                            <option value="90">90 Tage</option>
                            <option value="180">180 Tage</option>
                            <option value="365" selected>1 Jahr</option>
                            <option value="730">2 Jahre</option>
                            <option value="1825">5 Jahre</option>
                        </select>
                    </label>
                    <label>Min. Größe:
                        <input type="text" id="old-files-minsize" placeholder="z.B. 1MB" class="filter-input" value="1MB">
                    </label>
                    <button class="btn btn-primary" id="old-files-search">Suchen</button>
                </div>
                <div class="tool-summary" id="old-files-summary"></div>
            </div>
            <div class="tool-actions" id="old-files-actions" style="display:none">
                <label class="check-all-label">
                    <input type="checkbox" id="old-files-check-all"> Alle auswählen
                </label>
                <button class="btn btn-danger" id="old-files-delete">Ausgewählte löschen</button>
                <span class="selected-info" id="old-files-selected-info"></span>
            </div>
            <div class="tool-results" id="old-files-results">
                <div class="tool-placeholder">Klicke "Suchen" um alte Dateien zu finden</div>
            </div>
        `;

        this.container.querySelector('#old-files-search').onclick = () => this.search();
        this.container.querySelector('#old-files-threshold').onchange = () => this.search();
    }

    async search() {
        if (!this.scanId) return;
        const threshold = parseInt(this.container.querySelector('#old-files-threshold').value);
        const minSizeStr = this.container.querySelector('#old-files-minsize').value;
        const minSize = this.parseSize(minSizeStr);

        const resultsEl = this.container.querySelector('#old-files-results');
        resultsEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            this.data = await window.api.getOldFiles(this.scanId, threshold, minSize);
            this.selectedFiles.clear();
            this.renderResults();
        } catch (e) {
            resultsEl.innerHTML = `<div class="tool-error">Fehler: ${e.message}</div>`;
        }
    }

    renderResults() {
        const resultsEl = this.container.querySelector('#old-files-results');
        const summaryEl = this.container.querySelector('#old-files-summary');
        const actionsEl = this.container.querySelector('#old-files-actions');

        if (!this.data || this.data.files.length === 0) {
            resultsEl.innerHTML = '<div class="tool-placeholder">Keine alten Dateien gefunden</div>';
            summaryEl.textContent = '';
            actionsEl.style.display = 'none';
            return;
        }

        summaryEl.textContent = `${formatNumber(this.data.totalCount)} Dateien \u00B7 ${formatBytes(this.data.totalSize)} gesamt`;
        actionsEl.style.display = 'flex';

        const sorted = this.getSortedFiles();

        resultsEl.innerHTML = `<table class="tool-table">
            <thead><tr>
                <th style="width:30px"></th>
                <th class="sortable" data-sort="name">Datei ${this.sortIcon('name')}</th>
                <th class="sortable" data-sort="context">Kontext ${this.sortIcon('context')}</th>
                <th>Pfad</th>
                <th class="sortable" data-sort="size" style="text-align:right">Größe ${this.sortIcon('size')}</th>
                <th class="sortable" data-sort="age" style="text-align:right">Alter ${this.sortIcon('age')}</th>
            </tr></thead>
            <tbody>${sorted.map(f => `
                <tr data-path="${this.esc(f.path)}">
                    <td><input type="checkbox" class="file-check" data-path="${this.esc(f.path)}" data-size="${f.size}"></td>
                    <td class="name-col" title="${this.esc(f.name)}">${this.esc(f.name)}</td>
                    <td class="context-col" title="${this.esc(f.context || '')}">${this.contextIcon(f.contextIcon)} ${this.esc(f.context || 'Sonstige')}</td>
                    <td class="path-col" title="${this.esc(f.path)}">${this.esc(f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/')))}</td>
                    <td class="size-col">${formatBytes(f.size)}</td>
                    <td class="age-col">${this.formatAge(f.ageDays)}</td>
                </tr>
            `).join('')}</tbody></table>`;

        // Wire events
        resultsEl.querySelectorAll('.file-check').forEach(cb => {
            cb.onchange = () => this.updateSelection();
        });

        resultsEl.querySelectorAll('tr[data-path]').forEach(row => {
            row.style.cursor = 'pointer';
            row.onclick = (e) => {
                if (e.target.type === 'checkbox') return;
                const cb = row.querySelector('.file-check');
                if (cb) {
                    cb.checked = !cb.checked;
                    this.updateSelection();
                }
            };
            row.ondblclick = () => window.api.openFile(row.dataset.path);
            row.oncontextmenu = (e) => {
                e.preventDefault();
                window.api.showContextMenu('file', { path: row.dataset.path, name: row.querySelector('.name-col').textContent });
            };
        });

        const checkAll = this.container.querySelector('#old-files-check-all');
        checkAll.checked = false;
        checkAll.onchange = () => {
            resultsEl.querySelectorAll('.file-check').forEach(cb => { cb.checked = checkAll.checked; });
            this.updateSelection();
        };

        this.container.querySelector('#old-files-delete').onclick = () => this.deleteSelected();

        // Wire sortable column headers
        resultsEl.querySelectorAll('th.sortable').forEach(th => {
            th.style.cursor = 'pointer';
            th.onclick = () => {
                const col = th.dataset.sort;
                if (this.sortCol === col) this.sortAsc = !this.sortAsc;
                else { this.sortCol = col; this.sortAsc = false; }
                this.renderResults();
            };
        });
    }

    updateSelection() {
        this.selectedFiles.clear();
        let selectedSize = 0;
        this.container.querySelectorAll('.file-check:checked').forEach(cb => {
            this.selectedFiles.add(cb.dataset.path);
            selectedSize += parseInt(cb.dataset.size);
        });
        const info = this.container.querySelector('#old-files-selected-info');
        info.textContent = this.selectedFiles.size > 0
            ? `${this.selectedFiles.size} ausgewählt (${formatBytes(selectedSize)})`
            : '';
    }

    async deleteSelected() {
        if (this.selectedFiles.size === 0) return;
        const paths = [...this.selectedFiles];

        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Dateien löschen',
            message: `${paths.length} alte Datei(en) in den Papierkorb verschieben?`,
            buttons: ['Abbrechen', 'Löschen'],
            defaultId: 0,
        });

        if (result.response !== 1) return;

        try {
            const results = await window.api.deleteToTrash(paths);
            const failed = results.filter(r => !r.success);
            if (failed.length > 0) {
                showToast(`${results.length - failed.length} gelöscht, ${failed.length} Fehler`, 'error');
            } else {
                showToast(`${results.length} Datei(en) gelöscht`, 'success');
            }
            this.search(); // refresh
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
    }

    getSortedFiles() {
        if (!this.data || !this.data.files) return [];
        return [...this.data.files].sort((a, b) => {
            let va, vb;
            switch (this.sortCol) {
                case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
                case 'context': va = (a.context || '').toLowerCase(); vb = (b.context || '').toLowerCase(); break;
                case 'size': va = a.size; vb = b.size; break;
                case 'age': va = a.ageDays; vb = b.ageDays; break;
                default: va = a.size; vb = b.size;
            }
            if (va < vb) return this.sortAsc ? -1 : 1;
            if (va > vb) return this.sortAsc ? 1 : -1;
            return 0;
        });
    }

    sortIcon(col) {
        if (this.sortCol !== col) return '';
        return this.sortAsc ? ' \u25B2' : ' \u25BC';
    }

    formatAge(days) {
        if (days >= 365) return `${Math.floor(days / 365)}J ${Math.floor((days % 365) / 30)}M`;
        if (days >= 30) return `${Math.floor(days / 30)}M ${days % 30}T`;
        return `${days}T`;
    }

    parseSize(str) {
        if (!str) return 0;
        str = str.trim().toUpperCase();
        const match = str.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        const unit = match[2] || 'B';
        const m = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
        return Math.round(num * (m[unit] || 1));
    }

    async autoSearch() {
        if (!this.scanId) return null;
        try {
            this.data = await window.api.getOldFiles(this.scanId, 365, 1024 * 1024);
            this.selectedFiles.clear();
            this.renderResults();
            return { totalCount: this.data.totalCount, totalSize: this.data.totalSize };
        } catch {
            return null;
        }
    }

    contextIcon(icon) {
        const icons = {
            'globe': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
            'trash': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
            'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
            'download': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            'download-cloud': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>',
            'monitor': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
            'file': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            'package': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
            'database': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
            'shield': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        };
        return icons[icon] || icons['file'];
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

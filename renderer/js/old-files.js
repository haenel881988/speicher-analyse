import { formatBytes, formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class OldFilesView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.data = null;
        this.selectedFiles = new Set();
        this.onPreview = null;
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

        resultsEl.innerHTML = `<table class="tool-table">
            <thead><tr>
                <th style="width:30px"></th>
                <th>Datei</th>
                <th>Pfad</th>
                <th style="text-align:right">Größe</th>
                <th style="text-align:right">Alter</th>
            </tr></thead>
            <tbody>${this.data.files.map(f => `
                <tr data-path="${this.esc(f.path)}">
                    <td><input type="checkbox" class="file-check" data-path="${this.esc(f.path)}" data-size="${f.size}"></td>
                    <td class="name-col" title="${this.esc(f.name)}">${this.esc(f.name)}</td>
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

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

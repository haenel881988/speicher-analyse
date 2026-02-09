import { formatBytes, formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class DuplicatesView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.results = null;
        this.scanning = false;
    }

    init(scanId) {
        this.scanId = scanId;
        this.results = null;
        this.scanning = false;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="dup-start-scan">Duplikat-Scan starten</button>
                <button class="btn" id="dup-cancel-scan" style="display:none">Abbrechen</button>
                <div class="tool-filters" style="display:inline-flex;gap:8px;margin-left:12px">
                    <label>Min: <input type="text" id="dup-min-size" class="filter-input" value="1KB" style="width:70px"></label>
                    <label>Max: <input type="text" id="dup-max-size" class="filter-input" value="2GB" style="width:70px"></label>
                </div>
                <div class="tool-summary" id="dup-summary"></div>
            </div>
            <div class="dup-progress" id="dup-progress" style="display:none">
                <div class="progress-bar-wrap"><div class="progress-bar-fill" id="dup-progress-bar" style="width:0%"></div></div>
                <div class="progress-text" id="dup-progress-text"></div>
            </div>
            <div class="tool-actions" id="dup-actions" style="display:none">
                <button class="btn btn-primary" id="dup-select-all">Alle Duplikate auswählen (Neueste behalten)</button>
                <button class="btn btn-danger" id="dup-delete">Ausgewählte löschen</button>
                <span class="selected-info" id="dup-selected-info"></span>
            </div>
            <div class="tool-results" id="dup-results">
                <div class="tool-placeholder">Klicke "Duplikat-Scan starten" nach einem abgeschlossenen Laufwerk-Scan</div>
            </div>
        `;

        this.container.querySelector('#dup-start-scan').onclick = () => this.startScan();
        this.container.querySelector('#dup-cancel-scan').onclick = () => this.cancelScan();
    }

    async startScan() {
        if (!this.scanId || this.scanning) return;
        this.scanning = true;

        const startBtn = this.container.querySelector('#dup-start-scan');
        const cancelBtn = this.container.querySelector('#dup-cancel-scan');
        const progressEl = this.container.querySelector('#dup-progress');
        const resultsEl = this.container.querySelector('#dup-results');

        startBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-block';
        progressEl.style.display = 'block';
        resultsEl.innerHTML = '';

        window.api.onDuplicateProgress((data) => {
            const pct = data.totalToHash > 0 ? (data.filesHashed / data.totalToHash * 100) : 0;
            this.container.querySelector('#dup-progress-bar').style.width = pct + '%';
            const etaText = data.eta > 0 ? ` · ca. ${data.eta}s` : '';
            this.container.querySelector('#dup-progress-text').textContent =
                `${data.phase === 'partial-hash' ? 'Vorab-Prüfung' : 'Vollständiger Hash'}: ${data.filesHashed}/${data.totalToHash}${etaText} - ${data.currentFile}`;
        });

        window.api.onDuplicateComplete((data) => {
            this.scanning = false;
            this.results = data;
            startBtn.style.display = 'inline-block';
            cancelBtn.style.display = 'none';
            progressEl.style.display = 'none';
            this.renderResults();
        });

        try {
            const minSize = this.parseSize(this.container.querySelector('#dup-min-size').value);
            const maxSize = this.parseSize(this.container.querySelector('#dup-max-size').value);
            await window.api.startDuplicateScan(this.scanId, { minSize, maxSize });
        } catch (e) {
            this.scanning = false;
            startBtn.style.display = 'inline-block';
            cancelBtn.style.display = 'none';
            progressEl.style.display = 'none';
            showToast('Duplikat-Scan Fehler: ' + e.message, 'error');
        }
    }

    cancelScan() {
        window.api.cancelDuplicateScan(this.scanId);
        this.scanning = false;
        this.container.querySelector('#dup-start-scan').style.display = 'inline-block';
        this.container.querySelector('#dup-cancel-scan').style.display = 'none';
        this.container.querySelector('#dup-progress').style.display = 'none';
    }

    renderResults() {
        const summaryEl = this.container.querySelector('#dup-summary');
        const actionsEl = this.container.querySelector('#dup-actions');
        const resultsEl = this.container.querySelector('#dup-results');

        if (!this.results || this.results.groups.length === 0) {
            summaryEl.textContent = 'Keine Duplikate gefunden!';
            actionsEl.style.display = 'none';
            resultsEl.innerHTML = '<div class="tool-placeholder">Keine doppelten Dateien gefunden</div>';
            return;
        }

        const { totalGroups, totalDuplicates, totalSaveable } = this.results;
        summaryEl.textContent = `${totalGroups} Gruppen \u00B7 ${totalDuplicates} Duplikate \u00B7 ${formatBytes(totalSaveable)} einsparbar`;
        actionsEl.style.display = 'flex';

        resultsEl.innerHTML = this.results.groups.map((group, gi) => `
            <div class="dup-group" data-group="${gi}">
                <div class="dup-group-header">
                    <span class="dup-group-info">${group.files.length} identische Dateien \u00B7 je ${formatBytes(group.size)}</span>
                    <span class="dup-group-save">Einsparbar: ${formatBytes(group.size * (group.files.length - 1))}</span>
                </div>
                <div class="dup-group-files">
                    ${group.files.map((f, fi) => `
                        <div class="dup-file-row" data-path="${this.esc(f.path)}">
                            <input type="checkbox" class="dup-check" data-group="${gi}" data-index="${fi}" data-path="${this.esc(f.path)}" data-size="${group.size}">
                            <span class="dup-file-name" title="${this.esc(f.path)}">${this.esc(f.name)}</span>
                            <span class="dup-file-path">${this.esc(f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/')))}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Wire events
        resultsEl.querySelectorAll('.dup-check').forEach(cb => {
            cb.onchange = () => this.updateSelectedInfo();
        });

        resultsEl.querySelectorAll('.dup-file-row').forEach(row => {
            row.ondblclick = () => window.api.openFile(row.dataset.path);
        });

        this.container.querySelector('#dup-select-all').onclick = () => this.selectAllDuplicates();
        this.container.querySelector('#dup-delete').onclick = () => this.deleteSelected();
    }

    selectAllDuplicates() {
        // For each group, check all except the newest (last modified)
        for (let gi = 0; gi < this.results.groups.length; gi++) {
            const group = this.results.groups[gi];
            // Find newest file index
            let newestIdx = 0;
            let newestTime = 0;
            group.files.forEach((f, fi) => {
                if (f.mtime > newestTime) {
                    newestTime = f.mtime;
                    newestIdx = fi;
                }
            });

            this.container.querySelectorAll(`.dup-check[data-group="${gi}"]`).forEach(cb => {
                cb.checked = parseInt(cb.dataset.index) !== newestIdx;
            });
        }
        this.updateSelectedInfo();
    }

    updateSelectedInfo() {
        let count = 0;
        let size = 0;
        this.container.querySelectorAll('.dup-check:checked').forEach(cb => {
            count++;
            size += parseInt(cb.dataset.size);
        });
        this.container.querySelector('#dup-selected-info').textContent =
            count > 0 ? `${count} ausgewählt (${formatBytes(size)})` : '';
    }

    async deleteSelected() {
        const paths = [];
        this.container.querySelectorAll('.dup-check:checked').forEach(cb => {
            paths.push(cb.dataset.path);
        });

        if (paths.length === 0) {
            showToast('Keine Dateien ausgewählt', 'info');
            return;
        }

        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Duplikate löschen',
            message: `${paths.length} Duplikat(e) in den Papierkorb verschieben?\n\nEinsparung: ${formatBytes(paths.length > 0 ? parseInt(this.container.querySelector('.dup-check:checked')?.dataset.size || 0) * paths.length : 0)}`,
            buttons: ['Abbrechen', 'Löschen'],
            defaultId: 0,
        });

        if (result.response !== 1) return;

        try {
            const results = await window.api.deleteToTrash(paths);
            const ok = results.filter(r => r.success).length;
            showToast(`${ok} Duplikat(e) gelöscht`, 'success');
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
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

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

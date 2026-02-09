import { formatBytes, formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class ScanCompareView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.comparison = null;
    }

    init(scanId) {
        this.scanId = scanId;
        this.comparison = null;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="compare-save">Aktuellen Scan speichern</button>
                <button class="btn" id="compare-load">Mit früherem Scan vergleichen</button>
                <div class="tool-summary" id="compare-summary"></div>
            </div>
            <div class="tool-results" id="compare-results">
                <div class="tool-placeholder">Speichere Scans und vergleiche sie später, um Veränderungen zu sehen</div>
            </div>
        `;

        this.container.querySelector('#compare-save').onclick = () => this.saveScan();
        this.container.querySelector('#compare-load').onclick = () => this.loadAndCompare();
    }

    async saveScan() {
        if (!this.scanId) {
            showToast('Kein aktiver Scan vorhanden', 'info');
            return;
        }

        try {
            const result = await window.api.saveScan(this.scanId);
            if (result.canceled) return;
            if (result.success) {
                showToast(`Scan gespeichert (${formatBytes(result.size)})`, 'success');
            }
        } catch (e) {
            showToast('Fehler beim Speichern: ' + e.message, 'error');
        }
    }

    async loadAndCompare() {
        if (!this.scanId) {
            showToast('Kein aktiver Scan zum Vergleichen', 'info');
            return;
        }

        try {
            const result = await window.api.compareScan(this.scanId);
            if (result.canceled) return;
            if (result.error) {
                showToast('Fehler: ' + result.error, 'error');
                return;
            }
            this.comparison = result;
            this.renderComparison();
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
    }

    renderComparison() {
        const resultsEl = this.container.querySelector('#compare-results');
        const summaryEl = this.container.querySelector('#compare-summary');
        const s = this.comparison.summary;

        const deltaClass = s.totalDelta > 0 ? 'delta-grew' : s.totalDelta < 0 ? 'delta-shrunk' : '';
        const deltaSign = s.totalDelta > 0 ? '+' : '';

        summaryEl.innerHTML = `
            Alter Scan: ${new Date(s.oldTimestamp).toLocaleDateString('de-DE')} \u00B7
            Neuer Scan: ${new Date(s.newTimestamp).toLocaleDateString('de-DE')} \u00B7
            <span class="${deltaClass}">${deltaSign}${formatBytes(s.totalDelta)}</span>
        `;

        const dirs = this.comparison.directories;
        const filterHtml = `
            <div class="compare-filters">
                <label><input type="checkbox" class="compare-filter" value="grew" checked> Gewachsen (${s.grewCount})</label>
                <label><input type="checkbox" class="compare-filter" value="shrunk" checked> Geschrumpft (${s.shrunkCount})</label>
                <label><input type="checkbox" class="compare-filter" value="new" checked> Neu (${s.newCount})</label>
                <label><input type="checkbox" class="compare-filter" value="deleted" checked> Gelöscht (${s.deletedCount})</label>
            </div>
        `;

        resultsEl.innerHTML = `
            <div class="compare-summary-cards">
                <div class="compare-card">
                    <div class="compare-card-label">Alter Scan</div>
                    <div class="compare-card-value">${formatBytes(s.totalOldSize)}</div>
                </div>
                <div class="compare-card">
                    <div class="compare-card-label">Neuer Scan</div>
                    <div class="compare-card-value">${formatBytes(s.totalNewSize)}</div>
                </div>
                <div class="compare-card ${deltaClass}">
                    <div class="compare-card-label">Änderung</div>
                    <div class="compare-card-value">${deltaSign}${formatBytes(s.totalDelta)}</div>
                </div>
            </div>
            ${filterHtml}
            <table class="tool-table" id="compare-table">
                <thead><tr>
                    <th>Pfad</th>
                    <th style="text-align:right">Alt</th>
                    <th style="text-align:right">Neu</th>
                    <th style="text-align:right">Änderung</th>
                    <th style="text-align:right">%</th>
                </tr></thead>
                <tbody id="compare-tbody"></tbody>
            </table>
        `;

        this.renderFilteredTable(dirs);

        resultsEl.querySelectorAll('.compare-filter').forEach(cb => {
            cb.onchange = () => this.renderFilteredTable(dirs);
        });
    }

    renderFilteredTable(dirs) {
        const activeFilters = new Set();
        this.container.querySelectorAll('.compare-filter:checked').forEach(cb => {
            activeFilters.add(cb.value);
        });

        const filtered = dirs.filter(d => activeFilters.has(d.status));
        const tbody = this.container.querySelector('#compare-tbody');

        tbody.innerHTML = filtered.map(d => {
            const sign = d.delta > 0 ? '+' : '';
            const statusClass = `compare-${d.status}`;
            return `<tr class="${statusClass}">
                <td class="path-col" title="${this.esc(d.path)}">${this.esc(d.name)}</td>
                <td class="size-col">${d.oldSize > 0 ? formatBytes(d.oldSize) : '-'}</td>
                <td class="size-col">${d.newSize > 0 ? formatBytes(d.newSize) : '-'}</td>
                <td class="size-col">${sign}${formatBytes(Math.abs(d.delta))}</td>
                <td class="pct-col">${d.pctChange.toFixed(1)}%</td>
            </tr>`;
        }).join('');
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

import { formatBytes, formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class CleanupView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.categories = [];
    }

    init(scanId) {
        this.scanId = scanId;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="cleanup-scan">Kategorien scannen</button>
                <div class="tool-summary" id="cleanup-summary"></div>
            </div>
            <div class="tool-actions" id="cleanup-actions" style="display:none">
                <label class="check-all-label">
                    <input type="checkbox" id="cleanup-check-all"> Alle auswählen
                </label>
                <button class="btn btn-danger" id="cleanup-clean">Ausgewählte bereinigen</button>
                <span class="selected-info" id="cleanup-selected-info"></span>
            </div>
            <div class="tool-results" id="cleanup-results">
                <div class="tool-placeholder">Klicke "Kategorien scannen" um bereinigbare Dateien zu finden</div>
            </div>
        `;

        this.container.querySelector('#cleanup-scan').onclick = () => this.scan();
    }

    async scan() {
        const resultsEl = this.container.querySelector('#cleanup-results');
        resultsEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            this.categories = await window.api.scanCleanupCategories(this.scanId);
            this.renderResults();
        } catch (e) {
            resultsEl.innerHTML = `<div class="tool-error">Fehler: ${e.message}</div>`;
        }
    }

    renderResults() {
        const resultsEl = this.container.querySelector('#cleanup-results');
        const summaryEl = this.container.querySelector('#cleanup-summary');
        const actionsEl = this.container.querySelector('#cleanup-actions');

        if (this.categories.length === 0) {
            resultsEl.innerHTML = '<div class="tool-placeholder">Keine bereinigbaren Dateien gefunden</div>';
            summaryEl.textContent = '';
            actionsEl.style.display = 'none';
            return;
        }

        const totalSize = this.categories.reduce((sum, c) => sum + c.totalSize, 0);
        summaryEl.textContent = `${this.categories.length} Kategorien \u00B7 ${formatBytes(totalSize)} bereinigbar`;
        actionsEl.style.display = 'flex';

        resultsEl.innerHTML = this.categories.map(cat => `
            <div class="cleanup-card" data-id="${cat.id}">
                <div class="cleanup-card-main">
                    <input type="checkbox" class="cleanup-check" data-id="${cat.id}" data-size="${cat.totalSize}" ${cat.requiresAdmin ? 'title="Admin-Rechte nötig"' : ''}>
                    <span class="cleanup-icon">${cat.icon}</span>
                    <div class="cleanup-info">
                        <div class="cleanup-name">${cat.name} ${cat.requiresAdmin ? '<span class="badge-admin">Admin</span>' : ''}</div>
                        <div class="cleanup-desc">${cat.description}</div>
                    </div>
                    <div class="cleanup-size">${formatBytes(cat.totalSize)}</div>
                    <div class="cleanup-count">${formatNumber(cat.fileCount)} Dateien</div>
                    ${cat.paths.length > 0 ? `<button class="btn-expand cleanup-expand" data-id="${cat.id}">\u25B6</button>` : ''}
                </div>
                <div class="cleanup-details" id="cleanup-details-${cat.id}" style="display:none">
                    ${cat.paths.map(p => `
                        <div class="cleanup-path-row">
                            <span class="cleanup-path">${this.esc(p.path)}</span>
                            <span class="cleanup-path-size">${formatBytes(p.size)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Wire events
        resultsEl.querySelectorAll('.cleanup-check').forEach(cb => {
            cb.onchange = () => this.updateSelectedInfo();
        });

        resultsEl.querySelectorAll('.cleanup-expand').forEach(btn => {
            btn.onclick = () => {
                const details = this.container.querySelector(`#cleanup-details-${btn.dataset.id}`);
                const isOpen = details.style.display !== 'none';
                details.style.display = isOpen ? 'none' : 'block';
                btn.textContent = isOpen ? '\u25B6' : '\u25BC';
            };
        });

        const checkAll = this.container.querySelector('#cleanup-check-all');
        checkAll.checked = false;
        checkAll.onchange = () => {
            resultsEl.querySelectorAll('.cleanup-check').forEach(cb => { cb.checked = checkAll.checked; });
            this.updateSelectedInfo();
        };

        this.container.querySelector('#cleanup-clean').onclick = () => this.cleanSelected();
    }

    updateSelectedInfo() {
        let count = 0;
        let size = 0;
        this.container.querySelectorAll('.cleanup-check:checked').forEach(cb => {
            count++;
            size += parseInt(cb.dataset.size);
        });
        this.container.querySelector('#cleanup-selected-info').textContent =
            count > 0 ? `${count} Kategorien (${formatBytes(size)})` : '';
    }

    async cleanSelected() {
        const selectedIds = [];
        this.container.querySelectorAll('.cleanup-check:checked').forEach(cb => {
            selectedIds.push(cb.dataset.id);
        });

        if (selectedIds.length === 0) {
            showToast('Keine Kategorien ausgewählt', 'info');
            return;
        }

        const totalSize = selectedIds.reduce((sum, id) => {
            const cat = this.categories.find(c => c.id === id);
            return sum + (cat ? cat.totalSize : 0);
        }, 0);

        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Bereinigung starten',
            message: `${selectedIds.length} Kategorie(n) bereinigen?\n\nGeschätzte Ersparnis: ${formatBytes(totalSize)}\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`,
            buttons: ['Abbrechen', 'Bereinigen'],
            defaultId: 0,
        });

        if (result.response !== 1) return;

        let totalDeleted = 0;
        let totalErrors = 0;

        for (const id of selectedIds) {
            const cat = this.categories.find(c => c.id === id);
            const paths = cat ? cat.paths.map(p => p.path) : [];
            try {
                const res = await window.api.cleanCategory(id, paths);
                if (res.success) {
                    totalDeleted += res.deletedCount;
                    totalErrors += res.errors.length;
                }
            } catch (e) {
                totalErrors++;
            }
        }

        if (totalErrors > 0) {
            showToast(`${totalDeleted} gelöscht, ${totalErrors} Fehler`, 'error');
        } else {
            showToast(`Bereinigung abgeschlossen: ${totalDeleted} Elemente gelöscht`, 'success');
        }

        this.scan(); // refresh
    }

    async autoScan() {
        if (!this.scanId) return null;
        try {
            this.categories = await window.api.scanCleanupCategories(this.scanId);
            this.renderResults();
            const totalSize = this.categories.reduce((sum, c) => sum + c.totalSize, 0);
            return { categories: this.categories.length, totalSize };
        } catch {
            return null;
        }
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

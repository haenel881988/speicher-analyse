import { formatNumber } from './utils.js';
import { showToast } from './tree.js';

export class RegistryView {
    constructor(container) {
        this.container = container;
        this.categories = [];
    }

    async init() {
        const platform = await window.api.getPlatform();
        if (platform !== 'win32') {
            this.container.innerHTML = '<div class="tool-placeholder">Registry-Bereinigung ist nur unter Windows verfügbar</div>';
            return;
        }
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="registry-warning">
                \u26A0 \u00C4nderungen an der Windows-Registry k\u00F6nnen das System beeintr\u00E4chtigen.
                Vor jeder Bereinigung wird automatisch eine Sicherung erstellt.
            </div>
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="reg-scan">Registry scannen</button>
                <div class="tool-summary" id="reg-summary"></div>
            </div>
            <div class="tool-actions" id="reg-actions" style="display:none">
                <label class="check-all-label">
                    <input type="checkbox" id="reg-check-all"> Alle auswählen
                </label>
                <button class="btn" id="reg-backup">Sicherung erstellen</button>
                <button class="btn btn-danger" id="reg-clean">Ausgew\u00E4hlte bereinigen</button>
                <button class="btn" id="reg-restore">Sicherung wiederherstellen</button>
                <span class="selected-info" id="reg-selected-info"></span>
            </div>
            <div class="tool-results" id="reg-results">
                <div class="tool-placeholder">Klicke "Registry scannen" um verwaiste Einträge zu finden</div>
            </div>
        `;

        this.container.querySelector('#reg-scan').onclick = () => this.scan();
    }

    async scan() {
        const resultsEl = this.container.querySelector('#reg-results');
        resultsEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            this.categories = await window.api.scanRegistry();
            this.renderResults();
        } catch (e) {
            resultsEl.innerHTML = `<div class="tool-error">Fehler: ${this.esc(e.message)}<br>Möglicherweise sind Administratorrechte erforderlich.</div>`;
        }
    }

    renderResults() {
        const resultsEl = this.container.querySelector('#reg-results');
        const summaryEl = this.container.querySelector('#reg-summary');
        const actionsEl = this.container.querySelector('#reg-actions');

        const totalEntries = this.categories.reduce((sum, c) => sum + c.entries.length, 0);

        if (totalEntries === 0) {
            resultsEl.innerHTML = '<div class="tool-placeholder">Keine verwaisten Registry-Einträge gefunden</div>';
            summaryEl.textContent = 'Registry ist sauber!';
            actionsEl.style.display = 'none';
            return;
        }

        summaryEl.textContent = `${this.categories.length} Kategorien \u00B7 ${totalEntries} Einträge gefunden`;
        actionsEl.style.display = 'flex';

        resultsEl.innerHTML = this.categories.map(cat => `
            <div class="reg-category">
                <div class="reg-category-header">
                    <span class="reg-category-icon">${cat.icon}</span>
                    <span class="reg-category-name">${cat.name}</span>
                    <span class="reg-category-count">(${cat.entries.length})</span>
                    <button class="btn-expand reg-expand" data-id="${cat.id}">\u25BC</button>
                </div>
                <div class="reg-category-desc">${cat.description}</div>
                <div class="reg-entries" id="reg-entries-${cat.id}">
                    ${cat.entries.map((entry, ei) => `
                        <div class="reg-entry">
                            <input type="checkbox" class="reg-check" data-cat="${cat.id}" data-idx="${ei}">
                            <div class="reg-entry-info">
                                <div class="reg-entry-name">${this.esc(entry.name)}</div>
                                <div class="reg-entry-reason">${this.esc(entry.reason)}</div>
                                <div class="reg-entry-key">${this.esc(entry.key)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Wire events
        resultsEl.querySelectorAll('.reg-check').forEach(cb => {
            cb.onchange = () => this.updateSelectedInfo();
        });

        resultsEl.querySelectorAll('.reg-expand').forEach(btn => {
            btn.onclick = () => {
                const entries = this.container.querySelector(`#reg-entries-${btn.dataset.id}`);
                const isOpen = entries.style.display !== 'none';
                entries.style.display = isOpen ? 'none' : 'block';
                btn.textContent = isOpen ? '\u25B6' : '\u25BC';
            };
        });

        const checkAll = this.container.querySelector('#reg-check-all');
        checkAll.checked = false;
        checkAll.onchange = () => {
            resultsEl.querySelectorAll('.reg-check').forEach(cb => { cb.checked = checkAll.checked; });
            this.updateSelectedInfo();
        };

        this.container.querySelector('#reg-backup').onclick = () => this.createBackup();
        this.container.querySelector('#reg-clean').onclick = () => this.cleanSelected();
        this.container.querySelector('#reg-restore').onclick = () => this.restoreBackup();
    }

    updateSelectedInfo() {
        let count = 0;
        this.container.querySelectorAll('.reg-check:checked').forEach(() => count++);
        this.container.querySelector('#reg-selected-info').textContent =
            count > 0 ? `${count} Einträge ausgewählt` : '';
    }

    getSelectedEntries() {
        const entries = [];
        this.container.querySelectorAll('.reg-check:checked').forEach(cb => {
            const cat = this.categories.find(c => c.id === cb.dataset.cat);
            if (cat) entries.push(cat.entries[parseInt(cb.dataset.idx)]);
        });
        return entries;
    }

    async createBackup() {
        const entries = this.getSelectedEntries();
        if (entries.length === 0) {
            showToast('Bitte erst Einträge auswählen', 'info');
            return;
        }

        try {
            const result = await window.api.exportRegistryBackup(entries);
            if (result.canceled) return;
            if (result.success) {
                showToast(`Sicherung erstellt: ${result.path}`, 'success');
            }
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
    }

    async cleanSelected() {
        const entries = this.getSelectedEntries();
        if (entries.length === 0) return;

        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Registry bereinigen',
            message: `${entries.length} Registry-Eintrag/Einträge löschen?\n\nStellen Sie sicher, dass eine Sicherung erstellt wurde!`,
            buttons: ['Abbrechen', 'Bereinigen'],
            defaultId: 0,
        });

        if (result.response !== 1) return;

        try {
            const response = await window.api.cleanRegistry(entries);
            const ok = response.results.filter(r => r.success).length;
            const failed = response.results.filter(r => !r.success).length;

            if (failed > 0) {
                showToast(`${ok} bereinigt, ${failed} Fehler. Backup: ${response.backupPath}`, 'error');
            } else {
                showToast(`${ok} Eintr\u00E4ge bereinigt. Backup: ${response.backupPath}`, 'success');
            }

            this.scan(); // refresh
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
    }

    async autoScan() {
        try {
            this.categories = await window.api.scanRegistry();
            this.renderResults();
            const totalEntries = this.categories.reduce((sum, c) => sum + c.entries.length, 0);
            return { categories: this.categories.length, totalEntries };
        } catch {
            return null;
        }
    }

    async restoreBackup() {
        try {
            const result = await window.api.restoreRegistryBackup();
            if (result.canceled) return;
            if (result.success) {
                showToast('Sicherung wiederhergestellt', 'success');
            } else {
                showToast('Fehler: ' + result.error, 'error');
            }
        } catch (e) {
            showToast('Fehler: ' + e.message, 'error');
        }
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

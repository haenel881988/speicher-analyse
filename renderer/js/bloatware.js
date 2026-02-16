import { formatBytes, escapeHtml } from './utils.js';

export class BloatwareView {
    constructor(container) {
        this.container = container;
        this.results = [];
        this.selectedItems = new Set();
    }

    async init() {
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="bloatware-scan-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Bloatware suchen
                </button>
                <span class="tool-summary" id="bloatware-summary"></span>
            </div>
            <div class="bloatware-legend">
                <span class="bloatware-legend-item"><span class="risk-dot risk-high"></span> Gefährlich</span>
                <span class="bloatware-legend-item"><span class="risk-dot risk-medium"></span> Unnötig</span>
                <span class="bloatware-legend-item"><span class="risk-dot risk-low"></span> Fragwürdig</span>
            </div>
            <div class="tool-actions" id="bloatware-actions" style="display:none">
                <label class="check-all-label">
                    <input type="checkbox" id="bloatware-check-all"> Alle auswählen
                </label>
                <span class="selected-info" id="bloatware-selected-info"></span>
                <button class="btn btn-danger" id="bloatware-uninstall-btn" disabled>Ausgewählte deinstallieren</button>
            </div>
            <div class="tool-results" id="bloatware-results">
                <div class="tool-placeholder">Klicke auf "Bloatware suchen" um installierte Bloatware zu finden.</div>
            </div>
        `;

        this.container.querySelector('#bloatware-scan-btn').onclick = () => this.scan();
    }

    async scan() {
        const resultsEl = this.container.querySelector('#bloatware-results');
        const summaryEl = this.container.querySelector('#bloatware-summary');
        resultsEl.innerHTML = '<div class="tool-placeholder"><div class="loading-spinner"></div> Suche nach Bloatware...</div>';
        summaryEl.textContent = '';

        try {
            this.results = await window.api.scanBloatware();
            this.selectedItems.clear();

            if (this.results.length === 0) {
                resultsEl.innerHTML = '<div class="tool-placeholder" style="color:var(--success)">Keine Bloatware gefunden! Dein System ist sauber.</div>';
                summaryEl.textContent = '0 Programme gefunden';
                this.container.querySelector('#bloatware-actions').style.display = 'none';
                return;
            }

            summaryEl.textContent = `${this.results.length} Programme gefunden`;
            this.container.querySelector('#bloatware-actions').style.display = 'flex';
            this.renderResults();
            this.setupActions();
        } catch (err) {
            resultsEl.innerHTML = `<div class="tool-error">Fehler: ${escapeHtml(err.message)}</div>`;
        }
    }

    renderResults() {
        const resultsEl = this.container.querySelector('#bloatware-results');

        const grouped = { 'gefährlich': [], 'unnötig': [], 'fragwürdig': [] };
        for (const item of this.results) {
            if (grouped[item.category]) grouped[item.category].push(item);
        }

        let html = '';
        for (const [category, items] of Object.entries(grouped)) {
            if (items.length === 0) continue;
            const riskClass = category === 'gefährlich' ? 'risk-high' : category === 'unnötig' ? 'risk-medium' : 'risk-low';
            const label = category.charAt(0).toUpperCase() + category.slice(1);

            html += `
                <div class="bloatware-category">
                    <div class="bloatware-category-header ${riskClass}">
                        <span class="risk-dot ${riskClass}"></span>
                        <span>${label}</span>
                        <span class="bloatware-category-count">${items.length} Programme</span>
                    </div>
                    <div class="bloatware-category-items">
            `;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const idx = this.results.indexOf(item);
                html += `
                    <div class="bloatware-item" data-idx="${idx}">
                        <label class="bloatware-item-check">
                            <input type="checkbox" data-idx="${idx}" ${this.selectedItems.has(idx) ? 'checked' : ''}>
                        </label>
                        <div class="bloatware-item-info">
                            <div class="bloatware-item-name">
                                ${escapeHtml(item.programName)}
                                ${item.publisher ? `<span class="bloatware-item-publisher">von ${escapeHtml(item.publisher)}</span>` : ''}
                            </div>
                            <div class="bloatware-item-desc">${escapeHtml(item.description)}</div>
                            <div class="bloatware-item-meta">
                                ${item.estimatedSize > 0 ? formatBytes(item.estimatedSize) : ''}
                                ${item.installDate ? ` \u00B7 Installiert: ${item.installDate}` : ''}
                            </div>
                        </div>
                        <div class="bloatware-item-risk">
                            <span class="risk-badge ${riskClass}">${label}</span>
                        </div>
                    </div>
                `;
            }

            html += '</div></div>';
        }

        resultsEl.innerHTML = html;

        // Checkbox-Handler
        resultsEl.querySelectorAll('input[type="checkbox"][data-idx]').forEach(cb => {
            cb.onchange = () => {
                const idx = parseInt(cb.dataset.idx);
                if (cb.checked) this.selectedItems.add(idx);
                else this.selectedItems.delete(idx);
                this.updateSelectedInfo();
            };
        });
    }

    setupActions() {
        const checkAll = this.container.querySelector('#bloatware-check-all');
        const uninstallBtn = this.container.querySelector('#bloatware-uninstall-btn');

        checkAll.onchange = () => {
            if (checkAll.checked) {
                this.results.forEach((_, i) => this.selectedItems.add(i));
            } else {
                this.selectedItems.clear();
            }
            this.renderResults();
            this.updateSelectedInfo();
        };

        uninstallBtn.onclick = () => this.uninstallSelected();
    }

    updateSelectedInfo() {
        const infoEl = this.container.querySelector('#bloatware-selected-info');
        const btn = this.container.querySelector('#bloatware-uninstall-btn');
        infoEl.textContent = `${this.selectedItems.size} ausgewählt`;
        btn.disabled = this.selectedItems.size === 0;
    }

    async uninstallSelected() {
        if (this.selectedItems.size === 0) return;

        const items = [...this.selectedItems].map(i => this.results[i]);
        const names = items.map(i => i.programName).join(', ');

        if (!confirm(`Möchtest du folgende ${items.length} Programme deinstallieren?\n\n${names}\n\nVor jeder Deinstallation wird versucht, die stille Deinstallation zu nutzen.`)) {
            return;
        }

        const resultsEl = this.container.querySelector('#bloatware-results');
        resultsEl.innerHTML = '<div class="tool-placeholder"><div class="loading-spinner"></div> Deinstallation läuft...</div>';

        const results = [];
        for (const item of items) {
            try {
                const result = await window.api.uninstallBloatware(item);
                results.push(result);
            } catch (err) {
                results.push({ success: false, programName: item.programName, error: err.message });
            }
        }

        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        let msg = `Deinstallation abgeschlossen: ${success} erfolgreich`;
        if (failed > 0) msg += `, ${failed} fehlgeschlagen`;

        // Toast-Nachricht
        const toast = document.createElement('div');
        toast.className = `toast ${failed > 0 ? 'error' : 'success'}`;
        const textSpan = document.createElement('span');
        textSpan.className = 'toast-text';
        textSpan.textContent = msg;
        toast.appendChild(textSpan);
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.remove(), 5000);

        // Erneut scannen
        this.selectedItems.clear();
        await this.scan();
    }
}


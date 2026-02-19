import { formatBytes, escapeHtml, isStub } from './utils.js';

export class OptimizerView {
    constructor(container) {
        this.container = container;
        this.recommendations = [];
        this._cache = null;
        this._cacheTime = 0;
    }

    async init() {
        this.render();
    }

    async autoScan() {
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        if (this._cache && (Date.now() - this._cacheTime) < CACHE_TTL) {
            return this._cache;
        }
        try {
            this.recommendations = await window.api.getOptimizations();
            this._cache = { totalRecommendations: this.recommendations.length };
            this._cacheTime = Date.now();
            if (this.recommendations.length > 0) this.renderResults();
            return this._cache;
        } catch {
            return { totalRecommendations: 0 };
        }
    }

    destroy() {
        this.container.innerHTML = '';
        this.recommendations = [];
        this._cache = null;
        this._cacheTime = 0;
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="optimizer-scan-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    System analysieren
                </button>
                <span class="tool-summary" id="optimizer-summary"></span>
            </div>
            <div class="tool-results" id="optimizer-results">
                <div class="tool-placeholder">Klicke auf "System analysieren" um Optimierungsmöglichkeiten zu finden.</div>
            </div>
        `;

        this.container.querySelector('#optimizer-scan-btn').onclick = () => this.scan();
    }

    async scan() {
        const resultsEl = this.container.querySelector('#optimizer-results');
        const summaryEl = this.container.querySelector('#optimizer-summary');
        resultsEl.innerHTML = '<div class="tool-placeholder"><div class="loading-spinner"></div> Analysiere System...</div>';

        try {
            this.recommendations = await window.api.getOptimizations();

            if (this.recommendations.length === 0) {
                resultsEl.innerHTML = '<div class="tool-placeholder" style="color:var(--success)">Keine Optimierungen nötig! Dein System ist bereits optimal konfiguriert.</div>';
                summaryEl.textContent = '';
                return;
            }

            summaryEl.textContent = `${this.recommendations.length} Empfehlungen`;
            this.renderResults();
        } catch (err) {
            resultsEl.innerHTML = `<div class="tool-error">Fehler: ${escapeHtml(err.message)}</div>`;
        }
    }

    renderResults() {
        const resultsEl = this.container.querySelector('#optimizer-results');

        const grouped = { hardware: [], privacy: [], performance: [] };
        for (const rec of this.recommendations) {
            if (grouped[rec.category]) grouped[rec.category].push(rec);
        }

        const labels = { hardware: 'Hardware-Optimierungen', privacy: 'Datenschutz', performance: 'Leistung' };
        const icons = { hardware: '\u2699\uFE0F', privacy: '\uD83D\uDD12', performance: '\u26A1' };

        let html = '';
        for (const [cat, items] of Object.entries(grouped)) {
            if (items.length === 0) continue;

            html += `
                <div class="opt-category">
                    <div class="opt-category-header">
                        <span>${icons[cat]} ${labels[cat]}</span>
                        <span class="opt-category-count">${items.length} Empfehlungen</span>
                    </div>
            `;

            for (const rec of items) {
                const impactClass = rec.impact === 'high' ? 'impact-high' : rec.impact === 'medium' ? 'impact-medium' : 'impact-low';
                const impactLabel = rec.impact === 'high' ? 'Hoch' : rec.impact === 'medium' ? 'Mittel' : 'Niedrig';

                html += `
                    <div class="opt-item" data-id="${rec.id}">
                        <div class="opt-item-info">
                            <div class="opt-item-title">${escapeHtml(rec.title)}</div>
                            <div class="opt-item-desc">${escapeHtml(rec.description)}</div>
                            ${rec.savingsBytes ? `<div class="opt-item-savings">Einsparung: ${formatBytes(rec.savingsBytes)}</div>` : ''}
                            ${rec.manualSteps ? `<div class="opt-item-manual">${escapeHtml(rec.manualSteps)}</div>` : ''}
                            ${rec.technicalDetail ? `<details class="opt-technical"><summary>Technische Details</summary><pre class="opt-technical-pre">${escapeHtml(rec.technicalDetail)}</pre></details>` : ''}
                        </div>
                        <div class="opt-item-actions">
                            <span class="impact-badge ${impactClass}">${impactLabel}</span>
                            ${rec.command || rec.customAction ? `<button class="btn btn-sm btn-primary opt-apply-btn" data-id="${rec.id}">Anwenden</button>` : ''}
                            ${rec.requiresAdmin ? '<span class="badge-admin" title="Erfordert Administratorrechte">Admin</span>' : ''}
                        </div>
                    </div>
                `;
            }

            html += '</div>';
        }

        resultsEl.innerHTML = html;

        resultsEl.querySelectorAll('.opt-apply-btn').forEach(btn => {
            btn.onclick = () => this.applyOptimization(btn.dataset.id, btn);
        });
    }

    async applyOptimization(id, btn) {
        const rec = this.recommendations.find(r => r.id === id);
        if (!rec) return;

        if (!confirm(`Möchtest du folgende Optimierung anwenden?\n\n${rec.title}\n\n${rec.description}${rec.reversible ? '\n\nDiese Änderung kann rückgängig gemacht werden.' : ''}`)) {
            return;
        }

        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await window.api.applyOptimization(id);
            if (isStub(result, 'Optimierung')) {
                btn.textContent = 'Anwenden';
                btn.disabled = false;
            } else if (result.success) {
                btn.textContent = '\u2713 Angewendet';
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-success-done');
                btn.style.color = 'var(--success)';
                btn.style.borderColor = 'var(--success)';
            } else if (result.requiresAdmin || (result.error && result.error.includes('Administratorrechte'))) {
                btn.textContent = 'Anwenden';
                btn.disabled = false;
                this.offerAdminRestart(result.error);
            } else {
                btn.textContent = 'Fehler';
                btn.disabled = false;
                showToastMsg(`Fehler: ${result.error}`, 'error');
            }
        } catch (err) {
            btn.textContent = 'Fehler';
            btn.disabled = false;
            showToastMsg(`Fehler: ${err.message}`, 'error');
        }
    }

    async offerAdminRestart(errorMsg) {
        const doRestart = confirm(
            `${errorMsg}\n\nMöchtest du die App mit Administratorrechten neu starten?\n\nDeine Scan-Daten werden automatisch übernommen.`
        );
        if (!doRestart) return;

        showToastMsg('Starte als Administrator neu...', 'info');
        try {
            const result = await window.api.restartAsAdmin();
            if (!result.success) {
                showToastMsg(`Neustart fehlgeschlagen: ${result.error}`, 'error');
            }
        } catch (err) {
            showToastMsg(`Neustart fehlgeschlagen: ${err.message}`, 'error');
        }
    }
}


function showToastMsg(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = msg;
    toast.appendChild(textSpan);
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

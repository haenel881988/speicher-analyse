import { formatBytes, formatNumber } from './utils.js';

export class DashboardView {
    constructor(container) {
        this.container = container;
        this.scanId = null;
        this.scanData = null;
        this.analysisResults = null;
        this.onNavigate = null;
    }

    init(scanId, scanProgress) {
        this.scanId = scanId;
        this.scanData = scanProgress;
        this.analysisResults = null;
        this.render();
    }

    updateResults(results) {
        this.analysisResults = results;
        this.renderCards();
    }

    render() {
        this.container.innerHTML = `
            <div class="dashboard">
                <div class="dashboard-header">
                    <h2>Analyse-Übersicht</h2>
                </div>
                <div class="dashboard-cards" id="dashboard-cards"></div>
            </div>
        `;
        this.renderCards();
    }

    destroy() {
        this.container.innerHTML = '';
        this.scanData = null;
        this.analysisResults = null;
    }

    renderCards() {
        const cardsEl = this.container.querySelector('#dashboard-cards');
        if (!cardsEl) return;

        const s = this.scanData || {};
        const r = this.analysisResults || {};

        const cleanupVal = r.cleanup && r.cleanup.status === 'fulfilled' && r.cleanup.value;
        const oldFilesVal = r.oldFiles && r.oldFiles.status === 'fulfilled' && r.oldFiles.value;
        const optimizerVal = r.optimizer && r.optimizer.status === 'fulfilled' && r.optimizer.value;
        const dupVal = r.sizeDuplicates && r.sizeDuplicates.status === 'fulfilled' && r.sizeDuplicates.value;

        cardsEl.innerHTML = `
            <div class="dash-card dash-card-primary">
                <div class="dash-card-icon">&#x1F4BE;</div>
                <div class="dash-card-title">Speicherbelegung</div>
                <div class="dash-card-value">${formatBytes(s.total_size || 0)}</div>
                <div class="dash-card-detail">${formatNumber(s.files_found || 0)} Dateien &middot; ${formatNumber(s.dirs_scanned || 0)} Ordner</div>
            </div>

            <div class="dash-card ${cleanupVal ? 'clickable' : 'loading'}" data-action="cleanup">
                <div class="dash-card-icon">&#x1F5D1;</div>
                <div class="dash-card-title">Bereinigung</div>
                <div class="dash-card-value">${cleanupVal ? formatBytes(cleanupVal.totalSize) + ' einsparbar' : 'Wird analysiert...'}</div>
                <div class="dash-card-detail">${cleanupVal ? cleanupVal.categories + ' Kategorien gefunden' : ''}</div>
            </div>

            <div class="dash-card ${oldFilesVal ? 'clickable' : 'loading'}" data-action="old-files">
                <div class="dash-card-icon">&#x1F4C5;</div>
                <div class="dash-card-title">Alte Dateien</div>
                <div class="dash-card-value">${oldFilesVal ? formatNumber(oldFilesVal.totalCount) + ' Dateien' : 'Wird analysiert...'}</div>
                <div class="dash-card-detail">${oldFilesVal ? formatBytes(oldFilesVal.totalSize) + ' (&gt;1 Jahr, &gt;1MB)' : ''}</div>
            </div>

            <div class="dash-card ${dupVal ? 'clickable' : 'loading'}" data-action="duplicates">
                <div class="dash-card-icon">&#x1F4CB;</div>
                <div class="dash-card-title">Duplikate</div>
                <div class="dash-card-value">${dupVal ? (dupVal.totalGroups > 0 ? '~' + formatBytes(dupVal.totalSaveable) + ' einsparbar' : 'Keine gefunden') : 'Wird analysiert...'}</div>
                <div class="dash-card-detail">${dupVal ? formatNumber(dupVal.totalFiles) + ' Dateien in ' + formatNumber(dupVal.totalGroups) + ' Gruppen (Vorschau)' : ''}</div>
            </div>

            <div class="dash-card ${optimizerVal ? 'clickable' : 'loading'}" data-action="optimizer">
                <div class="dash-card-icon">&#x26A1;</div>
                <div class="dash-card-title">Optimierung</div>
                <div class="dash-card-value">${optimizerVal ? optimizerVal.totalRecommendations + ' Empfehlungen' : 'Wird analysiert...'}</div>
                <div class="dash-card-detail">${optimizerVal ? 'Hardware, Datenschutz, Leistung' : ''}</div>
            </div>

            <div class="dash-card clickable" data-action="autostart">
                <div class="dash-card-icon">&#x1F680;</div>
                <div class="dash-card-title">Autostart</div>
                <div class="dash-card-value">Eintr&auml;ge anzeigen</div>
                <div class="dash-card-detail">Programme beim Systemstart</div>
            </div>

            <div class="dash-card clickable" data-action="services">
                <div class="dash-card-icon">&#x2699;</div>
                <div class="dash-card-title">Dienste</div>
                <div class="dash-card-value">Dienste verwalten</div>
                <div class="dash-card-detail">Windows-Dienste steuern</div>
            </div>
        `;

        // Wire click handlers
        cardsEl.querySelectorAll('.dash-card.clickable').forEach(card => {
            card.onclick = () => {
                const action = card.dataset.action;
                if (this.onNavigate) this.onNavigate(action);
            };
        });
    }
}

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

    renderCards() {
        const cardsEl = this.container.querySelector('#dashboard-cards');
        if (!cardsEl) return;

        const s = this.scanData || {};
        const r = this.analysisResults || {};

        const cleanupVal = r.cleanup && r.cleanup.status === 'fulfilled' && r.cleanup.value;
        const oldFilesVal = r.oldFiles && r.oldFiles.status === 'fulfilled' && r.oldFiles.value;
        const registryVal = r.registry && r.registry.status === 'fulfilled' && r.registry.value;

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

            <div class="dash-card ${registryVal ? 'clickable' : 'loading'}" data-action="registry">
                <div class="dash-card-icon">&#x1F527;</div>
                <div class="dash-card-title">Registry</div>
                <div class="dash-card-value">${registryVal ? registryVal.totalEntries + ' Eintr&auml;ge' : 'Wird analysiert...'}</div>
                <div class="dash-card-detail">${registryVal ? registryVal.categories + ' Kategorien' : ''}</div>
            </div>

            <div class="dash-card clickable" data-action="duplicates">
                <div class="dash-card-icon">&#x1F4CB;</div>
                <div class="dash-card-title">Duplikate</div>
                <div class="dash-card-value">Scan starten</div>
                <div class="dash-card-detail">Identische Dateien finden</div>
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

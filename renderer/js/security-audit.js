/**
 * Security Audit View - Sicherheits-Check mit Ampel-System und Historie.
 */
import { escapeHtml } from './utils.js';
import { showToast } from './tree.js';
import { generateSecurityReport } from './report-gen.js';

export class SecurityAuditView {
    constructor(container) {
        this.container = container;
        this.auditResult = null;
        this.history = [];
        this._loaded = false;
        this._loading = false;
        this._showHistory = false;
    }

    async init() {
        this._loaded = false;
        this.container.innerHTML = '<div class="loading-state">Sicherheits-Check wird vorbereitet...</div>';
        try {
            this.history = await window.api.getAuditHistory();
            this._loaded = true;
            this.render();
        } catch (err) {
            this._loaded = false;
            console.error('Security-Audit Init Fehler:', err);
            this.container.innerHTML = `<div class="security-page">
                <div class="security-header"><h2>Sicherheits-Check</h2></div>
                <div class="error-state" style="padding:24px">
                    <p><strong>Fehler beim Laden:</strong> ${escapeHtml(err.message)}</p>
                    <button class="network-btn" id="security-retry" style="margin-top:12px">Erneut versuchen</button>
                </div>
            </div>`;
            this.container.querySelector('#security-retry')?.addEventListener('click', () => this.init());
        }
    }

    async runAudit() {
        if (this._loading) return;
        this._loading = true;
        this.render();
        try {
            this.auditResult = await window.api.runSecurityAudit();
            this.history = await window.api.getAuditHistory();
            this._loading = false;
            this.render();
        } catch (err) {
            console.error('Security-Audit Fehler:', err);
            this._loading = false;
            showToast('Sicherheits-Check fehlgeschlagen: ' + err.message, 'error');
            this.render();
        }
    }

    render() {
        const lastScanTime = this.auditResult?.timestamp
            ? new Date(this.auditResult.timestamp).toLocaleString('de-DE')
            : (this.history.length > 0
                ? new Date(this.history[this.history.length - 1].timestamp).toLocaleString('de-DE')
                : null);

        this.container.innerHTML = `
            <div class="security-page">
                <div class="security-header">
                    <h2>Sicherheits-Check</h2>
                    ${lastScanTime ? `<span class="network-timestamp">Letzter Scan: ${lastScanTime}</span>` : ''}
                </div>
                <div class="security-toolbar">
                    <button class="network-btn" id="security-run-audit" ${this._loading ? 'disabled' : ''}>
                        ${this._loading ? 'Wird geprüft...' : 'Jetzt prüfen'}
                    </button>
                    ${this.history.length > 0 ? `<button class="network-btn network-btn-secondary" id="security-toggle-history">
                        ${this._showHistory ? 'Ergebnisse anzeigen' : `Historie (${this.history.length} Scans)`}
                    </button>` : ''}
                    ${this.auditResult || this.history.length > 0 ? `<button class="network-btn network-btn-secondary" id="security-generate-report">Bericht erstellen (PDF)</button>` : ''}
                </div>
                ${this._loading ? '<div class="loading-state">Sicherheits-Checks werden durchgeführt...<br><small>Das kann bis zu 30 Sekunden dauern.</small></div>' : ''}
                ${!this._loading && this._showHistory ? this._renderHistory() : ''}
                ${!this._loading && !this._showHistory ? this._renderResults() : ''}
            </div>`;

        this._wireEvents();
    }

    _renderResults() {
        if (!this.auditResult) {
            if (this.history.length > 0) {
                // Zeige letzten Scan aus Historie
                const last = this.history[this.history.length - 1];
                return this._renderChecks(last.checks, []);
            }
            return '<div class="network-empty">Noch kein Sicherheits-Check durchgeführt. Klicke "Jetzt prüfen" um den Check zu starten.</div>';
        }

        return `${this._renderDiff()}${this._renderChecks(this.auditResult.checks, this.auditResult.diff || [])}`;
    }

    _renderDiff() {
        const diff = this.auditResult?.diff;
        if (!diff || diff.length === 0) return '';

        return `<div class="security-diff">
            <h3>Änderungen seit dem letzten Scan</h3>
            ${diff.map(d => `<div class="security-diff-item ${d.improved ? 'security-diff-improved' : 'security-diff-degraded'}">
                <span class="security-diff-icon">${d.improved ? '&#9650;' : '&#9660;'}</span>
                <strong>${escapeHtml(d.label)}</strong>:
                <span class="security-diff-old">${this._statusLabel(d.oldStatus)}</span>
                &#8594;
                <span class="security-diff-new">${this._statusLabel(d.newStatus)}</span>
                <div class="security-diff-detail">${escapeHtml(d.newMessage)}</div>
            </div>`).join('')}
        </div>`;
    }

    _renderChecks(checks, diff) {
        if (!checks || checks.length === 0) return '';

        const okCount = checks.filter(c => c.status === 'ok').length;
        const warnCount = checks.filter(c => c.status === 'warning').length;
        const dangerCount = checks.filter(c => c.status === 'danger').length;

        return `<div class="security-summary">
            <div class="security-summary-item security-summary-ok">
                <span class="security-summary-count">${okCount}</span>
                <span class="security-summary-label">In Ordnung</span>
            </div>
            <div class="security-summary-item security-summary-warn">
                <span class="security-summary-count">${warnCount}</span>
                <span class="security-summary-label">Warnungen</span>
            </div>
            <div class="security-summary-item security-summary-danger">
                <span class="security-summary-count">${dangerCount}</span>
                <span class="security-summary-label">Kritisch</span>
            </div>
        </div>
        <div class="security-checks">
            ${checks.map(c => this._renderCheckCard(c)).join('')}
        </div>`;
    }

    _renderCheckCard(check) {
        const icon = check.status === 'ok' ? '&#10004;'
            : check.status === 'warning' ? '&#9888;'
            : check.status === 'danger' ? '&#10008;'
            : '&#63;';

        return `<div class="security-check-card security-status-${check.status}">
            <div class="security-check-icon">${icon}</div>
            <div class="security-check-content">
                <div class="security-check-label">${escapeHtml(check.label)}</div>
                <div class="security-check-message">${escapeHtml(check.message)}</div>
            </div>
        </div>`;
    }

    _renderHistory() {
        if (this.history.length === 0) return '<div class="network-empty">Keine Historie vorhanden.</div>';

        const reversed = [...this.history].reverse().slice(0, 20);
        return `<div class="security-history">
            <h3>Scan-Historie</h3>
            <div class="security-history-list">
                ${reversed.map(entry => {
                    const date = new Date(entry.timestamp).toLocaleString('de-DE');
                    const okCount = entry.checks.filter(c => c.status === 'ok').length;
                    const warnCount = entry.checks.filter(c => c.status === 'warning').length;
                    const dangerCount = entry.checks.filter(c => c.status === 'danger').length;
                    return `<div class="security-history-entry">
                        <span class="security-history-date">${date}</span>
                        <span class="security-history-stats">
                            <span class="security-dot security-dot-ok"></span>${okCount}
                            <span class="security-dot security-dot-warn"></span>${warnCount}
                            <span class="security-dot security-dot-danger"></span>${dangerCount}
                        </span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    _statusLabel(status) {
        switch (status) {
            case 'ok': return '<span class="security-label-ok">OK</span>';
            case 'warning': return '<span class="security-label-warn">Warnung</span>';
            case 'danger': return '<span class="security-label-danger">Kritisch</span>';
            default: return '<span class="security-label-error">Fehler</span>';
        }
    }

    _wireEvents() {
        const runBtn = this.container.querySelector('#security-run-audit');
        if (runBtn) runBtn.onclick = () => this.runAudit();

        const historyBtn = this.container.querySelector('#security-toggle-history');
        if (historyBtn) {
            historyBtn.onclick = () => {
                this._showHistory = !this._showHistory;
                this.render();
            };
        }

        const reportBtn = this.container.querySelector('#security-generate-report');
        if (reportBtn) {
            reportBtn.onclick = () => this._generateReport();
        }
    }

    async _generateReport() {
        try {
            // Audit-Daten sammeln
            const auditResult = this.auditResult || (this.history.length > 0 ? this.history[this.history.length - 1] : null);

            // Score-Daten holen (optional)
            let scoreData = null;
            try {
                scoreData = await window.api.getSystemScore?.({});
            } catch { /* optional */ }

            // Netzwerk-Daten holen (optional)
            let connections = null, summary = null, devices = null;
            try {
                [summary, connections] = await Promise.all([
                    window.api.getNetworkSummary?.(),
                    window.api.getGroupedConnections?.(),
                ]);
            } catch { /* optional */ }

            await generateSecurityReport({
                auditResult,
                scoreData,
                connections,
                summary,
                devices: devices || [],
            });
        } catch (err) {
            console.error('Report-Generierung fehlgeschlagen:', err);
            showToast('Bericht konnte nicht erstellt werden: ' + err.message, 'error');
        }
    }

    /**
     * Gibt die letzten Audit-Checks zurück (für System-Score).
     */
    destroy() {
        this.container.innerHTML = '';
        this.auditResult = null;
        this.history = [];
        this._loaded = false;
    }

    getLastChecks() {
        if (this.auditResult?.checks) return this.auditResult.checks;
        if (this.history.length > 0) return this.history[this.history.length - 1].checks;
        return null;
    }
}

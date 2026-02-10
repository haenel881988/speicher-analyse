/**
 * Network Monitor View - Live network connections, bandwidth, and firewall management.
 */
import { showToast } from './tree.js';

export class NetworkView {
    constructor(container) {
        this.container = container;
        this.connections = [];
        this.bandwidth = [];
        this.summary = null;
        this.pollInterval = null;
        this.activeSubTab = 'connections';
        this.sortCol = 'processName';
        this.sortAsc = true;
        this.filter = '';
        this._loaded = false;
    }

    async init() {
        this.container.innerHTML = '<div class="loading-state">Netzwerk wird analysiert...</div>';
        this._errorCount = 0;
        await this.refresh();
    }

    async refresh() {
        try {
            // Sequentiell laden um PowerShell-Parallelprobleme zu vermeiden
            const summary = await window.api.getNetworkSummary();
            this.summary = summary;

            const connections = await window.api.getConnections();
            this.connections = connections || [];

            const bandwidth = await window.api.getBandwidth();
            this.bandwidth = bandwidth || [];

            this._lastError = null;
            this._errorCount = 0;
            this._loaded = true;
            this.render();
        } catch (err) {
            console.error('Netzwerk-Monitor Fehler:', err);
            this._lastError = err.message;
            this._loaded = false;
            this._errorCount = (this._errorCount || 0) + 1;

            // Bei wiederholten Fehlern Auto-Refresh stoppen
            if (this._errorCount >= 3 && this.pollInterval) {
                this.stopPolling();
            }

            this.container.innerHTML = `
                <div class="network-page">
                    <div class="network-header"><h2>Netzwerk-Monitor</h2></div>
                    <div class="error-state" style="padding:24px">
                        <p><strong>Fehler beim Laden der Netzwerkdaten:</strong></p>
                        <p style="color:var(--text-secondary);margin:8px 0">${this._esc(err.message)}</p>
                        <p style="color:var(--text-muted);font-size:12px;margin:8px 0">
                            Mögliche Ursachen: PowerShell-Berechtigungen, Netzwerk-Cmdlets nicht verfügbar, oder Timeout.
                            Versuche es erneut oder starte die App als Administrator.
                        </p>
                        ${this._errorCount >= 3 ? '<p style="color:var(--text-muted);font-size:12px">Auto-Refresh wurde nach 3 Fehlern gestoppt.</p>' : ''}
                        <button class="network-btn" id="network-retry" style="margin-top:12px">Erneut versuchen</button>
                    </div>
                </div>`;
            const retryBtn = this.container.querySelector('#network-retry');
            if (retryBtn) {
                retryBtn.onclick = async () => {
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Wird geladen...';
                    this._errorCount = 0;
                    await this.refresh();
                };
            }
        }
    }

    startPolling(intervalMs = 5000) {
        this.stopPolling();
        this.pollInterval = setInterval(() => this.refresh(), intervalMs);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    render() {
        const s = this.summary || {};
        this.container.innerHTML = `
            <div class="network-page">
                <div class="network-header">
                    <h2>Netzwerk-Monitor</h2>
                    <div class="network-stats">
                        <span class="network-stat"><strong>${s.totalConnections || 0}</strong> Verbindungen</span>
                        <span class="network-stat"><strong>${s.establishedCount || 0}</strong> Aktiv</span>
                        <span class="network-stat"><strong>${s.listeningCount || 0}</strong> Lauschend</span>
                        <span class="network-stat"><strong>${s.uniqueRemoteIPs || 0}</strong> Remote-IPs</span>
                    </div>
                </div>
                <div class="network-tabs">
                    <button class="network-tab ${this.activeSubTab === 'connections' ? 'active' : ''}" data-subtab="connections">Verbindungen</button>
                    <button class="network-tab ${this.activeSubTab === 'bandwidth' ? 'active' : ''}" data-subtab="bandwidth">Bandbreite</button>
                    <button class="network-tab ${this.activeSubTab === 'top' ? 'active' : ''}" data-subtab="top">Top-Prozesse</button>
                </div>
                <div class="network-toolbar">
                    <input type="text" class="network-search" placeholder="Filtern..." value="${this._esc(this.filter)}">
                    <button class="network-btn" id="network-refresh">Aktualisieren</button>
                    <button class="network-btn" id="network-auto-refresh">${this.pollInterval ? 'Auto-Stop' : 'Auto-Refresh (5s)'}</button>
                </div>
                <div class="network-content">
                    ${this._renderSubTab()}
                </div>
            </div>`;

        this._wireEvents();
    }

    _renderSubTab() {
        switch (this.activeSubTab) {
            case 'connections': return this._renderConnections();
            case 'bandwidth': return this._renderBandwidth();
            case 'top': return this._renderTopProcesses();
            default: return '';
        }
    }

    _renderConnections() {
        let conns = this.connections;
        if (this.filter) {
            const q = this.filter.toLowerCase();
            conns = conns.filter(c =>
                (c.processName || '').toLowerCase().includes(q) ||
                (c.remoteAddress || '').includes(q) ||
                String(c.remotePort).includes(q)
            );
        }
        conns = [...conns].sort((a, b) => {
            const va = a[this.sortCol] || '', vb = b[this.sortCol] || '';
            if (typeof va === 'number') return this.sortAsc ? va - vb : vb - va;
            return this.sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });

        if (conns.length === 0) return '<div class="network-empty">Keine Verbindungen gefunden</div>';

        return `<table class="network-table">
            <thead>
                <tr>
                    <th data-col="processName" class="sortable">Prozess</th>
                    <th data-col="localPort" class="sortable">Lokal</th>
                    <th data-col="remoteAddress" class="sortable">Remote-IP</th>
                    <th data-col="remotePort" class="sortable">Port</th>
                    <th data-col="state" class="sortable">Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${conns.slice(0, 500).map(c => {
                    const stateClass = c.state === 'Established' ? 'safe' :
                        c.state === 'Listen' ? 'moderate' : 'neutral';
                    const isLocal = c.remoteAddress === '127.0.0.1' || c.remoteAddress === '::1' || c.remoteAddress === '0.0.0.0';
                    return `<tr class="${isLocal ? 'network-row-local' : ''}">
                        <td title="${this._esc(c.processPath || '')}">${this._esc(c.processName || 'System')}</td>
                        <td>${c.localPort}</td>
                        <td class="network-ip">${this._esc(c.remoteAddress || '-')}</td>
                        <td>${c.remotePort || '-'}</td>
                        <td><span class="risk-badge risk-${stateClass}">${c.state}</span></td>
                        <td>${c.processName && !isLocal ? `<button class="network-btn-small" data-block="${this._esc(c.processName)}" data-path="${this._esc(c.processPath || '')}">Blockieren</button>` : ''}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        ${conns.length > 500 ? `<div class="network-truncated">${conns.length - 500} weitere ausgeblendet</div>` : ''}`;
    }

    _renderBandwidth() {
        if (this.bandwidth.length === 0) return '<div class="network-empty">Keine Netzwerkadapter gefunden</div>';

        return `<div class="network-bandwidth-grid">
            ${this.bandwidth.map(b => {
                const rxMB = (b.receivedBytes / (1024 * 1024)).toFixed(1);
                const txMB = (b.sentBytes / (1024 * 1024)).toFixed(1);
                return `<div class="network-adapter-card ${b.status === 'Up' ? '' : 'network-adapter-down'}">
                    <div class="network-adapter-name">${this._esc(b.name)}</div>
                    <div class="network-adapter-desc">${this._esc(b.description || '')}</div>
                    <div class="network-adapter-speed">${b.linkSpeed || '-'}</div>
                    <div class="network-adapter-stats">
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">Empfangen</span>
                            <span class="network-stat-value">${rxMB} MB</span>
                        </div>
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">Gesendet</span>
                            <span class="network-stat-value">${txMB} MB</span>
                        </div>
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">Pakete</span>
                            <span class="network-stat-value">${(b.receivedPackets || 0).toLocaleString('de')}</span>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    _renderTopProcesses() {
        const top = this.summary?.topProcesses || [];
        if (top.length === 0) return '<div class="network-empty">Keine Daten</div>';

        const maxCount = top[0]?.connectionCount || 1;
        return `<div class="network-top-list">
            ${top.map((p, i) => {
                const pct = Math.round((p.connectionCount / maxCount) * 100);
                return `<div class="network-top-item">
                    <span class="network-top-rank">${i + 1}</span>
                    <span class="network-top-name">${this._esc(p.name)}</span>
                    <div class="network-top-bar">
                        <div class="network-top-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="network-top-count">${p.connectionCount}</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    _wireEvents() {
        // Sub-tabs
        this.container.querySelectorAll('.network-tab').forEach(tab => {
            tab.onclick = () => {
                this.activeSubTab = tab.dataset.subtab;
                this.render();
            };
        });

        // Search
        const searchInput = this.container.querySelector('.network-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.filter = searchInput.value;
                this.render();
            };
        }

        // Refresh
        const refreshBtn = this.container.querySelector('#network-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                await this.refresh();
                refreshBtn.disabled = false;
            };
        }

        // Auto-refresh
        const autoBtn = this.container.querySelector('#network-auto-refresh');
        if (autoBtn) {
            autoBtn.onclick = () => {
                if (this.pollInterval) {
                    this.stopPolling();
                } else {
                    this.startPolling();
                }
                this.render();
            };
        }

        // Sort
        this.container.querySelectorAll('th.sortable').forEach(th => {
            th.onclick = () => {
                const col = th.dataset.col;
                if (this.sortCol === col) this.sortAsc = !this.sortAsc;
                else { this.sortCol = col; this.sortAsc = true; }
                this.render();
            };
        });

        // Block buttons
        this.container.querySelectorAll('button[data-block]').forEach(btn => {
            btn.onclick = async () => {
                const name = btn.dataset.block;
                const processPath = btn.dataset.path;
                btn.disabled = true;
                try {
                    const result = await window.api.blockProcess(name, processPath);
                    if (result.success) {
                        showToast(`${name} blockiert`, 'success');
                    } else {
                        showToast(result.error || 'Fehler (Admin-Rechte erforderlich?)', 'error');
                    }
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                btn.disabled = false;
            };
        });
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

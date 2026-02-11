/**
 * Network Monitor View - Grouped connections by process, IP resolution,
 * snapshot mode with optional real-time polling, ghost process detection.
 */
import { showToast } from './tree.js';

export class NetworkView {
    constructor(container) {
        this.container = container;
        this.groupedData = [];
        this.bandwidth = [];
        this.summary = null;
        this.pollInterval = null;
        this.activeSubTab = 'connections';
        this.filter = '';
        this.snapshotMode = true;
        this._expandedGroups = new Set();
        this._lastRefreshTime = null;
        this._loaded = false;
        this._errorCount = 0;
        this.localDevices = [];
        this._devicesLoading = false;
    }

    async init() {
        this.container.innerHTML = '<div class="loading-state">Netzwerk wird analysiert...</div>';
        this._errorCount = 0;
        this.snapshotMode = true;
        this.stopPolling();
        await this.refresh();
    }

    async refresh() {
        try {
            // Sequentiell laden um PowerShell-Parallelprobleme zu vermeiden
            const summary = await window.api.getNetworkSummary();
            this.summary = summary;

            const grouped = await window.api.getGroupedConnections();
            this.groupedData = grouped || [];

            const bandwidth = await window.api.getBandwidth();
            this.bandwidth = bandwidth || [];

            this._lastRefreshTime = new Date();
            this._lastError = null;
            this._errorCount = 0;
            this._loaded = true;
            this.render();
        } catch (err) {
            console.error('Netzwerk-Monitor Fehler:', err);
            this._lastError = err.message;
            this._loaded = false;
            this._errorCount = (this._errorCount || 0) + 1;

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
        const timeStr = this._lastRefreshTime ? this._lastRefreshTime.toLocaleTimeString('de-DE') : '';
        const totalCompanies = new Set(this.groupedData.flatMap(g => g.resolvedCompanies || [])).size;
        const highRiskCount = this.groupedData.filter(g => g.hasHighRisk).length;

        this.container.innerHTML = `
            <div class="network-page">
                <div class="network-header">
                    <h2>Netzwerk-Monitor</h2>
                    <div class="network-stats">
                        <span class="network-stat"><strong>${s.totalConnections || 0}</strong> Verbindungen</span>
                        <span class="network-stat"><strong>${s.establishedCount || 0}</strong> Aktiv</span>
                        <span class="network-stat"><strong>${s.listeningCount || 0}</strong> Lauschend</span>
                        <span class="network-stat"><strong>${s.uniqueRemoteIPs || 0}</strong> Remote-IPs</span>
                        <span class="network-stat"><strong>${totalCompanies}</strong> Firmen</span>
                        ${highRiskCount > 0 ? `<span class="network-stat network-stat-danger"><strong>${highRiskCount}</strong> Hochrisiko</span>` : ''}
                    </div>
                </div>
                <div class="network-tabs">
                    <button class="network-tab ${this.activeSubTab === 'connections' ? 'active' : ''}" data-subtab="connections">Verbindungen</button>
                    <button class="network-tab ${this.activeSubTab === 'devices' ? 'active' : ''}" data-subtab="devices">Lokale Geräte${this.localDevices.length > 0 ? ` (${this.localDevices.length})` : ''}</button>
                    <button class="network-tab ${this.activeSubTab === 'bandwidth' ? 'active' : ''}" data-subtab="bandwidth">Bandbreite</button>
                    <button class="network-tab ${this.activeSubTab === 'top' ? 'active' : ''}" data-subtab="top">Top-Prozesse</button>
                </div>
                <div class="network-toolbar">
                    <input type="text" class="network-search" placeholder="Filtern nach Prozess oder IP..." value="${this._esc(this.filter)}">
                    <button class="network-btn" id="network-refresh">${this.snapshotMode ? 'Snapshot aufnehmen' : 'Aktualisieren'}</button>
                    <label class="network-toggle-label">
                        <input type="checkbox" id="network-realtime-toggle" ${!this.snapshotMode ? 'checked' : ''}>
                        <span class="network-toggle-slider"></span>
                        <span>Echtzeit</span>
                    </label>
                    ${timeStr ? `<span class="network-timestamp">Stand: ${timeStr}</span>` : ''}
                    ${!this.snapshotMode && this.pollInterval ? `<span class="network-recording-indicator">&#9679; Aufnahme (${this.groupedData.length} Apps, ${s.totalConnections || 0} Verbindungen)</span>` : ''}
                </div>
                <div class="network-content">
                    ${this._renderSubTab()}
                </div>
            </div>`;

        this._wireEvents();
    }

    _renderSubTab() {
        switch (this.activeSubTab) {
            case 'connections': return this._renderGroupedConnections();
            case 'devices': return this._renderLocalDevices();
            case 'bandwidth': return this._renderBandwidth();
            case 'top': return this._renderTopProcesses();
            default: return '';
        }
    }

    _renderGroupedConnections() {
        if (!this.groupedData || this.groupedData.length === 0) {
            return '<div class="network-empty">Keine Verbindungen gefunden</div>';
        }

        let groups = this.groupedData;
        if (this.filter) {
            const q = this.filter.toLowerCase();
            groups = groups.filter(g =>
                g.processName.toLowerCase().includes(q) ||
                g.uniqueIPs.some(ip => ip.includes(q)) ||
                this._groupHasCompanyMatch(g, q)
            );
        }

        return `<div class="network-groups">
            ${groups.map(g => {
                const hasEstablished = g.states.Established > 0;
                const statusColor = !g.isRunning ? 'danger' :
                    hasEstablished ? 'safe' : 'neutral';
                const ghostWarning = !g.isRunning && g.connectionCount > 0;
                const expanded = this._expandedGroups.has(g.processName);

                const companySummary = g.resolvedCompanies?.length
                    ? g.resolvedCompanies.slice(0, 3).join(', ') + (g.resolvedCompanies.length > 3 ? ', ...' : '')
                    : '';

                return `<div class="network-group ${ghostWarning ? 'network-group-ghost' : ''}" data-process="${this._esc(g.processName)}">
                    <div class="network-group-header" data-toggle="${this._esc(g.processName)}">
                        <span class="network-group-arrow">${expanded ? '&#9660;' : '&#9654;'}</span>
                        <span class="network-status-dot network-status-${statusColor}"></span>
                        <strong class="network-group-name">${this._esc(g.processName)}</strong>
                        <span class="network-group-badge">${g.connectionCount}</span>
                        <span class="network-group-ips">${g.uniqueIPCount} IP${g.uniqueIPCount !== 1 ? 's' : ''}${companySummary ? ' (' + this._esc(companySummary) + ')' : ''}</span>
                        ${g.hasTrackers ? '<span class="network-tracker-badge">Tracker</span>' : ''}
                        ${g.hasHighRisk ? '<span class="network-highrisk-badge">&#9888; Hochrisiko</span>' : ''}
                        <span class="network-group-states">
                            ${Object.entries(g.states).map(([state, count]) =>
                                `<span class="network-state-pill">${state}: ${count}</span>`
                            ).join('')}
                        </span>
                        ${ghostWarning ? '<span class="network-ghost-warning">Hintergrund-Aktivität!</span>' : ''}
                        ${g.processPath ? `<button class="network-btn-small" data-block="${this._esc(g.processName)}" data-path="${this._esc(g.processPath)}">Blockieren</button>` : ''}
                    </div>
                    ${expanded ? this._renderGroupDetail(g) : ''}
                </div>`;
            }).join('')}
        </div>`;
    }

    _renderGroupDetail(g) {
        // Verbindungen nach Remote-IP gruppieren, lokale IPs ausblenden
        const ipGroups = new Map();
        for (const c of g.connections) {
            if (c.resolved?.isLocal) continue;
            const ip = c.remoteAddress || '';
            if (!ip) continue;
            if (!ipGroups.has(ip)) ipGroups.set(ip, []);
            ipGroups.get(ip).push(c);
        }

        if (ipGroups.size === 0) {
            return '<div class="network-group-detail"><em style="color:var(--text-secondary);padding:8px;display:block">Nur lokale Verbindungen</em></div>';
        }

        let rows = '';
        for (const [ip, connections] of ipGroups) {
            const info = connections[0].resolved || {};
            const isTracker = info.isTracker;
            const isHighRisk = info.isHighRisk;
            const flag = this._countryFlag(info.countryCode);
            const ports = [...new Set(connections.map(c => c.remotePort).filter(Boolean))].sort((a, b) => a - b);
            const states = {};
            for (const c of connections) {
                states[c.state] = (states[c.state] || 0) + 1;
            }
            const stateStr = Object.entries(states).map(([s, n]) => `${s}: ${n}`).join(', ');
            const rowClass = isHighRisk ? 'network-row-highrisk' : isTracker ? 'network-row-tracker' : '';

            rows += `<tr class="${rowClass}">
                <td class="network-ip">${this._esc(ip)}</td>
                <td class="network-company ${isHighRisk ? 'network-highrisk' : isTracker ? 'network-tracker' : ''}">${flag ? flag + ' ' : ''}${this._esc(info.org || 'Unbekannt')}${isHighRisk ? ' &#9888;' : isTracker ? ' &#128065;' : ''}${isHighRisk ? ` <span class="network-highrisk-label">${this._esc(info.country)}</span>` : ''}</td>
                <td class="network-isp" title="${this._esc(info.isp || '')}">${this._esc(info.isp && info.isp !== info.org ? info.isp : '')}</td>
                <td>${ports.join(', ') || '-'}</td>
                <td>${connections.length}</td>
                <td><span class="network-state-pills">${stateStr}</span></td>
            </tr>`;
        }

        return `<div class="network-group-detail">
            <table class="network-table">
                <thead><tr>
                    <th>Remote-IP</th>
                    <th>Firma</th>
                    <th>Anbieter</th>
                    <th>Ports</th>
                    <th>Verb.</th>
                    <th>Status</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    _groupHasCompanyMatch(group, query) {
        if (group.resolvedCompanies?.some(c => c.toLowerCase().includes(query))) return true;
        return group.connections.some(c =>
            c.resolved?.org?.toLowerCase().includes(query) ||
            c.resolved?.isp?.toLowerCase().includes(query)
        );
    }

    /**
     * Konvertiert 2-Buchstaben-Ländercode in Flaggen-Emoji.
     */
    _countryFlag(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '';
        const cc = countryCode.toUpperCase();
        const offset = 127397;
        return String.fromCodePoint(cc.charCodeAt(0) + offset, cc.charCodeAt(1) + offset);
    }

    _renderLocalDevices() {
        if (this._devicesLoading) {
            return '<div class="loading-state">Netzwerk wird gescannt...</div>';
        }

        const scanBtn = `<button class="network-btn" id="network-scan-devices">Netzwerk scannen</button>`;

        if (this.localDevices.length === 0) {
            return `<div class="network-devices-section">
                <div class="network-devices-toolbar">${scanBtn}</div>
                <div class="network-empty">Noch kein Scan durchgeführt. Klicke "Netzwerk scannen" um Geräte im lokalen Netzwerk zu finden.</div>
            </div>`;
        }

        let filtered = this.localDevices;
        if (this.filter) {
            const q = this.filter.toLowerCase();
            filtered = filtered.filter(d =>
                d.ip.includes(q) || d.mac.toLowerCase().includes(q) ||
                d.hostname.toLowerCase().includes(q) || d.vendor.toLowerCase().includes(q)
            );
        }

        const rows = filtered.map(d => {
            const stateClass = d.state === 'Erreichbar' ? 'network-device-reachable' :
                d.state === 'Veraltet' ? 'network-device-stale' : '';
            return `<tr class="${stateClass}">
                <td>${this._esc(d.hostname) || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td class="network-ip">${this._esc(d.ip)}</td>
                <td style="font-family:monospace;font-size:11px">${this._esc(d.mac)}</td>
                <td>${this._esc(d.vendor) || '<span style="color:var(--text-muted)">Unbekannt</span>'}</td>
                <td><span class="network-device-state ${stateClass}">${this._esc(d.state)}</span></td>
            </tr>`;
        }).join('');

        return `<div class="network-devices-section">
            <div class="network-devices-toolbar">
                ${scanBtn}
                <span class="network-timestamp">${filtered.length} Gerät${filtered.length !== 1 ? 'e' : ''} gefunden</span>
            </div>
            <table class="network-table network-devices-table">
                <thead><tr>
                    <th>Hostname</th>
                    <th>IP-Adresse</th>
                    <th>MAC-Adresse</th>
                    <th>Hersteller</th>
                    <th>Status</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
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
                refreshBtn.textContent = 'Wird geladen...';
                await this.refresh();
            };
        }

        // Echtzeit-Toggle
        const realtimeToggle = this.container.querySelector('#network-realtime-toggle');
        if (realtimeToggle) {
            realtimeToggle.onchange = () => {
                this.snapshotMode = !realtimeToggle.checked;
                if (!this.snapshotMode) {
                    this.startPolling(5000);
                } else {
                    this.stopPolling();
                }
                this.render();
            };
        }

        // Group toggle (aufklappen/zuklappen)
        this.container.querySelectorAll('[data-toggle]').forEach(header => {
            header.onclick = (e) => {
                if (e.target.closest('button')) return;
                const processName = header.dataset.toggle;
                if (this._expandedGroups.has(processName)) {
                    this._expandedGroups.delete(processName);
                } else {
                    this._expandedGroups.add(processName);
                }
                this.render();
            };
        });

        // Device scan
        const scanDevicesBtn = this.container.querySelector('#network-scan-devices');
        if (scanDevicesBtn) {
            scanDevicesBtn.onclick = async () => {
                this._devicesLoading = true;
                this.render();
                try {
                    this.localDevices = await window.api.scanLocalNetwork();
                } catch (err) {
                    console.error('Geräte-Scan Fehler:', err);
                    this.localDevices = [];
                    showToast('Geräte-Scan fehlgeschlagen: ' + err.message, 'error');
                }
                this._devicesLoading = false;
                this.render();
            };
        }

        // Block buttons
        this.container.querySelectorAll('button[data-block]').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
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

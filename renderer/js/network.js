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
        this.activeSubTab = 'overview';
        this.filter = '';
        this.snapshotMode = true;
        this._expandedGroups = new Set();
        this._lastRefreshTime = null;
        this._loaded = false;
        this._errorCount = 0;
        this.localDevices = [];
        this._devicesLoading = false;
        this._isRefreshing = false;
        this._historyData = [];
        this._historyLoaded = false;
        this._activeScanResult = null;
        this._activeScanProgress = null;
        this._activeScanRunning = false;
        this._expandedDevices = new Set();
        this._setupScanProgressListener();
    }

    _setupScanProgressListener() {
        if (window.api.onNetworkScanProgress) {
            window.api.onNetworkScanProgress((progress) => {
                this._activeScanProgress = progress;
                if (this.activeSubTab === 'devices' && this._activeScanRunning) {
                    const progressEl = this.container.querySelector('#network-scan-progress-bar');
                    if (progressEl) {
                        progressEl.innerHTML = this._renderScanProgress();
                    }
                }
            });
        }
    }

    async init() {
        this.container.innerHTML = '<div class="loading-state">Netzwerk wird analysiert...</div>';
        this._errorCount = 0;
        this.snapshotMode = true;
        this.stopPolling();
        await this.refresh();
    }

    async refresh(usePollingEndpoint = false) {
        // Overlap-Prevention: wenn bereits ein Refresh läuft, überspringen
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        try {
            if (usePollingEndpoint) {
                // Kombinierter Endpoint: 1 PS-Call statt 3 (für Echtzeit-Polling)
                const data = await window.api.getPollingData();
                this.summary = data.summary;
                this.groupedData = data.grouped || [];
                this.bandwidth = data.bandwidth || [];
            } else {
                // Voller Refresh mit IP-Auflösung (für manuellen Snapshot)
                const summary = await window.api.getNetworkSummary();
                this.summary = summary;

                const grouped = await window.api.getGroupedConnections();
                this.groupedData = grouped || [];

                const bandwidth = await window.api.getBandwidth();
                this.bandwidth = bandwidth || [];
            }

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
        } finally {
            this._isRefreshing = false;
        }
    }

    startPolling(intervalMs = 10000) {
        this.stopPolling();
        this.pollInterval = setInterval(() => this.refresh(true), intervalMs);
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
        const devCount = this._activeScanResult?.devices?.length || this.localDevices.length;

        // Toolbar nur für Verbindungen und Übersicht anzeigen
        const showToolbar = this.activeSubTab === 'connections' || this.activeSubTab === 'overview';

        this.container.innerHTML = `
            <div class="network-page">
                <div class="network-header">
                    <h2>Netzwerk-Monitor</h2>
                    <div class="network-header-controls">
                        <label class="network-toggle-label">
                            <input type="checkbox" id="network-realtime-toggle" ${!this.snapshotMode ? 'checked' : ''}>
                            <span class="network-toggle-slider"></span>
                            <span>Echtzeit</span>
                        </label>
                        <button class="network-btn" id="network-refresh">${this.snapshotMode ? 'Snapshot' : 'Aktualisieren'}</button>
                        ${timeStr ? `<span class="network-timestamp">Stand: ${timeStr}</span>` : ''}
                        ${!this.snapshotMode && this.pollInterval ? `<span class="network-recording-indicator">&#9679; Aufnahme</span>` : ''}
                    </div>
                </div>
                <div class="network-tabs">
                    <button class="network-tab ${this.activeSubTab === 'overview' ? 'active' : ''}" data-subtab="overview">Übersicht</button>
                    <button class="network-tab ${this.activeSubTab === 'connections' ? 'active' : ''}" data-subtab="connections">Verbindungen <span class="network-tab-count">${s.totalConnections || 0}</span></button>
                    <button class="network-tab ${this.activeSubTab === 'devices' ? 'active' : ''}" data-subtab="devices">Lokale Geräte${devCount > 0 ? ` <span class="network-tab-count">${devCount}</span>` : ''}</button>
                    <button class="network-tab ${this.activeSubTab === 'history' ? 'active' : ''}" data-subtab="history">Verlauf${this._historyData.length > 0 ? ` <span class="network-tab-count">${this._historyData.length}</span>` : ''}</button>
                </div>
                ${showToolbar ? `<div class="network-toolbar">
                    <input type="text" class="network-search" placeholder="Filtern nach Prozess oder IP..." value="${this._esc(this.filter)}">
                </div>` : ''}
                <div class="network-content">
                    ${this._renderSubTab()}
                </div>
            </div>`;

        this._wireEvents();
    }

    _renderSubTab() {
        switch (this.activeSubTab) {
            case 'overview': return this._renderOverview();
            case 'connections': return this._renderGroupedConnections();
            case 'devices': return this._renderLocalDevices();
            case 'history': return this._renderHistory();
            default: return '';
        }
    }

    _renderOverview() {
        const s = this.summary || {};
        const totalCompanies = new Set(this.groupedData.flatMap(g => g.resolvedCompanies || [])).size;
        const highRiskCount = this.groupedData.filter(g => g.hasHighRisk).length;
        const trackerCount = this.groupedData.filter(g => g.hasTrackers).length;

        return `<div class="network-overview">
            <div class="network-overview-cards">
                <div class="network-card">
                    <div class="network-card-value">${s.totalConnections || 0}</div>
                    <div class="network-card-label">Verbindungen</div>
                </div>
                <div class="network-card">
                    <div class="network-card-value">${s.establishedCount || 0}</div>
                    <div class="network-card-label">Aktiv</div>
                </div>
                <div class="network-card">
                    <div class="network-card-value">${s.listeningCount || 0}</div>
                    <div class="network-card-label">Lauschend</div>
                </div>
                <div class="network-card">
                    <div class="network-card-value">${s.uniqueRemoteIPs || 0}</div>
                    <div class="network-card-label">Remote-IPs</div>
                </div>
                <div class="network-card">
                    <div class="network-card-value">${totalCompanies}</div>
                    <div class="network-card-label">Firmen</div>
                </div>
                ${trackerCount > 0 ? `<div class="network-card network-card-warn">
                    <div class="network-card-value">${trackerCount}</div>
                    <div class="network-card-label">Tracker</div>
                </div>` : ''}
                ${highRiskCount > 0 ? `<div class="network-card network-card-danger">
                    <div class="network-card-value">${highRiskCount}</div>
                    <div class="network-card-label">Hochrisiko</div>
                </div>` : ''}
            </div>

            <div class="network-overview-sections">
                <div class="network-overview-section">
                    <h3 class="network-section-title">Top-Prozesse</h3>
                    ${this._renderTopProcesses()}
                </div>
                <div class="network-overview-section">
                    <h3 class="network-section-title">Netzwerkadapter</h3>
                    ${this._renderBandwidth()}
                </div>
            </div>
        </div>`;
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

    _renderScanProgress() {
        const p = this._activeScanProgress;
        if (!p) return '<span>Scan wird vorbereitet...</span>';
        const phaseLabels = { init: 'Vorbereitung', ping: 'Ping Sweep', ports: 'Port-Scan', shares: 'SMB-Freigaben', done: 'Abgeschlossen' };
        const label = phaseLabels[p.phase] || p.phase;
        const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
        return `<span>${label}${p.total > 0 ? ` (${p.current}/${p.total})` : ''}</span>
            ${p.total > 0 ? `<div class="network-progress-bar"><div class="network-progress-fill" style="width:${pct}%"></div></div>` : ''}
            <span style="font-size:11px;color:var(--text-muted)">${this._esc(p.message || '')}</span>`;
    }

    _renderLocalDevices() {
        const hasActiveScan = this._activeScanResult && this._activeScanResult.devices;
        const devices = hasActiveScan ? this._activeScanResult.devices : this.localDevices;
        const isActive = hasActiveScan;

        const toolbar = `<div class="network-devices-toolbar">
            <button class="network-btn" id="network-scan-active" ${this._activeScanRunning ? 'disabled' : ''}>${this._activeScanRunning ? 'Scan läuft...' : 'Netzwerk scannen'}</button>
            <button class="network-btn network-btn-secondary" id="network-scan-passive" ${this._activeScanRunning ? 'disabled' : ''} title="Schneller passiver Scan (nur ARP-Tabelle)">Schnellscan</button>
            ${hasActiveScan ? `<span class="network-timestamp">Subnetz: ${this._esc(this._activeScanResult.subnet)} | Eigene IP: ${this._esc(this._activeScanResult.localIP)}</span>` : ''}
            ${devices.length > 0 ? `<span class="network-timestamp">${devices.length} Gerät${devices.length !== 1 ? 'e' : ''}</span>` : ''}
            ${hasActiveScan ? `<button class="network-btn network-btn-secondary" id="network-export-devices">Export CSV</button>` : ''}
        </div>`;

        const progressBar = this._activeScanRunning
            ? `<div class="network-scan-progress" id="network-scan-progress-bar">${this._renderScanProgress()}</div>`
            : '';

        if (devices.length === 0 && !this._activeScanRunning) {
            return `<div class="network-devices-section">
                ${toolbar}
                ${progressBar}
                <div class="network-empty">Noch kein Scan durchgeführt. Klicke "Netzwerk scannen" für einen vollständigen Scan mit Port-Erkennung.</div>
            </div>`;
        }

        let filtered = devices;
        if (this.filter) {
            const q = this.filter.toLowerCase();
            filtered = filtered.filter(d =>
                (d.ip || '').includes(q) || (d.mac || '').toLowerCase().includes(q) ||
                (d.hostname || '').toLowerCase().includes(q) || (d.vendor || '').toLowerCase().includes(q) ||
                (d.os || '').toLowerCase().includes(q)
            );
        }

        if (isActive) {
            // Erweiterte Ansicht für aktiven Scan (mit Ports, OS, etc.)
            const rows = filtered.map(d => {
                const expanded = this._expandedDevices.has(d.ip);
                const portBadges = (d.openPorts || []).map(p =>
                    `<span class="network-port-badge">${p.port} <small>${this._esc(p.label)}</small></span>`
                ).join(' ');
                const localBadge = d.isLocal ? ' <span class="network-local-badge">Eigener PC</span>' : '';
                const rttClass = d.rtt < 5 ? 'network-rtt-fast' : d.rtt < 50 ? 'network-rtt-medium' : 'network-rtt-slow';

                let detailRow = '';
                if (expanded) {
                    const shares = (d.shares || []).length > 0
                        ? `<div><strong>Freigegebene Ordner:</strong> ${d.shares.map(s => this._esc(s)).join(', ')}</div>`
                        : '';
                    detailRow = `<tr class="network-device-detail-row"><td colspan="8">
                        <div class="network-device-detail">
                            ${d.openPorts?.length > 0 ? `<div><strong>Offene Ports:</strong> ${portBadges}</div>` : '<div>Keine offenen Standard-Ports</div>'}
                            ${shares}
                            <div class="network-device-actions">
                                <button class="network-btn-small" data-detail-ports="${this._esc(d.ip)}">Weitere Ports scannen</button>
                                ${d.openPorts?.some(p => p.port === 445) ? `<button class="network-btn-small" data-detail-shares="${this._esc(d.ip)}">SMB-Freigaben prüfen</button>` : ''}
                            </div>
                        </div>
                    </td></tr>`;
                }

                return `<tr class="network-device-row" data-device-toggle="${this._esc(d.ip)}">
                    <td><span class="network-status-dot network-status-safe"></span></td>
                    <td>${this._esc(d.hostname) || '<span style="color:var(--text-muted)">—</span>'}${localBadge}</td>
                    <td class="network-ip">${this._esc(d.ip)}</td>
                    <td style="font-family:monospace;font-size:11px">${this._esc(d.mac) || '—'}</td>
                    <td>${this._esc(d.vendor) || '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${this._esc(d.os) || '—'}</td>
                    <td>${d.openPorts?.length || 0} Port${(d.openPorts?.length || 0) !== 1 ? 's' : ''}</td>
                    <td><span class="${rttClass}">${d.rtt || 0} ms</span></td>
                </tr>${detailRow}`;
            }).join('');

            return `<div class="network-devices-section">
                ${toolbar}
                ${progressBar}
                <table class="network-table network-devices-table">
                    <thead><tr>
                        <th style="width:24px"></th>
                        <th>Hostname</th>
                        <th>IP-Adresse</th>
                        <th>MAC-Adresse</th>
                        <th>Hersteller</th>
                        <th>Betriebssystem</th>
                        <th>Ports</th>
                        <th>Ping</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        // Passive Ansicht (nur ARP-Tabelle, wie vorher)
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
            ${toolbar}
            ${progressBar}
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

    _renderHistory() {
        if (!this._historyLoaded) {
            return '<div class="loading-state">Verlauf wird geladen...</div>';
        }

        if (this._historyData.length === 0) {
            return `<div class="network-history-section">
                <div class="network-devices-toolbar">
                    <button class="network-btn" id="network-save-snapshot">Aktuellen Snapshot speichern</button>
                </div>
                <div class="network-empty">Noch keine Snapshots gespeichert. Klicke "Aktuellen Snapshot speichern" oder nutze den Echtzeit-Modus.</div>
            </div>`;
        }

        const snapshots = [...this._historyData].reverse();

        const rows = snapshots.map((s, i) => {
            const ts = new Date(s.timestamp);
            const dateStr = ts.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const timeStr = ts.toLocaleTimeString('de-DE');
            const trackerCount = s.groups.filter(g => g.hasTrackers).length;
            const highRiskCount = s.groups.filter(g => g.hasHighRisk).length;

            let diffHtml = '';
            if (i < snapshots.length - 1) {
                const prev = snapshots[i + 1];
                const delta = s.summary.totalConnections - prev.summary.totalConnections;
                const prevProcesses = new Set(prev.groups.map(g => g.processName));
                const newProcs = s.groups.filter(g => !prevProcesses.has(g.processName));
                if (delta !== 0 || newProcs.length > 0) {
                    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
                    const deltaClass = delta > 0 ? 'network-diff-up' : delta < 0 ? 'network-diff-down' : '';
                    diffHtml = `<span class="network-diff ${deltaClass}">${deltaStr}</span>`;
                    if (newProcs.length > 0) {
                        diffHtml += ` <span class="network-diff-new" title="${newProcs.map(p => p.processName).join(', ')}">+${newProcs.length} neue${newProcs.length === 1 ? 'r' : ''} Prozess${newProcs.length === 1 ? '' : 'e'}</span>`;
                    }
                }
            }

            return `<tr>
                <td>${dateStr} ${timeStr}</td>
                <td>${s.summary.totalConnections}</td>
                <td>${s.summary.establishedCount}</td>
                <td>${s.summary.uniqueRemoteIPs}</td>
                <td>${s.groups.length}</td>
                <td>${trackerCount > 0 ? `<span class="network-tracker-badge">${trackerCount}</span>` : '-'}</td>
                <td>${highRiskCount > 0 ? `<span class="network-highrisk-badge">${highRiskCount}</span>` : '-'}</td>
                <td>${diffHtml || '-'}</td>
            </tr>`;
        }).join('');

        return `<div class="network-history-section">
            <div class="network-devices-toolbar">
                <button class="network-btn" id="network-save-snapshot">Aktuellen Snapshot speichern</button>
                <button class="network-btn" id="network-export-history-csv" title="Als CSV exportieren">Export CSV</button>
                <button class="network-btn" id="network-export-history-json" title="Als JSON exportieren">Export JSON</button>
                <button class="network-btn network-btn-danger" id="network-clear-history">Verlauf löschen</button>
                <span class="network-timestamp">${this._historyData.length} Snapshot${this._historyData.length !== 1 ? 's' : ''}</span>
            </div>
            <table class="network-table">
                <thead><tr>
                    <th>Zeitpunkt</th>
                    <th>Verbindungen</th>
                    <th>Aktiv</th>
                    <th>Remote-IPs</th>
                    <th>Prozesse</th>
                    <th>Tracker</th>
                    <th>Hochrisiko</th>
                    <th>Änderung</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    async _loadHistory() {
        try {
            this._historyData = await window.api.getNetworkHistory();
            this._historyLoaded = true;
        } catch (err) {
            console.error('Verlauf laden fehlgeschlagen:', err);
            this._historyData = [];
            this._historyLoaded = true;
        }
    }

    async _saveCurrentSnapshot() {
        if (!this.summary || !this.groupedData) return;
        try {
            const result = await window.api.saveNetworkSnapshot({
                summary: this.summary,
                grouped: this.groupedData,
            });
            if (result.success) {
                showToast(`Snapshot gespeichert (${result.snapshotCount} insgesamt)`, 'success');
                await this._loadHistory();
                if (this.activeSubTab === 'history') this.render();
            }
        } catch (err) {
            showToast('Snapshot speichern fehlgeschlagen: ' + err.message, 'error');
        }
    }

    _wireEvents() {
        // Sub-tabs
        this.container.querySelectorAll('.network-tab').forEach(tab => {
            tab.onclick = async () => {
                this.activeSubTab = tab.dataset.subtab;
                if (tab.dataset.subtab === 'history' && !this._historyLoaded) {
                    await this._loadHistory();
                }
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
                    this.startPolling(10000);
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

        // Active network scan
        const scanActiveBtn = this.container.querySelector('#network-scan-active');
        if (scanActiveBtn) {
            scanActiveBtn.onclick = async () => {
                this._activeScanRunning = true;
                this._activeScanProgress = null;
                this.render();
                try {
                    this._activeScanResult = await window.api.scanNetworkActive();
                    showToast(`${this._activeScanResult.devices.length} Geräte gefunden`, 'success');
                } catch (err) {
                    console.error('Aktiver Scan Fehler:', err);
                    showToast('Netzwerk-Scan fehlgeschlagen: ' + err.message, 'error');
                }
                this._activeScanRunning = false;
                this.render();
            };
        }

        // Passive scan (schnell, nur ARP)
        const scanPassiveBtn = this.container.querySelector('#network-scan-passive');
        if (scanPassiveBtn) {
            scanPassiveBtn.onclick = async () => {
                this._devicesLoading = true;
                this._activeScanResult = null;
                this.render();
                try {
                    this.localDevices = await window.api.scanLocalNetwork();
                } catch (err) {
                    console.error('Schnellscan Fehler:', err);
                    this.localDevices = [];
                    showToast('Schnellscan fehlgeschlagen: ' + err.message, 'error');
                }
                this._devicesLoading = false;
                this.render();
            };
        }

        // Device row toggle (expand/collapse)
        this.container.querySelectorAll('[data-device-toggle]').forEach(row => {
            row.onclick = (e) => {
                if (e.target.closest('button')) return;
                const ip = row.dataset.deviceToggle;
                if (this._expandedDevices.has(ip)) {
                    this._expandedDevices.delete(ip);
                } else {
                    this._expandedDevices.add(ip);
                }
                this.render();
            };
        });

        // Detail: Port-Scan für einzelnes Gerät
        this.container.querySelectorAll('[data-detail-ports]').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const ip = btn.dataset.detailPorts;
                btn.disabled = true;
                btn.textContent = 'Scanne...';
                try {
                    const ports = await window.api.scanDevicePorts(ip);
                    if (this._activeScanResult) {
                        const device = this._activeScanResult.devices.find(d => d.ip === ip);
                        if (device) device.openPorts = ports;
                    }
                    this.render();
                } catch (err) {
                    showToast('Port-Scan fehlgeschlagen: ' + err.message, 'error');
                }
            };
        });

        // Detail: SMB-Shares
        this.container.querySelectorAll('[data-detail-shares]').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const ip = btn.dataset.detailShares;
                btn.disabled = true;
                btn.textContent = 'Prüfe...';
                try {
                    const shares = await window.api.getSMBShares(ip);
                    if (this._activeScanResult) {
                        const device = this._activeScanResult.devices.find(d => d.ip === ip);
                        if (device) device.shares = shares.map(s => s.name);
                    }
                    this.render();
                } catch (err) {
                    showToast('SMB-Prüfung fehlgeschlagen: ' + err.message, 'error');
                }
            };
        });

        // Export devices as CSV
        const exportDevicesBtn = this.container.querySelector('#network-export-devices');
        if (exportDevicesBtn && this._activeScanResult) {
            exportDevicesBtn.onclick = () => {
                const devices = this._activeScanResult.devices || [];
                const header = 'IP;Hostname;MAC;Hersteller;Betriebssystem;Ports;Ping (ms);Freigaben';
                const rows = devices.map(d => [
                    d.ip, d.hostname, d.mac, d.vendor, d.os,
                    (d.openPorts || []).map(p => `${p.port}/${p.label}`).join(' '),
                    d.rtt, (d.shares || []).join(' '),
                ].join(';'));
                const csv = header + '\n' + rows.join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `netzwerk-geraete-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('CSV exportiert', 'success');
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

        // History: Snapshot speichern
        const saveSnapshotBtn = this.container.querySelector('#network-save-snapshot');
        if (saveSnapshotBtn) {
            saveSnapshotBtn.onclick = async () => {
                saveSnapshotBtn.disabled = true;
                saveSnapshotBtn.textContent = 'Wird gespeichert...';
                await this._saveCurrentSnapshot();
                saveSnapshotBtn.disabled = false;
                saveSnapshotBtn.textContent = 'Aktuellen Snapshot speichern';
            };
        }

        // History: Export CSV
        const exportCsvBtn = this.container.querySelector('#network-export-history-csv');
        if (exportCsvBtn) {
            exportCsvBtn.onclick = async () => {
                try {
                    const csv = await window.api.exportNetworkHistory('csv');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `netzwerk-verlauf-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('CSV exportiert', 'success');
                } catch (err) {
                    showToast('Export fehlgeschlagen: ' + err.message, 'error');
                }
            };
        }

        // History: Export JSON
        const exportJsonBtn = this.container.querySelector('#network-export-history-json');
        if (exportJsonBtn) {
            exportJsonBtn.onclick = async () => {
                try {
                    const json = await window.api.exportNetworkHistory('json');
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `netzwerk-verlauf-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('JSON exportiert', 'success');
                } catch (err) {
                    showToast('Export fehlgeschlagen: ' + err.message, 'error');
                }
            };
        }

        // History: Verlauf löschen
        const clearHistoryBtn = this.container.querySelector('#network-clear-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.onclick = async () => {
                if (!confirm('Gesamten Netzwerk-Verlauf löschen?')) return;
                try {
                    await window.api.clearNetworkHistory();
                    this._historyData = [];
                    showToast('Verlauf gelöscht', 'success');
                    this.render();
                } catch (err) {
                    showToast('Löschen fehlgeschlagen: ' + err.message, 'error');
                }
            };
        }
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

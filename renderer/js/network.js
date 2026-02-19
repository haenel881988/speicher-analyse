/**
 * Network Monitor View - Grouped connections by process, IP resolution,
 * snapshot mode with optional real-time polling, ghost process detection.
 */
import { escapeHtml } from './utils.js';
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
        this._expandedGroups = new Set();
        this._lastRefreshTime = null;
        this._loaded = false;
        this._errorCount = 0;
        this._isRefreshing = false;
        this._historyData = [];
        this._historyLoaded = false;
        this._feedEvents = [];              // Live-Feed: Rolling-Buffer (max 500)
        this._feedPollInterval = null;      // Separates Polling für Connection-Diff
        this._feedPaused = false;           // Auto-Scroll pausiert wenn User scrollt
        this._recording = false;            // Aufzeichnung aktiv?
        this._recordingStatus = null;       // Status der aktiven Aufzeichnung
        this._recordingTimer = null;        // Timer-Intervall für Dauer-Anzeige
        this._recordings = [];              // Liste gespeicherter Aufzeichnungen
        this._cardFilter = null;            // Aktiver Metrikkarten-Filter (z.B. 'established', 'tracker')
        this._searchDebounce = null;       // Debounce-Timer für Suchfeld
        this._sparklineCharts = new Map();  // Chart.js Instanzen für Bandbreiten-Sparklines
        this._bandwidthHistory = {};        // Cache für Bandbreiten-History-Daten
        this._dnsExpanded = false;          // DNS-Cache aufgeklappt?
        this._dnsCache = [];                // DNS-Cache-Daten
        this._wifiInfo = null;              // WiFi-Infos
        this._detailLevel = 'normal';        // Zwei-Stufen: normal | experte
        this._loadDetailLevel();
    }

    async _loadDetailLevel() {
        try {
            if (window.api?.getPreferences) {
                const prefs = await window.api.getPreferences();
                const level = prefs?.networkDetailLevel;
                // Migration: alte Werte 'basis'/'erweitert' → 'normal'
                if (level === 'experte') {
                    this._detailLevel = 'experte';
                } else {
                    this._detailLevel = 'normal';
                }
            }
        } catch { /* Default beibehalten */ }
    }

    async init() {
        this.container.innerHTML = '<div class="loading-state">Netzwerk wird analysiert...</div>';
        this._errorCount = 0;
        this.stopPolling();

        await this.refresh();

        // Zweiter Refresh nach 12s: IP-Auflösung läuft async im Backend (8-10s),
        // erst nach dem zweiten Aufruf sind Firmen-Namen sichtbar
        this._companyRefreshTimer = setTimeout(async () => {
            if (this._loaded) {
                await this.refresh();
            }
        }, 12000);
    }

    /** Aktiviert Auto-Live (Bandwidth-Polling + Feed-Polling) wenn der Netzwerk-Tab sichtbar wird. */
    activate() {
        if (!this._loaded) return;
        this.startPolling(5000);
        this._pollBandwidth();
        // Live-Feed-Polling starten wenn auf dem Feed-Tab
        if (this.activeSubTab === 'livefeed') {
            this._startFeedPolling();
        }
    }

    /** Stoppt Auto-Live wenn der User den Netzwerk-Tab verlässt. */
    deactivate() {
        this.stopPolling();
        this._stopFeedPolling();
        // Recording-Timer stoppen (Aufzeichnung selbst läuft im Backend weiter)
        if (this._recordingTimer) {
            clearInterval(this._recordingTimer);
            this._recordingTimer = null;
        }
    }

    async refresh() {
        // Overlap-Prevention: wenn bereits ein Refresh läuft, überspringen
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        try {
            // Kombinierter Endpoint: 1 PS-Call statt 3 (enthält TCP + UDP + Bandwidth)
            const data = await window.api.getPollingData();
            this.summary = data.summary;
            this.groupedData = data.grouped || [];
            this.bandwidth = data.bandwidth || [];

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
                        <p style="color:var(--text-secondary);margin:8px 0">${escapeHtml(err.message)}</p>
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

    startPolling(intervalMs = 5000) {
        this.stopPolling();
        this.pollInterval = setInterval(() => this._pollBandwidth(), intervalMs);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Leichtgewichtiges Bandwidth-Polling für Echtzeit-Modus.
     * Ruft NUR getBandwidth() auf (Get-NetAdapter + Get-NetAdapterStatistics, ~2-3s)
     * statt den schweren getPollingData() (~10+ Sekunden).
     */
    async _pollBandwidth() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;
        try {
            const [bandwidth, history, wifiInfo] = await Promise.all([
                window.api.getBandwidth(),
                window.api.getBandwidthHistory(),
                window.api.getWiFiInfo(),
            ]);
            this.bandwidth = bandwidth || [];
            this._bandwidthHistory = history || {};
            this._wifiInfo = wifiInfo;
            this._lastRefreshTime = new Date();
            this.render();
        } catch (err) {
            console.error('Bandwidth-Polling Fehler:', err);
        } finally {
            this._isRefreshing = false;
        }
    }

    render() {
        const s = this.summary || {};
        const timeStr = this._lastRefreshTime ? this._lastRefreshTime.toLocaleTimeString('de-DE') : '';

        // Suchfeld im Verbindungen- und Live-Feed-Tab anzeigen
        const showToolbar = this.activeSubTab === 'connections' || this.activeSubTab === 'livefeed';

        this.container.innerHTML = `
            <div class="network-page network-tier-${this._detailLevel}">
                <div class="network-header">
                    <h2>Netzwerk-Monitor</h2>
                    <div class="network-header-controls">
                        <div class="network-tier-toggle">
                            <button class="network-tier-btn ${this._detailLevel === 'normal' ? 'active' : ''}" data-tier-level="normal" title="Standard-Ansicht">Normal</button>
                            <button class="network-tier-btn ${this._detailLevel === 'experte' ? 'active' : ''}" data-tier-level="experte" title="Alle Details inkl. UDP, DNS, Firewall">Experte</button>
                        </div>
                        <button class="network-btn" id="network-refresh" title="Netzwerkdaten neu laden">&#8635; Aktualisieren</button>
                        ${timeStr ? `<span class="network-timestamp">Stand: ${timeStr}</span>` : ''}
                        ${this.pollInterval ? `<span class="network-live-indicator"><span class="network-live-dot"></span> Live</span>` : ''}
                    </div>
                </div>
                <div class="network-tabs">
                    <button class="network-tab ${this.activeSubTab === 'connections' ? 'active' : ''}" data-subtab="connections">Verbindungen <span class="network-tab-count">${s.totalConnections || 0}</span></button>
                    <button class="network-tab ${this.activeSubTab === 'livefeed' ? 'active' : ''}" data-subtab="livefeed">Live-Feed</button>
                </div>
                ${showToolbar ? `<div class="network-toolbar">
                    <input type="text" class="network-search" placeholder="Filtern nach Prozess oder IP..." value="${escapeHtml(this.filter)}">
                </div>` : ''}
                <div class="network-content">
                    ${this._renderSubTab()}
                </div>
            </div>`;

        this._wireEvents();
        this._renderSparklines();
    }

    _renderSubTab() {
        switch (this.activeSubTab) {
            case 'connections': return this._renderMergedTab();
            case 'livefeed': return this._renderLiveFeed();
            default: return '';
        }
    }

    /**
     * Konsolidierter Verbindungen-Tab: Metrikkarten + Bandwidth + Prozessgruppen.
     * Ersetzt die getrennten Übersicht + Verbindungen Tabs.
     */
    _renderMergedTab() {
        const s = this.summary || {};
        const totalCompanies = new Set(this.groupedData.flatMap(g => g.resolvedCompanies || [])).size;
        const highRiskCount = this.groupedData.filter(g => g.hasHighRisk).length;
        const trackerCount = this.groupedData.filter(g => g.hasTrackers).length;

        const cf = this._cardFilter;
        return `<div class="network-merged">
            <div class="network-overview-cards">
                <div class="network-card network-card-clickable ${cf === null ? 'network-card-active' : ''}" data-card-filter="all">
                    <div class="network-card-value">${s.totalConnections || 0}</div>
                    <div class="network-card-label">Verbindungen</div>
                </div>
                <div class="network-card network-card-clickable ${cf === 'established' ? 'network-card-active' : ''}" data-card-filter="established">
                    <div class="network-card-value">${s.establishedCount || 0}</div>
                    <div class="network-card-label">Aktiv</div>
                </div>
                <div class="network-card network-card-clickable ${cf === 'listening' ? 'network-card-active' : ''}" data-card-filter="listening">
                    <div class="network-card-value">${s.listeningCount || 0}</div>
                    <div class="network-card-label">Lauschend</div>
                </div>
                <div class="network-card network-card-clickable ${cf === 'remoteips' ? 'network-card-active' : ''}" data-card-filter="remoteips">
                    <div class="network-card-value">${s.uniqueRemoteIPs || 0}</div>
                    <div class="network-card-label">Remote-IPs</div>
                </div>
                ${s.udpCount > 0 ? `<div class="network-card network-card-clickable ${cf === 'udp' ? 'network-card-active' : ''}" data-card-filter="udp" data-tier="experte">
                    <div class="network-card-value">${s.udpCount}</div>
                    <div class="network-card-label">UDP</div>
                </div>` : ''}
                <div class="network-card network-card-clickable ${cf === 'firmen' ? 'network-card-active' : ''}" data-card-filter="firmen">
                    <div class="network-card-value">${totalCompanies}</div>
                    <div class="network-card-label">Firmen</div>
                </div>
                ${trackerCount > 0 ? `<div class="network-card network-card-warn network-card-clickable ${cf === 'tracker' ? 'network-card-active' : ''}" data-card-filter="tracker">
                    <div class="network-card-value">${trackerCount}</div>
                    <div class="network-card-label">Tracker</div>
                </div>` : ''}
                ${highRiskCount > 0 ? `<div class="network-card network-card-danger network-card-clickable ${cf === 'highrisk' ? 'network-card-active' : ''}" data-card-filter="highrisk">
                    <div class="network-card-value">${highRiskCount}</div>
                    <div class="network-card-label">Hochrisiko</div>
                </div>` : ''}
            </div>

            <div class="network-overview-section" style="margin-bottom:16px">
                <h3 class="network-section-title">Netzwerkadapter</h3>
                ${this._renderBandwidth()}
            </div>

            ${cf ? `<div class="network-filter-indicator">
                <span>Filter: <strong>${this._cardFilterLabel(cf)}</strong></span>
                <button class="network-btn-small" data-card-filter="all">&#10005; Zurücksetzen</button>
            </div>` : ''}

            ${this._renderGroupedConnections()}

            <div class="network-dns-section" data-tier="experte">
                <div class="network-dns-header" id="network-dns-toggle">
                    <h3 class="network-section-title" style="cursor:pointer;margin:0">
                        ${this._dnsExpanded ? '\u25BC' : '\u25B6'} DNS-Cache (zuletzt aufgelöste Domains)
                    </h3>
                    <button class="network-btn-small" id="network-dns-clear" title="DNS-Cache leeren">Cache leeren</button>
                </div>
                ${this._dnsExpanded ? this._renderDnsCache() : ''}
            </div>
        </div>`;
    }

    _renderGroupedConnections() {
        if (!this.groupedData || this.groupedData.length === 0) {
            return '<div class="network-empty">Keine Verbindungen gefunden</div>';
        }

        let groups = [...this.groupedData];

        // Idle/TimeWait-only-Prozesse ans Ende verschieben (technisches Rauschen)
        groups.sort((a, b) => {
            const aIsIdle = a.processName.toLowerCase() === 'idle' || (a.states.TimeWait === a.connectionCount);
            const bIsIdle = b.processName.toLowerCase() === 'idle' || (b.states.TimeWait === b.connectionCount);
            if (aIsIdle !== bIsIdle) return aIsIdle ? 1 : -1;
            return b.connectionCount - a.connectionCount;
        });

        // Card-Filter anwenden (klickbare Metrikkarten)
        if (this._cardFilter) {
            switch (this._cardFilter) {
                case 'established': groups = groups.filter(g => g.states.Established > 0); break;
                case 'listening':   groups = groups.filter(g => g.states.Listen > 0); break;
                case 'tracker':     groups = groups.filter(g => g.hasTrackers); break;
                case 'highrisk':    groups = groups.filter(g => g.hasHighRisk); break;
                case 'firmen':      groups = groups.filter(g => (g.resolvedCompanies || []).length > 0); break;
                case 'remoteips':   groups = groups.filter(g => g.uniqueIPCount > 0); break;
                case 'udp':         groups = groups.filter(g => g.connections && g.connections.some(c => c.protocol === 'UDP')); break;
            }
        }

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

                const allCompanies = g.resolvedCompanies || [];
                const companySummary = allCompanies.length
                    ? allCompanies.slice(0, 3).join(', ') + (allCompanies.length > 3 ? ` +${allCompanies.length - 3}` : '')
                    : '';
                const companyTooltip = allCompanies.length > 3 ? allCompanies.join(', ') : '';

                return `<div class="network-group ${ghostWarning ? 'network-group-ghost' : ''}" data-process="${escapeHtml(g.processName)}">
                    <div class="network-group-header" data-toggle="${escapeHtml(g.processName)}">
                        <span class="network-group-arrow">${expanded ? '&#9660;' : '&#9654;'}</span>
                        <span class="network-status-dot network-status-${statusColor}"></span>
                        <strong class="network-group-name">${escapeHtml(g.processName)}</strong>
                        <span class="network-group-badge">${g.connectionCount}</span>
                        <span class="network-group-ips"${companyTooltip ? ` title="${escapeHtml(companyTooltip)}"` : ''}>${g.uniqueIPCount} IP${g.uniqueIPCount !== 1 ? 's' : ''}${companySummary ? ' (' + escapeHtml(companySummary) + ')' : ''}</span>
                        ${g.hasTrackers ? '<span class="network-tracker-badge">Tracker</span>' : ''}
                        ${g.hasHighRisk ? '<span class="network-highrisk-badge">&#9888; Hochrisiko</span>' : ''}
                        <span class="network-group-states">
                            ${Object.entries(g.states).map(([state, count]) => {
                                const cls = state === 'Established' ? 'pill-established' : state === 'Listen' ? 'pill-listen' : (state === 'TimeWait' || state === 'CloseWait') ? 'pill-closing' : '';
                                return `<span class="network-state-pill ${cls}">${state}: ${count}</span>`;
                            }).join('')}
                        </span>
                        ${ghostWarning ? '<span class="network-ghost-warning">Hintergrund-Aktivität!</span>' : ''}
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
            const protocols = new Set();
            for (const c of connections) {
                states[c.state] = (states[c.state] || 0) + 1;
                protocols.add(c.protocol || 'TCP');
            }
            const stateStr = Object.entries(states).map(([s, n]) => `${s}: ${n}`).join(', ');
            const protoBadges = [...protocols].map(p => `<span class="network-proto-badge network-proto-${p.toLowerCase()}">${p}</span>`).join('');
            const rowClass = isHighRisk ? 'network-row-highrisk' : isTracker ? 'network-row-tracker' : '';

            rows += `<tr class="${rowClass}">
                <td class="network-ip">${escapeHtml(ip)}</td>
                <td class="network-company ${isHighRisk ? 'network-highrisk' : isTracker ? 'network-tracker' : ''}">${flag ? flag + ' ' : ''}${escapeHtml(info.org || 'Unbekannt')}${isHighRisk ? ' &#9888;' : isTracker ? ' &#128065;' : ''}${isHighRisk ? ` <span class="network-highrisk-label">${escapeHtml(info.country)}</span>` : ''}</td>
                <td class="network-isp" title="${escapeHtml(info.isp || '')}">${escapeHtml(info.isp && info.isp !== info.org ? info.isp : '')}</td>
                <td>${ports.map(p => { const label = this._portLabel(p); return label ? `<span title="${label}">${p}</span>` : p; }).join(', ') || '-'}</td>
                <td>${connections.length}</td>
                <td>${protoBadges} <span class="network-state-pills">${stateStr}</span></td>
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

    _renderBandwidth() {
        if (this.bandwidth.length === 0) return '<div class="network-empty">Keine Netzwerkadapter gefunden</div>';

        // Aktive Adapter zuerst, inaktive (0 Traffic) kompakter
        const sorted = [...this.bandwidth].sort((a, b) => (b.receivedBytes + b.sentBytes) - (a.receivedBytes + a.sentBytes));

        return `<div class="network-bandwidth-grid">
            ${sorted.map(b => {
                const isInactive = b.receivedBytes === 0 && b.sentBytes === 0;
                const isDown = b.status !== 'Up';

                if (isInactive && isDown) {
                    return `<div class="network-adapter-card network-adapter-down" style="padding:10px 14px">
                        <div class="network-adapter-name" style="margin:0">${escapeHtml(b.name)} <span style="font-weight:400;font-size:11px;color:var(--text-muted)">\u2014 Offline</span></div>
                    </div>`;
                }

                // Echtzeit-Geschwindigkeit (MB/s) — Delta vom Backend
                const rxSpeed = b.rxPerSec || 0;
                const txSpeed = b.txPerSec || 0;
                const rxLabel = this._formatSpeed(rxSpeed);
                const txLabel = this._formatSpeed(txSpeed);
                const hasSpeed = rxSpeed > 0 || txSpeed > 0;

                // Kumulative Gesamt-Bytes als Tooltip
                const rxTotal = this._formatBytes(b.receivedBytes);
                const txTotal = this._formatBytes(b.sentBytes);

                const linkLabel = this._formatLinkSpeed(b.linkSpeed);
                const totalPackets = ((b.receivedPackets || 0) + (b.sentPackets || 0));

                const hasHistory = this._bandwidthHistory[b.name] && this._bandwidthHistory[b.name].length > 1;

                return `<div class="network-adapter-card ${isDown ? 'network-adapter-down' : ''}">
                    <div class="network-adapter-name">${escapeHtml(b.name)}</div>
                    <div class="network-adapter-desc">${escapeHtml(b.description || '')}${linkLabel !== '\u2014' ? ` \u2014 ${linkLabel}` : ''}</div>
                    ${hasHistory ? `<div class="network-sparkline-container"><canvas class="network-sparkline" data-adapter="${escapeHtml(b.name)}"></canvas></div>` : ''}
                    <div class="network-adapter-stats">
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">\u2193 Empfangen</span>
                            <span class="network-stat-value ${hasSpeed && rxSpeed > 0 ? 'network-stat-active' : ''}">${rxLabel}</span>
                            <span class="network-stat-total" title="Gesamt empfangen">${rxTotal}</span>
                        </div>
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">\u2191 Gesendet</span>
                            <span class="network-stat-value ${hasSpeed && txSpeed > 0 ? 'network-stat-active' : ''}">${txLabel}</span>
                            <span class="network-stat-total" title="Gesamt gesendet">${txTotal}</span>
                        </div>
                        <div class="network-adapter-stat">
                            <span class="network-stat-label">Pakete</span>
                            <span class="network-stat-value">${totalPackets.toLocaleString('de')}</span>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
        ${this._renderWiFiDetails()}`;
    }

    _renderWiFiDetails() {
        const w = this._wifiInfo;
        if (!w) return '';
        // Signalstärke-Farbe: rot < 30%, gelb < 60%, grün >= 60%
        const pct = w.signalPercent || 0;
        const sigColor = pct >= 60 ? 'var(--success, #22c55e)' : pct >= 30 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)';
        const sigWidth = Math.max(5, pct);
        return `<div class="network-wifi-details">
            <h4 class="network-section-title">WLAN-Details</h4>
            <div class="network-wifi-grid">
                <div class="network-wifi-signal">
                    <span class="network-wifi-ssid">${escapeHtml(w.ssid || '—')}</span>
                    <div class="network-wifi-signal-bar-bg">
                        <div class="network-wifi-signal-bar" style="width:${sigWidth}%;background:${sigColor}"></div>
                    </div>
                    <span class="network-wifi-signal-pct" style="color:${sigColor}">${pct}%</span>
                </div>
                <div class="network-wifi-info-grid">
                    ${w.channel ? `<div class="network-wifi-item"><span class="network-wifi-label">Kanal</span><span class="network-wifi-value">${escapeHtml(w.channel)}</span></div>` : ''}
                    ${w.radioType ? `<div class="network-wifi-item"><span class="network-wifi-label">Funk</span><span class="network-wifi-value">${escapeHtml(w.radioType)}</span></div>` : ''}
                    ${w.band ? `<div class="network-wifi-item"><span class="network-wifi-label">Band</span><span class="network-wifi-value">${escapeHtml(w.band)}</span></div>` : ''}
                    ${w.auth ? `<div class="network-wifi-item"><span class="network-wifi-label">Auth</span><span class="network-wifi-value">${escapeHtml(w.auth)}</span></div>` : ''}
                    ${w.cipher ? `<div class="network-wifi-item"><span class="network-wifi-label">Verschl.</span><span class="network-wifi-value">${escapeHtml(w.cipher)}</span></div>` : ''}
                    ${w.rxRate ? `<div class="network-wifi-item"><span class="network-wifi-label">Empfang</span><span class="network-wifi-value">${escapeHtml(w.rxRate)}</span></div>` : ''}
                    ${w.txRate ? `<div class="network-wifi-item"><span class="network-wifi-label">Senden</span><span class="network-wifi-value">${escapeHtml(w.txRate)}</span></div>` : ''}
                    ${w.bssid ? `<div class="network-wifi-item"><span class="network-wifi-label">BSSID</span><span class="network-wifi-value">${escapeHtml(w.bssid)}</span></div>` : ''}
                </div>
            </div>
        </div>`;
    }

    _renderDnsCache() {
        if (this._dnsCache.length === 0) return '<div class="network-empty" style="margin-top:8px">DNS-Cache ist leer</div>';
        // Gruppiert nach Domain
        const grouped = {};
        for (const e of this._dnsCache) {
            const d = e.domain;
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(e);
        }
        const sorted = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
        return `<div class="network-dns-table-wrap" style="margin-top:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span class="network-stat-label">${this._dnsCache.length} Einträge, ${sorted.length} Domains</span>
                <button class="network-btn-small" id="network-dns-refresh">&#8635; Aktualisieren</button>
            </div>
            <table class="network-dns-table">
                <thead><tr><th>Domain</th><th>IP-Adresse</th><th>TTL</th><th>Typ</th></tr></thead>
                <tbody>
                    ${sorted.map(([domain, entries]) => entries.map(e =>
                        `<tr><td>${escapeHtml(domain)}</td><td>${escapeHtml(e.ip)}</td><td>${e.ttl}s</td><td>${escapeHtml(e.type)}</td></tr>`
                    ).join('')).join('')}
                </tbody>
            </table>
        </div>`;
    }

    /** Formatiert Bytes/s als lesbare Geschwindigkeit (einheitlich KB/s, MB/s, GB/s) */
    _formatSpeed(bytesPerSec) {
        if (bytesPerSec <= 0) return '0 B/s';
        if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
        if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }

    /** Formatiert kumulative Bytes als lesbare Grösse */
    _formatBytes(bytes) {
        if (bytes <= 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    /** Normalisiert Link-Speed von PowerShell (z.B. "1 Gbps", "100 Mbps") zu einheitlichem Format */
    _formatLinkSpeed(speedStr) {
        if (!speedStr || speedStr === '-') return '\u2014';
        const match = speedStr.match(/([\d.]+)\s*(Gbps|Mbps|Kbps|bps)/i);
        if (!match) return speedStr;
        let mbits = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'gbps') mbits *= 1000;
        else if (unit === 'kbps') mbits /= 1000;
        else if (unit === 'bps') mbits /= 1000000;
        // Einheitlich als Mbit/s oder Gbit/s
        if (mbits >= 1000) return `${(mbits / 1000).toFixed(mbits % 1000 === 0 ? 0 : 1)} Gbit/s`;
        if (mbits >= 1) return `${mbits % 1 === 0 ? mbits.toFixed(0) : mbits.toFixed(1)} Mbit/s`;
        return `${(mbits * 1000).toFixed(0)} Kbit/s`;
    }

    /**
     * Erstellt Chart.js Sparklines in den Bandbreiten-Adapter-Karten.
     * Wird nach jedem render() aufgerufen.
     */
    _renderSparklines() {
        // Alte Charts zerstören
        for (const [, chart] of this._sparklineCharts) {
            chart.destroy();
        }
        this._sparklineCharts.clear();

        const canvases = this.container.querySelectorAll('.network-sparkline');
        if (!canvases.length || typeof Chart === 'undefined') return;

        for (const canvas of canvases) {
            const adapterName = canvas.dataset.adapter;
            const history = this._bandwidthHistory[adapterName];
            if (!history || history.length < 2) continue;

            const rxData = history.map(h => h.rx / 1024); // KB/s
            const txData = history.map(h => h.tx / 1024); // KB/s
            const labels = history.map(() => '');

            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            data: rxData,
                            borderColor: 'rgba(46, 204, 113, 0.8)',
                            backgroundColor: 'rgba(46, 204, 113, 0.15)',
                            borderWidth: 1.5,
                            fill: true,
                            pointRadius: 0,
                            tension: 0.3,
                        },
                        {
                            data: txData,
                            borderColor: 'rgba(52, 152, 219, 0.8)',
                            backgroundColor: 'rgba(52, 152, 219, 0.15)',
                            borderWidth: 1.5,
                            fill: true,
                            pointRadius: 0,
                            tension: 0.3,
                        },
                    ],
                },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false },
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false, beginAtZero: true },
                    },
                    layout: { padding: 0 },
                },
            });

            this._sparklineCharts.set(adapterName, chart);
        }
    }

    /** Label für aktiven Karten-Filter */
    _cardFilterLabel(filter) {
        const labels = { established: 'Aktive Verbindungen', listening: 'Lauschende Ports', tracker: 'Tracker-Prozesse', highrisk: 'Hochrisiko-Prozesse', firmen: 'Prozesse mit Firmenzuordnung', remoteips: 'Prozesse mit Remote-IPs', udp: 'UDP-Endpunkte' };
        return labels[filter] || filter;
    }

    /**
     * Prüft ob eine IP lokal/privat ist.
     * SYNC: Identische Logik in main/network.js (isPrivateIP)
     */
    _isLocalIP(ip) {
        if (!ip) return true;
        return ip === '0.0.0.0' || ip === '::' || ip === '::1' ||
               ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') ||
               ip.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
               ip.startsWith('fe80:') || ip.startsWith('fd') || ip.startsWith('fc');
    }

    /** Bekannte Port-Protokolle */
    _portLabel(port) {
        const known = { 21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 9090: 'Mgmt' };
        return known[port] || null;
    }

    _renderSecurityOverview() {
        // Tracker-Prozesse sammeln
        const trackerProcs = this.groupedData.filter(g => g.hasTrackers);
        // Hochrisiko-Prozesse sammeln
        const highRiskProcs = this.groupedData.filter(g => g.hasHighRisk);
        // Unbekannte Remote-Verbindungen (nicht aufgelöst)
        const unknownProcs = this.groupedData.filter(g =>
            g.uniqueIPCount > 0 && g.resolvedCompanies.length === 0 && !g.hasTrackers && !g.hasHighRisk
        );

        if (trackerProcs.length === 0 && highRiskProcs.length === 0 && unknownProcs.length === 0) {
            return `<div class="network-security-ok">
                <span style="font-size:18px">\u2705</span>
                <span>Keine Tracker oder Hochrisiko-Verbindungen erkannt</span>
            </div>`;
        }

        let html = '<div class="network-security-list">';

        if (highRiskProcs.length > 0) {
            html += `<div class="network-security-group network-security-danger">
                <div class="network-security-group-title">\u26a0 Hochrisiko-Verbindungen (${highRiskProcs.length})</div>
                ${highRiskProcs.map(g => `<div class="network-security-item">
                    <span class="network-security-proc">${escapeHtml(g.processName)}</span>
                    <span class="network-security-detail">${g.uniqueIPCount} IP${g.uniqueIPCount !== 1 ? 's' : ''}</span>
                </div>`).join('')}
            </div>`;
        }

        if (trackerProcs.length > 0) {
            html += `<div class="network-security-group network-security-warn">
                <div class="network-security-group-title">\u{1f50d} Tracker-Verbindungen (${trackerProcs.length})</div>
                ${trackerProcs.map(g => `<div class="network-security-item">
                    <span class="network-security-proc">${escapeHtml(g.processName)}</span>
                    <span class="network-security-detail">${(g.resolvedCompanies || []).join(', ') || g.uniqueIPCount + ' IPs'}</span>
                </div>`).join('')}
            </div>`;
        }

        if (unknownProcs.length > 0) {
            html += `<div class="network-security-group network-security-unknown">
                <div class="network-security-group-title">\u2753 Nicht zugeordnete Verbindungen (${unknownProcs.length})</div>
                ${unknownProcs.slice(0, 5).map(g => `<div class="network-security-item">
                    <span class="network-security-proc">${escapeHtml(g.processName)}</span>
                    <span class="network-security-detail">${g.uniqueIPCount} IP${g.uniqueIPCount !== 1 ? 's' : ''}</span>
                </div>`).join('')}
                ${unknownProcs.length > 5 ? `<div class="network-security-more">+ ${unknownProcs.length - 5} weitere</div>` : ''}
            </div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Live-Feed Tab — Echtzeit-Verbindungsstream (Wireshark-light).
     * Zeigt neue, geschlossene und geänderte Verbindungen in Echtzeit.
     * Enthält Aufzeichnungs-Controls und gespeicherte Aufzeichnungsliste.
     */
    _renderLiveFeed() {
        const eventRows = this._feedEvents.map(e => {
            const typeClass = e.type === 'NEU' ? 'network-feed-new' :
                              e.type === 'GESCHLOSSEN' ? 'network-feed-closed' :
                              'network-feed-changed';
            const typeLabel = e.type === 'NEU' ? '+ NEU' :
                              e.type === 'GESCHLOSSEN' ? '- GESCHL.' :
                              '\u2194 GEÄND.';
            const flag = this._countryFlag(e.country);
            const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
            const port = e.remotePort || '';
            const protocol = this._portToProtocol(e.remotePort);
            const riskClass = e.isHighRisk ? 'network-feed-risk' : e.isTracker ? 'network-feed-tracker' : '';
            const isLocal = this._isLocalIP(e.remoteAddress);
            const orgLabel = isLocal ? '<span style="color:var(--text-muted)">Lokal</span>' :
                (flag ? flag + ' ' : '') + escapeHtml(e.org || 'Unbekannt') + (e.isTracker ? ' \u{1f441}' : '') + (e.isHighRisk ? ' \u26a0' : '');

            return `<tr class="${typeClass} ${riskClass}">
                <td class="network-feed-time">${time}</td>
                <td class="network-feed-type"><span class="network-feed-badge ${typeClass}-badge">${typeLabel}</span></td>
                <td class="network-feed-proc">${escapeHtml(e.processName)}</td>
                <td class="network-feed-ip" title="${escapeHtml(e.remoteAddress)}">${escapeHtml(e.remoteAddress)}</td>
                <td class="network-feed-port">${port}${protocol ? ` <span class="network-feed-proto">${protocol}</span>` : ''}</td>
                <td class="network-feed-org">${orgLabel}</td>
                <td class="network-feed-state">${escapeHtml(e.state)}${e.prevState ? ` \u2190 ${e.prevState}` : ''}</td>
            </tr>`;
        }).join('');

        const eventCount = this._feedEvents.length;
        const newCount = this._feedEvents.filter(e => e.type === 'NEU').length;
        const closedCount = this._feedEvents.filter(e => e.type === 'GESCHLOSSEN').length;

        // Aufzeichnungs-Status
        const rec = this._recordingStatus;
        const recElapsed = rec?.elapsedSeconds || 0;
        const recMin = Math.floor(recElapsed / 60);
        const recSec = recElapsed % 60;
        const recTimeStr = `${String(recMin).padStart(2, '0')}:${String(recSec).padStart(2, '0')}`;

        // Aufzeichnungsliste
        const recListHtml = this._recordings.length > 0 ? `
            <div class="network-recordings-section">
                <div class="network-recordings-header">
                    <h4 class="network-section-title">Gespeicherte Aufzeichnungen</h4>
                    <button class="network-btn network-btn-small" id="network-open-recordings-dir" title="Aufzeichnungsverzeichnis öffnen">Ordner öffnen</button>
                </div>
                <table class="network-recordings-table">
                    <thead><tr>
                        <th>Datum</th>
                        <th>Dauer</th>
                        <th>Ereignisse</th>
                        <th>Grösse</th>
                        <th></th>
                    </tr></thead>
                    <tbody>${this._recordings.map(r => {
                        const date = r.startedAt ? new Date(r.startedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                        const dur = r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}:${String(r.durationSeconds % 60).padStart(2, '0')}` : '—';
                        const size = r.sizeBytes < 1024 ? `${r.sizeBytes} B` : r.sizeBytes < 1024 * 1024 ? `${(r.sizeBytes / 1024).toFixed(1)} KB` : `${(r.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
                        return `<tr${r.isActive ? ' class="network-recording-active"' : ''}>
                            <td>${date}</td>
                            <td>${dur}</td>
                            <td>${r.eventCount}</td>
                            <td>${size}</td>
                            <td>${r.isActive ? '<span style="color:var(--danger)">Aktiv</span>' : `<button class="network-btn-small network-btn-danger" data-delete-recording="${escapeHtml(r.filename)}" title="Löschen">&#10005;</button>`}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        ` : '';

        return `<div class="network-livefeed">
            <div class="network-livefeed-header">
                <div class="network-livefeed-stats">
                    <span>${eventCount} Ereignisse</span>
                    <span class="network-feed-stat-new">+${newCount} neu</span>
                    <span class="network-feed-stat-closed">-${closedCount} geschlossen</span>
                </div>
                <div class="network-livefeed-controls">
                    <span data-tier="experte">${this._recording
                        ? `<span class="network-recording-indicator"><span class="network-rec-dot"></span> ${recTimeStr} (${rec?.eventCount || 0} Events)</span>
                           <button class="network-btn network-btn-small network-btn-danger" id="network-rec-stop">Aufzeichnung stoppen</button>`
                        : `<button class="network-btn network-btn-small network-btn-rec" id="network-rec-start">Aufzeichnung starten</button>`
                    }</span>
                    <button class="network-btn network-btn-small" id="network-feed-clear">Leeren</button>
                    <button class="network-btn network-btn-small" id="network-feed-pause">${this._feedPaused ? '\u25b6 Fortsetzen' : '\u23f8 Pause'}</button>
                </div>
            </div>
            ${eventCount === 0 ? `
                <div class="network-livefeed-empty">
                    <div style="font-size:24px;margin-bottom:8px">\u{1f4e1}</div>
                    <p>Warte auf Verbindungsänderungen...</p>
                    <p style="font-size:12px;color:var(--text-muted)">Neue, geschlossene und geänderte TCP-Verbindungen erscheinen hier in Echtzeit.</p>
                </div>
            ` : `
                <div class="network-livefeed-table-wrap" id="network-feed-scroll">
                    <table class="network-livefeed-table">
                        <thead><tr>
                            <th class="network-feed-time">Zeit</th>
                            <th class="network-feed-type">Typ</th>
                            <th class="network-feed-proc">Prozess</th>
                            <th class="network-feed-ip">Remote-IP</th>
                            <th class="network-feed-port">Port</th>
                            <th class="network-feed-org">Firma</th>
                            <th class="network-feed-state">Status</th>
                        </tr></thead>
                        <tbody>${eventRows}</tbody>
                    </table>
                </div>
            `}
            ${recListHtml}
        </div>`;
    }

    /** Wandelt bekannte Ports in Protokoll-Kürzel um. */
    _portToProtocol(port) {
        const map = { 80: 'HTTP', 443: 'HTTPS', 22: 'SSH', 21: 'FTP', 53: 'DNS', 25: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS', 3389: 'RDP', 5900: 'VNC', 8080: 'HTTP', 8443: 'HTTPS', 3306: 'MySQL', 5432: 'PgSQL', 27017: 'MongoDB', 6379: 'Redis' };
        return map[port] || '';
    }

    /** Startet Connection-Diff-Polling für den Live-Feed Tab. */
    _startFeedPolling() {
        this._stopFeedPolling();
        // Aufzeichnungsliste + Status laden
        this._loadRecordings();
        this._restoreRecordingStatus();
        // Sofort ersten Diff holen
        this._pollConnectionDiff();
        this._feedPollInterval = setInterval(() => this._pollConnectionDiff(), 3000);
    }

    /** Prüft ob eine Aufzeichnung läuft (z.B. nach Tab-Wechsel). */
    async _restoreRecordingStatus() {
        try {
            const status = await window.api.getNetworkRecordingStatus();
            if (status.active) {
                this._recording = true;
                this._recordingStatus = status;
                if (!this._recordingTimer) {
                    this._recordingTimer = setInterval(async () => {
                        try {
                            this._recordingStatus = await window.api.getNetworkRecordingStatus();
                            if (this.activeSubTab === 'livefeed') this.render();
                        } catch { /* ignorieren */ }
                    }, 1000);
                }
                this.render();
            }
        } catch { /* ignorieren */ }
    }

    /** Stoppt Connection-Diff-Polling. */
    _stopFeedPolling() {
        if (this._feedPollInterval) {
            clearInterval(this._feedPollInterval);
            this._feedPollInterval = null;
        }
    }

    /** Holt Connection-Diff vom Backend und hängt Events an den Feed an. */
    async _pollConnectionDiff() {
        if (this._feedPaused) return;
        try {
            const diff = await window.api.getConnectionDiff();
            if (diff.events && diff.events.length > 0) {
                // Neue Events vorn einfügen (neuste zuerst)
                this._feedEvents = [...diff.events, ...this._feedEvents].slice(0, 500);
                // Events an laufende Aufzeichnung anhängen
                if (this._recording) {
                    window.api.appendNetworkRecordingEvents(diff.events).catch(() => {});
                }
                // Nur Feed-Bereich aktualisieren wenn auf dem Live-Feed Tab
                if (this.activeSubTab === 'livefeed') {
                    this.render();
                }
            }
        } catch (err) {
            console.error('Connection-Diff Fehler:', err);
        }
    }

    /** Startet eine Netzwerk-Aufzeichnung. */
    async _startRecording() {
        try {
            const result = await window.api.startNetworkRecording();
            if (result.success) {
                this._recording = true;
                this._recordingStatus = { eventCount: 0, elapsedSeconds: 0 };
                // Timer für die Dauer-Anzeige
                this._recordingTimer = setInterval(async () => {
                    try {
                        this._recordingStatus = await window.api.getNetworkRecordingStatus();
                        if (this.activeSubTab === 'livefeed') this.render();
                    } catch { /* ignorieren */ }
                }, 1000);
                showToast('Aufzeichnung gestartet', 'success');
                this.render();
            } else {
                showToast(result.error || 'Aufzeichnung konnte nicht gestartet werden', 'error');
            }
        } catch (err) {
            showToast('Fehler: ' + err.message, 'error');
        }
    }

    /** Stoppt die laufende Aufzeichnung. */
    async _stopRecording() {
        try {
            const result = await window.api.stopNetworkRecording();
            this._recording = false;
            if (this._recordingTimer) {
                clearInterval(this._recordingTimer);
                this._recordingTimer = null;
            }
            this._recordingStatus = null;
            if (result.success) {
                showToast(`Aufzeichnung gespeichert: ${result.eventCount} Ereignisse, ${Math.floor(result.durationSeconds / 60)}:${String(result.durationSeconds % 60).padStart(2, '0')}`, 'success');
                await this._loadRecordings();
            } else {
                showToast(result.error || 'Fehler beim Stoppen', 'error');
            }
            this.render();
        } catch (err) {
            showToast('Fehler: ' + err.message, 'error');
        }
    }

    /** Lädt die Liste gespeicherter Aufzeichnungen. */
    async _loadRecordings() {
        try {
            this._recordings = await window.api.listNetworkRecordings();
        } catch { this._recordings = []; }
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
                <div class="network-empty">
                    <p style="font-size:14px;margin-bottom:8px">Netzwerk-Aktivität über die Zeit vergleichen</p>
                    <p style="color:var(--text-muted);font-size:12px;margin:0">
                        Speichere Snapshots um zu sehen, welche Programme wann online gehen, ob neue Tracker auftauchen oder sich die Verbindungszahlen verändern.
                    </p>
                </div>
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
                const prevSubTab = this.activeSubTab;
                this.activeSubTab = tab.dataset.subtab;
                // Feed-Polling starten/stoppen je nach Sub-Tab
                if (tab.dataset.subtab === 'livefeed' && prevSubTab !== 'livefeed') {
                    this._startFeedPolling();
                } else if (tab.dataset.subtab !== 'livefeed' && prevSubTab === 'livefeed') {
                    this._stopFeedPolling();
                }
                this.render();
            };
        });

        // Search (debounced)
        const searchInput = this.container.querySelector('.network-search');
        if (searchInput) {
            searchInput.oninput = () => {
                clearTimeout(this._searchDebounce);
                this._searchDebounce = setTimeout(() => {
                    this.filter = searchInput.value;
                    this.render();
                }, 250);
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

        // Live-Feed Buttons
        const feedClearBtn = this.container.querySelector('#network-feed-clear');
        if (feedClearBtn) {
            feedClearBtn.onclick = () => {
                this._feedEvents = [];
                this.render();
            };
        }
        const feedPauseBtn = this.container.querySelector('#network-feed-pause');
        if (feedPauseBtn) {
            feedPauseBtn.onclick = () => {
                this._feedPaused = !this._feedPaused;
                this.render();
            };
        }

        // Recording controls
        const recStartBtn = this.container.querySelector('#network-rec-start');
        if (recStartBtn) {
            recStartBtn.onclick = () => this._startRecording();
        }
        const recStopBtn = this.container.querySelector('#network-rec-stop');
        if (recStopBtn) {
            recStopBtn.onclick = () => this._stopRecording();
        }
        const openRecDirBtn = this.container.querySelector('#network-open-recordings-dir');
        if (openRecDirBtn) {
            openRecDirBtn.onclick = async () => {
                await window.api.openNetworkRecordingsDir();
            };
        }
        // Card-Filter-Klick (klickbare Metrikkarten)
        this.container.querySelectorAll('[data-card-filter]').forEach(card => {
            if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
            if (!card.hasAttribute('role')) card.setAttribute('role', 'button');
            const activate = () => {
                const filterType = card.dataset.cardFilter;
                if (filterType === 'all' || this._cardFilter === filterType) {
                    this._cardFilter = null;
                } else {
                    this._cardFilter = filterType;
                }
                this.render();
            };
            card.onclick = activate;
            card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } };
        });

        // Delete recording buttons
        this.container.querySelectorAll('[data-delete-recording]').forEach(btn => {
            btn.onclick = async () => {
                const filename = btn.dataset.deleteRecording;
                const confirmDel = await window.api.showConfirmDialog({ title: 'Aufzeichnung löschen', message: `Aufzeichnung "${filename}" wirklich löschen?`, okLabel: 'Löschen', cancelLabel: 'Abbrechen' });
                if (!confirmDel?.response) return;
                const result = await window.api.deleteNetworkRecording(filename);
                if (result.success) {
                    showToast('Aufzeichnung gelöscht', 'success');
                    await this._loadRecordings();
                    this.render();
                } else {
                    showToast(result.error || 'Löschen fehlgeschlagen', 'error');
                }
            };
        });

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

        // Tier-Level Toggle
        this.container.querySelectorAll('[data-tier-level]').forEach(btn => {
            btn.onclick = () => {
                this._detailLevel = btn.dataset.tierLevel;
                if (window.api.setPreference) {
                    window.api.setPreference('networkDetailLevel', this._detailLevel);
                }
                this.render();
            };
        });

        // DNS-Cache Toggle + Clear
        const dnsToggle = this.container.querySelector('#network-dns-toggle');
        if (dnsToggle) {
            dnsToggle.onclick = async (e) => {
                if (e.target.closest('#network-dns-clear')) return;
                this._dnsExpanded = !this._dnsExpanded;
                if (this._dnsExpanded && this._dnsCache.length === 0) {
                    try { this._dnsCache = await window.api.getDnsCache(); } catch (err) { console.error('DNS cache error:', err); }
                }
                this.render();
            };
        }
        const dnsClearBtn = this.container.querySelector('#network-dns-clear');
        if (dnsClearBtn) {
            dnsClearBtn.onclick = async (e) => {
                e.stopPropagation();
                const result = await window.api.clearDnsCache();
                if (result.success) {
                    showToast('DNS-Cache geleert', 'success');
                    this._dnsCache = [];
                    this.render();
                } else {
                    showToast('Fehler: ' + (result.error || 'unbekannt'), 'error');
                }
            };
        }
        const dnsRefreshBtn = this.container.querySelector('#network-dns-refresh');
        if (dnsRefreshBtn) {
            dnsRefreshBtn.onclick = async () => {
                try { this._dnsCache = await window.api.getDnsCache(); } catch (err) { console.error('DNS cache error:', err); }
                this.render();
            };
        }

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
                const confirmClear = await window.api.showConfirmDialog({ title: 'Verlauf löschen', message: 'Gesamten Netzwerk-Verlauf wirklich löschen?', okLabel: 'Löschen', cancelLabel: 'Abbrechen' });
                if (!confirmClear?.response) return;
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

    /** Cleanup: alle Intervalle, Timer und Ressourcen freigeben */
    destroy() {
        this.stopPolling();
        this._stopFeedPolling();
        if (this._recordingTimer) {
            clearInterval(this._recordingTimer);
            this._recordingTimer = null;
        }
        if (this._companyRefreshTimer) {
            clearTimeout(this._companyRefreshTimer);
            this._companyRefreshTimer = null;
        }
        if (this._searchDebounce) {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = null;
        }
        // Sparkline-Charts zerstören
        for (const [, chart] of this._sparklineCharts) {
            chart.destroy();
        }
        this._sparklineCharts.clear();
    }

}

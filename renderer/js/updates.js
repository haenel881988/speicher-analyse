import { formatBytes } from './utils.js';
import { showToast } from './tree.js';

export class UpdatesView {
    constructor(container) {
        this.container = container;
        this.activeSection = 'windows';
        this.windowsUpdates = [];
        this.softwareUpdates = [];
        this.drivers = [];
        this.updateHistory = [];
    }

    async init() {
        this.render();
        this.setupTabs();
    }

    render() {
        this.container.innerHTML = `
            <div class="updates-view">
                <div class="tool-toolbar" style="margin-bottom:8px">
                    <button class="btn btn-primary" id="btn-check-all-updates">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        Alle Updates prüfen
                    </button>
                    <span class="tool-summary" id="all-updates-summary"></span>
                </div>
                <div class="updates-tabs">
                    <button class="updates-tab active" data-section="windows">Windows Updates</button>
                    <button class="updates-tab" data-section="software">Software Updates</button>
                    <button class="updates-tab" data-section="drivers">Treiber</button>
                    <button class="updates-tab" data-section="history">Verlauf</button>
                </div>
                <div class="updates-content">
                    <div class="updates-section active" data-section="windows">
                        <div class="tool-toolbar">
                            <button class="btn btn-primary" id="btn-check-windows">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                Auf Updates prüfen
                            </button>
                            <span class="tool-summary" id="windows-summary"></span>
                        </div>
                        <div id="windows-results" class="tool-results">
                            <div class="tool-placeholder">Klicke auf "Auf Updates prüfen" um nach Windows Updates zu suchen.</div>
                        </div>
                    </div>
                    <div class="updates-section" data-section="software">
                        <div class="tool-toolbar">
                            <button class="btn btn-primary" id="btn-check-software">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                Software-Updates prüfen
                            </button>
                            <span class="tool-summary" id="software-summary"></span>
                        </div>
                        <div id="software-results" class="tool-results">
                            <div class="tool-placeholder">Klicke auf "Software-Updates prüfen" um verfügbare Updates via winget zu finden.</div>
                        </div>
                    </div>
                    <div class="updates-section" data-section="drivers">
                        <div class="tool-toolbar">
                            <button class="btn btn-primary" id="btn-check-drivers">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                Treiber prüfen
                            </button>
                            <span class="tool-summary" id="drivers-summary"></span>
                        </div>
                        <div id="drivers-results" class="tool-results">
                            <div class="tool-placeholder">Klicke auf "Treiber prüfen" um älteste Treiber anzuzeigen.</div>
                        </div>
                    </div>
                    <div class="updates-section" data-section="history">
                        <div class="tool-toolbar">
                            <button class="btn btn-primary" id="btn-check-history">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                Verlauf laden
                            </button>
                            <span class="tool-summary" id="history-summary"></span>
                        </div>
                        <div id="history-results" class="tool-results">
                            <div class="tool-placeholder">Klicke auf "Verlauf laden" um die letzten 20 installierten Updates anzuzeigen.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupTabs() {
        // Tab switching
        this.container.querySelectorAll('.updates-tab').forEach(tab => {
            tab.onclick = () => {
                this.activeSection = tab.dataset.section;
                this.container.querySelectorAll('.updates-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.container.querySelectorAll('.updates-section').forEach(s => s.classList.remove('active'));
                const section = this.container.querySelector(`.updates-section[data-section="${this.activeSection}"]`);
                if (section) section.classList.add('active');
            };
        });

        // "Check all" button
        this.container.querySelector('#btn-check-all-updates').onclick = () => this.checkAll();

        // Action buttons
        this.container.querySelector('#btn-check-windows').onclick = () => this.checkWindowsUpdates();
        this.container.querySelector('#btn-check-software').onclick = () => this.checkSoftwareUpdates();
        this.container.querySelector('#btn-check-drivers').onclick = () => this.checkDrivers();
        this.container.querySelector('#btn-check-history').onclick = () => this.loadHistory();
    }

    async checkAll() {
        const summary = this.container.querySelector('#all-updates-summary');
        if (summary) summary.textContent = 'Alle Updates werden geprüft...';

        await Promise.allSettled([
            this.checkWindowsUpdates(),
            this.checkSoftwareUpdates(),
            this.checkDrivers(),
        ]);

        // Update combined summary
        if (summary) {
            const parts = [];
            if (this.windowsUpdates.length > 0) parts.push(`${this.windowsUpdates.length} Windows`);
            if (this.softwareUpdates.length > 0) parts.push(`${this.softwareUpdates.length} Software`);
            const oldDrivers = this.drivers.filter(d => d.isOld).length;
            if (oldDrivers > 0) parts.push(`${oldDrivers} Treiber veraltet`);
            summary.textContent = parts.length > 0
                ? `Gefunden: ${parts.join(', ')}`
                : 'Alles aktuell';
        }
    }

    async checkWindowsUpdates() {
        const results = this.container.querySelector('#windows-results');
        const summary = this.container.querySelector('#windows-summary');
        results.innerHTML = '<div class="loading-spinner" style="margin:40px auto"></div>';
        summary.textContent = 'Suche nach Updates...';

        try {
            this.windowsUpdates = await window.api.checkWindowsUpdates();
            if (this.windowsUpdates.length === 0) {
                results.innerHTML = '<div class="tool-placeholder">Keine ausstehenden Windows Updates gefunden. Dein System ist aktuell!</div>';
                summary.textContent = 'Keine Updates verfügbar';
                return;
            }

            const totalSize = this.windowsUpdates.reduce((s, u) => s + (u.Size || 0), 0);
            summary.textContent = `${this.windowsUpdates.length} Update(s) verfügbar` + (totalSize > 0 ? ` (${formatBytes(totalSize)})` : '');

            results.innerHTML = this.windowsUpdates.map(u => `
                <div class="update-item">
                    <div class="update-item-info">
                        <div class="update-item-title">${escapeHtml(u.Title || 'Unbekanntes Update')}</div>
                        <div class="update-item-meta">
                            ${u.KBArticleIDs ? `<span class="update-kb">KB${escapeHtml(u.KBArticleIDs)}</span>` : ''}
                            ${u.Size > 0 ? `<span>${formatBytes(u.Size)}</span>` : ''}
                            <span class="severity-badge severity-${(u.Severity || '').toLowerCase()}">${escapeHtml(u.Severity || 'Unbekannt')}</span>
                            ${u.IsMandatory ? '<span class="update-mandatory">Pflichtupdate</span>' : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            results.innerHTML = `<div class="tool-error">Fehler beim Prüfen der Windows Updates: ${escapeHtml(err.message)}</div>`;
            summary.textContent = 'Fehler';
        }
    }

    async checkSoftwareUpdates() {
        const results = this.container.querySelector('#software-results');
        const summary = this.container.querySelector('#software-summary');
        results.innerHTML = '<div class="loading-spinner" style="margin:40px auto"></div>';
        summary.textContent = 'Suche via winget...';

        try {
            const data = await window.api.checkSoftwareUpdates();

            if (data.error) {
                results.innerHTML = `<div class="tool-error">${escapeHtml(data.error)}</div>`;
                summary.textContent = 'Fehler';
                return;
            }

            this.softwareUpdates = Array.isArray(data) ? data : [];

            if (this.softwareUpdates.length === 0) {
                results.innerHTML = '<div class="tool-placeholder">Keine Software-Updates verfügbar. Alle Programme sind aktuell!</div>';
                summary.textContent = 'Alles aktuell';
                return;
            }

            summary.textContent = `${this.softwareUpdates.length} Update(s) verfügbar`;

            results.innerHTML = `
                <table class="tool-table">
                    <thead>
                        <tr>
                            <th>Programm</th>
                            <th>ID</th>
                            <th>Installiert</th>
                            <th>Verfügbar</th>
                            <th>Quelle</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.softwareUpdates.map(u => `
                            <tr>
                                <td class="name-col" title="${escapeAttr(u.name)}">${escapeHtml(u.name)}</td>
                                <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${escapeHtml(u.id)}</td>
                                <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(u.currentVersion)}</td>
                                <td style="font-family:var(--font-mono);font-size:12px;color:var(--success);font-weight:600">${escapeHtml(u.availableVersion)}</td>
                                <td style="font-size:11px;color:var(--text-muted)">${escapeHtml(u.source)}</td>
                                <td>
                                    <button class="btn-sm btn-primary" data-update-id="${escapeAttr(u.id)}" title="Update installieren">Update</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Wire update buttons
            results.querySelectorAll('[data-update-id]').forEach(btn => {
                btn.onclick = async () => {
                    const pkgId = btn.dataset.updateId;
                    const row = btn.closest('tr');
                    btn.disabled = true;
                    btn.textContent = 'Installiere...';
                    try {
                        const result = await window.api.updateSoftware(pkgId);
                        if (result.success) {
                            if (result.verified) {
                                btn.textContent = 'Verifiziert';
                                btn.classList.remove('btn-primary');
                                btn.classList.add('btn-success');
                                showToast(`${pkgId} erfolgreich aktualisiert und verifiziert${result.installedVersion ? ` (v${result.installedVersion})` : ''}`, 'success');
                                // Update the version cell in the row
                                if (row && result.installedVersion) {
                                    const cells = row.querySelectorAll('td');
                                    if (cells[3]) cells[3].textContent = result.installedVersion;
                                }
                            } else {
                                btn.textContent = 'OK (nicht verifiziert)';
                                btn.classList.remove('btn-primary');
                                btn.classList.add('btn-success');
                                showToast(`${pkgId} Update abgeschlossen. Verifizierung ausstehend - ggf. Neustart erforderlich.`, 'success');
                            }
                        } else {
                            btn.textContent = 'Fehler';
                            btn.disabled = false;
                            btn.classList.remove('btn-primary');
                            btn.classList.add('btn-danger');
                            showToast(`Fehler: ${result.error || 'Unbekannt'}`, 'error');
                        }
                    } catch (err) {
                        btn.textContent = 'Fehler';
                        btn.disabled = false;
                        showToast(`Update fehlgeschlagen: ${err.message}`, 'error');
                    }
                };
            });
        } catch (err) {
            results.innerHTML = `<div class="tool-error">Fehler: ${escapeHtml(err.message)}</div>`;
            summary.textContent = 'Fehler';
        }
    }

    async checkDrivers() {
        const results = this.container.querySelector('#drivers-results');
        const summary = this.container.querySelector('#drivers-summary');
        results.innerHTML = '<div class="loading-spinner" style="margin:40px auto"></div>';
        summary.textContent = 'Prüfe Treiber...';

        try {
            const [drivers, hwInfo] = await Promise.all([
                window.api.getDriverInfo(),
                window.api.getHardwareInfo(),
            ]);
            this.drivers = drivers;

            if (this.drivers.length === 0) {
                results.innerHTML = '<div class="tool-placeholder">Keine Treiber-Informationen verfügbar.</div>';
                summary.textContent = '';
                return;
            }

            const oldCount = this.drivers.filter(d => d.isOld).length;
            summary.textContent = `${this.drivers.length} Treiber` + (oldCount > 0 ? ` (${oldCount} veraltet)` : ' - alle aktuell');

            // Hardware info box
            const hwHtml = hwInfo.Manufacturer ? `
                <div class="hardware-info-box">
                    <strong>System:</strong> ${escapeHtml(hwInfo.Manufacturer)} ${escapeHtml(hwInfo.Model || '')}
                    ${hwInfo.SerialNumber ? ` | <strong>S/N:</strong> ${escapeHtml(hwInfo.SerialNumber)}` : ''}
                </div>
            ` : '';

            results.innerHTML = `
                ${hwHtml}
                <table class="tool-table">
                    <thead>
                        <tr>
                            <th>Gerät</th>
                            <th>Hersteller</th>
                            <th>Version</th>
                            <th>Datum</th>
                            <th>Alter</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.drivers.map(d => `
                            <tr class="${d.isOld ? 'driver-old' : ''}">
                                <td class="name-col" title="${escapeAttr(d.name)}">${escapeHtml(d.name)}</td>
                                <td style="font-size:12px" title="${escapeAttr(d.manufacturer)}">
                                    ${d.supportUrl
                                        ? `<a href="#" class="driver-support-link" data-url="${escapeAttr(d.supportUrl)}" title="Treiber-Support öffnen">${escapeHtml(d.manufacturer)}</a>`
                                        : escapeHtml(d.manufacturer || '-')
                                    }
                                </td>
                                <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(d.version)}</td>
                                <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(d.date)}</td>
                                <td class="age-col">${d.ageYears > 0 ? d.ageYears + ' Jahre' : '< 1 Jahr'}</td>
                                <td>
                                    ${d.isOld
                                        ? '<span class="driver-status-badge driver-old-badge">Veraltet</span>'
                                        : '<span class="driver-status-badge driver-ok-badge">OK</span>'
                                    }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Wire support links
            results.querySelectorAll('.driver-support-link').forEach(link => {
                link.onclick = (e) => {
                    e.preventDefault();
                    window.api.openExternal(link.dataset.url);
                };
            });
        } catch (err) {
            results.innerHTML = `<div class="tool-error">Fehler: ${escapeHtml(err.message)}</div>`;
            summary.textContent = 'Fehler';
        }
    }

    async loadHistory() {
        const results = this.container.querySelector('#history-results');
        const summary = this.container.querySelector('#history-summary');
        results.innerHTML = '<div class="loading-spinner" style="margin:40px auto"></div>';
        summary.textContent = 'Lade Verlauf...';

        try {
            this.updateHistory = await window.api.getUpdateHistory();

            if (this.updateHistory.length === 0) {
                results.innerHTML = '<div class="tool-placeholder">Kein Update-Verlauf verfügbar.</div>';
                summary.textContent = '';
                return;
            }

            summary.textContent = `Letzte ${this.updateHistory.length} Updates`;

            results.innerHTML = `
                <table class="tool-table">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            <th>Titel</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.updateHistory.map(h => {
                            const statusClass = h.ResultCode === 2 ? 'history-success' : h.ResultCode === 4 ? 'history-failed' : '';
                            return `
                                <tr class="${statusClass}">
                                    <td style="font-family:var(--font-mono);font-size:12px;white-space:nowrap">${escapeHtml(h.Date)}</td>
                                    <td title="${escapeAttr(h.Title || '')}">${escapeHtml(h.Title || 'Unbekannt')}</td>
                                    <td>
                                        <span class="history-status-badge history-status-${h.ResultCode}">${escapeHtml(h.Status)}</span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            results.innerHTML = `<div class="tool-error">Fehler: ${escapeHtml(err.message)}</div>`;
            summary.textContent = 'Fehler';
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

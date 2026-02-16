/**
 * Software Audit View - Shows installed programs with categories, orphaned entries,
 * system footprint, and optional update check via winget.
 */
import { showToast } from './tree.js';

export class SoftwareAuditView {
    constructor(container) {
        this.container = container;
        this.programs = [];
        this.orphanedCount = 0;
        this.totalSizeKB = 0;
        this.categories = {};
        this.categoryStats = {};
        this.sortCol = 'name';
        this.sortAsc = true;
        this.filter = '';
        this.categoryFilter = '';
        this.showOrphanedOnly = false;
        this._loaded = false;
        // Update-Check State
        this._wingetAvailable = false;
        this.updateCheckActive = false;
        this.updateData = null;
        this.updatingPackage = null;
    }

    async init() {
        if (this._loaded) return;
        this.container.innerHTML = '<div class="loading-state">Software wird analysiert...</div>';

        // winget-Verfügbarkeit prüfen
        try {
            const caps = await window.api.getSystemCapabilities();
            this._wingetAvailable = caps.wingetAvailable;
        } catch {
            this._wingetAvailable = false;
        }

        await this.scan();
    }

    async scan() {
        try {
            const result = await window.api.auditSoftware();
            this.programs = result.programs || [];
            this.orphanedCount = result.orphanedCount || 0;
            this.totalSizeKB = result.totalSizeKB || 0;
            this.categories = result.categories || {};
            this.categoryStats = result.categoryStats || {};
            this._loaded = true;
            this.render();
        } catch (err) {
            this._loaded = false;
            this.container.innerHTML = `
                <div class="error-state" style="padding:24px">
                    <p><strong>Fehler beim Laden der Software-Daten:</strong></p>
                    <p style="color:var(--text-secondary);margin:8px 0">${this._esc(err.message)}</p>
                    <button class="network-btn" id="audit-retry" style="margin-top:12px">Erneut versuchen</button>
                </div>`;
            const retryBtn = this.container.querySelector('#audit-retry');
            if (retryBtn) {
                retryBtn.onclick = async () => {
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Wird geladen...';
                    await this.init();
                };
            }
        }
    }

    render() {
        const filtered = this._getFiltered();
        const totalSizeMB = Math.round(this.totalSizeKB / 1024);
        const hasUpdateData = this.updateCheckActive && this.updateData;

        // Kategorie-Dropdown-Optionen
        const catOptions = Object.values(this.categories)
            .map(c => `<option value="${this._esc(c.id)}" ${this.categoryFilter === c.id ? 'selected' : ''}>${this._esc(c.label)} (${this.categoryStats[c.id] || 0})</option>`)
            .join('');

        // Update-Status-Text
        let updateStatusHtml = '';
        if (this.updateCheckActive && !this.updateData) {
            updateStatusHtml = '<span class="audit-loading-updates">Prüfe Updates...</span>';
        } else if (hasUpdateData && this.updateData.available) {
            updateStatusHtml = `<span class="audit-update-count">${this.updateData.totalUpdates || 0} Update${this.updateData.totalUpdates !== 1 ? 's' : ''} verfügbar</span>`;
        } else if (hasUpdateData && !this.updateData.available) {
            updateStatusHtml = `<span class="audit-loading-updates">${this._esc(this.updateData.error || 'Nicht verfügbar')}</span>`;
        }

        this.container.innerHTML = `
            <div class="audit-page">
                <div class="audit-header">
                    <h2>Software-Audit</h2>
                    <div class="audit-stats">
                        <span class="audit-stat">${this.programs.length} Programme</span>
                        <span class="audit-stat">${totalSizeMB} MB geschätzt</span>
                        <span class="audit-stat ${this.orphanedCount > 0 ? 'audit-stat-warn' : ''}">${this.orphanedCount} verwaist</span>
                    </div>
                </div>
                <div class="audit-toolbar">
                    <input type="text" class="audit-search" placeholder="Programme durchsuchen..." value="${this._esc(this.filter)}">
                    <select class="audit-category-filter" id="audit-category-filter">
                        <option value="">Alle Kategorien</option>
                        ${catOptions}
                    </select>
                    <label class="audit-filter-label">
                        <input type="checkbox" id="audit-orphaned-only" ${this.showOrphanedOnly ? 'checked' : ''}>
                        Nur verwaiste
                    </label>
                    <button class="audit-btn-refresh" id="audit-refresh">Aktualisieren</button>
                    <label class="network-toggle-label" ${!this._wingetAvailable ? 'title="winget ist nicht installiert" style="opacity:0.5"' : ''}>
                        <input type="checkbox" id="audit-update-toggle" ${this.updateCheckActive ? 'checked' : ''} ${!this._wingetAvailable ? 'disabled' : ''}>
                        <span class="network-toggle-slider"></span>
                        <span>Updates prüfen</span>
                    </label>
                    ${updateStatusHtml}
                </div>
                <div class="audit-table-wrap">
                    <table class="audit-table">
                        <thead>
                            <tr>
                                <th data-col="name" class="sortable">Name</th>
                                <th data-col="category" class="sortable">Kategorie</th>
                                <th data-col="publisher" class="sortable">Herausgeber</th>
                                <th data-col="version">Version</th>
                                <th data-col="estimatedSize" class="sortable">Größe</th>
                                <th data-col="source">Quelle</th>
                                <th>Status</th>
                                ${hasUpdateData ? '<th>Update</th>' : ''}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(p => this._renderRow(p, hasUpdateData)).join('')}
                        </tbody>
                    </table>
                    ${filtered.length === 0 ? '<div class="audit-empty">Keine Programme gefunden</div>' : ''}
                </div>
            </div>`;

        this._wireEvents();
    }

    _renderRow(p, showUpdateCol) {
        const sizeMB = p.estimatedSize ? (p.estimatedSize / 1024).toFixed(1) + ' MB' : '-';
        const sourceLabel = p.source === 'hkcu' ? 'Benutzer' : p.source === 'hklm-wow64' ? '32-Bit' : 'System';
        const statusClass = p.isOrphaned ? 'high' : p.hasInstallDir === false ? 'moderate' : 'safe';
        const statusText = p.isOrphaned ? 'Verwaist' : 'OK';

        // Kategorie-Badge
        const catLabel = this._getCategoryLabel(p.category);
        const catColor = this._getCategoryColor(p.category);

        // Update-Spalte
        let updateCell = '';
        if (showUpdateCol) {
            const updateInfo = this.updateData?.updates?.[p.name];
            if (updateInfo) {
                const isUpdating = this.updatingPackage === updateInfo.wingetId;
                updateCell = `<td>
                    <span class="audit-update-badge">${this._esc(updateInfo.availableVersion)}</span>
                    <button class="audit-btn-update" data-winget-id="${this._esc(updateInfo.wingetId)}" data-name="${this._esc(p.name)}" ${isUpdating ? 'disabled' : ''}>
                        ${isUpdating ? '...' : 'Update'}
                    </button>
                </td>`;
            } else {
                updateCell = '<td><span class="audit-no-update">-</span></td>';
            }
        }

        return `<tr class="${p.isOrphaned ? 'audit-row-orphaned' : ''}" data-path="${this._esc(p.registryPath)}">
            <td class="audit-name" title="${this._esc(p.installLocation || '')}">${this._esc(p.name)}</td>
            <td><span class="audit-category-badge" style="background:${this._esc(catColor)}20;color:${this._esc(catColor)}">${this._esc(catLabel)}</span></td>
            <td>${this._esc(p.publisher || '-')}</td>
            <td>${this._esc(p.version || '-')}</td>
            <td class="audit-size">${sizeMB}</td>
            <td>${sourceLabel}</td>
            <td><span class="risk-badge risk-${statusClass}">${statusText}</span></td>
            ${updateCell}
            <td>
                <button class="audit-btn-detail" data-name="${this._esc(p.name)}" title="Details">Details</button>
            </td>
        </tr>`;
    }

    _getFiltered() {
        let list = this.programs;
        if (this.showOrphanedOnly) {
            list = list.filter(p => p.isOrphaned);
        }
        if (this.categoryFilter) {
            list = list.filter(p => p.category === this.categoryFilter);
        }
        if (this.filter) {
            const q = this.filter.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(q) ||
                (p.publisher || '').toLowerCase().includes(q)
            );
        }
        list = [...list].sort((a, b) => {
            let va = a[this.sortCol] || '', vb = b[this.sortCol] || '';
            if (this.sortCol === 'estimatedSize') { va = a.estimatedSize || 0; vb = b.estimatedSize || 0; }
            if (typeof va === 'number') return this.sortAsc ? va - vb : vb - va;
            return this.sortAsc ? String(va).localeCompare(String(vb), 'de') : String(vb).localeCompare(String(va), 'de');
        });
        return list;
    }

    _wireEvents() {
        // Search
        const searchInput = this.container.querySelector('.audit-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.filter = searchInput.value;
                this.render();
            };
        }

        // Category filter
        const catFilter = this.container.querySelector('#audit-category-filter');
        if (catFilter) {
            catFilter.onchange = () => {
                this.categoryFilter = catFilter.value;
                this.render();
            };
        }

        // Orphaned filter
        const orphanedCb = this.container.querySelector('#audit-orphaned-only');
        if (orphanedCb) {
            orphanedCb.onchange = () => {
                this.showOrphanedOnly = orphanedCb.checked;
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

        // Refresh
        const refreshBtn = this.container.querySelector('#audit-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                this._loaded = false;
                this.updateData = null;
                this.updateCheckActive = false;
                await this.init();
                refreshBtn.disabled = false;
            };
        }

        // Update toggle
        const updateToggle = this.container.querySelector('#audit-update-toggle');
        if (updateToggle) {
            updateToggle.onchange = async () => {
                this.updateCheckActive = updateToggle.checked;
                if (this.updateCheckActive && !this.updateData) {
                    this.render();
                    try {
                        this.updateData = await window.api.checkAuditUpdates();
                    } catch (err) {
                        this.updateData = { available: false, error: err.message, updates: {} };
                    }
                }
                this.render();
            };
        }

        // Update buttons
        this.container.querySelectorAll('.audit-btn-update').forEach(btn => {
            btn.onclick = async () => {
                const wingetId = btn.dataset.wingetId;
                const name = btn.dataset.name;
                if (!wingetId || this.updatingPackage) return;

                this.updatingPackage = wingetId;
                this.render();

                try {
                    const result = await window.api.updateSoftware(wingetId);
                    if (result.success) {
                        showToast(`${name} wurde erfolgreich aktualisiert${result.verified ? ' (verifiziert)' : ''}`, 'info');
                        if (this.updateData?.updates) {
                            delete this.updateData.updates[name];
                            this.updateData.totalUpdates = Object.keys(this.updateData.updates).length;
                        }
                    } else {
                        showToast(`Update von ${name} fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`, 'error');
                    }
                } catch (err) {
                    showToast(`Update-Fehler: ${err.message}`, 'error');
                }

                this.updatingPackage = null;
                this.render();
            };
        });

        // Detail buttons
        this.container.querySelectorAll('.audit-btn-detail').forEach(btn => {
            btn.onclick = async () => {
                const name = btn.dataset.name;
                const program = this.programs.find(p => p.name === name);
                if (program) await this._showDetail(program);
            };
        });
    }

    async _showDetail(program) {
        try {
            const corr = await window.api.correlateSoftware(program);
            const details = [];
            details.push(`Programm: ${program.name}`);
            details.push(`Kategorie: ${this._getCategoryLabel(program.category)}`);
            details.push(`Version: ${program.version || '-'}`);
            details.push(`Pfad: ${program.installLocation || '-'}`);
            details.push(`Registry: ${program.registryPath}`);
            if (corr.autostartEntries?.length > 0) {
                details.push(`\nAutostart-Einträge (${corr.autostartEntries.length}):`);
                corr.autostartEntries.forEach(e => details.push(`  - ${e.name} (${e.enabled ? 'aktiv' : 'inaktiv'})`));
            }
            if (corr.services?.length > 0) {
                details.push(`\nDienste (${corr.services.length}):`);
                corr.services.forEach(s => details.push(`  - ${s.displayName} (${s.status})`));
            }
            details.push(`\nFußabdruck: ${corr.totalFootprint === 'clean' ? 'Sauber' : corr.totalFootprint === 'moderate' ? 'Moderat' : 'Schwer'}`);

            showToast(details.join('\n'), 'info');
        } catch (err) {
            showToast('Fehler beim Laden der Details: ' + err.message, 'error');
        }
    }

    _getCategoryLabel(catId) {
        return this.categories[catId]?.label || 'Sonstiges';
    }

    _getCategoryColor(catId) {
        return this.categories[catId]?.color || '#adb5bd';
    }

    getAuditData() {
        return { orphanedCount: this.orphanedCount, totalPrograms: this.programs.length };
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

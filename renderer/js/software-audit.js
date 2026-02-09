/**
 * Software Audit View - Shows installed programs, orphaned entries, and system footprint.
 */
import { showToast } from './tree.js';

export class SoftwareAuditView {
    constructor(container) {
        this.container = container;
        this.programs = [];
        this.orphanedCount = 0;
        this.totalSizeKB = 0;
        this.sortCol = 'name';
        this.sortAsc = true;
        this.filter = '';
        this.showOrphanedOnly = false;
        this._loaded = false;
    }

    async init() {
        if (this._loaded) return;
        this._loaded = true;
        this.container.innerHTML = '<div class="loading-state">Software wird analysiert...</div>';
        await this.scan();
    }

    async scan() {
        try {
            const result = await window.api.auditSoftware();
            this.programs = result.programs || [];
            this.orphanedCount = result.orphanedCount || 0;
            this.totalSizeKB = result.totalSizeKB || 0;
            this.render();
        } catch (err) {
            this.container.innerHTML = `<div class="error-state">Fehler: ${err.message}</div>`;
        }
    }

    render() {
        const filtered = this._getFiltered();
        const totalSizeMB = Math.round(this.totalSizeKB / 1024);

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
                    <label class="audit-filter-label">
                        <input type="checkbox" id="audit-orphaned-only" ${this.showOrphanedOnly ? 'checked' : ''}>
                        Nur verwaiste
                    </label>
                    <button class="audit-btn-refresh" id="audit-refresh">Aktualisieren</button>
                </div>
                <div class="audit-table-wrap">
                    <table class="audit-table">
                        <thead>
                            <tr>
                                <th data-col="name" class="sortable">Name</th>
                                <th data-col="publisher" class="sortable">Herausgeber</th>
                                <th data-col="version">Version</th>
                                <th data-col="estimatedSize" class="sortable">Größe</th>
                                <th data-col="source">Quelle</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(p => this._renderRow(p)).join('')}
                        </tbody>
                    </table>
                    ${filtered.length === 0 ? '<div class="audit-empty">Keine Programme gefunden</div>' : ''}
                </div>
            </div>`;

        this._wireEvents();
    }

    _renderRow(p) {
        const sizeMB = p.estimatedSize ? (p.estimatedSize / 1024).toFixed(1) + ' MB' : '-';
        const sourceLabel = p.source === 'hkcu' ? 'Benutzer' : p.source === 'hklm-wow64' ? '32-Bit' : 'System';
        const statusClass = p.isOrphaned ? 'high' : p.hasInstallDir === false ? 'moderate' : 'safe';
        const statusText = p.isOrphaned ? 'Verwaist' : 'OK';

        return `<tr class="${p.isOrphaned ? 'audit-row-orphaned' : ''}" data-path="${this._esc(p.registryPath)}">
            <td class="audit-name" title="${this._esc(p.installLocation || '')}">${this._esc(p.name)}</td>
            <td>${this._esc(p.publisher || '-')}</td>
            <td>${this._esc(p.version || '-')}</td>
            <td class="audit-size">${sizeMB}</td>
            <td>${sourceLabel}</td>
            <td><span class="risk-badge risk-${statusClass}">${statusText}</span></td>
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
                await this.init();
                refreshBtn.disabled = false;
            };
        }

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
            details.push(`\nFussabdruck: ${corr.totalFootprint === 'clean' ? 'Sauber' : corr.totalFootprint === 'moderate' ? 'Moderat' : 'Schwer'}`);

            showToast(details.join('\n'), 'info');
        } catch (err) {
            showToast('Fehler beim Laden der Details: ' + err.message, 'error');
        }
    }

    getAuditData() {
        return { orphanedCount: this.orphanedCount, totalPrograms: this.programs.length };
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

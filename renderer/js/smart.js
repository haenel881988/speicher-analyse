/**
 * S.M.A.R.T. View - Disk health monitoring dashboard.
 */
import { showToast } from './tree.js';

export class SmartView {
    constructor(container) {
        this.container = container;
        this.disks = [];
        this._loaded = false;
    }

    async init() {
        if (this._loaded) return;
        this.container.innerHTML = '<div class="loading-state">Festplatten werden analysiert...</div>';
        await this.scan();
    }

    async scan() {
        try {
            this.disks = await window.api.getDiskHealth();
            this._loaded = true;
            this.render();
        } catch (err) {
            this._loaded = false;
            this.container.innerHTML = `
                <div class="error-state" style="padding:24px">
                    <p><strong>Fehler beim Laden der Festplatten-Daten:</strong></p>
                    <p style="color:var(--text-secondary);margin:8px 0">${this._esc(err.message)}</p>
                    <button class="network-btn" id="smart-retry" style="margin-top:12px">Erneut versuchen</button>
                </div>`;
            const retryBtn = this.container.querySelector('#smart-retry');
            if (retryBtn) {
                retryBtn.onclick = async () => {
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Wird geladen...';
                    await this.init();
                };
            }
        }
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    render() {
        if (this.disks.length === 0) {
            this.container.innerHTML = '<div class="empty-state">Keine Festplatten gefunden</div>';
            return;
        }

        this.container.innerHTML = `
            <div class="smart-page">
                <h2 class="smart-title">Festplatten-Gesundheit (S.M.A.R.T.)</h2>
                <div class="smart-grid">
                    ${this.disks.map(d => this._renderDisk(d)).join('')}
                </div>
            </div>`;
    }

    _renderDisk(d) {
        const scoreClass = d.riskLevel === 'safe' ? 'score-good' : d.riskLevel === 'moderate' ? 'score-warn' : 'score-bad';
        const sizeGB = (d.sizeBytes / (1024 ** 3)).toFixed(1);

        const attrs = [];
        if (d.temperature != null) attrs.push({ label: 'Temperatur', value: d.temperature + ' °C', warn: d.temperature > 50 });
        if (d.powerOnHours != null) attrs.push({ label: 'Betriebsstunden', value: this._formatHours(d.powerOnHours), warn: d.powerOnHours > 35000 });
        if (d.wearLevel != null) attrs.push({ label: 'Verschleiss', value: d.wearLevel + '%', warn: d.wearLevel > 80 });
        attrs.push({ label: 'Lese-Fehler', value: String(d.readErrors || 0), warn: d.readErrors > 0 });
        attrs.push({ label: 'Schreib-Fehler', value: String(d.writeErrors || 0), warn: d.writeErrors > 0 });
        attrs.push({ label: 'Status', value: d.healthStatus, warn: d.healthStatus !== 'Healthy' });

        return `<div class="smart-disk-card">
            <div class="smart-disk-header">
                <div class="smart-disk-score ${scoreClass}">
                    <span class="smart-score-num">${d.healthScore}</span>
                </div>
                <div class="smart-disk-info">
                    <strong>${this._esc(d.name || d.model)}</strong>
                    <span class="smart-disk-meta">${d.mediaType} | ${sizeGB} GB | ${d.busType}</span>
                    <span class="smart-disk-meta">${this._esc(d.serial || '')}</span>
                </div>
            </div>
            <div class="smart-disk-attrs">
                ${attrs.map(a => `
                    <div class="smart-attr ${a.warn ? 'smart-attr-warn' : ''}">
                        <span class="smart-attr-label">${a.label}</span>
                        <span class="smart-attr-value">${a.value}</span>
                    </div>`).join('')}
            </div>
            <div class="smart-disk-partitions">
                ${d.partitions} Partition${d.partitions !== 1 ? 'en' : ''} (${d.partitionStyle})
            </div>
        </div>`;
    }

    _formatHours(hours) {
        if (hours == null) return '-';
        if (hours < 24) return hours + ' h';
        const days = Math.floor(hours / 24);
        if (days < 365) return days + ' Tage';
        const years = (days / 365).toFixed(1);
        return years + ' Jahre';
    }

    destroy() {
        this.container.innerHTML = '';
        this._loaded = false;
    }

    getDisks() {
        return this.disks;
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

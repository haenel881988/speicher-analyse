import { escapeHtml } from './utils.js';

/**
 * System-Profil View — Alle Informationen über den PC an einem Ort.
 */

export class SystemProfilView {
    constructor(container) {
        this.container = container;
        this.profile = null;
        this._loaded = false;
    }

    async init() {
        if (this._loaded) return;
        this.container.innerHTML = '<div class="loading-state">System-Informationen werden gesammelt...</div>';
        await this.load();
    }

    async load() {
        try {
            this.profile = await window.api.getSystemProfile();
            this._loaded = true;
            this.render();
            this._setupEvents();
        } catch (err) {
            this._loaded = false;
            this.container.innerHTML = `
                <div class="error-state" style="padding:24px">
                    <p><strong>Fehler beim Laden der System-Informationen:</strong></p>
                    <p style="color:var(--text-secondary);margin:8px 0">${escapeHtml(err.message)}</p>
                    <button class="network-btn" id="sysprofil-retry" style="margin-top:12px">Erneut versuchen</button>
                </div>`;
            const retryBtn = this.container.querySelector('#sysprofil-retry');
            if (retryBtn) {
                retryBtn.onclick = async () => {
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Wird geladen...';
                    this._loaded = false;
                    await this.init();
                };
            }
        }
    }

    _val(val, fallback = '—') {
        if (val === null || val === undefined || val === '') return fallback;
        return escapeHtml(String(val));
    }

    render() {
        if (!this.profile) {
            this.container.innerHTML = '<div class="empty-state">Keine Daten verfügbar</div>';
            return;
        }

        const p = this.profile;

        this.container.innerHTML = `
            <div class="sysprofil-page">
                <div class="sysprofil-header">
                    <h2 class="sysprofil-title">System-Profil</h2>
                    <div class="sysprofil-actions">
                        <button class="network-btn" id="sysprofil-copy" title="Als Text kopieren">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            Kopieren
                        </button>
                        <button class="network-btn" id="sysprofil-refresh" title="Neu laden">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            Aktualisieren
                        </button>
                    </div>
                </div>

                <div class="sysprofil-grid">
                    ${this._renderComputerCard(p)}
                    ${this._renderOsCard(p)}
                    ${this._renderCpuCard(p)}
                    ${this._renderGpuCard(p)}
                    ${this._renderRamCard(p)}
                    ${this._renderDisksCard(p)}
                    ${this._renderNetworkCard(p)}
                    ${this._renderLinksCard(p)}
                </div>
            </div>`;
    }

    // --- Karten-Renderer ---------------------------------------------------

    _renderComputerCard(p) {
        const c = p.computer || {};
        const bios = p.bios || {};
        const mb = p.motherboard || {};
        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    Gerät
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table">
                        <tr><td>Hersteller</td><td>${this._val(c.manufacturer)}</td></tr>
                        <tr><td>Modell</td><td>${this._val(c.model)}</td></tr>
                        <tr><td>Computername</td><td>${this._val(c.name)}</td></tr>
                        <tr><td>Seriennummer</td><td>${this._val(bios.serialNumber)}</td></tr>
                        <tr><td>Systemtyp</td><td>${this._val(c.systemType)}</td></tr>
                        ${mb.product ? `<tr><td>Mainboard</td><td>${this._val(mb.manufacturer)} ${this._val(mb.product, '')}</td></tr>` : ''}
                        ${bios.version ? `<tr><td>BIOS</td><td>${this._val(bios.version)}${bios.releaseDate ? ` (${bios.releaseDate})` : ''}</td></tr>` : ''}
                        <tr><td>Benutzer</td><td>${this._val(c.user)}</td></tr>
                    </table>
                </div>
            </div>`;
    }

    _renderOsCard(p) {
        const o = p.os || {};
        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/></svg>
                    Betriebssystem
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table">
                        <tr><td>Name</td><td>${this._val(o.name)}</td></tr>
                        <tr><td>Version</td><td>${this._val(o.version)}${o.build ? ` (Build ${o.build})` : ''}</td></tr>
                        <tr><td>Architektur</td><td>${this._val(o.architecture)}</td></tr>
                        ${o.installDate ? `<tr><td>Installiert am</td><td>${o.installDate}</td></tr>` : ''}
                        ${o.lastBoot ? `<tr><td>Letzter Start</td><td>${o.lastBoot}</td></tr>` : ''}
                        ${o.uptime ? `<tr><td>Laufzeit</td><td>${o.uptime}</td></tr>` : ''}
                        ${o.productKeyPartial ? `<tr><td>Produktschlüssel</td><td>XXXXX-XXXXX-XXXXX-XXXXX-${this._val(o.productKeyPartial)}</td></tr>` : ''}
                    </table>
                </div>
            </div>`;
    }

    _renderCpuCard(p) {
        const c = p.cpu || {};
        const clockGHz = c.maxClockMHz ? (c.maxClockMHz / 1000).toFixed(2) + ' GHz' : '—';
        const cache = [];
        if (c.l2CacheKB) cache.push(`L2: ${(c.l2CacheKB / 1024).toFixed(1)} MB`);
        if (c.l3CacheKB) cache.push(`L3: ${(c.l3CacheKB / 1024).toFixed(1)} MB`);

        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/></svg>
                    Prozessor
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table">
                        <tr><td>Modell</td><td>${this._val(c.name)}</td></tr>
                        <tr><td>Kerne / Threads</td><td>${c.cores || '?'} Kerne / ${c.threads || '?'} Threads</td></tr>
                        <tr><td>Taktfrequenz</td><td>${clockGHz}</td></tr>
                        ${cache.length ? `<tr><td>Cache</td><td>${cache.join(', ')}</td></tr>` : ''}
                    </table>
                </div>
            </div>`;
    }

    _renderGpuCard(p) {
        if (!p.gpu || p.gpu.length === 0) return '';
        const rows = p.gpu.map(g => {
            const vram = g.vramBytes > 0 ? this._formatBytes(g.vramBytes) : '—';
            return `
                <tr><td>Modell</td><td>${this._val(g.name)}</td></tr>
                <tr><td>Hersteller</td><td>${this._val(g.manufacturer)}</td></tr>
                <tr><td>Treiber</td><td>${this._val(g.driverVersion)}</td></tr>
                <tr><td>VRAM</td><td>${vram}</td></tr>
                ${g.resolution ? `<tr><td>Auflösung</td><td>${this._val(g.resolution)}${g.refreshRate ? ` @ ${g.refreshRate} Hz` : ''}</td></tr>` : ''}
            `;
        }).join('<tr><td colspan="2" style="border-bottom:1px solid var(--border-color);padding:4px 0"></td></tr>');

        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    Grafikkarte${p.gpu.length > 1 ? 'n' : ''}
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table">${rows}</table>
                </div>
            </div>`;
    }

    _renderRamCard(p) {
        const r = p.ram || {};
        const usedPct = r.totalBytes ? Math.round((r.usedBytes / r.totalBytes) * 100) : 0;
        const stickRows = (r.sticks || []).map((s, i) => `
            <tr><td>Slot ${i + 1}</td><td>${s.capacityFormatted}${s.speedMHz ? ` @ ${s.speedMHz} MHz` : ''}${s.manufacturer ? ` (${s.manufacturer.trim()})` : ''}</td></tr>
        `).join('');

        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 19v-8a2 2 0 012-2h8a2 2 0 012 2v8"/><path d="M6 19h12"/><path d="M10 5v4"/><path d="M14 5v4"/></svg>
                    Arbeitsspeicher
                </div>
                <div class="sysprofil-card-body">
                    <div class="sysprofil-ram-bar">
                        <div class="sysprofil-ram-used" style="width:${usedPct}%"></div>
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
                        ${this._formatBytes(r.usedBytes || 0)} von ${r.totalFormatted || '?'} belegt (${usedPct}%)
                    </div>
                    <table class="sysprofil-table">
                        <tr><td>Gesamt</td><td>${this._val(r.totalFormatted)}</td></tr>
                        ${stickRows}
                    </table>
                </div>
            </div>`;
    }

    _renderDisksCard(p) {
        if (!p.disks || p.disks.length === 0) return '';
        const rows = p.disks.map(d => `
            <tr>
                <td>${this._val(d.model)}</td>
                <td>${d.sizeFormatted}</td>
                <td>${this._val(d.interface)}</td>
                <td>${d.partitions} Partition${d.partitions !== 1 ? 'en' : ''}</td>
            </tr>
        `).join('');

        return `
            <div class="sysprofil-card sysprofil-card-wide">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                    Festplatten
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table sysprofil-table-full">
                        <thead><tr><th>Modell</th><th>Größe</th><th>Schnittstelle</th><th>Partitionen</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    _renderNetworkCard(p) {
        if (!p.network || p.network.length === 0) return '';
        const rows = p.network.map(n => `
            <tr>
                <td>${this._val(n.description)}</td>
                <td>${(n.ip || []).join(', ') || '—'}</td>
                <td>${this._val(n.mac)}</td>
                <td>${n.dhcp ? 'DHCP' : 'Statisch'}</td>
            </tr>
        `).join('');

        return `
            <div class="sysprofil-card sysprofil-card-wide">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Netzwerk
                </div>
                <div class="sysprofil-card-body">
                    <table class="sysprofil-table sysprofil-table-full">
                        <thead><tr><th>Adapter</th><th>IP-Adresse</th><th>MAC</th><th>Typ</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    _renderLinksCard(p) {
        if (!p.links || p.links.length === 0) return '';
        const linkItems = p.links.map(l => `
            <a href="#" class="sysprofil-link" data-url="${escapeHtml(l.url)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                ${escapeHtml(l.label)}
            </a>
        `).join('');

        return `
            <div class="sysprofil-card">
                <div class="sysprofil-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    Hersteller-Links
                </div>
                <div class="sysprofil-card-body sysprofil-links">
                    ${linkItems}
                </div>
            </div>`;
    }

    // --- Events ------------------------------------------------------------

    _setupEvents() {
        const copyBtn = this.container.querySelector('#sysprofil-copy');
        if (copyBtn) {
            copyBtn.onclick = () => this._copyAsText();
        }

        const refreshBtn = this.container.querySelector('#sysprofil-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = 'Wird geladen...';
                this._loaded = false;
                await this.init();
            };
        }

        // Externe Links öffnen
        this.container.querySelectorAll('.sysprofil-link[data-url]').forEach(a => {
            a.onclick = (e) => {
                e.preventDefault();
                const url = a.dataset.url;
                if (url && window.api.openExternal) {
                    window.api.openExternal(url);
                }
            };
        });
    }

    // --- Text-Export -------------------------------------------------------

    _copyAsText() {
        if (!this.profile) return;
        const p = this.profile;
        const c = p.computer || {};
        const o = p.os || {};
        const cpu = p.cpu || {};
        const r = p.ram || {};

        const lines = [
            '=== System-Profil ===',
            '',
            '--- Gerät ---',
            `Hersteller: ${c.manufacturer || '—'}`,
            `Modell: ${c.model || '—'}`,
            `Seriennummer: ${(p.bios || {}).serialNumber || '—'}`,
            `Computername: ${c.name || '—'}`,
            '',
            '--- Betriebssystem ---',
            `${o.name || 'Windows'} ${o.version || ''}`,
            `Build: ${o.build || '—'}`,
            `Architektur: ${o.architecture || '—'}`,
            `Laufzeit: ${o.uptime || '—'}`,
            '',
            '--- Prozessor ---',
            `${cpu.name || '—'}`,
            `Kerne: ${cpu.cores || '?'} / Threads: ${cpu.threads || '?'}`,
            `Takt: ${cpu.maxClockMHz ? (cpu.maxClockMHz / 1000).toFixed(2) + ' GHz' : '—'}`,
            '',
            '--- Grafikkarte ---',
            ...(p.gpu || []).map(g => `${g.name || '—'} (${g.driverVersion || '—'})`),
            '',
            '--- Arbeitsspeicher ---',
            `Gesamt: ${r.totalFormatted || '—'}`,
            ...(r.sticks || []).map((s, i) => `Slot ${i + 1}: ${s.capacityFormatted}${s.speedMHz ? ' @ ' + s.speedMHz + ' MHz' : ''}`),
            '',
            '--- Festplatten ---',
            ...(p.disks || []).map(d => `${d.model || '—'} — ${d.sizeFormatted} (${d.interface || '—'})`),
            '',
            '--- Netzwerk ---',
            ...(p.network || []).map(n => `${n.description || '—'}: ${(n.ip || []).join(', ')} (${n.mac || '—'})`),
        ];

        const text = lines.join('\n');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = this.container.querySelector('#sysprofil-copy');
                if (btn) {
                    const orig = btn.innerHTML;
                    btn.textContent = 'Kopiert!';
                    setTimeout(() => { btn.innerHTML = orig; }, 2000);
                }
            });
        }
    }

    // --- Hilfsfunktionen ---------------------------------------------------

    _formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
    }
}

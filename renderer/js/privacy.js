/**
 * Privacy Dashboard View - Shows privacy settings, score, and scheduled tasks audit.
 */
import { showToast } from './tree.js';

export class PrivacyView {
    constructor(container) {
        this.container = container;
        this.settings = [];
        this.tasks = [];
        this.score = 0;
        this._loaded = false;
    }

    async init() {
        if (this._loaded) return;
        this.container.innerHTML = '<div class="loading-state">Datenschutz wird analysiert...</div>';
        await this.scan();
    }

    async scan() {
        try {
            const [settings, tasks] = await Promise.all([
                window.api.getPrivacySettings(),
                window.api.getScheduledTasksAudit(),
            ]);
            this.settings = settings || [];
            this.tasks = (tasks || []).filter(t => t.isTelemetry);
            this.score = this._calcScore();
            this._loaded = true;
            this.render();
        } catch (err) {
            this._loaded = false;
            this.container.innerHTML = `
                <div class="error-state" style="padding:24px">
                    <p><strong>Fehler beim Laden der Datenschutz-Daten:</strong></p>
                    <p style="color:var(--text-secondary);margin:8px 0">${this._esc(err.message)}</p>
                    <button class="network-btn" id="privacy-retry" style="margin-top:12px">Erneut versuchen</button>
                </div>`;
            const retryBtn = this.container.querySelector('#privacy-retry');
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

    _calcScore() {
        if (this.settings.length === 0) return 50;
        const priv = this.settings.filter(s => s.isPrivate).length;
        return Math.round((priv / this.settings.length) * 100);
    }

    render() {
        const scoreClass = this.score >= 70 ? 'score-good' : this.score >= 40 ? 'score-warn' : 'score-bad';
        const categories = ['telemetrie', 'werbung', 'standort', 'diagnose', 'aktivitaet'];
        const catNames = { telemetrie: 'Telemetrie', werbung: 'Werbung', standort: 'Standort', diagnose: 'Diagnose', aktivitaet: 'Aktivität' };

        let settingsHtml = '';
        for (const cat of categories) {
            const items = this.settings.filter(s => s.category === cat);
            if (items.length === 0) continue;
            settingsHtml += `<div class="privacy-category">
                <h4 class="privacy-cat-title">${catNames[cat] || cat}</h4>
                ${items.map(s => this._renderSetting(s)).join('')}
            </div>`;
        }

        let tasksHtml = '';
        if (this.tasks.length > 0) {
            tasksHtml = `<div class="privacy-section">
                <h3 class="privacy-section-title">Telemetrie-Tasks (${this.tasks.length})</h3>
                <table class="privacy-table">
                    <thead><tr><th>Task</th><th>Pfad</th><th>Status</th><th></th></tr></thead>
                    <tbody>${this.tasks.map(t => `
                        <tr>
                            <td title="${this._esc(t.description || '')}">${this._esc(t.name)}</td>
                            <td class="privacy-task-path">${this._esc(t.path)}</td>
                            <td><span class="risk-badge risk-${t.state === 'Deaktiviert' ? 'safe' : 'high'}">${t.state === 'Deaktiviert' ? 'Deaktiviert' : 'Aktiv'}</span></td>
                            <td>${t.state !== 'Deaktiviert' ? `<button class="privacy-btn-small" data-task="${this._esc(t.path + t.name)}">Deaktivieren</button>` : ''}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        this.container.innerHTML = `
            <div class="privacy-page">
                <div class="privacy-header">
                    <div class="privacy-score-ring ${scoreClass}">
                        <span class="privacy-score-value">${this.score}</span>
                        <span class="privacy-score-label">Datenschutz</span>
                    </div>
                    <div class="privacy-header-info">
                        <h2>Privacy-Dashboard</h2>
                        <p>${this.settings.filter(s => s.isPrivate).length} von ${this.settings.length} Einstellungen sind datenschutzfreundlich.</p>
                        <button class="privacy-btn-apply-all" id="privacy-apply-all">Alle optimieren</button>
                    </div>
                </div>
                <div class="privacy-section">
                    <h3 class="privacy-section-title">Datenschutz-Einstellungen</h3>
                    ${settingsHtml}
                </div>
                ${tasksHtml}
            </div>`;

        this._wireEvents();
    }

    _renderSetting(s) {
        const statusClass = s.isPrivate ? 'safe' : 'high';
        const statusText = s.isPrivate ? 'Geschützt' : 'Offen';
        return `<div class="privacy-setting" data-id="${s.id}">
            <div class="privacy-setting-info">
                <strong>${this._esc(s.name)}</strong>
                <span class="privacy-setting-desc">${this._esc(s.description)}</span>
                <span class="privacy-setting-path">${this._esc(s.registryPath)}\\${this._esc(s.registryKey)}</span>
            </div>
            <div class="privacy-setting-actions">
                <span class="risk-badge risk-${statusClass}">${statusText}</span>
                ${!s.isPrivate ? `<button class="privacy-btn-small" data-setting="${s.id}">Schützen</button>` : ''}
            </div>
        </div>`;
    }

    _wireEvents() {
        // Apply all
        const applyAllBtn = this.container.querySelector('#privacy-apply-all');
        if (applyAllBtn) {
            applyAllBtn.onclick = async () => {
                applyAllBtn.disabled = true;
                applyAllBtn.textContent = 'Wird angewendet...';
                try {
                    const result = await window.api.applyAllPrivacy();
                    showToast(`${result.applied} Einstellungen optimiert${result.failed > 0 ? `, ${result.failed} fehlgeschlagen` : ''}`, result.failed > 0 ? 'warning' : 'success');
                    await this.scan();
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                applyAllBtn.disabled = false;
                applyAllBtn.textContent = 'Alle optimieren';
            };
        }

        // Individual settings
        this.container.querySelectorAll('button[data-setting]').forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true;
                try {
                    const result = await window.api.applyPrivacySetting(btn.dataset.setting);
                    if (result.success) {
                        showToast('Einstellung angewendet', 'success');
                        await this.scan();
                    } else {
                        showToast(result.error || 'Fehler', 'error');
                    }
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                btn.disabled = false;
            };
        });

        // Disable tasks
        this.container.querySelectorAll('button[data-task]').forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true;
                try {
                    const result = await window.api.disableScheduledTask(btn.dataset.task);
                    if (result.success) {
                        showToast('Task deaktiviert', 'success');
                        await this.scan();
                    } else {
                        showToast(result.error || 'Fehler', 'error');
                    }
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                btn.disabled = false;
            };
        });
    }

    getScore() {
        return this.score;
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

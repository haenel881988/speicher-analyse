/**
 * Privacy Dashboard View - Shows privacy settings, score, sideloading status,
 * and scheduled tasks audit. Settings split into Standard + Erweitert tiers.
 */
import { showToast } from './tree.js';

export class PrivacyView {
    constructor(container) {
        this.container = container;
        this.settings = [];
        this.tasks = [];
        this.score = 0;
        this.edition = null;
        this.sideloading = null;
        this._loaded = false;
        this._advancedOpen = false;
    }

    async init() {
        if (this._loaded) return;
        this.container.innerHTML = '<div class="loading-state">Datenschutz wird analysiert...</div>';
        await this.scan();
    }

    async scan() {
        try {
            const [privacyData, tasks] = await Promise.all([
                window.api.getPrivacySettings(),
                window.api.getScheduledTasksAudit(),
            ]);

            // Neues Format: { settings, edition, sideloading }
            if (privacyData && privacyData.settings) {
                this.settings = privacyData.settings || [];
                this.edition = privacyData.edition || null;
                this.sideloading = privacyData.sideloading || null;
            } else {
                // Fallback für altes Format (Array)
                this.settings = Array.isArray(privacyData) ? privacyData : [];
            }

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

        // Sideloading-Warnung
        let sideloadingHtml = '';
        if (this.sideloading && !this.sideloading.enabled) {
            sideloadingHtml = `
                <div class="privacy-alert privacy-alert-danger">
                    <div class="privacy-alert-icon">&#9888;</div>
                    <div class="privacy-alert-content">
                        <strong>App-Sideloading ist deaktiviert!</strong>
                        <p>Die Installation von Apps außerhalb des Microsoft Store (z.B. .exe, .msix) wird blockiert.
                        Dies kann durch Gruppenrichtlinien-Änderungen verursacht werden.</p>
                        <button class="privacy-btn-fix" id="privacy-fix-sideloading">Sideloading reparieren</button>
                    </div>
                </div>`;
        }

        // Windows-Edition Info
        let editionHtml = '';
        if (this.edition) {
            editionHtml = `<span class="privacy-edition-badge" title="${this._esc(this.edition.edition)}">
                ${this._esc(this.edition.edition)}${!this.edition.isEnterprise ? ' — Erweiterte Einstellungen mit Vorsicht verwenden' : ''}
            </span>`;
        }

        // Standard-Einstellungen
        const standardSettings = this.settings.filter(s => s.tier === 'standard' || !s.tier);
        const advancedSettings = this.settings.filter(s => s.tier === 'advanced');

        const standardHtml = this._renderSettingsGroup(standardSettings);

        // Erweiterte Einstellungen (aufklappbar)
        const advancedHtml = advancedSettings.length > 0 ? `
            <div class="privacy-section privacy-advanced-section">
                <div class="privacy-advanced-header" id="privacy-toggle-advanced">
                    <h3 class="privacy-section-title">
                        <span class="privacy-advanced-arrow">${this._advancedOpen ? '&#9660;' : '&#9654;'}</span>
                        Erweiterte Einstellungen (${advancedSettings.length})
                    </h3>
                    <span class="risk-badge risk-high">Systemebene</span>
                </div>
                ${this._advancedOpen ? `
                <div class="privacy-advanced-warning">
                    <strong>&#9888; Achtung:</strong> Diese Einstellungen greifen auf Systemebene (HKLM) ein und können
                    unerwünschte Nebeneffekte verursachen: blockierte App-Installationen, "Von Organisation verwaltet"-Banner,
                    Probleme mit Windows-Updates. Erfordern Administratorrechte.
                    ${!this.edition?.isEnterprise ? '<br><strong>Ihr System ist kein Enterprise/Education — besondere Vorsicht geboten!</strong>' : ''}
                </div>
                ${this._renderSettingsGroup(advancedSettings, true)}
                ` : ''}
            </div>` : '';

        // Telemetrie-Tasks
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
                ${sideloadingHtml}
                <div class="privacy-header">
                    <div class="privacy-score-ring ${scoreClass}">
                        <span class="privacy-score-value">${this.score}</span>
                        <span class="privacy-score-label">Datenschutz</span>
                    </div>
                    <div class="privacy-header-info">
                        <h2>Privacy-Dashboard</h2>
                        <p>${this.settings.filter(s => s.isPrivate).length} von ${this.settings.length} Einstellungen sind datenschutzfreundlich.</p>
                        ${editionHtml}
                        <button class="privacy-btn-apply-all" id="privacy-apply-all" title="Wendet nur die sicheren Standard-Einstellungen an (keine erweiterten)">Alle Standard optimieren</button>
                    </div>
                </div>
                <div class="privacy-section">
                    <h3 class="privacy-section-title">Standard-Einstellungen (${standardSettings.length})</h3>
                    <p class="privacy-section-desc">Sichere Einstellungen auf Benutzerebene — keine Systemauswirkungen.</p>
                    ${standardHtml}
                </div>
                ${advancedHtml}
                ${tasksHtml}
            </div>`;

        this._wireEvents();
    }

    _renderSettingsGroup(settings, isAdvanced = false) {
        const categories = ['telemetrie', 'werbung', 'standort', 'diagnose', 'aktivitaet'];
        const catNames = { telemetrie: 'Telemetrie', werbung: 'Werbung', standort: 'Standort', diagnose: 'Diagnose', aktivitaet: 'Aktivität' };

        let html = '';
        for (const cat of categories) {
            const items = settings.filter(s => s.category === cat);
            if (items.length === 0) continue;
            html += `<div class="privacy-category">
                <h4 class="privacy-cat-title">${catNames[cat] || cat}</h4>
                ${items.map(s => this._renderSetting(s, isAdvanced)).join('')}
            </div>`;
        }
        return html;
    }

    _renderSetting(s, isAdvanced = false) {
        const statusClass = s.isPrivate ? 'safe' : 'high';
        const statusText = s.isPrivate ? 'Geschützt' : 'Offen';
        const warningHtml = s.warning ? `<div class="privacy-setting-warning">${this._esc(s.warning)}</div>` : '';

        return `<div class="privacy-setting ${isAdvanced ? 'privacy-setting-advanced' : ''}" data-id="${s.id}">
            <div class="privacy-setting-info">
                <strong>${this._esc(s.name)}</strong>
                <span class="privacy-setting-desc">${this._esc(s.description)}</span>
                ${warningHtml}
                <span class="privacy-setting-path">${this._esc(s.registryPath)}\\${this._esc(s.registryKey)}</span>
            </div>
            <div class="privacy-setting-actions">
                <span class="risk-badge risk-${statusClass}">${statusText}</span>
                ${!s.isPrivate ? `<button class="privacy-btn-small ${isAdvanced ? 'privacy-btn-advanced' : ''}" data-setting="${s.id}" ${isAdvanced ? 'data-advanced="true"' : ''}>${isAdvanced ? 'Ändern...' : 'Schützen'}</button>` : ''}
            </div>
        </div>`;
    }

    _wireEvents() {
        // Apply all (nur Standard)
        const applyAllBtn = this.container.querySelector('#privacy-apply-all');
        if (applyAllBtn) {
            applyAllBtn.onclick = async () => {
                applyAllBtn.disabled = true;
                applyAllBtn.textContent = 'Wird angewendet...';
                try {
                    const result = await window.api.applyAllPrivacy();
                    let msg = `${result.applied} Standard-Einstellungen optimiert`;
                    if (result.skipped > 0) msg += ` (${result.skipped} erweiterte übersprungen)`;
                    if (result.failed > 0) msg += `, ${result.failed} fehlgeschlagen`;
                    showToast(msg, result.failed > 0 ? 'warning' : 'success');
                    await this.scan();
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                applyAllBtn.disabled = false;
                applyAllBtn.textContent = 'Alle Standard optimieren';
            };
        }

        // Toggle Advanced section
        const toggleAdvanced = this.container.querySelector('#privacy-toggle-advanced');
        if (toggleAdvanced) {
            toggleAdvanced.onclick = () => {
                this._advancedOpen = !this._advancedOpen;
                this.render();
            };
        }

        // Individual settings
        this.container.querySelectorAll('button[data-setting]').forEach(btn => {
            btn.onclick = async () => {
                const isAdvanced = btn.dataset.advanced === 'true';

                // Erweiterte Einstellungen: Bestätigungsdialog
                if (isAdvanced) {
                    const setting = this.settings.find(s => s.id === btn.dataset.setting);
                    const warningText = setting?.warning || 'Diese Einstellung greift auf Systemebene ein und kann Nebeneffekte verursachen.';

                    const confirmed = await window.api.showConfirmDialog({
                        type: 'warning',
                        title: 'Erweiterte Einstellung ändern',
                        message: `${setting?.name || 'Einstellung'}\n\n${warningText}\n\nMöchten Sie wirklich fortfahren?`,
                        buttons: ['Abbrechen', 'Trotzdem ändern'],
                        defaultId: 0,
                        cancelId: 0,
                    });

                    if (confirmed.response !== 1) return;
                }

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

        // Sideloading fix
        const fixBtn = this.container.querySelector('#privacy-fix-sideloading');
        if (fixBtn) {
            fixBtn.onclick = async () => {
                fixBtn.disabled = true;
                fixBtn.textContent = 'Wird repariert...';
                try {
                    const result = await window.api.fixSideloading();
                    if (result.success) {
                        showToast('App-Sideloading wurde erfolgreich aktiviert!', 'success');
                        await this.scan();
                    } else {
                        showToast(result.error || 'Fehler beim Reparieren', 'error');
                    }
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                fixBtn.disabled = false;
                fixBtn.textContent = 'Sideloading reparieren';
            };
        }

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
}

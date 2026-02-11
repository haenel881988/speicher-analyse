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
        this.recommendations = new Map(); // settingId → { recommendation, affectedApps, reason }
        this.programCount = 0;
        this._loaded = false;
        this._advancedOpen = false;
        this._recsLoaded = false;
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

            // Smarte Empfehlungen nachladen (nicht-blockierend)
            if (!this._recsLoaded) {
                this._loadRecommendations();
            }
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

    async _loadRecommendations() {
        try {
            const data = await window.api.getPrivacyRecommendations();
            if (data?.error) {
                console.warn('[Privacy] Empfehlungen nicht verfügbar:', data.error);
                this._recsLoaded = true;
                this._recsError = true;
                this.render();
                return;
            }
            this.recommendations.clear();
            for (const rec of (data.recommendations || [])) {
                this.recommendations.set(rec.settingId, rec);
            }
            this.programCount = data.programCount || 0;
            this._recsLoaded = true;
            this._recsError = false;
            this.render(); // Re-Render mit Empfehlungen
        } catch (err) {
            console.warn('[Privacy] Empfehlungen konnten nicht geladen werden:', err.message);
            this._recsLoaded = true;
            this._recsError = true;
            this.render();
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

        // Empfehlungs-Banner
        let recBannerHtml = '';
        if (this._recsLoaded && this.recommendations.size > 0) {
            const safeCount = [...this.recommendations.values()].filter(r => r.recommendation === 'safe').length;
            const cautionCount = [...this.recommendations.values()].filter(r => r.recommendation === 'caution').length;
            const riskyCount = [...this.recommendations.values()].filter(r => r.recommendation === 'risky').length;
            recBannerHtml = `<div class="privacy-rec-banner">
                <strong>App-Analyse:</strong> ${this.programCount} installierte Programme analysiert &mdash;
                <span class="risk-badge risk-safe">&#10003; ${safeCount} sicher</span>
                ${cautionCount > 0 ? `<span class="risk-badge risk-medium">&#9888; ${cautionCount} Vorsicht</span>` : ''}
                ${riskyCount > 0 ? `<span class="risk-badge risk-high">&#9888; ${riskyCount} Risiko</span>` : ''}
            </div>`;
        } else if (!this._recsLoaded) {
            recBannerHtml = `<div class="privacy-rec-banner privacy-rec-loading">
                <span class="mini-spinner"></span>
                <strong>App-Analyse läuft...</strong> Deine installierten Programme werden geprüft, um dir zu zeigen welche Apps von den Einstellungen betroffen sind.
            </div>`;
        } else if (this._recsError) {
            recBannerHtml = `<div class="privacy-rec-banner">
                <strong>App-Analyse:</strong> Konnte nicht durchgeführt werden. <button class="privacy-btn-small" id="privacy-retry-recs">Erneut versuchen</button>
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
                        ${recBannerHtml}
                        <div class="privacy-header-actions">
                            <button class="privacy-btn-apply-all" id="privacy-apply-all" title="Wendet nur die sicheren Standard-Einstellungen an (keine erweiterten)">Alle Standard optimieren</button>
                            <button class="privacy-btn-reset-all" id="privacy-reset-all" title="Setzt alle Standard-Einstellungen auf Windows-Standardwerte zurück">Alle zurücksetzen</button>
                        </div>
                    </div>
                </div>
                <div class="privacy-section">
                    <h3 class="privacy-section-title">Standard-Einstellungen (${standardSettings.length})</h3>
                    <p class="privacy-section-desc">Sichere Einstellungen auf Benutzerebene — keine Systemauswirkungen.</p>
                    ${standardHtml}
                </div>
                ${advancedHtml}
                ${tasksHtml}
                <div class="privacy-network-link">
                    <button class="privacy-btn-network" id="privacy-goto-network">Netzwerk-Aktivität ansehen &rarr;</button>
                    <span class="privacy-network-hint">Zeigt welche Apps gerade Daten senden und an wen</span>
                </div>
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

        // Smarte Empfehlung (kompakt)
        const rec = this.recommendations.get(s.id);
        let recHtml = '';
        if (rec) {
            const recColors = { safe: 'risk-safe', caution: 'risk-medium', risky: 'risk-high' };
            const recLabels = { safe: 'Deaktivieren empfohlen', caution: 'Vorsicht', risky: 'Nicht deaktivieren' };
            const recIcons = { safe: '&#10003;', caution: '&#9888;', risky: '&#10007;' };
            const badgeClass = recColors[rec.recommendation] || 'risk-medium';
            const badgeLabel = recLabels[rec.recommendation] || 'Prüfen';
            const badgeIcon = recIcons[rec.recommendation] || '';

            recHtml = `<div class="privacy-recommendation privacy-rec-${rec.recommendation}">
                <span class="risk-badge ${badgeClass}">${badgeIcon} ${badgeLabel}</span>
                ${rec.affectedApps.length > 0 ? `<span class="privacy-rec-apps-inline">${rec.affectedApps.slice(0, 3).map(a =>
                    this._esc(a.name)).join(', ')}${rec.affectedApps.length > 3 ? ` +${rec.affectedApps.length - 3}` : ''}</span>` : ''}
            </div>`;
        }

        // Details (aufklappbar): Erklärung + Risiko + Auswirkungen
        const hasDetails = s.explanation || s.riskExplanation || (s.impacts?.length > 0) || s.warning;
        let detailsHtml = '';
        if (hasDetails) {
            const riskPart = s.riskExplanation ? `<div class="privacy-detail-risk"><strong>Warum ist das ein Risiko?</strong><p>${this._esc(s.riskExplanation)}</p></div>` : '';
            const explanationPart = s.explanation ? `<p class="privacy-detail-text">${this._esc(s.explanation)}</p>` : '';
            const impactsPart = s.impacts?.length > 0 ? `<div class="privacy-detail-impacts"><strong>Beim Deaktivieren:</strong><ul>${s.impacts.map(i => `<li>${this._esc(i)}</li>`).join('')}</ul></div>` : '';
            detailsHtml = `<details class="privacy-details">
                <summary>Details</summary>
                <div class="privacy-details-content">
                    ${riskPart}
                    ${explanationPart}
                    ${impactsPart}
                    ${warningHtml}
                </div>
            </details>`;
        }

        return `<div class="privacy-setting ${isAdvanced ? 'privacy-setting-advanced' : ''}" data-id="${s.id}">
            <div class="privacy-setting-info">
                <div class="privacy-setting-header">
                    <strong>${this._esc(s.name)}</strong>
                    <span class="risk-badge risk-${statusClass}">${statusText}</span>
                    ${!s.isPrivate
                        ? `<button class="privacy-btn-small ${isAdvanced ? 'privacy-btn-advanced' : ''}" data-setting="${s.id}" ${isAdvanced ? 'data-advanced="true"' : ''}>${isAdvanced ? 'Ändern...' : 'Schützen'}</button>`
                        : `<button class="privacy-btn-small privacy-btn-reset" data-reset="${s.id}" ${isAdvanced ? 'data-advanced="true"' : ''}>Zurücksetzen</button>`
                    }
                </div>
                <span class="privacy-setting-desc">${this._esc(s.description)}</span>
                ${recHtml}
                ${detailsHtml}
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

        // Reset all (nur Standard)
        const resetAllBtn = this.container.querySelector('#privacy-reset-all');
        if (resetAllBtn) {
            resetAllBtn.onclick = async () => {
                const confirmed = await window.api.showConfirmDialog({
                    type: 'warning',
                    title: 'Alle zurücksetzen?',
                    message: 'Alle Standard-Einstellungen werden auf Windows-Standardwerte zurückgesetzt.\n\nDein System sendet dann wieder Daten an Microsoft.\n\nFortfahren?',
                    buttons: ['Abbrechen', 'Zurücksetzen'],
                    defaultId: 0,
                    cancelId: 0,
                });
                if (confirmed.response !== 1) return;
                resetAllBtn.disabled = true;
                resetAllBtn.textContent = 'Wird zurückgesetzt...';
                try {
                    const result = await window.api.resetAllPrivacy();
                    let msg = `${result.reset} Einstellungen zurückgesetzt`;
                    if (result.skipped > 0) msg += ` (${result.skipped} erweiterte übersprungen)`;
                    if (result.failed > 0) msg += `, ${result.failed} fehlgeschlagen`;
                    showToast(msg, result.failed > 0 ? 'warning' : 'success');
                    await this.scan();
                } catch (err) {
                    showToast('Fehler: ' + err.message, 'error');
                }
                resetAllBtn.disabled = false;
                resetAllBtn.textContent = 'Alle zurücksetzen';
            };
        }

        // Reset individual settings
        this.container.querySelectorAll('button[data-reset]').forEach(btn => {
            btn.onclick = async () => {
                const isAdvanced = btn.dataset.advanced === 'true';
                if (isAdvanced) {
                    const setting = this.settings.find(s => s.id === btn.dataset.reset);
                    const confirmed = await window.api.showConfirmDialog({
                        type: 'warning',
                        title: 'Erweiterte Einstellung zurücksetzen',
                        message: `${setting?.name || 'Einstellung'}\n\nDiese Einstellung wird auf den Windows-Standard zurückgesetzt.\nDein System sendet dann wieder mehr Daten an Microsoft.\n\nFortfahren?`,
                        buttons: ['Abbrechen', 'Zurücksetzen'],
                        defaultId: 0,
                        cancelId: 0,
                    });
                    if (confirmed.response !== 1) return;
                }
                btn.disabled = true;
                try {
                    const result = await window.api.resetPrivacySetting(btn.dataset.reset);
                    if (result.success) {
                        showToast('Einstellung auf Windows-Standard zurückgesetzt', 'success');
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

        // Retry recommendations
        const retryRecs = this.container.querySelector('#privacy-retry-recs');
        if (retryRecs) {
            retryRecs.onclick = () => {
                this._recsLoaded = false;
                this._recsError = false;
                this.render();
                this._loadRecommendations();
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

        // Sideloading fix (mit automatischer Admin-Elevation)
        const fixBtn = this.container.querySelector('#privacy-fix-sideloading');
        if (fixBtn) {
            fixBtn.onclick = async () => {
                fixBtn.disabled = true;
                fixBtn.textContent = 'Wird repariert...';
                try {
                    // Erst direkt versuchen
                    const result = await window.api.fixSideloading();
                    if (result.success) {
                        showToast('App-Sideloading wurde erfolgreich aktiviert!', 'success');
                        await this.scan();
                    } else if (result.needsAdmin) {
                        // Admin-Rechte nötig → Bestätigungsdialog
                        const confirmed = await window.api.showConfirmDialog({
                            type: 'question',
                            title: 'Administratorrechte erforderlich',
                            message: 'Zum Reparieren des App-Sideloading werden Administratorrechte benötigt.\n\nDie App wird als Administrator neu gestartet und die Reparatur automatisch durchgeführt. Alle Einstellungen bleiben erhalten.',
                            buttons: ['Abbrechen', 'Als Administrator neu starten'],
                            defaultId: 1,
                            cancelId: 0,
                        });
                        if (confirmed.response === 1) {
                            fixBtn.textContent = 'Wird als Admin neu gestartet...';
                            await window.api.fixSideloadingWithElevation();
                            // App wird neu gestartet, kein weiterer Code nötig
                        }
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

        // Link zum Netzwerk-Monitor
        const gotoNetwork = this.container.querySelector('#privacy-goto-network');
        if (gotoNetwork) {
            gotoNetwork.onclick = () => {
                document.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'network' } }));
            };
        }
    }

    getScore() {
        return this.score;
    }
}

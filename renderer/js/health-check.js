import { formatBytes, escapeHtml } from './utils.js';

/**
 * HealthCheckView — Ein-Klick Gesundheitscheck ("Diagnose-Knopf")
 * Aggregiert: Festplatten, S.M.A.R.T., Datenschutz, Sicherheit
 * Zeigt Ampel-Bewertung + Top-Empfehlungen
 */
export class HealthCheckView {
    constructor(container) {
        this.container = container;
        this._loaded = false;
        this._running = false;
        this._results = null;
    }

    async init() {
        if (this._loaded && this._results) {
            this._renderResults();
            return;
        }
        this._renderInitial();
    }

    destroy() {
        this.container.innerHTML = '';
        this._results = null;
        this._loaded = false;
    }

    _renderInitial() {
        this.container.innerHTML = `
            <div class="health-check">
                <div class="health-header">
                    <h2>PC-Diagnose</h2>
                    <p class="health-subtitle">Prüft Festplatten, Datenschutz, Sicherheit und Systemzustand in einem Durchlauf.</p>
                </div>
                <div class="health-start-area">
                    <button class="health-start-btn" id="health-start-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Diagnose starten
                    </button>
                    <p class="health-hint">Dauert etwa 10–20 Sekunden. Es werden keine Änderungen vorgenommen.</p>
                </div>
                ${this._results ? '' : '<div class="health-results" id="health-results"></div>'}
            </div>
        `;
        this.container.querySelector('#health-start-btn')?.addEventListener('click', () => this._runDiagnosis());
    }

    async _runDiagnosis() {
        if (this._running) return;
        this._running = true;

        const btn = this.container.querySelector('#health-start-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <svg class="health-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/>
                </svg>
                Diagnose läuft...
            `;
        }

        let resultsEl = this.container.querySelector('#health-results');
        if (!resultsEl) {
            resultsEl = document.createElement('div');
            resultsEl.className = 'health-results';
            resultsEl.id = 'health-results';
            this.container.querySelector('.health-check')?.appendChild(resultsEl);
        }
        resultsEl.innerHTML = '<div class="health-loading">Daten werden gesammelt...</div>';

        try {
            // Alle Checks parallel starten
            const [drives, diskHealth, privacy, security] = await Promise.allSettled([
                window.api.getDrives(),
                window.api.getDiskHealth(),
                window.api.getPrivacySettings(),
                window.api.runSecurityAudit(),
            ]);

            this._results = {
                drives: drives.status === 'fulfilled' ? drives.value : null,
                diskHealth: diskHealth.status === 'fulfilled' ? diskHealth.value : null,
                privacy: privacy.status === 'fulfilled' ? privacy.value : null,
                security: security.status === 'fulfilled' ? security.value : null,
                timestamp: Date.now(),
            };

            this._loaded = true;
            this._renderResults();
        } catch (e) {
            resultsEl.innerHTML = `<div class="health-error">Diagnose fehlgeschlagen: ${escapeHtml(e.message || String(e))}</div>`;
        } finally {
            this._running = false;
        }
    }

    _renderResults() {
        const r = this._results;
        if (!r) return;

        // Kategorien auswerten
        const categories = [];
        const recommendations = [];

        // 1. Festplattenplatz
        const storageResult = this._analyzeStorage(r.drives);
        categories.push(storageResult);
        recommendations.push(...storageResult.recommendations);

        // 2. Festplatten-Gesundheit (S.M.A.R.T.)
        const healthResult = this._analyzeDiskHealth(r.diskHealth);
        categories.push(healthResult);
        recommendations.push(...healthResult.recommendations);

        // 3. Datenschutz
        const privacyResult = this._analyzePrivacy(r.privacy);
        categories.push(privacyResult);
        recommendations.push(...privacyResult.recommendations);

        // 4. Sicherheit
        const securityResult = this._analyzeSecurity(r.security);
        categories.push(securityResult);
        recommendations.push(...securityResult.recommendations);

        // Gesamtbewertung
        const totalScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
        const totalLevel = totalScore >= 80 ? 'gut' : totalScore >= 50 ? 'mittel' : 'kritisch';
        const totalColor = totalScore >= 80 ? 'green' : totalScore >= 50 ? 'yellow' : 'red';

        // Empfehlungen sortieren: kritisch > warnung > info
        const priorityOrder = { critical: 0, warning: 1, ok: 2 };
        recommendations.sort((a, b) => (priorityOrder[a.level] ?? 2) - (priorityOrder[b.level] ?? 2));
        const topRecs = recommendations.slice(0, 8);

        // Zeitstempel
        const ts = new Date(r.timestamp);
        const timeStr = ts.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

        this.container.innerHTML = `
            <div class="health-check">
                <div class="health-header">
                    <h2>PC-Diagnose</h2>
                    <div class="health-header-actions">
                        <span class="health-timestamp">Letzte Prüfung: ${timeStr}</span>
                        <button class="health-refresh-btn" id="health-refresh-btn" title="Erneut prüfen">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="health-score-overview">
                    <div class="health-score-circle health-score-${totalColor}">
                        <span class="health-score-number">${totalScore}</span>
                        <span class="health-score-label">von 100</span>
                    </div>
                    <div class="health-score-text">
                        <span class="health-verdict health-verdict-${totalColor}">${this._verdictText(totalLevel)}</span>
                        <span class="health-verdict-detail">${this._verdictDetail(totalLevel)}</span>
                    </div>
                </div>

                <div class="health-categories">
                    ${categories.map(c => this._renderCategory(c)).join('')}
                </div>

                ${topRecs.length > 0 ? `
                <div class="health-recommendations">
                    <h3>Empfehlungen</h3>
                    <div class="health-rec-list">
                        ${topRecs.map((rec, i) => `
                            <div class="health-rec health-rec-${rec.level}">
                                <span class="health-rec-icon">${this._levelIcon(rec.level)}</span>
                                <span class="health-rec-text">${escapeHtml(rec.text)}</span>
                                ${rec.action ? `<button class="health-rec-action" data-tab="${escapeHtml(rec.action)}">${escapeHtml(rec.actionLabel || 'Anzeigen')}</button>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        // Event-Handler
        this.container.querySelector('#health-refresh-btn')?.addEventListener('click', () => {
            this._results = null;
            this._loaded = false;
            this._renderInitial();
            this._runDiagnosis();
        });

        // Empfehlungs-Buttons → Tab wechseln
        this.container.querySelectorAll('.health-rec-action[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelector(`.sidebar-nav-btn[data-tab="${tab}"]`)?.click();
            });
        });
    }

    // ===== Analyse-Funktionen =====

    _analyzeStorage(drives) {
        const result = { name: 'Speicherplatz', icon: 'storage', score: 100, detail: '', recommendations: [] };
        if (!drives || !Array.isArray(drives)) {
            result.score = 50;
            result.detail = 'Keine Laufwerksdaten verfügbar';
            return result;
        }

        let worstPercent = 0;
        const warnings = [];
        for (const d of drives) {
            const pct = d.percent || 0;
            const free = d.free || 0;
            const mount = d.mountpoint || d.device || '?';
            if (pct > worstPercent) worstPercent = pct;

            if (pct >= 95) {
                warnings.push({ level: 'critical', text: `Laufwerk ${mount} ist zu ${Math.round(pct)}% voll — nur noch ${formatBytes(free)} frei`, action: 'cleanup', actionLabel: 'Bereinigung' });
            } else if (pct >= 85) {
                warnings.push({ level: 'warning', text: `Laufwerk ${mount} ist zu ${Math.round(pct)}% voll — ${formatBytes(free)} frei`, action: 'cleanup', actionLabel: 'Bereinigung' });
            }
        }

        if (worstPercent >= 95) result.score = 20;
        else if (worstPercent >= 85) result.score = 50;
        else if (worstPercent >= 70) result.score = 75;
        else result.score = 100;

        result.detail = `${drives.length} Laufwerk${drives.length !== 1 ? 'e' : ''} — ${worstPercent >= 85 ? 'Platz wird knapp' : 'Ausreichend Platz'}`;
        result.recommendations = warnings;
        return result;
    }

    _analyzeDiskHealth(healthData) {
        const result = { name: 'Festplatten', icon: 'health', score: 100, detail: '', recommendations: [] };
        if (!healthData || !Array.isArray(healthData)) {
            result.score = 50;
            result.detail = 'S.M.A.R.T.-Daten nicht verfügbar';
            return result;
        }

        let worstScore = 100;
        for (const disk of healthData) {
            const score = disk.healthScore ?? 100;
            const name = disk.name || disk.model || 'Unbekannt';
            if (score < worstScore) worstScore = score;

            if (disk.riskLevel === 'high') {
                result.recommendations.push({ level: 'critical', text: `Festplatte "${name}" zeigt kritische Werte — Datenverlust möglich`, action: 'smart', actionLabel: 'S.M.A.R.T.' });
            } else if (disk.riskLevel === 'moderate') {
                result.recommendations.push({ level: 'warning', text: `Festplatte "${name}" zeigt Auffälligkeiten — regelmäßig prüfen`, action: 'smart', actionLabel: 'S.M.A.R.T.' });
            }

            if (disk.temperature && disk.temperature > 50) {
                result.recommendations.push({ level: 'warning', text: `Festplatte "${name}" ist ${disk.temperature}°C warm — Kühlung prüfen` });
            }
        }

        result.score = worstScore;
        result.detail = `${healthData.length} Festplatte${healthData.length !== 1 ? 'n' : ''} — ${worstScore >= 70 ? 'Gesund' : worstScore >= 40 ? 'Auffällig' : 'Kritisch'}`;
        return result;
    }

    _analyzePrivacy(privacyData) {
        const result = { name: 'Datenschutz', icon: 'privacy', score: 100, detail: '', recommendations: [] };
        if (!privacyData?.settings || !Array.isArray(privacyData.settings)) {
            result.score = 50;
            result.detail = 'Datenschutz-Einstellungen nicht verfügbar';
            return result;
        }

        const settings = privacyData.settings;
        const total = settings.length;
        const privateCount = settings.filter(s => s.isPrivate).length;
        const openSettings = settings.filter(s => !s.isPrivate);
        const pct = total > 0 ? Math.round((privateCount / total) * 100) : 0;

        result.score = pct;
        result.detail = `${privateCount} von ${total} Einstellungen geschützt (${pct}%)`;

        if (openSettings.length > 0) {
            const openCount = openSettings.length;
            if (openCount >= 6) {
                result.recommendations.push({ level: 'critical', text: `${openCount} Datenschutz-Einstellungen sind offen — Windows teilt Daten mit Microsoft`, action: 'privacy', actionLabel: 'Datenschutz' });
            } else if (openCount >= 3) {
                result.recommendations.push({ level: 'warning', text: `${openCount} Datenschutz-Einstellungen könnten verbessert werden`, action: 'privacy', actionLabel: 'Datenschutz' });
            } else {
                result.recommendations.push({ level: 'ok', text: `${openCount} Einstellung${openCount !== 1 ? 'en' : ''} offen — insgesamt guter Schutz`, action: 'privacy', actionLabel: 'Datenschutz' });
            }
        }

        return result;
    }

    _analyzeSecurity(securityData) {
        const result = { name: 'Sicherheit', icon: 'security', score: 100, detail: '', recommendations: [] };
        if (!securityData || !Array.isArray(securityData)) {
            result.score = 50;
            result.detail = 'Sicherheits-Check nicht verfügbar';
            return result;
        }

        let okCount = 0, warnCount = 0, critCount = 0;
        for (const check of securityData) {
            const status = check.status;
            const name = check.name || check.id || '';
            const detail = check.detail || '';

            if (status === 'ok') {
                okCount++;
            } else if (status === 'warning') {
                warnCount++;
                result.recommendations.push({ level: 'warning', text: `${name}: ${detail}`, action: 'security-audit', actionLabel: 'Sicherheit' });
            } else if (status === 'critical') {
                critCount++;
                result.recommendations.push({ level: 'critical', text: `${name}: ${detail}`, action: 'security-audit', actionLabel: 'Sicherheit' });
            }
        }

        const total = okCount + warnCount + critCount;
        if (total > 0) {
            // Gewichtete Bewertung: ok = 100%, warning = 40%, critical = 0%
            result.score = Math.round(((okCount * 100) + (warnCount * 40)) / total);
        }

        result.detail = `${total} Prüfungen — ${okCount} bestanden, ${warnCount} Warnungen, ${critCount} kritisch`;
        return result;
    }

    // ===== Render-Hilfsfunktionen =====

    _renderCategory(cat) {
        const color = cat.score >= 80 ? 'green' : cat.score >= 50 ? 'yellow' : 'red';
        return `
            <div class="health-category health-cat-${color}">
                <div class="health-cat-header">
                    <span class="health-cat-icon">${this._categoryIcon(cat.icon)}</span>
                    <span class="health-cat-name">${escapeHtml(cat.name)}</span>
                </div>
                <div class="health-cat-bar">
                    <div class="health-cat-bar-fill health-bar-${color}" style="width:${cat.score}%"></div>
                </div>
                <div class="health-cat-score">${cat.score}%</div>
                <div class="health-cat-detail">${escapeHtml(cat.detail)}</div>
            </div>
        `;
    }

    _categoryIcon(icon) {
        switch (icon) {
            case 'storage': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>';
            case 'health': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
            case 'privacy': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
            case 'security': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
            default: return '';
        }
    }

    _levelIcon(level) {
        switch (level) {
            case 'critical': return '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            case 'warning': return '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            case 'ok': return '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            default: return '';
        }
    }

    _verdictText(level) {
        switch (level) {
            case 'gut': return 'Guter Zustand';
            case 'mittel': return 'Verbesserungsbedarf';
            case 'kritisch': return 'Handlungsbedarf';
            default: return '';
        }
    }

    _verdictDetail(level) {
        switch (level) {
            case 'gut': return 'Dein PC ist in gutem Zustand. Kleinere Verbesserungen sind möglich.';
            case 'mittel': return 'Einige Bereiche brauchen Aufmerksamkeit. Sieh dir die Empfehlungen an.';
            case 'kritisch': return 'Mehrere Probleme gefunden. Die Empfehlungen sollten zeitnah umgesetzt werden.';
            default: return '';
        }
    }
}

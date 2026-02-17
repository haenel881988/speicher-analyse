/**
 * IT-Sicherheitsbericht — PDF-Report-Generator.
 * Nutzt html2pdf.bundle.min.js (global geladen via index.html).
 */
import { escapeHtml } from './utils.js';
import { showToast } from './tree.js';

/**
 * Generiert einen professionellen IT-Sicherheitsbericht als PDF.
 * @param {Object} opts
 * @param {Object} opts.auditResult - Security-Audit-Ergebnis (checks, diff)
 * @param {Object} opts.scoreData - System-Score-Daten (score, grade, categories)
 * @param {Object[]} opts.devices - Lokale Netzwerk-Geräte
 * @param {Object[]} opts.connections - Gruppierte Netzwerk-Verbindungen
 * @param {Object} opts.summary - Netzwerk-Zusammenfassung
 */
export async function generateSecurityReport(opts = {}) {
    if (typeof html2pdf === 'undefined') {
        showToast('PDF-Bibliothek nicht geladen', 'error');
        return;
    }

    showToast('Bericht wird erstellt...', 'info');

    const { auditResult, scoreData, devices, connections, summary } = opts;
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const pcName = await _getComputerName();

    const html = _buildReportHTML({
        dateStr, timeStr, pcName,
        auditResult, scoreData, devices, connections, summary,
    });

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    document.body.appendChild(container);

    try {
        await html2pdf()
            .set({
                margin: [12, 12, 12, 12],
                filename: `Sicherheitsbericht_${dateStr.replace(/\./g, '-')}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            })
            .from(container.firstChild)
            .save();
        showToast('Sicherheitsbericht als PDF gespeichert', 'success');
    } catch (err) {
        console.error('PDF-Report Fehler:', err);
        showToast('PDF-Export fehlgeschlagen: ' + err.message, 'error');
    } finally {
        document.body.removeChild(container);
    }
}

async function _getComputerName() {
    try {
        const info = await window.api.getSystemInfo?.();
        return info?.computerName || info?.hostname || 'Unbekannt';
    } catch {
        return 'Unbekannt';
    }
}

function _statusIcon(status) {
    if (status === 'ok') return '<span style="color:#2ed573">&#10004;</span>';
    if (status === 'warning') return '<span style="color:#ffa502">&#9888;</span>';
    if (status === 'danger') return '<span style="color:#ff4757">&#10008;</span>';
    return '<span style="color:#888">?</span>';
}

function _statusText(status) {
    if (status === 'ok') return 'OK';
    if (status === 'warning') return 'Warnung';
    if (status === 'danger') return 'Kritisch';
    return 'Fehler';
}

function _buildReportHTML({ dateStr, timeStr, pcName, auditResult, scoreData, devices, connections, summary }) {
    const styles = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #222; line-height: 1.5; }
        .report { padding: 8mm; max-width: 190mm; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #6c5ce7; padding-bottom: 12px; margin-bottom: 20px; }
        .header-left h1 { font-size: 20px; color: #6c5ce7; margin-bottom: 2px; }
        .header-left p { font-size: 11px; color: #666; }
        .header-right { text-align: right; font-size: 10px; color: #666; }
        .section { margin-bottom: 18px; page-break-inside: avoid; }
        .section-title { font-size: 14px; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
        .score-box { display: inline-block; text-align: center; padding: 12px 24px; background: #f8f8f8; border-radius: 10px; border: 2px solid #6c5ce7; }
        .score-number { font-size: 36px; font-weight: 800; }
        .score-grade { font-size: 14px; color: #666; }
        .score-ok { color: #2ed573; }
        .score-warn { color: #ffa502; }
        .score-danger { color: #ff4757; }
        .categories { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 10px; }
        .cat-card { background: #f8f8f8; border-radius: 6px; padding: 8px 10px; border-left: 3px solid #6c5ce7; }
        .cat-name { font-weight: 600; font-size: 11px; }
        .cat-score { font-size: 18px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #f0f0f0; text-align: left; padding: 5px 8px; font-weight: 600; border-bottom: 2px solid #ddd; }
        td { padding: 4px 8px; border-bottom: 1px solid #eee; }
        .check-row-danger td { background: #fff5f5; }
        .check-row-warning td { background: #fffbf0; }
        .risk-list { list-style: none; }
        .risk-list li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
        .risk-list li:last-child { border-bottom: none; }
        .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd; text-align: center; font-size: 9px; color: #999; }
    `;

    let scoreSection = '';
    if (scoreData) {
        const cls = scoreData.score >= 70 ? 'score-ok' : scoreData.score >= 40 ? 'score-warn' : 'score-danger';
        const catCards = (scoreData.categories || []).map(c =>
            `<div class="cat-card"><div class="cat-name">${escapeHtml(c.name)}</div><div class="cat-score ${c.score >= 70 ? 'score-ok' : c.score >= 40 ? 'score-warn' : 'score-danger'}">${c.score}</div></div>`
        ).join('');

        scoreSection = `<div class="section">
            <div class="section-title">System-Score</div>
            <div class="score-box">
                <div class="score-number ${cls}">${scoreData.score}</div>
                <div class="score-grade">Note ${scoreData.grade} — ${scoreData.riskLevel === 'safe' ? 'Sicher' : scoreData.riskLevel === 'moderate' ? 'Verbesserungsbedarf' : 'Kritisch'}</div>
            </div>
            <div class="categories">${catCards}</div>
        </div>`;
    }

    let auditSection = '';
    if (auditResult?.checks) {
        const rows = auditResult.checks.map(c =>
            `<tr class="check-row-${c.status}"><td>${_statusIcon(c.status)}</td><td>${escapeHtml(c.label)}</td><td>${_statusText(c.status)}</td><td>${escapeHtml(c.message)}</td></tr>`
        ).join('');
        auditSection = `<div class="section">
            <div class="section-title">Sicherheits-Check</div>
            <table><thead><tr><th></th><th>Prüfung</th><th>Status</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>
        </div>`;
    }

    let networkSection = '';
    if (summary || (connections && connections.length > 0)) {
        const s = summary || {};
        const top10 = (connections || []).slice(0, 10);
        const highRisk = (connections || []).filter(g => g.hasHighRisk);
        const trackers = (connections || []).filter(g => g.hasTrackers);

        let connRows = top10.map(g =>
            `<tr class="${g.hasHighRisk ? 'check-row-danger' : g.hasTrackers ? 'check-row-warning' : ''}">
                <td>${escapeHtml(g.processName)}</td>
                <td>${g.connectionCount}</td>
                <td>${g.uniqueIPCount}</td>
                <td>${escapeHtml((g.resolvedCompanies || []).slice(0, 3).join(', '))}</td>
                <td>${g.hasHighRisk ? '<span style="color:#ff4757">&#9888; Ja</span>' : g.hasTrackers ? '<span style="color:#ffa502">Tracker</span>' : '—'}</td>
            </tr>`
        ).join('');

        networkSection = `<div class="section">
            <div class="section-title">Netzwerk-Übersicht</div>
            <p style="margin-bottom:8px">${s.totalConnections || 0} Verbindungen, ${s.uniqueRemoteIPs || 0} Remote-IPs, ${highRisk.length} Hochrisiko-Prozesse, ${trackers.length} mit Trackern</p>
            <table><thead><tr><th>Prozess</th><th>Verb.</th><th>IPs</th><th>Firmen</th><th>Risiko</th></tr></thead><tbody>${connRows}</tbody></table>
        </div>`;
    }

    let devicesSection = '';
    if (devices && devices.length > 0) {
        const devRows = devices.slice(0, 20).map(d =>
            `<tr><td>${escapeHtml(d.hostname) || '—'}</td><td>${escapeHtml(d.ip)}</td><td>${escapeHtml(d.mac)}</td><td>${escapeHtml(d.vendor) || '—'}</td></tr>`
        ).join('');
        devicesSection = `<div class="section">
            <div class="section-title">Erkannte Geräte im Netzwerk (${devices.length})</div>
            <table><thead><tr><th>Hostname</th><th>IP</th><th>MAC</th><th>Hersteller</th></tr></thead><tbody>${devRows}</tbody></table>
        </div>`;
    }

    // Risiko-Zusammenfassung
    const risks = [];
    if (auditResult?.checks) {
        for (const c of auditResult.checks) {
            if (c.status === 'danger') risks.push({ level: 'Kritisch', text: `${c.label}: ${c.message}` });
            else if (c.status === 'warning') risks.push({ level: 'Warnung', text: `${c.label}: ${c.message}` });
        }
    }
    if (connections) {
        const hrCount = connections.filter(g => g.hasHighRisk).length;
        if (hrCount > 0) risks.push({ level: 'Warnung', text: `${hrCount} Prozess(e) mit Verbindungen in Hochrisiko-Länder` });
        const trCount = connections.filter(g => g.hasTrackers).length;
        if (trCount > 0) risks.push({ level: 'Info', text: `${trCount} Prozess(e) mit Tracker-Verbindungen` });
    }

    let riskSection = '';
    if (risks.length > 0) {
        const riskItems = risks.map(r => {
            const color = r.level === 'Kritisch' ? '#ff4757' : r.level === 'Warnung' ? '#ffa502' : '#888';
            return `<li><span style="color:${color};font-weight:600">${escapeHtml(r.level)}:</span> ${escapeHtml(r.text)}</li>`;
        }).join('');
        riskSection = `<div class="section">
            <div class="section-title">Empfehlungen & Risiken</div>
            <ul class="risk-list">${riskItems}</ul>
        </div>`;
    }

    return `<div class="report">
        <style>${styles}</style>
        <div class="header">
            <div class="header-left">
                <h1>IT-Sicherheitsbericht</h1>
                <p>Erstellt mit Speicher Analyse</p>
            </div>
            <div class="header-right">
                <div><strong>${escapeHtml(pcName)}</strong></div>
                <div>${dateStr} um ${timeStr}</div>
            </div>
        </div>
        ${scoreSection}
        ${auditSection}
        ${riskSection}
        ${networkSection}
        ${devicesSection}
        <div class="footer">
            Erstellt mit Speicher Analyse &mdash; ${dateStr} ${timeStr}
        </div>
    </div>`;
}

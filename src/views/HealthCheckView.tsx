import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface CategoryResult {
  name: string;
  icon: string;
  score: number;
  detail: string;
  recommendations: Recommendation[];
}

interface Recommendation {
  level: 'critical' | 'warning' | 'ok';
  text: string;
  action?: string;
  actionLabel?: string;
}

export default function HealthCheckView() {
  const { showToast, setActiveTab } = useAppContext();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{
    categories: CategoryResult[];
    recommendations: Recommendation[];
    totalScore: number;
    timestamp: number;
  } | null>(null);

  const analyzeStorage = (drives: any): CategoryResult => {
    const result: CategoryResult = { name: 'Speicherplatz', icon: 'storage', score: 100, detail: '', recommendations: [] };
    if (!drives || !Array.isArray(drives)) {
      result.score = 50; result.detail = 'Keine Laufwerksdaten verfügbar'; return result;
    }
    let worstPercent = 0;
    for (const d of drives) {
      const pct = d.percent || 0;
      const free = d.free || 0;
      const mount = d.mountpoint || d.device || '?';
      if (pct > worstPercent) worstPercent = pct;
      if (pct >= 95) {
        result.recommendations.push({ level: 'critical', text: `Laufwerk ${mount} ist zu ${Math.round(pct)}% voll — nur noch ${formatBytes(free)} frei`, action: 'cleanup', actionLabel: 'Bereinigung' });
      } else if (pct >= 85) {
        result.recommendations.push({ level: 'warning', text: `Laufwerk ${mount} ist zu ${Math.round(pct)}% voll — ${formatBytes(free)} frei`, action: 'cleanup', actionLabel: 'Bereinigung' });
      }
    }
    if (worstPercent >= 95) result.score = 20;
    else if (worstPercent >= 85) result.score = 50;
    else if (worstPercent >= 70) result.score = 75;
    result.detail = `${drives.length} Laufwerk${drives.length !== 1 ? 'e' : ''} — ${worstPercent >= 85 ? 'Platz wird knapp' : 'Ausreichend Platz'}`;
    return result;
  };

  const analyzeDiskHealth = (healthData: any): CategoryResult => {
    const result: CategoryResult = { name: 'Festplatten', icon: 'health', score: 100, detail: '', recommendations: [] };
    if (!healthData || !Array.isArray(healthData)) {
      result.score = 50; result.detail = 'S.M.A.R.T.-Daten nicht verfügbar'; return result;
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
  };

  const analyzePrivacy = (privacyData: any): CategoryResult => {
    const result: CategoryResult = { name: 'Datenschutz', icon: 'privacy', score: 100, detail: '', recommendations: [] };
    if (!privacyData?.settings || !Array.isArray(privacyData.settings)) {
      result.score = 50; result.detail = 'Datenschutz-Einstellungen nicht verfügbar'; return result;
    }
    const settings = privacyData.settings;
    const total = settings.length;
    const privateCount = settings.filter((s: any) => s.isPrivate).length;
    const openCount = total - privateCount;
    const pct = total > 0 ? Math.round((privateCount / total) * 100) : 0;
    result.score = pct;
    result.detail = `${privateCount} von ${total} Einstellungen geschützt (${pct}%)`;
    if (openCount >= 6) {
      result.recommendations.push({ level: 'critical', text: `${openCount} Datenschutz-Einstellungen sind offen — Windows teilt Daten mit Microsoft`, action: 'privacy', actionLabel: 'Datenschutz' });
    } else if (openCount >= 3) {
      result.recommendations.push({ level: 'warning', text: `${openCount} Datenschutz-Einstellungen könnten verbessert werden`, action: 'privacy', actionLabel: 'Datenschutz' });
    } else if (openCount > 0) {
      result.recommendations.push({ level: 'ok', text: `${openCount} Einstellung${openCount !== 1 ? 'en' : ''} offen — insgesamt guter Schutz`, action: 'privacy', actionLabel: 'Datenschutz' });
    }
    return result;
  };

  const analyzeSecurity = (securityData: any): CategoryResult => {
    const result: CategoryResult = { name: 'Sicherheit', icon: 'security', score: 100, detail: '', recommendations: [] };
    if (!securityData || !Array.isArray(securityData)) {
      result.score = 50; result.detail = 'Sicherheits-Check nicht verfügbar'; return result;
    }
    let okCount = 0, warnCount = 0, critCount = 0;
    for (const check of securityData) {
      if (check.status === 'ok') okCount++;
      else if (check.status === 'warning') {
        warnCount++;
        result.recommendations.push({ level: 'warning', text: `${check.name || check.id}: ${check.detail || ''}`, action: 'security-audit', actionLabel: 'Sicherheit' });
      } else if (check.status === 'critical') {
        critCount++;
        result.recommendations.push({ level: 'critical', text: `${check.name || check.id}: ${check.detail || ''}`, action: 'security-audit', actionLabel: 'Sicherheit' });
      }
    }
    const total = okCount + warnCount + critCount;
    if (total > 0) result.score = Math.round(((okCount * 100) + (warnCount * 40)) / total);
    result.detail = `${total} Prüfungen — ${okCount} bestanden, ${warnCount} Warnungen, ${critCount} kritisch`;
    return result;
  };

  const runDiagnosis = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const [drives, diskHealth, privacy, security] = await Promise.allSettled([
        api.getDrives(),
        api.getDiskHealth(),
        api.getPrivacySettings(),
        api.runSecurityAudit(),
      ]);

      const categories = [
        analyzeStorage(drives.status === 'fulfilled' ? drives.value : null),
        analyzeDiskHealth(diskHealth.status === 'fulfilled' ? diskHealth.value : null),
        analyzePrivacy(privacy.status === 'fulfilled' ? privacy.value : null),
        analyzeSecurity(security.status === 'fulfilled' ? security.value : null),
      ];

      const allRecs = categories.flatMap(c => c.recommendations);
      const priorityOrder: Record<string, number> = { critical: 0, warning: 1, ok: 2 };
      allRecs.sort((a, b) => (priorityOrder[a.level] ?? 2) - (priorityOrder[b.level] ?? 2));

      const totalScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);

      setResults({ categories, recommendations: allRecs.slice(0, 8), totalScore, timestamp: Date.now() });
    } catch (e: any) {
      showToast('Diagnose fehlgeschlagen: ' + e.message, 'error');
    } finally {
      setRunning(false);
    }
  }, [running, showToast]);

  const getColor = (score: number) => score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';

  const verdictText = (score: number) => score >= 80 ? 'Guter Zustand' : score >= 50 ? 'Verbesserungsbedarf' : 'Handlungsbedarf';
  const verdictDetail = (score: number) =>
    score >= 80 ? 'Dein PC ist in gutem Zustand. Kleinere Verbesserungen sind möglich.'
    : score >= 50 ? 'Einige Bereiche brauchen Aufmerksamkeit. Sieh dir die Empfehlungen an.'
    : 'Mehrere Probleme gefunden. Die Empfehlungen sollten zeitnah umgesetzt werden.';

  // Initial view (no results yet)
  if (!results) {
    return (
      <div className="health-check">
        <div className="health-header">
          <h2>PC-Diagnose</h2>
          <p className="health-subtitle">Prüft Festplatten, Datenschutz, Sicherheit und Systemzustand in einem Durchlauf.</p>
        </div>
        <div className="health-start-area">
          <button className="health-start-btn" onClick={runDiagnosis} disabled={running}>
            {running ? 'Diagnose läuft...' : 'Diagnose starten'}
          </button>
          <p className="health-hint">Dauert etwa 10–20 Sekunden. Es werden keine Änderungen vorgenommen.</p>
        </div>
        {running && <div className="health-loading">Daten werden gesammelt...</div>}
      </div>
    );
  }

  const { categories, recommendations, totalScore, timestamp } = results;
  const totalColor = getColor(totalScore);
  const timeStr = new Date(timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="health-check">
      <div className="health-header">
        <h2>PC-Diagnose</h2>
        <div className="health-header-actions">
          <span className="health-timestamp">Letzte Prüfung: {timeStr}</span>
          <button className="health-refresh-btn" onClick={() => { setResults(null); runDiagnosis(); }} title="Erneut prüfen">
            &#x21BB;
          </button>
        </div>
      </div>

      <div className="health-score-overview">
        <div className={`health-score-circle health-score-${totalColor}`}>
          <span className="health-score-number">{totalScore}</span>
          <span className="health-score-label">von 100</span>
        </div>
        <div className="health-score-text">
          <span className={`health-verdict health-verdict-${totalColor}`}>{verdictText(totalScore)}</span>
          <span className="health-verdict-detail">{verdictDetail(totalScore)}</span>
        </div>
      </div>

      <div className="health-categories">
        {categories.map(cat => {
          const color = getColor(cat.score);
          return (
            <div key={cat.name} className={`health-category health-cat-${color}`}>
              <div className="health-cat-header">
                <span className="health-cat-name">{cat.name}</span>
              </div>
              <div className="health-cat-bar">
                <div className={`health-cat-bar-fill health-bar-${color}`} style={{ width: cat.score + '%' }} />
              </div>
              <div className="health-cat-score">{cat.score}%</div>
              <div className="health-cat-detail">{cat.detail}</div>
            </div>
          );
        })}
      </div>

      {recommendations.length > 0 && (
        <div className="health-recommendations">
          <h3>Empfehlungen</h3>
          <div className="health-rec-list">
            {recommendations.map((rec, i) => (
              <div key={i} className={`health-rec health-rec-${rec.level}`}>
                <span className="health-rec-text">{rec.text}</span>
                {rec.action && (
                  <button className="health-rec-action" onClick={() => setActiveTab(rec.action!)}>
                    {rec.actionLabel || 'Anzeigen'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

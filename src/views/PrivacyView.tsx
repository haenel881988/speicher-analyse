import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

interface PrivacySetting {
  id: string;
  name: string;
  description: string;
  category: string;
  isPrivate: boolean;
  tier?: string;
  warning?: string;
  explanation?: string;
  riskExplanation?: string;
  impacts?: string[];
}

interface PrivacyRec {
  settingId: string;
  recommendation: 'safe' | 'caution' | 'risky';
  affectedApps: { name: string }[];
  reason?: string;
}

interface TelemetryTask {
  name: string;
  path: string;
  description?: string;
  state: string;
  isTelemetry: boolean;
}

export default function PrivacyView() {
  const { showToast, setActiveTab } = useAppContext();
  const [settings, setSettings] = useState<PrivacySetting[]>([]);
  const [tasks, setTasks] = useState<TelemetryTask[]>([]);
  const [score, setScore] = useState(0);
  const [edition, setEdition] = useState<{ edition: string; isEnterprise: boolean } | null>(null);
  const [sideloading, setSideloading] = useState<{ enabled: boolean } | null>(null);
  const [recommendations, setRecommendations] = useState<Map<string, PrivacyRec>>(new Map());
  const [programCount, setProgramCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [recsError, setRecsError] = useState(false);

  const calcScore = (s: PrivacySetting[]) => {
    if (s.length === 0) return 50;
    return Math.round((s.filter(x => x.isPrivate).length / s.length) * 100);
  };

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const [privacyData, tasksData] = await Promise.all([
        api.getPrivacySettings(),
        api.getScheduledTasksAudit(),
      ]);

      let newSettings: PrivacySetting[] = [];
      if (privacyData?.settings) {
        newSettings = privacyData.settings || [];
        setEdition(privacyData.edition || null);
        setSideloading(privacyData.sideloading || null);
      } else {
        newSettings = Array.isArray(privacyData) ? privacyData : [];
      }

      setSettings(newSettings);
      setTasks((tasksData || []).filter((t: any) => t.isTelemetry));
      setScore(calcScore(newSettings));
      setLoaded(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadRecommendations = useCallback(async () => {
    try {
      const data = await api.getPrivacyRecommendations();
      if (data?.error) {
        setRecsLoaded(true);
        setRecsError(true);
        return;
      }
      const newRecs = new Map<string, PrivacyRec>();
      for (const rec of (data.recommendations || [])) {
        newRecs.set(rec.settingId, rec);
      }
      setRecommendations(newRecs);
      setProgramCount(data.programCount || 0);
      setRecsLoaded(true);
      setRecsError(false);
    } catch {
      setRecsLoaded(true);
      setRecsError(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) scan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loaded && !recsLoaded) loadRecommendations();
  }, [loaded, recsLoaded, loadRecommendations]);

  const applySetting = useCallback(async (settingId: string, isAdvanced: boolean) => {
    if (isAdvanced) {
      const setting = settings.find(s => s.id === settingId);
      const confirmed = await api.showConfirmDialog({
        type: 'warning',
        title: 'Erweiterte Einstellung ändern',
        message: `${setting?.name || 'Einstellung'}\n\n${setting?.warning || 'Diese Einstellung greift auf Systemebene ein und kann Nebeneffekte verursachen.'}\n\nMöchten Sie wirklich fortfahren?`,
        buttons: ['Abbrechen', 'Trotzdem ändern'],
        defaultId: 0, cancelId: 0,
      });
      if (confirmed.response !== 1) return;
    }
    try {
      const result = await api.applyPrivacySetting(settingId);
      if (result.success) {
        showToast('Einstellung angewendet', 'success');
        await scan();
      } else {
        showToast(result.error || 'Fehler', 'error');
      }
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [settings, showToast, scan]);

  const resetSetting = useCallback(async (settingId: string, isAdvanced: boolean) => {
    if (isAdvanced) {
      const setting = settings.find(s => s.id === settingId);
      const confirmed = await api.showConfirmDialog({
        type: 'warning',
        title: 'Erweiterte Einstellung zurücksetzen',
        message: `${setting?.name || 'Einstellung'}\n\nDiese Einstellung wird auf den Windows-Standard zurückgesetzt.\nDein System sendet dann wieder mehr Daten an Microsoft.\n\nFortfahren?`,
        buttons: ['Abbrechen', 'Zurücksetzen'],
        defaultId: 0, cancelId: 0,
      });
      if (confirmed.response !== 1) return;
    }
    try {
      const result = await api.resetPrivacySetting(settingId);
      if (result.success) {
        showToast('Einstellung auf Windows-Standard zurückgesetzt', 'success');
        await scan();
      } else {
        showToast(result.error || 'Fehler', 'error');
      }
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [settings, showToast, scan]);

  const applyAll = useCallback(async () => {
    try {
      const result = await api.applyAllPrivacy();
      let msg = `${result.applied} Standard-Einstellungen optimiert`;
      if (result.skipped > 0) msg += ` (${result.skipped} erweiterte übersprungen)`;
      if (result.failed > 0) msg += `, ${result.failed} fehlgeschlagen`;
      showToast(msg, result.failed > 0 ? 'warning' : 'success');
      await scan();
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [showToast, scan]);

  const resetAll = useCallback(async () => {
    const confirmed = await api.showConfirmDialog({
      type: 'warning',
      title: 'Alle zurücksetzen?',
      message: 'Alle Standard-Einstellungen werden auf Windows-Standardwerte zurückgesetzt.\n\nDein System sendet dann wieder Daten an Microsoft.\n\nFortfahren?',
      buttons: ['Abbrechen', 'Zurücksetzen'],
      defaultId: 0, cancelId: 0,
    });
    if (confirmed.response !== 1) return;
    try {
      const result = await api.resetAllPrivacy();
      let msg = `${result.reset} Einstellungen zurückgesetzt`;
      if (result.skipped > 0) msg += ` (${result.skipped} erweiterte übersprungen)`;
      if (result.failed > 0) msg += `, ${result.failed} fehlgeschlagen`;
      showToast(msg, result.failed > 0 ? 'warning' : 'success');
      await scan();
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [showToast, scan]);

  const fixSideloading = useCallback(async () => {
    try {
      const result = await api.fixSideloading();
      if (result.success) {
        showToast('App-Sideloading wurde erfolgreich aktiviert!', 'success');
        await scan();
      } else if (result.needsAdmin) {
        const confirmed = await api.showConfirmDialog({
          type: 'question',
          title: 'Administratorrechte erforderlich',
          message: 'Zum Reparieren des App-Sideloading werden Administratorrechte benötigt.\n\nDie App wird als Administrator neu gestartet.',
          buttons: ['Abbrechen', 'Als Administrator neu starten'],
          defaultId: 1, cancelId: 0,
        });
        if (confirmed.response === 1) {
          await api.fixSideloadingWithElevation();
        }
      } else {
        showToast(result.error || 'Fehler beim Reparieren', 'error');
      }
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [showToast, scan]);

  const disableTask = useCallback(async (taskPath: string, taskName: string) => {
    try {
      const result = await api.disableScheduledTask(taskPath, taskName);
      if (result.success) {
        showToast('Task deaktiviert', 'success');
        await scan();
      } else {
        showToast(result.error || 'Fehler', 'error');
      }
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [showToast, scan]);

  if (!loaded && !loading) return <div className="loading-state">Datenschutz wird analysiert...</div>;
  if (loading && !loaded) return <div className="loading-spinner" />;

  const scoreClass = score >= 70 ? 'score-good' : score >= 40 ? 'score-warn' : 'score-bad';
  const standardSettings = settings.filter(s => s.tier === 'standard' || !s.tier);
  const advancedSettings = settings.filter(s => s.tier === 'advanced');
  const catNames: Record<string, string> = { telemetrie: 'Telemetrie', werbung: 'Werbung', standort: 'Standort', diagnose: 'Diagnose', aktivitaet: 'Aktivität' };
  const categories = ['telemetrie', 'werbung', 'standort', 'diagnose', 'aktivitaet'];

  const renderSetting = (s: PrivacySetting, isAdvanced: boolean) => {
    const rec = recommendations.get(s.id);
    const recColors: Record<string, string> = { safe: 'risk-safe', caution: 'risk-medium', risky: 'risk-high' };
    const recLabels: Record<string, string> = { safe: 'Deaktivieren empfohlen', caution: 'Vorsicht', risky: 'Nicht deaktivieren' };

    return (
      <div key={s.id} className={`privacy-setting ${isAdvanced ? 'privacy-setting-advanced' : ''}`}>
        <div className="privacy-setting-info">
          <div className="privacy-setting-header">
            <strong>{s.name}</strong>
            <span className={`risk-badge risk-${s.isPrivate ? 'safe' : 'high'}`}>{s.isPrivate ? 'Geschützt' : 'Offen'}</span>
            {!s.isPrivate
              ? <button className={`privacy-btn-small ${isAdvanced ? 'privacy-btn-advanced' : ''}`} onClick={() => applySetting(s.id, isAdvanced)}>{isAdvanced ? 'Ändern...' : 'Schützen'}</button>
              : <button className="privacy-btn-small privacy-btn-reset" onClick={() => resetSetting(s.id, isAdvanced)}>Zurücksetzen</button>
            }
          </div>
          <span className="privacy-setting-desc">{s.description}</span>
          {rec && (
            <div className={`privacy-recommendation privacy-rec-${rec.recommendation}`}>
              <span className={`risk-badge ${recColors[rec.recommendation] || 'risk-medium'}`}>{recLabels[rec.recommendation] || 'Prüfen'}</span>
              {rec.affectedApps.length > 0 && (
                <span className="privacy-rec-apps-inline">
                  {rec.affectedApps.slice(0, 3).map(a => a.name).join(', ')}{rec.affectedApps.length > 3 ? ` +${rec.affectedApps.length - 3}` : ''}
                </span>
              )}
            </div>
          )}
          {(s.explanation || s.riskExplanation || (s.impacts && s.impacts.length > 0)) && (
            <details className="privacy-details">
              <summary>Details</summary>
              <div className="privacy-details-content">
                {s.riskExplanation && <div className="privacy-detail-risk"><strong>Warum ist das ein Risiko?</strong><p>{s.riskExplanation}</p></div>}
                {s.explanation && <p className="privacy-detail-text">{s.explanation}</p>}
                {s.impacts && s.impacts.length > 0 && (
                  <div className="privacy-detail-impacts">
                    <strong>Beim Deaktivieren:</strong>
                    <ul>{s.impacts.map((imp, i) => <li key={i}>{imp}</li>)}</ul>
                  </div>
                )}
                {s.warning && <div className="privacy-setting-warning">{s.warning}</div>}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (groupSettings: PrivacySetting[], isAdvanced: boolean) => {
    return categories.map(cat => {
      const items = groupSettings.filter(s => s.category === cat);
      if (items.length === 0) return null;
      return (
        <div key={cat} className="privacy-category">
          <h4 className="privacy-cat-title">{catNames[cat] || cat}</h4>
          {items.map(s => renderSetting(s, isAdvanced))}
        </div>
      );
    });
  };

  // Rec banner counts
  const safeCount = [...recommendations.values()].filter(r => r.recommendation === 'safe').length;
  const cautionCount = [...recommendations.values()].filter(r => r.recommendation === 'caution').length;
  const riskyCount = [...recommendations.values()].filter(r => r.recommendation === 'risky').length;

  return (
    <div className="privacy-page">
      {/* Sideloading-Warnung */}
      {sideloading && !sideloading.enabled && (
        <div className="privacy-alert privacy-alert-danger">
          <div className="privacy-alert-icon">&#9888;</div>
          <div className="privacy-alert-content">
            <strong>App-Sideloading ist deaktiviert!</strong>
            <p>Die Installation von Apps außerhalb des Microsoft Store (z.B. .exe, .msix) wird blockiert.</p>
            <button className="privacy-btn-fix" onClick={fixSideloading}>Sideloading reparieren</button>
          </div>
        </div>
      )}

      <div className="privacy-header">
        <div className={`privacy-score-ring ${scoreClass}`}>
          <span className="privacy-score-value">{score}</span>
          <span className="privacy-score-label">Datenschutz</span>
        </div>
        <div className="privacy-header-info">
          <h2>Privacy-Dashboard</h2>
          <p>{settings.filter(s => s.isPrivate).length} von {settings.length} Einstellungen sind datenschutzfreundlich.</p>
          {edition && (
            <span className="privacy-edition-badge" title={edition.edition}>
              {edition.edition}{!edition.isEnterprise ? ' — Erweiterte Einstellungen mit Vorsicht verwenden' : ''}
            </span>
          )}

          {/* Rec Banner */}
          {recsLoaded && recommendations.size > 0 && (
            <div className="privacy-rec-banner">
              <strong>App-Analyse:</strong> {programCount} installierte Programme analysiert —{' '}
              <span className="risk-badge risk-safe">&#10003; {safeCount} sicher</span>
              {cautionCount > 0 && <span className="risk-badge risk-medium">&#9888; {cautionCount} Vorsicht</span>}
              {riskyCount > 0 && <span className="risk-badge risk-high">&#9888; {riskyCount} Risiko</span>}
            </div>
          )}
          {!recsLoaded && (
            <div className="privacy-rec-banner privacy-rec-loading">
              <span className="mini-spinner" />
              <strong>App-Analyse läuft...</strong> Deine installierten Programme werden geprüft.
            </div>
          )}
          {recsError && recsLoaded && recommendations.size === 0 && (
            <div className="privacy-rec-banner">
              <strong>App-Analyse:</strong> Konnte nicht durchgeführt werden.{' '}
              <button className="privacy-btn-small" onClick={() => { setRecsLoaded(false); setRecsError(false); }}>Erneut versuchen</button>
            </div>
          )}

          <div className="privacy-header-actions">
            <button className="privacy-btn-apply-all" onClick={applyAll} title="Wendet nur die sicheren Standard-Einstellungen an">Alle Standard optimieren</button>
            <button className="privacy-btn-reset-all" onClick={resetAll} title="Setzt alle Standard-Einstellungen auf Windows-Standardwerte zurück">Alle zurücksetzen</button>
          </div>
        </div>
      </div>

      {/* Standard Settings */}
      <div className="privacy-section">
        <h3 className="privacy-section-title">Standard-Einstellungen ({standardSettings.length})</h3>
        <p className="privacy-section-desc">Sichere Einstellungen auf Benutzerebene — keine Systemauswirkungen.</p>
        {renderGroup(standardSettings, false)}
      </div>

      {/* Advanced Settings */}
      {advancedSettings.length > 0 && (
        <div className="privacy-section privacy-advanced-section">
          <div className="privacy-advanced-header" onClick={() => setAdvancedOpen(!advancedOpen)} style={{ cursor: 'pointer' }}>
            <h3 className="privacy-section-title">
              <span className="privacy-advanced-arrow">{advancedOpen ? '\u25BC' : '\u25B6'}</span>{' '}
              Erweiterte Einstellungen ({advancedSettings.length})
            </h3>
            <span className="risk-badge risk-high">Systemebene</span>
          </div>
          {advancedOpen && (
            <>
              <div className="privacy-advanced-warning">
                <strong>&#9888; Achtung:</strong> Diese Einstellungen greifen auf Systemebene (HKLM) ein und können
                unerwünschte Nebeneffekte verursachen.
                {!edition?.isEnterprise && <><br /><strong>Ihr System ist kein Enterprise/Education — besondere Vorsicht geboten!</strong></>}
              </div>
              {renderGroup(advancedSettings, true)}
            </>
          )}
        </div>
      )}

      {/* Telemetrie-Tasks */}
      {tasks.length > 0 && (
        <div className="privacy-section">
          <h3 className="privacy-section-title">Telemetrie-Tasks ({tasks.length})</h3>
          <table className="privacy-table">
            <thead><tr><th>Task</th><th>Pfad</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={i}>
                  <td title={t.description || ''}>{t.name}</td>
                  <td className="privacy-task-path">{t.path}</td>
                  <td><span className={`risk-badge risk-${t.state === 'Deaktiviert' ? 'safe' : 'high'}`}>{t.state === 'Deaktiviert' ? 'Deaktiviert' : 'Aktiv'}</span></td>
                  <td>{t.state !== 'Deaktiviert' && <button className="privacy-btn-small" onClick={() => disableTask(t.path, t.name)}>Deaktivieren</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="privacy-network-link">
        <button className="privacy-btn-network" onClick={() => setActiveTab('network')}>
          Netzwerk-Aktivität ansehen &rarr;
        </button>
        <span className="privacy-network-hint">Zeigt welche Apps gerade Daten senden und an wen</span>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';
import { isStub } from '../utils/stub';

interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  savingsBytes?: number;
  manualSteps?: string;
  technicalDetail?: string;
  command?: string;
  customAction?: string;
  requiresAdmin?: boolean;
  reversible?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  hardware: 'Hardware-Optimierungen',
  privacy: 'Datenschutz',
  performance: 'Leistung',
};

const CATEGORY_ICONS: Record<string, string> = {
  hardware: '\u2699\uFE0F',
  privacy: '\uD83D\uDD12',
  performance: '\u26A1',
};

export default function OptimizerView() {
  const { showToast } = useAppContext();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [applying, setApplying] = useState<Record<string, string>>({});

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOptimizations();
      setRecommendations(data);
      setScanned(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const applyOptimization = useCallback(async (rec: Recommendation) => {
    const result = await api.showConfirmDialog({
      type: 'warning',
      title: 'Optimierung anwenden',
      message: `Möchtest du folgende Optimierung anwenden?\n\n${rec.title}\n\n${rec.description}${rec.reversible ? '\n\nDiese Änderung kann rückgängig gemacht werden.' : ''}`,
      buttons: ['Abbrechen', 'Anwenden'],
      defaultId: 0,
    });
    if (result.response !== 1) return;

    setApplying(prev => ({ ...prev, [rec.id]: 'applying' }));
    try {
      const res = await api.applyOptimization(rec.id);
      if (isStub(res, 'Optimierung')) {
        setApplying(prev => ({ ...prev, [rec.id]: '' }));
      } else if (res.success) {
        setApplying(prev => ({ ...prev, [rec.id]: 'done' }));
        showToast('Optimierung angewendet', 'success');
      } else if (res.requiresAdmin || (res.error && res.error.includes('Administratorrechte'))) {
        setApplying(prev => ({ ...prev, [rec.id]: '' }));
        const doRestart = await api.showConfirmDialog({
          type: 'info',
          title: 'Administratorrechte erforderlich',
          message: `${res.error}\n\nMöchtest du die App mit Administratorrechten neu starten?`,
          buttons: ['Abbrechen', 'Neu starten'],
          defaultId: 0,
        });
        if (doRestart.response === 1) {
          showToast('Starte als Administrator neu...', 'info');
          await api.restartAsAdmin();
        }
      } else {
        setApplying(prev => ({ ...prev, [rec.id]: '' }));
        showToast('Fehler: ' + res.error, 'error');
      }
    } catch (e: any) {
      setApplying(prev => ({ ...prev, [rec.id]: '' }));
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [showToast]);

  // Group by category
  const grouped: Record<string, Recommendation[]> = { hardware: [], privacy: [], performance: [] };
  for (const rec of recommendations) {
    if (grouped[rec.category]) grouped[rec.category].push(rec);
  }

  return (
    <>
      <div className="tool-toolbar">
        <button className="btn btn-primary" onClick={scan} disabled={loading}>
          {loading ? 'Wird analysiert...' : 'System analysieren'}
        </button>
        <div className="tool-summary">
          {scanned && recommendations.length > 0 && `${recommendations.length} Empfehlungen`}
        </div>
      </div>
      <div className="tool-results">
        {!scanned && !loading && (
          <div className="tool-placeholder">Klicke &quot;System analysieren&quot; um Optimierungsmöglichkeiten zu finden.</div>
        )}
        {loading && <div className="loading-spinner" />}
        {scanned && recommendations.length === 0 && (
          <div className="tool-placeholder" style={{ color: 'var(--success)' }}>
            Keine Optimierungen nötig! Dein System ist bereits optimal konfiguriert.
          </div>
        )}
        {scanned && Object.entries(grouped).map(([cat, items]) => {
          if (items.length === 0) return null;
          return (
            <div className="opt-category" key={cat}>
              <div className="opt-category-header">
                <span>{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}</span>
                <span className="opt-category-count">{items.length} Empfehlungen</span>
              </div>
              {items.map(rec => {
                const impactClass = rec.impact === 'high' ? 'impact-high' : rec.impact === 'medium' ? 'impact-medium' : 'impact-low';
                const impactLabel = rec.impact === 'high' ? 'Hoch' : rec.impact === 'medium' ? 'Mittel' : 'Niedrig';
                const applyState = applying[rec.id] || '';

                return (
                  <div className="opt-item" key={rec.id}>
                    <div className="opt-item-info">
                      <div className="opt-item-title">{rec.title}</div>
                      <div className="opt-item-desc">{rec.description}</div>
                      {rec.savingsBytes ? <div className="opt-item-savings">Einsparung: {formatBytes(rec.savingsBytes)}</div> : null}
                      {rec.manualSteps ? <div className="opt-item-manual">{rec.manualSteps}</div> : null}
                      {rec.technicalDetail ? (
                        <details className="opt-technical">
                          <summary>Technische Details</summary>
                          <pre className="opt-technical-pre">{rec.technicalDetail}</pre>
                        </details>
                      ) : null}
                    </div>
                    <div className="opt-item-actions">
                      <span className={`impact-badge ${impactClass}`}>{impactLabel}</span>
                      {(rec.command || rec.customAction) && (
                        <button
                          className={`btn btn-sm ${applyState === 'done' ? 'btn-success-done' : 'btn-primary'} opt-apply-btn`}
                          disabled={applyState === 'applying' || applyState === 'done'}
                          onClick={() => applyOptimization(rec)}
                          style={applyState === 'done' ? { color: 'var(--success)', borderColor: 'var(--success)' } : undefined}
                        >
                          {applyState === 'applying' ? '...' : applyState === 'done' ? '\u2713 Angewendet' : 'Anwenden'}
                        </button>
                      )}
                      {rec.requiresAdmin && <span className="badge-admin" title="Erfordert Administratorrechte">Admin</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

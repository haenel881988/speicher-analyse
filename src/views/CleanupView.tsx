import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber } from '../utils/format';

export default function CleanupView() {
  const { currentScanId, showToast } = useAppContext();
  const [categories, setCategories] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scan = useCallback(async () => {
    if (!currentScanId) return;
    setLoading(true);
    try {
      const data = await api.scanCleanupCategories(currentScanId);
      setCategories(data);
      setScanned(true);
      setSelected(new Set());
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentScanId, showToast]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(categories.map(c => c.id)) : new Set());
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cleanSelected = useCallback(async () => {
    if (selected.size === 0) { showToast('Keine Kategorien ausgewählt', 'info'); return; }

    const totalSize = [...selected].reduce((sum, id) => {
      const cat = categories.find(c => c.id === id);
      return sum + (cat ? cat.totalSize : 0);
    }, 0);

    const result = await api.showConfirmDialog({
      type: 'warning', title: 'Bereinigung starten',
      message: `${selected.size} Kategorie(n) bereinigen?\n\nGeschätzte Ersparnis: ${formatBytes(totalSize)}\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`,
      buttons: ['Abbrechen', 'Bereinigen'], defaultId: 0,
    });
    if (result.response !== 1) return;

    let totalDeleted = 0, totalErrors = 0;
    for (const id of selected) {
      const cat = categories.find(c => c.id === id);
      const paths = cat ? cat.paths.map((p: any) => p.path) : [];
      try {
        const res = await api.cleanCategory(id, paths);
        if (res.success) { totalDeleted += res.deletedCount; totalErrors += res.errors.length; }
      } catch { totalErrors++; }
    }

    showToast(
      totalErrors > 0
        ? `${totalDeleted} gelöscht, ${totalErrors} Fehler`
        : `Bereinigung abgeschlossen: ${totalDeleted} Elemente gelöscht`,
      totalErrors > 0 ? 'error' : 'success'
    );
    scan();
  }, [selected, categories, showToast, scan]);

  const selectedSize = [...selected].reduce((sum, id) => {
    const cat = categories.find(c => c.id === id);
    return sum + (cat ? cat.totalSize : 0);
  }, 0);
  const totalSize = categories.reduce((sum, c) => sum + c.totalSize, 0);

  return (
    <>
      <div className="tool-toolbar">
        <button className="btn btn-primary" onClick={scan} disabled={loading || !currentScanId}>
          {loading ? 'Wird gescannt...' : 'Kategorien scannen'}
        </button>
        <div className="tool-summary">
          {scanned && `${categories.length} Kategorien \u00B7 ${formatBytes(totalSize)} bereinigbar`}
        </div>
      </div>
      {scanned && categories.length > 0 && (
        <div className="tool-actions" style={{ display: 'flex' }}>
          <label className="check-all-label">
            <input type="checkbox" checked={selected.size === categories.length} onChange={e => toggleAll(e.target.checked)} /> Alle auswählen
          </label>
          <button className="btn btn-danger" onClick={cleanSelected}>Ausgewählte bereinigen</button>
          <span className="selected-info">
            {selected.size > 0 && `${selected.size} Kategorien (${formatBytes(selectedSize)})`}
          </span>
        </div>
      )}
      <div className="tool-results">
        {!scanned && !loading && <div className="tool-placeholder">Klicke &quot;Kategorien scannen&quot; um bereinigbare Dateien zu finden</div>}
        {loading && <div className="loading-spinner" />}
        {scanned && categories.length === 0 && <div className="tool-placeholder">Keine bereinigbaren Dateien gefunden</div>}
        {scanned && categories.map(cat => (
          <div className="cleanup-card" key={cat.id}>
            <div className="cleanup-card-main">
              <input type="checkbox" className="cleanup-check" checked={selected.has(cat.id)} onChange={() => toggleSelect(cat.id)} />
              <span className="cleanup-icon">{cat.icon}</span>
              <div className="cleanup-info">
                <div className="cleanup-name">
                  {cat.name} {cat.requiresAdmin && <span className="badge-admin">Admin</span>}
                </div>
                <div className="cleanup-desc">{cat.description}</div>
              </div>
              <div className="cleanup-size">{formatBytes(cat.totalSize)}</div>
              <div className="cleanup-count">{formatNumber(cat.fileCount)} Dateien</div>
              {cat.paths.length > 0 && (
                <button className="btn-expand cleanup-expand" onClick={() => toggleExpand(cat.id)}>
                  {expanded.has(cat.id) ? '\u25BC' : '\u25B6'}
                </button>
              )}
            </div>
            {expanded.has(cat.id) && (
              <div className="cleanup-details" style={{ display: 'block' }}>
                {cat.paths.map((p: any, i: number) => (
                  <div className="cleanup-path-row" key={i}>
                    <span className="cleanup-path">{p.path}</span>
                    <span className="cleanup-path-size">{formatBytes(p.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, parseSize } from '../utils/format';
import { useTauriEvent } from '../hooks/useTauriEvent';

interface DupFile { name: string; path: string; mtime: number; }
interface DupGroup { size: number; files: DupFile[]; }
interface DupResults { groups: DupGroup[]; totalGroups: number; totalDuplicates: number; totalSaveable: number; }
interface DupProgress { phase: string; filesHashed: number; totalToHash: number; eta: number; currentFile: string; }

export default function DuplicatesView() {
  const { currentScanId, showToast } = useAppContext();
  const [results, setResults] = useState<DupResults | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<DupProgress | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [minSize, setMinSize] = useState('1KB');
  const [maxSize, setMaxSize] = useState('2GB');

  // Event listeners for duplicate scan
  useTauriEvent<DupProgress>('duplicate-progress', useCallback((data) => {
    setProgress(data);
  }, []));

  useTauriEvent<DupResults>('duplicate-complete', useCallback((data) => {
    setScanning(false);
    setProgress(null);
    setResults(data);
    setChecked(new Set());
  }, []));

  useTauriEvent<{ error: string }>('duplicate-error', useCallback((data) => {
    setScanning(false);
    setProgress(null);
    showToast(data.error || 'Duplikat-Scan fehlgeschlagen', 'error');
  }, [showToast]));

  const startScan = useCallback(async () => {
    if (!currentScanId || scanning) return;
    setScanning(true);
    setResults(null);
    setProgress(null);
    setChecked(new Set());
    try {
      await api.startDuplicateScan(currentScanId, { minSize: parseSize(minSize), maxSize: parseSize(maxSize) });
    } catch (e: any) {
      setScanning(false);
      showToast('Duplikat-Scan Fehler: ' + e.message, 'error');
    }
  }, [currentScanId, scanning, minSize, maxSize, showToast]);

  const cancelScan = useCallback(() => {
    if (currentScanId) api.cancelDuplicateScan(currentScanId);
    setScanning(false);
    setProgress(null);
  }, [currentScanId]);

  const toggleCheck = (path: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const selectAllDuplicates = useCallback(() => {
    if (!results) return;
    const newChecked = new Set<string>();
    for (const group of results.groups) {
      let newestIdx = 0, newestTime = 0;
      group.files.forEach((f, fi) => {
        if (f.mtime > newestTime) { newestTime = f.mtime; newestIdx = fi; }
      });
      group.files.forEach((f, fi) => {
        if (fi !== newestIdx) newChecked.add(f.path);
      });
    }
    setChecked(newChecked);
  }, [results]);

  const deleteSelected = useCallback(async () => {
    if (checked.size === 0) { showToast('Keine Dateien ausgewählt', 'info'); return; }
    const paths = [...checked];
    const sampleSize = results?.groups[0]?.size || 0;
    const result = await api.showConfirmDialog({
      type: 'warning', title: 'Duplikate löschen',
      message: `${paths.length} Duplikat(e) in den Papierkorb verschieben?`,
      buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (result.response !== 1) return;
    try {
      const res = await api.deleteToTrash(paths);
      if (res.success) {
        showToast(`${paths.length} Duplikat(e) in den Papierkorb verschoben`, 'success');
      } else {
        showToast('Fehler beim Löschen: ' + (res.error || 'Unbekannt'), 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [checked, results, showToast]);

  const checkedSize = [...checked].reduce((sum, path) => {
    if (!results) return sum;
    for (const g of results.groups) {
      if (g.files.some(f => f.path === path)) return sum + g.size;
    }
    return sum;
  }, 0);

  const progressPct = progress && progress.totalToHash > 0
    ? (progress.filesHashed / progress.totalToHash * 100) : 0;

  const hasScan = !!currentScanId;

  return (
    <>
      <div className="tool-toolbar">
        {!scanning ? (
          <button className="btn btn-primary" onClick={startScan} disabled={!hasScan}>Duplikat-Scan starten</button>
        ) : (
          <button className="btn" onClick={cancelScan}>Abbrechen</button>
        )}
        <div className="tool-filters" style={{ display: 'inline-flex', gap: 8, marginLeft: 12 }}>
          <label>Min: <input type="text" className="filter-input" value={minSize} onChange={e => setMinSize(e.target.value)} style={{ width: 70 }} disabled={!hasScan} /></label>
          <label>Max: <input type="text" className="filter-input" value={maxSize} onChange={e => setMaxSize(e.target.value)} style={{ width: 70 }} disabled={!hasScan} /></label>
        </div>
        <div className="tool-summary">
          {results && (results.groups.length > 0
            ? `${results.totalGroups} Gruppen \u00B7 ${results.totalDuplicates} Duplikate \u00B7 ${formatBytes(results.totalSaveable)} einsparbar`
            : 'Keine Duplikate gefunden!')}
        </div>
      </div>
      {scanning && progress && (
        <div className="dup-progress">
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: progressPct + '%' }} />
          </div>
          <div className="progress-text">
            {progress.phase === 'partial-hash' ? 'Vorab-Prüfung' : 'Vollständiger Hash'}: {progress.filesHashed}/{progress.totalToHash}
            {progress.eta > 0 ? ` \u00B7 ca. ${progress.eta}s` : ''} - {progress.currentFile}
          </div>
        </div>
      )}
      {results && results.groups.length > 0 && (
        <div className="tool-actions" style={{ display: 'flex' }}>
          <button className="btn btn-primary" onClick={selectAllDuplicates}>Alle Duplikate auswählen (Neueste behalten)</button>
          <button className="btn btn-danger" onClick={deleteSelected}>Ausgewählte löschen</button>
          <span className="selected-info">
            {checked.size > 0 && `${checked.size} ausgewählt (${formatBytes(checkedSize)})`}
          </span>
        </div>
      )}
      <div className="tool-results">
        {!results && !scanning && (
          <div className="tool-placeholder">
            {hasScan ? 'Klicke "Duplikat-Scan starten" um doppelte Dateien zu finden' : 'Bitte zuerst ein Laufwerk scannen, bevor Duplikate gesucht werden können'}
          </div>
        )}
        {scanning && !progress && <div className="loading-spinner" />}
        {results && results.groups.length === 0 && <div className="tool-placeholder">Keine doppelten Dateien gefunden</div>}
        {results && results.groups.map((group, gi) => (
          <div className="dup-group" key={gi}>
            <div className="dup-group-header">
              <span className="dup-group-info">{group.files.length} identische Dateien \u00B7 je {formatBytes(group.size)}</span>
              <span className="dup-group-save">Einsparbar: {formatBytes(group.size * (group.files.length - 1))}</span>
            </div>
            <div className="dup-group-files">
              {group.files.map((f, fi) => (
                <div className="dup-file-row" key={fi} onDoubleClick={() => api.openFile(f.path)}>
                  <input
                    type="checkbox"
                    className="dup-check"
                    checked={checked.has(f.path)}
                    onChange={() => toggleCheck(f.path)}
                  />
                  <span className="dup-file-name" title={f.path}>{f.name}</span>
                  <span className="dup-file-path">{f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/'))}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

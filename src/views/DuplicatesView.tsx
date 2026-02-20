import { useState, useCallback, useEffect, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, parseSize } from '../utils/format';
import { useTauriEvent } from '../hooks/useTauriEvent';

interface DupFile { name: string; path: string; mtime: number; }
interface DupGroup { size: number; files: DupFile[]; }
interface DupResults { groups: DupGroup[]; totalGroups: number; totalDuplicates: number; totalSaveable: number; }
interface DupProgress { phase: string; filesHashed: number; totalToHash: number; eta: number; currentFile: string; }

interface ContextMenu { x: number; y: number; path: string; }

export default function DuplicatesView() {
  const { currentScanId, showToast } = useAppContext();
  const [results, setResults] = useState<DupResults | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<DupProgress | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [minSize, setMinSize] = useState('1KB');
  const [maxSize, setMaxSize] = useState('2GB');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

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
  }, [checked, showToast]);

  const checkedSize = useMemo(() => {
    if (!results || checked.size === 0) return 0;
    const pathSizeMap = new Map<string, number>();
    for (const g of results.groups) {
      for (const f of g.files) pathSizeMap.set(f.path, g.size);
    }
    let sum = 0;
    for (const path of checked) sum += pathSizeMap.get(path) || 0;
    return sum;
  }, [checked, results]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!results || results.groups.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        selectAllDuplicates();
      } else if (e.key === 'Delete' && checked.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [results, checked, selectAllDuplicates, deleteSelected]);

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (!checked.has(path)) {
      setChecked(prev => { const next = new Set(prev); next.add(path); return next; });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  };

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
          <button className="btn btn-primary" onClick={selectAllDuplicates} title="Strg+A">Alle Duplikate auswählen (Neueste behalten)</button>
          <button className="btn btn-danger" onClick={deleteSelected} disabled={checked.size === 0} title="Entf">Ausgewählte löschen</button>
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
                <div
                  className={`dup-file-row ${checked.has(f.path) ? 'selected' : ''}`}
                  key={fi}
                  onDoubleClick={() => api.openFile(f.path)}
                  onContextMenu={(e) => handleContextMenu(e, f.path)}
                >
                  <input
                    type="checkbox"
                    className="dup-check"
                    checked={checked.has(f.path)}
                    onChange={() => toggleCheck(f.path)}
                    title="Datei auswählen"
                  />
                  <span className="dup-file-name" title={f.path}>{f.name}</span>
                  <span className="dup-file-path">{f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/'))}</span>
                  <button className="btn-icon dup-file-explorer" onClick={(e) => { e.stopPropagation(); api.showInExplorer(f.path); }} title="Im Explorer anzeigen">
                    {'\uD83D\uDCC2'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}>
          <button className="context-menu-item" onClick={() => { api.openFile(contextMenu.path); setContextMenu(null); }}>Öffnen</button>
          <button className="context-menu-item" onClick={() => { api.showInExplorer(contextMenu.path); setContextMenu(null); }}>Im Explorer anzeigen</button>
          <div className="context-menu-separator" />
          <button className="context-menu-item context-menu-danger" onClick={() => { setContextMenu(null); deleteSelected(); }}>
            {checked.size > 1 ? `${checked.size} Dateien löschen` : 'Löschen'}
          </button>
        </div>
      )}
    </>
  );
}

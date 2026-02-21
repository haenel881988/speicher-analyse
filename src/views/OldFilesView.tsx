import { useState, useCallback, useMemo, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber, parseSize } from '../utils/format';

interface OldFile {
  name: string;
  path: string;
  size: number;
  ageDays: number;
  context?: string;
  contextIcon?: string;
}

type SortCol = 'name' | 'context' | 'size' | 'age';

interface ContextMenu { x: number; y: number; path: string; }

export default function OldFilesView() {
  const { currentScanId, showToast } = useAppContext();
  const [files, setFiles] = useState<OldFile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [threshold, setThreshold] = useState('365');
  const [minSize, setMinSize] = useState('1MB');
  const [sortCol, setSortCol] = useState<SortCol>('size');
  const [sortAsc, setSortAsc] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const search = useCallback(async () => {
    if (!currentScanId) return;
    setLoading(true);
    try {
      const data = await api.getOldFiles(currentScanId, parseInt(threshold), parseSize(minSize));
      setFiles(data.files || []);
      setTotalCount(data.totalCount || 0);
      setTotalSize(data.totalSize || 0);
      setScanned(true);
      setSelected(new Set());
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentScanId, threshold, minSize, showToast]);

  const toggleSelect = (path: string, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
    } else if (e && e.shiftKey && selected.size > 0) {
      const lastSelected = [...selected].pop()!;
      const startIdx = sortedFiles.findIndex(f => f.path === lastSelected);
      const endIdx = sortedFiles.findIndex(f => f.path === path);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const newSel = new Set(selected);
        for (let i = lo; i <= hi; i++) newSel.add(sortedFiles[i].path);
        setSelected(newSel);
      }
    } else {
      // Normaler Klick: Einzelauswahl (ersetzt vorherige Auswahl)
      setSelected(new Set([path]));
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(sortedFiles.map(f => f.path)) : new Set());
  };

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    const paths = [...selected];
    const result = await api.showConfirmDialog({
      type: 'warning', title: 'Dateien löschen',
      message: `${paths.length} alte Datei(en) in den Papierkorb verschieben?`,
      buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (result.response !== 1) return;
    try {
      const res = await api.deleteToTrash(paths);
      if (res.success) {
        showToast(`${paths.length} Datei(en) in den Papierkorb verschoben`, 'success');
      } else {
        showToast('Fehler beim Löschen: ' + (res.error || 'Unbekannt'), 'error');
      }
      search();
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [selected, showToast, search]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sortIcon = (col: SortCol) => sortCol === col ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let va: any, vb: any;
      switch (sortCol) {
        case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case 'context': va = (a.context || '').toLowerCase(); vb = (b.context || '').toLowerCase(); break;
        case 'size': va = a.size; vb = b.size; break;
        case 'age': va = a.ageDays; vb = b.ageDays; break;
        default: va = a.size; vb = b.size;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [files, sortCol, sortAsc]);

  const formatAge = (days: number) => {
    if (days >= 365) return `${Math.floor(days / 365)}J ${Math.floor((days % 365) / 30)}M`;
    if (days >= 30) return `${Math.floor(days / 30)}M ${days % 30}T`;
    return `${days}T`;
  };

  const selectedSize = [...selected].reduce((sum, path) => {
    const f = files.find(ff => ff.path === path);
    return sum + (f ? f.size : 0);
  }, 0);

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (!selected.has(path)) {
      setSelected(new Set([path]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!scanned || files.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        toggleAll(true);
      } else if (e.key === 'Delete' && selected.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [scanned, files, selected, deleteSelected]);

  return (
    <>
      <div className="tool-toolbar">
        <div className="tool-filters">
          <label>Älter als:
            <select value={threshold} onChange={e => setThreshold(e.target.value)}>
              <option value="30">30 Tage</option>
              <option value="90">90 Tage</option>
              <option value="180">180 Tage</option>
              <option value="365">1 Jahr</option>
              <option value="730">2 Jahre</option>
              <option value="1825">5 Jahre</option>
            </select>
          </label>
          <label>Min. Größe:
            <input type="text" className="filter-input" placeholder="z.B. 1MB" value={minSize} onChange={e => setMinSize(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={search} disabled={loading || !currentScanId}>Suchen</button>
        </div>
        <div className="tool-summary">
          {scanned && `${formatNumber(totalCount)} Dateien \u00B7 ${formatBytes(totalSize)} gesamt`}
        </div>
      </div>
      {scanned && files.length > 0 && (
        <div className="tool-actions" style={{ display: 'flex' }}>
          <label className="check-all-label">
            <input type="checkbox" checked={selected.size === sortedFiles.length && sortedFiles.length > 0} onChange={e => toggleAll(e.target.checked)} /> Alle auswählen
          </label>
          <button className="btn btn-danger" onClick={deleteSelected} disabled={selected.size === 0} title="Entf">Ausgewählte löschen</button>
          {selected.size === 1 && (
            <button className="btn" onClick={() => api.showInExplorer([...selected][0])}>Im Explorer anzeigen</button>
          )}
          <span className="selected-info">
            {selected.size > 0 && `${selected.size} ausgewählt (${formatBytes(selectedSize)})`}
          </span>
        </div>
      )}
      <div className="tool-results">
        {!scanned && !loading && <div className="tool-placeholder">Klicke &quot;Suchen&quot; um alte Dateien zu finden</div>}
        {loading && <div className="loading-spinner" />}
        {scanned && files.length === 0 && <div className="tool-placeholder">Keine alten Dateien gefunden</div>}
        {scanned && files.length > 0 && (
          <table className="tool-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th className="sortable" onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Datei{sortIcon('name')}</th>
                <th className="sortable" onClick={() => handleSort('context')} style={{ cursor: 'pointer' }}>Kontext{sortIcon('context')}</th>
                <th>Pfad</th>
                <th className="sortable" onClick={() => handleSort('size')} style={{ cursor: 'pointer', textAlign: 'right' }}>Größe{sortIcon('size')}</th>
                <th className="sortable" onClick={() => handleSort('age')} style={{ cursor: 'pointer', textAlign: 'right' }}>Alter{sortIcon('age')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map(f => {
                const isSelected = selected.has(f.path);
                return (
                  <tr
                    key={f.path}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => toggleSelect(f.path, e)}
                    onDoubleClick={() => api.openFile(f.path)}
                    onContextMenu={(e) => handleContextMenu(e, f.path)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(f.path)} title="Datei auswählen" />
                    </td>
                    <td className="name-col" title={f.name}>{f.name}</td>
                    <td className="context-col" title={f.context || ''}>{f.context || 'Sonstige'}</td>
                    <td className="path-col" title={f.path}>{f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/'))}</td>
                    <td className="size-col">{formatBytes(f.size)}</td>
                    <td className="age-col">{formatAge(f.ageDays)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}>
          <button className="context-menu-item" onClick={() => { api.openFile(contextMenu.path); setContextMenu(null); }}>Öffnen</button>
          <button className="context-menu-item" onClick={() => { api.showInExplorer(contextMenu.path); setContextMenu(null); }}>Im Explorer anzeigen</button>
          <div className="context-menu-separator" />
          <button className="context-menu-item context-menu-danger" onClick={() => { setContextMenu(null); deleteSelected(); }}>
            {selected.size > 1 ? `${selected.size} Dateien löschen` : 'Löschen'}
          </button>
        </div>
      )}
    </>
  );
}

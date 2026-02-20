import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber } from '../utils/format';
import { getCategoryColor, getCategoryForExt } from '../utils/categories';

interface TopFile {
  name: string;
  path: string;
  size: number;
  ext: string;
}

type SortCol = 'name' | 'size' | 'ext';

interface ContextMenu {
  x: number;
  y: number;
  file: TopFile;
}

export default function TopFilesView() {
  const { currentScanId, showToast } = useAppContext();
  const [files, setFiles] = useState<TopFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [count, setCount] = useState('100');
  const [sortCol, setSortCol] = useState<SortCol>('size');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!currentScanId) return;
    setLoading(true);
    try {
      const data = await api.getTopFiles(currentScanId, parseInt(count));
      setFiles(data || []);
      setLoaded(true);
      setSelected(new Set());
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentScanId, count, showToast]);

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
        case 'ext': va = (a.ext || '').toLowerCase(); vb = (b.ext || '').toLowerCase(); break;
        case 'size': va = a.size; vb = b.size; break;
        default: va = a.size; vb = b.size;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [files, sortCol, sortAsc]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const selectedSize = useMemo(() => {
    let sum = 0;
    for (const path of selected) {
      const f = files.find(ff => ff.path === path);
      if (f) sum += f.size;
    }
    return sum;
  }, [selected, files]);

  // Selection
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
      setSelected(new Set([path]));
    }
  };

  const selectAll = () => setSelected(new Set(sortedFiles.map(f => f.path)));

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, file: TopFile) => {
    e.preventDefault();
    if (!selected.has(file.path)) {
      setSelected(new Set([file.path]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!loaded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Delete' && selected.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loaded, selected, sortedFiles]);

  // Actions
  const showInExplorer = useCallback((path: string) => {
    api.showInExplorer(path);
  }, []);

  const openFile = useCallback((path: string) => {
    api.openFile(path);
  }, []);

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    const paths = [...selected];
    const result = await api.showConfirmDialog({
      type: 'warning', title: 'Dateien löschen',
      message: `${paths.length} Datei(en) (${formatBytes(selectedSize)}) in den Papierkorb verschieben?`,
      buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (result.response !== 1) return;
    try {
      const res = await api.deleteToTrash(paths);
      if (res.success) {
        showToast(`${paths.length} Datei(en) in den Papierkorb verschoben`, 'success');
        setFiles(prev => prev.filter(f => !selected.has(f.path)));
        setSelected(new Set());
      } else {
        showToast('Fehler beim Löschen: ' + (res.error || 'Unbekannt'), 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [selected, selectedSize, showToast]);

  return (
    <div ref={containerRef}>
      <div className="tool-toolbar">
        <button className="btn btn-primary" onClick={load} disabled={loading || !currentScanId}>
          {loading ? 'Wird geladen...' : 'Größte Dateien laden'}
        </button>
        <label style={{ marginLeft: 12 }}>
          Anzahl:
          <select className="filter-input" value={count} onChange={e => setCount(e.target.value)} style={{ marginLeft: 4 }}>
            <option value="50">Top 50</option>
            <option value="100">Top 100</option>
            <option value="250">Top 250</option>
            <option value="500">Top 500</option>
          </select>
        </label>
        <div className="tool-summary">
          {loaded && `${formatNumber(files.length)} Dateien \u00B7 ${formatBytes(totalSize)} gesamt`}
        </div>
      </div>
      {loaded && files.length > 0 && (
        <div className="tool-actions" style={{ display: 'flex' }}>
          <label className="check-all-label">
            <input type="checkbox" checked={selected.size === sortedFiles.length && sortedFiles.length > 0} onChange={e => e.target.checked ? selectAll() : setSelected(new Set())} /> Alle auswählen
          </label>
          <button className="btn btn-danger" onClick={deleteSelected} disabled={selected.size === 0}>Ausgewählte löschen</button>
          {selected.size === 1 && (
            <button className="btn" onClick={() => showInExplorer([...selected][0])}>Im Explorer anzeigen</button>
          )}
          <span className="selected-info">
            {selected.size > 0 && `${selected.size} ausgewählt (${formatBytes(selectedSize)})`}
          </span>
        </div>
      )}
      <div className="tool-results">
        {!loaded && !loading && <div className="tool-placeholder">Klicke &quot;Größte Dateien laden&quot; um die größten Dateien anzuzeigen</div>}
        {loading && <div className="loading-spinner" />}
        {loaded && files.length === 0 && <div className="tool-placeholder">Keine Dateien gefunden</div>}
        {loaded && files.length > 0 && (
          <table className="tool-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ width: 40 }}>#</th>
                <th className="sortable" onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Datei{sortIcon('name')}</th>
                <th>Pfad</th>
                <th className="sortable" onClick={() => handleSort('ext')} style={{ cursor: 'pointer' }}>Typ{sortIcon('ext')}</th>
                <th className="sortable" onClick={() => handleSort('size')} style={{ cursor: 'pointer', textAlign: 'right' }}>Größe{sortIcon('size')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((f, i) => {
                const category = getCategoryForExt(f.ext);
                const color = getCategoryColor(category);
                const isSelected = selected.has(f.path);
                return (
                  <tr
                    key={f.path}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => toggleSelect(f.path, e)}
                    onDoubleClick={() => openFile(f.path)}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(f.path)} title="Datei auswählen" />
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td className="name-col" title={f.name}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
                      {f.name}
                    </td>
                    <td className="path-col" title={f.path}>{f.path.substring(0, f.path.lastIndexOf('\\') || f.path.lastIndexOf('/'))}</td>
                    <td>{f.ext || '-'}</td>
                    <td className="size-col">{formatBytes(f.size)}</td>
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
          <button className="context-menu-item" onClick={() => { openFile(contextMenu.file.path); setContextMenu(null); }}>Öffnen</button>
          <button className="context-menu-item" onClick={() => { showInExplorer(contextMenu.file.path); setContextMenu(null); }}>Im Explorer anzeigen</button>
          <div className="context-menu-separator" />
          <button className="context-menu-item context-menu-danger" onClick={() => { setContextMenu(null); deleteSelected(); }}>
            {selected.size > 1 ? `${selected.size} Dateien löschen` : 'Löschen'}
          </button>
        </div>
      )}
    </div>
  );
}

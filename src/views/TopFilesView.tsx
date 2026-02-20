import { useState, useCallback, useMemo } from 'react';
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

export default function TopFilesView() {
  const { currentScanId, showToast } = useAppContext();
  const [files, setFiles] = useState<TopFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [count, setCount] = useState('100');
  const [sortCol, setSortCol] = useState<SortCol>('size');
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async () => {
    if (!currentScanId) return;
    setLoading(true);
    try {
      const data = await api.getTopFiles(currentScanId, parseInt(count));
      setFiles(data || []);
      setLoaded(true);
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

  return (
    <>
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
      <div className="tool-results">
        {!loaded && !loading && <div className="tool-placeholder">Klicke &quot;Größte Dateien laden&quot; um die größten Dateien anzuzeigen</div>}
        {loading && <div className="loading-spinner" />}
        {loaded && files.length === 0 && <div className="tool-placeholder">Keine Dateien gefunden</div>}
        {loaded && files.length > 0 && (
          <table className="tool-table">
            <thead>
              <tr>
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
                return (
                  <tr key={f.path} style={{ cursor: 'pointer' }} onDoubleClick={() => api.openFile(f.path)}>
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
    </>
  );
}

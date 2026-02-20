import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber } from '../utils/format';
import { getCategoryColor, getCategoryClass } from '../utils/categories';

interface DetailContextMenu { x: number; y: number; path: string; }

interface FileTypeItem {
  extension: string;
  category: string;
  count: number;
  total_size: number;
}

type SortCol = 'extension' | 'category' | 'count' | 'total_size';

export default function ChartsView() {
  const { currentScanId, showToast } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [data, setData] = useState<FileTypeItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('total_size');
  const [sortAsc, setSortAsc] = useState(false);
  const [detailFiles, setDetailFiles] = useState<any[] | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailCtx, setDetailCtx] = useState<DetailContextMenu | null>(null);

  // Close detail context menu on click
  useEffect(() => {
    if (!detailCtx) return;
    const handler = () => setDetailCtx(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [detailCtx]);

  const loadData = useCallback(async () => {
    if (!currentScanId) return;
    try {
      const result = await api.getFileTypes(currentScanId);
      setData(result || []);
      setLoaded(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [currentScanId, showToast]);

  // Auto-load when scanId changes
  useEffect(() => {
    if (currentScanId) loadData();
  }, [currentScanId, loadData]);

  // Render Chart.js chart
  useEffect(() => {
    if (!loaded || data.length === 0 || !canvasRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Aggregate by category
    const categoryMap = new Map<string, { count: number; total_size: number }>();
    for (const item of data) {
      const existing = categoryMap.get(item.category) || { count: 0, total_size: 0 };
      existing.count += item.count;
      existing.total_size += item.total_size;
      categoryMap.set(item.category, existing);
    }

    const categories = [...categoryMap.entries()].sort((a, b) => b[1].total_size - a[1].total_size);
    const labels = categories.map(c => c[0]);
    const chartData = categories.map(c => c[1].total_size);
    const colors = labels.map(l => getCategoryColor(l));
    const isDark = document.documentElement.dataset.theme !== 'light';
    const textColor = isDark ? '#e8e8ed' : '#1a1d27';

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: chartData, backgroundColor: colors, borderColor: isDark ? '#0f1117' : '#ffffff', borderWidth: 2, hoverOffset: 8 }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
                const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : '0';
                const cat = categoryMap.get(ctx.label);
                return ` ${ctx.label}: ${formatBytes(ctx.raw)} (${pct}%) - ${formatNumber(cat?.count || 0)} Dateien`;
              },
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [loaded, data]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sortedData = useMemo(() => [...data].sort((a: any, b: any) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  }), [data, sortCol, sortAsc]);

  const totalSize = useMemo(() => data.reduce((sum, item) => sum + item.total_size, 0), [data]);

  const showExtensionFiles = useCallback(async (ext: string) => {
    if (!currentScanId) return;
    setDetailTitle(`Dateien: ${ext}`);
    try {
      const files = await api.getFilesByExtension(currentScanId, ext, 500);
      setDetailFiles(files);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [currentScanId, showToast]);

  if (detailFiles) {
    return (
      <>
        <div className="tool-toolbar">
          <button className="btn" onClick={() => setDetailFiles(null)}>&larr; Zurück</button>
          <span className="tool-summary">{detailTitle} ({detailFiles.length} Dateien)</span>
        </div>
        <div className="tool-results">
          <table className="tool-table">
            <thead><tr><th>#</th><th>Name</th><th>Pfad</th><th style={{ textAlign: 'right' }}>Größe</th></tr></thead>
            <tbody>
              {detailFiles.map((f, i) => (
                <tr
                  key={f.path}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => api.openFile(f.path)}
                  onContextMenu={(e) => { e.preventDefault(); setDetailCtx({ x: e.clientX, y: e.clientY, path: f.path }); }}
                >
                  <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td className="name-col" title={f.name}>{f.name}</td>
                  <td className="path-col" title={f.path}>{f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')))}</td>
                  <td className="size-col">{formatBytes(f.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detailCtx && (
          <div className="context-menu" style={{ position: 'fixed', left: detailCtx.x, top: detailCtx.y, zIndex: 9999 }}>
            <button className="context-menu-item" onClick={() => { api.openFile(detailCtx.path); setDetailCtx(null); }}>Öffnen</button>
            <button className="context-menu-item" onClick={() => { api.showInExplorer(detailCtx.path); setDetailCtx(null); }}>Im Explorer anzeigen</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {!loaded && !currentScanId && <div className="tool-placeholder">Bitte zuerst ein Laufwerk scannen</div>}
      {loaded && (
        <div id="filetype-overview" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', gap: 24, padding: 16 }}>
            <div style={{ width: 300, flexShrink: 0 }}>
              <canvas ref={canvasRef} />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className="tool-table">
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('extension')}>Endung</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('category')}>Kategorie</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('count')}>Anzahl</th>
                    <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('total_size')}>Größe</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map(item => {
                    const pct = totalSize > 0 ? (item.total_size / totalSize * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={item.extension} style={{ cursor: 'pointer' }} onClick={() => showExtensionFiles(item.extension)}>
                        <td className="ext-col">{item.extension}</td>
                        <td><span className={`category-badge ${getCategoryClass(item.category)}`}>{item.category}</span></td>
                        <td className="count-col">{formatNumber(item.count)}</td>
                        <td className="size-col">{formatBytes(item.total_size)}</td>
                        <td className="pct-col">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

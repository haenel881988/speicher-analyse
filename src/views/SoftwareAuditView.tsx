import { useState, useCallback, useEffect, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

interface Program {
  name: string;
  publisher: string;
  version: string;
  estimatedSize: number;
  installLocation: string;
  registryPath: string;
  source: string;
  category: string;
  isOrphaned: boolean;
  hasInstallDir: boolean;
}

type SortCol = 'name' | 'category' | 'publisher' | 'estimatedSize';

export default function SoftwareAuditView() {
  const { showToast } = useAppContext();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [totalSizeKB, setTotalSizeKB] = useState(0);
  const [categories, setCategories] = useState<Record<string, { id: string; label: string; color: string }>>({});
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [wingetAvailable, setWingetAvailable] = useState(false);
  const [updateCheckActive, setUpdateCheckActive] = useState(false);
  const [updateData, setUpdateData] = useState<any>(null);
  const [updatingPkg, setUpdatingPkg] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      // Check winget
      try { const caps = await api.getSystemCapabilities(); setWingetAvailable(caps.wingetAvailable); } catch { setWingetAvailable(false); }

      const result = await api.auditSoftware();
      setPrograms(result.programs || []);
      setOrphanedCount(result.orphanedCount || 0);
      setTotalSizeKB(result.totalSizeKB || 0);
      setCategories(result.categories || {});
      setCategoryStats(result.categoryStats || {});
      setLoaded(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (!loaded) scan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = programs;
    if (showOrphanedOnly) list = list.filter(p => p.isOrphaned);
    if (categoryFilter) list = list.filter(p => p.category === categoryFilter);
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.publisher || '').toLowerCase().includes(q));
    }
    return [...list].sort((a: any, b: any) => {
      let va = a[sortCol] || '', vb = b[sortCol] || '';
      if (sortCol === 'estimatedSize') { va = a.estimatedSize || 0; vb = b.estimatedSize || 0; }
      if (typeof va === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb), 'de') : String(vb).localeCompare(String(va), 'de');
    });
  }, [programs, showOrphanedOnly, categoryFilter, filter, sortCol, sortAsc]);

  const toggleUpdateCheck = useCallback(async () => {
    if (!updateCheckActive) {
      setUpdateCheckActive(true);
      try {
        const data = await api.checkAuditUpdates();
        setUpdateData(data);
      } catch (e: any) {
        setUpdateData({ available: false, error: e.message, updates: {} });
      }
    } else {
      setUpdateCheckActive(false);
    }
  }, [updateCheckActive]);

  const updateSoftware = useCallback(async (wingetId: string, name: string) => {
    setUpdatingPkg(wingetId);
    try {
      const result = await api.updateSoftware(wingetId);
      if (result.success) {
        showToast(`${name} wurde erfolgreich aktualisiert`, 'success');
        if (updateData?.updates) {
          const newUpdates = { ...updateData.updates };
          delete newUpdates[name];
          setUpdateData({ ...updateData, updates: newUpdates, totalUpdates: Object.keys(newUpdates).length });
        }
      } else {
        showToast('Update fehlgeschlagen: ' + (result.error || 'Unbekannt'), 'error');
      }
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
    finally { setUpdatingPkg(null); }
  }, [showToast, updateData]);

  const showDetail = useCallback(async (program: Program) => {
    try {
      const corr = await api.correlateSoftware(program);
      const details = [`Programm: ${program.name}`, `Kategorie: ${categories[program.category]?.label || 'Sonstiges'}`, `Version: ${program.version || '-'}`, `Pfad: ${program.installLocation || '-'}`];
      if (corr.autostartEntries?.length > 0) details.push(`Autostart: ${corr.autostartEntries.length} Einträge`);
      if (corr.services?.length > 0) details.push(`Dienste: ${corr.services.length}`);
      details.push(`Fußabdruck: ${corr.totalFootprint === 'clean' ? 'Sauber' : corr.totalFootprint === 'moderate' ? 'Moderat' : 'Schwer'}`);
      showToast(details.join(' | '), 'info');
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
  }, [showToast, categories]);

  const totalSizeMB = Math.round(totalSizeKB / 1024);
  const hasUpdateData = updateCheckActive && updateData;

  if (!loaded && !loading) return <div className="loading-state">Software wird analysiert...</div>;
  if (loading) return <div className="loading-spinner" />;

  return (
    <div className="audit-page">
      <div className="audit-header">
        <h2>Software-Audit</h2>
        <div className="audit-stats">
          <span className="audit-stat">{programs.length} Programme</span>
          <span className="audit-stat">{totalSizeMB} MB geschätzt</span>
          <span className={`audit-stat ${orphanedCount > 0 ? 'audit-stat-warn' : ''}`}>{orphanedCount} verwaist</span>
        </div>
      </div>
      <div className="audit-toolbar">
        <input type="text" className="audit-search" placeholder="Programme durchsuchen..." value={filter} onChange={e => setFilter(e.target.value)} />
        <select className="audit-category-filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {Object.values(categories).map(c => (
            <option key={c.id} value={c.id}>{c.label} ({categoryStats[c.id] || 0})</option>
          ))}
        </select>
        <label className="audit-filter-label">
          <input type="checkbox" checked={showOrphanedOnly} onChange={e => setShowOrphanedOnly(e.target.checked)} /> Nur verwaiste
        </label>
        <button className="audit-btn-refresh" onClick={() => { setLoaded(false); setUpdateData(null); setUpdateCheckActive(false); scan(); }}>Aktualisieren</button>
        <label className="network-toggle-label" style={!wingetAvailable ? { opacity: 0.5 } : undefined}>
          <input type="checkbox" checked={updateCheckActive} onChange={toggleUpdateCheck} disabled={!wingetAvailable} />
          <span>Updates prüfen</span>
        </label>
        {updateCheckActive && !updateData && <span className="audit-loading-updates">Prüfe Updates...</span>}
        {hasUpdateData && updateData.available && <span className="audit-update-count">{updateData.totalUpdates || 0} Updates verfügbar</span>}
      </div>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Name</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('category')}>Kategorie</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('publisher')}>Herausgeber</th>
              <th>Version</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('estimatedSize')}>Größe</th>
              <th>Quelle</th>
              <th>Status</th>
              {hasUpdateData && <th>Update</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const sizeMB = p.estimatedSize ? (p.estimatedSize / 1024).toFixed(1) + ' MB' : '-';
              const sourceLabel = p.source === 'hkcu' ? 'Benutzer' : p.source === 'hklm-wow64' ? '32-Bit' : 'System';
              const statusClass = p.isOrphaned ? 'high' : p.hasInstallDir === false ? 'moderate' : 'safe';
              const catLabel = categories[p.category]?.label || 'Sonstiges';
              const catColor = categories[p.category]?.color || '#adb5bd';
              const updateInfo = hasUpdateData ? updateData?.updates?.[p.name] : null;

              return (
                <tr key={p.registryPath} className={p.isOrphaned ? 'audit-row-orphaned' : ''}>
                  <td className="audit-name" title={p.installLocation || ''}>{p.name}</td>
                  <td><span className="audit-category-badge" style={{ background: catColor + '20', color: catColor }}>{catLabel}</span></td>
                  <td>{p.publisher || '-'}</td>
                  <td>{p.version || '-'}</td>
                  <td className="audit-size">{sizeMB}</td>
                  <td>{sourceLabel}</td>
                  <td><span className={`risk-badge risk-${statusClass}`}>{p.isOrphaned ? 'Verwaist' : 'OK'}</span></td>
                  {hasUpdateData && (
                    <td>
                      {updateInfo ? (
                        <>
                          <span className="audit-update-badge">{updateInfo.availableVersion}</span>
                          <button className="audit-btn-update" disabled={updatingPkg === updateInfo.wingetId} onClick={() => updateSoftware(updateInfo.wingetId, p.name)}>
                            {updatingPkg === updateInfo.wingetId ? '...' : 'Update'}
                          </button>
                        </>
                      ) : <span className="audit-no-update">-</span>}
                    </td>
                  )}
                  <td><button className="audit-btn-detail" onClick={() => showDetail(p)}>Details</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="audit-empty">Keine Programme gefunden</div>}
      </div>
    </div>
  );
}

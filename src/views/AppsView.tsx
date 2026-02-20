import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

type SubTab = 'overview' | 'updates' | 'forgotten' | 'cleanup' | 'tools';

interface Program {
  name: string;
  version: string;
  publisher: string;
  installDate: string;
  installLocation: string;
  uninstallString: string;
  estimatedSize: number;
  appType: string;
  isOrphaned: boolean;
  hasInstallDir: boolean;
}

interface CacheEntry {
  name: string;
  path: string;
  size: number;
  fileCount: number;
  canClean: boolean;
}

function formatSize(kb: number): string {
  if (kb <= 0) return '–';
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'Alle Apps' },
  { id: 'updates', label: 'Updates' },
  { id: 'forgotten', label: 'Vergessene Apps' },
  { id: 'cleanup', label: 'Cache aufräumen' },
  { id: 'tools', label: 'Werkzeuge' },
];

export default function AppsView() {
  const { showToast } = useAppContext();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');

  return (
    <div className="view-container apps-view">
      <div className="view-header">
        <h2>Apps-Kontrollzentrum</h2>
      </div>
      <div className="sub-tab-bar">
        {SUB_TABS.map(t => (
          <button key={t.id}
            className={`sub-tab-btn ${activeSubTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sub-tab-content">
        {activeSubTab === 'overview' && <OverviewTab showToast={showToast} />}
        {activeSubTab === 'updates' && <UpdatesTab showToast={showToast} />}
        {activeSubTab === 'forgotten' && <ForgottenTab showToast={showToast} />}
        {activeSubTab === 'cleanup' && <CleanupTab showToast={showToast} />}
        {activeSubTab === 'tools' && <ToolsTab showToast={showToast} />}
      </div>
    </div>
  );
}

// ===== Sub-Tab: Alle Apps =====
function OverviewTab({ showToast }: { showToast: (msg: string, type?: any) => void }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'publisher'>('name');
  const [typeFilter, setTypeFilter] = useState<'all' | 'desktop' | 'store'>('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getAppsOverview();
        setPrograms(Array.isArray(data.programs) ? data.programs : []);
      } catch (err: any) {
        showToast('Apps konnten nicht geladen werden: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const filtered = useMemo(() => {
    let list = programs;
    if (typeFilter !== 'all') list = list.filter(p => p.appType === typeFilter);
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(f) || (p.publisher || '').toLowerCase().includes(f));
    }
    list.sort((a, b) => {
      if (sortBy === 'size') return (b.estimatedSize || 0) - (a.estimatedSize || 0);
      if (sortBy === 'publisher') return (a.publisher || '').localeCompare(b.publisher || '');
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [programs, filter, sortBy, typeFilter]);

  const handleUninstall = useCallback(async (prog: Program) => {
    if (!prog.uninstallString) { showToast('Kein Deinstallationsbefehl vorhanden', 'error'); return; }
    if (!confirm(`"${prog.name}" wirklich deinstallieren?`)) return;
    try {
      await api.uninstallSoftware(prog.uninstallString, prog.name);
      showToast(`"${prog.name}" wird deinstalliert...`, 'info');
      // Check for leftovers after a delay
      setTimeout(async () => {
        try {
          const leftovers = await api.checkUninstallLeftovers(prog.name, prog.installLocation);
          if (Array.isArray(leftovers) && leftovers.length > 0) {
            showToast(`${leftovers.length} Überreste von "${prog.name}" gefunden`, 'warning');
          }
        } catch { /* ok */ }
      }, 5000);
    } catch (err: any) {
      showToast('Deinstallation fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="apps-filter-bar">
        <input type="text" className="apps-search" placeholder="App suchen..."
          value={filter} onChange={e => setFilter(e.target.value)} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="all">Alle ({programs.length})</option>
          <option value="desktop">Desktop ({programs.filter(p => p.appType === 'desktop').length})</option>
          <option value="store">Store ({programs.filter(p => p.appType === 'store').length})</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
          <option value="name">Name</option>
          <option value="size">Größe</option>
          <option value="publisher">Herausgeber</option>
        </select>
      </div>
      <div className="apps-stats">
        {filtered.length} von {programs.length} Apps
        {programs.filter(p => p.isOrphaned).length > 0 &&
          <span className="apps-orphaned-badge"> ({programs.filter(p => p.isOrphaned).length} verwaist)</span>}
      </div>
      <div className="apps-list">
        {filtered.map((prog, i) => (
          <div key={i} className={`apps-item ${prog.isOrphaned ? 'orphaned' : ''}`}>
            <div className="apps-item-info">
              <div className="apps-item-name">
                {prog.name}
                {prog.appType === 'store' && <span className="apps-badge store">Store</span>}
                {prog.isOrphaned && <span className="apps-badge orphaned">Verwaist</span>}
              </div>
              <div className="apps-item-meta">
                {prog.version && <span>{prog.version}</span>}
                {prog.publisher && <span>{prog.publisher}</span>}
                {prog.estimatedSize > 0 && <span>{formatSize(prog.estimatedSize)}</span>}
              </div>
            </div>
            <div className="apps-item-actions">
              {prog.uninstallString && (
                <button className="btn btn-sm btn-danger" onClick={() => handleUninstall(prog)}>Deinstallieren</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Sub-Tab: Updates =====
function UpdatesTab({ showToast }: { showToast: (msg: string, type?: any) => void }) {
  const [windowsUpdates, setWindowsUpdates] = useState<any[]>([]);
  const [softwareUpdates, setSoftwareUpdates] = useState<any[]>([]);
  const [updateHistory, setUpdateHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [wu, su, hist] = await Promise.all([
          api.checkWindowsUpdates().catch(() => []),
          api.checkSoftwareUpdates().catch(() => []),
          api.getUpdateHistory().catch(() => []),
        ]);
        setWindowsUpdates(Array.isArray(wu) ? wu : []);
        setSoftwareUpdates(Array.isArray(su) ? su : []);
        setUpdateHistory(Array.isArray(hist) ? hist : []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpdate = useCallback(async (packageId: string) => {
    try {
      showToast('Update wird installiert...', 'info');
      await api.updateSoftware(packageId);
      showToast('Update installiert', 'success');
    } catch (err: any) {
      showToast('Update fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <h3>Windows-Updates ({windowsUpdates.length})</h3>
      {windowsUpdates.length === 0 ? (
        <p className="text-muted">Keine ausstehenden Windows-Updates.</p>
      ) : (
        <div className="updates-list">
          {windowsUpdates.map((u, i) => (
            <div key={i} className="updates-item">
              <span className="updates-title">{u.Title}</span>
              {u.KBArticleIDs && <span className="updates-kb">KB{u.KBArticleIDs}</span>}
              {u.Severity && <span className="updates-severity">{u.Severity}</span>}
            </div>
          ))}
        </div>
      )}

      <h3>Software-Updates ({softwareUpdates.length})</h3>
      {softwareUpdates.length === 0 ? (
        <p className="text-muted">Alle Programme sind aktuell.</p>
      ) : (
        <div className="updates-list">
          {softwareUpdates.map((u, i) => (
            <div key={i} className="updates-item">
              <div className="updates-info">
                <span className="updates-title">{u.name}</span>
                <span className="updates-version">{u.currentVersion} → {u.availableVersion}</span>
              </div>
              <button className="btn btn-sm" onClick={() => handleUpdate(u.id)}>Aktualisieren</button>
            </div>
          ))}
        </div>
      )}

      <h3>Update-Verlauf (letzte 50)</h3>
      {updateHistory.length === 0 ? (
        <p className="text-muted">Kein Verlauf vorhanden.</p>
      ) : (
        <div className="updates-history">
          {updateHistory.map((h, i) => (
            <div key={i} className={`updates-history-item ${h.Status === 'Succeeded' ? 'success' : h.Status === 'Failed' ? 'failed' : ''}`}>
              <span className="updates-title">{h.Title}</span>
              <span className="updates-status">{h.Status}</span>
              <span className="updates-date">{h.Date ? new Date(h.Date).toLocaleDateString('de-DE') : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Sub-Tab: Vergessene Apps =====
function ForgottenTab({ showToast }: { showToast: (msg: string, type?: any) => void }) {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getUnusedApps(180);
        setApps(Array.isArray(data) ? data : []);
      } catch (err: any) {
        showToast('Vergessene Apps konnten nicht geladen werden: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <p className="view-description">Programme die seit mehr als 6 Monaten nicht verwendet wurden.</p>
      {apps.length === 0 ? (
        <div className="empty-state"><p>Keine vergessenen Apps gefunden.</p></div>
      ) : (
        <div className="apps-list">
          {apps.map((app, i) => (
            <div key={i} className="apps-item forgotten">
              <div className="apps-item-info">
                <div className="apps-item-name">{app.name}</div>
                <div className="apps-item-meta">
                  <span>Zuletzt benutzt vor {app.daysSinceUse} Tagen</span>
                  {app.estimatedSize > 0 && <span>{formatSize(app.estimatedSize)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Sub-Tab: Cache aufräumen =====
function CleanupTab({ showToast }: { showToast: (msg: string, type?: any) => void }) {
  const [caches, setCaches] = useState<CacheEntry[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const data = await api.analyzeAppCache();
        const list = Array.isArray(data.caches) ? data.caches : [];
        setCaches(list);
        setTotalSize(data.totalSize || 0);
        setSelected(new Set(list.filter((c: CacheEntry) => c.canClean).map((c: CacheEntry) => c.path)));
      } catch (err: any) {
        showToast('Cache-Analyse fehlgeschlagen: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const handleClean = useCallback(async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    if (!confirm(`${paths.length} Cache-Verzeichnisse leeren?`)) return;
    try {
      const result = await api.cleanAppCache(paths);
      showToast(`${result.cleaned} Cache-Verzeichnisse geleert`, 'success');
      // Reload
      const data = await api.analyzeAppCache();
      setCaches(Array.isArray(data.caches) ? data.caches : []);
      setTotalSize(data.totalSize || 0);
    } catch (err: any) {
      showToast('Bereinigung fehlgeschlagen: ' + err.message, 'error');
    }
  }, [selected, showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="cache-summary">
        <span className="cache-total">Gesamtgröße: <strong>{formatBytes(totalSize)}</strong></span>
        <button className="btn btn-primary" onClick={handleClean} disabled={selected.size === 0}>
          Ausgewählte leeren ({selected.size})
        </button>
      </div>
      {caches.length === 0 ? (
        <div className="empty-state"><p>Keine Cache-Verzeichnisse gefunden.</p></div>
      ) : (
        <div className="cache-list">
          {caches.map((cache, i) => (
            <label key={i} className="cache-item">
              <input type="checkbox" checked={selected.has(cache.path)}
                onChange={e => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(cache.path) : next.delete(cache.path);
                  setSelected(next);
                }} />
              <div className="cache-item-info">
                <div className="cache-item-name">{cache.name}</div>
                <div className="cache-item-meta">
                  <span>{formatBytes(cache.size)}</span>
                  {cache.fileCount > 0 && <span>{cache.fileCount} Dateien</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Sub-Tab: Werkzeuge =====
function ToolsTab({ showToast }: { showToast: (msg: string, type?: any) => void }) {
  const [programs, setPrograms] = useState<any[]>([]);
  const [autostartEntries, setAutostartEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [appsData, autostart] = await Promise.all([
          api.getAppsOverview().catch(() => ({ programs: [] })),
          api.getAutoStartEntries().catch(() => []),
        ]);
        setPrograms(Array.isArray(appsData.programs) ? appsData.programs : []);
        setAutostartEntries(Array.isArray(autostart) ? autostart : []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleExport = useCallback(async (format: string) => {
    try {
      const result = await api.exportProgramList(format, programs);
      // Save dialog
      const saveResult = await api.showSaveDialog({
        title: 'Programmliste exportieren',
        defaultPath: result.defaultName,
      });
      if (!saveResult || saveResult.canceled) return;
      const outputPath = saveResult.path || saveResult;
      if (typeof outputPath !== 'string') return;
      await api.writeFileContent(outputPath, result.content);
      showToast(`Exportiert als ${format.toUpperCase()}: ${outputPath.split(/[\\/]/).pop()}`, 'success');
    } catch (err: any) {
      showToast('Export fehlgeschlagen: ' + err.message, 'error');
    }
  }, [programs, showToast]);

  const handleToggleAutostart = useCallback(async (entry: any, enabled: boolean) => {
    try {
      await api.toggleAutoStart(entry, enabled);
      showToast(`"${entry.name}" ${enabled ? 'aktiviert' : 'deaktiviert'}`, 'success');
      // Reload
      const data = await api.getAutoStartEntries();
      setAutostartEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast('Fehler: ' + err.message, 'error');
    }
  }, [showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <h3>Programmliste exportieren</h3>
      <div className="tools-export-btns">
        <button className="btn btn-secondary" onClick={() => handleExport('json')}>Als JSON</button>
        <button className="btn btn-secondary" onClick={() => handleExport('csv')}>Als CSV</button>
        <button className="btn btn-secondary" onClick={() => handleExport('winget')}>Als Winget-Skript</button>
      </div>

      <h3>Autostart-Programme ({autostartEntries.length})</h3>
      {autostartEntries.length === 0 ? (
        <p className="text-muted">Keine Autostart-Einträge gefunden.</p>
      ) : (
        <div className="autostart-list">
          {autostartEntries.map((entry, i) => (
            <div key={i} className="autostart-item">
              <div className="autostart-info">
                <span className="autostart-name">{entry.name}</span>
                <span className="autostart-source">{entry.locationLabel || entry.source}</span>
              </div>
              <label className="autostart-toggle">
                <input type="checkbox" checked={entry.enabled !== false}
                  onChange={e => handleToggleAutostart(entry, e.target.checked)} />
                <span>{entry.enabled !== false ? 'Aktiv' : 'Inaktiv'}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

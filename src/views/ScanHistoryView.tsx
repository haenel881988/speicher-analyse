import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface Snapshot {
  id: string;
  timestamp_ms: number;
  root_path: string;
  total_size: number;
  total_files: number;
  dirs_scanned: number;
  category_sizes: Record<string, number>;
  folder_sizes: Record<string, number>;
}

interface Delta {
  older_id: string;
  newer_id: string;
  older_timestamp_ms: number;
  newer_timestamp_ms: number;
  days_between: number;
  size_change: number;
  files_change: number;
  category_changes: Record<string, number>;
  folder_changes: Array<{ path: string; old_size: number; new_size: number; change: number }>;
}

interface Trend {
  hasEnoughData: boolean;
  message?: string;
  dataPoints?: Array<{ timestamp_ms: number; total_size: number; total_files: number }>;
  snapshotCount?: number;
  periodDays?: number;
  sizeChange?: number;
  growthPerDay?: number;
  growthPerWeek?: number;
  growthPerMonth?: number;
}

type SubTab = 'timeline' | 'delta' | 'trend' | 'check';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatChange(bytes: number): string {
  const sign = bytes > 0 ? '+' : '';
  return sign + formatBytes(Math.abs(bytes));
}

export default function ScanHistoryView() {
  const { showToast } = useAppContext();
  const [subTab, setSubTab] = useState<SubTab>('timeline');
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [quickCheck, setQuickCheck] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOlder, setSelectedOlder] = useState('');
  const [selectedNewer, setSelectedNewer] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getScanHistory();
      const sorted = Array.isArray(data) ? data.sort((a: Snapshot, b: Snapshot) => b.timestamp_ms - a.timestamp_ms) : [];
      setHistory(sorted);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleCompare = useCallback(async () => {
    if (!selectedOlder || !selectedNewer) {
      showToast('Bitte zwei Snapshots zum Vergleichen auswählen', 'warning');
      return;
    }
    if (selectedOlder === selectedNewer) {
      showToast('Bitte zwei verschiedene Snapshots auswählen', 'warning');
      return;
    }
    try {
      const result = await api.compareScans(selectedOlder, selectedNewer);
      setDelta(result);
    } catch (err: any) {
      showToast('Vergleich fehlgeschlagen: ' + err.message, 'error');
    }
  }, [selectedOlder, selectedNewer, showToast]);

  const handleTrend = useCallback(async () => {
    if (history.length === 0) return;
    try {
      const rootPath = history[0]?.root_path || '';
      const result = await api.getStorageTrend(rootPath);
      setTrend(result);
    } catch (err: any) {
      showToast('Trend-Analyse fehlgeschlagen: ' + err.message, 'error');
    }
  }, [history, showToast]);

  const handleQuickCheck = useCallback(async () => {
    try {
      const result = await api.quickChangeCheck();
      setQuickCheck(result);
    } catch (err: any) {
      showToast('Schnellprüfung fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast]);

  const handleDeleteSnapshot = useCallback(async (id: string) => {
    try {
      await api.deleteScanSnapshot(id);
      showToast('Snapshot gelöscht', 'success');
      loadHistory();
    } catch (err: any) {
      showToast('Löschen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast, loadHistory]);

  const handleClearHistory = useCallback(async () => {
    const confirmed = await api.showConfirmDialog({
      type: 'warning', title: 'Verlauf leeren',
      message: `Gesamten Scan-Verlauf (${history.length} Snapshots) löschen? Dies kann nicht rückgängig gemacht werden.`,
      buttons: ['Abbrechen', 'Leeren'], defaultId: 0,
    });
    if (confirmed.response !== 1) return;
    try {
      await api.clearScanHistory();
      setHistory([]);
      showToast('Verlauf gelöscht', 'success');
    } catch (err: any) {
      showToast('Löschen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast, history.length]);

  // Auto-load sub-tab data
  useEffect(() => {
    if (subTab === 'trend' && !trend && history.length >= 2) handleTrend();
    if (subTab === 'check' && !quickCheck) handleQuickCheck();
  }, [subTab, trend, quickCheck, history.length, handleTrend, handleQuickCheck]);

  if (loading) return <div className="view-loading">Lade Scan-Verlauf...</div>;

  return (
    <div className="scan-history-view">
      <div className="sub-tab-bar">
        <button className={subTab === 'timeline' ? 'active' : ''} onClick={() => setSubTab('timeline')}>Zeitverlauf</button>
        <button className={subTab === 'delta' ? 'active' : ''} onClick={() => setSubTab('delta')}>Delta-Vergleich</button>
        <button className={subTab === 'trend' ? 'active' : ''} onClick={() => setSubTab('trend')}>Trend-Analyse</button>
        <button className={subTab === 'check' ? 'active' : ''} onClick={() => setSubTab('check')}>Schnellprüfung</button>
      </div>

      {subTab === 'timeline' && (
        <TimelineTab
          history={history}
          onDelete={handleDeleteSnapshot}
          onClear={handleClearHistory}
        />
      )}

      {subTab === 'delta' && (
        <DeltaTab
          history={history}
          selectedOlder={selectedOlder}
          selectedNewer={selectedNewer}
          onSelectOlder={setSelectedOlder}
          onSelectNewer={setSelectedNewer}
          onCompare={handleCompare}
          delta={delta}
        />
      )}

      {subTab === 'trend' && (
        <TrendTab trend={trend} onRefresh={handleTrend} />
      )}

      {subTab === 'check' && (
        <QuickCheckTab quickCheck={quickCheck} onRefresh={handleQuickCheck} />
      )}
    </div>
  );
}

// ============= Sub-Tab Components =============

function TimelineTab({ history, onDelete, onClear }: {
  history: Snapshot[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div className="scan-history-empty">
        <p>Noch keine Scan-Snapshots vorhanden.</p>
        <p>Snapshots werden automatisch bei jedem Scan erstellt.</p>
      </div>
    );
  }

  return (
    <div className="scan-history-timeline">
      <div className="timeline-header">
        <span>{history.length} Snapshots</span>
        {history.length > 1 && (
          <button className="btn-small btn-danger" onClick={onClear}>Verlauf leeren</button>
        )}
      </div>
      <div className="timeline-list">
        {history.map((snap, i) => {
          const prev = history[i + 1];
          const sizeChange = prev ? (snap.total_size as number) - (prev.total_size as number) : 0;
          return (
            <div key={snap.id} className="timeline-entry">
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-date">{formatDate(snap.timestamp_ms)}</div>
                <div className="timeline-stats">
                  <span>{formatBytes(snap.total_size)}</span>
                  <span>{snap.total_files.toLocaleString('de-DE')} Dateien</span>
                  <span>{snap.dirs_scanned.toLocaleString('de-DE')} Ordner</span>
                  {prev && sizeChange !== 0 && (
                    <span className={sizeChange > 0 ? 'change-grow' : 'change-shrink'}>
                      {formatChange(sizeChange)}
                    </span>
                  )}
                </div>
                <div className="timeline-categories">
                  {Object.entries(snap.category_sizes || {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([cat, size]) => (
                      <span key={cat} className="category-badge">{cat}: {formatBytes(size as number)}</span>
                    ))
                  }
                </div>
              </div>
              <button className="btn-icon" title="Snapshot löschen" onClick={() => onDelete(snap.id)}>&#x2715;</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaTab({ history, selectedOlder, selectedNewer, onSelectOlder, onSelectNewer, onCompare, delta }: {
  history: Snapshot[];
  selectedOlder: string;
  selectedNewer: string;
  onSelectOlder: (id: string) => void;
  onSelectNewer: (id: string) => void;
  onCompare: () => void;
  delta: Delta | null;
}) {
  if (history.length < 2) {
    return (
      <div className="scan-history-empty">
        <p>Mindestens 2 Snapshots nötig für einen Delta-Vergleich.</p>
      </div>
    );
  }

  return (
    <div className="scan-history-delta">
      <div className="delta-selector">
        <div className="delta-select-group">
          <label>Älterer Scan:</label>
          <select value={selectedOlder} onChange={e => onSelectOlder(e.target.value)}>
            <option value="">— Auswählen —</option>
            {history.map(s => (
              <option key={s.id} value={s.id}>{formatDate(s.timestamp_ms)} ({formatBytes(s.total_size)})</option>
            ))}
          </select>
        </div>
        <div className="delta-select-group">
          <label>Neuerer Scan:</label>
          <select value={selectedNewer} onChange={e => onSelectNewer(e.target.value)}>
            <option value="">— Auswählen —</option>
            {history.map(s => (
              <option key={s.id} value={s.id}>{formatDate(s.timestamp_ms)} ({formatBytes(s.total_size)})</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={onCompare}>Vergleichen</button>
      </div>

      {delta && (
        <div className="delta-results">
          <div className="delta-summary">
            <div className="delta-metric">
              <span className="delta-label">Zeitraum</span>
              <span className="delta-value">{delta.days_between.toFixed(1)} Tage</span>
            </div>
            <div className="delta-metric">
              <span className="delta-label">Speicheränderung</span>
              <span className={`delta-value ${delta.size_change > 0 ? 'change-grow' : delta.size_change < 0 ? 'change-shrink' : ''}`}>
                {formatChange(delta.size_change)}
              </span>
            </div>
            <div className="delta-metric">
              <span className="delta-label">Dateiänderung</span>
              <span className="delta-value">{delta.files_change > 0 ? '+' : ''}{delta.files_change.toLocaleString('de-DE')}</span>
            </div>
          </div>

          {Object.keys(delta.category_changes).length > 0 && (
            <div className="delta-section">
              <h4>Änderungen nach Kategorie</h4>
              <div className="delta-category-list">
                {Object.entries(delta.category_changes)
                  .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
                  .map(([cat, change]) => (
                    <div key={cat} className="delta-category-item">
                      <span className="delta-cat-name">{cat}</span>
                      <span className={`delta-cat-change ${(change as number) > 0 ? 'change-grow' : 'change-shrink'}`}>
                        {formatChange(change as number)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {delta.folder_changes.length > 0 && (
            <div className="delta-section">
              <h4>Ordner mit den größten Änderungen</h4>
              <div className="delta-folder-list">
                {delta.folder_changes.slice(0, 15).map(fc => (
                  <div key={fc.path} className="delta-folder-item">
                    <span className="delta-folder-path">{fc.path.split('\\').pop()}</span>
                    <span className="delta-folder-sizes">{formatBytes(fc.old_size)} → {formatBytes(fc.new_size)}</span>
                    <span className={`delta-folder-change ${fc.change > 0 ? 'change-grow' : 'change-shrink'}`}>
                      {formatChange(fc.change)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendTab({ trend, onRefresh }: { trend: Trend | null; onRefresh: () => void }) {
  if (!trend) {
    return <div className="view-loading">Lade Trend-Daten...</div>;
  }

  if (!trend.hasEnoughData) {
    return (
      <div className="scan-history-empty">
        <p>{trend.message}</p>
        <p>Führe regelmäßig Scans durch, um den Speichertrend zu sehen.</p>
      </div>
    );
  }

  return (
    <div className="scan-history-trend">
      <div className="trend-header">
        <span>Basierend auf {trend.snapshotCount} Scans über {trend.periodDays} Tage</span>
        <button className="btn-small" onClick={onRefresh}>Aktualisieren</button>
      </div>

      <div className="trend-metrics">
        <div className="trend-metric">
          <span className="trend-label">Gesamtänderung</span>
          <span className={`trend-value ${(trend.sizeChange ?? 0) > 0 ? 'change-grow' : 'change-shrink'}`}>
            {formatChange(trend.sizeChange ?? 0)}
          </span>
        </div>
        <div className="trend-metric">
          <span className="trend-label">Pro Tag</span>
          <span className="trend-value">{formatChange(trend.growthPerDay ?? 0)}</span>
        </div>
        <div className="trend-metric">
          <span className="trend-label">Pro Woche</span>
          <span className="trend-value">{formatChange(trend.growthPerWeek ?? 0)}</span>
        </div>
        <div className="trend-metric">
          <span className="trend-label">Pro Monat</span>
          <span className="trend-value">{formatChange(trend.growthPerMonth ?? 0)}</span>
        </div>
      </div>

      {trend.dataPoints && trend.dataPoints.length > 0 && (
        <div className="trend-chart-placeholder">
          <h4>Speicherverlauf</h4>
          <div className="trend-data-list">
            {trend.dataPoints.map((dp, i) => (
              <div key={i} className="trend-data-point">
                <span>{formatDate(dp.timestamp_ms)}</span>
                <span>{formatBytes(dp.total_size)}</span>
                <span>{dp.total_files.toLocaleString('de-DE')} Dateien</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickCheckTab({ quickCheck, onRefresh }: { quickCheck: any; onRefresh: () => void }) {
  if (!quickCheck) {
    return <div className="view-loading">Prüfe auf Änderungen...</div>;
  }

  if (!quickCheck.hasBaseline) {
    return (
      <div className="scan-history-empty">
        <p>{quickCheck.message}</p>
        <p>Führe zuerst einen Scan durch, um eine Vergleichsbasis zu erstellen.</p>
      </div>
    );
  }

  return (
    <div className="scan-history-check">
      <div className="check-header">
        <span>Letzter Scan: {formatDate(quickCheck.lastScanMs)}</span>
        <button className="btn-small" onClick={onRefresh}>Erneut prüfen</button>
      </div>

      <div className={`check-result ${quickCheck.changeDetected ? 'check-changes' : 'check-no-changes'}`}>
        <div className="check-icon">{quickCheck.changeDetected ? '⚠' : '✓'}</div>
        <div className="check-text">
          {quickCheck.changeDetected
            ? `${quickCheck.modifiedFolders} Ordner wurden seit dem letzten Scan verändert`
            : 'Keine wesentlichen Änderungen seit dem letzten Scan erkannt'
          }
        </div>
      </div>

      <div className="check-details">
        <div className="check-detail-item">
          <span>Scan-Verzeichnis:</span>
          <span>{quickCheck.rootPath}</span>
        </div>
        <div className="check-detail-item">
          <span>Letzter Stand:</span>
          <span>{formatBytes(quickCheck.lastTotalSize)} / {(quickCheck.lastFilesCount ?? 0).toLocaleString('de-DE')} Dateien</span>
        </div>
      </div>

      {quickCheck.changeDetected && quickCheck.modifiedFolderPaths?.length > 0 && (
        <div className="check-modified-folders">
          <h4>Veränderte Ordner</h4>
          <ul>
            {quickCheck.modifiedFolderPaths.map((p: string, i: number) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

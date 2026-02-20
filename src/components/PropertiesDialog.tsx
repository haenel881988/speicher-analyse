import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { formatBytes } from '../utils/format';

interface PropertiesDialogProps {
  filePath: string;
  onClose: () => void;
}

type TabId = 'general' | 'security' | 'details' | 'versions' | 'hash';

const HASH_ALGOS = ['MD5', 'SHA1', 'SHA256', 'SHA512'];

export function PropertiesDialog({ filePath, onClose }: PropertiesDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [general, setGeneral] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [details, setDetails] = useState<any[] | null>(null);
  const [versions, setVersions] = useState<any>(null);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [hashLoading, setHashLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fileName = filePath.split(/[\\/]/).pop() || '';

  // Load general properties immediately
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setGeneral(null);
    setSecurity(null);
    setDetails(null);
    setVersions(null);
    setHashes({});
    setActiveTab('general');

    (async () => {
      try {
        const data = await api.filePropertiesGeneral(filePath);
        if (!cancelled) {
          setGeneral(data);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Eigenschaften konnten nicht geladen werden');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  // Load tab-specific data on demand
  useEffect(() => {
    let cancelled = false;

    if (activeTab === 'security' && !security) {
      (async () => {
        try {
          const data = await api.filePropertiesSecurity(filePath);
          if (!cancelled) setSecurity(data);
        } catch { if (!cancelled) setSecurity({ error: 'Konnte nicht geladen werden' }); }
      })();
    }
    if (activeTab === 'details' && details === null) {
      (async () => {
        try {
          const data = await api.filePropertiesDetails(filePath);
          if (!cancelled) setDetails(Array.isArray(data) ? data : []);
        } catch { if (!cancelled) setDetails([]); }
      })();
    }
    if (activeTab === 'versions' && !versions) {
      (async () => {
        try {
          const data = await api.filePropertiesVersions(filePath);
          if (!cancelled) setVersions(data);
        } catch { if (!cancelled) setVersions({ versions: [], message: 'Konnte nicht geladen werden' }); }
      })();
    }

    return () => { cancelled = true; };
  }, [activeTab, filePath, security, details, versions]);

  const computeHash = useCallback(async (algo: string) => {
    if (hashes[algo] || hashLoading) return;
    setHashLoading(algo);
    try {
      const result = await api.filePropertiesHash(filePath, algo);
      const hash = typeof result === 'string' ? result : result?.hash || result?.Hash || '';
      setHashes(prev => ({ ...prev, [algo]: hash }));
    } catch {
      setHashes(prev => ({ ...prev, [algo]: 'Fehler' }));
    }
    setHashLoading(null);
  }, [filePath, hashes, hashLoading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose]);

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString('de-DE'); } catch { return iso; }
  };

  const isDir = general?.isDir;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: 'Allgemein' },
    { id: 'security', label: 'Sicherheit' },
    { id: 'details', label: 'Details' },
    { id: 'versions', label: 'Versionen' },
    ...(!isDir ? [{ id: 'hash' as TabId, label: 'Prüfsummen' }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog props-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="props-general-header-inline">
            <span className="props-general-icon-emoji">{isDir ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
            <span className="props-general-name">{fileName}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Schließen">{'\u2715'}</button>
        </div>

        {/* Tabs */}
        <div className="props-tabs">
          {tabs.map(t => (
            <button type="button" key={t.id} className={`props-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="modal-body">
          {loading && <div className="loading-spinner" />}
          {error && <div className="props-error">{error}</div>}

          {/* Allgemein */}
          {activeTab === 'general' && general && (
            <>
              <div className="prop-row">
                <span className="prop-label">Name:</span>
                <span className="prop-value">{general.name}</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Typ:</span>
                <span className="prop-value">{general.typeDescription || (isDir ? 'Dateiordner' : general.extension || '-')}</span>
              </div>
              {general.openWith && (
                <div className="prop-row">
                  <span className="prop-label">Öffnen mit:</span>
                  <span className="prop-value props-open-with">{general.openWith}</span>
                </div>
              )}
              <div className="props-separator" />
              <div className="prop-row">
                <span className="prop-label">Speicherort:</span>
                <span className="prop-value props-location">{general.parentPath || general.path}</span>
              </div>
              <div className="props-separator" />
              {!isDir && (
                <>
                  <div className="prop-row">
                    <span className="prop-label">Größe:</span>
                    <span className="prop-value">{formatBytes(general.size)} ({(general.sizeBytes ?? general.size)?.toLocaleString('de-DE')} Bytes)</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Auf Datenträger:</span>
                    <span className="prop-value">{formatBytes(general.sizeOnDisk)}</span>
                  </div>
                  <div className="props-separator" />
                </>
              )}
              <div className="prop-row">
                <span className="prop-label">Erstellt:</span>
                <span className="prop-value">{formatDate(general.created)}</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Geändert:</span>
                <span className="prop-value">{formatDate(general.modified)}</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">Letzter Zugriff:</span>
                <span className="prop-value">{formatDate(general.accessed)}</span>
              </div>
              <div className="props-separator" />
              <div className="props-attrs">
                <label><input type="checkbox" checked={!!general.readOnly} readOnly /> Schreibgeschützt</label>
                <label><input type="checkbox" checked={!!general.hidden} readOnly /> Versteckt</label>
                <label><input type="checkbox" checked={!!general.system} readOnly /> System</label>
                <label><input type="checkbox" checked={!!general.archive} readOnly /> Archiv</label>
              </div>
            </>
          )}

          {/* Sicherheit */}
          {activeTab === 'security' && (
            <>
              {!security ? (
                <div className="loading-spinner" />
              ) : security.error ? (
                <div className="props-error">{security.error}</div>
              ) : (
                <>
                  <div className="props-security-owner">
                    <strong>Besitzer:</strong> {security.owner || 'Unbekannt'}
                  </div>
                  <table className="props-acl-table">
                    <thead>
                      <tr>
                        <th>Benutzer/Gruppe</th>
                        <th>Typ</th>
                        <th>Rechte</th>
                        <th>Geerbt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(security.entries || []).map((entry: any, i: number) => (
                        <tr key={i}>
                          <td title={entry.identity}>{entry.identity?.split('\\').pop() || entry.identity}</td>
                          <td className={entry.type === 'Allow' ? 'props-acl-allow' : 'props-acl-deny'}>
                            {entry.type === 'Allow' ? 'Zulassen' : 'Verweigern'}
                          </td>
                          <td className="props-acl-rights">{entry.rights}</td>
                          <td className={entry.inherited ? 'props-acl-inherited' : ''}>{entry.inherited ? 'Ja' : 'Nein'}</td>
                        </tr>
                      ))}
                      {(!security.entries || security.entries.length === 0) && (
                        <tr><td colSpan={4} className="props-acl-empty">Keine Einträge</td></tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          {/* Details */}
          {activeTab === 'details' && (
            <>
              {details === null ? (
                <div className="loading-spinner" />
              ) : details.length === 0 ? (
                <div className="props-empty">
                  Keine erweiterten Eigenschaften verfügbar
                </div>
              ) : (
                details.map((d: any, i: number) => (
                  <div key={i} className="props-detail-row">
                    <span className="props-detail-key">{d.key || d.Key}</span>
                    <span className="props-detail-value">{d.value || d.Value || '-'}</span>
                  </div>
                ))
              )}
            </>
          )}

          {/* Versionen */}
          {activeTab === 'versions' && (
            <>
              {!versions ? (
                <div className="loading-spinner" />
              ) : (
                <>
                  {versions.message && (
                    <div className="props-info-text">{versions.message}</div>
                  )}
                  {(versions.versions || []).length > 0 ? (
                    <div className="props-versions-list">
                      {versions.versions.map((v: any, i: number) => (
                        <div key={i} className="props-version-item">
                          <span className="props-version-date">{v.dateFormatted}</span>
                          <span className="props-version-type">{v.type}</span>
                          <span>{v.size >= 0 ? formatBytes(v.size) : '-'}</span>
                        </div>
                      ))}
                    </div>
                  ) : !versions.message && (
                    <div className="props-versions-empty">
                      Keine früheren Versionen verfügbar
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Prüfsummen (Hash) */}
          {activeTab === 'hash' && (
            <div className="props-hash-section props-hash-section-inner">
              <div className="props-hash-hint">
                Klicke auf einen Algorithmus um die Prüfsumme zu berechnen.
              </div>
              {HASH_ALGOS.map(algo => (
                <div key={algo} className="props-hash-item">
                  <button type="button" className="props-hash-btn" onClick={() => computeHash(algo)}
                    disabled={!!hashes[algo] || hashLoading === algo}>
                    {hashLoading === algo ? `${algo} berechne...` : algo}
                  </button>
                  {hashes[algo] && (
                    <div className="props-hash-result">{hashes[algo]}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="props-footer">
          <button type="button" className="props-footer-btn" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

type Section = 'windows' | 'software' | 'drivers' | 'history';

export default function UpdatesView() {
  const { showToast } = useAppContext();
  const [activeSection, setActiveSection] = useState<Section>('windows');
  const [windowsUpdates, setWindowsUpdates] = useState<any[]>([]);
  const [softwareUpdates, setSoftwareUpdates] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [hwInfo, setHwInfo] = useState<any>(null);
  const [updateHistory, setUpdateHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<Section, boolean>>({ windows: false, software: false, drivers: false, history: false });
  const [loaded, setLoaded] = useState<Record<Section, boolean>>({ windows: false, software: false, drivers: false, history: false });
  const [allSummary, setAllSummary] = useState('');
  const [updatingPkg, setUpdatingPkg] = useState<string | null>(null);

  const setLoadingFor = (section: Section, val: boolean) => setLoading(prev => ({ ...prev, [section]: val }));
  const setLoadedFor = (section: Section, val: boolean) => setLoaded(prev => ({ ...prev, [section]: val }));

  const checkWindows = useCallback(async () => {
    setLoadingFor('windows', true);
    try {
      const data = await api.checkWindowsUpdates();
      setWindowsUpdates(data || []);
      setLoadedFor('windows', true);
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
    finally { setLoadingFor('windows', false); }
  }, [showToast]);

  const checkSoftware = useCallback(async () => {
    setLoadingFor('software', true);
    try {
      const data = await api.checkSoftwareUpdates() as any;
      if (data && !Array.isArray(data) && data.error) { showToast(data.error, 'error'); setSoftwareUpdates([]); }
      else setSoftwareUpdates(Array.isArray(data) ? data : []);
      setLoadedFor('software', true);
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
    finally { setLoadingFor('software', false); }
  }, [showToast]);

  const checkDrivers = useCallback(async () => {
    setLoadingFor('drivers', true);
    try {
      const [drvs, hw] = await Promise.all([api.getDriverInfo(), api.getHardwareInfo()]);
      setDrivers(drvs || []);
      setHwInfo(hw);
      setLoadedFor('drivers', true);
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
    finally { setLoadingFor('drivers', false); }
  }, [showToast]);

  const loadHistory = useCallback(async () => {
    setLoadingFor('history', true);
    try {
      const data = await api.getUpdateHistory();
      setUpdateHistory(data || []);
      setLoadedFor('history', true);
    } catch (e: any) { showToast('Fehler: ' + e.message, 'error'); }
    finally { setLoadingFor('history', false); }
  }, [showToast]);

  const checkAll = useCallback(async () => {
    setAllSummary('Alle Updates werden geprüft...');
    await Promise.allSettled([checkWindows(), checkSoftware(), checkDrivers()]);
    const parts: string[] = [];
    if (windowsUpdates.length > 0) parts.push(`${windowsUpdates.length} Windows`);
    if (softwareUpdates.length > 0) parts.push(`${softwareUpdates.length} Software`);
    const old = drivers.filter((d: any) => d.isOld).length;
    if (old > 0) parts.push(`${old} Treiber veraltet`);
    setAllSummary(parts.length > 0 ? `Gefunden: ${parts.join(', ')}` : 'Alles aktuell');
  }, [checkWindows, checkSoftware, checkDrivers, windowsUpdates, softwareUpdates, drivers]);

  const updateSoftware = useCallback(async (pkgId: string) => {
    setUpdatingPkg(pkgId);
    try {
      const result = await api.updateSoftware(pkgId);
      if (result.success) {
        showToast(`${pkgId} erfolgreich aktualisiert${result.verified ? ' (verifiziert)' : ''}`, 'success');
      } else {
        showToast('Fehler: ' + (result.error || 'Unbekannt'), 'error');
      }
    } catch (e: any) { showToast('Update fehlgeschlagen: ' + e.message, 'error'); }
    finally { setUpdatingPkg(null); }
  }, [showToast]);

  const tabs: { id: Section; label: string }[] = [
    { id: 'windows', label: 'Windows Updates' },
    { id: 'software', label: 'Software Updates' },
    { id: 'drivers', label: 'Treiber' },
    { id: 'history', label: 'Verlauf' },
  ];

  const sectionActions: Record<Section, () => void> = {
    windows: checkWindows, software: checkSoftware, drivers: checkDrivers, history: loadHistory,
  };

  const sectionLabels: Record<Section, string> = {
    windows: 'Auf Updates prüfen', software: 'Software-Updates prüfen', drivers: 'Treiber prüfen', history: 'Verlauf laden',
  };

  return (
    <div className="updates-view">
      <div className="tool-toolbar" style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={checkAll}>Alle Updates prüfen</button>
        <span className="tool-summary">{allSummary}</span>
      </div>
      <div className="updates-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`updates-tab ${activeSection === t.id ? 'active' : ''}`} onClick={() => setActiveSection(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="updates-content">
        {/* Windows */}
        {activeSection === 'windows' && (
          <div className="updates-section active">
            <div className="tool-toolbar">
              <button className="btn btn-primary" onClick={checkWindows} disabled={loading.windows}>{loading.windows ? 'Suche...' : sectionLabels.windows}</button>
              <span className="tool-summary">{loaded.windows && (windowsUpdates.length > 0 ? `${windowsUpdates.length} Update(s) verfügbar` : 'Keine Updates verfügbar')}</span>
            </div>
            <div className="tool-results">
              {!loaded.windows && !loading.windows && <div className="tool-placeholder">Klicke auf &quot;Auf Updates prüfen&quot; um nach Windows Updates zu suchen.</div>}
              {loading.windows && <div className="loading-spinner" />}
              {loaded.windows && windowsUpdates.length === 0 && <div className="tool-placeholder">Keine ausstehenden Windows Updates. Dein System ist aktuell!</div>}
              {windowsUpdates.map((u, i) => (
                <div className="update-item" key={i}>
                  <div className="update-item-info">
                    <div className="update-item-title">{u.Title || 'Unbekanntes Update'}</div>
                    <div className="update-item-meta">
                      {u.KBArticleIDs && <span className="update-kb">KB{u.KBArticleIDs}</span>}
                      {u.Size > 0 && <span>{formatBytes(u.Size)}</span>}
                      <span className={`severity-badge severity-${(u.Severity || '').toLowerCase()}`}>{u.Severity || 'Unbekannt'}</span>
                      {u.IsMandatory && <span className="update-mandatory">Pflichtupdate</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Software */}
        {activeSection === 'software' && (
          <div className="updates-section active">
            <div className="tool-toolbar">
              <button className="btn btn-primary" onClick={checkSoftware} disabled={loading.software}>{loading.software ? 'Suche...' : sectionLabels.software}</button>
              <span className="tool-summary">{loaded.software && (softwareUpdates.length > 0 ? `${softwareUpdates.length} Update(s) verfügbar` : 'Alles aktuell')}</span>
            </div>
            <div className="tool-results">
              {!loaded.software && !loading.software && <div className="tool-placeholder">Klicke auf &quot;Software-Updates prüfen&quot; um verfügbare Updates via winget zu finden.</div>}
              {loading.software && <div className="loading-spinner" />}
              {loaded.software && softwareUpdates.length === 0 && <div className="tool-placeholder">Alle Programme sind aktuell!</div>}
              {softwareUpdates.length > 0 && (
                <table className="tool-table">
                  <thead><tr><th>Programm</th><th>ID</th><th>Installiert</th><th>Verfügbar</th><th>Quelle</th><th></th></tr></thead>
                  <tbody>
                    {softwareUpdates.map((u: any) => (
                      <tr key={u.id}>
                        <td className="name-col">{u.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{u.id}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.currentVersion}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{u.availableVersion}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.source}</td>
                        <td>
                          <button className="btn-sm btn-primary" disabled={updatingPkg === u.id} onClick={() => updateSoftware(u.id)}>
                            {updatingPkg === u.id ? 'Installiere...' : 'Update'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Drivers */}
        {activeSection === 'drivers' && (
          <div className="updates-section active">
            <div className="tool-toolbar">
              <button className="btn btn-primary" onClick={checkDrivers} disabled={loading.drivers}>{loading.drivers ? 'Prüfe...' : sectionLabels.drivers}</button>
              <span className="tool-summary">{loaded.drivers && `${drivers.length} Treiber${drivers.filter((d: any) => d.isOld).length > 0 ? ` (${drivers.filter((d: any) => d.isOld).length} veraltet)` : ' - alle aktuell'}`}</span>
            </div>
            <div className="tool-results">
              {!loaded.drivers && !loading.drivers && <div className="tool-placeholder">Klicke auf &quot;Treiber prüfen&quot; um älteste Treiber anzuzeigen.</div>}
              {loading.drivers && <div className="loading-spinner" />}
              {loaded.drivers && (
                <>
                  {hwInfo?.Manufacturer && (
                    <div className="hardware-info-box"><strong>System:</strong> {hwInfo.Manufacturer} {hwInfo.Model || ''}</div>
                  )}
                  <table className="tool-table">
                    <thead><tr><th>Gerät</th><th>Hersteller</th><th>Version</th><th>Datum</th><th>Alter</th><th>Status</th></tr></thead>
                    <tbody>
                      {drivers.map((d: any, i: number) => (
                        <tr key={i} className={d.isOld ? 'driver-old' : ''}>
                          <td className="name-col">{d.name}</td>
                          <td style={{ fontSize: 12 }}>{d.supportUrl ? <a href="#" onClick={(e) => { e.preventDefault(); api.openExternal(d.supportUrl); }}>{d.manufacturer}</a> : (d.manufacturer || '-')}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.version}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.date}</td>
                          <td className="age-col">{d.ageYears > 0 ? d.ageYears + ' Jahre' : '< 1 Jahr'}</td>
                          <td>{d.isOld ? <span className="driver-status-badge driver-old-badge">Veraltet</span> : <span className="driver-status-badge driver-ok-badge">OK</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {activeSection === 'history' && (
          <div className="updates-section active">
            <div className="tool-toolbar">
              <button className="btn btn-primary" onClick={loadHistory} disabled={loading.history}>{loading.history ? 'Lade...' : sectionLabels.history}</button>
              <span className="tool-summary">{loaded.history && updateHistory.length > 0 && `Letzte ${updateHistory.length} Updates`}</span>
            </div>
            <div className="tool-results">
              {!loaded.history && !loading.history && <div className="tool-placeholder">Klicke auf &quot;Verlauf laden&quot; um die letzten 20 installierten Updates anzuzeigen.</div>}
              {loading.history && <div className="loading-spinner" />}
              {loaded.history && updateHistory.length === 0 && <div className="tool-placeholder">Kein Update-Verlauf verfügbar.</div>}
              {updateHistory.length > 0 && (
                <table className="tool-table">
                  <thead><tr><th>Datum</th><th>Titel</th><th>Status</th></tr></thead>
                  <tbody>
                    {updateHistory.map((h: any, i: number) => (
                      <tr key={i} className={h.ResultCode === 2 ? 'history-success' : h.ResultCode === 4 ? 'history-failed' : ''}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{h.Date}</td>
                        <td>{h.Title || 'Unbekannt'}</td>
                        <td><span className={`history-status-badge history-status-${h.ResultCode}`}>{h.Status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

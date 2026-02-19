import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

export default function ServicesView() {
  const { showToast } = useAppContext();
  const [services, setServices] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getServices();
      setServices(data);
      setLoaded(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const controlService = useCallback(async (name: string, action: string) => {
    if (action === 'stop') {
      const confirm = await api.showConfirmDialog({
        type: 'warning', title: 'Dienst stoppen',
        message: `Dienst "${name}" stoppen?`, buttons: ['Abbrechen', 'Stoppen'], defaultId: 0,
      });
      if (confirm.response !== 1) return;
    }
    try {
      const result = await api.controlService(name, action);
      if (result.success) {
        showToast(name + (action === 'start' ? ' gestartet' : ' gestoppt'), 'success');
        setTimeout(load, 1000);
      } else {
        showToast('Fehler: ' + result.error, 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [showToast, load]);

  const changeStartType = useCallback(async (name: string, startType: string) => {
    try {
      const result = await api.setServiceStartType(name, startType);
      if (result.success) {
        showToast(`Starttyp für ${name} geändert`, 'success');
      } else {
        showToast('Fehler: ' + result.error, 'error');
        load();
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [showToast, load]);

  let filtered = services;
  if (filter !== 'all') filtered = filtered.filter(s => s.status === filter);
  if (search) filtered = filtered.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const running = services.filter(s => s.status === 'Running').length;
  const stopped = services.filter(s => s.status === 'Stopped').length;

  return (
    <>
      <div className="tool-toolbar">
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Wird geladen...' : 'Dienste laden'}
        </button>
        <select className="filter-input" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Alle</option>
          <option value="Running">Aktiv</option>
          <option value="Stopped">Gestoppt</option>
        </select>
        <input
          type="text" className="filter-input" placeholder="Dienst suchen..."
          style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)}
        />
        <div className="tool-summary">
          {loaded && `${services.length} Dienste \u00B7 ${running} aktiv \u00B7 ${stopped} gestoppt \u00B7 ${filtered.length} angezeigt`}
        </div>
      </div>
      <div className="tool-results">
        {!loaded && !loading && <div className="tool-placeholder">Klicke &quot;Dienste laden&quot; um Windows-Dienste anzuzeigen</div>}
        {loading && <div className="loading-spinner" />}
        {loaded && (
          <table className="tool-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>Status</th>
                <th>Anzeigename</th><th>Dienstname</th><th>Starttyp</th>
                <th style={{ width: 80 }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.name}>
                  <td>
                    <span className={`service-status ${s.status === 'Running' ? 'service-running' : 'service-stopped'}`}>
                      {s.status === 'Running' ? '\u25CF' : '\u25CB'}
                    </span>
                  </td>
                  <td>{s.displayName}</td>
                  <td className="path-col">{s.name}</td>
                  <td>
                    <select
                      className="service-starttype"
                      defaultValue={s.startType === 'Automatic' ? 'auto' : s.startType === 'Manual' ? 'demand' : 'disabled'}
                      onChange={e => changeStartType(s.name, e.target.value)}
                    >
                      <option value="auto">Automatisch</option>
                      <option value="demand">Manuell</option>
                      <option value="disabled">Deaktiviert</option>
                    </select>
                  </td>
                  <td>
                    {s.status === 'Stopped' ? (
                      <button className="btn-sm" onClick={() => controlService(s.name, 'start')} title="Starten">&#x25B6;</button>
                    ) : (
                      <button className="btn-sm" onClick={() => controlService(s.name, 'stop')} title="Stoppen">&#x25A0;</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import { useState, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { escapeHtml } from '../utils/escape';
import { isStub } from '../utils/stub';

export default function AutostartView() {
  const { showToast } = useAppContext();
  const [entries, setEntries] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAutoStartEntries();
      setEntries(data);
      setScanned(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const toggleEntry = useCallback(async (entry: any, enabled: boolean) => {
    try {
      const result = await api.toggleAutoStart(entry, enabled);
      if (isStub(result, 'Autostart')) return;
      if (result.success) {
        setEntries(prev => prev.map(e => e === entry ? { ...e, enabled } : e));
        showToast(entry.name + (enabled ? ' aktiviert' : ' deaktiviert'), 'success');
      } else {
        showToast('Fehler: ' + result.error, 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [showToast]);

  const deleteEntry = useCallback(async (entry: any) => {
    const confirmResult = await api.showConfirmDialog({
      type: 'warning',
      title: 'Autostart-Eintrag löschen',
      message: `"${entry.name}" aus dem Autostart entfernen?`,
      buttons: ['Abbrechen', 'Löschen'],
      defaultId: 0,
    });
    if (confirmResult.response !== 1) return;
    try {
      const result = await api.deleteAutoStart(entry);
      if (isStub(result, 'Autostart-Eintrag löschen')) return;
      if (result.success) {
        showToast(entry.name + ' entfernt', 'success');
        scan();
      } else {
        showToast('Fehler: ' + result.error, 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }, [showToast, scan]);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.source === filter);

  return (
    <>
      <div className="tool-toolbar">
        <button className="btn btn-primary" onClick={scan} disabled={loading}>
          {loading ? 'Wird geladen...' : 'Autostart laden'}
        </button>
        <select className="filter-input" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Alle Quellen</option>
          <option value="registry">Registry</option>
          <option value="folder">Startordner</option>
          <option value="task">Aufgabenplanung</option>
        </select>
        <div className="tool-summary">
          {scanned && `${entries.length} Einträge gesamt \u00B7 ${filtered.length} angezeigt`}
        </div>
      </div>
      <div className="tool-results">
        {!scanned && !loading && (
          <div className="tool-placeholder">Klicke &quot;Autostart laden&quot; um alle Autostart-Einträge anzuzeigen</div>
        )}
        {loading && <div className="loading-spinner" />}
        {scanned && filtered.length === 0 && (
          <div className="tool-placeholder">Keine Autostart-Einträge gefunden</div>
        )}
        {scanned && filtered.length > 0 && (
          <table className="tool-table">
            <thead>
              <tr><th>Name</th><th>Befehl</th><th>Quelle</th><th>Status</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={i} className={entry.exists === false ? 'autostart-invalid' : ''}>
                  <td className="name-col">{entry.name}</td>
                  <td className="path-col" title={entry.command}>{entry.command}</td>
                  <td>{entry.locationLabel}</td>
                  <td>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(e) => toggleEntry(entry, e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    {entry.exists === false && <span className="badge-invalid">Ungültig</span>}
                  </td>
                  <td>
                    <button className="btn-sm btn-danger" onClick={() => deleteEntry(entry)} title="Eintrag löschen">
                      &#x2715;
                    </button>
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

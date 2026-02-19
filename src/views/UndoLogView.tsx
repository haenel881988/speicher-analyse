import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

interface UndoEntry {
  id: string;
  timestamp_ms: number;
  action_type: string;
  description: string;
  can_undo: boolean;
  undone: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  delete_trash: 'Papierkorb',
  delete_permanent: 'Endgültig gelöscht',
  file_move: 'Verschoben',
  toggle_autostart: 'Autostart',
  delete_autostart: 'Autostart gelöscht',
  privacy_setting: 'Datenschutz',
};

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function UndoLogView() {
  const { showToast } = useAppContext();
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    try {
      const data = await api.getUndoLog();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast('Aktionsprotokoll konnte nicht geladen werden: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleUndo = useCallback(async (id: string) => {
    try {
      const result = await api.undoAction(id);
      showToast(result.message || 'Aktion rückgängig gemacht', 'success');
      loadEntries();
    } catch (err: any) {
      showToast('Rückgängig fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast, loadEntries]);

  const handleClear = useCallback(async () => {
    if (!confirm('Gesamtes Aktionsprotokoll leeren? Dies kann nicht rückgängig gemacht werden.')) return;
    try {
      await api.clearUndoLog();
      setEntries([]);
      showToast('Aktionsprotokoll geleert', 'success');
    } catch (err: any) {
      showToast('Leeren fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast]);

  if (loading) return <div className="loading-spinner" />;

  return (
    <div className="view-container undo-log-view">
      <div className="view-header">
        <h2>Aktionsprotokoll</h2>
        <p className="view-description">Alle Änderungen an Dateien, Autostart und Datenschutz-Einstellungen werden hier protokolliert.</p>
      </div>

      <div className="undo-log-toolbar">
        <span className="undo-log-count">{entries.length} Einträge</span>
        {entries.length > 0 && (
          <button className="btn btn-secondary" onClick={handleClear}>Protokoll leeren</button>
        )}
        <button className="btn btn-secondary" onClick={loadEntries}>Aktualisieren</button>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Aktionen protokolliert.</p>
          <p className="text-muted">Aktionen wie Dateien löschen, verschieben oder Einstellungen ändern werden hier automatisch aufgezeichnet.</p>
        </div>
      ) : (
        <div className="undo-log-list">
          {entries.map(entry => (
            <div key={entry.id} className={`undo-log-entry ${entry.undone ? 'undone' : ''}`}>
              <div className="undo-log-indicator">
                <span className={`undo-dot ${entry.can_undo && !entry.undone ? 'reversible' : entry.undone ? 'undone' : 'permanent'}`}
                  title={entry.can_undo ? (entry.undone ? 'Rückgängig gemacht' : 'Umkehrbar') : 'Nicht umkehrbar'} />
              </div>
              <div className="undo-log-content">
                <div className="undo-log-description">{entry.description}</div>
                <div className="undo-log-meta">
                  <span className="undo-log-type">{ACTION_LABELS[entry.action_type] || entry.action_type}</span>
                  <span className="undo-log-time">{formatTimestamp(entry.timestamp_ms)}</span>
                </div>
              </div>
              <div className="undo-log-actions">
                {entry.can_undo && !entry.undone && (
                  <button className="btn btn-sm" onClick={() => handleUndo(entry.id)} title="Rückgängig machen">
                    Rückgängig
                  </button>
                )}
                {entry.undone && <span className="undo-log-badge-undone">Rückgängig</span>}
                {!entry.can_undo && <span className="undo-log-badge-permanent">Nicht umkehrbar</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

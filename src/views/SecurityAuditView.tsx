import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

interface AuditCheck {
  id: string;
  name: string;
  status: 'ok' | 'warning' | 'danger' | 'error';
  detail: string;
}

interface DiffItem {
  label: string;
  oldStatus: string;
  newStatus: string;
  newMessage: string;
  improved: boolean;
}

interface AuditResult {
  checks: AuditCheck[];
  diff?: DiffItem[];
  timestamp?: string;
}

interface HistoryEntry {
  checks: AuditCheck[];
  timestamp: string;
}

export default function SecurityAuditView() {
  const { showToast } = useAppContext();
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    (async () => {
      try {
        const h = await api.getAuditHistory();
        setHistory(h);
        setLoaded(true);
      } catch (e: any) {
        showToast('Fehler beim Laden der Audit-Historie: ' + e.message, 'error');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runAudit = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const checks = await api.runSecurityAudit();
      // Backend returns flat array of checks — wrap in AuditResult structure
      setAuditResult({
        checks: Array.isArray(checks) ? checks : (checks as any).checks || [],
        timestamp: new Date().toISOString(),
      });
      const h = await api.getAuditHistory();
      setHistory(h);
    } catch (e: any) {
      showToast('Sicherheits-Check fehlgeschlagen: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, showToast]);

  const generateReport = useCallback(async () => {
    try {
      const data = auditResult || (history.length > 0 ? history[history.length - 1] : null);
      if (!data) return;
      let scoreData = null;
      try { scoreData = await api.getSystemScore({}); } catch { /* optional */ }
      let connections = null, summary = null;
      try { [summary, connections] = await Promise.all([api.getNetworkSummary(), api.getGroupedConnections()]); } catch { /* optional */ }
      await api.generateSecurityReport({ auditResult: data, scoreData, connections, summary, devices: [] });
      showToast('Bericht wurde erstellt', 'success');
    } catch (e: any) {
      showToast('Bericht konnte nicht erstellt werden: ' + e.message, 'error');
    }
  }, [auditResult, history, showToast]);

  const currentChecks = auditResult?.checks || (history.length > 0 ? history[history.length - 1].checks : null);
  const lastScanTime = auditResult?.timestamp
    ? new Date(auditResult.timestamp).toLocaleString('de-DE')
    : (history.length > 0 ? new Date(history[history.length - 1].timestamp).toLocaleString('de-DE') : null);

  const okCount = currentChecks?.filter(c => c.status === 'ok').length || 0;
  const warnCount = currentChecks?.filter(c => c.status === 'warning').length || 0;
  const dangerCount = currentChecks?.filter(c => c.status === 'danger').length || 0;

  const statusLabel = (status: string) => {
    switch (status) {
      case 'ok': return <span className="security-label-ok">OK</span>;
      case 'warning': return <span className="security-label-warn">Warnung</span>;
      case 'danger': return <span className="security-label-danger">Kritisch</span>;
      default: return <span className="security-label-error">Fehler</span>;
    }
  };

  const checkIcon = (status: string) => {
    switch (status) {
      case 'ok': return '\u2714';
      case 'warning': return '\u26A0';
      case 'danger': return '\u2718';
      default: return '?';
    }
  };

  return (
    <div className="security-page">
      <div className="security-header">
        <h2>Sicherheits-Check</h2>
        {lastScanTime && <span className="network-timestamp">Letzter Scan: {lastScanTime}</span>}
      </div>
      <div className="security-toolbar">
        <button className="network-btn" onClick={runAudit} disabled={loading}>
          {loading ? 'Wird geprüft...' : 'Jetzt prüfen'}
        </button>
        {history.length > 0 && (
          <button className="network-btn network-btn-secondary" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Ergebnisse anzeigen' : `Historie (${history.length} Scans)`}
          </button>
        )}
        {(auditResult || history.length > 0) && (
          <button className="network-btn network-btn-secondary" onClick={generateReport}>Bericht erstellen (PDF)</button>
        )}
      </div>

      {loading && (
        <div className="loading-state">Sicherheits-Checks werden durchgeführt...<br /><small>Das kann bis zu 30 Sekunden dauern.</small></div>
      )}

      {!loading && showHistory && (
        <div className="security-history">
          <h3>Scan-Historie</h3>
          {history.length === 0 ? (
            <div className="network-empty">Keine Historie vorhanden.</div>
          ) : (
            <div className="security-history-list">
              {[...history].reverse().slice(0, 20).map((entry, i) => {
                const date = new Date(entry.timestamp).toLocaleString('de-DE');
                const eOk = entry.checks.filter(c => c.status === 'ok').length;
                const eWarn = entry.checks.filter(c => c.status === 'warning').length;
                const eDanger = entry.checks.filter(c => c.status === 'danger').length;
                return (
                  <div className="security-history-entry" key={i}>
                    <span className="security-history-date">{date}</span>
                    <span className="security-history-stats">
                      <span className="security-dot security-dot-ok" />{eOk}
                      <span className="security-dot security-dot-warn" />{eWarn}
                      <span className="security-dot security-dot-danger" />{eDanger}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && !showHistory && (
        <>
          {/* Diff */}
          {auditResult?.diff && auditResult.diff.length > 0 && (
            <div className="security-diff">
              <h3>Änderungen seit dem letzten Scan</h3>
              {auditResult.diff.map((d, i) => (
                <div key={i} className={`security-diff-item ${d.improved ? 'security-diff-improved' : 'security-diff-degraded'}`}>
                  <span className="security-diff-icon">{d.improved ? '\u25B2' : '\u25BC'}</span>
                  <strong>{d.label}</strong>: {statusLabel(d.oldStatus)} &rarr; {statusLabel(d.newStatus)}
                  <div className="security-diff-detail">{d.newMessage}</div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {currentChecks && currentChecks.length > 0 && (
            <>
              <div className="security-summary">
                <div className="security-summary-item security-summary-ok">
                  <span className="security-summary-count">{okCount}</span>
                  <span className="security-summary-label">In Ordnung</span>
                </div>
                <div className="security-summary-item security-summary-warn">
                  <span className="security-summary-count">{warnCount}</span>
                  <span className="security-summary-label">Warnungen</span>
                </div>
                <div className="security-summary-item security-summary-danger">
                  <span className="security-summary-count">{dangerCount}</span>
                  <span className="security-summary-label">Kritisch</span>
                </div>
              </div>
              <div className="security-checks">
                {currentChecks.map((c, i) => (
                  <div key={i} className={`security-check-card security-status-${c.status}`}>
                    <div className="security-check-icon">{checkIcon(c.status)}</div>
                    <div className="security-check-content">
                      <div className="security-check-label">{c.name}</div>
                      <div className="security-check-message">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!currentChecks && loaded && (
            <div className="network-empty">Noch kein Sicherheits-Check durchgeführt. Klicke &quot;Jetzt prüfen&quot; um den Check zu starten.</div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';


function formatHours(hours: number | null): string {
  if (hours == null) return '-';
  if (hours < 24) return hours + ' h';
  const days = Math.floor(hours / 24);
  if (days < 365) return days + ' Tage';
  const years = (days / 365).toFixed(1);
  return years + ' Jahre';
}

export default function SmartView() {
  const { showToast } = useAppContext();
  const [disks, setDisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDiskHealth();
      setDisks(data);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded) loadData();
  }, [loaded, loadData]);

  const refresh = useCallback(() => {
    setLoaded(false);
  }, []);

  const copyAllData = useCallback(() => {
    if (disks.length === 0) return;
    const lines: string[] = ['Festplatten-Gesundheit (S.M.A.R.T.)', ''];
    for (const d of disks) {
      const sizeGB = (d.sizeBytes / (1024 ** 3)).toFixed(1);
      lines.push(`${d.name || d.model}`);
      lines.push(`  Typ: ${d.mediaType} | ${sizeGB} GB | ${d.busType}`);
      lines.push(`  Seriennummer: ${d.serial || '-'}`);
      lines.push(`  Gesundheitsscore: ${d.healthScore}/100 (${d.riskLevel})`);
      lines.push(`  Status: ${d.healthStatus}`);
      if (d.temperature != null) lines.push(`  Temperatur: ${d.temperature} °C`);
      if (d.powerOnHours != null) lines.push(`  Betriebsstunden: ${formatHours(d.powerOnHours)}`);
      if (d.wearLevel != null) lines.push(`  Verschleiß: ${d.wearLevel}%`);
      lines.push(`  Lese-Fehler: ${d.readErrors || 0}`);
      lines.push(`  Schreib-Fehler: ${d.writeErrors || 0}`);
      lines.push(`  Partitionen: ${d.partitions} (${d.partitionStyle})`);
      lines.push('');
    }
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Festplatten-Daten in Zwischenablage kopiert', 'success');
  }, [disks, showToast]);

  if (loading) {
    return <div className="loading-state">Festplatten werden analysiert...</div>;
  }

  if (error) {
    return (
      <div className="error-state" style={{ padding: 24 }}>
        <p><strong>Fehler beim Laden der Festplatten-Daten:</strong></p>
        <p style={{ color: 'var(--text-secondary)', margin: '8px 0' }}>{error}</p>
        <button className="network-btn" onClick={refresh} style={{ marginTop: 12 }}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (disks.length === 0) {
    return <div className="empty-state">Keine Festplatten gefunden</div>;
  }

  return (
    <div className="smart-page">
      <div className="smart-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <h2 className="smart-title" style={{ margin: 0 }}>Festplatten-Gesundheit (S.M.A.R.T.)</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={copyAllData} title="Alle Daten in die Zwischenablage kopieren">Kopieren</button>
          <button className="btn" onClick={refresh} title="Daten neu laden">Aktualisieren</button>
        </div>
      </div>
      <div className="smart-grid">
        {disks.map((d, i) => <DiskCard key={i} disk={d} />)}
      </div>
    </div>
  );
}

function DiskCard({ disk: d }: { disk: any }) {
  const scoreClass = d.riskLevel === 'safe' ? 'score-good' : d.riskLevel === 'moderate' ? 'score-warn' : 'score-bad';
  const sizeGB = (d.sizeBytes / (1024 ** 3)).toFixed(1);
  const scoreLabel = d.riskLevel === 'safe' ? 'Gesund' : d.riskLevel === 'moderate' ? 'Auffällig' : 'Kritisch';

  const attrs = [];
  if (d.temperature != null) attrs.push({ label: 'Temperatur', value: d.temperature + ' °C', warn: d.temperature > 50 });
  if (d.powerOnHours != null) attrs.push({ label: 'Betriebsstunden', value: formatHours(d.powerOnHours), warn: d.powerOnHours > 35000 });
  if (d.wearLevel != null) attrs.push({ label: 'Verschleiß', value: d.wearLevel + '%', warn: d.wearLevel > 80 });
  attrs.push({ label: 'Lese-Fehler', value: String(d.readErrors || 0), warn: d.readErrors > 0 });
  attrs.push({ label: 'Schreib-Fehler', value: String(d.writeErrors || 0), warn: d.writeErrors > 0 });
  attrs.push({ label: 'Status', value: d.healthStatus, warn: d.healthStatus !== 'Healthy' });

  return (
    <div className="smart-disk-card">
      <div className="smart-disk-header">
        <div className={`smart-disk-score ${scoreClass}`}>
          <span className="smart-score-num">{d.healthScore}</span>
          <span className="smart-score-label">{scoreLabel}</span>
        </div>
        <div className="smart-disk-info">
          <strong>{d.name || d.model}</strong>
          <span className="smart-disk-meta">{d.mediaType} | {sizeGB} GB | {d.busType}</span>
          <span className="smart-disk-meta">{d.serial || ''}</span>
        </div>
      </div>
      <div className="smart-disk-attrs">
        {attrs.map((a, i) => (
          <div key={i} className={`smart-attr ${a.warn ? 'smart-attr-warn' : ''}`}>
            <span className="smart-attr-label">{a.label}</span>
            <span className="smart-attr-value">{a.value}</span>
          </div>
        ))}
      </div>
      <div className="smart-disk-partitions">
        {d.partitions} Partition{d.partitions !== 1 ? 'en' : ''} ({d.partitionStyle})
      </div>
    </div>
  );
}

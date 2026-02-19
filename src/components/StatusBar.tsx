import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatNumber, formatBytes, formatDuration } from '../utils/format';

interface StatusBarProps {
  statusText: string;
  statusLoading: boolean;
}

export function ProgressBar() {
  const { scanning, lastScanProgress } = useAppContext();
  const [progressText, setProgressText] = useState('');
  const [progressPath, setProgressPath] = useState('');
  const [active, setActive] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Exposed via custom event for scan updates
  useEffect(() => {
    const onProgress = (e: CustomEvent) => {
      const p = e.detail;
      setProgressText(
        `${formatNumber(p.dirs_scanned)} Ordner \u00B7 ${formatNumber(p.files_found)} Dateien \u00B7 ${formatBytes(p.total_size)} \u00B7 ${formatDuration(p.elapsed_seconds)}`
      );
      setProgressPath(p.current_path);
      setActive(true);
      setAnimating(true);
    };
    const onComplete = (e: CustomEvent) => {
      const p = e.detail;
      setProgressText(
        `Fertig! ${formatNumber(p.dirs_scanned)} Ordner \u00B7 ${formatNumber(p.files_found)} Dateien \u00B7 ${formatBytes(p.total_size)} \u00B7 ${formatDuration(p.elapsed_seconds)}` +
        (p.errors_count > 0 ? ` \u00B7 ${p.errors_count} Fehler` : '')
      );
      setAnimating(false);
      setTimeout(() => setActive(false), 3000);
    };
    const onError = (e: CustomEvent) => {
      setProgressText('Fehler: ' + (e.detail?.current_path || 'Unbekannt'));
      setAnimating(false);
    };

    document.addEventListener('scan-ui-progress', onProgress as EventListener);
    document.addEventListener('scan-ui-complete', onComplete as EventListener);
    document.addEventListener('scan-ui-error', onError as EventListener);
    return () => {
      document.removeEventListener('scan-ui-progress', onProgress as EventListener);
      document.removeEventListener('scan-ui-complete', onComplete as EventListener);
      document.removeEventListener('scan-ui-error', onError as EventListener);
    };
  }, []);

  return (
    <footer id="scan-progress" className={active ? 'active' : ''}>
      <div className="progress-text" id="progress-stats">{progressText}</div>
      <div className="progress-bar-wrap">
        <div
          className={`progress-bar-fill ${animating ? 'animating' : ''}`}
          id="progress-bar"
          style={{ width: active ? '100%' : '0%' }}
        />
      </div>
      <div className="progress-path" id="progress-path">{progressPath}</div>
    </footer>
  );
}

export function StatusBar({ statusText, statusLoading }: StatusBarProps) {
  const { capabilities, batteryInfo } = useAppContext();

  return (
    <footer id="status-bar">
      <span
        id="status-spinner"
        className="mini-spinner"
        style={{ display: statusLoading ? 'inline-block' : 'none' }}
      />
      <span id="status-text">{statusText}</span>
      <span className="status-bar-right">
        {batteryInfo?.onBattery && !batteryInfo.isCharging && (
          <span id="battery-badge" className={`battery-badge ${batteryInfo.percentage !== null && batteryInfo.percentage < 20 ? 'critical' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="4" width="12" height="18" rx="2" /><line x1="10" y1="2" x2="14" y2="2" />
            </svg>
            <span id="battery-text">{batteryInfo.percentage !== null ? `${batteryInfo.percentage}%` : 'Akku'}</span>
          </span>
        )}
        {capabilities?.isAdmin && (
          <span id="admin-badge" className="admin-badge">Admin</span>
        )}
      </span>
    </footer>
  );
}

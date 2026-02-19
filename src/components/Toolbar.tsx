import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface ToolbarProps {
  onScan: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onToggleTheme: () => void;
  onTogglePreview: () => void;
  onDriveChange: (path: string) => void;
  selectedDrive: string;
}

export function Toolbar({
  onScan, onExportCsv, onExportPdf, onToggleTheme, onTogglePreview,
  onDriveChange, selectedDrive,
}: ToolbarProps) {
  const { drives, scanning } = useAppContext();

  return (
    <header id="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-brand">Speicher Analyse</span>
        <span className="toolbar-version">v7.2.1</span>
      </div>
      <div className="toolbar-center">
        <div className="toolbar-scan-group">
          <select
            id="toolbar-drive-select"
            className="toolbar-select"
            title="Laufwerk auswählen"
            value={selectedDrive}
            onChange={(e) => onDriveChange(e.target.value)}
            disabled={scanning}
          >
            <option value="">Laufwerk...</option>
            {drives.map(drive => (
              <option
                key={drive.mountpoint}
                value={drive.mountpoint}
                title={`${drive.device} - ${formatBytes(drive.used)} / ${formatBytes(drive.total)}`}
              >
                {drive.mountpoint.replace('\\', '')} {formatBytes(drive.free)} frei ({drive.fstype})
              </option>
            ))}
          </select>
          <button
            id="toolbar-scan-btn"
            className="btn btn-primary toolbar-scan-btn"
            onClick={onScan}
            disabled={scanning}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Analyse starten</span>
          </button>
        </div>
      </div>
      <div className="toolbar-right">
        <button className="toolbar-icon-btn" onClick={onExportCsv} title="CSV Export" aria-label="CSV Export">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </button>
        <button className="toolbar-icon-btn" onClick={onExportPdf} title="PDF Export" aria-label="PDF Export">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </button>
        <button className="toolbar-icon-btn" onClick={onToggleTheme} title="Theme wechseln" aria-label="Theme wechseln">
          <svg id="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>
        <button className="toolbar-icon-btn" onClick={onTogglePreview} title="Vorschau-Panel (Ctrl+P)" aria-label="Vorschau-Panel umschalten">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
    </header>
  );
}

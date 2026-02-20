import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber } from '../utils/format';

interface CardProps {
  icon: string;
  title: string;
  value: string;
  detail: string;
  clickable?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

function DashCard({ icon, title, value, detail, clickable, loading, onClick }: CardProps) {
  return (
    <div
      className={`dash-card ${clickable ? 'clickable' : ''} ${loading ? 'loading' : ''}`}
      onClick={clickable ? onClick : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      <div className="dash-card-icon">{icon}</div>
      <div className="dash-card-title">{title}</div>
      <div className="dash-card-value">{value}</div>
      <div className="dash-card-detail">{detail}</div>
    </div>
  );
}

export default function DashboardView() {
  const { lastScanProgress, setActiveTab } = useAppContext();
  const s = lastScanProgress || {} as any;

  const navigate = useCallback((tab: string) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Analyse-Übersicht</h2>
      </div>
      <div className="dashboard-cards" id="dashboard-cards">
        <DashCard
          icon="&#x1F4BE;"
          title="Speicherbelegung"
          value={formatBytes(s.total_size || 0)}
          detail={`${formatNumber(s.files_found || 0)} Dateien \u00B7 ${formatNumber(s.dirs_scanned || 0)} Ordner`}
        />
        <DashCard
          icon="&#x1F5D1;"
          title="Bereinigung"
          value="Datenträger bereinigen"
          detail="Temporäre Dateien, Caches, Logs"
          clickable
          onClick={() => navigate('cleanup')}
        />
        <DashCard
          icon="&#x1F4C5;"
          title="Alte Dateien"
          value="Alte Dateien finden"
          detail="Dateien die lange nicht genutzt wurden"
          clickable
          onClick={() => navigate('old-files')}
        />
        <DashCard
          icon="&#x1F4CB;"
          title="Duplikate"
          value="Duplikate suchen"
          detail="Doppelte Dateien identifizieren"
          clickable
          onClick={() => navigate('duplicates')}
        />
        <DashCard
          icon="&#x1F4E6;"
          title="Apps"
          value="Apps verwalten"
          detail="Programme, Updates, Autostart"
          clickable
          onClick={() => navigate('apps')}
        />
        <DashCard
          icon="&#x1F50D;"
          title="Diagnose"
          value="PC-Gesundheitscheck"
          detail="Speicher, Festplatten, Datenschutz"
          clickable
          onClick={() => navigate('health-check')}
        />
      </div>
    </div>
  );
}

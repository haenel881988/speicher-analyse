import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { TabRouter } from './components/TabRouter';
import { ProgressBar, StatusBar } from './components/StatusBar';
import { ToastContainer } from './components/Toast';
import { useTauriEvent } from './hooks/useTauriEvent';
import * as api from './api/tauri-api';
import { formatBytes, formatNumber } from './utils/format';
import { setStubToastCallback } from './utils/stub';
import './style.css';

const TerminalPanel = lazy(() => import('./views/TerminalView'));

function AppInner() {
  const ctx = useAppContext();
  const [selectedDrive, setSelectedDrive] = useState('');
  const [statusText, setStatusText] = useState('Bereit');
  const [statusLoading, setStatusLoading] = useState(false);
  const [scanProgressData, setScanProgressData] = useState<any>(null);
  const [scanCompleteData, setScanCompleteData] = useState<any>(null);
  const [scanErrorData, setScanErrorData] = useState<any>(null);
  const batteryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabLoadedRef = useRef<Record<string, boolean>>({});

  // Theme — synced to DOM and localStorage via context
  useEffect(() => {
    document.documentElement.dataset.theme = ctx.theme;
    localStorage.setItem('speicher-analyse-theme', ctx.theme);
    api.setPreference('theme', ctx.theme).catch(() => {});
  }, [ctx.theme]);

  // Register stub toast callback
  useEffect(() => {
    setStubToastCallback((msg, type) => ctx.showToast(msg, type as any));
  }, [ctx.showToast]);

  // Load drives on mount
  useEffect(() => {
    (async () => {
      try {
        const drives = await api.getDrives();
        ctx.setDrives(drives);
        const cDrive = drives.find((d: any) => d.mountpoint.toUpperCase().startsWith('C'));
        if (cDrive) setSelectedDrive(cDrive.mountpoint);
      } catch { /* ignore */ }

      // System capabilities
      try {
        const caps = await api.getSystemCapabilities();
        ctx.setCapabilities(caps);
      } catch { /* ignore */ }

      // Battery monitoring
      try {
        const status = await api.getBatteryStatus();
        if (status.hasBattery === false) {
          ctx.setBatteryInfo({ onBattery: false, percentage: null, isCharging: false });
        } else {
          updateBattery();
          batteryIntervalRef.current = setInterval(updateBattery, 30000);
        }
      } catch { /* ignore */ }

      // Session restore
      try {
        const restored = await api.getRestoredSession();
        if (restored?.sessions?.length > 0) {
          const progress = restored.sessions[0];
          ctx.setScanId(progress.scan_id);
          ctx.setCurrentPath(progress.current_path);
          ctx.setLastScanProgress(progress);

          const driveLetter = progress.current_path.substring(0, 3).toUpperCase();
          setSelectedDrive(prev => {
            // Find matching drive
            return prev || progress.current_path.substring(0, 3);
          });

          setStatusText('Session wiederhergestellt');
          ctx.showToast(
            `Scan von ${progress.current_path} wiederhergestellt — ${formatNumber(progress.dirs_scanned)} Ordner, ${formatNumber(progress.files_found)} Dateien`,
            'success'
          );
        }
      } catch (err) {
        console.error('[Session] Restore FEHLER:', err);
      }
    })();

    return () => {
      if (batteryIntervalRef.current) clearInterval(batteryIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateBattery() {
    try {
      const status = await api.getBatteryStatus();
      if (status.hasBattery === false) {
        ctx.setBatteryInfo({ onBattery: false, percentage: null, isCharging: false });
        if (batteryIntervalRef.current) {
          clearInterval(batteryIntervalRef.current);
          batteryIntervalRef.current = null;
        }
        return;
      }
      let percentage: number | null = null;
      let isCharging = false;
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        percentage = Math.round(battery.level * 100);
        isCharging = battery.charging;
      }
      ctx.setBatteryInfo({ onBattery: status.onBattery, percentage, isCharging });
    } catch { /* ignore */ }
  }

  // Scan event listeners — data passed via props to ProgressBar
  useTauriEvent('scan-progress', (progress: any) => {
    setScanProgressData(progress);
    setScanCompleteData(null);
    setScanErrorData(null);
  });

  useTauriEvent('scan-complete', (progress: any) => {
    ctx.setScanning(false);
    ctx.setLastScanProgress(progress);
    setScanCompleteData(progress);
    setScanProgressData(null);
    setStatusText('Bereit');
    setStatusLoading(false);
    tabLoadedRef.current = {};
  });

  useTauriEvent('scan-error', (error: any) => {
    ctx.setScanning(false);
    setScanErrorData(error);
    setScanProgressData(null);
    setStatusText('Scan-Fehler');
    setStatusLoading(false);
  });

  // Menu actions
  useTauriEvent('menu-action', (data: any) => {
    if (data.action === 'about') {
      api.showConfirmDialog({
        title: 'Über Speicher Analyse',
        message: 'Speicher Analyse v7.2.1\nDisk Space Analyzer & System Optimizer\n\nTauri v2 + Rust Backend',
        okLabel: 'OK',
      });
    }
  });

  const handleScan = useCallback(async () => {
    if (ctx.scanning || !selectedDrive) {
      if (!selectedDrive) ctx.showToast('Bitte zuerst ein Laufwerk auswählen', 'info');
      return;
    }

    // Battery warning
    if (ctx.batteryInfo?.onBattery && ctx.batteryInfo.percentage !== null && ctx.batteryInfo.percentage < 50) {
      const result = await api.showConfirmDialog({
        type: 'warning',
        title: 'Batteriebetrieb',
        message: `Akku bei ${ctx.batteryInfo.percentage}%. Scans verbrauchen viel Energie.\n\nTrotzdem fortfahren?`,
        buttons: ['Abbrechen', 'Fortfahren'],
        defaultId: 0,
      });
      if (result.response !== 1) return;
    }

    ctx.setScanning(true);
    ctx.setCurrentPath(selectedDrive);
    tabLoadedRef.current = {};
    setStatusText('Laufwerk wird gescannt...');
    setStatusLoading(true);

    try {
      const { scan_id } = await api.startScan(selectedDrive);
      ctx.setScanId(scan_id);
    } catch (e: any) {
      console.error('Scan start error:', e);
      ctx.setScanning(false);
      setStatusText('Bereit');
      setStatusLoading(false);
    }
  }, [ctx, selectedDrive]);

  const handleExportCsv = useCallback(() => {
    if (ctx.currentScanId) api.exportCSV(ctx.currentScanId);
    else ctx.showToast('Bitte zuerst einen Scan durchführen', 'info');
  }, [ctx]);

  const handleExportPdf = useCallback(() => {
    // PDF export via html2pdf (will be handled in the view)
    if (!ctx.currentScanId) ctx.showToast('Bitte zuerst einen Scan durchführen', 'info');
  }, [ctx]);

  const handleToggleTheme = useCallback(() => {
    ctx.setTheme(ctx.theme === 'dark' ? 'light' : 'dark');
  }, [ctx]);

  const handleTabChange = useCallback((tab: string) => {
    ctx.setActiveTab(tab);
    // Push UI state for session persistence
    api.updateUiState({
      activeTab: tab,
      activePath: ctx.currentPath,
      driveSelection: selectedDrive,
    }).catch(() => {});
  }, [ctx, selectedDrive]);

  // Keyboard shortcuts (Ctrl+` handled by TerminalView, Ctrl+F by ExplorerView)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (ctx.activeTab !== 'explorer') handleTabChange('explorer');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctx.activeTab, handleTabChange]);

  return (
    <div id="app">
      <Toolbar
        onScan={handleScan}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onToggleTheme={handleToggleTheme}
        onTogglePreview={() => {/* TODO */}}
        onDriveChange={setSelectedDrive}
        selectedDrive={selectedDrive}
      />
      <div id="app-layout">
        <Sidebar activeTab={ctx.activeTab} onTabChange={handleTabChange} />
        <main id="content">
          <TabRouter activeTab={ctx.activeTab} />
          <Suspense fallback={null}>
            <TerminalPanel />
          </Suspense>
        </main>
      </div>
      <ProgressBar scanProgress={scanProgressData} scanComplete={scanCompleteData} scanError={scanErrorData} />
      <StatusBar statusText={statusText} statusLoading={statusLoading} />
      <ToastContainer />
      <div id="treemap-tooltip" className="treemap-tooltip" style={{ display: 'none' }}>
        <div className="treemap-tooltip-name" id="tooltip-name" />
        <div className="treemap-tooltip-detail" id="tooltip-detail" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}

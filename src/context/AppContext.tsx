import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Drive {
  mountpoint: string;
  device: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
}

export interface ScanProgress {
  scan_id: string;
  current_path: string;
  files_found: number;
  dirs_scanned: number;
  total_size: number;
  elapsed_seconds: number;
  errors_count?: number;
}

interface AppState {
  drives: Drive[];
  currentScanId: string | null;
  currentPath: string | null;
  activeTab: string;
  scanning: boolean;
  capabilities: any;
  batteryInfo: { onBattery: boolean; percentage: number | null; isCharging: boolean } | null;
  lastScanProgress: ScanProgress | null;
  theme: string;
  pendingPdfPath: string | null;
  propertiesPath: string | null;
}

interface AppContextType extends AppState {
  setDrives: (drives: Drive[]) => void;
  setScanId: (id: string | null) => void;
  setCurrentPath: (path: string | null) => void;
  setActiveTab: (tab: string) => void;
  setScanning: (scanning: boolean) => void;
  setCapabilities: (caps: any) => void;
  setBatteryInfo: (info: AppState['batteryInfo']) => void;
  setLastScanProgress: (progress: ScanProgress | null) => void;
  setTheme: (theme: string) => void;
  setPendingPdfPath: (path: string | null) => void;
  setPropertiesPath: (path: string | null) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// Toast state — managed separately for simplicity
let toastCallback: ((msg: string, type: string) => void) | null = null;
export function setToastCallback(cb: typeof toastCallback) {
  toastCallback = cb;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    drives: [],
    currentScanId: null,
    currentPath: null,
    activeTab: 'tree',
    scanning: false,
    capabilities: null,
    batteryInfo: null,
    lastScanProgress: null,
    theme: localStorage.getItem('speicher-analyse-theme') || 'dark',
    pendingPdfPath: null,
    propertiesPath: null,
  });

  const setDrives = useCallback((drives: Drive[]) =>
    setState(s => ({ ...s, drives })), []);
  const setScanId = useCallback((currentScanId: string | null) =>
    setState(s => ({ ...s, currentScanId })), []);
  const setCurrentPath = useCallback((currentPath: string | null) =>
    setState(s => ({ ...s, currentPath })), []);
  const setActiveTab = useCallback((activeTab: string) =>
    setState(s => ({ ...s, activeTab })), []);
  const setScanning = useCallback((scanning: boolean) =>
    setState(s => ({ ...s, scanning })), []);
  const setCapabilities = useCallback((capabilities: any) =>
    setState(s => ({ ...s, capabilities })), []);
  const setBatteryInfo = useCallback((batteryInfo: AppState['batteryInfo']) =>
    setState(s => ({ ...s, batteryInfo })), []);
  const setLastScanProgress = useCallback((lastScanProgress: ScanProgress | null) =>
    setState(s => ({ ...s, lastScanProgress })), []);
  const setTheme = useCallback((theme: string) =>
    setState(s => ({ ...s, theme })), []);
  const setPendingPdfPath = useCallback((pendingPdfPath: string | null) =>
    setState(s => ({ ...s, pendingPdfPath })), []);
  const setPropertiesPath = useCallback((propertiesPath: string | null) =>
    setState(s => ({ ...s, propertiesPath })), []);

  const showToast = useCallback((message: string, type: string = 'info') => {
    if (toastCallback) toastCallback(message, type);
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      setDrives,
      setScanId,
      setCurrentPath,
      setActiveTab,
      setScanning,
      setCapabilities,
      setBatteryInfo,
      setLastScanProgress,
      setTheme,
      setPendingPdfPath,
      setPropertiesPath,
      showToast,
    }}>
      {children}
    </AppContext.Provider>
  );
}

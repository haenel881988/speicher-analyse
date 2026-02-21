import { lazy, Suspense, useState, useEffect } from 'react';

// Lazy-load all views for code splitting
const DashboardView = lazy(() => import('../views/DashboardView'));
const TreeView = lazy(() => import('../views/TreeView'));
const TreemapView = lazy(() => import('../views/TreemapView'));
const ChartsView = lazy(() => import('../views/ChartsView'));
const TopFilesView = lazy(() => import('../views/TopFilesView'));
const DuplicatesView = lazy(() => import('../views/DuplicatesView'));
const OldFilesView = lazy(() => import('../views/OldFilesView'));
const CleanupView = lazy(() => import('../views/CleanupView'));
const AppsView = lazy(() => import('../views/AppsView'));
const ExplorerView = lazy(() => import('../views/ExplorerView'));
const PrivacyView = lazy(() => import('../views/PrivacyView'));
const SmartView = lazy(() => import('../views/SmartView'));
const NetworkView = lazy(() => import('../views/NetworkView'));
const SystemProfilView = lazy(() => import('../views/SystemProfilView'));
const HealthCheckView = lazy(() => import('../views/HealthCheckView'));
const SettingsView = lazy(() => import('../views/SettingsView'));
const PdfEditorView = lazy(() => import('../views/PdfEditorView'));
const UndoLogView = lazy(() => import('../views/UndoLogView'));
const ScanHistoryView = lazy(() => import('../views/ScanHistoryView'));

const Loading = () => <div className="loading-state">Wird geladen...</div>;

interface TabRouterProps {
  activeTab: string;
}

const TAB_MAP: Record<string, React.LazyExoticComponent<any>> = {
  'dashboard': DashboardView,
  'tree': TreeView,
  'treemap': TreemapView,
  'types': ChartsView,
  'top100': TopFilesView,
  'duplicates': DuplicatesView,
  'old-files': OldFilesView,
  'cleanup': CleanupView,
  'apps': AppsView,
  'explorer': ExplorerView,
  'privacy': PrivacyView,
  'smart': SmartView,
  'network': NetworkView,
  'system-profil': SystemProfilView,
  'health-check': HealthCheckView,
  'settings': SettingsView,
  'pdf-editor': PdfEditorView,
  'undo-log': UndoLogView,
  'scan-history': ScanHistoryView,
};

export function TabRouter({ activeTab }: TabRouterProps) {
  // Track which tabs have been visited to keep them alive
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <div id="tab-content">
      {Array.from(visitedTabs).map(tabId => {
        const ViewComponent = TAB_MAP[tabId];
        if (!ViewComponent) return null;
        const isActive = tabId === activeTab;
        return (
          <div
            key={tabId}
            className={`tab-view ${isActive ? 'active' : ''}`}
          >
            <Suspense fallback={<Loading />}>
              <ViewComponent />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}

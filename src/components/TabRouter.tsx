import { lazy, Suspense } from 'react';

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
const ServicesView = lazy(() => import('../views/ServicesView'));
const OptimizerView = lazy(() => import('../views/OptimizerView'));
const ExplorerView = lazy(() => import('../views/ExplorerView'));
const PrivacyView = lazy(() => import('../views/PrivacyView'));
const SmartView = lazy(() => import('../views/SmartView'));
const SecurityAuditView = lazy(() => import('../views/SecurityAuditView'));
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
  'services': ServicesView,
  'optimizer': OptimizerView,
  'explorer': ExplorerView,
  'privacy': PrivacyView,
  'smart': SmartView,
  'security-audit': SecurityAuditView,
  'network': NetworkView,
  'system-profil': SystemProfilView,
  'health-check': HealthCheckView,
  'settings': SettingsView,
  'pdf-editor': PdfEditorView,
  'undo-log': UndoLogView,
  'scan-history': ScanHistoryView,
};

export function TabRouter({ activeTab }: TabRouterProps) {
  const ViewComponent = TAB_MAP[activeTab] || DashboardView;

  return (
    <div id="tab-content">
      <Suspense fallback={<Loading />}>
        <div className="tab-view active">
          <ViewComponent />
        </div>
      </Suspense>
    </div>
  );
}

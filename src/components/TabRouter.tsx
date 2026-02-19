import { lazy, Suspense } from 'react';
import { useAppContext } from '../context/AppContext';

// Lazy-load all views for code splitting
const DashboardView = lazy(() => import('../views/DashboardView'));
const TreeView = lazy(() => import('../views/TreeView'));
const TreemapView = lazy(() => import('../views/TreemapView'));
const ChartsView = lazy(() => import('../views/ChartsView'));
const TopFilesView = lazy(() => import('../views/TopFilesView'));
const DuplicatesView = lazy(() => import('../views/DuplicatesView'));
const OldFilesView = lazy(() => import('../views/OldFilesView'));
const CleanupView = lazy(() => import('../views/CleanupView'));
const AutostartView = lazy(() => import('../views/AutostartView'));
const ServicesView = lazy(() => import('../views/ServicesView'));
const OptimizerView = lazy(() => import('../views/OptimizerView'));
const UpdatesView = lazy(() => import('../views/UpdatesView'));
const ExplorerView = lazy(() => import('../views/ExplorerView'));
const PrivacyView = lazy(() => import('../views/PrivacyView'));
const SmartView = lazy(() => import('../views/SmartView'));
const SoftwareAuditView = lazy(() => import('../views/SoftwareAuditView'));
const SecurityAuditView = lazy(() => import('../views/SecurityAuditView'));
const NetworkView = lazy(() => import('../views/NetworkView'));
const SystemProfilView = lazy(() => import('../views/SystemProfilView'));
const HealthCheckView = lazy(() => import('../views/HealthCheckView'));
const SettingsView = lazy(() => import('../views/SettingsView'));
const PdfEditorView = lazy(() => import('../views/PdfEditorView'));

const Loading = () => <div className="loading-state">Wird geladen...</div>;

interface TabRouterProps {
  activeTab: string;
}

export function TabRouter({ activeTab }: TabRouterProps) {
  const { currentScanId, lastScanProgress } = useAppContext();

  return (
    <div id="tab-content">
      <Suspense fallback={<Loading />}>
        <TabPane active={activeTab === 'dashboard'}><DashboardView /></TabPane>
        <TabPane active={activeTab === 'tree'}><TreeView /></TabPane>
        <TabPane active={activeTab === 'treemap'}><TreemapView /></TabPane>
        <TabPane active={activeTab === 'types'}><ChartsView /></TabPane>
        <TabPane active={activeTab === 'top100'}><TopFilesView /></TabPane>
        <TabPane active={activeTab === 'duplicates'}><DuplicatesView /></TabPane>
        <TabPane active={activeTab === 'old-files'}><OldFilesView /></TabPane>
        <TabPane active={activeTab === 'cleanup'}><CleanupView /></TabPane>
        <TabPane active={activeTab === 'autostart'}><AutostartView /></TabPane>
        <TabPane active={activeTab === 'services'}><ServicesView /></TabPane>
        <TabPane active={activeTab === 'optimizer'}><OptimizerView /></TabPane>
        <TabPane active={activeTab === 'updates'}><UpdatesView /></TabPane>
        <TabPane active={activeTab === 'explorer'}><ExplorerView /></TabPane>
        <TabPane active={activeTab === 'privacy'}><PrivacyView /></TabPane>
        <TabPane active={activeTab === 'smart'}><SmartView /></TabPane>
        <TabPane active={activeTab === 'software-audit'}><SoftwareAuditView /></TabPane>
        <TabPane active={activeTab === 'security-audit'}><SecurityAuditView /></TabPane>
        <TabPane active={activeTab === 'network'}><NetworkView /></TabPane>
        <TabPane active={activeTab === 'system-profil'}><SystemProfilView /></TabPane>
        <TabPane active={activeTab === 'health-check'}><HealthCheckView /></TabPane>
        <TabPane active={activeTab === 'settings'}><SettingsView /></TabPane>
        <TabPane active={activeTab === 'pdf-editor'}><PdfEditorView /></TabPane>
      </Suspense>
    </div>
  );
}

function TabPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Keep mounted but hidden (preserve state like original app)
  return (
    <div className={`tab-view ${active ? 'active' : ''}`} style={{ display: active ? undefined : 'none' }}>
      {children}
    </div>
  );
}

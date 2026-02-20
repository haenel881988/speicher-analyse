import { useState, useEffect, useRef } from 'react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface NavItem {
  tab: string;
  label: string;
  icon: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'start', label: 'Start', items: [
      { tab: 'dashboard', label: 'Übersicht', icon: 'M3,3H10V10H3ZM14,3H21V10H14ZM3,14H10V21H3ZM14,14H21V21H14Z' },
      { tab: 'explorer', label: 'Explorer', icon: 'M2,3H22V21H2ZM2,9H22M9,21V9' },
      { tab: 'health-check', label: 'Diagnose', icon: 'M22,11.08V12a10,10,0,1,1-5.93-9.14M22,4L12,14.01L9,11.01' },
    ],
  },
  {
    id: 'speicher', label: 'Speicher', items: [
      { tab: 'types', label: 'Dateitypen', icon: 'M22,12A10,10,0,0,0,12,2v10z' },
      { tab: 'duplicates', label: 'Duplikate', icon: 'M8,2H21V15H8ZM2,9V22H15' },
      { tab: 'top100', label: 'Größte Dateien', icon: 'M8,6H21M8,12H21M8,18H21' },
      { tab: 'treemap', label: 'Treemap', icon: 'M3,3H10V12H3ZM14,3H21V8H14ZM14,12H21V21H14ZM3,16H10V21H3Z' },
      { tab: 'tree', label: 'Verzeichnisbaum', icon: 'M22,19a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h5l2,3h9a2,2,0,0,1,2,2z' },
    ],
  },
  {
    id: 'bereinigung', label: 'Bereinigung', items: [
      { tab: 'old-files', label: 'Alte Dateien', icon: 'M12,2A10,10,0,1,0,22,12A10,10,0,0,0,12,2ZM12,6V12L16,14' },
      { tab: 'cleanup', label: 'Datenträger', icon: 'M3,6H5H21M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2' },
    ],
  },
  {
    id: 'system', label: 'System', items: [
      { tab: 'apps', label: 'Apps', icon: 'M4,4H10V10H4ZM14,4H20V10H14ZM4,14H10V20H4ZM14,14H20V20H14Z' },
      { tab: 'services', label: 'Dienste', icon: 'M12,12m-3,0a3,3,0,1,0,6,0a3,3,0,1,0-6,0' },
      { tab: 'optimizer', label: 'Optimierung', icon: 'M12,20V10M18,20V4M6,20V16' },
      { tab: 'system-profil', label: 'System-Profil', icon: 'M2,3H22V17H2ZM8,21H16M12,17V21' },
    ],
  },
  {
    id: 'sicherheit', label: 'Sicherheit', items: [
      { tab: 'security-audit', label: 'Sicherheits-Check', icon: 'M12,22s8-4,8-10V5l-8-3-8,3v7c0,6,8,10,8,10z' },
      { tab: 'privacy', label: 'Datenschutz', icon: 'M12,22s8-4,8-10V5l-8-3-8,3v7c0,6,8,10,8,10z' },
      { tab: 'smart', label: 'Festplatten', icon: 'M12,5A9,3,0,1,0,12,5ZM3,5V19c0,1.66,4,3,9,3s9-1.34,9-3V5' },
      { tab: 'network', label: 'Netzwerk', icon: 'M2,2H22V10H2ZM2,14H22V22H2Z' },
    ],
  },
  {
    id: 'extras', label: 'Extras', items: [
      { tab: 'pdf-editor', label: 'PDF-Editor', icon: 'M14,2H6a2,2,0,0,0-2,2v16a2,2,0,0,0,2,2h12a2,2,0,0,0,2-2V8z' },
      { tab: 'undo-log', label: 'Aktionsprotokoll', icon: 'M3,12a9,9,0,1,0,9-9M3,3v6h6M12,7v5l4,2' },
      { tab: 'settings', label: 'Einstellungen', icon: 'M12,12m-3,0a3,3,0,1,0,6,0a3,3,0,1,0-6,0' },
    ],
  },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [expanded, setExpanded] = useState(() => localStorage.getItem('sidebar-expanded') === 'true');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const saved: Record<string, boolean> = {};
    NAV_GROUPS.forEach(g => {
      const val = localStorage.getItem('sidebar-group-' + g.id);
      saved[g.id] = val !== 'expanded';
    });
    return saved;
  });
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    localStorage.setItem('sidebar-expanded', String(expanded));
  }, [expanded]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      localStorage.setItem('sidebar-group-' + groupId, next[groupId] ? 'collapsed' : 'expanded');
      return next;
    });
  };

  // Auto-expand parent group of active tab
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.items.some(item => item.tab === activeTab) && collapsedGroups[group.id]) {
        setCollapsedGroups(prev => {
          const next = { ...prev, [group.id]: false };
          localStorage.setItem('sidebar-group-' + group.id, 'expanded');
          return next;
        });
        break;
      }
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside id="sidebar" ref={sidebarRef} className={expanded ? 'expanded' : ''}>
      <button
        id="sidebar-toggle"
        className="sidebar-toggle-btn"
        title="Sidebar ein-/ausklappen"
        onClick={() => setExpanded(e => !e)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <nav className="sidebar-nav" aria-label="Hauptnavigation">
        {NAV_GROUPS.map(group => (
          <div
            key={group.id}
            className={`sidebar-nav-group ${collapsedGroups[group.id] ? 'collapsed' : ''}`}
            data-group={group.id}
          >
            <div className="sidebar-nav-label" onClick={() => toggleGroup(group.id)}>
              {group.label}
              <svg className="sidebar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="sidebar-nav-group-items">
              {group.items.map(item => (
                <button
                  key={item.tab}
                  className={`sidebar-nav-btn ${activeTab === item.tab ? 'active' : ''}`}
                  data-tab={item.tab}
                  title={item.label}
                  onClick={() => onTabChange(item.tab)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="sidebar-resize-handle" id="sidebar-resize-handle" />
    </aside>
  );
}

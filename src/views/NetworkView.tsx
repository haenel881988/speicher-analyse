import { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

interface ConnectionGroup {
  processName: string;
  connectionCount: number;
  uniqueIPCount: number;
  uniqueIPs: string[];
  states: Record<string, number>;
  isRunning: boolean;
  hasTrackers: boolean;
  hasHighRisk: boolean;
  resolvedCompanies: string[];
  connections: any[];
}

interface BandwidthAdapter {
  name: string;
  description: string;
  status: string;
  linkSpeed: string;
  receivedBytes: number;
  sentBytes: number;
  receivedPackets: number;
  sentPackets: number;
  rxPerSec: number;
  txPerSec: number;
}

interface FeedEvent {
  type: 'NEU' | 'GESCHLOSSEN' | 'GEÄNDERT';
  timestamp: number;
  processName: string;
  remoteAddress: string;
  remotePort: number;
  state: string;
  prevState?: string;
  org?: string;
  country?: string;
  isTracker?: boolean;
  isHighRisk?: boolean;
}

const KNOWN_PORTS: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP',
  443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP',
  5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 9090: 'Mgmt',
};

const PORT_PROTOCOLS: Record<number, string> = {
  80: 'HTTP', 443: 'HTTPS', 22: 'SSH', 21: 'FTP', 53: 'DNS', 25: 'SMTP', 110: 'POP3',
  143: 'IMAP', 993: 'IMAPS', 3389: 'RDP', 5900: 'VNC', 8080: 'HTTP', 8443: 'HTTPS',
  3306: 'MySQL', 5432: 'PgSQL', 27017: 'MongoDB', 6379: 'Redis',
};

function countryFlag(cc: string | undefined): string {
  if (!cc || cc.length !== 2) return '';
  const upper = cc.toUpperCase();
  return String.fromCodePoint(upper.charCodeAt(0) + 127397, upper.charCodeAt(1) + 127397);
}

function isLocalIP(ip: string): boolean {
  if (!ip) return true;
  return ip === '0.0.0.0' || ip === '::' || ip === '::1' ||
    ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fe80:') || ip.startsWith('fd') || ip.startsWith('fc');
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '0 B/s';
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatLinkSpeed(s: string | undefined): string {
  if (!s || s === '-') return '\u2014';
  const m = s.match(/([\d.]+)\s*(Gbps|Mbps|Kbps|bps)/i);
  if (!m) return s;
  let mbits = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'gbps') mbits *= 1000;
  else if (u === 'kbps') mbits /= 1000;
  else if (u === 'bps') mbits /= 1000000;
  if (mbits >= 1000) return `${(mbits / 1000).toFixed(mbits % 1000 === 0 ? 0 : 1)} Gbit/s`;
  if (mbits >= 1) return `${mbits % 1 === 0 ? mbits.toFixed(0) : mbits.toFixed(1)} Mbit/s`;
  return `${(mbits * 1000).toFixed(0)} Kbit/s`;
}

const CARD_FILTER_LABELS: Record<string, string> = {
  established: 'Aktive Verbindungen', listening: 'Lauschende Ports', tracker: 'Tracker-Prozesse',
  highrisk: 'Hochrisiko-Prozesse', firmen: 'Prozesse mit Firmenzuordnung', remoteips: 'Prozesse mit Remote-IPs', udp: 'UDP-Endpunkte',
};

export default function NetworkView() {
  const { showToast } = useAppContext();
  const [loaded, setLoaded] = useState(false);
  const [groupedData, setGroupedData] = useState<ConnectionGroup[]>([]);
  const [bandwidth, setBandwidth] = useState<BandwidthAdapter[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [activeSubTab, setActiveSubTab] = useState('connections');
  const [filter, setFilter] = useState('');
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [detailLevel, setDetailLevel] = useState<'normal' | 'experte'>('normal');
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedPaused, setFeedPaused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<any>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [dnsExpanded, setDnsExpanded] = useState(false);
  const [dnsCache, setDnsCache] = useState<any[]>([]);
  const [wifiInfo, setWifiInfo] = useState<any>(null);
  const [bandwidthHistory, setBandwidthHistory] = useState<Record<string, any[]>>({});
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCount, setErrorCount] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const companyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sparklineChartsRef = useRef<Map<string, any>>(new Map());
  const isRefreshingRef = useRef(false);
  const feedPausedRef = useRef(false);
  const recordingRef = useRef(false);
  const activeSubTabRef = useRef('connections');

  useEffect(() => { feedPausedRef.current = feedPaused; }, [feedPaused]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { activeSubTabRef.current = activeSubTab; }, [activeSubTab]);

  // Load detail level preference
  useEffect(() => {
    api.getPreferences().then((prefs: any) => {
      if (prefs?.networkDetailLevel === 'experte') setDetailLevel('experte');
    }).catch(() => {});
  }, []);

  // Initial data load + delayed company resolution refresh
  useEffect(() => {
    refresh();
    companyTimerRef.current = setTimeout(() => refresh(), 12000);
    return () => {
      if (companyTimerRef.current) clearTimeout(companyTimerRef.current);
    };
  }, []);

  // Start/stop polling when mounted
  useEffect(() => {
    startPolling();
    return () => {
      stopPolling();
      stopFeedPolling();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      for (const [, chart] of sparklineChartsRef.current) chart.destroy();
      sparklineChartsRef.current.clear();
    };
  }, []);

  // Start/stop feed polling based on sub-tab
  useEffect(() => {
    if (activeSubTab === 'livefeed') {
      startFeedPolling();
    } else {
      stopFeedPolling();
    }
  }, [activeSubTab]);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const data = await api.getPollingData();
      setSummary(data.summary);
      setGroupedData(data.grouped || []);
      setBandwidth(data.bandwidth || []);
      setLastRefreshTime(new Date());
      setErrorMsg('');
      setErrorCount(0);
      setLoaded(true);
    } catch (err: any) {
      setErrorMsg(err.message);
      setLoaded(false);
      setErrorCount(prev => {
        const next = prev + 1;
        if (next >= 3) stopPolling();
        return next;
      });
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const pollBandwidth = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const [bw, history, wifi] = await Promise.all([
        api.getBandwidth(), api.getBandwidthHistory(), api.getWiFiInfo(),
      ]);
      setBandwidth(bw || []);
      setBandwidthHistory(history || {});
      setWifiInfo(wifi);
      setLastRefreshTime(new Date());
    } catch (err: any) {
      console.error('Bandwidth-Polling Fehler:', err);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollBandwidth();
    pollIntervalRef.current = setInterval(pollBandwidth, 5000);
  }, [pollBandwidth]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  }, []);

  const startFeedPolling = useCallback(() => {
    stopFeedPolling();
    loadRecordings();
    restoreRecordingStatus();
    pollConnectionDiff();
    feedPollRef.current = setInterval(pollConnectionDiff, 3000);
  }, []);

  const stopFeedPolling = useCallback(() => {
    if (feedPollRef.current) { clearInterval(feedPollRef.current); feedPollRef.current = null; }
  }, []);

  const pollConnectionDiff = useCallback(async () => {
    if (feedPausedRef.current) return;
    try {
      const diff = await api.getConnectionDiff();
      if (diff.events?.length > 0) {
        setFeedEvents(prev => [...diff.events, ...prev].slice(0, 500));
        if (recordingRef.current) {
          api.appendNetworkRecordingEvents(diff.events).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Connection-Diff Fehler:', err);
    }
  }, []);

  const loadRecordings = useCallback(async () => {
    try { setRecordings(await api.listNetworkRecordings()); } catch { setRecordings([]); }
  }, []);

  const restoreRecordingStatus = useCallback(async () => {
    try {
      const status = await api.getNetworkRecordingStatus();
      if (status.active) {
        setRecording(true);
        setRecordingStatus(status);
        if (!recordingTimerRef.current) {
          recordingTimerRef.current = setInterval(async () => {
            try { setRecordingStatus(await api.getNetworkRecordingStatus()); } catch {}
          }, 1000);
        }
      }
    } catch {}
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const result = await api.startNetworkRecording();
      if (result.success) {
        setRecording(true);
        setRecordingStatus({ eventCount: 0, elapsedSeconds: 0 });
        recordingTimerRef.current = setInterval(async () => {
          try { setRecordingStatus(await api.getNetworkRecordingStatus()); } catch {}
        }, 1000);
        showToast('Aufzeichnung gestartet', 'success');
      } else {
        showToast(result.error || 'Aufzeichnung konnte nicht gestartet werden', 'error');
      }
    } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
  }, [showToast]);

  const stopRecording = useCallback(async () => {
    try {
      const result = await api.stopNetworkRecording();
      setRecording(false);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      setRecordingStatus(null);
      if (result.success) {
        showToast(`Aufzeichnung gespeichert: ${result.eventCount} Ereignisse`, 'success');
        loadRecordings();
      }
    } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
  }, [showToast, loadRecordings]);

  const deleteRecording = useCallback(async (filename: string) => {
    const confirmed = await api.showConfirmDialog({ title: 'Aufzeichnung löschen', message: `"${filename}" wirklich löschen?`, okLabel: 'Löschen', cancelLabel: 'Abbrechen' });
    if (!confirmed?.response) return;
    const result = await api.deleteNetworkRecording(filename);
    if (result.success) { showToast('Aufzeichnung gelöscht', 'success'); loadRecordings(); }
    else showToast(result.error || 'Löschen fehlgeschlagen', 'error');
  }, [showToast, loadRecordings]);

  const handleDetailLevelChange = useCallback((level: 'normal' | 'experte') => {
    setDetailLevel(level);
    api.setPreference('networkDetailLevel', level);
  }, []);

  const toggleDns = useCallback(async () => {
    if (!dnsExpanded && dnsCache.length === 0) {
      try { setDnsCache(await api.getDnsCache()); } catch {}
    }
    setDnsExpanded(prev => !prev);
  }, [dnsExpanded, dnsCache.length]);

  const clearDnsCacheFn = useCallback(async () => {
    const result = await api.clearDnsCache();
    if (result.success) { showToast('DNS-Cache geleert', 'success'); setDnsCache([]); }
    else showToast('Fehler: ' + (result.error || 'unbekannt'), 'error');
  }, [showToast]);

  const renderSparklines = useCallback(() => {
    for (const [, chart] of sparklineChartsRef.current) chart.destroy();
    sparklineChartsRef.current.clear();
    const Chart = (window as any).Chart;
    if (!Chart) return;

    document.querySelectorAll('.network-sparkline').forEach((canvas: any) => {
      const name = canvas.dataset.adapter;
      const history = bandwidthHistory[name];
      if (!history || history.length < 2) return;

      const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: history.map(() => ''),
          datasets: [
            { data: history.map((h: any) => h.rx / 1024), borderColor: 'rgba(46,204,113,0.8)', backgroundColor: 'rgba(46,204,113,0.15)', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 },
            { data: history.map((h: any) => h.tx / 1024), borderColor: 'rgba(52,152,219,0.8)', backgroundColor: 'rgba(52,152,219,0.15)', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 },
          ],
        },
        options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } }, layout: { padding: 0 } },
      });
      sparklineChartsRef.current.set(name, chart);
    });
  }, [bandwidthHistory]);

  // Render sparklines when bandwidth data or tab changes
  useEffect(() => {
    if (loaded && activeSubTab === 'connections') renderSparklines();
  }, [loaded, activeSubTab, renderSparklines]);

  // Filter groups
  const getFilteredGroups = useCallback((): ConnectionGroup[] => {
    let groups = [...groupedData];
    groups.sort((a, b) => {
      const aIdle = a.processName.toLowerCase() === 'idle' || (a.states.TimeWait === a.connectionCount);
      const bIdle = b.processName.toLowerCase() === 'idle' || (b.states.TimeWait === b.connectionCount);
      if (aIdle !== bIdle) return aIdle ? 1 : -1;
      return b.connectionCount - a.connectionCount;
    });

    if (cardFilter) {
      switch (cardFilter) {
        case 'established': groups = groups.filter(g => g.states.Established > 0); break;
        case 'listening': groups = groups.filter(g => g.states.Listen > 0); break;
        case 'tracker': groups = groups.filter(g => g.hasTrackers); break;
        case 'highrisk': groups = groups.filter(g => g.hasHighRisk); break;
        case 'firmen': groups = groups.filter(g => (g.resolvedCompanies || []).length > 0); break;
        case 'remoteips': groups = groups.filter(g => g.uniqueIPCount > 0); break;
        case 'udp': groups = groups.filter(g => g.connections?.some((c: any) => c.protocol === 'UDP')); break;
      }
    }

    if (filter) {
      const q = filter.toLowerCase();
      groups = groups.filter(g =>
        g.processName.toLowerCase().includes(q) ||
        g.uniqueIPs.some(ip => ip.includes(q)) ||
        g.resolvedCompanies?.some(c => c.toLowerCase().includes(q)) ||
        g.connections.some((c: any) => c.resolved?.org?.toLowerCase().includes(q) || c.resolved?.isp?.toLowerCase().includes(q))
      );
    }
    return groups;
  }, [groupedData, cardFilter, filter]);

  // Error state
  if (errorMsg && !loaded) {
    return (
      <div className="network-page">
        <div className="network-header"><h2>Netzwerk-Monitor</h2></div>
        <div className="error-state" style={{ padding: 24 }}>
          <p><strong>Fehler beim Laden der Netzwerkdaten:</strong></p>
          <p style={{ color: 'var(--text-secondary)', margin: '8px 0' }}>{errorMsg}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0' }}>
            Mögliche Ursachen: PowerShell-Berechtigungen, Netzwerk-Cmdlets nicht verfügbar, oder Timeout.
          </p>
          {errorCount >= 3 && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Auto-Refresh wurde nach 3 Fehlern gestoppt.</p>}
          <button className="network-btn" onClick={() => { setErrorCount(0); refresh(); }} style={{ marginTop: 12 }}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  if (!loaded) return <div className="loading-state">Netzwerk wird analysiert...</div>;

  const s = summary || {};
  const timeStr = lastRefreshTime ? lastRefreshTime.toLocaleTimeString('de-DE') : '';
  const totalCompanies = new Set(groupedData.flatMap(g => g.resolvedCompanies || [])).size;
  const trackerCount = groupedData.filter(g => g.hasTrackers).length;
  const highRiskCount = groupedData.filter(g => g.hasHighRisk).length;
  const showToolbar = activeSubTab === 'connections' || activeSubTab === 'livefeed';
  const filteredGroups = getFilteredGroups();

  const recStatus = recordingStatus;
  const recElapsed = recStatus?.elapsedSeconds || 0;
  const recTimeStr = `${String(Math.floor(recElapsed / 60)).padStart(2, '0')}:${String(recElapsed % 60).padStart(2, '0')}`;

  return (
    <div className={`network-page network-tier-${detailLevel}`}>
      <div className="network-header">
        <h2>Netzwerk-Monitor</h2>
        <div className="network-header-controls">
          <div className="network-tier-toggle">
            <button className={`network-tier-btn ${detailLevel === 'normal' ? 'active' : ''}`} onClick={() => handleDetailLevelChange('normal')}>Normal</button>
            <button className={`network-tier-btn ${detailLevel === 'experte' ? 'active' : ''}`} onClick={() => handleDetailLevelChange('experte')}>Experte</button>
          </div>
          <button className="network-btn" onClick={refresh}>{'\u21BB'} Aktualisieren</button>
          {timeStr && <span className="network-timestamp">Stand: {timeStr}</span>}
          {pollIntervalRef.current && <span className="network-live-indicator"><span className="network-live-dot" /> Live</span>}
        </div>
      </div>

      <div className="network-tabs">
        <button className={`network-tab ${activeSubTab === 'connections' ? 'active' : ''}`} onClick={() => setActiveSubTab('connections')}>
          Verbindungen <span className="network-tab-count">{s.totalConnections || 0}</span>
        </button>
        <button className={`network-tab ${activeSubTab === 'livefeed' ? 'active' : ''}`} onClick={() => setActiveSubTab('livefeed')}>Live-Feed</button>
      </div>

      {showToolbar && (
        <div className="network-toolbar">
          <input type="text" className="network-search" placeholder="Filtern nach Prozess oder IP..." value={filter}
            onChange={e => {
              clearTimeout(searchDebounceRef.current!);
              const val = e.target.value;
              searchDebounceRef.current = setTimeout(() => setFilter(val), 250);
            }} />
        </div>
      )}

      <div className="network-content">
        {activeSubTab === 'connections' && (
          <div className="network-merged">
            {/* Metric Cards */}
            <div className="network-overview-cards">
              {[
                { key: null, value: s.totalConnections || 0, label: 'Verbindungen' },
                { key: 'established', value: s.establishedCount || 0, label: 'Aktiv' },
                { key: 'listening', value: s.listeningCount || 0, label: 'Lauschend' },
                { key: 'remoteips', value: s.uniqueRemoteIPs || 0, label: 'Remote-IPs' },
              ].map(card => (
                <div key={card.label} className={`network-card network-card-clickable ${cardFilter === card.key || (!cardFilter && !card.key) ? 'network-card-active' : ''}`}
                  onClick={() => setCardFilter(card.key === cardFilter ? null : card.key)} role="button" tabIndex={0}>
                  <div className="network-card-value">{card.value}</div>
                  <div className="network-card-label">{card.label}</div>
                </div>
              ))}
              {s.udpCount > 0 && (
                <div className={`network-card network-card-clickable ${cardFilter === 'udp' ? 'network-card-active' : ''}`}
                  data-tier="experte" onClick={() => setCardFilter(cardFilter === 'udp' ? null : 'udp')} role="button" tabIndex={0}>
                  <div className="network-card-value">{s.udpCount}</div>
                  <div className="network-card-label">UDP</div>
                </div>
              )}
              <div className={`network-card network-card-clickable ${cardFilter === 'firmen' ? 'network-card-active' : ''}`}
                onClick={() => setCardFilter(cardFilter === 'firmen' ? null : 'firmen')} role="button" tabIndex={0}>
                <div className="network-card-value">{totalCompanies}</div>
                <div className="network-card-label">Firmen</div>
              </div>
              {trackerCount > 0 && (
                <div className={`network-card network-card-warn network-card-clickable ${cardFilter === 'tracker' ? 'network-card-active' : ''}`}
                  onClick={() => setCardFilter(cardFilter === 'tracker' ? null : 'tracker')} role="button" tabIndex={0}>
                  <div className="network-card-value">{trackerCount}</div>
                  <div className="network-card-label">Tracker</div>
                </div>
              )}
              {highRiskCount > 0 && (
                <div className={`network-card network-card-danger network-card-clickable ${cardFilter === 'highrisk' ? 'network-card-active' : ''}`}
                  onClick={() => setCardFilter(cardFilter === 'highrisk' ? null : 'highrisk')} role="button" tabIndex={0}>
                  <div className="network-card-value">{highRiskCount}</div>
                  <div className="network-card-label">Hochrisiko</div>
                </div>
              )}
            </div>

            {/* Bandwidth Adapters */}
            <div className="network-overview-section" style={{ marginBottom: 16 }}>
              <h3 className="network-section-title">Netzwerkadapter</h3>
              {bandwidth.length === 0 ? <div className="network-empty">Keine Netzwerkadapter gefunden</div> : (
                <div className="network-bandwidth-grid">
                  {[...bandwidth].sort((a, b) => (b.receivedBytes + b.sentBytes) - (a.receivedBytes + a.sentBytes)).map(b => {
                    const isDown = b.status !== 'Up';
                    const isInactive = b.receivedBytes === 0 && b.sentBytes === 0;
                    if (isInactive && isDown) {
                      return <div key={b.name} className="network-adapter-card network-adapter-down" style={{ padding: '10px 14px' }}>
                        <div className="network-adapter-name">{b.name} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>{'\u2014'} Offline</span></div>
                      </div>;
                    }
                    const hasHistory = bandwidthHistory[b.name]?.length > 1;
                    const linkLabel = formatLinkSpeed(b.linkSpeed);
                    return (
                      <div key={b.name} className={`network-adapter-card ${isDown ? 'network-adapter-down' : ''}`}>
                        <div className="network-adapter-name">{b.name}</div>
                        <div className="network-adapter-desc">{b.description || ''}{linkLabel !== '\u2014' ? ` \u2014 ${linkLabel}` : ''}</div>
                        {hasHistory && <div className="network-sparkline-container"><canvas className="network-sparkline" data-adapter={b.name} /></div>}
                        <div className="network-adapter-stats">
                          <div className="network-adapter-stat">
                            <span className="network-stat-label">{'\u2193'} Empfangen</span>
                            <span className={`network-stat-value ${b.rxPerSec > 0 ? 'network-stat-active' : ''}`}>{formatSpeed(b.rxPerSec)}</span>
                            <span className="network-stat-total" title="Gesamt empfangen">{fmtBytes(b.receivedBytes)}</span>
                          </div>
                          <div className="network-adapter-stat">
                            <span className="network-stat-label">{'\u2191'} Gesendet</span>
                            <span className={`network-stat-value ${b.txPerSec > 0 ? 'network-stat-active' : ''}`}>{formatSpeed(b.txPerSec)}</span>
                            <span className="network-stat-total" title="Gesamt gesendet">{fmtBytes(b.sentBytes)}</span>
                          </div>
                          <div className="network-adapter-stat">
                            <span className="network-stat-label">Pakete</span>
                            <span className="network-stat-value">{((b.receivedPackets || 0) + (b.sentPackets || 0)).toLocaleString('de')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* WiFi Details */}
              {wifiInfo && (
                <div className="network-wifi-details">
                  <h4 className="network-section-title">WLAN-Details</h4>
                  <div className="network-wifi-grid">
                    <div className="network-wifi-signal">
                      <span className="network-wifi-ssid">{wifiInfo.ssid || '\u2014'}</span>
                      <div className="network-wifi-signal-bar-bg">
                        <div className="network-wifi-signal-bar" style={{
                          width: Math.max(5, wifiInfo.signalPercent || 0) + '%',
                          background: (wifiInfo.signalPercent || 0) >= 60 ? 'var(--success, #22c55e)' : (wifiInfo.signalPercent || 0) >= 30 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)',
                        }} />
                      </div>
                      <span className="network-wifi-signal-pct">{wifiInfo.signalPercent || 0}%</span>
                    </div>
                    <div className="network-wifi-info-grid">
                      {wifiInfo.channel && <div className="network-wifi-item"><span className="network-wifi-label">Kanal</span><span className="network-wifi-value">{wifiInfo.channel}</span></div>}
                      {wifiInfo.radioType && <div className="network-wifi-item"><span className="network-wifi-label">Funk</span><span className="network-wifi-value">{wifiInfo.radioType}</span></div>}
                      {wifiInfo.band && <div className="network-wifi-item"><span className="network-wifi-label">Band</span><span className="network-wifi-value">{wifiInfo.band}</span></div>}
                      {wifiInfo.auth && <div className="network-wifi-item"><span className="network-wifi-label">Auth</span><span className="network-wifi-value">{wifiInfo.auth}</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Filter Indicator */}
            {cardFilter && (
              <div className="network-filter-indicator">
                <span>Filter: <strong>{CARD_FILTER_LABELS[cardFilter] || cardFilter}</strong></span>
                <button className="network-btn-small" onClick={() => setCardFilter(null)}>{'\u2715'} Zurücksetzen</button>
              </div>
            )}

            {/* Grouped Connections */}
            <div className="network-groups">
              {filteredGroups.length === 0 ? <div className="network-empty">Keine Verbindungen gefunden</div> :
                filteredGroups.map(g => {
                  const hasEstablished = g.states.Established > 0;
                  const statusColor = !g.isRunning ? 'danger' : hasEstablished ? 'safe' : 'neutral';
                  const ghostWarning = !g.isRunning && g.connectionCount > 0;
                  const expanded = expandedGroups.has(g.processName);
                  const companies = g.resolvedCompanies || [];
                  const companySummary = companies.length ? companies.slice(0, 3).join(', ') + (companies.length > 3 ? ` +${companies.length - 3}` : '') : '';

                  return (
                    <div key={g.processName} className={`network-group ${ghostWarning ? 'network-group-ghost' : ''}`}>
                      <div className="network-group-header" onClick={() => setExpandedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(g.processName)) next.delete(g.processName); else next.add(g.processName);
                        return next;
                      })}>
                        <span className="network-group-arrow">{expanded ? '\u25BC' : '\u25B6'}</span>
                        <span className={`network-status-dot network-status-${statusColor}`} />
                        <strong className="network-group-name">{g.processName}</strong>
                        <span className="network-group-badge">{g.connectionCount}</span>
                        <span className="network-group-ips" title={companies.length > 3 ? companies.join(', ') : undefined}>
                          {g.uniqueIPCount} IP{g.uniqueIPCount !== 1 ? 's' : ''}{companySummary ? ` (${companySummary})` : ''}
                        </span>
                        {g.hasTrackers && <span className="network-tracker-badge">Tracker</span>}
                        {g.hasHighRisk && <span className="network-highrisk-badge">{'\u26A0'} Hochrisiko</span>}
                        <span className="network-group-states">
                          {Object.entries(g.states).map(([state, count]) => (
                            <span key={state} className={`network-state-pill ${state === 'Established' ? 'pill-established' : state === 'Listen' ? 'pill-listen' : (state === 'TimeWait' || state === 'CloseWait') ? 'pill-closing' : ''}`}>
                              {state}: {count}
                            </span>
                          ))}
                        </span>
                        {ghostWarning && <span className="network-ghost-warning">Hintergrund-Aktivität!</span>}
                      </div>
                      {expanded && <GroupDetail group={g} />}
                    </div>
                  );
                })
              }
            </div>

            {/* DNS Cache (Experte) */}
            <div className="network-dns-section" data-tier="experte">
              <div className="network-dns-header" onClick={toggleDns} style={{ cursor: 'pointer' }}>
                <h3 className="network-section-title" style={{ margin: 0 }}>
                  {dnsExpanded ? '\u25BC' : '\u25B6'} DNS-Cache (zuletzt aufgelöste Domains)
                </h3>
                <button className="network-btn-small" onClick={e => { e.stopPropagation(); clearDnsCacheFn(); }}>Cache leeren</button>
              </div>
              {dnsExpanded && dnsCache.length > 0 && (
                <div className="network-dns-table-wrap" style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className="network-stat-label">{dnsCache.length} Einträge</span>
                    <button className="network-btn-small" onClick={async () => { try { setDnsCache(await api.getDnsCache()); } catch {} }}>{'\u21BB'} Aktualisieren</button>
                  </div>
                  <table className="network-dns-table">
                    <thead><tr><th>Domain</th><th>IP-Adresse</th><th>TTL</th><th>Typ</th></tr></thead>
                    <tbody>
                      {dnsCache.map((e: any, i: number) => (
                        <tr key={i}><td>{e.domain}</td><td>{e.ip}</td><td>{e.ttl}s</td><td>{e.type}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {dnsExpanded && dnsCache.length === 0 && <div className="network-empty" style={{ marginTop: 8 }}>DNS-Cache ist leer</div>}
            </div>
          </div>
        )}

        {activeSubTab === 'livefeed' && (
          <div className="network-livefeed">
            <div className="network-livefeed-header">
              <div className="network-livefeed-stats">
                <span>{feedEvents.length} Ereignisse</span>
                <span className="network-feed-stat-new">+{feedEvents.filter(e => e.type === 'NEU').length} neu</span>
                <span className="network-feed-stat-closed">-{feedEvents.filter(e => e.type === 'GESCHLOSSEN').length} geschlossen</span>
              </div>
              <div className="network-livefeed-controls">
                <span data-tier="experte">
                  {recording ? (<>
                    <span className="network-recording-indicator"><span className="network-rec-dot" /> {recTimeStr} ({recStatus?.eventCount || 0} Events)</span>
                    <button className="network-btn network-btn-small network-btn-danger" onClick={stopRecording}>Aufzeichnung stoppen</button>
                  </>) : (
                    <button className="network-btn network-btn-small network-btn-rec" onClick={startRecording}>Aufzeichnung starten</button>
                  )}
                </span>
                <button className="network-btn network-btn-small" onClick={() => setFeedEvents([])}>Leeren</button>
                <button className="network-btn network-btn-small" onClick={() => setFeedPaused(p => !p)}>
                  {feedPaused ? '\u25B6 Fortsetzen' : '\u23F8 Pause'}
                </button>
              </div>
            </div>

            {feedEvents.length === 0 ? (
              <div className="network-livefeed-empty">
                <div style={{ fontSize: 24, marginBottom: 8 }}>{'\uD83D\uDCE1'}</div>
                <p>Warte auf Verbindungsänderungen...</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Neue, geschlossene und geänderte TCP-Verbindungen erscheinen hier in Echtzeit.</p>
              </div>
            ) : (
              <div className="network-livefeed-table-wrap">
                <table className="network-livefeed-table">
                  <thead><tr>
                    <th>Zeit</th><th>Typ</th><th>Prozess</th><th>Remote-IP</th><th>Port</th><th>Firma</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {feedEvents.map((ev, i) => {
                      const typeClass = ev.type === 'NEU' ? 'network-feed-new' : ev.type === 'GESCHLOSSEN' ? 'network-feed-closed' : 'network-feed-changed';
                      const typeLabel = ev.type === 'NEU' ? '+ NEU' : ev.type === 'GESCHLOSSEN' ? '- GESCHL.' : '\u2194 GEÄND.';
                      const flag = countryFlag(ev.country);
                      const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                      const protocol = PORT_PROTOCOLS[ev.remotePort] || '';
                      const local = isLocalIP(ev.remoteAddress);
                      const orgLabel = local ? 'Lokal' : `${flag ? flag + ' ' : ''}${ev.org || 'Unbekannt'}${ev.isTracker ? ' \uD83D\uDC41' : ''}${ev.isHighRisk ? ' \u26A0' : ''}`;

                      return (
                        <tr key={i} className={`${typeClass} ${ev.isHighRisk ? 'network-feed-risk' : ev.isTracker ? 'network-feed-tracker' : ''}`}>
                          <td className="network-feed-time">{time}</td>
                          <td><span className={`network-feed-badge ${typeClass}-badge`}>{typeLabel}</span></td>
                          <td className="network-feed-proc">{ev.processName}</td>
                          <td className="network-feed-ip" title={ev.remoteAddress}>{ev.remoteAddress}</td>
                          <td className="network-feed-port">{ev.remotePort || ''}{protocol ? ` ${protocol}` : ''}</td>
                          <td className="network-feed-org">{orgLabel}</td>
                          <td className="network-feed-state">{ev.state}{ev.prevState ? ` \u2190 ${ev.prevState}` : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recordings list */}
            {recordings.length > 0 && (
              <div className="network-recordings-section">
                <div className="network-recordings-header">
                  <h4 className="network-section-title">Gespeicherte Aufzeichnungen</h4>
                  <button className="network-btn network-btn-small" onClick={() => api.openNetworkRecordingsDir()}>Ordner öffnen</button>
                </div>
                <table className="network-recordings-table">
                  <thead><tr><th>Datum</th><th>Dauer</th><th>Ereignisse</th><th>Größe</th><th></th></tr></thead>
                  <tbody>
                    {recordings.map((r: any, i: number) => {
                      const date = r.startedAt ? new Date(r.startedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '\u2014';
                      const dur = r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}:${String(r.durationSeconds % 60).padStart(2, '0')}` : '\u2014';
                      const size = r.sizeBytes < 1024 ? `${r.sizeBytes} B` : r.sizeBytes < 1024 * 1024 ? `${(r.sizeBytes / 1024).toFixed(1)} KB` : `${(r.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
                      return (
                        <tr key={i} className={r.isActive ? 'network-recording-active' : ''}>
                          <td>{date}</td><td>{dur}</td><td>{r.eventCount}</td><td>{size}</td>
                          <td>{r.isActive ? <span style={{ color: 'var(--danger)' }}>Aktiv</span> :
                            <button className="network-btn-small network-btn-danger" onClick={() => deleteRecording(r.filename)}>{'\u2715'}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Sub-component for expanded group detail (connection table) */
function GroupDetail({ group }: { group: ConnectionGroup }) {
  const ipGroups = new Map<string, any[]>();
  for (const c of group.connections) {
    if (c.resolved?.isLocal) continue;
    const ip = c.remoteAddress || '';
    if (!ip) continue;
    if (!ipGroups.has(ip)) ipGroups.set(ip, []);
    ipGroups.get(ip)!.push(c);
  }

  if (ipGroups.size === 0) {
    return <div className="network-group-detail"><em style={{ color: 'var(--text-secondary)', padding: 8, display: 'block' }}>Nur lokale Verbindungen</em></div>;
  }

  return (
    <div className="network-group-detail">
      <table className="network-table">
        <thead><tr><th>Remote-IP</th><th>Firma</th><th>Anbieter</th><th>Ports</th><th>Verb.</th><th>Status</th></tr></thead>
        <tbody>
          {[...ipGroups.entries()].map(([ip, connections]) => {
            const info = connections[0].resolved || {};
            const flag = countryFlag(info.countryCode);
            const ports = [...new Set(connections.map((c: any) => c.remotePort).filter(Boolean))].sort((a: number, b: number) => a - b);
            const states: Record<string, number> = {};
            const protocols = new Set<string>();
            for (const c of connections) { states[c.state] = (states[c.state] || 0) + 1; protocols.add(c.protocol || 'TCP'); }
            const stateStr = Object.entries(states).map(([s, n]) => `${s}: ${n}`).join(', ');

            return (
              <tr key={ip} className={info.isHighRisk ? 'network-row-highrisk' : info.isTracker ? 'network-row-tracker' : ''}>
                <td className="network-ip">{ip}</td>
                <td className={`network-company ${info.isHighRisk ? 'network-highrisk' : info.isTracker ? 'network-tracker' : ''}`}>
                  {flag ? flag + ' ' : ''}{info.org || 'Unbekannt'}{info.isHighRisk ? ' \u26A0' : info.isTracker ? ' \uD83D\uDC41' : ''}
                </td>
                <td className="network-isp" title={info.isp || ''}>{info.isp && info.isp !== info.org ? info.isp : ''}</td>
                <td>{ports.map((p: number) => {
                  const label = KNOWN_PORTS[p];
                  return label ? <span key={p} title={label}>{p}</span> : <span key={p}>{p}</span>;
                }).reduce((prev: any, curr: any, i: number) => i === 0 ? [curr] : [...prev, ', ', curr], [])}</td>
                <td>{connections.length}</td>
                <td>
                  {[...protocols].map(p => <span key={p} className={`network-proto-badge network-proto-${p.toLowerCase()}`}>{p}</span>)}
                  {' '}<span className="network-state-pills">{stateStr}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

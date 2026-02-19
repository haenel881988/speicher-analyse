import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface Prefs {
  sessionRestore?: boolean;
  sessionSaveOnClose?: boolean;
  sessionSaveAfterScan?: boolean;
  energyMode?: string;
  batteryThreshold?: number;
  disableBackgroundOnBattery?: boolean;
  minimizeToTray?: boolean;
  startMinimized?: boolean;
  showScanNotification?: boolean;
  theme?: string;
  showSizeColors?: boolean;
  smartLayout?: boolean;
  globalHotkey?: string;
  terminalShell?: string;
  terminalFontSize?: number;
}

interface Shell {
  id: string;
  label: string;
  available: boolean;
}

export default function SettingsView() {
  const { showToast } = useAppContext();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [hotkey, setHotkey] = useState('');
  const [shellRegistered, setShellRegistered] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ exists: boolean; savedAt?: string; fileSize?: number; scanCount?: number }>({ exists: false });
  const [batteryStatus, setBatteryStatus] = useState<{ onBattery: boolean }>({ onBattery: false });
  const [shells, setShells] = useState<Shell[]>([{ id: 'powershell', label: 'PowerShell', available: true }]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [tags, setTags] = useState<{ path: string; color: string }[]>([]);
  const [tagCount, setTagCount] = useState(0);
  const [saveSessionLabel, setSaveSessionLabel] = useState('Jetzt speichern');
  const hotkeyInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, hk, shellReg, si, bs, sh] = await Promise.all([
        api.getPreferences(),
        api.getGlobalHotkey(),
        api.isShellContextMenuRegistered(),
        api.getSessionInfo(),
        api.getBatteryStatus().catch(() => ({ onBattery: false })),
        api.terminalGetShells().catch(() => [{ id: 'powershell', label: 'PowerShell', available: true }]),
      ]);
      setPrefs(p);
      setHotkey(hk || p.globalHotkey || 'Ctrl+Shift+S');
      setShellRegistered(shellReg);
      setSessionInfo(si);
      setBatteryStatus(bs);
      setShells(sh);
      setLoaded(true);

      // Tag count
      try {
        const t = await api.getAllTags();
        setTagCount(t.length);
      } catch { /* ignore */ }
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (!loaded) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPref = useCallback(async (key: string, value: any) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    await api.setPreference(key, value);
    document.dispatchEvent(new CustomEvent('settings-pref-change', { detail: { key, value } }));
  }, []);

  const togglePref = useCallback((key: string) => {
    const newVal = !prefs[key as keyof Prefs];
    setPref(key, newVal);
  }, [prefs, setPref]);

  const saveSession = useCallback(async () => {
    setSaveSessionLabel('Speichert...');
    try {
      const result = await api.saveSessionNow({});
      if (result.success) {
        setSaveSessionLabel('Gespeichert!');
        const info = await api.getSessionInfo();
        setSessionInfo(info);
      } else {
        setSaveSessionLabel('Keine Daten');
      }
    } catch {
      setSaveSessionLabel('Fehler');
    }
    setTimeout(() => setSaveSessionLabel('Jetzt speichern'), 2000);
  }, []);

  const toggleShell = useCallback(async () => {
    try {
      if (shellRegistered) {
        await api.unregisterShellContextMenu();
        setShellRegistered(false);
      } else {
        await api.registerShellContextMenu();
        setShellRegistered(true);
      }
    } catch {
      showToast('Fehler bei Shell-Integration', 'error');
    }
  }, [shellRegistered, showToast]);

  const startRecording = useCallback(() => {
    setRecording(true);
    setHotkey('');
    if (hotkeyInputRef.current) hotkeyInputRef.current.focus();
  }, []);

  const handleHotkeyKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const accelerator = parts.join('+');

    setHotkey(accelerator);
    setRecording(false);

    const result = await api.setGlobalHotkey(accelerator);
    if (result.success) {
      await setPref('globalHotkey', accelerator);
    } else {
      showToast(result.error || 'Hotkey konnte nicht gesetzt werden', 'error');
    }
  }, [recording, setPref, showToast]);

  const loadAllTags = useCallback(async () => {
    try {
      const t = await api.getAllTags();
      setTags(t);
      setTagCount(t.length);
    } catch {
      setTags([]);
    }
  }, []);

  const removeTag = useCallback(async (path: string) => {
    await api.removeFileTag(path);
    setTags(prev => prev.filter(t => t.path !== path));
    setTagCount(prev => prev - 1);
  }, []);

  if (!loaded && !loading) return <div className="loading-state">Einstellungen werden geladen...</div>;
  if (loading && !loaded) return <div className="loading-spinner" />;

  const isDark = prefs.theme === 'dark';
  const sessionInfoText = sessionInfo.exists
    ? `Letzte Session: ${new Date(sessionInfo.savedAt!).toLocaleString('de-DE')} (${formatBytes(sessionInfo.fileSize || 0)}, ${sessionInfo.scanCount} Scan${sessionInfo.scanCount !== 1 ? 's' : ''})`
    : 'Keine gespeicherte Session vorhanden';
  const batteryText = batteryStatus.onBattery ? 'Aktuell: Akkubetrieb' : 'Aktuell: Netzbetrieb';

  const tagColors: Record<string, string> = {
    red: '#e94560', orange: '#ff8c42', yellow: '#ffc107',
    green: '#4ecca3', blue: '#00b4d8', purple: '#6c5ce7', gray: '#8b8fa3',
  };

  return (
    <div className="settings-page">
      <h2 className="settings-title">Einstellungen</h2>

      {/* Session & Wiederherstellung */}
      <div className="settings-section">
        <h3 className="settings-section-title">Session & Wiederherstellung</h3>
        <ToggleRow label="Scan-Daten beim Start wiederherstellen" desc="Beim nächsten App-Start werden die gespeicherten Scan-Daten automatisch geladen." active={!!prefs.sessionRestore} onClick={() => togglePref('sessionRestore')} />
        <ToggleRow label="Automatisch beim Schließen speichern" desc="Scan-Daten werden beim Beenden der App automatisch gesichert." active={!!prefs.sessionSaveOnClose} onClick={() => togglePref('sessionSaveOnClose')} />
        <ToggleRow label="Nach jedem Scan speichern" desc="Session wird automatisch nach Abschluss eines Scans gesichert." active={!!prefs.sessionSaveAfterScan} onClick={() => togglePref('sessionSaveAfterScan')} />
        <div className="settings-row">
          <div className="settings-label">
            <strong>Session-Status</strong>
            <span className="settings-desc">{sessionInfoText}</span>
          </div>
          <div className="settings-value">
            <button className="settings-btn" onClick={saveSession}>{saveSessionLabel}</button>
          </div>
        </div>
      </div>

      {/* Energieverwaltung */}
      <div className="settings-section">
        <h3 className="settings-section-title">Energieverwaltung</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Energiemodus</strong>
            <span className="settings-desc">Steuert, wie die App Hintergrundaktivitäten reguliert.</span>
          </div>
          <div className="settings-value">
            <select className="settings-select" value={prefs.energyMode || 'auto'} onChange={e => setPref('energyMode', e.target.value)}>
              <option value="auto">Automatisch</option>
              <option value="performance">Leistung</option>
              <option value="powersave">Energiesparen</option>
            </select>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Energiesparmodus ab</strong>
            <span className="settings-desc">Schwellwert für automatischen Energiesparmodus.</span>
          </div>
          <div className="settings-value settings-range-group">
            <input type="range" className="settings-range" min={10} max={80} step={5} value={prefs.batteryThreshold || 30}
              onChange={e => setPref('batteryThreshold', parseInt(e.target.value, 10))} />
            <span className="settings-range-value">{prefs.batteryThreshold || 30}%</span>
          </div>
        </div>
        <ToggleRow label="Hintergrund-Tasks auf Akku deaktivieren" desc="Unterdrückt automatische Aktualisierungen im Akkubetrieb." active={!!prefs.disableBackgroundOnBattery} onClick={() => togglePref('disableBackgroundOnBattery')} />
        <div className="settings-row">
          <div className="settings-label">
            <strong>Stromversorgung</strong>
            <span className="settings-desc">{batteryText}</span>
          </div>
          <div className="settings-value">
            <span className={`settings-badge ${batteryStatus.onBattery ? 'settings-badge-inactive' : 'settings-badge-active'}`}>
              {batteryStatus.onBattery ? 'Akku' : 'Netz'}
            </span>
          </div>
        </div>
      </div>

      {/* Allgemein */}
      <div className="settings-section">
        <h3 className="settings-section-title">Allgemein</h3>
        <ToggleRow label="In System-Tray minimieren" desc="X-Button: App in den Tray minimieren statt beenden." active={!!prefs.minimizeToTray} onClick={() => togglePref('minimizeToTray')} />
        <ToggleRow label="Im System-Tray starten" desc="App startet minimiert im Hintergrund." active={!!prefs.startMinimized} onClick={() => togglePref('startMinimized')} />
        <ToggleRow label="Benachrichtigung nach Scan" desc="Zeigt eine Desktop-Benachrichtigung nach Abschluss eines Scans." active={!!prefs.showScanNotification} onClick={() => togglePref('showScanNotification')} />
        <div className="settings-row">
          <div className="settings-label">
            <strong>Farbschema</strong>
            <span className="settings-desc">Wechsel zwischen dunklem und hellem Design.</span>
          </div>
          <div className="settings-value">
            <div className="settings-theme-switch">
              <span className={`settings-theme-option ${isDark ? 'active' : ''}`} onClick={() => {
                setPref('theme', 'dark');
                document.dispatchEvent(new CustomEvent('settings-theme-change', { detail: { theme: 'dark' } }));
              }}>Dunkel</span>
              <span className={`settings-theme-option ${!isDark ? 'active' : ''}`} onClick={() => {
                setPref('theme', 'light');
                document.dispatchEvent(new CustomEvent('settings-theme-change', { detail: { theme: 'light' } }));
              }}>Hell</span>
            </div>
          </div>
        </div>
        <ToggleRow label="Speichergrößen farblich hervorheben" desc="Markiert große Dateien und Ordner farblich (rot >1GB, orange >100MB, gelb >10MB)." active={!!prefs.showSizeColors} onClick={() => togglePref('showSizeColors')} />
        <ToggleRow label="Intelligentes Layout" desc="Passt Sidebar, Panels und Content automatisch an die Fenstergröße an." active={!!prefs.smartLayout} onClick={() => togglePref('smartLayout')} />
      </div>

      {/* Globaler Hotkey */}
      <div className="settings-section">
        <h3 className="settings-section-title">Globaler Hotkey</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>App fokussieren / verstecken</strong>
            <span className="settings-desc">Drücke den Hotkey, um die App von überall zu öffnen oder zu verstecken.</span>
          </div>
          <div className="settings-value">
            <input type="text" className={`settings-hotkey-input ${recording ? 'recording' : ''}`} ref={hotkeyInputRef}
              value={recording ? '' : hotkey} readOnly placeholder="Klicken + Tastenkombination drücken"
              onKeyDown={handleHotkeyKeyDown} />
            <button className="settings-btn" onClick={startRecording}>
              {recording ? 'Drücke Tasten...' : 'Ändern'}
            </button>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="settings-section">
        <h3 className="settings-section-title">Terminal</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Standard-Shell</strong>
            <span className="settings-desc">Shell, die beim Öffnen des Terminals verwendet wird.</span>
          </div>
          <div className="settings-value">
            <select className="settings-select" value={prefs.terminalShell || 'powershell'} onChange={e => setPref('terminalShell', e.target.value)}>
              {shells.map(s => <option key={s.id} value={s.id} disabled={!s.available}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Schriftgröße</strong>
            <span className="settings-desc">Schriftgröße im eingebetteten Terminal.</span>
          </div>
          <div className="settings-value settings-range-group">
            <input type="range" className="settings-range" min={10} max={20} step={1} value={prefs.terminalFontSize || 14}
              onChange={e => setPref('terminalFontSize', parseInt(e.target.value, 10))} />
            <span className="settings-range-value">{prefs.terminalFontSize || 14}px</span>
          </div>
        </div>
      </div>

      {/* Windows Integration */}
      <div className="settings-section">
        <h3 className="settings-section-title">Windows Integration</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>"Mit Speicher Analyse öffnen"</strong>
            <span className="settings-desc">Fügt einen Eintrag zum Windows-Explorer-Kontextmenü hinzu.</span>
          </div>
          <div className="settings-value">
            <span className={`settings-badge ${shellRegistered ? 'settings-badge-active' : 'settings-badge-inactive'}`}>
              {shellRegistered ? 'Registriert' : 'Nicht registriert'}
            </span>
            <button className="settings-btn" onClick={toggleShell}>
              {shellRegistered ? 'Entfernen' : 'Registrieren'}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Datei-Tags</strong>
            <span className="settings-desc">Markiere Dateien und Ordner mit Farben (Rechtsklick → Tag).</span>
          </div>
          <div className="settings-value settings-tag-colors">
            {Object.entries(tagColors).map(([name, hex]) => (
              <span key={name} className="settings-tag-sample" style={{ background: hex }} title={name} />
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Tags verwalten</strong>
            <span className="settings-desc">Gespeicherte Tags anzeigen und löschen.</span>
          </div>
          <div className="settings-value">
            <button className="settings-btn" onClick={() => { if (!showTags) loadAllTags(); setShowTags(!showTags); }}>
              {showTags ? 'Ausblenden' : 'Alle Tags anzeigen'}
            </button>
            <span className="settings-tag-count">{tagCount} Tag{tagCount !== 1 ? 's' : ''} gespeichert</span>
          </div>
        </div>
        {showTags && (
          <div className="settings-tags-list">
            {tags.length === 0 ? (
              <div className="settings-no-tags">Keine Tags gespeichert</div>
            ) : (
              <table className="settings-tags-table">
                <thead><tr><th>Farbe</th><th>Datei</th><th>Pfad</th><th></th></tr></thead>
                <tbody>
                  {tags.map(tag => {
                    const hex = tagColors[tag.color] || '#888';
                    const name = tag.path.split('\\').pop();
                    const dir = tag.path.substring(0, tag.path.lastIndexOf('\\'));
                    return (
                      <tr key={tag.path}>
                        <td><span className="settings-tag-sample" style={{ background: hex }} /></td>
                        <td>{name}</td>
                        <td className="settings-tag-path" title={tag.path}>{dir}</td>
                        <td><button className="settings-tag-remove" onClick={() => removeTag(tag.path)}>Entfernen</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Über */}
      <div className="settings-section">
        <h3 className="settings-section-title">Über</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Speicher Analyse</strong>
            <span className="settings-desc">Disk Space Analyzer & System Optimizer</span>
          </div>
          <div className="settings-value">
            <span className="settings-version">v7.2.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable toggle row component
function ToggleRow({ label, desc, active, onClick }: { label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <strong>{label}</strong>
        <span className="settings-desc">{desc}</span>
      </div>
      <div className="settings-value">
        <div className={`settings-toggle ${active ? 'active' : ''}`} onClick={onClick} />
      </div>
    </div>
  );
}

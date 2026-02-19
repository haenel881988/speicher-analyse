import { useState, useRef, useEffect, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

const DARK_THEME = {
  background: '#1a1d2e', foreground: '#e2e4f0', cursor: '#6c5ce7', cursorAccent: '#1a1d2e',
  selectionBackground: '#6c5ce730',
  black: '#1a1d2e', red: '#ff6b6b', green: '#51cf66', yellow: '#ffd43b',
  blue: '#6c5ce7', magenta: '#cc5de8', cyan: '#22b8cf', white: '#e2e4f0',
  brightBlack: '#5a5e72', brightRed: '#ff8787', brightGreen: '#69db7c', brightYellow: '#ffe066',
  brightBlue: '#845ef7', brightMagenta: '#da77f2', brightCyan: '#3bc9db', brightWhite: '#ffffff',
};

const LIGHT_THEME = {
  background: '#ffffff', foreground: '#2d3436', cursor: '#6c5ce7', cursorAccent: '#ffffff',
  selectionBackground: '#6c5ce730',
  black: '#2d3436', red: '#e74c3c', green: '#27ae60', yellow: '#f39c12',
  blue: '#6c5ce7', magenta: '#8e44ad', cyan: '#00cec9', white: '#dfe6e9',
  brightBlack: '#636e72', brightRed: '#ff6b6b', brightGreen: '#00b894', brightYellow: '#fdcb6e',
  brightBlue: '#845ef7', brightMagenta: '#a29bfe', brightCyan: '#81ecec', brightWhite: '#ffffff',
};

interface ShellInfo { id: string; label: string; available: boolean; }

function getXtermTheme() {
  return document.documentElement.dataset.theme !== 'light' ? DARK_THEME : LIGHT_THEME;
}

export default function TerminalPanel() {
  const { theme } = useAppContext();
  const [visible, setVisible] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentShell, setCurrentShell] = useState('powershell');
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([]);

  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const cwdRef = useRef('C:\\');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const dataUnlistenRef = useRef<(() => void) | null>(null);
  const exitUnlistenRef = useRef<(() => void) | null>(null);
  const visibleRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  // Global keyboard handler: Ctrl+`
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' && e.ctrlKey) {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Load available shells
  useEffect(() => {
    api.terminalGetShells()
      .then((shells: any) => setAvailableShells(shells))
      .catch(() => setAvailableShells([{ id: 'powershell', label: 'PowerShell', available: true }]));
  }, []);

  // Create xterm instance when first made visible
  useEffect(() => {
    if (!visible || !containerRef.current || xtermRef.current) return;

    let cancelled = false;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (cancelled) return;

      const fitAddon = new FitAddon();
      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: getXtermTheme(),
        allowProposedApi: true,
        scrollback: 5000,
      });

      xterm.loadAddon(fitAddon);
      xterm.open(containerRef.current!);
      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Keyboard → backend
      xterm.onData((data: string) => {
        if (sessionIdRef.current) api.terminalWrite(sessionIdRef.current, data);
      });

      // Resize → backend PTY
      xterm.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (sessionIdRef.current) api.terminalResize(sessionIdRef.current, cols, rows);
      });

      // ResizeObserver for auto-fit
      const ro = new ResizeObserver(() => {
        if (fitAddonRef.current && visibleRef.current) fitAddonRef.current.fit();
      });
      ro.observe(containerRef.current!);
      resizeObserverRef.current = ro;

      // Wire event listeners (once)
      const dataUnlisten = await api.onTerminalData(({ id, data }: any) => {
        if (id === sessionIdRef.current && xtermRef.current) xtermRef.current.write(data);
      });
      dataUnlistenRef.current = dataUnlisten;

      const exitUnlisten = await api.onTerminalExit(({ id, code }: any) => {
        if (id === sessionIdRef.current) {
          if (xtermRef.current) xtermRef.current.write(`\r\n\x1b[33mProzess beendet (Code: ${code})\x1b[0m\r\n`);
          setSessionId(null);
        }
      });
      exitUnlistenRef.current = exitUnlisten;

      // Create session
      await createSession(xterm, fitAddon);

      requestAnimationFrame(() => {
        fitAddon.fit();
        xterm.focus();
      });
    })();

    return () => { cancelled = true; };
  }, [visible]);

  // Focus + fit when becoming visible (after initial creation)
  useEffect(() => {
    if (visible && xtermRef.current && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current.fit();
        xtermRef.current.focus();
      });
    }
  }, [visible]);

  // Theme change — react to context theme via prop
  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = getXtermTheme();
  }, [theme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      if (dataUnlistenRef.current) dataUnlistenRef.current();
      if (exitUnlistenRef.current) exitUnlistenRef.current();
      if (sessionIdRef.current) api.terminalDestroy(sessionIdRef.current);
      xtermRef.current?.dispose();
    };
  }, []);

  const createSession = useCallback(async (xterm?: any, fitAddon?: any) => {
    const term = xterm || xtermRef.current;
    const fit = fitAddon || fitAddonRef.current;
    if (!term) return;

    let cols = 80, rows = 24;
    if (fit) {
      const dims = fit.proposeDimensions();
      if (dims) { cols = dims.cols; rows = dims.rows; }
    }

    try {
      const result = await api.terminalCreate(cwdRef.current, currentShell, cols, rows);
      setSessionId(result.id);
    } catch (err: any) {
      term.write(`\x1b[31mFehler: ${err.message}\x1b[0m\r\n`);
    }
  }, [currentShell]);

  const restart = useCallback(async () => {
    if (sessionIdRef.current) {
      await api.terminalDestroy(sessionIdRef.current);
      setSessionId(null);
    }
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.reset();
    }
    await createSession();
    xtermRef.current?.focus();
  }, [createSession]);

  const handleShellChange = useCallback(async (newShell: string) => {
    setCurrentShell(newShell);
    if (sessionIdRef.current) {
      await api.terminalDestroy(sessionIdRef.current);
      setSessionId(null);
    }
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.reset();
    }
    // Session will be recreated with new shell
    let cols = 80, rows = 24;
    if (fitAddonRef.current) {
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims) { cols = dims.cols; rows = dims.rows; }
    }
    try {
      const result = await api.terminalCreate(cwdRef.current, newShell, cols, rows);
      setSessionId(result.id);
    } catch (err: any) {
      xtermRef.current?.write(`\x1b[31mFehler: ${err.message}\x1b[0m\r\n`);
    }
    xtermRef.current?.focus();
  }, []);

  // Resize handle drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelRef.current?.offsetHeight || 250;

    const onMouseMove = (moveE: MouseEvent) => {
      const delta = startY - moveE.clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + delta));
      if (panelRef.current) panelRef.current.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (panelRef.current?.style.height) {
        localStorage.setItem('speicher-analyse-terminal-height', panelRef.current.style.height);
      }
      if (fitAddonRef.current && visibleRef.current) fitAddonRef.current.fit();
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  if (!visible) return null;

  const savedHeight = localStorage.getItem('speicher-analyse-terminal-height');

  return (
    <div className="terminal-wrapper" style={{ display: visible ? '' : 'none' }}>
      <div className="terminal-resize-handle" onMouseDown={handleResizeStart} />
      <div
        className="terminal-panel"
        ref={panelRef}
        style={savedHeight ? { height: savedHeight } : undefined}
        onKeyDown={e => {
          if (e.key === '`' && e.ctrlKey) return;
          e.stopPropagation();
        }}
      >
        <div className="terminal-header">
          <span className="terminal-title">Terminal</span>
          <select
            className="terminal-shell-select"
            title="Shell auswählen"
            value={currentShell}
            onChange={e => handleShellChange(e.target.value)}
          >
            {availableShells.map(s => (
              <option key={s.id} value={s.id} disabled={!s.available}>{s.label}</option>
            ))}
          </select>
          <div className="terminal-controls">
            <button className="terminal-btn" title="Ausgabe löschen" onClick={() => xtermRef.current?.clear()}>Löschen</button>
            <button className="terminal-btn" title="Neu starten" onClick={restart}>Neustart</button>
            <button className="terminal-btn" title="Schließen (Ctrl+`)" onClick={() => setVisible(false)}>{'\u00D7'}</button>
          </div>
        </div>
        <div className="xterm-container" ref={containerRef} />
      </div>
    </div>
  );
}

/**
 * Terminal Panel - Global embedded multi-shell terminal (VS Code style).
 * Supports PowerShell, CMD, and WSL (if installed).
 * Uses piped I/O (Rust backend) + xterm.js (frontend).
 * All commands run natively - including claude, ssh, vim, python, etc.
 */

import { Terminal } from '../lib/xterm/xterm.mjs';
import { FitAddon } from '../lib/xterm/addon-fit.mjs';

const SHELL_START_MSG = {
    powershell: 'PowerShell',
    cmd: 'CMD',
    wsl: 'WSL (Bash)',
};

export class TerminalPanel {
    constructor(parentContainer) {
        this.parentContainer = parentContainer;
        this.panel = null;
        this.xterm = null;
        this.fitAddon = null;
        this.titleEl = null;
        this.shellSelect = null;
        this.sessionId = null;
        this.visible = false;
        this.currentCwd = 'C:\\';
        this.currentShell = 'powershell';
        this.availableShells = [];
        this.resizeObserver = null;
        this._dataListenerSet = false;
        this._exitListenerSet = false;
    }

    toggle(cwd) {
        if (this.visible) {
            this.hide();
        } else {
            this.show(cwd);
        }
    }

    async show(cwd) {
        if (cwd) this.currentCwd = cwd;
        this.visible = true;

        if (!this.panel) {
            await this._createDOM();
        }

        this.parentContainer.style.display = '';
        this.panel.style.display = '';

        if (!this.sessionId) {
            await this._createSession();
        }

        // Fit after showing (needs visible container for dimensions)
        requestAnimationFrame(() => {
            if (this.fitAddon && this.visible) {
                this.fitAddon.fit();
            }
            if (this.xterm) {
                this.xterm.focus();
            }
        });
    }

    hide() {
        this.visible = false;
        if (this.panel) this.panel.style.display = 'none';
        this.parentContainer.style.display = 'none';
    }

    async destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.sessionId) {
            await window.api.terminalDestroy(this.sessionId);
            this.sessionId = null;
        }
        if (this.xterm) {
            this.xterm.dispose();
            this.xterm = null;
        }
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        this.visible = false;
        this.parentContainer.style.display = 'none';
    }

    async _createDOM() {
        // Load available shells
        try {
            this.availableShells = await window.api.terminalGetShells();
        } catch {
            this.availableShells = [{ id: 'powershell', label: 'PowerShell', available: true }];
        }

        // Resize handle (drag to resize, like VS Code)
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'terminal-resize-handle';
        this.parentContainer.appendChild(this.resizeHandle);
        this._wireResize();

        this.panel = document.createElement('div');
        this.panel.className = 'terminal-panel';

        // Build shell selector options
        const shellOptions = this.availableShells.map(s =>
            `<option value="${s.id}" ${!s.available ? 'disabled' : ''} ${s.id === this.currentShell ? 'selected' : ''}>${s.label}</option>`
        ).join('');

        // Header (kept from v7.2 design)
        const header = document.createElement('div');
        header.className = 'terminal-header';
        header.innerHTML = `
            <span class="terminal-title">Terminal</span>
            <select class="terminal-shell-select" title="Shell auswählen">${shellOptions}</select>
            <div class="terminal-controls">
                <button class="terminal-btn terminal-btn-clear" title="Ausgabe löschen">Löschen</button>
                <button class="terminal-btn terminal-btn-restart" title="Neu starten">Neustart</button>
                <button class="terminal-btn terminal-btn-close" title="Schließen (Ctrl+\`)">\u00D7</button>
            </div>
        `;
        this.panel.appendChild(header);

        // xterm.js container
        this.xtermContainer = document.createElement('div');
        this.xtermContainer.className = 'xterm-container';
        this.panel.appendChild(this.xtermContainer);

        this.titleEl = header.querySelector('.terminal-title');
        this.shellSelect = header.querySelector('.terminal-shell-select');

        // Wire header button events
        header.querySelector('.terminal-btn-close').onclick = () => this.hide();
        header.querySelector('.terminal-btn-clear').onclick = () => {
            if (this.xterm) this.xterm.clear();
        };
        header.querySelector('.terminal-btn-restart').onclick = () => this._restart();

        // Shell selector change
        this.shellSelect.onchange = async () => {
            const newShell = this.shellSelect.value;
            if (newShell !== this.currentShell) {
                this.currentShell = newShell;
                await this._restart();
            }
        };

        // Prevent terminal keyboard events from reaching other components
        this.panel.addEventListener('keydown', (e) => {
            // Allow Ctrl+` to toggle terminal (handled by app.js)
            if (e.key === '`' && e.ctrlKey) return;
            e.stopPropagation();
        });

        this.parentContainer.appendChild(this.panel);

        // Create xterm.js instance
        this._createXterm();
    }

    _createXterm() {
        this.xterm = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: 'Consolas, "Courier New", monospace',
            theme: this._getXtermTheme(),
            allowProposedApi: true,
            scrollback: 5000,
        });

        this.fitAddon = new FitAddon();
        this.xterm.loadAddon(this.fitAddon);
        this.xterm.open(this.xtermContainer);

        // Bidirectional data flow: keyboard → backend
        this.xterm.onData((data) => {
            if (this.sessionId) {
                window.api.terminalWrite(this.sessionId, data);
            }
        });

        // Resize: xterm → backend PTY
        this.xterm.onResize(({ cols, rows }) => {
            if (this.sessionId) {
                window.api.terminalResize(this.sessionId, cols, rows);
            }
        });

        // Auto-fit on container resize
        this.resizeObserver = new ResizeObserver(() => {
            if (this.fitAddon && this.visible) {
                this.fitAddon.fit();
            }
        });
        this.resizeObserver.observe(this.xtermContainer);
    }

    _getXtermTheme() {
        const isDark = document.documentElement.dataset.theme !== 'light';
        return isDark ? {
            background: '#1a1d2e',
            foreground: '#e2e4f0',
            cursor: '#6c5ce7',
            cursorAccent: '#1a1d2e',
            selectionBackground: '#6c5ce730',
            black: '#1a1d2e',
            red: '#ff6b6b',
            green: '#51cf66',
            yellow: '#ffd43b',
            blue: '#6c5ce7',
            magenta: '#cc5de8',
            cyan: '#22b8cf',
            white: '#e2e4f0',
            brightBlack: '#5a5e72',
            brightRed: '#ff8787',
            brightGreen: '#69db7c',
            brightYellow: '#ffe066',
            brightBlue: '#845ef7',
            brightMagenta: '#da77f2',
            brightCyan: '#3bc9db',
            brightWhite: '#ffffff',
        } : {
            background: '#ffffff',
            foreground: '#2d3436',
            cursor: '#6c5ce7',
            cursorAccent: '#ffffff',
            selectionBackground: '#6c5ce730',
            black: '#2d3436',
            red: '#e74c3c',
            green: '#27ae60',
            yellow: '#f39c12',
            blue: '#6c5ce7',
            magenta: '#8e44ad',
            cyan: '#00cec9',
            white: '#dfe6e9',
            brightBlack: '#636e72',
            brightRed: '#ff6b6b',
            brightGreen: '#00b894',
            brightYellow: '#fdcb6e',
            brightBlue: '#845ef7',
            brightMagenta: '#a29bfe',
            brightCyan: '#81ecec',
            brightWhite: '#ffffff',
        };
    }

    _wireResize() {
        let startY = 0;
        let startHeight = 0;

        const onMouseMove = (e) => {
            const delta = startY - e.clientY;
            const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + delta));
            if (this.panel) this.panel.style.height = newHeight + 'px';
        };

        const onMouseUp = () => {
            this.resizeHandle.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Re-fit xterm after resize
            if (this.fitAddon && this.visible) {
                this.fitAddon.fit();
            }
        };

        this.resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startHeight = this.panel ? this.panel.offsetHeight : 250;
            this.resizeHandle.classList.add('active');
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    async _createSession() {
        try {
            // Get dimensions from FitAddon
            let cols = 80, rows = 24;
            if (this.fitAddon) {
                const dims = this.fitAddon.proposeDimensions();
                if (dims) {
                    cols = dims.cols;
                    rows = dims.rows;
                }
            }

            const result = await window.api.terminalCreate(this.currentCwd, this.currentShell, cols, rows);
            this.sessionId = result.id;

            // Wire IPC data listener (only once)
            if (!this._dataListenerSet) {
                this._dataListenerSet = true;
                window.api.onTerminalData(({ id, data }) => {
                    if (id === this.sessionId && this.xterm) {
                        this.xterm.write(data);
                    }
                });
            }

            if (!this._exitListenerSet) {
                this._exitListenerSet = true;
                window.api.onTerminalExit(({ id, code }) => {
                    if (id === this.sessionId) {
                        if (this.xterm) {
                            this.xterm.write(`\r\n\x1b[33mProzess beendet (Code: ${code})\x1b[0m\r\n`);
                        }
                        this.sessionId = null;
                    }
                });
            }
        } catch (err) {
            if (this.xterm) {
                this.xterm.write(`\x1b[31mFehler: ${err.message}\x1b[0m\r\n`);
            }
        }
    }

    async _restart() {
        if (this.sessionId) {
            await window.api.terminalDestroy(this.sessionId);
            this.sessionId = null;
        }
        if (this.xterm) {
            this.xterm.clear();
            this.xterm.reset();
        }
        await this._createSession();
        if (this.xterm) this.xterm.focus();
    }

    async changeCwd(cwd) {
        this.currentCwd = cwd;
        if (this.sessionId && this.visible) {
            const config = { powershell: (d) => `Set-Location -LiteralPath '${d.replace(/'/g, "''")}'`, cmd: (d) => `cd /d "${d}"`, wsl: (d) => { const p = d.replace(/^([A-Za-z]):/, (_, l) => `/mnt/${l.toLowerCase()}`).replace(/\\/g, '/'); return `cd "${p}"`; } };
            const cdFn = config[this.currentShell];
            if (cdFn) {
                await window.api.terminalWrite(this.sessionId, cdFn(cwd) + '\r');
            }
        }
    }

    /**
     * Update xterm.js theme (call after theme toggle).
     */
    updateTheme() {
        if (this.xterm) {
            this.xterm.options.theme = this._getXtermTheme();
        }
    }
}

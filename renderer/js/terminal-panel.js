/**
 * Terminal Panel - Embedded multi-shell terminal below the explorer file list.
 * Supports PowerShell, CMD, and WSL (if installed).
 * Opens with Ctrl+` and auto-navigates to the current explorer folder.
 * Uses main process spawn (no node-pty/xterm.js dependency).
 */

const SHELL_PROMPTS = {
    powershell: 'PS>',
    cmd: '>',
    wsl: '$',
};

const SHELL_CD_COMMANDS = {
    powershell: (dir) => `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`,
    cmd: (dir) => `cd /d "${dir}"`,
    wsl: (dir) => {
        const wslPath = dir.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
        return `cd "${wslPath}"`;
    },
};

const SHELL_START_MSG = {
    powershell: 'PowerShell',
    cmd: 'CMD',
    wsl: 'WSL (Bash)',
};

export class TerminalPanel {
    constructor(parentContainer) {
        this.parentContainer = parentContainer;
        this.panel = null;
        this.output = null;
        this.input = null;
        this.promptEl = null;
        this.titleEl = null;
        this.shellSelect = null;
        this.sessionId = null;
        this.visible = false;
        this.currentCwd = 'C:\\';
        this.currentShell = 'powershell';
        this.availableShells = [];
        this.history = [];
        this.historyIndex = -1;
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

        this.panel.style.display = '';

        if (!this.sessionId) {
            await this._createSession();
        }

        this.input.focus();
    }

    hide() {
        this.visible = false;
        if (this.panel) this.panel.style.display = 'none';
    }

    async destroy() {
        if (this.sessionId) {
            await window.api.terminalDestroy(this.sessionId);
            this.sessionId = null;
        }
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        this.visible = false;
    }

    async _createDOM() {
        // Load available shells
        try {
            this.availableShells = await window.api.terminalGetShells();
        } catch {
            this.availableShells = [{ id: 'powershell', label: 'PowerShell', available: true }];
        }

        this.panel = document.createElement('div');
        this.panel.className = 'terminal-panel';

        // Build shell selector options
        const shellOptions = this.availableShells.map(s =>
            `<option value="${s.id}" ${!s.available ? 'disabled' : ''} ${s.id === this.currentShell ? 'selected' : ''}>${s.label}</option>`
        ).join('');

        this.panel.innerHTML = `
            <div class="terminal-header">
                <span class="terminal-title">Terminal</span>
                <select class="terminal-shell-select" title="Shell auswählen">${shellOptions}</select>
                <div class="terminal-controls">
                    <button class="terminal-btn terminal-btn-clear" title="Ausgabe löschen">Löschen</button>
                    <button class="terminal-btn terminal-btn-restart" title="Neu starten">Neustart</button>
                    <button class="terminal-btn terminal-btn-close" title="Schließen (Ctrl+\`)">\u00D7</button>
                </div>
            </div>
            <div class="terminal-output"></div>
            <div class="terminal-input-row">
                <span class="terminal-prompt">${SHELL_PROMPTS[this.currentShell]}</span>
                <input type="text" class="terminal-input" placeholder="Befehl eingeben..." spellcheck="false" autocomplete="off">
            </div>
        `;

        this.output = this.panel.querySelector('.terminal-output');
        this.input = this.panel.querySelector('.terminal-input');
        this.promptEl = this.panel.querySelector('.terminal-prompt');
        this.titleEl = this.panel.querySelector('.terminal-title');
        this.shellSelect = this.panel.querySelector('.terminal-shell-select');

        // Wire events
        this.panel.querySelector('.terminal-btn-close').onclick = () => this.hide();
        this.panel.querySelector('.terminal-btn-clear').onclick = () => { this.output.textContent = ''; };
        this.panel.querySelector('.terminal-btn-restart').onclick = () => this._restart();

        // Shell selector change
        this.shellSelect.onchange = async () => {
            const newShell = this.shellSelect.value;
            if (newShell !== this.currentShell) {
                this.currentShell = newShell;
                this.promptEl.textContent = SHELL_PROMPTS[newShell];
                await this._restart();
            }
        };

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._sendCommand(this.input.value);
                this.input.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._navigateHistory(1);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
            e.stopPropagation();
        });

        // Prevent terminal keyboard events from reaching explorer
        this.panel.addEventListener('keydown', (e) => e.stopPropagation());

        this.parentContainer.appendChild(this.panel);
    }

    async _createSession() {
        try {
            const result = await window.api.terminalCreate(this.currentCwd, this.currentShell);
            this.sessionId = result.id;
            const shellLabel = SHELL_START_MSG[this.currentShell] || this.currentShell;
            this._appendOutput(`${shellLabel} gestartet in: ${this.currentCwd}\n`, 'info');

            window.api.onTerminalData(({ id, data }) => {
                if (id === this.sessionId) {
                    this._appendOutput(data);
                }
            });

            window.api.onTerminalExit(({ id, code }) => {
                if (id === this.sessionId) {
                    this._appendOutput(`\nProzess beendet (Code: ${code})\n`, 'info');
                    this.sessionId = null;
                }
            });
        } catch (err) {
            this._appendOutput(`Fehler: ${err.message}\n`, 'error');
        }
    }

    async _sendCommand(cmd) {
        if (!cmd.trim()) return;

        this.history.push(cmd);
        if (this.history.length > 100) this.history.shift();
        this.historyIndex = this.history.length;

        const prompt = SHELL_PROMPTS[this.currentShell] || '>';
        this._appendOutput(`${prompt} ${cmd}\n`, 'cmd');

        if (!this.sessionId) {
            await this._createSession();
        }

        if (this.sessionId) {
            await window.api.terminalWrite(this.sessionId, cmd + '\n');
        }
    }

    _appendOutput(text, type) {
        if (!this.output) return;
        const span = document.createElement('span');
        span.textContent = text;
        if (type === 'error') span.style.color = 'var(--danger)';
        else if (type === 'info') span.style.color = 'var(--accent-text)';
        else if (type === 'cmd') span.style.color = 'var(--success)';
        this.output.appendChild(span);
        this.output.scrollTop = this.output.scrollHeight;
    }

    _navigateHistory(direction) {
        if (this.history.length === 0) return;
        this.historyIndex += direction;
        if (this.historyIndex < 0) this.historyIndex = 0;
        if (this.historyIndex >= this.history.length) {
            this.historyIndex = this.history.length;
            this.input.value = '';
        } else {
            this.input.value = this.history[this.historyIndex];
        }
    }

    async _restart() {
        if (this.sessionId) {
            await window.api.terminalDestroy(this.sessionId);
            this.sessionId = null;
        }
        this.output.textContent = '';
        await this._createSession();
        this.input.focus();
    }

    async changeCwd(cwd) {
        this.currentCwd = cwd;
        if (this.sessionId && this.visible) {
            const cdFn = SHELL_CD_COMMANDS[this.currentShell];
            if (cdFn) {
                await window.api.terminalWrite(this.sessionId, cdFn(cwd) + '\n');
            }
        }
    }
}

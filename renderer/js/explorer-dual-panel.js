import { ExplorerTabBar } from './explorer-tabs.js';

/**
 * ExplorerDualPanel - Commander-style two-pane explorer with optional split view.
 * Wraps two ExplorerTabBar instances (left + right).
 */
export class ExplorerDualPanel {
    constructor(containerEl, options = {}) {
        this.container = containerEl;
        this.onContextMenu = options.onContextMenu || null;
        this.getScanId = options.getScanId || (() => null);

        this.leftPanel = null;
        this.rightPanel = null;
        this.activePanel = 'left';
        this.isDualMode = false;

        this._build();
        this._wireKeyboard();
    }

    async init() {
        // Create left panel with first tab
        const defaultTab = await this.leftPanel.createTab(null);
        // Left panel's first tab shows Quick Access
    }

    toggleDualPanel() {
        if (this.isDualMode) {
            this._disableDualMode();
        } else {
            this._enableDualMode();
        }
    }

    async _enableDualMode() {
        this.isDualMode = true;
        this.splitHandle.style.display = '';
        this.rightPanelEl.style.display = 'flex';
        this.container.querySelector('.explorer-dual-container').classList.add('dual-active');

        if (!this.rightPanel) {
            this.rightPanel = new ExplorerTabBar(this.rightPanelEl, {
                onContextMenu: (type, data, event) => this._handleContextMenu(type, data, 'right', event),
                showQuickAccess: false,
                panelId: 'right',
                getScanId: this.getScanId,
            });
            const currentPath = this.leftPanel.getActiveExplorer()?.currentPath || 'C:\\';
            await this.rightPanel.createTab(currentPath);
        }

        this._updatePanelFocus();
    }

    _disableDualMode() {
        this.isDualMode = false;
        this.splitHandle.style.display = 'none';
        this.rightPanelEl.style.display = 'none';
        this.container.querySelector('.explorer-dual-container').classList.remove('dual-active');

        if (this.activePanel === 'right') {
            this.activePanel = 'left';
        }
        this._updatePanelFocus();
    }

    switchActivePanel() {
        if (!this.isDualMode) return;
        this.activePanel = this.activePanel === 'left' ? 'right' : 'left';
        this._updatePanelFocus();

        // Focus the active panel container for keyboard events
        const panel = this.activePanel === 'left' ? this.leftPanelEl : this.rightPanelEl;
        const explorer = this.getActiveExplorer();
        if (explorer?.container) explorer.container.focus();
    }

    getActiveExplorer() {
        const tabBar = this.activePanel === 'left' ? this.leftPanel : this.rightPanel;
        return tabBar ? tabBar.getActiveExplorer() : null;
    }

    getActiveTabBar() {
        return this.activePanel === 'left' ? this.leftPanel : this.rightPanel;
    }

    getTargetExplorer() {
        if (!this.isDualMode) return null;
        const tabBar = this.activePanel === 'left' ? this.rightPanel : this.leftPanel;
        return tabBar ? tabBar.getActiveExplorer() : null;
    }

    openTerminal(cwd) {
        const path = cwd || this.getActiveExplorer()?.currentPath || 'C:\\';
        document.dispatchEvent(new CustomEvent('toggle-global-terminal', { detail: { cwd: path } }));
    }

    // ===== Internal =====

    _build() {
        const dualContainer = document.createElement('div');
        dualContainer.className = 'explorer-dual-container';

        // Left panel
        this.leftPanelEl = document.createElement('div');
        this.leftPanelEl.className = 'explorer-panel active';
        this.leftPanelEl.dataset.panel = 'left';

        // Split handle
        this.splitHandle = document.createElement('div');
        this.splitHandle.className = 'explorer-split-handle';
        this.splitHandle.style.display = 'none';

        // Right panel
        this.rightPanelEl = document.createElement('div');
        this.rightPanelEl.className = 'explorer-panel';
        this.rightPanelEl.dataset.panel = 'right';
        this.rightPanelEl.style.display = 'none';

        dualContainer.appendChild(this.leftPanelEl);
        dualContainer.appendChild(this.splitHandle);
        dualContainer.appendChild(this.rightPanelEl);
        this.container.appendChild(dualContainer);

        // Create left ExplorerTabBar
        this.leftPanel = new ExplorerTabBar(this.leftPanelEl, {
            onContextMenu: (type, data, event) => this._handleContextMenu(type, data, 'left', event),
            showQuickAccess: true,
            panelId: 'left',
            getScanId: this.getScanId,
        });

        // Wire split handle resize
        this._wireSplitResize();

        // Wire panel click to set active
        this.leftPanelEl.addEventListener('mousedown', () => {
            if (this.activePanel !== 'left') {
                this.activePanel = 'left';
                this._updatePanelFocus();
            }
        });

        this.rightPanelEl.addEventListener('mousedown', () => {
            if (this.activePanel !== 'right') {
                this.activePanel = 'right';
                this._updatePanelFocus();
            }
        });
    }

    _handleContextMenu(type, data, panelSide, event) {
        // Set active panel to the one that was right-clicked
        if (this.activePanel !== panelSide) {
            this.activePanel = panelSide;
            this._updatePanelFocus();
        }

        // Extend data with dual-panel info
        const extendedData = {
            ...data,
            isDualMode: this.isDualMode,
            targetPath: this.getTargetExplorer()?.currentPath || null,
        };

        if (this.onContextMenu) {
            this.onContextMenu(type, extendedData, event);
        }
    }

    _updatePanelFocus() {
        this.leftPanelEl.classList.toggle('active', this.activePanel === 'left');
        this.rightPanelEl.classList.toggle('active', this.activePanel === 'right');
    }

    _wireSplitResize() {
        let startX, startWidth;

        this.splitHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = this.leftPanelEl.offsetWidth;
            this.splitHandle.classList.add('dragging');

            const onMouseMove = (moveE) => {
                const delta = moveE.clientX - startX;
                const containerWidth = this.container.querySelector('.explorer-dual-container').offsetWidth;
                const newWidth = Math.max(200, Math.min(containerWidth - 200, startWidth + delta));
                this.leftPanelEl.style.flexBasis = newWidth + 'px';
                this.leftPanelEl.style.flexGrow = '0';
                this.leftPanelEl.style.flexShrink = '0';
            };

            const onMouseUp = () => {
                this.splitHandle.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    _wireKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Only handle when explorer tab is active
            if (!this.container.closest('.tab-view.active')) return;

            if (e.key === 'F6') {
                e.preventDefault();
                this.switchActivePanel();
            } else if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                this.toggleDualPanel();
            }
        });
    }
}

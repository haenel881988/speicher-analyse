import { escapeHtml } from './utils.js';
import { ExplorerView } from './explorer.js';

/**
 * ExplorerTabBar - Manages multiple tabs, each with its own ExplorerView instance.
 */
export class ExplorerTabBar {
    constructor(containerEl, options = {}) {
        this.container = containerEl;
        this.onContextMenu = options.onContextMenu || null;
        this.showQuickAccess = options.showQuickAccess !== false;
        this.panelId = options.panelId || 'left';
        this.getScanId = options.getScanId || (() => null);
        this.tabs = [];          // [{id, label, explorerView, containerDiv}]
        this.activeTabId = null;
        this.nextTabId = 1;

        // Build DOM structure
        this.tabBarEl = document.createElement('div');
        this.tabBarEl.className = 'explorer-tab-bar';
        this.container.appendChild(this.tabBarEl);

        this.contentEl = document.createElement('div');
        this.contentEl.className = 'explorer-panel-content';
        this.container.appendChild(this.contentEl);

        this._renderTabBar();
        this._wireTabBarKeyboard();
    }

    async createTab(initialPath = null) {
        const tabId = this.nextTabId++;
        const containerDiv = document.createElement('div');
        containerDiv.className = 'explorer-tab-content';
        containerDiv.style.display = 'none';
        this.contentEl.appendChild(containerDiv);

        const instanceId = `${this.panelId}-tab-${tabId}`;
        const explorerView = new ExplorerView(containerDiv, {
            instanceId,
            showQuickAccess: this.showQuickAccess && this.tabs.length === 0,
            onNavigate: (path) => this._onTabNavigate(tabId, path),
            getScanId: this.getScanId,
        });
        explorerView.onContextMenu = this.onContextMenu;

        const label = initialPath
            ? this._pathToLabel(initialPath)
            : 'Neuer Tab';

        const tab = { id: tabId, label, explorerView, containerDiv };
        this.tabs.push(tab);

        await explorerView.init();

        if (initialPath) {
            await explorerView.navigateTo(initialPath, false);
        }

        this.switchToTab(tabId);
        return tab;
    }

    closeTab(tabId) {
        if (this.tabs.length <= 1) return; // mindestens 1 Tab offen

        const idx = this.tabs.findIndex(t => t.id === tabId);
        if (idx < 0) return;

        const tab = this.tabs[idx];
        tab.explorerView.dispose();
        tab.containerDiv.remove();
        this.tabs.splice(idx, 1);

        if (this.activeTabId === tabId) {
            const newIdx = Math.min(idx, this.tabs.length - 1);
            this.switchToTab(this.tabs[newIdx].id);
        } else {
            this._renderTabBar();
        }
    }

    switchToTab(tabId) {
        // Save scroll of current tab
        const currentTab = this.tabs.find(t => t.id === this.activeTabId);
        if (currentTab) {
            const fl = currentTab.explorerView.els.fileList;
            if (fl) currentTab._savedScrollTop = fl.scrollTop;
            currentTab.containerDiv.style.display = 'none';
        }

        this.activeTabId = tabId;

        const newTab = this.tabs.find(t => t.id === tabId);
        if (newTab) {
            newTab.containerDiv.style.display = 'flex';
            // Restore scroll
            if (newTab._savedScrollTop && newTab.explorerView.els.fileList) {
                requestAnimationFrame(() => {
                    newTab.explorerView.els.fileList.scrollTop = newTab._savedScrollTop;
                });
            }
        }

        this._renderTabBar();
    }

    nextTab() {
        const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
        const nextIdx = (idx + 1) % this.tabs.length;
        this.switchToTab(this.tabs[nextIdx].id);
    }

    prevTab() {
        const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
        const prevIdx = (idx - 1 + this.tabs.length) % this.tabs.length;
        this.switchToTab(this.tabs[prevIdx].id);
    }

    getActiveExplorer() {
        const tab = this.tabs.find(t => t.id === this.activeTabId);
        return tab ? tab.explorerView : null;
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId) || null;
    }

    reorderTabs(fromIdx, toIdx) {
        if (fromIdx === toIdx) return;
        const [tab] = this.tabs.splice(fromIdx, 1);
        this.tabs.splice(toIdx, 0, tab);
        this._renderTabBar();
    }

    // ===== Internal =====

    _onTabNavigate(tabId, path) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.label = this._pathToLabel(path);
            this._renderTabBar();
        }
    }

    _pathToLabel(p) {
        if (!p) return 'Neuer Tab';
        if (/^[A-Z]:\\$/i.test(p)) return p.replace('\\', '');
        const segments = p.replace(/\\$/, '').split('\\');
        return segments[segments.length - 1] || p;
    }

    _renderTabBar() {
        let html = '';
        for (let i = 0; i < this.tabs.length; i++) {
            const tab = this.tabs[i];
            const active = tab.id === this.activeTabId ? ' active' : '';
            html += `<div class="explorer-tab${active}" data-tab-id="${tab.id}" data-tab-idx="${i}" draggable="true">
                <span class="explorer-tab-label" title="${this._escAttr(tab.explorerView.currentPath || tab.label)}">${escapeHtml(tab.label)}</span>
                ${this.tabs.length > 1 ? '<button class="explorer-tab-close" title="Tab schliessen (Ctrl+W)">\u00D7</button>' : ''}
            </div>`;
        }
        html += '<button class="explorer-tab-new" title="Neuer Tab (Ctrl+T)">+</button>';
        this.tabBarEl.innerHTML = html;

        // Wire events
        this.tabBarEl.querySelectorAll('.explorer-tab').forEach(el => {
            const tabId = parseInt(el.dataset.tabId);

            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('explorer-tab-close')) return;
                this.switchToTab(tabId);
            });

            el.addEventListener('mousedown', (e) => {
                // Middle-click to close
                if (e.button === 1) {
                    e.preventDefault();
                    this.closeTab(tabId);
                }
            });

            const closeBtn = el.querySelector('.explorer-tab-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(tabId);
                });
            }

            // Drag reorder
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/tab-idx', el.dataset.tabIdx);
                e.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-over');
            });

            el.addEventListener('dragleave', () => {
                el.classList.remove('drag-over');
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                const fromIdx = parseInt(e.dataTransfer.getData('text/tab-idx'));
                const toIdx = parseInt(el.dataset.tabIdx);
                if (!isNaN(fromIdx) && !isNaN(toIdx)) {
                    this.reorderTabs(fromIdx, toIdx);
                }
            });
        });

        // New tab button
        const newBtn = this.tabBarEl.querySelector('.explorer-tab-new');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                const currentPath = this.getActiveExplorer()?.currentPath || null;
                this.createTab(currentPath);
            });
        }
    }

    _wireTabBarKeyboard() {
        this.container.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                e.stopPropagation();
                const currentPath = this.getActiveExplorer()?.currentPath || null;
                this.createTab(currentPath);
            } else if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                e.stopPropagation();
                if (this.activeTabId) this.closeTab(this.activeTabId);
            } else if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) this.prevTab();
                else this.nextTab();
            }
        });
    }

    _escAttr(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }
}

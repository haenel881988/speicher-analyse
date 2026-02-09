import { formatBytes, formatNumber } from './utils.js';

export class TreeView {
    constructor(container, breadcrumbEl) {
        this.container = container;
        this.breadcrumbEl = breadcrumbEl;
        this.scanId = null;
        this.rootPath = null;
        this.rootSize = 0;
        this.expandedPaths = new Set();
        this.cache = new Map();
        this.selectedPaths = new Set();
        this.lastClickedPath = null;
        this.onContextMenu = null;
    }

    init(scanId, rootPath) {
        this.scanId = scanId;
        this.rootPath = rootPath;
        this.expandedPaths.clear();
        this.cache.clear();
        this.selectedPaths.clear();
        this.lastClickedPath = null;
        this.loadRoot();
    }

    async loadRoot() {
        const node = await this.fetchNode(this.rootPath);
        if (!node) return;
        this.rootSize = node.size;
        this.renderBreadcrumb(this.rootPath);
        this.container.innerHTML = '';
        this.renderNode(node, 0, this.rootSize);
        this.expandedPaths.add(node.path);
        await this.toggleExpand(node.path, 0);
    }

    async fetchNode(path) {
        if (this.cache.has(path)) return this.cache.get(path);
        try {
            const node = await window.api.getTreeNode(this.scanId, path, 1);
            if (node.error) return null;
            this.cache.set(path, node);
            return node;
        } catch (e) {
            console.error('Fetch tree error:', e);
            return null;
        }
    }

    invalidateCache(path) {
        for (const key of this.cache.keys()) {
            if (key === path || key.startsWith(path + '\\') || key.startsWith(path + '/')) {
                this.cache.delete(key);
            }
        }
    }

    renderBreadcrumb(path) {
        if (!this.breadcrumbEl) return;
        this.breadcrumbEl.innerHTML = '';

        const isWindows = path.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const segments = path.split(sep).filter(Boolean);

        let buildPath = '';
        const parts = [];
        for (let i = 0; i < segments.length; i++) {
            buildPath += segments[i] + (i === 0 && isWindows ? '\\' : sep);
            parts.push({ name: segments[i], path: buildPath });
        }

        parts.forEach((part, i) => {
            if (i > 0) {
                const s = document.createElement('span');
                s.className = 'breadcrumb-sep';
                s.textContent = '\u203A';
                this.breadcrumbEl.appendChild(s);
            }
            const el = document.createElement('span');
            if (i === parts.length - 1) {
                el.className = 'breadcrumb-current';
                el.textContent = part.name;
            } else {
                el.className = 'breadcrumb-item';
                el.textContent = part.name;
                el.onclick = () => {
                    this.rootPath = part.path;
                    this.loadRoot();
                };
            }
            this.breadcrumbEl.appendChild(el);
        });
    }

    renderNode(node, depth, parentSize) {
        const row = this.createNodeElement(node, depth, parentSize);
        if (this.expandedPaths.has(node.path)) {
            const arrow = row.querySelector('.tree-arrow');
            if (arrow) arrow.classList.add('expanded');
        }
        this.container.appendChild(row);
    }

    createNodeElement(node, depth, parentSize) {
        const row = document.createElement('div');
        row.className = 'tree-row';
        row.dataset.path = node.path;
        row.dataset.depth = depth;
        row.style.paddingLeft = (12 + depth * 20) + 'px';
        row.draggable = true;

        const hasChildren = node.dir_count > 0;
        const isExpanded = this.expandedPaths.has(node.path);
        const pct = parentSize > 0 ? (node.size / parentSize * 100) : 0;
        const itemCount = node.file_count + node.dir_count;

        row.innerHTML = `
            <span class="tree-arrow ${isExpanded ? 'expanded' : ''} ${!hasChildren ? 'empty' : ''}">\u25B6</span>
            <span class="tree-icon">\uD83D\uDCC1</span>
            <span class="tree-name" title="${this.escapeAttr(node.path)}">${this.escapeHtml(node.name)}</span>
            <span class="tree-bar">
                <div class="size-bar"><div class="size-bar-fill" style="width:${Math.max(pct, 0.5)}%"></div></div>
            </span>
            <span class="tree-size">${formatBytes(node.size)}</span>
            <span class="tree-items">${formatNumber(itemCount)}</span>
            <span class="tree-pct">${pct.toFixed(1)}%</span>
        `;

        // Click to expand/collapse + multi-select
        row.onclick = (e) => {
            e.stopPropagation();
            this.selectRow(node.path, e);
            if (hasChildren) {
                this.toggleExpand(node.path, depth);
            }
        };

        // Right-click context menu
        row.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // If right-clicking an unselected row, select only that
            if (!this.selectedPaths.has(node.path)) {
                this.selectRow(node.path);
            }
            if (this.onContextMenu) {
                this.onContextMenu('directory', {
                    path: node.path,
                    name: node.name,
                    selectedPaths: [...this.selectedPaths],
                });
            }
        };

        // Drag start with multi-select
        row.ondragstart = (e) => {
            const paths = this.selectedPaths.has(node.path)
                ? [...this.selectedPaths]
                : [node.path];
            e.dataTransfer.setData('text/plain', JSON.stringify(paths));
            e.dataTransfer.effectAllowed = 'copyMove';
            row.classList.add('dragging');
        };

        row.ondragend = () => {
            row.classList.remove('dragging');
        };

        // Drop target
        if (hasChildren || node.dir_count >= 0) {
            row.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                row.classList.add('drag-over');
            };

            row.ondragleave = () => {
                row.classList.remove('drag-over');
            };

            row.ondrop = async (e) => {
                e.preventDefault();
                row.classList.remove('drag-over');
                let sourcePaths;
                try {
                    sourcePaths = JSON.parse(e.dataTransfer.getData('text/plain'));
                } catch {
                    sourcePaths = [e.dataTransfer.getData('text/plain')];
                }
                if (!sourcePaths.length) return;

                // Filter out invalid drops
                sourcePaths = sourcePaths.filter(p => p !== node.path && !node.path.startsWith(p));
                if (!sourcePaths.length) return;

                if (e.ctrlKey) {
                    await window.api.copy(sourcePaths, node.path);
                } else {
                    await window.api.move(sourcePaths, node.path);
                }
                this.invalidateCache(node.path);
                for (const src of sourcePaths) {
                    const parentPath = src.substring(0, Math.max(src.lastIndexOf('\\'), src.lastIndexOf('/')));
                    if (parentPath) this.invalidateCache(parentPath);
                }
                this.loadRoot();
            };
        }

        return row;
    }

    selectRow(path, event) {
        if (event && (event.ctrlKey || event.metaKey)) {
            // Ctrl+Click: toggle
            if (this.selectedPaths.has(path)) {
                this.selectedPaths.delete(path);
            } else {
                this.selectedPaths.add(path);
            }
            this.lastClickedPath = path;
        } else if (event && event.shiftKey && this.lastClickedPath) {
            // Shift+Click: range selection
            const rows = [...this.container.querySelectorAll('.tree-row')];
            const startIdx = rows.findIndex(r => r.dataset.path === this.lastClickedPath);
            const endIdx = rows.findIndex(r => r.dataset.path === path);
            if (startIdx >= 0 && endIdx >= 0) {
                const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                this.selectedPaths.clear();
                for (let i = lo; i <= hi; i++) {
                    this.selectedPaths.add(rows[i].dataset.path);
                }
            }
        } else {
            // Normal click: single select
            this.selectedPaths.clear();
            this.selectedPaths.add(path);
            this.lastClickedPath = path;
        }
        this.updateSelectionVisual();
    }

    updateSelectionVisual() {
        this.container.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
        for (const p of this.selectedPaths) {
            const row = this.container.querySelector(`[data-path="${CSS.escape(p)}"]`);
            if (row) row.classList.add('selected');
        }
    }

    selectAll() {
        this.selectedPaths.clear();
        this.container.querySelectorAll('.tree-row').forEach(r => {
            this.selectedPaths.add(r.dataset.path);
        });
        this.updateSelectionVisual();
    }

    getSelectedPaths() {
        return [...this.selectedPaths];
    }

    getSelectedPath() {
        if (this.selectedPaths.size === 0) return null;
        return [...this.selectedPaths][0];
    }

    async toggleExpand(path, depth) {
        const row = this.container.querySelector(`[data-path="${CSS.escape(path)}"]`);
        if (!row) return;

        const arrow = row.querySelector('.tree-arrow');
        const isExpanded = this.expandedPaths.has(path);

        if (isExpanded) {
            this.expandedPaths.delete(path);
            arrow.classList.remove('expanded');
            this.removeChildren(path);
        } else {
            this.expandedPaths.add(path);
            arrow.classList.add('expanded');

            const node = await this.fetchNode(path);
            if (!node || !node.children) return;

            const nextSibling = row.nextSibling;
            const parentSize = node.size;
            const sortedChildren = [...node.children].sort((a, b) => b.size - a.size);

            for (const child of sortedChildren) {
                const childRow = this.createNodeElement(child, depth + 1, parentSize);
                if (nextSibling) {
                    this.container.insertBefore(childRow, nextSibling);
                } else {
                    this.container.appendChild(childRow);
                }
            }
        }
    }

    removeChildren(parentPath) {
        const parentRow = this.container.querySelector(`[data-path="${CSS.escape(parentPath)}"]`);
        if (!parentRow) return;
        const parentDepth = parseInt(parentRow.dataset.depth || '0');
        const rows = [...this.container.querySelectorAll('.tree-row')];
        let removing = false;

        for (const row of rows) {
            if (row.dataset.path === parentPath) {
                removing = true;
                continue;
            }
            if (removing) {
                const depth = parseInt(row.dataset.depth);
                if (depth > parentDepth) {
                    this.expandedPaths.delete(row.dataset.path);
                    row.remove();
                } else {
                    break;
                }
            }
        }
    }

    startInlineRename(path) {
        const row = this.container.querySelector(`[data-path="${CSS.escape(path)}"]`);
        if (!row) return;
        const nameSpan = row.querySelector('.tree-name');
        const currentName = nameSpan.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-rename-input';
        input.value = currentName;
        nameSpan.textContent = '';
        nameSpan.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = async () => {
            if (committed) return;
            committed = true;
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                try {
                    const result = await window.api.rename(path, newName);
                    if (result.success) {
                        row.dataset.path = result.newPath;
                        nameSpan.textContent = newName;
                        nameSpan.title = result.newPath;
                        this.cache.delete(path);
                        this.selectedPaths.delete(path);
                        this.selectedPaths.add(result.newPath);
                    } else {
                        nameSpan.textContent = currentName;
                        showToast('Umbenennen fehlgeschlagen: ' + (result.error || 'Unbekannter Fehler'), 'error');
                    }
                } catch (err) {
                    nameSpan.textContent = currentName;
                    showToast('Umbenennen fehlgeschlagen: ' + err.message, 'error');
                }
            } else {
                nameSpan.textContent = currentName;
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { committed = true; nameSpan.textContent = currentName; }
            e.stopPropagation();
        });
        input.addEventListener('blur', commit);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttr(text) {
        return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}

// Toast notification helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

export { showToast };

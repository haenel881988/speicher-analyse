import { formatBytes } from './utils.js';

export class TreemapView {
    constructor(container, breadcrumbEl, tooltipEl) {
        this.container = container;
        this.breadcrumbEl = breadcrumbEl;
        this.tooltip = tooltipEl;
        this.tooltipName = document.getElementById('tooltip-name');
        this.tooltipDetail = document.getElementById('tooltip-detail');
        this.scanId = null;
        this.rootPath = null;
        this.history = [];
        this.onContextMenu = null;
        this._resizeTimer = null;
        this.resizeObserver = new ResizeObserver(() => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                if (this.scanId && this.rootPath) this.render(this.rootPath);
            }, 200);
        });
        this.resizeObserver.observe(this.container);
    }

    destroy() {
        clearTimeout(this._resizeTimer);
        this.resizeObserver.disconnect();
    }

    init(scanId, rootPath) {
        this.scanId = scanId;
        this.rootPath = rootPath;
        this.history = [rootPath];
        this.render(rootPath);
    }

    async render(path) {
        this.rootPath = path;
        this.renderBreadcrumb();

        const data = await window.api.getTreemapData(this.scanId, path, 2);
        if (data.error) return;

        this.container.innerHTML = '';
        const rect = this.container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        if (width <= 0 || height <= 0) return;

        const items = [];
        if (data.children) {
            for (const child of data.children) {
                if (child.size > 0) items.push(child);
            }
        }
        if (data.own_size > 0) {
            items.push({
                name: '[Dateien in diesem Ordner]',
                path, size: data.own_size, own_size: data.own_size,
                is_own_files: true, dir_count: 0, file_count: data.file_count,
            });
        }

        if (items.length === 0) {
            this.container.innerHTML = '<div class="welcome-state"><div class="welcome-icon">&#128194;</div><div class="welcome-title">Leerer Ordner</div></div>';
            return;
        }

        items.sort((a, b) => b.size - a.size);
        const rects = this.squarify(items, { x: 0, y: 0, w: width, h: height }, data.size);

        const colors = [
            '#6c5ce7', '#e94560', '#4ecca3', '#00b4d8', '#ffc107',
            '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6',
            '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#06b6d4',
        ];

        rects.forEach((r, i) => {
            const cell = document.createElement('div');
            cell.className = 'treemap-cell';
            cell.style.left = r.x + 'px';
            cell.style.top = r.y + 'px';
            cell.style.width = Math.max(r.w, 0) + 'px';
            cell.style.height = Math.max(r.h, 0) + 'px';
            cell.style.background = colors[i % colors.length];
            cell.style.borderRadius = '3px';

            const pct = data.size > 0 ? (r.item.size / data.size * 100).toFixed(1) : 0;

            if (r.w > 50 && r.h > 25) {
                const label = document.createElement('div');
                label.className = 'treemap-label';
                label.textContent = r.item.name;
                if (r.w > 80 && r.h > 40) {
                    const sizeSpan = document.createElement('span');
                    sizeSpan.className = 'treemap-label-size';
                    sizeSpan.textContent = `${formatBytes(r.item.size)} (${pct}%)`;
                    label.appendChild(sizeSpan);
                }
                cell.appendChild(label);
            }

            if (!r.item.is_own_files && r.item.dir_count > 0) {
                cell.style.cursor = 'pointer';
                cell.onclick = () => {
                    this.history.push(r.item.path);
                    this.render(r.item.path);
                };
            }

            // Context menu
            cell.oncontextmenu = (e) => {
                e.preventDefault();
                if (this.onContextMenu && !r.item.is_own_files) {
                    this.onContextMenu('directory', { path: r.item.path, name: r.item.name }, e);
                }
            };

            cell.onmouseenter = (e) => this.showTooltip(e, r.item, pct);
            cell.onmousemove = (e) => this.moveTooltip(e);
            cell.onmouseleave = () => this.hideTooltip();

            this.container.appendChild(cell);
        });
    }

    squarify(items, rect, totalSize) {
        const result = [];
        if (items.length === 0 || totalSize <= 0) return result;

        let remaining = [...items];
        let currentRect = { ...rect };

        while (remaining.length > 0) {
            const isWide = currentRect.w >= currentRect.h;
            const side = isWide ? currentRect.h : currentRect.w;
            if (side <= 0) break;

            let row = [remaining[0]];
            remaining = remaining.slice(1);
            let bestRatio = this.worstRatio(row, side, totalSize, currentRect);

            while (remaining.length > 0) {
                const candidate = [...row, remaining[0]];
                const candidateRatio = this.worstRatio(candidate, side, totalSize, currentRect);
                if (candidateRatio <= bestRatio) {
                    row.push(remaining[0]);
                    remaining = remaining.slice(1);
                    bestRatio = candidateRatio;
                } else break;
            }

            let rowSize = 0;
            for (const item of row) rowSize += item.size;
            const rowArea = (rowSize / totalSize) * (rect.w * rect.h);
            const rowThickness = isWide ? (rowArea / currentRect.h) : (rowArea / currentRect.w);

            let offset = 0;
            for (const item of row) {
                const itemArea = (item.size / totalSize) * (rect.w * rect.h);
                const itemLength = rowThickness > 0 ? itemArea / rowThickness : 0;
                result.push(isWide
                    ? { x: currentRect.x, y: currentRect.y + offset, w: rowThickness, h: itemLength, item }
                    : { x: currentRect.x + offset, y: currentRect.y, w: itemLength, h: rowThickness, item }
                );
                offset += itemLength;
            }

            if (isWide) { currentRect.x += rowThickness; currentRect.w -= rowThickness; }
            else { currentRect.y += rowThickness; currentRect.h -= rowThickness; }
        }
        return result;
    }

    worstRatio(row, side, totalSize, rect) {
        const totalArea = rect.w * rect.h;
        let rowSum = 0;
        for (const item of row) rowSum += item.size;
        const rowArea = (rowSum / totalSize) * totalArea;
        if (rowArea <= 0 || side <= 0) return Infinity;
        const rowThickness = rowArea / side;
        let worst = 0;
        for (const item of row) {
            const itemArea = (item.size / totalSize) * totalArea;
            const itemLength = rowThickness > 0 ? itemArea / rowThickness : 0;
            const ratio = itemLength > rowThickness ? itemLength / rowThickness : rowThickness / itemLength;
            worst = Math.max(worst, ratio);
        }
        return worst;
    }

    renderBreadcrumb() {
        if (!this.breadcrumbEl) return;
        this.breadcrumbEl.innerHTML = '';
        for (let i = 0; i < this.history.length; i++) {
            const path = this.history[i];
            const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
            if (i > 0) {
                const sep = document.createElement('span');
                sep.className = 'breadcrumb-sep';
                sep.textContent = '\u203A';
                this.breadcrumbEl.appendChild(sep);
            }
            const el = document.createElement('span');
            if (i === this.history.length - 1) {
                el.className = 'breadcrumb-current';
                el.textContent = name;
            } else {
                el.className = 'breadcrumb-item';
                el.textContent = name;
                el.onclick = () => { this.history = this.history.slice(0, i + 1); this.render(path); };
            }
            this.breadcrumbEl.appendChild(el);
        }
    }

    showTooltip(e, item, pct) {
        this.tooltipName.textContent = item.name;
        this.tooltipDetail.innerHTML = `Größe: <strong>${formatBytes(item.size)}</strong> (${pct}%)<br>${item.dir_count > 0 ? `Ordner: ${item.dir_count}<br>` : ''}${item.file_count > 0 ? `Dateien: ${item.file_count}<br>` : ''}<span style="color:var(--text-muted);font-size:11px">${this.escapeHtml(item.path)}</span>`;
        this.tooltip.style.display = 'block';
        this.moveTooltip(e);
    }

    moveTooltip(e) { this.tooltip.style.left = (e.clientX + 12) + 'px'; this.tooltip.style.top = (e.clientY + 12) + 'px'; }
    hideTooltip() { this.tooltip.style.display = 'none'; }
    escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
}

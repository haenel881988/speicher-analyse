import { formatBytes, formatNumber, getCategoryColor, getCategoryClass } from './utils.js';

export class FileTypeChart {
    constructor(canvasEl, tableBodyEl) {
        this.canvas = canvasEl;
        this.tableBody = tableBodyEl;
        this.chart = null;
        this.scanId = null;
        this.rawData = [];
        this.sortCol = 'total_size';
        this.sortAsc = false;
        this.onContextMenu = null;
    }

    async init(scanId) {
        this.scanId = scanId;
        try {
            this.rawData = await window.api.getFileTypes(scanId);
        } catch (e) {
            console.error('Error loading file types:', e);
            this.rawData = [];
        }
        this.renderChart();
        this.renderTable();
    }

    renderChart() {
        const categoryMap = new Map();
        for (const item of this.rawData) {
            const existing = categoryMap.get(item.category) || { count: 0, total_size: 0 };
            existing.count += item.count;
            existing.total_size += item.total_size;
            categoryMap.set(item.category, existing);
        }

        const categories = [...categoryMap.entries()].sort((a, b) => b[1].total_size - a[1].total_size);
        const labels = categories.map(c => c[0]);
        const data = categories.map(c => c[1].total_size);
        const colors = labels.map(l => getCategoryColor(l));

        if (this.chart) this.chart.destroy();

        const isDark = document.documentElement.dataset.theme !== 'light';
        const textColor = isDark ? '#e8e8ed' : '#1a1d27';

        const self = this;
        this.chart = new Chart(this.canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderColor: isDark ? '#0f1117' : '#ffffff', borderWidth: 2, hoverOffset: 8 }],
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                onClick(event, elements) {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const category = labels[idx];
                        self.showCategoryFiles(category);
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0;
                                const cat = categoryMap.get(ctx.label);
                                return ` ${ctx.label}: ${formatBytes(ctx.raw)} (${pct}%) - ${formatNumber(cat.count)} Dateien`;
                            },
                        },
                    },
                },
            },
        });
    }

    renderTable() {
        if (!this.tableBody) return;
        const totalSize = this.rawData.reduce((sum, item) => sum + item.total_size, 0);
        const sorted = [...this.rawData].sort((a, b) => {
            let va = a[this.sortCol], vb = b[this.sortCol];
            if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
            return this.sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
        });

        this.tableBody.innerHTML = sorted.map(item => {
            const pct = totalSize > 0 ? (item.total_size / totalSize * 100).toFixed(1) : '0.0';
            const catClass = getCategoryClass(item.category);
            return `<tr data-ext="${escapeAttr(item.extension)}" style="cursor:pointer"><td class="ext-col">${escapeHtml(item.extension)}</td><td><span class="category-badge ${catClass}">${item.category}</span></td><td class="count-col">${formatNumber(item.count)}</td><td class="size-col">${formatBytes(item.total_size)}</td><td class="pct-col">${pct}%</td></tr>`;
        }).join('');

        this.tableBody.querySelectorAll('tr').forEach(row => {
            row.onclick = () => {
                const ext = row.dataset.ext;
                if (ext) this.showExtensionFiles(ext);
            };
        });
    }

    setupTableSort(tableEl) {
        const headers = tableEl.querySelectorAll('th');
        const cols = ['extension', 'category', 'count', 'total_size', 'total_size'];
        headers.forEach((th, i) => {
            th.onclick = () => {
                const col = cols[i];
                if (this.sortCol === col) this.sortAsc = !this.sortAsc;
                else { this.sortCol = col; this.sortAsc = false; }
                this.renderTable();
            };
        });
    }

    updateTheme() {
        if (this.rawData.length > 0) this.renderChart();
    }

    setupDetailPanel() {
        const backBtn = document.getElementById('filetype-back-btn');
        if (backBtn) {
            backBtn.onclick = () => this.hideDetail();
        }
    }

    async showExtensionFiles(ext) {
        if (!this.scanId) return;
        this.showDetailPanel(`Dateien: ${ext}`);
        const body = document.getElementById('filetype-detail-body');
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Lade Dateien...</td></tr>';

        try {
            const files = await window.api.getFilesByExtension(this.scanId, ext, 500);
            this.renderDetailFiles(files, body);
        } catch (e) {
            body.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">Fehler: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    async showCategoryFiles(category) {
        if (!this.scanId) return;
        this.showDetailPanel(`Kategorie: ${category}`);
        const body = document.getElementById('filetype-detail-body');
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Lade Dateien...</td></tr>';

        try {
            const files = await window.api.getFilesByCategory(this.scanId, category, 500);
            this.renderDetailFiles(files, body);
        } catch (e) {
            body.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">Fehler: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    showDetailPanel(title) {
        const overview = document.getElementById('filetype-overview');
        const detail = document.getElementById('filetype-detail');
        const titleEl = document.getElementById('filetype-detail-title');
        if (overview) overview.style.display = 'none';
        if (detail) detail.style.display = 'block';
        if (titleEl) titleEl.textContent = title;
    }

    hideDetail() {
        const overview = document.getElementById('filetype-overview');
        const detail = document.getElementById('filetype-detail');
        const actionsEl = document.getElementById('filetype-detail-actions');
        if (overview) overview.style.display = '';
        if (detail) detail.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
    }

    renderDetailFiles(files, body) {
        if (files.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Keine Dateien gefunden</td></tr>';
            const actionsEl = document.getElementById('filetype-detail-actions');
            if (actionsEl) actionsEl.style.display = 'none';
            return;
        }

        this.detailFiles = files;

        const actionsEl = document.getElementById('filetype-detail-actions');
        if (actionsEl) actionsEl.style.display = 'flex';

        body.innerHTML = files.map((f, i) => {
            const dirPath = f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')));
            return `<tr data-path="${escapeAttr(f.path)}" data-name="${escapeAttr(f.name)}" data-size="${f.size}" style="cursor:pointer">
                <td><input type="checkbox" class="detail-check" data-path="${escapeAttr(f.path)}" data-size="${f.size}"></td>
                <td class="rank-col">${i + 1}</td>
                <td class="name-col" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</td>
                <td class="path-col" title="${escapeHtml(dirPath)}">${escapeHtml(dirPath)}</td>
                <td class="size-col">${formatBytes(f.size)}</td>
            </tr>`;
        }).join('');

        body.querySelectorAll('tr').forEach(row => {
            row.onclick = (e) => {
                if (e.target.type === 'checkbox') return;
                const cb = row.querySelector('.detail-check');
                if (cb) {
                    cb.checked = !cb.checked;
                    this.updateDetailSelection();
                }
            };
            row.ondblclick = () => window.api.openFile(row.dataset.path);
            row.oncontextmenu = (e) => {
                e.preventDefault();
                if (this.onContextMenu) {
                    this.onContextMenu('file', { path: row.dataset.path, name: row.dataset.name });
                }
            };
        });

        body.querySelectorAll('.detail-check').forEach(cb => {
            cb.onchange = () => this.updateDetailSelection();
        });

        this.setupDetailActions();
    }

    setupDetailActions() {
        const checkAll = document.getElementById('filetype-check-all');
        const deleteBtn = document.getElementById('filetype-delete-btn');

        if (checkAll) {
            checkAll.checked = false;
            checkAll.onchange = () => {
                document.querySelectorAll('#filetype-detail-body .detail-check').forEach(cb => {
                    cb.checked = checkAll.checked;
                });
                this.updateDetailSelection();
            };
        }

        if (deleteBtn) {
            deleteBtn.onclick = () => this.deleteDetailSelected();
        }
    }

    updateDetailSelection() {
        let count = 0, size = 0;
        document.querySelectorAll('#filetype-detail-body .detail-check:checked').forEach(cb => {
            count++;
            size += parseInt(cb.dataset.size);
        });
        const info = document.getElementById('filetype-selected-info');
        const btn = document.getElementById('filetype-delete-btn');
        if (info) info.textContent = count > 0 ? `${count} ausgewählt (${formatBytes(size)})` : '';
        if (btn) btn.disabled = count === 0;
    }

    async deleteDetailSelected() {
        const paths = [];
        document.querySelectorAll('#filetype-detail-body .detail-check:checked').forEach(cb => {
            paths.push(cb.dataset.path);
        });
        if (paths.length === 0) return;

        const result = await window.api.showConfirmDialog({
            type: 'warning',
            title: 'Dateien löschen',
            message: `${paths.length} Datei(en) in den Papierkorb verschieben?`,
            buttons: ['Abbrechen', 'Löschen'],
            defaultId: 0,
        });
        if (result.response !== 1) return;

        try {
            const results = await window.api.deleteToTrash(paths);
            const failed = results.filter(r => !r.success);
            const succeeded = results.length - failed.length;
            if (failed.length > 0) {
                const msg = failed.length === 1 ? failed[0].error : `${failed.length} Fehler`;
                this._showToast(`${succeeded} gelöscht, ${msg}`, 'error');
            } else {
                this._showToast(`${succeeded} Datei(en) gelöscht`, 'success');
            }
            // Remove deleted rows from DOM
            results.filter(r => r.success).forEach(r => {
                const row = document.querySelector(`#filetype-detail-body tr[data-path="${escapeAttr(r.path)}"]`);
                if (row) row.remove();
            });
            this.updateDetailSelection();
        } catch (e) {
            this._showToast('Fehler: ' + e.message, 'error');
        }
    }

    _showToast(msg, type) {
        // Import-free toast: dispatch custom event or use direct DOM
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

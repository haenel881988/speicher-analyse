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

        this.chart = new Chart(this.canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderColor: isDark ? '#0f1117' : '#ffffff', borderWidth: 2, hoverOffset: 8 }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
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
            return `<tr><td class="ext-col">${item.extension}</td><td><span class="category-badge ${catClass}">${item.category}</span></td><td class="count-col">${formatNumber(item.count)}</td><td class="size-col">${formatBytes(item.total_size)}</td><td class="pct-col">${pct}%</td></tr>`;
        }).join('');
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
}

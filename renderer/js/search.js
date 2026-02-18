import { formatBytes, debounce, parseSize, escapeHtml, escapeAttr } from './utils.js';

export class SearchPanel {
    constructor(inputEl, minSizeEl, resultsEl, onNavigate) {
        this.input = inputEl;
        this.minSizeInput = minSizeEl;
        this.results = resultsEl;
        this.onNavigate = onNavigate;
        this.onContextMenu = null;
        this.scanId = null;

        this.debouncedSearch = debounce(() => this.doSearch(), 300);
        this.input.addEventListener('input', () => this.debouncedSearch());
        this.minSizeInput.addEventListener('input', () => this.debouncedSearch());
        this.minSizeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doSearch(); });
        this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doSearch(); });
    }

    enable(scanId) {
        this.scanId = scanId;
        this.input.disabled = false;
        this.minSizeInput.disabled = false;
    }

    disable() {
        this.scanId = null;
        this.input.disabled = true;
        this.minSizeInput.disabled = true;
        this.results.innerHTML = '';
    }

    async doSearch() {
        const query = this.input.value.trim();
        if (!query || !this.scanId) { this.results.innerHTML = ''; return; }

        const minSize = parseSize(this.minSizeInput.value);
        try {
            const items = await window.api.search(this.scanId, query, minSize);
            this.renderResults(items);
        } catch (e) {
            this.results.innerHTML = '<div style="padding:8px;color:var(--danger)">Fehler bei der Suche</div>';
        }
    }

    renderResults(items) {
        if (items.length === 0) {
            this.results.innerHTML = '<div style="padding:8px;color:var(--text-muted)">Keine Ergebnisse</div>';
            return;
        }

        this.results.innerHTML = items.map(item => `
            <div class="search-result-item" data-path="${escapeAttr(item.path)}" data-is-dir="${item.is_dir}">
                <span class="search-result-icon">${item.is_dir ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
                <span class="search-result-name" title="${escapeAttr(item.path)}">${escapeHtml(item.name)}</span>
                <span class="search-result-size">${formatBytes(item.size)}</span>
            </div>
        `).join('');

        this.results.querySelectorAll('.search-result-item').forEach(el => {
            el.onclick = () => {
                const path = el.dataset.path;
                const isDir = el.dataset.isDir === 'true';
                if (this.onNavigate) this.onNavigate(path, isDir);
            };
            el.oncontextmenu = (e) => {
                e.preventDefault();
                const path = el.dataset.path;
                const isDir = el.dataset.isDir === 'true';
                const name = el.querySelector('.search-result-name').textContent;
                if (this.onContextMenu) {
                    this.onContextMenu(isDir ? 'directory' : 'file', { path, name });
                }
            };
        });
    }

    // escapeHtml + escapeAttr importiert aus utils.js (keine lokalen Kopien)
}

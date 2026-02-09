import { formatBytes } from './utils.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']);
const TEXT_EXTS = new Set(['.txt', '.log', '.json', '.xml', '.csv', '.md', '.ini', '.cfg', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css', '.bat', '.ps1', '.sh', '.toml', '.env', '.gitignore', '.editorconfig']);
const PDF_EXTS = new Set(['.pdf']);

export class PreviewPanel {
    constructor(container, titleEl, closeBtn) {
        this.container = container;
        this.titleEl = titleEl;
        this.closeBtn = closeBtn;
        this.panel = container.closest('#preview-panel') || container.parentElement;
        this.currentPath = null;

        closeBtn.onclick = () => this.hide();
    }

    show(filePath) {
        if (!filePath) return;
        this.currentPath = filePath;
        this.panel.style.display = 'flex';

        const name = filePath.split(/[/\\]/).pop();
        const ext = (name.includes('.') ? '.' + name.split('.').pop() : '').toLowerCase();
        this.titleEl.textContent = name;

        if (IMAGE_EXTS.has(ext)) {
            this.renderImage(filePath);
        } else if (TEXT_EXTS.has(ext)) {
            this.renderText(filePath);
        } else if (PDF_EXTS.has(ext)) {
            this.renderPdf(filePath);
        } else {
            this.renderDefault(filePath, ext);
        }
    }

    hide() {
        this.panel.style.display = 'none';
        this.container.innerHTML = '';
        this.currentPath = null;
    }

    toggle() {
        if (this.panel.style.display === 'none' || !this.panel.style.display) {
            this.panel.style.display = 'flex';
            if (!this.currentPath) {
                this.container.innerHTML = '<div class="preview-empty">Datei auswählen für Vorschau</div>';
            }
        } else {
            this.hide();
        }
    }

    isVisible() {
        return this.panel.style.display === 'flex';
    }

    renderImage(filePath) {
        // Convert Windows path to file:// URL
        const fileUrl = 'file:///' + filePath.replace(/\\/g, '/').replace(/ /g, '%20');
        this.container.innerHTML = `<div class="preview-image-wrap"><img class="preview-image" src="${fileUrl}" alt="Vorschau"></div>`;
        const img = this.container.querySelector('.preview-image');
        img.onerror = () => {
            this.container.innerHTML = '<div class="preview-error">Bild konnte nicht geladen werden</div>';
        };
    }

    async renderText(filePath) {
        this.container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const result = await window.api.readFilePreview(filePath, 500);
            if (result.error) {
                this.container.innerHTML = `<div class="preview-error">${result.error}</div>`;
                return;
            }

            const lines = result.content.split('\n');
            const numbered = lines.map((line, i) => {
                const num = String(i + 1).padStart(4, ' ');
                return `<span class="line-num">${num}</span>${this.escapeHtml(line)}`;
            }).join('\n');

            this.container.innerHTML = `
                <div class="preview-text-info">${result.totalLines} Zeilen${result.truncated ? ' (gekürzt)' : ''}</div>
                <pre class="preview-text">${numbered}</pre>
            `;
        } catch (e) {
            this.container.innerHTML = `<div class="preview-error">Fehler: ${e.message}</div>`;
        }
    }

    renderPdf(filePath) {
        const fileUrl = 'file:///' + filePath.replace(/\\/g, '/').replace(/ /g, '%20');
        this.container.innerHTML = `<iframe class="preview-pdf" src="${fileUrl}"></iframe>`;
    }

    async renderDefault(filePath, ext) {
        try {
            const props = await window.api.getProperties(filePath);
            if (props.error) {
                this.container.innerHTML = `<div class="preview-error">${props.error}</div>`;
                return;
            }

            const size = props.isDirectory
                ? formatBytes(props.totalSize || 0)
                : formatBytes(props.size);

            this.container.innerHTML = `
                <div class="preview-props">
                    <div class="preview-props-icon">${props.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</div>
                    <div class="preview-props-name">${this.escapeHtml(props.name)}</div>
                    <div class="prop-row"><span class="prop-label">Typ</span><span class="prop-value">${ext || (props.isDirectory ? 'Ordner' : 'Datei')}</span></div>
                    <div class="prop-row"><span class="prop-label">Größe</span><span class="prop-value">${size}</span></div>
                    <div class="prop-row"><span class="prop-label">Geändert</span><span class="prop-value">${this.fmtDate(props.modified)}</span></div>
                    <div class="prop-row"><span class="prop-label">Erstellt</span><span class="prop-value">${this.fmtDate(props.created)}</span></div>
                </div>
            `;
        } catch (e) {
            this.container.innerHTML = `<div class="preview-error">Fehler: ${e.message}</div>`;
        }
    }

    fmtDate(iso) {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('de-DE');
    }

    escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

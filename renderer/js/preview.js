import { formatBytes } from './utils.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']);
const PDF_EXTS = new Set(['.pdf']);
const DOCX_EXTS = new Set(['.docx']);
const XLSX_EXTS = new Set(['.xlsx', '.xls']);

// Extensions that should NOT be opened in the editor (binary/non-text)
const BINARY_EXTS = new Set([
    '.exe', '.dll', '.sys', '.bin', '.dat', '.iso', '.img', '.dmg',
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.flac', '.ogg',
    '.doc', '.ppt', '.pptx',
    '.msi', '.cab', '.wim',
]);

// Monaco language IDs by extension
const LANG_MAP = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.json': 'json', '.jsonc': 'json',
    '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.py': 'python',
    '.md': 'markdown',
    '.xml': 'xml', '.svg': 'xml',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.sql': 'sql',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.bat': 'bat', '.cmd': 'bat',
    '.ps1': 'powershell', '.psm1': 'powershell',
    '.java': 'java',
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
    '.cs': 'csharp',
    '.rs': 'rust',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.ini': 'ini', '.toml': 'ini', '.cfg': 'ini',
    '.r': 'r',
    '.lua': 'lua',
    '.dockerfile': 'dockerfile',
};

export class EditorPanel {
    constructor(container, titleEl, closeBtn) {
        this.container = container;
        this.titleEl = titleEl;
        this.closeBtn = closeBtn;
        this.panel = container.closest('#preview-panel') || container.parentElement;
        this.currentPath = null;
        this.monacoEditor = null;
        this.monacoReady = false;
        this._dirty = false;
        this._monacoPromise = null;
        this._pdfjsLib = null;

        closeBtn.onclick = () => this.hide();

        // Init Monaco lazily
        this._initMonaco();
    }

    _initMonaco() {
        if (typeof require !== 'undefined' && typeof require.config === 'function') {
            require.config({
                paths: { vs: 'lib/monaco/vs' }
            });
            this._monacoPromise = new Promise((resolve) => {
                require(['vs/editor/editor.main'], () => {
                    this.monacoReady = true;
                    resolve();
                });
            });
        }
    }

    async show(filePath) {
        if (!filePath) return;
        this.currentPath = filePath;
        this.panel.style.display = 'flex';
        this._dirty = false;

        const name = filePath.split(/[/\\]/).pop();
        const ext = (name.includes('.') ? '.' + name.split('.').pop() : '').toLowerCase();
        this.titleEl.textContent = name;

        if (IMAGE_EXTS.has(ext)) {
            this._disposeMonaco();
            this.renderImage(filePath);
        } else if (PDF_EXTS.has(ext)) {
            this._disposeMonaco();
            await this.renderPdfCanvas(filePath);
        } else if (DOCX_EXTS.has(ext)) {
            this._disposeMonaco();
            await this.renderDocx(filePath);
        } else if (XLSX_EXTS.has(ext)) {
            this._disposeMonaco();
            await this.renderXlsx(filePath);
        } else if (BINARY_EXTS.has(ext)) {
            this._disposeMonaco();
            this.renderDefault(filePath, ext);
        } else {
            await this._showMonacoEditor(filePath, ext);
        }
    }

    hide() {
        this.panel.style.display = 'none';
        this._disposeMonaco();
        this.container.innerHTML = '';
        this.currentPath = null;
        this._dirty = false;
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

    async save() {
        if (!this.monacoEditor || !this.currentPath || !this._dirty) return;

        const content = this.monacoEditor.getValue();
        try {
            const result = await window.api.writeFileContent(this.currentPath, content);
            if (result.error) {
                this._showToast(`Fehler beim Speichern: ${result.error}`, 'error');
                return;
            }
            this._dirty = false;
            this._updateTitle();
            this._showToast('Gespeichert', 'success');
        } catch (err) {
            this._showToast(`Fehler: ${err.message}`, 'error');
        }
    }

    // ===== Monaco Editor =====

    async _showMonacoEditor(filePath, ext) {
        this.container.innerHTML = '<div class="loading-spinner"></div>';

        if (this._monacoPromise) {
            await this._monacoPromise;
        }

        if (!this.monacoReady) {
            this.renderText(filePath);
            return;
        }

        const result = await window.api.readFileContent(filePath);
        if (result.error) {
            this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(result.error)}</div>`;
            return;
        }

        this.container.innerHTML = '';
        const editorDiv = document.createElement('div');
        editorDiv.className = 'monaco-editor-container';
        this.container.appendChild(editorDiv);

        const language = LANG_MAP[ext] || 'plaintext';
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        this._disposeMonaco();

        this.monacoEditor = monaco.editor.create(editorDiv, {
            value: result.content,
            language,
            theme: isDark ? 'vs-dark' : 'vs',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            tabSize: 4,
            readOnly: false,
        });

        this.monacoEditor.onDidChangeModelContent(() => {
            if (!this._dirty) {
                this._dirty = true;
                this._updateTitle();
            }
        });

        this.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            this.save();
        });
    }

    _disposeMonaco() {
        if (this.monacoEditor) {
            this.monacoEditor.dispose();
            this.monacoEditor = null;
        }
    }

    _updateTitle() {
        if (!this.currentPath) return;
        const name = this.currentPath.split(/[/\\]/).pop();
        this.titleEl.textContent = this._dirty ? `* ${name}` : name;
    }

    setTheme(theme) {
        if (this.monacoReady && typeof monaco !== 'undefined') {
            monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
        }
    }

    // ===== PDF Viewer (pdf.js) =====

    async _loadPdfjs() {
        if (this._pdfjsLib) return this._pdfjsLib;
        try {
            this._pdfjsLib = await import('../lib/pdfjs/pdf.min.mjs');

            // Electron file:// protocol does NOT support module Workers (.mjs).
            // Chromium blocks: new Worker(fileUrl, { type: 'module' }) from file:// origin.
            // Fix: Fetch the worker script, strip ESM export, create blob URL (classic Worker).
            const workerUrl = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url);
            const resp = await fetch(workerUrl);
            let workerCode = await resp.text();
            // Remove trailing ESM export (invalid syntax in classic Worker context)
            // The worker already sets globalThis.pdfjsWorker for classic mode
            workerCode = workerCode.replace(/;\s*export\s*\{[^}]*\}\s*$/, ';');

            // Polyfill: Uint8Array.toHex/fromHex (Chrome 132+, nicht in Electron 33/Chrome 130)
            // MUSS im Worker-Kontext verfügbar sein, da pdf.js v5.4 diese Methoden intern nutzt
            const polyfill = `
if(!Uint8Array.prototype.toHex){Uint8Array.prototype.toHex=function(){const h=[];for(let i=0;i<this.length;i++)h.push(this[i].toString(16).padStart(2,'0'));return h.join('')};}
if(!Uint8Array.fromHex){Uint8Array.fromHex=function(s){const b=new Uint8Array(s.length/2);for(let i=0;i<s.length;i+=2)b[i/2]=parseInt(s.substring(i,i+2),16);return b};}
`;
            workerCode = polyfill + workerCode;

            const blob = new Blob([workerCode], { type: 'text/javascript' });
            this._pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);

            return this._pdfjsLib;
        } catch (err) {
            console.warn('pdf.js laden fehlgeschlagen:', err);
            return null;
        }
    }

    async renderPdfCanvas(filePath) {
        this.container.innerHTML = '<div class="loading-spinner"></div>';

        const pdfjsLib = await this._loadPdfjs();
        if (!pdfjsLib) {
            // Fallback: extern öffnen + Hinweis
            this.container.innerHTML = `
                <div class="preview-error">
                    <p>PDF-Vorschau nicht verfügbar (pdf.js konnte nicht geladen werden).</p>
                    <button class="pdf-btn" id="pdf-open-fallback">PDF extern öffnen</button>
                </div>`;
            const fallbackBtn = this.container.querySelector('#pdf-open-fallback');
            if (fallbackBtn) fallbackBtn.onclick = () => window.api.openFile(filePath);
            return;
        }

        try {
            const result = await window.api.readFileBinary(filePath);
            if (result.error) {
                this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(result.error)}</div>`;
                return;
            }

            const data = new Uint8Array(result.data);
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            const totalPages = pdf.numPages;
            let currentPage = 1;

            this.container.innerHTML = '';

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'pdf-toolbar';
            toolbar.innerHTML = `
                <button class="pdf-btn pdf-prev" title="Vorherige Seite">\u25C0</button>
                <span class="pdf-page-info">Seite <span class="pdf-current">1</span> / ${totalPages}</span>
                <button class="pdf-btn pdf-next" title="Nächste Seite">\u25B6</button>
                <button class="pdf-btn pdf-zoom-out" title="Verkleinern">\u2212</button>
                <span class="pdf-zoom-info">100%</span>
                <button class="pdf-btn pdf-zoom-in" title="Vergrößern">+</button>
                <button class="pdf-btn pdf-open-ext" title="Extern öffnen">\u2197</button>
            `;
            this.container.appendChild(toolbar);

            // Canvas wrapper
            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'pdf-canvas-wrap';
            this.container.appendChild(canvasWrap);

            const canvas = document.createElement('canvas');
            canvasWrap.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            let scale = 1.0;

            const renderPage = async (num) => {
                const page = await pdf.getPage(num);
                const viewport = page.getViewport({ scale });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                toolbar.querySelector('.pdf-current').textContent = num;
            };

            await renderPage(1);

            // Navigation
            toolbar.querySelector('.pdf-prev').onclick = () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderPage(currentPage);
                }
            };
            toolbar.querySelector('.pdf-next').onclick = () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderPage(currentPage);
                }
            };
            toolbar.querySelector('.pdf-zoom-in').onclick = () => {
                scale = Math.min(scale + 0.25, 3.0);
                toolbar.querySelector('.pdf-zoom-info').textContent = Math.round(scale * 100) + '%';
                renderPage(currentPage);
            };
            toolbar.querySelector('.pdf-zoom-out').onclick = () => {
                scale = Math.max(scale - 0.25, 0.25);
                toolbar.querySelector('.pdf-zoom-info').textContent = Math.round(scale * 100) + '%';
                renderPage(currentPage);
            };
            toolbar.querySelector('.pdf-open-ext').onclick = () => {
                window.api.openFile(filePath);
            };
        } catch (err) {
            this.container.innerHTML = `<div class="preview-error">PDF-Fehler: ${this.escapeHtml(err.message)}</div>`;
        }
    }

    // ===== DOCX Viewer (mammoth.js) =====

    async renderDocx(filePath) {
        this.container.innerHTML = '<div class="loading-spinner"></div>';

        if (typeof mammoth === 'undefined') {
            this.container.innerHTML = '<div class="preview-error">mammoth.js nicht geladen</div>';
            return;
        }

        try {
            const result = await window.api.readFileBinary(filePath);
            if (result.error) {
                this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(result.error)}</div>`;
                return;
            }

            const arrayBuffer = result.data;
            const converted = await mammoth.convertToHtml({ arrayBuffer });

            this.container.innerHTML = '';

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'docx-toolbar';
            toolbar.innerHTML = `
                <span class="docx-info">DOCX-Vorschau (nur Lesen)</span>
                <button class="pdf-btn pdf-open-ext" title="In Word öffnen">\u2197</button>
            `;
            toolbar.querySelector('.pdf-open-ext').onclick = () => window.api.openFile(filePath);
            this.container.appendChild(toolbar);

            // Content
            const content = document.createElement('div');
            content.className = 'docx-content';
            content.innerHTML = converted.value;
            this.container.appendChild(content);

            if (converted.messages.length > 0) {
                const warnings = converted.messages.filter(m => m.type === 'warning');
                if (warnings.length > 0) {
                    console.warn('DOCX-Warnungen:', warnings);
                }
            }
        } catch (err) {
            this.container.innerHTML = `<div class="preview-error">DOCX-Fehler: ${this.escapeHtml(err.message)}</div>`;
        }
    }

    // ===== XLSX Viewer (SheetJS) =====

    async renderXlsx(filePath) {
        this.container.innerHTML = '<div class="loading-spinner"></div>';

        if (typeof XLSX === 'undefined') {
            this.container.innerHTML = '<div class="preview-error">SheetJS nicht geladen</div>';
            return;
        }

        try {
            const result = await window.api.readFileBinary(filePath);
            if (result.error) {
                this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(result.error)}</div>`;
                return;
            }

            const data = new Uint8Array(result.data);
            const workbook = XLSX.read(data, { type: 'array' });

            this.container.innerHTML = '';

            // Toolbar with sheet tabs
            const toolbar = document.createElement('div');
            toolbar.className = 'xlsx-toolbar';

            const tabBar = document.createElement('div');
            tabBar.className = 'xlsx-tabs';
            workbook.SheetNames.forEach((name, i) => {
                const tab = document.createElement('button');
                tab.className = 'xlsx-tab' + (i === 0 ? ' active' : '');
                tab.textContent = name;
                tab.onclick = () => {
                    tabBar.querySelectorAll('.xlsx-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    renderSheet(name);
                };
                tabBar.appendChild(tab);
            });
            toolbar.appendChild(tabBar);

            const openBtn = document.createElement('button');
            openBtn.className = 'pdf-btn pdf-open-ext';
            openBtn.title = 'In Excel öffnen';
            openBtn.textContent = '\u2197';
            openBtn.onclick = () => window.api.openFile(filePath);
            toolbar.appendChild(openBtn);

            this.container.appendChild(toolbar);

            // Table container
            const tableWrap = document.createElement('div');
            tableWrap.className = 'xlsx-table-wrap';
            this.container.appendChild(tableWrap);

            const MAX_ROWS = 1000;

            const renderSheet = (sheetName) => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                const truncated = jsonData.length > MAX_ROWS;
                const rows = truncated ? jsonData.slice(0, MAX_ROWS) : jsonData;

                let html = '<table class="xlsx-table">';
                rows.forEach((row, ri) => {
                    html += '<tr>';
                    const tag = ri === 0 ? 'th' : 'td';
                    const maxCols = Math.min(row.length, 50);
                    for (let ci = 0; ci < maxCols; ci++) {
                        const val = row[ci] != null ? this.escapeHtml(String(row[ci])) : '';
                        html += `<${tag}>${val}</${tag}>`;
                    }
                    html += '</tr>';
                });
                html += '</table>';

                if (truncated) {
                    html += `<div class="xlsx-truncated">${jsonData.length} Zeilen — nur erste ${MAX_ROWS} angezeigt</div>`;
                }

                tableWrap.innerHTML = html;
            };

            renderSheet(workbook.SheetNames[0]);
        } catch (err) {
            this.container.innerHTML = `<div class="preview-error">Excel-Fehler: ${this.escapeHtml(err.message)}</div>`;
        }
    }

    // ===== Fallback Renderers =====

    renderImage(filePath) {
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
                this.container.innerHTML = `<div class="preview-error">${this.escapeHtml(result.error)}</div>`;
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
            this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(e.message)}</div>`;
        }
    }

    async renderDefault(filePath, ext) {
        try {
            const props = await window.api.getProperties(filePath);
            if (props.error) {
                this.container.innerHTML = `<div class="preview-error">${this.escapeHtml(props.error)}</div>`;
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
                    <div class="prop-row"><span class="prop-label">Gr\u00F6\u00DFe</span><span class="prop-value">${size}</span></div>
                    <div class="prop-row"><span class="prop-label">Ge\u00E4ndert</span><span class="prop-value">${this.fmtDate(props.modified)}</span></div>
                    <div class="prop-row"><span class="prop-label">Erstellt</span><span class="prop-value">${this.fmtDate(props.created)}</span></div>
                </div>
            `;
        } catch (e) {
            this.container.innerHTML = `<div class="preview-error">Fehler: ${this.escapeHtml(e.message)}</div>`;
        }
    }

    fmtDate(iso) {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('de-DE');
    }

    escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _showToast(msg, type) {
        const event = new CustomEvent('show-toast', { detail: { message: msg, type } });
        document.dispatchEvent(event);
    }
}

// Keep backward-compatible export name
export { EditorPanel as PreviewPanel };

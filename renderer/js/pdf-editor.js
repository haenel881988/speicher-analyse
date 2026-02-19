/**
 * PDF-Editor View — Annotationen, OCR, Seiten-Management.
 * Rendering via pdf.js (Frontend), Manipulation via PDFium (Rust-Backend).
 */
import { escapeHtml } from './utils.js';

// === Lazy pdf.js Loader (shared with preview.js pattern) ===
let _pdfjsLib = null;
async function loadPdfjs() {
    if (_pdfjsLib) return _pdfjsLib;
    _pdfjsLib = await import('../lib/pdfjs/pdf.min.mjs');
    const workerUrl = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url);
    const resp = await fetch(workerUrl);
    let workerCode = await resp.text();
    workerCode = workerCode.replace(/;\s*export\s*\{[^}]*\}\s*$/, ';');
    const polyfill = `
if(!Uint8Array.prototype.toHex){Uint8Array.prototype.toHex=function(){const h=[];for(let i=0;i<this.length;i++)h.push(this[i].toString(16).padStart(2,'0'));return h.join('')};}
if(!Uint8Array.fromHex){Uint8Array.fromHex=function(s){const b=new Uint8Array(s.length/2);for(let i=0;i<s.length;i+=2)b[i/2]=parseInt(s.substring(i,i+2),16);return b};}
`;
    workerCode = polyfill + workerCode;
    const blob = new Blob([workerCode], { type: 'text/javascript' });
    _pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    return _pdfjsLib;
}

const OCR_LANGUAGES = [
    { id: 'de', label: 'Deutsch' },
    { id: 'en', label: 'Englisch' },
    { id: 'fr', label: 'Französisch' },
    { id: 'es', label: 'Spanisch' },
    { id: 'it', label: 'Italienisch' },
    { id: 'pt', label: 'Portugiesisch' },
    { id: 'nl', label: 'Niederländisch' },
    { id: 'pl', label: 'Polnisch' },
    { id: 'ru', label: 'Russisch' },
];

export class PdfEditorView {
    constructor(container) {
        this.container = container;
        this.filePath = null;
        this.pdfDoc = null;
        this.totalPages = 0;
        this.scale = 1.0;
        this.currentTool = 'select'; // select | highlight | comment | freehand
        this.annotations = [];       // Frontend annotation state
        this.unsavedChanges = false;
        this._pageCanvases = [];     // { canvas, annoSvg, pageNum }
        this._drawing = false;
        this._drawStart = null;
        this._currentPath = [];
        this._resizeObserver = null;
        this._intersectionObserver = null;
        this._loaded = false;
    }

    // === Lifecycle ===

    async open(filePath) {
        this.filePath = filePath;
        this.annotations = [];
        this.unsavedChanges = false;
        this._pageCanvases = [];
        this.scale = 1.0;
        this.currentTool = 'select';

        this._buildUI();

        try {
            // PDF laden
            const pdfjsLib = await loadPdfjs();
            const result = await window.api.readFileBinary(filePath);
            if (result.error) throw new Error(result.error);

            const binaryStr = atob(result.data);
            const data = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) data[i] = binaryStr.charCodeAt(i);

            this.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
            this.totalPages = this.pdfDoc.numPages;

            // PDF-Info laden
            const info = await window.api.pdfGetInfo(filePath);
            this._updateInfo(info);

            // Seiten rendern
            await this._renderAllPages();
            this._loaded = true;

        } catch (err) {
            this.container.querySelector('.pdf-editor-pages').innerHTML =
                `<div class="preview-error">Fehler beim Laden: ${escapeHtml(err.message)}</div>`;
        }
    }

    close() {
        if (this.unsavedChanges) {
            if (!confirm('Ungespeicherte Änderungen verwerfen?')) return false;
        }
        this._cleanup();
        this.container.innerHTML = '';
        this._loaded = false;
        return true;
    }

    destroy() {
        this._cleanup();
        this.container.innerHTML = '';
    }

    _cleanup() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._intersectionObserver) {
            this._intersectionObserver.disconnect();
            this._intersectionObserver = null;
        }
        this.pdfDoc = null;
        this._pageCanvases = [];
    }

    // === UI Building ===

    _buildUI() {
        const fileName = this.filePath ? this.filePath.split(/[\\/]/).pop() : 'PDF';

        this.container.innerHTML = `
            <div class="pdf-editor">
                <div class="pdf-editor-toolbar">
                    <button class="pdf-editor-btn pdf-editor-back" title="Zurück zum Explorer">\u2190 Zurück</button>
                    <span class="pdf-editor-filename">${escapeHtml(fileName)}</span>
                    <span class="pdf-editor-info"></span>
                    <div class="pdf-editor-toolbar-right">
                        <button class="pdf-editor-btn pdf-editor-save" title="Speichern (Ctrl+S)">Speichern</button>
                        <button class="pdf-editor-btn pdf-editor-ocr" title="OCR-Texterkennung">OCR</button>
                        <button class="pdf-editor-btn pdf-editor-merge" title="PDF zusammenfügen">Zusammenfügen</button>
                    </div>
                </div>
                <div class="pdf-editor-body">
                    <div class="pdf-editor-thumbnails"></div>
                    <div class="pdf-editor-pages">
                        <div class="loading-spinner"></div>
                    </div>
                </div>
                <div class="pdf-editor-anno-toolbar">
                    <button class="pdf-editor-tool" data-tool="select" title="Auswählen">Auswählen</button>
                    <button class="pdf-editor-tool" data-tool="highlight" title="Text markieren">Markieren</button>
                    <button class="pdf-editor-tool" data-tool="comment" title="Kommentar hinzufügen">Kommentar</button>
                    <button class="pdf-editor-tool" data-tool="freehand" title="Freihand zeichnen">Freihand</button>
                    <span class="pdf-editor-separator"></span>
                    <button class="pdf-editor-btn pdf-editor-zoom-out" title="Verkleinern">\u2212</button>
                    <span class="pdf-editor-zoom-info">100%</span>
                    <button class="pdf-editor-btn pdf-editor-zoom-in" title="Vergrößern">+</button>
                </div>
            </div>
        `;

        // Wire events
        const el = this.container.querySelector('.pdf-editor');

        el.querySelector('.pdf-editor-back').onclick = () => {
            if (this.close() !== false) {
                document.dispatchEvent(new CustomEvent('pdf-editor-close'));
            }
        };

        el.querySelector('.pdf-editor-save').onclick = () => this.save();

        el.querySelector('.pdf-editor-ocr').onclick = () => this._showOcrDialog();

        el.querySelector('.pdf-editor-merge').onclick = () => this._showMergeDialog();

        el.querySelector('.pdf-editor-zoom-in').onclick = () => {
            this.scale = Math.min(this.scale + 0.25, 3.0);
            el.querySelector('.pdf-editor-zoom-info').textContent = Math.round(this.scale * 100) + '%';
            this._rerenderAllPages();
        };

        el.querySelector('.pdf-editor-zoom-out').onclick = () => {
            this.scale = Math.max(this.scale - 0.25, 0.25);
            el.querySelector('.pdf-editor-zoom-info').textContent = Math.round(this.scale * 100) + '%';
            this._rerenderAllPages();
        };

        // Tool selection
        el.querySelectorAll('.pdf-editor-tool').forEach(btn => {
            btn.onclick = () => {
                this.currentTool = btn.dataset.tool;
                el.querySelectorAll('.pdf-editor-tool').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        // Default tool active
        el.querySelector('[data-tool="select"]').classList.add('active');

        // Keyboard shortcut: Ctrl+S
        this._keyHandler = (e) => {
            if (e.ctrlKey && e.key === 's' && this._loaded) {
                e.preventDefault();
                this.save();
            }
        };
        el.addEventListener('keydown', this._keyHandler);
    }

    _updateInfo(info) {
        const infoEl = this.container.querySelector('.pdf-editor-info');
        if (infoEl) {
            const parts = [`${info.pageCount} Seiten`];
            if (!info.isTextSearchable) parts.push('OCR empfohlen');
            infoEl.textContent = parts.join(' \u2022 ');
        }
    }

    // === Page Rendering ===

    async _renderAllPages() {
        const pagesContainer = this.container.querySelector('.pdf-editor-pages');
        const thumbContainer = this.container.querySelector('.pdf-editor-thumbnails');
        pagesContainer.innerHTML = '';
        thumbContainer.innerHTML = '';
        this._pageCanvases = [];

        // Intersection Observer für Lazy Rendering
        this._intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.page);
                    if (!entry.target.dataset.rendered) {
                        this._renderPage(pageNum);
                        entry.target.dataset.rendered = 'true';
                    }
                }
            }
        }, { root: pagesContainer, rootMargin: '200px' });

        for (let i = 1; i <= this.totalPages; i++) {
            // Page wrapper
            const pageWrap = document.createElement('div');
            pageWrap.className = 'pdf-editor-page';
            pageWrap.dataset.page = i;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            pageWrap.appendChild(canvas);

            // SVG Overlay für Annotationen
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('pdf-anno-overlay');
            pageWrap.appendChild(svg);

            // Seitennummer
            const label = document.createElement('div');
            label.className = 'pdf-page-label';
            label.textContent = `Seite ${i}`;
            pageWrap.appendChild(label);

            // Kontextmenü für Seiten-Operationen
            pageWrap.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showPageContextMenu(e, i);
            });

            // Annotation Events auf SVG
            this._wireAnnotationEvents(svg, canvas, i);

            pagesContainer.appendChild(pageWrap);
            this._pageCanvases.push({ canvas, svg, pageWrap, pageNum: i });

            this._intersectionObserver.observe(pageWrap);

            // Thumbnail
            const thumb = document.createElement('div');
            thumb.className = 'pdf-thumb';
            thumb.dataset.page = i;
            thumb.innerHTML = `<canvas class="pdf-thumb-canvas"></canvas><span>${i}</span>`;
            thumb.onclick = () => pageWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            thumbContainer.appendChild(thumb);
        }

        // Erste sichtbare Seiten sofort rendern
        for (let i = 0; i < Math.min(3, this.totalPages); i++) {
            await this._renderPage(i + 1);
            this._pageCanvases[i].pageWrap.dataset.rendered = 'true';
        }
    }

    async _renderPage(pageNum) {
        const entry = this._pageCanvases[pageNum - 1];
        if (!entry || !this.pdfDoc) return;

        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });

        entry.canvas.width = viewport.width;
        entry.canvas.height = viewport.height;
        entry.svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
        entry.svg.style.width = viewport.width + 'px';
        entry.svg.style.height = viewport.height + 'px';

        const ctx = entry.canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Thumbnail rendern
        const thumbCanvas = this.container.querySelector(
            `.pdf-thumb[data-page="${pageNum}"] .pdf-thumb-canvas`
        );
        if (thumbCanvas) {
            const thumbScale = 100 / viewport.width * this.scale;
            const thumbViewport = page.getViewport({ scale: thumbScale });
            thumbCanvas.width = thumbViewport.width;
            thumbCanvas.height = thumbViewport.height;
            const thumbCtx = thumbCanvas.getContext('2d');
            await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
        }

        // Bestehende Annotationen dieser Seite rendern
        this._renderAnnotationsForPage(pageNum);
    }

    async _rerenderAllPages() {
        for (const entry of this._pageCanvases) {
            entry.pageWrap.dataset.rendered = '';
        }
        // Re-trigger Intersection Observer
        if (this._intersectionObserver) {
            for (const entry of this._pageCanvases) {
                this._intersectionObserver.unobserve(entry.pageWrap);
                this._intersectionObserver.observe(entry.pageWrap);
            }
        }
    }

    // === Annotation Events ===

    _wireAnnotationEvents(svg, canvas, pageNum) {
        svg.addEventListener('mousedown', (e) => {
            if (this.currentTool === 'select') return;
            e.preventDefault();
            this._drawing = true;
            const rect = svg.getBoundingClientRect();
            this._drawStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            this._currentPath = [{ ...this._drawStart }];
        });

        svg.addEventListener('mousemove', (e) => {
            if (!this._drawing) return;
            const rect = svg.getBoundingClientRect();
            const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            this._currentPath.push(point);

            if (this.currentTool === 'freehand') {
                this._drawTempFreehand(svg);
            } else if (this.currentTool === 'highlight') {
                this._drawTempHighlight(svg);
            }
        });

        svg.addEventListener('mouseup', (e) => {
            if (!this._drawing) return;
            this._drawing = false;
            const rect = svg.getBoundingClientRect();
            const endPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

            if (this.currentTool === 'highlight') {
                const r = this._normalizeRect(this._drawStart, endPoint);
                if (r.x2 - r.x1 > 5 && r.y2 - r.y1 > 3) {
                    this.annotations.push({
                        type: 'highlight', page: pageNum - 1,
                        rect: { x1: r.x1 / this.scale, y1: r.y1 / this.scale, x2: r.x2 / this.scale, y2: r.y2 / this.scale },
                        color: '#FFFF00',
                    });
                    this.unsavedChanges = true;
                }
            } else if (this.currentTool === 'comment') {
                const text = prompt('Kommentar eingeben:');
                if (text) {
                    this.annotations.push({
                        type: 'text', page: pageNum - 1,
                        rect: { x1: endPoint.x / this.scale, y1: endPoint.y / this.scale, x2: (endPoint.x + 24) / this.scale, y2: (endPoint.y + 24) / this.scale },
                        text, color: '#FFD700',
                    });
                    this.unsavedChanges = true;
                }
            } else if (this.currentTool === 'freehand') {
                if (this._currentPath.length > 2) {
                    const scaledPath = this._currentPath.map(p => ({ x: p.x / this.scale, y: p.y / this.scale }));
                    const bounds = this._pathBounds(scaledPath);
                    this.annotations.push({
                        type: 'ink', page: pageNum - 1,
                        rect: bounds,
                        paths: [scaledPath],
                        color: '#FF0000', width: 2,
                    });
                    this.unsavedChanges = true;
                }
            }

            // Temp-Zeichnungen entfernen und finale rendern
            svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
            this._renderAnnotationsForPage(pageNum);
            this._currentPath = [];
        });
    }

    _drawTempFreehand(svg) {
        svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
        if (this._currentPath.length < 2) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        path.classList.add('temp-draw');
        path.setAttribute('points', this._currentPath.map(p => `${p.x},${p.y}`).join(' '));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#FF0000');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
    }

    _drawTempHighlight(svg) {
        svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
        if (!this._drawStart || this._currentPath.length < 2) return;
        const end = this._currentPath[this._currentPath.length - 1];
        const r = this._normalizeRect(this._drawStart, end);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('temp-draw');
        rect.setAttribute('x', r.x1);
        rect.setAttribute('y', r.y1);
        rect.setAttribute('width', r.x2 - r.x1);
        rect.setAttribute('height', r.y2 - r.y1);
        rect.setAttribute('fill', 'rgba(255, 255, 0, 0.3)');
        rect.setAttribute('stroke', 'none');
        svg.appendChild(rect);
    }

    // === Annotation Rendering ===

    _renderAnnotationsForPage(pageNum) {
        const entry = this._pageCanvases[pageNum - 1];
        if (!entry) return;
        const svg = entry.svg;

        // Lösche alte Annotationen (aber nicht temp-draw)
        svg.querySelectorAll('.anno-render').forEach(el => el.remove());

        const pageAnnos = this.annotations.filter(a => a.page === pageNum - 1);

        for (const anno of pageAnnos) {
            if (anno.type === 'highlight' && anno.rect) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.classList.add('anno-render');
                rect.setAttribute('x', anno.rect.x1 * this.scale);
                rect.setAttribute('y', anno.rect.y1 * this.scale);
                rect.setAttribute('width', (anno.rect.x2 - anno.rect.x1) * this.scale);
                rect.setAttribute('height', (anno.rect.y2 - anno.rect.y1) * this.scale);
                rect.setAttribute('fill', (anno.color || '#FFFF00') + '40');
                rect.setAttribute('stroke', 'none');
                svg.appendChild(rect);
            }
            else if (anno.type === 'text' && anno.rect) {
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.classList.add('anno-render');
                // Kommentar-Icon
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', anno.rect.x1 * this.scale + 12);
                circle.setAttribute('cy', anno.rect.y1 * this.scale + 12);
                circle.setAttribute('r', '10');
                circle.setAttribute('fill', anno.color || '#FFD700');
                circle.setAttribute('stroke', '#333');
                circle.setAttribute('stroke-width', '1');
                g.appendChild(circle);
                // "i" Symbol
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', anno.rect.x1 * this.scale + 12);
                text.setAttribute('y', anno.rect.y1 * this.scale + 17);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', '14');
                text.setAttribute('font-weight', 'bold');
                text.setAttribute('fill', '#333');
                text.textContent = 'i';
                g.appendChild(text);
                // Tooltip bei Hover
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = anno.text || '';
                g.appendChild(title);
                svg.appendChild(g);
            }
            else if (anno.type === 'ink' && anno.paths) {
                for (const path of anno.paths) {
                    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    polyline.classList.add('anno-render');
                    polyline.setAttribute('points',
                        path.map(p => `${p.x * this.scale},${p.y * this.scale}`).join(' '));
                    polyline.setAttribute('fill', 'none');
                    polyline.setAttribute('stroke', anno.color || '#FF0000');
                    polyline.setAttribute('stroke-width', String(anno.width || 2));
                    polyline.setAttribute('stroke-linecap', 'round');
                    polyline.setAttribute('stroke-linejoin', 'round');
                    svg.appendChild(polyline);
                }
            }
        }
    }

    // === Save ===

    async save() {
        if (!this.filePath || this.annotations.length === 0) return;

        try {
            await window.api.pdfSaveAnnotations(
                this.filePath,
                this.filePath,  // Überschreiben (gleiches File)
                this.annotations,
            );
            this.unsavedChanges = false;

            // Statusmeldung
            const info = this.container.querySelector('.pdf-editor-info');
            if (info) {
                const prev = info.textContent;
                info.textContent = 'Gespeichert!';
                setTimeout(() => { info.textContent = prev; }, 2000);
            }
        } catch (err) {
            alert('Speichern fehlgeschlagen: ' + err.message);
        }
    }

    // === OCR ===

    _showOcrDialog() {
        const langOptions = OCR_LANGUAGES.map(l =>
            `<option value="${l.id}" ${l.id === 'de' ? 'selected' : ''}>${l.label}</option>`
        ).join('');

        const dialog = document.createElement('div');
        dialog.className = 'pdf-editor-dialog-overlay';
        dialog.innerHTML = `
            <div class="pdf-editor-dialog">
                <h3>OCR-Texterkennung</h3>
                <p>Erkennt Text in gescannten PDF-Seiten und macht die PDF durchsuchbar.</p>
                <label>Sprache: <select class="ocr-lang">${langOptions}</select></label>
                <div class="pdf-editor-dialog-btns">
                    <button class="pdf-editor-btn ocr-current">Aktuelle Seite</button>
                    <button class="pdf-editor-btn ocr-all">Alle Seiten</button>
                    <button class="pdf-editor-btn ocr-cancel">Abbrechen</button>
                </div>
                <div class="ocr-progress" style="display:none">
                    <div class="ocr-progress-bar"><div class="ocr-progress-fill"></div></div>
                    <span class="ocr-progress-text"></span>
                </div>
            </div>
        `;

        this.container.appendChild(dialog);

        const lang = () => dialog.querySelector('.ocr-lang').value;

        dialog.querySelector('.ocr-cancel').onclick = () => dialog.remove();
        dialog.querySelector('.ocr-current').onclick = async () => {
            await this._runOcr(dialog, lang(), false);
        };
        dialog.querySelector('.ocr-all').onclick = async () => {
            await this._runOcr(dialog, lang(), true);
        };
    }

    async _runOcr(dialog, language, allPages) {
        const progressDiv = dialog.querySelector('.ocr-progress');
        const progressFill = dialog.querySelector('.ocr-progress-fill');
        const progressText = dialog.querySelector('.ocr-progress-text');
        progressDiv.style.display = '';

        // Buttons deaktivieren
        dialog.querySelectorAll('button').forEach(b => b.disabled = true);

        try {
            const ocrResults = [];
            const pages = allPages
                ? Array.from({ length: this.totalPages }, (_, i) => i + 1)
                : [this._getVisiblePage()];

            for (let i = 0; i < pages.length; i++) {
                const pageNum = pages[i];
                progressText.textContent = `Seite ${pageNum} von ${this.totalPages}...`;
                progressFill.style.width = ((i + 1) / pages.length * 100) + '%';

                // Seite als hochauflösendes Bild rendern (300 DPI)
                const page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 3.0 }); // ~300 DPI
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;

                // Canvas → Base64
                const imageBase64 = canvas.toDataURL('image/png');

                // Backend OCR
                const ocrResult = await window.api.pdfOcrPage(imageBase64, language);
                ocrResults.push(ocrResult);
            }

            // Textlayer in PDF einfügen
            progressText.textContent = 'Textlayer wird eingefügt...';
            await window.api.pdfAddTextLayer(this.filePath, this.filePath, ocrResults);

            progressText.textContent = 'Fertig! PDF ist jetzt durchsuchbar.';
            progressFill.style.width = '100%';

            // PDF neu laden nach 1.5s
            setTimeout(async () => {
                dialog.remove();
                await this.open(this.filePath);
            }, 1500);

        } catch (err) {
            progressText.textContent = 'Fehler: ' + err.message;
            dialog.querySelectorAll('button').forEach(b => b.disabled = false);
        }
    }

    _getVisiblePage() {
        const pagesContainer = this.container.querySelector('.pdf-editor-pages');
        if (!pagesContainer) return 1;
        const scrollTop = pagesContainer.scrollTop;
        for (const entry of this._pageCanvases) {
            const top = entry.pageWrap.offsetTop - pagesContainer.offsetTop;
            const bottom = top + entry.pageWrap.offsetHeight;
            if (scrollTop >= top - 50 && scrollTop < bottom) {
                return entry.pageNum;
            }
        }
        return 1;
    }

    // === Merge Dialog ===

    _showMergeDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'pdf-editor-dialog-overlay';
        dialog.innerHTML = `
            <div class="pdf-editor-dialog">
                <h3>PDFs zusammenfügen</h3>
                <p>Wähle weitere PDFs die an das aktuelle Dokument angehängt werden sollen.</p>
                <div class="merge-file-list"></div>
                <div class="pdf-editor-dialog-btns">
                    <button class="pdf-editor-btn merge-add">PDF hinzufügen...</button>
                    <button class="pdf-editor-btn merge-exec" disabled>Zusammenfügen</button>
                    <button class="pdf-editor-btn merge-cancel">Abbrechen</button>
                </div>
            </div>
        `;

        this.container.appendChild(dialog);
        const fileList = dialog.querySelector('.merge-file-list');
        const mergeFiles = [this.filePath];

        dialog.querySelector('.merge-cancel').onclick = () => dialog.remove();

        dialog.querySelector('.merge-add').onclick = async () => {
            try {
                const result = await window.api.showSaveDialog({
                    title: 'PDF auswählen',
                    filters: [{ name: 'PDF', extensions: ['pdf'] }],
                    directory: false,
                });
                if (result) {
                    mergeFiles.push(result);
                    const item = document.createElement('div');
                    item.className = 'merge-file-item';
                    item.textContent = result.split(/[\\/]/).pop();
                    fileList.appendChild(item);
                    dialog.querySelector('.merge-exec').disabled = mergeFiles.length < 2;
                }
            } catch { /* Abgebrochen */ }
        };

        dialog.querySelector('.merge-exec').onclick = async () => {
            try {
                dialog.querySelectorAll('button').forEach(b => b.disabled = true);
                const outputPath = this.filePath.replace(/\.pdf$/i, '_zusammengefügt.pdf');
                await window.api.pdfMerge(mergeFiles, outputPath);
                dialog.remove();
                await this.open(outputPath);
            } catch (err) {
                alert('Zusammenfügen fehlgeschlagen: ' + err.message);
                dialog.querySelectorAll('button').forEach(b => b.disabled = false);
            }
        };
    }

    // === Page Context Menu ===

    _showPageContextMenu(e, pageNum) {
        // Entferne bestehende Kontextmenüs
        document.querySelectorAll('.pdf-page-context-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'pdf-page-context-menu';
        menu.innerHTML = `
            <button data-action="rotate-cw">Seite drehen (90\u00B0)</button>
            <button data-action="rotate-ccw">Seite drehen (-90\u00B0)</button>
            <button data-action="delete">Seite löschen</button>
        `;
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);

        const cleanup = () => menu.remove();
        document.addEventListener('click', cleanup, { once: true });

        menu.querySelector('[data-action="rotate-cw"]').onclick = async () => {
            cleanup();
            await this._rotatePage(pageNum, 90);
        };
        menu.querySelector('[data-action="rotate-ccw"]').onclick = async () => {
            cleanup();
            await this._rotatePage(pageNum, 270);
        };
        menu.querySelector('[data-action="delete"]').onclick = async () => {
            cleanup();
            await this._deletePage(pageNum);
        };
    }

    async _rotatePage(pageNum, degrees) {
        try {
            await window.api.pdfRotatePage(this.filePath, this.filePath, pageNum - 1, degrees);
            await this.open(this.filePath); // Neu laden
        } catch (err) {
            alert('Drehen fehlgeschlagen: ' + err.message);
        }
    }

    async _deletePage(pageNum) {
        if (this.totalPages <= 1) {
            alert('Die letzte Seite kann nicht gelöscht werden.');
            return;
        }
        if (!confirm(`Seite ${pageNum} wirklich löschen? Dies kann nicht rückgängig gemacht werden.`)) return;

        try {
            await window.api.pdfDeletePages(this.filePath, this.filePath, [pageNum - 1]);
            await this.open(this.filePath); // Neu laden
        } catch (err) {
            alert('Löschen fehlgeschlagen: ' + err.message);
        }
    }

    // === Helpers ===

    _normalizeRect(p1, p2) {
        return {
            x1: Math.min(p1.x, p2.x),
            y1: Math.min(p1.y, p2.y),
            x2: Math.max(p1.x, p2.x),
            y2: Math.max(p1.y, p2.y),
        };
    }

    _pathBounds(path) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const p of path) {
            if (p.x < x1) x1 = p.x;
            if (p.y < y1) y1 = p.y;
            if (p.x > x2) x2 = p.x;
            if (p.y > y2) y2 = p.y;
        }
        return { x1, y1, x2, y2 };
    }
}

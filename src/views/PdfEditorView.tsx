import { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';

const OCR_LANGUAGES = [
  { id: 'de', label: 'Deutsch' }, { id: 'en', label: 'Englisch' },
  { id: 'fr', label: 'Französisch' }, { id: 'es', label: 'Spanisch' },
  { id: 'it', label: 'Italienisch' }, { id: 'pt', label: 'Portugiesisch' },
  { id: 'nl', label: 'Niederländisch' }, { id: 'pl', label: 'Polnisch' },
  { id: 'ru', label: 'Russisch' },
];

interface Point { x: number; y: number; }
interface Rect { x1: number; y1: number; x2: number; y2: number; }
interface Annotation {
  type: 'highlight' | 'text' | 'ink';
  page: number;
  rect: Rect;
  color: string;
  text?: string;
  paths?: Point[][];
  width?: number;
}

interface PageEntry {
  canvas: HTMLCanvasElement;
  svg: SVGSVGElement;
  wrapper: HTMLDivElement;
  pageNum: number;
  rendered: boolean;
}

// Lazy pdf.js loader (shared pattern)
let _pdfjsLib: any = null;
async function loadPdfjs(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  // Polyfills for Uint8Array.toHex/fromHex (needed by pdf.js worker in older WebView2 versions)
  const polyfill = `
if(!Uint8Array.prototype.toHex){Uint8Array.prototype.toHex=function(){const h=[];for(let i=0;i<this.length;i++)h.push(this[i].toString(16).padStart(2,'0'));return h.join('')};}
if(!Uint8Array.fromHex){Uint8Array.fromHex=function(s){const b=new Uint8Array(s.length/2);for(let i=0;i<s.length;i+=2)b[i/2]=parseInt(s.substring(i,i+2),16);return b};}
`;
  // Fetch the worker source and inject polyfills via blob URL
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  const resp = await fetch(workerUrl);
  let workerCode = await resp.text();
  workerCode = workerCode.replace(/;\s*export\s*\{[^}]*\}\s*$/, ';');
  workerCode = polyfill + workerCode;
  const blob = new Blob([workerCode], { type: 'text/javascript' });
  _pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  return _pdfjsLib;
}

export default function PdfEditorView({ filePath = '', onClose }: { filePath?: string; onClose?: () => void } = {}) {
  const { showToast, setActiveTab } = useAppContext();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [currentTool, setCurrentTool] = useState<'select' | 'highlight' | 'comment' | 'freehand'>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [showOcr, setShowOcr] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ running: boolean; text: string; percent: number }>({ running: false, text: '', percent: 0 });
  const [mergeFiles, setMergeFiles] = useState<string[]>([]);

  const pdfDocRef = useRef<any>(null);
  const pageEntriesRef = useRef<PageEntry[]>([]);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const intersectionObRef = useRef<IntersectionObserver | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const scaleRef = useRef(1.0);
  const currentToolRef = useRef<string>('select');
  const drawingRef = useRef(false);
  const drawStartRef = useRef<Point | null>(null);
  const currentPathRef = useRef<Point[]>([]);

  // Keep refs in sync
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);

  const fileName = filePath.split(/[\\/]/).pop() || 'PDF';

  // Load PDF when filePath changes
  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await loadPdfjs();
        const result = await api.readFileBinary(filePath);
        if ((result as any).error) throw new Error((result as any).error);
        if (cancelled) return;

        const binaryStr = atob((result as any).data);
        const data = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) data[i] = binaryStr.charCodeAt(i);

        const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);
        setAnnotations([]);
        setUnsavedChanges(false);
        setScale(1.0);
        setCurrentTool('select');

        const info = await api.pdfGetInfo(filePath);
        const parts = [`${info.pageCount} Seiten`];
        if (!info.isTextSearchable) parts.push('OCR empfohlen');
        setInfoText(parts.join(' \u2022 '));
        setLoaded(true);
        setError('');
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  // Render pages after loading
  useEffect(() => {
    if (!loaded || totalPages === 0 || !pagesContainerRef.current) return;
    renderAllPages();
    return () => {
      intersectionObRef.current?.disconnect();
      pageEntriesRef.current = [];
    };
  }, [loaded, totalPages]);

  // Re-render when scale changes
  useEffect(() => {
    if (!loaded) return;
    for (const entry of pageEntriesRef.current) entry.rendered = false;
    // Re-trigger intersection observer
    if (intersectionObRef.current) {
      for (const entry of pageEntriesRef.current) {
        intersectionObRef.current.unobserve(entry.wrapper);
        intersectionObRef.current.observe(entry.wrapper);
      }
    }
  }, [scale, loaded]);

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's' && loaded) {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loaded, annotations, filePath]);

  const renderAllPages = useCallback(() => {
    const container = pagesContainerRef.current;
    if (!container || !pdfDocRef.current) return;
    container.innerHTML = '';
    pageEntriesRef.current = [];

    intersectionObRef.current = new IntersectionObserver((entries) => {
      for (const obsEntry of entries) {
        if (obsEntry.isIntersecting) {
          const pageNum = parseInt((obsEntry.target as HTMLElement).dataset.page || '0');
          const pe = pageEntriesRef.current[pageNum - 1];
          if (pe && !pe.rendered) {
            pe.rendered = true;
            renderPage(pageNum);
          }
        }
      }
    }, { root: container, rootMargin: '200px' });

    for (let i = 1; i <= totalPages; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-editor-page';
      wrapper.dataset.page = String(i);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      wrapper.appendChild(canvas);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('pdf-anno-overlay');
      wrapper.appendChild(svg);

      const label = document.createElement('div');
      label.className = 'pdf-page-label';
      label.textContent = `Seite ${i}`;
      wrapper.appendChild(label);

      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showPageContextMenu(e, i);
      });

      wireAnnotationEvents(svg, canvas, i);
      container.appendChild(wrapper);

      const entry: PageEntry = { canvas, svg, wrapper, pageNum: i, rendered: false };
      pageEntriesRef.current.push(entry);
      intersectionObRef.current!.observe(wrapper);
    }

    // Render first 3 pages immediately
    for (let i = 0; i < Math.min(3, totalPages); i++) {
      pageEntriesRef.current[i].rendered = true;
      renderPage(i + 1);
    }

    // Render thumbnails
    renderThumbnails();
  }, [totalPages]);

  const renderPage = useCallback(async (pageNum: number) => {
    const entry = pageEntriesRef.current[pageNum - 1];
    if (!entry || !pdfDocRef.current) return;

    const page = await pdfDocRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale: scaleRef.current });

    entry.canvas.width = viewport.width;
    entry.canvas.height = viewport.height;
    entry.svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    entry.svg.style.width = viewport.width + 'px';
    entry.svg.style.height = viewport.height + 'px';

    const ctx = entry.canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    renderAnnotationsForPage(pageNum);
  }, []);

  const renderThumbnails = useCallback(() => {
    // Thumbnails are rendered in JSX below, but we need canvas rendering
    // This is handled by the thumbnail list in the JSX
  }, []);

  const renderAnnotationsForPage = useCallback((pageNum: number) => {
    const entry = pageEntriesRef.current[pageNum - 1];
    if (!entry) return;
    const { svg } = entry;
    const s = scaleRef.current;

    svg.querySelectorAll('.anno-render').forEach(el => el.remove());

    const pageAnnos = annotationsRef.current.filter(a => a.page === pageNum - 1);
    for (const anno of pageAnnos) {
      if (anno.type === 'highlight' && anno.rect) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('anno-render');
        rect.setAttribute('x', String(anno.rect.x1 * s));
        rect.setAttribute('y', String(anno.rect.y1 * s));
        rect.setAttribute('width', String((anno.rect.x2 - anno.rect.x1) * s));
        rect.setAttribute('height', String((anno.rect.y2 - anno.rect.y1) * s));
        rect.setAttribute('fill', (anno.color || '#FFFF00') + '40');
        rect.setAttribute('stroke', 'none');
        svg.appendChild(rect);
      } else if (anno.type === 'text' && anno.rect) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(anno.rect.x1 * s + 12));
        circle.setAttribute('cy', String(anno.rect.y1 * s + 12));
        circle.setAttribute('r', '10');
        circle.setAttribute('fill', anno.color || '#FFD700');
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '1');
        g.appendChild(circle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(anno.rect.x1 * s + 12));
        text.setAttribute('y', String(anno.rect.y1 * s + 17));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#333');
        text.textContent = 'i';
        g.appendChild(text);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = anno.text || '';
        g.appendChild(title);
        svg.appendChild(g);
      } else if (anno.type === 'ink' && anno.paths) {
        for (const path of anno.paths) {
          const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          polyline.classList.add('anno-render');
          polyline.setAttribute('points', path.map(p => `${p.x * s},${p.y * s}`).join(' '));
          polyline.setAttribute('fill', 'none');
          polyline.setAttribute('stroke', anno.color || '#FF0000');
          polyline.setAttribute('stroke-width', String(anno.width || 2));
          polyline.setAttribute('stroke-linecap', 'round');
          polyline.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(polyline);
        }
      }
    }
  }, []);

  const wireAnnotationEvents = useCallback((svg: SVGSVGElement, _canvas: HTMLCanvasElement, pageNum: number) => {
    svg.addEventListener('mousedown', (e) => {
      if (currentToolRef.current === 'select') return;
      e.preventDefault();
      drawingRef.current = true;
      const rect = svg.getBoundingClientRect();
      drawStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      currentPathRef.current = [{ ...drawStartRef.current }];
    });

    svg.addEventListener('mousemove', (e) => {
      if (!drawingRef.current) return;
      const rect = svg.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      currentPathRef.current.push(point);

      svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
      if (currentToolRef.current === 'freehand' && currentPathRef.current.length >= 2) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        path.classList.add('temp-draw');
        path.setAttribute('points', currentPathRef.current.map(p => `${p.x},${p.y}`).join(' '));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#FF0000');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
      } else if (currentToolRef.current === 'highlight' && drawStartRef.current) {
        const end = currentPathRef.current[currentPathRef.current.length - 1];
        const r = normalizeRect(drawStartRef.current, end);
        const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectEl.classList.add('temp-draw');
        rectEl.setAttribute('x', String(r.x1));
        rectEl.setAttribute('y', String(r.y1));
        rectEl.setAttribute('width', String(r.x2 - r.x1));
        rectEl.setAttribute('height', String(r.y2 - r.y1));
        rectEl.setAttribute('fill', 'rgba(255, 255, 0, 0.3)');
        svg.appendChild(rectEl);
      }
    });

    svg.addEventListener('mouseup', (e) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const rect = svg.getBoundingClientRect();
      const endPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const s = scaleRef.current;

      if (currentToolRef.current === 'highlight' && drawStartRef.current) {
        const r = normalizeRect(drawStartRef.current, endPoint);
        if (r.x2 - r.x1 > 5 && r.y2 - r.y1 > 3) {
          setAnnotations(prev => [...prev, {
            type: 'highlight', page: pageNum - 1,
            rect: { x1: r.x1 / s, y1: r.y1 / s, x2: r.x2 / s, y2: r.y2 / s },
            color: '#FFFF00',
          }]);
          setUnsavedChanges(true);
        }
      } else if (currentToolRef.current === 'comment') {
        const text = prompt('Kommentar eingeben:');
        if (text) {
          setAnnotations(prev => [...prev, {
            type: 'text', page: pageNum - 1,
            rect: { x1: endPoint.x / s, y1: endPoint.y / s, x2: (endPoint.x + 24) / s, y2: (endPoint.y + 24) / s },
            text, color: '#FFD700',
          }]);
          setUnsavedChanges(true);
        }
      } else if (currentToolRef.current === 'freehand' && currentPathRef.current.length > 2) {
        const scaledPath = currentPathRef.current.map(p => ({ x: p.x / s, y: p.y / s }));
        const bounds = pathBounds(scaledPath);
        setAnnotations(prev => [...prev, {
          type: 'ink', page: pageNum - 1, rect: bounds,
          paths: [scaledPath], color: '#FF0000', width: 2,
        }]);
        setUnsavedChanges(true);
      }

      svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
      // Re-render annotations after state update
      setTimeout(() => renderAnnotationsForPage(pageNum), 50);
      currentPathRef.current = [];
    });
  }, [renderAnnotationsForPage]);

  const save = useCallback(async () => {
    if (!filePath || annotationsRef.current.length === 0) return;
    try {
      await api.pdfSaveAnnotations(filePath, filePath, annotationsRef.current);
      setUnsavedChanges(false);
      showToast('PDF gespeichert', 'success');
    } catch (err: any) {
      showToast('Speichern fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const handleClose = useCallback(async () => {
    if (unsavedChanges) {
      const confirmed = await api.showConfirmDialog({
        type: 'warning', title: 'Änderungen verwerfen?',
        message: 'Es gibt ungespeicherte Änderungen. Wirklich schließen?',
        buttons: ['Abbrechen', 'Verwerfen'], defaultId: 0,
      });
      if (confirmed.response !== 1) return;
    }
    if (onClose) onClose();
    else setActiveTab('explorer');
  }, [unsavedChanges, onClose, setActiveTab]);

  const exportAs = useCallback(async () => {
    if (!filePath) return;
    try {
      const defaultName = filePath.replace(/\.pdf$/i, '_annotiert.pdf');
      const result = await api.showSaveDialog({
        title: 'PDF exportieren',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!result || result.canceled || !result.path) return;
      const outputPath = result.path;
      await api.pdfSaveAnnotations(filePath, outputPath, annotationsRef.current);
      showToast('PDF exportiert: ' + outputPath.split(/[\\/]/).pop(), 'success');
    } catch (err: any) {
      showToast('Export fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const detachWindow = useCallback(async () => {
    if (!filePath) return;
    try {
      await api.openPdfWindow(filePath);
    } catch (err: any) {
      showToast('Fenster konnte nicht geöffnet werden: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const runOcr = useCallback(async (language: string, allPages: boolean) => {
    if (!pdfDocRef.current) return;
    setOcrProgress({ running: true, text: 'Starte OCR...', percent: 0 });

    try {
      const ocrResults = [];
      const pages = allPages
        ? Array.from({ length: totalPages }, (_, i) => i + 1)
        : [getVisiblePage()];

      for (let i = 0; i < pages.length; i++) {
        const pageNum = pages[i];
        setOcrProgress({ running: true, text: `Seite ${pageNum} von ${totalPages}...`, percent: ((i + 1) / pages.length) * 100 });

        const page = await pdfDocRef.current.getPage(pageNum);
        const viewport = page.getViewport({ scale: 3.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const imageBase64 = canvas.toDataURL('image/png');
        const ocrResult = await api.pdfOcrPage(imageBase64, language);
        ocrResults.push(ocrResult);
      }

      setOcrProgress({ running: true, text: 'Textlayer wird eingefügt...', percent: 100 });
      await api.pdfAddTextLayer(filePath, filePath, ocrResults);
      setOcrProgress({ running: true, text: 'Fertig! PDF ist jetzt durchsuchbar.', percent: 100 });
      setTimeout(() => {
        setShowOcr(false);
        setOcrProgress({ running: false, text: '', percent: 0 });
        // Reload PDF
        setLoaded(false);
        setTimeout(() => setLoaded(true), 100);
      }, 1500);
    } catch (err: any) {
      setOcrProgress({ running: false, text: 'Fehler: ' + err.message, percent: 0 });
    }
  }, [filePath, totalPages]);

  const handleMerge = useCallback(async () => {
    if (mergeFiles.length < 2) return;
    try {
      const outputPath = filePath.replace(/\.pdf$/i, '_zusammengefügt.pdf');
      await api.pdfMerge(mergeFiles, outputPath);
      setShowMerge(false);
      setMergeFiles([]);
      showToast('PDFs zusammengefügt', 'success');
    } catch (err: any) {
      showToast('Zusammenfügen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, mergeFiles, showToast]);

  const rotatePage = useCallback(async (pageNum: number, degrees: number) => {
    try {
      await api.pdfRotatePage(filePath, filePath, pageNum - 1, degrees);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
    } catch (err: any) {
      showToast('Drehen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const deletePage = useCallback(async (pageNum: number) => {
    if (totalPages <= 1) { showToast('Die letzte Seite kann nicht gelöscht werden.', 'error'); return; }
    const confirmed = await api.showConfirmDialog({
      type: 'warning', title: 'Seite löschen',
      message: `Seite ${pageNum} wirklich löschen? Dies kann nicht rückgängig gemacht werden.`,
      buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (confirmed.response !== 1) return;
    try {
      await api.pdfDeletePages(filePath, filePath, [pageNum - 1]);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
    } catch (err: any) {
      showToast('Löschen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, totalPages, showToast]);

  const showPageContextMenu = useCallback((e: MouseEvent, pageNum: number) => {
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
    menu.querySelector('[data-action="rotate-cw"]')!.addEventListener('click', () => { cleanup(); rotatePage(pageNum, 90); });
    menu.querySelector('[data-action="rotate-ccw"]')!.addEventListener('click', () => { cleanup(); rotatePage(pageNum, 270); });
    menu.querySelector('[data-action="delete"]')!.addEventListener('click', () => { cleanup(); deletePage(pageNum); });
  }, [rotatePage, deletePage]);

  const getVisiblePage = useCallback((): number => {
    const container = pagesContainerRef.current;
    if (!container) return 1;
    const scrollTop = container.scrollTop;
    for (const entry of pageEntriesRef.current) {
      const top = entry.wrapper.offsetTop - container.offsetTop;
      const bottom = top + entry.wrapper.offsetHeight;
      if (scrollTop >= top - 50 && scrollTop < bottom) return entry.pageNum;
    }
    return 1;
  }, []);

  if (!filePath) {
    return (
      <div className="tool-placeholder">
        <p>Kein PDF geöffnet. Öffne eine PDF-Datei im Explorer per Doppelklick.</p>
      </div>
    );
  }

  const tools = [
    { id: 'select' as const, label: 'Auswählen' },
    { id: 'highlight' as const, label: 'Markieren' },
    { id: 'comment' as const, label: 'Kommentar' },
    { id: 'freehand' as const, label: 'Freihand' },
  ];

  return (
    <div className="pdf-editor">
      <div className="pdf-editor-toolbar">
        <button className="pdf-editor-btn pdf-editor-back" onClick={handleClose}>{'\u2190'} Zurück</button>
        <span className="pdf-editor-filename">{fileName}</span>
        <span className="pdf-editor-info">{infoText}</span>
        <div className="pdf-editor-toolbar-right">
          <button className="pdf-editor-btn" onClick={save} title="Speichern (Ctrl+S)">Speichern</button>
          <button className="pdf-editor-btn" onClick={exportAs} title="Als Kopie speichern...">Exportieren</button>
          <button className="pdf-editor-btn" onClick={handlePrint} title="PDF drucken">Drucken</button>
          <button className="pdf-editor-btn" onClick={() => setShowOcr(true)} title="OCR-Texterkennung">OCR</button>
          <button className="pdf-editor-btn" onClick={() => { setMergeFiles([filePath]); setShowMerge(true); }} title="PDF zusammenfügen">Zusammenfügen</button>
          {!onClose && <button className="pdf-editor-btn" onClick={detachWindow} title="In eigenem Fenster öffnen">Fenster lösen</button>}
        </div>
      </div>

      <div className="pdf-editor-body">
        <div className="pdf-editor-thumbnails">
          {Array.from({ length: totalPages }, (_, i) => (
            <div key={i} className="pdf-thumb" onClick={() => {
              pageEntriesRef.current[i]?.wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="pdf-editor-pages" ref={pagesContainerRef}>
          {!loaded && !error && <div className="loading-spinner" />}
          {error && <div className="preview-error">Fehler beim Laden: {error}</div>}
        </div>
      </div>

      <div className="pdf-editor-anno-toolbar">
        {tools.map(t => (
          <button key={t.id} className={`pdf-editor-tool ${currentTool === t.id ? 'active' : ''}`}
            onClick={() => setCurrentTool(t.id)}>{t.label}</button>
        ))}
        <span className="pdf-editor-separator" />
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}>{'\u2212'}</button>
        <span className="pdf-editor-zoom-info">{Math.round(scale * 100)}%</span>
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.min(s + 0.25, 3.0))}>+</button>
      </div>

      {/* OCR Dialog */}
      {showOcr && (
        <OcrDialog
          onClose={() => { setShowOcr(false); setOcrProgress({ running: false, text: '', percent: 0 }); }}
          onRun={runOcr}
          progress={ocrProgress}
        />
      )}

      {/* Merge Dialog */}
      {showMerge && (
        <MergeDialog
          files={mergeFiles}
          onAddFile={async () => {
            try {
              const result = await api.showSaveDialog({ title: 'PDF auswählen', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
              if (result && !result.canceled && result.path) setMergeFiles(prev => [...prev, result.path]);
            } catch { /* Cancelled */ }
          }}
          onMerge={handleMerge}
          onClose={() => { setShowMerge(false); setMergeFiles([]); }}
        />
      )}
    </div>
  );
}

function OcrDialog({ onClose, onRun, progress }: {
  onClose: () => void;
  onRun: (lang: string, allPages: boolean) => void;
  progress: { running: boolean; text: string; percent: number };
}) {
  const [lang, setLang] = useState('de');
  return (
    <div className="pdf-editor-dialog-overlay">
      <div className="pdf-editor-dialog">
        <h3>OCR-Texterkennung</h3>
        <p>Erkennt Text in gescannten PDF-Seiten und macht die PDF durchsuchbar.</p>
        <label>Sprache: <select value={lang} onChange={e => setLang(e.target.value)}>
          {OCR_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select></label>
        <div className="pdf-editor-dialog-btns">
          <button className="pdf-editor-btn" disabled={progress.running} onClick={() => onRun(lang, false)}>Aktuelle Seite</button>
          <button className="pdf-editor-btn" disabled={progress.running} onClick={() => onRun(lang, true)}>Alle Seiten</button>
          <button className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
        </div>
        {(progress.running || progress.text) && (
          <div className="ocr-progress">
            <div className="ocr-progress-bar"><div className="ocr-progress-fill" style={{ width: progress.percent + '%' }} /></div>
            <span className="ocr-progress-text">{progress.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MergeDialog({ files, onAddFile, onMerge, onClose }: {
  files: string[];
  onAddFile: () => void;
  onMerge: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pdf-editor-dialog-overlay">
      <div className="pdf-editor-dialog">
        <h3>PDFs zusammenfügen</h3>
        <p>Wähle weitere PDFs die an das aktuelle Dokument angehängt werden sollen.</p>
        <div className="merge-file-list">
          {files.slice(1).map((f, i) => (
            <div key={i} className="merge-file-item">{f.split(/[\\/]/).pop()}</div>
          ))}
        </div>
        <div className="pdf-editor-dialog-btns">
          <button className="pdf-editor-btn" onClick={onAddFile}>PDF hinzufügen...</button>
          <button className="pdf-editor-btn" disabled={files.length < 2} onClick={onMerge}>Zusammenfügen</button>
          <button className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

function normalizeRect(p1: Point, p2: Point): Rect {
  return { x1: Math.min(p1.x, p2.x), y1: Math.min(p1.y, p2.y), x2: Math.max(p1.x, p2.x), y2: Math.max(p1.y, p2.y) };
}

function pathBounds(path: Point[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of path) { if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y; if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y; }
  return { x1, y1, x2, y2 };
}

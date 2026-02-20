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

const ANNO_COLORS = [
  { hex: '#FFFF00', label: 'Gelb' },
  { hex: '#00FF00', label: 'Grün' },
  { hex: '#00BFFF', label: 'Blau' },
  { hex: '#FF0000', label: 'Rot' },
  { hex: '#FF8C00', label: 'Orange' },
  { hex: '#FF69B4', label: 'Pink' },
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
  textLayerDiv: HTMLDivElement;
  svg: SVGSVGElement;
  wrapper: HTMLDivElement;
  pageNum: number;
  rendered: boolean;
  textLayerObj?: any; // TextLayer instance for cleanup
}

// Lazy pdf.js loader — Worker aus public/ (statisch, ohne Vite-Transformation)
let _pdfjsLib: any = null;
async function loadPdfjs(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  // Worker liegt in src/public/pdf.worker.min.mjs — wird von Vite unverändert ausgeliefert
  _pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return _pdfjsLib;
}

export default function PdfEditorView({ filePath: propFilePath = '', onClose }: { filePath?: string; onClose?: () => void } = {}) {
  const { showToast, setActiveTab, pendingPdfPath, setPendingPdfPath } = useAppContext();
  // Local state holds the active PDF path — survives clearing of pendingPdfPath
  const [activePdfPath, setActivePdfPath] = useState(propFilePath || '');

  const filePath = activePdfPath;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [currentTool, setCurrentTool] = useState<'select' | 'highlight' | 'comment' | 'freehand'>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnoIdx, setSelectedAnnoIdx] = useState<number | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [showOcr, setShowOcr] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ running: boolean; text: string; percent: number }>({ running: false, text: '', percent: 0 });
  const [mergeFiles, setMergeFiles] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [gotoPageText, setGotoPageText] = useState('');
  const [showGotoInput, setShowGotoInput] = useState(false);
  const [annoColor, setAnnoColor] = useState('#FFFF00');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [commentPopover, setCommentPopover] = useState<{ x: number; y: number; svgX: number; svgY: number; page: number } | null>(null);
  const [commentText, setCommentText] = useState('');

  // Undo/Redo stacks
  const undoStackRef = useRef<Annotation[][]>([]);
  const redoStackRef = useRef<Annotation[][]>([]);

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
  const annoColorRef = useRef('#FFFF00');
  const strokeWidthRef = useRef(2);
  const setCommentPopoverRef = useRef((_v: { x: number; y: number; svgX: number; svgY: number; page: number } | null) => {});
  setCommentPopoverRef.current = setCommentPopover;
  const handlePrintRef = useRef<() => void>(() => {});

  // Keep refs in sync
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { annoColorRef.current = annoColor; }, [annoColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  // Consume pending PDF path from context — warnt bei ungespeicherten Änderungen
  useEffect(() => {
    if (!pendingPdfPath) return;
    if (pendingPdfPath === activePdfPath) { setPendingPdfPath(null); return; }

    if (unsavedChanges) {
      (async () => {
        const confirmed = await api.showConfirmDialog({
          type: 'warning', title: 'Änderungen verwerfen?',
          message: 'Es gibt ungespeicherte Änderungen. Andere PDF öffnen?',
          buttons: ['Abbrechen', 'Verwerfen'], defaultId: 0,
        });
        if (confirmed.response === 1) {
          setActivePdfPath(pendingPdfPath);
        }
        setPendingPdfPath(null);
      })();
    } else {
      setActivePdfPath(pendingPdfPath);
      setPendingPdfPath(null);
    }
  }, [pendingPdfPath, setPendingPdfPath, activePdfPath, unsavedChanges]);

  const fileName = filePath.split(/[\\/]/).pop() || 'PDF';

  // --- Undo/Redo ---
  const pushUndo = useCallback((prevAnnotations: Annotation[]) => {
    undoStackRef.current = [...undoStackRef.current, prevAnnotations];
    redoStackRef.current = []; // Redo leeren bei neuer Aktion
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, annotationsRef.current];
    setAnnotations(prev);
    setSelectedAnnoIdx(null);
    setUnsavedChanges(true); // Konservativ: Undo ändert immer den Zustand gegenüber letztem Speichern
    // Re-render all pages that have annotations
    setTimeout(() => {
      for (let i = 0; i < pageEntriesRef.current.length; i++) {
        renderAnnotationsForPage(i + 1);
      }
    }, 30);
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, annotationsRef.current];
    setAnnotations(next);
    setSelectedAnnoIdx(null);
    setUnsavedChanges(true); // Konservativ: Redo ändert immer den Zustand gegenüber letztem Speichern
    setTimeout(() => {
      for (let i = 0; i < pageEntriesRef.current.length; i++) {
        renderAnnotationsForPage(i + 1);
      }
    }, 30);
  }, []);

  const addAnnotation = useCallback((anno: Annotation) => {
    pushUndo(annotationsRef.current);
    setAnnotations(prev => [...prev, anno]);
    setUnsavedChanges(true);
  }, [pushUndo]);

  const deleteSelectedAnnotation = useCallback(() => {
    if (selectedAnnoIdx === null) return;
    pushUndo(annotationsRef.current);
    setAnnotations(prev => prev.filter((_, i) => i !== selectedAnnoIdx));
    setSelectedAnnoIdx(null);
    setUnsavedChanges(true);
    setTimeout(() => {
      for (let i = 0; i < pageEntriesRef.current.length; i++) {
        renderAnnotationsForPage(i + 1);
      }
    }, 30);
  }, [selectedAnnoIdx, pushUndo]);

  // Load PDF when filePath changes
  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;

    // Altes PDF-Dokument freigeben (Worker-Threads, Canvas-Daten)
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy().catch(() => {});
      pdfDocRef.current = null;
    }

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
        undoStackRef.current = [];
        redoStackRef.current = [];
        setSelectedAnnoIdx(null);
        setUnsavedChanges(false);
        setScale(1.0);
        setCurrentTool('select');
        setCurrentPage(1);

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

    return () => {
      cancelled = true;
      // Bei Unmount/Cleanup das Dokument freigeben
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [filePath]);

  // Render pages after loading
  useEffect(() => {
    if (!loaded || totalPages === 0 || !pagesContainerRef.current) return;
    renderAllPages();
    return () => {
      intersectionObRef.current?.disconnect();
      pageEntriesRef.current = [];
      // Context-Menu DOM-Cleanup bei Unmount
      document.querySelectorAll('.pdf-page-context-menu').forEach(el => el.remove());
    };
  }, [loaded, totalPages]);

  // Re-render when scale changes
  useEffect(() => {
    if (!loaded) return;
    for (const entry of pageEntriesRef.current) entry.rendered = false;
    if (intersectionObRef.current) {
      for (const entry of pageEntriesRef.current) {
        intersectionObRef.current.unobserve(entry.wrapper);
        intersectionObRef.current.observe(entry.wrapper);
      }
    }
  }, [scale, loaded]);

  // --- beforeunload: Warnung bei ungespeicherten Änderungen (Detached Window) ---
  const unsavedRef = useRef(false);
  useEffect(() => { unsavedRef.current = unsavedChanges; }, [unsavedChanges]);
  useEffect(() => {
    if (!onClose) return; // Nur im Detached Window aktiv
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) {
        e.preventDefault();
        // Moderne Browser zeigen einen generischen Text; returnValue wird trotzdem benötigt
        e.returnValue = 'Es gibt ungespeicherte Änderungen.';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [onClose]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (!loaded) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        save();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        handlePrintRef.current();
      } else if (e.key === '+' || e.key === '=' || (e.ctrlKey && e.key === '+')) {
        e.preventDefault();
        setScale(s => Math.min(s + 0.25, 3.0));
      } else if (e.key === '-' || (e.ctrlKey && e.key === '-')) {
        e.preventDefault();
        setScale(s => Math.max(s - 0.25, 0.25));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (showOcr) { setShowOcr(false); setOcrProgress({ running: false, text: '', percent: 0 }); }
        else if (showMerge) { setShowMerge(false); setMergeFiles([]); }
        else if (currentTool !== 'select') setCurrentTool('select');
        else if (selectedAnnoIdx !== null) setSelectedAnnoIdx(null);
      } else if (e.key === 'Delete' && selectedAnnoIdx !== null) {
        e.preventDefault();
        deleteSelectedAnnotation();
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        scrollToPage(Math.min(currentPage + 1, totalPages));
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        scrollToPage(Math.max(currentPage - 1, 1));
      } else if (e.key === 'Home' && e.ctrlKey) {
        e.preventDefault();
        scrollToPage(1);
      } else if (e.key === 'End' && e.ctrlKey) {
        e.preventDefault();
        scrollToPage(totalPages);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loaded, annotations, filePath, currentTool, selectedAnnoIdx, showOcr, showMerge, currentPage, totalPages, undo, redo, deleteSelectedAnnotation]);

  // --- Ctrl+Mausrad Zoom ---
  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container || !loaded) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) setScale(s => Math.min(s + 0.1, 3.0));
      else setScale(s => Math.max(s - 0.1, 0.25));
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [loaded]);

  // --- Track current visible page on scroll ---
  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container || !loaded) return;
    const handler = () => {
      const page = getVisiblePage();
      setCurrentPage(page);
    };
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, [loaded]);

  const scrollToPage = useCallback((pageNum: number) => {
    const entry = pageEntriesRef.current[pageNum - 1];
    if (entry) entry.wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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

      // Text-Layer für Textauswahl (zwischen Canvas und SVG)
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      wrapper.appendChild(textLayerDiv);

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

      const entry: PageEntry = { canvas, textLayerDiv, svg, wrapper, pageNum: i, rendered: false };
      pageEntriesRef.current.push(entry);
      intersectionObRef.current!.observe(wrapper);
    }

    // Render first 3 pages immediately
    for (let i = 0; i < Math.min(3, totalPages); i++) {
      pageEntriesRef.current[i].rendered = true;
      renderPage(i + 1);
    }
  }, [totalPages]);

  const renderPage = useCallback(async (pageNum: number) => {
    const entry = pageEntriesRef.current[pageNum - 1];
    if (!entry || !pdfDocRef.current) return;

    const pdfjsLib = await loadPdfjs();
    const page = await pdfDocRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale: scaleRef.current });

    entry.canvas.width = viewport.width;
    entry.canvas.height = viewport.height;
    entry.svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    entry.svg.style.width = viewport.width + 'px';
    entry.svg.style.height = viewport.height + 'px';

    const ctx = entry.canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Text-Layer rendern (für Textauswahl/Kopieren)
    if (entry.textLayerObj) entry.textLayerObj.cancel();
    entry.textLayerDiv.innerHTML = '';
    entry.textLayerDiv.style.width = viewport.width + 'px';
    entry.textLayerDiv.style.height = viewport.height + 'px';
    // CSS-Variable für die Textskalierung (von pdf.js erwartet)
    entry.textLayerDiv.style.setProperty('--total-scale-factor', String(scaleRef.current));

    try {
      const textContent = await page.getTextContent();
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: entry.textLayerDiv,
        viewport,
      });
      entry.textLayerObj = textLayer;
      await textLayer.render();
    } catch {
      // Text-Layer fehlgeschlagen — kein Problem, PDF bleibt nutzbar
    }

    renderAnnotationsForPage(pageNum);
  }, []);

  const renderAnnotationsForPage = useCallback((pageNum: number) => {
    const entry = pageEntriesRef.current[pageNum - 1];
    if (!entry) return;
    const { svg } = entry;
    const s = scaleRef.current;

    svg.querySelectorAll('.anno-render').forEach(el => el.remove());

    const pageAnnos = annotationsRef.current.filter(a => a.page === pageNum - 1);
    for (const anno of pageAnnos) {
      const annoGlobalIdx = annotationsRef.current.indexOf(anno);
      if (anno.type === 'highlight' && anno.rect) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('anno-render');
        rect.setAttribute('x', String(anno.rect.x1 * s));
        rect.setAttribute('y', String(anno.rect.y1 * s));
        rect.setAttribute('width', String((anno.rect.x2 - anno.rect.x1) * s));
        rect.setAttribute('height', String((anno.rect.y2 - anno.rect.y1) * s));
        rect.setAttribute('fill', (anno.color || '#FFFF00') + '40');
        rect.setAttribute('stroke', 'none');
        rect.setAttribute('data-anno-idx', String(annoGlobalIdx));
        rect.style.cursor = 'pointer';
        svg.appendChild(rect);
      } else if (anno.type === 'text' && anno.rect) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        g.setAttribute('data-anno-idx', String(annoGlobalIdx));
        g.style.cursor = 'pointer';
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
          polyline.setAttribute('data-anno-idx', String(annoGlobalIdx));
          polyline.style.cursor = 'pointer';
          // Breiterer Klickbereich für dünne Linien
          polyline.setAttribute('stroke-opacity', '1');
          svg.appendChild(polyline);
        }
      }
    }
  }, []);

  // --- Drucken: Alle Seiten rendern bevor window.print() aufgerufen wird ---
  const handlePrint = useCallback(async () => {
    const unrendered = pageEntriesRef.current.filter(e => !e.rendered);
    if (unrendered.length > 0) {
      for (const entry of unrendered) entry.rendered = true;
      await Promise.all(unrendered.map(e => renderPage(e.pageNum)));
    }
    window.print();
  }, [renderPage]);
  handlePrintRef.current = handlePrint;

  const wireAnnotationEvents = useCallback((svg: SVGSVGElement, _canvas: HTMLCanvasElement, pageNum: number) => {
    svg.addEventListener('mousedown', (e) => {
      // Im Select-Modus: Annotation-Klick erkennen
      if (currentToolRef.current === 'select') {
        const target = e.target as Element;
        const annoEl = target.closest('[data-anno-idx]');
        if (annoEl) {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(annoEl.getAttribute('data-anno-idx') || '-1');
          if (idx >= 0) {
            setSelectedAnnoIdx(idx);
            // Visuelles Feedback
            svg.querySelectorAll('.anno-selected').forEach(el => el.classList.remove('anno-selected'));
            annoEl.classList.add('anno-selected');
          }
        } else {
          setSelectedAnnoIdx(null);
          svg.querySelectorAll('.anno-selected').forEach(el => el.classList.remove('anno-selected'));
        }
        return;
      }
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
        path.setAttribute('stroke', annoColorRef.current);
        path.setAttribute('stroke-width', String(strokeWidthRef.current));
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
        rectEl.setAttribute('fill', annoColorRef.current + '4D');
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
          addAnnotation({
            type: 'highlight', page: pageNum - 1,
            rect: { x1: r.x1 / s, y1: r.y1 / s, x2: r.x2 / s, y2: r.y2 / s },
            color: annoColorRef.current,
          });
        }
      } else if (currentToolRef.current === 'comment') {
        // Popover an der Klick-Position öffnen — SVG-relative Koordinaten sofort berechnen
        // (damit Scrolling zwischen Klick und OK die Position nicht verschiebt)
        const svgRect = svg.getBoundingClientRect();
        const s = scaleRef.current;
        const svgX = (e.clientX - svgRect.left) / s;
        const svgY = (e.clientY - svgRect.top) / s;
        setCommentPopoverRef.current({ x: e.clientX, y: e.clientY, svgX, svgY, page: pageNum });
      } else if (currentToolRef.current === 'freehand' && currentPathRef.current.length > 2) {
        const scaledPath = currentPathRef.current.map(p => ({ x: p.x / s, y: p.y / s }));
        const bounds = pathBounds(scaledPath);
        addAnnotation({
          type: 'ink', page: pageNum - 1, rect: bounds,
          paths: [scaledPath], color: annoColorRef.current, width: strokeWidthRef.current,
        });
      }

      svg.querySelectorAll('.temp-draw').forEach(el => el.remove());
      setTimeout(() => renderAnnotationsForPage(pageNum), 50);
      currentPathRef.current = [];
    });
  }, [renderAnnotationsForPage, addAnnotation]);

  // SVG pointer-events: nur aktiv wenn Annotations-Werkzeug gewählt
  // Im Select-Modus: SVG nur für Annotation-Klicks, TextLayer für Textauswahl
  useEffect(() => {
    for (const entry of pageEntriesRef.current) {
      if (currentTool === 'select') {
        // SVG nur für Klicks auf bestehende Annotationen sichtbar
        // TextLayer liegt darunter und erlaubt Textauswahl
        entry.svg.style.pointerEvents = 'none';
        entry.svg.querySelectorAll('.anno-render').forEach(el => {
          (el as HTMLElement).style.pointerEvents = 'auto';
        });
        entry.textLayerDiv.style.pointerEvents = 'auto';
      } else {
        // Annotations-Werkzeug aktiv: SVG fängt alle Events
        entry.svg.style.pointerEvents = 'auto';
        entry.textLayerDiv.style.pointerEvents = 'none';
      }
    }
  }, [currentTool, annotations]);

  const save = useCallback(async () => {
    if (!filePath) return;
    const annots = annotationsRef.current;
    // Alle je annotierten Seiten sammeln (aktuelle + Undo-History)
    // damit auch Seiten bereinigt werden, deren Annotationen per Undo entfernt wurden
    const pagesToClear = new Set<number>();
    for (const a of annots) pagesToClear.add(a.page);
    for (const prev of undoStackRef.current) {
      for (const a of prev) pagesToClear.add(a.page);
    }
    if (annots.length === 0 && pagesToClear.size === 0) return;
    try {
      await api.pdfSaveAnnotations(filePath, filePath, annots, Array.from(pagesToClear));
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
      // Dirty pages sammeln (wie bei save), damit Export den aktuellen Editor-Zustand widerspiegelt
      const pagesToClear = new Set<number>();
      for (const a of annotationsRef.current) pagesToClear.add(a.page);
      for (const prev of undoStackRef.current) {
        for (const a of prev) pagesToClear.add(a.page);
      }
      await api.pdfSaveAnnotations(filePath, outputPath, annotationsRef.current, Array.from(pagesToClear));
      showToast('PDF exportiert: ' + outputPath.split(/[\\/]/).pop(), 'success');
    } catch (err: any) {
      showToast('Export fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

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

        // OCR-Koordinaten sind im 3x-skalierten Pixelraum → auf PDF-Punkte herunterskalieren
        const OCR_SCALE = 3.0;
        if (ocrResult?.words && Array.isArray(ocrResult.words)) {
          for (const word of ocrResult.words) {
            word.x = (word.x || 0) / OCR_SCALE;
            word.y = (word.y || 0) / OCR_SCALE;
            word.width = (word.width || 0) / OCR_SCALE;
            word.height = (word.height || 0) / OCR_SCALE;
          }
        }
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
      const defaultName = filePath.replace(/\.pdf$/i, '_zusammengefügt.pdf');
      const result = await api.showSaveDialog({
        title: 'Zusammengefügte PDF speichern unter...',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!result || result.canceled || !result.path) return;
      await api.pdfMerge(mergeFiles, result.path);
      setShowMerge(false);
      setMergeFiles([]);
      showToast('PDFs zusammengefügt: ' + result.path.split(/[\\/]/).pop(), 'success');
    } catch (err: any) {
      showToast('Zusammenfügen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, mergeFiles, showToast]);

  const rotatePage = useCallback(async (pageNum: number, degrees: number) => {
    // Rotation ändert das Koordinatensystem — bestehende Annotations werden ungültig
    if (annotations.length > 0) {
      const confirmed = await api.showConfirmDialog({
        type: 'warning', title: 'Seite drehen',
        message: 'Beim Drehen werden bestehende Annotationen verworfen, da sich das Koordinatensystem ändert. Fortfahren?',
        buttons: ['Abbrechen', 'Fortfahren'], defaultId: 0,
      });
      if (confirmed.response !== 1) return;
    }
    try {
      await api.pdfRotatePage(filePath, filePath, pageNum - 1, degrees);
      // Annotations + Undo/Redo zurücksetzen (Koordinaten stimmen nicht mehr)
      setAnnotations([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setSelectedAnnoIdx(null);
      setUnsavedChanges(false);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
    } catch (err: any) {
      showToast('Drehen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast, annotations.length]);

  const deletePage = useCallback(async (pageNum: number) => {
    if (totalPages <= 1) { showToast('Die letzte Seite kann nicht gelöscht werden.', 'error'); return; }
    const hasAnnotationsOnLaterPages = annotations.some(a => a.page >= pageNum - 1);
    const warnText = hasAnnotationsOnLaterPages
      ? `Seite ${pageNum} wirklich löschen? Bestehende Annotationen werden verworfen (Seitenreferenzen ändern sich). Dies kann nicht rückgängig gemacht werden.`
      : `Seite ${pageNum} wirklich löschen? Dies kann nicht rückgängig gemacht werden.`;
    const confirmed = await api.showConfirmDialog({
      type: 'warning', title: 'Seite löschen',
      message: warnText,
      buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (confirmed.response !== 1) return;
    try {
      await api.pdfDeletePages(filePath, filePath, [pageNum - 1]);
      // Annotations zurücksetzen (Seitenindizes stimmen nicht mehr)
      setAnnotations([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setSelectedAnnoIdx(null);
      setUnsavedChanges(false);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
    } catch (err: any) {
      showToast('Löschen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, totalPages, showToast, annotations]);

  const showPageContextMenu = useCallback((e: MouseEvent, pageNum: number) => {
    document.querySelectorAll('.pdf-page-context-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'pdf-page-context-menu';
    menu.innerHTML = `
      <button data-action="rotate-cw">Seite drehen (90\u00B0)</button>
      <button data-action="rotate-ccw">Seite drehen (-90\u00B0)</button>
      <button data-action="delete">Seite löschen</button>
    `;
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
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

  const submitComment = useCallback(() => {
    if (!commentPopover || !commentText.trim()) { setCommentPopover(null); return; }
    // SVG-relative Koordinaten wurden bereits beim Klick berechnet (scroll-sicher)
    const x = commentPopover.svgX;
    const y = commentPopover.svgY;
    addAnnotation({
      type: 'text', page: commentPopover.page - 1,
      rect: { x1: x, y1: y, x2: x + 24, y2: y + 24 },
      text: commentText.trim(), color: annoColor,
    });
    setTimeout(() => renderAnnotationsForPage(commentPopover.page), 50);
    setCommentPopover(null);
    setCommentText('');
  }, [commentPopover, commentText, annoColor, addAnnotation, renderAnnotationsForPage]);

  const cancelComment = useCallback(() => {
    setCommentPopover(null);
    setCommentText('');
  }, []);

  const handleGotoPage = useCallback(() => {
    const num = parseInt(gotoPageText);
    if (num >= 1 && num <= totalPages) {
      scrollToPage(num);
      setShowGotoInput(false);
      setGotoPageText('');
    }
  }, [gotoPageText, totalPages, scrollToPage]);

  if (!filePath) {
    return (
      <div className="tool-placeholder">
        <p>Kein PDF geöffnet. Öffne eine PDF-Datei im Explorer per Doppelklick.</p>
      </div>
    );
  }

  const tools = [
    { id: 'select' as const, label: 'Auswählen', icon: '\u2B11' },
    { id: 'highlight' as const, label: 'Markieren', icon: '\uD83D\uDD8D' },
    { id: 'comment' as const, label: 'Kommentar', icon: '\uD83D\uDCAC' },
    { id: 'freehand' as const, label: 'Freihand', icon: '\u270F\uFE0F' },
  ];

  return (
    <div className="pdf-editor">
      <div className="pdf-editor-toolbar">
        <button className="pdf-editor-btn pdf-editor-back" onClick={handleClose}>{'\u2190'} Zurück</button>
        <span className="pdf-editor-filename">{fileName}{unsavedChanges ? ' *' : ''}</span>
        <span className="pdf-editor-info">{infoText}</span>
        <div className="pdf-editor-toolbar-right">
          <button className="pdf-editor-btn" onClick={undo} disabled={undoStackRef.current.length === 0} title="Rückgängig (Strg+Z)">Rückgängig</button>
          <button className="pdf-editor-btn" onClick={redo} disabled={redoStackRef.current.length === 0} title="Wiederherstellen (Strg+Y)">Wiederherstellen</button>
          <span className="pdf-editor-separator" />
          <button className="pdf-editor-btn" onClick={save} title="Speichern (Strg+S)">Speichern</button>
          <button className="pdf-editor-btn" onClick={exportAs} title="Als Kopie speichern...">Exportieren</button>
          <button className="pdf-editor-btn" onClick={handlePrint} title="Drucken (Strg+P)">Drucken</button>
          <button className="pdf-editor-btn" onClick={() => setShowOcr(true)} title="OCR-Texterkennung">OCR</button>
          <button className="pdf-editor-btn" onClick={() => { setMergeFiles([filePath]); setShowMerge(true); }} title="PDF zusammenfügen">Zusammenfügen</button>
          {!onClose && <button className="pdf-editor-btn" onClick={detachWindow} title="In eigenem Fenster öffnen">Fenster lösen</button>}
        </div>
      </div>

      <div className="pdf-editor-body">
        <div className="pdf-editor-thumbnails">
          {Array.from({ length: totalPages }, (_, i) => (
            <div key={i} className={`pdf-thumb ${currentPage === i + 1 ? 'pdf-thumb-active' : ''}`} onClick={() => scrollToPage(i + 1)}>
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
            onClick={() => setCurrentTool(t.id)} title={t.label}>
            <span className="pdf-tool-icon">{t.icon}</span>
            <span className="pdf-tool-label">{t.label}</span>
          </button>
        ))}
        {(currentTool === 'highlight' || currentTool === 'freehand') && (
          <>
            <span className="pdf-editor-separator" />
            {ANNO_COLORS.map(c => (
              <button key={c.hex} className={`pdf-color-swatch ${annoColor === c.hex ? 'active' : ''}`}
                style={{ background: c.hex }} title={c.label}
                onClick={() => setAnnoColor(c.hex)} />
            ))}
          </>
        )}
        {currentTool === 'freehand' && (
          <>
            <span className="pdf-editor-separator" />
            {[1, 2, 4].map(w => (
              <button key={w} className={`pdf-stroke-btn ${strokeWidth === w ? 'active' : ''}`}
                onClick={() => setStrokeWidth(w)} title={`${w}px`}>
                <span className="pdf-stroke-preview" style={{ height: w }} />
              </button>
            ))}
          </>
        )}
        {selectedAnnoIdx !== null && (
          <>
            <span className="pdf-editor-separator" />
            <button className="pdf-editor-btn pdf-editor-btn-danger" onClick={deleteSelectedAnnotation} title="Ausgewählte Annotation löschen (Entf)">Annotation löschen</button>
          </>
        )}
        <span className="pdf-editor-separator" />
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))} title="Verkleinern (-)">{'\u2212'}</button>
        <span className="pdf-editor-zoom-info">{Math.round(scale * 100)}%</span>
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.min(s + 0.25, 3.0))} title="Vergrößern (+)">+</button>
        <span className="pdf-editor-separator" />
        {/* Seitenanzeige + Navigation */}
        <button className="pdf-editor-btn" onClick={() => scrollToPage(Math.max(currentPage - 1, 1))} disabled={currentPage <= 1} title="Vorherige Seite (Bild hoch)">{'\u25C0'}</button>
        {showGotoInput ? (
          <input type="text" className="pdf-editor-goto-input" value={gotoPageText} autoFocus
            placeholder={String(currentPage)} size={3}
            onChange={e => setGotoPageText(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => {
              if (e.key === 'Enter') handleGotoPage();
              if (e.key === 'Escape') { setShowGotoInput(false); setGotoPageText(''); }
              e.stopPropagation();
            }}
            onBlur={() => { setShowGotoInput(false); setGotoPageText(''); }}
          />
        ) : (
          <span className="pdf-editor-page-info" onClick={() => setShowGotoInput(true)} title="Klicken um zu einer Seite zu springen">
            Seite {currentPage} von {totalPages}
          </span>
        )}
        <button className="pdf-editor-btn" onClick={() => scrollToPage(Math.min(currentPage + 1, totalPages))} disabled={currentPage >= totalPages} title="Nächste Seite (Bild runter)">{'\u25B6'}</button>
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
              const result = await api.showSaveDialog({ title: 'PDF auswählen', open: true, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
              if (result && !result.canceled && result.path) setMergeFiles(prev => [...prev, result.path]);
            } catch { /* Cancelled */ }
          }}
          onMerge={handleMerge}
          onClose={() => { setShowMerge(false); setMergeFiles([]); }}
        />
      )}

      {/* Comment Popover — Viewport-Clamping */}
      {commentPopover && (
        <div className="pdf-comment-popover" style={{
          left: Math.min(commentPopover.x, window.innerWidth - 230),
          top: Math.min(commentPopover.y, window.innerHeight - 120),
        }}>
          <textarea
            className="pdf-comment-textarea"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            autoFocus
            placeholder="Kommentar eingeben..."
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
              if (e.key === 'Escape') cancelComment();
              e.stopPropagation();
            }}
          />
          <div className="pdf-comment-popover-btns">
            <button className="pdf-editor-btn" onClick={submitComment}>OK</button>
            <button className="pdf-editor-btn" onClick={cancelComment}>Abbrechen</button>
          </div>
        </div>
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

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
type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';
type StampType = 'approved' | 'confidential' | 'draft' | 'copy' | 'date';

interface Annotation {
  type: 'highlight' | 'text' | 'ink' | 'freetext' | 'shape' | 'stamp' | 'signature';
  page: number;
  rect: Rect;
  color: string;
  text?: string;
  paths?: Point[][];
  width?: number;
  fontSize?: number;
  fontFamily?: string;
  shapeType?: ShapeType;
  filled?: boolean;
  stampType?: StampType;
  rotation?: number;
}

const STAMPS: { id: StampType; label: string }[] = [
  { id: 'approved', label: 'GENEHMIGT' },
  { id: 'confidential', label: 'VERTRAULICH' },
  { id: 'draft', label: 'ENTWURF' },
  { id: 'copy', label: 'KOPIE' },
  { id: 'date', label: new Date().toLocaleDateString('de-DE') },
];

const FONTS = [
  { id: 'system-ui, sans-serif', label: 'Sans-Serif' },
  { id: 'Georgia, serif', label: 'Serif' },
  { id: 'Consolas, monospace', label: 'Monospace' },
  { id: 'Segoe Script, cursive', label: 'Handschrift' },
  { id: 'Arial, sans-serif', label: 'Arial' },
  { id: 'Times New Roman, serif', label: 'Times' },
  { id: 'Verdana, sans-serif', label: 'Verdana' },
  { id: 'Courier New, monospace', label: 'Courier' },
];

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
  const [currentTool, setCurrentTool] = useState<'select' | 'highlight' | 'comment' | 'freehand' | 'textbox' | 'shape-rect' | 'shape-ellipse' | 'shape-line' | 'shape-arrow' | 'stamp' | 'signature'>('select');
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
  const [commentPopover, setCommentPopover] = useState<{ x: number; y: number; svgX: number; svgY: number; page: number; editIdx?: number; mode?: 'comment' | 'textbox' } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [textFontSize, setTextFontSize] = useState(14);
  const [textFontFamily, setTextFontFamily] = useState('system-ui, sans-serif');
  const [shapeFilled, setShapeFilled] = useState(false);
  const [activeStamp, setActiveStamp] = useState<StampType>('approved');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<Point[][][]>(() => {
    try { return JSON.parse(localStorage.getItem('pdf-signatures') || '[]'); } catch { return []; }
  });
  const [pendingSignature, setPendingSignature] = useState<Point[][] | null>(null);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [watermark, setWatermark] = useState<{ text: string; fontSize: number; color: string; opacity: number; rotation: number } | null>(null);
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ data: Uint8Array } | null>(null);
  const [passwordText, setPasswordText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; matchIdx: number }[]>([]);
  const [searchCurrentIdx, setSearchCurrentIdx] = useState(0);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showImageInsert, setShowImageInsert] = useState(false);
  const [imageInsertData, setImageInsertData] = useState<{ base64: string; name: string } | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printRange, setPrintRange] = useState('');
  const [thumbDragIdx, setThumbDragIdx] = useState<number | null>(null);
  const [thumbDropIdx, setThumbDropIdx] = useState<number | null>(null);

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
  const draggingAnnoRef = useRef<{ idx: number; startX: number; startY: number; origRect: Rect } | null>(null);
  const currentPathRef = useRef<Point[]>([]);
  const annoColorRef = useRef('#FFFF00');
  const strokeWidthRef = useRef(2);
  const shapeFilledRef = useRef(false);
  const pendingSignatureRef = useRef<Point[][] | null>(null);
  const activeStampRef = useRef<StampType>('approved');
  const watermarkRef = useRef<{ text: string; fontSize: number; color: string; opacity: number; rotation: number } | null>(null);
  const setCommentPopoverRef = useRef((_v: { x: number; y: number; svgX: number; svgY: number; page: number; editIdx?: number; mode?: 'comment' | 'textbox' } | null) => {});
  setCommentPopoverRef.current = setCommentPopover;
  const setCommentTextRef = useRef((_v: string) => {});
  setCommentTextRef.current = setCommentText;
  const handlePrintRef = useRef<() => void>(() => {});
  const showImageInsertRef = useRef(false);
  const placeImageOnPageRef = useRef((_pageNum: number, _x: number, _y: number) => {});

  // Keep refs in sync
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { annoColorRef.current = annoColor; }, [annoColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { showImageInsertRef.current = showImageInsert; }, [showImageInsert]);
  useEffect(() => { shapeFilledRef.current = shapeFilled; }, [shapeFilled]);
  useEffect(() => { pendingSignatureRef.current = pendingSignature; }, [pendingSignature]);
  useEffect(() => { activeStampRef.current = activeStamp; }, [activeStamp]);
  useEffect(() => { watermarkRef.current = watermark; }, [watermark]);

  // Wasserzeichen-Änderung auf alle Seiten propagieren
  useEffect(() => {
    for (let i = 0; i < pageEntriesRef.current.length; i++) {
      if (pageEntriesRef.current[i].rendered) renderAnnotationsForPage(i + 1);
    }
  }, [watermark]);

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

    // Force re-render of pages when file changes (auch bei gleicher Seitenanzahl)
    setLoaded(false);

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

        let pdfDoc;
        try {
          pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        } catch (loadErr: any) {
          // Passwortgeschützte PDF → Dialog anzeigen
          if (loadErr?.name === 'PasswordException') {
            if (!cancelled) setPasswordPrompt({ data });
            return;
          }
          throw loadErr;
        }
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
        if (info.title) parts.push(info.title);
        if (info.author) parts.push(`von ${info.author}`);
        if (info.creationDate) {
          // PDF-Datum: D:YYYYMMDDHHmmSS → DD.MM.YYYY
          const ds = String(info.creationDate).replace(/^D:/, '');
          if (ds.length >= 8) parts.push(`${ds.substring(6,8)}.${ds.substring(4,6)}.${ds.substring(0,4)}`);
        }
        if (!info.isTextSearchable) parts.push('OCR empfohlen');
        setInfoText(parts.join(' \u2022 '));

        // Gespeicherte Annotationen laden
        try {
          const allAnnos: Annotation[] = [];
          for (let p = 0; p < pdfDoc.numPages; p++) {
            if (cancelled) break;
            const pageAnnos = await api.pdfGetAnnotations(filePath, p);
            if (Array.isArray(pageAnnos)) {
              for (const a of pageAnnos) {
                if (a.rect && (a.type === 'highlight' || a.type === 'text' || a.type === 'ink')) {
                  allAnnos.push({
                    type: a.type, page: p, rect: a.rect,
                    color: a.type === 'highlight' ? '#FFFF00' : a.type === 'text' ? '#FFD700' : '#FF0000',
                    text: a.text || undefined,
                  });
                }
              }
            }
          }
          if (!cancelled && allAnnos.length > 0) setAnnotations(allAnnos);
        } catch { /* Annotation-Laden fehlgeschlagen — PDF bleibt nutzbar */ }

        // Lesezeichen laden
        try {
          const bm = await api.pdfGetBookmarks(filePath);
          if (!cancelled && Array.isArray(bm) && bm.length > 0) setBookmarks(bm);
          else setBookmarks([]);
        } catch { setBookmarks([]); }

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

      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.ctrlKey && e.key === 's') {
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
      } else if (anno.type === 'freetext' && anno.text) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        g.setAttribute('data-anno-idx', String(annoGlobalIdx));
        g.style.cursor = 'pointer';
        const fs = (anno.fontSize || 14) * s;
        const lines = anno.text.split('\n');
        const lineHeight = fs * 1.3;
        const textWidth = Math.max(...lines.map(l => l.length)) * fs * 0.55 + 12 * s;
        const textHeight = lines.length * lineHeight + 8 * s;
        // Semi-transparent background
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(anno.rect.x1 * s));
        bg.setAttribute('y', String(anno.rect.y1 * s));
        bg.setAttribute('width', String(Math.max(textWidth, 50 * s)));
        bg.setAttribute('height', String(Math.max(textHeight, fs + 8 * s)));
        bg.setAttribute('fill', 'rgba(255,255,255,0.9)');
        bg.setAttribute('stroke', (anno.color || '#333') + '80');
        bg.setAttribute('stroke-width', '1');
        bg.setAttribute('rx', String(3 * s));
        g.appendChild(bg);
        // Text lines
        for (let li = 0; li < lines.length; li++) {
          const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textEl.setAttribute('x', String((anno.rect.x1) * s + 6 * s));
          textEl.setAttribute('y', String((anno.rect.y1) * s + fs + li * lineHeight + 2 * s));
          textEl.setAttribute('font-size', String(fs));
          textEl.setAttribute('font-family', anno.fontFamily || 'system-ui, -apple-system, sans-serif');
          textEl.setAttribute('fill', anno.color || '#333');
          textEl.textContent = lines[li];
          g.appendChild(textEl);
        }
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
      } else if (anno.type === 'shape' && anno.shapeType && anno.rect) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        g.setAttribute('data-anno-idx', String(annoGlobalIdx));
        g.style.cursor = 'pointer';
        const x1 = anno.rect.x1 * s, y1 = anno.rect.y1 * s;
        const x2 = anno.rect.x2 * s, y2 = anno.rect.y2 * s;
        const w = x2 - x1, h = y2 - y1;
        const color = anno.color || '#FF0000';
        const sw = String(anno.width || 2);
        if (anno.shapeType === 'rect') {
          const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          r.setAttribute('x', String(x1)); r.setAttribute('y', String(y1));
          r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
          r.setAttribute('fill', anno.filled ? color + '40' : 'none');
          r.setAttribute('stroke', color); r.setAttribute('stroke-width', sw);
          g.appendChild(r);
        } else if (anno.shapeType === 'ellipse') {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          el.setAttribute('cx', String(x1 + w / 2)); el.setAttribute('cy', String(y1 + h / 2));
          el.setAttribute('rx', String(w / 2)); el.setAttribute('ry', String(h / 2));
          el.setAttribute('fill', anno.filled ? color + '40' : 'none');
          el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
          g.appendChild(el);
        } else if (anno.shapeType === 'line') {
          const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ln.setAttribute('x1', String(x1)); ln.setAttribute('y1', String(y1));
          ln.setAttribute('x2', String(x2)); ln.setAttribute('y2', String(y2));
          ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', sw);
          ln.setAttribute('stroke-linecap', 'round');
          g.appendChild(ln);
        } else if (anno.shapeType === 'arrow') {
          // Pfeil: Linie + Pfeilspitze
          const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ln.setAttribute('x1', String(x1)); ln.setAttribute('y1', String(y1));
          ln.setAttribute('x2', String(x2)); ln.setAttribute('y2', String(y2));
          ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', sw);
          ln.setAttribute('stroke-linecap', 'round');
          g.appendChild(ln);
          // Pfeilspitze berechnen
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 12 * s;
          const p1x = x2 - headLen * Math.cos(angle - Math.PI / 6);
          const p1y = y2 - headLen * Math.sin(angle - Math.PI / 6);
          const p2x = x2 - headLen * Math.cos(angle + Math.PI / 6);
          const p2y = y2 - headLen * Math.sin(angle + Math.PI / 6);
          const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          head.setAttribute('points', `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`);
          head.setAttribute('fill', color);
          g.appendChild(head);
        }
        svg.appendChild(g);
      } else if (anno.type === 'stamp' && anno.stampType && anno.rect) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        g.setAttribute('data-anno-idx', String(annoGlobalIdx));
        g.style.cursor = 'pointer';
        const cx = (anno.rect.x1 + anno.rect.x2) / 2 * s;
        const cy = (anno.rect.y1 + anno.rect.y2) / 2 * s;
        const rot = anno.rotation || -15;
        g.setAttribute('transform', `rotate(${rot} ${cx} ${cy})`);
        const x1 = anno.rect.x1 * s, y1 = anno.rect.y1 * s;
        const w = (anno.rect.x2 - anno.rect.x1) * s, h = (anno.rect.y2 - anno.rect.y1) * s;
        const color = anno.color || '#FF0000';
        const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        border.setAttribute('x', String(x1)); border.setAttribute('y', String(y1));
        border.setAttribute('width', String(w)); border.setAttribute('height', String(h));
        border.setAttribute('fill', 'none'); border.setAttribute('stroke', color);
        border.setAttribute('stroke-width', '3'); border.setAttribute('rx', '4');
        g.appendChild(border);
        const stampLabel = STAMPS.find(st => st.id === anno.stampType)?.label || anno.stampType.toUpperCase();
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(x1 + w / 2)); text.setAttribute('y', String(y1 + h / 2 + 8 * s));
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', String(20 * s));
        text.setAttribute('font-weight', 'bold'); text.setAttribute('fill', color);
        text.setAttribute('font-family', 'system-ui, sans-serif');
        text.textContent = stampLabel;
        g.appendChild(text);
        svg.appendChild(g);
      } else if (anno.type === 'signature' && anno.paths) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('anno-render');
        g.setAttribute('data-anno-idx', String(annoGlobalIdx));
        g.style.cursor = 'pointer';
        for (const path of anno.paths) {
          const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          polyline.setAttribute('points', path.map(p => `${p.x * s},${p.y * s}`).join(' '));
          polyline.setAttribute('fill', 'none');
          polyline.setAttribute('stroke', anno.color || '#000080');
          polyline.setAttribute('stroke-width', String((anno.width || 2) * s));
          polyline.setAttribute('stroke-linecap', 'round');
          polyline.setAttribute('stroke-linejoin', 'round');
          g.appendChild(polyline);
        }
        svg.appendChild(g);
      }
    }

    // Wasserzeichen auf jeder Seite rendern (halbtransparent, zentriert, rotiert)
    if (watermarkRef.current && watermarkRef.current.text) {
      const wm = watermarkRef.current;
      const wmText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      wmText.classList.add('anno-render');
      const vw = parseFloat(svg.getAttribute('viewBox')?.split(' ')[2] || '800');
      const vh = parseFloat(svg.getAttribute('viewBox')?.split(' ')[3] || '600');
      wmText.setAttribute('x', String(vw / 2));
      wmText.setAttribute('y', String(vh / 2));
      wmText.setAttribute('text-anchor', 'middle');
      wmText.setAttribute('dominant-baseline', 'middle');
      wmText.setAttribute('font-size', String(wm.fontSize * s));
      wmText.setAttribute('font-family', 'system-ui, sans-serif');
      wmText.setAttribute('font-weight', 'bold');
      wmText.setAttribute('fill', wm.color);
      wmText.setAttribute('fill-opacity', String(wm.opacity));
      wmText.setAttribute('transform', `rotate(${wm.rotation} ${vw / 2} ${vh / 2})`);
      wmText.setAttribute('pointer-events', 'none');
      wmText.textContent = wm.text;
      svg.appendChild(wmText);
    }
  }, []);

  // --- Drucken: Alle Seiten rendern bevor window.print() aufgerufen wird ---
  const handlePrint = useCallback(async (pageSet?: Set<number>) => {
    const unrendered = pageEntriesRef.current.filter(e => !e.rendered);
    if (unrendered.length > 0) {
      for (const entry of unrendered) entry.rendered = true;
      await Promise.all(unrendered.map(e => renderPage(e.pageNum)));
    }
    // Wenn Seitenbereich angegeben, nicht-ausgewählte Seiten ausblenden
    if (pageSet) {
      for (const entry of pageEntriesRef.current) {
        entry.wrapper.style.display = pageSet.has(entry.pageNum) ? '' : 'none';
      }
    }
    window.print();
    // Nach dem Druck alle Seiten wieder einblenden
    if (pageSet) {
      for (const entry of pageEntriesRef.current) {
        entry.wrapper.style.display = '';
      }
    }
  }, [renderPage]);
  handlePrintRef.current = () => handlePrint();

  const handlePrintRange = useCallback(() => {
    if (!printRange.trim()) { handlePrint(); setShowPrintDialog(false); return; }
    // Seitenbereich parsen: "1-3, 5, 7-9" → Set
    const pages = new Set<number>();
    for (const part of printRange.split(',')) {
      const trimmed = part.trim();
      const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        const from = parseInt(rangeMatch[1]);
        const to = parseInt(rangeMatch[2]);
        for (let i = from; i <= to && i <= totalPages; i++) pages.add(i);
      } else {
        const num = parseInt(trimmed);
        if (num >= 1 && num <= totalPages) pages.add(num);
      }
    }
    if (pages.size === 0) { showToast('Ungültiger Seitenbereich', 'error'); return; }
    handlePrint(pages);
    setShowPrintDialog(false);
  }, [printRange, totalPages, handlePrint, showToast]);

  const wireAnnotationEvents = useCallback((svg: SVGSVGElement, _canvas: HTMLCanvasElement, pageNum: number) => {
    // Doppelklick: Text-Annotation bearbeiten
    svg.addEventListener('dblclick', (e) => {
      const target = e.target as Element;
      const annoEl = target.closest('[data-anno-idx]');
      if (!annoEl) return;
      const idx = parseInt(annoEl.getAttribute('data-anno-idx') || '-1');
      if (idx < 0) return;
      const anno = annotationsRef.current[idx];
      if (!anno || (anno.type !== 'text' && anno.type !== 'freetext')) return;
      e.preventDefault();
      e.stopPropagation();
      // Kommentar-Popover im Bearbeitungsmodus öffnen + Text laden
      setCommentTextRef.current(anno.text || '');
      setCommentPopoverRef.current({ x: e.clientX, y: e.clientY, svgX: anno.rect.x1, svgY: anno.rect.y1, page: pageNum, editIdx: idx, mode: anno.type === 'freetext' ? 'textbox' : 'comment' });
    });

    svg.addEventListener('mousedown', (e) => {
      // Bild-Einfügen-Modus: Klick platziert das Bild
      if (showImageInsertRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const rect = svg.getBoundingClientRect();
        placeImageOnPageRef.current(pageNum, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      // Im Select-Modus: Annotation-Klick erkennen + Drag starten
      if (currentToolRef.current === 'select') {
        const target = e.target as Element;
        const annoEl = target.closest('[data-anno-idx]');
        if (annoEl) {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(annoEl.getAttribute('data-anno-idx') || '-1');
          if (idx >= 0) {
            setSelectedAnnoIdx(idx);
            svg.querySelectorAll('.anno-selected').forEach(el => el.classList.remove('anno-selected'));
            annoEl.classList.add('anno-selected');
            // Drag starten
            const anno = annotationsRef.current[idx];
            if (anno?.rect) {
              const svgRect = svg.getBoundingClientRect();
              draggingAnnoRef.current = {
                idx, startX: e.clientX - svgRect.left, startY: e.clientY - svgRect.top,
                origRect: { ...anno.rect },
              };
            }
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
      // Annotation-Drag im Select-Modus
      if (draggingAnnoRef.current && currentToolRef.current === 'select') {
        const svgRect = svg.getBoundingClientRect();
        const s = scaleRef.current;
        const dx = (e.clientX - svgRect.left - draggingAnnoRef.current.startX) / s;
        const dy = (e.clientY - svgRect.top - draggingAnnoRef.current.startY) / s;
        const orig = draggingAnnoRef.current.origRect;
        const idx = draggingAnnoRef.current.idx;
        const anno = annotationsRef.current[idx];
        if (anno) {
          anno.rect = {
            x1: orig.x1 + dx, y1: orig.y1 + dy,
            x2: orig.x2 + dx, y2: orig.y2 + dy,
          };
          // Ink-Pfade ebenfalls verschieben — werden beim endgültigen Setzen berechnet
          renderAnnotationsForPage(anno.page + 1);
        }
        return;
      }
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
      } else if (currentToolRef.current.startsWith('shape-') && drawStartRef.current) {
        const end = currentPathRef.current[currentPathRef.current.length - 1];
        const r = normalizeRect(drawStartRef.current, end);
        const shapeType = currentToolRef.current.replace('shape-', '');
        const color = annoColorRef.current;
        const sw = String(strokeWidthRef.current);
        if (shapeType === 'rect') {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          el.classList.add('temp-draw');
          el.setAttribute('x', String(r.x1)); el.setAttribute('y', String(r.y1));
          el.setAttribute('width', String(r.x2 - r.x1)); el.setAttribute('height', String(r.y2 - r.y1));
          el.setAttribute('fill', shapeFilledRef.current ? color + '40' : 'none');
          el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
          svg.appendChild(el);
        } else if (shapeType === 'ellipse') {
          const w = r.x2 - r.x1, h = r.y2 - r.y1;
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          el.classList.add('temp-draw');
          el.setAttribute('cx', String(r.x1 + w / 2)); el.setAttribute('cy', String(r.y1 + h / 2));
          el.setAttribute('rx', String(w / 2)); el.setAttribute('ry', String(h / 2));
          el.setAttribute('fill', shapeFilledRef.current ? color + '40' : 'none');
          el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
          svg.appendChild(el);
        } else if (shapeType === 'line' || shapeType === 'arrow') {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          el.classList.add('temp-draw');
          el.setAttribute('x1', String(drawStartRef.current.x)); el.setAttribute('y1', String(drawStartRef.current.y));
          el.setAttribute('x2', String(end.x)); el.setAttribute('y2', String(end.y));
          el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
          el.setAttribute('stroke-linecap', 'round');
          svg.appendChild(el);
          if (shapeType === 'arrow') {
            const angle = Math.atan2(end.y - drawStartRef.current.y, end.x - drawStartRef.current.x);
            const headLen = 12;
            const p1x = end.x - headLen * Math.cos(angle - Math.PI / 6);
            const p1y = end.y - headLen * Math.sin(angle - Math.PI / 6);
            const p2x = end.x - headLen * Math.cos(angle + Math.PI / 6);
            const p2y = end.y - headLen * Math.sin(angle + Math.PI / 6);
            const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            head.classList.add('temp-draw');
            head.setAttribute('points', `${end.x},${end.y} ${p1x},${p1y} ${p2x},${p2y}`);
            head.setAttribute('fill', color);
            svg.appendChild(head);
          }
        }
      }
    });

    svg.addEventListener('mouseup', (e) => {
      // Annotation-Drag beenden
      if (draggingAnnoRef.current) {
        const svgRect = svg.getBoundingClientRect();
        const s = scaleRef.current;
        const dx = (e.clientX - svgRect.left - draggingAnnoRef.current.startX) / s;
        const dy = (e.clientY - svgRect.top - draggingAnnoRef.current.startY) / s;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          // Tatsächlich verschoben — als Undo-Aktion registrieren
          const idx = draggingAnnoRef.current.idx;
          const orig = draggingAnnoRef.current.origRect;
          pushUndo(annotationsRef.current.map((a, i) => i === idx ? { ...a, rect: orig } : a));
          setAnnotations([...annotationsRef.current]); // State aktualisieren
          setUnsavedChanges(true);
        }
        draggingAnnoRef.current = null;
        return;
      }
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
        setCommentPopoverRef.current({ x: e.clientX, y: e.clientY, svgX, svgY, page: pageNum, mode: 'comment' });
      } else if (currentToolRef.current === 'textbox') {
        // Frei-Text: Popover mit Schriftgröße öffnen
        const svgRect = svg.getBoundingClientRect();
        const s = scaleRef.current;
        const svgX = (e.clientX - svgRect.left) / s;
        const svgY = (e.clientY - svgRect.top) / s;
        setCommentPopoverRef.current({ x: e.clientX, y: e.clientY, svgX, svgY, page: pageNum, mode: 'textbox' });
      } else if (currentToolRef.current === 'freehand' && currentPathRef.current.length > 2) {
        const scaledPath = currentPathRef.current.map(p => ({ x: p.x / s, y: p.y / s }));
        const bounds = pathBounds(scaledPath);
        addAnnotation({
          type: 'ink', page: pageNum - 1, rect: bounds,
          paths: [scaledPath], color: annoColorRef.current, width: strokeWidthRef.current,
        });
      } else if (currentToolRef.current.startsWith('shape-') && drawStartRef.current) {
        const r = normalizeRect(drawStartRef.current, endPoint);
        if (r.x2 - r.x1 > 5 && r.y2 - r.y1 > 5) {
          const shapeType = currentToolRef.current.replace('shape-', '') as ShapeType;
          addAnnotation({
            type: 'shape', page: pageNum - 1,
            rect: { x1: r.x1 / s, y1: r.y1 / s, x2: r.x2 / s, y2: r.y2 / s },
            color: annoColorRef.current, width: strokeWidthRef.current,
            shapeType, filled: shapeFilledRef.current,
          });
        }
      } else if (currentToolRef.current === 'stamp') {
        const svgRect = svg.getBoundingClientRect();
        const clickX = (e.clientX - svgRect.left) / s;
        const clickY = (e.clientY - svgRect.top) / s;
        // Stempel: 120x40 PDF-Punkte
        addAnnotation({
          type: 'stamp', page: pageNum - 1,
          rect: { x1: clickX - 60, y1: clickY - 20, x2: clickX + 60, y2: clickY + 20 },
          color: annoColorRef.current, stampType: activeStampRef.current, rotation: -15,
        });
      } else if (currentToolRef.current === 'signature' && pendingSignatureRef.current) {
        const svgRect = svg.getBoundingClientRect();
        const clickX = (e.clientX - svgRect.left) / s;
        const clickY = (e.clientY - svgRect.top) / s;
        // Signatur auf 100px Breite skalieren und am Klickpunkt platzieren
        const sigPaths = pendingSignatureRef.current;
        const allPts = sigPaths.flat();
        const bounds = pathBounds(allPts);
        const bw = bounds.x2 - bounds.x1 || 1;
        const bh = bounds.y2 - bounds.y1 || 1;
        const targetW = 100;
        const sigScale = targetW / bw;
        const scaledPaths = sigPaths.map(path =>
          path.map(p => ({ x: clickX + (p.x - bounds.x1) * sigScale, y: clickY + (p.y - bounds.y1) * sigScale }))
        );
        const finalBounds = { x1: clickX, y1: clickY, x2: clickX + bw * sigScale, y2: clickY + bh * sigScale };
        addAnnotation({
          type: 'signature', page: pageNum - 1, rect: finalBounds,
          paths: scaledPaths, color: '#000080', width: 2,
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
    if (annotationsRef.current.length > 0) {
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
  }, [filePath, showToast]);

  const deletePage = useCallback(async (pageNum: number) => {
    if (totalPages <= 1) { showToast('Die letzte Seite kann nicht gelöscht werden.', 'error'); return; }
    const hasAnnotationsOnLaterPages = annotationsRef.current.some(a => a.page >= pageNum - 1);
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
  }, [filePath, totalPages, showToast]);

  const extractPages = useCallback(async (pageNum: number) => {
    try {
      const defaultName = filePath.replace(/\.pdf$/i, `_seite${pageNum}.pdf`);
      const result = await api.showSaveDialog({
        title: 'Seite extrahieren und speichern unter...',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!result || result.canceled || !result.path) return;
      await api.pdfExtractPages(filePath, result.path, [pageNum - 1]);
      showToast(`Seite ${pageNum} extrahiert: ${result.path.split(/[\\/]/).pop()}`, 'success');
    } catch (err: any) {
      showToast('Extrahieren fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const insertBlankPage = useCallback(async (afterPageNum: number) => {
    try {
      await api.pdfInsertBlankPage(filePath, filePath, afterPageNum - 1);
      setAnnotations([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setSelectedAnnoIdx(null);
      setUnsavedChanges(false);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
      showToast(`Leere Seite nach Seite ${afterPageNum} eingefügt`, 'success');
    } catch (err: any) {
      showToast('Einfügen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, showToast]);

  const showPageContextMenu = useCallback((e: MouseEvent, pageNum: number) => {
    document.querySelectorAll('.pdf-page-context-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'pdf-page-context-menu';
    menu.innerHTML = `
      <button data-action="rotate-cw">Seite drehen (90\u00B0)</button>
      <button data-action="rotate-ccw">Seite drehen (-90\u00B0)</button>
      <button data-action="extract">Seite extrahieren</button>
      <button data-action="insert-blank">Leere Seite einfügen (danach)</button>
      <button data-action="delete">Seite löschen</button>
    `;
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
    document.body.appendChild(menu);

    const cleanup = () => menu.remove();
    document.addEventListener('click', cleanup, { once: true });
    menu.querySelector('[data-action="rotate-cw"]')!.addEventListener('click', () => { cleanup(); rotatePage(pageNum, 90); });
    menu.querySelector('[data-action="rotate-ccw"]')!.addEventListener('click', () => { cleanup(); rotatePage(pageNum, 270); });
    menu.querySelector('[data-action="extract"]')!.addEventListener('click', () => { cleanup(); extractPages(pageNum); });
    menu.querySelector('[data-action="insert-blank"]')!.addEventListener('click', () => { cleanup(); insertBlankPage(pageNum); });
    menu.querySelector('[data-action="delete"]')!.addEventListener('click', () => { cleanup(); deletePage(pageNum); });
  }, [rotatePage, deletePage, extractPages, insertBlankPage]);

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
    if (!commentPopover || !commentText.trim()) { setCommentPopover(null); setCommentText(''); return; }

    if (commentPopover.editIdx !== undefined) {
      // Bestehende Annotation bearbeiten
      pushUndo(annotationsRef.current);
      setAnnotations(prev => prev.map((a, i) => {
        if (i !== commentPopover.editIdx) return a;
        if (a.type === 'freetext') {
          // Freetext: Text, Schriftgröße, Schriftart und Rect aktualisieren
          const lines = commentText.trim().split('\n');
          const fs = textFontSize;
          const textWidth = Math.max(...lines.map(l => l.length)) * fs * 0.55 + 12;
          const textHeight = lines.length * fs * 1.3 + 8;
          return { ...a, text: commentText.trim(), fontSize: fs, fontFamily: textFontFamily, color: annoColor,
            rect: { x1: a.rect.x1, y1: a.rect.y1, x2: a.rect.x1 + Math.max(textWidth, 50), y2: a.rect.y1 + Math.max(textHeight, fs + 8) } };
        }
        return { ...a, text: commentText.trim() };
      }));
      setUnsavedChanges(true);
    } else if (commentPopover.mode === 'textbox') {
      // Frei-Text-Annotation erstellen (sichtbarer Text auf der Seite)
      const x = commentPopover.svgX;
      const y = commentPopover.svgY;
      const lines = commentText.trim().split('\n');
      const fs = textFontSize;
      const textWidth = Math.max(...lines.map(l => l.length)) * fs * 0.55 + 12;
      const textHeight = lines.length * fs * 1.3 + 8;
      addAnnotation({
        type: 'freetext', page: commentPopover.page - 1,
        rect: { x1: x, y1: y, x2: x + Math.max(textWidth, 50), y2: y + Math.max(textHeight, fs + 8) },
        text: commentText.trim(), color: annoColor, fontSize: fs, fontFamily: textFontFamily,
      });
    } else {
      // Kommentar-Annotation erstellen (Bubble mit Tooltip)
      const x = commentPopover.svgX;
      const y = commentPopover.svgY;
      addAnnotation({
        type: 'text', page: commentPopover.page - 1,
        rect: { x1: x, y1: y, x2: x + 24, y2: y + 24 },
        text: commentText.trim(), color: annoColor,
      });
    }
    setTimeout(() => renderAnnotationsForPage(commentPopover.page), 50);
    setCommentPopover(null);
    setCommentText('');
  }, [commentPopover, commentText, annoColor, textFontSize, textFontFamily, addAnnotation, pushUndo, renderAnnotationsForPage]);

  const cancelComment = useCallback(() => {
    setCommentPopover(null);
    setCommentText('');
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !pdfDocRef.current) { setSearchResults([]); setSearchCurrentIdx(0); return; }
    const q = query.toLowerCase();
    const results: { page: number; matchIdx: number }[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const page = await pdfDocRef.current.getPage(p);
      const tc = await page.getTextContent();
      const pageText = tc.items.map((item: any) => item.str || '').join(' ').toLowerCase();
      let idx = 0;
      let matchNum = 0;
      while ((idx = pageText.indexOf(q, idx)) !== -1) {
        results.push({ page: p, matchIdx: matchNum++ });
        idx += q.length;
      }
    }
    setSearchResults(results);
    setSearchCurrentIdx(0);
    if (results.length > 0) scrollToPage(results[0].page);
    // Treffer visuell hervorheben im TextLayer
    highlightSearchInTextLayers(query);
  }, [totalPages, scrollToPage]);

  const highlightSearchInTextLayers = useCallback((query: string) => {
    // Bestehende Highlights entfernen
    document.querySelectorAll('.pdf-search-highlight').forEach(el => el.remove());
    if (!query.trim()) return;
    const q = query.toLowerCase();
    for (const entry of pageEntriesRef.current) {
      const spans = entry.textLayerDiv.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent || '';
        const lowerText = text.toLowerCase();
        let idx = 0;
        while ((idx = lowerText.indexOf(q, idx)) !== -1) {
          // Highlight-Overlay für den gefundenen Text erstellen
          const range = document.createRange();
          try {
            range.setStart(span.firstChild!, idx);
            range.setEnd(span.firstChild!, idx + q.length);
            const rects = range.getClientRects();
            const parentRect = entry.textLayerDiv.getBoundingClientRect();
            for (const r of rects) {
              const hl = document.createElement('div');
              hl.className = 'pdf-search-highlight';
              hl.style.left = (r.left - parentRect.left) + 'px';
              hl.style.top = (r.top - parentRect.top) + 'px';
              hl.style.width = r.width + 'px';
              hl.style.height = r.height + 'px';
              entry.textLayerDiv.appendChild(hl);
            }
          } catch { /* Range-Fehler ignorieren */ }
          idx += q.length;
        }
      }
    }
  }, []);

  const searchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = (searchCurrentIdx + 1) % searchResults.length;
    setSearchCurrentIdx(next);
    scrollToPage(searchResults[next].page);
  }, [searchResults, searchCurrentIdx, scrollToPage]);

  const searchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = (searchCurrentIdx - 1 + searchResults.length) % searchResults.length;
    setSearchCurrentIdx(prev);
    scrollToPage(searchResults[prev].page);
  }, [searchResults, searchCurrentIdx, scrollToPage]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchCurrentIdx(0);
    document.querySelectorAll('.pdf-search-highlight').forEach(el => el.remove());
  }, []);

  const submitPassword = useCallback(async () => {
    if (!passwordPrompt || !passwordText) return;
    try {
      const pdfjsLib = await loadPdfjs();
      const pdfDoc = await pdfjsLib.getDocument({ data: passwordPrompt.data, password: passwordText }).promise;
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
      if (info.title) parts.push(info.title);
      if (info.author) parts.push(`von ${info.author}`);
      if (!info.isTextSearchable) parts.push('OCR empfohlen');
      setInfoText(parts.join(' \u2022 '));
      setLoaded(true);
      setError('');
      setPasswordPrompt(null);
      setPasswordText('');
    } catch (err: any) {
      if (err?.name === 'PasswordException') {
        showToast('Falsches Passwort', 'error');
      } else {
        setError(err.message);
        setPasswordPrompt(null);
        setPasswordText('');
      }
    }
  }, [passwordPrompt, passwordText, filePath, showToast]);

  const startImageInsert = useCallback(async () => {
    try {
      const result = await api.showSaveDialog({
        title: 'Bild auswählen', open: true,
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
      });
      if (!result || result.canceled || !result.path) return;
      // Bild als Base64 lesen
      const binResult = await api.readFileBinary(result.path);
      if ((binResult as any).error) throw new Error((binResult as any).error);
      const base64 = `data:image/png;base64,${(binResult as any).data}`;
      setImageInsertData({ base64, name: result.path.split(/[\\/]/).pop() || 'Bild' });
      setShowImageInsert(true);
      showToast('Klicke auf die Seite um das Bild zu platzieren', 'info');
    } catch (err: any) {
      showToast('Bild laden fehlgeschlagen: ' + err.message, 'error');
    }
  }, [showToast]);

  const placeImageOnPage = useCallback(async (pageNum: number, x: number, y: number) => {
    if (!imageInsertData || !filePath) return;
    const s = scaleRef.current;
    // Bild standardmäßig 150x150 PDF-Punkte (kann später skaliert werden)
    const imgSize = 150;
    const rect = { x1: x / s, y1: y / s, x2: (x / s) + imgSize, y2: (y / s) + imgSize };
    try {
      await api.pdfAddImage(filePath, filePath, pageNum - 1, imageInsertData.base64, rect);
      setShowImageInsert(false);
      setImageInsertData(null);
      // PDF neu laden um das eingefügte Bild zu sehen
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
      showToast('Bild eingefügt', 'success');
    } catch (err: any) {
      showToast('Bild einfügen fehlgeschlagen: ' + err.message, 'error');
    }
  }, [imageInsertData, filePath, showToast]);
  useEffect(() => { placeImageOnPageRef.current = placeImageOnPage; }, [placeImageOnPage]);

  const handleThumbDrop = useCallback(async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    // Neue Reihenfolge berechnen
    const order = Array.from({ length: totalPages }, (_, i) => i);
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    try {
      await api.pdfReorderPages(filePath, filePath, order);
      setAnnotations([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setSelectedAnnoIdx(null);
      setUnsavedChanges(false);
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
      showToast(`Seite ${fromIdx + 1} verschoben`, 'success');
    } catch (err: any) {
      showToast('Umsortieren fehlgeschlagen: ' + err.message, 'error');
    }
  }, [filePath, totalPages, showToast]);

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

  const tools: { id: typeof currentTool; label: string; icon: string }[] = [
    { id: 'select', label: 'Auswählen', icon: '\u2B11' },
    { id: 'highlight', label: 'Markieren', icon: '\uD83D\uDD8D' },
    { id: 'textbox', label: 'Text', icon: 'T' },
    { id: 'comment', label: 'Kommentar', icon: '\uD83D\uDCAC' },
    { id: 'freehand', label: 'Freihand', icon: '\u270F\uFE0F' },
  ];

  const shapeTools: { id: typeof currentTool; label: string; icon: string }[] = [
    { id: 'shape-rect', label: 'Rechteck', icon: '\u25A1' },
    { id: 'shape-ellipse', label: 'Ellipse', icon: '\u25CB' },
    { id: 'shape-line', label: 'Linie', icon: '\u2571' },
    { id: 'shape-arrow', label: 'Pfeil', icon: '\u2192' },
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
          <button className="pdf-editor-btn" onClick={() => setShowPrintDialog(true)} title="Drucken (Strg+P)">Drucken</button>
          <button className="pdf-editor-btn" onClick={() => setShowOcr(true)} title="OCR-Texterkennung">OCR</button>
          <button className="pdf-editor-btn" onClick={startImageInsert} title="Bild auf Seite einfügen">Bild einfügen</button>
          <button className="pdf-editor-btn" onClick={() => { setMergeFiles([filePath]); setShowMerge(true); }} title="PDF zusammenfügen">Zusammenfügen</button>
          {bookmarks.length > 0 && <button className={`pdf-editor-btn ${showBookmarks ? 'active' : ''}`} onClick={() => setShowBookmarks(b => !b)} title="Inhaltsverzeichnis">Lesezeichen</button>}
          {!onClose && <button className="pdf-editor-btn" onClick={detachWindow} title="In eigenem Fenster öffnen">Fenster lösen</button>}
        </div>
      </div>

      {showSearch && (
        <div className="pdf-search-bar">
          <input type="text" className="pdf-search-input" value={searchQuery} autoFocus
            placeholder="Im Dokument suchen..."
            onChange={e => { setSearchQuery(e.target.value); performSearch(e.target.value); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) searchNext();
              if (e.key === 'Enter' && e.shiftKey) searchPrev();
              if (e.key === 'Escape') closeSearch();
              e.stopPropagation();
            }}
          />
          <span className="pdf-search-count">
            {searchResults.length > 0 ? `${searchCurrentIdx + 1}/${searchResults.length}` : searchQuery ? '0 Treffer' : ''}
          </span>
          <button className="pdf-editor-btn" onClick={searchPrev} disabled={searchResults.length === 0} title="Vorheriger Treffer (Shift+Enter)">{'\u25B2'}</button>
          <button className="pdf-editor-btn" onClick={searchNext} disabled={searchResults.length === 0} title="Nächster Treffer (Enter)">{'\u25BC'}</button>
          <button className="pdf-editor-btn" onClick={closeSearch} title="Suche schließen (Esc)">{'\u2715'}</button>
        </div>
      )}

      <div className="pdf-editor-body">
        <div className="pdf-editor-thumbnails">
          {showBookmarks && bookmarks.length > 0 ? (
            <div className="pdf-bookmarks-panel">
              <BookmarkTree bookmarks={bookmarks} onNavigate={(page) => { if (page !== null && page !== undefined) scrollToPage(page + 1); }} />
            </div>
          ) : (
            Array.from({ length: totalPages }, (_, i) => (
              <div key={i}
                className={`pdf-thumb ${currentPage === i + 1 ? 'pdf-thumb-active' : ''} ${thumbDragIdx === i ? 'pdf-thumb-dragging' : ''} ${thumbDropIdx === i ? 'pdf-thumb-drop-target' : ''}`}
                draggable
                onClick={() => scrollToPage(i + 1)}
                onDragStart={() => setThumbDragIdx(i)}
                onDragOver={(e) => { e.preventDefault(); setThumbDropIdx(i); }}
                onDragLeave={() => setThumbDropIdx(null)}
                onDrop={() => { if (thumbDragIdx !== null) handleThumbDrop(thumbDragIdx, i); setThumbDragIdx(null); setThumbDropIdx(null); }}
                onDragEnd={() => { setThumbDragIdx(null); setThumbDropIdx(null); }}
              >
                <ThumbCanvas pdfDoc={pdfDocRef.current} pageNum={i + 1} />
                <span className="pdf-thumb-num">{i + 1}</span>
              </div>
            ))
          )}
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
        <span className="pdf-editor-separator" />
        {/* Formen-Picker */}
        <div className="pdf-tool-dropdown-wrap">
          <button className={`pdf-editor-tool ${currentTool.startsWith('shape-') ? 'active' : ''}`}
            onClick={() => setShowShapePicker(p => !p)} title="Formen">
            <span className="pdf-tool-icon">{'\u25A1'}</span>
            <span className="pdf-tool-label">Formen {'\u25BE'}</span>
          </button>
          {showShapePicker && (
            <div className="pdf-tool-dropdown">
              {shapeTools.map(st => (
                <button key={st.id} className={`pdf-tool-dropdown-item ${currentTool === st.id ? 'active' : ''}`}
                  onClick={() => { setCurrentTool(st.id); setShowShapePicker(false); }}>
                  <span>{st.icon}</span> {st.label}
                </button>
              ))}
              <span className="pdf-editor-separator" />
              <button className={`pdf-tool-dropdown-item ${shapeFilled ? 'active' : ''}`}
                onClick={() => setShapeFilled(f => !f)}>
                {shapeFilled ? '\u25A0 Gefüllt' : '\u25A1 Nur Umriss'}
              </button>
            </div>
          )}
        </div>
        {/* Stempel-Picker */}
        <div className="pdf-tool-dropdown-wrap">
          <button className={`pdf-editor-tool ${currentTool === 'stamp' ? 'active' : ''}`}
            onClick={() => setShowStampPicker(p => !p)} title="Stempel">
            <span className="pdf-tool-icon">{'\u2713'}</span>
            <span className="pdf-tool-label">Stempel {'\u25BE'}</span>
          </button>
          {showStampPicker && (
            <div className="pdf-tool-dropdown">
              {STAMPS.map(st => (
                <button key={st.id} className={`pdf-tool-dropdown-item ${activeStamp === st.id ? 'active' : ''}`}
                  onClick={() => { setActiveStamp(st.id); setCurrentTool('stamp'); setShowStampPicker(false); }}>
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Signatur */}
        <button className={`pdf-editor-tool ${currentTool === 'signature' ? 'active' : ''}`}
          onClick={() => {
            if (pendingSignature) { setCurrentTool('signature'); }
            else { setShowSignaturePad(true); }
          }} title="Unterschrift">
          <span className="pdf-tool-icon">{'\u270D'}</span>
          <span className="pdf-tool-label">Signatur</span>
        </button>
        {/* Wasserzeichen */}
        <button className="pdf-editor-tool" onClick={() => setShowWatermarkDialog(true)} title="Wasserzeichen">
          <span className="pdf-tool-icon">{'\uD83D\uDCA7'}</span>
          <span className="pdf-tool-label">Wasserzeichen</span>
        </button>
        <span className="pdf-editor-separator" />
        {/* Farbe — für alle Zeichenwerkzeuge */}
        {(currentTool === 'highlight' || currentTool === 'freehand' || currentTool === 'textbox' || currentTool === 'comment' || currentTool.startsWith('shape-') || currentTool === 'stamp') && (
          <>
            {ANNO_COLORS.map(c => (
              <button key={c.hex} className={`pdf-color-swatch ${annoColor === c.hex ? 'active' : ''}`}
                style={{ background: c.hex }} title={c.label}
                onClick={() => setAnnoColor(c.hex)} />
            ))}
            <span className="pdf-editor-separator" />
          </>
        )}
        {/* Strichstärke — Freihand + Formen */}
        {(currentTool === 'freehand' || currentTool.startsWith('shape-')) && (
          <>
            {[1, 2, 4].map(w => (
              <button key={w} className={`pdf-stroke-btn ${strokeWidth === w ? 'active' : ''}`}
                onClick={() => setStrokeWidth(w)} title={`${w}px`}>
                <span className="pdf-stroke-preview" style={{ height: w }} />
              </button>
            ))}
            <span className="pdf-editor-separator" />
          </>
        )}
        {selectedAnnoIdx !== null && (
          <>
            <button className="pdf-editor-btn pdf-editor-btn-danger" onClick={deleteSelectedAnnotation} title="Ausgewählte Annotation löschen (Entf)">Löschen</button>
            <span className="pdf-editor-separator" />
          </>
        )}
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))} title="Verkleinern (-)">{'\u2212'}</button>
        <span className="pdf-editor-zoom-info">{Math.round(scale * 100)}%</span>
        <button className="pdf-editor-btn" onClick={() => setScale(s => Math.min(s + 0.25, 3.0))} title="Vergrößern (+)">+</button>
        <span className="pdf-editor-separator" />
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

      {/* Druck-Dialog */}
      {showPrintDialog && (
        <div className="pdf-editor-dialog-overlay">
          <div className="pdf-editor-dialog">
            <h3>Drucken</h3>
            <p>Seitenbereich eingeben oder leer lassen für alle Seiten.</p>
            <input type="text" className="pdf-print-range-input" value={printRange} autoFocus
              placeholder={`z.B. 1-3, 5, 7-${totalPages}`}
              onChange={e => setPrintRange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handlePrintRange();
                if (e.key === 'Escape') setShowPrintDialog(false);
                e.stopPropagation();
              }}
            />
            <div className="pdf-editor-dialog-btns">
              <button className="pdf-editor-btn" onClick={handlePrintRange}>Drucken</button>
              <button className="pdf-editor-btn" onClick={() => { handlePrint(); setShowPrintDialog(false); }}>Alle Seiten drucken</button>
              <button className="pdf-editor-btn" onClick={() => setShowPrintDialog(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
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
          onReorder={(from, to) => {
            setMergeFiles(prev => {
              const next = [...prev];
              const [item] = next.splice(from, 1);
              next.splice(to, 0, item);
              return next;
            });
          }}
          onRemoveFile={(idx) => setMergeFiles(prev => prev.filter((_, i) => i !== idx))}
        />
      )}

      {/* Comment Popover — Viewport-Clamping */}
      {commentPopover && (
        <div className="pdf-comment-popover" style={{
          left: Math.min(commentPopover.x, window.innerWidth - 280),
          top: Math.min(commentPopover.y, window.innerHeight - (commentPopover.mode === 'textbox' ? 180 : 120)),
        }}>
          {commentPopover.mode === 'textbox' && (
            <>
              <div className="pdf-popover-font-row">
                <label className="pdf-popover-font-label">Schrift:</label>
                <select className="pdf-font-select" title="Schriftart" value={textFontFamily} onChange={e => setTextFontFamily(e.target.value)}>
                  {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div className="pdf-popover-font-row">
                <label className="pdf-popover-font-label">Größe:</label>
                {[10, 12, 14, 18, 24, 32].map(fs => (
                  <button key={fs} type="button" className={`pdf-font-size-btn ${textFontSize === fs ? 'active' : ''}`}
                    onClick={() => setTextFontSize(fs)}>{fs}</button>
                ))}
              </div>
            </>
          )}
          <textarea
            className="pdf-comment-textarea"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            autoFocus
            placeholder={commentPopover.mode === 'textbox' ? 'Text eingeben...' : 'Kommentar eingeben...'}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && commentPopover.mode !== 'textbox') { e.preventDefault(); submitComment(); }
              if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); submitComment(); }
              if (e.key === 'Escape') cancelComment();
              e.stopPropagation();
            }}
          />
          {commentPopover.mode === 'textbox' && (
            <div className="pdf-popover-hint">Strg+Enter zum Bestätigen, Shift+Enter für neue Zeile</div>
          )}
          <div className="pdf-comment-popover-btns">
            <button className="pdf-editor-btn" onClick={submitComment}>OK</button>
            <button className="pdf-editor-btn" onClick={cancelComment}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* Passwort-Dialog für geschützte PDFs */}
      {passwordPrompt && (
        <div className="pdf-editor-dialog-overlay">
          <div className="pdf-editor-dialog">
            <h3>Passwortgeschützte PDF</h3>
            <p>Diese PDF-Datei ist passwortgeschützt. Bitte Passwort eingeben:</p>
            <input type="password" className="pdf-password-input" value={passwordText} autoFocus
              placeholder="Passwort eingeben..."
              onChange={e => setPasswordText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitPassword();
                if (e.key === 'Escape') { setPasswordPrompt(null); setPasswordText(''); setError('PDF ist passwortgeschützt'); }
                e.stopPropagation();
              }}
            />
            <div className="pdf-editor-dialog-btns">
              <button className="pdf-editor-btn" onClick={submitPassword}>Öffnen</button>
              <button className="pdf-editor-btn" onClick={() => { setPasswordPrompt(null); setPasswordText(''); setError('PDF ist passwortgeschützt'); }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Signatur-Pad Dialog */}
      {showSignaturePad && (
        <SignaturePadDialog
          savedSignatures={savedSignatures}
          onAccept={(paths) => {
            setPendingSignature(paths);
            // Signatur speichern (max 5)
            const updated = [paths, ...savedSignatures].slice(0, 5);
            setSavedSignatures(updated);
            try { localStorage.setItem('pdf-signatures', JSON.stringify(updated)); } catch { /* voll */ }
            setShowSignaturePad(false);
            setCurrentTool('signature');
            showToast('Klicke auf die Seite um die Signatur zu platzieren', 'info');
          }}
          onSelectSaved={(paths) => {
            setPendingSignature(paths);
            setShowSignaturePad(false);
            setCurrentTool('signature');
            showToast('Klicke auf die Seite um die Signatur zu platzieren', 'info');
          }}
          onClose={() => setShowSignaturePad(false)}
        />
      )}

      {/* Wasserzeichen-Dialog */}
      {showWatermarkDialog && (
        <WatermarkDialog
          current={watermark}
          onApply={(wm) => { setWatermark(wm); setShowWatermarkDialog(false); }}
          onRemove={() => { setWatermark(null); setShowWatermarkDialog(false); }}
          onClose={() => setShowWatermarkDialog(false)}
        />
      )}
    </div>
  );
}

function BookmarkTree({ bookmarks, onNavigate }: { bookmarks: any[]; onNavigate: (page: number | null) => void }) {
  return (
    <ul className="pdf-bookmark-list">
      {bookmarks.map((bm, i) => (
        <li key={i}>
          <button className="pdf-bookmark-item" onClick={() => onNavigate(bm.page)} title={bm.page !== null ? `Seite ${bm.page + 1}` : ''}>
            {bm.title || '(Ohne Titel)'}
          </button>
          {bm.children && bm.children.length > 0 && (
            <BookmarkTree bookmarks={bm.children} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ThumbCanvas({ pdfDoc, pageNum }: { pdfDoc: any; pageNum: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 0.2 });
      const canvas = canvasRef.current!;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);
  return <canvas ref={canvasRef} className="pdf-thumb-canvas" />;
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

function MergeDialog({ files, onAddFile, onMerge, onClose, onReorder, onRemoveFile }: {
  files: string[];
  onAddFile: () => void;
  onMerge: () => void;
  onClose: () => void;
  onReorder: (from: number, to: number) => void;
  onRemoveFile: (index: number) => void;
}) {
  return (
    <div className="pdf-editor-dialog-overlay">
      <div className="pdf-editor-dialog">
        <h3>PDFs zusammenfügen</h3>
        <p>Reihenfolge festlegen und zusammenfügen. Das erste Dokument ist die aktuelle PDF.</p>
        <div className="merge-file-list">
          {files.map((f, i) => (
            <div key={i} className="merge-file-item">
              <span className="merge-file-num">{i + 1}.</span>
              <span className="merge-file-name" title={f}>{f.split(/[\\/]/).pop()}</span>
              <span className="merge-file-actions">
                <button className="merge-file-btn" disabled={i === 0} onClick={() => onReorder(i, i - 1)} title="Nach oben">{'\u25B2'}</button>
                <button className="merge-file-btn" disabled={i === files.length - 1} onClick={() => onReorder(i, i + 1)} title="Nach unten">{'\u25BC'}</button>
                <button className="merge-file-btn merge-file-btn-remove" onClick={() => onRemoveFile(i)} title="Entfernen">{'\u2715'}</button>
              </span>
            </div>
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

function SignaturePadDialog({ savedSignatures, onAccept, onSelectSaved, onClose }: {
  savedSignatures: Point[][][];
  onAccept: (paths: Point[][]) => void;
  onSelectSaved: (paths: Point[][]) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathsRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of [...pathsRef.current, currentPathRef.current]) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getPoint = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: MouseEvent) => {
      drawingRef.current = true;
      currentPathRef.current = [getPoint(e)];
    };
    const onMove = (e: MouseEvent) => {
      if (!drawingRef.current) return;
      currentPathRef.current.push(getPoint(e));
      redraw();
    };
    const onUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (currentPathRef.current.length > 2) {
        pathsRef.current = [...pathsRef.current, currentPathRef.current];
      }
      currentPathRef.current = [];
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
    };
  }, [redraw]);

  return (
    <div className="pdf-editor-dialog-overlay">
      <div className="pdf-editor-dialog pdf-signature-dialog">
        <h3>Unterschrift erstellen</h3>
        <p>Unterschreibe mit der Maus im Feld unten.</p>
        <canvas ref={canvasRef} width={400} height={150} className="pdf-signature-canvas" />
        <div className="pdf-editor-dialog-btns">
          <button type="button" className="pdf-editor-btn" onClick={() => {
            if (pathsRef.current.length === 0) return;
            onAccept(pathsRef.current);
          }}>Übernehmen</button>
          <button type="button" className="pdf-editor-btn" onClick={() => {
            pathsRef.current = [];
            currentPathRef.current = [];
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }}>Löschen</button>
          <button type="button" className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
        </div>
        {savedSignatures.length > 0 && (
          <div className="pdf-saved-signatures">
            <p className="pdf-saved-sig-label">Gespeicherte Signaturen:</p>
            <div className="pdf-saved-sig-list">
              {savedSignatures.map((sig, i) => (
                <button key={i} type="button" className="pdf-saved-sig-btn" onClick={() => onSelectSaved(sig)}
                  title={`Signatur ${i + 1} verwenden`}>
                  <SignaturePreview paths={sig} width={80} height={30} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignaturePreview({ paths, width, height }: { paths: Point[][]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paths.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    // Bounds berechnen und skalieren
    const allPts = paths.flat();
    const bounds = pathBounds(allPts);
    const bw = bounds.x2 - bounds.x1 || 1;
    const bh = bounds.y2 - bounds.y1 || 1;
    const sx = (width - 8) / bw;
    const sy = (height - 4) / bh;
    const s = Math.min(sx, sy);
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const path of paths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(4 + (path[0].x - bounds.x1) * s, 2 + (path[0].y - bounds.y1) * s);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(4 + (path[i].x - bounds.x1) * s, 2 + (path[i].y - bounds.y1) * s);
      }
      ctx.stroke();
    }
  }, [paths, width, height]);
  return <canvas ref={canvasRef} width={width} height={height} className="pdf-sig-preview-canvas" />;
}

function WatermarkDialog({ current, onApply, onRemove, onClose }: {
  current: { text: string; fontSize: number; color: string; opacity: number; rotation: number } | null;
  onApply: (wm: { text: string; fontSize: number; color: string; opacity: number; rotation: number }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(current?.text || 'VERTRAULICH');
  const [fontSize, setFontSize] = useState(current?.fontSize || 60);
  const [color, setColor] = useState(current?.color || '#888888');
  const [opacity, setOpacity] = useState(current?.opacity || 0.15);
  const [rotation, setRotation] = useState(current?.rotation || -30);

  return (
    <div className="pdf-editor-dialog-overlay">
      <div className="pdf-editor-dialog">
        <h3>Wasserzeichen</h3>
        <div className="pdf-watermark-form">
          <label>Text: <input type="text" value={text} onChange={e => setText(e.target.value)} className="pdf-wm-input" /></label>
          <label>Schriftgröße: <input type="number" value={fontSize} min={10} max={200} onChange={e => setFontSize(Number(e.target.value))} className="pdf-wm-num" /></label>
          <label>Farbe: <input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
          <label>Transparenz: <input type="range" min={0.05} max={0.5} step={0.05} value={opacity}
            onChange={e => setOpacity(Number(e.target.value))} title={`${Math.round(opacity * 100)}%`} /> {Math.round(opacity * 100)}%</label>
          <label>Drehung: <input type="range" min={-90} max={90} step={5} value={rotation}
            onChange={e => setRotation(Number(e.target.value))} title={`${rotation}°`} /> {rotation}°</label>
        </div>
        <div className="pdf-editor-dialog-btns">
          <button type="button" className="pdf-editor-btn" onClick={() => onApply({ text, fontSize, color, opacity, rotation })}>Anwenden</button>
          {current && <button type="button" className="pdf-editor-btn" onClick={onRemove}>Entfernen</button>}
          <button type="button" className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
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

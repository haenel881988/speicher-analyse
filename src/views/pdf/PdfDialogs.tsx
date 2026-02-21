import { useState, useRef, useEffect, useCallback } from 'react';
import type { Point } from './types';
import { OCR_LANGUAGES } from './constants';
import { pathBounds } from './utils';

export function OcrDialog({ onClose, onRun, progress }: {
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
          <button type="button" className="pdf-editor-btn" disabled={progress.running} onClick={() => onRun(lang, false)}>Aktuelle Seite</button>
          <button type="button" className="pdf-editor-btn" disabled={progress.running} onClick={() => onRun(lang, true)}>Alle Seiten</button>
          <button type="button" className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
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

export function MergeDialog({ files, onAddFile, onMerge, onClose, onReorder, onRemoveFile }: {
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
                <button type="button" className="merge-file-btn" disabled={i === 0} onClick={() => onReorder(i, i - 1)} title="Nach oben">{'\u25B2'}</button>
                <button type="button" className="merge-file-btn" disabled={i === files.length - 1} onClick={() => onReorder(i, i + 1)} title="Nach unten">{'\u25BC'}</button>
                <button type="button" className="merge-file-btn merge-file-btn-remove" onClick={() => onRemoveFile(i)} title="Entfernen">{'\u2715'}</button>
              </span>
            </div>
          ))}
        </div>
        <div className="pdf-editor-dialog-btns">
          <button type="button" className="pdf-editor-btn" onClick={onAddFile}>PDF hinzufügen...</button>
          <button type="button" className="pdf-editor-btn" disabled={files.length < 2} onClick={onMerge}>Zusammenfügen</button>
          <button type="button" className="pdf-editor-btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

export function SignaturePreview({ paths, width, height }: { paths: Point[][]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paths.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
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

export function SignaturePadDialog({ savedSignatures, onAccept, onSelectSaved, onClose }: {
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

export function WatermarkDialog({ current, onApply, onRemove, onClose }: {
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

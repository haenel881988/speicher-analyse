import type { Point, Rect, StampType } from './types';
import { STAMPS } from './constants';

export function normalizeRect(p1: Point, p2: Point): Rect {
  return { x1: Math.min(p1.x, p2.x), y1: Math.min(p1.y, p2.y), x2: Math.max(p1.x, p2.x), y2: Math.max(p1.y, p2.y) };
}

export function pathBounds(path: Point[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of path) { if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y; if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y; }
  return { x1, y1, x2, y2 };
}

export function getStampLabel(stampId: StampType): string {
  const stamp = STAMPS.find(s => s.id === stampId);
  if (!stamp) return stampId;
  return typeof stamp.label === 'function' ? stamp.label() : stamp.label;
}

// Lazy pdf.js loader — Worker aus public/ (statisch, ohne Vite-Transformation)
let _pdfjsLib: any = null;
export async function loadPdfjs(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  // Worker liegt in src/public/pdf.worker.min.mjs — wird von Vite unverändert ausgeliefert
  _pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return _pdfjsLib;
}

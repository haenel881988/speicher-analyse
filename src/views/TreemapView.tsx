import { useState, useCallback, useRef, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface TreemapItem {
  name: string;
  path: string;
  size: number;
  own_size: number;
  dir_count: number;
  file_count: number;
  is_own_files?: boolean;
  children?: TreemapItem[];
}

interface Rect { x: number; y: number; w: number; h: number; item: TreemapItem; }

const COLORS = [
  '#6c5ce7', '#e94560', '#4ecca3', '#00b4d8', '#ffc107',
  '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6',
  '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#06b6d4',
];

export default function TreemapView() {
  const { currentScanId, currentPath } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rootPath, setRootPath] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [cells, setCells] = useState<Rect[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: TreemapItem; pct: string } | null>(null);

  const renderTreemap = useCallback(async (path: string) => {
    if (!currentScanId || !containerRef.current) return;
    setRootPath(path);

    const data = await api.getTreemapData(currentScanId, path, 2);
    if (data.error) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const items: TreemapItem[] = [];
    if (data.children) {
      for (const child of data.children) {
        if (child.size > 0) items.push(child);
      }
    }
    if (data.own_size > 0) {
      items.push({
        name: '[Dateien in diesem Ordner]',
        path, size: data.own_size, own_size: data.own_size,
        is_own_files: true, dir_count: 0, file_count: data.file_count,
      });
    }

    if (items.length === 0) { setCells([]); setTotalSize(0); return; }

    items.sort((a, b) => b.size - a.size);
    const rects = squarify(items, { x: 0, y: 0, w: width, h: height }, data.size);
    setCells(rects);
    setTotalSize(data.size);
  }, [currentScanId]);

  // Init on scanId/path change
  useEffect(() => {
    if (currentScanId && currentPath) {
      setHistory([currentPath]);
      renderTreemap(currentPath);
    }
  }, [currentScanId, currentPath, renderTreemap]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (rootPath) renderTreemap(rootPath);
      }, 200);
    });
    observer.observe(el);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [rootPath, renderTreemap]);

  const navigateTo = (path: string) => {
    setHistory(prev => [...prev, path]);
    renderTreemap(path);
  };

  const navigateBreadcrumb = (index: number) => {
    const newHistory = history.slice(0, index + 1);
    setHistory(newHistory);
    renderTreemap(newHistory[newHistory.length - 1]);
  };

  return (
    <>
      {/* Breadcrumb */}
      <div className="treemap-breadcrumb">
        {history.map((p, i) => {
          const name = p.split(/[/\\]/).filter(Boolean).pop() || p;
          return (
            <span key={i}>
              {i > 0 && <span className="breadcrumb-sep">{'\u203A'}</span>}
              {i === history.length - 1 ? (
                <span className="breadcrumb-current">{name}</span>
              ) : (
                <span className="breadcrumb-item" style={{ cursor: 'pointer' }} onClick={() => navigateBreadcrumb(i)}>{name}</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Treemap container */}
      <div
        ref={containerRef}
        className="treemap-container"
        style={{ position: 'relative', flex: 1, minHeight: 200 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {cells.length === 0 && !currentScanId && (
          <div className="tool-placeholder">Bitte zuerst ein Laufwerk scannen</div>
        )}
        {cells.length === 0 && currentScanId && (
          <div className="welcome-state">
            <div className="welcome-icon">&#128194;</div>
            <div className="welcome-title">Leerer Ordner</div>
          </div>
        )}
        {cells.map((r, i) => {
          const pct = totalSize > 0 ? (r.item.size / totalSize * 100).toFixed(1) : '0';
          return (
            <div
              key={i}
              className="treemap-cell"
              style={{
                position: 'absolute',
                left: r.x, top: r.y,
                width: Math.max(r.w, 0), height: Math.max(r.h, 0),
                background: COLORS[i % COLORS.length],
                borderRadius: 3,
                cursor: (!r.item.is_own_files && r.item.dir_count > 0) ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (!r.item.is_own_files && r.item.dir_count > 0) navigateTo(r.item.path);
              }}
              onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, item: r.item, pct })}
              onMouseMove={(e) => setTooltip(prev => prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : null)}
              onMouseLeave={() => setTooltip(null)}
            >
              {r.w > 50 && r.h > 25 && (
                <div className="treemap-label">
                  {r.item.name}
                  {r.w > 80 && r.h > 40 && (
                    <span className="treemap-label-size">{formatBytes(r.item.size)} ({pct}%)</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="treemap-tooltip" style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, display: 'block', zIndex: 1000 }}>
          <div id="tooltip-name" style={{ fontWeight: 'bold' }}>{tooltip.item.name}</div>
          <div id="tooltip-detail">
            Größe: <strong>{formatBytes(tooltip.item.size)}</strong> ({tooltip.pct}%)
            {tooltip.item.dir_count > 0 && <><br />Ordner: {tooltip.item.dir_count}</>}
            {tooltip.item.file_count > 0 && <><br />Dateien: {tooltip.item.file_count}</>}
            <br /><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tooltip.item.path}</span>
          </div>
        </div>
      )}
    </>
  );
}

// Squarified treemap layout
function squarify(items: TreemapItem[], rect: { x: number; y: number; w: number; h: number }, totalSize: number): Rect[] {
  const result: Rect[] = [];
  if (items.length === 0 || totalSize <= 0) return result;

  let remaining = [...items];
  let currentRect = { ...rect };

  while (remaining.length > 0) {
    const isWide = currentRect.w >= currentRect.h;
    const side = isWide ? currentRect.h : currentRect.w;
    if (side <= 0) break;

    let row = [remaining[0]];
    remaining = remaining.slice(1);
    let bestRatio = worstRatio(row, side, totalSize, rect);

    while (remaining.length > 0) {
      const candidate = [...row, remaining[0]];
      const candidateRatio = worstRatio(candidate, side, totalSize, rect);
      if (candidateRatio <= bestRatio) {
        row.push(remaining[0]);
        remaining = remaining.slice(1);
        bestRatio = candidateRatio;
      } else break;
    }

    let rowSize = 0;
    for (const item of row) rowSize += item.size;
    const rowArea = (rowSize / totalSize) * (rect.w * rect.h);
    const rowThickness = isWide ? (rowArea / currentRect.h) : (rowArea / currentRect.w);

    let offset = 0;
    for (const item of row) {
      const itemArea = (item.size / totalSize) * (rect.w * rect.h);
      const itemLength = rowThickness > 0 ? itemArea / rowThickness : 0;
      result.push(isWide
        ? { x: currentRect.x, y: currentRect.y + offset, w: rowThickness, h: itemLength, item }
        : { x: currentRect.x + offset, y: currentRect.y, w: itemLength, h: rowThickness, item }
      );
      offset += itemLength;
    }

    if (isWide) { currentRect.x += rowThickness; currentRect.w -= rowThickness; }
    else { currentRect.y += rowThickness; currentRect.h -= rowThickness; }
  }
  return result;
}

function worstRatio(row: TreemapItem[], side: number, totalSize: number, rect: { w: number; h: number }): number {
  const totalArea = rect.w * rect.h;
  let rowSum = 0;
  for (const item of row) rowSum += item.size;
  const rowArea = (rowSum / totalSize) * totalArea;
  if (rowArea <= 0 || side <= 0) return Infinity;
  const rowThickness = rowArea / side;
  let worst = 0;
  for (const item of row) {
    const itemArea = (item.size / totalSize) * totalArea;
    const itemLength = rowThickness > 0 ? itemArea / rowThickness : 0;
    const ratio = itemLength > rowThickness ? itemLength / rowThickness : rowThickness / itemLength;
    worst = Math.max(worst, ratio);
  }
  return worst;
}

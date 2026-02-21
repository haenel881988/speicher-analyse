import { memo } from 'react';
import type { Annotation, StampType } from './types';
import { getStampLabel } from './utils';

interface Props {
  annotations: Annotation[];
  pageIndex: number; // 0-based (matches Annotation.page)
  scale: number;
  selectedAnnoIdx: number | null;
  watermark: { text: string; fontSize: number; color: string; opacity: number; rotation: number } | null;
  viewportWidth: number;
  viewportHeight: number;
  currentTool: string;
}

function AnnotationElement({ anno, globalIdx, scale, isSelected, currentTool }: {
  anno: Annotation; globalIdx: number; scale: number; isSelected: boolean; currentTool: string;
}) {
  const s = scale;
  // In select mode: annotations are clickable individually (SVG has pointer-events: none)
  const annoPointer = currentTool === 'select' ? 'auto' : undefined;

  if (anno.type === 'highlight' && anno.rect) {
    return (
      <rect
        className={isSelected ? 'anno-selected' : undefined}
        data-anno-idx={globalIdx}
        x={anno.rect.x1 * s} y={anno.rect.y1 * s}
        width={(anno.rect.x2 - anno.rect.x1) * s}
        height={(anno.rect.y2 - anno.rect.y1) * s}
        fill={(anno.color || '#FFFF00') + '40'}
        stroke="none"
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}
      />
    );
  }

  if (anno.type === 'text' && anno.rect) {
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}>
        <circle cx={anno.rect.x1 * s + 12} cy={anno.rect.y1 * s + 12} r={10}
          fill={anno.color || '#FFD700'} stroke="#333" strokeWidth={1} />
        <text x={anno.rect.x1 * s + 12} y={anno.rect.y1 * s + 17}
          textAnchor="middle" fontSize={14} fontWeight="bold" fill="#333">i</text>
        <title>{anno.text || ''}</title>
      </g>
    );
  }

  if (anno.type === 'freetext' && anno.text) {
    const fs = (anno.fontSize || 14) * s;
    const lines = anno.text.split('\n');
    const lineHeight = fs * 1.3;
    const textWidth = Math.max(...lines.map(l => l.length)) * fs * 0.55 + 12 * s;
    const textHeight = lines.length * lineHeight + 8 * s;
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}>
        <rect
          x={anno.rect.x1 * s} y={anno.rect.y1 * s}
          width={Math.max(textWidth, 50 * s)} height={Math.max(textHeight, fs + 8 * s)}
          fill="rgba(255,255,255,0.9)" stroke={(anno.color || '#333') + '80'} strokeWidth={1} rx={3 * s}
        />
        {lines.map((line, li) => (
          <text key={li}
            x={anno.rect.x1 * s + 6 * s} y={anno.rect.y1 * s + fs + li * lineHeight + 2 * s}
            fontSize={fs} fontFamily={anno.fontFamily || 'system-ui, -apple-system, sans-serif'}
            fill={anno.color || '#333'}>{line}</text>
        ))}
      </g>
    );
  }

  if (anno.type === 'ink' && anno.paths) {
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ pointerEvents: annoPointer }}>
        {anno.paths.map((path, pi) => (
          <polyline key={pi}
            points={path.map(p => `${p.x * s},${p.y * s}`).join(' ')}
            fill="none" stroke={anno.color || '#FF0000'}
            strokeWidth={anno.width || 2} strokeLinecap="round" strokeLinejoin="round"
            style={{ cursor: 'pointer' }}
          />
        ))}
      </g>
    );
  }

  if (anno.type === 'shape' && anno.shapeType && anno.rect) {
    const x1 = anno.rect.x1 * s, y1 = anno.rect.y1 * s;
    const x2 = anno.rect.x2 * s, y2 = anno.rect.y2 * s;
    const w = x2 - x1, h = y2 - y1;
    const color = anno.color || '#FF0000';
    const sw = anno.width || 2;

    let shapeContent: React.ReactNode = null;
    if (anno.shapeType === 'rect') {
      shapeContent = <rect x={x1} y={y1} width={w} height={h}
        fill={anno.filled ? color + '40' : 'none'} stroke={color} strokeWidth={sw} />;
    } else if (anno.shapeType === 'ellipse') {
      shapeContent = <ellipse cx={x1 + w/2} cy={y1 + h/2} rx={w/2} ry={h/2}
        fill={anno.filled ? color + '40' : 'none'} stroke={color} strokeWidth={sw} />;
    } else if (anno.shapeType === 'line') {
      shapeContent = <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />;
    } else if (anno.shapeType === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 12 * s;
      const p1x = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const p1y = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const p2x = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const p2y = y2 - headLen * Math.sin(angle + Math.PI / 6);
      shapeContent = <>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
        <polygon points={`${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={color} />
      </>;
    }
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}>
        {shapeContent}
      </g>
    );
  }

  if (anno.type === 'stamp' && anno.stampType && anno.rect) {
    const cx = (anno.rect.x1 + anno.rect.x2) / 2 * s;
    const cy = (anno.rect.y1 + anno.rect.y2) / 2 * s;
    const rot = anno.rotation || -15;
    const sx1 = anno.rect.x1 * s, sy1 = anno.rect.y1 * s;
    const w = (anno.rect.x2 - anno.rect.x1) * s;
    const h = (anno.rect.y2 - anno.rect.y1) * s;
    const color = anno.color || '#FF0000';
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}
        transform={`rotate(${rot} ${cx} ${cy})`}>
        <rect x={sx1} y={sy1} width={w} height={h}
          fill="none" stroke={color} strokeWidth={3} rx={4} />
        <text x={sx1 + w/2} y={sy1 + h/2 + 8*s}
          textAnchor="middle" fontSize={20*s} fontWeight="bold" fill={color}
          fontFamily="system-ui, sans-serif">{getStampLabel(anno.stampType)}</text>
      </g>
    );
  }

  if (anno.type === 'signature' && anno.paths) {
    return (
      <g className={isSelected ? 'anno-selected' : undefined} data-anno-idx={globalIdx}
        style={{ cursor: 'pointer', pointerEvents: annoPointer }}>
        {anno.paths.map((path, pi) => (
          <polyline key={pi}
            points={path.map(p => `${p.x * s},${p.y * s}`).join(' ')}
            fill="none" stroke={anno.color || '#000080'}
            strokeWidth={(anno.width || 2) * s}
            strokeLinecap="round" strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }

  return null;
}

function PdfAnnotationLayerInner({ annotations, pageIndex, scale, selectedAnnoIdx, watermark, viewportWidth, viewportHeight, currentTool }: Props) {
  const pageAnnos = annotations
    .map((anno, globalIdx) => ({ anno, globalIdx }))
    .filter(({ anno }) => anno.page === pageIndex);

  return (
    <>
      {pageAnnos.map(({ anno, globalIdx }) => (
        <AnnotationElement
          key={globalIdx}
          anno={anno}
          globalIdx={globalIdx}
          scale={scale}
          isSelected={selectedAnnoIdx === globalIdx}
          currentTool={currentTool}
        />
      ))}
      {watermark && watermark.text && (
        <text
          x={viewportWidth / 2} y={viewportHeight / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={watermark.fontSize * scale} fontFamily="system-ui, sans-serif" fontWeight="bold"
          fill={watermark.color} fillOpacity={watermark.opacity}
          transform={`rotate(${watermark.rotation} ${viewportWidth / 2} ${viewportHeight / 2})`}
          pointerEvents="none"
        >{watermark.text}</text>
      )}
    </>
  );
}

export const PdfAnnotationLayer = memo(PdfAnnotationLayerInner);

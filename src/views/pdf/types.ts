export interface Point { x: number; y: number; }
export interface Rect { x1: number; y1: number; x2: number; y2: number; }
export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';
export type StampType = 'approved' | 'confidential' | 'draft' | 'copy' | 'date';

export interface Annotation {
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

export interface PageEntry {
  canvas: HTMLCanvasElement;
  textLayerDiv: HTMLDivElement;
  svg: SVGSVGElement;
  wrapper: HTMLDivElement;
  pageNum: number;
  rendered: boolean;
  textLayerObj?: any;
}

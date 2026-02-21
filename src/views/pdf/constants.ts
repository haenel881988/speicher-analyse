import type { StampType } from './types';

export const OCR_LANGUAGES = [
  { id: 'de', label: 'Deutsch' }, { id: 'en', label: 'Englisch' },
  { id: 'fr', label: 'Französisch' }, { id: 'es', label: 'Spanisch' },
  { id: 'it', label: 'Italienisch' }, { id: 'pt', label: 'Portugiesisch' },
  { id: 'nl', label: 'Niederländisch' }, { id: 'pl', label: 'Polnisch' },
  { id: 'ru', label: 'Russisch' },
];

export const ANNO_COLORS = [
  { hex: '#FFFF00', label: 'Gelb' },
  { hex: '#00FF00', label: 'Grün' },
  { hex: '#00BFFF', label: 'Blau' },
  { hex: '#FF0000', label: 'Rot' },
  { hex: '#FF8C00', label: 'Orange' },
  { hex: '#FF69B4', label: 'Pink' },
];

export const STAMPS: { id: StampType; label: string | (() => string) }[] = [
  { id: 'approved', label: 'GENEHMIGT' },
  { id: 'confidential', label: 'VERTRAULICH' },
  { id: 'draft', label: 'ENTWURF' },
  { id: 'copy', label: 'KOPIE' },
  { id: 'date', label: () => new Date().toLocaleDateString('de-DE') },
];

export const FONTS = [
  { id: 'system-ui, sans-serif', label: 'Sans-Serif' },
  { id: 'Georgia, serif', label: 'Serif' },
  { id: 'Consolas, monospace', label: 'Monospace' },
  { id: 'Segoe Script, cursive', label: 'Handschrift' },
  { id: 'Arial, sans-serif', label: 'Arial' },
  { id: 'Times New Roman, serif', label: 'Times' },
  { id: 'Verdana, sans-serif', label: 'Verdana' },
  { id: 'Courier New, monospace', label: 'Courier' },
];

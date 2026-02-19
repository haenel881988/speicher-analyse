// SVG file type icons as React components — no dangerouslySetInnerHTML
import type { ReactNode } from 'react';

// Shared SVG wrapper
function IconSvg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      {children}
    </svg>
  );
}

// File type icon content (JSX fragments)
const FILE_ICON_CONTENT: Record<string, ReactNode> = {
  pdf: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">PDF</text></>,
  document: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></>,
  spreadsheet: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="12" y1="11" x2="12" y2="19"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  audio: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>,
  archive: <><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></>,
  code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></>,
  exe: <><rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10 8 16 12 10 16"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  font: <><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></>,
  file: <><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></>,
  folder: <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>,
};

// Quick-access sidebar icon content (JSX fragments)
const QA_ICON_CONTENT: Record<string, ReactNode> = {
  desktop: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
  documents: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  downloads: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  pictures: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  videos: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>,
  drive: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
};

// Extension → icon key mapping
export const EXT_TO_ICON: Record<string, string> = {
  '.pdf': 'pdf', '.doc': 'document', '.docx': 'document', '.odt': 'document', '.rtf': 'document',
  '.txt': 'document', '.md': 'document', '.epub': 'document',
  '.xls': 'spreadsheet', '.xlsx': 'spreadsheet', '.ods': 'spreadsheet', '.csv': 'spreadsheet',
  '.ppt': 'document', '.pptx': 'document', '.odp': 'document',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.bmp': 'image',
  '.svg': 'image', '.webp': 'image', '.ico': 'image', '.tiff': 'image', '.tif': 'image',
  '.heic': 'image', '.avif': 'image', '.raw': 'image', '.psd': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio', '.ogg': 'audio',
  '.wma': 'audio', '.m4a': 'audio', '.opus': 'audio',
  '.mp4': 'video', '.avi': 'video', '.mkv': 'video', '.mov': 'video', '.wmv': 'video',
  '.flv': 'video', '.webm': 'video', '.m4v': 'video', '.mpg': 'video', '.mpeg': 'video',
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
  '.bz2': 'archive', '.xz': 'archive', '.zst': 'archive', '.cab': 'archive', '.iso': 'archive',
  '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code', '.py': 'code', '.rs': 'code',
  '.java': 'code', '.c': 'code', '.cpp': 'code', '.h': 'code', '.hpp': 'code', '.cs': 'code',
  '.go': 'code', '.rb': 'code', '.php': 'code', '.swift': 'code', '.kt': 'code',
  '.html': 'code', '.css': 'code', '.scss': 'code', '.less': 'code',
  '.json': 'code', '.xml': 'code', '.yaml': 'code', '.yml': 'code', '.toml': 'code',
  '.sql': 'code', '.sh': 'code', '.bat': 'code', '.ps1': 'code', '.vue': 'code', '.svelte': 'code',
  '.exe': 'exe', '.msi': 'exe', '.dll': 'system', '.sys': 'system', '.drv': 'system',
  '.db': 'database', '.sqlite': 'database', '.mdb': 'database', '.accdb': 'database',
  '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
  '.ini': 'system', '.cfg': 'system', '.conf': 'system', '.reg': 'system',
  '.log': 'system', '.tmp': 'system', '.bak': 'system', '.old': 'system',
  '.cache': 'system', '.dmp': 'system', '.etl': 'system',
};

/** React component for file/folder icons — replaces dangerouslySetInnerHTML */
export function FileIcon({ extension, isDirectory }: { extension?: string | null; isDirectory?: boolean }) {
  const iconKey = isDirectory ? 'folder' : (EXT_TO_ICON[(extension || '').toLowerCase()] || 'file');
  const content = FILE_ICON_CONTENT[iconKey] || FILE_ICON_CONTENT.file;
  return <IconSvg className={`icon-${iconKey}`}>{content}</IconSvg>;
}

/** React component for quick-access sidebar icons */
export function QaIcon({ name }: { name: string }) {
  const content = QA_ICON_CONTENT[name] || QA_ICON_CONTENT.documents;
  return <IconSvg>{content}</IconSvg>;
}

export const TAG_COLORS: Record<string, { label: string; hex: string }> = {
  red: { label: 'Rot', hex: '#e94560' },
  orange: { label: 'Orange', hex: '#ff8c42' },
  yellow: { label: 'Gelb', hex: '#ffc107' },
  green: { label: 'Grün', hex: '#4ecca3' },
  blue: { label: 'Blau', hex: '#00b4d8' },
  purple: { label: 'Lila', hex: '#6c5ce7' },
  gray: { label: 'Grau', hex: '#8b8fa3' },
};

const TEMP_EXTENSIONS = new Set(['.tmp', '.temp', '.bak', '.old', '.log', '.cache', '.dmp']);
const TEMP_NAMES = new Set(['thumbs.db', 'desktop.ini', '.ds_store', 'ntuser.dat.log1', 'ntuser.dat.log2']);

export function isTempFile(name: string, ext: string): boolean {
  const lower = name.toLowerCase();
  if (TEMP_NAMES.has(lower)) return true;
  if (TEMP_EXTENSIONS.has(ext)) return true;
  if (lower.startsWith('~$') || lower.startsWith('~')) return true;
  return false;
}

export function getSizeClass(size: number): string {
  if (size >= 1073741824) return 'explorer-size-xl';
  if (size >= 104857600) return 'explorer-size-lg';
  if (size >= 10485760) return 'explorer-size-md';
  return '';
}

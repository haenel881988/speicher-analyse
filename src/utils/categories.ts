export const CATEGORY_COLORS: Record<string, string> = {
  // German labels (UI)
  'Video': '#e94560',
  'Audio': '#a855f7',
  'Bild': '#4ecca3',
  'Dokument': '#00b4d8',
  'Archiv': '#ffc107',
  'Code': '#6c5ce7',
  'Datenbank': '#f97316',
  'Programm': '#ec4899',
  'Disk-Image': '#14b8a6',
  'Backup': '#8b5cf6',
  'Sonstige': '#64748b',
  // English keys (backend scan.rs returns these)
  'video': '#e94560',
  'audio': '#a855f7',
  'images': '#4ecca3',
  'documents': '#00b4d8',
  'archives': '#ffc107',
  'code': '#6c5ce7',
  'executables': '#ec4899',
  'system': '#14b8a6',
  'other': '#64748b',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS['Sonstige'];
}

export function getCategoryClass(category: string): string {
  return 'cat-' + category.toLowerCase().replace(/[^a-z]/g, '-');
}

const CATEGORY_MAP: Record<string, string[]> = {
  'Video': ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
  'Audio': ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
  'Bild': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.psd', '.raw'],
  'Dokument': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
  'Archiv': ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'],
  'Code': ['.py', '.js', '.ts', '.html', '.css', '.java', '.cpp', '.c', '.rs', '.go'],
  'Datenbank': ['.db', '.sqlite', '.sql'],
  'Programm': ['.exe', '.msi', '.dll', '.sys'],
};

export function getCategoryForExt(ext: string): string {
  for (const [cat, exts] of Object.entries(CATEGORY_MAP)) {
    if (exts.includes(ext)) return cat;
  }
  return 'Sonstige';
}

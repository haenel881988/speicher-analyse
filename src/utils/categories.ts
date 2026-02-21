// Kanonische Farben (englische Backend-Keys)
const BASE_COLORS: Record<string, string> = {
  'video': '#e94560',
  'audio': '#a855f7',
  'images': '#4ecca3',
  'documents': '#00b4d8',
  'archives': '#ffc107',
  'code': '#6c5ce7',
  'databases': '#f97316',
  'executables': '#ec4899',
  'system': '#14b8a6',
  'backup': '#8b5cf6',
  'other': '#64748b',
};

// Deutsche UI-Labels → englische Keys
const GERMAN_TO_KEY: Record<string, string> = {
  'Video': 'video',
  'Audio': 'audio',
  'Bild': 'images',
  'Dokument': 'documents',
  'Archiv': 'archives',
  'Code': 'code',
  'Datenbank': 'databases',
  'Programm': 'executables',
  'Disk-Image': 'system',
  'Backup': 'backup',
  'Sonstige': 'other',
};

// Flaches Lookup (deutsch + englisch → Farbe)
export const CATEGORY_COLORS: Record<string, string> = {
  ...BASE_COLORS,
  ...Object.fromEntries(Object.entries(GERMAN_TO_KEY).map(([de, en]) => [de, BASE_COLORS[en]])),
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS[category.toLowerCase()] || BASE_COLORS['other'];
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

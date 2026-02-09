export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return (i > 0 ? size.toFixed(1) : Math.round(size)) + ' ' + units[i];
}

export function formatNumber(num) {
    return num.toLocaleString('de-DE');
}

export function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

export function formatDuration(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}m ${sec}s`;
}

export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function getCategoryClass(category) {
    return 'cat-' + category.toLowerCase().replace(/[^a-z]/g, '-');
}

export const CATEGORY_COLORS = {
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
};

export function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Sonstige'];
}

// Parse size string like "10MB", "1.5GB" to bytes
export function parseSize(str) {
    if (!str) return 0;
    str = str.trim().toUpperCase();
    const match = str.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2] || 'B';
    const multipliers = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
    return Math.round(num * (multipliers[unit] || 1));
}

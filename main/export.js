const { getCategory } = require('./scanner');

function formatBytes(size) {
    if (size === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    let s = size;
    while (s >= 1024 && i < units.length - 1) {
        s /= 1024;
        i++;
    }
    return (i > 0 ? s.toFixed(1) : Math.round(s)) + ' ' + units[i];
}

function generateCSV(scanner) {
    const lines = ['Pfad;Name;Größe (Bytes);Größe;Typ;Kategorie;Dateien;Ordner'];

    for (const [dirPath, data] of scanner.tree) {
        const sizeStr = formatBytes(data.size);
        lines.push(
            `"${data.path}";"${data.name}";${data.size};"${sizeStr}";"Ordner";"";${data.fileCount};${data.dirCount}`
        );
    }

    // Top files
    const topFiles = scanner.getTopFiles(100);
    for (const f of topFiles) {
        const sizeStr = formatBytes(f.size);
        const cat = getCategory(f.extension);
        lines.push(
            `"${f.path}";"${f.name}";${f.size};"${sizeStr}";"${f.extension}";"${cat}";0;0`
        );
    }

    return lines.join('\n');
}

module.exports = { generateCSV };

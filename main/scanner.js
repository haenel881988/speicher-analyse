const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const CATEGORY_MAP = {
    'Video': new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.ts', '.vob']),
    'Audio': new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus', '.alac', '.aiff']),
    'Bild': new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.tif', '.ico', '.raw', '.cr2', '.nef', '.psd']),
    'Dokument': new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv', '.epub']),
    'Archiv': new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.cab', '.lzma']),
    'Code': new Set(['.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.java', '.cpp', '.c', '.h', '.rs', '.go', '.rb', '.php', '.swift', '.kt', '.cs', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.sh', '.bat', '.ps1', '.md']),
    'Datenbank': new Set(['.db', '.sqlite', '.sqlite3', '.sql', '.mdb', '.accdb', '.bak']),
    'Programm': new Set(['.exe', '.msi', '.dll', '.sys', '.drv', '.ocx', '.com']),
    'Disk-Image': new Set(['.iso', '.img', '.vhd', '.vhdx', '.vmdk', '.vdi']),
    'Backup': new Set(['.bak', '.old', '.tmp', '.temp', '.swp', '.sav']),
};

const EXT_TO_CATEGORY = new Map();
for (const [cat, exts] of Object.entries(CATEGORY_MAP)) {
    for (const ext of exts) {
        if (!EXT_TO_CATEGORY.has(ext)) {
            EXT_TO_CATEGORY.set(ext, cat);
        }
    }
}

function getCategory(ext) {
    return EXT_TO_CATEGORY.get(ext) || 'Sonstige';
}

class DiskScanner {
    constructor(rootPath, scanId) {
        this.rootPath = rootPath;
        this.scanId = scanId;
        this.isComplete = false;
        this.status = 'pending';
        this.currentPath = '';
        this.dirsScanned = 0;
        this.filesFound = 0;
        this.totalSize = 0;
        this.errorsCount = 0;
        this.startTime = 0;

        this.tree = new Map();
        this.topFiles = []; // min-heap by size
        this.extensionStats = new Map();
        this.dirFiles = new Map();
        this.worker = null;
    }

    start(onProgress, onComplete, onError) {
        this.startTime = Date.now();
        this.status = 'scanning';

        this.worker = new Worker(path.join(__dirname, 'scanner-worker.js'), {
            workerData: { rootPath: this.rootPath, scanId: this.scanId },
        });

        this.worker.on('message', (msg) => {
            if (msg.type === 'progress') {
                this.currentPath = msg.currentPath;
                this.dirsScanned = msg.dirsScanned;
                this.filesFound = msg.filesFound;
                this.totalSize = msg.totalSize;
                this.errorsCount = msg.errorsCount;
                if (onProgress) onProgress(this.getProgress());
            } else if (msg.type === 'complete') {
                // Reconstruct Maps from transferred data
                this.tree = new Map(msg.tree);
                this.topFiles = msg.topFiles;
                this.extensionStats = new Map(msg.extensionStats);
                this.dirFiles = new Map(msg.dirFiles);
                this.dirsScanned = msg.dirsScanned;
                this.filesFound = msg.filesFound;
                this.totalSize = msg.totalSize;
                this.errorsCount = msg.errorsCount;
                this.status = 'complete';
                this.isComplete = true;
                if (onComplete) onComplete(this.getProgress());
            }
        });

        this.worker.on('error', (err) => {
            this.status = 'error';
            this.isComplete = true;
            this.currentPath = err.message;
            if (onError) onError(this.getProgress());
        });
    }

    getProgress() {
        const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
        return {
            scan_id: this.scanId,
            status: this.status,
            current_path: this.currentPath,
            dirs_scanned: this.dirsScanned,
            files_found: this.filesFound,
            total_size: this.totalSize,
            errors_count: this.errorsCount,
            elapsed_seconds: Math.round(elapsed * 10) / 10,
        };
    }

    getTreeNode(nodePath, depth = 1) {
        const data = this.tree.get(nodePath);
        if (!data) return null;

        const children = [];
        if (depth > 0 && data.childrenPaths) {
            for (const childPath of data.childrenPaths) {
                const childNode = this.getTreeNode(childPath, depth - 1);
                if (childNode) children.push(childNode);
            }
        }

        return {
            name: data.name,
            path: data.path,
            size: data.size,
            own_size: data.ownSize,
            file_count: data.fileCount,
            dir_count: data.dirCount,
            children,
        };
    }

    getTopFiles(limit = 100) {
        const sorted = [...this.topFiles].sort((a, b) => b.size - a.size);
        return sorted.slice(0, limit).map(f => ({
            path: f.path,
            name: f.name,
            size: f.size,
            extension: f.ext,
            modified: f.mtime,
        }));
    }

    getFileTypeStats() {
        const stats = [];
        for (const [ext, data] of this.extensionStats) {
            stats.push({
                extension: ext || '(keine)',
                category: getCategory(ext),
                count: data.count,
                total_size: data.totalSize,
            });
        }
        stats.sort((a, b) => b.total_size - a.total_size);
        return stats;
    }

    search(query, minSize = 0, maxResults = 200) {
        const results = [];
        const queryLower = query.toLowerCase();
        const isGlob = query.includes('*') || query.includes('?');

        // Search directories
        for (const [dirPath, data] of this.tree) {
            const name = data.name.toLowerCase();
            let match = false;
            if (isGlob) {
                match = globMatch(name, queryLower);
            } else {
                match = name.includes(queryLower);
            }
            if (match && data.size >= minSize) {
                results.push({
                    path: data.path,
                    name: data.name,
                    size: data.size,
                    is_dir: true,
                    extension: '',
                });
            }
        }

        // Search files
        for (const [dirPath, files] of this.dirFiles) {
            for (const f of files) {
                const name = f.name.toLowerCase();
                let match = false;
                if (isGlob) {
                    match = globMatch(name, queryLower);
                } else {
                    match = name.includes(queryLower);
                }
                if (match && f.size >= minSize) {
                    results.push({
                        path: f.path,
                        name: f.name,
                        size: f.size,
                        is_dir: false,
                        extension: f.ext,
                    });
                }
            }
        }

        results.sort((a, b) => b.size - a.size);
        return results.slice(0, maxResults);
    }
}

// Simple glob matching (supports * and ?)
function globMatch(str, pattern) {
    const regex = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    try {
        return new RegExp('^' + regex + '$').test(str);
    } catch {
        return str.includes(pattern);
    }
}

module.exports = { DiskScanner, getCategory };

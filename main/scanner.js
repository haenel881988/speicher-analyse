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
        this.nameIndex = new Map(); // filename.toLowerCase() → [dirPath1, ...]
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
                this.nameIndex = new Map(msg.nameIndex);
                this.dirsScanned = msg.dirsScanned;
                this.filesFound = msg.filesFound;
                this.totalSize = msg.totalSize;
                this.errorsCount = msg.errorsCount;
                this.status = 'complete';
                this.isComplete = true;
                // Terminate worker to free memory
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
                if (onComplete) onComplete(this.getProgress());
            }
        });

        this.worker.on('error', (err) => {
            this.status = 'error';
            this.isComplete = true;
            this.currentPath = err.message;
            if (this.worker) {
                try { this.worker.terminate(); } catch {}
                this.worker = null;
            }
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
        const { isSystemPath, isInsideExcludedDir } = require('./exclusions');
        const sorted = [...this.topFiles].sort((a, b) => b.size - a.size);
        return sorted
            .filter(f => !isSystemPath(f.path) && !isInsideExcludedDir(f.path))
            .slice(0, limit)
            .map(f => ({
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

    releaseBulkData() {
        if (this.dirFiles) {
            this.dirFiles.clear();
            this.dirFiles = null;
        }
        // NOTE: nameIndex is intentionally kept! It's small (~30-50MB for 500K files)
        // and needed for Hybrid-Suche Ebene 2 after scan.
    }

    getFilesByExtension(ext, limit = 500) {
        if (!this.dirFiles) return [];
        const results = [];
        for (const [dirPath, files] of this.dirFiles) {
            for (const f of files) {
                if (f.ext === ext) {
                    results.push({
                        path: path.join(dirPath, f.name),
                        name: f.name,
                        size: f.size,
                        extension: f.ext,
                        modified: f.mtime,
                    });
                }
            }
        }
        results.sort((a, b) => b.size - a.size);
        return results.slice(0, limit);
    }

    getFilesByCategory(category, limit = 500) {
        if (!this.dirFiles) return [];
        const results = [];
        for (const [dirPath, files] of this.dirFiles) {
            for (const f of files) {
                if (getCategory(f.ext) === category) {
                    results.push({
                        path: path.join(dirPath, f.name),
                        name: f.name,
                        size: f.size,
                        extension: f.ext,
                        modified: f.mtime,
                    });
                }
            }
        }
        results.sort((a, b) => b.size - a.size);
        return results.slice(0, limit);
    }

    getSizeDuplicates(minSize = 1024) {
        if (!this.dirFiles) return { totalGroups: 0, totalFiles: 0, totalSaveable: 0 };
        const sizeMap = new Map();
        for (const [dirPath, files] of this.dirFiles) {
            for (const f of files) {
                if (f.size < minSize) continue;
                const key = f.size;
                if (!sizeMap.has(key)) {
                    sizeMap.set(key, 1);
                } else {
                    sizeMap.set(key, sizeMap.get(key) + 1);
                }
            }
        }
        let totalGroups = 0;
        let totalFiles = 0;
        let totalSaveable = 0;
        for (const [size, count] of sizeMap) {
            if (count > 1) {
                totalGroups++;
                totalFiles += count;
                totalSaveable += size * (count - 1);
            }
        }
        return { totalGroups, totalFiles, totalSaveable };
    }

    searchByName(query, options = {}) {
        const maxResults = options.maxResults || 500;
        const results = [];
        if (!this.nameIndex || this.nameIndex.size === 0) return results;

        const queryLower = query.toLowerCase();
        const isRegex = query.startsWith('/') && query.endsWith('/') && query.length > 2;
        let regex = null;
        if (isRegex) {
            try { regex = new RegExp(query.slice(1, -1), 'i'); } catch { regex = null; }
        }

        const WORD_BOUNDARY = new Set(['_', '-', '.', ' ']);

        for (const [nameLower, dirPaths] of this.nameIndex) {
            let matchQuality = 0;
            if (regex) {
                matchQuality = regex.test(nameLower) ? 1.0 : 0;
            } else {
                matchQuality = this._scoreMatch(nameLower, queryLower, WORD_BOUNDARY);
            }
            if (matchQuality === 0) continue;

            for (const dirPath of dirPaths) {
                results.push({
                    name: nameLower,
                    dirPath,
                    fullPath: path.join(dirPath, nameLower),
                    matchQuality,
                    isDir: false,
                });
                if (results.length >= maxResults) break;
            }
            if (results.length >= maxResults) break;
        }
        // Sort: quality descending, then alphabetical
        results.sort((a, b) => b.matchQuality - a.matchQuality || a.name.localeCompare(b.name, 'de'));
        return results;
    }

    /**
     * Relevance-based scoring for search matches.
     * Returns 0 for no match, up to 1.0 for exact match.
     */
    _scoreMatch(nameLower, queryLower, wordBoundary) {
        // Exact name match (ignoring extension)
        const dotIdx = nameLower.lastIndexOf('.');
        const base = dotIdx > 0 ? nameLower.substring(0, dotIdx) : nameLower;
        if (base === queryLower) return 1.0;

        // Full query: name starts with it
        if (nameLower.startsWith(queryLower)) return 0.95;

        // Full query: contained in name
        const fullIdx = nameLower.indexOf(queryLower);
        if (fullIdx > 0) {
            return wordBoundary.has(nameLower[fullIdx - 1]) ? 0.9 : 0.8;
        }

        // Progressive prefix matching (min 60% of query, at least 3 chars)
        const minLen = Math.max(3, Math.ceil(queryLower.length * 0.6));
        for (let len = queryLower.length - 1; len >= minLen; len--) {
            const prefix = queryLower.substring(0, len);
            const idx = nameLower.indexOf(prefix);
            if (idx < 0) continue;

            const ratio = len / queryLower.length;

            // Starts with prefix
            if (idx === 0) return 0.7 * ratio;

            // At word boundary
            if (wordBoundary.has(nameLower[idx - 1])) return 0.5 * ratio;

            // Mid-word: only if prefix is very close to full query
            if (ratio >= 0.8) return 0.25 * ratio;
        }

        return 0;
    }

    getNameIndexInfo() {
        return {
            available: this.nameIndex && this.nameIndex.size > 0,
            fileCount: this.nameIndex ? this.nameIndex.size : 0,
            scanTime: this.isComplete ? new Date().toISOString() : null,
        };
    }

    search(query, minSize = 0, maxResults = 200) {
        const results = [];
        const queryLower = query.toLowerCase();
        const isGlob = query.includes('*') || query.includes('?');

        // Search directories (tree is always available)
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

        // Search files (only if bulk data still available)
        if (!this.dirFiles) return results.slice(0, maxResults);
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
                        path: path.join(dirPath, f.name),
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
    if (pattern.length > 200) return str.includes(pattern);
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

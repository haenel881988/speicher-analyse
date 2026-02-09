const path = require('path');
const { Worker } = require('worker_threads');

class DuplicateFinder {
    constructor(scanner, scanId) {
        this.scanner = scanner;
        this.scanId = scanId;
        this.worker = null;
        this.results = null;
        this.status = 'idle';
    }

    start(onProgress, onComplete, onError, options = {}) {
        this.status = 'scanning';
        this.results = null;

        // Phase 0: Pre-filter on main thread - only send size-duplicate candidates
        const minSize = options.minSize || 1024;
        const maxSize = options.maxSize || 2147483648;
        const sizeMap = new Map();
        for (const [, files] of this.scanner.dirFiles) {
            for (const f of files) {
                if (f.size === 0 || f.size < minSize || f.size > maxSize) continue;
                if (!sizeMap.has(f.size)) sizeMap.set(f.size, []);
                sizeMap.get(f.size).push({ path: f.path, name: f.name, size: f.size, ext: f.ext, mtime: f.mtime });
            }
        }
        const candidates = [];
        for (const [, group] of sizeMap) {
            if (group.length >= 2) candidates.push(...group);
        }

        this.worker = new Worker(path.join(__dirname, 'duplicate-worker.js'), {
            workerData: { files: candidates, options },
        });

        this.worker.on('message', (msg) => {
            if (msg.type === 'progress') {
                if (onProgress) onProgress(msg);
            } else if (msg.type === 'complete') {
                this.results = msg.groups;
                this.status = 'complete';
                if (onComplete) onComplete({
                    groups: msg.groups,
                    totalGroups: msg.groups.length,
                    totalDuplicates: msg.groups.reduce((sum, g) => sum + g.files.length - 1, 0),
                    totalSaveable: msg.groups.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0),
                });
            }
        });

        this.worker.on('error', (err) => {
            this.status = 'error';
            if (onError) onError(err.message);
        });
    }

    getResults() {
        return this.results || [];
    }

    cancel() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.status = 'cancelled';
        }
    }
}

module.exports = { DuplicateFinder };

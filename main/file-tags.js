'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * File Tags - Color labels for files stored in a local JSON file.
 * Tags persist across sessions in %APPDATA%/speicher-analyse/file-tags.json
 */

const TAG_COLORS = {
    red:    { label: 'Rot',    hex: '#e94560' },
    orange: { label: 'Orange', hex: '#ff8c42' },
    yellow: { label: 'Gelb',  hex: '#ffc107' },
    green:  { label: 'Gr\u00FCn',  hex: '#4ecca3' },
    blue:   { label: 'Blau',  hex: '#00b4d8' },
    purple: { label: 'Lila',  hex: '#6c5ce7' },
    gray:   { label: 'Grau',  hex: '#8b8fa3' },
};

class FileTagStore {
    constructor() {
        this.tags = new Map(); // filePath → { color, note, created }
        this.dbPath = '';
        this._dirty = false;
        this._saveTimer = null;
    }

    init() {
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'file-tags.json');
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
                if (Array.isArray(data)) {
                    for (const entry of data) {
                        if (entry.path && entry.color) {
                            this.tags.set(entry.path, {
                                color: entry.color,
                                note: entry.note || '',
                                created: entry.created || Date.now(),
                            });
                        }
                    }
                }
            }
        } catch { /* start fresh if corrupted */ }
    }

    _scheduleSave() {
        this._dirty = true;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._save();
        }, 1000);
    }

    _save() {
        if (!this._dirty) return;
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const data = [];
            for (const [filePath, tag] of this.tags) {
                data.push({ path: filePath, ...tag });
            }
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
            this._dirty = false;
        } catch (err) {
            console.error('Failed to save file tags:', err.message);
        }
    }

    setTag(filePath, color, note) {
        if (!TAG_COLORS[color]) return { success: false, error: `Unbekannte Farbe: ${color}` };
        this.tags.set(filePath, {
            color,
            note: note || '',
            created: Date.now(),
        });
        this._scheduleSave();
        return { success: true };
    }

    removeTag(filePath) {
        const existed = this.tags.delete(filePath);
        if (existed) this._scheduleSave();
        return { success: true, removed: existed };
    }

    getTag(filePath) {
        return this.tags.get(filePath) || null;
    }

    getTagsForPaths(filePaths) {
        const result = {};
        for (const p of filePaths) {
            const tag = this.tags.get(p);
            if (tag) result[p] = tag;
        }
        return result;
    }

    getTagsInDirectory(dirPath) {
        const result = {};
        const dirNorm = dirPath.replace(/\/$/, '').replace(/\\$/, '');
        for (const [filePath, tag] of this.tags) {
            const fileDir = path.dirname(filePath);
            if (fileDir === dirNorm || fileDir === dirPath) {
                result[filePath] = tag;
            }
        }
        return result;
    }

    getAllTags() {
        const result = [];
        for (const [filePath, tag] of this.tags) {
            result.push({ path: filePath, ...tag });
        }
        return result;
    }

    getColors() {
        return TAG_COLORS;
    }

    flush() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        this._save();
    }
}

module.exports = { FileTagStore, TAG_COLORS };

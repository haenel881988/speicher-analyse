import { escapeHtml } from './utils.js';

/**
 * BatchRenameModal - Pattern-based batch renaming for multiple files.
 *
 * Tokens: {name} {ext} {counter} {counter:N} {date} {original}
 */
export class BatchRenameModal {
    constructor() {
        this.files = [];       // [{path, name}]
        this.visible = false;
        this.el = this._build();
        document.body.appendChild(this.el);
    }

    /**
     * Open the modal with a list of files to rename.
     * @param {Array<{path: string, name: string}>} files
     */
    open(files) {
        if (!files || files.length < 2) return;
        this.files = files;
        this.visible = true;
        this.el.style.display = '';
        this.patternInput.value = '{name}.{ext}';
        this.counterStart.value = '1';
        this._updatePreview();
        this.patternInput.focus();
        this.patternInput.select();
    }

    close() {
        this.visible = false;
        this.el.style.display = 'none';
        this.files = [];
    }

    destroy() {
        this.close();
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }

    // ===== Build DOM =====

    _build() {
        const overlay = document.createElement('div');
        overlay.className = 'batch-rename-overlay';
        overlay.style.display = 'none';

        overlay.innerHTML = `
            <div class="batch-rename-modal">
                <div class="batch-rename-header">
                    <h3>Batch-Umbenennung</h3>
                    <button class="batch-rename-close-btn">\u00D7</button>
                </div>
                <div class="batch-rename-body">
                    <div class="batch-rename-pattern-row">
                        <label>Muster:</label>
                        <input class="batch-rename-pattern" type="text" value="{name}.{ext}" spellcheck="false">
                    </div>
                    <div class="batch-rename-options">
                        <div class="batch-rename-tokens">
                            Tokens:
                            <code>{name}</code>
                            <code>{ext}</code>
                            <code>{counter}</code>
                            <code>{counter:3}</code>
                            <code>{date}</code>
                            <code>{original}</code>
                        </div>
                        <div class="batch-rename-counter-row">
                            <label>Startnummer:</label>
                            <input class="batch-rename-counter-start" type="number" min="0" value="1" style="width:60px">
                        </div>
                    </div>
                    <div class="batch-rename-preview">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Alt</th>
                                    <th></th>
                                    <th>Neu</th>
                                </tr>
                            </thead>
                            <tbody class="batch-rename-preview-body"></tbody>
                        </table>
                    </div>
                    <div class="batch-rename-footer">
                        <span class="batch-rename-count"></span>
                        <div class="batch-rename-actions">
                            <button class="batch-rename-cancel-btn">Abbrechen</button>
                            <button class="batch-rename-apply-btn">Umbenennen</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.patternInput = overlay.querySelector('.batch-rename-pattern');
        this.counterStart = overlay.querySelector('.batch-rename-counter-start');
        this.previewBody = overlay.querySelector('.batch-rename-preview-body');
        this.countEl = overlay.querySelector('.batch-rename-count');
        this.applyBtn = overlay.querySelector('.batch-rename-apply-btn');

        // Events
        this.patternInput.addEventListener('input', () => this._updatePreview());
        this.counterStart.addEventListener('input', () => this._updatePreview());

        overlay.querySelector('.batch-rename-close-btn').addEventListener('click', () => this.close());
        overlay.querySelector('.batch-rename-cancel-btn').addEventListener('click', () => this.close());
        this.applyBtn.addEventListener('click', () => this._applyRename());

        // Token click → insert into pattern
        overlay.querySelectorAll('.batch-rename-tokens code').forEach(code => {
            code.style.cursor = 'pointer';
            code.addEventListener('click', () => {
                const pos = this.patternInput.selectionStart;
                const val = this.patternInput.value;
                const token = code.textContent;
                this.patternInput.value = val.slice(0, pos) + token + val.slice(pos);
                this.patternInput.focus();
                this.patternInput.selectionStart = this.patternInput.selectionEnd = pos + token.length;
                this._updatePreview();
            });
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // Escape to close
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });

        return overlay;
    }

    // ===== Preview =====

    _updatePreview() {
        const pattern = this.patternInput.value;
        const startNum = parseInt(this.counterStart.value) || 1;
        const today = new Date().toISOString().slice(0, 10);

        this.previewBody.innerHTML = '';

        const newNames = [];
        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const dotIdx = file.name.lastIndexOf('.');
            const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
            const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1) : '';
            const counter = startNum + i;

            let newName = pattern;
            newName = newName.replace(/\{name\}/g, baseName);
            newName = newName.replace(/\{ext\}/g, ext);
            newName = newName.replace(/\{original\}/g, file.name);
            newName = newName.replace(/\{date\}/g, today);
            newName = newName.replace(/\{counter(?::(\d+))?\}/g, (_match, pad) => {
                const padLen = pad ? parseInt(pad) : 0;
                return padLen > 0 ? String(counter).padStart(padLen, '0') : String(counter);
            });

            newNames.push(newName);

            const tr = document.createElement('tr');
            const changed = newName !== file.name;
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td class="batch-rename-old">${escapeHtml(file.name)}</td>
                <td>\u2192</td>
                <td class="batch-rename-new${changed ? ' changed' : ''}">${escapeHtml(newName)}</td>
            `;
            this.previewBody.appendChild(tr);
        }

        this.countEl.textContent = `${this.files.length} Dateien`;

        // Check for duplicates
        const nameSet = new Set();
        let hasDuplicates = false;
        for (const n of newNames) {
            if (nameSet.has(n.toLowerCase())) { hasDuplicates = true; break; }
            nameSet.add(n.toLowerCase());
        }

        if (hasDuplicates) {
            this.countEl.textContent += ' (Warnung: Doppelte Namen!)';
            this.countEl.style.color = 'var(--warning)';
            this.applyBtn.disabled = true;
        } else {
            this.countEl.style.color = '';
            this.applyBtn.disabled = false;
        }
    }

    // ===== Apply =====

    async _applyRename() {
        const pattern = this.patternInput.value;
        const startNum = parseInt(this.counterStart.value) || 1;
        const today = new Date().toISOString().slice(0, 10);

        this.applyBtn.disabled = true;
        this.applyBtn.textContent = 'Umbenennen...';

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const dotIdx = file.name.lastIndexOf('.');
            const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
            const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1) : '';
            const counter = startNum + i;

            let newName = pattern;
            newName = newName.replace(/\{name\}/g, baseName);
            newName = newName.replace(/\{ext\}/g, ext);
            newName = newName.replace(/\{original\}/g, file.name);
            newName = newName.replace(/\{date\}/g, today);
            newName = newName.replace(/\{counter(?::(\d+))?\}/g, (_match, pad) => {
                const padLen = pad ? parseInt(pad) : 0;
                return padLen > 0 ? String(counter).padStart(padLen, '0') : String(counter);
            });

            if (newName === file.name) continue;

            try {
                const result = await window.api.rename(file.path, newName);
                if (result.success) {
                    successCount++;
                    // Update preview row
                    const row = this.previewBody.children[i];
                    if (row) row.classList.add('batch-rename-done');
                } else {
                    errorCount++;
                }
            } catch {
                errorCount++;
            }
        }

        this.countEl.textContent = `${successCount} umbenannt${errorCount > 0 ? `, ${errorCount} Fehler` : ''}`;
        this.applyBtn.textContent = 'Fertig';
        this.applyBtn.disabled = false;

        // Close after short delay and trigger refresh
        setTimeout(() => {
            this.close();
            // Dispatch event so explorer can refresh
            document.dispatchEvent(new CustomEvent('batch-rename-complete'));
        }, 800);
    }

    // ===== Helpers =====

}

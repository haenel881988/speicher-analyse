import { formatBytes, formatDate, escapeHtml } from './utils.js';
import { showToast } from './tree.js';
import { getFileIcon } from './explorer.js';

// Clipboard state
const clipboard = {
    operation: null, // 'cut' | 'copy'
    paths: [],
};

export function getClipboard() {
    return clipboard;
}

export function clipboardCut(paths) {
    clipboard.operation = 'cut';
    clipboard.paths = paths;
    // Visually mark cut items
    document.querySelectorAll('.tree-row.cut').forEach(r => r.classList.remove('cut'));
    for (const p of paths) {
        const row = document.querySelector(`[data-path="${CSS.escape(p)}"]`);
        if (row) row.classList.add('cut');
    }
    showToast(`${paths.length} Element(e) ausgeschnitten`, 'info');
}

export function clipboardCopy(paths) {
    clipboard.operation = 'copy';
    clipboard.paths = paths;
    document.querySelectorAll('.tree-row.cut').forEach(r => r.classList.remove('cut'));
    showToast(`${paths.length} Element(e) kopiert`, 'info');
}

export async function clipboardPaste(destDir, onRefresh) {
    if (!clipboard.paths.length || !clipboard.operation) {
        showToast('Zwischenablage ist leer', 'info');
        return;
    }

    try {
        let results;
        if (clipboard.operation === 'copy') {
            results = await window.api.copy(clipboard.paths, destDir);
        } else if (clipboard.operation === 'cut') {
            results = await window.api.move(clipboard.paths, destDir);
            clipboard.operation = null;
            clipboard.paths = [];
            document.querySelectorAll('.tree-row.cut').forEach(r => r.classList.remove('cut'));
        }

        // Backend gibt { success: true } als Objekt zurück (kein Array)
        if (results && !results.success) {
            showToast(results.error || 'Fehler beim Einfügen', 'error');
        } else {
            showToast('Einfügen erfolgreich', 'success');
        }
        if (onRefresh) onRefresh();
    } catch (e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}

export async function deleteToTrash(paths, onRefresh) {
    if (!paths.length) return;

    const result = await window.api.showConfirmDialog({
        type: 'question',
        title: 'In Papierkorb verschieben',
        message: paths.length === 1
            ? `"${paths[0].split(/[/\\]/).pop()}" in den Papierkorb verschieben?`
            : `${paths.length} Elemente in den Papierkorb verschieben?`,
        buttons: ['Abbrechen', 'Löschen'],
        defaultId: 0,
    });

    if (result.response !== 1) return;

    try {
        const result = await window.api.deleteToTrash(paths);
        // Backend gibt { success: true } als Objekt zurück (kein Array)
        if (result && !result.success) {
            showToast(result.error || 'Fehler beim Löschen', 'error');
        } else {
            showToast(`${paths.length} Element(e) gelöscht`, 'success');
        }
        if (onRefresh) onRefresh();
    } catch (e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}

export async function deletePermanent(paths, onRefresh) {
    if (!paths.length) return;

    const result = await window.api.showConfirmDialog({
        type: 'warning',
        title: 'Endgültig löschen',
        message: paths.length === 1
            ? `"${paths[0].split(/[/\\]/).pop()}" ENDGÜLTIG löschen? Dies kann nicht rückgängig gemacht werden!`
            : `${paths.length} Elemente ENDGÜLTIG löschen? Dies kann nicht rückgängig gemacht werden!`,
        buttons: ['Abbrechen', 'Endgültig löschen'],
        defaultId: 0,
    });

    if (result.response !== 1) return;

    try {
        const result = await window.api.deletePermanent(paths);
        // Backend gibt { success: true } als Objekt zurück (kein Array)
        if (result && !result.success) {
            showToast(result.error || 'Fehler beim Löschen', 'error');
        } else {
            showToast(`${paths.length} Element(e) endgültig gelöscht`, 'success');
        }
        if (onRefresh) onRefresh();
    } catch (e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}

export async function createNewFolder(parentPath, onRefresh) {
    const name = prompt('Name des neuen Ordners:', 'Neuer Ordner');
    if (!name) return;

    try {
        const result = await window.api.createFolder(parentPath, name);
        if (result.success) {
            showToast(`Ordner "${name}" erstellt`, 'success');
            if (onRefresh) onRefresh();
        } else {
            showToast('Fehler: ' + (result.error || 'Unbekannt'), 'error');
        }
    } catch (e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}

// === Properties Dialog (4-Tab, Windows Explorer Style) ===

function formatDateTime(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('de-DE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function formatBytesDetailed(bytes) {
    if (!bytes || bytes <= 0) return '0 Bytes';
    return `${formatBytes(bytes)} (${Number(bytes).toLocaleString('de-DE')} Bytes)`;
}

/** Translates FileSystemRights flags into readable German labels */
function parseRights(rightsStr) {
    const labels = [];
    if (rightsStr.includes('FullControl')) labels.push('Vollzugriff');
    else {
        if (rightsStr.includes('Modify')) labels.push('Ändern');
        if (rightsStr.includes('ReadAndExecute')) labels.push('Lesen, Ausführen');
        else if (rightsStr.includes('Read')) labels.push('Lesen');
        if (rightsStr.includes('Write')) labels.push('Schreiben');
    }
    if (rightsStr.includes('Delete') && !labels.length) labels.push('Löschen');
    return labels.length ? labels.join(', ') : rightsStr;
}

class PropertiesDialog {
    constructor() {
        this.modal = document.getElementById('properties-modal');
        this.body = document.getElementById('properties-body');
        this.titleEl = document.getElementById('properties-title');
        this.tabsEl = document.getElementById('properties-tabs');
        this.filePath = null;
        this.activeTab = 'general';
        this.cache = {};
        this._tabClickHandler = null;
    }

    async show(filePath) {
        if (!this.modal || !this.body) return;
        this.filePath = filePath;
        this.activeTab = 'general';
        this.cache = {};

        // Reset title
        if (this.titleEl) this.titleEl.textContent = 'Eigenschaften';

        this.body.innerHTML = '<div class="loading-spinner"></div>';
        this.modal.style.display = 'flex';
        this._wireTabEvents();
        this._updateTabUI();

        await this._loadTab('general');
    }

    hide() {
        if (this.modal) this.modal.style.display = 'none';
        this.filePath = null;
        this.cache = {};
    }

    _wireTabEvents() {
        if (this._tabClickHandler && this.tabsEl) {
            this.tabsEl.removeEventListener('click', this._tabClickHandler);
        }
        this._tabClickHandler = (e) => {
            const tab = e.target.closest('.props-tab');
            if (!tab) return;
            const tabName = tab.dataset.propsTab;
            if (tabName && tabName !== this.activeTab) {
                this.activeTab = tabName;
                this._updateTabUI();
                this._loadTab(tabName);
            }
        };
        if (this.tabsEl) {
            this.tabsEl.addEventListener('click', this._tabClickHandler);
        }
    }

    _updateTabUI() {
        if (!this.tabsEl) return;
        this.tabsEl.querySelectorAll('.props-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.propsTab === this.activeTab);
        });
    }

    async _loadTab(tabName) {
        if (this.cache[tabName]) {
            this.body.innerHTML = this.cache[tabName];
            this._wireTabContent(tabName);
            return;
        }

        this.body.innerHTML = '<div class="loading-spinner"></div>';

        try {
            let html = '';
            switch (tabName) {
                case 'general':  html = await this._renderGeneral(); break;
                case 'security':
                case 'details':
                    // Security + Details parallel laden (spart ~300ms PowerShell-Start)
                    await this._loadSecurityAndDetails();
                    html = this.cache[tabName] || '';
                    break;
                case 'versions': html = await this._renderVersions(); break;
            }
            if (!this.cache[tabName]) this.cache[tabName] = html;
            if (this.activeTab === tabName) {
                this.body.innerHTML = this.cache[tabName];
                this._wireTabContent(tabName);
            }
        } catch (e) {
            this.body.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.style.color = 'var(--danger)';
            errDiv.textContent = 'Fehler: ' + e.message;
            this.body.appendChild(errDiv);
        }
    }

    async _loadSecurityAndDetails() {
        // Beide Tabs parallel laden — spart einen PowerShell-Prozessstart (~300ms)
        if (this.cache.security && this.cache.details) return;
        const [secHtml, detHtml] = await Promise.all([
            this.cache.security ? Promise.resolve(this.cache.security) : this._renderSecurity(),
            this.cache.details  ? Promise.resolve(this.cache.details)  : this._renderDetails()
        ]);
        this.cache.security = secHtml;
        this.cache.details = detHtml;
    }

    async _renderGeneral() {
        const props = await window.api.getPropertiesGeneral(this.filePath);
        if (props.error) throw new Error(props.error);

        if (this.titleEl) {
            this.titleEl.textContent = `Eigenschaften von ${props.name}`;
        }

        const icon = getFileIcon(props.isDir ? null : props.extension, props.isDir);
        const sizeStr = props.isDir ? 'Wird berechnet...' : formatBytesDetailed(props.size);
        const sizeOnDiskStr = props.isDir ? 'Wird berechnet...' : formatBytesDetailed(props.sizeOnDisk);
        const typeDesc = props.typeDescription || (props.isDir ? 'Dateiordner' : (props.extension ? props.extension.replace('.', '').toUpperCase() + '-Datei' : 'Datei'));

        let openWithRow = '';
        if (props.openWith) {
            // Show just the program name, not the full command line
            const progName = props.openWith.split('\\').pop().split('"').shift().split('.exe')[0] || props.openWith;
            openWithRow = `<div class="prop-row"><span class="prop-label">Öffnen mit</span><span class="prop-value">${escapeHtml(progName)}</span></div>`;
        }

        let containsRow = '';
        if (props.isDir) {
            containsRow = `<div class="prop-row"><span class="prop-label">Enthält</span><span class="prop-value" id="props-contains">Wird berechnet...</span></div>`;
        }

        const html = `
            <div class="props-general-header">
                <div class="props-general-icon">${icon}</div>
                <div class="props-general-name">${escapeHtml(props.name)}</div>
            </div>
            <div class="prop-row"><span class="prop-label">Dateityp</span><span class="prop-value">${escapeHtml(typeDesc)}</span></div>
            ${openWithRow}
            <div class="props-separator"></div>
            <div class="prop-row"><span class="prop-label">Speicherort</span><span class="prop-value">${escapeHtml(props.parentPath || '')}</span></div>
            <div class="prop-row"><span class="prop-label">Größe</span><span class="prop-value" id="props-size">${sizeStr}</span></div>
            <div class="prop-row"><span class="prop-label">Größe auf Datenträger</span><span class="prop-value" id="props-size-disk">${sizeOnDiskStr}</span></div>
            ${containsRow}
            <div class="props-separator"></div>
            <div class="prop-row"><span class="prop-label">Erstellt</span><span class="prop-value">${formatDateTime(props.created)}</span></div>
            <div class="prop-row"><span class="prop-label">Geändert</span><span class="prop-value">${formatDateTime(props.modified)}</span></div>
            <div class="prop-row"><span class="prop-label">Letzter Zugriff</span><span class="prop-value">${formatDateTime(props.accessed)}</span></div>
            <div class="props-separator"></div>
            <div class="props-attrs">
                <label><input type="checkbox" ${props.readOnly ? 'checked' : ''} disabled> Schreibgeschützt</label>
                <label><input type="checkbox" ${props.hidden ? 'checked' : ''} disabled> Versteckt</label>
                <label><input type="checkbox" ${props.archive ? 'checked' : ''} disabled> Archiv</label>
            </div>
        `;

        // Ordnergröße asynchron berechnen
        if (props.isDir && window.api?.calculateFolderSize) {
            setTimeout(async () => {
                try {
                    const result = await window.api.calculateFolderSize(this.filePath);
                    if (result && result.totalSize !== undefined) {
                        const sizeEl = document.getElementById('props-size');
                        const diskEl = document.getElementById('props-size-disk');
                        const containsEl = document.getElementById('props-contains');
                        if (sizeEl) sizeEl.textContent = formatBytesDetailed(result.totalSize);
                        if (diskEl) diskEl.textContent = formatBytes(result.totalSize);
                        if (containsEl) containsEl.textContent = `${result.fileCount || 0} Dateien, ${result.dirCount || 0} Ordner`;
                    }
                } catch { /* Ordnergröße konnte nicht berechnet werden */ }
            }, 0);
        }

        return html;
    }

    async _renderSecurity() {
        const data = await window.api.getPropertiesSecurity(this.filePath);
        if (data.error && (!data.entries || data.entries.length === 0)) {
            return `<div style="color:var(--text-muted);text-align:center;padding:20px">${escapeHtml(data.error)}</div>`;
        }

        const entries = Array.isArray(data.entries) ? data.entries : [];
        const identities = [...new Set(entries.map(e => e.identity))];

        let rows = '';
        for (const identity of identities) {
            const userEntries = entries.filter(e => e.identity === identity);
            for (const entry of userEntries) {
                const typeClass = entry.type === 'Allow' ? 'props-acl-allow' : 'props-acl-deny';
                const typeLabel = entry.type === 'Allow' ? 'Zulassen' : 'Verweigern';
                const inheritedClass = entry.inherited ? ' props-acl-inherited' : '';
                rows += `<tr>
                    <td${inheritedClass}>${escapeHtml(identity)}</td>
                    <td class="${typeClass}">${escapeHtml(typeLabel)}</td>
                    <td>${escapeHtml(parseRights(entry.rights))}${entry.inherited ? ' <small>(geerbt)</small>' : ''}</td>
                </tr>`;
            }
        }

        if (!rows) {
            rows = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Keine Berechtigungen gefunden</td></tr>';
        }

        return `
            <div class="props-security-owner">
                <strong>Besitzer:</strong> ${escapeHtml(data.owner || 'Unbekannt')}
            </div>
            <table class="props-acl-table">
                <thead><tr><th>Benutzer/Gruppe</th><th>Typ</th><th>Berechtigungen</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    async _renderDetails() {
        const data = await window.api.getPropertiesDetails(this.filePath);
        const entries = Array.isArray(data) ? data : (data ? [data] : []);

        let rows = entries
            .filter(e => e && e.key && e.value)
            .map(e => `<div class="props-detail-row">
                <span class="props-detail-key">${escapeHtml(e.key)}</span>
                <span class="props-detail-value">${escapeHtml(String(e.value))}</span>
            </div>`).join('');

        if (!rows) {
            rows = '<div style="color:var(--text-muted);text-align:center;padding:20px">Keine erweiterten Eigenschaften verfügbar.</div>';
        }

        // Hash-Sektion (on-demand)
        const hashSection = `
            <div class="props-hash-section">
                <div class="prop-row"><span class="prop-label" style="font-weight:600">Prüfsummen</span><span class="prop-value"></span></div>
                <div style="display:flex;gap:8px;margin-top:6px">
                    <button class="props-hash-btn" data-algo="MD5">MD5</button>
                    <button class="props-hash-btn" data-algo="SHA256">SHA-256</button>
                </div>
                <div class="props-hash-result" id="props-hash-result"></div>
            </div>
        `;

        return rows + hashSection;
    }

    async _renderVersions() {
        const data = await window.api.getPropertiesVersions(this.filePath);

        if (!data.versions || data.versions.length === 0) {
            const msg = data.message || 'Keine Vorgängerversionen verfügbar.';
            return `<div class="props-versions-empty">
                <p>${escapeHtml(msg)}</p>
                <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
                    Vorgängerversionen stammen aus Schattenkopien, die vom Windows-Systemschutz erstellt werden.
                </p>
            </div>`;
        }

        const items = data.versions.map(v => `<div class="props-version-item">
            <div>
                <div class="props-version-date">${escapeHtml(v.dateFormatted || '')}</div>
                <div class="props-version-type">${escapeHtml(v.type || '')}</div>
            </div>
            <div>${v.size >= 0 ? formatBytes(v.size) : ''}</div>
        </div>`).join('');

        return `<div class="props-versions-list">${items}</div>`;
    }

    _wireTabContent(tabName) {
        if (tabName === 'details') {
            this.body.querySelectorAll('.props-hash-btn').forEach(btn => {
                btn.onclick = async () => {
                    const algo = btn.dataset.algo;
                    const resultEl = document.getElementById('props-hash-result');
                    btn.disabled = true;
                    btn.textContent = 'Berechne...';
                    try {
                        const result = await window.api.getPropertiesHash(this.filePath, algo);
                        if (resultEl) resultEl.textContent = `${result.algorithm}: ${result.hash}`;
                    } catch (e) {
                        if (resultEl) resultEl.textContent = 'Fehler: ' + e.message;
                    } finally {
                        btn.disabled = false;
                        btn.textContent = algo === 'SHA256' ? 'SHA-256' : algo;
                    }
                };
            });
        }
    }

    destroy() {
        if (this._tabClickHandler && this.tabsEl) {
            this.tabsEl.removeEventListener('click', this._tabClickHandler);
            this._tabClickHandler = null;
        }
        this.cache = {};
    }
}

const propsDialog = new PropertiesDialog();

export async function showProperties(filePath) {
    await propsDialog.show(filePath);
}

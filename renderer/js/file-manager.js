import { formatBytes, formatDate } from './utils.js';
import { showToast } from './tree.js';

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

        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            showToast(`${failed.length} Fehler beim Einfügen`, 'error');
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
        const results = await window.api.deleteToTrash(paths);
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            showToast(`${failed.length} Fehler beim Löschen`, 'error');
        } else {
            showToast(`${results.length} Element(e) gelöscht`, 'success');
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
        const results = await window.api.deletePermanent(paths);
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            showToast(`${failed.length} Fehler beim Löschen`, 'error');
        } else {
            showToast(`${results.length} Element(e) endgültig gelöscht`, 'success');
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

export async function showProperties(filePath) {
    const modal = document.getElementById('properties-modal');
    const body = document.getElementById('properties-body');
    if (!modal || !body) return;

    body.innerHTML = '<div class="loading-spinner"></div>';
    modal.style.display = 'flex';

    try {
        const props = await window.api.getProperties(filePath);
        if (props.error) {
            body.innerHTML = `<div style="color:var(--danger)">${escapeHtml(props.error)}</div>`;
            return;
        }

        const size = props.isDirectory
            ? `${formatBytes(props.totalSize || 0)} (Inhalt berechnet)`
            : formatBytes(props.size);

        body.innerHTML = `
            <div class="prop-row"><span class="prop-label">Name</span><span class="prop-value">${escapeHtml(props.name)}</span></div>
            <div class="prop-row"><span class="prop-label">Pfad</span><span class="prop-value">${escapeHtml(props.path)}</span></div>
            <div class="prop-row"><span class="prop-label">Typ</span><span class="prop-value">${props.isDirectory ? 'Ordner' : 'Datei'}</span></div>
            <div class="prop-row"><span class="prop-label">Größe</span><span class="prop-value">${size}</span></div>
            <div class="prop-row"><span class="prop-label">Erstellt</span><span class="prop-value">${formatDateTime(props.created)}</span></div>
            <div class="prop-row"><span class="prop-label">Geändert</span><span class="prop-value">${formatDateTime(props.modified)}</span></div>
            <div class="prop-row"><span class="prop-label">Letzter Zugriff</span><span class="prop-value">${formatDateTime(props.accessed)}</span></div>
            <div class="prop-row"><span class="prop-label">Schreibschutz</span><span class="prop-value">${props.readonly ? 'Ja' : 'Nein'}</span></div>
        `;
    } catch (e) {
        body.innerHTML = `<div style="color:var(--danger)">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('de-DE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

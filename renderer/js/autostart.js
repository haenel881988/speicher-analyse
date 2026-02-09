import { showToast } from './tree.js';

export class AutostartView {
    constructor(container) {
        this.container = container;
        this.entries = [];
        this.filter = 'all';
    }

    async init() {
        const platform = await window.api.getPlatform();
        if (platform !== 'win32') {
            this.container.innerHTML = '<div class="tool-placeholder">Autostart-Manager ist nur unter Windows verfügbar</div>';
            return;
        }
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="autostart-scan">Autostart laden</button>
                <select id="autostart-filter" class="filter-input">
                    <option value="all">Alle Quellen</option>
                    <option value="registry">Registry</option>
                    <option value="folder">Startordner</option>
                    <option value="task">Aufgabenplanung</option>
                </select>
                <div class="tool-summary" id="autostart-summary"></div>
            </div>
            <div class="tool-results" id="autostart-results">
                <div class="tool-placeholder">Klicke "Autostart laden" um alle Autostart-Einträge anzuzeigen</div>
            </div>
        `;

        this.container.querySelector('#autostart-scan').onclick = () => this.scan();
        this.container.querySelector('#autostart-filter').onchange = () => this.renderEntries();
    }

    async scan() {
        const resultsEl = this.container.querySelector('#autostart-results');
        resultsEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            this.entries = await window.api.getAutoStartEntries();
            this.renderEntries();
        } catch (e) {
            resultsEl.innerHTML = '<div class="tool-error">Fehler: ' + e.message + '<br>Möglicherweise sind Administratorrechte erforderlich.</div>';
        }
    }

    renderEntries() {
        const filter = this.container.querySelector('#autostart-filter').value;
        const filtered = filter === 'all' ? this.entries : this.entries.filter(e => e.source === filter);

        const summaryEl = this.container.querySelector('#autostart-summary');
        summaryEl.textContent = this.entries.length + ' Einträge gesamt · ' + filtered.length + ' angezeigt';

        const resultsEl = this.container.querySelector('#autostart-results');
        if (filtered.length === 0) {
            resultsEl.innerHTML = '<div class="tool-placeholder">Keine Autostart-Einträge gefunden</div>';
            return;
        }

        resultsEl.innerHTML = '<table class="tool-table"><thead><tr>' +
            '<th>Name</th><th>Befehl</th><th>Quelle</th><th>Status</th><th>Aktionen</th>' +
            '</tr></thead><tbody>' +
            filtered.map((entry, i) => '<tr class="' + (entry.exists === false ? 'autostart-invalid' : '') + '" data-index="' + i + '">' +
                '<td class="name-col">' + this.esc(entry.name) + '</td>' +
                '<td class="path-col" title="' + this.esc(entry.command) + '">' + this.esc(entry.command) + '</td>' +
                '<td>' + entry.locationLabel + '</td>' +
                '<td>' +
                    '<label class="toggle-switch">' +
                        '<input type="checkbox" class="autostart-toggle" data-index="' + i + '"' + (entry.enabled ? ' checked' : '') + '>' +
                        '<span class="toggle-slider"></span>' +
                    '</label>' +
                    (entry.exists === false ? ' <span class="badge-invalid">Ungültig</span>' : '') +
                '</td>' +
                '<td><button class="btn-sm btn-danger autostart-delete" data-index="' + i + '" title="Eintrag löschen">&#x2715;</button></td>' +
            '</tr>').join('') +
            '</tbody></table>';

        // Wire toggle switches
        const toggles = resultsEl.querySelectorAll('.autostart-toggle');
        toggles.forEach(toggle => {
            toggle.onchange = async () => {
                const idx = parseInt(toggle.dataset.index);
                const entry = filtered[idx];
                try {
                    const result = await window.api.toggleAutoStart(entry, toggle.checked);
                    if (result.success) {
                        entry.enabled = toggle.checked;
                        showToast(entry.name + (toggle.checked ? ' aktiviert' : ' deaktiviert'), 'success');
                    } else {
                        toggle.checked = !toggle.checked;
                        showToast('Fehler: ' + result.error, 'error');
                    }
                } catch (e) {
                    toggle.checked = !toggle.checked;
                    showToast('Fehler: ' + e.message, 'error');
                }
            };
        });

        // Wire delete buttons
        resultsEl.querySelectorAll('.autostart-delete').forEach(btn => {
            btn.onclick = async () => {
                const idx = parseInt(btn.dataset.index);
                const entry = filtered[idx];
                const confirmResult = await window.api.showConfirmDialog({
                    type: 'warning',
                    title: 'Autostart-Eintrag löschen',
                    message: '"' + entry.name + '" aus dem Autostart entfernen?',
                    buttons: ['Abbrechen', 'Löschen'],
                    defaultId: 0,
                });
                if (confirmResult.response !== 1) return;
                try {
                    const result = await window.api.deleteAutoStart(entry);
                    if (result.success) {
                        showToast(entry.name + ' entfernt', 'success');
                        this.scan();
                    } else {
                        showToast('Fehler: ' + result.error, 'error');
                    }
                } catch (e) {
                    showToast('Fehler: ' + e.message, 'error');
                }
            };
        });
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

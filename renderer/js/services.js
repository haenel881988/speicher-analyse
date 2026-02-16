import { showToast } from './tree.js';

export class ServicesView {
    constructor(container) {
        this.container = container;
        this.services = [];
    }

    async init() {
        const platform = await window.api.getPlatform();
        if (platform !== 'win32') {
            this.container.innerHTML = '<div class="tool-placeholder">Dienste-Ansicht ist nur unter Windows verfügbar</div>';
            return;
        }
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="tool-toolbar">
                <button class="btn btn-primary" id="services-load">Dienste laden</button>
                <select id="services-filter" class="filter-input">
                    <option value="all">Alle</option>
                    <option value="Running">Aktiv</option>
                    <option value="Stopped">Gestoppt</option>
                </select>
                <input type="text" id="services-search" class="filter-input" placeholder="Dienst suchen..." style="width:200px">
                <div class="tool-summary" id="services-summary"></div>
            </div>
            <div class="tool-results" id="services-results">
                <div class="tool-placeholder">Klicke "Dienste laden" um Windows-Dienste anzuzeigen</div>
            </div>
        `;

        this.container.querySelector('#services-load').onclick = () => this.load();
        this.container.querySelector('#services-filter').onchange = () => this.renderTable();
        this.container.querySelector('#services-search').oninput = () => this.renderTable();
    }

    async load() {
        const resultsEl = this.container.querySelector('#services-results');
        resultsEl.innerHTML = '<div class="loading-spinner"></div>';

        try {
            this.services = await window.api.getServices();
            this.renderTable();
        } catch (e) {
            resultsEl.innerHTML = '<div class="tool-error">Fehler: ' + this.esc(e.message) + '<br>Möglicherweise sind Administratorrechte erforderlich.</div>';
        }
    }

    renderTable() {
        const filter = this.container.querySelector('#services-filter').value;
        const search = this.container.querySelector('#services-search').value.toLowerCase();

        let filtered = this.services;
        if (filter !== 'all') filtered = filtered.filter(s => s.status === filter);
        if (search) filtered = filtered.filter(s =>
            s.name.toLowerCase().includes(search) || s.displayName.toLowerCase().includes(search));

        const running = this.services.filter(s => s.status === 'Running').length;
        const stopped = this.services.filter(s => s.status === 'Stopped').length;

        const summaryEl = this.container.querySelector('#services-summary');
        summaryEl.textContent = this.services.length + ' Dienste · ' + running + ' aktiv · ' + stopped + ' gestoppt · ' + filtered.length + ' angezeigt';

        const resultsEl = this.container.querySelector('#services-results');
        resultsEl.innerHTML = '<table class="tool-table"><thead><tr>' +
            '<th style="width:40px">Status</th><th>Anzeigename</th><th>Dienstname</th><th>Starttyp</th><th style="width:80px">Aktionen</th>' +
            '</tr></thead><tbody>' +
            filtered.map(s => {
                const statusIcon = s.status === 'Running' ? '<span class="service-status service-running">&#x25CF;</span>' : '<span class="service-status service-stopped">&#x25CB;</span>';
                return '<tr data-name="' + this.esc(s.name) + '">' +
                    '<td>' + statusIcon + '</td>' +
                    '<td>' + this.esc(s.displayName) + '</td>' +
                    '<td class="path-col">' + this.esc(s.name) + '</td>' +
                    '<td><select class="service-starttype" data-name="' + this.esc(s.name) + '">' +
                        '<option value="auto"' + (s.startType === 'Automatic' ? ' selected' : '') + '>Automatisch</option>' +
                        '<option value="demand"' + (s.startType === 'Manual' ? ' selected' : '') + '>Manuell</option>' +
                        '<option value="disabled"' + (s.startType === 'Disabled' ? ' selected' : '') + '>Deaktiviert</option>' +
                    '</select></td>' +
                    '<td>' + (s.status === 'Stopped'
                        ? '<button class="btn-sm service-action" data-name="' + this.esc(s.name) + '" data-action="start" title="Starten">&#x25B6;</button>'
                        : '<button class="btn-sm service-action" data-name="' + this.esc(s.name) + '" data-action="stop" title="Stoppen">&#x25A0;</button>') +
                    '</td></tr>';
            }).join('') +
            '</tbody></table>';

        // Wire action buttons
        resultsEl.querySelectorAll('.service-action').forEach(btn => {
            btn.onclick = async () => {
                const name = btn.dataset.name;
                const action = btn.dataset.action;

                if (action === 'stop') {
                    const confirmResult = await window.api.showConfirmDialog({
                        type: 'warning',
                        title: 'Dienst stoppen',
                        message: 'Dienst "' + name + '" stoppen?',
                        buttons: ['Abbrechen', 'Stoppen'],
                        defaultId: 0,
                    });
                    if (confirmResult.response !== 1) return;
                }

                try {
                    const result = await window.api.controlService(name, action);
                    if (result.success) {
                        showToast(name + (action === 'start' ? ' gestartet' : ' gestoppt'), 'success');
                        setTimeout(() => this.load(), 1000);
                    } else {
                        showToast('Fehler: ' + result.error, 'error');
                    }
                } catch (e) {
                    showToast('Fehler: ' + e.message, 'error');
                }
            };
        });

        // Wire start type changes
        resultsEl.querySelectorAll('.service-starttype').forEach(sel => {
            sel.onchange = async () => {
                const name = sel.dataset.name;
                try {
                    const result = await window.api.setServiceStartType(name, sel.value);
                    if (result.success) {
                        showToast('Starttyp für ' + name + ' geändert', 'success');
                    } else {
                        showToast('Fehler: ' + result.error, 'error');
                        this.load();
                    }
                } catch (e) {
                    showToast('Fehler: ' + e.message, 'error');
                }
            };
        });
    }

    esc(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}

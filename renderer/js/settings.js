/**
 * Settings View - Configuration for System Tray, Global Hotkey, Shell Integration
 */

export class SettingsView {
    constructor(container) {
        this.container = container;
        this.loaded = false;
    }

    async load() {
        if (this.loaded) return;
        this.loaded = true;
        await this.render();
    }

    async render() {
        // Load current state
        const [hotkey, shellRegistered] = await Promise.all([
            window.api.getGlobalHotkey(),
            window.api.isShellContextMenuRegistered(),
        ]);

        this.container.innerHTML = `
            <div class="settings-page">
                <h2 class="settings-title">Einstellungen</h2>

                <div class="settings-section">
                    <h3 class="settings-section-title">System Tray</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Minimize to Tray</strong>
                            <span class="settings-desc">App wird beim Schlie\u00DFen in den System-Tray minimiert statt beendet.</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-badge settings-badge-active">Aktiv</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Tray-Kontextmen\u00FC</strong>
                            <span class="settings-desc">Rechtsklick auf Tray-Icon: Schnell-Scan, Duplikate pr\u00FCfen, Beenden.</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-badge settings-badge-active">Aktiv</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">Globaler Hotkey</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>App fokussieren / verstecken</strong>
                            <span class="settings-desc">Dr\u00FCcke den Hotkey, um die App von \u00FCberall zu \u00F6ffnen oder zu verstecken.</span>
                        </div>
                        <div class="settings-value">
                            <input type="text" class="settings-hotkey-input" id="settings-hotkey"
                                   value="${hotkey || 'Ctrl+Shift+S'}" readonly
                                   placeholder="Klicken + Tastenkombination dr\u00FCcken">
                            <button class="settings-btn" id="settings-hotkey-record">
                                \u00C4ndern
                            </button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">Windows Explorer Integration</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>"Mit Speicher Analyse \u00F6ffnen"</strong>
                            <span class="settings-desc">F\u00FCgt einen Eintrag zum Windows-Explorer-Kontextmen\u00FC hinzu (nur f\u00FCr aktuellen Benutzer).</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-badge ${shellRegistered ? 'settings-badge-active' : 'settings-badge-inactive'}"
                                  id="settings-shell-status">${shellRegistered ? 'Registriert' : 'Nicht registriert'}</span>
                            <button class="settings-btn" id="settings-shell-toggle">
                                ${shellRegistered ? 'Entfernen' : 'Registrieren'}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">Datei-Tags</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Farb-Labels</strong>
                            <span class="settings-desc">Markiere Dateien und Ordner mit Farben (Rechtsklick \u2192 Tag). Tags werden lokal gespeichert.</span>
                        </div>
                        <div class="settings-value settings-tag-colors" id="settings-tag-preview"></div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Tags verwalten</strong>
                            <span class="settings-desc">Gespeicherte Tags anzeigen und l\u00F6schen.</span>
                        </div>
                        <div class="settings-value">
                            <button class="settings-btn" id="settings-show-all-tags">Alle Tags anzeigen</button>
                            <span class="settings-tag-count" id="settings-tag-count"></span>
                        </div>
                    </div>
                    <div class="settings-tags-list" id="settings-tags-list" style="display:none"></div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">\u00DCber</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Speicher Analyse</strong>
                            <span class="settings-desc">Disk Space Analyzer & System Optimizer</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-version">v7.0</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._wireEvents();
        this._renderTagPreview();
        this._updateTagCount();
    }

    _wireEvents() {
        // Hotkey recording
        const hotkeyInput = this.container.querySelector('#settings-hotkey');
        const hotkeyBtn = this.container.querySelector('#settings-hotkey-record');
        let recording = false;

        hotkeyBtn.addEventListener('click', () => {
            if (!recording) {
                recording = true;
                hotkeyBtn.textContent = 'Dr\u00FCcke Tasten...';
                hotkeyInput.value = '';
                hotkeyInput.focus();
                hotkeyInput.classList.add('recording');

                const handler = async (e) => {
                    e.preventDefault();
                    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

                    const parts = [];
                    if (e.ctrlKey) parts.push('Ctrl');
                    if (e.shiftKey) parts.push('Shift');
                    if (e.altKey) parts.push('Alt');
                    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
                    const accelerator = parts.join('+');

                    hotkeyInput.value = accelerator;
                    hotkeyInput.classList.remove('recording');
                    hotkeyBtn.textContent = '\u00C4ndern';
                    recording = false;
                    hotkeyInput.removeEventListener('keydown', handler);

                    const result = await window.api.setGlobalHotkey(accelerator);
                    if (!result.success) {
                        hotkeyInput.value = result.error || 'Fehler';
                        setTimeout(() => { hotkeyInput.value = accelerator; }, 2000);
                    }
                };

                hotkeyInput.addEventListener('keydown', handler);
            }
        });

        // Shell integration toggle
        const shellBtn = this.container.querySelector('#settings-shell-toggle');
        const shellStatus = this.container.querySelector('#settings-shell-status');
        shellBtn.addEventListener('click', async () => {
            shellBtn.disabled = true;
            const isRegistered = shellStatus.textContent === 'Registriert';
            try {
                if (isRegistered) {
                    await window.api.unregisterShellContextMenu();
                    shellStatus.textContent = 'Nicht registriert';
                    shellStatus.className = 'settings-badge settings-badge-inactive';
                    shellBtn.textContent = 'Registrieren';
                } else {
                    await window.api.registerShellContextMenu();
                    shellStatus.textContent = 'Registriert';
                    shellStatus.className = 'settings-badge settings-badge-active';
                    shellBtn.textContent = 'Entfernen';
                }
            } catch (err) {
                shellStatus.textContent = 'Fehler';
            }
            shellBtn.disabled = false;
        });

        // Show all tags
        const showTagsBtn = this.container.querySelector('#settings-show-all-tags');
        const tagsList = this.container.querySelector('#settings-tags-list');
        showTagsBtn.addEventListener('click', async () => {
            if (tagsList.style.display === 'none') {
                await this._renderAllTags();
                tagsList.style.display = '';
                showTagsBtn.textContent = 'Ausblenden';
            } else {
                tagsList.style.display = 'none';
                showTagsBtn.textContent = 'Alle Tags anzeigen';
            }
        });
    }

    _renderTagPreview() {
        const preview = this.container.querySelector('#settings-tag-preview');
        if (!preview) return;
        const colors = {
            red: '#e94560', orange: '#ff8c42', yellow: '#ffc107',
            green: '#4ecca3', blue: '#00b4d8', purple: '#6c5ce7', gray: '#8b8fa3',
        };
        let html = '';
        for (const [name, hex] of Object.entries(colors)) {
            html += `<span class="settings-tag-sample" style="background:${hex}" title="${name}"></span>`;
        }
        preview.innerHTML = html;
    }

    async _updateTagCount() {
        const countEl = this.container.querySelector('#settings-tag-count');
        if (!countEl) return;
        try {
            const tags = await window.api.getAllTags();
            countEl.textContent = `${tags.length} Tag${tags.length !== 1 ? 's' : ''} gespeichert`;
        } catch { countEl.textContent = ''; }
    }

    async _renderAllTags() {
        const tagsList = this.container.querySelector('#settings-tags-list');
        if (!tagsList) return;
        try {
            const tags = await window.api.getAllTags();
            if (tags.length === 0) {
                tagsList.innerHTML = '<div class="settings-no-tags">Keine Tags gespeichert</div>';
                return;
            }
            const colors = {
                red: '#e94560', orange: '#ff8c42', yellow: '#ffc107',
                green: '#4ecca3', blue: '#00b4d8', purple: '#6c5ce7', gray: '#8b8fa3',
            };
            let html = '<table class="settings-tags-table"><thead><tr><th>Farbe</th><th>Datei</th><th>Pfad</th><th></th></tr></thead><tbody>';
            for (const tag of tags) {
                const hex = colors[tag.color] || '#888';
                const name = tag.path.split('\\').pop();
                const dir = tag.path.substring(0, tag.path.lastIndexOf('\\'));
                html += `<tr>
                    <td><span class="settings-tag-sample" style="background:${hex}"></span></td>
                    <td>${this._esc(name)}</td>
                    <td class="settings-tag-path" title="${this._esc(tag.path)}">${this._esc(dir)}</td>
                    <td><button class="settings-tag-remove" data-path="${this._esc(tag.path)}">Entfernen</button></td>
                </tr>`;
            }
            html += '</tbody></table>';
            tagsList.innerHTML = html;

            tagsList.querySelectorAll('.settings-tag-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await window.api.removeFileTag(btn.dataset.path);
                    btn.closest('tr').remove();
                    this._updateTagCount();
                });
            });
        } catch {
            tagsList.innerHTML = '<div class="settings-no-tags">Fehler beim Laden der Tags</div>';
        }
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

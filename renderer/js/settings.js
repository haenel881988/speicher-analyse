/**
 * Settings View - Zentrale Konfiguration (v7.4)
 * 7 Sektionen: Session, Energie, Allgemein, Hotkey, Terminal, Integration, Über
 */

export class SettingsView {
    constructor(container) {
        this.container = container;
        this.loaded = false;
        this.prefs = {};
        this.availableShells = [];
    }

    async load() {
        if (this.loaded) return;
        this.loaded = true;
        await this.render();
    }

    async render() {
        const [prefs, hotkey, shellRegistered, sessionInfo, batteryStatus, shells] = await Promise.all([
            window.api.getPreferences(),
            window.api.getGlobalHotkey(),
            window.api.isShellContextMenuRegistered(),
            window.api.getSessionInfo(),
            window.api.getBatteryStatus().catch(() => ({ onBattery: false })),
            window.api.terminalGetShells().catch(() => [{ id: 'powershell', label: 'PowerShell', available: true }]),
        ]);

        this.prefs = prefs;
        this.availableShells = shells;

        const sessionInfoText = sessionInfo.exists
            ? `Letzte Session: ${new Date(sessionInfo.savedAt).toLocaleString('de-DE')} (${this._formatSize(sessionInfo.fileSize)}, ${sessionInfo.scanCount} Scan${sessionInfo.scanCount !== 1 ? 's' : ''})`
            : 'Keine gespeicherte Session vorhanden';

        const batteryText = batteryStatus.onBattery
            ? `Aktuell: Akkubetrieb`
            : `Aktuell: Netzbetrieb`;

        const shellOptions = shells.map(s =>
            `<option value="${s.id}" ${!s.available ? 'disabled' : ''} ${s.id === prefs.terminalShell ? 'selected' : ''}>${s.label}</option>`
        ).join('');

        const isDark = prefs.theme === 'dark';

        this.container.innerHTML = `
            <div class="settings-page">
                <h2 class="settings-title">Einstellungen</h2>

                <!-- Sektion 1: Session & Wiederherstellung -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Session & Wiederherstellung</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Scan-Daten beim Start wiederherstellen</strong>
                            <span class="settings-desc">Beim nächsten App-Start werden die gespeicherten Scan-Daten automatisch geladen.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.sessionRestore ? 'active' : ''}" data-key="sessionRestore"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Automatisch beim Schließen speichern</strong>
                            <span class="settings-desc">Scan-Daten werden beim Beenden der App automatisch gesichert.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.sessionSaveOnClose ? 'active' : ''}" data-key="sessionSaveOnClose"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Nach jedem Scan speichern</strong>
                            <span class="settings-desc">Session wird automatisch nach Abschluss eines Scans gesichert.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.sessionSaveAfterScan ? 'active' : ''}" data-key="sessionSaveAfterScan"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Session-Status</strong>
                            <span class="settings-desc" id="settings-session-info">${this._esc(sessionInfoText)}</span>
                        </div>
                        <div class="settings-value">
                            <button class="settings-btn" id="settings-save-session">Jetzt speichern</button>
                        </div>
                    </div>
                </div>

                <!-- Sektion 2: Energieverwaltung -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Energieverwaltung</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Energiemodus</strong>
                            <span class="settings-desc">Steuert, wie die App Hintergrundaktivitäten reguliert.</span>
                        </div>
                        <div class="settings-value">
                            <select class="settings-select" id="settings-energy-mode">
                                <option value="auto" ${prefs.energyMode === 'auto' ? 'selected' : ''}>Automatisch</option>
                                <option value="performance" ${prefs.energyMode === 'performance' ? 'selected' : ''}>Leistung</option>
                                <option value="powersave" ${prefs.energyMode === 'powersave' ? 'selected' : ''}>Energiesparen</option>
                            </select>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Energiesparmodus ab</strong>
                            <span class="settings-desc">Schwellwert für automatischen Energiesparmodus (nur bei "Automatisch").</span>
                        </div>
                        <div class="settings-value settings-range-group">
                            <input type="range" class="settings-range" id="settings-battery-threshold"
                                   min="10" max="80" step="5" value="${prefs.batteryThreshold}">
                            <span class="settings-range-value" id="settings-battery-threshold-val">${prefs.batteryThreshold}%</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Hintergrund-Tasks auf Akku deaktivieren</strong>
                            <span class="settings-desc">Unterdrückt automatische Aktualisierungen im Akkubetrieb.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.disableBackgroundOnBattery ? 'active' : ''}" data-key="disableBackgroundOnBattery"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Stromversorgung</strong>
                            <span class="settings-desc" id="settings-battery-status">${this._esc(batteryText)}</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-badge ${batteryStatus.onBattery ? 'settings-badge-inactive' : 'settings-badge-active'}">
                                ${batteryStatus.onBattery ? 'Akku' : 'Netz'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Sektion 3: Allgemein -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Allgemein</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>In System-Tray minimieren</strong>
                            <span class="settings-desc">X-Button: App in den Tray minimieren statt beenden. Deaktiviert = App wird beim Schließen beendet.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.minimizeToTray ? 'active' : ''}" data-key="minimizeToTray"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Im System-Tray starten</strong>
                            <span class="settings-desc">App startet minimiert im Hintergrund.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.startMinimized ? 'active' : ''}" data-key="startMinimized"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Benachrichtigung nach Scan</strong>
                            <span class="settings-desc">Zeigt eine Desktop-Benachrichtigung nach Abschluss eines Scans.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.showScanNotification ? 'active' : ''}" data-key="showScanNotification"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Farbschema</strong>
                            <span class="settings-desc">Wechsel zwischen dunklem und hellem Design.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-theme-switch" id="settings-theme-switch">
                                <span class="settings-theme-option ${isDark ? 'active' : ''}" data-theme="dark">Dunkel</span>
                                <span class="settings-theme-option ${!isDark ? 'active' : ''}" data-theme="light">Hell</span>
                            </div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Speichergrößen farblich hervorheben</strong>
                            <span class="settings-desc">Markiert große Dateien und Ordner im Explorer farblich (rot >1GB, orange >100MB, gelb >10MB).</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.showSizeColors ? 'active' : ''}" data-key="showSizeColors"></div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Intelligentes Layout</strong>
                            <span class="settings-desc">Passt Sidebar, Panels und Content automatisch an die Fenstergröße an. Sidebar klappt bei schmalen Fenstern zu, bei breiten auf.</span>
                        </div>
                        <div class="settings-value">
                            <div class="settings-toggle ${prefs.smartLayout ? 'active' : ''}" data-key="smartLayout"></div>
                        </div>
                    </div>
                </div>

                <!-- Sektion 4: Globaler Hotkey -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Globaler Hotkey</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>App fokussieren / verstecken</strong>
                            <span class="settings-desc">Drücke den Hotkey, um die App von überall zu öffnen oder zu verstecken.</span>
                        </div>
                        <div class="settings-value">
                            <input type="text" class="settings-hotkey-input" id="settings-hotkey"
                                   value="${hotkey || prefs.globalHotkey || 'Ctrl+Shift+S'}" readonly
                                   placeholder="Klicken + Tastenkombination drücken">
                            <button class="settings-btn" id="settings-hotkey-record">Ändern</button>
                        </div>
                    </div>
                </div>

                <!-- Sektion 5: Terminal -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Terminal</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Standard-Shell</strong>
                            <span class="settings-desc">Shell, die beim Öffnen des Terminals verwendet wird.</span>
                        </div>
                        <div class="settings-value">
                            <select class="settings-select" id="settings-terminal-shell">${shellOptions}</select>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Schriftgröße</strong>
                            <span class="settings-desc">Schriftgröße im eingebetteten Terminal.</span>
                        </div>
                        <div class="settings-value settings-range-group">
                            <input type="range" class="settings-range" id="settings-terminal-fontsize"
                                   min="10" max="20" step="1" value="${prefs.terminalFontSize}">
                            <span class="settings-range-value" id="settings-terminal-fontsize-val">${prefs.terminalFontSize}px</span>
                        </div>
                    </div>
                </div>

                <!-- Sektion 6: Windows Integration -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Windows Integration</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>"Mit Speicher Analyse öffnen"</strong>
                            <span class="settings-desc">Fügt einen Eintrag zum Windows-Explorer-Kontextmenü hinzu (nur für aktuellen Benutzer).</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-badge ${shellRegistered ? 'settings-badge-active' : 'settings-badge-inactive'}"
                                  id="settings-shell-status">${shellRegistered ? 'Registriert' : 'Nicht registriert'}</span>
                            <button class="settings-btn" id="settings-shell-toggle">
                                ${shellRegistered ? 'Entfernen' : 'Registrieren'}
                            </button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Datei-Tags</strong>
                            <span class="settings-desc">Markiere Dateien und Ordner mit Farben (Rechtsklick → Tag). Tags werden lokal gespeichert.</span>
                        </div>
                        <div class="settings-value settings-tag-colors" id="settings-tag-preview"></div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Tags verwalten</strong>
                            <span class="settings-desc">Gespeicherte Tags anzeigen und löschen.</span>
                        </div>
                        <div class="settings-value">
                            <button class="settings-btn" id="settings-show-all-tags">Alle Tags anzeigen</button>
                            <span class="settings-tag-count" id="settings-tag-count"></span>
                        </div>
                    </div>
                    <div class="settings-tags-list" id="settings-tags-list" style="display:none"></div>
                </div>

                <!-- Sektion 7: Über -->
                <div class="settings-section">
                    <h3 class="settings-section-title">Über</h3>
                    <div class="settings-row">
                        <div class="settings-label">
                            <strong>Speicher Analyse</strong>
                            <span class="settings-desc">Disk Space Analyzer & System Optimizer</span>
                        </div>
                        <div class="settings-value">
                            <span class="settings-version">v7.2.1</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._wireEvents();
        this._renderTagPreview();
        this._updateTagCount();
    }

    async _setPref(key, value) {
        this.prefs[key] = value;
        await window.api.setPreference(key, value);
        document.dispatchEvent(new CustomEvent('settings-pref-change', { detail: { key, value } }));
    }

    _wireEvents() {
        // === Toggle Switches ===
        this.container.querySelectorAll('.settings-toggle[data-key]').forEach(toggle => {
            toggle.addEventListener('click', async () => {
                const key = toggle.dataset.key;
                const newVal = !this.prefs[key];
                toggle.classList.toggle('active', newVal);
                await this._setPref(key, newVal);
            });
        });

        // === Session: Jetzt speichern ===
        const saveSessionBtn = this.container.querySelector('#settings-save-session');
        saveSessionBtn.addEventListener('click', async () => {
            saveSessionBtn.disabled = true;
            saveSessionBtn.textContent = 'Speichert...';
            try {
                const result = await window.api.saveSessionNow({});
                const infoEl = this.container.querySelector('#settings-session-info');
                if (result.success) {
                    saveSessionBtn.textContent = 'Gespeichert!';
                    // Refresh session info
                    const info = await window.api.getSessionInfo();
                    if (info.exists && infoEl) {
                        infoEl.textContent = `Letzte Session: ${new Date(info.savedAt).toLocaleString('de-DE')} (${this._formatSize(info.fileSize)}, ${info.scanCount} Scan${info.scanCount !== 1 ? 's' : ''})`;
                    }
                } else {
                    saveSessionBtn.textContent = 'Keine Daten';
                }
            } catch {
                saveSessionBtn.textContent = 'Fehler';
            }
            setTimeout(() => {
                saveSessionBtn.textContent = 'Jetzt speichern';
                saveSessionBtn.disabled = false;
            }, 2000);
        });

        // === Energiemodus Dropdown ===
        const energyMode = this.container.querySelector('#settings-energy-mode');
        energyMode.addEventListener('change', async () => {
            await this._setPref('energyMode', energyMode.value);
        });

        // === Battery Threshold Slider ===
        const batterySlider = this.container.querySelector('#settings-battery-threshold');
        const batteryVal = this.container.querySelector('#settings-battery-threshold-val');
        batterySlider.addEventListener('input', () => {
            batteryVal.textContent = `${batterySlider.value}%`;
        });
        batterySlider.addEventListener('change', async () => {
            await this._setPref('batteryThreshold', parseInt(batterySlider.value, 10));
        });

        // === Theme Switch ===
        const themeSwitch = this.container.querySelector('#settings-theme-switch');
        themeSwitch.querySelectorAll('.settings-theme-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const newTheme = opt.dataset.theme;
                if (newTheme === this.prefs.theme) return;
                themeSwitch.querySelectorAll('.settings-theme-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                await this._setPref('theme', newTheme);
                // Trigger global theme toggle
                document.dispatchEvent(new CustomEvent('settings-theme-change', { detail: { theme: newTheme } }));
            });
        });

        // === Hotkey Recording ===
        const hotkeyInput = this.container.querySelector('#settings-hotkey');
        const hotkeyBtn = this.container.querySelector('#settings-hotkey-record');
        let recording = false;

        hotkeyBtn.addEventListener('click', () => {
            if (!recording) {
                recording = true;
                hotkeyBtn.textContent = 'Drücke Tasten...';
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
                    hotkeyBtn.textContent = 'Ändern';
                    recording = false;
                    hotkeyInput.removeEventListener('keydown', handler);

                    const result = await window.api.setGlobalHotkey(accelerator);
                    if (result.success) {
                        await this._setPref('globalHotkey', accelerator);
                    } else {
                        hotkeyInput.value = result.error || 'Fehler';
                        setTimeout(() => { hotkeyInput.value = accelerator; }, 2000);
                    }
                };

                hotkeyInput.addEventListener('keydown', handler);
            }
        });

        // === Terminal Shell Dropdown ===
        const shellSelect = this.container.querySelector('#settings-terminal-shell');
        shellSelect.addEventListener('change', async () => {
            await this._setPref('terminalShell', shellSelect.value);
        });

        // === Terminal Font Size Slider ===
        const fontSlider = this.container.querySelector('#settings-terminal-fontsize');
        const fontVal = this.container.querySelector('#settings-terminal-fontsize-val');
        fontSlider.addEventListener('input', () => {
            fontVal.textContent = `${fontSlider.value}px`;
        });
        fontSlider.addEventListener('change', async () => {
            await this._setPref('terminalFontSize', parseInt(fontSlider.value, 10));
        });

        // === Shell Integration Toggle ===
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
            } catch {
                shellStatus.textContent = 'Fehler';
            }
            shellBtn.disabled = false;
        });

        // === Show All Tags ===
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

    _formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    _esc(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

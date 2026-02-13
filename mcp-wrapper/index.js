const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const puppeteer = require('puppeteer-core');

const DEBUG_URL = 'http://127.0.0.1:9222';
const APP_NOT_RUNNING = 'Fehler: Die App "Speicher Analyse" läuft nicht. Bitte starte erst die App mit: node launch.js';

// Shared browser/page connection (lazy, reconnects on failure)
let _browser = null;
let _page = null;

/**
 * Connect to the running Electron app via Chrome DevTools Protocol.
 * Returns the Puppeteer page object.
 */
async function getPage() {
    // Check if existing connection is still alive
    if (_browser && _page) {
        try {
            await _page.evaluate(() => true);
            return _page;
        } catch {
            _browser = null;
            _page = null;
        }
    }

    try {
        _browser = await puppeteer.connect({
            browserURL: DEBUG_URL,
            defaultViewport: null,
        });
        const pages = await _browser.pages();
        // Find the main app page (not devtools)
        _page = pages.find(p => p.url().includes('index.html')) || pages[0];
        return _page;
    } catch (err) {
        throw new Error(APP_NOT_RUNNING);
    }
}

/**
 * Wraps a Puppeteer action with error handling for MCP.
 */
async function withPage(action) {
    try {
        const page = await getPage();
        const result = await action(page);
        return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
    } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
    }
}

// ===== MCP Server =====

const server = new McpServer({
    name: 'speicher-analyse',
    version: '2.0.0',
}, {
    capabilities: { tools: {} },
});

// --- Screenshot ---
server.tool(
    'screenshot',
    'Macht einen Screenshot der App und gibt ihn als Base64-Bild zurück.',
    {},
    async () => {
        try {
            const page = await getPage();
            const buffer = await page.screenshot({ encoding: 'binary' });
            const base64 = Buffer.from(buffer).toString('base64');
            return {
                content: [{
                    type: 'image',
                    data: base64,
                    mimeType: 'image/png',
                }],
            };
        } catch (err) {
            return { content: [{ type: 'text', text: err.message }], isError: true };
        }
    }
);

// --- Click ---
server.tool(
    'click',
    'Klickt auf ein Element in der App (CSS-Selektor). Beispiel: ".btn-scan", "#sidebar-toggle"',
    {
        selector: z.string().describe('CSS-Selektor des Elements, z.B. ".btn-scan" oder "button[data-tab=explorer]"'),
    },
    async ({ selector }) => {
        return withPage(async (page) => {
            await page.click(selector);
            await page.waitForNetworkIdle({ idleTime: 300, timeout: 3000 }).catch(() => {});
            return `Geklickt: ${selector}`;
        });
    }
);

// --- Eingabe ---
server.tool(
    'type_text',
    'Tippt Text in ein Eingabefeld. Zuerst wird das Feld geleert, dann der neue Text eingegeben.',
    {
        selector: z.string().describe('CSS-Selektor des Eingabefelds'),
        text: z.string().describe('Der zu tippende Text'),
    },
    async ({ selector, text }) => {
        return withPage(async (page) => {
            await page.click(selector, { count: 3 }); // Select all
            await page.type(selector, text);
            return `Text eingegeben in ${selector}: "${text}"`;
        });
    }
);

// --- Text lesen ---
server.tool(
    'read_text',
    'Liest den sichtbaren Text eines Elements (oder der ganzen Seite wenn kein Selektor angegeben).',
    {
        selector: z.string().optional().describe('CSS-Selektor (optional, liest sonst die ganze Seite)'),
    },
    async ({ selector }) => {
        return withPage(async (page) => {
            if (selector) {
                return await page.$eval(selector, el => el.innerText);
            }
            return await page.evaluate(() => document.body.innerText);
        });
    }
);

// --- Elemente auflisten ---
server.tool(
    'list_elements',
    'Listet alle Elemente auf, die zu einem CSS-Selektor passen. Gibt Tag, Text, Klassen und ID zurück.',
    {
        selector: z.string().describe('CSS-Selektor, z.B. ".sidebar-nav-btn" oder "button"'),
    },
    async ({ selector }) => {
        return withPage(async (page) => {
            return await page.$$eval(selector, elements =>
                elements.map(el => ({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    class: el.className || undefined,
                    text: el.innerText?.substring(0, 100) || '',
                    visible: el.offsetParent !== null,
                    dataset: Object.fromEntries(Object.entries(el.dataset)),
                }))
            );
        });
    }
);

// --- Tab wechseln ---
server.tool(
    'switch_tab',
    'Wechselt zu einem Sidebar-Tab. Verfügbare Tabs: dashboard, explorer, treemap, charts, duplicates, old-files, cleanup, registry, autostart, services, bloatware, optimizer, updates, privacy, smart, software-audit, network, system-score, scan-compare',
    {
        tab: z.string().describe('Tab-Name, z.B. "explorer", "dashboard", "privacy"'),
    },
    async ({ tab }) => {
        return withPage(async (page) => {
            await page.click(`.sidebar-nav-btn[data-tab="${tab}"]`);
            await new Promise(r => setTimeout(r, 500));
            return `Tab gewechselt: ${tab}`;
        });
    }
);

// --- JavaScript ausführen ---
server.tool(
    'eval_js',
    'Führt beliebiges JavaScript im Frontend der App aus und gibt das Ergebnis zurück.',
    {
        code: z.string().describe('JavaScript-Code der im Browser-Kontext ausgeführt wird'),
    },
    async ({ code }) => {
        return withPage(async (page) => {
            const result = await page.evaluate(code);
            return result;
        });
    }
);

// --- Scan starten ---
server.tool(
    'start_scan',
    'Startet einen Festplatten-Scan. Klickt den Scan-Button in der App.',
    {
        drive: z.string().optional().describe('Laufwerk auswählen, z.B. "C:\\\\" (optional)'),
    },
    async ({ drive }) => {
        return withPage(async (page) => {
            // Optionally select a drive first
            if (drive) {
                await page.select('#toolbar-drive-select', drive);
                await new Promise(r => setTimeout(r, 300));
            }
            await page.click('#btn-scan');
            return 'Scan gestartet' + (drive ? ` für ${drive}` : '');
        });
    }
);

// --- App-Status ---
server.tool(
    'get_status',
    'Prüft ob die App läuft und gibt den aktuellen Zustand zurück (aktiver Tab, Scan-Status, etc.).',
    {},
    async () => {
        return withPage(async (page) => {
            return await page.evaluate(() => {
                const activeTab = document.querySelector('.tab-content.active')?.id || 'unknown';
                const statusBar = document.querySelector('.status-bar')?.innerText || '';
                const scanning = !!document.querySelector('.progress-bar.active');
                return {
                    status: 'ready',
                    activeTab,
                    statusBar,
                    scanning,
                    title: document.title,
                    url: location.href,
                };
            });
        });
    }
);

// ===== Start =====

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`MCP Server Fehler: ${err.message}\n`);
    process.exit(1);
});

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const axios = require('axios');

const API_BASE = 'http://127.0.0.1:3333';

const APP_NOT_RUNNING = 'Fehler: Die App "Speicher Analyse" läuft nicht. Bitte starte erst die App.';

/**
 * Helper: Call the Speicher Analyse API and handle connection errors.
 */
async function callApi(method, path, data) {
    try {
        const url = `${API_BASE}${path}`;
        const response = method === 'get'
            ? await axios.get(url, { timeout: 10000 })
            : await axios.post(url, data, { timeout: 30000 });
        return response.data;
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
            return { _error: APP_NOT_RUNNING };
        }
        return { _error: `API-Fehler: ${err.message}` };
    }
}

/**
 * Format a result for MCP tool response.
 */
function formatResult(data) {
    if (data._error) {
        return { content: [{ type: 'text', text: data._error }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// Create the MCP server
const server = new McpServer({
    name: 'speicher-analyse',
    version: '1.0.0',
}, {
    capabilities: { tools: {} },
});

// Tool: get_status
server.tool(
    'get_status',
    'Prüft ob die Speicher Analyse App läuft und gibt Version + Status zurück.',
    {},
    async () => {
        const data = await callApi('get', '/status');
        return formatResult(data);
    }
);

// Tool: get_system_info
server.tool(
    'get_system_info',
    'Gibt Systeminformationen zurück (Hostname, OS, RAM, CPUs, Uptime).',
    {},
    async () => {
        const data = await callApi('get', '/system-info');
        return formatResult(data);
    }
);

// Tool: get_drives
server.tool(
    'get_drives',
    'Listet alle verfügbaren Laufwerke auf (Buchstabe, Typ, Gesamtgröße, freier Speicher).',
    {},
    async () => {
        const data = await callApi('get', '/drives');
        return formatResult(data);
    }
);

// Tool: start_scan
server.tool(
    'start_scan',
    'Startet einen Festplatten-Scan in der App. Optional kann ein Laufwerk angegeben werden.',
    {
        drive: z.string().optional().describe('Laufwerkspfad, z.B. "C:\\\\" (optional, nimmt sonst das aktuell ausgewählte)'),
    },
    async ({ drive }) => {
        const data = await callApi('post', '/scan/start', { drive: drive || null });
        return formatResult(data);
    }
);

// Start the server with stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('MCP Server Fehler:', err);
    process.exit(1);
});

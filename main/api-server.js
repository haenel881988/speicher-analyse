const express = require('express');
const cors = require('cors');
const os = require('os');
const log = require('./logger').createLogger('api-server');

/**
 * Starts an internal HTTP API server on localhost:3333.
 * This allows external tools (like MCP servers) to control the app
 * without importing any Electron modules.
 */
function startApiServer(mainWindow) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // GET /status — Health check
    app.get('/status', (_req, res) => {
        const pkg = require('../package.json');
        res.json({
            version: pkg.version,
            status: 'ready',
        });
    });

    // GET /system-info — Basic system information
    app.get('/system-info', (_req, res) => {
        res.json({
            computerName: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpus: os.cpus().length,
            uptime: os.uptime(),
        });
    });

    // POST /scan/start — Trigger a disk scan in the renderer
    app.post('/scan/start', (req, res) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return res.status(503).json({ error: 'App-Fenster ist nicht verfügbar.' });
        }
        const drive = req.body?.drive || null;
        mainWindow.webContents.send('trigger-scan-command', drive);
        res.json({ success: true, message: 'Scan wurde gestartet.' });
    });

    // GET /drives — List available drives
    app.get('/drives', async (_req, res) => {
        try {
            const { listDrives } = require('./drives');
            const drives = await listDrives();
            res.json(drives);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    const PORT = 3333;
    const server = app.listen(PORT, '127.0.0.1', () => {
        log.info(`API-Server läuft auf http://127.0.0.1:${PORT}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            log.error(`Port ${PORT} ist bereits belegt. API-Server wurde nicht gestartet.`);
        } else {
            log.error('API-Server Fehler:', err);
        }
    });

    return server;
}

module.exports = { startApiServer };

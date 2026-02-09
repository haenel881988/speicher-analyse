const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);

function mapStartType(val) {
    const map = { 0: 'Boot', 1: 'System', 2: 'Automatic', 3: 'Manual', 4: 'Disabled' };
    return map[val] || String(val);
}

function mapStatus(val) {
    const map = { 1: 'Stopped', 2: 'StartPending', 3: 'StopPending', 4: 'Running', 5: 'ContinuePending', 6: 'PausePending', 7: 'Paused' };
    return map[val] || String(val);
}

async function getServices() {
    const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        'Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Compress'
    ], {
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
    });

    const raw = JSON.parse(stdout);
    const services = Array.isArray(raw) ? raw : [raw];
    return services.map(s => ({
        name: s.Name,
        displayName: s.DisplayName,
        status: mapStatus(s.Status),
        startType: mapStartType(s.StartType),
    }));
}

async function controlService(serviceName, action) {
    const scAction = action === 'start' ? 'start' : 'stop';
    try {
        await execFileAsync('sc', [scAction, serviceName], {
            timeout: 30000,
            windowsHide: true,
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.stderr || err.message || String(err) };
    }
}

async function setStartType(serviceName, startType) {
    // Valid values: auto, demand, disabled
    try {
        await execFileAsync('sc', ['config', serviceName, `start=${startType}`], {
            timeout: 10000,
            windowsHide: true,
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.stderr || err.message || String(err) };
    }
}

module.exports = { getServices, controlService, setStartType };

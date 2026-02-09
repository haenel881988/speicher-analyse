const fs = require('fs');
const { runPS } = require('./cmd-utils');

async function listDrives() {
    const drives = [];

    if (process.platform === 'win32') {
        try {
            const { stdout } = await runPS(
                'Get-CimInstance Win32_LogicalDisk | Where-Object {$_.Size -gt 0} | Select-Object DeviceID,FileSystem,FreeSpace,Size | ConvertTo-Json',
                { timeout: 10000 }
            );

            const parsed = JSON.parse(stdout.trim() || '[]');
            const disks = Array.isArray(parsed) ? parsed : [parsed];

            for (const disk of disks) {
                const totalSize = disk.Size || 0;
                const freeSpace = disk.FreeSpace || 0;
                if (!totalSize) continue;

                const caption = disk.DeviceID || '';
                const fstype = disk.FileSystem || 'Unknown';
                const used = totalSize - freeSpace;
                const percent = Math.round((used / totalSize) * 1000) / 10;

                drives.push({
                    device: caption + '\\',
                    mountpoint: caption + '\\',
                    fstype,
                    total: totalSize,
                    used,
                    free: freeSpace,
                    percent,
                });
            }
        } catch {
            // Fallback: try checking common drive letters
            for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
                const drivePath = letter + ':\\';
                try {
                    fs.accessSync(drivePath);
                    const stats = fs.statfsSync(drivePath);
                    const total = stats.bsize * stats.blocks;
                    const free = stats.bsize * stats.bfree;
                    const used = total - free;
                    drives.push({
                        device: drivePath,
                        mountpoint: drivePath,
                        fstype: 'Unknown',
                        total,
                        used,
                        free,
                        percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                    });
                } catch {
                    // Drive doesn't exist or not accessible
                }
            }
        }
    } else {
        // Linux/Mac fallback
        try {
            const { stdout } = await runCmd('df -B1 --output=source,fstype,size,used,avail,target 2>/dev/null || df -k', {
                timeout: 5000,
            });
            const lines = stdout.trim().split('\n');
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 6) {
                    const total = parseInt(parts[2]) || 0;
                    const used = parseInt(parts[3]) || 0;
                    const free = parseInt(parts[4]) || 0;
                    drives.push({
                        device: parts[0],
                        mountpoint: parts[5],
                        fstype: parts[1],
                        total, used, free,
                        percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
                    });
                }
            }
        } catch { /* ignore */ }
    }

    return drives;
}

module.exports = { listDrives };

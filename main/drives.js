const fs = require('fs');
const { runCmd } = require('./cmd-utils');

async function listDrives() {
    const drives = [];

    if (process.platform === 'win32') {
        try {
            const { stdout } = await runCmd(
                'wmic logicaldisk get Caption,FileSystem,Size,FreeSpace /format:csv',
                { timeout: 10000 }
            );

            const lines = stdout.trim().split('\n').filter(l => l.trim());
            // Skip header line
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(',');
                // CSV format: Node,Caption,FileSystem,FreeSpace,Size
                if (parts.length < 5) continue;

                const caption = parts[1];
                const fstype = parts[2] || 'Unknown';
                const freeSpace = parseInt(parts[3]) || 0;
                const totalSize = parseInt(parts[4]) || 0;

                if (!totalSize) continue;

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

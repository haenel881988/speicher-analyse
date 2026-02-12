'use strict';

const { runPS } = require('./cmd-utils');
const os = require('os');
const log = require('./logger').createLogger('system-profil');

/**
 * System-Profil — Alle Informationen über den PC an einem Ort.
 *
 * Sammelt Hardware-Daten, Seriennummer, Hersteller, Windows-Version
 * und Netzwerk-Infos über PowerShell und Node.js APIs.
 */

// ---------------------------------------------------------------------------
//  Hilfsfunktionen
// ---------------------------------------------------------------------------

function parseJsonSingle(stdout) {
    const text = (stdout || '').trim();
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed[0] || null : parsed;
    } catch {
        return null;
    }
}

function parseJsonArray(stdout) {
    const text = (stdout || '').trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

// ---------------------------------------------------------------------------
//  Daten abrufen (sequenziell — PowerShell Cold Start beachten)
// ---------------------------------------------------------------------------

/**
 * Sammelt alle System-Profil-Daten.
 * Alle PowerShell-Aufrufe erfolgen sequenziell (kein Starvation).
 *
 * @returns {Promise<Object>} Vollständiges System-Profil
 */
async function getSystemProfile() {
    const profile = {
        computer: {},
        os: {},
        cpu: {},
        gpu: [],
        ram: {},
        disks: [],
        network: [],
        bios: {},
        motherboard: {},
    };

    // --- 1) Computer-Grunddaten (Hersteller, Modell, Seriennummer) ----------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_ComputerSystem | Select-Object Name, Manufacturer, Model, SystemType, TotalPhysicalMemory, Domain, UserName | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const cs = parseJsonSingle(stdout);
        if (cs) {
            profile.computer = {
                name: cs.Name || os.hostname(),
                manufacturer: cs.Manufacturer || 'Unbekannt',
                model: cs.Model || 'Unbekannt',
                systemType: cs.SystemType || '',
                domain: cs.Domain || '',
                user: cs.UserName || os.userInfo().username,
            };
        }
    } catch (err) {
        log.error('Computer-Grunddaten:', err.message);
        profile.computer = {
            name: os.hostname(),
            manufacturer: 'Unbekannt',
            model: 'Unbekannt',
            systemType: os.arch(),
            domain: '',
            user: os.userInfo().username,
        };
    }

    // --- 2) BIOS + Seriennummer -------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_BIOS | Select-Object SerialNumber, Manufacturer, SMBIOSBIOSVersion, ReleaseDate | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const bios = parseJsonSingle(stdout);
        if (bios) {
            let releaseDate = '';
            if (bios.ReleaseDate) {
                try {
                    const d = new Date(bios.ReleaseDate);
                    if (!isNaN(d.getTime())) {
                        releaseDate = d.toLocaleDateString('de-CH');
                    }
                } catch { /* ignore */ }
            }
            profile.bios = {
                serialNumber: (bios.SerialNumber || '').trim(),
                manufacturer: bios.Manufacturer || '',
                version: bios.SMBIOSBIOSVersion || '',
                releaseDate,
            };
        }
    } catch (err) {
        log.warn('BIOS-Daten:', err.message);
    }

    // --- 3) Mainboard -----------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber, Version | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const mb = parseJsonSingle(stdout);
        if (mb) {
            profile.motherboard = {
                manufacturer: mb.Manufacturer || '',
                product: mb.Product || '',
                serialNumber: (mb.SerialNumber || '').trim(),
                version: mb.Version || '',
            };
        }
    } catch (err) {
        log.warn('Mainboard-Daten:', err.message);
    }

    // --- 4) Betriebssystem -------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime, WindowsDirectory | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const osInfo = parseJsonSingle(stdout);
        if (osInfo) {
            let installDate = '';
            let lastBoot = '';
            try {
                if (osInfo.InstallDate) {
                    const d = new Date(osInfo.InstallDate);
                    if (!isNaN(d.getTime())) installDate = d.toLocaleDateString('de-CH');
                }
                if (osInfo.LastBootUpTime) {
                    const d = new Date(osInfo.LastBootUpTime);
                    if (!isNaN(d.getTime())) lastBoot = d.toLocaleString('de-CH');
                }
            } catch { /* ignore */ }

            profile.os = {
                name: osInfo.Caption || 'Windows',
                version: osInfo.Version || '',
                build: osInfo.BuildNumber || '',
                architecture: osInfo.OSArchitecture || os.arch(),
                installDate,
                lastBoot,
                windowsDir: osInfo.WindowsDirectory || '',
                uptime: formatUptime(os.uptime()),
            };
        }
    } catch (err) {
        log.warn('OS-Daten:', err.message);
        profile.os = {
            name: `${os.type()} ${os.release()}`,
            version: os.release(),
            architecture: os.arch(),
            uptime: formatUptime(os.uptime()),
        };
    }

    // --- 5) Prozessor ------------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, CurrentClockSpeed, L2CacheSize, L3CacheSize | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const cpu = parseJsonSingle(stdout);
        if (cpu) {
            profile.cpu = {
                name: (cpu.Name || '').trim(),
                manufacturer: cpu.Manufacturer || '',
                cores: cpu.NumberOfCores || 0,
                threads: cpu.NumberOfLogicalProcessors || 0,
                maxClockMHz: cpu.MaxClockSpeed || 0,
                currentClockMHz: cpu.CurrentClockSpeed || 0,
                l2CacheKB: cpu.L2CacheSize || 0,
                l3CacheKB: cpu.L3CacheSize || 0,
            };
        }
    } catch (err) {
        log.warn('CPU-Daten:', err.message);
        const cpus = os.cpus();
        if (cpus.length > 0) {
            profile.cpu = {
                name: cpus[0].model,
                cores: cpus.length,
                threads: cpus.length,
                maxClockMHz: cpus[0].speed,
            };
        }
    }

    // --- 6) Grafikkarte(n) -------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterCompatibility, DriverVersion, AdapterRAM, VideoModeDescription, CurrentRefreshRate | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const gpus = parseJsonArray(stdout);
        profile.gpu = gpus.map(g => ({
            name: (g.Name || '').trim(),
            manufacturer: g.AdapterCompatibility || '',
            driverVersion: g.DriverVersion || '',
            vramBytes: g.AdapterRAM || 0,
            resolution: g.VideoModeDescription || '',
            refreshRate: g.CurrentRefreshRate || 0,
        }));
    } catch (err) {
        log.warn('GPU-Daten:', err.message);
    }

    // --- 7) Arbeitsspeicher ------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, Capacity, Speed, MemoryType, FormFactor, BankLabel | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        const sticks = parseJsonArray(stdout);
        const totalBytes = sticks.reduce((sum, s) => sum + (Number(s.Capacity) || 0), 0);
        profile.ram = {
            totalBytes,
            totalFormatted: formatBytes(totalBytes),
            usedBytes: os.totalmem() - os.freemem(),
            freeBytes: os.freemem(),
            sticks: sticks.map(s => ({
                manufacturer: (s.Manufacturer || '').trim(),
                capacityBytes: Number(s.Capacity) || 0,
                capacityFormatted: formatBytes(Number(s.Capacity) || 0),
                speedMHz: s.Speed || 0,
                bank: s.BankLabel || '',
            })),
        };
    } catch (err) {
        log.warn('RAM-Daten:', err.message);
        profile.ram = {
            totalBytes: os.totalmem(),
            totalFormatted: formatBytes(os.totalmem()),
            usedBytes: os.totalmem() - os.freemem(),
            freeBytes: os.freemem(),
            sticks: [],
        };
    }

    // --- 8) Festplatten (Kurzübersicht) ------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_DiskDrive | Select-Object Model, Size, MediaType, InterfaceType, SerialNumber, Partitions | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        profile.disks = parseJsonArray(stdout).map(d => ({
            model: (d.Model || '').trim(),
            sizeBytes: Number(d.Size) || 0,
            sizeFormatted: formatBytes(Number(d.Size) || 0),
            mediaType: d.MediaType || '',
            interface: d.InterfaceType || '',
            serial: (d.SerialNumber || '').trim(),
            partitions: d.Partitions || 0,
        }));
    } catch (err) {
        log.warn('Disk-Daten:', err.message);
    }

    // --- 9) Netzwerkadapter ------------------------------------------------
    try {
        const { stdout } = await runPS(
            'Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true } | Select-Object Description, MACAddress, IPAddress, IPSubnet, DefaultIPGateway, DHCPEnabled, DNSServerSearchOrder | ConvertTo-Json -Compress',
            { timeout: 15000 }
        );
        profile.network = parseJsonArray(stdout).map(n => ({
            description: n.Description || '',
            mac: n.MACAddress || '',
            ip: Array.isArray(n.IPAddress) ? n.IPAddress : (n.IPAddress ? [n.IPAddress] : []),
            subnet: Array.isArray(n.IPSubnet) ? n.IPSubnet : [],
            gateway: Array.isArray(n.DefaultIPGateway) ? n.DefaultIPGateway : (n.DefaultIPGateway ? [n.DefaultIPGateway] : []),
            dhcp: !!n.DHCPEnabled,
            dns: Array.isArray(n.DNSServerSearchOrder) ? n.DNSServerSearchOrder : [],
        }));
    } catch (err) {
        log.warn('Netzwerk-Daten:', err.message);
    }

    // --- 10) Windows-Produktschlüssel (letzte 5 Zeichen) -------------------
    try {
        const { stdout } = await runPS(
            '(Get-CimInstance SoftwareLicensingProduct | Where-Object { $_.PartialProductKey -ne $null } | Select-Object -First 1).PartialProductKey',
            { timeout: 15000 }
        );
        profile.os.productKeyPartial = (stdout || '').trim() || null;
    } catch {
        profile.os.productKeyPartial = null;
    }

    // --- Hersteller-Links generieren ---------------------------------------
    profile.links = generateManufacturerLinks(profile);

    return profile;
}

// ---------------------------------------------------------------------------
//  Hersteller-Links
// ---------------------------------------------------------------------------

function generateManufacturerLinks(profile) {
    const manufacturer = (profile.computer.manufacturer || '').toLowerCase();
    const links = [];

    const manufacturers = {
        'dell': { support: 'https://www.dell.com/support', drivers: 'https://www.dell.com/support/home/de-de' },
        'lenovo': { support: 'https://support.lenovo.com', drivers: 'https://pcsupport.lenovo.com/de/de' },
        'hp': { support: 'https://support.hp.com', drivers: 'https://support.hp.com/de-de/drivers' },
        'hewlett': { support: 'https://support.hp.com', drivers: 'https://support.hp.com/de-de/drivers' },
        'asus': { support: 'https://www.asus.com/de/support', drivers: 'https://www.asus.com/de/support/download-center' },
        'acer': { support: 'https://www.acer.com/de-de/support', drivers: 'https://www.acer.com/de-de/support/drivers-and-manuals' },
        'msi': { support: 'https://de.msi.com/support', drivers: 'https://de.msi.com/support/download' },
        'gigabyte': { support: 'https://www.gigabyte.com/de/Support', drivers: 'https://www.gigabyte.com/de/Support' },
        'microsoft': { support: 'https://support.microsoft.com/de-de', drivers: 'https://support.microsoft.com/de-de/surface' },
        'samsung': { support: 'https://www.samsung.com/de/support', drivers: 'https://www.samsung.com/de/support' },
        'toshiba': { support: 'https://support.dynabook.com/support', drivers: 'https://support.dynabook.com/drivers' },
        'dynabook': { support: 'https://support.dynabook.com/support', drivers: 'https://support.dynabook.com/drivers' },
    };

    for (const [key, urls] of Object.entries(manufacturers)) {
        if (manufacturer.includes(key)) {
            links.push({ label: 'Hersteller-Support', url: urls.support });
            links.push({ label: 'Treiber-Download', url: urls.drivers });
            break;
        }
    }

    // Grafikkarten-Hersteller
    for (const gpu of profile.gpu) {
        const gpuName = (gpu.name || '').toLowerCase();
        if (gpuName.includes('nvidia') || gpuName.includes('geforce')) {
            links.push({ label: 'NVIDIA Treiber', url: 'https://www.nvidia.com/de-de/geforce/drivers/' });
        } else if (gpuName.includes('amd') || gpuName.includes('radeon')) {
            links.push({ label: 'AMD Treiber', url: 'https://www.amd.com/de/support/download/drivers.html' });
        } else if (gpuName.includes('intel')) {
            links.push({ label: 'Intel Treiber', url: 'https://www.intel.de/content/www/de/de/support/detect.html' });
        }
    }

    // CPU-Hersteller
    const cpuName = (profile.cpu.name || '').toLowerCase();
    if (cpuName.includes('intel') && !links.some(l => l.label === 'Intel Treiber')) {
        links.push({ label: 'Intel Treiber-Assistent', url: 'https://www.intel.de/content/www/de/de/support/detect.html' });
    } else if (cpuName.includes('amd') && !links.some(l => l.label === 'AMD Treiber')) {
        links.push({ label: 'AMD Treiber', url: 'https://www.amd.com/de/support/download/drivers.html' });
    }

    return links;
}

// ---------------------------------------------------------------------------
//  Hilfsfunktion: Uptime formatieren
// ---------------------------------------------------------------------------

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days} Tag${days !== 1 ? 'e' : ''}`);
    if (hours > 0) parts.push(`${hours} Std.`);
    if (mins > 0) parts.push(`${mins} Min.`);
    return parts.join(', ') || '< 1 Min.';
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = {
    getSystemProfile,
};

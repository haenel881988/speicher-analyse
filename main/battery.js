'use strict';

const { powerMonitor } = require('electron');

/**
 * Get battery status using Electron's powerMonitor.
 * Returns { onBattery: false } for desktop PCs (no battery).
 */
function getBatteryStatus() {
    try {
        return { onBattery: powerMonitor.isOnBatteryPower() };
    } catch {
        return { onBattery: false };
    }
}

module.exports = { getBatteryStatus };

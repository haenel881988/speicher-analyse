// IPC-based scan client (replaces WebSocket version)

export async function startScan(path) {
    return window.api.startScan(path);
}

export async function fetchDrives() {
    return window.api.getDrives();
}

export function setupScanListeners(onProgress, onComplete, onError) {
    window.api.onScanProgress(onProgress);
    window.api.onScanComplete(onComplete);
    window.api.onScanError(onError);
}

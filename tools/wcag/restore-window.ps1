Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$procs = Get-Process | Where-Object { $_.ProcessName -like '*speicher*' -or $_.MainWindowTitle -like '*Speicher*' }
foreach ($p in $procs) {
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        Write-Host "Found: $($p.ProcessName) PID=$($p.Id) Title='$($p.MainWindowTitle)' Handle=$($p.MainWindowHandle)"
        [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null  # SW_RESTORE
        [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
        Write-Host "Window restored and brought to foreground"
    }
}

if (-not $procs) {
    Write-Host "Kein Speicher-Analyse-Prozess gefunden"
}

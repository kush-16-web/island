$signature = @"
using System;
using System.Runtime.InteropServices;

public static class FullscreenChecker {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetShellWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

    public static bool IsForegroundFullscreen() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return false;
        if (hwnd == GetDesktopWindow() || hwnd == GetShellWindow()) return false;

        System.Text.StringBuilder className = new System.Text.StringBuilder(256);
        GetClassName(hwnd, className, 256);
        string cls = className.ToString();
        if (cls == "Progman" || cls == "WorkerW") return false;

        RECT appRect;
        if (!GetWindowRect(hwnd, out appRect)) return false;

        IntPtr hMon = MonitorFromWindow(hwnd, 2); // MONITOR_DEFAULTTONEAREST
        if (hMon == IntPtr.Zero) return false;

        MONITORINFO mi = new MONITORINFO();
        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(hMon, ref mi)) return false;

        // In genuine fullscreen, the window covers or exceeds the entire physical monitor
        bool coversMonitor = (appRect.Left <= mi.rcMonitor.Left &&
                              appRect.Top <= mi.rcMonitor.Top &&
                              appRect.Right >= mi.rcMonitor.Right &&
                              appRect.Bottom >= mi.rcMonitor.Bottom);

        // Distinguish from maximized window: a maximized window respects rcWork (taskbar is visible)
        bool largerThanWork = (appRect.Right - appRect.Left >= mi.rcMonitor.Right - mi.rcMonitor.Left) &&
                              (appRect.Bottom - appRect.Top >= mi.rcMonitor.Bottom - mi.rcMonitor.Top);

        return coversMonitor && largerThanWork;
    }
}
"@

Add-Type -TypeDefinition $signature
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$lastState = $null

while ($true) {
    try {
        $current = [FullscreenChecker]::IsForegroundFullscreen()
        if ($current -ne $lastState) {
            $lastState = $current
            Write-Output ($current ? "FULLSCREEN:1" : "FULLSCREEN:0")
            [Console]::Out.Flush()
        }
    } catch {
        # Silent ignore to keep watcher robust
    }
    Start-Sleep -Milliseconds 600
}

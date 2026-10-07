# Helpers to keep Warcraft III out of the user's way and to look at it without focusing it.
#   -Action Background : push the WC3 window to the bottom of the z-order without activating it
#                        and give focus back to -RestoreHwnd (the window that was in front).
#   -Action Capture    : save the WC3 window content to -Out (PNG) via PrintWindow, even when the
#                        window is covered by other windows.
param(
  [ValidateSet('Background', 'Capture', 'Foreground')][string]$Action = 'Capture',
  [string]$Out = '',
  [int64]$RestoreHwnd = 0
)
Add-Type -ReferencedAssemblies System.Drawing -Namespace W -Name Win -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint flags);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool PrintWindow(System.IntPtr h, System.IntPtr hdc, uint flags);
'@
$p = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'no Warcraft III window'; exit 1 }
$h = $p.MainWindowHandle
switch ($Action) {
  'Background' {
    # HWND_BOTTOM = 1; SWP_NOSIZE|SWP_NOMOVE|SWP_NOACTIVATE = 0x13
    [void][W.Win]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13)
    if ($RestoreHwnd -ne 0) { [void][W.Win]::SetForegroundWindow([IntPtr]$RestoreHwnd) }
    'sent to background'
  }
  'Foreground' { [void][W.Win]::SetForegroundWindow($h); 'foreground' }
  'Capture' {
    $r = New-Object W.Win+RECT
    [void][W.Win]::GetWindowRect($h, [ref]$r)
    $w = $r.R - $r.L; $hh = $r.B - $r.T
    $bmp = New-Object System.Drawing.Bitmap $w, $hh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc()
    [void][W.Win]::PrintWindow($h, $dc, 2) # PW_RENDERFULLCONTENT
    $g.ReleaseHdc($dc); $g.Dispose()
    if (-not $Out) { $Out = Join-Path ([System.IO.Path]::GetTempPath()) 'wc3-capture.png' }
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    "captured ${w}x${hh} -> $Out"
  }
}

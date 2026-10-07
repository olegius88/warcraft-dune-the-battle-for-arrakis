# Drive the Warcraft III menus without getting in the user's way: every input action waits until
# the user has not touched mouse/keyboard for -IdleSeconds (GetLastInputInfo), then brings the game
# to the front for a moment, acts, and puts the user's window and cursor back (< 1 s). Pauses
# tools/wc3-guard.ps1 meanwhile (named mutex "wc3guard-pause").
# Needed because campaign mission buttons of the 1.31 client ignore posted clicks (real cursor only)
# and its menus take posted keys only while the window is active.
#   -Action Launch                 start the classic client in its main menu (windowed)
#   -Action Key -Vk 0x53           key press (virtual key code)
#   -Action Click -Fx 0.5 -Fy 0.5  real left click at a fractional client position
#   -Action PostClick -Fx -Fy      cursor on the point + mouse messages posted to the game window only
#   -Action Capture -Out x.png     window picture (PrintWindow, no focus needed)
#   -Action Idle                   print the user's idle time
#   -Action WaitIdle               just wait until the user is idle for -IdleSeconds
param(
  [ValidateSet('Launch', 'Key', 'Click', 'PostClick', 'Capture', 'Idle', 'WaitIdle')][string]$Action = 'Idle',
  [int]$Vk = 0x0D,
  [double]$Fx = 0.5,
  [double]$Fy = 0.5,
  [string]$Out = '',
  [int]$IdleSeconds = 120,
  [int]$MaxWaitMinutes = 120,
  [string]$Exe = 'G:\Games\Warcraft III\x86_64\Warcraft III.exe'
)
Add-Type -Namespace W -Name Ui -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern bool ClientToScreen(System.IntPtr h, ref POINT p);
[DllImport("user32.dll")] public static extern bool GetClientRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, System.UIntPtr extra);
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ClipCursor(System.IntPtr r);
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint flags);
[DllImport("user32.dll")] public static extern System.IntPtr WindowFromPoint(POINT p);
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr h, uint flags);
'@
function Get-IdleSeconds {
  $li = New-Object W.Ui+LASTINPUTINFO; $li.cbSize = 8
  [void][W.Ui]::GetLastInputInfo([ref]$li)
  ([Environment]::TickCount - $li.dwTime) / 1000
}
function Get-Game { Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
# Foreground switch from a background process: attach to the thread that owns the current
# foreground window, then SetForegroundWindow is allowed.
function Set-Front([IntPtr]$h) {
  $fg = [W.Ui]::GetForegroundWindow()
  $dummy = [uint32]0
  $t = [W.Ui]::GetWindowThreadProcessId($fg, [ref]$dummy)
  $me = [W.Ui]::GetCurrentThreadId()
  $a = [W.Ui]::AttachThreadInput($me, $t, $true)
  $ok = [W.Ui]::SetForegroundWindow($h)
  if ($a) { [void][W.Ui]::AttachThreadInput($me, $t, $false) }
  $ok
}

switch ($Action) {
  'Idle' { 'idle {0:n0} s' -f (Get-IdleSeconds); return }
  'WaitIdle' {
    $waitStart = Get-Date
    while ((Get-IdleSeconds) -lt $IdleSeconds) {
      if (((Get-Date) - $waitStart).TotalMinutes -gt $MaxWaitMinutes) { "user not idle for $IdleSeconds s within $MaxWaitMinutes min"; exit 2 }
      Start-Sleep -Seconds 5
    }
    'user idle {0:n0} s after {1:n0} min of waiting' -f (Get-IdleSeconds), ((Get-Date) - $waitStart).TotalMinutes
    return
  }
  'Launch' {
    if (Get-Game) { 'already running'; return }
    $p = Start-Process -FilePath $Exe -ArgumentList '-windowmode', 'windowed' -PassThru
    "launched pid $($p.Id)"
    return
  }
  'Capture' {
    $g = Get-Game
    if ($g -and [W.Ui]::IsIconic($g.MainWindowHandle)) {
      # restore without activating (the guard minimises a game that grabbed the focus), keep it at the bottom
      [void][W.Ui]::ShowWindow($g.MainWindowHandle, 4) # SW_SHOWNOACTIVATE
      [void][W.Ui]::SetWindowPos($g.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x13)
      Start-Sleep -Milliseconds 1500
    }
    & (Join-Path $PSScriptRoot 'wc3-window.ps1') -Action Capture -Out $Out
    return
  }
}

# ---- input actions: wait for an idle user ----
$waitStart = Get-Date
while ((Get-IdleSeconds) -lt $IdleSeconds) {
  if (((Get-Date) - $waitStart).TotalMinutes -gt $MaxWaitMinutes) { "user not idle for $IdleSeconds s within $MaxWaitMinutes min - skipped"; exit 2 }
  Start-Sleep -Seconds 5
}
$game = Get-Game
if (-not $game) { 'no Warcraft III window'; exit 1 }
$h = $game.MainWindowHandle
$pause = New-Object System.Threading.Mutex($true, 'wc3guard-pause')
$userWindow = [W.Ui]::GetForegroundWindow()
$cursor = New-Object W.Ui+POINT
[void][W.Ui]::GetCursorPos([ref]$cursor)
try {
  if ([W.Ui]::IsIconic($h)) { [void][W.Ui]::ShowWindow($h, 9) } # SW_RESTORE
  [void](Set-Front $h)
  Start-Sleep -Milliseconds 250
  if ($Action -eq 'Key') {
    [void][W.Ui]::PostMessage($h, 0x0100, [IntPtr]$Vk, [IntPtr]1)          # WM_KEYDOWN
    Start-Sleep -Milliseconds 80
    [void][W.Ui]::PostMessage($h, 0x0101, [IntPtr]$Vk, [IntPtr]0xC0000001) # WM_KEYUP
    Start-Sleep -Milliseconds 250
    "key 0x{0:X2}" -f $Vk
  } else {
    $r = New-Object W.Ui+RECT
    [void][W.Ui]::GetClientRect($h, [ref]$r)
    $pt = New-Object W.Ui+POINT
    $pt.X = [int](($r.R - $r.L) * $Fx); $pt.Y = [int](($r.B - $r.T) * $Fy)
    $client = [IntPtr](($pt.Y -shl 16) -bor ($pt.X -band 0xFFFF))
    [void][W.Ui]::ClientToScreen($h, [ref]$pt)
    if ($Action -eq 'PostClick') {
      # mouse messages posted to the game window itself: they cannot reach another window. The
      # real cursor is put on the point too (the menus read its position) and put back afterwards.
      [void][W.Ui]::SetCursorPos($pt.X, $pt.Y)
      [void][W.Ui]::PostMessage($h, 0x0200, [IntPtr]0, $client)   # WM_MOUSEMOVE
      Start-Sleep -Milliseconds 150
      [void][W.Ui]::PostMessage($h, 0x0201, [IntPtr]1, $client)   # WM_LBUTTONDOWN, MK_LBUTTON
      Start-Sleep -Milliseconds 60
      [void][W.Ui]::PostMessage($h, 0x0202, [IntPtr]0, $client)   # WM_LBUTTONUP
      Start-Sleep -Milliseconds 250
      "posted click at client ($([int](($r.R - $r.L) * $Fx)),$([int](($r.B - $r.T) * $Fy)))"
      return
    }
    # A real click lands on whatever window is under the point: click only when the game is restored,
    # in front and its own window is under the point (2026-10-07 two clicks were computed against a
    # minimised game window and went to the screen outside it).
    # always-on-top windows (2026-10-07: a Firefox picture-in-picture window) cover the game even when
    # it is in front: make the game topmost for the click (undone in finally)
    [void][W.Ui]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x13) # HWND_TOPMOST, no move/size/activation
    $topmost = $true
    Start-Sleep -Milliseconds 150
    $under = [W.Ui]::GetAncestor([W.Ui]::WindowFromPoint($pt), 2) # GA_ROOT
    $fg = [W.Ui]::GetForegroundWindow()
    for ($retry = 0; $retry -lt 3 -and $fg -ne $h; $retry++) {
      [void](Set-Front $h); Start-Sleep -Milliseconds 300
      $fg = [W.Ui]::GetForegroundWindow(); $under = [W.Ui]::GetAncestor([W.Ui]::WindowFromPoint($pt), 2)
    }
    if ([W.Ui]::IsIconic($h) -or $fg -ne $h -or $under -ne $h) {
      # which window is in the way (diagnostics for the next attempt)
      $who = { param($w) $id = [uint32]0; [void][W.Ui]::GetWindowThreadProcessId($w, [ref]$id); (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName }
      $wr = New-Object W.Ui+RECT; [void][W.Ui]::GetWindowRect($h, [ref]$wr)
      "click skipped: game window not in front or not under ($($pt.X),$($pt.Y)); iconic=$([W.Ui]::IsIconic($h)) front=$(& $who $fg) under=$(& $who $under) window=($($wr.L),$($wr.T))-($($wr.R),$($wr.B)) client=$($r.R)x$($r.B)"
      $skipped = $true
      return
    }
    [void][W.Ui]::SetCursorPos($pt.X, $pt.Y)
    Start-Sleep -Milliseconds 150   # hover: glue buttons highlight first
    [W.Ui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) # LEFTDOWN
    Start-Sleep -Milliseconds 60
    [W.Ui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) # LEFTUP
    Start-Sleep -Milliseconds 250
    "click at screen ($($pt.X),$($pt.Y))"
  }
} finally {
  [void][W.Ui]::SetCursorPos($cursor.X, $cursor.Y)
  if ($topmost) { [void][W.Ui]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x13) } # HWND_NOTOPMOST
  [void][W.Ui]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) # game to the bottom, no activation
  [void](Set-Front $userWindow)
  [void][W.Ui]::ClipCursor([IntPtr]::Zero)
  $pause.ReleaseMutex(); $pause.Dispose()
}
# callers stop their sequence on a skipped click (exit code 3)
if ($skipped) { exit 3 }

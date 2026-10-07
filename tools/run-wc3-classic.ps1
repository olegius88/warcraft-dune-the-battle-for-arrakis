# Run a map in the classic 1.31.1 client (G:\Games\Warcraft III) — no Battle.net login needed,
# windowed, kept behind the user's windows, never touching the user's mouse/keyboard. Prints new
# CustomMapData files, crash reports and optionally captures the game window to a PNG
# (PrintWindow works while the window is covered).
# A watchdog runs for the whole game:
#   - the game window became the foreground window (start-up, end of loading) -> push it to the
#     bottom of the z-order and give focus back to the window the user was in (via
#     AttachThreadInput; if even that fails, minimise the game so Windows activates the next window);
#   - the cursor is clipped (WC3 confines it to its window) -> release the clip (ClipCursor(NULL)),
#     whichever window is in front.
# It reports how often each happened ("watchdog: focus taken back N, cursor released M, minimised K").
# Menus of this client accept posted keys/clicks (tools/wc3-key.ps1, tools/wc3-click.ps1);
# campaign mission buttons do not (they need the real cursor).
# Usage: pwsh tools/run-wc3-classic.ps1 -Map build\x.w3x [-Seconds 40] [-Keep] [-Capture out.png] [-Size 1280x560]
param(
  [Parameter(Mandatory = $true)][string]$Map,
  [int]$Seconds = 40,
  [switch]$Keep,
  [switch]$Trace,
  [string]$FramesPrefix = '',   # capture the window every -FrameEvery seconds to <prefix>000.png, 001... (GIF frames)
  [int]$FrameEvery = 3,
  [string]$Capture = '',
  [string]$Size = '',          # window size WxH for captures, e.g. 1280x560
  [string]$Exe = 'G:\Games\Warcraft III\x86_64\Warcraft III.exe'
)
Add-Type -Namespace W -Name Guard3 -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint flags);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT r);
[DllImport("user32.dll")] public static extern bool ClipCursor(System.IntPtr r);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr FindWindow(string cls, string title);
'@
$docs = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Warcraft III'
$since = Get-Date
Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Stop-Process -Confirm:$false
Start-Sleep 1
$userWindow = [W.Guard3]::GetForegroundWindow()
$full = (Resolve-Path $Map).Path
$p = Start-Process -FilePath $Exe -ArgumentList '-windowmode', 'windowed', '-loadfile', "`"$full`"" -PassThru

function Get-OwnerPid([IntPtr]$h) { $id = [uint32]0; [void][W.Guard3]::GetWindowThreadProcessId($h, [ref]$id); $id }
# virtual screen = the unclipped cursor area (SM_XVIRTUALSCREEN 76, SM_YVIRTUALSCREEN 77, SM_CXVIRTUALSCREEN 78, SM_CYVIRTUALSCREEN 79)
$vx = [W.Guard3]::GetSystemMetrics(76); $vy = [W.Guard3]::GetSystemMetrics(77)
$vr = $vx + [W.Guard3]::GetSystemMetrics(78); $vb = $vy + [W.Guard3]::GetSystemMetrics(79)
$focusTaken = 0; $clipReleased = 0; $minimized = 0; $tick = 0
$nextFocusTry = Get-Date
$watchLog = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\test\watchdog.log'
New-Item -ItemType Directory -Force (Split-Path $watchLog) | Out-Null
$deadline = (Get-Date).AddSeconds($Seconds)
$nextFrame = (Get-Date).AddSeconds(8); $frame = 0
# The cursor check runs every 30 ms (the clip is set at the end of loading, even when the window
# is not in front, and while the game is in front; confinemousecursor=0 in War3Preferences.txt
# does not prevent it); the focus check as well (the game re-activates itself in some maps).
while ((Get-Date) -lt $deadline -and -not $p.HasExited) {
  $tick++
  $fg = [W.Guard3]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero -and (Get-OwnerPid $fg) -eq $p.Id) {
    if ((Get-Date) -ge $nextFocusTry) {
      $iconic = [W.Guard3]::IsIconic($fg)
      # the remembered user window may have been closed/minimised meanwhile
      $target = $userWindow
      if ($target -eq [IntPtr]::Zero -or -not [W.Guard3]::IsWindowVisible($target) -or [W.Guard3]::IsIconic($target)) {
        $target = [W.Guard3]::FindWindow('Shell_TrayWnd', $null) # the taskbar: takes focus, ignores keys
      }
      if (-not $iconic) {
        # HWND_BOTTOM = 1; SWP_NOSIZE|SWP_NOMOVE|SWP_NOACTIVATE = 0x13
        [void][W.Guard3]::SetWindowPos($fg, [IntPtr]1, 0, 0, 0, 0, 0x13)
      }
      # A background process may not change the foreground window (SetForegroundWindow fails, seen
      # 2026-10-07: 42 failed hand-backs in one run); attaching to the game's input thread lifts that.
      $dummy = [uint32]0
      $gameThread = [W.Guard3]::GetWindowThreadProcessId($fg, [ref]$dummy)
      $me = [W.Guard3]::GetCurrentThreadId()
      $attached = [W.Guard3]::AttachThreadInput($me, $gameThread, $true)
      $ok = [W.Guard3]::SetForegroundWindow($target)
      if ($attached) { [void][W.Guard3]::AttachThreadInput($me, $gameThread, $false) }
      $stillGame = (Get-OwnerPid ([W.Guard3]::GetForegroundWindow())) -eq $p.Id
      if ($stillGame -and -not $iconic) {
        # last resort: SW_MINIMIZE (6) — Windows itself activates the next top-level window.
        # (SW_SHOWMINNOACTIVE leaves the minimised game active: keyboard input kept going to it and
        # the watchdog re-triggered every tick, 94 times in one run on 2026-10-07.)
        [void][W.Guard3]::ShowWindow($fg, 6)
        $minimized++
      }
      $focusTaken++
      # a game that stays in front despite all this is retried once a second, not every tick
      $nextFocusTry = if ($stillGame) { (Get-Date).AddSeconds(1) } else { Get-Date }
      $event = '{0:n1}s game took focus: iconic={1} target={2} attached={3} ok={4} stillGame={5}' -f ((Get-Date) - $since).TotalSeconds, $iconic, ($(if ($target -eq $userWindow) { 'user' } else { 'taskbar' })), $attached, $ok, $stillGame
      Add-Content -LiteralPath $watchLog -Value "$(Split-Path $Map -Leaf) $event"
      if ($Trace) { "  $event" }
    }
  } elseif ($fg -ne [IntPtr]::Zero) {
    $userWindow = $fg # the user may switch windows while the game runs
  }
  # Release any cursor clip, whichever window is in front: a test run never needs it.
  $r = New-Object W.Guard3+RECT
  if ([W.Guard3]::GetClipCursor([ref]$r) -and ($r.L -gt $vx -or $r.T -gt $vy -or $r.R -lt $vr -or $r.B -lt $vb)) {
    [void][W.Guard3]::ClipCursor([IntPtr]::Zero); $clipReleased++
    if ($Trace) { "  {0:n1}s cursor clip released" -f ((Get-Date) - $since).TotalSeconds }
  }
  # -Size WxH: resize the window once (kept at the bottom of the z-order, not activated) so captures
  # show the whole screen; the classic client renders the configured aspect into the window
  if ($Size -and -not $resized -and $p.MainWindowHandle -ne [IntPtr]::Zero -and -not [W.Guard3]::IsIconic($p.MainWindowHandle)) {
    $sw, $sh = $Size -split 'x' | ForEach-Object { [int]$_ }
    [void][W.Guard3]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, $sw, $sh, 0x12) # SWP_NOMOVE|SWP_NOACTIVATE
    $resized = $true
  }
  if ($FramesPrefix -and (Get-Date) -ge $nextFrame -and -not [W.Guard3]::IsIconic($p.MainWindowHandle)) {
    & (Join-Path $PSScriptRoot 'wc3-window.ps1') -Action Capture -Out ('{0}{1:d3}.png' -f $FramesPrefix, $frame) | Out-Null
    $frame++; $nextFrame = (Get-Date).AddSeconds($FrameEvery)
  }
  Start-Sleep -Milliseconds 30
}
if ($p.HasExited) { "GAME EXITED code=$($p.ExitCode)" } else { "game alive after $Seconds s" }
"watchdog: focus taken back $focusTaken, cursor released $clipReleased, minimised $minimized"
if ($Capture -and -not $p.HasExited) {
  if ([W.Guard3]::IsIconic($p.MainWindowHandle)) {
    # restore without activating, straight to the bottom of the z-order, for the final capture
    [void][W.Guard3]::ShowWindow($p.MainWindowHandle, 4) # SW_SHOWNOACTIVATE
    [void][W.Guard3]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x13)
    Start-Sleep -Milliseconds 600
    $r = New-Object W.Guard3+RECT
    if ([W.Guard3]::GetClipCursor([ref]$r) -and ($r.L -gt $vx -or $r.T -gt $vy -or $r.R -lt $vr -or $r.B -lt $vb)) { [void][W.Guard3]::ClipCursor([IntPtr]::Zero) }
  }
  & (Join-Path $PSScriptRoot 'wc3-window.ps1') -Action Capture -Out $Capture
}
'--- CustomMapData written since launch:'
Get-ChildItem (Join-Path $docs 'CustomMapData') -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -ge $since } |
  ForEach-Object { "## $($_.FullName)"; Get-Content $_.FullName | Select-String 'Preload\(' }
$err = Get-ChildItem (Join-Path $docs 'Errors') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $since }
if ($err) { "CRASH REPORT: $($err.FullName)" }
if (-not $Keep -and -not $p.HasExited) { Stop-Process -Id $p.Id -Confirm:$false; 'game closed' }

# Keeps a running Warcraft III out of the user's way for as long as it runs (same rules as the
# watchdog of run-wc3-classic.ps1): releases any cursor clip, and when the game becomes the
# foreground window pushes it back and returns focus to the user's window (AttachThreadInput;
# SW_MINIMIZE as the last resort). Pauses while the named mutex "wc3guard-pause" exists — that is
# how tools/wc3-ui.ps1 brings the game to the front for a moment without a fight.
# Usage (background): pwsh tools/wc3-guard.ps1 [-MaxMinutes 60]
param([int]$MaxMinutes = 60)
Add-Type -Namespace W -Name GuardP -MemberDefinition @'
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
function Get-OwnerPid([IntPtr]$h) { $id = [uint32]0; [void][W.GuardP]::GetWindowThreadProcessId($h, [ref]$id); $id }
$vx = [W.GuardP]::GetSystemMetrics(76); $vy = [W.GuardP]::GetSystemMetrics(77)
$vr = $vx + [W.GuardP]::GetSystemMetrics(78); $vb = $vy + [W.GuardP]::GetSystemMetrics(79)
$deadline = (Get-Date).AddMinutes($MaxMinutes)
$userWindow = [W.GuardP]::GetForegroundWindow()
$focusTaken = 0; $clipReleased = 0; $nextFocusTry = Get-Date
while ((Get-Date) -lt $deadline) {
  $game = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $game) { break }
  $paused = $null
  if ([System.Threading.Mutex]::TryOpenExisting('wc3guard-pause', [ref]$paused)) { $paused.Dispose(); Start-Sleep -Milliseconds 100; continue }
  $fg = [W.GuardP]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero -and (Get-OwnerPid $fg) -eq $game.Id) {
    if ((Get-Date) -ge $nextFocusTry) {
      $target = $userWindow
      if ($target -eq [IntPtr]::Zero -or -not [W.GuardP]::IsWindowVisible($target) -or [W.GuardP]::IsIconic($target)) {
        $target = [W.GuardP]::FindWindow('Shell_TrayWnd', $null)
      }
      $iconic = [W.GuardP]::IsIconic($fg)
      if (-not $iconic) { [void][W.GuardP]::SetWindowPos($fg, [IntPtr]1, 0, 0, 0, 0, 0x13) }
      $dummy = [uint32]0
      $gameThread = [W.GuardP]::GetWindowThreadProcessId($fg, [ref]$dummy)
      $me = [W.GuardP]::GetCurrentThreadId()
      $attached = [W.GuardP]::AttachThreadInput($me, $gameThread, $true)
      [void][W.GuardP]::SetForegroundWindow($target)
      if ($attached) { [void][W.GuardP]::AttachThreadInput($me, $gameThread, $false) }
      $stillGame = (Get-OwnerPid ([W.GuardP]::GetForegroundWindow())) -eq $game.Id
      if ($stillGame -and -not $iconic) { [void][W.GuardP]::ShowWindow($fg, 6) }
      $focusTaken++
      $nextFocusTry = if ($stillGame) { (Get-Date).AddSeconds(1) } else { Get-Date }
    }
  } elseif ($fg -ne [IntPtr]::Zero) {
    $userWindow = $fg
  }
  $r = New-Object W.GuardP+RECT
  if ([W.GuardP]::GetClipCursor([ref]$r) -and ($r.L -gt $vx -or $r.T -gt $vy -or $r.R -lt $vr -or $r.B -lt $vb)) {
    [void][W.GuardP]::ClipCursor([IntPtr]::Zero); $clipReleased++
  }
  Start-Sleep -Milliseconds 30
}
"guard done: focus taken back $focusTaken, cursor released $clipReleased"

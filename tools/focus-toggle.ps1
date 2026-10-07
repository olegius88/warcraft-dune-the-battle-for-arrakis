# Focus probe: after -After seconds, bring the game to the front and give the focus back to the window
# that had it, -Times times, -Gap ms apart (what Alt+Tab does), and report whether the game still
# answers. 2026-10-08 a movie chain stopped in a session that moved the game behind 27 times.
# Usage: pwsh tools/focus-toggle.ps1 [-After 120] [-Times 5] [-Gap 1500]
param([int]$After = 120, [int]$Times = 5, [int]$Gap = 1500)
Add-Type -Namespace FT -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
function Front([IntPtr]$h) {
  $fg = [FT.Win]::GetForegroundWindow(); $id = [uint32]0
  $t = [FT.Win]::GetWindowThreadProcessId($fg, [ref]$id); $me = [FT.Win]::GetCurrentThreadId()
  $a = [FT.Win]::AttachThreadInput($me, $t, $true); [void][FT.Win]::SetForegroundWindow($h)
  if ($a) { [void][FT.Win]::AttachThreadInput($me, $t, $false) }
}
Start-Sleep $After
$g = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $g) { 'no game'; exit 1 }
$user = [FT.Win]::GetForegroundWindow()
for ($i = 0; $i -lt $Times; $i++) {
  Front $g.MainWindowHandle; Start-Sleep -Milliseconds $Gap
  Front $user; Start-Sleep -Milliseconds $Gap
  $g.Refresh()
  '{0:HH:mm:ss} toggle {1}: responding {2}, private {3} MB' -f (Get-Date), ($i + 1), $g.Responding, [int]($g.PrivateMemorySize64 / 1MB)
}

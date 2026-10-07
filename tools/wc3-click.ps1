# Post a left click to the Warcraft III window at a fractional client position
# (0..1, 0..1) without moving the real cursor or focusing the window.
# Usage: pwsh tools/wc3-click.ps1 -Fx 0.85 -Fy 0.40
param([Parameter(Mandatory = $true)][double]$Fx, [Parameter(Mandatory = $true)][double]$Fy, [int]$HoverMs = 60)
Add-Type -Namespace W -Name C -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[DllImport("user32.dll")] public static extern bool GetClientRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
'@
$p = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p -or $p.MainWindowHandle -eq 0) { 'no Warcraft III window'; exit 1 }
$h = $p.MainWindowHandle
$r = New-Object W.C+RECT
[void][W.C]::GetClientRect($h, [ref]$r)
$x = [int](($r.R - $r.L) * $Fx); $y = [int](($r.B - $r.T) * $Fy)
$lp = [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF))
# Hover first: some glue buttons only react after a highlight (WM_MOUSEMOVE stream for HoverMs).
for ($t = 0; $t -le $HoverMs; $t += 30) {
  $jx = $x + (($t / 30) % 2); $jlp = [IntPtr](($y -shl 16) -bor ($jx -band 0xFFFF))
  [void][W.C]::PostMessage($h, 0x0200, [IntPtr]0, $jlp)   # WM_MOUSEMOVE
  Start-Sleep -Milliseconds 30
}
[void][W.C]::PostMessage($h, 0x0200, [IntPtr]0, $lp)
[void][W.C]::PostMessage($h, 0x0201, [IntPtr]1, $lp)   # WM_LBUTTONDOWN
Start-Sleep -Milliseconds 60
[void][W.C]::PostMessage($h, 0x0202, [IntPtr]0, $lp)   # WM_LBUTTONUP
"click at client ($x,$y) of $($r.R)x$($r.B)"

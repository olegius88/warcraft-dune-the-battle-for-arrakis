# Unattended campaign session: opens a custom campaign through the 1.31 menus with real input and
# lets its autotest maps run, without getting in the user's way.
#   - starts only after the user has been idle -StartIdle seconds; every menu action waits for an
#     idle user too (tools/wc3-ui.ps1) and a click happens only on the game's own window (exit 3
#     otherwise, which ends the session);
#   - no focus guard during the session (it minimised the game and made captures empty): instead,
#     whenever the user touches mouse/keyboard while the game is in front, the game is minimised
#     at once and the session waits for the user to be idle again;
#   - a capture after every step: <ShotsPrefix>NN-<step>.png.
# Usage: pwsh tools/campaign-session.ps1 -Campaign build\autotest\AutoTest.w3n -ListFy 0.208 -MissionFy 0.629
#        [-Minutes 20] [-StartIdle 120]
param(
  [Parameter(Mandatory = $true)][string]$Campaign,
  [string]$InstallAs = 'AAA_EmperorAutoTest.w3n',
  [double]$ListFx = 0.259, [double]$ListFy = 0.208,       # entry of the campaign in the custom campaign list
  [double]$MissionFx = 0.827, [double]$MissionFy = 0.592, # the (single) mission button of the autotest campaign screen
  # -KeysOnly: no clicks; the campaign must be first in the list (Enter opens it) and the mission
  # keys are tried in turn until -StartReport (CustomMapData path) is written by the first mission
  [switch]$KeysOnly,
  [int[]]$MissionKeys = @(0x0D, 0x20),
  [string]$StartReport = 'DuneTest\HK_Start.pld',
  [int]$Minutes = 20,
  [int]$StartIdle = 120,
  [string]$ShotsPrefix = 'build\test\shots\cs-'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
Add-Type -Namespace CS -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
'@
function Idle { $li = New-Object CS.Win+LASTINPUTINFO; $li.cbSize = 8; [void][CS.Win]::GetLastInputInfo([ref]$li); ([Environment]::TickCount - $li.dwTime) / 1000 }
function Game { Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
$step = 0
function Shot([string]$name) {
  # a capture restores a minimised game (without activating it): not while the user works
  if ((Idle) -lt 20) { return }
  $script:step++
  & ./tools/wc3-ui.ps1 -Action Capture -Out ('{0}{1:d2}-{2}.png' -f $ShotsPrefix, $script:step, $name) | Out-Null
}
# The user is back while the game is in front: minimise it at once. Input in the first seconds after
# one of our own actions is ours (wc3-ui.ps1 moves the real cursor), not the user's.
$script:lastOwn = Get-Date
function YieldIfUserBack {
  $g = Game
  if ($g -and ((Get-Date) - $script:lastOwn).TotalSeconds -gt 5 -and (Idle) -lt 2 -and [CS.Win]::GetForegroundWindow() -eq $g.MainWindowHandle) {
    [void][CS.Win]::ShowWindow($g.MainWindowHandle, 6) # SW_MINIMIZE
    'user back: game minimised'
  }
}
function Ui([hashtable]$a) {
  & ./tools/wc3-ui.ps1 @a -IdleSeconds 20
  $script:lastOwn = Get-Date
  if ($LASTEXITCODE -eq 3) { throw 'click skipped (game window not under the point): session ends' }
}

& ./tools/wc3-ui.ps1 -Action WaitIdle -IdleSeconds $StartIdle -MaxWaitMinutes 600
if ($LASTEXITCODE -eq 2) { 'user busy: no session'; exit 2 }
if (Game) { 'a game is already open: no session'; exit 2 }
$target = Join-Path $env:USERPROFILE "Documents\Warcraft III\Campaigns\$InstallAs"
Copy-Item $Campaign $target -Force
"installed $target"
& ./tools/wc3-ui.ps1 -Action Launch
try {
  $until = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $until) { YieldIfUserBack; Start-Sleep -Milliseconds 300 }
  Shot 'menu'
  Ui @{ Action = 'Key'; Vk = 0x53 }; Start-Sleep 3; Shot 'single'      # S: single player
  Ui @{ Action = 'Key'; Vk = 0x55 }; Start-Sleep 3; Shot 'custom'      # U: custom campaigns
  if (-not $KeysOnly) { Ui @{ Action = 'Click'; Fx = $ListFx; Fy = $ListFy }; Start-Sleep 2; Shot 'list' }
  Ui @{ Action = 'Key'; Vk = 0x0D }; Start-Sleep 5; Shot 'campaign'    # Enter: open it
  if (-not $KeysOnly) {
    Ui @{ Action = 'Click'; Fx = $MissionFx; Fy = $MissionFy }; Shot 'mission'
  } else {
    # keys only: try each key on the campaign screen until the first mission writes its report
    $report = Join-Path $env:USERPROFILE "Documents\Warcraft III\CustomMapData\$StartReport"
    $since = Get-Date
    # then a click posted to the game window (cannot reach another window), then a real one
    $tries = @($MissionKeys | ForEach-Object { @{ Action = 'Key'; Vk = $_ } }) + @(
      @{ Action = 'PostClick'; Fx = $MissionFx; Fy = $MissionFy },
      @{ Action = 'Click'; Fx = $MissionFx; Fy = $MissionFy })
    $started = $false
    foreach ($try in $tries) {
      & ./tools/wc3-ui.ps1 @try -IdleSeconds 20
      $script:lastOwn = Get-Date
      $wait = (Get-Date).AddSeconds(45)
      while ((Get-Date) -lt $wait -and -not ((Test-Path $report) -and (Get-Item $report).LastWriteTime -gt $since)) { YieldIfUserBack; Start-Sleep 1 }
      Shot $try.Action
      if ((Test-Path $report) -and (Get-Item $report).LastWriteTime -gt $since) { "mission started by $($try.Action) $($try.Vk)"; $started = $true; break }
    }
    # nothing started the mission: the campaign screen would just sit there (2026-10-07: 20 minutes of
    # captures, the game minimised again and again while the user worked)
    if (-not $started) { 'mission not started: session ends'; return }
  }
  $end = (Get-Date).AddMinutes($Minutes)
  $next = Get-Date
  while ((Get-Date) -lt $end -and (Game)) {
    YieldIfUserBack
    if ((Get-Date) -ge $next) { Shot 'run'; $next = (Get-Date).AddSeconds(30) }
    Start-Sleep -Milliseconds 300
  }
} finally {
  Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Stop-Process -Force
  'session done'
}

# Unattended campaign session: opens a custom campaign through the 1.31 menus with real input and
# lets its autotest maps run, without getting in the user's way.
#   - starts only after the user has been idle -StartIdle seconds; every menu action waits for an
#     idle user too (tools/wc3-ui.ps1) and a click happens only on the game's own window (exit 3
#     otherwise, which ends the session);
#   - the game is kept behind the user's windows (KeepGameBehind), never minimised;
#   - the mission is started by a click posted to the game window (-KeysOnly tries keys first);
#     the session ends at once when nothing started it;
#   - a capture after every step and every 30 s: <ShotsPrefix>NN-<step>.png.
# Usage: pwsh tools/campaign-session.ps1 -Campaign build/autotest/AutoTest.w3n -KeysOnly [-Minutes 20] [-StartIdle 120]
param(
  [Parameter(Mandatory = $true)][string]$Campaign,
  [string]$InstallAs = 'AAA_EmperorAutoTest.w3n',
  [double]$ListFx = 0.259, [double]$ListFy = 0.208,       # entry of the campaign in the custom campaign list
  [double]$MissionFx = 0.659, [double]$MissionFy = 0.475, # the (single) mission button of the autotest campaign screen (physical pixels, 800x600 client)
  # -KeysOnly: no clicks; the campaign must be first in the list (Enter opens it) and the mission
  # keys are tried in turn until -StartReport (CustomMapData path) is written by the first mission
  [switch]$KeysOnly,
  # -ScreenOnly: stop on the campaign screen (its background and music), -ScreenSeconds of captures
  [switch]$ScreenOnly,
  [int]$ScreenSeconds = 30,
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
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint flags);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
# Physical pixels: the display is scaled (125 %) and an unaware process gets scaled coordinates and
# window captures cut to the scaled size (2026-10-07: the game's right quarter was never captured and
# button positions measured on those captures missed the buttons).
[void][CS.Win]::SetProcessDPIAware()
function Game { Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
$step = 0
function Shot([string]$name) {
  $script:step++
  # the game's committed memory with every capture (movie frames stay cached until the map ends)
  $g = Game
  if ($g) { '{0:HH:mm:ss} {1}: private {2} MB' -f (Get-Date), $name, [int]($g.PrivateMemorySize64 / 1MB) }
  & ./tools/wc3-ui.ps1 -Action Capture -Out ('{0}{1:d2}-{2}.png' -f $ShotsPrefix, $script:step, $name) | Out-Null
}
# The game stays behind the user's windows: it takes the focus at start and at every level change;
# then it goes to the bottom and the window the user was in gets the focus back (captures work on a
# covered window). Only our own input actions bring it to the front, for a moment (wc3-ui.ps1).
# 2026-10-07 this minimised the game "when the user was back" by GetLastInputInfo instead, but the
# running game itself counts as input: 44 minimisations while the user was away.
$script:lastOwn = Get-Date
$script:userWindow = [CS.Win]::GetForegroundWindow()
function KeepGameBehind {
  $g = Game
  $fg = [CS.Win]::GetForegroundWindow()
  if (-not $g -or $fg -ne $g.MainWindowHandle) { if ($fg -ne [IntPtr]::Zero) { $script:userWindow = $fg }; return }
  if (((Get-Date) - $script:lastOwn).TotalSeconds -lt 5) { return }
  [void][CS.Win]::SetWindowPos($g.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x13) # HWND_BOTTOM, no activation
  $id = [uint32]0
  $t = [CS.Win]::GetWindowThreadProcessId($fg, [ref]$id)
  $me = [CS.Win]::GetCurrentThreadId()
  $a = [CS.Win]::AttachThreadInput($me, $t, $true)
  [void][CS.Win]::SetForegroundWindow($script:userWindow)
  if ($a) { [void][CS.Win]::AttachThreadInput($me, $t, $false) }
  'game sent behind'
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
  while ((Get-Date) -lt $until) { KeepGameBehind; Start-Sleep -Milliseconds 300 }
  Shot 'menu'
  if ($ScreenOnly) { 'main menu sound: ' + (& ./tools/audio-peak.ps1 -Seconds 5) }
  Ui @{ Action = 'Key'; Vk = 0x53 }; Start-Sleep 3; Shot 'single'      # S: single player
  Ui @{ Action = 'Key'; Vk = 0x55 }; Start-Sleep 3; Shot 'custom'      # U: custom campaigns
  if (-not $KeysOnly) { Ui @{ Action = 'Click'; Fx = $ListFx; Fy = $ListFy }; Start-Sleep 2; Shot 'list' }
  Ui @{ Action = 'Key'; Vk = 0x0D }; Start-Sleep 5; Shot 'campaign'    # Enter: open it
  if ($ScreenOnly) {
    # the campaign screen's music (tools/audio-peak.ps1: peak level of the game's audio sessions)
    'campaign screen sound: ' + (& ./tools/audio-peak.ps1 -Seconds 8)
    $until = (Get-Date).AddSeconds($ScreenSeconds)
    while ((Get-Date) -lt $until) { KeepGameBehind; Start-Sleep 5; Shot 'screen' }
    return
  }
  if (-not $KeysOnly) {
    Ui @{ Action = 'Click'; Fx = $MissionFx; Fy = $MissionFy }; Shot 'mission'
  } else {
    # -KeysOnly: no clicks on the menus; tries on the campaign screen until the first mission writes its report:
    $report = Join-Path $env:USERPROFILE "Documents\Warcraft III\CustomMapData\$StartReport"
    $since = Get-Date
    # a click posted to the game window (cannot reach another window), the keys, then a real click;
    # the posted click first: it is what starts the mission (2026-10-07); each failed try costs 45 s
    $tries = @(@{ Action = 'PostClick'; Fx = $MissionFx; Fy = $MissionFy }) + @($MissionKeys | ForEach-Object { @{ Action = 'Key'; Vk = $_ } }) + @(
      @{ Action = 'Click'; Fx = $MissionFx; Fy = $MissionFy })
    $started = $false
    foreach ($try in $tries) {
      & ./tools/wc3-ui.ps1 @try -IdleSeconds 20
      $script:lastOwn = Get-Date
      $wait = (Get-Date).AddSeconds(45)
      while ((Get-Date) -lt $wait -and -not ((Test-Path $report) -and (Get-Item $report).LastWriteTime -gt $since)) { KeepGameBehind; Start-Sleep 1 }
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
    KeepGameBehind
    if ((Get-Date) -ge $next) { Shot 'run'; $next = (Get-Date).AddSeconds(30) }
    Start-Sleep -Milliseconds 300
  }
} finally {
  Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Stop-Process -Force
  'session done'
}

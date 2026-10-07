# Launch Warcraft III Reforged through the (already logged-in) Battle.net client so no
# game login is needed, with a map copied to build\test\Current.w3x.
#
# Prerequisite (one-time, see tools/README.md): Battle.net.config has, for game "w3",
#   AdditionalLaunchArguments = -windowmode windowed -loadfile "<repo>\build\test\Current.w3x"
# Battle.net ignores extra args passed via --exec, and launching Warcraft III.exe directly
# shows the Battle.net login screen every time (both observed 2026-10-07).
#
# Usage: pwsh tools/run-wc3.ps1 -Map build\smoke\Smoke1.w3x [-Seconds 60] [-Keep]
# Prints the game's exit status, the DuneSmoke/DuneLog CustomMapData files and new log lines.
param(
  [Parameter(Mandatory = $true)][string]$Map,
  [int]$Seconds = 60,
  [switch]$Keep
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$docs = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Warcraft III'
$target = Join-Path $repo 'build\test\Current.w3x'
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
Copy-Item (Resolve-Path $Map) $target -Force

$dataDir = Join-Path $docs 'CustomMapData'
$since = Get-Date
Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Stop-Process -Confirm:$false
Start-Sleep 2
Start-Process -FilePath 'C:\Program Files (x86)\Battle.net\Battle.net.exe' -ArgumentList '--exec="launch W3"'

$p = $null
for ($i = 0; $i -lt 30 -and -not $p; $i++) { Start-Sleep 1; $p = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue }
if (-not $p) { 'GAME DID NOT START'; exit 2 }
$cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
"command line: $cmd"
for ($i = 0; $i -lt $Seconds -and -not $p.HasExited; $i++) { Start-Sleep 1 }
if ($p.HasExited) { "GAME EXITED code=$($p.ExitCode) (0xC0000005 = -1073741819 = crash)" } else { "game alive after $Seconds s" }

'--- CustomMapData written since launch:'
Get-ChildItem $dataDir -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -ge $since } |
  ForEach-Object { "## $($_.FullName)"; Get-Content $_.FullName }
'--- War3Log (non-map lines):'
Get-Content (Join-Path $docs 'Logs\War3Log.txt') | Select-String -NotMatch 'Opening (map|mod)|prism' | Select-Object -Last 15

if (-not $Keep -and -not $p.HasExited) { Stop-Process -Id $p.Id -Confirm:$false; 'game closed' }

# Run several maps one after another in the classic client (background, no input) and report
# for each: crash / alive, the mission debug report and a window capture.
# Usage: pwsh tools/test-maps.ps1 -Maps AT_Start.w3x,HK_A05.w3x [-Dir build\campaign\maps] [-Seconds 35] [-Gif]
# Writes <map>.png (full window), <map>.jpg (1280 px, small enough to post in chat) and, with -Gif,
# <map>.gif (a frame every 3 s from the 8th second, 800 px wide; tools/make-gif.ts).
param(
  [Parameter(Mandatory = $true)][string[]]$Maps,
  [string]$Dir = 'build\campaign\maps',
  [int]$Seconds = 35,
  [string]$Shots = 'build\test\shots',
  [switch]$Gif
)
Add-Type -AssemblyName System.Drawing
function Save-Jpeg([string]$src, [string]$dst, [int]$width) {
  $img = [System.Drawing.Image]::FromFile($src)
  $h = [int]($img.Height * $width / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $width, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, $width, $h)
  $g.Dispose(); $img.Dispose()
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Jpeg); $bmp.Dispose()
}
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
New-Item -ItemType Directory -Force $Shots | Out-Null
foreach ($m in $Maps) {
  $shot = Join-Path (Resolve-Path $Shots) ($m -replace '\.w3x$', '.png')
  $extra = @{}
  $frames = $null
  if ($Gif) {
    # frames are temporary: system temp, removed file by file with the fail-closed helper
    $frames = Join-Path ([System.IO.Path]::GetTempPath()) ('codex-' + [guid]::NewGuid() + '-frame')
    $extra.FramesPrefix = $frames
  }
  $out = & (Join-Path $PSScriptRoot 'run-wc3-classic.ps1') -Map (Join-Path $Dir $m) -Seconds $Seconds -Capture $shot @extra 2>&1
  if ($frames -and (Test-Path "${frames}000.png")) {
    $gifOut = $shot -replace '\.png$', '.gif'
    & node (Join-Path $PSScriptRoot 'make-gif.ts') $frames $gifOut 800 700 | Out-Null
    # remove exactly the frames written for this run: <prefix>000.png, 001, ... until the first gap
    for ($i = 0; Test-Path ('{0}{1:d3}.png' -f $frames, $i); $i++) {
      & node 'C:\Users\Oleg\.codex\bin\safe-remove-temp-files.mjs' ('{0}{1:d3}.png' -f $frames, $i) | Out-Null
    }
  }
  if (Test-Path $shot) { Save-Jpeg $shot ($shot -replace '\.png$', '.jpg') 1280 }
  $status = ($out | Select-String 'GAME EXITED|alive after' | Select-Object -First 1).Line
  $crash = ($out | Select-String 'CRASH REPORT' | Select-Object -First 1).Line
  $guard = ($out | Select-String 'watchdog:' | Select-Object -First 1).Line
  $report = ($out | Select-String 'Preload\(' | Select-Object -Last 1).Line
  "=== $m : $status $crash ($guard)"
  if ($report) { "    $($report.Trim())" }
}

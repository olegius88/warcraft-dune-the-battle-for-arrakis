# Inside the VM (Windows PowerShell 5.1 over WinRM): download games/<name>.tar from the host's HTTP server
# (harness/serve.sh, the host is 10.0.2.2 in QEMU user networking) into C:\Games and unpack it.
# 5.1 passes data between native programs as text (it buffered 4 GB of a piped tar in memory), so the
# archive goes to a file first. The caller puts the archive name in place of __GAME__:
#   sed s/__GAME__/emperor/ guest/install-game.ps1 | python3 winrm_run.py ps
$ErrorActionPreference = 'Stop'
$name = '__GAME__'
New-Item -ItemType Directory -Force 'C:\Games' | Out-Null
$tar = "C:\Games\$name.tar"
$start = Get-Date
& curl.exe -s -f -o $tar "http://10.0.2.2:8770/games/$name.tar"
if ($LASTEXITCODE -ne 0) { throw "download failed: $LASTEXITCODE" }
"downloaded $((Get-Item $tar).Length) bytes in $([int]((Get-Date) - $start).TotalSeconds) s"
Set-Location 'C:\Games'
& tar.exe -xf $tar
if ($LASTEXITCODE -ne 0) { throw "tar failed: $LASTEXITCODE" }
Remove-Item $tar
"unpacked in $([int]((Get-Date) - $start).TotalSeconds) s"
Get-ChildItem 'C:\Games' | Select-Object Name

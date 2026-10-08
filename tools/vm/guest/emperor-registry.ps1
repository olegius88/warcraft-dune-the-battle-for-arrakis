# Inside the VM: the install keys Emperor reads (HKLM\SOFTWARE\WOW6432Node\Westwood\Emperor, as the
# installer leaves them on the host), pointing at C:\Games\Emperor (install-game.ps1). The caller
# fills __SERIAL__ in a temporary copy (the key of the user's own install; it stays out of the repo).
$ErrorActionPreference = 'Stop'
$key = 'HKLM:\SOFTWARE\WOW6432Node\Westwood\Emperor'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty $key -Name Name -Value 'Emperor'
Set-ItemProperty $key -Name InstallPath -Value 'C:\Games\Emperor\Emperor.EXE'
Set-ItemProperty $key -Name HTMLPath -Value 'C:\Games\Emperor\Data\HTML'
Set-ItemProperty $key -Name SKU -Value 7936 -Type DWord
Set-ItemProperty $key -Name Version -Value 65545 -Type DWord
Set-ItemProperty $key -Name Serial -Value '__SERIAL__'
Get-ItemProperty $key | Select-Object Name, InstallPath, SKU, Version | Format-List

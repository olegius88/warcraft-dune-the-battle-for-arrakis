# Post a key press to the Warcraft III window without focusing it (does not touch the
# user's keyboard/mouse). Used to pass the "press any key" loading screen in tests.
# Usage: pwsh tools/wc3-key.ps1 [-Vk 0x20]
param([int]$Vk = 0x20)
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
'@
$p = Get-Process 'Warcraft III' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p -or $p.MainWindowHandle -eq 0) { 'no Warcraft III window'; exit 1 }
$h = $p.MainWindowHandle
[void][W.U]::PostMessage($h, 0x0100, [IntPtr]$Vk, [IntPtr]1)          # WM_KEYDOWN
Start-Sleep -Milliseconds 80
[void][W.U]::PostMessage($h, 0x0101, [IntPtr]$Vk, [IntPtr]0xC0000001) # WM_KEYUP
"key 0x{0:X2} posted to window 0x{1:X}" -f $Vk, [int64]$h

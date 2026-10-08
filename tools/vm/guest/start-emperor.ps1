# Inside the VM, in the user's desktop session (winrm_run.py task): start Emperor (EMPEROR.EXE starts
# Game.exe, window "Dune"; windowed through the dgVoodoo2 files in C:\Games\Emperor).
Start-Process -FilePath 'C:\Games\Emperor\EMPEROR.EXE' -WorkingDirectory 'C:\Games\Emperor'

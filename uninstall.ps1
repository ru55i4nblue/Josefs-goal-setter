# Removes the installed Goal Setter app, its shortcuts, and the startup entry.
# Run: powershell -ExecutionPolicy Bypass -File uninstall.ps1
$ErrorActionPreference = 'SilentlyContinue'

$dest = "$env:LOCALAPPDATA\Programs\Goal Setter"
Remove-Item -Recurse -Force $dest

Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Goal Setter.lnk')
Remove-Item -Force "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Goal Setter.lnk"

Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Goal Setter'

Write-Host "Goal Setter uninstalled. (Your saved tasks in %APPDATA%\Goal Setter are left intact — delete that folder too if you want a full wipe.)"

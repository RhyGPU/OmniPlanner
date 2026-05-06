@echo off
setlocal
title OmniPlan AI - Create Desktop Shortcut
color 1F

echo.
echo  ============================================
echo   OmniPlan AI - Desktop Shortcut Creator
echo  ============================================
echo.

cd /d "%~dp0"
set "OMNIPLAN_APPDIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$appDir = $env:OMNIPLAN_APPDIR.TrimEnd('\'); " ^
  "$shell = New-Object -ComObject WScript.Shell; " ^
  "$candidates = @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('Desktop'), $shell.SpecialFolders.Item('Desktop'), $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Desktop' }), $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'Desktop' })); " ^
  "$desktop = $candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) } | Select-Object -First 1; " ^
  "if ([string]::IsNullOrWhiteSpace($desktop) -and $env:USERPROFILE) { $desktop = Join-Path $env:USERPROFILE 'Desktop'; New-Item -ItemType Directory -Path $desktop -ErrorAction Stop | Out-Null }; " ^
  "if ([string]::IsNullOrWhiteSpace($desktop)) { throw 'Could not find a Desktop folder.' }; " ^
  "$shortcutPath = Join-Path $desktop 'OmniPlan AI.lnk'; " ^
  "if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force }; " ^
  "$shortcut = $shell.CreateShortcut($shortcutPath); " ^
  "$runBat = Join-Path $appDir 'run.bat'; " ^
  "$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'; " ^
  "$shortcut.Arguments = '/c ' + [char]34 + $runBat + [char]34; " ^
  "$shortcut.WorkingDirectory = $appDir; " ^
  "$shortcut.Description = 'OmniPlan AI - Executive Life OS'; " ^
  "$iconPath = Join-Path $appDir 'dist\favicon.ico'; " ^
  "if (Test-Path $iconPath) { $shortcut.IconLocation = $iconPath }; " ^
  "$shortcut.WindowStyle = 7; " ^
  "$shortcut.Save()"

if %ERRORLEVEL% equ 0 (
    echo  Desktop shortcut created successfully.
    echo.
    echo  Look for "OmniPlan AI" on your desktop.
) else (
    echo  [ERROR] Could not create shortcut.
)

echo.
if /I "%~1" neq "/quiet" pause

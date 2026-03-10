@echo off
title OmniPlan AI - Create Desktop Shortcut
color 1F
echo.
echo  ============================================
echo   OmniPlan AI - Desktop Shortcut Creator
echo  ============================================
echo.

:: Create a VBS script that generates the shortcut
set "SCRIPT=%TEMP%\create_omniplan_shortcut.vbs"
set "APPDIR=%~dp0"
:: Remove trailing backslash
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"

echo Set WshShell = WScript.CreateObject("WScript.Shell") > "%SCRIPT%"
echo Set oLink = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") ^& "\OmniPlan AI.lnk") >> "%SCRIPT%"
echo oLink.TargetPath = "%APPDIR%\run.bat" >> "%SCRIPT%"
echo oLink.WorkingDirectory = "%APPDIR%" >> "%SCRIPT%"
echo oLink.Description = "OmniPlan AI - Executive Life OS" >> "%SCRIPT%"
echo oLink.WindowStyle = 7 >> "%SCRIPT%"
echo oLink.Save >> "%SCRIPT%"

cscript //nologo "%SCRIPT%"
del "%SCRIPT%"

if %ERRORLEVEL% equ 0 (
    echo  Desktop shortcut created successfully!
    echo.
    echo  You can now launch OmniPlan AI from your desktop.
    echo  (Look for "OmniPlan AI" on your desktop)
) else (
    echo  [ERROR] Could not create shortcut.
)

echo.
pause

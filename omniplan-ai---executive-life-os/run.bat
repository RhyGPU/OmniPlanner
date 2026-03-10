@echo off
title OmniPlan AI
color 1F
echo.
echo  ============================================
echo        OmniPlan AI - Executive Life OS
echo  ============================================
echo.

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org/
    echo.
    echo  After installing, double-click this file again.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo  [1/3] First run - installing dependencies...
    echo  (This only happens once, please wait)
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo  [ERROR] Install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo.
)

:: Check if dist folder exists
if not exist "dist\index.html" (
    echo  [2/3] Building app...
    echo.
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo.
        echo  [ERROR] Build failed.
        pause
        exit /b 1
    )
    echo.
)

:: Launch Electron
echo  [3/3] Launching OmniPlan AI...
echo.
start "" npx electron .
echo  App launched! This window will close automatically.
timeout /t 2 /nobreak >nul

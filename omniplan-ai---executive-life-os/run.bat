@echo off
setlocal
title OmniPlan AI
color 1F

echo.
echo  ============================================
echo        OmniPlan AI - Executive Life OS
echo  ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Download and install Node.js from:
    echo  https://nodejs.org/
    echo.
    echo  Then double-click this file again.
    echo.
    pause
    exit /b 1
)

node "%~dp0run.js"
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Launch failed.
    echo.
    pause
    exit /b 1
)

echo.
echo  App launched. This window will close automatically.
timeout /t 2 /nobreak >nul

@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem md-outlet beginner launcher (Windows)
rem Double-click: empty UI (console visible).
rem File argument: open .md / data files via SendTo / drag.
rem SendTo shortcut is already Run Minimized - do NOT re-launch here
rem (nested start /min used to drop the console immediately).

cd /d "%~dp0"
title md-outlet UI

set "MD_FILE="
if not "%~1"=="" set "MD_FILE=%~1"

echo.
echo ========================================
echo   md-outlet  -  Markdown editor + PDF
echo ========================================
echo.
echo Folder: %CD%
if defined MD_FILE (
  echo Document: %MD_FILE%
) else (
  echo Document: ^(empty - pick from recent / Open^)
)
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node

where npm >nul 2>&1
if errorlevel 1 goto :no_npm

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo Node.js: %NODE_VER%
echo.

if not exist "package.json" goto :no_pkg

if not exist "node_modules\" goto :do_install
echo Dependencies: OK
echo.
goto :run_ui

:do_install
echo First-time setup: running npm install...
echo This may take a few minutes.
echo.
call npm install
if errorlevel 1 goto :install_fail
echo.
echo Setup complete.
echo.
goto :run_ui

:run_ui
echo Starting UI...
echo Browser opens automatically.
echo Close the browser tab to stop ^(or restore this window and Ctrl+C^).
echo.

if defined MD_FILE (
  if not exist "%MD_FILE%" goto :no_md
  call npx --yes md-outlet ui "%MD_FILE%"
) else (
  call npx --yes md-outlet ui
)

set "EXITCODE=%ERRORLEVEL%"
echo.
rem 0 = clean stop. 1 = Ctrl+C / task kill after UI was running (not a launch error).
if "%EXITCODE%"=="0" goto :ui_stopped
if "%EXITCODE%"=="1" goto :ui_stopped
goto :ui_fail

:ui_stopped
echo md-outlet UI stopped.
pause
exit /b 0

:no_md
echo [ERROR] File not found:
echo   %MD_FILE%
echo.
pause
exit /b 1

:no_node
echo [ERROR] Node.js not found.
echo.
echo Install Node.js LTS from:
echo   https://nodejs.org/
echo.
echo Then double-click this file again.
echo.
pause
exit /b 1

:no_npm
echo [ERROR] npm not found. Try reinstalling Node.js.
echo   https://nodejs.org/
echo.
pause
exit /b 1

:no_pkg
echo [ERROR] package.json missing. Run this from the md-outlet folder.
echo.
pause
exit /b 1

:install_fail
echo.
echo [ERROR] npm install failed.
echo Check network and Node.js version (18+ recommended).
echo.
pause
exit /b 1

:ui_fail
echo [ERROR] Exit code %EXITCODE%
echo.
pause
exit /b %EXITCODE%

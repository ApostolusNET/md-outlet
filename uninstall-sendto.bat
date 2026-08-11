@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem Remove md-outlet from the Windows Explorer Send to menu.

set "LNK=%APPDATA%\Microsoft\Windows\SendTo\md-outlet.lnk"

echo.
echo ========================================
echo   md-outlet - SendTo uninstall
echo ========================================
echo.

if not exist "%LNK%" (
  echo Already removed ^(or never installed^):
  echo   %LNK%
  echo.
  pause
  exit /b 0
)

del /f /q "%LNK%"
if errorlevel 1 (
  echo [ERROR] Could not delete:
  echo   %LNK%
  echo.
  pause
  exit /b 1
)

echo Removed:
echo   %LNK%
echo.
pause
exit /b 0

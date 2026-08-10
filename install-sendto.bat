@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem Register SendTo -> PowerShell launcher (Unicode / Japanese paths OK)

cd /d "%~dp0"
set "SENDTO=%APPDATA%\Microsoft\Windows\SendTo"
set "LNK=%SENDTO%\md-outlet.lnk"
set "PS1=%~dp0start-ui-sendto.ps1"

echo.
echo ========================================
echo   md-outlet - SendTo register
echo ========================================
echo.
echo Shortcut: %LNK%
echo Script:   %PS1%
echo Window:   Hidden (no extra shell for 2nd+)
echo.

if not exist "%PS1%" (
  echo [ERROR] start-ui-sendto.ps1 not found.
  pause
  exit /b 1
)

if not exist "%SENDTO%\" (
  echo [ERROR] SendTo folder not found:
  echo   %SENDTO%
  pause
  exit /b 1
)

rem Pass script path via env; create shortcut with Hidden window.
set "MD_OUTLET_SENDTO_PS1=%PS1%"
set "MD_OUTLET_SENDTO_LNK=%LNK%"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$ps1 = $env:MD_OUTLET_SENDTO_PS1;" ^
  "$lnk = $env:MD_OUTLET_SENDTO_LNK;" ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "$sc = $sh.CreateShortcut($lnk);" ^
  "$sc.TargetPath = (Get-Command powershell.exe).Source;" ^
  "$sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $ps1 + '\"';" ^
  "$sc.WorkingDirectory = (Split-Path -Parent $ps1);" ^
  "$sc.WindowStyle = 7;" ^
  "$sc.Description = 'Open files with md-outlet';" ^
  "$sc.Save();" ^
  "Write-Host 'OK: SendTo shortcut created.'"

if errorlevel 1 goto :fail

echo.
echo Usage:
echo   Right-click .md / .xml / .json / .yaml / .txt / .log / .csv
echo   -^> Send to -^> md-outlet
echo   2nd+ opens in existing UI (no extra shell)
echo   Close the browser tab to stop the UI
echo.
echo Uninstall: uninstall-sendto.bat
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Failed to create SendTo shortcut.
echo.
pause
exit /b 1

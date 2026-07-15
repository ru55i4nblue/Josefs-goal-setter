@echo off
REM ============================================================
REM  Goal Setter - rebuild from source and update the installed app.
REM  Double-click this file after making code changes.
REM ============================================================
setlocal
cd /d "%~dp0"
title Updating Goal Setter

echo.
echo  [1/4] Closing Goal Setter if it is running...
taskkill /im "Goal Setter.exe" /f >nul 2>&1

echo  [2/4] Building app from source...
call npm run package
if errorlevel 1 (
  echo.
  echo  BUILD FAILED. See the messages above.
  pause
  exit /b 1
)

echo  [3/4] Installing to %%LOCALAPPDATA%%\Programs\Goal Setter ...
robocopy "dist\Goal Setter-win32-x64" "%LOCALAPPDATA%\Programs\Goal Setter" /MIR /NFL /NDL /NJH /NJS /NP >nul
if %errorlevel% geq 8 (
  echo.
  echo  INSTALL FAILED while copying files.
  pause
  exit /b 1
)

echo  [4/4] Done. Goal Setter is updated.
echo.
choice /c YN /m "Launch Goal Setter now"
if errorlevel 2 goto end
start "" "%LOCALAPPDATA%\Programs\Goal Setter\Goal Setter.exe"

:end
endlocal

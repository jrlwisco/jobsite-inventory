@echo off
rem Jobsite Inventory - makes a dated backup zip in Documents\Inventory Backups
setlocal
title Backup Inventory
cd /d "%~dp0"
if not exist "%~dp0app\package.json" goto notready

rem --- Find Node.js (also look in its normal install folder, in case PATH is not updated yet) ---
where node >nul 2>nul
if not errorlevel 1 goto havenode
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto havenode
goto nonode

:havenode
if not exist "%~dp0app\node_modules\better-sqlite3\package.json" goto notready
node "%~dp0app\windows\backup.js"
if errorlevel 1 goto failed
pause
exit /b 0

:failed
echo   The backup did not finish - see the message above.
echo.
pause
exit /b 1

:notready
echo.
echo   Start the inventory at least once first: double-click "Start Inventory".
echo.
pause
exit /b 1

:nonode
color 4F
echo.
echo   ================================================================
echo.
echo     Node.js is not installed yet. The inventory needs it.
echo.
echo     Your browser will now open the Node.js download page.
echo     1. Click the "Windows Installer (.msi)" button - the LTS version.
echo     2. Open the downloaded file and click Next until it is done.
echo        Keep all the normal settings.
echo     3. Then double-click "Start Inventory" again.
echo.
echo   ================================================================
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

@echo off
rem Jobsite Inventory - double-click to start. Close the window to stop.
setlocal
title Jobsite Inventory - leave this window open
cd /d "%~dp0"
if not exist "%~dp0app\package.json" goto notextracted

rem --- Find Node.js (also look in its normal install folder, in case PATH is not updated yet) ---
where node >nul 2>nul
if not errorlevel 1 goto havenode
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto havenode
goto nonode

:havenode
node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=14)?0:1)"
if errorlevel 1 goto oldnode

if exist "%~dp0app\node_modules\better-sqlite3\package.json" goto run
echo.
echo   First time setup: getting the app ready. This takes a minute or two.
echo   The internet is needed this one time.
echo.
pushd "%~dp0app"
call npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
set "NPMERR=%errorlevel%"
popd
if not "%NPMERR%"=="0" goto npmfail
if not exist "%~dp0app\node_modules\better-sqlite3\package.json" goto npmfail

:run
color 1F
node "%~dp0app\windows\launcher.js" %*
if errorlevel 1 goto crashed
exit /b 0

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

:oldnode
color 4F
echo.
echo   Your Node.js is too old for the inventory.
echo   Your browser will open the download page: install the LTS version,
echo   then double-click "Start Inventory" again.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:npmfail
color 4F
echo.
echo   First time setup did not finish.
echo   Check that the laptop is connected to the internet,
echo   then close this window and double-click "Start Inventory" again.
echo.
if exist "%~dp0app\node_modules" rmdir /s /q "%~dp0app\node_modules"
pause
exit /b 1

:notextracted
echo.
echo   Please unzip the download first:
echo   right-click the zip file, choose "Extract All...", then open the
echo   "Jobsite Inventory" folder and double-click "Start Inventory" there.
echo.
pause
exit /b 1

:crashed
color 4F
echo.
echo   The inventory stopped because of a problem - see the message above.
echo   Take a photo of this window if you need help.
echo.
pause
exit /b 1

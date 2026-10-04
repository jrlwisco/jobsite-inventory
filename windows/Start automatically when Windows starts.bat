@echo off
rem Adds "Jobsite Inventory" to the Windows Startup folder, so it starts (minimized) when you sign in.
setlocal
cd /d "%~dp0"
set "STARTUPDIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUPDIR%\Jobsite Inventory.lnk"
set "CMDFILE=%STARTUPDIR%\Jobsite Inventory.cmd"
set "TARGET=%~dp0Start Inventory.bat"
set "WORKDIR=%~dp0"
if not exist "%STARTUPDIR%" mkdir "%STARTUPDIR%"
if exist "%CMDFILE%" del "%CMDFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath=$env:TARGET; $s.Arguments='--startup'; $s.WorkingDirectory=$env:WORKDIR; $s.WindowStyle=7; $s.Description='Jobsite Inventory'; $s.Save()" >nul 2>nul
if exist "%LNK%" goto done
rem PowerShell not available: use a small starter file instead.
> "%CMDFILE%" echo @echo off
>> "%CMDFILE%" echo cd /d "%WORKDIR%"
>> "%CMDFILE%" echo start "Jobsite Inventory" /min "%TARGET%" --startup
if not exist "%CMDFILE%" goto failed

:done
echo.
echo   Done. The inventory will now start by itself when you sign in to Windows.
echo   It starts minimized - look for its window on the taskbar.
echo.
echo   If you move the "Jobsite Inventory" folder, run this again.
echo   To undo: double-click "Stop starting automatically".
echo.
pause
exit /b 0

:failed
echo.
echo   Sorry, that did not work. You can still start it by hand with "Start Inventory".
echo.
pause
exit /b 1

@echo off
rem Removes "Jobsite Inventory" from the Windows Startup folder.
setlocal
set "STARTUPDIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUPDIR%\Jobsite Inventory.lnk" del "%STARTUPDIR%\Jobsite Inventory.lnk"
if exist "%STARTUPDIR%\Jobsite Inventory.cmd" del "%STARTUPDIR%\Jobsite Inventory.cmd"
echo.
echo   Done. The inventory will no longer start by itself.
echo   (It keeps running now if it is open. Close its window to stop it.)
echo.
pause
exit /b 0

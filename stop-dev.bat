@echo off
chcp 65001 >nul
setlocal
set "Y=%~dp0"

echo Stopping MongoDB ...
node "%Y%scripts\mongo.mjs" stop
echo.
echo Now close the "yinge-backend" and "yinge-frontend" windows to stop the servers.
echo.
pause
endlocal

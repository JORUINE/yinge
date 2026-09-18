@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

REM ---- 定位 node / npm（与 start-dev.bat 一致）----
set "EXTRA_PATH="
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3" (
  set "EXTRA_PATH=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3"
)
if exist "C:\Program Files\nodejs" (
  if not defined EXTRA_PATH (set "EXTRA_PATH=C:\Program Files\nodejs") else (set "EXTRA_PATH=%EXTRA_PATH%;C:\Program Files\nodejs")
)
if defined EXTRA_PATH set "PATH=%EXTRA_PATH%;%PATH%"

echo 停止 MongoDB 数据库...
node "%Y%scripts\mongo.mjs" stop
echo.
echo 接下来请手动关掉「yinge-backend」和「yinge-frontend」两个黑窗口，后端和前端就停了。
echo.
pause
endlocal

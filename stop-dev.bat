@echo off
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

set "NODE_EXE=node"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
) else if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)

echo 停止 MongoDB 数据库...
"%NODE_EXE%" "%Y%scripts\mongo.mjs" stop
echo.
echo 接着请手动关掉「yinge-backend」和「yinge-frontend」两个黑窗口，前后端就停了。
echo.
pause
endlocal

@echo off
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

echo ==========================================================
echo   音格 YINGE - 一键启动器
echo   自动启动：MongoDB 数据库 + 后端(3000) + 前端(5173)
echo   重复双击本脚本 = 重启（自动清理旧进程）
echo ==========================================================
echo.

REM ---- 1) 选定 Node（优先托管 Node 22；系统 Node 18 的 --watch 在本机会无限重启）----
set "NODE_EXE=node"
set "USE_WATCH=0"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
  set "USE_WATCH=1"
) else if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)
echo 已确定 Node：%NODE_EXE%
if "%USE_WATCH%"=="1" (echo 模式：自动重载) else (echo 模式：普通启动，改代码后请重新双击本脚本)
echo.

set "NODE_DIR="
if "%USE_WATCH%"=="1" (set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3")
if not defined NODE_DIR (if exist "C:\Program Files\nodejs" set "NODE_DIR=C:\Program Files\nodejs")
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

REM ---- 2) 启动 MongoDB（后台服务，无需手动打开）----
echo [1/5] 启动 MongoDB 数据库（端口 27017）...
"%NODE_EXE%" "%Y%scripts\mongo.mjs" start
echo.

REM ---- 3) 清理历史残留索引（安全、幂等）----
echo [2/5] 检查历史索引...
"%NODE_EXE%" "%Y%backend\scripts\migrate-drop-stale-indexes.mjs"
echo.

REM ---- 4) 杀掉 3000 / 5173 旧进程 ----
echo [3/5] 清理 3000 / 5173 端口上的旧进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
echo.

REM ---- 5) 启动后端 + 前端（各自独立窗口）----
echo [4/5] 启动后端（http://127.0.0.1:3000）...
if "%USE_WATCH%"=="1" (
  start "yinge-backend" /min /D "%Y%backend" cmd /k ""%NODE_EXE%" --watch src/server.js"
) else (
  start "yinge-backend" /D "%Y%backend" cmd /k ""%NODE_EXE%" src/server.js"
)
echo [5/5] 启动前端（http://localhost:5173）...
start "yinge-frontend" /min /D "%Y%frontend" cmd /k ""%NODE_EXE%" node_modules/vite/bin/vite.js"
echo.

echo 等 8 秒让前端就绪，然后自动打开浏览器...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo ----------------------------------------------------------
echo  已全部启动，请留意弹出的两个黑色窗口：
echo    - yinge-backend  ：后端接口服务（端口 3000）
echo    - yinge-frontend ：网页前端（端口 5173）
echo.
echo  重启 = 再双击一次本脚本；关闭 = 关掉那两个黑窗口
echo  停数据库 = 双击同目录 stop-dev.bat
echo  验证后端 = 浏览器打开 http://127.0.0.1:3000/health
echo ----------------------------------------------------------
echo.
echo   Started. Two log windows are minimized in the taskbar:
echo     - yinge-backend  : API server,  port 3000
echo     - yinge-frontend : web frontend, port 5173
echo.
echo   This black window closes itself in 5 seconds - it does NOT stay
echo   in the foreground any more. (A leftover foreground console was the
echo   reason minimizing the browser felt like "keep switching windows".)
echo.
echo   Restart = run this script again;  Stop DB = stop-dev.bat
echo ----------------------------------------------------------
echo.
timeout /t 5 /nobreak >nul
endlocal
exit /b 0

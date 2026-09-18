@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

echo ==========================================================
echo   音格 YINGE - 一键启动器
echo   自动启动：MongoDB 数据库 + 后端(3000) + 前端(5173)
echo   重复双击本脚本 = 重启（自动清理旧进程）
echo ==========================================================
echo.

REM ---- 1) 选定 Node 可执行文件（优先用托管 Node 22，--watch 才正常）----
REM     关键坑：系统自带 Node 18 的 "node --watch" 在本机会无限重启，
REM     导致后端永远绑不上 3000 端口、网站打不开。所以强制用 Node 22。
set "NODE_EXE=node"
set "USE_WATCH=0"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
  set "USE_WATCH=1"
) else if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)
echo 已确定 Node 路径：%NODE_EXE%
if "%USE_WATCH%"=="1" (echo （将用 --watch 自动重载，改代码后刷新即可）) else (echo （本机没找到 Node 22，用普通启动，改代码后请重双击本脚本）)
echo.

REM 把选定 Node 所在目录也放进 PATH，供前端 npm 使用
set "NODE_DIR="
if "%USE_WATCH%"=="1" (set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3")
if not defined NODE_DIR (if exist "C:\Program Files\nodejs" set "NODE_DIR=C:\Program Files\nodejs")
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

REM ---- 2) 启动 MongoDB 数据库（后台服务，无需手动打开）----
echo [1/5] 启动 MongoDB 数据库（端口 27017）...
"%NODE_EXE%" "%Y%scripts\mongo.mjs" start
echo.

REM ---- 3) 清理历史残留索引（幂等、安全）----
echo [2/5] 检查历史索引（安全、幂等）...
"%NODE_EXE%" "%Y%backend\scripts\migrate-drop-stale-indexes.mjs"
echo.

REM ---- 4) 杀掉 3000 / 5173 上的旧进程（保证重启干净）----
echo [3/5] 清理 3000 / 5173 端口上的旧进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
echo.

REM ---- 5) 启动后端 + 前端（各自独立黑窗口，会一直开着）----
REM     直接用写死的 Node 22 路径启动，避免子窗口没继承 PATH 而误用 Node 18。
echo [4/5] 启动后端（http://127.0.0.1:3000）...
if "%USE_WATCH%"=="1" (
  start "yinge-backend" /D "%Y%backend" cmd /k ""%NODE_EXE%" --watch src/server.js"
) else (
  start "yinge-backend" /D "%Y%backend" cmd /k ""%NODE_EXE%" src/server.js"
)
echo [5/5] 启动前端（http://localhost:5173）...
start "yinge-frontend" /D "%Y%frontend" cmd /k ""%NODE_EXE%" node_modules/vite/bin/vite.js"
echo.

echo 等 8 秒让前端就绪，然后自动打开浏览器...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo ----------------------------------------------------------
echo  已全部启动！请留意弹出的两个黑色窗口：
echo    - yinge-backend ：后端接口服务（端口 3000）
echo    - yinge-frontend ：网页前端（端口 5173），浏览器已自动打开
echo.
echo  重启 = 再双击一次本脚本（自动清旧进程）
echo  关闭 = 直接关掉上面两个黑窗口
echo  停数据库 = 双击同目录 stop-dev.bat
echo  验证后端 = 浏览器打开 http://127.0.0.1:3000/health
echo  首次使用 = 去 /login 注册一个账号，再点「创建对决」
echo ----------------------------------------------------------
echo.
pause
endlocal

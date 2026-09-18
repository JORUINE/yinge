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

REM ---- 1) 定位 node / npm（关键：双击启动时可能不在 PATH 里）----
set "EXTRA_PATH="
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3" (
  set "EXTRA_PATH=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3"
)
if exist "C:\Program Files\nodejs" (
  if not defined EXTRA_PATH (set "EXTRA_PATH=C:\Program Files\nodejs") else (set "EXTRA_PATH=%EXTRA_PATH%;C:\Program Files\nodejs")
)
if defined EXTRA_PATH set "PATH=%EXTRA_PATH%;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 在本机找不到 Node.js。
  echo   请先到 https://nodejs.org 下载安装 LTS 版（建议 20 以上），装完重启电脑再双击本脚本。
  echo   如果确认已安装，请在开始菜单搜"环境变量"，把 Node 安装目录加进 PATH，再重跑。
  pause
  exit /b 1
)
for %%i in (node.exe) do set "NODE_EXE=%%~$PATH:i"
echo 已找到 Node：%NODE_EXE%
echo.

REM ---- 2) 启动 MongoDB 数据库（后台服务，无需手动打开）----
echo [1/5] 启动 MongoDB 数据库（端口 27017）...
node "%Y%scripts\mongo.mjs" start
echo.

REM ---- 3) 清理历史残留索引（幂等、安全）----
echo [2/5] 检查历史索引（安全、幂等）...
node "%Y%backend\scripts\migrate-drop-stale-indexes.mjs"
echo.

REM ---- 4) 杀掉 3000 / 5173 上的旧进程（保证重启干净）----
echo [3/5] 清理 3000 / 5173 端口上的旧进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
echo.

REM ---- 5) 启动后端 + 前端（各自独立黑窗口，会一直开着）----
echo [4/5] 启动后端（http://127.0.0.1:3000，改代码自动重载）...
start "yinge-backend" /D "%Y%backend" cmd /k "npm run dev"
echo [5/5] 启动前端（http://localhost:5173）...
start "yinge-frontend" /D "%Y%frontend" cmd /k "npm run dev"
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
echo  重启 = 再双击一次本脚本（自动清旧进程，新代码立即生效）
echo  关闭 = 直接关掉上面两个黑窗口
echo  停数据库 = 双击同目录 stop-dev.bat
echo  验证后端 = 浏览器打开 http://127.0.0.1:3000/health
echo  首次使用 = 去 /login 注册一个账号，再点「创建对决」
echo ----------------------------------------------------------
echo.
pause
endlocal

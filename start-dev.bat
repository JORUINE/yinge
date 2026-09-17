@echo off
chcp 65001 >nul
setlocal
set "Y=%~dp0"

echo ==========================================================
echo   YINGE - one-click dev launcher
echo   MongoDB + index check + backend API + frontend
echo   提示：重复双击本脚本 = 重启（会自动清掉旧进程再启动）
echo ==========================================================
echo.

echo [1/5] MongoDB ...
node "%Y%scripts\mongo.mjs" start
echo.

echo [2/5] Checking legacy DB indexes (safe, idempotent) ...
node "%Y%backend\scripts\migrate-drop-stale-indexes.mjs"
echo.

echo [3/5] 清理旧进程（3000 / 5173 端口上还活着的旧后端、旧前端）...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
echo.

echo [4/5] Backend API   http://127.0.0.1:3000  (auto-reload ON) ...
start "yinge-backend"  /D "%Y%backend"  cmd /k "npm run dev"
echo.

echo [5/5] Frontend      http://localhost:5173 ...
start "yinge-frontend" /D "%Y%frontend" cmd /k "npm run dev"
echo.

echo Waiting 8s for the frontend, then opening the browser ...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo ----------------------------------------------------------
echo  All set.
echo   怎么重启：再双击一次本脚本即可（自动清旧进程，新代码立即生效）
echo   怎么关闭：直接关掉 yinge-backend / yinge-frontend 两个窗口
echo   停数据库：双击 stop-dev.bat（下次 start-dev.bat 会再拉起）
echo   后端改代码：自动重载（node --watch），无需任何手动操作
echo   验证后端活着：浏览器打开 http://127.0.0.1:3000/health
echo   First time? Register at /login, then open 创建对决.
echo ----------------------------------------------------------
echo.
endlocal

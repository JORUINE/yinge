@echo off
chcp 65001 >nul
setlocal
set "Y=%~dp0"

echo ==========================================================
echo   YINGE - one-click dev launcher
echo   (MongoDB + index check + backend API + frontend)
echo ==========================================================
echo.

echo [1/4] MongoDB ...
node "%Y%scripts\mongo.mjs" start
echo.

echo [2/4] Checking legacy DB indexes (safe, idempotent) ...
node "%Y%backend\scripts\migrate-drop-stale-indexes.mjs"
echo.

echo [3/4] Backend API   http://127.0.0.1:3000  (auto-reload ON)
start "yinge-backend"  /D "%Y%backend"  cmd /k "npm run dev"
echo.

echo [4/4] Frontend      http://localhost:5173 ...
start "yinge-frontend" /D "%Y%frontend" cmd /k "npm run dev"
echo.

echo Waiting 8s for the frontend, then opening the browser ...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo ----------------------------------------------------------
echo  All set.
echo   backend  window: yinge-backend
echo   frontend window: yinge-frontend
echo   Close those two windows to stop backend / frontend.
echo   Backend auto-reloads when code changes (node --watch). No manual restart.
echo   Stop MongoDB   : double-click stop-dev.bat
echo   First time? Register at /login, then open 创建对决.
echo ----------------------------------------------------------
echo.
endlocal

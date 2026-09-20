@echo off
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

echo ==========================================================
echo   YINGE - production preview (for the Edge minimize test)
echo ----------------------------------------------------------
echo   Same page, but served from the built files - no dev
echo   server, no HMR websocket.
echo   * If Edge stops flickering here  -> the dev server/HMR
echo     was involved, the page itself is fine.
echo   * If it still flickers           -> page AND dev server
echo     are both cleared; it is Edge/Windows window level
echo     (hardware acceleration / focus).
echo ==========================================================
echo.

set "NODE_EXE=node"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"

echo [1/4] starting MongoDB...
"%NODE_EXE%" "%Y%scripts\mongo.mjs" start

echo [2/4] freeing ports 3000 / 5173...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

echo [3/4] starting backend (port 3000)...
start "yinge-backend" /min /D "%Y%backend" cmd /k ""%NODE_EXE%" src/server.js"

echo [4/4] building + serving the production bundle (port 5173, ~20s)...
pushd "%Y%frontend"
call "%NODE_EXE%" node_modules\vite\bin\vite.js build
popd
start "yinge-preview" /min /D "%Y%frontend" cmd /k ""%NODE_EXE%" node_modules\vite\bin\vite.js preview --port 5173"

echo.
echo   waiting 10s, then opening http://localhost:5173 ...
timeout /t 10 /nobreak >nul
start "" http://localhost:5173
echo.
echo   Both log windows are minimized in the taskbar.
echo   This window closes itself in 5 seconds.
echo   Restart = run this script again;  Stop DB = stop-dev.bat
timeout /t 5 /nobreak >nul
endlocal
exit /b 0

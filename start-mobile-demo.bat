@echo off
setlocal EnableExtensions
set "Y=%~dp0"
cd /d "%Y%"

echo ============================================================
echo   YINGE - MOBILE DEMO LAUNCHER
echo   Starts: MongoDB (27017) + API (3000) + Web (5173, --host)
echo   Then opens the Chinese instruction page automatically.
echo ============================================================
echo.

REM ---- pick Node: managed 22.22.2-6 first, then system Node ----
set "NODE_EXE=node"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
) else if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)
echo   Node: %NODE_EXE%
echo.

REM ---- 1) MongoDB ----
echo [1/4] MongoDB on 27017 ...
"%NODE_EXE%" "%Y%scripts\mongo.mjs" start
echo.

REM ---- 2) free ports 3000 / 5173 ----
echo [2/4] Freeing ports 3000 / 5173 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
echo.

REM ---- 3) backend + frontend (frontend binds 0.0.0.0 so phones can join) ----
echo [3/4] Starting API on 3000 and Web on 5173 ...
start "yinge-backend" /min /D "%Y%backend" cmd /k ""%NODE_EXE%" src/server.js"
start "yinge-frontend" /min /D "%Y%frontend" cmd /k ""%NODE_EXE%" node_modules\vite\bin\vite.js --host"
echo.

echo [4/4] Waiting 10s for the web server to come up ...
timeout /t 10 /nobreak >nul
echo.

echo ------------------------------------------------------------
echo   PHONE ACCESS (same Wi-Fi required):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do echo      http://%%b:5173
)
echo.
echo   PC / phone-emulation access:
echo      http://localhost:5173
echo      then press F12 and click the phone icon (or Ctrl+Shift+M)
echo ------------------------------------------------------------
echo.

start "" "%Y%docs\mobile-demo.html"
start "" http://localhost:5173

echo   Both log windows are minimized in the taskbar.
echo   The Chinese instruction page + 11 real screenshots just opened.
echo.
echo   Stop everything: run stop-dev.bat
echo   This window stays open so you can read the addresses above.
echo ------------------------------------------------------------
pause
endlocal

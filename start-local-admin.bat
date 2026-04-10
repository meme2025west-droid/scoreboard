@echo off
setlocal

cd /d "%~dp0"

echo Starting Scorecard API on http://localhost:3001 ...
start "Scorecard API" cmd /k "cd /d "%~dp0server" && node src/index.js"

echo Starting Scorecard Web on http://localhost:5176 ...
start "Scorecard Web" cmd /k "cd /d "%~dp0client" && npm run dev -- --port 5176 --strictPort"

REM Give Vite a moment to start before opening browser
timeout /t 3 /nobreak >nul

echo Opening admin page...
start "" "http://localhost:5176/admin"

echo.
echo Admin token: cat
echo.
echo Close the two opened terminal windows to stop the app.

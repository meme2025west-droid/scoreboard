@echo off
setlocal

cd /d "%~dp0"

echo Rebuilding Scorecard desktop package...
call npm run desktop:rebuild

if errorlevel 1 (
  echo.
  echo Desktop rebuild failed.
  exit /b %errorlevel%
)

echo.
echo Desktop rebuild complete.
echo Installer and packaged app are in dist\
@echo off
setlocal
cd /d "%~dp0"
set "NODE_USE_SYSTEM_CA=1"
set "npm_config_offline=false"

if not exist "node_modules" (
    echo Installing web application dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

call npm start
exit /b %ERRORLEVEL%

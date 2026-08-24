@echo off
setlocal

cd /d "%~dp0web"
if errorlevel 1 (
    echo [ERROR] The web directory could not be found.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Please install Node.js first.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH. Please install Node.js first.
    pause
    exit /b 1
)

if not exist "node_modules\." (
    echo [INFO] node_modules is missing. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Starting the web app...
call npm run dev
set "DEV_EXIT=%ERRORLEVEL%"
echo [INFO] The web app stopped with exit code %DEV_EXIT%.
pause
exit /b %DEV_EXIT%

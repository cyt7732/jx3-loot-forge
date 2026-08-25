@echo off
setlocal

cd /d "%~dp0"

if exist "剑网3掉落工坊.html" (
    echo [INFO] 正在打开离线版 剑网3掉落工坊...
    start "" "%~dp0剑网3掉落工坊.html"
    exit /b 0
)

if exist "web\dist\offline\index.html" (
    echo [INFO] 正在打开离线版 剑网3掉落工坊...
    start "" "%~dp0web\dist\offline\index.html"
    exit /b 0
)

cd /d "%~dp0web"
if errorlevel 1 (
    echo [ERROR] 未找到 web 目录。
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 Node.js 环境，且未检测到预先构建好的离线 HTML 文件。
    pause
    exit /b 1
)

if not exist "node_modules\." (
    echo [INFO] 首次运行，正在安装依赖...
    call npm install
)

echo [INFO] 正在生成单文件离线网页...
call npm run build:offline

if exist "%~dp0剑网3掉落工坊.html" (
    start "" "%~dp0剑网3掉落工坊.html"
) else (
    start "" "%~dp0web\dist\offline\index.html"
)
exit /b 0

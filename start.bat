@echo off
echo TaskDog 脚本管理工具启动脚本
echo ================================

echo 正在检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo 正在检查项目依赖...

cd /d "%~dp0backend"
if not exist "node_modules" (
    echo 正在安装后端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo 错误: 后端依赖安装失败
        pause
        exit /b 1
    )
)

cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo 正在安装前端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo 错误: 前端依赖安装失败
        pause
        exit /b 1
    )
)

echo 正在启动后端服务...
cd /d "%~dp0backend"
start "TaskDog Backend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo 正在启动前端服务...
cd /d "%~dp0frontend"
start "TaskDog Frontend" cmd /k "npm run dev"

echo.
echo TaskDog 已启动！
echo 前端地址: http://localhost:3000
echo 后端地址: http://localhost:3001
echo.
echo 按任意键关闭此窗口...
pause >nul

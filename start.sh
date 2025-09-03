#!/bin/bash

echo "TaskDog 脚本管理工具启动脚本"
echo "=============================="

# 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "正在检查项目依赖..."

# 安装后端依赖
cd "$(dirname "$0")/backend"
if [ ! -d "node_modules" ]; then
    echo "正在安装后端依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误: 后端依赖安装失败"
        exit 1
    fi
fi

# 安装前端依赖
cd "../frontend"
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误: 前端依赖安装失败"
        exit 1
    fi
fi

echo "正在启动后端服务..."
cd "../backend"
npm run dev &
BACKEND_PID=$!

sleep 3

echo "正在启动前端服务..."
cd "../frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "TaskDog 已启动！"
echo "前端地址: http://localhost:3000"
echo "后端地址: http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止服务"

# 等待用户中断
trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait

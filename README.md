# TaskDog 脚本管理工具

TaskDog 是一个现代化的脚本管理和定时任务调度工具，提供直观的 Web 界面来管理您的自动化脚本。

## ✨ 主要功能

- 🔧 **脚本管理** - 创建、编辑、测试和管理各种类型的脚本
- ⏰ **定时任务** - 基于 Cron 表达式的定时任务调度
- ⚙️ **配置管理** - 集中管理应用程序配置
- 📊 **日志管理** - 完整的操作日志和执行记录
- 🎨 **现代 UI** - 基于 Vue3 + Element Plus 的美观界面
- 🚀 **高性能** - 基于 Node.js + Koa 的高效后端

## 🔧 技术栈

### 前端
- Vue 3 - 渐进式 JavaScript 框架
- Pinia - Vue 状态管理
- Element Plus - Vue 3 组件库
- Vite - 现代化构建工具

### 后端
- Node.js - JavaScript 运行时
- Koa - 轻量级 Web 框架
- lowdb - 基于 JSON 的轻量级数据库
- node-cron - Cron 任务调度

## 📋 系统要求

- Node.js 16+ 
- npm 或 yarn 包管理器
- Windows 10+ (推荐)
- Python 3.x (可选，用于 Python 脚本)
- PowerShell 5.0+ (用于 PowerShell 脚本)

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd TaskDog
```

### 2. 安装依赖
```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 3. 启动服务
使用提供的启动脚本：

**Windows:**
```cmd
start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**手动启动:**
```bash
# 启动后端服务 (端口 3001)
cd backend
npm start

# 启动前端服务 (端口 3000)
cd frontend
npm run dev
```

### 4. 访问应用
打开浏览器访问：http://localhost:3000

## 📖 使用指南

### 脚本管理
1. 点击 "脚本管理" 进入脚本管理页面
2. 点击 "创建脚本" 按钮
3. 填写脚本信息：
   - 脚本名称：给脚本一个描述性的名称
   - 描述：说明脚本的功能
   - 语言：选择脚本语言 (PowerShell, Python, Batch, Node.js 等)
   - 脚本内容：编写脚本代码
4. 点击 "测试运行" 验证脚本功能
5. 保存脚本

### 定时任务
1. 进入 "定时任务" 页面
2. 点击 "创建任务" 
3. 配置任务参数：
   - 任务名称：任务的描述性名称
   - 选择脚本：从已创建的脚本中选择
   - Cron 表达式：设置执行时间
   - 状态：激活或停用任务
4. 保存并启动任务

### Cron 表达式示例
- `0 9 * * *` - 每天上午 9:00
- `0 */2 * * *` - 每两小时执行一次
- `0 0 * * 1` - 每周一午夜执行
- `30 2 1 * *` - 每月 1 日凌晨 2:30
- `0 0 * * 1-5` - 工作日午夜执行

### 配置管理
在配置管理页面可以：
- 查看和修改应用程序配置
- 按分类组织配置项
- 批量更新配置

### 日志管理
日志系统记录了：
- 系统操作日志
- 脚本执行记录
- 任务调度日志
- 错误和异常信息

## 🗂️ 项目结构

```
TaskDog/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── controllers/     # 控制器
│   │   ├── middleware/      # 中间件
│   │   ├── models/          # 数据模型
│   │   ├── routes/          # 路由
│   │   │   ├── scripts.js   # 脚本管理路由
│   │   │   ├── tasks.js     # 定时任务路由
│   │   │   ├── config.js    # 配置管理路由
│   │   │   └── logs.js      # 日志管理路由
│   │   ├── utils/           # 工具类
│   │   │   ├── database.js  # 数据库工具
│   │   │   └── scheduler.js # 任务调度器
│   │   └── app.js           # 应用入口
│   ├── data/
│   │   └── taskdog.json     # 数据文件
│   ├── temp/                # 临时文件目录
│   └── package.json
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── api/             # API 封装
│   │   ├── components/      # 组件
│   │   ├── router/          # 路由配置
│   │   ├── stores/          # 状态管理
│   │   ├── views/           # 页面视图
│   │   │   ├── Scripts.vue  # 脚本管理页面
│   │   │   ├── Tasks.vue    # 定时任务页面
│   │   │   ├── Config.vue   # 配置管理页面
│   │   │   └── Logs.vue     # 日志管理页面
│   │   ├── App.vue          # 主应用组件
│   │   └── main.js          # 应用入口
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── start.bat                # Windows 启动脚本
├── start.sh                 # Linux/macOS 启动脚本
└── README.md               # 项目说明
```

## 🔧 支持的脚本类型

### PowerShell
- Windows 原生支持
- 适合系统管理任务
- 丰富的系统 API

### Python
- 需要安装 Python 3.x
- 适合数据处理和自动化
- 丰富的第三方库

### Batch (CMD)
- Windows 批处理脚本
- 简单的系统操作
- 无需额外依赖

### Node.js (JavaScript)
- 基于 Node.js 运行时
- 适合 Web 相关任务
- npm 生态系统

### Bash
- Linux/macOS shell 脚本
- 需要 WSL 或 Git Bash (Windows)

## 📊 API 接口

### 脚本管理
- `GET /api/scripts` - 获取脚本列表
- `POST /api/scripts` - 创建脚本
- `PUT /api/scripts/:id` - 更新脚本
- `DELETE /api/scripts/:id` - 删除脚本
- `POST /api/scripts/:id/test` - 测试脚本

### 定时任务
- `GET /api/tasks` - 获取任务列表
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务
- `PATCH /api/tasks/:id/toggle` - 切换任务状态

### 配置管理
- `GET /api/config` - 获取配置列表
- `POST /api/config` - 创建配置
- `PUT /api/config/:key` - 更新配置
- `DELETE /api/config/:key` - 删除配置

### 日志管理
- `GET /api/logs` - 获取日志列表
- `GET /api/logs/stats/summary` - 获取日志统计

## 🛠️ 开发指南

### 开发环境设置
1. 安装 Node.js 16+
2. 克隆项目并安装依赖
3. 启动开发服务器

### 代码风格
- 后端使用 ESLint + Prettier
- 前端使用 Vue 官方风格指南
- 提交前请运行代码检查

### 调试技巧
- 后端日志位于控制台
- 前端使用 Vue DevTools
- 数据文件位于 `backend/data/taskdog.json`

## 🚨 常见问题

### Q: 启动时提示端口被占用
A: 检查 3000 和 3001 端口是否被其他程序占用，可以修改配置文件中的端口设置。

### Q: 脚本执行失败
A: 检查脚本语法是否正确，确保相关运行时环境已安装。

### Q: 定时任务不执行
A: 确认任务状态为 "激活"，检查 Cron 表达式是否正确。

### Q: 无法访问 Web 界面
A: 确认前后端服务都已启动，检查防火墙设置。

## 📝 更新日志

### v1.0.0 (2025-01-10)
- ✨ 初始版本发布
- 🔧 脚本管理功能
- ⏰ 定时任务调度
- ⚙️ 配置管理
- 📊 日志管理
- 🎨 现代化 UI 界面

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📞 支持与反馈

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件至项目维护者

---

**TaskDog** - 让脚本管理变得简单高效！ 🐕

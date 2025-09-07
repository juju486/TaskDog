# TaskDog 脚本管理工具

TaskDog 是一个现代化的脚本管理和定时任务调度工具，提供直观的 Web 界面来管理您的自动化脚本。

## ✨ 主要功能

- 🔧 **脚本管理** - 创建、编辑、测试和管理各种类型的脚本
  - 支持多种脚本语言：PowerShell、Python、JavaScript、Batch、Shell
  - 文件存储：脚本内容作为独立文件存储，便于版本控制
  - 文件上传：支持直接上传脚本文件（.ps1, .py, .js, .bat, .sh等）
  - 在线编辑：内置代码编辑器，支持语法高亮
- ⏰ **定时任务** - 基于 Cron 表达式的定时任务调度
- ⚙️ **配置管理** - 集中管理应用程序配置
- 📊 **日志管理** - 完整的操作日志和执行记录
- 🎨 **现代 UI** - 基于 Vue3 + Element Plus 的美观界面
- 🚀 **高性能** - 基于 Node.js + Koa 的高效后端
- 🗂️ **分组管理（新增）**
  - 脚本与任务都支持可选的分组字段 `group`
  - 在脚本和任务页面支持按分组筛选与查看
  - 提供“管理分组”对话框，可新增、重命名、删除分组
  - 删除或重命名分组时，已分配项目会自动清空或迁移

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
TaskDog 支持两种方式创建和管理脚本：

#### 方式一：手动输入
1. 点击 "脚本管理" 进入脚本管理页面
2. 点击 "创建脚本" 按钮
3. 选择 "手动输入" 模式
4. 填写脚本信息：
   - 脚本名称：给脚本一个描述性名称
   - 描述：脚本的功能说明
   - 脚本语言：选择 PowerShell、Python、JavaScript、Batch 或 Shell
   - 脚本内容：在文本编辑器中输入脚本代码
   - 分组：可选，选择或留空
5. 点击 "创建" 保存脚本

#### 方式二：文件上传
1. 点击 "脚本管理" 进入脚本管理页面
2. 点击 "创建脚本" 按钮
3. 选择 "文件上传" 模式
4. 拖拽或点击上传脚本文件
   - 支持的文件类型：.ps1, .py, .js, .bat, .sh, .txt
   - 系统会自动根据文件扩展名识别脚本语言
   - 文件名（去掉扩展名）会自动作为脚本名称
5. 预览文件内容，确认无误后点击 "创建"

#### 脚本文件存储
- 所有脚本内容都以独立文件形式存储在 `backend/scripts/` 目录下
- 便于版本控制和外部编辑
- 支持直接编辑脚本文件，重启服务后生效
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
   - 分组：可选，选择或留空
4. 保存并启动任务

### 分组管理（脚本/任务）
- 在页面右上角可通过下拉框按分组筛选列表
- 点击“管理分组”可打开分组管理对话框：
  - 新增分组：输入名称后点击新增
  - 重命名分组：对已有分组重命名，相关脚本/任务将自动迁移到新名称
  - 删除分组：支持删除，已分配项会清空其 group 字段
- 脚本/任务创建或编辑时可直接选择分组
- 已存在的脚本/任务默认 group 为空，可通过编辑进行迁移

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
│   │   │   ├── scheduler.js # 任务调度器
│   │   │   └── fileManager.js # 文件管理工具
│   │   └── app.js           # 应用入口
│   ├── data/
│   │   └── taskdog.json     # 数据文件
│   ├── scripts/             # 脚本文件存储目录
│   │   ├── *.ps1           # PowerShell 脚本
│   │   ├── *.py            # Python 脚本
│   │   ├── *.js            # JavaScript 脚本
│   │   ├── *.bat           # Batch 脚本
│   │   └── *.sh            # Shell 脚本
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
- `GET /api/scripts` - 获取脚本列表（支持 `?group=` 按分组过滤）
- `POST /api/scripts` - 创建脚本（支持传入 `group`）
- `PUT /api/scripts/:id` - 更新脚本（支持更新 `group`）
- `DELETE /api/scripts/:id` - 删除脚本
- `POST /api/scripts/:id/test` - 测试脚本
- `GET /api/scripts/:id/download` - 下载脚本文件

### 定时任务
- `GET /api/tasks` - 获取任务列表（支持 `?group=` 按分组过滤）
- `POST /api/tasks` - 创建任务（支持传入 `group`）
- `PUT /api/tasks/:id` - 更新任务（支持更新 `group`）
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/:id/start` - 启动任务
- `POST /api/tasks/:id/stop` - 停止任务
- `POST /api/tasks/:id/runOnce` - 立即执行一次

### 分组管理
- `GET /api/config/groups` - 列出分组（可选 `?type=script|task`）
- `POST /api/config/groups` - 新增分组 `{ type, name }`
- `POST /api/config/groups/rename` - 重命名分组 `{ type, oldName, newName }`
- `POST /api/config/groups/delete` - 删除分组 `{ type, name, reassignTo? }`
- 统一配置读取：`GET /api/config/all` 返回 `{ groups: { scriptGroups: [], taskGroups: [] }, globals: {...}, ... }`

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

### v1.1.0 (2025-01-15)
- 🗂️ 新增脚本/任务分组能力：分组字段、筛选、管理 UI 与后端 API
- ✨ 脚本/任务创建/编辑支持选择分组
- 🧰 分组重命名/删除自动迁移/清空关联项

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

---

## 模块化重构与依赖管理（新增）

- 后端已模块化：业务逻辑位于 `src/controllers/*`，路由绑定位于 `src/routes/*`，应用入口为 `src/app.js`。
- 配置采用分组结构并持久化于 `backend/data/taskdog.json` 的 `config_groups` 字段。
- 新增依赖管理能力（Node/Python），默认在 `backend/scripts/` 目录下安装脚本依赖。

### 配置接口（分组）
- GET `/api/config/all`：返回完整 `config_groups`（读取时会进行结构校验与自修复）。
- PUT `/api/config/all`：覆盖保存完整配置（保存时同样校验并修复缺失字段）。
- PUT `/api/config/globals`：一次性替换全局变量分组（inheritSystemEnv, items）。
- POST `/api/config/globals/set`：单个变量 upsert（{ key, value, secret }）。

### 依赖管理接口
- GET `/api/config/deps/list?lang=node|python`：列出已安装依赖。
- POST `/api/config/deps/install`：安装依赖 `{ lang, name, version? }`。
- POST `/api/config/deps/uninstall`：卸载依赖 `{ lang, name }`。
- GET `/api/config/deps/info?lang=node|python&name=<pkg>`：查看依赖详情。

实现说明：
- Node 依赖安装到 `backend/scripts/node_modules`（必要时自动生成 `package.json`）。
- Python 依赖安装到 `backend/scripts/.python_packages/`（使用 `pip -t`）。

### 配置结构自修复（重要）
- 若手动编辑导致 `config_groups` 缺项或类型不符，后端在 GET/PUT `/api/config/all`、以及全局变量写入相关接口时会自动：
  - 回填必需分组与字段到合理默认；
  - 规范化布尔/数字/字符串类型；
  - 兼容旧字段（如 `notification.notification_email`）。
- 这可以避免无效配置导致的运行时错误，无需手动清理 JSON。

### TD Shim（Node）
- 位置：`backend/src/utils/td_shims/node.js`。
- 作用：为 Node 脚本提供全局对象 `TD`（读取 `TD.KEY`/`TD['原始Key']`），并提供 `TD.set(key, value, {secret?})` 写回后端全局变量。
- 依赖：使用 Node >= 18 的原生 `fetch`，不再依赖第三方 HTTP 库（如 axios）。
- 环境变量：
  - `TASKDOG_GLOBALS_JSON`（由调度器注入）：当前可用的键值对（保留原始 Key）。
  - `TASKDOG_API_URL`：后端地址，默认 `http://127.0.0.1:3001`。

### 注意
- 脚本内的 Node 包请通过“依赖管理”在 `backend/scripts/` 下安装，这样脚本位于同目录即可正常 `require()`。
- Python 依赖安装后位于 `.python_packages`，脚本运行时由后端注入工作目录，常见包可直接 `import`。

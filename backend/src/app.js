const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('koa-cors');
const logger = require('koa-logger');
const http = require('http');
const net = require('net');

const scriptRoutes = require('./routes/scripts');
const taskRoutes = require('./routes/tasks');
const configRoutes = require('./routes/config');
const logRoutes = require('./routes/logs');
const { initDatabase } = require('./utils/database');
const { initScheduler } = require('./utils/scheduler');

const app = new Koa();
const router = new Router();

// 中间件
app.use(cors());
app.use(logger());
app.use(bodyParser());

// 健康检查
router.get('/health', (ctx) => {
  ctx.body = { ok: true, name: 'TaskDog', service: 'backend', timestamp: Date.now() };
});

// 路由
router.use('/api/scripts', scriptRoutes.routes());
router.use('/api/tasks', taskRoutes.routes());
router.use('/api/config', configRoutes.routes());
router.use('/api/logs', logRoutes.routes());

app.use(router.routes());
app.use(router.allowedMethods());

// 错误处理
app.on('error', (err, _ctx) => {
  console.error('Server error:', err);
});

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3001;

// 端口工具
function isPortInUse(port, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      try { socket.destroy(); } catch {}
      resolve(false);
    };
    socket.setTimeout(timeout);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, host, () => {
      try { socket.end(); } catch {}
      resolve(true);
    });
  });
}

function isTaskDogAlive(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/health', timeout: 1000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          resolve(res.statusCode === 200 && json && json.ok === true && json.name === 'TaskDog');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      try { req.destroy(); } catch {}
      resolve(false);
    });
  });
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let i = 0; i <= attempts; i++) {
    const port = startPort + i;
    // 如果端口未被占用则返回
    const used = await isPortInUse(port);
    if (!used) return port;
  }
  return null;
}

// 初始化数据库和调度器并启动服务
async function init() {
  try {
    await initDatabase();
    await initScheduler();

    let port = DEFAULT_PORT;
    if (await isPortInUse(port)) {
      // 若已有 TaskDog 实例在运行，则无需重复启动
      if (await isTaskDogAlive(port)) {
        console.log(`TaskDog backend already running on port ${port}. Reusing existing instance.`);
        return; // 不再启动新实例
      }
      // 尝试寻找可用端口启动新实例（用于开发/调试）
      const free = await findAvailablePort(port + 1);
      if (free) {
        console.warn(`Port ${port} is in use. Starting TaskDog backend on ${free} instead.`);
        port = free;
      } else {
        throw new Error(`No available port found near ${DEFAULT_PORT}. Please free the port and retry.`);
      }
    }

    // 对外暴露实际端口给调度器/脚本（TD.set 用）
    process.env.PORT = String(port);
    if (!process.env.TASKDOG_API_URL) {
      process.env.TASKDOG_API_URL = `http://127.0.0.1:${port}`;
    }

    app.listen(port, () => {
      console.log(`TaskDog backend server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

init();

module.exports = app;

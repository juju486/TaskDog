const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('koa-cors');
const logger = require('koa-logger');
const path = require('path');

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

// 路由
router.use('/api/scripts', scriptRoutes.routes());
router.use('/api/tasks', taskRoutes.routes());
router.use('/api/config', configRoutes.routes());
router.use('/api/logs', logRoutes.routes());

app.use(router.routes());
app.use(router.allowedMethods());

// 错误处理
app.on('error', (err, ctx) => {
  console.error('Server error:', err);
});

const PORT = process.env.PORT || 3001;

// 初始化数据库和调度器
async function init() {
  try {
    await initDatabase();
    await initScheduler();
    
    app.listen(PORT, () => {
      console.log(`TaskDog backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

init();

module.exports = app;

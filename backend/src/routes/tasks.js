const Router = require('koa-router');
const taskController = require('../controllers/taskController');

const router = new Router();

// 任务列表与详情
router.get('/', taskController.list);
router.get('/:id', taskController.getById);

// 创建、更新、删除
router.post('/', taskController.create);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.remove);

// 状态控制
router.patch('/:id/toggle', taskController.toggle);
router.post('/:id/start', taskController.start);
router.post('/:id/stop', taskController.stop);

module.exports = router;

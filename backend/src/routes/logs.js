const Router = require('koa-router');
const logController = require('../controllers/logController');
const router = new Router();

// 固定路由应放在前
router.get('/stats/summary', logController.statsSummary);
router.get('/meta/types', logController.metaTypes);
router.delete('/cleanup', logController.cleanup);

// 列表与单个
router.get('/', logController.list);
router.get('/:id', logController.getById);

// 创建与删除
router.post('/', logController.create);
router.delete('/:id', logController.remove);
router.delete('/', logController.removeBatch);

module.exports = router;

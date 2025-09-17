const Router = require('koa-router');
const scriptsController = require('../controllers/scriptsController');
const router = new Router();

// 列表与详情
router.get('/', scriptsController.list);
router.get('/:id', scriptsController.getById);

// 创建、更新、删除
router.post('/', scriptsController.create);
router.put('/:id', scriptsController.update);
router.delete('/:id', scriptsController.remove);

// 测试与下载（固定路由需在 /:id 前后顺序谨慎，这里依然可正常匹配）
router.post('/:id/test', scriptsController.test);
router.get('/:id/download', scriptsController.download);

// 新增：从外部目录导入脚本
router.post('/import', scriptsController.importFromDir);

module.exports = router;

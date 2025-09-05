const Router = require('koa-router');
const configController = require('../controllers/configController');
const router = new Router();

// 获取与保存全部配置
router.get('/all', configController.getAll);
router.put('/all', configController.saveAll);

// 一键测试
router.post('/test', configController.testAll);

// 全局变量管理
router.put('/globals', configController.replaceGlobals);
router.post('/globals/set', configController.upsertGlobal);

// 依赖管理
router.get('/deps/list', configController.depsList);
router.post('/deps/install', configController.depsInstall);
router.post('/deps/uninstall', configController.depsUninstall);
router.get('/deps/info', configController.depsInfo);

module.exports = router;

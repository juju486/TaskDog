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

// 分组管理（新增）
router.get('/groups', configController.listGroups);
router.post('/groups', configController.addGroup);
router.post('/groups/rename', configController.renameGroup);
router.post('/groups/delete', configController.deleteGroup);
// 新增：分组同步、统计、批量分配
router.post('/groups/syncItems', configController.syncGroupsFromItems);
router.get('/groups/stats', configController.groupStats);
router.post('/groups/assign', configController.assignGroup);

// 依赖管理
router.get('/deps/list', configController.depsList);
router.post('/deps/install', configController.depsInstall);
router.post('/deps/uninstall', configController.depsUninstall);
router.get('/deps/info', configController.depsInfo);

module.exports = router;

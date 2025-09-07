import api from './index'

export const scriptApi = {
  // 获取所有脚本（可选按分组过滤）
  getAll(params) {
    return api.get('/scripts', params ? { params } : undefined)
  },
  
  // 获取单个脚本
  getById(id) {
    return api.get(`/scripts/${id}`)
  },
  
  // 创建脚本
  create(data) {
    return api.post('/scripts', data)
  },
  
  // 更新脚本
  update(id, data) {
    return api.put(`/scripts/${id}`, data)
  },
  
  // 删除脚本
  delete(id) {
    return api.delete(`/scripts/${id}`)
  },
  
  // 测试运行脚本（支持临时参数）
  test(id, params) {
    // 将超时提升到 5 分钟，适配 Playwright 等长耗时脚本
    return api.post(`/scripts/${id}/test`, params ? { params } : {}, { timeout: 5 * 60 * 1000 })
  },

  // 下载脚本文件
  download(id) {
    // 使用原生 axios 获取二进制数据
    return api.getRaw(`/scripts/${id}/download`, { responseType: 'blob' })
  }
}

export const taskApi = {
  // 获取所有定时任务（可选按分组过滤）
  getAll(params) {
    return api.get('/tasks', params ? { params } : undefined)
  },
  
  // 获取单个定时任务
  getById(id) {
    return api.get(`/tasks/${id}`)
  },
  
  // 创建定时任务
  create(data) {
    return api.post('/tasks', data)
  },
  
  // 更新定时任务
  update(id, data) {
    return api.put(`/tasks/${id}`, data)
  },
  
  // 删除定时任务
  delete(id) {
    return api.delete(`/tasks/${id}`)
  },
  
  // 启动任务
  start(id) {
    return api.post(`/tasks/${id}/start`)
  },
  
  // 停止任务
  stop(id) {
    return api.post(`/tasks/${id}/stop`)
  },

  // 立即执行一次
  runOnce(id) {
    return api.post(`/tasks/${id}/runOnce`)
  }
}

export const configApi = {
  // 兼容：获取所有配置（旧）
  getAll(category) {
    return api.get('/config', { params: { category } })
  },
  
  // 兼容：获取单个配置（旧）
  getById(key) {
    return api.get(`/config/${key}`)
  },
  
  // 兼容：创建或更新配置（旧）
  save(data) {
    return api.post('/config', data)
  },
  
  // 兼容：删除配置（旧）
  delete(key) {
    return api.delete(`/config/${key}`)
  },
  
  // 兼容：批量更新（旧）
  batchUpdate(configs) {
    return api.put('/config/batch', { configs })
  },

  // 新：一次性获取全部分组配置
  getAllGroups() {
    return api.get('/config/all')
  },

  // 新：一次性保存全部分组配置
  saveAll(configObj) {
    return api.put('/config/all', configObj)
  },

  // 新增：仅替换全局变量（避免影响其他配置）
  replaceGlobals(globalsObj) {
    return api.put('/config/globals', globalsObj)
  },

  // 新增：新增或更新单个全局变量
  upsertGlobal({ key, value, secret }) {
    return api.post('/config/globals/set', { key, value, secret })
  },

  // 分组管理
  listGroups(type) {
    return api.get('/config/groups', type ? { params: { type } } : undefined)
  },
  addGroup({ type, name }) {
    return api.post('/config/groups', { type, name })
  },
  renameGroup({ type, oldName, newName }) {
    return api.post('/config/groups/rename', { type, oldName, newName })
  },
  deleteGroup({ type, name, reassignTo }) {
    return api.post('/config/groups/delete', { type, name, reassignTo })
  },
  // 新增：分组统计、同步、批量分配
  groupStats() {
    return api.get('/config/groups/stats')
  },
  syncGroupsFromItems() {
    return api.post('/config/groups/syncItems')
  },
  assignGroup(payload) {
    return api.post('/config/groups/assign', payload)
  },

  // 新：测试配置连通性
  test(configObj) {
    return api.post('/config/test', configObj)
  },

  // 依赖管理
  listDeps(lang) {
    return api.get('/config/deps/list', { params: { lang } })
  },
  installDep({ lang, name, version }) {
    return api.post('/config/deps/install', { lang, name, version })
  },
  uninstallDep({ lang, name }) {
    return api.post('/config/deps/uninstall', { lang, name })
  },
  depInfo({ lang, name }) {
    return api.get('/config/deps/info', { params: { lang, name } })
  }
}

export const logApi = {
  // 获取日志列表
  getAll(params) {
    return api.get('/logs', { params })
  },
  
  // 获取单个日志
  getById(id) {
    return api.get(`/logs/${id}`)
  },
  
  // 清理日志
  cleanup(params) {
    return api.delete('/logs/cleanup', { params })
  },
  
  // 获取日志统计
  getStats(days = 7) {
    return api.get('/logs/stats/summary', { params: { days } })
  }
}

import api from './index'

export const scriptApi = {
  // 获取所有脚本
  getAll() {
    return api.get('/scripts')
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
  
  // 测试运行脚本
  test(id) {
    return api.post(`/scripts/${id}/test`)
  },

  // 下载脚本文件
  download(id) {
    // 使用原生 axios 获取二进制数据
    return api.getRaw(`/scripts/${id}/download`, { responseType: 'blob' })
  }
}

export const taskApi = {
  // 获取所有定时任务
  getAll() {
    return api.get('/tasks')
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
  }
}

export const configApi = {
  // 获取所有配置
  getAll(category) {
    return api.get('/config', { params: { category } })
  },
  
  // 获取单个配置
  getByKey(key) {
    return api.get(`/config/${key}`)
  },
  
  // 创建或更新配置
  save(data) {
    return api.post('/config', data)
  },
  
  // 删除配置
  delete(key) {
    return api.delete(`/config/${key}`)
  },
  
  // 批量更新配置
  batchUpdate(configs) {
    return api.put('/config/batch', { configs })
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

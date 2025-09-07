// 参数化示例：读取 TD.params 并支持重试
// 运行时参数注入：
// - 全局/任务/测试传入的 JSON 将注入到环境变量 TASKDOG_PARAMS_JSON
// - TD shim 提供 TD.params/TD.getParam/TD.requireParam 访问参数
// - 任务层参数与脚本 default_params 深合并

;(async () => {
  try {
    console.log('完成，参数为:', JSON.stringify(TD.params))
  } catch (e) {
    console.error('运行失败:', e && e.message ? e.message : e)
    process.exitCode = 1
  }
})()

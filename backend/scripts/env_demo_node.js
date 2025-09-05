// 环境变量与 TD 示例脚本（Node.js）
// 依赖后端在执行时预加载 TD（scheduler 使用 -r 注入）
// 可直接通过 TD.TASKDOG_GREETING 或 TD['问候语'] 读取；通过 TD.set(key,value) 持久化修改

(async () => {
  const now = new Date().toISOString();

  console.log(`[${now}] TD.TASKDOG_GREETING =`, TD.TASKDOG_GREETING);
  console.log(`[${now}] TD['问候语'] =`, TD['问候语']);

  // 演示设置：更新“问候语”
  const newVal = `你好，TaskDog @ ${new Date().toLocaleString()}`;
  const ok = await TD.set('问候语', newVal);
  console.log('TD.set("问候语", ...) ->', ok ? 'OK' : 'FAILED');

  // 读取本地缓存（本次进程内即时可见）
  console.log('after set, TD["问候语"] =', TD['问候语']);

  // 仍可读取以 TASKDOG_ 为前缀的环境变量
  const envVal = process.env.TASKDOG_GREETING || '(env not set)';
  console.log('process.env.TASKDOG_GREETING =', envVal);
})();

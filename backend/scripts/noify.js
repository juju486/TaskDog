(async () => {
  await TD.notify(`测试消息`, { template: 'dingtalk', title: `测试` });
})().catch(err => { console.error('notify error:', err && err.message || err); process.exit(1); });
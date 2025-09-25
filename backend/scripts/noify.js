(async () => {
  // 钉钉需接收原始体，否则不会出消息；请确保 content 包含你在机器人里配置的“自定义关键词”
  const body = { msgtype: 'text', text: { content: '监控报警' } };
  const res = await TD.notify(body, { raw: true /* 如未在配置填URL，可改为传 url: 'https://oapi.dingtalk.com/robot/send?access_token=XXXX' */ });
  console.log('notify result:', JSON.stringify(res));
})().catch(err => { console.error('notify error:', err && err.message || err); process.exit(1); });
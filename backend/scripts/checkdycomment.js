// checkDycomment

const { createPWToolkit } = require('./utils/playwrightHelper');
const log = (TD && typeof TD.logger === 'function') ? TD.logger('checkdycomment') : console;
; (async () => {
  const pw = await createPWToolkit();
  pw.cfg.headless = false;
  const page = await pw.newPage();
  pw.addCookies(TD.DY_COOKIES);
  await page.goto('https://qianchuan.jinritemai.com/tools/comment-management/comment-content');
  await page.getByText('统计时间：').click();
  await page.waitForTimeout(1000);
  await page.getByText('过去7天').click();
  await page.waitForTimeout(3000);

  let count = await page.getByText(/共*条记录/).textContent();
  count = count.match(/\d+/)[0];
  let dycomment = TD.dycomment || 0;

  log.info('当前抖音评论数:', count);
  if (count > dycomment) {
    log.info('有新的抖音评论');
    TD.notify({ msgtype: 'text', text: { content: `抖音评论数: ${count}` } }, { raw: true });
  }
  TD.set('dycomment', count);
  // 发送通知

  await pw.close();

})();
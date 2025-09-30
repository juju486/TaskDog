// checkDycomment

const log = (TD && typeof TD.logger === 'function') ? TD.logger('checkdycomment') : console;
; (async () => {
  const pw = await TD.createPWToolkit();
  // pw.cfg.headless = false;
  const page = await pw.newPage();
  pw.addCookies(TD.DY_COOKIES);

  log.info('开始检查抖音评论');

  await page.goto('https://qianchuan.jinritemai.com/tools/comment-management/comment-content');
  await page.getByText('统计时间：').click();
  await page.waitForTimeout(1000);
  await page.getByText('过去7天').click();
  await page.waitForTimeout(3000);

  let count = await page.getByText(/共*条记录/).textContent();
  count = count.match(/\d+/)[0];
  log.info(`评论总数: ${count}`);
  if (count != 0) {
    lastCommentDate = TD.lastCommentDate || 0;
    let newCommentDate = await page.locator('table.ovui-table').locator('.col-comment-time div').allTextContents();

    log.info(newCommentDate);

    newCommentDate = newCommentDate.join(' ');

    log.info(`最新评论时间: ${newCommentDate}, 上次记录时间: ${new Date(lastCommentDate).toISOString()}`);

    let newCommentDate2 = new Date(newCommentDate).getTime();
    lastCommentDate = new Date(lastCommentDate).getTime();

    log.info(newCommentDate2 > lastCommentDate);

    if (newCommentDate2 > lastCommentDate) {
      log.info('有新的抖音评论');
      TD.set('lastCommentDate', newCommentDate2);

      const content = await page.locator('table.ovui-table tbody tr').locator('td').nth(2).textContent();
      
      // sent markdown message
      await TD.notify(`您有新的抖音评论:\n\n> ${content}`, { template: 'dingtalk', title: '抖音新评论提醒' });

      
    }
  }





  await pw.close();

})();
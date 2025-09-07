const { createPWToolkit } = require('./utils/playwrightHelper');
!(async () => {
  const log = (TD && typeof TD.logger === 'function') ? TD.logger('checktmcookie') : console;
  let pw;
  try {
    log.info('检查日限额');
    const cookies = await TD.TM_COOKIES;

    pw = await createPWToolkit({ headless: false });
    const page = await pw.newPage();

    // 设置 Cookie（需为 Playwright Cookie 对象数组或符合 addCookies 的格式）
    if (cookies) await pw.addCookie(cookies);

    await page.goto('https://myseller.taobao.com/home.htm/subway_new/');
    await page.waitForTimeout(5000);

    const table = await page.locator('div[mxv="list,selectedTdList"]');
    //滚动到可见位置
    await table.scrollIntoViewIfNeeded();
    //等待表格加载完成
    await page.waitForTimeout(2000);
    //获取表格内容

    const header = await table.locator('div').nth(0).allInnerTexts();
    log.info('表头:', header.join(' | '));
    const rows = await table.locator('div').nth(1).locator('table td').allInnerTexts();
    log.info('数据:', rows.join(' | '));
  } catch (err) {
    try { log.error ? log.error('脚本错误:', err && err.message ? err.message : String(err)) : console.error(err); } catch { }
    process.exitCode = 1;
  } finally {
    try { if (pw) await pw.close(); } catch { }
  }
})();








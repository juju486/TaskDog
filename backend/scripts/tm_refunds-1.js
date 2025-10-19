const log = (TD && typeof TD.logger === 'function') ? TD.logger('test') : console;
; (async () => {
  const pw = await TD.createPWToolkit();
  // 强制设置 headless 为 false，方便观察浏览器行为
  pw.cfg.headless = false;
  const page = await pw.newPage();

  await page.addInitScript(() => { delete window.__playwright__binding__; delete window.__pwInitScripts; });
  // 从全局变量获取 cookies
  const cookies = TD.chrome_cookies;

  if (!cookies) {
    log.error('未在全局变量中找到 chrome_cookies');
    await pw.close();
    return;
  }
  await pw.addCookies(cookies);

  await page.waitForTimeout(3000);

  await page.goto('https://myseller.taobao.com/home.htm/trade-platform/refund-list');
})();

// chrome.exe --no-sandbox --bot-profile="D:\\chrome141_win10_x64.enc" --user-data-dir="%TEMP%\\botprofile_%RANDOM%"
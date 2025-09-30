!(async () => {
  const cookies = await TD.cloud_cookie(TD.cloudCookieOptions);
  const pddDomain = ['mms.pinduoduo.com', '.pinduoduo.com']
  const pddCookies = TD.filterCookies(cookies, pddDomain);
  const tmDomain = ['myseller.taobao.com','.taobao.com']
  const tmCookies = TD.filterCookies(cookies, tmDomain);
  const dyDomain = ['fxg.jinritemai.com', '.jinritemai.com']
  const dyCookies = TD.filterCookies(cookies, dyDomain);

  // 保存cookie
  await Promise.all([
    TD.set('chrome_cookies',cookies),
    TD.set('PDD_COOKIES', pddCookies),
    TD.set('TM_COOKIES', tmCookies),
    TD.set('DY_COOKIES', dyCookies),
  ]);
  console.log('cookie保存完成');
})();
  
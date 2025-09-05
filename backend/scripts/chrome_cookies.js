!(async () => {
  const cookies = await TD.cloud_cookie(TD.cloudCookieOptions);
  await TD.set('chrome_cookies', cookies);
  console.log(TD.chrome_cookies)
})();
  
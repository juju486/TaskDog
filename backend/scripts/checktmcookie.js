import https from 'https';

console.log('check TM cookie');
const cookies = await TD.TM_COOKIES;

// 发起请求验证
//get https://shattrath-config.taobao.com/qianniu?t=1757084297345
const options = {
  hostname: 'shattrath-config.taobao.com',
  port: 443,
  path: '/qianniu?t=1757084297345',
  method: 'GET',
  headers: {
    'Cookie': cookies.join('; ')
  }
};
https.request(options, res => {
  console.log(`res: ${res}`);
});







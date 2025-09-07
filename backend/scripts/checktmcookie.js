import https from 'https';
import { createPWToolkit } from './utils/playwrightHelper';
!(async () => {
  console.log('check TM cookie');
  const cookies = await TD.TM_COOKIES;

  const log = TM.logger('checktmcookie');
  const pw = await createPWToolkit({ headless: true });
  

})();








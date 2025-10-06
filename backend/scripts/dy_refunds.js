// DY_refunds

const log = (TD && typeof TD.logger === 'function') ? TD.logger('DY_refunds') : console;

const params = TD.params || {};
log.info(params)
  ; (async () => {
    const pw = await TD.createPWToolkit();
    // 建议通过参数或全局变量控制 headless，这里硬编码为 false 用于调试
    pw.cfg.headless = params?.headless;
    const page = await pw.newPage();

    // 从全局变量获取 cookies
    const cookies = TD.DY_COOKIES;

    if (!cookies) {
      log.error('未在全局变量中找到 DY_COOKIES');
      await pw.close();
      return;
    }
    await pw.addCookies(cookies);

    const refundRecords = []; // 初始化退款记录数组

    try {
      log.info('start')
      await page.goto('https://fxg.jinritemai.com/ffa/maftersale/aftersale/list');

      // 假设 TD.utils.closePopups 存在于 common.js 中
      if (TD.utils && typeof TD.utils.closePopups === 'function') {
        await TD.utils.closePopups(page);
      }

      await page.getByText('退货待商家收货').click().catch(() => { log.warn(`未找到'退货待商家收货'按钮`); });
      await page.waitForTimeout(5000);

      let countEl = await page.locator('.auxo-pagination-total-text').textContent();
      let count = countEl ? parseInt(countEl.match(/\d+/)[0]) : 0;
      log.info(`退款订单总数: ${count}`);

      // 再次获取 context，确保其在 newPage 后有效
      const currentContext = pw.context;
      if (!currentContext) {
        throw new Error('Playwright context is not available after creating a new page.');
      }

      while (count > 0) {
        // 刷新列表
        await page.locator('#orderAppContainer').getByRole('button', { name: '查询' }).click();
        await page.waitForTimeout(5000);

        // 传入确认有效的 context
        const processedCount = await processRefundItems(page, currentContext, refundRecords);

        countEl = await page.locator('.auxo-pagination-total-text').textContent();
        count = countEl ? parseInt(countEl.match(/\d+/)[0]) : 0;
        log.info(`剩余订单数: ${count}`);

        if (!processedCount) break;
      }
      log.info(`退款任务执行完成`);
    } catch (error) {
      log.error('执行退款任务时出错:', error);
    } finally {
      await pw.close();
    }
  })();

async function processRefundItems(page, context, refundRecords = []) {
  log.info(`开始处理退款订单列表`);
  let processedCount = 0;
  const elements = await page.locator('.auxo-table-tbody tr[data-row-key*="child"]:visible').all();
  log.info(`当前页可见订单元素数量: ${elements.length}`);

  for (const ele of elements) {
    try {
      const tuihuo = await ele.locator('.auxo-table-cell', { hasText: '买家退货' })
        .locator('div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > span:nth-child(1)').textContent({ timeout: 3000 }).catch(() => null);

      log.info(`退货状态: ${tuihuo}`);

      if (tuihuo === '已发货') {

        const newPagePromise = context.waitForEvent('page');
        await ele.getByText('查看详情').click();
        const detailPage = await newPagePromise;

        // 不再需要传入 context
        const itemData = await processRefundDetail(detailPage);
        if (itemData) {
          refundRecords.push(itemData);
          log.info(`追加数据：${JSON.stringify(itemData)}`);
          processedCount++;
        }
      }
    } catch (e) {
      log.error(`处理单个订单项时出错: ${e.message}`);
    }
  }
  return processedCount > 5;
}

async function processRefundDetail(detailPage) {
  log.info(`进入订单详情页`);
  try {
    await detailPage.waitForLoadState('networkidle');
    await detailPage.waitForTimeout(3000);

    await detailPage.getByLabel('退货物流').getByText('展开全部').click({time:1000}).catch(() => { });
    await detailPage.waitForTimeout(300);


    const thbox = await detailPage.locator('.auxo-tabs').filter({ hasText: '退货物流' });

    const plan = await thbox.locator('div[role="tabpanel"]:visible ul.auxo-timeline');

    const state = await plan.locator('li').first().locator('div[class*="itemTitle"]').textContent();
    log.info(`物流状态: ${state}`);

    if (state !== '已签收') {
      log.warn('物流状态不是 "已签收"，关闭详情页。');
      await detailPage.close();
      return false;
    }

    const wuliu = await plan.locator('div[class*="itemDetail"]').allTextContents();

    const result = await TD.wuliu_rule(wuliu);

    if (!result) {
      const orderId = await detailPage.locator('div[class*="item-wrapper"]', { hasText: '订单编号' }).locator('span').first().textContent();
      const refundId = await detailPage.locator('div[class*="item-wrapper"]', { hasText: '售后编号' }).locator('span').first().textContent();
      log.warn(`订单已签收，但未命中签收规则, 订单ID：${orderId}, 退款ID：${refundId}`);

      // 使用 TD.notify 发送通知
      await TD.notify(`抖音订单[${orderId}]已签收但未命中规则`, { template: 'dingtalk', title: `抖音退款异常提醒` });

      await detailPage.close();
      return false;
    }

    // 确认退款
    await detailPage.getByText('已收到货，退款').click();
    await detailPage.waitForTimeout(3500);
    await detailPage.locator('.auxo-modal-body').getByRole('button', { name: '确认' }).click();
    await detailPage.waitForLoadState('networkidle').catch(() => { });
    await detailPage.waitForTimeout(2500);

    // 登记信息
    const itemInfo = {
      '订单编号': await detailPage.locator('div[class*="item-wrapper"]', { hasText: '订单编号' }).locator('span').first().textContent(),
      '售后编号': await detailPage.locator('div[class*="item-wrapper"]', { hasText: '售后编号' }).locator('span').first().textContent(),
      '售后时间': new Date().toLocaleString(),
    };

    log.info('完成订单详情处理');
    await detailPage.close();
    return itemInfo;
  } catch (err) {
    log.error(`订单详情处理异常: ${err.stack || err}`);
    await detailPage.close();
    return false;
  }
}

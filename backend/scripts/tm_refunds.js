// TM_refunds

const log = (TD && typeof TD.logger === 'function') ? TD.logger('TM_refunds') : console;
; (async () => {
  const pw = await TD.createPWToolkit();
  // 建议通过参数或全局变量控制 headless，这里硬编码为 false 用于调试
  pw.cfg.headless = false;
  const page = await pw.newPage();

  // 从全局变量获取 cookies
  const cookies = TD.chrome_cookies;

  if (!cookies) {
    log.error('未在全局变量中找到 chrome_cookies');
    await pw.close();
    return;
  }
  await pw.addCookies(cookies);

  const refundRecords = []; // 初始化退款记录数组

  // 将辅助函数定义在主函数内部，以便共享 pw, log 等上下文
  async function processDetail(detailPage, refundState) {
    log.info(`进入订单详情页`);
    try {
      await detailPage.waitForLoadState();
      await detailPage.waitForTimeout(2000);
      await detailPage.getByRole('button', { name: '关闭' }).click({ timeout: 1000 }).catch(() => { });

      await TD.closePopups(detailPage);

      const refund = await detailPage.locator('div[class*="refundinfo_refund-refundinfo-item"]').filter({ hasText: '要求:' }).locator('span').first();
      const refundText = await refund.textContent();
      log.info(`退款要求：${refundText}`);
      if (refundText === '退款') {
        log.info(`退款订单`);
        await detailPage.getByText('拦截快递').click({ timeout: 1000 }).catch(() => { log.warn(`未找到拦截快递按钮`); });
      }
      if (refundText !== '退货退款') {
        log.info(`非退货退款订单，跳过`);
        await detailPage.close();
        return false;
      }
      const look = await detailPage.locator('div[class*="refundinfo_refund-dealinfo-item-label"]').getByText('查看');
      await look.hover();
      await detailPage.waitForTimeout(1500);
      const refundinfo = await detailPage.locator('div[class*="refundinfo_refund-dealinfo-logcontent-item"]  ol').first();
      const refundTextContent = await refundinfo.locator('li .next-step-item-title').allTextContents();
      let wuliulist = refundTextContent;
      if (Array.isArray(refundTextContent[0])) {
        wuliulist = refundTextContent[0];
      }

      // 修正 wuliu_rule 调用
      const result = await TD.wuliu_rule(wuliulist);
      if (!result) {
        if (refundState) {

          const orderId = await detailPage.locator('div[class*="dealinfo_refund-dealinfo-item"]').filter({ hasText: '订单编号' }).locator('a')
            .first().textContent().catch(() => { });
          const refundId = await detailPage.locator('div[class*="refundinfo_refund-refundinfo-item"]').filter({ hasText: '退款编号' }).locator('span').first().textContent().catch(() => { });

          log.info(`订单已签收，但未命中签收规则,订单ID：${orderId},退款ID：${refundId}`);

          // 修正通知调用
          if (typeof TD.notify === 'function') {
            TD.notify({
              title: '退款订单签收异常',
              message: `订单已签收但未命中规则。\n订单ID: ${orderId}\n退款ID: ${refundId}`
            });
          }
        }
        await detailPage.close();
        return false;
      }
      await refund.click();
      await detailPage.waitForTimeout(500);
      const remark = await detailPage.getByRole('button', { name: '备注' });
      remark.click();
      await detailPage.waitForTimeout(1000);
      const remarkInput = detailPage.getByRole('textbox', { name: '请输入备注内容' });
      const currentText = await remarkInput.inputValue().catch(() => '');
      if (currentText) {
        await remarkInput.fill(currentText + ';bot');
      } else {
        await remarkInput.fill('bot');
      }
      await detailPage.waitForTimeout(500);
      await detailPage.getByRole('button', { name: '确定' }).click();
      await detailPage.waitForLoadState('networkidle').catch(() => { });
      await detailPage.waitForTimeout(3000);
      await detailPage.getByRole('button', { name: '确认收货, 同意退款' }).click();
      await detailPage.waitForLoadState('networkidle').catch(() => { });
      await detailPage.waitForTimeout(2000);
      await detailPage.getByRole('button', { name: '同意退款', exact: true }).click();
      await detailPage.waitForLoadState('networkidle').catch(() => { });
      await detailPage.waitForTimeout(2000);
      const itemInfo = {
        '订单编号': await detailPage.locator('div[class*="dealinfo_refund-dealinfo-item"]').filter({ hasText: '订单编号' }).locator('a')
          .first().textContent().catch(() => { }),
        '退款编号': await detailPage.locator('div[class*="refundinfo_refund-refundinfo-item"]').filter({ hasText: '退款编号' }).locator('span').first().textContent().catch(() => { }),
        '售后时间': new Date().toLocaleString(),
      };
      await detailPage.close();
      log.info(`完成订单详情处理: ${JSON.stringify(itemInfo)}`);
      return itemInfo;
    } catch (err) {
      log.error(`订单详情处理异常: ${err.stack || err}`);
      await detailPage.close();
      return false;
    }
  }

  async function processRefundItems(page, refundRecords = []) {
    log.info(`开始处理退款订单列表`);
    let refundCount = 0;
    const items = page.locator('table.next-table-row');
    const count = await items.count();
    log.info(`订单数量：${count}`);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      let lookDetail = await item.getByText('查看详情', { timeout: 1000 });
      let isVisible = await lookDetail.isVisible();
      // if (!isVisible) {
      //   lookDetail = await item.getByText('待商家收货', { timeout: 1000 });
      //   isVisible = await lookDetail.isVisible();
      // }


      const refundStateDom = await item.getByText('买家退货', { timeout: 1000 });
      const refundStateVisible = await refundStateDom.isVisible();
      log.info(`订单状态可见：${refundStateVisible}`);

      let refundState = false;
      if (refundStateVisible) {
        const refundStateText = await refundStateDom.textContent();
        log.info(`订单状态：${refundStateText}`);
        if (!refundStateText.includes('已签收')) {
          log.info(`订单状态不是已签收，跳过`);
          continue;
        }
        refundState = true;
      }

      if (isVisible) {
        const newPagePromise = pw.context.waitForEvent('page');
        await lookDetail.click();
        const detailPage = await newPagePromise;
        const itemData = await processDetail(detailPage, refundState);
        if (itemData) {
          log.info(`追加数据：${JSON.stringify(itemData)}`);
          refundCount++;
          // 处理每个退款成功订单时，push 到 refundRecords
          refundRecords.push(itemData);
        }
      }
    }
    return refundCount > 5;
  }

  try {

    await page.goto('https://myseller.taobao.com/home.htm/QnworkbenchHome/');

    await page.pause();
    // await page.goto('https://myseller.taobao.com/home.htm/trade-platform/refund-list');

    await page.waitForTimeout(5000);

    await TD.closePopups(page);

    try {
      const next = await page.waitForSelector('.driver-popover-next-btn', { timeout: 2000 });
      await next.click();
      log.info(`点击了下一步按钮`);
      const close = await page.waitForSelector('.driver-popover-close-btn', { timeout: 2000 });
      await close.click();
    } catch (error) {
      log.warn(`没有找到下一步按钮`);
    }
    const dcl = await page.locator('div[class*="data-board_new_delivery_block"]').filter({ hasText: '待商家处理' }).locator('span').first();
    let text = parseInt(await dcl.textContent(), 10) || 0;
    log.info(`待处理订单数量：${text}`);
    if (text == 0) {
      log.info(`没有待处理订单`);
      return;
    }
    await dcl.click();
    await page.waitForTimeout(2000);
    while (text > 0) {
      let zjsq = page.getByRole('button', { name: '最近申请排序 ' });
      if (await zjsq.isVisible()) {
        await zjsq.hover();
      } else {
        await page.getByRole('button', { name: '临近超时排序' }).hover({ timeout: 1000 }).catch(() => { });
      }
      const ljcs = page.getByRole('option', { name: '临近超时排序' }).locator('div');
      await ljcs.click();
      await page.waitForTimeout(5000);
      const hasnext = await processRefundItems(page, refundRecords);
      if (!hasnext) {
        break;
      }
    }

    log.info(`退款任务执行完成`);
  } catch (error) {
    log.error('执行退款任务时出错:', error);
  } finally {
    // await pw.close();
  }
})();
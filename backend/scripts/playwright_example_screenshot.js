// 自动化示例：访问网页并截图
// 依赖：在“配置 -> 依赖” 安装 playwright；如需浏览器：在 backend/scripts 执行 npx playwright install
// 可在“工具配置”页面调整全局 Playwright 参数
const { createPWToolkit } = require('./utils/playwrightHelper')

;(async () => {
  const pw = await createPWToolkit({ headless: true }) // 可覆盖部分参数
  try {
    const page = await pw.newPage()
    await page.goto(pw.withBaseURL('https://example.com'))
    await page.screenshot({ path: 'example.png', fullPage: true })
    console.log('已保存截图到 example.png')
  } catch (e) {
    console.error('示例运行出错:', e)
    process.exitCode = 1
  } finally {
    await pw.close()
  }
})()

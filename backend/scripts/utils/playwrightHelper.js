/*
  Playwright 工具类（Node 脚本可复用）
  用法（放在 backend/scripts 下的脚本中）：

    const { createPWToolkit } = require('./utils/playwrightHelper')
    ;(async () => {
      const pw = await createPWToolkit()
      const page = await pw.newPage()
      await page.goto(pw.withBaseURL('/'))
      // ...你的自动化逻辑...
      await pw.close()
    })()

  说明：
  - 会从后端 /api/config/all 读取 playwright 配置（需 Node >= 18）。
  - 需要在 Config -> 依赖 中安装 node 包：playwright
  - 如首次使用可能需要安装浏览器：可在命令行进入 backend/scripts 执行：npx playwright install
*/

const path = require('path')
const { spawnSync } = require('child_process')

const DEFAULTS = {
  browser: 'chromium', // chromium | firefox | webkit
  headless: true,
  slowMo: 0,
  baseURL: '',
  viewport: { width: 1280, height: 800 },
  proxy: { server: '', username: '', password: '' },
  userAgent: '',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  storageStatePath: '',
  video: 'off', // off | on | retain-on-failure
  screenshot: 'only-on-failure', // off | on | only-on-failure
  downloadsPath: '',
  autoInstallBrowsers: false,
}

function scriptsRoot() {
  // 本文件位于 backend/scripts/utils
  return path.resolve(__dirname, '..')
}

async function fetchPlaywrightConfig() {
  const api = process.env.TASKDOG_API_URL || 'http://127.0.0.1:3001'
  try {
    const res = await fetch(`${api}/api/config/all`, { method: 'GET' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const cfg = (json && json.data && json.data.playwright) || {}
    return { ...DEFAULTS, ...cfg }
  } catch (_) {
    return { ...DEFAULTS }
  }
}

function tryRequirePlaywright() {
  try { return require('playwright') } catch (_) {}
  try { return require(path.join(scriptsRoot(), 'node_modules', 'playwright')) } catch (_) {}
  return null
}

function ensureBrowsersInstalledIfNeeded(pw, cfg) {
  if (!cfg.autoInstallBrowsers) return
  try {
    // 简单探测：尝试获取可执行文件路径
    const type = cfg.browser in pw ? cfg.browser : 'chromium'
    const executablePath = pw[type].executablePath ? pw[type].executablePath() : ''
    if (executablePath) return
  } catch (_) {}

  // 在 scripts 根目录执行安装
  const cwd = scriptsRoot()
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  spawnSync(cmd, ['playwright', 'install'], { cwd, stdio: 'ignore', shell: process.platform === 'win32' })
}

class PWToolkit {
  constructor(cfg, pw) {
    this.cfg = cfg
    this.pw = pw
    this.browser = null
    this.context = null
  }

  async init() {
    if (!this.pw) throw new Error('未找到依赖 playwright，请在 Config/依赖 中安装 playwright')
    ensureBrowsersInstalledIfNeeded(this.pw, this.cfg)
    return this
  }

  withBaseURL(pathname) {
    const base = (this.cfg.baseURL || '').replace(/\/$/, '')
    const p = String(pathname || '')
    return base ? base + (p.startsWith('/') ? p : '/' + p) : p
  }

  async launch() {
    if (this.browser) return this.browser
    const type = this.cfg.browser in this.pw ? this.cfg.browser : 'chromium'
    const { headless, slowMo, proxy } = this.cfg
    const proxyOpt = proxy && proxy.server ? { server: proxy.server, username: proxy.username || undefined, password: proxy.password || undefined } : undefined
    this.browser = await this.pw[type].launch({ headless, slowMo, proxy: proxyOpt })
    return this.browser
  }

  async newContext(extra = {}) {
    await this.launch()
    if (this.context) return this.context
    const { viewport, userAgent, locale, timezoneId, downloadsPath, storageStatePath, video } = this.cfg
    const recordVideo = video === 'off' ? undefined : { dir: downloadsPath || scriptsRoot() }
    const acceptDownloads = true
    const context = await this.browser.newContext({
      viewport,
      userAgent: userAgent || undefined,
      locale,
      timezoneId,
      baseURL: this.cfg.baseURL || undefined,
      acceptDownloads,
      recordVideo,
      storageState: storageStatePath || undefined,
      ...extra,
    })
    this.context = context
    return context
  }

  async newPage(extraContextOpts = {}) {
    const ctx = await this.newContext(extraContextOpts)
    const page = await ctx.newPage()
    return page
  }

  async close() {
    try { if (this.context) { await this.context.close(); this.context = null } } catch {}
    try { if (this.browser) { await this.browser.close(); this.browser = null } } catch {}
  }
}

async function createPWToolkit(overrides = {}) {
  const cfg = { ...(await fetchPlaywrightConfig()), ...overrides }
  const pw = tryRequirePlaywright()
  const kit = new PWToolkit(cfg, pw)
  return kit.init()
}

module.exports = { createPWToolkit, PWToolkit }

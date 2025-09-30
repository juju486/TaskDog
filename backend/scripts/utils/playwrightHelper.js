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
  - 新增：若启动时报“Executable doesn't exist/请运行 npx playwright install”，将自动尝试安装对应浏览器后重试。
*/

const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULTS = {
  browser: 'chromium', // chromium | firefox | webkit
  headless: true,
  slowMo: 0,
  baseURL: '',
  viewport: { width: 1280, height: 800 },
  proxy: { server: '', username: '', password: '' },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  storageStatePath: '',
  video: 'off', // off | on | retain-on-failure
  screenshot: 'only-on-failure', // off | on | only-on-failure
  downloadsPath: '',
  autoInstallBrowsers: false,
};

function scriptsRoot() {
  // 本文件位于 backend/scripts/utils
  return path.resolve(__dirname, '..');
}

async function fetchPlaywrightConfig() {
  const api = process.env.TASKDOG_API_URL || 'http://127.0.0.1:3001';
  try {
    const res = await fetch(`${api}/api/config/all`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const cfg = (json && json.data && json.data.playwright) || {};
    return { ...DEFAULTS, ...cfg };
  } catch {
    return { ...DEFAULTS };
  }
}

function tryRequirePlaywright() {
  try { return require('playwright'); } catch { }
  try { return require(path.join(scriptsRoot(), 'node_modules', 'playwright')); } catch { }
  return null;
}

function ensureBrowsersInstalledIfNeeded(pw, cfg) {
  if (!cfg.autoInstallBrowsers) return;
  try {
    // 简单探测：尝试获取可执行文件路径
    const type = cfg.browser in pw ? cfg.browser : 'chromium';
    const executablePath = pw[type].executablePath ? pw[type].executablePath() : '';
    if (executablePath) return;
  } catch { }

  // 在 scripts 根目录执行安装
  const cwd = scriptsRoot();
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  spawnSync(cmd, ['playwright', 'install'], { cwd, stdio: 'ignore', shell: process.platform === 'win32' });
}

// 规范化代理地址，缺少协议时自动补全
function normalizeProxyServer(server) {
  if (!server) return '';
  const s = String(server).trim();
  if (/^(https?:|socks4:|socks5:)/i.test(s)) return s; // 已包含协议
  // 端口 443 默认按 HTTPS 代理处理
  if (/:443(\/|$)/.test(s)) return 'https://' + s;
  return 'http://' + s;
}

class PWToolkit {
  constructor(cfg, pw) {
    this.cfg = cfg;
    this.pw = pw;
    this.browser = null;
    this.context = null;
  }

  async init() {
    if (!this.pw) throw new Error('未找到依赖 playwright，请在 Config/依赖 中安装 playwright');
    ensureBrowsersInstalledIfNeeded(this.pw, this.cfg);
    return this;
  }

  withBaseURL(pathname) {
    let base = (this.cfg.baseURL || '').trim();
    if (base) {
      // 去掉末尾斜杠
      base = base.replace(/\/$/, '');
      // 若未包含协议，则默认补 http://
      if (!/^https?:\/\//i.test(base)) {
        base = 'http://' + base;
      }
    }
    const p = String(pathname || '');
    return base ? base + (p.startsWith('/') ? p : '/' + p) : p;
  }

  async launch() {
    if (this.browser) return this.browser;
    const type = this.cfg.browser in this.pw ? this.cfg.browser : 'chromium';
    const { headless, slowMo, proxy } = this.cfg;
    const server = proxy && proxy.server ? normalizeProxyServer(proxy.server) : undefined;
    const proxyOpt = server ? { server, username: proxy.username || undefined, password: proxy.password || undefined } : undefined;
    const doLaunch = async () => await this.pw[type].launch({ headless, slowMo, proxy: proxyOpt });
    try {
      this.browser = await doLaunch();
    } catch (e) {
      const msg = String((e && e.message) || e || '');
      // 代理地址格式问题
      if (/Invalid URL/i.test(msg) && proxy && proxy.server) {
        throw new Error(`Playwright 代理地址无效：${proxy.server}。请使用带协议的地址，例如：http://host:port、https://host:port 或 socks5://host:port`);
      }
      // 网络被中断（常见：代理/TLS/防火墙）
      if (/ECONNRESET/i.test(msg)) {
        throw new Error(`网络连接被重置（ECONNRESET）。请检查代理/TLS/防火墙设置，或先在配置中清空代理后重试。原始错误：${msg}`);
      }
      const needInstall = /Executable doesn't exist|download new browsers|playwright install/i.test(msg);
      if (needInstall) {
        // 自动安装缺失浏览器后重试
        const cwd = scriptsRoot();
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        try {
          // 尽量安装指定内核，速度更快
          spawnSync(cmd, ['playwright', 'install', type], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
        } catch { /* ignore */ }
        // 二次尝试
        this.browser = await doLaunch();
      } else {
        throw e;
      }
    }
    return this.browser;
  }

  async close() {
    if (this.context) {
      try { await this.context.close(); } catch { }
      this.context = null;
    }
    if (this.browser) {
      try { await this.browser.close(); } catch { }
      this.browser = null;
    }
  }

  async newContext(options = {}) {
    // 确保已启动浏览器
    if (!this.browser) {
      await this.launch();
    }

    // 仅挑选 BrowserContext 支持的参数，避免无效字段导致报错
    const cfg = this.cfg || {};
    const allowed = {};
    if (cfg.viewport) allowed.viewport = cfg.viewport;
    if (cfg.userAgent) allowed.userAgent = cfg.userAgent;
    if (cfg.locale) allowed.locale = cfg.locale;
    if (cfg.timezoneId) allowed.timezoneId = cfg.timezoneId;
    if (cfg.ignoreHTTPSErrors !== undefined) allowed.ignoreHTTPSErrors = !!cfg.ignoreHTTPSErrors;
    // 不传 baseURL（在 withBaseURL 中进行拼接处理）
    if (cfg.extraHTTPHeaders) allowed.extraHTTPHeaders = cfg.extraHTTPHeaders;
    if (cfg.acceptDownloads !== undefined) allowed.acceptDownloads = !!cfg.acceptDownloads;
    // 录像配置（仅在需要时启用目录），忽略 test runner 的 video/screenshot 语义
    if (cfg.video && cfg.video !== 'off') {
      const dir = path.resolve(scriptsRoot(), 'temp', 'videos');
      allowed.recordVideo = { dir };
    }

    const contextOptions = { ...allowed, ...options };
    if (cfg.storageStatePath) {
      contextOptions.storageState = path.resolve(scriptsRoot(), cfg.storageStatePath);
    }

    const context = await this.browser.newContext(contextOptions);
    this.context = context;
    return context;
  }

  async newPage(options = {}) {
    const context = await this.newContext(options);
    const page = await context.newPage();
    return page;
  }

  async goto(url, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.goto(url, options);
  }

  async screenshot(options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.screenshot(options);
  }

  async video() {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const videos = await page.context().videos();
    return videos.length > 0 ? videos[0] : null;
  }

  async downloadFile(url, path) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const response = await page.goto(url);
    if (!response.ok()) throw new Error(`下载失败：${response.status()} ${response.statusText()}`);
    const buffer = await response.buffer();
    const fs = require('fs');
    fs.writeFileSync(path, buffer);
    return path;
  }

  async setGeolocation(latitude, longitude, options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.grantPermissions(['geolocation']);
    return context.setGeolocation({ latitude, longitude }, options);
  }

  async addInitScript(script) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.addInitScript(script);
  }

  async emulate(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.emulate(options);
  }

  async setUserAgent(userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setUserAgent(userAgent);
  }

  async setLocale(locale) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setLocale(locale);
  }

  async setTimezone(timezoneId) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setTimezone(timezoneId);
  }

  async setStorageState(state) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setStorageState(state);
  }

  async clearBrowserCookies() {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    const pages = context.pages();
    for (const page of pages) {
      try { await page.context().clearCookies(); } catch { }
    }
  }

  async clearBrowserCache() {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    const pages = context.pages();
    for (const page of pages) {
      try { await page.context().clearCache(); } catch { }
    }
  }

  async waitForTimeout(timeout) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.waitForTimeout(timeout);
  }

  async waitForEvent(event, options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.waitForEvent(event, options);
  }

  async expect(locator, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const { expect } = require('@playwright/test');
    return expect(locator, options);
  }

  async fill(selector, value, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.fill(selector, value, options);
  }

  async click(selector, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.click(selector, options);
  }

  async dblclick(selector, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.dblclick(selector, options);
  }

  async rightclick(selector, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.click(selector, { button: 'right', ...options });
  }

  async hover(selector, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.hover(selector, options);
  }

  async selectOption(selector, value, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.selectOption(selector, value, options);
  }

  async uploadFile(selector, filePath, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const input = await page.$(selector);
    if (!input) throw new Error(`未找到文件上传控件：${selector}`);
    return input.setInputFiles(filePath, options);
  }

  async setInputFiles(selector, filePath, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const input = await page.$(selector);
    if (!input) throw new Error(`未找到文件输入控件：${selector}`);
    return input.setInputFiles(filePath, options);
  }

  async press(key, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.press(key, options);
  }

  async type(text, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.type(text, options);
  }

  async gotoIfEmpty(url, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const isEmpty = await page.evaluate(() => !document.body.innerHTML.trim());
    if (isEmpty) return page.goto(url, options);
  }

  async fillFormAndSubmit(selector, data, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const form = await page.$(selector);
    if (!form) throw new Error(`未找到表单：${selector}`);
    const inputs = await form.$$('input, textarea, select');
    for (const input of inputs) {
      const name = await input.getAttribute('name');
      const value = data[name] || '';
      if (input.tagName.toLowerCase() === 'select') {
        await input.selectOption(value);
      } else {
        await input.fill(value);
      }
    }
    return Promise.all([
      form.dispatchEvent('submit', { bubbles: true }),
      page.waitForNavigation(options),
    ]);
  }

  async waitForSelector(selector, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.waitForSelector(selector, options);
  }

  async waitForResponse(urlOrPredicate, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.waitForResponse(urlOrPredicate, options);
  }

  async waitForRequest(urlOrPredicate, options) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.waitForRequest(urlOrPredicate, options);
  }

  async route(url, handler) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.route(url, handler);
  }

  async unroute(url, handler) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.unroute(url, handler);
  }

  async addRequestInterceptor(handler) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.addInitScript(() => {
      window.__request_interceptor__ = handler.toString();
    });
  }

  async removeRequestInterceptor() {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    return page.addInitScript(() => {
      delete window.__request_interceptor__;
    });
  }

  async interceptRequest(request) {
    const page = this.context && this.context.pages().length > 0 ? this.context.pages()[0] : null;
    if (!page) throw new Error('未找到页面实例，请先通过 newPage() 创建页面');
    const handler = page.evaluate(() => window.__request_interceptor__);
    if (typeof handler !== 'function') return;
    return handler(request);
  }

  async setNetworkConditions(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setNetworkConditions(options);
  }

  async addCookies(cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.addCookies(cookies);
  }

  async clearCookies() {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.clearCookies();
  }

  async setExtraHTTPHeaders(headers) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setExtraHTTPHeaders(headers);
  }

  async setOffline(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setOffline(options);
  }

  async setOnline(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setOnline(options);
  }

  async setRequestInterception(value) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setRequestInterception(value);
  }

  async setUserAgentAndAcceptLanguage(userAgent, acceptLanguage) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setUserAgent(userAgent);
    return context.setExtraHTTPHeaders({ 'Accept-Language': acceptLanguage });
  }

  async setJavaScriptEnabled(enabled) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setJavaScriptEnabled(enabled);
  }

  async setViewportSize(width, height) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setViewportSize({ width, height });
  }

  async setTouchOptions(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setTouchOptions(options);
  }

  async setFileChooserOptions(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setFileChooserOptions(options);
  }

  async setGeolocationOptions(options) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setGeolocationOptions(options);
  }

  async setPermissions(permissions) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setPermissions(permissions);
  }

  async setProxy(proxy) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setProxy(proxy);
  }

  async setRequestHeaders(headers) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setRequestHeaders(headers);
  }

  async setResponseHeaders(headers) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    return context.setResponseHeaders(headers);
  }

  async setUserAgentAndViewport(userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setJavaScriptEnabledAndUserAgent(enabled, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setJavaScriptEnabled(enabled);
    return context.setUserAgent(userAgent);
  }

  async setOfflineAndUserAgent(enabled, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOffline(enabled);
    return context.setUserAgent(userAgent);
  }

  async setOnlineAndUserAgent(enabled, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOnline(enabled);
    return context.setUserAgent(userAgent);
  }

  async setRequestInterceptionAndUserAgent(enabled, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestInterception(enabled);
    return context.setUserAgent(userAgent);
  }

  async setExtraHTTPHeadersAndUserAgent(headers, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setExtraHTTPHeaders(headers);
    return context.setUserAgent(userAgent);
  }

  async setNetworkConditionsAndUserAgent(options, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setNetworkConditions(options);
    return context.setUserAgent(userAgent);
  }

  async setPermissionsAndUserAgent(permissions, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setPermissions(permissions);
    return context.setUserAgent(userAgent);
  }

  async setProxyAndUserAgent(proxy, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setProxy(proxy);
    return context.setUserAgent(userAgent);
  }

  async setRequestHeadersAndUserAgent(headers, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestHeaders(headers);
    return context.setUserAgent(userAgent);
  }

  async setResponseHeadersAndUserAgent(headers, userAgent) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setResponseHeaders(headers);
    return context.setUserAgent(userAgent);
  }

  async setJavaScriptEnabledAndUserAgentAndViewport(enabled, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setJavaScriptEnabled(enabled);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setOfflineAndUserAgentAndViewport(enabled, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOffline(enabled);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setOnlineAndUserAgentAndViewport(enabled, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOnline(enabled);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setRequestInterceptionAndUserAgentAndViewport(enabled, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestInterception(enabled);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setExtraHTTPHeadersAndUserAgentAndViewport(headers, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setExtraHTTPHeaders(headers);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setNetworkConditionsAndUserAgentAndViewport(options, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setNetworkConditions(options);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setPermissionsAndUserAgentAndViewport(permissions, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setPermissions(permissions);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setProxyAndUserAgentAndViewport(proxy, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setProxy(proxy);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setRequestHeadersAndUserAgentAndViewport(headers, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestHeaders(headers);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setResponseHeadersAndUserAgentAndViewport(headers, userAgent, viewport) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setResponseHeaders(headers);
    await context.setUserAgent(userAgent);
    return context.setViewportSize(viewport);
  }

  async setJavaScriptEnabledAndUserAgentAndViewportAndCookies(enabled, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setJavaScriptEnabled(enabled);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setOfflineAndUserAgentAndViewportAndCookies(enabled, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOffline(enabled);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setOnlineAndUserAgentAndViewportAndCookies(enabled, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setOnline(enabled);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setRequestInterceptionAndUserAgentAndViewportAndCookies(enabled, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestInterception(enabled);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setExtraHTTPHeadersAndUserAgentAndViewportAndCookies(headers, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setExtraHTTPHeaders(headers);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setNetworkConditionsAndUserAgentAndViewportAndCookies(options, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setNetworkConditions(options);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setPermissionsAndUserAgentAndViewportAndCookies(permissions, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setPermissions(permissions);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setProxyAndUserAgentAndViewportAndCookies(proxy, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setProxy(proxy);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setRequestHeadersAndUserAgentAndViewportAndCookies(headers, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setRequestHeaders(headers);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }

  async setResponseHeadersAndUserAgentAndViewportAndCookies(headers, userAgent, viewport, cookies) {
    const context = this.context;
    if (!context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    await context.setResponseHeaders(headers);
    await context.setUserAgent(userAgent);
    await context.setViewportSize(viewport);
    return context.addCookies(cookies);
  }
}

async function createPWToolkit() {
  const cfg = await fetchPlaywrightConfig();
  const pw = tryRequirePlaywright();
  if (!pw) throw new Error('未找到 playwright 依赖，请在 Config/依赖 中安装 playwright');
  const toolkit = new PWToolkit(cfg, pw);
  return toolkit.init();
}

module.exports = { createPWToolkit };

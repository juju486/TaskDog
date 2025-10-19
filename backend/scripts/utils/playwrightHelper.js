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
  - 需要在 Config -> 依赖 中安装 node 包：playwright-extra, puppeteer-extra-plugin-stealth
  - 如首次使用可能需要安装浏览器：可在命令行进入 backend/scripts 执行：npx playwright install
*/

const path = require('path');
const { spawnSync } = require('child_process');
// 尝试使用系统级安装的 Playwright，如果失败则使用 playwright-extra
let playwrightModules;

try {
  // 尝试直接 require 系统安装的 playwright
  playwrightModules = require('playwright');
  console.log('使用系统安装的 Playwright');
} catch (err) {
  console.log('使用项目依赖中的 playwright-extra');
  // 使用 playwright-extra 替代 playwright
  const { chromium, firefox, webkit } = require('playwright-extra');
  // 加载 stealth 插件
  const stealth = require('puppeteer-extra-plugin-stealth')();

  // 为所有浏览器启用 stealth 插件
  chromium.use(stealth);
  firefox.use(stealth);
  webkit.use(stealth);

  playwrightModules = { chromium, firefox, webkit };
}

const DEFAULTS = {
  browser: 'chromium', // chromium | firefox | webkit
  headless: true,
  slowMo: 0,
  baseURL: '',
  viewport: { width: 1280, height: 800 },
  proxy: { server: '', username: '', password: '' },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  authName: '', // 新增：用于从 auth.json 加载/保存的条目名称
  autoSaveStorageState: false, // 新增：是否在 close 时自动保存
  autoInstallBrowsers: true, // 默认开启自动安装
  useSystemPlaywright: false, // 新增：是否优先使用系统安装的 Playwright
  customProps: [], // 新增：自定义属性配置
};

// persistent auth storage file (存放 Playwright 登录态列表)
const AUTH_FILE = path.resolve(__dirname, 'auth.json');

function _loadAuthStore() {
  const fs = require('fs');
  try {
    if (!fs.existsSync(AUTH_FILE)) return [];
    const raw = fs.readFileSync(AUTH_FILE, 'utf8') || '[]';
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

function _saveAuthStore(arr) {
  const fs = require('fs');
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function saveAuthEntry(name, storageState) {
  if (!name) throw new Error('需要提供 name 来保存登录态');
  const arr = _loadAuthStore();
  // remove existing with same name
  const filtered = arr.filter(x => x && x.name !== name);
  filtered.push({ name, created_at: new Date().toISOString(), state: storageState });
  return _saveAuthStore(filtered);
}

function getAuthEntry(name) {
  const arr = _loadAuthStore();
  return arr.find(x => x && x.name === name) || null;
}

function listAuthEntries() {
  return _loadAuthStore().map(x => ({ name: x.name, created_at: x.created_at }));
}

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
  } catch (e) {
    console.error('获取 Playwright 配置失败:', e.message);
    return { ...DEFAULTS };
  }
}

// 规范化代理地址，缺少协议时自动补全
function normalizeProxyServer(server) {
  if (!server) return '';
  const s = String(server).trim();
  if (/^(https?:|socks4:|socks5:)/i.test(s)) return s; // 已包含协议
  if (/:443(\/|$)/.test(s)) return 'https://' + s;
  return 'http://' + s;
}

// 处理自定义属性
function processCustomProps(cfg, contextOptions) {
  if (!Array.isArray(cfg.customProps)) return;

  for (const prop of cfg.customProps) {
    if (prop.key && prop.value !== undefined) {
      let parsedValue = prop.value;

      // 根据类型处理值
      switch (prop.type) {
        case 'number':
          parsedValue = Number(prop.value);
          break;
        case 'boolean':
          parsedValue = prop.value === 'true' || prop.value === true;
          break;
        case 'json':
          try {
            parsedValue = JSON.parse(prop.value);
          } catch (e) {
            console.warn(`无法解析自定义属性 "${prop.key}" 的 JSON 值:`, e.message);
            // 保持原始字符串值
            parsedValue = prop.value;
          }
          break;
        case 'array':
          // 尝试解析为数组，支持逗号分隔的字符串
          if (Array.isArray(prop.value)) {
            parsedValue = prop.value;
          } else if (typeof prop.value === 'string') {
            // 用逗号分隔并去除空白
            parsedValue = prop.value.split(',').map(item => item.trim()).filter(item => item.length > 0);
          } else {
            try {
              parsedValue = JSON.parse(prop.value);
            } catch (e) {
              console.warn(`无法解析自定义属性 "${prop.key}" 的数组值:`, e.message);
              // 保持原始字符串值
              parsedValue = prop.value;
            }
          }
          break;
        case 'string':
        default:
          // 字符串类型，保持原值
          parsedValue = prop.value;
          break;
      }

      contextOptions[prop.key] = parsedValue;
    }
  }
}

class PWToolkit {
  constructor(cfg, browserLauncher) {
    this.cfg = cfg;
    this.browserLauncher = browserLauncher;
    this.browser = null;
    this.context = null;
  }

  async init() {
    return this;
  }

  withBaseURL(pathname) {
    let base = (this.cfg.baseURL || '').trim();
    if (base) {
      base = base.replace(/\/$/, '');
      if (!/^https?:\/\//i.test(base)) {
        base = 'http://' + base;
      }
    }
    const p = String(pathname || '');
    return base ? base + (p.startsWith('/') ? p : '/' + p) : p;
  }

  async launch() {
    if (this.browser) return this.browser;

    const { headless, slowMo, proxy, devtools, userAgent, executablePath, args } = this.cfg;
    const server = proxy && proxy.server ? normalizeProxyServer(proxy.server) : undefined;
    const proxyOpt = server ? { server, username: proxy.username || undefined, password: proxy.password || undefined } : undefined;

    // 如果 headless 为 false 且 devtools 为 true，则打开开发者工具
    const launchOptions = {
      headless, slowMo, proxy: proxyOpt, userAgent, args, executablePath, devtools: !headless && devtools
    };
    const doLaunch = async () => await this.browserLauncher.launch(launchOptions);

    try {
      this.browser = await doLaunch();
    } catch (e) {
      const msg = String((e && e.message) || e || '');
      if (/Executable doesn't exist/i.test(msg) && this.cfg.autoInstallBrowsers) {
        console.log(`Playwright 浏览器 (${this.cfg.browser}) 未安装，将自动尝试安装...`);
        const cwd = scriptsRoot();
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        try {
          spawnSync(cmd, ['playwright', 'install', this.cfg.browser], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
          console.log('浏览器安装完成，正在重试启动...');
          this.browser = await doLaunch();
        } catch (installError) {
          console.error('浏览器自动安装失败:', installError);
          throw e; // 抛出原始错误
        }
      } else {
        if (/Invalid URL/i.test(msg) && proxy && proxy.server) {
          throw new Error(`Playwright 代理地址无效：${proxy.server}。请使用带协议的地址，例如：http://host:port`);
        }
        if (/ECONNRESET/i.test(msg)) {
          throw new Error(`网络连接被重置（ECONNRESET）。请检查代理/TLS/防火墙设置。`);
        }
        throw e;
      }
    }
    return this.browser;
  }

  async close() {
    if (this.context && this.cfg && this.cfg.autoSaveStorageState && this.cfg.authName) {
      try {
        const state = await this.context.storageState();
        saveAuthEntry(this.cfg.authName, state);
        console.log(`已自动保存登录态到 ${this.cfg.authName}`);
      } catch (e) {
        console.error(`自动保存登录态失败:`, e.message);
      }
    }

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
    if (!this.browser) {
      await this.launch();
    }

    const cfg = this.cfg || {};
    const contextOptions = {
      ...options,
      viewport: cfg.viewport,
      userAgent: cfg.userAgent,
      locale: cfg.locale,
      timezoneId: cfg.timezoneId,
      ignoreHTTPSErrors: !!cfg.ignoreHTTPSErrors,
      acceptDownloads: !!cfg.acceptDownloads,
    };

    if (cfg.video && cfg.video !== 'off') {
      const dir = path.resolve(scriptsRoot(), 'temp', 'videos');
      require('fs').mkdirSync(dir, { recursive: true });
      contextOptions.recordVideo = { dir };
    }

    // 处理 storageState
    if (cfg.authName) {
      const entry = getAuthEntry(cfg.authName);
      if (entry && entry.state) {
        contextOptions.storageState = entry.state;
        console.log(`已加载名为 ${cfg.authName} 的登录态。`);
      } else {
        console.log(`未找到名为 ${cfg.authName} 的登录态，将以无痕模式启动。`);
      }
    }

    // 处理自定义属性
    processCustomProps(cfg, contextOptions);

    const context = await this.browser.newContext(contextOptions);

    // 设置默认超时
    if (cfg.timeout && typeof cfg.timeout === 'number' && cfg.timeout > 0) {
      context.setDefaultTimeout(cfg.timeout);
    }

    this.context = context;
    return context;
  }

  async newPage(options = {}) {
    // 如果没有 context，创建一个
    if (!this.context) {
      await this.newContext(options);
    }
    const page = await this.context.newPage();
    return page;
  }

  // 将当前 context 的 storageState 保存到 auth.json（按 name 存储）
  async saveCurrentStorageState(name) {
    if (!name) throw new Error('saveCurrentStorageState 需要一个 name 参数');
    if (!this.context) throw new Error('未找到上下文实例，请先通过 newContext() 创建上下文');
    const state = await this.context.storageState();
    const ok = saveAuthEntry(name, state);
    if (!ok) throw new Error('保存到 auth.json 失败');
    return true;
  }

  // ================== 常用方法代理 ==================

  async addCookies(cookies) {
    if (!this.context) await this.newContext();
    return this.context.addCookies(cookies);
  }

  async goto(url, options) {
    const page = this.getPage();
    return page.goto(url, options);
  }

  async screenshot(options) {
    const page = this.getPage();
    return page.screenshot(options);
  }

  // ===============================================

  // 暴露 context 和 page，方便直接调用
  getContext() {
    if (!this.context) throw new Error('Context not initialized. Call newContext() or newPage() first.');
    return this.context;
  }

  getPage() {
    if (!this.context || this.context.pages().length === 0) {
      throw new Error('Page not initialized. Call newPage() first.');
    }
    return this.context.pages()[0];
  }
}

async function createPWToolkit() {
  const cfg = await fetchPlaywrightConfig();

  // 根据配置决定使用哪种 Playwright
  let browserLauncher;
  const browserType = cfg.browser || 'chromium';

  if (cfg.useSystemPlaywright) {
    // 使用系统安装的 Playwright
    switch (browserType) {
      case 'firefox':
        browserLauncher = playwrightModules.firefox;
        break;
      case 'webkit':
        browserLauncher = playwrightModules.webkit;
        break;
      default:
        browserLauncher = playwrightModules.chromium;
        break;
    }
  } else {
    // 使用 playwright-extra
    switch (browserType) {
      case 'firefox':
        browserLauncher = playwrightModules.firefox;
        break;
      case 'webkit':
        browserLauncher = playwrightModules.webkit;
        break;
      default:
        browserLauncher = playwrightModules.chromium;
        break;
    }
  }

  const toolkit = new PWToolkit(cfg, browserLauncher);
  return toolkit.init();
}

module.exports = { createPWToolkit, saveAuthEntry, getAuthEntry, listAuthEntries };
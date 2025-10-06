<template>
  <div class="subsection">
    <div class="subsection-title">Playwright 设置</div>
    <el-form :model="model.playwright" label-width="160px">
      <el-form-item label="浏览器">
        <el-select v-model="model.playwright.browser" style="width: 220px">
          <el-option label="Chromium" value="chromium" />
          <el-option label="Firefox" value="firefox" />
          <el-option label="WebKit" value="webkit" />
        </el-select>
      </el-form-item>

      <el-form-item label="无头模式">
        <el-switch v-model="model.playwright.headless" />
      </el-form-item>

      <el-form-item label="SlowMo(ms)">
        <el-input-number v-model="model.playwright.slowMo" :min="0" :max="2000" />
      </el-form-item>

      <el-form-item label="基础地址 BaseURL">
        <el-input v-model="model.playwright.baseURL" placeholder="https://example.com" />
      </el-form-item>

      <!-- 防护：仅在 viewport 已准备好时渲染输入框，避免 undefined 报错 -->
      <el-form-item label="视口大小" v-if="model.playwright && model.playwright.viewport">
        <div class="row">
          <el-input-number v-model="model.playwright.viewport.width" :min="320" :max="3840" />
          <span style="padding:0 8px">x</span>
          <el-input-number v-model="model.playwright.viewport.height" :min="320" :max="2160" />
        </div>
      </el-form-item>

      <el-form-item label="代理">
        <div class="grid">
          <el-input v-model="model.playwright.proxy.server" placeholder="http://host:port 或 socks5://host:port" />
          <el-input v-model="model.playwright.proxy.username" placeholder="用户名（可选）" />
          <el-input v-model="model.playwright.proxy.password" placeholder="密码（可选）" type="password" show-password />
        </div>
      </el-form-item>

      <el-form-item label="User-Agent">
        <el-input v-model="model.playwright.userAgent" placeholder="自定义 UA（可选）" />
      </el-form-item>

      <el-form-item label="Locale / 时区">
        <div class="row">
          <el-input v-model="model.playwright.locale" placeholder="zh-CN" style="width: 200px" />
          <el-input v-model="model.playwright.timezoneId" placeholder="Asia/Shanghai" style="width: 220px" />
        </div>
      </el-form-item>

      <el-form-item label="登录态存档 (storageState)">
        <el-input v-model="model.playwright.storageStatePath" placeholder="相对 scripts 根目录的路径，如 states/auth.json" />
      </el-form-item>

      <el-form-item label="自动保存登录态">
        <el-switch v-model="model.playwright.autoSaveStorageState" />
      </el-form-item>

      <el-form-item label="保存登录态名 (authName)">
        <el-input v-model="model.playwright.authName" placeholder="例如 my-shop-account（用于在 auth.json 中标识）" />
      </el-form-item>

      <el-form-item label="视频录制">
        <el-select v-model="model.playwright.video" style="width: 220px">
          <el-option label="关闭" value="off" />
          <el-option label="开启" value="on" />
          <el-option label="失败保留" value="retain-on-failure" />
        </el-select>
      </el-form-item>

      <el-form-item label="截图设置">
        <el-select v-model="model.playwright.screenshot" style="width: 220px">
          <el-option label="仅失败截图" value="only-on-failure" />
          <el-option label="全部截图" value="on" />
          <el-option label="关闭" value="off" />
        </el-select>
      </el-form-item>

      <el-form-item label="下载/视频目录">
        <el-input v-model="model.playwright.downloadsPath" placeholder="相对 scripts 根目录的目录，如 .artifacts" />
      </el-form-item>

      <el-form-item label="自动安装浏览器" prop="autoInstallBrowsers" v-if="model.playwright">
        <el-checkbox v-model="model.playwright.autoInstallBrowsers"></el-checkbox>
      </el-form-item>

      <el-form-item label="默认超时(ms)" prop="timeout" v-if="model.playwright">
        <el-input-number v-model="model.playwright.timeout" :min="0" />
        <div class="form-item-help">设置 Playwright 的默认超时时间（毫秒），用于页面加载、元素查找等操作。0 表示使用 Playwright 的默认值 (30000ms)。</div>
      </el-form-item>

      <el-form-item label="打开DevTools" prop="devtools" v-if="model.playwright">
        <el-checkbox v-model="model.playwright.devtools"></el-checkbox>
        <div class="form-item-help">启动浏览器时自动打开开发者工具，方便调试。仅在“无头模式”关闭时生效。</div>
      </el-form-item>

      <div class="tip">提示：脚本运行前，请在“配置 - 依赖”中安装 <code>playwright</code> 包。如缺少浏览器，请在 backend/scripts 目录执行：<code>npx playwright install</code>。</div>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted, watch, toRef } from 'vue'
const props = defineProps({ model: { type: Object, required: true } })
const model = toRef(props, 'model')

function ensurePlaywrightDefaults() {
  if (!model.value.playwright) model.value.playwright = {}
  const pw = model.value.playwright
  // 基本字段
  pw.browser ??= 'chromium'
  pw.headless ??= true
  pw.slowMo ??= 0
  pw.baseURL ??= ''
  pw.userAgent ??= ''
  pw.locale ??= 'zh-CN'
  pw.timezoneId ??= 'Asia/Shanghai'
  pw.storageStatePath ??= ''
  pw.video ??= 'off'
  pw.screenshot ??= 'only-on-failure'
  pw.downloadsPath ??= ''
  pw.autoInstallBrowsers ??= false
  pw.timeout ??= 30000
  // 嵌套对象
  pw.viewport ??= { width: 1280, height: 800 }
  if (pw.viewport.width == null) pw.viewport.width = 1280
  if (pw.viewport.height == null) pw.viewport.height = 800
  pw.proxy ??= { server: '', username: '', password: '' }
  if (pw.proxy.server == null) pw.proxy.server = ''
  if (pw.proxy.username == null) pw.proxy.username = ''
  if (pw.proxy.password == null) pw.proxy.password = ''
}

onMounted(ensurePlaywrightDefaults)
watch(model, ensurePlaywrightDefaults, { immediate: true, deep: true })
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.grid { display: grid; grid-template-columns: 1fr 220px 220px; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.tip { margin-top: 8px; font-size: 12px; color: #909399; }
</style>

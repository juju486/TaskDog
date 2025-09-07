<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">配置管理</h1>
        <div class="header-actions">
          <el-button type="success" @click="testConfig" :loading="testing">
            <el-icon><Refresh /></el-icon>
            测试配置
          </el-button>
          <el-button type="primary" @click="saveAll" :loading="savingAll">
            <el-icon><Check /></el-icon>
            保存全部
          </el-button>
        </div>
      </div>
    </div>

    <div class="page-content">
      <div class="config-tabs">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="系统" name="system">
            <SectionSystem :model="configObj" />
          </el-tab-pane>

          <el-tab-pane label="执行" name="execution">
            <SectionExecution :model="configObj" />
          </el-tab-pane>

          <!-- 已移除：Playwright 配置，改到“工具配置”页面 -->

          <el-tab-pane label="调度" name="scheduler">
            <SectionScheduler :model="configObj" />
          </el-tab-pane>

          <el-tab-pane label="日志" name="logging">
            <SectionLogging :model="configObj" />
          </el-tab-pane>

          <el-tab-pane label="通知" name="notify">
            <SectionNotify :model="configObj" />
          </el-tab-pane>

          <el-tab-pane label="界面" name="ui">
            <SectionUI :model="configObj" />
          </el-tab-pane>

          <!-- 已隐藏：全局变量，统一到独立的“全局变量”侧边栏页面 -->

          <el-tab-pane label="依赖" name="deps">
            <SectionDeps />
          </el-tab-pane>

          <el-tab-pane label="备份" name="backup">
            <SectionBackup :model="configObj" />
          </el-tab-pane>

          <el-tab-pane label="凭据" name="secrets">
            <SectionSecrets :model="configObj" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Refresh } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'

import SectionSystem from './config/SectionSystem.vue'
import SectionExecution from './config/SectionExecution.vue'
import SectionScheduler from './config/SectionScheduler.vue'
import SectionLogging from './config/SectionLogging.vue'
import SectionNotify from './config/SectionNotify.vue'
import SectionUI from './config/SectionUI.vue'
// import SectionGlobals from './config/SectionGlobals.vue' // 已隐藏
import SectionDeps from './config/SectionDeps.vue'
import SectionBackup from './config/SectionBackup.vue'
import SectionSecrets from './config/SectionSecrets.vue'
// 已移除：Playwright 组件导入

const activeTab = ref('system')
const savingAll = ref(false)
const testing = ref(false)

const defaultConfig = () => ({
  system: { timezone: 'Asia/Shanghai', datetimeFormat: 'YYYY-MM-DD HH:mm:ss', locale: 'zh-CN', backendUrl: 'http://localhost:3001', scriptsRoot: 'backend/scripts', tempDir: 'backend/.tmp' },
  execution: {
    interpreters: {
      powershell: { enabled: true, path: 'powershell.exe' },
      cmd: { enabled: true, path: 'cmd.exe' },
      python: { enabled: true, path: 'python' },
      node: { enabled: true, path: 'node' },
      bash: { enabled: false, path: '/bin/bash' }
    },
    defaultTimeoutMs: 300000,
    maxConcurrent: 2,
    queueSize: 20,
    workingDirPolicy: 'scriptDir',
    allowedLanguages: ['powershell','cmd','batch','python','node','javascript'],
    maxUploadKB: 512,
    pathIsolation: true
  },
  // 新增：Playwright 默认配置（与 helper 对齐）
  playwright: {
    browser: 'chromium',
    headless: true,
    slowMo: 0,
    baseURL: '',
    viewport: { width: 1280, height: 800 },
    proxy: { server: '', username: '', password: '' },
    userAgent: '',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    storageStatePath: '',
    video: 'off',
    screenshot: 'only-on-failure',
    downloadsPath: '',
    autoInstallBrowsers: false,
  },
  scheduler: { schedulerTz: 'Asia/Shanghai', overlapPolicy: 'skip', catchup: false, jitterMs: 5000, retry: { maxAttempts: 1, backoffMs: 30000 } },
  logging: { level: 'info', retainDays: 30, captureMaxKB: 256, redactKeys: ['token','password'], rotate: { maxSizeMB: 10, maxFiles: 5 } },
  notify: { webhook: { enabled: false, items: [] }, email: { enabled: false, host: '', port: 465, user: '', from: '', useTLS: true }, on: { taskStart: false, taskSuccess: false, taskError: true } },
  ui: { theme: 'light', monacoTheme: 'vs', pageSize: 10, editorWordWrap: true, tabSize: 2 },
  globals: { inheritSystemEnv: true, items: [] },
  backup: { enabled: false, cron: '0 3 * * *', targetDir: 'backup' },
  secrets: []
})

const configObj = ref(defaultConfig())

const loadAll = async () => {
  try {
    const res = await configApi.getAllGroups()
    if (res && res.data) {
      const data = res.data || {}
      // 合并默认与已有，确保缺省字段存在
      configObj.value = { ...defaultConfig(), ...data }
      // 深合并关键分组
      const def = defaultConfig()
      const exec = data.execution || {}
      const execInterps = (exec && exec.interpreters) || {}
      const sched = data.scheduler || {}
      const logg = data.logging || {}
      const notif = data.notify || {}
      const notifWebhook = (notif && notif.webhook) || {}
      const notifEmail = (notif && notif.email) || {}
      const notifOn = (notif && notif.on) || {}
      const ui = data.ui || {}
      const globals = data.globals || {}
      const backup = data.backup || {}
      const pw = data.playwright || {}

      configObj.value.execution = { ...def.execution, ...exec }
      configObj.value.execution.interpreters = { ...def.execution.interpreters, ...execInterps }
      // 新增：合并 Playwright
      configObj.value.playwright = { ...def.playwright, ...pw }
      configObj.value.scheduler = { ...def.scheduler, ...sched }
      configObj.value.logging = { ...def.logging, ...logg }
      configObj.value.notify = { ...def.notify, ...notif }
      configObj.value.notify.webhook = { ...def.notify.webhook, ...notifWebhook }
      configObj.value.notify.email = { ...def.notify.email, ...notifEmail }
      configObj.value.notify.on = { ...def.notify.on, ...notifOn }
      configObj.value.ui = { ...def.ui, ...ui }
      configObj.value.globals = { ...def.globals, ...globals }
      if (!Array.isArray(configObj.value.globals.items)) configObj.value.globals.items = []
      configObj.value.backup = { ...def.backup, ...backup }
      configObj.value.secrets = data.secrets || []
    }
  } catch (e) {
    ElMessage.error('加载配置失败')
  }
}

const saveAll = async () => {
  try {
    savingAll.value = true
    await configApi.saveAll(configObj.value)
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    savingAll.value = false
  }
}

const testConfig = async () => {
  try {
    testing.value = true
    const res = await configApi.test(configObj.value)
    const ok = res && res.success !== false
    ElMessage[ok ? 'success' : 'error'](ok ? '测试通过' : '测试失败')
  } catch (e) {
    ElMessage.error('测试失败')
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped>
.page-container { height: 100vh; display: flex; flex-direction: column; }
.page-header { background: white; border-bottom: 1px solid #e4e7ed; padding: 0; }
.header-content { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; }
.page-title { font-size: 20px; font-weight: 600; color: #303133; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.page-content { flex: 1; padding: 24px 0 ; overflow: auto; }
.config-tabs { background: white; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); padding: 20px; }
</style>

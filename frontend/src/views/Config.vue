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
            <el-form :model="configObj.system" label-width="140px">
              <el-form-item label="时区">
                <el-input v-model="configObj.system.timezone" placeholder="Asia/Shanghai" />
              </el-form-item>
              <el-form-item label="时间格式">
                <el-input v-model="configObj.system.datetimeFormat" placeholder="YYYY-MM-DD HH:mm:ss" />
              </el-form-item>
              <el-form-item label="语言">
                <el-input v-model="configObj.system.locale" placeholder="zh-CN" />
              </el-form-item>
              <el-form-item label="后端地址">
                <el-input v-model="configObj.system.backendUrl" placeholder="http://localhost:3001" />
              </el-form-item>
              <el-form-item label="脚本根目录">
                <el-input v-model="configObj.system.scriptsRoot" placeholder="backend/scripts" />
              </el-form-item>
              <el-form-item label="临时目录">
                <el-input v-model="configObj.system.tempDir" placeholder="backend/.tmp" />
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="执行" name="execution">
            <el-form :model="configObj.execution" label-width="160px">
              <el-form-item label="默认超时 (ms)">
                <el-input-number v-model="configObj.execution.defaultTimeoutMs" :min="1000" />
              </el-form-item>
              <el-form-item label="最大并发">
                <el-input-number v-model="configObj.execution.maxConcurrent" :min="1" />
              </el-form-item>
              <el-form-item label="队列容量">
                <el-input-number v-model="configObj.execution.queueSize" :min="0" />
              </el-form-item>
              <el-form-item label="工作目录策略">
                <el-select v-model="configObj.execution.workingDirPolicy">
                  <el-option label="脚本目录" value="scriptDir" />
                  <el-option label="临时目录" value="tempDir" />
                </el-select>
              </el-form-item>
              <el-form-item label="允许语言">
                <el-select v-model="configObj.execution.allowedLanguages" multiple style="width: 100%">
                  <el-option v-for="lang in languageOptions" :key="lang" :label="lang" :value="lang" />
                </el-select>
              </el-form-item>
              <el-form-item label="上传大小上限 (KB)">
                <el-input-number v-model="configObj.execution.maxUploadKB" :min="1" />
              </el-form-item>
              <el-form-item label="路径隔离">
                <el-switch v-model="configObj.execution.pathIsolation" />
              </el-form-item>

              <div class="subsection-title">解释器</div>
              <div class="interp-grid">
                <div v-for="(interp, key) in configObj.execution.interpreters" :key="key" class="interp-item">
                  <div class="interp-head">
                    <strong>{{ key }}</strong>
                    <el-switch v-model="interp.enabled" />
                  </div>
                  <el-input v-model="interp.path" placeholder="可执行文件路径，如 node/python/powershell.exe" />
                </div>
              </div>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="调度" name="scheduler">
            <el-form :model="configObj.scheduler" label-width="160px">
              <el-form-item label="Cron 时区">
                <el-input v-model="configObj.scheduler.schedulerTz" placeholder="Asia/Shanghai" />
              </el-form-item>
              <el-form-item label="并发策略">
                <el-select v-model="configObj.scheduler.overlapPolicy">
                  <el-option label="排队" value="queue" />
                  <el-option label="跳过" value="skip" />
                  <el-option label="终止前一个" value="kill" />
                </el-select>
              </el-form-item>
              <el-form-item label="补跑历史">
                <el-switch v-model="configObj.scheduler.catchup" />
              </el-form-item>
              <el-form-item label="随机抖动 (ms)">
                <el-input-number v-model="configObj.scheduler.jitterMs" :min="0" />
              </el-form-item>
              <el-form-item label="最大重试次数">
                <el-input-number v-model="configObj.scheduler.retry.maxAttempts" :min="0" />
              </el-form-item>
              <el-form-item label="退避时间 (ms)">
                <el-input-number v-model="configObj.scheduler.retry.backoffMs" :min="0" />
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="日志" name="logging">
            <el-form :model="configObj.logging" label-width="160px">
              <el-form-item label="日志级别">
                <el-select v-model="configObj.logging.level">
                  <el-option label="error" value="error" />
                  <el-option label="info" value="info" />
                  <el-option label="debug" value="debug" />
                </el-select>
              </el-form-item>
              <el-form-item label="保留天数">
                <el-input-number v-model="configObj.logging.retainDays" :min="1" />
              </el-form-item>
              <el-form-item label="输出截断 (KB)">
                <el-input-number v-model="configObj.logging.captureMaxKB" :min="1" />
              </el-form-item>
              <el-form-item label="敏感键(逗号分隔)">
                <el-input v-model="redactKeysText" @change="onRedactKeysChange" placeholder="token,password" />
              </el-form-item>
              <el-form-item label="轮转大小 (MB)">
                <el-input-number v-model="configObj.logging.rotate.maxSizeMB" :min="1" />
              </el-form-item>
              <el-form-item label="轮转文件数">
                <el-input-number v-model="configObj.logging.rotate.maxFiles" :min="1" />
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="通知" name="notify">
            <div class="subsection">
              <div class="subsection-title">Webhook</div>
              <el-form :model="configObj.notify.webhook" label-width="140px">
                <el-form-item label="启用">
                  <el-switch v-model="configObj.notify.webhook.enabled" />
                </el-form-item>
                <el-form-item label="URL 列表">
                  <div class="list">
                    <div v-for="(w, i) in configObj.notify.webhook.items" :key="i" class="list-row">
                      <el-input v-model="w.url" placeholder="https://example.com/hook" />
                      <el-button type="danger" link @click="removeWebhook(i)">删除</el-button>
                    </div>
                    <el-button type="primary" link @click="addWebhook">+ 新增</el-button>
                  </div>
                </el-form-item>
              </el-form>
            </div>

            <div class="subsection">
              <div class="subsection-title">邮件</div>
              <el-form :model="configObj.notify.email" label-width="140px">
                <el-form-item label="启用">
                  <el-switch v-model="configObj.notify.email.enabled" />
                </el-form-item>
                <el-form-item label="Host"><el-input v-model="configObj.notify.email.host" /></el-form-item>
                <el-form-item label="Port"><el-input-number v-model="configObj.notify.email.port" :min="1" /></el-form-item>
                <el-form-item label="User"><el-input v-model="configObj.notify.email.user" /></el-form-item>
                <el-form-item label="From"><el-input v-model="configObj.notify.email.from" /></el-form-item>
                <el-form-item label="TLS"><el-switch v-model="configObj.notify.email.useTLS" /></el-form-item>
              </el-form>
            </div>

            <div class="subsection">
              <div class="subsection-title">触发规则</div>
              <el-form :model="configObj.notify.on" label-width="140px">
                <el-form-item label="任务开始"><el-switch v-model="configObj.notify.on.taskStart" /></el-form-item>
                <el-form-item label="任务成功"><el-switch v-model="configObj.notify.on.taskSuccess" /></el-form-item>
                <el-form-item label="任务失败"><el-switch v-model="configObj.notify.on.taskError" /></el-form-item>
              </el-form>
            </div>
          </el-tab-pane>

          <el-tab-pane label="界面" name="ui">
            <el-form :model="configObj.ui" label-width="140px">
              <el-form-item label="主题">
                <el-select v-model="configObj.ui.theme">
                  <el-option label="明亮" value="light" />
                  <el-option label="暗色" value="dark" />
                </el-select>
              </el-form-item>
              <el-form-item label="Monaco 主题">
                <el-select v-model="configObj.ui.monacoTheme">
                  <el-option label="vs" value="vs" />
                  <el-option label="vs-dark" value="vs-dark" />
                </el-select>
              </el-form-item>
              <el-form-item label="表格页大小"><el-input-number v-model="configObj.ui.pageSize" :min="5" /></el-form-item>
              <el-form-item label="编辑器换行"><el-switch v-model="configObj.ui.editorWordWrap" /></el-form-item>
              <el-form-item label="Tab 宽度"><el-input-number v-model="configObj.ui.tabSize" :min="2" /></el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="全局变量" name="globals">
            <div class="subsection">
              <div class="subsection-title">环境变量（将与脚本执行相关）</div>
              <el-form :model="configObj.globals" label-width="140px">
                <el-form-item label="继承系统环境">
                  <el-switch v-model="configObj.globals.inheritSystemEnv" />
                </el-form-item>
                <el-form-item label="变量列表">
                  <div class="list">
                    <div v-for="(g, i) in configObj.globals.items" :key="i" class="list-row">
                      <el-input v-model="g.key" placeholder="KEY（仅包含字母数字与下划线）" />
                      <el-input
                        v-model="g.value"
                        :type="g.secret ? 'password' : 'text'"
                        show-password
                        placeholder="VALUE"
                      />
                      <div style="display:flex;align-items:center;gap:8px;">
                        <el-switch v-model="g.secret" />
                        <el-button type="danger" link @click="removeGlobal(i)">删除</el-button>
                      </div>
                    </div>
                    <el-button type="primary" link @click="addGlobal">+ 新增变量</el-button>
                  </div>
                </el-form-item>
              </el-form>
            </div>
          </el-tab-pane>

          <el-tab-pane label="备份" name="backup">
            <el-form :model="configObj.backup" label-width="140px">
              <el-form-item label="启用"><el-switch v-model="configObj.backup.enabled" /></el-form-item>
              <el-form-item label="Cron"><el-input v-model="configObj.backup.cron" placeholder="0 3 * * *" /></el-form-item>
              <el-form-item label="目标目录"><el-input v-model="configObj.backup.targetDir" placeholder="backup" /></el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="凭据" name="secrets">
            <div class="subsection">
              <div class="subsection-title">密钥列表（仅本地可见）</div>
              <div class="list">
                <div v-for="(s, i) in configObj.secrets" :key="i" class="list-row">
                  <el-input v-model="s.key" placeholder="key" style="max-width: 240px" />
                  <el-input v-model="s.value" placeholder="value" type="password" show-password />
                  <el-button type="danger" link @click="removeSecret(i)">删除</el-button>
                </div>
                <el-button type="primary" link @click="addSecret">+ 新增</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Refresh } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'

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
  scheduler: { schedulerTz: 'Asia/Shanghai', overlapPolicy: 'skip', catchup: false, jitterMs: 5000, retry: { maxAttempts: 1, backoffMs: 30000 } },
  logging: { level: 'info', retainDays: 30, captureMaxKB: 256, redactKeys: ['token','password'], rotate: { maxSizeMB: 10, maxFiles: 5 } },
  notify: { webhook: { enabled: false, items: [] }, email: { enabled: false, host: '', port: 465, user: '', from: '', useTLS: true }, on: { taskStart: false, taskSuccess: false, taskError: true } },
  ui: { theme: 'light', monacoTheme: 'vs', pageSize: 10, editorWordWrap: true, tabSize: 2 },
  globals: { inheritSystemEnv: true, items: [] },
  backup: { enabled: false, cron: '0 3 * * *', targetDir: 'backup' },
  secrets: []
})

const configObj = ref(defaultConfig())
const languageOptions = ['powershell','cmd','batch','python','node','javascript','shell','bash']
const redactKeysText = computed({
  get: () => (configObj.value.logging.redactKeys || []).join(','),
  set: (v) => { configObj.value.logging.redactKeys = (v || '').split(',').map(s => s.trim()).filter(Boolean) }
})
const onRedactKeysChange = () => {}

const loadAll = async () => {
  try {
    const res = await configApi.getAllGroups()
    if (res && res.data) {
      // 合并默认与已有，确保缺省字段存在
      configObj.value = { ...defaultConfig(), ...res.data }
      // 深合并关键分组
      configObj.value.execution = { ...defaultConfig().execution, ...(res.data.execution || {}) }
      configObj.value.execution.interpreters = { ...defaultConfig().execution.interpreters, ...((res.data.execution && res.data.execution.interpreters) || {}) }
      configObj.value.scheduler = { ...defaultConfig().scheduler, ...(res.data.scheduler || {}) }
      configObj.value.logging = { ...defaultConfig().logging, ...(res.data.logging || {}) }
      configObj.value.notify = { ...defaultConfig().notify, ...(res.data.notify || {}) }
      if (res.data.notify) {
        configObj.value.notify.webhook = { ...defaultConfig().notify.webhook, ...(res.data.notify.webhook || {}) }
        configObj.value.notify.email = { ...defaultConfig().notify.email, ...(res.data.notify.email || {}) }
        configObj.value.notify.on = { ...defaultConfig().notify.on, ...(res.data.notify.on || {}) }
      }
      configObj.value.ui = { ...defaultConfig().ui, ...(res.data.ui || {}) }
      configObj.value.globals = { ...defaultConfig().globals, ...(res.data.globals || {}) }
      if (!Array.isArray(configObj.value.globals.items)) configObj.value.globals.items = []
      configObj.value.backup = { ...defaultConfig().backup, ...(res.data.backup || {}) }
      configObj.value.secrets = res.data.secrets || []
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
    // 可根据 res.data 展示更详细结果
    // console.log(res.data)
  } catch (e) {
    ElMessage.error('测试失败')
  } finally {
    testing.value = false
  }
}

const addWebhook = () => {
  if (!Array.isArray(configObj.value.notify.webhook.items)) configObj.value.notify.webhook.items = []
  configObj.value.notify.webhook.items.push({ url: '' })
}
const removeWebhook = (i) => {
  configObj.value.notify.webhook.items.splice(i, 1)
}

const addSecret = () => {
  if (!Array.isArray(configObj.value.secrets)) configObj.value.secrets = []
  configObj.value.secrets.push({ key: '', value: '' })
}
const removeSecret = (i) => {
  configObj.value.secrets.splice(i, 1)
}

const addGlobal = () => {
  if (!configObj.value.globals) configObj.value.globals = { inheritSystemEnv: true, items: [] }
  if (!Array.isArray(configObj.value.globals.items)) configObj.value.globals.items = []
  configObj.value.globals.items.push({ key: '', value: '', secret: false })
}
const removeGlobal = (i) => {
  configObj.value.globals.items.splice(i, 1)
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped>
.page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-header {
  background: white;
  border-bottom: 1px solid #e4e7ed;
  padding: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-content {
  flex: 1;
  padding: 24px 0 ;
  overflow: auto;
}

.config-tabs { background: white; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); padding: 20px; }
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 240px 1fr auto; gap: 8px; align-items: center; }
.interp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.interp-item { border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; background: #fafbfc; }
.interp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
</style>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">工具配置</h1>
        <div class="header-actions">
          <!-- 外层仅展示，不提供保存按钮 -->
        </div>
      </div>
    </div>

    <div class="page-content">
      <el-card class="tool-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <div class="title">
              <el-icon><Cpu /></el-icon>
              <span>Playwright</span>
              <el-tag size="small" type="info" effect="plain" style="margin-left: 8px">浏览器自动化</el-tag>
            </div>
          </div>
        </template>
        <div class="brief">
          <div class="desc">统一的浏览器自动化工具配置，供多个脚本复用</div>
          <div class="ops">
            <el-button type="primary" @click="openDrawer('playwright')">配置</el-button>
          </div>
        </div>
      </el-card>

      <!-- 预留：未来可添加更多工具卡片，仅展示名称与描述，点击进入配置 -->

      <!-- 工具配置抽屉：Playwright -->
      <el-drawer v-model="drawer.playwright" title="Playwright 配置" size="60%" :close-on-click-modal="false">
        <SectionPlaywright :model="configObj" />
        <template #footer>
          <div class="drawer-footer">
            <el-button @click="drawer.playwright = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveAll">保存</el-button>
          </div>
        </template>
      </el-drawer>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Cpu } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'
import SectionPlaywright from './config/SectionPlaywright.vue'

const saving = ref(false)
const drawer = ref({ playwright: false })
const configObj = ref({ playwright: {} })

const openDrawer = (key) => { drawer.value[key] = true }

const defaultConfig = () => ({
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
  }
})

const load = async () => {
  try {
    const res = await configApi.getAllGroups()
    const data = res?.data || {}
    const def = defaultConfig()
    configObj.value = { ...def, ...data }
    configObj.value.playwright = { ...def.playwright, ...(data.playwright || {}) }
  } catch (e) {
    ElMessage.error('加载工具配置失败')
  }
}

const saveAll = async () => {
  try {
    saving.value = true
    const res = await configApi.saveAll(configObj.value)
    if (res && res.success === false) throw new Error('保存失败')
    ElMessage.success('保存成功')
    drawer.value.playwright = false
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-container { height: 100%; display: flex; flex-direction: column; }
.page-header { background: white; border-bottom: 1px solid #e4e7ed; padding: 0; }
.header-content { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; }
.page-title { font-size: 20px; font-weight: 600; color: #303133; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.page-content { flex: 1; padding: 24px 0; overflow: auto; }
.tool-card { max-width: 980px; margin: 0 auto; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-header .title { display: flex; align-items: center; font-weight: 600; font-size: 16px; }
.card-header .title .el-icon { margin-right: 6px; }
.brief { display: flex; align-items: center; justify-content: space-between; }
.desc { color: #606266; font-size: 14px; }
.ops { display: flex; align-items: center; gap: 8px; }
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>

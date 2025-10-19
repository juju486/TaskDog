<template>
	<div class="page-container">
		<div class="page-header">
			<div class="header-content">
				<h1 class="page-title">工具配置</h1>
				<div class="header-actions">
					<el-button type="success" @click="testConfig" :loading="testing">
						<el-icon><Refresh /></el-icon>
						测试配置
					</el-button>
					<el-button type="primary" @click="saveAll" :loading="savingAll">
						<el-icon><Check /></el-icon>
						保存
					</el-button>
				</div>
			</div>
		</div>

		<div class="page-content">
			<div class="config-tabs">
				<SectionPlaywright :model="configObj" />
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Refresh } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'
import SectionPlaywright from './config/SectionPlaywright.vue'

const savingAll = ref(false)
const testing = ref(false)

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
    useSystemPlaywright: false,
    timeout: 30000,
    devtools: false,
    customProps: [] // 默认为空数组
  }
})

const configObj = ref(defaultConfig())

const loadAll = async () => {
	try {
		const res = await configApi.getAllGroups()
			if (res && res.data) {
				const data = res.data || {}
				configObj.value.playwright = { ...defaultConfig().playwright, ...data.playwright }
			}
	} catch (e) {
		ElMessage.error('加载配置失败')
	}
}

const saveAll = async () => {
	try {
		savingAll.value = true
		// fetch existing groups and merge playwright only
		const res = await configApi.getAllGroups()
		const payload = (res && res.data) ? { ...res.data } : {}
		payload.playwright = configObj.value.playwright
		await configApi.saveAll(payload)
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
		const res = await configApi.test({ playwright: configObj.value.playwright })
		const ok = res && res.success !== false
		ElMessage[ok ? 'success' : 'error'](ok ? '测试通过' : '测试失败')
	} catch (e) {
		ElMessage.error('测试失败')
	} finally {
		testing.value = false
	}
}

onMounted(loadAll)
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

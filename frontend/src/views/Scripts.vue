<template>
  <div class="page-container">
    <ScriptHeader v-model="searchText" @create="showCreateDialog" @search="handleSearch" @create-pw-sample="createPwSample" @create-param-sample="createParamSample" />

    <div class="page-content">
      <ScriptTable
        :data="scriptStore.scripts"
        :loading="scriptStore.loading"
        :search-text="searchText"
        @test="openTestDialog"
        @edit="editScript"
        @delete="deleteScript"
      />
    </div>

    <ScriptDialog
      v-model="dialogVisible"
      :is-edit="isEdit"
      :form="formData"
      :saving="saving"
      @confirm="saveScript"
      @closed="() => {}"
      @download-template="downloadScript"
      @override="overrideUploadChange"
    />

    <ScriptTestDialog v-model="testDialogVisible" :script="testingScript" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useScriptStore } from '@/stores/script'
import ScriptHeader from './scripts/ScriptHeader.vue'
import ScriptTable from './scripts/ScriptTable.vue'
import ScriptDialog from './scripts/ScriptDialog.vue'
import ScriptTestDialog from './scripts/ScriptTestDialog.vue'

const scriptStore = useScriptStore()

const searchText = ref('')
const dialogVisible = ref(false)
const testDialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

const formData = ref({ name: '', description: '', language: 'shell', content: '', default_params: {} })
const testingScript = ref(null)

const handleSearch = () => {}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = { name: '', description: '', language: 'shell', content: '', default_params: {} }
  dialogVisible.value = true
}

const createPwSample = async () => {
  // 生成一个可直接运行的 Node 脚本示例，调用通用 Playwright 工具
  const sample = {
    name: 'Playwright 示例：访问网页截图',
    description: '使用通用 Playwright 工具访问 example.com 并保存截图',
    language: 'node',
    content: `// 自动化示例：访问网页并截图\n// 依赖：配置-依赖 安装 playwright；如需浏览器：在 backend/scripts 执行 npx playwright install\n// 可在“工具配置”页面调整全局 Playwright 参数\nconst { createPWToolkit } = require('./utils/playwrightHelper')\n\n;(async () => {\n  const pw = await createPWToolkit({ headless: true }) // 可覆盖部分参数\n  try {\n    const page = await pw.newPage()\n    await page.goto(pw.withBaseURL('https://example.com'))\n    await page.screenshot({ path: 'example.png', fullPage: true })\n    console.log('已保存截图到 example.png')\n  } catch (e) {\n    console.error('示例运行出错:', e)\n    process.exitCode = 1\n  } finally {\n    await pw.close()\n  }\n})()\n`,
    default_params: {}
  }
  isEdit.value = false
  formData.value = sample
  dialogVisible.value = true
}

const createParamSample = () => {
  const sample = {
    name: '参数化示例：问候与重试',
    description: '演示如何通过 default_params 与任务/测试覆盖参数注入 TD.params，并使用 TD.retry',
    language: 'node',
    content: `// 参数化示例：读取 TD.params 并支持重试\n// 运行时参数注入：\n// - 全局/任务/测试传入的 JSON 将注入到环境变量 TASKDOG_PARAMS_JSON\n// - TD shim 提供 TD.params/TD.getParam/TD.requireParam 访问参数\n// - 任务层参数与脚本 default_params 深合并\n\n;(async () => {\n  try {\n    const name = TD.getParam('name', 'World')\n    const times = Number(TD.getParam('times', 1))\n    const failUntil = Number(TD.getParam('failUntil', 0)) // 前几次失败演示重试\n\n    let attempt = 0\n    await TD.retry(async () => {\n      attempt++\n      if (attempt <= failUntil) {\n        console.log('模拟失败，第 ' + attempt + ' 次')\n        throw new Error('Mock failure ' + attempt)\n      }\n      for (let i = 0; i < times; i++) {\n        console.log('Hello, ' + name + '! #' + (i + 1))\n        await TD.sleep(200)\n      }\n    }, { retries: Number(TD.getParam('retries', 2)), delay: Number(TD.getParam('delay', 300)) })\n\n    console.log('完成，参数为:', JSON.stringify(TD.params))\n  } catch (e) {\n    console.error('运行失败:', e && e.message ? e.message : e)\n    process.exitCode = 1\n  }\n})()\n`,
    default_params: { name: 'TaskDog', times: 2, retries: 2, delay: 300, failUntil: 0 }
  }
  isEdit.value = false
  formData.value = sample
  dialogVisible.value = true
}

const editScript = (script) => {
  isEdit.value = true
  formData.value = { ...script }
  dialogVisible.value = true
}

const saveScript = async (data) => {
  try {
    saving.value = true
    if (isEdit.value) {
      await scriptStore.updateScript(data.id, data)
      ElMessage.success('脚本更新成功')
    } else {
      await scriptStore.createScript(data)
      ElMessage.success('脚本创建成功')
    }
    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(isEdit.value ? '脚本更新失败' : '脚本创建失败')
  } finally {
    saving.value = false
  }
}

const deleteScript = async (script) => {
  try {
    await ElMessageBox.confirm(`确定要删除脚本 "${script.name}" 吗？此操作不可恢复。`, '确认删除', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    await scriptStore.deleteScript(script.id)
    ElMessage.success('脚本删除成功')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('脚本删除失败')
  }
}

const openTestDialog = (script) => {
  testingScript.value = { ...script }
  testDialogVisible.value = true
}

const downloadScript = async (script) => {
  try {
    const res = await import('@/api/modules').then(m => m.scriptApi.download(script.id))
    const blob = res.data
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    const extMap = { powershell: 'ps1', batch: 'bat', python: 'py', javascript: 'js', node: 'js', shell: 'sh', bash: 'sh' }
    const ext = extMap[script.language] || 'txt'
    a.href = url
    a.download = `${script.name}.${ext}`
    document.body.appendChild(a)
    a.click(); a.remove(); window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('下载失败')
  }
}

const overrideUploadChange = async (file, script) => {
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target.result
      await scriptStore.updateScript(script.id, { content })
      ElMessage.success('覆盖上传成功')
      await scriptStore.fetchScripts()
    }
    reader.readAsText(file.raw)
  } catch (e) {
    ElMessage.error('覆盖上传失败')
  }
}

onMounted(() => { scriptStore.fetchScripts() })
</script>

<style scoped>
.page-container { height: 100%; display: flex; flex-direction: column; }
.page-content { flex: 1; padding: 24px 0; overflow: auto; }
</style>

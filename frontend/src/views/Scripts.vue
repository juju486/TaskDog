<template>
  <div class="page-container">
    <ScriptHeader v-model="searchText" @create="showCreateDialog" @search="handleSearch" @create-pw-sample="createPwSample" />

    <div class="page-content">
      <ScriptTable
        :data="scriptStore.scripts"
        :loading="scriptStore.loading"
        :search-text="searchText"
        @test="testScript"
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

    <ScriptTestDialog v-model="testDialogVisible" :result="testResult" />
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
const testResult = ref(null)

const formData = ref({ name: '', description: '', language: 'shell', content: '' })

const handleSearch = () => {}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = { name: '', description: '', language: 'shell', content: '' }
  dialogVisible.value = true
}

const createPwSample = async () => {
  // 生成一个可直接运行的 Node 脚本示例，调用通用 Playwright 工具
  const sample = {
    name: 'Playwright 示例：访问网页截图',
    description: '使用通用 Playwright 工具访问 example.com 并保存截图',
    language: 'node',
    content: `// 自动化示例：访问网页并截图\n// 依赖：配置-依赖 安装 playwright；如需浏览器：在 backend/scripts 执行 npx playwright install\n// 可在“工具配置”页面调整全局 Playwright 参数\nconst { createPWToolkit } = require('./utils/playwrightHelper')\n\n;(async () => {\n  const pw = await createPWToolkit({ headless: true }) // 可覆盖部分参数\n  try {\n    const page = await pw.newPage()\n    await page.goto(pw.withBaseURL('https://example.com'))\n    await page.screenshot({ path: 'example.png', fullPage: true })\n    console.log('已保存截图到 example.png')\n  } catch (e) {\n    console.error('示例运行出错:', e)\n    process.exitCode = 1\n  } finally {\n    await pw.close()\n  }\n})()\n`
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

const testScript = async (script) => {
  try {
    ElMessage.info('正在测试脚本...')
    const result = await scriptStore.testScript(script.id)
    testResult.value = result
    testDialogVisible.value = true
  } catch (error) {
    ElMessage.error('脚本测试失败')
  }
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

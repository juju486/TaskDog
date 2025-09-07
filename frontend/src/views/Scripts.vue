<template>
  <div class="page-container">
    <ScriptHeader v-model="searchText" v-model:group="groupFilter" :groups="scriptGroups" @create="showCreateDialog" @search="handleSearch" @create-pw-sample="createPwSample" @create-param-sample="createParamSample" @manage-groups="openManageGroups('script')" />

    <div class="page-content">
      <ScriptTable
        :data="filteredScripts"
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

    <!-- 分组管理对话框占位 -->
    <el-dialog v-model="manageVisible" :title="manageType==='script' ? '管理脚本分组' : '管理任务分组'" width="520px">
      <div>
        <div style="margin-bottom: 12px; display:flex; gap:8px; align-items:center;">
          <el-input v-model="newGroupName" placeholder="新分组名称" style="flex:1" />
          <el-button type="primary" @click="addOneGroup">新增</el-button>
        </div>
        <el-table :data="manageType==='script' ? scriptGroups : taskGroups" size="small" style="width:100%">
          <el-table-column label="名称" prop="name">
            <template #default="{ row }">{{ row }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" @click="renameOne(row)">重命名</el-button>
              <el-button size="small" type="danger" @click="deleteOne(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 新增：统计与批量迁移 -->
        <div style="margin-top:16px; display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
          <div style="flex:1 1 240px; min-width:240px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="font-weight:600;">分组统计</div>
              <div>
                <el-button size="small" @click="syncGroups" :loading="syncing">从数据同步分组</el-button>
                <el-button size="small" @click="refreshStats" :loading="loadingStats">刷新</el-button>
              </div>
            </div>
            <el-table :data="currentStatsRows" size="small" border>
              <el-table-column label="分组" prop="name" />
              <el-table-column label="数量" prop="count" width="80" />
            </el-table>
            <div style="margin-top:6px; font-size:12px; color:#909399;">未分组：{{ currentStats?.ungrouped ?? 0 }}，总计：{{ currentStats?.total ?? 0 }}</div>
          </div>
          <div style="flex:1 1 260px; min-width:260px;">
            <div style="font-weight:600; margin-bottom:8px;">批量迁移</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">未分组 →</span>
                <el-select v-model="bulkTarget" placeholder="目标分组" clearable filterable style="flex:1">
                  <el-option v-for="g in (manageType==='script'?scriptGroups:taskGroups)" :key="g" :label="g" :value="g" />
                </el-select>
                <el-button size="small" type="primary" :disabled="!bulkTarget" @click="assignUngrouped">分配</el-button>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">从分组</span>
                <el-select v-model="bulkFrom" placeholder="来源分组" clearable filterable style="flex:1">
                  <el-option v-for="g in (manageType==='script'?scriptGroups:taskGroups)" :key="g" :label="g" :value="g" />
                </el-select>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">迁移到</span>
                <el-select v-model="bulkTo" placeholder="目标分组" clearable filterable style="flex:1">
                  <el-option v-for="g in (manageType==='script'?scriptGroups:taskGroups)" :key="g+'-to'" :label="g" :value="g" />
                </el-select>
                <el-button size="small" type="primary" :disabled="!bulkFrom || !bulkTo || bulkFrom===bulkTo" @click="moveFromTo">迁移</el-button>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">清空分组</span>
                <el-select v-model="bulkClear" placeholder="选择要清空的分组" clearable filterable style="flex:1">
                  <el-option v-for="g in (manageType==='script'?scriptGroups:taskGroups)" :key="g+'-clear'" :label="g" :value="g" />
                </el-select>
                <el-button size="small" type="danger" :disabled="!bulkClear" @click="clearGroup">清空</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useScriptStore } from '@/stores/script'
import ScriptHeader from './scripts/ScriptHeader.vue'
import ScriptTable from './scripts/ScriptTable.vue'
import ScriptDialog from './scripts/ScriptDialog.vue'
import ScriptTestDialog from './scripts/ScriptTestDialog.vue'
import { configApi } from '@/api/modules'

const scriptStore = useScriptStore()

const searchText = ref('')
const dialogVisible = ref(false)
const testDialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

const formData = ref({ name: '', description: '', language: 'shell', content: '', default_params: {} })
const testingScript = ref(null)

// 分组数据与筛选
const scriptGroups = ref([])
const taskGroups = ref([])
const groupFilter = ref('')

const filteredScripts = computed(() => {
  const list = scriptStore.scripts || []
  if (!groupFilter.value) return list
  return list.filter(s => (s.group || '') === groupFilter.value)
})

const handleSearch = () => {}

const loadGroups = async () => {
  try {
    const res = await configApi.listGroups()
    const data = res?.data ?? res
    scriptGroups.value = data?.scriptGroups || []
    taskGroups.value = data?.taskGroups || []
  } catch {}
}

watch(groupFilter, async (v) => {
  await scriptStore.fetchScripts(v ? { group: v } : undefined)
})

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = { name: '', description: '', language: 'shell', content: '', default_params: {}, group: groupFilter.value || '' }
  dialogVisible.value = true
}

const createPwSample = async () => {
  const sample = {
    name: 'Playwright 示例：访问网页截图',
    description: '使用通用 Playwright 工具访问 example.com 并保存截图',
    language: 'node',
    content: `// 自动化示例：访问网页并截图\n// 依赖：配置-依赖 安装 playwright；如需浏览器：在 backend/scripts 执行 npx playwright install\n// 可在“工具配置”页面调整全局 Playwright 参数\nconst { createPWToolkit } = require('./utils/playwrightHelper')\n\n;(async () => {\n  const pw = await createPWToolkit({ headless: true }) // 可覆盖部分参数\n  try {\n    const page = await pw.newPage()\n    await page.goto(pw.withBaseURL('https://example.com'))\n    await page.screenshot({ path: 'example.png', fullPage: true })\n    console.log('已保存截图到 example.png')\n  } catch (e) {\n    console.error('示例运行出错:', e)\n    process.exitCode = 1\n  } finally {\n    await pw.close()\n  }\n})()\n`,
    default_params: {},
    group: groupFilter.value || ''
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
    default_params: { name: 'TaskDog', times: 2, retries: 2, delay: 300, failUntil: 0 },
    group: groupFilter.value || ''
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
    await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
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
    await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('脚本删除失败')
  }
}

const openTestDialog = (script) => { testingScript.value = { ...script }; testDialogVisible.value = true }

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
  } catch (e) { ElMessage.error('下载失败') }
}

const overrideUploadChange = async (file, script) => {
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target.result
      await scriptStore.updateScript(script.id, { content })
      ElMessage.success('覆盖上传成功')
      await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
    }
    reader.readAsText(file.raw)
  } catch (e) { ElMessage.error('覆盖上传失败') }
}

// 分组管理对话框逻辑
const manageVisible = ref(false)
const manageType = ref('script') // 'script' | 'task'
const newGroupName = ref('')
const openManageGroups = (type) => { manageType.value = type; newGroupName.value = ''; manageVisible.value = true }
// 新增：统计与批量迁移状态
const stats = ref(null)
const loadingStats = ref(false)
const syncing = ref(false)
const bulkTarget = ref('')
const bulkFrom = ref('')
const bulkTo = ref('')
const bulkClear = ref('')

const currentStats = computed(() => manageType.value === 'script' ? (stats.value?.scripts || null) : (stats.value?.tasks || null))
const currentStatsRows = computed(() => {
  const s = currentStats.value
  if (!s) return []
  const rows = Object.entries(s.counts || {}).map(([name, count]) => ({ name, count }))
  return rows.sort((a,b) => b.count - a.count)
})

const refreshStats = async () => {
  try { loadingStats.value = true; const res = await configApi.groupStats(); const data = res?.data ?? res; stats.value = data; } finally { loadingStats.value = false }
}
const syncGroups = async () => {
  try { syncing.value = true; await configApi.syncGroupsFromItems(); await loadGroups(); await refreshStats(); ElMessage.success('已同步'); } catch { ElMessage.error('同步失败') } finally { syncing.value = false }
}
const assignUngrouped = async () => {
  try {
    await configApi.assignGroup({ type: manageType.value, allUngrouped: true, toGroup: bulkTarget.value })
    ElMessage.success('已分配未分组项')
    await loadGroups(); await refreshStats();
    if (manageType.value === 'script') await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
    else await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}
const moveFromTo = async () => {
  try {
    await configApi.assignGroup({ type: manageType.value, fromGroup: bulkFrom.value, toGroup: bulkTo.value })
    ElMessage.success('已迁移')
    await loadGroups(); await refreshStats();
    await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}
const clearGroup = async () => {
  try {
    await configApi.assignGroup({ type: manageType.value, fromGroup: bulkClear.value, clear: true })
    ElMessage.success('已清空该分组的分配')
    await loadGroups(); await refreshStats();
    await scriptStore.fetchScripts(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}

watch(manageVisible, async (v) => { if (v) { await refreshStats() } })

onMounted(async () => {
  await loadGroups()
  await scriptStore.fetchScripts()
})
</script>

<style scoped>
.page-container { height: 100%; display: flex; flex-direction: column; }
.page-content { flex: 1; padding: 24px 0; overflow: auto; }
</style>

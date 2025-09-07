<template>
  <div class="page-container">
    <TaskHeader v-model="searchText" v-model:group="groupFilter" :groups="taskGroups" @create="showCreateDialog" @search="handleSearch" @manage-groups="openManageGroups" />

    <div class="page-content">
      <TaskTable
        :tasks="filteredTasks"
        :loading="taskStore.loading"
        :search-text="searchText"
        @runOnce="runOnce"
        @start="startTask"
        @stop="stopTask"
        @edit="editTask"
        @delete="deleteTask"
      />
    </div>

    <TaskDialog
      v-model="dialogVisible"
      :is-edit="isEdit"
      :form="formData"
      :scripts="scriptStore.scripts"
      :script-loading="scriptStore.loading"
      :saving="saving"
      @confirm="saveTask"
      @closed="onDialogClosed"
    />

    <!-- 分组管理对话框 -->
    <el-dialog v-model="manageVisible" title="管理任务分组" width="520px">
      <div>
        <div style="margin-bottom: 12px; display:flex; gap:8px; align-items:center;">
          <el-input v-model="newGroupName" placeholder="新分组名称" style="flex:1" />
          <el-button type="primary" @click="addOneGroup">新增</el-button>
        </div>
        <el-table :data="taskGroups" size="small" style="width:100%">
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
            <el-table :data="statsRows" size="small" border>
              <el-table-column label="分组" prop="name" />
              <el-table-column label="数量" prop="count" width="80" />
            </el-table>
            <div style="margin-top:6px; font-size:12px; color:#909399;">未分组：{{ statsTask?.ungrouped ?? 0 }}，总计：{{ statsTask?.total ?? 0 }}</div>
          </div>
          <div style="flex:1 1 260px; min-width:260px;">
            <div style="font-weight:600; margin-bottom:8px;">批量迁移</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">未分组 →</span>
                <el-select v-model="bulkTarget" placeholder="目标分组" clearable filterable style="flex:1">
                  <el-option v-for="g in taskGroups" :key="g" :label="g" :value="g" />
                </el-select>
                <el-button size="small" type="primary" :disabled="!bulkTarget" @click="assignUngrouped">分配</el-button>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">从分组</span>
                <el-select v-model="bulkFrom" placeholder="来源分组" clearable filterable style="flex:1">
                  <el-option v-for="g in taskGroups" :key="g+'-from'" :label="g" :value="g" />
                </el-select>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">迁移到</span>
                <el-select v-model="bulkTo" placeholder="目标分组" clearable filterable style="flex:1">
                  <el-option v-for="g in taskGroups" :key="g+'-to'" :label="g" :value="g" />
                </el-select>
                <el-button size="small" type="primary" :disabled="!bulkFrom || !bulkTo || bulkFrom===bulkTo" @click="moveFromTo">迁移</el-button>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="min-width:92px;">清空分组</span>
                <el-select v-model="bulkClear" placeholder="选择要清空的分组" clearable filterable style="flex:1">
                  <el-option v-for="g in taskGroups" :key="g+'-clear'" :label="g" :value="g" />
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
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TaskHeader from './tasks/TaskHeader.vue'
import TaskTable from './tasks/TaskTable.vue'
import TaskDialog from './tasks/TaskDialog.vue'
import { useTaskStore } from '@/stores/task'
import { useScriptStore } from '@/stores/script'
import { configApi } from '@/api/modules'

const taskStore = useTaskStore()
const scriptStore = useScriptStore()

// 响应式数据
const searchText = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

const formData = ref({
  id: undefined,
  name: '',
  group: '',
  script_ids: [],
  cron_expression: '',
  status: 'inactive'
})

// 分组
const taskGroups = ref([])
const groupFilter = ref('')

const filteredTasks = computed(() => {
  const list = taskStore.tasks || []
  if (!groupFilter.value) return list
  return list.filter(t => (t.group || '') === groupFilter.value)
})

const loadGroups = async () => {
  try {
    const res = await configApi.listGroups()
    const data = res?.data ?? res
    taskGroups.value = data?.taskGroups || []
  } catch {}
}

watch(groupFilter, async (v) => {
  await taskStore.fetchTasks(v ? { group: v } : undefined)
})

const handleSearch = () => {}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = { id: undefined, name: '', group: groupFilter.value || '', script_ids: [], cron_expression: '', status: 'inactive' }
  dialogVisible.value = true
}

const editTask = (task) => {
  isEdit.value = true
  const ids = Array.isArray(task?.script_ids) ? task.script_ids : (task?.script_id ? [task.script_id] : [])
  formData.value = { id: task.id, name: task.name, group: task.group || '', script_ids: ids, cron_expression: task.cron_expression, status: task.status }
  dialogVisible.value = true
}

const onDialogClosed = () => {}

const saveTask = async (data) => {
  try {
    saving.value = true
    if (isEdit.value) {
      await taskStore.updateTask(data.id, data)
      ElMessage.success('任务更新成功')
    } else {
      await taskStore.createTask(data)
      ElMessage.success('任务创建成功')
    }
    dialogVisible.value = false
    await taskStore.fetchTasks(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch (error) {
    ElMessage.error(isEdit.value ? '任务更新失败' : '任务创建失败')
  } finally {
    saving.value = false
  }
}

const deleteTask = async (task) => {
  try {
    await ElMessageBox.confirm(`确定要删除任务 "${task.name}" 吗？此操作不可恢复。`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await taskStore.deleteTask(task.id)
    ElMessage.success('任务删除成功')
    await taskStore.fetchTasks(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('任务删除失败')
  }
}

const startTask = async (task) => {
  try { await taskStore.startTask(task.id); ElMessage.success('任务启动成功') } catch { ElMessage.error('任务启动失败') }
}

const stopTask = async (task) => {
  try { await taskStore.stopTask(task.id); ElMessage.success('任务停止成功') } catch { ElMessage.error('任务停止失败') }
}

const runOnce = async (task) => {
  try {
    const result = await taskStore.runOnce(task.id)
    if (result?.success) {
      ElMessage.success('执行完成')
    } else {
      ElMessage.warning('执行结束（可能失败），请查看日志')
    }
  } catch (e) {
    ElMessage.error('执行失败')
  }
}

// 分组管理对话框逻辑
const manageVisible = ref(false)
const newGroupName = ref('')
const openManageGroups = () => { newGroupName.value = ''; manageVisible.value = true }

// 新增：统计/同步/批量迁移
const stats = ref(null)
const loadingStats = ref(false)
const syncing = ref(false)
const bulkTarget = ref('')
const bulkFrom = ref('')
const bulkTo = ref('')
const bulkClear = ref('')

const statsTask = computed(() => stats.value?.tasks || null)
const statsRows = computed(() => {
  const s = statsTask.value
  if (!s) return []
  const rows = Object.entries(s.counts || {}).map(([name, count]) => ({ name, count }))
  return rows.sort((a,b) => b.count - a.count)
})

const refreshStats = async () => { try { loadingStats.value = true; const res = await configApi.groupStats(); const data = res?.data ?? res; stats.value = data; } finally { loadingStats.value = false } }
const syncGroups = async () => { try { syncing.value = true; await configApi.syncGroupsFromItems(); await loadGroups(); await refreshStats(); ElMessage.success('已同步'); } catch { ElMessage.error('同步失败') } finally { syncing.value = false } }
const assignUngrouped = async () => {
  try {
    await configApi.assignGroup({ type: 'task', allUngrouped: true, toGroup: bulkTarget.value })
    ElMessage.success('已分配未分组任务')
    await loadGroups(); await refreshStats();
    await taskStore.fetchTasks(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}
const moveFromTo = async () => {
  try {
    await configApi.assignGroup({ type: 'task', fromGroup: bulkFrom.value, toGroup: bulkTo.value })
    ElMessage.success('已迁移')
    await loadGroups(); await refreshStats();
    await taskStore.fetchTasks(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}
const clearGroup = async () => {
  try {
    await configApi.assignGroup({ type: 'task', fromGroup: bulkClear.value, clear: true })
    ElMessage.success('已清空该分组的分配')
    await loadGroups(); await refreshStats();
    await taskStore.fetchTasks(groupFilter.value ? { group: groupFilter.value } : undefined)
  } catch { ElMessage.error('操作失败') }
}

watch(manageVisible, async (v) => { if (v) { await refreshStats() } })

onMounted(async () => {
  await loadGroups()
  await taskStore.fetchTasks()
  await scriptStore.fetchScripts()
})
</script>

<style scoped>
.page-container { height: 100vh; display: flex; flex-direction: column; }
.page-content { flex: 1; padding: 24px 0; overflow: auto; }
</style>

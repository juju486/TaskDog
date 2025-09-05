<template>
  <div class="page-container">
    <TaskHeader v-model="searchText" @create="showCreateDialog" @search="handleSearch" />

    <div class="page-content">
      <TaskTable
        :tasks="taskStore.tasks"
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TaskHeader from './tasks/TaskHeader.vue'
import TaskTable from './tasks/TaskTable.vue'
import TaskDialog from './tasks/TaskDialog.vue'
import { useTaskStore } from '@/stores/task'
import { useScriptStore } from '@/stores/script'

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
  script_ids: [],
  cron_expression: '',
  status: 'inactive'
})

const handleSearch = () => {}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = { id: undefined, name: '', script_ids: [], cron_expression: '', status: 'inactive' }
  dialogVisible.value = true
}

const editTask = (task) => {
  isEdit.value = true
  const ids = Array.isArray(task?.script_ids) ? task.script_ids : (task?.script_id ? [task.script_id] : [])
  formData.value = { id: task.id, name: task.name, script_ids: ids, cron_expression: task.cron_expression, status: task.status }
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

onMounted(() => {
  taskStore.fetchTasks()
  scriptStore.fetchScripts()
})
</script>

<style scoped>
.page-container { height: 100vh; display: flex; flex-direction: column; }
.page-content { flex: 1; padding: 24px 0; overflow: auto; }
</style>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">定时任务</h1>
        <div class="header-actions">
          <el-input
            v-model="searchText"
            placeholder="搜索任务名称"
            style="width: 300px; margin-right: 12px"
            clearable
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" @click="showCreateDialog">
            <el-icon><Plus /></el-icon>
            创建任务
          </el-button>
        </div>
      </div>
    </div>
    
    <div class="page-content">
      <div class="table-container">
        <el-table
          :data="filteredTasks"
          :loading="taskStore.loading"
          empty-text="暂无数据"
          style="width: 100%"
        >
          <el-table-column prop="name" label="名称" min-width="150">
            <template #default="{ row }">
              <div class="task-name">
                <el-icon class="task-icon"><Timer /></el-icon>
                {{ row.name }}
              </div>
            </template>
          </el-table-column>
          
          <el-table-column prop="script_name" label="关联脚本" min-width="150" />
          
          <el-table-column prop="cron_expression" label="定时规则" min-width="120">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.cron_expression }}</el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusTagType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="last_run" label="最后运行时间" width="160">
            <template #default="{ row }">
              {{ row.last_run ? formatDate(row.last_run) : '未运行' }}
            </template>
          </el-table-column>
          
          <el-table-column prop="next_run" label="下次运行时间" width="160">
            <template #default="{ row }">
              {{ row.next_run ? formatDate(row.next_run) : '-' }}
            </template>
          </el-table-column>
          
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <div class="action-buttons">
                <el-button
                  v-if="row.status === 'inactive'"
                  size="small"
                  type="success"
                  @click="startTask(row)"
                  class="action-btn"
                >
                  <el-icon><VideoPlay /></el-icon>
                  启动
                </el-button>
                <el-button
                  v-else
                  size="small"
                  type="warning"
                  @click="stopTask(row)"
                  class="action-btn"
                >
                  <el-icon><VideoPause /></el-icon>
                  停止
                </el-button>
                <el-button size="small" type="primary" @click="editTask(row)" class="action-btn">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-button>
                <el-button size="small" type="danger" @click="deleteTask(row)" class="action-btn">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    
    <!-- 创建/编辑任务对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑任务' : '创建任务'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入任务名称" />
        </el-form-item>
        
        <el-form-item label="关联脚本" prop="script_id">
          <el-select
            v-model="formData.script_id"
            placeholder="请选择要执行的脚本"
            style="width: 100%"
            :loading="scriptStore.loading"
          >
            <el-option
              v-for="script in scriptStore.scripts"
              :key="script.id"
              :label="script.name"
              :value="script.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="定时规则" prop="cron_expression">
          <el-input
            v-model="formData.cron_expression"
            placeholder="例如: 0 */5 * * * *（每5分钟执行一次）"
          />
          <div class="form-tip">
            <p>Cron 表达式格式: 秒 分 时 日 月 周</p>
            <p>常用示例: 每分钟(0 * * * * *) | 每小时(0 0 * * * *) | 每天(0 0 0 * * *)</p>
          </div>
        </el-form-item>
        
        <el-form-item label="任务状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio value="active">立即启动</el-radio>
            <el-radio value="inactive">暂不启动</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask" :loading="saving">
          {{ isEdit ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Timer, VideoPlay, VideoPause, Edit, Delete } from '@element-plus/icons-vue'
import { useTaskStore } from '@/stores/task'
import { useScriptStore } from '@/stores/script'
import moment from 'moment'

const taskStore = useTaskStore()
const scriptStore = useScriptStore()

// 响应式数据
const searchText = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref()

const formData = ref({
  name: '',
  script_id: null,
  cron_expression: '',
  status: 'inactive'
})

const rules = {
  name: [
    { required: true, message: '请输入任务名称', trigger: 'blur' }
  ],
  script_id: [
    { required: true, message: '请选择关联脚本', trigger: 'change' }
  ],
  cron_expression: [
    { required: true, message: '请输入定时规则', trigger: 'blur' }
  ]
}

// 计算属性
const filteredTasks = computed(() => {
  if (!searchText.value) return taskStore.tasks
  const search = searchText.value.toLowerCase()
  return taskStore.tasks.filter(task => 
    task.name.toLowerCase().includes(search)
  )
})

// 方法
const handleSearch = () => {
  // 搜索逻辑已在 computed 中处理
}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = {
    name: '',
    script_id: null,
    cron_expression: '',
    status: 'inactive'
  }
  dialogVisible.value = true
}

const editTask = (task) => {
  isEdit.value = true
  formData.value = { ...task }
  dialogVisible.value = true
}

const saveTask = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    saving.value = true
    
    if (isEdit.value) {
      await taskStore.updateTask(formData.value.id, formData.value)
      ElMessage.success('任务更新成功')
    } else {
      await taskStore.createTask(formData.value)
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
    await ElMessageBox.confirm(
      `确定要删除任务 "${task.name}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    await taskStore.deleteTask(task.id)
    ElMessage.success('任务删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('任务删除失败')
    }
  }
}

const startTask = async (task) => {
  try {
    await taskStore.startTask(task.id)
    ElMessage.success('任务启动成功')
  } catch (error) {
    ElMessage.error('任务启动失败')
  }
}

const stopTask = async (task) => {
  try {
    await taskStore.stopTask(task.id)
    ElMessage.success('任务停止成功')
  } catch (error) {
    ElMessage.error('任务停止失败')
  }
}

const getStatusTagType = (status) => {
  return status === 'active' ? 'success' : 'info'
}

const getStatusText = (status) => {
  return status === 'active' ? '运行中' : '已停止'
}

const formatDate = (dateString) => {
  return moment(dateString).format('YYYY-MM-DD HH:mm')
}

// 生命周期
onMounted(() => {
  taskStore.fetchTasks()
  scriptStore.fetchScripts()
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
}

.page-content {
  flex: 1;
  padding: 24px 0;
  overflow: auto;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.task-name {
  display: flex;
  align-items: center;
}

.task-icon {
  margin-right: 8px;
  color: #409EFF;
}

.action-buttons {
  display: flex;
  gap: 6px;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: nowrap;
}

.action-btn {
  min-width: 56px;
  margin: 0;
  font-size: 12px;
  padding: 6px 8px;
}

.form-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.form-tip p {
  margin: 0;
}
</style>

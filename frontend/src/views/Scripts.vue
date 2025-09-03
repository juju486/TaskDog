<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">脚本管理</h1>
        <div class="header-actions">
          <el-input
            v-model="searchText"
            placeholder="搜索脚本名称或描述"
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
            创建脚本
          </el-button>
        </div>
      </div>
    </div>
    
    <!-- 页面内容 -->
    <div class="page-content">
      <div class="table-container">
        <el-table
          :data="filteredScripts"
          :loading="scriptStore.loading"
          empty-text="暂无数据"
          style="width: 100%"
        >
          <el-table-column prop="name" label="名称" min-width="150">
            <template #default="{ row }">
              <div class="script-name">
                <el-icon class="script-icon"><Document /></el-icon>
                {{ row.name }}
              </div>
            </template>
          </el-table-column>
          
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          
          <el-table-column prop="language" label="语言" width="120">
            <template #default="{ row }">
              <el-tag :type="getLanguageTagType(row.language)" size="default" class="language-tag">
                {{ getLanguageDisplay(row.language) }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="created_at" label="创建时间" width="160">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <div class="action-buttons">
                <el-button size="small" @click="testScript(row)" class="action-btn">
                  <el-icon><VideoPlay /></el-icon>
                  测试
                </el-button>
                <el-button size="small" type="primary" @click="editScript(row)" class="action-btn">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-button>
                <el-button size="small" type="danger" @click="deleteScript(row)" class="action-btn">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    
    <!-- 创建/编辑脚本对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑脚本' : '创建脚本'"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="脚本名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入脚本名称" />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="请输入脚本描述"
          />
        </el-form-item>
        
        <el-form-item label="脚本语言" prop="language">
          <el-select v-model="formData.language" placeholder="请选择脚本语言">
            <el-option label="Shell" value="shell" />
            <el-option label="PowerShell" value="powershell" />
            <el-option label="Python" value="python" />
            <el-option label="Node.js" value="node" />
            <el-option label="Bash" value="bash" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="脚本内容" prop="content">
          <el-input
            v-model="formData.content"
            type="textarea"
            :rows="10"
            placeholder="请输入脚本内容"
            style="font-family: 'Courier New', monospace"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScript" :loading="saving">
          {{ isEdit ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 测试结果对话框 -->
    <el-dialog v-model="testDialogVisible" title="脚本测试结果" width="700px">
      <div class="test-result">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="退出代码">
            <el-tag :type="testResult?.exitCode === 0 ? 'success' : 'danger'">
              {{ testResult?.exitCode }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="testResult?.exitCode === 0 ? 'success' : 'danger'">
              {{ testResult?.exitCode === 0 ? '成功' : '失败' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        
        <div v-if="testResult?.stdout" class="output-section">
          <h4>标准输出:</h4>
          <pre class="output-content">{{ testResult.stdout }}</pre>
        </div>
        
        <div v-if="testResult?.stderr" class="output-section">
          <h4>错误输出:</h4>
          <pre class="output-content error">{{ testResult.stderr }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Document, VideoPlay, Edit, Delete } from '@element-plus/icons-vue'
import { useScriptStore } from '@/stores/script'
import moment from 'moment'

const scriptStore = useScriptStore()

// 响应式数据
const searchText = ref('')
const dialogVisible = ref(false)
const testDialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref()
const testResult = ref(null)

const formData = ref({
  name: '',
  description: '',
  language: 'shell',
  content: ''
})

const rules = {
  name: [
    { required: true, message: '请输入脚本名称', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入脚本内容', trigger: 'blur' }
  ],
  language: [
    { required: true, message: '请选择脚本语言', trigger: 'change' }
  ]
}

// 计算属性
const filteredScripts = computed(() => {
  if (!searchText.value) return scriptStore.scripts
  const search = searchText.value.toLowerCase()
  return scriptStore.scripts.filter(script => 
    script.name.toLowerCase().includes(search) ||
    (script.description && script.description.toLowerCase().includes(search))
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
    description: '',
    language: 'shell',
    content: ''
  }
  dialogVisible.value = true
}

const editScript = (script) => {
  isEdit.value = true
  formData.value = { ...script }
  dialogVisible.value = true
}

const saveScript = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    saving.value = true
    
    if (isEdit.value) {
      await scriptStore.updateScript(formData.value.id, formData.value)
      ElMessage.success('脚本更新成功')
    } else {
      await scriptStore.createScript(formData.value)
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
    await ElMessageBox.confirm(
      `确定要删除脚本 "${script.name}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    await scriptStore.deleteScript(script.id)
    ElMessage.success('脚本删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('脚本删除失败')
    }
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

const getLanguageTagType = (language) => {
  const typeMap = {
    shell: 'primary',
    powershell: 'success',
    python: 'warning',
    node: 'info',
    bash: 'primary'
  }
  return typeMap[language] || 'default'
}

const getLanguageDisplay = (language) => {
  const langMap = {
    'shell': 'Shell',
    'powershell': 'PowerShell', 
    'python': 'Python',
    'node': 'Node.js',
    'bash': 'Bash',
    'javascript': 'JavaScript',
    'batch': 'Batch',
    'cmd': 'CMD'
  }
  return langMap[language] || language
}

const formatDate = (dateString) => {
  return moment(dateString).format('YYYY-MM-DD HH:mm')
}

// 生命周期
onMounted(() => {
  scriptStore.fetchScripts()
})
</script>

<style scoped>
.page-container {
  height: 100%;
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



.script-name {
  display: flex;
  align-items: center;
}

.script-icon {
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

.test-result {
  padding: 16px 0;
}

.output-section {
  margin-top: 16px;
}

.output-section h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 14px;
}

.output-content {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.output-content.error {
  background: #fef0f0;
  border-color: #fbc4c4;
  color: #f56c6c;
}


</style>


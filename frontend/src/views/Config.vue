<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">配置管理</h1>
        <div class="header-actions">
          <el-button type="primary" @click="showCreateDialog">
            <el-icon><Plus /></el-icon>
            添加配置
          </el-button>
          <el-button type="success" @click="batchSave" :loading="batchSaving">
            <el-icon><Check /></el-icon>
            批量保存
          </el-button>
        </div>
      </div>
    </div>
    
    <div class="page-content">
      <div class="config-tabs">
        <el-tabs v-model="activeCategory" @tab-click="handleCategoryChange">
          <el-tab-pane
            v-for="category in categories"
            :key="category.value"
            :label="category.label"
            :name="category.value"
          >
            <div class="config-list">
              <div
                v-for="config in getCategoryConfigs(category.value)"
                :key="config.key"
                class="config-item"
              >
                <div class="config-header">
                  <div class="config-key">
                    <el-icon><Key /></el-icon>
                    {{ config.key }}
                  </div>
                  <div class="config-actions">
                    <el-button size="small" type="primary" @click="editConfig(config)" class="action-btn">
                      <el-icon><Edit /></el-icon>
                      编辑
                    </el-button>
                    <el-button size="small" type="danger" @click="deleteConfig(config)" class="action-btn">
                      <el-icon><Delete /></el-icon>
                      删除
                    </el-button>
                  </div>
                </div>
                
                <div class="config-content">
                  <div class="config-description">{{ config.description || '无描述' }}</div>
                  <div class="config-value">
                    <el-input
                      v-model="config.value"
                      type="textarea"
                      :rows="2"
                      placeholder="配置值"
                      @change="markAsChanged(config.key)"
                    />
                  </div>
                </div>
              </div>
              
              <div v-if="getCategoryConfigs(category.value).length === 0" class="empty-state">
                <el-empty description="该分类下暂无配置项" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
    
    <!-- 创建/编辑配置对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑配置' : '添加配置'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="配置键" prop="key">
          <el-input
            v-model="formData.key"
            placeholder="请输入配置键名"
            :disabled="isEdit"
          />
        </el-form-item>
        
        <el-form-item label="配置值" prop="value">
          <el-input
            v-model="formData.value"
            type="textarea"
            :rows="3"
            placeholder="请输入配置值"
          />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="请输入配置描述"
          />
        </el-form-item>
        
        <el-form-item label="分类" prop="category">
          <el-select v-model="formData.category" placeholder="请选择分类">
            <el-option
              v-for="category in categories"
              :key="category.value"
              :label="category.label"
              :value="category.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="saving">
          {{ isEdit ? '更新' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Check, Key, Edit, Delete } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'

// 响应式数据
const configs = ref([])
const activeCategory = ref('general')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const batchSaving = ref(false)
const formRef = ref()
const changedKeys = ref(new Set())

const categories = ref([
  { label: '通用配置', value: 'general' },
  { label: '系统配置', value: 'system' },
  { label: '任务配置', value: 'task' },
  { label: '邮件配置', value: 'email' },
  { label: '安全配置', value: 'security' }
])

const formData = ref({
  key: '',
  value: '',
  description: '',
  category: 'general'
})

const rules = {
  key: [
    { required: true, message: '请输入配置键名', trigger: 'blur' }
  ],
  category: [
    { required: true, message: '请选择分类', trigger: 'change' }
  ]
}

// 计算属性
const getCategoryConfigs = computed(() => (category) => {
  return configs.value.filter(config => config.category === category)
})

// 方法
const fetchConfigs = async (category = null) => {
  try {
    const response = await configApi.getAll(category)
    configs.value = response.data || []
  } catch (error) {
    ElMessage.error('获取配置失败')
  }
}

const handleCategoryChange = () => {
  // 可以在这里处理分类切换逻辑
}

const showCreateDialog = () => {
  isEdit.value = false
  formData.value = {
    key: '',
    value: '',
    description: '',
    category: activeCategory.value
  }
  dialogVisible.value = true
}

const editConfig = (config) => {
  isEdit.value = true
  formData.value = { ...config }
  dialogVisible.value = true
}

const saveConfig = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    saving.value = true
    
    await configApi.save(formData.value)
    ElMessage.success(isEdit.value ? '配置更新成功' : '配置添加成功')
    
    dialogVisible.value = false
    await fetchConfigs()
  } catch (error) {
    ElMessage.error(isEdit.value ? '配置更新失败' : '配置添加失败')
  } finally {
    saving.value = false
  }
}

const deleteConfig = async (config) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除配置 "${config.key}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    await configApi.delete(config.key)
    ElMessage.success('配置删除成功')
    await fetchConfigs()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('配置删除失败')
    }
  }
}

const markAsChanged = (key) => {
  changedKeys.value.add(key)
}

const batchSave = async () => {
  if (changedKeys.value.size === 0) {
    ElMessage.info('没有需要保存的更改')
    return
  }
  
  try {
    batchSaving.value = true
    
    const changedConfigs = configs.value.filter(config => 
      changedKeys.value.has(config.key)
    )
    
    await configApi.batchUpdate(changedConfigs)
    ElMessage.success(`成功保存 ${changedConfigs.length} 项配置`)
    
    changedKeys.value.clear()
  } catch (error) {
    ElMessage.error('批量保存失败')
  } finally {
    batchSaving.value = false
  }
}

// 生命周期
onMounted(() => {
  fetchConfigs()
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

.config-tabs {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.config-list {
  display: grid;
  gap: 16px;
}

.config-item {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  background: #fafbfc;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.config-key {
  display: flex;
  align-items: center;
  font-weight: 600;
  color: #303133;
}

.config-key .el-icon {
  margin-right: 8px;
  color: #409EFF;
}

.config-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-btn {
  min-width: 56px;
  font-size: 12px;
  padding: 6px 8px;
}

.config-content {
  display: grid;
  gap: 8px;
}

.config-description {
  font-size: 14px;
  color: #606266;
}

.config-value {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 40px;
}
</style>

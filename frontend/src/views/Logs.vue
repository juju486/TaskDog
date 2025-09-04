<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">日志管理</h1>
        <div class="header-actions">
          <el-button @click="refreshLogs">
            <el-icon>
              <Refresh />
            </el-icon>
            刷新
          </el-button>
          <el-button type="warning" @click="showCleanupDialog">
            <el-icon>
              <Delete />
            </el-icon>
            清理日志
          </el-button>
        </div>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-section">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-number">{{ stats.total || 0 }}</div>
              <div class="stat-label">总日志数</div>
            </div>
            <el-icon class="stat-icon">
              <Document />
            </el-icon>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card success">
            <div class="stat-content">
              <div class="stat-number">{{ stats.successes || 0 }}</div>
              <div class="stat-label">成功执行</div>
            </div>
            <el-icon class="stat-icon">
              <SuccessFilled />
            </el-icon>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card error">
            <div class="stat-content">
              <div class="stat-number">{{ stats.errors || 0 }}</div>
              <div class="stat-label">执行失败</div>
            </div>
            <el-icon class="stat-icon">
              <CircleCloseFilled />
            </el-icon>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card info">
            <div class="stat-content">
              <div class="stat-number">{{ stats.info || 0 }}</div>
              <div class="stat-label">信息日志</div>
            </div>
            <el-icon class="stat-icon">
              <InfoFilled />
            </el-icon>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div class="page-content">
      <!-- 筛选区域 -->
      <div class="filter-section">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-select v-model="filters.type" placeholder="日志类型" clearable @change="applyFilters">
              <el-option label="全部" value="" />
              <el-option label="信息" value="info" />
              <el-option label="成功" value="success" />
              <el-option label="错误" value="error" />
            </el-select>
          </el-col>
          <el-col :span="8">
            <el-date-picker v-model="filters.dateRange" type="datetimerange" range-separator="至"
              start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss" @change="applyFilters" />
          </el-col>
          <el-col :span="6">
            <el-input v-model="filters.keyword" placeholder="搜索日志内容" clearable @input="debouncedSearch">
              <template #prefix>
                <el-icon>
                  <Search />
                </el-icon>
              </template>
            </el-input>
          </el-col>
        </el-row>
      </div>

      <!-- 日志表格 -->
      <div class="table-container">
        <el-table :data="logs" :loading="loading" empty-text="暂无日志数据" style="width: 100%" @row-click="showLogDetail">
          <el-table-column prop="type" label="类型" width="80">
            <template #default="{ row }">
              <el-tag :type="getLogTypeTagType(row.type)" size="small">
                {{ getLogTypeText(row.type) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="task_name" label="任务名称" min-width="120" show-overflow-tooltip />

          <el-table-column prop="script_name" label="脚本名称" min-width="120" show-overflow-tooltip />

          <el-table-column prop="message" label="消息" min-width="200" show-overflow-tooltip />

          <el-table-column prop="created_at" label="时间" width="160">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click.stop="showLogDetail(row)" class="action-btn">
                <el-icon>
                  <View />
                </el-icon>
                详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-container">
          <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
            :page-sizes="[20, 50, 100, 200]" :total="pagination.total" layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange" @current-change="handleCurrentChange" />
        </div>
      </div>
    </div>

    <!-- 日志详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="日志详情" width="700px">
      <div v-if="currentLog" class="log-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="类型">
            <el-tag :type="getLogTypeTagType(currentLog.type)">
              {{ getLogTypeText(currentLog.type) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="时间">
            {{ formatDate(currentLog.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="任务名称">
            {{ currentLog.task_name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="脚本名称">
            {{ currentLog.script_name || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="log-section">
          <h4>消息内容</h4>
          <div class="log-content">{{ currentLog.message }}</div>
        </div>

        <div v-if="currentLog.details" class="log-section">
          <h4>详细信息</h4>
          <pre class="log-details">{{ formatDetails(currentLog.details) }}</pre>
        </div>
      </div>
    </el-dialog>

    <!-- 清理日志对话框 -->
    <el-dialog v-model="cleanupDialogVisible" title="清理日志" width="400px">
      <el-form :model="cleanupForm" label-width="100px">
        <el-form-item label="保留天数">
          <el-input-number v-model="cleanupForm.days" :min="1" :max="365" style="width: 100%" />
          <div class="form-tip">清理指定天数之前的日志</div>
        </el-form-item>

        <el-form-item label="日志类型">
          <el-select v-model="cleanupForm.type" placeholder="选择要清理的日志类型">
            <el-option label="全部类型" value="" />
            <el-option label="信息日志" value="info" />
            <el-option label="成功日志" value="success" />
            <el-option label="错误日志" value="error" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="cleanupDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="cleanupLogs" :loading="cleanupLoading">
          确认清理
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Refresh, Delete, Document, SuccessFilled, CircleCloseFilled,
  InfoFilled, Search, View
} from '@element-plus/icons-vue';
import { logApi } from '@/api/modules';
import moment from 'moment';

// 简单的防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// 响应式数据
const logs = ref([]);
const stats = ref({});
const loading = ref(false);
const detailDialogVisible = ref(false);
const cleanupDialogVisible = ref(false);
const currentLog = ref(null);
const cleanupLoading = ref(false);

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0
});

const filters = ref({
  type: '',
  dateRange: null,
  keyword: ''
});

const cleanupForm = ref({
  days: 30,
  type: ''
});

// 方法
const fetchLogs = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      type: filters.value.type,
      start_date: filters.value.dateRange?.[0],
      end_date: filters.value.dateRange?.[1]
    };

    const response = await logApi.getAll(params);
    logs.value = response.data.logs || [];
    pagination.value.total = response.data.pagination.total;
  } catch (error) {
    ElMessage.error('获取日志失败');
  } finally {
    loading.value = false;
  }
};

const fetchStats = async () => {
  try {
    const response = await logApi.getStats(7);
    stats.value = response.data;
  } catch (error) {
    console.error('获取统计信息失败:', error);
  }
};

const refreshLogs = () => {
  fetchLogs();
  fetchStats();
};

const applyFilters = () => {
  pagination.value.page = 1;
  fetchLogs();
};

const debouncedSearch = debounce(() => {
  applyFilters();
}, 500);

const handleSizeChange = (size) => {
  pagination.value.limit = size;
  pagination.value.page = 1;
  fetchLogs();
};

const handleCurrentChange = (page) => {
  pagination.value.page = page;
  fetchLogs();
};

const showLogDetail = (log) => {
  currentLog.value = log;
  detailDialogVisible.value = true;
};

const showCleanupDialog = () => {
  cleanupDialogVisible.value = true;
};

const cleanupLogs = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要清理 ${cleanupForm.value.days} 天前的日志吗？此操作不可恢复。`,
      '确认清理',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    cleanupLoading.value = true;
    const response = await logApi.cleanup({
      days: cleanupForm.value.days,
      type: cleanupForm.value.type
    });

    ElMessage.success(response.message);
    cleanupDialogVisible.value = false;
    refreshLogs();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清理日志失败');
    }
  } finally {
    cleanupLoading.value = false;
  }
};

const getLogTypeTagType = (type) => {
  const typeMap = {
    info: 'info',
    success: 'success',
    error: 'danger'
  };
  return typeMap[type] || 'default';
};

const getLogTypeText = (type) => {
  const textMap = {
    info: '信息',
    success: '成功',
    error: '错误'
  };
  return textMap[type] || type;
};

const formatDate = (dateString) => {
  return moment(dateString).format('YYYY-MM-DD HH:mm:ss');
};

const formatDetails = (details) => {
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
};

// 生命周期
onMounted(() => {
  refreshLogs();
});

// 监听筛选器变化
watch(() => filters.value.keyword, debouncedSearch);
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

.stats-section {
  padding: 24px 0 0;
  background: #f5f7fa;
}

.stat-card {
  position: relative;
  overflow: hidden;
}

.stat-card.success {
  border-left: 4px solid #67c23a;
}

.stat-card.error {
  border-left: 4px solid #f56c6c;
}

.stat-card.info {
  border-left: 4px solid #409eff;
}

.stat-content {
  position: relative;
  z-index: 2;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.stat-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 32px;
  color: rgba(64, 158, 255, 0.2);
  z-index: 1;
}

.page-content {
  flex: 1;
  padding: 24px 0;
  overflow: auto;
}

.filter-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.action-btn {
  min-width: 56px;
  font-size: 12px;
  padding: 6px 8px;
}

.pagination-container {
  padding: 20px;
  text-align: right;
  border-top: 1px solid #e4e7ed;
}

.log-detail {
  padding: 16px 0;
}

.log-section {
  margin-top: 20px;
}

.log-section h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 14px;
}

.log-content {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.filter-section>>>.el-date-editor {
  width: 100%;
}

.log-details {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>

<template>
  <div class="table-container">
    <el-table
      :data="filteredTasks"
      :loading="loading"
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
              @click="$emit('start', row)"
              class="action-btn"
            >
              <el-icon><VideoPlay /></el-icon>
              启动
            </el-button>
            <el-button
              v-else
              size="small"
              type="warning"
              @click="$emit('stop', row)"
              class="action-btn"
            >
              <el-icon><VideoPause /></el-icon>
              停止
            </el-button>
            <el-button size="small" type="primary" @click="$emit('edit', row)" class="action-btn">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button size="small" type="danger" @click="$emit('delete', row)" class="action-btn">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Timer, VideoPlay, VideoPause, Edit, Delete } from '@element-plus/icons-vue'
import moment from 'moment'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searchText: { type: String, default: '' }
})

const emit = defineEmits(['start', 'stop', 'edit', 'delete'])

const filteredTasks = computed(() => {
  if (!props.searchText) return props.tasks
  const search = props.searchText.toLowerCase()
  return props.tasks.filter(task => task.name?.toLowerCase().includes(search))
})

const getStatusTagType = (status) => (status === 'active' ? 'success' : 'info')
const getStatusText = (status) => (status === 'active' ? '运行中' : '已停止')
const formatDate = (dateString) => moment(dateString).format('YYYY-MM-DD HH:mm')
</script>

<style scoped>
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
.task-name { display: flex; align-items: center; }
.task-icon { margin-right: 8px; color: #409EFF; }
.action-buttons { display: flex; gap: 6px; justify-content: flex-start; align-items: center; flex-wrap: nowrap; }
.action-btn { min-width: 56px; margin: 0; font-size: 12px; padding: 6px 8px; }
</style>

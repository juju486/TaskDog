<template>
  <div class="table-container">
    <el-table :data="filtered" :loading="loading" empty-text="暂无数据" style="width: 100%">
      <el-table-column prop="name" label="名称" min-width="150">
        <template #default="{ row }">
          <div class="script-name">
            <el-icon class="script-icon">
              <Document />
            </el-icon>
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

      <!-- 新增分组列 -->
      <el-table-column prop="group" label="分组" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.group" size="small">{{ row.group }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="created_at" label="创建时间" width="160">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>

      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button size="small" type="primary" @click="$emit('test', row)" class="action-btn">
              <el-icon>
                <VideoPlay />
              </el-icon>
              运行
            </el-button>
            <el-button size="small" type="primary" @click="$emit('edit', row)" class="action-btn">
              <el-icon>
                <Edit />
              </el-icon>
              编辑
            </el-button>
            <el-button size="small" type="danger" @click="$emit('delete', row)" class="action-btn">
              <el-icon>
                <Delete />
              </el-icon>
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Document, VideoPlay, Edit, Delete } from '@element-plus/icons-vue';
import moment from 'moment';

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searchText: { type: String, default: '' }
});

const filtered = computed(() => {
  if (!props.searchText) return props.data;
  const search = props.searchText.toLowerCase();
  return props.data.filter(s =>
    s.name?.toLowerCase().includes(search) || s.description?.toLowerCase().includes(search)
  );
});

const getLanguageTagType = (language) => {
  const key = (language || '').toLowerCase();
  const typeMap = { shell: 'primary', bash: 'primary', powershell: 'success', python: 'warning', node: 'info', javascript: 'info', batch: 'primary', cmd: 'primary' };
  return typeMap[key] ?? undefined;
};
const getLanguageDisplay = (language) => ({ shell: 'Shell', powershell: 'PowerShell', python: 'Python', node: 'Node.js', bash: 'Bash', javascript: 'JavaScript', batch: 'Batch', cmd: 'CMD' }[language] || language);
const formatDate = (d) => moment(d).format('YYYY-MM-DD HH:mm');
</script>

<style scoped>
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
</style>

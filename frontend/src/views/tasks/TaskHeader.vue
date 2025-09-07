<template>
  <div class="page-header">
    <div class="header-content">
      <h1 class="page-title">定时任务</h1>
      <div class="header-actions">
        <el-input
          v-model="search"
          placeholder="搜索任务名称"
          style="width: 300px; margin-right: 12px"
          clearable
          @input="$emit('search', search)"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select v-model="groupLocal" placeholder="按分组筛选" clearable filterable style="width: 180px; margin-right: 8px">
          <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
        </el-select>
        <el-button @click="$emit('manage-groups')" style="margin-right: 8px">管理分组</el-button>

        <el-button type="primary" @click="$emit('create')">
          <el-icon><Plus /></el-icon>
          创建任务
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Search, Plus } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  group: { type: String, default: '' },
  groups: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'update:group', 'create', 'search', 'manage-groups'])

const search = ref('')
watch(() => props.modelValue, v => search.value = v, { immediate: true })
watch(search, v => emit('update:modelValue', v))

const groupLocal = ref('')
watch(() => props.group, v => groupLocal.value = v || '', { immediate: true })
watch(groupLocal, v => emit('update:group', v))
</script>

<style scoped>
.page-header { background: white; border-bottom: 1px solid #e4e7ed; padding: 0; }
.header-content { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; }
.page-title { font-size: 20px; font-weight: 600; color: #303133; margin: 0; }
.header-actions { display: flex; align-items: center; }
</style>

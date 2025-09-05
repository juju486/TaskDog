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
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'create', 'search'])

const search = ref('')
watch(() => props.modelValue, v => search.value = v, { immediate: true })
watch(search, v => emit('update:modelValue', v))
</script>

<style scoped>
.page-header { background: white; border-bottom: 1px solid #e4e7ed; padding: 0; }
.header-content { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; }
.page-title { font-size: 20px; font-weight: 600; color: #303133; margin: 0; }
.header-actions { display: flex; align-items: center; }
</style>

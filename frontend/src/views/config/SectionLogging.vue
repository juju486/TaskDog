<template>
  <el-form :model="model.logging" label-width="160px">
    <el-form-item label="日志级别">
      <el-select v-model="model.logging.level">
        <el-option label="error" value="error" />
        <el-option label="info" value="info" />
        <el-option label="debug" value="debug" />
      </el-select>
    </el-form-item>
    <el-form-item label="保留天数">
      <el-input-number v-model="model.logging.retainDays" :min="1" />
    </el-form-item>
    <el-form-item label="输出截断 (KB)">
      <el-input-number v-model="model.logging.captureMaxKB" :min="1" />
    </el-form-item>
    <el-form-item label="敏感键(逗号分隔)">
      <el-input v-model="redactKeysText" @change="onRedactKeysChange" placeholder="token,password" />
    </el-form-item>
    <el-form-item label="轮转大小 (MB)">
      <el-input-number v-model="model.logging.rotate.maxSizeMB" :min="1" />
    </el-form-item>
    <el-form-item label="轮转文件数">
      <el-input-number v-model="model.logging.rotate.maxFiles" :min="1" />
    </el-form-item>
  </el-form>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ model: { type: Object, required: true } })
const redactKeysText = computed({
  get: () => (props.model.logging.redactKeys || []).join(','),
  set: (v) => { props.model.logging.redactKeys = (v || '').split(',').map(s => s.trim()).filter(Boolean) }
})
const onRedactKeysChange = () => {}
</script>

<template>
  <el-form :model="model.backup" label-width="140px">
    <el-form-item label="启用"><el-switch v-model="model.backup.enabled" /></el-form-item>
    <el-form-item label="Cron"><el-input v-model="model.backup.cron" placeholder="0 3 * * *" /></el-form-item>
    <el-form-item label="目标目录"><el-input v-model="model.backup.targetDir" placeholder="backup" /></el-form-item>
  </el-form>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
</script>

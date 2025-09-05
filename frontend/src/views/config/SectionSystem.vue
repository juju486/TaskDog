<template>
  <el-form :model="model.system" label-width="140px">
    <el-form-item label="时区">
      <el-input v-model="model.system.timezone" placeholder="Asia/Shanghai" />
    </el-form-item>
    <el-form-item label="时间格式">
      <el-input v-model="model.system.datetimeFormat" placeholder="YYYY-MM-DD HH:mm:ss" />
    </el-form-item>
    <el-form-item label="语言">
      <el-input v-model="model.system.locale" placeholder="zh-CN" />
    </el-form-item>
    <el-form-item label="后端地址">
      <el-input v-model="model.system.backendUrl" placeholder="http://localhost:3001" />
    </el-form-item>
    <el-form-item label="脚本根目录">
      <el-input v-model="model.system.scriptsRoot" placeholder="backend/scripts" />
    </el-form-item>
    <el-form-item label="临时目录">
      <el-input v-model="model.system.tempDir" placeholder="backend/.tmp" />
    </el-form-item>
  </el-form>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
</script>

<template>
  <el-form :model="model.ui" label-width="140px">
    <el-form-item label="主题">
      <el-select v-model="model.ui.theme">
        <el-option label="明亮" value="light" />
        <el-option label="暗色" value="dark" />
      </el-select>
    </el-form-item>
    <el-form-item label="Monaco 主题">
      <el-select v-model="model.ui.monacoTheme">
        <el-option label="vs" value="vs" />
        <el-option label="vs-dark" value="vs-dark" />
      </el-select>
    </el-form-item>
    <el-form-item label="表格页大小"><el-input-number v-model="model.ui.pageSize" :min="5" /></el-form-item>
    <el-form-item label="编辑器换行"><el-switch v-model="model.ui.editorWordWrap" /></el-form-item>
    <el-form-item label="Tab 宽度"><el-input-number v-model="model.ui.tabSize" :min="2" /></el-form-item>
  </el-form>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
</script>

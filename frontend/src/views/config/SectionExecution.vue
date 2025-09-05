<template>
  <el-form :model="model.execution" label-width="160px">
    <el-form-item label="默认超时 (ms)">
      <el-input-number v-model="model.execution.defaultTimeoutMs" :min="1000" />
    </el-form-item>
    <el-form-item label="最大并发">
      <el-input-number v-model="model.execution.maxConcurrent" :min="1" />
    </el-form-item>
    <el-form-item label="队列容量">
      <el-input-number v-model="model.execution.queueSize" :min="0" />
    </el-form-item>
    <el-form-item label="工作目录策略">
      <el-select v-model="model.execution.workingDirPolicy">
        <el-option label="脚本目录" value="scriptDir" />
        <el-option label="临时目录" value="tempDir" />
      </el-select>
    </el-form-item>
    <el-form-item label="允许语言">
      <el-select v-model="model.execution.allowedLanguages" multiple style="width: 100%">
        <el-option v-for="lang in languageOptions" :key="lang" :label="lang" :value="lang" />
      </el-select>
    </el-form-item>
    <el-form-item label="上传大小上限 (KB)">
      <el-input-number v-model="model.execution.maxUploadKB" :min="1" />
    </el-form-item>
    <el-form-item label="路径隔离">
      <el-switch v-model="model.execution.pathIsolation" />
    </el-form-item>

    <div class="subsection-title">解释器</div>
    <div class="interp-grid">
      <div v-for="(interp, key) in model.execution.interpreters" :key="key" class="interp-item">
        <div class="interp-head">
          <strong>{{ key }}</strong>
          <el-switch v-model="interp.enabled" />
        </div>
        <el-input v-model="interp.path" placeholder="可执行文件路径，如 node/python/powershell.exe" />
      </div>
    </div>
  </el-form>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
const languageOptions = ['powershell','cmd','batch','python','node','javascript','shell','bash']
</script>

<style scoped>
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.interp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.interp-item { border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; background: #fafbfc; }
.interp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
</style>

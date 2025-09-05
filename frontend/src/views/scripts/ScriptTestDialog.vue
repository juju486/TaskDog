<template>
  <el-dialog v-model="visible" title="脚本测试结果" width="700px">
    <div class="test-result">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="退出代码">
          <el-tag :type="result?.exitCode === 0 ? 'success' : 'danger'">{{ result?.exitCode }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="执行状态">
          <el-tag :type="result?.exitCode === 0 ? 'success' : 'danger'">{{ result?.exitCode === 0 ? '成功' : '失败' }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="result?.stdout" class="output-section">
        <h4>标准输出:</h4>
        <pre class="output-content">{{ result.stdout }}</pre>
      </div>

      <div v-if="result?.stderr" class="output-section">
        <h4>错误输出:</h4>
        <pre class="output-content error">{{ result.stderr }}</pre>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ modelValue: { type: Boolean, default: false }, result: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const result = ref(null)

watch(() => props.modelValue, v => visible.value = v)
watch(() => props.result, v => result.value = v, { immediate: true })
watch(visible, v => emit('update:modelValue', v))
</script>

<style scoped>
.test-result { padding: 16px 0; }
.output-section { margin-top: 16px; }
.output-section h4 { margin: 0 0 8px 0; color: #303133; font-size: 14px; }
.output-content { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 12px; margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
.output-content.error { background: #fef0f0; border-color: #fbc4c4; color: #f56c6c; }
</style>

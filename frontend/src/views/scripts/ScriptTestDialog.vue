<template>
  <el-dialog v-model="visible" title="脚本测试" width="760px">
    <div class="test-panel">
      <el-descriptions :column="2" border class="meta" v-if="script">
        <el-descriptions-item label="脚本名称">{{ script.name }}</el-descriptions-item>
        <el-descriptions-item label="语言">{{ script.language }}</el-descriptions-item>
      </el-descriptions>

      <div class="params-section">
        <div class="section-title">临时参数（JSON，可覆盖默认参数）</div>
        <div class="toolbar">
          <span class="tip">留空等同于 {}</span>
          <div class="spacer" />
          <el-button size="small" @click="formatParams">格式化</el-button>
          <el-button size="small" @click="resetToDefault">重置为默认</el-button>
        </div>
        <el-input
          v-model="paramsText"
          type="textarea"
          :rows="8"
          placeholder='例如: {"url":"https://example.com","retries":1}'
          @blur="validateParams"
        />
        <div v-if="paramsError" class="error-tip">{{ paramsError }}</div>
      </div>

      <div v-if="result" class="output-wrapper">
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
    </div>

    <template #footer>
      <el-button @click="visible = false" :disabled="running">关闭</el-button>
      <el-button type="primary" @click="runTest" :loading="running" :disabled="!script || !!paramsError">运行测试</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useScriptStore } from '@/stores/script'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  script: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const scriptStore = useScriptStore()

const visible = ref(false)
const script = ref(null)
const paramsText = ref('')
const paramsError = ref('')
const running = ref(false)
const result = ref(null)

const toPretty = (obj) => {
  try { return JSON.stringify(obj ?? {}, null, 2) } catch { return '' }
}

const loadFromScript = (s) => {
  if (!s) { paramsText.value = ''; paramsError.value = ''; result.value = null; return }
  paramsText.value = toPretty(s.default_params || {})
  paramsError.value = ''
  result.value = null
}

const validateParams = () => {
  if (!paramsText.value || !paramsText.value.trim()) { paramsError.value = ''; return true }
  try {
    const v = JSON.parse(paramsText.value)
    if (v && typeof v === 'object') { paramsError.value = ''; return true }
    paramsError.value = '必须为 JSON 对象'
    return false
  } catch (e) {
    paramsError.value = 'JSON 解析失败：' + (e?.message || '')
    return false
  }
}

const formatParams = () => {
  try {
    const v = paramsText.value && paramsText.value.trim() ? JSON.parse(paramsText.value) : {}
    paramsText.value = JSON.stringify(v, null, 2)
    paramsError.value = ''
  } catch {
    ElMessage.error('无法格式化：JSON 无效')
  }
}

const resetToDefault = () => {
  if (script.value) paramsText.value = toPretty(script.value.default_params || {})
  paramsError.value = ''
}

const runTest = async () => {
  if (!script.value) return
  if (!validateParams()) return
  running.value = true
  try {
    const payload = paramsText.value && paramsText.value.trim() ? JSON.parse(paramsText.value) : {}
    const r = await scriptStore.testScript(script.value.id, payload)
    result.value = r
    if (r?.exitCode === 0) ElMessage.success('测试成功')
    else ElMessage.warning('测试结束（可能失败），请查看输出')
  } catch (e) {
    ElMessage.error('测试失败')
  } finally {
    running.value = false
  }
}

watch(() => props.modelValue, v => visible.value = v)
watch(() => props.script, s => { script.value = s; loadFromScript(s) }, { immediate: true })
watch(visible, v => emit('update:modelValue', v))
</script>

<style scoped>
.test-panel { padding: 8px 0; }
.meta { margin-bottom: 12px; }
.params-section { margin-top: 8px; }
.section-title { font-size: 13px; color: #303133; margin-bottom: 6px; }
.toolbar { display: flex; align-items: center; margin-bottom: 8px; }
.toolbar .tip { color: #909399; font-size: 12px; }
.toolbar .spacer { flex: 1; }
.error-tip { margin-top: 6px; color: #f56c6c; font-size: 12px; }
.output-wrapper { margin-top: 16px; }
.output-section { margin-top: 12px; }
.output-section h4 { margin: 0 0 8px 0; color: #303133; font-size: 14px; }
.output-content { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 12px; margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; max-height: 240px; overflow-y: auto; }
.output-content.error { background: #fef0f0; border-color: #fbc4c4; color: #f56c6c; }
</style>

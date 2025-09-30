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
          <el-dropdown @command="insertGlobalRef" trigger="click">
            <el-button size="small" type="primary">插入变量</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="g in globalsKeys" :key="g" :command="g">{{ g }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button size="small" @click="formatParams" style="margin-left: 8px">格式化</el-button>
          <el-button size="small" @click="resetToDefault">重置为默认</el-button>
        </div>
        <el-input
          v-model="paramsText"
          type="textarea"
          :rows="8"
          placeholder='例如: {"cookie":"$TD:TM_COOKIES","retries":1}'
          @blur="validateParams"
          ref="inputRef"
        />
        <div v-if="paramsError" class="error-tip">{{ paramsError }}</div>
      </div>

      <div class="output-wrapper">
        <div class="output-section">
          <h4>输出:</h4>
          <pre class="output-content" ref="outputRef"><code v-for="(line, i) in outputLines" :key="i" :class="line.type">{{ line.line }}</code></pre>
        </div>
      </div>

      <div v-if="finalExitCode !== null" class="output-wrapper">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="退出代码">
            <el-tag :type="finalExitCode === 0 ? 'success' : 'danger'">{{ finalExitCode }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="finalExitCode === 0 ? 'success' : 'danger'">{{ finalExitCode === 0 ? '成功' : '失败' }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false" :disabled="running">关闭</el-button>
      <el-button type="primary" @click="runTest" :loading="running" :disabled="!script || !!paramsError">运行测试</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { configApi } from '@/api/modules'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  script: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const script = ref(null)
const paramsText = ref('')
const paramsError = ref('')
const running = ref(false)
const outputLines = ref([])
const finalExitCode = ref(null)
const globalsKeys = ref([])
const inputRef = ref()
const outputRef = ref()
let eventSource = null

const toPretty = (obj) => {
  try { return JSON.stringify(obj ?? {}, null, 2) } catch { return '' }
}

const loadFromScript = (s) => {
  if (!s) {
    paramsText.value = ''
    paramsError.value = ''
    outputLines.value = []
    finalExitCode.value = null
    return
  }
  paramsText.value = toPretty(s.default_params || {})
  paramsError.value = ''
  outputLines.value = []
  finalExitCode.value = null
}

const fetchGlobals = async () => {
  try {
    const res = await configApi.getAllGroups()
    const data = res?.data ?? res
    const items = data?.globals?.items || []
    globalsKeys.value = items.map(it => it.key).filter(Boolean)
  } catch {}
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

const insertGlobalRef = (key) => {
  // 在光标处插入字符串值 "$TD:KEY"，并尽可能保持 JSON 合法
  const token = `"$TD:${key}"`
  if (!paramsText.value || !paramsText.value.trim()) {
    paramsText.value = `{"key": ${token}}`
    return
  }
  // 简单插入：追加一个示例键
  try {
    const obj = JSON.parse(paramsText.value)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const k = key.toLowerCase()
      let name = 'var_' + k
      let i = 1
      while (Object.prototype.hasOwnProperty.call(obj, name)) { name = `var_${k}_${i++}` }
      obj[name] = `$TD:${key}`
      paramsText.value = JSON.stringify(obj, null, 2)
    }
  } catch {
    // 若现有内容不是合法 JSON，则直接在末尾提示插入
    paramsText.value = (paramsText.value || '') + (paramsText.value?.endsWith('\n') ? '' : '\n') + `// 在 JSON 中使用: "someKey": "$TD:${key}"\n`
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
  outputLines.value = []
  finalExitCode.value = null

  if (eventSource) {
    eventSource.close()
  }

  try {
    const params = paramsText.value && paramsText.value.trim() ? JSON.parse(paramsText.value) : {}
    const url = `/api/scripts/${script.value.id}/test-stream?params=${encodeURIComponent(JSON.stringify(params))}`
    eventSource = new EventSource(url)

    eventSource.addEventListener('start', () => {
      outputLines.value.push({ type: 'info', line: '--- 连接成功，等待脚本执行 ---\n' })
    })

    eventSource.addEventListener('log', (event) => {
      const data = JSON.parse(event.data)
      outputLines.value.push({ type: data.type, line: data.line + '\n' })
      // 自动滚动到底部
      nextTick(() => {
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight
        }
      })
    })

    eventSource.addEventListener('exit', (event) => {
      const data = JSON.parse(event.data)
      finalExitCode.value = data.exitCode
      if (data.exitCode === 0) {
        ElMessage.success('测试成功')
      } else {
        ElMessage.warning('测试结束（失败），请查看输出')
      }
      eventSource.close()
      running.value = false
    })

    eventSource.onerror = () => {
      outputLines.value.push({ type: 'stderr', line: '--- 连接错误或中断 ---\n' })
      ElMessage.error('与服务器的连接中断')
      eventSource.close()
      running.value = false
      if (finalExitCode.value === null) finalExitCode.value = -1
    }
  } catch (e) {
    ElMessage.error('启动测试失败: ' + (e.message || e))
    running.value = false
    if (finalExitCode.value === null) finalExitCode.value = -1
  }
}

watch(() => props.modelValue, v => {
  visible.value = v
  if (!v && eventSource) {
    eventSource.close() // 关闭对话框时确保断开连接
  }
})
watch(() => props.script, s => { script.value = s; loadFromScript(s) }, { immediate: true })
watch(visible, v => emit('update:modelValue', v))

onMounted(() => { fetchGlobals() })
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
.output-content { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 12px; margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; max-height: 320px; overflow-y: auto; }
.output-content .stdout { color: #303133; }
.output-content .stderr { color: #f56c6c; }
.output-content .info { color: #909399; }
</style>

<template>
  <div class="subsection">
    <div class="subsection-title">环境变量（将与脚本执行相关）</div>
    <el-form :model="model.globals" label-width="140px">
      <el-form-item label="继承系统环境">
        <el-switch v-model="model.globals.inheritSystemEnv" />
      </el-form-item>
      <el-form-item label="变量列表">
        <div class="list">
          <div v-for="(g, i) in model.globals.items" :key="i" class="list-row">
            <!-- 键名 -->
            <el-input v-model="g.key" placeholder="KEY（仅包含字母数字与下划线）" />

            <!-- 类型选择 -->
            <el-select v-model="g.__type" @change="onTypeChange(g)" placeholder="类型" style="width: 120px">
              <el-option v-for="opt in TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>

            <!-- 值编辑，根据类型切换控件 -->
            <template v-if="g.__type === 'string'">
              <el-input
                v-model="g.value"
                :type="g.secret ? 'password' : 'text'"
                show-password
                placeholder="VALUE"
              />
            </template>
            <template v-else-if="g.__type === 'number'">
              <el-input-number v-model="g.value" :controls="true" :step="1" :min="-1e15" :max="1e15" style="width:100%" />
            </template>
            <template v-else-if="g.__type === 'boolean'">
              <div class="bool-cell">
                <el-switch v-model="g.value" />
                <el-tag size="small" type="info">{{ g.value ? 'true' : 'false' }}</el-tag>
              </div>
            </template>
            <template v-else-if="g.__type === 'null'">
              <el-input :model-value="'null'" disabled />
            </template>
            <template v-else-if="g.__type === 'object' || g.__type === 'array'">
              <div class="json-editor">
                <el-input
                  v-model="g.__jsonText"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 8 }"
                  placeholder="请输入有效的 JSON 文本"
                  @change="onJsonTextChange(g)"
                  @blur="onJsonTextChange(g)"
                />
                <div class="json-actions">
                  <el-button size="small" @click="formatJson(g)">格式化</el-button>
                  <span v-if="g.__jsonError" class="json-error">{{ g.__jsonError }}</span>
                  <span v-else class="json-ok">JSON OK</span>
                </div>
              </div>
            </template>

            <!-- 操作 -->
            <div class="ops">
              <el-tooltip content="标记为敏感（仅字符串显示为密码输入）" placement="top">
                <el-switch v-model="g.secret" />
              </el-tooltip>
              <el-button type="danger" link @click="removeGlobal(i)">删除</el-button>
            </div>
          </div>
          <el-button type="primary" link @click="addGlobal">+ 新增变量</el-button>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue'

const props = defineProps({ model: { type: Object, required: true } })

const TYPE_OPTIONS = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '对象', value: 'object' },
  { label: '数组', value: 'array' },
  { label: 'null', value: 'null' },
]

function inferType(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  if (t === 'boolean') return 'boolean'
  if (t === 'number') return 'number'
  if (t === 'object') return 'object'
  return 'string'
}

function ensureGlobalsModel() {
  if (!props.model.globals) props.model.globals = { inheritSystemEnv: true, items: [] }
  if (!Array.isArray(props.model.globals.items)) props.model.globals.items = []
  // 初始化每一项的编辑派生字段
  for (const g of props.model.globals.items) initEditorState(g)
}

function initEditorState(g) {
  if (!g) return
  if (!('__type' in g)) g.__type = inferType(g.value)
  if (g.__type === 'object' || g.__type === 'array') {
    // 仅在首次初始化时填充 JSON 文本，避免在用户输入时被覆盖
    if (typeof g.__jsonText === 'undefined') {
      try {
        g.__jsonText = g.value != null ? JSON.stringify(g.value, null, 2) : (g.__type === 'array' ? '[]' : '{}')
        g.__jsonError = ''
      } catch (_) {
        g.__jsonText = g.__jsonText || (g.__type === 'array' ? '[]' : '{}')
        g.__jsonError = '无法序列化为 JSON'
      }
    }
  }
}

function onTypeChange(g) {
  switch (g.__type) {
    case 'string':
      if (typeof g.value !== 'string') g.value = ''
      break
    case 'number':
      if (typeof g.value !== 'number') {
        const n = Number(g.value)
        g.value = Number.isFinite(n) ? n : 0
      }
      break
    case 'boolean':
      g.value = !!g.value
      break
    case 'null':
      g.value = null
      break
    case 'object':
      g.__jsonText = g.__jsonText && g.__jsonText.trim() ? g.__jsonText : '{}'
      onJsonTextChange(g)
      break
    case 'array':
      g.__jsonText = g.__jsonText && g.__jsonText.trim() ? g.__jsonText : '[]'
      onJsonTextChange(g)
      break
  }
}

function onJsonTextChange(g) {
  if (!g) return
  const text = (g.__jsonText || '').trim()
  if (!text) {
    g.__jsonError = 'JSON 不能为空'
    return
  }
  try {
    const parsed = JSON.parse(text)
    if (g.__type === 'object' && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
      g.__jsonError = '需要一个 JSON 对象 {}'
      return
    }
    if (g.__type === 'array' && !Array.isArray(parsed)) {
      g.__jsonError = '需要一个 JSON 数组 []'
      return
    }
    g.value = parsed
    g.__jsonError = ''
  } catch (e) {
    g.__jsonError = 'JSON 解析失败: ' + (e && e.message ? e.message : '未知错误')
  }
}

function formatJson(g) {
  try {
    const parsed = JSON.parse(g.__jsonText || (g.__type === 'array' ? '[]' : '{}'))
    g.__jsonText = JSON.stringify(parsed, null, 2)
    g.__jsonError = ''
  } catch (e) {
    g.__jsonError = 'JSON 解析失败，无法格式化'
  }
}

const addGlobal = () => {
  ensureGlobalsModel()
  const g = { key: '', value: '', secret: false, __type: 'string' }
  props.model.globals.items.push(g)
}
const removeGlobal = (i) => {
  props.model.globals.items.splice(i, 1)
}

onMounted(() => {
  ensureGlobalsModel()
})

watch(
  () => props.model.globals && props.model.globals.items,
  (list) => {
    if (!Array.isArray(list)) return
    for (const g of list) initEditorState(g)
  },
  { deep: false }
)
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 240px 120px 1fr auto; gap: 8px; align-items: center; }
.bool-cell { display: inline-flex; align-items: center; gap: 8px; }
.json-editor { display: grid; gap: 6px; }
.json-actions { display: flex; align-items: center; gap: 8px; }
.json-error { color: #d03050; font-size: 12px; }
.json-ok { color: #18a058; font-size: 12px; }
.ops { display: flex; align-items: center; gap: 8px; }
</style>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑任务' : '创建任务'"
    width="800px"
    :close-on-click-modal="false"
    @closed="$emit('closed')"
  >
    <el-form :model="localForm" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="localForm.name" placeholder="请输入任务名称" />
      </el-form-item>

      <el-form-item label="关联脚本" prop="script_ids">
        <el-select
          v-model="localForm.script_ids"
          multiple
          placeholder="请选择要执行的脚本（可多选，按选择顺序依次执行）"
          style="width: 100%"
          :loading="scriptLoading"
          collapse-tags
          collapse-tags-tooltip
        >
          <el-option
            v-for="script in scripts"
            :key="script.id"
            :label="script.name"
            :value="script.id"
          />
        </el-select>
        <div class="form-tip">
          <p>可多选，顺序即执行顺序。</p>
        </div>
      </el-form-item>

      <!-- 每脚本参数编辑区 -->
      <el-form-item label="脚本参数">
        <div class="params-list" v-if="localForm.script_ids.length">
          <div
            v-for="sid in localForm.script_ids"
            :key="sid"
            class="param-card"
          >
            <div class="param-card__header">
              <div class="title">{{ scriptMap.get(sid)?.name || ('脚本 #' + sid) }}</div>
              <div class="tools">
                <el-button size="small" @click="fillDefault(sid)">用默认参数</el-button>
                <el-button size="small" @click="formatOne(sid)">格式化</el-button>
                <el-button size="small" @click="clearOne(sid)">清空</el-button>
              </div>
            </div>
            <el-input
              v-model="paramsText[sid]"
              type="textarea"
              :rows="6"
              placeholder='该脚本的覆盖参数，JSON 对象，如 {"retries":1}'
              @blur="() => validateOne(sid)"
            />
            <div v-if="paramsError[sid]" class="error-tip">{{ paramsError[sid] }}</div>
          </div>
        </div>
        <div v-else class="form-tip">选择脚本后，可为每个脚本单独配置参数（JSON）。</div>
      </el-form-item>

      <el-form-item label="定时规则" prop="cron_expression">
        <el-input
          v-model="localForm.cron_expression"
          placeholder="例如: 0 */5 * * * *（每5分钟执行一次）"
        />
        <div class="form-tip">
          <p>Cron 表达式格式: 秒 分 时 日 月 周</p>
          <p>常用示例: 每分钟(0 * * * * *) | 每小时(0 0 * * * *) | 每天(0 0 0 * * *)</p>
        </div>
      </el-form-item>

      <el-form-item label="任务状态" prop="status">
        <el-radio-group v-model="localForm.status">
          <el-radio value="active">立即启动</el-radio>
          <el-radio value="inactive">暂不启动</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirm" :loading="saving">
        {{ isEdit ? '更新' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, default: () => ({}) },
  scripts: { type: Array, default: () => [] },
  scriptLoading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'closed'])

const visible = ref(false)
const formRef = ref()
const localForm = ref({
  id: undefined,
  name: '',
  script_ids: [],
  cron_expression: '',
  status: 'inactive',
  // 仅用于回填与提交，不做为 ElForm 字段校验
  script_params: undefined
})

// 脚本映射与参数文本/错误
const scriptMap = computed(() => new Map(props.scripts.map(s => [s.id, s])))
const paramsText = ref({}) // { [sid]: jsonText }
const paramsError = ref({}) // { [sid]: errorMsg }

const toPretty = (obj) => { try { return JSON.stringify(obj ?? {}, null, 2) } catch { return '' } }
const ensureParamFor = (sid) => { if (!(sid in paramsText.value)) paramsText.value[sid] = toPretty({}) }

const fillDefault = (sid) => {
  const s = scriptMap.value.get(sid)
  paramsText.value[sid] = toPretty(s?.default_params || {})
  paramsError.value[sid] = ''
}
const formatOne = (sid) => {
  try {
    const v = paramsText.value[sid] && paramsText.value[sid].trim() ? JSON.parse(paramsText.value[sid]) : {}
    paramsText.value[sid] = JSON.stringify(v, null, 2)
    paramsError.value[sid] = ''
  } catch { ElMessage.error('无法格式化：JSON 无效') }
}
const clearOne = (sid) => { paramsText.value[sid] = ''; paramsError.value[sid] = '' }
const validateOne = (sid) => {
  const text = paramsText.value[sid]
  if (!text || !text.trim()) { paramsError.value[sid] = ''; return true }
  try {
    const v = JSON.parse(text)
    if (v && typeof v === 'object') { paramsError.value[sid] = ''; return true }
    paramsError.value[sid] = '必须为 JSON 对象'; return false
  } catch (e) { paramsError.value[sid] = 'JSON 解析失败：' + (e?.message || ''); return false }
}

// 根据传入 form 回填
const normalizeScriptParams = (sp) => {
  if (!sp) return {}
  if (Array.isArray(sp)) {
    const out = {}
    for (const item of sp) {
      if (!item) continue
      const key = String(parseInt(item.script_id, 10))
      if (!key || key === 'NaN') continue
      out[key] = item.params && typeof item.params === 'object' ? item.params : {}
    }
    return out
  }
  if (sp && typeof sp === 'object') return sp
  return {}
}

watch(() => props.modelValue, (v) => visible.value = v)
watch(
  () => props.form,
  (v) => {
    const ids = Array.isArray(v?.script_ids)
      ? v.script_ids
      : (v?.script_id ? [v.script_id] : [])
    localForm.value = {
      ...localForm.value,
      id: v?.id,
      name: v?.name ?? '',
      cron_expression: v?.cron_expression ?? '',
      status: v?.status ?? 'inactive',
      script_ids: ids,
      script_params: v?.script_params
    }
    // 回填每脚本参数文本
    const map = normalizeScriptParams(v?.script_params)
    paramsText.value = {}
    paramsError.value = {}
    for (const sid of ids) {
      const key = String(sid)
      paramsText.value[key] = toPretty(map[key] || {})
      paramsError.value[key] = ''
    }
  },
  { immediate: true }
)
watch(visible, (v) => emit('update:modelValue', v))

// 监听脚本选择变化，维护 paramsText 键集合
watch(
  () => localForm.value.script_ids,
  (ids) => {
    const set = new Set((ids || []).map(x => String(x)))
    // 移除未选
    for (const k of Object.keys(paramsText.value)) { if (!set.has(k)) { delete paramsText.value[k]; delete paramsError.value[k] } }
    // 新增默认
    for (const sid of set) ensureParamFor(sid)
  },
  { deep: true }
)

const rules = {
  name: [ { required: true, message: '请输入任务名称', trigger: 'blur' } ],
  script_ids: [ { type: 'array', required: true, min: 1, message: '请至少选择一个脚本', trigger: 'change' } ],
  cron_expression: [ { required: true, message: '请输入定时规则', trigger: 'blur' } ]
}

const close = () => { visible.value = false }

const confirm = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  // 校验并构造 script_params 映射
  const ids = localForm.value.script_ids || []
  const out = {}
  for (const sid of ids) {
    const key = String(sid)
    if (paramsText.value[key] && paramsText.value[key].trim()) {
      try {
        const v = JSON.parse(paramsText.value[key])
        if (!v || typeof v !== 'object') { paramsError.value[key] = '必须为 JSON 对象'; return }
        out[key] = v
      } catch (e) {
        paramsError.value[key] = 'JSON 解析失败：' + (e?.message || '')
        return
      }
    }
  }
  const payload = {
    id: localForm.value.id,
    name: localForm.value.name,
    cron_expression: localForm.value.cron_expression,
    status: localForm.value.status,
    script_ids: localForm.value.script_ids,
    // 仅在有内容时传递，避免写入空对象覆盖
    ...(Object.keys(out).length ? { script_params: out } : {})
  }
  emit('confirm', payload)
}
</script>

<style scoped>
.form-tip { margin-top: 8px; font-size: 12px; color: #909399; line-height: 1.5; }
.form-tip p { margin: 0; }
.params-list { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.param-card { border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; background: #fafafa; }
.param-card__header { display: flex; align-items: center; margin-bottom: 8px; }
.param-card__header .title { font-weight: 600; color: #303133; }
.param-card__header .tools { margin-left: auto; display: flex; gap: 6px; }
.error-tip { margin-top: 6px; color: #f56c6c; font-size: 12px; }
</style>

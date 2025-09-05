<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑任务' : '创建任务'"
    width="600px"
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
import { ref, watch } from 'vue'

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
  status: 'inactive'
})

watch(() => props.modelValue, (v) => visible.value = v)
watch(
  () => props.form,
  (v) => {
    const ids = Array.isArray(v?.script_ids)
      ? v.script_ids
      : (v?.script_id ? [v.script_id] : [])
    // 仅合并必要字段，避免将无关数据带入
    localForm.value = {
      ...localForm.value,
      id: v?.id,
      name: v?.name ?? '',
      cron_expression: v?.cron_expression ?? '',
      status: v?.status ?? 'inactive',
      script_ids: ids
    }
  },
  { immediate: true }
)
watch(visible, (v) => emit('update:modelValue', v))

const rules = {
  name: [ { required: true, message: '请输入任务名称', trigger: 'blur' } ],
  script_ids: [ { type: 'array', required: true, min: 1, message: '请至少选择一个脚本', trigger: 'change' } ],
  cron_expression: [ { required: true, message: '请输入定时规则', trigger: 'blur' } ]
}

const close = () => { visible.value = false }

const confirm = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  const payload = {
    id: localForm.value.id,
    name: localForm.value.name,
    cron_expression: localForm.value.cron_expression,
    status: localForm.value.status,
    script_ids: localForm.value.script_ids
  }
  emit('confirm', payload)
}
</script>

<style scoped>
.form-tip { margin-top: 8px; font-size: 12px; color: #909399; line-height: 1.5; }
.form-tip p { margin: 0; }
</style>

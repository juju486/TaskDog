<template>
  <div class="page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">全局变量</h1>
        <div class="header-actions">
          <el-input v-model="search" placeholder="搜索 KEY" style="width: 300px; margin-right: 12px" clearable>
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
          <el-switch v-model="inheritSystemEnv" active-text="继承系统环境" inactive-text="不继承" style="margin-right: 12px" />
          <el-button type="primary" @click="openEdit()">
            <el-icon>
              <Plus />
            </el-icon>
            新增变量
          </el-button>
        </div>
      </div>
    </div>

    <!-- 列表区域 -->
    <el-table :data="filtered" :loading="loading" empty-text="暂无变量" style="width: 100%; margin-top: 12px">
      <el-table-column prop="key" label="KEY" min-width="200" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="secret" label="敏感" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.secret ? 'danger' : 'info'">{{ row.secret ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row, $index }">
          <el-button size="small" type="primary" @click="openEdit(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row, $index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editIndex == null ? '新增变量' : '编辑变量'" width="720px" :close-on-click-modal="false">
      <el-form label-width="120px" :model="form">
        <el-form-item label="键名 KEY">
          <el-input v-model="form.key" placeholder="仅字母数字与下划线" />
        </el-form-item>
        <el-form-item label="是否敏感">
          <el-switch v-model="form.secret" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.__type" style="width: 200px">
            <el-option v-for="opt in TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="值">
          <template v-if="form.__type === 'string'">
            <el-input v-model="form.value" :type="form.secret ? 'password' : 'text'" show-password />
          </template>
          <template v-else-if="form.__type === 'number'">
            <el-input-number v-model="form.value" :controls="true" :step="1" :min="-1e15" :max="1e15" style="width:100%" />
          </template>
          <template v-else-if="form.__type === 'boolean'">
            <el-switch v-model="form.value" />
          </template>
          <template v-else-if="form.__type === 'null'">
            <el-input :model-value="'null'" disabled />
          </template>
          <template v-else>
            <el-input v-model="form.__jsonText" type="textarea" :autosize="{ minRows: 4, maxRows: 12 }" placeholder="请输入 JSON 文本" />
            <div class="json-actions">
              <el-button size="small" @click="formatJson">格式化</el-button>
              <span v-if="form.__jsonError" class="json-error">{{ form.__jsonError }}</span>
              <span v-else class="json-ok">JSON OK</span>
            </div>
          </template>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { configApi } from '@/api/modules'

const TYPE_OPTIONS = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '对象', value: 'object' },
  { label: '数组', value: 'array' },
  { label: 'null', value: 'null' },
]

const loading = ref(false)
const search = ref('')
const items = ref([]) // 原始 items
const inheritSystemEnv = ref(true)

const dialogVisible = ref(false)
const editIndex = ref(null)
const form = ref({ key: '', value: '', secret: false, __type: 'string', __jsonText: '', __jsonError: '' })

const filtered = computed(() => {
  const kw = (search.value || '').toLowerCase()
  return items.value
    .map((it) => ({
      key: it.key,
      type: inferType(it.value),
      secret: !!it.secret,
      raw: it,
    }))
    .filter((r) => !kw || r.key.toLowerCase().includes(kw))
})

function inferType(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  if (t === 'boolean') return 'boolean'
  if (t === 'number') return 'number'
  if (t === 'object') return 'object'
  return 'string'
}

async function load() {
  loading.value = true
  try {
    const res = await configApi.getAllGroups()
    const data = res?.data ?? res
    inheritSystemEnv.value = data?.globals?.inheritSystemEnv !== false
    items.value = Array.isArray(data?.globals?.items) ? data.globals.items : []
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function openEdit(row, index) {
  editIndex.value = index ?? null
  if (row) {
    const raw = row.raw || row
    const t = inferType(raw.value)
    form.value = {
      key: raw.key,
      value: t === 'object' || t === 'array' ? undefined : (t === 'null' ? null : raw.value),
      secret: !!raw.secret,
      __type: t,
      __jsonText: t === 'object' || t === 'array' ? JSON.stringify(raw.value ?? (t === 'array' ? [] : {}), null, 2) : '',
      __jsonError: ''
    }
  } else {
    form.value = { key: '', value: '', secret: false, __type: 'string', __jsonText: '', __jsonError: '' }
  }
  dialogVisible.value = true
}

function formatJson() {
  try {
    const parsed = JSON.parse(form.value.__jsonText || (form.value.__type === 'array' ? '[]' : '{}'))
    form.value.__jsonText = JSON.stringify(parsed, null, 2)
    form.value.__jsonError = ''
  } catch (e) {
    form.value.__jsonError = 'JSON 解析失败，无法格式化'
  }
}

async function save() {
  // 组装 payload
  const payload = { key: String(form.value.key || '').trim(), secret: !!form.value.secret }
  if (!payload.key) return ElMessage.error('请填写 KEY')
  switch (form.value.__type) {
    case 'string': payload.value = form.value.value ?? ''; break
    case 'number': payload.value = Number(form.value.value) || 0; break
    case 'boolean': payload.value = !!form.value.value; break
    case 'null': payload.value = null; break
    case 'object':
    case 'array':
      try {
        payload.value = JSON.parse(form.value.__jsonText || (form.value.__type === 'array' ? '[]' : '{}'))
      } catch (e) {
        return ElMessage.error('JSON 无效，无法保存')
      }
      break
  }
  try {
    await configApi.saveAll({ globals: { inheritSystemEnv: inheritSystemEnv.value, items: upsert(items.value, payload, editIndex.value) } })
    ElMessage.success('已保存')
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

function upsert(list, payload, index) {
  const arr = Array.isArray(list) ? [...list] : []
  if (index != null && index >= 0 && index < arr.length) {
    arr[index] = { ...arr[index], ...payload }
  } else {
    const i = arr.findIndex((x) => x && x.key === payload.key)
    if (i >= 0) arr[i] = { ...arr[i], ...payload }
    else arr.push(payload)
  }
  return arr
}

async function remove(row, index) {
  const raw = row.raw || row
  await ElMessageBox.confirm(`确定删除变量 ${raw.key} ？`, '提示', { type: 'warning' })
  try {
    const newList = [...items.value]
    newList.splice(index, 1)
    await configApi.saveAll({ globals: { inheritSystemEnv: inheritSystemEnv.value, items: newList } })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.page-header { background: white; border-bottom: 1px solid #e4e7ed; padding: 0; }
.header-content { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; }
.page-title { font-size: 20px; font-weight: 600; color: #303133; margin: 0; }
.header-actions { display: flex; align-items: center; }
.json-actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.json-error { color: #d03050; font-size: 12px; }
.json-ok { color: #18a058; font-size: 12px; }
</style>

<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑脚本' : '创建脚本'" width="800px" :close-on-click-modal="false" @closed="$emit('closed')">
    <el-form :model="localForm" :rules="rules" ref="formRef" label-width="80px">
      <el-form-item label="脚本名称" prop="name">
        <el-input v-model="localForm.name" placeholder="请输入脚本名称" />
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input v-model="localForm.description" type="textarea" :rows="2" placeholder="请输入脚本描述" />
      </el-form-item>

      <el-form-item label="脚本语言" prop="language">
        <el-select v-model="localForm.language" placeholder="请选择脚本语言">
          <el-option label="Shell" value="shell" />
          <el-option label="PowerShell" value="powershell" />
          <el-option label="Python" value="python" />
          <el-option label="Node.js" value="node" />
          <el-option label="Bash" value="bash" />
        </el-select>
      </el-form-item>

      <el-form-item label="脚本内容" prop="content">
        <div class="content-input-section">
          <div class="editor-toolbar">
            <el-button size="small" @click="openFullscreenEditor">
              <el-icon><FullScreen /></el-icon>
              全屏编辑
            </el-button>
            <el-button size="small" @click="$emit('download-template', localForm)">
              <el-icon><Download /></el-icon>
              下载
            </el-button>
          </div>
          <div class="input-mode-tabs">
            <el-radio-group v-model="inputMode" @change="handleInputModeChange">
              <el-radio-button label="text">手动输入</el-radio-button>
              <el-radio-button label="file">文件上传</el-radio-button>
              <el-radio-button label="override" v-if="isEdit">覆盖上传</el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="inputMode === 'text'" class="text-input">
            <VueMonacoEditor v-model:value="localForm.content" :language="monacoLanguage" theme="vs-dark" class="monaco-editor" :options="monacoOptions" :style="{ height: editorHeight, width: '100%' }" />
          </div>

          <div v-else-if="inputMode === 'file'" class="file-input">
            <el-upload ref="uploadRef" class="script-upload" :auto-upload="false" :show-file-list="true" :on-change="handleFileChange" :before-remove="handleFileRemove" accept=".ps1,.bat,.py,.js,.sh,.txt" drag>
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">将脚本文件拖到此处，或<em>点击上传</em></div>
              <template #tip>
                <div class="el-upload__tip">支持 .ps1, .bat, .py, .js, .sh, .txt 等脚本文件</div>
              </template>
            </el-upload>

            <div v-if="fileContent" class="file-preview">
              <div class="preview-header">文件预览：</div>
              <el-input v-model="fileContent" type="textarea" :rows="8" readonly style="font-family: 'Courier New', monospace" />
            </div>
          </div>

          <div v-else-if="inputMode === 'override'" class="file-input">
            <el-upload ref="overrideRef" class="script-upload" :auto-upload="false" :show-file-list="true" :on-change="(file)=>$emit('override', file, localForm)" accept=".ps1,.bat,.py,.js,.sh,.txt" drag>
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">选择文件以覆盖当前脚本</div>
            </el-upload>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="默认参数" prop="default_params">
        <div class="params-editor">
          <div class="params-toolbar">
            <span class="tip">以 JSON 格式编辑，运行时可被任务参数覆盖；留空则默认为 {}</span>
            <div class="spacer" />
            <el-dropdown @command="insertGlobalRefDefault">
              <el-button size="small" type="primary">插入变量</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="g in globalsKeys" :key="g" :command="g">{{ g }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" @click="formatParams">格式化</el-button>
          </div>
          <el-input
            v-model="defaultParamsText"
            type="textarea"
            :rows="8"
            placeholder='例如: {"url":"https://example.com","retries":2,"flags":{"headless":true}}'
            @blur="syncParamsFromText"
          />
          <div v-if="paramsError" class="error-tip">{{ paramsError }}</div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirm" :loading="saving">{{ isEdit ? '更新' : '创建' }}</el-button>
    </template>

    <!-- 全屏编辑器对话框 -->
    <el-dialog v-model="fullscreenEditorVisible" title="全屏编辑" fullscreen :close-on-click-modal="false">
      <VueMonacoEditor v-model:value="fullscreenContent" :language="monacoLanguage" theme="vs-dark" class="monaco-editor" :options="monacoOptions" :style="{ height: 'calc(100vh - 180px)', width: '100%' }" />
      <template #footer>
        <el-button @click="fullscreenEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="applyFullscreenContent">应用</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { FullScreen, Download, UploadFilled } from '@element-plus/icons-vue'
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor'
import { configApi } from '@/api/modules'

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, default: () => ({}) },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'closed', 'download-template', 'override'])

const visible = ref(false)
const formRef = ref()
const uploadRef = ref()
const inputMode = ref('text')
const fileContent = ref('')
const fullscreenEditorVisible = ref(false)
const fullscreenContent = ref('')

const localForm = ref({ name: '', description: '', language: 'shell', content: '', default_params: {} })

// 默认参数编辑（JSON 文本）
const defaultParamsText = ref('')
const paramsError = ref('')
const syncTextFromParams = () => {
  try {
    defaultParamsText.value = JSON.stringify(localForm.value.default_params || {}, null, 2)
    paramsError.value = ''
  } catch {
    defaultParamsText.value = ''
  }
}
const syncParamsFromText = () => {
  if (!defaultParamsText.value || !defaultParamsText.value.trim()) {
    localForm.value.default_params = {}
    paramsError.value = ''
    return
  }
  try {
    const obj = JSON.parse(defaultParamsText.value)
    if (obj && typeof obj === 'object') {
      localForm.value.default_params = obj
      paramsError.value = ''
    } else {
      paramsError.value = '必须为 JSON 对象'
    }
  } catch (e) {
    paramsError.value = 'JSON 解析失败：' + (e?.message || '')
  }
}

watch(() => props.modelValue, (v) => visible.value = v)
watch(() => props.form, (v) => {
  localForm.value = { ...localForm.value, ...v, default_params: v?.default_params ?? {} }
  inputMode.value = 'text'
  fileContent.value = ''
  syncTextFromParams()
}, { immediate: true })
watch(visible, (v) => emit('update:modelValue', v))

const rules = {
  name: [ { required: true, message: '请输入脚本名称', trigger: 'blur' } ],
  content: [ { required: true, message: '请输入脚本内容', trigger: 'blur' } ],
  language: [ { required: true, message: '请选择脚本语言', trigger: 'change' } ]
}

const monacoOptions = { automaticLayout: true, fontSize: 14, minimap: { enabled: false }, wordWrap: 'on', tabSize: 2, insertSpaces: true, detectIndentation: false }

const editorHeight = ref('420px')
const updateEditorHeight = () => { const h = Math.min(700, Math.max(300, window.innerHeight - 380)); editorHeight.value = `${h}px` }

const monacoLanguage = computed(() => {
  const map = { powershell: 'powershell', batch: 'bat', cmd: 'bat', python: 'python', javascript: 'javascript', node: 'javascript', shell: 'shell', bash: 'shell' }
  return map[localForm.value.language] || 'plaintext'
})

const openFullscreenEditor = () => { fullscreenContent.value = localForm.value.content || ''; fullscreenEditorVisible.value = true; setTimeout(() => window.dispatchEvent(new Event('resize')), 50) }
const applyFullscreenContent = () => { localForm.value.content = fullscreenContent.value; fullscreenEditorVisible.value = false; setTimeout(() => window.dispatchEvent(new Event('resize')), 50) }

const handleInputModeChange = (mode) => { if (mode === 'file') { localForm.value.content = '' } else { fileContent.value = ''; uploadRef.value?.clearFiles() } }
const handleFileChange = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    fileContent.value = e.target.result
    localForm.value.content = e.target.result
    const extension = file.name.split('.').pop().toLowerCase()
    const languageMap = { ps1: 'powershell', bat: 'batch', py: 'python', js: 'javascript', sh: 'bash', txt: 'shell' }
    if (languageMap[extension]) localForm.value.language = languageMap[extension]
    if (!localForm.value.name) localForm.value.name = file.name.replace(/\.[^/.]+$/, '')
  }
  reader.readAsText(file.raw)
}
const handleFileRemove = () => { fileContent.value = ''; localForm.value.content = '' }

const formatParams = () => {
  try {
    const v = defaultParamsText.value && defaultParamsText.value.trim() ? JSON.parse(defaultParamsText.value) : {}
    defaultParamsText.value = JSON.stringify(v, null, 2)
    paramsError.value = ''
  } catch (e) {
    ElMessage.error('无法格式化：JSON 无效')
  }
}

const confirm = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  // 同步一次 JSON 文本到对象
  syncParamsFromText()
  if (paramsError.value) return ElMessage.error('默认参数不合法')
  emit('confirm', { ...localForm.value })
}

const globalsKeys = ref([])
const fetchGlobals = async () => {
  try {
    const res = await configApi.getAllGroups()
    const data = res?.data ?? res
    const items = data?.globals?.items || []
    globalsKeys.value = items.map(it => it.key).filter(Boolean)
  } catch {}
}

const insertGlobalRefDefault = (key) => {
  try {
    const obj = defaultParamsText.value && defaultParamsText.value.trim() ? JSON.parse(defaultParamsText.value) : {}
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const base = 'var_' + String(key).toLowerCase()
      let name = base
      let i = 1
      while (Object.prototype.hasOwnProperty.call(obj, name)) { name = `${base}_${i++}` }
      obj[name] = `$TD:${key}`
      defaultParamsText.value = JSON.stringify(obj, null, 2)
      paramsError.value = ''
    } else {
      ElMessage.error('必须为 JSON 对象，无法插入变量')
    }
  } catch {
    ElMessage.error('当前参数不是合法 JSON，无法插入变量')
  }
}

onMounted(() => { updateEditorHeight(); window.addEventListener('resize', updateEditorHeight); fetchGlobals() })
onUnmounted(() => { window.removeEventListener('resize', updateEditorHeight) })
</script>

<style scoped>
.content-input-section { width: 100%; }
.editor-toolbar { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 8px; }
.input-mode-tabs { margin-bottom: 16px; }
.text-input, .file-input { width: 100%; }
.script-upload { width: 100%; }
.file-preview { margin-top: 16px; }
.preview-header { margin-bottom: 8px; font-weight: 500; color: #303133; }
.el-upload__tip { color: #909399; font-size: 12px; margin-top: 8px; }
.monaco-editor { min-height: 320px; border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.params-editor { width: 100%; }
.params-toolbar { display: flex; align-items: center; margin-bottom: 8px; }
.params-toolbar .tip { color: #909399; font-size: 12px; }
.params-toolbar .spacer { flex: 1; }
.error-tip { margin-top: 6px; color: #f56c6c; font-size: 12px; }
</style>

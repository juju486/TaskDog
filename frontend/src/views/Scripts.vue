<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">脚本管理</h1>
        <div class="header-actions">
          <el-input v-model="searchText" placeholder="搜索脚本名称或描述" style="width: 300px; margin-right: 12px" clearable
            @input="handleSearch">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
          <el-button type="primary" @click="showCreateDialog">
            <el-icon>
              <Plus />
            </el-icon>
            创建脚本
          </el-button>
        </div>
      </div>
    </div>

    <!-- 页面内容 -->
    <div class="page-content">
      <div class="table-container">
        <el-table :data="filteredScripts" :loading="scriptStore.loading" empty-text="暂无数据" style="width: 100%">
          <el-table-column prop="name" label="名称" min-width="150">
            <template #default="{ row }">
              <div class="script-name">
                <el-icon class="script-icon">
                  <Document />
                </el-icon>
                {{ row.name }}
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />

          <el-table-column prop="language" label="语言" width="120">
            <template #default="{ row }">
              <el-tag :type="getLanguageTagType(row.language)" size="default" class="language-tag">
                {{ getLanguageDisplay(row.language) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="created_at" label="创建时间" width="160">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <div class="action-buttons">
                <el-button size="small" @click="testScript(row)" class="action-btn">
                  <el-icon>
                    <VideoPlay />
                  </el-icon>
                  测试
                </el-button>
                <el-button size="small" type="primary" @click="editScript(row)" class="action-btn">
                  <el-icon>
                    <Edit />
                  </el-icon>
                  编辑
                </el-button>
                <el-button size="small" type="danger" @click="deleteScript(row)" class="action-btn">
                  <el-icon>
                    <Delete />
                  </el-icon>
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 创建/编辑脚本对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑脚本' : '创建脚本'" width="800px" :close-on-click-modal="false">
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="脚本名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入脚本名称" />
        </el-form-item>

        <el-form-item label="描述" prop="description">
          <el-input v-model="formData.description" type="textarea" :rows="2" placeholder="请输入脚本描述" />
        </el-form-item>

        <el-form-item label="脚本语言" prop="language">
          <el-select v-model="formData.language" placeholder="请选择脚本语言">
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
                <el-icon>
                  <FullScreen />
                </el-icon>
                全屏编辑
              </el-button>
            </div>
            <div class="input-mode-tabs">
              <el-radio-group v-model="inputMode" @change="handleInputModeChange">
                <el-radio-button label="text">手动输入</el-radio-button>
                <el-radio-button label="file">文件上传</el-radio-button>
              </el-radio-group>
            </div>

            <div v-if="inputMode === 'text'" class="text-input">
              <VueMonacoEditor v-model:value="formData.content" :language="monacoLanguage" theme="vs-dark"
                class="monaco-editor" :options="monacoOptions" :style="{ height: editorHeight, width: '100%' }" />
            </div>

            <div v-if="inputMode === 'file'" class="file-input">
              <el-upload ref="uploadRef" class="script-upload" :auto-upload="false" :show-file-list="true"
                :on-change="handleFileChange" :before-remove="handleFileRemove" accept=".ps1,.bat,.py,.js,.sh,.txt"
                drag>
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">
                  将脚本文件拖到此处，或<em>点击上传</em>
                </div>
                <template #tip>
                  <div class="el-upload__tip">
                    支持 .ps1, .bat, .py, .js, .sh, .txt 等脚本文件
                  </div>
                </template>
              </el-upload>

              <div v-if="fileContent" class="file-preview">
                <div class="preview-header">文件预览：</div>
                <el-input v-model="fileContent" type="textarea" :rows="8" readonly
                  style="font-family: 'Courier New', monospace" />
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScript" :loading="saving">
          {{ isEdit ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 全屏编辑器对话框 -->
    <el-dialog v-model="fullscreenEditorVisible" title="全屏编辑" fullscreen :close-on-click-modal="false">
      <VueMonacoEditor v-model:value="fullscreenContent" :language="monacoLanguage" theme="vs-dark"
        class="monaco-editor" :options="monacoOptions" :style="{ height: 'calc(100vh - 180px)', width: '100%' }" />
      <template #footer>
        <el-button @click="fullscreenEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="applyFullscreenContent">应用</el-button>
      </template>
    </el-dialog>

    <!-- 测试结果对话框 -->
    <el-dialog v-model="testDialogVisible" title="脚本测试结果" width="700px">
      <div class="test-result">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="退出代码">
            <el-tag :type="testResult?.exitCode === 0 ? 'success' : 'danger'">
              {{ testResult?.exitCode }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="testResult?.exitCode === 0 ? 'success' : 'danger'">
              {{ testResult?.exitCode === 0 ? '成功' : '失败' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="testResult?.stdout" class="output-section">
          <h4>标准输出:</h4>
          <pre class="output-content">{{ testResult.stdout }}</pre>
        </div>

        <div v-if="testResult?.stderr" class="output-section">
          <h4>错误输出:</h4>
          <pre class="output-content error">{{ testResult.stderr }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Document, VideoPlay, Edit, Delete, UploadFilled, Download, FullScreen } from '@element-plus/icons-vue';
import { useScriptStore } from '@/stores/script';
import moment from 'moment';
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor';

// 配置 Monaco CDN（简化打包与 worker 配置）
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

const scriptStore = useScriptStore();

// 响应式数据
const searchText = ref('');
const dialogVisible = ref(false);
const testDialogVisible = ref(false);
const isEdit = ref(false);
const saving = ref(false);
const formRef = ref();
const uploadRef = ref();
const testResult = ref(null);
const inputMode = ref('text'); // 'text' 或 'file'
const fileContent = ref('');

// 全屏编辑器
const fullscreenEditorVisible = ref(false);
const fullscreenContent = ref('');

const formData = ref({
  name: '',
  description: '',
  language: 'shell',
  content: ''
});

const rules = {
  name: [
    { required: true, message: '请输入脚本名称', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入脚本内容', trigger: 'blur' }
  ],
  language: [
    { required: true, message: '请选择脚本语言', trigger: 'change' }
  ]
};

// 计算属性
const filteredScripts = computed(() => {
  if (!searchText.value) return scriptStore.scripts;
  const search = searchText.value.toLowerCase();
  return scriptStore.scripts.filter(script =>
    script.name.toLowerCase().includes(search) ||
    (script.description && script.description.toLowerCase().includes(search))
  );
});

const monacoLanguage = computed(() => {
  const map = {
    powershell: 'powershell',
    batch: 'bat',
    cmd: 'bat',
    python: 'python',
    javascript: 'javascript',
    node: 'javascript',
    shell: 'shell',
    bash: 'shell'
  };
  return map[formData.value.language] || 'plaintext';
});

const monacoOptions = {
  automaticLayout: true,
  fontSize: 14,
  minimap: { enabled: false },
  wordWrap: 'on',
  tabSize: 2,          // 设置制表符大小为 2 个空格
  insertSpaces: true,  // 使用空格代替制表符
  detectIndentation: false, // 禁用自动检测缩进

};

// 动态编辑器高度（根据窗口自适应）
const editorHeight = ref('420px');
const updateEditorHeight = () => {
  const h = Math.min(700, Math.max(300, window.innerHeight - 320));
  editorHeight.value = `${h}px`;
};

// 全屏编辑逻辑
const openFullscreenEditor = () => {
  fullscreenContent.value = formData.value.content || '';
  fullscreenEditorVisible.value = true;
  // 触发布局更新
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
};

const applyFullscreenContent = () => {
  formData.value.content = fullscreenContent.value;
  fullscreenEditorVisible.value = false;
  // 触发布局更新
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
};

// 方法
const handleSearch = () => {
  // 搜索逻辑已在 computed 中处理
};

const showCreateDialog = () => {
  isEdit.value = false;
  inputMode.value = 'text';
  fileContent.value = '';
  formData.value = {
    name: '',
    description: '',
    language: 'shell',
    content: ''
  };
  dialogVisible.value = true;
};

const editScript = (script) => {
  isEdit.value = true;
  inputMode.value = 'text';
  fileContent.value = '';
  formData.value = { ...script };
  dialogVisible.value = true;
};

// 文件上传处理方法
const handleInputModeChange = (mode) => {
  if (mode === 'file') {
    formData.value.content = '';
  } else if (mode === 'text') {
    fileContent.value = '';
    if (uploadRef.value) {
      uploadRef.value.clearFiles();
    }
  }
};

const handleFileChange = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    fileContent.value = e.target.result;
    formData.value.content = e.target.result;

    // 根据文件扩展名自动设置脚本语言
    const extension = file.name.split('.').pop().toLowerCase();
    const languageMap = {
      'ps1': 'powershell',
      'bat': 'batch',
      'py': 'python',
      'js': 'javascript',
      'sh': 'bash',
      'txt': 'shell'
    };
    if (languageMap[extension]) {
      formData.value.language = languageMap[extension];
    }

    // 如果没有设置名称，使用文件名（去掉扩展名）
    if (!formData.value.name) {
      formData.value.name = file.name.replace(/\.[^/.]+$/, '');
    }
  };
  reader.readAsText(file.raw);
};

const handleFileRemove = () => {
  fileContent.value = '';
  formData.value.content = '';
};

const saveScript = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    saving.value = true;

    if (isEdit.value) {
      await scriptStore.updateScript(formData.value.id, formData.value);
      ElMessage.success('脚本更新成功');
    } else {
      await scriptStore.createScript(formData.value);
      ElMessage.success('脚本创建成功');
    }

    dialogVisible.value = false;
  } catch (error) {
    ElMessage.error(isEdit.value ? '脚本更新失败' : '脚本创建失败');
  } finally {
    saving.value = false;
  }
};

const deleteScript = async (script) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除脚本 "${script.name}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await scriptStore.deleteScript(script.id);
    ElMessage.success('脚本删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('脚本删除失败');
    }
  }
};

const testScript = async (script) => {
  try {
    ElMessage.info('正在测试脚本...');
    const result = await scriptStore.testScript(script.id);
    testResult.value = result;
    testDialogVisible.value = true;
  } catch (error) {
    ElMessage.error('脚本测试失败');
  }
};

const downloadScript = async (script) => {
  try {
    const res = await import('@/api/modules').then(m => m.scriptApi.download(script.id));
    const blob = res.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const extMap = { powershell: 'ps1', batch: 'bat', python: 'py', javascript: 'js', node: 'js', shell: 'sh', bash: 'sh' };
    const ext = extMap[script.language] || 'txt';
    a.href = url;
    a.download = `${script.name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('下载失败');
  }
};

const overrideUploadChange = async (file, script) => {
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      await scriptStore.updateScript(script.id, { content });
      ElMessage.success('覆盖上传成功');
      // 立即刷新以获取后端重新读取的内容
      await scriptStore.fetchScripts();
    };
    reader.readAsText(file.raw);
  } catch (e) {
    ElMessage.error('覆盖上传失败');
  }
};

const getLanguageTagType = (language) => {
  const key = (language || '').toLowerCase();
  const typeMap = {
    shell: 'primary',
    bash: 'primary',
    powershell: 'success',
    python: 'warning',
    node: 'info',
    javascript: 'info',
    batch: 'primary',
    cmd: 'primary'
  };
  // 未匹配时返回 undefined，避免传入非法值
  return typeMap[key] ?? undefined;
};

const getLanguageDisplay = (language) => {
  const langMap = {
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'python': 'Python',
    'node': 'Node.js',
    'bash': 'Bash',
    'javascript': 'JavaScript',
    'batch': 'Batch',
    'cmd': 'CMD'
  };
  return langMap[language] || language;
};

const formatDate = (dateString) => {
  return moment(dateString).format('YYYY-MM-DD HH:mm');
};

// 生命周期
onMounted(() => {
  scriptStore.fetchScripts();
  updateEditorHeight();
  window.addEventListener('resize', updateEditorHeight);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateEditorHeight);
});
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  background: white;
  border-bottom: 1px solid #e4e7ed;
  padding: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
}

.page-content {
  flex: 1;
  padding: 24px 0;
  overflow: auto;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}



.script-name {
  display: flex;
  align-items: center;
}

.script-icon {
  margin-right: 8px;
  color: #409EFF;
}

.action-buttons {
  display: flex;
  gap: 6px;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: nowrap;
}

.action-btn {
  min-width: 56px;
  margin: 0;
  font-size: 12px;
  padding: 6px 8px;
}

.test-result {
  padding: 16px 0;
}

.output-section {
  margin-top: 16px;
}

.output-section h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 14px;
}

.output-content {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.output-content.error {
  background: #fef0f0;
  border-color: #fbc4c4;
  color: #f56c6c;
}

.content-input-section {
  width: 100%;
}

.editor-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
}

.input-mode-tabs {
  margin-bottom: 16px;
}

.text-input,
.file-input {
  width: 100%;
}

.script-upload {
  width: 100%;
}

.file-preview {
  margin-top: 16px;
}

.preview-header {
  margin-bottom: 8px;
  font-weight: 500;
  color: #303133;
}

.el-upload__tip {
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}

.monaco-editor {
  min-height: 320px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
</style>

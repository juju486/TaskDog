<template>
  <div class="subsection">
    <div class="subsection-title">依赖管理</div>
    <div style="display:flex; gap:12px; align-items:center; margin-bottom: 8px;">
      <el-segmented v-model="depLang" :options="['node','python']" />
      <el-button size="small" @click="loadDeps" :loading="depsLoading">刷新</el-button>
    </div>

    <el-form label-width="120px" @submit.prevent>
      <el-form-item label="安装依赖">
        <div class="list-row" style="grid-template-columns: 240px 240px auto;">
          <el-input v-model="depName" placeholder="包名，如 axios 或 requests" />
          <el-input v-model="depVersion" placeholder="版本，可留空" />
          <el-button type="primary" :loading="installing" :disabled="installing" @click="installDep">安装</el-button>
        </div>
      </el-form-item>
    </el-form>

    <div class="subsection-title" style="margin-top: 8px;">已安装</div>
    <el-table :data="deps" v-loading="depsLoading" size="small" style="width: 100%">
      <el-table-column label="#" type="index" width="60" />
      <el-table-column label="名称">
        <template #default="{ row }">
          <el-link type="primary" @click="showDepInfo(row)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="版本" prop="version" width="180">
        <template #default="{ row }">
          {{ row.version || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-popconfirm :title="`确认卸载 ${row.name} 吗？`" @confirm="() => uninstallDep(row.name)">
            <template #reference>
              <el-button type="danger" link :loading="uninstallingName===row.name">卸载</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 依赖详情 -->
    <el-dialog v-model="depInfoVisible" title="依赖详情" width="600px">
      <div v-if="depInfoLoading" style="padding: 12px 0;">
        <el-skeleton :rows="4" animated />
      </div>
      <div v-else>
        <div style="display:grid; grid-template-columns: 120px 1fr; row-gap: 8px; column-gap: 8px;">
          <div>名称</div><div>{{ depInfoData?.name || currentDepName }}</div>
          <div>版本</div><div>{{ depInfoData?.version || '-' }}</div>
          <div>描述</div><div>{{ depInfoData?.description || depInfoData?.summary || '-' }}</div>
          <div>主页</div>
          <div>
            <a v-if="depInfoData?.homepage || depInfoData?.homePage" :href="depInfoData.homepage || depInfoData.homePage" target="_blank">{{ depInfoData.homepage || depInfoData.homePage }}</a>
            <span v-else>-</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="depInfoVisible=false">关 闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { configApi } from '@/api/modules'

const depLang = ref('node')
const deps = ref([])
const depsLoading = ref(false)
const depName = ref('')
const depVersion = ref('')
const installing = ref(false)
const uninstallingName = ref('')

const depInfoVisible = ref(false)
const depInfoLoading = ref(false)
const depInfoData = ref(null)
const currentDepName = ref('')

const loadDeps = async () => {
  try {
    depsLoading.value = true
    const res = await configApi.listDeps(depLang.value)
    deps.value = (res && res.data) ? res.data : []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载依赖失败')
  } finally {
    depsLoading.value = false
  }
}

const installDep = async () => {
  if (!depName.value) {
    ElMessage.warning('请输入包名')
    return
  }
  try {
    installing.value = true
    await configApi.installDep({ lang: depLang.value, name: depName.value, version: depVersion.value || undefined })
    ElMessage.success('安装完成')
    depName.value = ''
    depVersion.value = ''
    loadDeps()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '安装失败')
  } finally {
    installing.value = false
  }
}

const uninstallDep = async (name) => {
  try {
    uninstallingName.value = name
    await configApi.uninstallDep({ lang: depLang.value, name })
    ElMessage.success('已卸载')
    loadDeps()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '卸载失败')
  } finally {
    uninstallingName.value = ''
  }
}

const showDepInfo = async (row) => {
  try {
    currentDepName.value = row?.name || ''
    depInfoVisible.value = true
    depInfoLoading.value = true
    const res = await configApi.depInfo({ lang: depLang.value, name: row.name })
    depInfoData.value = res?.data || null
  } catch (e) {
    depInfoData.value = null
    ElMessage.error(e?.response?.data?.message || '获取依赖详情失败')
  } finally {
    depInfoLoading.value = false
  }
}

onMounted(() => {
  loadDeps()
})
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list-row { display: grid; grid-template-columns: 240px 1fr auto; gap: 8px; align-items: center; }
</style>

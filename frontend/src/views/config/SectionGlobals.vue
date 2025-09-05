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
            <el-input v-model="g.key" placeholder="KEY（仅包含字母数字与下划线）" />
            <el-input
              v-model="g.value"
              :type="g.secret ? 'password' : 'text'"
              show-password
              placeholder="VALUE"
            />
            <div style="display:flex;align-items:center;gap:8px;">
              <el-switch v-model="g.secret" />
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
const props = defineProps({ model: { type: Object, required: true } })
const addGlobal = () => {
  if (!props.model.globals) props.model.globals = { inheritSystemEnv: true, items: [] }
  if (!Array.isArray(props.model.globals.items)) props.model.globals.items = []
  props.model.globals.items.push({ key: '', value: '', secret: false })
}
const removeGlobal = (i) => {
  props.model.globals.items.splice(i, 1)
}
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 240px 1fr auto; gap: 8px; align-items: center; }
</style>

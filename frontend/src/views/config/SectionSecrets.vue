<template>
  <div class="subsection">
    <div class="subsection-title">密钥列表（仅本地可见）</div>
    <div class="list">
      <div v-for="(s, i) in model.secrets" :key="i" class="list-row">
        <el-input v-model="s.key" placeholder="key" style="max-width: 240px" />
        <el-input v-model="s.value" placeholder="value" type="password" show-password />
        <el-button type="danger" link @click="removeSecret(i)">删除</el-button>
      </div>
      <el-button type="primary" link @click="addSecret">+ 新增</el-button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
const addSecret = () => {
  if (!Array.isArray(props.model.secrets)) props.model.secrets = []
  props.model.secrets.push({ key: '', value: '' })
}
const removeSecret = (i) => {
  props.model.secrets.splice(i, 1)
}
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 240px 1fr auto; gap: 8px; align-items: center; }
</style>

<template>
  <div class="subsection">
    <div class="subsection-title">Webhook</div>
    <el-form :model="model.notify.webhook" label-width="140px">
      <el-form-item label="启用">
        <el-switch v-model="model.notify.webhook.enabled" />
      </el-form-item>
      <el-form-item label="URL 列表">
        <div class="list">
          <div v-for="(w, i) in model.notify.webhook.items" :key="i" class="list-row">
            <el-input v-model="w.url" placeholder="Webhook URL" />
            <el-input v-model="w.secret" placeholder="Secret (可选, 用于钉钉加签)" />
            <el-button type="danger" link @click="removeWebhook(i)">删除</el-button>
          </div>
          <el-button type="primary" link @click="addWebhook">+ 新增</el-button>
        </div>
      </el-form-item>
    </el-form>
  </div>

  <div class="subsection">
    <div class="subsection-title">邮件</div>
    <el-form :model="model.notify.email" label-width="140px">
      <el-form-item label="启用">
        <el-switch v-model="model.notify.email.enabled" />
      </el-form-item>
      <el-form-item label="Host"><el-input v-model="model.notify.email.host" /></el-form-item>
      <el-form-item label="Port"><el-input-number v-model="model.notify.email.port" :min="1" /></el-form-item>
      <el-form-item label="User"><el-input v-model="model.notify.email.user" /></el-form-item>
      <el-form-item label="From"><el-input v-model="model.notify.email.from" /></el-form-item>
      <el-form-item label="TLS"><el-switch v-model="model.notify.email.useTLS" /></el-form-item>
    </el-form>
  </div>

  <div class="subsection">
    <div class="subsection-title">触发规则</div>
    <el-form :model="model.notify.on" label-width="140px">
      <el-form-item label="任务开始"><el-switch v-model="model.notify.on.taskStart" /></el-form-item>
      <el-form-item label="任务成功"><el-switch v-model="model.notify.on.taskSuccess" /></el-form-item>
      <el-form-item label="任务失败"><el-switch v-model="model.notify.on.taskError" /></el-form-item>
    </el-form>
  </div>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
const addWebhook = () => {
  if (!Array.isArray(props.model.notify.webhook.items)) props.model.notify.webhook.items = []
  props.model.notify.webhook.items.push({ url: '', secret: '' })
}
const removeWebhook = (i) => {
  props.model.notify.webhook.items.splice(i, 1)
}
</script>

<style scoped>
.subsection { margin-bottom: 16px; }
.subsection-title { font-weight: 600; margin: 8px 0 12px; }
.list { display: grid; gap: 8px; }
.list-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; }
</style>

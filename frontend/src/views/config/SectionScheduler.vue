<template>
  <el-form :model="model.scheduler" label-width="160px">
    <el-form-item label="Cron 时区">
      <el-input v-model="model.scheduler.schedulerTz" placeholder="Asia/Shanghai" />
    </el-form-item>
    <el-form-item label="并发策略">
      <el-select v-model="model.scheduler.overlapPolicy">
        <el-option label="排队" value="queue" />
        <el-option label="跳过" value="skip" />
        <el-option label="终止前一个" value="kill" />
      </el-select>
    </el-form-item>
    <el-form-item label="补跑历史">
      <el-switch v-model="model.scheduler.catchup" />
    </el-form-item>
    <el-form-item label="随机抖动 (ms)">
      <el-input-number v-model="model.scheduler.jitterMs" :min="0" />
    </el-form-item>
    <el-form-item label="最大重试次数">
      <el-input-number v-model="model.scheduler.retry.maxAttempts" :min="0" />
    </el-form-item>
    <el-form-item label="退避时间 (ms)">
      <el-input-number v-model="model.scheduler.retry.backoffMs" :min="0" />
    </el-form-item>
  </el-form>
</template>

<script setup>
const props = defineProps({ model: { type: Object, required: true } })
</script>

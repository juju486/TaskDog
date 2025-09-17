<template>
  <el-container class="layout-container">
    <el-aside width="260px" class="sidebar">
      <div class="logo">
        <div class="logo-icon">
          <el-icon><Monitor /></el-icon>
        </div>
        <div class="logo-text">
          <h2>TaskDog</h2>
          <span class="version">v1.0.0</span>
        </div>
      </div>
      
      <el-menu
        :default-active="$route.path"
        router
        class="sidebar-menu"
        text-color="#64748b"
        active-text-color="#3b82f6"
        background-color="transparent"
      >
        <el-menu-item index="/scripts" class="menu-item">
          <el-icon><Document /></el-icon>
          <span>脚本管理</span>
        </el-menu-item>
        
        <el-menu-item index="/tasks" class="menu-item">
          <el-icon><Timer /></el-icon>
          <span>定时任务</span>
        </el-menu-item>

        <el-menu-item index="/globals" class="menu-item">
          <el-icon><Setting /></el-icon>
          <span>全局变量</span>
        </el-menu-item>

        <el-menu-item index="/config" class="menu-item">
          <el-icon><Setting /></el-icon>
          <span>配置管理</span>
        </el-menu-item>
        
        <el-menu-item index="/logs" class="menu-item">
          <el-icon><Tickets /></el-icon>
          <span>日志管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-main class="main-content">
      <div class="content-wrapper">
        <router-view />
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
import { Monitor, Document, Timer, Setting, Tickets } from '@element-plus/icons-vue'
</script>

<style scoped>
.layout-container {
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.sidebar {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-right: 1px solid rgba(229, 231, 235, 0.8);
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  padding: 24px 20px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
  margin-bottom: 20px;
}

.logo-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
}

.logo-icon .el-icon {
  font-size: 24px;
  color: white;
}

.logo-text h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

.version {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.sidebar-menu {
  border: none;
  padding: 0 16px;
}

.menu-item {
  margin-bottom: 8px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.menu-item:hover {
  background: rgba(59, 130, 246, 0.1) !important;
}

.menu-item.is-active {
  background: rgba(59, 130, 246, 0.15) !important;
  color: #3b82f6 !important;
  font-weight: 600;
}

.menu-item .el-icon {
  margin-right: 12px;
  font-size: 18px;
}

.main-content {
  background: transparent;
  padding: 0;
  overflow: hidden;
}

.content-wrapper {
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 24px 0 0 0;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  padding: 32px;
  overflow-y: auto;
}

/* 滚动条样式 */
.content-wrapper::-webkit-scrollbar {
  width: 6px;
}

.content-wrapper::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

.content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}
</style>

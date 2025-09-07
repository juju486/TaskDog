import { createRouter, createWebHistory } from 'vue-router'
import Scripts from '@/views/Scripts.vue'
import Tasks from '@/views/Tasks.vue'
import Config from '@/views/Config.vue'
import Logs from '@/views/Logs.vue'
import Tools from '@/views/Tools.vue'
import Globals from '@/views/globals/Globals.vue'

const routes = [
  {
    path: '/',
    redirect: '/scripts'
  },
  {
    path: '/scripts',
    name: 'Scripts',
    component: Scripts
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: Tasks
  },
  {
    path: '/globals',
    name: 'Globals',
    component: Globals
  },
  {
    path: '/config',
    name: 'Config',
    component: Config
  },
  {
    path: '/tools',
    name: 'Tools',
    component: Tools
  },
  {
    path: '/logs',
    name: 'Logs',
    component: Logs
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
